// Field Guide (导览): the data checks. Pure (no file access), so node tests and
// the build share them. Every problem is one line,
//   guides/<slug>/<file> › <id> › <field>: message
// and load.ts fails the build with all of them at once.
import type { AccessFile } from './types';
import { WEEKDAYS, isISODate, project } from './core.ts';
import { citySlug } from './address.ts';
import { compare, itemKnown } from './dedupe.ts';

export const GUIDE_FILES = ['guide', 'items', 'places', 'events', 'routes', 'listings', 'map'] as const;
export type GuideFileName = (typeof GUIDE_FILES)[number];
/** The parsed JSON files of one guide folder, by file name without ".json". */
export type RawGuide = Partial<Record<GuideFileName, unknown>>;
const REQUIRED: GuideFileName[] = ['guide', 'items', 'map'];

export const PLACEHOLDERS = ['items', 'listings', 'routes'];

// ---------------------------------------------------------------------------
// A small schema language: what each file may hold.

type S =
  | { t: 'str'; opt?: boolean; blank?: boolean; url?: boolean; max?: number }
  | { t: 'num'; opt?: boolean; int?: boolean; min?: number; max?: number }
  | { t: 'bool'; opt?: boolean }
  | { t: 'date'; opt?: boolean }
  | { t: 'time'; opt?: boolean }
  | { t: 'enum'; opt?: boolean; of: readonly string[] }
  | { t: 'lonlat'; opt?: boolean }
  | { t: 'aud'; opt?: boolean }
  | { t: 'centre'; opt?: boolean }
  | { t: 'arr'; opt?: boolean; of: S; rec?: string; min?: number }
  | { t: 'obj'; opt?: boolean; f: Record<string, S>; rest?: S };

const str = (o: Partial<{ opt: boolean; url: boolean; max: number }> = {}): S => ({ t: 'str', ...o });
const zh: S = { t: 'str', opt: true, blank: true };
const opt = <T extends S>(s: T): T => ({ ...s, opt: true });
const date: S = { t: 'date' };
const time: S = { t: 'time' };
const lonlat: S = { t: 'lonlat' };
const aud: S = { t: 'aud', opt: true };
const bool: S = { t: 'bool' };
const url = str({ url: true });
const ENUMS = {
  tier: ['A', 'B', 'C'],
  weekday: WEEKDAYS as readonly string[],
  holiday: ['open', 'closed', 'confirm'],
  override: ['open', 'closed', 'appointment', 'confirm'],
  access: ['walk-in', 'appointment'],
  mode: ['walking', 'transit'],
} as const;
const enm = (k: keyof typeof ENUMS, o = false): S => ({ t: 'enum', of: ENUMS[k], opt: o });
const arr = (of: S, o: Partial<{ opt: boolean; rec: string; min: number }> = {}): S => ({ t: 'arr', of, ...o });
const obj = (f: Record<string, S>, o: Partial<{ opt: boolean; rest: S }> = {}): S => ({ t: 'obj', f, ...o });
/** A text field and its optional Chinese twin. */
const tx = (k: string, required = true): Record<string, S> => ({ [k]: required ? str() : opt(str()), [k + 'Zh']: zh });

const named = obj({ id: str(), ...tx('name') });
/** A picture in img/ (items and listing records). */
const picture = obj({ file: str(), credit: zh, caption: opt(str()), ...tx('alt', false), ...tx('source', false) }, { opt: true });

