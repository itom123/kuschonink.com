// Field Guide (导览): the program around one guide. The state and the URL, the
// filters, the panes, the details sheet, the map (./map.ts), the menus and
// toolbar, keys, copying and Log Off. Page content in a window: it works on
// its own and asks the desktop (window.kus98) for menus, dialogs and opening.
// Every text a guide names comes from the payload or the server-rendered page.
import type { Bi, DayStatus, ISODate, Payload } from '../../lib/guides/types';
import { dayLabel, dayStatus, normalise, project, todayIn } from '../../lib/guides/core';
import { timeSpan, W } from '../../lib/guides/words';
import { copyText, h, message, setAttr, setText, tr } from './dom';
import { GuideMap, type MapPin } from './map';
import { DaysPane, PlacesPane, RoutesPane } from './panes';
import { Details } from './details';
import { Sheet } from './sheet';
import { menuProvider } from './menus';
import { Finder, type Entry } from './find';
import { field, score, words } from './match.ts';
import { distance, distanceText, follow, nearest, offMaps, permission, walkMinutes, type Fix, type LocateError } from './locate.ts';
import { centreIn } from './camera';
import {
  clearStorage, initialState, loadPrefs, loadSession, savePrefs, saveSession, Store, toQuery,
  type GdState, type Session, type View,
} from './state';

const WIDE = 960;
type How = 'pointer' | 'keyboard';
type Item = Payload['items'][number];
interface OpenOpts { reload?: boolean }
const kus = () => window.kus98 as unknown as (undefined | {
  open(url: string, o?: OpenOpts): Promise<void>;
  replaceUrl(el: Element, url: string): void;
  menus?(el: Element, p: (name: string) => unknown): void;
  play?(n: string): void;
});
const biData = (el: HTMLElement, k: string): Bi => ({ en: el.dataset[`${k}En`] ?? '', zh: el.dataset[`${k}Zh`] ?? '' });

export class GuideApp {
  readonly root: HTMLElement;
  readonly win: HTMLElement;
  readonly p: Payload;
  readonly store: Store;
  readonly slug: string;
  readonly ac = new AbortController();
  map: GuideMap | null = null;
  wide = false;
  today: ISODate;
  private readonly fields: HTMLElement[];
  private readonly sheet: Sheet;
  readonly details: Details;
  /** Public for View ▸ Sort By (menus.ts). */
  readonly places: PlacesPane;
  private readonly routes: RoutesPane;
  private readonly daysPane: DaysPane;
  private readonly items = new Map<string, Item>();
  private readonly names = new Map<string, string>();
  readonly labels: { items: Bi; listings: Bi; title: Bi };
  private session: Session;
  private hintTimer = 0;
  private urlTimer = 0;
  private camTimer = 0;
  private qTimer = 0;
  private returnFocus: HTMLElement | null = null;
  private counts = { open: 0, shut: 0, shown: 0 };
  private lastCount = '';
  // Find: everything it reaches, and the item/place/listing entries by id.
  private finder: Finder | null = null;
  private entries: Entry[] | null = null;
  private index = new Map<string, Entry>();
  // Where am I?: the last position (memory only) and how to stop following it.
  private fix: Fix | null = null;
  private stopFollow: (() => void) | null = null;
  private nearOpen = false;
  /** Each start gets a number, so a late answer from an old one is ignored. */
  private locRun = 0;
  /** Where the keyboard was when Where am I? was pressed. */
  private locBy: HTMLElement | null = null;
  /** The status bar's hint while waiting for the first position. */
  private locHint: Bi | null = null;
  /** Whether the last position was on the map being shown (to notice you walking off it). */
  private meAt: { area: string; on: boolean } | null = null;
  /** The nearest list as last drawn: its order and where you were. */
  private nearKey = '';
  private nearAt: Fix['coordinates'] | null = null;
  /** The insets last sent to map.setFree(), as "right bottom". */
  private freeKey = '';

  constructor(root: HTMLElement) {
    this.root = root;
    this.win = root.closest<HTMLElement>('[data-window]') ?? root;
    this.slug = root.dataset.slug ?? '';
    const raw = root.querySelector('script[data-gd-data]')?.textContent ?? '{}';
    this.p = JSON.parse(raw) as Payload;
    for (const i of this.p.items) { this.items.set(i.id, i); this.names.set(i.id, i.name); }
    for (const x of this.p.places) this.names.set(x.id, x.name);
    for (const l of this.p.listings) this.names.set(l.id, l.name);
    this.labels = { items: biData(root, 'items'), listings: biData(root, 'listings'), title: biData(root, 'title') };
    this.fields = [...this.win.querySelectorAll<HTMLElement>(':scope > [data-window-inner] > .status-bar > .status-bar-field')];
    if (this.fields[1]) { this.fields[1].setAttribute('role', 'status'); this.fields[1].setAttribute('aria-live', 'polite'); }
    this.today = todayIn(this.p.timezone);
    this.session = loadSession(this.slug);

    const url = this.win === root ? location.pathname + location.search : (this.win.dataset.url ?? '');
    let query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    if (!query && location.pathname.replace(/\.html$/, '') === `/guides/${this.slug}`) query = location.search;
    this.store = new Store(initialState(this.p, query, loadPrefs(), this.today));

    this.sheet = new Sheet(root, root.querySelector<HTMLElement>('[data-gd-details]')!);
    this.details = new Details(root);
    this.places = new PlacesPane(root);
    this.routes = new RoutesPane(root);
    this.daysPane = new DaysPane(root);
    this.wide = root.clientWidth >= WIDE;

    this.initMap();
    this.initFind();
    this.bind();
    this.syncControls();
    const s = this.store.get();
    if (s.place) this.store.set({ detail: 'half' });
    this.render(new Set(Object.keys(s) as (keyof GdState)[]), true);
    this.store.on((_st, changed) => this.render(changed, false));
    this.restoreScroll();
  }

  // ---- The map (A6a's engine) ----
  private initMap() {
    const el = this.root.querySelector<HTMLElement>('[data-gd-map]');
    if (!el) return;
    try {
      this.map = new GuideMap(el, this.p, {
        onSelect: (id, how) => this.select(id, how, 'map'),
        onCluster: (ids) => {
          // The members take the box the nearest list used: the next position mustn't redraw over them.
          this.nearOpen = false;
          this.details.showCluster(ids, (id) => this.names.get(id) ?? '');
          this.store.set({ place: null, detail: 'half' });
          this.openDetails('map');
        },
        // The camera is kept with its map view, so a restore can't pair it with another.
        onCamera: (c, area) => {
          clearTimeout(this.camTimer);
          this.camTimer = window.setTimeout(() => this.keepSession({ cam: c, area }), 400);
        },
        // Zooming switched the view by itself: the area, the URL and View ▸ Area follow (no flight).
        onArea: (id) => this.store.set({ area: id }),
      }, this.ac.signal);
      const s = this.store.get();
      if (s.area) this.map.setArea(s.area);
      if (!s.place && this.session.cam && (!this.session.area || this.session.area === s.area)) this.map.setCamera(this.session.cam);
    } catch (e) {
      console.error('Field Guide: the map could not start', e);
      this.map = null;
      // Without a map there is nothing to show you on.
      this.root.querySelectorAll<HTMLButtonElement>('[data-cmd="gd-locate"]').forEach((b) => { b.disabled = true; });
    }
  }

