// Field Guide (导览): is a suggestion something the guide already has? Pure
// functions, no guide content, safe for the Worker, the browser (the admin
// queue), the publisher and the routine's tools. Tested in dedupe.test.mts.
//
// Names lose accents, punctuation, case and filler words (gallery, galerie,
// the, la…); web addresses lose "www.", the query and a trailing slash (a
// Google Maps place page keeps its place number, ?cid=…, which is the page). Then:
// - the same web address → the same thing;
// - within 50 m (or the same address) with similar names → the same venue;
// - the same venue, dates that overlap (or unknown), and a shared artist or a
//   similar show title → the same show.
import type { LonLat } from './types';

/** Words that say what kind of place it is, not which. */
const FILLER = new Set([
  'the', 'a', 'an', 'and', 'of', 'at', 'la', 'le', 'les', 'l', 'de', 'du', 'des', 'd', 'et', 'en', 'au', 'aux',
  'galerie', 'gallery', 'galeria', 'galleria', 'espace', 'space', 'musee', 'museum', 'museo', 'fondation', 'foundation',
  'maison', 'centre', 'center', 'institut', 'institute', 'studio', 'atelier', 'librairie', 'bookshop', 'exposition',
  'exhibition', 'expo', 'show', 'paris', 'photo', 'photographie', 'photography',
]);

/** Lower case, no accents, letters and digits only, single spaces. */
export function normText(s: string | undefined | null): string {
  return (s ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’'`]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The words of a name that tell it apart. */
export function nameTokens(s: string | undefined | null): string[] {
  const all = normText(s).split(' ').filter(Boolean);
  const kept = all.filter((t) => !FILLER.has(t));
  return kept.length ? kept : all; // "Galerie Photo" is still something
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Dice coefficient on letter pairs: 1 for the same, 0 for nothing shared. */
export function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a), B = bigrams(b);
  let both = 0;
  for (const [g, n] of A) both += Math.min(n, B.get(g) ?? 0);
  return (2 * both) / (a.length - 1 + (b.length - 1));
}

/** How alike two names are, 0…1: the better of shared words and shared letter pairs. */
export function nameSimilarity(a: string | undefined | null, b: string | undefined | null): number {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  const sa = new Set(ta), sb = new Set(tb);
  let common = 0;
  for (const t of sa) if (sb.has(t)) common++;
  const jaccard = common / (sa.size + sb.size - common);
  // One name inside the other ("MEP" and "MEP · Maison européenne…") counts strongly.
  const contained = common > 0 && (common === sa.size || common === sb.size) ? 0.8 : 0;
  return Math.max(jaccard, contained, dice(ta.join(''), tb.join('')));
}

/** A web address reduced to host and path ("mep-fr.org/venir"), or "" when it isn't one. */
export function normUrl(u: string | undefined | null): string {
  if (!u) return '';
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(u.trim()) ? u.trim() : `https://${u.trim()}`);
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  // A Google Maps place page ("maps.google.com/?cid=…") is told apart only by its place number.
  const cid = /(^|\.)google\.[a-z.]+$/.test(host) ? url.searchParams.get('cid') : null;
  if (cid && /^\d{1,20}$/.test(cid)) return `${host}/?cid=${cid}`;
  let path = decodeURIComponent(url.pathname).toLowerCase().replace(/\/+$/, '').replace(/\/index\.(html?|php)$/, '');
  path = path.replace(/^\/(en|fr|de|it|es|zh|cn|ja|ko)(?=\/|$)/, '');
  return host + path;
}

const STREET: Record<string, string> = { r: 'rue', bd: 'boulevard', boul: 'boulevard', av: 'avenue', ave: 'avenue', pl: 'place', qu: 'quai', imp: 'impasse', fg: 'faubourg', fbg: 'faubourg', st: 'saint', ste: 'sainte' };

/** An address's words, with French street abbreviations written out. */
export function addressTokens(s: string | undefined | null): string[] {
  return normText(s)
    .split(' ')
    .filter(Boolean)
    .map((t) => STREET[t] ?? t)
    .filter((t) => !['paris', 'france', 'cedex'].includes(t));
}

/** How alike two addresses are, 0…1 (the street number must agree when both have one). */
export function addressSimilarity(a: string | undefined | null, b: string | undefined | null): number {
  const ta = addressTokens(a), tb = addressTokens(b);
  if (!ta.length || !tb.length) return 0;
  const num = (t: string[]) => t.find((x) => /^\d{1,4}[a-z]?$/.test(x) && !/^\d{5}$/.test(x));
  const na = num(ta), nb = num(tb);
  if (na && nb && na !== nb) return 0;
  const sa = new Set(ta), sb = new Set(tb);
  let common = 0;
  for (const t of sa) if (sb.has(t)) common++;
  return common / Math.min(sa.size, sb.size);
}

/** Metres between two [longitude, latitude] points. */
export function distanceM(a: LonLat, b: LonLat): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Do two date ranges ('YYYY-MM-DD', either end may be missing) share a day? null when it can't be told. */
export function datesOverlap(a: { start?: string; end?: string }, b: { start?: string; end?: string }): boolean | null {
  const as = a.start || a.end, ae = a.end || a.start, bs = b.start || b.end, be = b.end || b.start;
  if (!as || !ae || !bs || !be) return null;
  return as <= be && bs <= ae;
}