const SCHEMA: Record<GuideFileName, S> = {
  guide: obj({
    ...tx('title'),
    ...tx('subtitle', false),
    public: obj({ ...tx('title'), ...tx('subtitle', false) }),
    listed: bool,
    kinds: arr(str(), { opt: true, min: 1 }),
    ...tx('city'),
    timezone: str(),
    ...tx('timezoneLabel', false),
    checked: date,
    window: obj({ start: date, end: date }, { opt: true }),
    event: obj({ ...tx('name'), start: date, end: date, url: opt(url) }, { opt: true }),
    holidays: arr(obj({ date, ...tx('name'), ...tx('notice', false) }), { opt: true }),
    tiers: arr(obj({ id: enm('tier'), ...tx('name'), ...tx('text', false), weight: { t: 'num', min: 0.01 } }), { min: 1 }),
    themes: arr(named),
    zones: arr(named),
    categories: arr(obj({ id: str(), source: opt(str()), ...tx('name') }), { opt: true }),
    costs: arr(obj({ id: str(), ...tx('name', false), ...tx('text', false) }), { opt: true, min: 1 }),
    awards: arr(obj({ id: str(), ...tx('name'), ...tx('short', false) }), { opt: true, min: 1 }),
    labels: obj({
      ...tx('item'), ...tx('items'), ...tx('subtitle', false), ...tx('by', false), ...tx('listing', false), ...tx('listings', false),
      ...tx('tier', false), ...tx('theme', false), ...tx('cost', false), ...tx('award', false),
    }),
    texts: obj(
      {},
      {
        rest: obj({
          ...tx('heading'),
          paras: arr(obj({ ...tx('text'), audience: aud }), { opt: true }),
          items: arr(obj({ ...tx('lead', false), ...tx('text'), audience: aud }), { opt: true }),
          audience: aud,
        }),
      },
    ),
    links: arr(obj({ ...tx('label'), url, audience: aud }), { opt: true }),
    credits: obj({ ...tx('points', false), ...tx('image', false) }),
    map: obj({ centre: { t: 'centre' }, heatRadius: { t: 'num', min: 10, max: 20000 } }),
    sensitive: obj({ public: arr(str()) }, { rest: arr(str()) }),
    defaults: obj({ ...tx('price', false), ...tx('listingNote', false) }, { opt: true }),
    suggestions: opt(bool),
  }),
  items: obj({
    items: arr(
      obj({
        id: str(),
        tier: enm('tier'),
        name: str(),
        short: opt(str({ max: 14 })),
        subtitle: opt(str()),
        subtitleZh: zh,
        by: opt(str()),
        zone: str(),
        themes: arr(str(), { min: 1 }),
        ...tx('why'),
        address: str(),
        ...tx('hours', false),
        start: opt(date),
        end: opt(date),
        open: arr(enm('weekday'), { opt: true, min: 1 }),
        holiday: enm('holiday', true),
        access: enm('access', true),
        exceptions: arr(obj({ date, status: enm('override'), ...tx('note', false) }), { opt: true }),
        minutes: { t: 'num', opt: true, int: true, min: 1, max: 1440 },
        ...tx('price', false),
        cost: opt(str()),
        award: opt(str()),
        ...tx('note', false),
        sourceUrl: opt(url),
        links: arr(url, { opt: true }),
        listing: opt(str()),
        coordinates: lonlat,
        image: picture,
        label: opt(bool),
        audience: aud,
        // Published from the suggestions queue (worker/publish.ts): when, by whom (if they asked to be credited), their own show, the Notion page.
        suggested: obj({ on: date, by: opt(str({ max: 80 })), own: opt(bool), ref: str({ max: 64 }) }, { opt: true }),
      }),
      { rec: 'id' },
    ),
  }),
  places: obj({
    places: arr(
      obj({
        id: str(),
        ...tx('label'),
        name: str(),
        short: opt(str({ max: 14 })),
        address: str(),
        coordinates: lonlat,
        ...tx('hours', false),
        ...tx('note', false),
        links: arr(url, { opt: true }),
        audience: aud,
      }),
      { rec: 'id' },
    ),
  }),
  events: obj({
    events: arr(
      obj({
        id: str(),
        date,
        until: opt(date),
        start: opt(time),
        end: opt(time),
        place: opt(str()),
        ...tx('title'),
        ...tx('note', false),
        optional: opt(bool),
        audience: aud,
      }),
      { rec: 'id' },
    ),
    days: arr(obj({ date, ...tx('plan'), audience: aud }), { opt: true, rec: 'date' }),
  }),
  routes: obj({
    routes: arr(
      obj({
        id: str(),
        ...tx('name'),
        ...tx('length', false),
        stops: arr(str(), { min: 2 }),
        mode: enm('mode'),
        ...tx('duration', false),
        ...tx('when', false),
        ...tx('note', false),
        audience: aud,
      }),
      { rec: 'id' },
    ),
  }),
  listings: obj({
    source: obj({ name: str(), url: opt(url), checked: date, lang: str(), credit: opt(str()) }),
    records: arr(
      obj({ id: str(), name: str(), category: str(), coordinates: lonlat, details: str(), url: opt(url), start: opt(date), end: opt(date), image: picture }),
      { rec: 'id' },
    ),
  }),
  map: obj({
    views: arr(
      obj({
        id: str(),
        ...tx('name'),
        file: str(),
        z: { t: 'num', int: true, min: 0, max: 22 },
        originX: { t: 'num' },
        originY: { t: 'num' },
        width: { t: 'num', int: true, min: 1 },
        height: { t: 'num', int: true, min: 1 },
      }),
      { rec: 'id', min: 1 },
    ),
    attribution: str(),
  }),
};

const ACCESS_SCHEMA: S = obj({
  audiences: arr(obj({ id: str(), ...tx('label'), secret: str(), includes: arr(str(), { opt: true }) }), { rec: 'id', min: 1 }),
  guides: obj({}, { rest: arr(str(), { min: 1 }) }),
  // Street-level tile bounds per guide, [west, south, east, north] in degrees (checkTiles() looks closer).
  tiles: obj({}, { opt: true, rest: arr({ t: 'num' }, { min: 4 }) }),
  // Old address → the guide's slug now (checkMoved() looks closer).
  moved: obj({}, { opt: true, rest: str() }),
  // The log-on box's tabs: what a reader can choose to see. Each guide names its own in guide.json "kinds".
  kinds: arr(obj({ id: str(), ...tx('label') }), { opt: true, rec: 'id', min: 1 }),
});

/** access.json "moved": each old address is no guide of its own and sends to one that is. */
function checkMoved(c: Ctx, access: unknown, guides: Rec): void {
  for (const [old, to] of Object.entries(O(O(access).moved))) {
    if (old.startsWith('_')) continue;
    const at: Loc = { id: 'moved', path: old };
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(old)) say(c, at, `${q(old)} should be lower-case-kebab, like an address.`);
    if (old in guides) say(c, at, `${q(old)} is still a guide in "guides". An address moves only once its guide has a new one.`);
    if (isStr(to) && !(to in guides)) say(c, at, `${q(to)} is not a guide in "guides". Send ${q(old)} to the guide's address now.`);
  }
}

/** A tile box may span at most this many degrees each way: tiles are for one region, not a country. */
const TILE_SPAN = 3;

/** access.json "tiles" › <slug> as [west, south, east, north], when it is one (checkTiles() reports why not). */
function tileBox(access: unknown, slug: string): [number, number, number, number] | null {
  const b = O(O(access).tiles)[slug];
  if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [w, s, e, n] = b as number[];
  if (!(w < e && s < n) || Math.abs(w) > 180 || Math.abs(e) > 180 || Math.abs(s) > 85.06 || Math.abs(n) > 85.06) return null;
  if (e - w > TILE_SPAN || n - s > TILE_SPAN) return null;
  return [w, s, e, n];
}

/** access.json "tiles": each entry names a guide and is a sensible [west, south, east, north] box. */
function checkTiles(c: Ctx, access: unknown, guides: Rec): void {
  for (const [slug, b] of Object.entries(O(O(access).tiles))) {
    if (slug.startsWith('_')) continue;
    const at: Loc = { id: 'tiles', path: slug };
    if (!(slug in guides)) say(c, at, `${q(slug)} is not a guide in "guides".`);
    if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      say(c, at, `should be [west, south, east, north] in degrees, four numbers, not ${q(b)}.`);
      continue;
    }
    const [w, s, e, n] = b as number[];
    if (Math.abs(w) > 180 || Math.abs(e) > 180) say(c, at, `longitudes ${w} and ${e} must be between -180 and 180.`);
    if (Math.abs(s) > 85.06 || Math.abs(n) > 85.06) say(c, at, `latitudes ${s} and ${n} must be between -85.06 and 85.06 (Web Mercator).`);
    if (!(w < e)) say(c, at, `west ${w} should be less than east ${e}. Write [west, south, east, north].`);
    if (!(s < n)) say(c, at, `south ${s} should be less than north ${n}. Write [west, south, east, north].`);
    if (w < e && s < n && (e - w > TILE_SPAN || n - s > TILE_SPAN)) say(c, at, `spans more than ${TILE_SPAN}° (${(e - w).toFixed(2)}° × ${(n - s).toFixed(2)}°). Tiles are for one region: cover the region view's area, no more.`);
  }
}