  // ---- Find: the drop-down under the box (./find.ts) ----
  private initFind() {
    const input = this.root.querySelector<HTMLInputElement>('[data-gd-q]');
    if (!input) return;
    this.finder = new Finder(input, this.root, {
      entries: () => this.findEntries(),
      status: (e) => (e.kind === 'item' && this.store.get().day !== 'any' ? this.status(e.id)?.short ?? null : null),
      pick: (e, how) => this.pickFound(e, how),
      showAll: () => this.showAllFound(),
      shownCount: () => this.shownCount(input.value),
    }, this.ac.signal);
  }

  /** Everything Find reaches, built once from the payload and the page (both languages). */
  private findEntries(): Entry[] {
    if (this.entries) return this.entries;
    const root = this.root;
    const row = (id: string) => root.querySelector<HTMLElement>(`tr[data-gd-row="${CSS.escape(id)}"]`);
    const sub = (id: string) => row(id)?.querySelector('.gd-row-sub') ?? null;
    // An article's own words, without its day-status box, buttons and photo credit.
    const body = (id: string) => {
      const a = this.details.article(id);
      if (!a) return '';
      const c = a.cloneNode(true) as HTMLElement;
      c.querySelectorAll('[data-gd-status], .gd-actions, .gd-photo').forEach((x) => x.remove());
      return c.textContent ?? '';
    };
    const out: Entry[] = [];
    for (const it of this.p.items) {
      const s = sub(it.id);
      out.push({ kind: 'item', id: it.id, tier: it.tier, name: it.name, sub: s, icon: `ico16 ico-pin-${it.tier.toLowerCase()}`,
        fields: [field(10, it.name, it.short), field(12, it.id), field(7, s?.textContent), field(3, row(it.id)?.dataset.q), field(1, body(it.id))] });
    }
    for (const x of this.p.places) {
      out.push({ kind: 'place', id: x.id, name: x.name, sub: x.label, plate: x.id,
        fields: [field(10, x.name, x.short), field(12, x.id), field(7, x.label), field(3, row(x.id)?.dataset.q), field(1, body(x.id))] });
    }
    for (const l of this.p.listings) {
      if (l.item) continue;
      const s = sub(l.id);
      out.push({ kind: 'listing', id: l.id, name: l.name, sub: s, icon: 'ico16 ico-pin-d',
        fields: [field(10, l.name), field(12, l.id), field(7, s?.textContent), field(3, row(l.id)?.dataset.q), field(1, body(l.id))] });
    }
    for (const r of this.p.routes) {
      const stops = r.stops.filter((id) => this.names.has(id));
      out.push({ kind: 'route', id: r.id, name: r.name, sub: W.stopsCount(stops.length), icon: 'ico20 ico-tb-route',
        fields: [field(10, r.name), field(4, ...stops.map((id) => this.names.get(id))), field(1, root.querySelector(`[data-gd-route="${CSS.escape(r.id)}"]`)?.textContent)] });
    }
    for (const e of this.p.events) {
      // An event over several days shows its first and last day.
      const first = dayLabel(e.date), last = e.until && e.until !== e.date ? dayLabel(e.until) : null;
      const when = last ? { en: `${first.en} – ${last.en}`, zh: `${first.zh}至${last.zh}` } : first;
      const time = timeSpan(e.start, e.end), at = e.place ? this.names.get(e.place) ?? '' : '';
      const line = (d: string) => [d, time, at].filter(Boolean).join(' - ');
      out.push({ kind: 'event', id: e.id, name: e.title, sub: { en: line(when.en), zh: line(when.zh) }, icon: 'ico20 ico-tb-days',
        fields: [field(10, e.title), field(5, when), field(4, at)] });
    }
    for (const t of this.p.themes) {
      const n = this.p.items.filter((i) => i.themes.includes(t.id)).length;
      out.push({ kind: 'theme', id: t.id, name: t.name, sub: W.topics(n, this.labels.items), icon: 'ico20 ico-tb-list', fields: [field(8, t.name)] });
    }
    this.entries = out;
    for (const e of out) if (e.kind === 'item' || e.kind === 'place' || e.kind === 'listing') this.index.set(e.id, e);
    return out;
  }

  /** How many rows the box keeps in the list: items, and the official entries when shown. */
  private shownCount(q: string) {
    const s = this.store.get();
    let n = this.p.items.filter((i) => this.matchItem(i.id, q)).length;
    if (s.listings) n += this.p.listings.filter((l) => this.matchListing(l.id, q)).length;
    return n;
  }

  /** The box's text into the state after a short typing pause. */
  private queueQ(t: HTMLInputElement) {
    clearTimeout(this.qTimer);
    this.qTimer = window.setTimeout(() => {
      this.store.set({ q: t.value.slice(0, 80) });
      // Wide map view: the list pane comes up, and the drop-down stays open over it.
      if (this.wide && this.view() === 'map' && t.value.trim()) {
        this.setView('places', 'pointer', true);
        this.finder?.reposition();
      }
    }, 150);
  }

  /** The box's text into the state now, not after the typing pause. */
  private flushQ() {
    const input = this.root.querySelector<HTMLInputElement>('[data-gd-q]');
    if (!input) return;
    clearTimeout(this.qTimer);
    const q = input.value.slice(0, 80);
    if (q !== this.store.get().q) this.store.set({ q });
  }

  private clearQ() {
    clearTimeout(this.qTimer);
    this.store.set({ q: '' });
    this.syncControls();
  }

  private pickFound(e: Entry, how: How) {
    switch (e.kind) {
      case 'item':
      case 'place':
      case 'listing':
        // A place keeps the box's words: the list and the map stay filtered by them.
        this.flushQ();
        if (e.kind === 'listing' && !this.store.get().listings) { this.store.set({ listings: true }); this.syncControls(); }
        if (!this.wide) this.setView('map');
        this.select(e.id, how, this.wide ? 'list' : 'map');
        return;
      case 'route':
        this.clearQ();
        this.setRoute(e.id, true);
        if (this.wide && this.view() !== 'routes') this.setView('routes', how);
        return;
      case 'event': {
        this.clearQ();
        const ev = this.p.events.find((x) => x.id === e.id);
        if (!ev) return;
        // A day the event is on: keep the chosen one (and today's roll-over), else
        // today if it falls inside the event, else its first day.
        const end = ev.until ?? ev.date, on = (d: string) => ev.date <= d && d <= end;
        const days = this.p.window?.days ?? [], cur = this.store.get().day;
        if (cur === 'any' || !on(cur)) {
          const d = on(this.today) && days.includes(this.today) ? this.today : ev.date;
          if (days.includes(d)) this.setDay(d);
        }
        if (ev.place && this.details.has(ev.place)) {
          if (!this.wide) this.setView('map');
          this.select(ev.place, how, this.wide ? 'list' : 'map');
        } else if (this.view() !== 'days') this.setView('days', how);
        return;
      }
      case 'theme':
        this.store.set({ theme: e.id, q: '' });
        this.syncControls();
        if (this.view() !== 'places') this.setView('places', how);
        return;
    }
  }

