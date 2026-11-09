#!/usr/bin/env node
// Field Guide (导览): read a shared Google Maps list into a draft, gently.
//
//   node scripts/google-list.mjs <list link> [--guide <slug>] [--refresh]
//
// <list link> is a list's share link: https://www.google.com/maps/placelists/list/<id>
// (the part before "?" is enough) or a https://maps.app.goo.gl/… short link.
//
// Google watches for robots, so this asks as little as it can:
// - one request for the whole list (the same one the Maps page makes; up to
//   500 places), plus one to unfold a short link;
// - never a request per place: prices, stars and hours come from the
//   restaurants' own pages and the MICHELIN Guide, not from Google;
// - the places it read are kept in .google-lists/ (gitignored) for an hour, so
//   running it again reads the file, not Google (--refresh asks Google again);
// - if Google answers with anything but the list (a "sorry" or consent page,
//   429, 403…), it stops at once and says what to do. It never retries.
//
// It keeps the places only (name, address, point, note, Google's place
// number), never the list owner's name or picture, and writes a draft beside
// them: the places new to the guide, those it already has (matched by Google's
// place number in an item's links, or by name and distance), and those the
// guide has that the list no longer does. Nothing in src/ changes: an entry
// still needs its category, price and words (docs/GUIDES.md, section 13).
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE = join(ROOT, '.google-lists');
const FRESH_MS = 60 * 60 * 1000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const HEADERS = { 'user-agent': UA, 'accept-language': 'en-GB,en;q=0.9,fr;q=0.8', accept: '*/*' };
const ID = /^[A-Za-z0-9_-]{10,100}$/;

const say = (...a) => console.log(...a);
const stop = (msg) => {
  console.error(`google-list: ${msg}`);
  process.exit(1);
};

/** What to do when Google says no: never try again straight away. */
const BLOCKED = `Google did not hand over the list (it may think this is a robot). Do not run this again straight away.
  - Wait an hour or more, then try once with --refresh; or
  - open the list in a browser and check that it is shared ("Anyone with the link"); or
  - export it instead: takeout.google.com > Saved > the list's CSV, and send that file along.`;