/** Global pixel (x, y) at zoom z back to [longitude, latitude] (the inverse of core.ts project()). */
function unproject(x: number, y: number, z: number): [number, number] {
  const w = 256 * Math.pow(2, z);
  const n = Math.PI * (1 - (2 * y) / w);
  return [(x / w) * 360 - 180, (Math.atan(Math.sinh(n)) * 180) / Math.PI];
}

// ---------------------------------------------------------------------------
// The walker.

type Rec = Record<string, unknown>;
const isObj = (x: unknown): x is Rec => !!x && typeof x === 'object' && !Array.isArray(x);
const A = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const O = (x: unknown): Rec => (isObj(x) ? x : {});
const isStr = (x: unknown): x is string => typeof x === 'string';
const q = (v: unknown) => (isStr(v) ? `"${v.length > 60 ? v.slice(0, 57) + '...' : v}"` : JSON.stringify(v));

interface Ctx {
  file: string;
  problems: string[];
  missingZh: number;
  audiences: string[];
}
interface Loc { id: string; path: string }

const say = (c: Ctx, at: Loc, msg: string): void => {
  c.problems.push(`${c.file} › ${at.id} › ${at.path || '(whole record)'}: ${msg}`);
};
const child = (at: Loc, k: string | number): Loc => ({
  id: at.id,
  path: typeof k === 'number' ? `${at.path}[${k}]` : at.path ? `${at.path}.${k}` : k,
});

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function suggest(k: string, known: string[]): string {
  const lower = known.find((x) => x.toLowerCase() === k.toLowerCase());
  if (lower) return `did you mean "${lower}"?`;
  let best = '';
  let score = 99;
  for (const x of known) {
    const s = lev(k.toLowerCase(), x.toLowerCase());
    if (s < score) [best, score] = [x, s];
  }
  if (best && score <= Math.max(1, Math.floor(best.length / 3))) return `did you mean "${best}"?`;
  return `known fields: ${known.join(', ')}.`;
}

const TIME_RE = /\b([01]?\d|2[0-3])[:：]([0-5]\d)\b/g;
export function timesIn(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(TIME_RE)) out.push(`${m[1].padStart(2, '0')}:${m[2]}`);
  return out.sort();
}

function walk(v: unknown, s: S, at: Loc, c: Ctx): void {
  switch (s.t) {
    case 'str':
      if (!isStr(v)) return say(c, at, `should be text in "quotes", not ${q(v)}.`);
      if (!s.blank && !v.trim()) return say(c, at, 'is empty. Write something, or leave the field out if it is optional.');
      if (s.url && !/^https:\/\/[^\s/]+\.[^\s]+$/.test(v)) say(c, at, `${q(v)} is not a web address starting with https://.`);
      if (s.max && [...v].length > s.max) say(c, at, `${q(v)} is longer than ${s.max} characters (it is a map label).`);
      if (/<[A-Za-z!/?]/.test(v)) say(c, at, `looks like HTML (${q(v.match(/<[A-Za-z!/?][^>\s]*/)?.[0])}). Write plain text.`);
      return;
    case 'num':
      if (typeof v !== 'number' || !Number.isFinite(v)) return say(c, at, `should be a number, not ${q(v)}.`);
      if (s.int && !Number.isInteger(v)) say(c, at, `should be a whole number, not ${v}.`);
      if (s.min !== undefined && v < s.min) say(c, at, `${v} is too small (at least ${s.min}).`);
      if (s.max !== undefined && v > s.max) say(c, at, `${v} is too large (at most ${s.max}).`);
      return;
    case 'bool':
      if (typeof v !== 'boolean') say(c, at, `should be true or false, not ${q(v)}.`);
      return;
    case 'date':
      if (!isStr(v) || !isISODate(v)) say(c, at, `${q(v)} is not a real date. Write YYYY-MM-DD, e.g. 2026-11-30.`);
      return;
    case 'time':
      if (!isStr(v) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) say(c, at, `${q(v)} is not a time. Write HH:MM on the 24-hour clock, e.g. 09:30.`);
      return;
    case 'enum':
      if (!isStr(v) || !s.of.includes(v)) say(c, at, `${q(v)} is not one of: ${s.of.join(', ')}.`);
      return;
    case 'lonlat':
      if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === 'number' && Number.isFinite(n)))
        say(c, at, `should be [longitude, latitude], two numbers, not ${q(v)}.`);
      return;
    case 'aud': {
      const list = isStr(v) ? [v] : Array.isArray(v) && v.length && v.every(isStr) ? (v as string[]) : null;
      if (!list) return say(c, at, `should be an audience id or a list of them, not ${q(v)}.`);
      for (const a of list) if (!c.audiences.includes(a)) say(c, at, `${q(a)} is not an audience. Known (access.json): ${c.audiences.join(', ')}.`);
      return;
    }
    case 'centre':
      if (!isStr(v) && !(Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number')))
        say(c, at, `should be a place id such as "W", or [longitude, latitude], not ${q(v)}.`);
      return;
    case 'arr': {
      if (!Array.isArray(v)) return say(c, at, `should be a list in [square brackets], not ${q(v)}.`);
      if (s.min && v.length < s.min) say(c, at, `needs at least ${s.min} entr${s.min === 1 ? 'y' : 'ies'}.`);
      v.forEach((x, i) => {
        walk(x, s.of, child(at, i), c);
      });
      return;
    }
    case 'obj': {
      if (!isObj(v)) return say(c, at, `should be an object in {curly brackets}, not ${q(v)}.`);
      const known = Object.keys(s.f);
      for (const k of known) {
        const fs = s.f[k];
        if (v[k] === undefined || v[k] === null) {
          if (!fs.opt) say(c, child(at, k), 'is missing.');
          continue;
        }
        walk(v[k], fs, child(at, k), c);
      }
      for (const k of Object.keys(v)) {
        if (k.startsWith('_') || k in s.f) continue;
        if (s.rest) walk(v[k], s.rest, child(at, k), c);
        else say(c, child(at, k), `unknown field; ${suggest(k, known)}`);
      }
      // Chinese twins: times must match; count the missing ones (an item's subtitle is usually a title in its own language).
      for (const k of known) {
        if (!k.endsWith('Zh') || !(k.slice(0, -2) in s.f)) continue;
        const base = v[k.slice(0, -2)];
        const twin = v[k];
        if (!isStr(base) || !base.trim()) continue;
        if (!isStr(twin) || !twin.trim()) {
          if (k !== 'subtitleZh') c.missingZh++;
          continue;
        }
        const a = timesIn(base).join(' ');
        const b = timesIn(twin).join(' ');
        if (a !== b) say(c, child(at, k), `the times (${b || 'none'}) differ from the English (${a || 'none'}).`);
      }
      return;
    }
  }
}