  private showAllFound() {
    this.flushQ();
    if (this.view() !== 'places') this.setView('places');
  }

  // ---- Where am I? (./locate.ts): only when asked, followed live, kept in memory, never sent ----
  /** The map's button is a toggle: the first press follows you, the next one stops. */
  toggleLocate(how: How = 'pointer') {
    if (this.locating) return this.stopLocating(true);
    this.whereAmI(how);
  }

  /** Start following you (View > Where Am I?); while following, show you and the nearest again. */
  whereAmI(how: How = 'pointer') {
    if (!this.map) return;
    if (this.locating) {
      if (this.fix) this.showMeAgain(how);
      return;
    }
    const run = ++this.locRun;
    this.locBy = document.activeElement as HTMLElement | null;
    if (how === 'keyboard') this.returnFocus = this.locBy;
    // Straight from the click (a user gesture), so the browser shows its own prompt.
    this.stopFollow = follow((f) => this.onFix(f, how), (err) => this.onLocError(err));
    this.syncLocate();
    this.waitHint(W.locating);
    // Blocked already: say how to allow it now. Asking: point at the browser's prompt.
    void permission().then((st) => {
      if (run !== this.locRun || this.fix || !this.stopFollow) return;
      if (st === 'denied') this.onLocError('denied');
      else if (st === 'prompt') this.waitHint(W.locPrompt);
    });
  }

  private onFix(f: Fix, how: How) {
    const first = !this.fix;
    this.fix = f;
    const view = this.map ? this.map.setMe(f) : null;
    const area = this.store.get().area;
    if (first) {
      this.locHint = null;
      if (!view) {
        const off = distanceText(offMaps(f.coordinates, this.p.map.views));
        this.stopLocating();
        void message({ title: W.whereAmI, text: W.outside(off), icon: 'info', owner: this.win });
        return;
      }
      this.meAt = { area: view, on: true };
      if (view !== area) this.store.set({ area: view });
      this.syncLocate();
      this.showNear(how, true);
      return;
    }
    // Later positions move the dot only; the camera stays where you put it.
    const on = view === area;
    const left = this.meAt?.area === area && this.meAt.on && !on;
    this.meAt = { area, on };
    if (left) {
      // You walked off the map on screen: show the one you are on, or say how far away it is.
      const v = this.p.map.views.find((x) => x.id === view);
      if (v) { this.store.set({ area: v.id }); this.meAt = { area: v.id, on: true }; this.flash(W.leftMap(v.name)); }
      else this.flash(W.outside(distanceText(offMaps(f.coordinates, this.p.map.views))));
    }
    if (this.nearOpen && !this.store.get().place) this.renderNear('fix');
  }

  private onLocError(err: LocateError) {
    const had = !!this.fix;
    if (err === 'denied' || !had) this.stopLocating();
    if (had && err !== 'denied') return;
    const text = err === 'denied' ? W.locDenied : err === 'unsupported' ? W.locUnsupported : W.locFailed;
    void message({ title: W.whereAmI, text, icon: err === 'denied' ? 'warning' : 'info', owner: this.win });
  }

  get locating() { return !!this.stopFollow; }

  /** Stop following you: the watch, the dot, the chip and the list all go. byUser: say so. */
  stopLocating(byUser = false) {
    const was = this.locating;
    this.locRun++;
    this.stopFollow?.();
    this.stopFollow = null;
    this.fix = null;
    this.locHint = null;
    this.meAt = null;
    this.nearKey = '';
    this.nearAt = null;
    this.map?.setMe(null);
    this.syncLocate();
    if (this.nearOpen) {
      this.nearOpen = false;
      if (!this.store.get().place) this.closeDetails();
    }
    // "Nearest first" needs a position: the Places list goes back to the default order.
    if (this.store.get().sort === 'near') this.store.set({ sort: 'tier' });
    if (byUser && was) this.flash(W.liveOff);
    else this.say();
  }

  /** Already following: back to you, with the nearest list, after checking which map holds you. */
  private showMeAgain(how: How) {
    const f = this.fix;
    if (!f) return;
    const view = this.map ? this.map.setMe(f) : null;
    if (!view) return this.flash(W.outside(distanceText(offMaps(f.coordinates, this.p.map.views))));
    if (view !== this.store.get().area) this.store.set({ area: view });
    this.meAt = { area: view, on: true };
    this.locBy = document.activeElement as HTMLElement | null;
    if (how === 'keyboard') this.returnFocus = this.locBy;
    this.showNear(how, true);
  }

  /** The chip's label: the map comes back to you, at your zoom or closer, above the sheet. */
  private recentre() {
    const f = this.fix, m = this.map;
    if (!f || !m) return;
    const view = m.setMe(f);
    if (!view) return this.flash(W.outside(distanceText(offMaps(f.coordinates, this.p.map.views))));
    if (view !== this.store.get().area) this.store.set({ area: view });
    this.meAt = { area: view, on: true };
    const vp = this.root.querySelector<HTMLElement>('[data-gd-map] .gd-viewport');
    if (!vp?.clientWidth) return;
    const p = project(f.coordinates, 14);
    m.setCamera(centreIn(p.x, p.y, Math.max(m.camera().s, 2), { w: vp.clientWidth, h: vp.clientHeight }, this.sheet.covers(this.wide)));
  }

  /** The button's pressed state, and the live chip on the map while there is a dot to follow. */
  private syncLocate() {
    const on = this.locating, live = on && !!this.fix;
    const btns = [...this.root.querySelectorAll<HTMLElement>('[data-cmd="gd-locate"]')];
    for (const b of btns) {
      b.setAttribute('aria-pressed', String(on));
      setAttr(b, 'title', on ? W.meButtonOn : W.meButton);
    }
    const map = this.root.querySelector<HTMLElement>('[data-gd-map]');
    if (!map) return;
    map.toggleAttribute('data-live', live);
    let chip = map.querySelector<HTMLElement>('[data-gd-live]');
    if (live && !chip) {
      chip = h('div', { class: 'gd-live', 'data-gd-live': true }, [
        h('button', { type: 'button', class: 'gd-live-me', 'data-gd-live-me': true, 'aria-label': W.liveCentre, title: W.liveCentre },
          [W.live, h('span', { class: 'gd-live-dot', 'aria-hidden': 'true' }, '●')]),
        h('button', { type: 'button', class: 'gd-live-stop', 'data-gd-me-stop': true, 'aria-label': W.stopLocating, title: W.stopLocating }, W.liveStop),
      ]);
      // Before the map's buttons, legend and credits, so they always paint over it.
      const ui = map.querySelector('.gd-mapui');
      if (ui) ui.before(chip);
      else map.append(chip);
    }
    if (!chip) return;
    // Stop pressed on the chip: the keyboard goes to the map's button, not to nowhere.
    if (!live && chip.contains(document.activeElement)) btns.find((b) => b.getClientRects().length)?.focus({ preventScroll: true });
    chip.hidden = !live;
  }

  /** A hint that stays in the status bar while waiting for the browser, and is read out once. */
  private waitHint(t: Bi) {
    this.locHint = t;
    clearTimeout(this.hintTimer);
    this.say();
    const live = document.getElementById('k98-announcer');
    if (live) { live.textContent = ''; setTimeout(() => (live.textContent = tr(t)), 60); }
  }

