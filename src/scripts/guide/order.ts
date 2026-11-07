// Field Guide (导览): the orders of the Places list ("Sort by:"). No DOM, so
// npm test can run it (order.test.mts). The list's groups (reference points,
// "Closed on <day>", official entries) stay as they are: this orders the rows
// inside each group.
import { normalise } from '../../lib/guides/core.ts';
import type { StatusCode } from '../../lib/guides/types';
import type { Sort } from './state';

export const DEFAULT_SORT: Sort = 'tier';

export interface SortRow {
  id: string;
  name: string;
  tier?: string;
  /** Where the row's area comes in the guide's list of areas. */
  zone?: number;
  /** The chosen day's status. */
  code?: StatusCode;
  /** Metres from the visitor (Where am I?); null without a position. */
  m?: number | null;
}

const TIER: Record<string, number> = { A: 0, B: 1, C: 2 };
// Walk straight in first, then check first, then appointment only, then the rest.
const OPEN: Partial<Record<StatusCode, number>> = { scheduled: 0, confirm: 1, appointment: 2 };
const num = (id: string) => Number(id.replace(/^\D+/, '')) || 0;
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** A name as it sorts: case, accents and leading quotes or dots don't count. */
export const nameKey = (s: string) => normalise(s).replace(/^[^\p{L}\p{N}]+/u, '');

/** Tier, then the number in the ref (A2 before A10). */
const byTier = (a: SortRow, b: SortRow) =>
  (TIER[a.tier ?? ''] ?? 9) - (TIER[b.tier ?? ''] ?? 9) || num(a.id) - num(b.id) || collator.compare(a.id, b.id);

/** The rows in one order (a new array; ties keep the recommended order). */
export function sortRows<T extends SortRow>(rows: T[], sort: Sort): T[] {
  const keys = new Map(rows.map((r) => [r, nameKey(r.name)]));
  const far = (r: SortRow) => r.m ?? Infinity;
  const cmp: (a: T, b: T) => number =
    sort === 'name' ? (a, b) => collator.compare(keys.get(a)!, keys.get(b)!) || byTier(a, b)
    : sort === 'zone' ? (a, b) => (a.zone ?? 999) - (b.zone ?? 999) || byTier(a, b)
    : sort === 'open' ? (a, b) => (OPEN[a.code!] ?? 3) - (OPEN[b.code!] ?? 3) || byTier(a, b)
    // Infinity - Infinity is NaN, which falls through to the tier.
    : sort === 'near' ? (a, b) => far(a) - far(b) || byTier(a, b)
    : byTier;
  return [...rows].sort(cmp);
}

/**
 * The order the list really uses. "Open that day first" needs a chosen day and
 * "Nearest first" a position; without them the list shows the default order.
 */
export function sortInUse(sort: Sort, dayChosen: boolean, located: boolean): Sort {
  if (sort === 'open' && !dayChosen) return DEFAULT_SORT;
  if (sort === 'near' && !located) return DEFAULT_SORT;
  return sort;
}

/** A saved order read back. Nearest first is never saved, since no position outlives a refresh. */
export const loadSort = (v: unknown): Sort => (v === 'name' || v === 'zone' || v === 'open' ? v : DEFAULT_SORT);
export const saveSort = (s: Sort): Sort => (s === 'near' ? DEFAULT_SORT : s);