/** Walk one file at the top level: record lists get their record's id, other keys their own name. */
function walkFile(v: unknown, s: S, stem: string, c: Ctx): void {
  if (s.t !== 'obj' || !isObj(v)) return walk(v, s, { id: stem, path: '' }, c);
  const known = Object.keys(s.f);
  const locOf = (k: string, fs: S): Loc => (fs.t === 'obj' || fs.t === 'arr' ? { id: k, path: '' } : { id: stem, path: k });
  for (const k of known) {
    const fs = s.f[k];
    if (v[k] === undefined || v[k] === null) {
      if (!fs.opt) say(c, { id: stem, path: k }, 'is missing.');
      continue;
    }
    if (fs.t === 'arr' && fs.rec) {
      if (!Array.isArray(v[k])) {
        say(c, { id: stem, path: k }, `should be a list in [square brackets].`);
        continue;
      }
      if (fs.min && (v[k] as unknown[]).length < fs.min) say(c, { id: stem, path: k }, `needs at least ${fs.min} entry.`);
      (v[k] as unknown[]).forEach((x, i) => {
        const key = isObj(x) && isStr(x[fs.rec!]) && x[fs.rec!] ? (x[fs.rec!] as string) : `#${i + 1}`;
        walk(x, fs.of, { id: key, path: '' }, c);
      });
    } else walk(v[k], fs, locOf(k, fs), c);
  }
  for (const k of Object.keys(v)) {
    if (k.startsWith('_') || k in s.f) continue;
    say(c, { id: stem, path: k }, `unknown field; ${suggest(k, known)}`);
  }
}

// ---------------------------------------------------------------------------
// Checks across fields and files.

interface ViewBox { id: string; z: number; originX: number; originY: number; width: number; height: number }

function viewBoxes(map: unknown): ViewBox[] {
  return A(O(map).views).filter(
    (x): x is ViewBox => isObj(x) && ['z', 'originX', 'originY', 'width', 'height'].every((k) => typeof x[k] === 'number'),
  );
}

function regionView(map: unknown): ViewBox | null {
  const views = viewBoxes(map);
  if (!views.length) return null;
  return [...views].sort((a, b) => a.z - b.z || b.width * b.height - a.width * a.height)[0];
}

function inside(ll: [number, number], v: ViewBox): boolean {
  if (Math.abs(ll[1]) > 85 || Math.abs(ll[0]) > 180) return false;
  const p = project(ll, v.z);
  const x = p.x - v.originX;
  const y = p.y - v.originY;
  return x >= 0 && y >= 0 && x <= v.width && y <= v.height;
}

const isLL = (x: unknown): x is [number, number] => Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === 'number' && Number.isFinite(n));

function checkPoint(c: Ctx, at: Loc, ll: unknown, region: ViewBox | null): void {
  if (!region || !isLL(ll) || inside(ll, region)) return;
  if (inside([ll[1], ll[0]], region))
    say(c, at, `[${ll[0]}, ${ll[1]}] looks like [latitude, longitude]. Write [longitude, latitude]: swap them to [${ll[1]}, ${ll[0]}].`);
  else say(c, at, `[${ll[0]}, ${ll[1]}] is outside the map "${region.id}". Check the numbers (they are [longitude, latitude]).`);
}

// A base map centred on a hidden place gives it away: its centre is origin + size / 2.
const CENTRE_GAP = 48;
function checkOffCentre(c: Ctx, at: Loc, r: Rec, views: ViewBox[]): void {
  if (r.audience === undefined || r.audience === null || !isLL(r.coordinates)) return;
  for (const v of views) {
    if (!inside(r.coordinates, v)) continue;
    const p = project(r.coordinates, v.z);
    if (Math.hypot(p.x - v.originX - v.width / 2, p.y - v.originY - v.height / 2) < CENTRE_GAP)
      say(c, at, `is too close to the centre of map view ${q(v.id)}: people who can't see it could find it from the map's size. Crop the map off-centre (docs/GUIDES.md, base maps).`);
  }
}

function dupes(c: Ctx, list: unknown[], key: string, label: (id: string) => Loc): Set<string> {
  const seen = new Set<string>();
  for (const x of list) {
    const id = O(x)[key];
    if (!isStr(id)) continue;
    if (seen.has(id)) say(c, label(id), `${q(id)} is used twice. Each ${key} must be different.`);
    seen.add(id);
  }
  return seen;
}

function range(c: Ctx, at: Loc, start: unknown, end: unknown, endKey = 'end'): void {
  if (isStr(start) && isStr(end) && isISODate(start) && isISODate(end) && end < start)
    say(c, { ...at, path: at.path ? `${at.path}.${endKey}` : endKey }, `${q(end)} is before the start ${q(start)}.`);
}

function inWindow(d: string, win: { start: string; end: string } | null) {
  return !win || (d >= win.start && d <= win.end);
}

function auds(access: AccessFile | null): string[] {
  return A(O(access).audiences)
    .map((a) => O(a).id)
    .filter(isStr);
}

export interface GuideReport { problems: string[]; missingZh: number }

