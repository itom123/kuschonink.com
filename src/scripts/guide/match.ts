// Field Guide (导览): how Find matches and ranks (no DOM, so npm test can run
// it). Case and accents don't count, every word must match somewhere, in any
// order and either language; names count most, then people and titles, then
// the rest. The drop-down that shows the results is find.ts.
import { normalise } from '../../lib/guides/core.ts';
import type { Bi } from '../../lib/guides/types';

export type HitKind = 'item' | 'place' | 'listing' | 'route' | 'event' | 'theme';
export interface Field { t: string; w: number }
export interface Entry {
  kind: HitKind;
  id: string;
  /** The first line: a proper name (as written) or words in both languages. */
  name: string | Bi;
  /** The second line: nodes cloned from the page, or text. */
  sub?: Node | string | Bi | null;
  /** The icon class (ico-pin-a…), or a letter plate. */
  icon?: string;
  plate?: string;
  /** Normalised texts and their weights; fields[0] is the name. */
  fields: Field[];
  tier?: string;
}
export interface Hit { e: Entry; score: number }

const ORDER: Record<HitKind, number> = { item: 0, place: 1, route: 2, event: 3, theme: 4, listing: 5 };
const CJK = /[⺀-鿿豈-﫿＀-￯]/;
/** Rows in the drop-down. */
export const SHOWN = 8;

/** The query as words, normalised. */
export const words = (q: string) => normalise(q).split(' ').filter(Boolean);

/** Worth a drop-down: two letters, a digit, or any Chinese. */
export const worthShowing = (q: string) => {
  const n = normalise(q);
  return n.length >= 2 || /\d/.test(n) || CJK.test(n);
};

/** A field: the parts joined and normalised. */
export const field = (w: number, ...parts: (string | Bi | null | undefined)[]): Field => ({
  t: normalise(parts.map((p) => (p == null ? '' : typeof p === 'string' ? p : `${p.en} ${p.zh}`)).join(' ')),
  w,
});

/** How well a word fits a text: 1 at its start, 0.8 at a word's start, 0.5 inside one, 0 not at all. */
export function fit(text: string, w: string): number {
  let i = text.indexOf(w);
  if (i < 0) return 0;
  if (i === 0) return 1;
  if (CJK.test(w)) return 0.8;
  for (; i >= 0; i = text.indexOf(w, i + 1)) if (!/[a-z0-9]/.test(text[i - 1])) return 0.8;
  return 0.5;
}

/** 0 when a word is missing; otherwise higher is better. */
export function score(e: Entry, ws: string[]): number {
  let total = 0;
  for (const w of ws) {
    let best = 0;
    for (const f of e.fields) {
      const s = fit(f.t, w) * f.w;
      if (s > best) best = s;
    }
    if (!best) return 0;
    total += best;
  }
  const whole = ws.join(' ');
  if (whole && (e.fields[0]?.t ?? '').startsWith(whole)) total += 6;
  if (whole && whole === normalise(e.id)) total += 20;
  return total;
}

const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

/** Every entry that matches, best first. */
export function search(entries: Entry[], q: string): Hit[] {
  const ws = words(q);
  if (!ws.length) return [];
  const hits: Hit[] = [];
  for (const e of entries) {
    const s = score(e, ws);
    if (s > 0) hits.push({ e, score: s });
  }
  return hits.sort((a, b) =>
    b.score - a.score || ORDER[a.e.kind] - ORDER[b.e.kind] || (a.e.tier ?? 'Z').localeCompare(b.e.tier ?? 'Z') || natural(a.e.id, b.e.id));
}

/** Where the words fall in a name, as [start, end) ranges of the text as written. */
export function ranges(name: string, ws: string[]): [number, number][] {
  let norm = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let i = 0;
  for (const ch of name) {
    const n = /\s/.test(ch) ? ' ' : normalise(ch);
    for (let k = 0; k < n.length; k++) {
      starts.push(i);
      ends.push(i + ch.length);
    }
    norm += n;
    i += ch.length;
  }
  const out: [number, number][] = [];
  for (const w of ws) {
    const at = norm.indexOf(w);
    if (at >= 0) out.push([starts[at], ends[at + w.length - 1]]);
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}
