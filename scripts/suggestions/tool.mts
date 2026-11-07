#!/usr/bin/env node
// The routine's tool for Field Guide suggestions (see ROUTINE.md next to it).
// Everything the routine does to Notion goes through these commands, so it
// never has to write API calls itself, and it never touches the repository:
// what it prepares goes into Notion, and the Worker's publisher commits it.
//
//   node --experimental-strip-types scripts/suggestions/tool.mts <command> …
//
//   list [--status APPROVED] [--guide slug]   suggestions (no private data: there is none here)
//   show <page>                               one suggestion, every field
//   claim <page> --run <id>                   APPROVED (or PROCESSING for 2 h+) → PROCESSING
//   picture <page> <out.jpg>                  the picture that was sent (EXIF already gone)
//   web-picture <in> <out.jpg>                → the guide's size: 640 px wide, JPEG ≤1 MB, no metadata
//   geocode "<address>"                       [lon, lat] from api-adresse.data.gouv.fr (France) or Nominatim
//   match <page> [--entry entry.json]         what it may duplicate, and the nearest zones
//   check <page> <entry.json> [--picture f]   the publisher's own checks, run here first
//   ready <page> <entry.json> [--picture f] --result "…"   checks, then READY with the entry
//   mark <page> DUPLICATE|"NEEDS CHECK"|ERROR --result "…"
//   log --run <id> --trigger scheduled|approved|manual --outcome OK|Partial|Failed|"Nothing to do" [--pages …] [--session URL] [--details …]
//
// Notion: the data-source ids come from wrangler.jsonc ("vars"), unless
// NOTION_SUGGESTIONS / NOTION_LOG are set. In the
// routine, the environment's network secret adds the routine integration's
// token to every request to api.notion.com; locally, set NOTION_TOKEN (and
// NOTION_API for the stand-in).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { notion, P, R } from '../../worker/notion.ts';
import { guideIs, isStatus, logProps, readSuggestion, S, STATUSES, type SuggestionRow } from '../../worker/suggestions.ts';
import { buildItem, forbiddenWord, nextId } from '../../worker/publish.ts';
import { checkGuide, GUIDE_FILES, type RawGuide } from '../../src/lib/guides/check.ts';
import { distanceM, findMatches, type Known } from '../../src/lib/guides/dedupe.ts';
import type { AccessFile, ItemRecord } from '../../src/lib/guides/types';

// The repository's files (wrangler.jsonc, the guides) are next to this one, in
// a checkout or in the routine's download (download.mjs), whatever the folder.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const cmd = args.shift() ?? '';
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const out = (v: unknown) => console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
function die(msg: string): never {
  console.error(`tool: ${msg}`);
  process.exit(1);
}

const vars = (() => {
  const w = readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  return (JSON.parse(w).vars ?? {}) as Record<string, string>;
})();
// The environment wins (tests, a local stand-in), then wrangler.jsonc.
const DB = { suggestions: process.env.NOTION_SUGGESTIONS || vars.NOTION_SUGGESTIONS, log: process.env.NOTION_LOG || vars.NOTION_LOG };
const access = JSON.parse(readFileSync(join(ROOT, 'src/content/guides/access.json'), 'utf8')) as AccessFile;
const n = notion({ token: process.env.NOTION_TOKEN ?? '', fetch, base: process.env.NOTION_API });
const UA = 'kuschonink.com Field Guide (https://kuschonink.com)';
const CLAIM_STALE_MS = 2 * 3600 * 1000;
const NOW = () => Date.now();

function needDb() {
  if (!DB.suggestions || !DB.log) die('NOTION_SUGGESTIONS and NOTION_LOG are empty in wrangler.jsonc: the databases are not set up yet.');
}
async function row(id: string | undefined): Promise<SuggestionRow> {
  if (!id) die('which page? (its id)');
  needDb();
  return readSuggestion(await n.getPage(id), access);
}

/** The guide's files, from the checkout or download this tool is in. */
function guide(slug: string): RawGuide {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || !(slug in access.guides)) die(`no guide "${slug}"`);
  const raw: RawGuide = {};
  for (const f of GUIDE_FILES) {
    try {
      raw[f] = JSON.parse(readFileSync(join(ROOT, 'src/content/guides', slug, `${f}.json`), 'utf8'));
    } catch { /* optional files */ }
  }
  return raw;
}
const items = (raw: RawGuide) => ((raw.items as { items?: ItemRecord[] })?.items ?? []);

async function download(url: string): Promise<Uint8Array | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
}

function readEntry(path: string | undefined): Record<string, unknown> {
  if (!path) die('which entry.json?');
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    die(`${path} is not JSON: ${(e as Error).message}`);
  }
}