/** Every problem in one guide folder, plus how many texts lack Chinese. */
export function inspectGuide(raw: RawGuide, slug: string, access: AccessFile | null): GuideReport {
  const problems: string[] = [];
  let missingZh = 0;
  const audiences = auds(access);
  const ctx = (f: string): Ctx => ({ file: `guides/${slug}/${f}.json`, problems, missingZh: 0, audiences });
  /** A picture (an item's or a listing record's): a plain file name in img/, and a credit. */
  const checkPicture = (c: Ctx, f: (path: string) => Loc, img: unknown) => {
    if (!isObj(img)) return;
    if (isStr(img.file) && !/^[A-Za-z0-9][A-Za-z0-9._-]*\.(jpe?g|png|webp)$/i.test(img.file))
      say(c, f('image.file'), `${q(img.file)} should be a file name in public/guides/${slug}/img/ (jpg, png or webp, no folders or spaces).`);
    if (!isStr(img.credit) || !img.credit.trim()) say(c, f('image.credit'), 'a picture needs a credit (who made it, and where it came from).');
  };

  for (const f of Object.keys(raw)) {
    if (!(GUIDE_FILES as readonly string[]).includes(f))
      problems.push(`guides/${slug}/${f}.json › (file) › (file): not a Field Guide file. Known: ${GUIDE_FILES.map((x) => x + '.json').join(', ')}.`);
  }
  for (const f of GUIDE_FILES) {
    if (raw[f] === undefined) {
      if (REQUIRED.includes(f)) problems.push(`guides/${slug}/${f}.json › (file) › (file): the file is missing.`);
      continue;
    }
    const c = ctx(f);
    walkFile(raw[f], SCHEMA[f], f, c);
    missingZh += c.missingZh;
  }

  const g = O(raw.guide);
  const items = A(O(raw.items).items);
  const places = A(O(raw.places).places);
  const events = A(O(raw.events).events);
  const days = A(O(raw.events).days);
  const routes = A(O(raw.routes).routes);
  const records = A(O(raw.listings).records);
  const views = A(O(raw.map).views);
  const region = regionView(raw.map);
  const boxes = viewBoxes(raw.map);
  const win0 = O(g.window);
  const win = isStr(win0.start) && isStr(win0.end) && isISODate(win0.start) && isISODate(win0.end) ? { start: win0.start, end: win0.end } : null;
  const winText = win ? `${win.start} to ${win.end}` : '';

  // guide.json
  {
    const c = ctx('guide');
    range(c, { id: 'window', path: '' }, win0.start, win0.end);
    if (win && win.end >= win.start && (Date.parse(win.end) - Date.parse(win.start)) / 864e5 > 92)
      say(c, { id: 'window', path: 'end' }, 'the guide covers more than 92 days. Check the year.');
    const ev = O(g.event);
    range(c, { id: 'event', path: '' }, ev.start, ev.end);
    // The address starts with the city, so /guides/<city> can find the guide (src/lib/guides/address.ts).
    if (isStr(g.city) && citySlug(g.city) && !slug.startsWith(`${citySlug(g.city)}-`)) {
      const month = isStr(win0.start) && /^\d{4}-\d{2}/.test(win0.start) ? win0.start.slice(0, 7) : 'topic';
      say(c, { id: 'guide', path: 'city' }, `the guide's address (its folder, ${q(slug)}) should start with its city: "${citySlug(g.city)}-${month}". See docs/GUIDES.md, section 12.`);
    }
    if (isStr(g.timezone)) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: g.timezone });
      } catch {
        say(c, { id: 'guide', path: 'timezone' }, `${q(g.timezone)} is not a time zone. Write an IANA name, e.g. "Europe/Paris".`);
      }
    }
    dupes(c, A(g.holidays), 'date', () => ({ id: 'holidays', path: 'date' }));
    for (const k of ['tiers', 'themes', 'zones', 'categories', 'costs', 'awards']) dupes(c, A(g[k]), 'id', (id) => ({ id: k, path: `id ${q(id)}` }));
    // Kinds: the log-on box's tabs (access.json "kinds"). A listed guide needs one, or no tab would offer it.
    const kinds = A(g.kinds);
    const known = A(access?.kinds).map((k) => O(k).id).filter(isStr);
    kinds.forEach((k, i) => {
      if (isStr(k) && !known.includes(k))
        say(c, { id: 'guide', path: `kinds[${i}]` }, known.length ? `${q(k)} is not a kind in access.json "kinds". Known: ${known.join(', ')}.` : `${q(k)}: access.json has no "kinds" yet. Add it there first.`);
    });
    if (new Set(kinds).size !== kinds.length) say(c, { id: 'guide', path: 'kinds' }, 'lists a kind twice.');
    if (g.listed === true && known.length && !kinds.length)
      say(c, { id: 'guide', path: 'kinds' }, `is missing. A listed guide names its kind, so the log-on box can offer it. Known: ${known.join(', ')}.`);
    A(g.holidays).forEach((h, i) => {
      const d = O(h).date;
      if (isStr(d) && isISODate(d) && !inWindow(d, win)) say(c, { id: 'holidays', path: `[${i}].date` }, `${q(d)} is outside the guide's days (${winText}). Check the year.`);
    });
    // Placeholders in the title, subtitle and texts (view.ts fills them all).
    const scan = (s: unknown, path: string, id = 'texts') => {
      if (!isStr(s)) return;
      for (const m of s.matchAll(/\{\s*([A-Za-z]+)\s*\}/g))
        if (!PLACEHOLDERS.includes(m[1])) say(c, { id, path }, `unknown placeholder {${m[1]}}. Known: ${PLACEHOLDERS.map((p) => `{${p}}`).join(', ')}.`);
        else if (m[0] !== `{${m[1]}}`) say(c, { id, path }, `write {${m[1]}} without spaces.`);
    };
    // Fields that are never filled (public.* is shared by every audience): a placeholder would show as it is.
    const unfilled = (s: unknown, path: string) => {
      if (isStr(s) && /\{\s*[A-Za-z]+\s*\}/.test(s)) say(c, { id: 'guide', path }, 'placeholders such as {items} work only in the title, subtitle and texts. Write the number out here.');
    };
    for (const k of ['title', 'titleZh', 'subtitle', 'subtitleZh']) unfilled(O(g.public)[k], `public.${k}`);
    A(g.holidays).forEach((h, i) => ['notice', 'noticeZh', 'name', 'nameZh'].forEach((k) => unfilled(O(h)[k], `holidays[${i}].${k}`)));
    A(g.tiers).forEach((t, i) => ['text', 'textZh', 'name', 'nameZh'].forEach((k) => unfilled(O(t)[k], `tiers[${i}].${k}`)));
    A(g.costs).forEach((x, i) => ['name', 'nameZh', 'text', 'textZh'].forEach((k) => unfilled(O(x)[k], `costs[${i}].${k}`)));
    A(g.awards).forEach((x, i) => ['name', 'nameZh', 'short', 'shortZh'].forEach((k) => unfilled(O(x)[k], `awards[${i}].${k}`)));
    for (const [k, v] of Object.entries(O(g.labels))) unfilled(v, `labels.${k}`);
    for (const k of ['title', 'titleZh', 'subtitle', 'subtitleZh']) scan(g[k], k, 'guide');
    const texts = O(g.texts);
    for (const [sid, sec] of Object.entries(texts)) {
      if (sid.startsWith('_')) continue;
      const S0 = O(sec);
      scan(S0.heading, `${sid}.heading`);
      scan(S0.headingZh, `${sid}.headingZh`);
      for (const k of ['paras', 'items'])
        A(S0[k]).forEach((p, i) => {
          for (const f of ['text', 'textZh', 'lead', 'leadZh']) scan(O(p)[f], `${sid}.${k}[${i}].${f}`);
        });
    }
    for (const k of Object.keys(O(g.sensitive)))
      if (k !== 'public' && !k.startsWith('_') && !audiences.includes(k))
        say(c, { id: 'sensitive', path: k }, `${q(k)} is not an audience. Use "public" or one of: ${audiences.join(', ')}.`);
    const centre = O(g.map).centre;
    if (isStr(centre)) {
      if (!places.some((p) => O(p).id === centre))
        say(c, { id: 'map', path: 'centre' }, `${q(centre)} is not a place in places.json.`);
    } else if (isLL(centre)) {
      checkPoint(c, { id: 'map', path: 'centre' }, centre, region);
      // A [lon, lat] centre goes to every audience, so it must not sit on a hidden place.
      const near = new Set<string>();
      for (const x of [...items, ...places]) {
        const r = O(x);
        if (r.audience === undefined || r.audience === null || !isLL(r.coordinates) || !isStr(r.id)) continue;
        for (const v of boxes) {
          const a = project(centre, v.z);
          const p = project(r.coordinates, v.z);
          if (Math.hypot(a.x - p.x, a.y - p.y) < CENTRE_GAP) near.add(r.id);
        }
      }
      for (const id of near)
        say(c, { id: 'map', path: 'centre' }, `is next to ${q(id)}, which not every reader sees. Write a place id (e.g. "W") so each audience gets its own centre.`);
    }
  }

  const themes = new Set(A(g.themes).map((x) => O(x).id).filter(isStr));
  const zones = new Set(A(g.zones).map((x) => O(x).id).filter(isStr));
  const cats = new Set(A(g.categories).map((x) => O(x).id).filter(isStr));
  const costs = new Set(A(g.costs).map((x) => O(x).id).filter(isStr));
  const awards = new Set(A(g.awards).map((x) => O(x).id).filter(isStr));
  const listingIds = new Set(records.map((x) => O(x).id).filter(isStr));
  const itemIds = new Set(items.map((x) => O(x).id).filter(isStr));
  const placeIds = new Set(places.map((x) => O(x).id).filter(isStr));
  const idOf = (x: unknown, i: number) => (isStr(O(x).id) && O(x).id ? (O(x).id as string) : `#${i + 1}`);
  const known = () => [...itemIds, ...placeIds].join(', ');

  // items.json
  {
    const c = ctx('items');
    dupes(c, items, 'id', (id) => ({ id, path: 'id' }));
    // A suggestion is published once, and a show is listed once. A second copy (a branch made before
    // the publisher added it, a hand-made entry) fails here: in the build, the publisher and admin edits.
    const byRef = new Map<string, string>();
    items.forEach((x, i) => {
      const ref = O(O(x).suggested).ref;
      if (!isStr(ref)) return;
      const first = byRef.get(ref);
      if (first === undefined) byRef.set(ref, idOf(x, i));
      else say(c, { id: idOf(x, i), path: 'suggested.ref' }, `is the same suggestion as ${q(first)} (${ref}). A suggestion is published once: keep one of them.`);
    });
    const shows = items.map((x, i) => itemKnown(O(x), idOf(x, i)));
    for (let b = 1; b < shows.length; b++) {
      for (let a = 0; a < b; a++) {
        const m = compare(shows[b]!, shows[a]!);
        if (m?.match !== 'same-show') continue;
        // Both are named, so that the publisher puts aside whichever of the two is new.
        const tail = `(${m.why.join(', ')}). Keep one entry, or make the difference clear (venue, show, dates).`;
        say(c, { id: shows[b]!.id, path: '' }, `looks like the same show as ${q(shows[a]!.id)} ${tail}`);
        say(c, { id: shows[a]!.id, path: '' }, `looks like the same show as ${q(shows[b]!.id)} ${tail}`);
      }
    }
    const linked = new Map<string, string>();
    items.forEach((x, i) => {
      const r = O(x);
      const at: Loc = { id: idOf(x, i), path: '' };
      const f = (p: string): Loc => ({ ...at, path: p });
      if (isStr(r.id) && !/^[A-C]\d+$/.test(r.id)) say(c, f('id'), `${q(r.id)} should be a tier letter and a number, e.g. A1, B12.`);
      else if (isStr(r.id) && isStr(r.tier) && r.id[0] !== r.tier)
        say(c, f('id'), `${q(r.id)} should start with its tier letter "${r.tier}", e.g. ${r.tier}${r.id.slice(1)}.`);
      if (isStr(r.zone) && !zones.has(r.zone)) say(c, f('zone'), `${q(r.zone)} is not a zone in guide.json. Known: ${[...zones].join(', ')}.`);
      if (isStr(r.cost) && !costs.has(r.cost))
        say(c, f('cost'), costs.size ? `${q(r.cost)} is not a price level in guide.json "costs". Known: ${[...costs].join(', ')}.` : `${q(r.cost)}: guide.json has no "costs" (price levels) yet.`);
      if (isStr(r.award) && !awards.has(r.award))
        say(c, f('award'), awards.size ? `${q(r.award)} is not a distinction in guide.json "awards". Known: ${[...awards].join(', ')}.` : `${q(r.award)}: guide.json has no "awards" yet.`);
      const th = A(r.themes);
      th.forEach((t, j) => {
        if (isStr(t) && !themes.has(t)) say(c, f(`themes[${j}]`), `${q(t)} is not a theme in guide.json. Known: ${[...themes].join(', ')}.`);
      });
      if (new Set(th).size !== th.length) say(c, f('themes'), 'lists a theme twice.');
      range(c, at, r.start, r.end);
      if (win && isStr(r.start) && isStr(r.end) && isISODate(r.start) && isISODate(r.end) && r.start <= r.end) {
        if (r.end < win.start) say(c, f('end'), `${q(r.end)}: never open during the guide's days (${winText}). Check the year.`);
        else if (r.start > win.end) say(c, f('start'), `${q(r.start)}: never open during the guide's days (${winText}). Check the year.`);
      } else if (win && isStr(r.end) && isISODate(r.end) && !isStr(r.start) && r.end < win.start)
        say(c, f('end'), `${q(r.end)}: never open during the guide's days (${winText}). Check the year.`);
      else if (win && isStr(r.start) && isISODate(r.start) && !isStr(r.end) && r.start > win.end)
        say(c, f('start'), `${q(r.start)}: never open during the guide's days (${winText}). Check the year.`);
      dupes(c, A(r.exceptions), 'date', () => f('exceptions'));
      A(r.exceptions).forEach((e, j) => {
        const d = O(e).date;
        if (isStr(d) && isISODate(d) && !inWindow(d, win)) say(c, f(`exceptions[${j}].date`), `${q(d)} is outside the guide's days (${winText}). Check the year.`);
      });
      const o = A(r.open);
      if (new Set(o).size !== o.length) say(c, f('open'), 'lists a weekday twice.');
      if (isStr(r.listing)) {
        if (!listingIds.has(r.listing)) say(c, f('listing'), `${q(r.listing)} is not a record in listings.json.`);
        else if (linked.has(r.listing)) say(c, f('listing'), `${q(r.listing)} is already linked from ${linked.get(r.listing)}. Each record stands for one item.`);
        else linked.set(r.listing, at.id);
      }
      checkPoint(c, f('coordinates'), r.coordinates, region);
      checkOffCentre(c, f('coordinates'), r, boxes);
      checkPicture(c, f, r.image);
    });
  }

  // places.json
  {
    const c = ctx('places');
    dupes(c, places, 'id', (id) => ({ id, path: 'id' }));
    places.forEach((x, i) => {
      const r = O(x);
      const at: Loc = { id: idOf(x, i), path: '' };
      if (isStr(r.id) && !/^[A-Z]$/.test(r.id)) say(c, { ...at, path: 'id' }, `${q(r.id)} should be one capital letter, e.g. "W".`);
      if (isStr(r.id) && itemIds.has(r.id)) say(c, { ...at, path: 'id' }, `${q(r.id)} is also an item id.`);
      checkPoint(c, { ...at, path: 'coordinates' }, r.coordinates, region);
      checkOffCentre(c, { ...at, path: 'coordinates' }, r, boxes);
    });
  }

  // events.json
  {
    const c = ctx('events');
    dupes(c, events, 'id', (id) => ({ id, path: 'id' }));
    events.forEach((x, i) => {
      const r = O(x);
      const at: Loc = { id: idOf(x, i), path: '' };
      range(c, at, r.date, r.until, 'until');
      if (isStr(r.start) && isStr(r.end) && /^\d\d:\d\d$/.test(r.start) && /^\d\d:\d\d$/.test(r.end) && r.end <= r.start && !isStr(r.until))
        say(c, { ...at, path: 'end' }, `${q(r.end)} is not after the start ${q(r.start)}.`);
      if (isStr(r.date) && isISODate(r.date) && !inWindow(r.date, win))
        say(c, { ...at, path: 'date' }, `${q(r.date)} is outside the guide's days (${winText}). Check the year.`);
      if (isStr(r.place) && !itemIds.has(r.place) && !placeIds.has(r.place))
        say(c, { ...at, path: 'place' }, `${q(r.place)} is not an item or place. Known: ${known()}.`);
    });
    const seen = new Set<string>();
    days.forEach((x, i) => {
      const d = O(x).date;
      if (!isStr(d)) return;
      const at: Loc = { id: d || `#${i + 1}`, path: 'date' };
      if (seen.has(d)) say(c, at, `${q(d)} has two day plans.`);
      seen.add(d);
      if (isISODate(d) && !inWindow(d, win)) say(c, at, `${q(d)} is outside the guide's days (${winText}). Check the year.`);
    });
  }

  // routes.json
  {
    const c = ctx('routes');
    dupes(c, routes, 'id', (id) => ({ id, path: 'id' }));
    routes.forEach((x, i) => {
      const r = O(x);
      const at: Loc = { id: idOf(x, i), path: '' };
      A(r.stops).forEach((s, j, all) => {
        if (!isStr(s)) return;
        if (!itemIds.has(s) && !placeIds.has(s)) say(c, { ...at, path: `stops[${j}]` }, `${q(s)} is not an item or place. Known: ${known()}.`);
        else if (j > 0 && all[j - 1] === s) say(c, { ...at, path: `stops[${j}]` }, `${q(s)} repeats the stop before it.`);
      });
    });
  }

  // listings.json
  {
    const c = ctx('listings');
    dupes(c, records, 'id', (id) => ({ id, path: 'id' }));
    records.forEach((x, i) => {
      const r = O(x);
      const at: Loc = { id: idOf(x, i), path: '' };
      if (isStr(r.category) && !cats.has(r.category))
        say(c, { ...at, path: 'category' }, `${q(r.category)} is not a category in guide.json. Known: ${[...cats].join(', ') || '(none: add "categories")'}.`);
      range(c, at, r.start, r.end);
      checkPoint(c, { ...at, path: 'coordinates' }, r.coordinates, region);
      checkPicture(c, (path) => ({ ...at, path }), r.image);
    });
  }

  // map.json
  {
    const c = ctx('map');
    dupes(c, views, 'id', (id) => ({ id, path: 'id' }));
    views.forEach((x, i) => {
      const f = O(x).file;
      if (isStr(f) && !/^[A-Za-z0-9][A-Za-z0-9._-]*\.(jpe?g|png|webp)$/i.test(f))
        say(c, { id: idOf(x, i), path: 'file' }, `${q(f)} should be a file name in public/guides/${slug}/map/ (jpg, png or webp).`);
    });
    // Street-level tiles stop at the bounds in access.json, so every base map must lie inside them.
    const tb = tileBox(access, slug);
    if (tb) {
      const eps = 1e-9;
      for (const v of boxes) {
        const [w, n] = unproject(v.originX, v.originY, v.z);
        const [e, s] = unproject(v.originX + v.width, v.originY + v.height, v.z);
        if (w < tb[0] - eps || e > tb[2] + eps || s < tb[1] - eps || n > tb[3] + eps)
          say(c, { id: v.id, path: '' }, `reaches outside the tile bounds in access.json "tiles" (it spans [${w.toFixed(4)}, ${s.toFixed(4)}, ${e.toFixed(4)}, ${n.toFixed(4)}]). Widen them, or zoomed-in tiles will stop at this map's edge.`);
      }
    }
  }

  return { problems: [...new Set(problems)], missingZh };
}