/** The people in an "artists" line: "A / B", "A, B & C", "A et B". */
export function people(s: string | undefined | null): string[] {
  return (s ?? '')
    .split(/\s*(?:[,;/&+|·]|\band\b|\bet\b|\bwith\b|\bavec\b)\s*/i)
    .map((x) => normText(x))
    .filter((x) => x.length > 1);
}

function shareArtist(a: string | undefined, b: string | undefined): boolean {
  const pa = people(a), pb = people(b);
  return pa.some((x) => pb.some((y) => x === y || dice(x.replace(/ /g, ''), y.replace(/ /g, '')) >= 0.85));
}

export interface Candidate {
  name: string;
  show?: string;
  artists?: string;
  address?: string;
  website?: string;
  links?: string[];
  coordinates?: LonLat;
  start?: string;
  end?: string;
}
export interface Known extends Candidate {
  id: string;
  /** What it is: a guide item, an official listing, a reference point, or another suggestion. */
  kind: 'item' | 'listing' | 'place' | 'submission';
}
export type MatchKind = 'same-show' | 'same-venue' | 'same-url';
export interface Match { id: string; kind: Known['kind']; match: MatchKind; score: number; why: string[] }

const urlsOf = (x: Candidate) => [x.website, ...(x.links ?? [])].map(normUrl).filter(Boolean);

/** How a candidate relates to one known thing, or null when it doesn't. */
export function compare(c: Candidate, k: Known): Match | null {
  const why: string[] = [];
  const cu = urlsOf(c), ku = new Set(urlsOf(k));
  const sameUrl = cu.some((u) => ku.has(u));
  if (sameUrl) why.push('same web address');
  const venue = nameSimilarity(c.name, k.name);
  const d = c.coordinates && k.coordinates ? distanceM(c.coordinates, k.coordinates) : null;
  const addr = addressSimilarity(c.address, k.address);
  const near = d !== null ? d <= 50 : addr >= 0.75;
  if (d !== null && d <= 50) why.push(`${Math.round(d)} m apart`);
  else if (d === null && addr >= 0.75) why.push('same address');
  const sameVenue = (near && venue >= 0.4) || (d !== null && d <= 15) || (near && addr >= 0.9) || (venue >= 0.9 && (d === null || d <= 400));
  if (venue >= 0.4) why.push(`names ${Math.round(venue * 100)}% alike`);
  if (!sameVenue && !sameUrl) return null;
  const dates = datesOverlap(c, k);
  const showLike = c.show && k.show ? nameSimilarity(c.show, k.show) : null;
  const artist = shareArtist(c.artists, k.artists);
  if (artist) why.push('a shared artist');
  if (showLike !== null && showLike >= 0.5) why.push('similar show titles');
  if (dates === false) why.push('different dates');
  // The same show needs something besides the place: a shared artist, a similar
  // title, or (when either side says nothing about a show) the same web address
  // or a closely matching name. Two studios in one building stay two venues.
  const noShowInfo = (!c.show && !c.artists) || (!k.show && !k.artists && k.kind !== 'listing');
  const showsAgree = artist || (showLike !== null && showLike >= 0.5) || (noShowInfo && (sameUrl || venue >= 0.6));
  const sameShow = dates !== false && showsAgree && (sameVenue || sameUrl);
  const match: MatchKind = sameShow ? 'same-show' : sameVenue ? 'same-venue' : 'same-url';
  const score = Math.min(1, (sameUrl ? 0.4 : 0) + (sameVenue ? 0.3 : 0) + venue * 0.2 + (artist ? 0.2 : 0) + (showLike ?? 0) * 0.1 - (dates === false ? 0.3 : 0));
  return { id: k.id, kind: k.kind, match, score: Math.max(0, Math.round(score * 100) / 100), why };
}

/** Everything a candidate may duplicate, best first. */
export function findMatches(c: Candidate, known: Known[]): Match[] {
  const order: Record<MatchKind, number> = { 'same-show': 0, 'same-venue': 1, 'same-url': 2 };
  return known
    .map((k) => compare(c, k))
    .filter((m): m is Match => m !== null)
    .sort((a, b) => order[a.match] - order[b.match] || b.score - a.score || (a.id < b.id ? -1 : 1));
}

/** A guide item as the matcher sees it. Loose input (items.json as read), so that the guide check can use it on any record. */
export function itemKnown(i: Record<string, unknown>, id: string): Known {
  const s = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const c = i.coordinates;
  return {
    id,
    kind: 'item',
    name: s(i.name) ?? '',
    show: s(i.subtitle),
    artists: s(i.by),
    address: s(i.address),
    website: s(i.sourceUrl),
    links: Array.isArray(i.links) ? i.links.filter((l): l is string => typeof l === 'string') : undefined,
    coordinates: Array.isArray(c) && c.length === 2 && c.every((n) => typeof n === 'number' && Number.isFinite(n)) ? (c as LonLat) : undefined,
    start: s(i.start),
    end: s(i.end),
  };
}

/** A stable key for "the same suggestion again": guide, name words, street number and street, web address. */
export function fingerprint(x: { guide: string; name: string; address?: string; website?: string }): string {
  const name = [...new Set(nameTokens(x.name))].sort().join('-').slice(0, 80);
  const a = addressTokens(x.address);
  const n = a.find((t) => /^\d{1,4}[a-z]?$/.test(t) && !/^\d{5}$/.test(t)) ?? '';
  const street = a.filter((t) => !/^\d+[a-z]?$/.test(t)).slice(0, 3).join('-');
  return [x.guide, name, `${n}${street ? `-${street}` : ''}`, normUrl(x.website).slice(0, 120)].join('|');
}