/** The publisher's checks on an entry: its own fields, the words, and the guide's check with it in. */
async function checkEntry(r: SuggestionRow, entry: Record<string, unknown>, picture?: string): Promise<{ problems: string[]; item?: ItemRecord }> {
  const raw = guide(r.guide);
  const g = (raw.guide ?? {}) as { timezone?: string; sensitive?: Record<string, string[]> };
  const local = picture ? new Uint8Array(readFileSync(picture)) : null;
  const rowNow = { ...r, entry: JSON.stringify(entry), webPictures: local ? [{ name: 'web.jpg', url: 'local:' }] : [] };
  const b = await buildItem(rowNow, r.guide, g, { access, download: async () => local, now: NOW });
  if (!b.ok) return { problems: [`${b.status}: ${b.why}`] };
  const list = items(raw);
  b.item.id = list.find((i) => i.suggested?.ref === r.id)?.id ?? nextId(list, b.item.tier);
  if (b.item.image) b.item.image.file = `${b.item.id}.jpg`;
  (raw.items as { items: ItemRecord[] }).items = [...list.filter((i) => i.suggested?.ref !== r.id), b.item];
  const problems = checkGuide(raw, r.guide, access).filter((p) => p.includes(b.item.id));
  const word = forbiddenWord(b.item, access, r.guide, g.sensitive ?? {});
  if (word) problems.push(`NEEDS CHECK: "${word.word}" may only be seen by ${word.only}`);
  if (b.note) problems.push(`note (not a problem): ${b.note}`);
  return { problems, item: b.item };
}