export function checkGuide(raw: RawGuide, slug: string, access: AccessFile | null): string[] {
  return inspectGuide(raw, slug, access).problems;
}

/** access.json on its own, and against the guide folders that exist. */
export function checkAccess(access: unknown, slugs: string[]): string[] {
  const problems: string[] = [];
  const c: Ctx = { file: 'guides/access.json', problems, missingZh: 0, audiences: [] };
  walkFile(access, ACCESS_SCHEMA, 'access', c);
  const list = A(O(access).audiences);
  const ids = list.map((a) => O(a).id).filter(isStr);
  dupes(c, list, 'id', (id) => ({ id, path: 'id' }));
  const byId = new Map(list.map((a) => [O(a).id, O(a)]));
  list.forEach((a, i) => {
    const r = O(a);
    const at: Loc = { id: isStr(r.id) ? r.id : `#${i + 1}`, path: '' };
    if (isStr(r.id) && !/^[a-z][a-z0-9-]*$/.test(r.id)) say(c, { ...at, path: 'id' }, `${q(r.id)} should be lower case letters, digits and "-".`);
    if (isStr(r.secret) && !/^GUIDES_[A-Z0-9_]+$/.test(r.secret))
      say(c, { ...at, path: 'secret' }, `${q(r.secret)} should be the NAME of a Cloudflare secret starting with GUIDES_ (capitals, digits, _), never the password. The Worker only reads GUIDES_… secrets.`);
    A(r.includes).forEach((x, j) => {
      if (isStr(x) && !ids.includes(x)) say(c, { ...at, path: `includes[${j}]` }, `${q(x)} is not an audience. Known: ${ids.join(', ')}.`);
      else if (isStr(x) && list.findIndex((b) => O(b).id === x) > i)
        say(c, { ...at, path: `includes[${j}]` }, `${q(x)} must be listed before ${q(r.id)} in "audiences" (least privileged first): the Worker gives a password the first audience it matches and serves the last one on the guide's list.`);
    });
    // No loops (a includes b includes a).
    const seen = new Set<unknown>();
    const stack = [...A(r.includes)];
    while (stack.length) {
      const n = stack.pop();
      if (n === r.id) {
        say(c, { ...at, path: 'includes' }, 'includes itself through a loop.');
        break;
      }
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(...A(byId.get(n)?.includes));
    }
  });
  const guides = O(O(access).guides);
  for (const [slug, list2] of Object.entries(guides)) {
    if (slug.startsWith('_')) continue;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) say(c, { id: 'guides', path: slug }, `${q(slug)} should be lower-case-kebab, like the folder name.`);
    if (!slugs.includes(slug)) say(c, { id: 'guides', path: slug }, `there is no folder src/content/guides/${slug}/.`);
    A(list2).forEach((x, j) => {
      if (isStr(x) && !ids.includes(x)) say(c, { id: 'guides', path: `${slug}[${j}]` }, `${q(x)} is not an audience. Known: ${ids.join(', ')}.`);
    });
  }
  for (const s of slugs)
    if (!(s in guides)) problems.push(`guides/${s}/ › (folder) › (folder): not in access.json "guides", so nobody can open it. Add "${s}": ["visitor"].`);
  const kinds = A(O(access).kinds);
  dupes(c, kinds, 'id', (id) => ({ id: 'kinds', path: `id ${q(id)}` }));
  kinds.forEach((k, i) => {
    const id = O(k).id;
    if (isStr(id) && !/^[a-z][a-z0-9-]*$/.test(id)) say(c, { id: 'kinds', path: `[${i}].id` }, `${q(id)} should be lower case letters, digits and "-".`);
  });
  checkTiles(c, access, guides);
  checkMoved(c, access, guides);
  return [...new Set(problems)];
}

/** Check access.json and every guide; throw one error listing every problem. */
export function checkAll(guides: Record<string, RawGuide>, access: AccessFile): Record<string, GuideReport> {
  const problems = checkAccess(access, Object.keys(guides));
  const reports: Record<string, GuideReport> = {};
  for (const [slug, raw] of Object.entries(guides)) {
    reports[slug] = inspectGuide(raw, slug, access);
    problems.push(...reports[slug].problems);
  }
  if (problems.length) {
    const n = problems.length;
    throw new Error(`Field Guide: ${n} problem${n === 1 ? '' : 's'} in src/content/guides/. The site was not updated.\n  ${problems.join('\n  ')}`);
  }
  return reports;
}
