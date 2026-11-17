#!/usr/bin/env node
// Kino guard. Runs after `astro build`, from the repo root:
//   node scripts/kino-guard.mjs
// Plain Node ESM, no dependencies. Reads src/content/kino.json and scans dist/.
// Any failure prints "Kino guard: <file>: <reason>" lines and exits 1, so the
// Cloudflare build stops and the old version stays live.
//
// What it checks (see docs/KINO.md):
// 1. No film is a public file: dist/ holds no video, playlist or key.
// 2. No public file names where a film plays from: no Kino film's YouTube id
//    in any built page, script or data (the Worker gives it to a ticket holder).
// 3. Crawlers stay out: robots.txt disallows /kino, the sitemap doesn't list
//    it, and every Kino page is noindex.
// 4. wrangler.jsonc sends /kino and /kino/* to the Worker (the door), with its
//    rate limit and the private R2 bucket.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const errors = [];
const fail = (file, reason) => errors.push(`Kino guard: ${file}: ${reason}`);

const MEDIA_EXT = new Set(['.m3u8', '.ts', '.m4s', '.key', '.mp4', '.m4v', '.mov', '.webm', '.mkv', '.ogv', '.avi', '.mpd']);
const TEXT_EXT = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json', '.xml', '.txt', '.svg', '.map', '.webmanifest']);

function walk(dir, base = '') {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${d.name}` : d.name;
    if (d.isDirectory()) out.push(...walk(join(dir, d.name), rel));
    else out.push(rel);
  }
  return out;
}

let films = [];
try {
  films = JSON.parse(readFileSync(join(ROOT, 'src', 'content', 'kino.json'), 'utf8')).films ?? [];
} catch (e) {
  fail('src/content/kino.json', `not readable (${e.message})`);
}
const ids = films.map((f) => f.youtubeId).filter((x) => typeof x === 'string' && x.length === 11);

if (!existsSync(DIST)) fail('dist/', 'missing (run astro build first)');
const files = walk(DIST);

// 1 and 2.
let scanned = 0;
for (const f of files) {
  const ext = extname(f).toLowerCase();
  if (MEDIA_EXT.has(ext)) fail(`dist/${f}`, 'a film, playlist or key is a public file (films live in the private R2 bucket)');
  if (!TEXT_EXT.has(ext)) continue;
  const text = readFileSync(join(DIST, f), 'utf8');
  scanned++;
  for (const id of ids) if (text.includes(id)) fail(`dist/${f}`, `holds the YouTube id of a Kino film (${id}); use a video block's "film" instead`);
}

// 3.
const robots = existsSync(join(DIST, 'robots.txt')) ? readFileSync(join(DIST, 'robots.txt'), 'utf8') : '';
if (!/^Disallow:\s*\/kino\s*$/m.test(robots)) fail('dist/robots.txt', 'lacks "Disallow: /kino"');
for (const f of files.filter((x) => /^sitemap[^/]*\.xml$/i.test(x))) if (readFileSync(join(DIST, f), 'utf8').includes('/kino')) fail(`dist/${f}`, 'lists /kino');
const pages = files.filter((f) => f === 'kino.html' || /^kino\/[^/]+\.html$/.test(f));
if (!pages.includes('kino.html')) fail('dist/kino.html', 'missing');
for (const f of films) if (f.id && !pages.includes(`kino/${f.id}.html`)) fail(`dist/kino/${f.id}.html`, 'missing');
for (const f of pages) {
  const html = readFileSync(join(DIST, f), 'utf8');
  if (!/<meta name="robots" content="noindex/.test(html)) fail(`dist/${f}`, 'is not noindex');
  if (/\.m3u8|youtube(-nocookie)?\.com\/embed/i.test(html)) fail(`dist/${f}`, 'names a film source');
}

// 4.
const wranglerPath = join(ROOT, 'wrangler.jsonc');
if (!existsSync(wranglerPath)) fail('wrangler.jsonc', 'missing');
else {
  const w = readFileSync(wranglerPath, 'utf8');
  if (!w.includes('"/kino"') || !w.includes('"/kino/*"')) fail('wrangler.jsonc', 'run_worker_first lacks "/kino" and "/kino/*" (the Kino would be served without its door)');
  if (!w.includes('KINO_LIMIT')) fail('wrangler.jsonc', 'has no KINO_LIMIT rate limit binding');
  if (!/"binding":\s*"KINO",\s*"bucket_name":\s*"kuschonink-kino"/.test(w)) fail('wrangler.jsonc', 'has no KINO binding to the kuschonink-kino bucket');
}

if (errors.length) {
  console.error([...new Set(errors)].join('\n'));
  console.error(`Kino guard: FAILED with ${new Set(errors).size} problem(s)`);
  process.exit(1);
}
console.log(`Kino guard: ok (${films.length} film(s), ${pages.length} page(s), ${scanned} text files scanned)`);