switch (cmd) {
  case 'list': {
    needDb();
    const status = flag('status');
    const slug = flag('guide');
    if (status && !(STATUSES as readonly string[]).includes(status)) die(`status is one of ${STATUSES.join(', ')}`);
    const filter = { and: [...(status ? [isStatus(status as never)] : []), ...(slug ? [guideIs(access, slug)] : [])] };
    const rows = (await n.queryAll(DB.suggestions, { ...(filter.and.length ? { filter } : {}), sorts: [{ timestamp: 'created_time', direction: 'ascending' }] }, 500)).map((p) => readSuggestion(p, access));
    out(rows.map(({ pictures, webPictures, ...x }) => ({ ...x, pictures: pictures.length, webPictures: webPictures.length })));
    break;
  }
  case 'show':
    out(await row(args[0]));
    break;
  case 'claim': {
    const r = await row(args[0]);
    const run = flag('run') ?? die('--run <id> is needed');
    const stale = r.status === 'PROCESSING' && NOW() - Date.parse(r.processed || '1970-01-01') > CLAIM_STALE_MS;
    if (r.status !== 'APPROVED' && !stale) {
      out({ claimed: false, why: `it is ${r.status || 'without a status'}${r.status === 'PROCESSING' ? ` (run ${r.run}, since ${r.processed})` : ''}` });
      break;
    }
    await n.updatePage(r.id, { [S.status]: P.select('PROCESSING'), [S.run]: P.text(run), [S.processed]: P.date(new Date(NOW()).toISOString()) });
    const again = await row(r.id);
    out(again.run === run ? { claimed: true } : { claimed: false, why: `another run (${again.run}) took it` });
    break;
  }
  case 'picture': {
    const r = await row(args[0]);
    const to = args[1] ?? die('where to save it?');
    const f = r.pictures[0];
    if (!f) die('this suggestion has no picture');
    if (!r.rights) die('the sender did not confirm they may share this picture: leave it out');
    const b = await download(f.url);
    if (!b) die('the picture could not be downloaded (Notion links expire: run show again)');
    writeFileSync(to, b);
    out({ saved: to, bytes: b.length, credit: r.pictureCredit });
    break;
  }
  case 'web-picture': {
    const [from, to] = args;
    if (!from || !to) die('web-picture <in> <out.jpg>');
    const sharp = (await import('sharp')).default;
    let q = 80;
    let buf: Buffer;
    for (;;) {
      buf = await sharp(from).rotate().resize({ width: 640, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
      if (buf.length <= 1024 * 1024 || q <= 50) break;
      q -= 10;
    }
    if (buf.length > 1024 * 1024) die('still over 1 MB: leave the picture out');
    writeFileSync(to, buf);
    const m = await sharp(buf).metadata();
    out({ saved: to, width: m.width, height: m.height, bytes: buf.length });
    break;
  }
  case 'geocode': {
    const q = args.join(' ').trim() || die('geocode "<address>"');
    const french = /\b(75|77|78|91|92|93|94|95)\d{3}\b|\bparis\b|\bfrance\b/i.test(q);
    if (french) {
      const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=3`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
      const j = (await res.json()) as { features?: { geometry: { coordinates: [number, number] }; properties: { label: string; score: number; type: string } }[] };
      out((j.features ?? []).map((f) => ({ lonlat: f.geometry.coordinates.map((x) => Math.round(x * 1e6) / 1e6), label: f.properties.label, score: Math.round(f.properties.score * 100) / 100, type: f.properties.type, source: 'api-adresse.data.gouv.fr' })));
    } else {
      // Nominatim's policy: at most one request a second, a real User-Agent.
      await new Promise((r) => setTimeout(r, 1100));
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&q=${encodeURIComponent(q)}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
      const j = (await res.json()) as { lon: string; lat: string; display_name: string; importance: number; type: string }[];
      out(j.map((f) => ({ lonlat: [Math.round(Number(f.lon) * 1e6) / 1e6, Math.round(Number(f.lat) * 1e6) / 1e6], label: f.display_name, score: f.importance, type: f.type, source: 'OpenStreetMap Nominatim' })));
    }
    break;
  }
  case 'match': {
    const r = await row(args[0]);
    const entryPath = flag('entry');
    const entry = entryPath ? readEntry(entryPath) : {};
    const raw = guide(r.guide);
    const known: Known[] = [
      ...items(raw).filter((i) => i.suggested?.ref !== r.id).map((i) => ({ id: i.id, kind: 'item' as const, name: i.name, show: i.subtitle, artists: i.by, address: i.address, website: i.sourceUrl, links: i.links, coordinates: i.coordinates, start: i.start, end: i.end })),
      ...(((raw.listings as { records?: { id: string; name: string; url?: string; coordinates: [number, number]; start?: string; end?: string }[] })?.records) ?? []).map((x) => ({ id: x.id, kind: 'listing' as const, name: x.name, website: x.url, coordinates: x.coordinates, start: x.start, end: x.end })),
      ...(((raw.places as { places?: { id: string; name: string; address: string; coordinates: [number, number] }[] })?.places) ?? []).map((x) => ({ id: x.id, kind: 'place' as const, name: x.name, address: x.address, coordinates: x.coordinates })),
    ];
    needDb();
    const others = (await n.queryAll(DB.suggestions, { filter: guideIs(access, r.guide) }, 1000)).map((p) => readSuggestion(p, access)).filter((o) => o.id !== r.id && o.status !== 'SPAM');
    for (const o of others) known.push({ id: `${o.reference || o.id} (${o.status}${o.itemId ? ` ${o.itemId}` : ''})`, kind: 'submission', name: o.name, show: o.show, artists: o.artists, address: o.address, website: o.website, links: o.links, start: o.start, end: o.end });
    const coords = Array.isArray(entry.coordinates) ? (entry.coordinates as [number, number]) : undefined;
    const matches = findMatches({ name: String(entry.name ?? r.name), show: String(entry.subtitle ?? r.show), artists: String(entry.by ?? r.artists), address: String(entry.address ?? r.address), website: r.website, links: r.links, coordinates: coords, start: String(entry.start ?? r.start), end: String(entry.end ?? r.end) }, known);
    // The zones of the nearest items, nearest first (the entry's zone is usually the first).
    const zones = coords
      ? items(raw).map((i) => ({ id: i.id, zone: i.zone, m: Math.round(distanceM(coords, i.coordinates)) })).sort((a, b) => a.m - b.m).slice(0, 5)
      : [];
    out({ matches, nearestZones: zones });
    break;
  }
  case 'check': {
    const r = await row(args[0]);
    const { problems, item } = await checkEntry(r, readEntry(args[1]), flag('picture'));
    out({ ok: problems.every((p) => p.startsWith('note')), problems, item });
    break;
  }
  case 'ready': {
    const r = await row(args[0]);
    if (r.status !== 'PROCESSING') die(`it is ${r.status}, not PROCESSING: claim it first`);
    const picture = flag('picture');
    const result = flag('result') ?? die('--result "what you checked and found" is needed');
    const entry = readEntry(args[1]);
    const { problems } = await checkEntry(r, entry, picture);
    const blocking = problems.filter((p) => !p.startsWith('note'));
    if (blocking.length) {
      out({ ready: false, problems: blocking });
      process.exit(2);
    }
    const props: Record<string, Record<string, unknown>> = { [S.entry]: P.text(JSON.stringify(entry)), [S.result]: P.text(result), [S.status]: P.select('READY'), [S.processed]: P.date(new Date(NOW()).toISOString()) };
    if (picture) props[S.webPicture] = P.files([{ id: await n.uploadFile('web.jpg', 'image/jpeg', new Uint8Array(readFileSync(picture))), name: 'web.jpg' }]);
    else props[S.webPicture] = P.noFiles();
    await n.updatePage(r.id, props);
    out({ ready: true, notes: problems });
    break;
  }
  case 'mark': {
    const r = await row(args[0]);
    const status = args[1];
    if (!['DUPLICATE', 'NEEDS CHECK', 'ERROR'].includes(status)) die('mark … DUPLICATE | "NEEDS CHECK" | ERROR');
    const result = flag('result') ?? die('--result "why" is needed');
    await n.updatePage(r.id, { [S.status]: P.select(status), [S.result]: P.text(result), [S.processed]: P.date(new Date(NOW()).toISOString()) });
    out({ marked: status });
    break;
  }
  case 'log': {
    needDb();
    const run = flag('run') ?? die('--run is needed');
    const trigger = (flag('trigger') ?? 'scheduled') as 'scheduled' | 'approved' | 'manual';
    const outcome = (flag('outcome') ?? 'OK') as 'OK' | 'Partial' | 'Failed' | 'Nothing to do';
    await n.createPage(DB.log, logProps({ run, trigger, actor: 'routine', outcome, pages: flag('pages'), session: flag('session'), details: flag('details') }, new Date(NOW())));
    out({ logged: run });
    break;
  }
  default:
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(0, 24).map((l) => l.slice(3)).join('\n'));
    if (cmd) process.exit(1);
}
void R;