  /**
   * A phone's half sheet can leave too short a strip for the map's button
   * column (and the live chip above it): then the buttons go in a row
   * (guide-map.css, [data-short]). Called with every sendFree().
   */
  private shortMap(bottom: number) {
    const el = this.root.querySelector<HTMLElement>('[data-gd-map]');
    if (el) el.toggleAttribute('data-short', el.clientHeight > 0 && el.clientHeight - bottom < 210);
  }

  private showNear(how: How, fly: boolean) {
    const f = this.fix;
    if (!f) return;
    if (!this.wide && this.view() !== 'map') this.setView('map');
    const ids = this.renderNear();
    this.nearOpen = true;
    this.store.set({ place: null, detail: 'half' });
    this.openDetails('map');
    // Frame you and the nearest once the sheet is open, so it doesn't cover the dot.
    if (fly) requestAnimationFrame(() => {
      if (this.ac.signal.aborted) return;
      this.sendFree();
      this.map?.fitMe(ids.slice(0, 3));
    });
    const n = W.nearStatus(ids.length), a = W.accuracy(Math.round(f.accuracy));
    this.flash({ en: `${n.en} ${a.en}.`, zh: `${n.zh}${a.zh}。` });
    // The keyboard goes to the list only if it hasn't moved on while the browser looked for you.
    const at = document.activeElement;
    if (how === 'keyboard' && (!at || at === document.body || at === this.locBy)) this.details.focusList();
  }

  /**
   * The nearest few that the map shows and that are open on the chosen day,
   * closest first. 'fix' (a new position) redraws only when the order changes
   * or you have moved about 15 m; 'fix' and 'filter' keep the list's scroll and focus.
   */
  private renderNear(refresh: false | 'fix' | 'filter' = false): string[] {
    const f = this.fix;
    if (!f) return [];
    const s = this.store.get();
    const shown = [
      ...this.p.items.filter((i) => this.matchItem(i.id) && this.status(i.id)!.visitable),
      ...(s.listings ? this.p.listings.filter((l) => this.matchListing(l.id)) : []),
    ];
    const near = nearest(f.coordinates, shown.map((x) => ({ id: x.id, coordinates: x.coordinates })), 5);
    const key = near.map((x) => x.id).join(' ');
    if (refresh === 'fix' && key === this.nearKey && this.nearAt && distance(this.nearAt, f.coordinates) < 15) return near.map((x) => x.id);
    this.nearKey = key;
    this.nearAt = f.coordinates;
    const day = s.day === 'any' ? null : dayLabel(s.day);
    this.details.showNear({
      title: W.nearYou,
      note: W.nearNote(day),
      empty: W.nearNone(day, !!s.q.trim() || !!s.theme),
      stop: W.stopLocating,
      rows: near.map(({ id, m }) => {
        const it = this.items.get(id);
        const d = distanceText(m), w = W.walk(walkMinutes(m));
        const st = it && day ? this.status(id)!.short : null;
        return {
          id,
          name: this.names.get(id) ?? id,
          icon: it ? `ico-pin-${it.tier.toLowerCase()}` : 'ico-pin-d',
          line: { en: [d.en, w.en, st?.en].filter(Boolean).join(' - '), zh: [d.zh, w.zh, st ? st.zh || st.en : ''].filter(Boolean).join(' - ') },
        };
      }),
    }, refresh !== false);
    return near.map((x) => x.id);
  }

  // ---- Day status, matching ----
  status(id: string): DayStatus | null {
    const it = this.items.get(id);
    if (!it) return null;
    const d = this.store.get().day;
    return dayStatus(it, d === 'any' ? null : d, this.p.holidays);
  }

  /** The box's words against Find's index, so the list, the map and the drop-down agree. */
  private matchQ(id: string, q = this.store.get().q) {
    const ws = words(q.trim());
    if (!ws.length) return true;
    this.findEntries();
    const e = this.index.get(id);
    if (e) return score(e, ws) > 0;
    const text = this.places.query(id) || normalise(`${id} ${this.names.get(id) ?? ''}`);
    return ws.every((w) => text.includes(w));
  }

  private matchItem(id: string, q?: string) {
    const s = this.store.get();
    const it = this.items.get(id);
    if (!it) return true;
    if (s.theme && !it.themes.includes(s.theme)) return false;
    return this.matchQ(id, q);
  }

  private matchListing(id: string, q?: string) {
    const s = this.store.get();
    const l = this.p.listings.find((x) => x.id === id);
    if (!l || l.item) return false;
    if (s.theme) return false;
    if (s.day !== 'any' && ((l.start && s.day < l.start) || (l.end && s.day > l.end))) return false;
    return this.matchQ(id, q);
  }

  private routeStops(): string[] {
    const r = this.p.routes.find((x) => x.id === this.store.get().route);
    return r ? r.stops.filter((id) => this.names.has(id)) : [];
  }

  private coords(id: string) {
    return this.items.get(id)?.coordinates ?? this.p.places.find((x) => x.id === id)?.coordinates ?? this.p.listings.find((x) => x.id === id)?.coordinates;
  }

  // ---- Rendering ----
  view(): View {
    const v = this.store.get().view ?? (this.wide ? 'places' : 'map');
    return v === 'days' && !this.p.window ? 'places' : v;
  }

  private render(changed: Set<keyof GdState>, first: boolean) {
    const s = this.store.get();
    const filters = ['day', 'theme', 'q', 'listings', 'route', 'labels', 'place', 'sort'].some((k) => changed.has(k as keyof GdState));
    this.root.dataset.view = this.view();
    this.root.dataset.layout = this.wide ? 'wide' : 'compact';
    this.root.classList.toggle('has-route', !!s.route);
    if (filters || first) {
      const day = s.day === 'any' ? null : dayLabel(s.day);
      this.counts = this.places.render(s, (id, kind) => {
        if (kind === 'listing') return { match: this.matchListing(id), visitable: true, cell: null };
        if (kind === 'place') return { match: true, visitable: true, cell: null };
        const st = this.status(id)!;
        return { match: this.matchItem(id), visitable: st.visitable, cell: day ? st.short : null, code: st.code };
      }, day, (n) => (day ? { en: `Closed on ${day.en} (${n})`, zh: `${day.zh}不开放（${n}）` } : { en: '', zh: '' }), {
        // "Nearest first": straight lines from the last position, read when the list sorts.
        metres: (id) => { const c = this.coords(id); return this.fix && c ? distance(this.fix.coordinates, c) : null; },
        located: () => !!this.fix,
        pick: (sort) => this.store.set({ sort }),
      }) ?? this.counts;
      this.routes.render(s, (id) => (s.day === 'any' ? null : this.status(id)?.short ?? null));
      this.daysPane.render(s, this.today);
      this.details.fillStatus((id) => this.status(id));
      this.drawMap(changed, first);
      // The nearest list follows the day, the topic and the box.
      if (this.nearOpen && this.fix && !s.place) this.renderNear('filter');
    }
    // Asked for (Area button, menu, URL): a flight to that map. A switch made by zooming is already done, so setArea does nothing.
    if (changed.has('area') && !first) this.map?.setArea(s.area, { fly: true });
    if (changed.has('place') || first) {
      if (s.place) this.details.show(s.place);
      else if (!first && this.details.shown) this.details.show(null);
      this.map?.setSelected(s.place, { fly: !first || !!s.place });
    }
    if (changed.has('heat') || filters || first) this.drawHeat();
    if (changed.has('detail') || changed.has('view') || first) {
      this.sheet.set(s.detail);
      requestAnimationFrame(() => this.sendFree());
    }
    this.syncInert();
    this.pressTools();
    this.say();
    this.todayNote();
    if (['heat', 'labels', 'sort'].some((k) => changed.has(k as keyof GdState))) savePrefs(s);
    if (!first) this.writeUrl();
  }