/** The list id from a share link, or null. */
export function listId(link) {
  try {
    const u = new URL(link);
    if (!/(^|\.)google\.[a-z.]+$/.test(u.hostname)) return null;
    const m = u.pathname.match(/\/maps\/placelists\/list\/([^/?#]+)/);
    return m && ID.test(m[1]) ? m[1] : null;
  } catch {
    return null;
  }
}

/** A short link (maps.app.goo.gl) unfolded with one request, without following it further. */
async function unfold(link) {
  const res = await fetch(link, { method: 'GET', redirect: 'manual', headers: HEADERS });
  const to = res.headers.get('location');
  if (!to) stop(`the short link did not lead anywhere (HTTP ${res.status}).`);
  return to;
}

/** Google's place number for a "Open in Google Maps" link: the second half of its feature id, unsigned. */
export function placeNumber(signed) {
  try {
    const n = BigInt(signed);
    return (n < 0n ? n + (1n << 64n) : n).toString();
  } catch {
    return '';
  }
}

/** The places in Google's answer (")]}'" then JSON). Throws when it isn't one. */
export function parseList(text) {
  const body = text.startsWith(")]}'") ? text.slice(text.indexOf('\n') + 1) : null;
  if (body === null) throw new Error('not a list');
  const data = JSON.parse(body);
  const meta = data?.[0];
  if (!Array.isArray(meta) || !Array.isArray(meta[8])) throw new Error('no places');
  const places = [];
  for (const it of meta[8]) {
    const p = it?.[1];
    const ll = p?.[5];
    if (!Array.isArray(p) || !Array.isArray(ll) || typeof ll[2] !== 'number' || typeof ll[3] !== 'number') continue;
    const cid = placeNumber(p?.[6]?.[1]);
    places.push({
      name: String(it[2] ?? '').trim(),
      address: String(p[4] ?? '').trim(),
      coordinates: [Number(ll[3].toFixed(6)), Number(ll[2].toFixed(6))],
      note: String(it[3] ?? '').trim(),
      ...(cid ? { cid, maps: `https://maps.google.com/?cid=${cid}` } : {}),
    });
  }
  // The list's own name only: never its owner (meta[3]).
  return { name: typeof meta[4] === 'string' ? meta[4] : '', places };
}

async function fetchList(id) {
  const pb = `!1m4!1s${id}!2e1!3m1!1e1!2e2!3e2!4i500!16b1`;
  const url = `https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=fr&pb=${encodeURIComponent(pb)}`;
  let res;
  try {
    res = await fetch(url, { headers: HEADERS, redirect: 'manual' });
  } catch (e) {
    stop(`could not reach Google (${e.message}).`);
  }
  const text = res.status === 200 ? await res.text() : '';
  if (res.status !== 200 || !text.startsWith(")]}'")) stop(`HTTP ${res.status}${res.headers.get('location') ? ` to ${new URL(res.headers.get('location')).hostname}` : ''}.\n${BLOCKED}`);
  try {
    return parseList(text);
  } catch {
    stop(`Google's answer was not a list this script can read.\n${BLOCKED}`);
  }
}

/** Metres between two [lon, lat] points. */
function metres(a, b) {
  const r = Math.PI / 180;
  const x = (b[0] - a[0]) * r * Math.cos(((a[1] + b[1]) / 2) * r);
  const y = (b[1] - a[1]) * r;
  return Math.hypot(x, y) * 6371000;
}
const norm = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ' ').trim();
const sameName = (a, b) => {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

/** Each place against the guide's items: by Google place number, else a similar name within 60 m. */
export function compare(places, items) {
  const known = [], fresh = [];
  const used = new Set();
  for (const p of places) {
    const hit = items.find((i) => (p.maps && (i.links || []).includes(p.maps)) || (sameName(p.name, i.name) && Array.isArray(i.coordinates) && metres(p.coordinates, i.coordinates) < 60));
    if (hit) {
      known.push({ ...p, id: hit.id });
      used.add(hit.id);
    } else fresh.push(p);
  }
  const gone = items.filter((i) => !used.has(i.id)).map((i) => ({ id: i.id, name: i.name }));
  return { fresh, known, gone };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (k) => args.includes(k);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  let link = args.find((a) => /^https:\/\//.test(a));
  if (!link) stop('give a list link: node scripts/google-list.mjs https://www.google.com/maps/placelists/list/<id> [--guide <slug>]');
  const guide = opt('--guide');
  if (guide && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(guide)) stop(`"${guide}" is not a guide name.`);

  let id = listId(link);
  if (!id && /^https:\/\/maps\.app\.goo\.gl\//.test(link)) {
    link = await unfold(link);
    id = listId(link);
  }
  if (!id) stop('that is not a Google Maps list link (…/maps/placelists/list/<id>).');

  mkdirSync(CACHE, { recursive: true });
  const kept = join(CACHE, `${id}.json`);
  let list;
  if (existsSync(kept) && !flag('--refresh') && Date.now() - statSync(kept).mtimeMs < FRESH_MS) {
    list = JSON.parse(readFileSync(kept, 'utf8'));
    say(`Read ${kept} (fetched less than an hour ago; --refresh asks Google again).`);
  } else {
    list = { id, ...(await fetchList(id)), fetched: new Date().toISOString() };
    writeFileSync(kept, JSON.stringify(list, null, 1) + '\n');
    say(`Read the list from Google once: ${list.places.length} places in "${list.name}".`);
  }

  let items = [];
  if (guide) {
    const file = join(ROOT, 'src/content/guides', guide, 'items.json');
    if (!existsSync(file)) stop(`there is no guide "${guide}" (no ${file}).`);
    items = JSON.parse(readFileSync(file, 'utf8')).items ?? [];
  }
  const { fresh, known, gone } = compare(list.places, items);
  const out = join(CACHE, `${id}.draft${guide ? `.${guide}` : ''}.json`);
  writeFileSync(out, JSON.stringify({ list: { id, name: list.name, fetched: list.fetched }, guide: guide ?? null, new: fresh, known, gone }, null, 1) + '\n');
  say(`${fresh.length} new, ${known.length} already in ${guide ?? 'no guide (use --guide)'}, ${gone.length} in the guide but not on the list.`);
  say(`Draft: ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
