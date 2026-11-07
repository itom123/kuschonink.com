#!/usr/bin/env node
// Field Guide (导览) leak guard. Runs after `astro build`, from the repo root:
//   node scripts/guides-guard.mjs
// Plain Node ESM, no dependencies. Reads src/content/guides/** and scans dist/.
// Any failure prints "Field Guide guard: <file>: <reason>" lines and exits 1,
// so a leak stops the Cloudflare build and the old version stays live.
//
// What it checks (see docs/GUIDES.md):
// 1. Public files (all of dist/ except dist/guides/<slug>/{views,img,map}/**)
//    contain no sentinel (long runs of each guide's own authored text); the
//    guide's pages, scripts, styles and shell pages (BRAND_SCOPE) also contain
//    none of its sensitive.public words.
// 2. Each view dist/guides/<slug>/views/<aud>.html contains nothing written
//    for audiences it doesn't include, and does contain the guide's data.
// 3. Images: exist with exact case, ≤1 MB, real JPEG/PNG/WebP; never copied
//    or re-encoded into a public path.
// 4. Structure: log-on pages, the sitemap, wrangler.jsonc, guide folders.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const CONTENT = join(ROOT, 'src', 'content', 'guides');
const PUBLIC = join(ROOT, 'public', 'guides');

const TEXT_EXT = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json', '.xml', '.txt', '.svg', '.map', '.webmanifest']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
const MAX_IMAGE = 1024 * 1024;
const MIN_RUN = 24;
/** Sentinels per guide. More would slow the scan; reaching it fails the build rather than checking less. */
const CAP = 5000;

const errors = [];
const fail = (file, reason) => errors.push(`Field Guide guard: ${file}: ${reason}`);
const short = (s) => (s.length > 48 ? `${s.slice(0, 45)}...` : s);

// ---------------------------------------------------------------------------
// Helpers

function readJson(path, rel, required) {
  if (!existsSync(path)) {
    if (required) fail(rel, 'missing');
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(rel, `not valid JSON (${e.message})`);
    return null;
  }
}