  private drawMap(changed: Set<keyof GdState>, first: boolean) {
    if (!this.map) return;
    const s = this.store.get();
    const stops = this.routeStops();
    const step = new Map(stops.map((id, i) => [id, i + 1]));
    const pins: MapPin[] = [];
    for (const it of this.p.items) {
      const st = this.status(it.id)!;
      const sel = it.id === s.place, inRoute = step.has(it.id);
      const visible = (this.matchItem(it.id) && st.visitable) || sel || inRoute;
      pins.push({
        id: it.id, kind: 'item', tier: it.tier, coordinates: it.coordinates, short: it.short,
        aria: { en: `${it.id}, ${it.name}, ${st.short.en}`, zh: `${it.id}，${it.name}，${st.short.zh || st.short.en}` },
        visible, hollow: visible && !st.visitable, dim: !!s.route && !inRoute,
        label: s.labels ? it.label : sel, step: step.get(it.id),
      });
    }
    for (const x of this.p.places) {
      pins.push({
        id: x.id, kind: 'place', letter: x.id, coordinates: x.coordinates, short: x.short,
        aria: { en: `${x.id}, ${x.name}, ${x.label.en}`, zh: `${x.id}，${x.name}，${x.label.zh || x.label.en}` },
        visible: true, dim: !!s.route && !step.has(x.id), label: s.labels || x.id === s.place, step: step.get(x.id),
      });
    }
    if (s.listings) {
      for (const l of this.p.listings) {
        if (l.item) continue;
        pins.push({ id: l.id, kind: 'listing', coordinates: l.coordinates, short: l.name.slice(0, 14), aria: { en: `${l.id}, ${l.name}`, zh: `${l.id}，${l.name}` }, visible: this.matchListing(l.id) || l.id === s.place, dim: !!s.route, label: l.id === s.place });
      }
    }
    this.map.setPins(pins);
    if (changed.has('route') || first) {
      const r = this.p.routes.find((x) => x.id === s.route);
      const pts = stops.map((id) => this.coords(id)).filter((c) => !!c) as [number, number][];
      this.map.setRoute(r && pts.length > 1 ? { stops: pts, mode: r.mode } : null);
      if (r && pts.length > 1 && !first) this.map.fitTo(stops);
    }
    if (changed.has('q') && !first && s.q.trim()) {
      const hits = this.p.items.filter((i) => this.matchItem(i.id)).map((i) => i.id);
      if (hits.length && hits.length <= 12) this.map.fitTo(hits);
    }
  }

  private drawHeat() {
    if (!this.map) return;
    const s = this.store.get();
    if (!s.heat) return this.map.setHeat(null);
    // Weights are relative: the strongest tier counts 1 (A 3, B 2, C 1 → 1, ⅔, ⅓).
    const top = Math.max(1, ...this.p.tiers.map((t) => t.weight));
    const w = new Map(this.p.tiers.map((t) => [t.id, t.weight / top]));
    this.map.setHeat(this.p.items.filter((i) => this.status(i.id)!.heat && this.matchItem(i.id)).map((i) => ({ coordinates: i.coordinates, weight: w.get(i.tier) ?? 1 / top })));
  }

  /** Compact: what a pane or a full sheet hides can't take focus. The sheet never goes inert. */
  private syncInert() {
    const s = this.store.get();
    // A full sheet covers all; the landscape drawer stays narrow even at 'full'.
    const covered = !this.wide && s.detail === 'full' && this.sheet.el.offsetWidth >= this.root.clientWidth * 0.9;
    const mapwrap = this.root.querySelector<HTMLElement>('.gd-mapwrap');
    if (mapwrap) mapwrap.inert = covered || (!this.wide && this.view() !== 'map');
    for (const p of this.root.querySelectorAll<HTMLElement>('[data-gd-pane]')) p.inert = covered;
  }

  private pressTools() {
    const v = this.view();
    for (const a of this.win.querySelectorAll<HTMLElement>('.toolbar a.tool[href^="#gd-"]')) {
      a.setAttribute('role', 'button');
      a.setAttribute('aria-pressed', String(a.getAttribute('href') === `#gd-${v}`));
    }
  }

  /** Status bar: the hint (field 1) and the counts (field 2, the live region). */
  say(hint?: Bi) {
    const s = this.store.get();
    const f0 = this.fields[0], f1 = this.fields[1];
    if (f0) {
      let t: Bi = matchMedia('(pointer: coarse)').matches ? W.hintTouch : W.hint;
      const r = this.p.routes.find((x) => x.id === s.route);
      if (hint) t = hint;
      else if (this.locHint) t = this.locHint;
      else if (s.place) t = { en: `${s.place} - ${this.names.get(s.place) ?? ''}`, zh: `${s.place} - ${this.names.get(s.place) ?? ''}` };
      else if (r) t = { en: `${r.name.en} - ${this.routeStops().length} stops`, zh: `${r.name.zh || r.name.en} - ${this.routeStops().length} 站` };
      setText(f0, t);
    }
    if (f1) {
      const total = this.p.items.filter((i) => this.matchItem(i.id)).length;
      let t: Bi = s.day === 'any' ? W.countAll(total, this.labels.items) : W.openOf(this.counts.open, total, this.labels.items, dayLabel(s.day));
      if (s.q.trim()) t = W.matches(this.counts.shown, s.q.trim());
      if (s.listings) {
        const n = this.p.listings.filter((l) => this.matchListing(l.id)).length;
        const plus = W.plusListings(n, this.labels.listings);
        t = { en: t.en + plus.en, zh: t.zh + plus.zh };
      }
      // Only new text goes into the live region, so the counts aren't re-read.
      const key = t.en + '\u0000' + t.zh;
      if (key !== this.lastCount) { this.lastCount = key; setText(f1, t); }
    }
  }

