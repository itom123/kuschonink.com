// Field Guide (导览): the program's state, its URL query and its storage.
// URL keys (non-defaults only): place, day, theme, q, listings=1, area, route,
// view. A day chosen automatically (today) and the map camera never go in the
// URL. localStorage kus98:guide = {heat, labels, sort} (never "Nearest first");
// sessionStorage kus98:guide:view = {guide, cam, area, scroll}. Log Off clears both.
import type { ISODate, Payload } from '../../lib/guides/types';
import { readStore, writeStore } from './dom';
import { loadSort, saveSort } from './order';

export type View = 'map' | 'places' | 'routes' | 'days' | 'info';
export type Detail = 'closed' | 'half' | 'full';
/** The Places list's order (order.ts): recommended (tier, then ref), name, area, open that day first, nearest first. */
export type Sort = 'tier' | 'name' | 'zone' | 'open' | 'near';
export const VIEWS: View[] = ['map', 'places', 'routes', 'days', 'info'];

export interface GdState {
  place: string | null;
  /** 'any', or a day of the guide's window. */
  day: 'any' | ISODate;
  /** The day was picked for the visitor (today), so it isn't written to the URL. */
  dayAuto: boolean;
  theme: string;
  q: string;
  listings: boolean;
  area: string;
  route: string | null;
  /** null: the layout's default (Places beside the map when wide, the map when compact). */
  view: View | null;
  detail: Detail;
  heat: boolean;
  labels: boolean;
  sort: Sort;
}

export const PREFS = 'kus98:guide';
export const SESSION = 'kus98:guide:view';
export interface Prefs { heat?: boolean; labels?: boolean; sort?: Sort }
export interface Session { guide?: string; cam?: { cx: number; cy: number; s: number }; area?: string; scroll?: Record<string, number> }

export const loadPrefs = () => readStore<Prefs>('local', PREFS) ?? {};
export const savePrefs = (s: GdState) => writeStore('local', PREFS, { heat: s.heat, labels: s.labels, sort: saveSort(s.sort) } satisfies Prefs);
export const loadSession = (slug: string): Session => {
  const s = readStore<Session>('session', SESSION);
  return s && s.guide === slug ? s : {};
};
export const saveSession = (s: Session) => writeStore('session', SESSION, s);
export const clearStorage = () => {
  writeStore('local', PREFS, null);
  writeStore('session', SESSION, null);
};

export function initialState(p: Payload, query: string, prefs: Prefs, today: ISODate): GdState {
  const u = new URLSearchParams(query);
  const days = p.window?.days ?? [];
  const ids = new Set([...p.items.map((i) => i.id), ...p.places.map((x) => x.id), ...p.listings.filter((l) => !l.item).map((l) => l.id)]);
  const qDay = u.get('day');
  const autoDay = days.includes(today) ? today : 'any';
  const day = qDay && (qDay === 'any' || days.includes(qDay)) ? qDay : autoDay;
  const place = u.get('place');
  const theme = u.get('theme') ?? '';
  const route = u.get('route');
  const view = u.get('view') as View | null;
  const area = u.get('area');
  return {
    place: place && ids.has(place) ? place : null,
    day,
    dayAuto: !(qDay && day === qDay),
    theme: p.themes.some((t) => t.id === theme) ? theme : '',
    q: (u.get('q') ?? '').slice(0, 80),
    listings: u.get('listings') === '1',
    area: area && p.map.views.some((v) => v.id === area) ? area : (p.map.views[0]?.id ?? ''),
    route: route && p.routes.some((r) => r.id === route) ? route : null,
    view: view && VIEWS.includes(view) && (view !== 'days' || days.length > 0) ? view : null,
    detail: 'closed',
    // On by default in every scheme (red and maroon read on the grey map too); a saved choice wins.
    heat: prefs.heat ?? true,
    labels: prefs.labels ?? true,
    sort: loadSort(prefs.sort),
  };
}

/** "?place=A3&day=2026-11-13" (non-defaults only), or "". */
export function toQuery(s: GdState, p: Payload): string {
  const u = new URLSearchParams();
  if (s.place) u.set('place', s.place);
  if (!s.dayAuto && p.window) u.set('day', s.day);
  if (s.theme) u.set('theme', s.theme);
  if (s.q) u.set('q', s.q);
  if (s.listings) u.set('listings', '1');
  if (s.area && s.area !== p.map.views[0]?.id) u.set('area', s.area);
  if (s.route) u.set('route', s.route);
  if (s.view) u.set('view', s.view);
  const q = u.toString();
  return q ? `?${q}` : '';
}

type Listener = (s: GdState, changed: Set<keyof GdState>) => void;

export class Store {
  private s: GdState;
  private fns: Listener[] = [];
  constructor(s: GdState) { this.s = s; }
  get(): GdState { return this.s; }
  set(patch: Partial<GdState>) {
    const changed = new Set<keyof GdState>();
    for (const k of Object.keys(patch) as (keyof GdState)[]) {
      if (this.s[k] !== patch[k]) changed.add(k);
    }
    if (!changed.size) return;
    this.s = { ...this.s, ...patch };
    for (const f of this.fns) f(this.s, changed);
  }
  on(f: Listener) { this.fns.push(f); }
}