/** Every file under dir, as posix paths relative to dir. */
function walk(dir, base = '') {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${d.name}` : d.name;
    if (d.isDirectory()) out.push(...walk(join(dir, d.name), rel));
    else if (d.isFile()) out.push(rel);
  }
  return out;
}

const ext = (p) => posix.extname(p).toLowerCase();
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/**
 * Text as a reader would see it: HTML entities and JS/JSON string escapes
 * decoded, whitespace collapsed, lower case. Applied to both the files and
 * the sentinels, so `'` → `&#39;` or `<` → `<` can't hide a leak.
 */
function norm(s) {
  return s
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[nrtvf]/g, ' ')
    .replace(/\\(['"\/\\`])/g, '$1')
    .replace(/&#x([0-9a-fA-F]+);?/g, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&(amp|quot|apos|lt|gt|nbsp);/gi, (_, n) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[n.toLowerCase()])
    .replace(/[\s  ]+/g, ' ')
    .toLowerCase();
}
function safeChar(cp) {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return '';
  }
}

/** The longest run of 24+ plain ASCII characters in s, URLs removed; or null. */
function sentinelOf(s) {
  if (typeof s !== 'string' || !s) return null;
  const text = s.replace(/(?:https?:\/\/|www\.)\S+/gi, '\u0000');
  let best = '';
  for (const m of text.matchAll(/[A-Za-z0-9 ,.;:()'-]+/g)) {
    const run = m[0].replace(/ +/g, ' ').trim();
    if (run.length > best.length) best = run;
  }
  if (best.length < MIN_RUN) return null;
  if (/https?:|www\./i.test(best)) return null;
  return norm(best);
}

/**
 * A sensitive word as a whole word (a plural "s"/"es" allowed), case-insensitive,
 * so "workshops" counts but an image file stem such as "fotofilmicgallery-05" doesn't.
 */
function wordRe(w) {
  const esc = norm(w.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${esc}(?:e?s)?(?![a-z0-9])`);
}

/**
 * Where sensitive.public words are looked for (review issue 3): the Field
 * Guide's own public pages, every script and style, and pages that carry the
 * shell chrome every page shares. The owner's other pages (About, the House,
 * projects) may name the same people and places in their own right.
 */
const BRAND_SCOPE = (f) =>
  f === 'guides.html' || f.startsWith('guides/') || f.startsWith('_astro/') ||
  ['index.html', 'help.html', '404.html', 'desktop.json'].includes(f) || /^sitemap[^/]*\.xml$/i.test(f);

const tagIds = (t) => (t == null ? null : Array.isArray(t) ? t : [t]);

// ---------------------------------------------------------------------------
// Access and audiences

if (!existsSync(DIST)) {
  console.error(`Field Guide guard: dist/: missing (run after astro build, from the repo root)`);
  process.exit(1);
}

const access = readJson(join(CONTENT, 'access.json'), 'src/content/guides/access.json', true);
if (!access) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const audiences = new Map((access.audiences ?? []).map((a) => [a.id, a]));
const guides = access.guides ?? {};

function closure(id, seen = new Set()) {
  if (seen.has(id)) return seen;
  seen.add(id);
  for (const inc of audiences.get(id)?.includes ?? []) closure(inc, seen);
  return seen;
}
/** A chain of audience tags is visible to aud when every tag names an audience aud includes. */
const visibleTo = (chain, aud) => {
  const c = closure(aud);
  return chain.every((ids) => ids.some((x) => c.has(x)));
};

// Guide folders ↔ access.json.
const folders = existsSync(CONTENT)
  ? readdirSync(CONTENT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
for (const slug of Object.keys(guides)) {
  if (!folders.includes(slug)) fail(`src/content/guides/${slug}/`, 'listed in access.json but has no folder');
  for (const a of guides[slug] ?? []) if (!audiences.has(a)) fail('src/content/guides/access.json', `guide ${slug} names unknown audience "${a}"`);
}
for (const f of folders) if (!(f in guides)) fail(`src/content/guides/${f}/`, 'folder is not in access.json');

// ---------------------------------------------------------------------------
// Read each guide: sentinels with their audience chains, sensitive words, images.

/** @type {Map<string, {texts:{s:string,chain:string[][]}[], sensitive:Record<string,string[]>, images:{rel:string,abs:string}[]}>} */
const data = new Map();

for (const slug of Object.keys(guides)) {
  if (!folders.includes(slug)) continue;
  const dir = join(CONTENT, slug);
  const rel = (f) => `src/content/guides/${slug}/${f}`;
  const guide = readJson(join(dir, 'guide.json'), rel('guide.json'), true);
  if (!guide) continue;
  const items = readJson(join(dir, 'items.json'), rel('items.json'), false)?.items ?? [];
  const places = readJson(join(dir, 'places.json'), rel('places.json'), false)?.places ?? [];
  const eventsFile = readJson(join(dir, 'events.json'), rel('events.json'), false) ?? {};
  const routes = readJson(join(dir, 'routes.json'), rel('routes.json'), false)?.routes ?? [];
  const mapFile = readJson(join(dir, 'map.json'), rel('map.json'), false) ?? {};

  const texts = [];
  const add = (chain, ...values) => {
    for (const v of values) {
      const s = sentinelOf(v);
      if (s) texts.push({ s, chain });
    }
  };
  const chainOf = (parent, obj) => {
    const ids = tagIds(obj?.audience);
    return ids ? [...parent, ids] : parent;
  };
  const tw = (o, k) => [o?.[k], o?.[`${k}Zh`]];

  // guide.json: titles, holiday notices, page texts.
  add([], ...tw(guide, 'title'), ...tw(guide, 'subtitle'));
  for (const h of guide.holidays ?? []) add([], ...tw(h, 'notice'));
  for (const sec of Object.values(guide.texts ?? {})) {
    const c = chainOf([], sec);
    add(c, ...tw(sec, 'heading'));
    for (const p of sec.paras ?? []) add(chainOf(c, p), ...tw(p, 'text'));
    for (const it of sec.items ?? []) add(chainOf(c, it), ...tw(it, 'lead'), ...tw(it, 'text'));
  }
  for (const it of items) {
    const c = chainOf([], it);
    add(c, ...tw(it, 'why'), ...tw(it, 'note'), ...tw(it, 'hours'), ...tw(it, 'price'));
    for (const ex of it.exceptions ?? []) add(c, ...tw(ex, 'note'));
  }
  for (const p of places) {
    const c = chainOf([], p);
    add(c, p.name, p.address, ...tw(p, 'hours'), ...tw(p, 'note'));
  }
  for (const e of eventsFile.events ?? []) add(chainOf([], e), ...tw(e, 'title'), ...tw(e, 'note'));
  for (const d of eventsFile.days ?? []) add(chainOf([], d), ...tw(d, 'plan'));
  for (const r of routes) add(chainOf([], r), ...tw(r, 'note'), ...tw(r, 'when'), ...tw(r, 'duration'));

  // The neutral public title and subtitle are meant to be public.
  const pub = [guide.public?.title, guide.public?.titleZh, guide.public?.subtitle, guide.public?.subtitleZh]
    .filter((x) => typeof x === 'string')
    .map(norm);
  const kept = texts.filter((t) => !pub.some((p) => p.includes(t.s)));

  // Sensitive words.
  const sensitive = guide.sensitive ?? {};
  if (!Array.isArray(sensitive.public)) fail(rel('guide.json'), 'sensitive.public must be a list');
  for (const [k, words] of Object.entries(sensitive)) {
    if (k !== 'public' && !audiences.has(k)) fail(rel('guide.json'), `sensitive.${k} is not an audience in access.json`);
    if (!Array.isArray(words)) continue;
    for (const w of words) {
      if (typeof w !== 'string' || w.trim().length < 3) fail(rel('guide.json'), `sensitive.${k} has a word shorter than 3 characters`);
    }
  }

  // Referenced images and base maps.
  const images = [];
  for (const it of items) if (it.image?.file) images.push({ folder: 'img', file: it.image.file, from: `${rel('items.json')} > ${it.id}` });
  for (const v of mapFile.views ?? []) if (v.file) images.push({ folder: 'map', file: v.file, from: `${rel('map.json')} > ${v.id}`, width: v.width, height: v.height });

  data.set(slug, { texts: kept, sensitive, images });
  if (process.env.GUIDES_GUARD_VERBOSE) {
    const r = new Set(kept.filter((t) => t.chain.length).map((t) => t.s)).size;
    const o = new Set(kept.filter((t) => !t.chain.length).map((t) => t.s)).size;
    console.log(`Field Guide guard: ${slug}: ${o} open + ${r} restricted sentinels, ${images.length} images`);
    for (const t of kept) console.log(`  [${t.chain.map((c) => c.join('|')).join(' > ') || '-'}] ${t.s}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Images in public/guides/<slug>/…

function signatureOk(buf, e) {
  const jpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
  if (e === '.jpg' || e === '.jpeg') return jpeg ? true : 'is not a JPEG (wrong signature)';
  if (e === '.png') return png ? true : 'is not a PNG (wrong signature)';
  if (e === '.webp') return webp ? true : 'is not a WebP (wrong signature)';
  return 'must be .jpg, .jpeg, .png or .webp';
}

/** A JPEG, PNG or WebP picture's size in pixels, read from its header, or null. */
function pixelSize(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    // JPEG: walk the markers to the first SOFn (not DHT C4, JPG C8 or DAC CC).
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const m = buf[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }
  if (buf.length >= 24 && buf[0] === 0x89 && buf.toString('latin1', 12, 16) === 'IHDR') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length >= 30 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const kind = buf.toString('latin1', 12, 16);
    if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) };
    }
    if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

/** Does rel exist under base with exactly this case? (Windows and macOS ignore case; Cloudflare doesn't.) */
function existsExact(base, rel) {
  let dir = base;
  for (const seg of rel.split('/')) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
    if (!readdirSync(dir).includes(seg)) return false;
    dir = join(dir, seg);
  }
  return true;
}

/** size → [{ rel, abs, hash? }] for every guide image, referenced or not. */
const bySize = new Map();
const stems = new Map(); // lower-case stem → image path
let imageCount = 0;

for (const [slug, g] of data) {
  for (const im of g.images) {
    const rel = `public/guides/${slug}/${im.folder}/${im.file}`;
    if (im.file.includes('\\') || im.file.split('/').some((s) => s === '..' || s === '' || s === '.')) {
      fail(im.from, `image path "${im.file}" must be a plain file name inside ${im.folder}/`);
      continue;
    }
    if (!existsExact(join(PUBLIC, slug, im.folder), im.file)) {
      fail(rel, `missing, or its case differs from ${im.from}`);
      continue;
    }
    const abs = join(PUBLIC, slug, im.folder, ...im.file.split('/'));
    const size = statSync(abs).size;
    if (size > MAX_IMAGE) fail(rel, `${size} bytes is over 1 MB (${MAX_IMAGE} bytes)`);
    const whole = readFileSync(abs);
    const fd = whole.subarray(0, 16);
    const sig = signatureOk(fd, ext(im.file));
    if (sig !== true) fail(rel, sig);
    // A base map is drawn at map.json's width and height: a hand crop that doesn't match them moves every pin.
    else if (im.folder === 'map' && typeof im.width === 'number' && typeof im.height === 'number') {
      const px = pixelSize(whole);
      if (!px) fail(rel, `its size in pixels can't be read; ${im.from} says ${im.width}x${im.height}`);
      else if (px.w !== im.width || px.h !== im.height) fail(rel, `is ${px.w}x${px.h} px but ${im.from} says ${im.width}x${im.height}: fix width/height (and originX/originY) in map.json`);
    }
  }
  for (const folder of ['img', 'map']) {
    for (const f of walk(join(PUBLIC, slug, folder))) {
      const abs = join(PUBLIC, slug, folder, ...f.split('/'));
      const size = statSync(abs).size;
      if (!size) continue;
      imageCount++;
      const rel = `public/guides/${slug}/${folder}/${f}`;
      if (!bySize.has(size)) bySize.set(size, []);
      bySize.get(size).push({ rel, abs });
      const base = posix.basename(f);
      const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
      if (stem) stems.set(stem.toLowerCase(), rel);
    }
  }
}

// ---------------------------------------------------------------------------
// Scan dist/

const distFiles = walk(DIST);
const PRIVATE = /^guides\/[^/]+\/(views|img|map)(\/|$)/;
const publicFiles = distFiles.filter((f) => !PRIVATE.test(f));

// Public sentinels: everything a guide wrote, restricted first. A guide with
// more than CAP fails the build: checking only some of them would let a leak
// through unseen as the guide grows (approved suggestions add text).
const publicSentinels = [];
const publicWords = [];
for (const [slug, g] of data) {
  const restricted = [...new Set(g.texts.filter((t) => t.chain.length).map((t) => t.s))];
  const open = [...new Set(g.texts.filter((t) => !t.chain.length).map((t) => t.s))].filter((s) => !restricted.includes(s));
  const all = [...restricted, ...open];
  if (all.length > CAP) fail(`src/content/guides/${slug}/`, `has ${all.length} texts to check, more than the guard's ${CAP}: raise CAP in scripts/guides-guard.mjs`);
  for (const s of all.slice(0, CAP)) publicSentinels.push({ slug, s });
  for (const w of g.sensitive.public ?? []) if (typeof w === 'string' && w.trim().length >= 3) publicWords.push({ slug, w: w.trim(), re: wordRe(w) });
}

function report(file, hits, what) {
  if (!hits.length) return;
  const shown = hits.slice(0, 5).map((h) => `"${short(h)}"`).join(', ');
  fail(file, `contains ${what}: ${shown}${hits.length > 5 ? ` and ${hits.length - 5} more` : ''}`);
}

// 1. Public files.
let scanned = 0;
for (const f of publicFiles) {
  const abs = join(DIST, ...f.split('/'));
  const size = statSync(abs).size;

  // 3. No public file is a copy of a guide image.
  const same = bySize.get(size);
  if (same) {
    const h = sha256(abs);
    for (const im of same) {
      im.hash ??= sha256(im.abs);
      if (im.hash === h) fail(`dist/${f}`, `is a copy of ${im.rel}`);
    }
  }
  // 3. No re-encoded guide image in _astro (Astro names them <stem>.<hash>.<ext>).
  if (f.startsWith('_astro/') && IMAGE_EXT.has(ext(f))) {
    const name = posix.basename(f).toLowerCase();
    for (const [stem, rel] of stems) if (name.startsWith(`${stem}.`)) fail(`dist/${f}`, `looks like a processed copy of ${rel}`);
  }

  if (!TEXT_EXT.has(ext(f))) continue;
  scanned++;
  const text = norm(readFileSync(abs, 'utf8'));
  report(`dist/${f}`, publicSentinels.filter((x) => text.includes(x.s)).map((x) => x.s), 'guide text');
  if (BRAND_SCOPE(f)) report(`dist/${f}`, [...new Set(publicWords.filter((x) => x.re.test(text)).map((x) => x.w))], 'sensitive.public words');
}

// 2. Views, and 4. log-on pages.
let viewCount = 0;
for (const slug of Object.keys(guides)) {
  const g = data.get(slug);
  const allowed = guides[slug] ?? [];
  const viewDir = `guides/${slug}/views/`;
  const built = distFiles.filter((f) => f.startsWith(viewDir));
  for (const f of built) {
    const aud = f.slice(viewDir.length).replace(/\.html$/, '');
    if (!f.endsWith('.html') || !allowed.includes(aud)) fail(`dist/${f}`, `not a view of an audience allowed for ${slug}`);
  }

  for (const aud of allowed) {
    const f = `${viewDir}${aud}.html`;
    if (!distFiles.includes(f)) {
      fail(`dist/${f}`, 'missing (every allowed audience needs a view)');
      continue;
    }
    if (!g) continue;
    viewCount++;
    const raw = readFileSync(join(DIST, ...f.split('/')), 'utf8');
    const text = norm(raw);
    const seen = new Set(g.texts.filter((t) => visibleTo(t.chain, aud)).map((t) => t.s));
    const hidden = [...new Set(g.texts.filter((t) => !visibleTo(t.chain, aud)).map((t) => t.s))].filter((s) => !seen.has(s));
    report(`dist/${f}`, hidden.filter((s) => text.includes(s)), `text for audiences ${aud} doesn't include`);
    const c = closure(aud);
    const words = [];
    for (const [k, list] of Object.entries(g.sensitive)) {
      if (k === 'public' || c.has(k) || !Array.isArray(list)) continue;
      for (const w of list) if (typeof w === 'string' && w.trim().length >= 3 && wordRe(w).test(text)) words.push(w.trim());
    }
    report(`dist/${f}`, [...new Set(words)], `sensitive words of audiences ${aud} doesn't include`);
    const open = [...new Set(g.texts.filter((t) => !t.chain.length).map((t) => t.s))];
    if (open.length && !open.some((s) => text.includes(s))) fail(`dist/${f}`, "contains none of the guide's text (is the data embedded?)");
    if (!raw.includes('data-gd-data')) fail(`dist/${f}`, 'has no data-gd-data block');
  }

  // 4. The log-on page.
  const locked = `guides/${slug}/locked.html`;
  if (!distFiles.includes(locked)) {
    fail(`dist/${locked}`, 'missing');
    continue;
  }
  const html = readFileSync(join(DIST, 'guides', slug, 'locked.html'), 'utf8');
  const states = html.split('data-gd-state="none"').length - 1;
  if (states !== 1) fail(`dist/${locked}`, `has data-gd-state="none" ${states} times (needs exactly 1)`);
  if (!/noindex/i.test(html)) fail(`dist/${locked}`, 'has no noindex');
  if (/type\s*=\s*["']?application\/json/i.test(html)) fail(`dist/${locked}`, 'has a JSON block');
  const prefix = `/guides/${slug}/`;
  const others = [];
  for (let i = html.indexOf(prefix); i !== -1; i = html.indexOf(prefix, i + 1)) {
    const rest = html.slice(i + prefix.length, i + prefix.length + 64);
    if (!/^login(?![\w/.-])/.test(rest)) others.push(prefix + rest.split(/["'\s<>?#)]/)[0]);
  }
  report(`dist/${locked}`, [...new Set(others)], 'guide URLs other than the login form action');
}

// 4. Sitemap and wrangler.jsonc.
const sitemaps = distFiles.filter((f) => /^sitemap[^/]*\.xml$/i.test(f));
if (!sitemaps.length) fail('dist/sitemap.xml', 'missing');
for (const f of sitemaps) if (readFileSync(join(DIST, f), 'utf8').includes('/guides')) fail(`dist/${f}`, 'lists /guides');

const wranglerPath = join(ROOT, 'wrangler.jsonc');
if (!existsSync(wranglerPath)) fail('wrangler.jsonc', 'missing');
else {
  const w = readFileSync(wranglerPath, 'utf8');
  if (!w.includes('"/guides/*"')) fail('wrangler.jsonc', 'run_worker_first lacks "/guides/*" (the guide would be served without the gate)');
  if (!w.includes('GUIDES_LIMIT')) fail('wrangler.jsonc', 'has no GUIDES_LIMIT rate limit binding');
}

// ---------------------------------------------------------------------------

if (errors.length) {
  console.error([...new Set(errors)].join('\n'));
  console.error(`Field Guide guard: FAILED with ${new Set(errors).size} problem(s)`);
  process.exit(1);
}
const nS = publicSentinels.length;
console.log(`Field Guide guard: ok (${data.size} guide(s), ${viewCount} view(s), ${scanned} public text files, ${nS} sentinels, ${imageCount} images)`);