  private flash(t: Bi) {
    this.say(t);
    // The hint field isn't live: tell screen readers through the shell's announcer.
    const live = document.getElementById('k98-announcer');
    if (live) { live.textContent = ''; setTimeout(() => (live.textContent = tr(t)), 60); }
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.say(), 3000);
  }

  /** The note under the toolbar: before, during or after the guide's days. */
  private todayNote() {
    const el = this.root.querySelector<HTMLElement>('[data-gd-today]');
    const w = this.p.window;
    if (!el) return;
    if (!w) { el.hidden = true; return; }
    const t = this.today;
    const start = dayLabel(w.start), end = dayLabel(w.end);
    const line = (e: Payload['events'][number]) => ({ en: `${dayLabel(e.date).en}${e.start ? ' ' + e.start : ''} - ${e.title.en}`, zh: `${dayLabel(e.date).zh}${e.start ? ' ' + e.start : ''} - ${e.title.zh || e.title.en}` });
    const evs = [...this.p.events].sort((a, b) => (a.date + (a.start ?? '')).localeCompare(b.date + (b.start ?? '')));
    let text: Bi;
    if (t < w.start) {
      const next = evs.find((e) => (e.until ?? e.date) >= t);
      const intro = W.before(start, end, biData(this.root, 'tz'));
      text = next ? { en: `${intro.en} ${W.next.en} ${line(next).en}`, zh: `${intro.zh}${W.next.zh}${line(next).zh}` } : intro;
    } else if (t > w.end) {
      text = W.after(start, end);
    } else {
      const now = evs.filter((e) => e.date <= t && t <= (e.until ?? e.date));
      const list = now.map((e) => ({ en: `${e.start ? e.start + ' ' : ''}${e.title.en}`, zh: `${e.start ? e.start + ' ' : ''}${e.title.zh || e.title.en}` }));
      text = list.length
        ? { en: `${W.todayIs.en} ${list.map((x) => x.en).join('; ')}`, zh: `${W.todayIs.zh}${list.map((x) => x.zh).join('；')}` }
        : W.nothingToday;
    }
    setText(el, text);
    el.hidden = false;
  }

  // ---- Actions ----
  select(id: string | null, how: How = 'pointer', from: 'map' | 'list' | 'url' = 'list') {
    if (id && !this.details.has(id)) return;
    if (!id) return this.closeDetails();
    if (how === 'keyboard') this.returnFocus = document.activeElement as HTMLElement | null;
    this.nearOpen = false;
    this.store.set({ place: id, detail: this.wide ? 'half' : from === 'map' ? 'half' : 'full' });
    this.details.show(id, how === 'keyboard');
    this.places.reveal(id);
  }

  private openDetails(from: 'map' | 'list') {
    this.store.set({ detail: this.wide ? 'half' : from === 'map' ? 'half' : 'full' });
  }

  closeDetails() {
    const inSheet = this.sheet.el.contains(document.activeElement);
    this.nearOpen = false;
    this.store.set({ place: null, detail: 'closed' });
    this.details.show(null);
    const back = this.returnFocus;
    this.returnFocus = null;
    // Back where the keyboard came from. If that has gone or hides in the closed
    // sheet (a row of the nearest list), the map's Where am I? button, else the map.
    const can = (el: HTMLElement | null | undefined): el is HTMLElement => !!el?.isConnected && el.getClientRects().length > 0 && !el.closest('[inert]');
    if (can(back)) back.focus({ preventScroll: true });
    else if (inSheet) {
      const to = [this.root.querySelector<HTMLElement>('[data-cmd="gd-locate"]'), this.root.querySelector<HTMLElement>('[data-gd-map] .gd-viewport')].find(can);
      to?.focus({ preventScroll: true });
    }
  }

  setView(v: View, how: How = 'pointer', keepFind = false) {
    if (!keepFind) this.finder?.close();
    const cur = this.view();
    // Wide: pressing the open pane's button again closes the bar (as in IE).
    const next: View = this.wide && v === cur && v !== 'map' ? 'map' : v;
    this.saveScroll();
    // Compact: a pane hides the sheet (the row opens it again, full); the map shows it at half.
    const place = this.store.get().place;
    const detail = this.wide ? {} : { detail: next === 'map' && place ? 'half' as const : 'closed' as const };
    this.store.set({ view: next === (this.wide ? 'places' : 'map') ? null : next, ...detail });
    this.restoreScroll();
    if (how === 'keyboard') this.root.querySelector<HTMLElement>(next === 'map' ? '#gd-map' : `#gd-${next}`)?.focus({ preventScroll: true });
  }

  setDay(day: 'any' | ISODate) {
    this.store.set({ day, dayAuto: false });
    this.syncControls();
  }

  stepDay(n: number) {
    const days = this.p.window?.days ?? [];
    if (!days.length) return;
    const s = this.store.get();
    const i = s.day === 'any' ? (n > 0 ? -1 : days.length) : days.indexOf(s.day);
    const j = Math.max(0, Math.min(days.length - 1, i + n));
    this.setDay(days[j]);
  }

  setRoute(id: string | null, show = false) {
    this.store.set({ route: id });
    if (show && !this.wide) this.setView('map');
  }

  syncControls() {
    const s = this.store.get();
    const day = this.root.querySelector<HTMLSelectElement>('[data-gd-day]');
    if (day) {
      day.value = s.day;
      for (const o of day.options) {
        // The plain label is kept in data-base-*; data-text-* carries the Today mark,
        // so the language switch (which runs on every page load) keeps it.
        o.dataset.baseEn ??= o.dataset.textEn ?? o.text;
        o.dataset.baseZh ??= o.dataset.textZh ?? o.text;
        const base = { en: o.dataset.baseEn ?? '', zh: o.dataset.baseZh ?? '' };
        const t = o.value === this.today ? { en: `${base.en} (${W.today.en})`, zh: `${base.zh}（${W.today.zh}）` } : base;
        o.dataset.textEn = t.en;
        o.dataset.textZh = t.zh;
        o.text = tr(t);
      }
    }
    const theme = this.root.querySelector<HTMLSelectElement>('[data-gd-theme-select]');
    if (theme) theme.value = s.theme;
    const q = this.root.querySelector<HTMLInputElement>('[data-gd-q]');
    if (q && q.value !== s.q) q.value = s.q;
    const l = this.root.querySelector<HTMLInputElement>('[data-gd-listings]');
    if (l) l.checked = s.listings;
  }

  pageUrl() { return `/guides/${this.slug}${toQuery(this.store.get(), this.p)}`; }

  private writeUrl() {
    clearTimeout(this.urlTimer);
    this.urlTimer = window.setTimeout(() => {
      const k = kus();
      const u = this.pageUrl();
      if (k) k.replaceUrl(this.win, u);
      else try { history.replaceState(history.state, '', u); } catch { /* ignore */ }
    }, 300);
  }

  async copyAddress(id = this.store.get().place) {
    if (!id) return;
    this.flash((await copyText(this.details.address(id) || this.names.get(id) || id)) ? W.copied : W.copyFailed);
  }

  async copyLink() {
    this.flash((await copyText(location.origin + this.pageUrl())) ? W.linkCopied : W.copyFailed);
  }

  /** Open the selected place's (or the route's) n-th action link: 0 Google Maps, 1 Directions. */
  openLink(n: number, route = false) {
    const s = this.store.get();
    const place = route ? null : s.place;
    const box = place ? this.details.article(place) : s.route ? this.root.querySelector(`[data-gd-route="${s.route}"]`) : null;
    const a = box?.querySelectorAll<HTMLAnchorElement>('.gd-actions a.button-link')[place ? n : 0];
    if (a) window.open(a.href, '_blank', 'noopener');
  }

  help() {
    const k = kus();
    if (k) this.saveScroll();
    if (k) void k.open('/help#guides');
    else location.href = '/help#guides';
  }

  home() {
    const k = kus();
    if (k) this.saveScroll();
    if (k) void k.open('/guides');
    else location.href = '/guides';
  }

  refresh() {
    const k = kus();
    // The window swaps before destroy() runs, so save the pane scroll while the panes are still here.
    if (k) this.saveScroll();
    if (k) void k.open(this.win.dataset.url ?? this.pageUrl(), { reload: true });
    else location.reload();
  }

  async logOff() {
    const ans = await message({ title: W.logOffTitle, text: W.logOffAsk, icon: 'question', buttons: ['Yes', 'No'], owner: this.win });
    if (ans !== 'Yes') return;
    try {
      const res = await fetch(`/guides/${this.slug}/logout`, { method: 'POST', headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      void message({ title: W.logOffTitle, text: W.logOffFailed, icon: 'error', owner: this.win });
      return;
    }
    clearStorage();
    const k = kus();
    if (k) void k.open(this.win.dataset.url ?? `/guides/${this.slug}`, { reload: true });
    else location.href = `/guides/${this.slug}`;
  }

  about() {
    void message({ title: W.program, text: W.about(this.labels.title), icon: 'info', owner: this.win });
  }

  toggleBar(part: 'toolbar' | 'status') {
    if (this.win === this.root) return;
    const set = new Set((this.win.dataset.hide ?? '').split(' ').filter(Boolean));
    if (set.has(part)) set.delete(part);
    else set.add(part);
    this.win.dataset.hide = [...set].join(' ');
  }

  focusFind() {
    if (this.wide && this.view() === 'map') this.setView('places');
    this.root.querySelector<HTMLInputElement>('[data-gd-q]')?.focus();
  }

  /** Tell the map how much of it the sheet covers; with onlyChange, skip it when nothing moved. */
  private sendFree(onlyChange = false) {
    const free = this.sheet.covers(this.wide);
    const key = `${free.right ?? 0} ${free.bottom ?? 0}`;
    this.shortMap(free.bottom ?? 0);
    if (!this.map || (onlyChange && key === this.freeKey)) return;
    this.freeKey = key;
    this.map.setFree(free);
  }

  // ---- Session (camera, area, pane scroll) ----
  private keepSession(patch: Partial<Session>) {
    this.session = { ...this.session, ...patch, guide: this.slug };
    saveSession(this.session);
  }
  private saveScroll() {
    const scroll: Record<string, number> = { ...(this.session.scroll ?? {}) };
    // A hidden pane reads 0: keep what was saved for it before.
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-gd-pane] .gd-pane-body'))
      if (b.getClientRects().length) scroll[b.closest<HTMLElement>('[data-gd-pane]')!.dataset.gdPane!] = b.scrollTop;
    this.keepSession({ scroll, area: this.store.get().area });
  }
  private restoreScroll() {
    const sc = this.session.scroll ?? {};
    requestAnimationFrame(() => {
      for (const b of this.root.querySelectorAll<HTMLElement>('[data-gd-pane] .gd-pane-body')) {
        const v = sc[b.closest<HTMLElement>('[data-gd-pane]')!.dataset.gdPane!];
        if (v) b.scrollTop = v;
      }
    });
  }

  // ---- Binding ----
  private isActive() {
    if (this.win === this.root) return true;
    if (!this.win.isConnected || this.win.dataset.state === 'min' || !this.win.hasAttribute('data-active')) return false;
    return !this.win.querySelector(':scope > [data-window-inner]')?.hasAttribute('inert');
  }

  private bind() {
    const signal = this.ac.signal;
    const root = this.root;

    // Toolbar: the view links and Print (the window holds the toolbar).
    this.win.addEventListener('click', (e) => {
      const t = e.target as Element;
      const a = t.closest<HTMLAnchorElement>('.toolbar a.tool[href^="#gd-"]');
      if (a && this.win.contains(a)) {
        e.preventDefault();
        this.setView(a.getAttribute('href')!.slice(4) as View, e.detail === 0 ? 'keyboard' : 'pointer');
        return;
      }
      if (t.closest('[data-cmd="gd-print"]')) {
        e.preventDefault();
        window.print();
      }
    }, { signal });
    // The view links act as toggle buttons, so Space presses them too.
    this.win.addEventListener('keydown', (e) => {
      if (e.key !== ' ' || e.defaultPrevented || e.altKey) return;
      const a = (e.target as Element).closest<HTMLAnchorElement>('.toolbar a.tool[href^="#gd-"]');
      if (!a || !this.win.contains(a)) return;
      e.preventDefault();
      // Held down, Space presses once, as on a native button.
      if (e.repeat) return;
      this.setView(a.getAttribute('href')!.slice(4) as View, 'keyboard');
    }, { signal });

    // Clicks inside the program.
    root.addEventListener('click', (e) => {
      const t = e.target as Element;
      const how: How = e.detail === 0 ? 'keyboard' : 'pointer';
      const sel = t.closest<HTMLElement>('[data-gd-sel]');
      if (sel) {
        e.preventDefault();
        const inList = !!sel.closest('[data-gd-pane]');
        this.select(sel.dataset.gdSel!, how, inList ? 'list' : 'map');
        return;
      }
      const row = t.closest<HTMLTableRowElement>('tr[data-gd-row]');
      if (row && !t.closest('a, button, summary')) return this.select(row.dataset.gdRow!, how, 'list');
      const theme = t.closest<HTMLElement>('[data-gd-theme]');
      if (theme) {
        e.preventDefault();
        this.store.set({ theme: theme.dataset.gdTheme! });
        this.syncControls();
        if (!this.wide) this.setView('places');
        return;
      }
      if (t.closest('[data-cmd="gd-locate"]')) return this.toggleLocate(how);
      if (t.closest('[data-gd-me-stop]')) return this.stopLocating(true);
      if (t.closest('[data-gd-live-me]')) return this.recentre();
      // The map's own Heat and Area buttons (the same as on the View menu).
      if (t.closest('[data-cmd="gd-heat"]')) return this.store.set({ heat: !this.store.get().heat });
      const ar = t.closest<HTMLElement>('[data-cmd="gd-area"]');
      if (ar) { const home = this.p.map.views[0].id; return this.store.set({ area: this.store.get().area === home ? ar.dataset.view! : home }); }
      if (t.closest('[data-gd-copy]')) return void this.copyAddress(t.closest<HTMLElement>('[data-gd-article]')?.dataset.gdArticle);
      if (t.closest('[data-gd-details-close]')) return this.closeDetails();
      if (t.closest('[data-gd-sheet-size]')) return this.store.set({ detail: this.store.get().detail === 'full' ? 'half' : 'full' });
      if (t.closest('[data-gd-sheet-map]')) {
        const id = this.store.get().place;
        this.setView('map');
        this.store.set({ detail: id ? 'half' : 'closed' });
        if (id) this.map?.setSelected(id, { fly: true });
        return;
      }
      if (t.closest('[data-gd-close-pane]')) return this.setView('map', how);
      const day = t.closest<HTMLElement>('[data-gd-show-day]');
      if (day) {
        this.setDay(day.dataset.gdShowDay!);
        if (!this.wide) this.setView('map');
        return;
      }
      const show = t.closest<HTMLElement>('[data-gd-route-show]');
      if (show) {
        this.setRoute(show.dataset.gdRouteShow!, true);
        const stops = this.routeStops();
        if (stops.length) this.map?.fitTo(stops);
        return;
      }
      if (t.closest('[data-gd-clear-find]')) {
        this.store.set({ q: '', theme: '' });
        this.syncControls();
      }
    }, { signal });

    root.addEventListener('change', (e) => {
      const t = e.target as HTMLElement;
      if (t.matches('[data-gd-day]')) this.setDay((t as HTMLSelectElement).value);
      else if (t.matches('[data-gd-theme-select]')) this.store.set({ theme: (t as HTMLSelectElement).value });
      else if (t.matches('[data-gd-listings]')) this.store.set({ listings: (t as HTMLInputElement).checked });
      else if (t.matches('[data-gd-route-radio]')) this.setRoute((t as HTMLInputElement).value || null);
    }, { signal });
    root.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (!t.matches('[data-gd-q]')) return;
      clearTimeout(this.qTimer);
      // Pinyin still being composed is not yet the words: wait for compositionend.
      if ((e as InputEvent).isComposing) return;
      this.queueQ(t);
    }, { signal });
    root.addEventListener('compositionend', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.matches?.('[data-gd-q]')) this.queueQ(t);
    }, { signal });
    root.querySelector('[data-gd-filters]')?.addEventListener('submit', (e) => e.preventDefault(), { signal });

    // The table: ↑/↓ move the selection, Enter on a row selects it.
    root.querySelector('[data-gd-table]')?.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k !== 'ArrowDown' && k !== 'ArrowUp') return;
      const rows = [...root.querySelectorAll<HTMLTableRowElement>('tr[data-gd-row]')].filter((r) => !r.hidden && !r.closest('tbody[hidden]'));
      if (!rows.length) return;
      e.preventDefault();
      const cur = rows.findIndex((r) => r.dataset.gdRow === this.store.get().place);
      const next = rows[Math.max(0, Math.min(rows.length - 1, cur + (k === 'ArrowDown' ? 1 : -1)))];
      const id = next.dataset.gdRow!;
      // Compact: move the selection only; Enter opens the sheet over the list.
      if (this.wide) this.select(id, 'pointer', 'list');
      else if (this.details.has(id)) { this.store.set({ place: id }); this.places.reveal(id); }
      next.querySelector<HTMLElement>('[data-gd-sel]')?.focus();
    }, { signal });

    // No "Save Picture" or "Set as Wallpaper" on the photos and pins.
    root.addEventListener('contextmenu', (e) => {
      if ((e.target as Element).closest('.gd-photo img, .gd-pin, [data-gd-map] a')) e.preventDefault();
    }, { signal });

    // No-JS log-off form, when JS is there: ask first, then the same as the menu.
    root.querySelector('[data-gd-logoff]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.logOff();
    }, { signal });

    document.addEventListener('keydown', this.onKey, { signal });
    document.addEventListener('langchange', () => { this.lastCount = ''; this.syncControls(); this.say(); this.todayNote(); }, { signal });

    // Layout follows the program's own size.
    const ro = new ResizeObserver(() => {
      const wide = root.clientWidth >= WIDE;
      // The sheet's size and the drawer follow every resize (a phone turning, say),
      // but only a change: setFree() flies back to the selected place.
      requestAnimationFrame(() => {
        if (signal.aborted) return;
        this.sendFree(true);
        this.syncInert();
      });
      if (wide === this.wide) return;
      this.wide = wide;
      this.root.dataset.layout = wide ? 'wide' : 'compact';
      const s = this.store.get();
      this.render(new Set(['view', 'detail']), false);
      if (!wide && s.detail !== 'closed') this.store.set({ detail: 'half' });
      this.map?.resize();
    });
    ro.observe(root);
    signal.addEventListener('abort', () => ro.disconnect());

    // A day picked for the visitor rolls over at midnight in the guide's time zone.
    const tick = window.setInterval(() => {
      const t = todayIn(this.p.timezone);
      if (t === this.today) return;
      this.today = t;
      const s = this.store.get();
      // Move the Today mark even when the day was picked by hand.
      this.daysPane.render(s, t);
      this.details.fillStatus((id) => this.status(id));
      const days = this.p.window?.days ?? [];
      if (s.dayAuto) this.store.set({ day: days.includes(t) ? t : 'any' });
      this.syncControls();
      this.todayNote();
    }, 60_000);
    signal.addEventListener('abort', () => clearInterval(tick));

    // The window swapped to another page (Refresh, Log Off, Open Guide...): stop.
    this.win.addEventListener('desktop:content', () => { if (!this.root.isConnected) this.destroy(); }, { signal });

    // Only the query changed (a link inside the same guide): read it again.
    this.win.addEventListener('desktop:content', (e) => {
      if (signal.aborted) return;
      if (!(e as CustomEvent).detail?.same) return;
      const u = this.win.dataset.url ?? '';
      const st = initialState(this.p, u.includes('?') ? u.slice(u.indexOf('?')) : '', loadPrefs(), this.today);
      this.store.set({ place: st.place, day: st.day, dayAuto: st.dayAuto, theme: st.theme, q: st.q, listings: st.listings, area: st.area, route: st.route, view: st.view, detail: st.place ? (this.wide ? 'half' : 'full') : 'closed' });
      this.syncControls();
    }, { signal });

    window.addEventListener('pagehide', () => this.saveScroll(), { signal });
    // On the signal too: the window outlives a swapped page, and must not keep this instance alive.
    this.win.addEventListener('desktop:close', () => this.destroy(), { once: true, signal });
    // Once torn down, this instance no longer answers for the window's menus.
    const menus = menuProvider(this);
    kus()?.menus?.(this.win, (n) => (this.ac.signal.aborted ? null : menus(n)));
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.root.isConnected) return this.destroy();
    if (!this.isActive() || e.defaultPrevented) return;
    const t = e.target as Element;
    if (t.closest?.('.menu')) return;
    const typing = !!t.closest?.('input, textarea, select, [contenteditable="true"]');
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'F1') {
      e.preventDefault();
      e.stopPropagation();
      this.help();
    } else if (ctrl && !e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      this.focusFind();
    } else if (e.key === 'Escape') {
      const q = t.closest?.('[data-gd-q]') as HTMLInputElement | null;
      // Esc while an IME composes cancels the candidate only, not the whole box.
      if (q && (e.isComposing || e.keyCode === 229)) return;
      if (q && q.value) {
        e.preventDefault();
        q.value = '';
        this.store.set({ q: '' });
      } else if (this.store.get().detail !== 'closed') {
        e.preventDefault();
        this.closeDetails();
      }
    } else if (!typing && !ctrl && !e.altKey && (e.key === 'PageDown' || e.key === 'PageUp') && this.p.window && t.closest?.('.gd-filters')) {
      e.preventDefault();
      this.stepDay(e.key === 'PageDown' ? 1 : -1);
    }
  };

  destroy() {
    if (this.ac.signal.aborted) return;
    // A detached root reads every scroll as 0; keep the saved positions.
    if (this.root.isConnected) this.saveScroll();
    clearTimeout(this.urlTimer);
    clearTimeout(this.camTimer);
    clearTimeout(this.hintTimer);
    this.stopFollow?.();
    this.stopFollow = null;
    this.map?.destroy();
    this.ac.abort();
  }
}
