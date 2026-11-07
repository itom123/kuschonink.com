// Field Guide (导览): the map engine. Plain DOM, no d3; the gestures copy the
// House's map (src/scripts/map.ts). It takes over the server-rendered map in
// GuideMap.astro: the base image and the pin links stay, their %-positions
// give way to transforms. World units are z14 global pixels (core.ts project()).
//
// Layers inside .gd-stage: base images (one per map view, coarser ones first,
// the extra ones loaded when first wanted, under a white wash) → street-level
// tiles (tiles.ts, over the finest view once past its 1:1) → heat canvas →
// route SVG → pins (role=group, one roving tab stop) → labels (aria-hidden).
// The views zoom as one map with levels of detail (camera.ts zoomAcross):
// zooming switches between them on the fly, and while a view shows beyond its
// own map (an overhang) the coarser one is drawn round it.
import type { Bi, LonLat, MapView, Payload, RouteMode, TierId } from '../../lib/guides/types';
import { metresPerPixel, project } from '../../lib/guides/core.ts';
import * as K from './camera.ts';
import { cluster, compareIds, densityRadius, dressCluster, dressPin, makeCluster, makePin, priority, sameSpot, type Cluster } from './pins.ts';
import { LABEL_GAP, makeMeasure, placeLabels, type Box, type Side } from './labels.ts';
import { drawRoute, makeRouteSvg } from './route.ts';
import { cellSize, heatPixels, readRamp, type RGB } from './heat.ts';
import { TileLayer } from './tiles.ts';

export interface MapPin { id: string; kind: 'item' | 'place' | 'listing'; tier?: TierId; letter?: string; coordinates: LonLat; short: string; aria: Bi; visible: boolean; dim?: boolean; hollow?: boolean; label?: boolean; step?: number }
export interface MapHooks {
  onSelect(id: string, how: 'pointer' | 'keyboard'): void;
  onCluster?(ids: string[]): void;
  /** The camera settled, in map view `area`. */
  onCamera?(c: { cx: number; cy: number; s: number }, area: string): void;
  /** Zooming switched the map view by itself (no flight): the program's area follows. */
  onArea?(id: string): void;
}

type Cam = K.Cam;
interface PinRec { p: MapPin; el: HTMLAnchorElement; x: number; y: number; shown: boolean }
interface LabelRec { el: HTMLElement; key: string; dx: number; dy: number }

/** Map views are drawn up to 3 screen px per image pixel. */
const MAX_ZOOM = 3;
/** With street-level tiles the finest view goes on to 16 screen px per z14 px: z18 tiles at 1:1, z19 on a 2× screen. */
const TILE_ZOOM = 16;
/** Tiles show once that view's own picture is magnified past 1:1 (tiles.ts picks the tile zoom from there). */
const TILES_FROM = 1;
/** "Whole map" comes no closer than this. */
const HOME_CAP = 1.6;
/** Heat cells: 2×2 CSS px. */
const CELL = 2;
/** The heat canvas reaches a quarter of the view beyond each side (House's OVER). */
const OVER = 0.25;
const LABEL_H = 17;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = () => matchMedia('(pointer: coarse)').matches;
const factor = (v: MapView) => Math.pow(2, 14 - v.z);
const boundsOf = (v: MapView): K.Rect => { const f = factor(v); return { x: v.originX * f, y: v.originY * f, w: v.width * f, h: v.height * f }; };

interface SettingsLike { on(f: (s: unknown, changed: Record<string, unknown>) => void): (() => void) | unknown }
const desktopSettings = () => (window as unknown as { kus98?: { settings?: SettingsLike } }).kus98?.settings;

export class GuideMap {
  private root: HTMLElement;
  private viewport: HTMLElement;
  private stage: HTMLElement;
  private pinsEl: HTMLElement;
  private labelsEl: HTMLElement;
  private routeSvg: SVGSVGElement;
  private heatCanvas: HTMLCanvasElement;
  private heatCtx: CanvasRenderingContext2D | null;
  private hooks: MapHooks;
  private payload: Payload;
  private off = new AbortController();

  private views: MapView[];
  /** The views as the camera sees them (same order). */
  private levels: K.Level[];
  private area: MapView;
  /** While the view shows beyond its own map: where the camera may go, and the coarser view drawn round it. */
  private soft: K.Soft | null = null;
  /** The view shown before the last switch: it stays up until the new view's picture has come. */
  private prev: string | null = null;
  private bases = new Map<string, HTMLElement>();
  /** Street-level tiles over the finest view, when the guide has them (payload.tiles). */
  private tiles: TileLayer | null = null;
  private tileView: MapView | null = null;
  private c: Cam = { cx: 0, cy: 0, s: 1 };
  private placed = false;
  /** A selection asked for before the map had a size: resize() places the camera on it. */
  private pendingFly = false;
  /** Where the current flight ends. */
  private target: Cam | null = null;
  private free: K.Insets = {};

  private pins = new Map<string, PinRec>();
  private order: PinRec[] = [];
  private selected: string | null = null;
  private clusters: { c: Cluster; el: HTMLButtonElement }[] = [];
  private clusterPool: HTMLButtonElement[] = [];
  private inCluster = new Set<string>();
  private clusteredAt = { s: 0, t: 0 };
  private labels = new Map<string, LabelRec>();
  private measure = makeMeasure();

  private route: { pts: { x: number; y: number }[]; mode: RouteMode } | null = null;
  private heat: { x: number; y: number; w: number }[] | null = null;
  private heatDrawn: { c: Cam; w: number; h: number } | null = null;
  private heatAt = 0;
  private colours: RGB[] | null = null;
  private heatR: number;
  /** Ground metres per world unit (a zoom-14 pixel), for the density cap. */
  private mpp14 = 1;
  /** Where am I?: in world units, with the accuracy as a radius. */
  private me: { x: number; y: number; r: number } | null = null;
  private meEl: HTMLElement | null = null;

  private frame = 0;
  private anim = 0;
  private flying = false;
  private wheeling = false;
  private wheelTimer = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private moved = 0;
  private pinch = { d: 0, x: 0, y: 0 };
  private lastTap = { t: 0, x: 0, y: 0 };
  private lastPointer = 'mouse';
  private ro: ResizeObserver;
  private unsub: (() => void) | null = null;

  constructor(root: HTMLElement, payload: Payload, hooks: MapHooks, signal: AbortSignal) {
    this.root = root;
    this.payload = payload;
    this.hooks = hooks;
    this.viewport = root.querySelector<HTMLElement>('.gd-viewport')!;
    this.stage = root.querySelector<HTMLElement>('.gd-stage')!;
    this.pinsEl = root.querySelector<HTMLElement>('.gd-pins')!;
    this.views = payload.map.views;
    // Tiles go over the finest view (the city plan), which may then come closer than its own picture.
    this.tileView = payload.tiles && this.views.length ? this.views.reduce((a, v) => (v.z > a.z ? v : a)) : null;
    this.levels = this.views.map((v) => ({ id: v.id, z: v.z, b: boundsOf(v), max: this.maxFor(v) }));
    this.area = this.views[0];
    const lat = payload.centre[1];
    this.heatR = payload.heatRadius / metresPerPixel(lat, 14);
    this.mpp14 = metresPerPixel(lat, 14);

    root.querySelectorAll<HTMLElement>('.gd-base[data-view]').forEach((b) => this.bases.set(b.dataset.view!, b));
    for (const v of this.views) if (this.bases.has(v.id)) this.dressBase(this.bases.get(v.id)!, v);
    for (const b of this.bases.values()) this.watch(b.querySelector('img'));

    // Layers the server doesn't render.
    this.heatCanvas = document.createElement('canvas');
    this.heatCanvas.className = 'gd-heat';
    this.heatCanvas.setAttribute('aria-hidden', 'true');
    this.heatCanvas.hidden = true;
    this.heatCtx = this.heatCanvas.getContext('2d');
    this.routeSvg = makeRouteSvg();
    this.labelsEl = document.createElement('div');
    this.labelsEl.className = 'gd-labels';
    this.labelsEl.setAttribute('aria-hidden', 'true');
    this.pinsEl.before(this.heatCanvas, this.routeSvg);
    this.pinsEl.after(this.labelsEl);
    if (payload.tiles && this.tileView) {
      this.tiles = new TileLayer(payload.tiles);
      this.heatCanvas.before(this.tiles.el); // above every base picture, below the heat
    }
    if (!this.heatCtx) root.querySelectorAll<HTMLButtonElement>('[data-cmd="gd-heat"]').forEach((b) => { b.disabled = true; });

    // The server's pins, then the payload's items and places as the first pin list.
    this.pinsEl.querySelectorAll<HTMLAnchorElement>('a.gd-pin[data-id]').forEach((el) => {
      this.pins.set(el.dataset.id!, { el, p: null as unknown as MapPin, x: 0, y: 0, shown: false });
    });
    this.setPins([
      ...payload.places.map((p): MapPin => ({ id: p.id, kind: 'place', letter: p.id, coordinates: p.coordinates, short: p.short, visible: true, label: true, aria: { en: `${p.id}, ${p.label.en}: ${p.name}`, zh: `${p.id}，${p.label.zh || p.label.en}：${p.name}` } })),
      ...payload.items.map((it): MapPin => ({ id: it.id, kind: 'item', tier: it.tier, coordinates: it.coordinates, short: it.short, visible: true, label: it.label, aria: { en: `${it.id}, ${it.name}`, zh: `${it.id}，${it.name}` } })),
    ]);

    this.wire();
    this.viewport.dataset.ready = '1';
    root.dataset.ready = '1';
    this.syncButtons();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.viewport);
    const s = desktopSettings();
    if (s) {
      const u = s.on((_s, changed) => { if (changed && 'scheme' in changed) { this.colours = null; this.heatDrawn = null; this.render(true); } });
      if (typeof u === 'function') this.unsub = u as () => void;
    }
    signal.addEventListener('abort', () => this.destroy(), { once: true });
    if (signal.aborted) this.destroy();
    this.resize();
  }

  // ---------------------------------------------------------------- public

  setPins(list: MapPin[]) {
    const seen = new Set<string>();
    for (const p of list) {
      seen.add(p.id);
      let r = this.pins.get(p.id);
      if (!r) {
        const el = makePin(p);
        this.pinsEl.append(el);
        r = { el, p, x: 0, y: 0, shown: false };
        this.pins.set(p.id, r);
      }
      r.p = p;
      const w = project(p.coordinates);
      r.x = w.x; r.y = w.y;
      dressPin(r.el, p);
      r.el.classList.toggle('is-dim', !!p.dim);
      r.el.classList.toggle('is-hollow', !!p.hollow);
      if (p.step != null) r.el.dataset.step = String(p.step);
      else delete r.el.dataset.step;
    }
    for (const [id, r] of this.pins) {
      // Pins left out are hidden but kept, so a later list can bring them back.
      if (!seen.has(id)) { r.el.hidden = true; r.shown = false; r.el.classList.remove('in-cluster'); }
    }
    this.order = [...this.pins.values()].filter((r) => r.p && seen.has(r.p.id)).sort((a, b) => compareIds(a.p, b.p));
    this.refreshShown();
    this.layout();
  }

  setSelected(id: string | null, o: { fly?: boolean } = {}) {
    if (this.selected && this.pins.get(this.selected)) {
      const old = this.pins.get(this.selected)!.el;
      old.classList.remove('is-selected');
      old.removeAttribute('aria-current');
    }
    this.selected = id && this.pins.has(id) ? id : null;
    const r = this.selected ? this.pins.get(this.selected)! : null;
    if (r) {
      r.el.classList.add('is-selected');
      r.el.setAttribute('aria-current', 'true');
    }
    this.refreshShown();
    this.layout();
    if (!r) return;
    if (o.fly) {
      const vp = this.vp();
      // Not laid out yet: resize() centres on this pin instead of the whole map.
      if (!vp.w || !vp.h || !this.placed) {
        this.pendingFly = true;
        if (vp.w && vp.h) this.resize();
        return;
      }
      const l = this.limits();
      const s = Math.min(l.max, Math.max(this.c.s, 1.2 / factor(this.area)));
      this.flyTo(K.centreIn(r.x, r.y, s, vp, this.free), 450, true);
    } else this.keepInView(r);
  }

  setRoute(route: { stops: LonLat[]; mode: RouteMode } | null) {
    this.route = route && route.stops.length > 1 ? { pts: route.stops.map((ll) => project(ll)), mode: route.mode } : null;
    this.render();
  }

  setHeat(points: { coordinates: LonLat; weight: number }[] | null) {
    this.heat = points && this.heatCtx ? points.map((p) => { const w = project(p.coordinates); return { x: w.x, y: w.y, w: p.weight }; }) : null;
    this.heatCanvas.hidden = !this.heat;
    this.root.toggleAttribute('data-heat', !!this.heat);
    this.heatDrawn = null;
    this.syncButtons();
    if (this.heat) this.drawHeat();
  }

  /** Show map view `viewId` when asked (the Area button and menu): with `fly`, a flight to its whole map. */
  setArea(viewId: string, o: { fly?: boolean } = {}) {
    const v = this.views.find((x) => x.id === viewId);
    // A switch the map made itself while zooming has already happened: no flight.
    if (!v || v === this.area) return;
    this.soft = null;
    this.switchTo(v);
    if (o.fly) this.home();
    else {
      this.c = this.clamp(this.c);
      this.settle();
    }
  }

  setFree(insets: { right?: number; bottom?: number }) {
    this.free = { right: Math.max(0, insets.right ?? 0), bottom: Math.max(0, insets.bottom ?? 0) };
    // The map buttons, legend and credits move out from under the sheet too (guide-map.css).
    this.root.style.setProperty('--gd-free-right', `${this.free.right}px`);
    this.root.style.setProperty('--gd-free-bottom', `${this.free.bottom}px`);
    const r = this.selected ? this.pins.get(this.selected) : null;
    if (r && this.flying && this.target) this.flyTo(K.centreIn(r.x, r.y, this.target.s, this.vp(), this.free), 300);
    else if (r) this.keepInView(r);
    else this.layout();
  }

  zoomBy(f: number) {
    this.interrupt();
    const vp = this.vp(), fr = K.freeRect(vp, this.free);
    this.zoomTo(this.zoomStep(f, fr.x + fr.w / 2, fr.y + fr.h / 2), 250);
  }

  home() {
    this.flyTo(this.homeCam(), 450, true);
  }

  fitTo(ids: string[]) {
    const pts = ids.map((id) => this.pins.get(id)).filter((r): r is PinRec => !!r);
    const box = K.bbox(pts);
    if (!box) return;
    const l = this.limits();
    this.flyTo(K.fit(box, this.vp(), this.free, 48, this.bounds(), l, l.max), 450, true);
  }

  /**
   * A cluster: zoom in until its pins come apart, on into a finer view that
   * holds them all when this one can't come close enough; the list when no
   * view can.
   */
  private fitCluster(ids: string[]) {
    const recs = ids.map((id) => this.pins.get(id)).filter((r): r is PinRec => !!r);
    const box = K.bbox(recs);
    if (!box) return;
    // Shows at one place stay together even at the closest zoom of the finest
    // map: list them at once instead of zooming (pins.ts sameSpot).
    const deepest = Math.max(...this.levels.map((v) => v.max));
    if (recs.length > 1 && sameSpot(recs, deepest, this.radius(this.vp(), deepest))) return this.hooks.onCluster?.(ids);
    const vp = this.vp(), l = this.limits();
    const here = K.fit(box, vp, this.free, 48, this.bounds(), l, l.max);
    const d = here.s >= l.max * 0.98 ? K.deeper(this.levels, this.area.id, box) : null;
    if (d) {
      const dl = K.limitsFor(d.b, vp, d.max);
      return this.zoomTo({ id: d.id, cam: K.fit(box, vp, this.free, 48, d.b, dl, dl.max), soft: null, load: [] }, 450);
    }
    if (this.c.s >= l.max * 0.98) this.hooks.onCluster?.(ids);
    else this.flyTo(here, 450, true);
  }

  camera() {
    return { ...this.c };
  }

  setCamera(c: { cx: number; cy: number; s: number }) {
    cancelAnimationFrame(this.anim);
    this.flying = false;
    // A camera kept from an overhang comes back with the coarser map round it.
    this.soft = Number.isFinite(c.s) && c.s > 0 && Number.isFinite(c.cx) && Number.isFinite(c.cy) ? K.softFor(this.levels, this.area.id, c, this.vp()) : null;
    if (this.soft) this.base(this.soft.under);
    this.showBases();
    this.c = this.clamp(c);
    this.placed = true;
    this.settle();
  }

  resize() {
    const vp = this.vp();
    if (!vp.w || !vp.h) return;
    // A selection asked for before the map had a size wins over the whole-map view.
    const r = this.pendingFly && this.selected ? this.pins.get(this.selected) : null;
    this.pendingFly = false;
    if (r) {
      this.placed = true;
      this.soft = null;
      const l = this.limits();
      this.c = this.clamp(K.centreIn(r.x, r.y, Math.min(l.max, 1.2 / factor(this.area)), vp, this.free));
    } else if (!this.placed) {
      this.placed = true;
      this.soft = null;
      this.c = this.homeCam();
    } else {
      // An overhang is worked out again for the new size, so the camera stays where it is.
      if (this.soft) this.soft = K.softFor(this.levels, this.area.id, this.c, vp);
      this.c = this.clamp(this.c);
    }
    this.showBases();
    this.heatDrawn = null;
    this.settle();
  }

  /**
   * Where am I?: the red dot and its accuracy ring (null takes them away).
   * Returns the id of a map view that holds the position (the one showing
   * first), or null when it is off every map.
   */
  setMe(fix: { coordinates: LonLat; accuracy: number } | null): string | null {
    if (!fix) {
      this.me = null;
      this.meEl?.remove();
      this.meEl = null;
      return null;
    }
    const p = project(fix.coordinates, 14);
    this.me = { x: p.x, y: p.y, r: fix.accuracy / metresPerPixel(fix.coordinates[1], 14) };
    if (!this.meEl) {
      const el = document.createElement('div');
      el.className = 'gd-me';
      el.setAttribute('aria-hidden', 'true');
      const ring = document.createElement('div');
      ring.className = 'gd-me-ring';
      const dot = document.createElement('span');
      dot.className = 'ico ico16 ico-pin-me';
      el.append(ring, dot);
      this.pinsEl.before(el);
      this.meEl = el;
    }
    this.render();
    const holds = (v: MapView) => { const b = boundsOf(v); return p.x >= b.x && p.y >= b.y && p.x <= b.x + b.w && p.y <= b.y + b.h; };
    return holds(this.area) ? this.area.id : (this.views.find(holds)?.id ?? null);
  }

  /** Bring the red dot and these pins into view together. */
  fitMe(ids: string[]) {
    if (!this.me) return;
    const pts = [{ x: this.me.x, y: this.me.y }, ...ids.map((id) => this.pins.get(id)).filter((r): r is PinRec => !!r && r.shown)];
    const box = K.bbox(pts);
    if (!box) return;
    const l = this.limits();
    this.flyTo(K.fit(box, this.vp(), this.free, 48, this.bounds(), l, Math.min(l.max, 2 / factor(this.area))), 450, true);
  }

  destroy() {
    if (this.off.signal.aborted) return;
    this.off.abort();
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.anim);
    clearTimeout(this.wheelTimer);
    this.ro?.disconnect();
    this.unsub?.();
    this.tiles?.destroy();
  }

  // ---------------------------------------------------------------- camera

  private vp(): K.Vp {
    return { w: this.viewport.clientWidth, h: this.viewport.clientHeight };
  }
  private bounds() {
    return boundsOf(this.area);
  }
  private limits() {
    return K.limitsFor(this.bounds(), this.vp(), this.maxFor(this.area));
  }
  /** How close a view may come: 3 screen px per picture pixel, or TILE_ZOOM where street-level tiles take over. */
  private maxFor(v: MapView) {
    return v === this.tileView ? TILE_ZOOM : MAX_ZOOM / factor(v);
  }
  /** Keep the camera on the view's map, or within its overhang while it has one. */
  private clamp(c: Cam) {
    const o = this.soft;
    return o ? K.clamp(c, o.box, this.vp(), { min: o.min, max: this.limits().max }) : K.clamp(c, this.bounds(), this.vp(), this.limits());
  }
  private homeCam(): Cam {
    const b = this.bounds();
    const inside = (p: { x: number; y: number }) => p.x >= b.x && p.y >= b.y && p.x <= b.x + b.w && p.y <= b.y + b.h;
    let centre = project(this.payload.centre);
    if (!inside(centre)) centre = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const pts = this.order.filter((r) => r.shown);
    return K.home(centre, pts, this.vp(), this.free, 32, b, this.limits(), HOME_CAP / factor(this.area));
  }

  // ---------------------------------------------------------------- zooming across views

  /** One zoom step by f about viewport point (px, py), from the current camera, across the views. */
  private zoomStep(f: number, px: number, py: number) {
    return K.zoomAcross(this.levels, this.area.id, this.c, f, px, py, this.vp(), this.soft);
  }

  /**
   * Go to a zoom step's camera, at once or in a flight of `ms`. When it crosses
   * into another view, the map switches there and then (no flight home) and
   * tells the program, after the switch so its setArea finds nothing to do.
   */
  private zoomTo(z: K.Across, ms?: number) {
    for (const id of z.load) this.base(id);
    const v = this.views.find((x) => x.id === z.id) ?? this.area;
    const switched = v !== this.area;
    if (switched) this.switchTo(v);
    if (ms == null) {
      this.c = z.cam;
      this.soft = z.soft;
      this.showBases();
    } else {
      // A flight keeps the overhang its first frames need; settle() narrows it when it lands.
      this.soft = z.soft ?? K.softFor(this.levels, v.id, this.c, this.vp());
      this.showBases();
      this.flyTo(z.cam, ms, !z.soft);
    }
    if (!switched) return;
    this.layout();
    this.hooks.onArea?.(v.id);
  }

  /** Make view v the one shown: pins, the red dot and the Area button follow; the camera stays. */
  private switchTo(v: MapView) {
    this.prev = this.area.id;
    this.area = v;
    this.base(v.id);
    this.root.dataset.area = v.id;
    this.heatDrawn = null;
    this.showBases();
    this.syncButtons();
    this.refreshShown();
  }

  /** A gesture takes over from a flight: the camera stays where the flight had got to. */
  private interrupt() {
    if (!this.flying) return;
    cancelAnimationFrame(this.anim);
    this.flying = false;
    const soft = K.softFor(this.levels, this.area.id, this.c, this.vp());
    if (soft || this.soft) {
      this.soft = soft;
      this.showBases();
    }
  }

  /** A view's base picture, made (and its image asked for) when first wanted; coarser views go beneath finer ones. */
  private base(id: string) {
    let b = this.bases.get(id);
    const v = this.views.find((x) => x.id === id);
    if (b || !v) return b ?? null;
    b = document.createElement('div');
    b.className = 'gd-base';
    b.dataset.view = v.id;
    b.hidden = true;
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.width = v.width;
    img.height = v.height;
    img.src = v.src;
    // Only now: an <img> without a src counts as complete, and would never be watched.
    this.watch(img);
    b.append(img);
    const all = [...this.stage.querySelectorAll<HTMLElement>(':scope > .gd-base[data-view]')];
    const finer = all.find((x) => (this.views.find((w) => w.id === x.dataset.view)?.z ?? 0) > v.z);
    if (finer) finer.before(b);
    else if (all.length) all[all.length - 1].after(b);
    else this.stage.prepend(b);
    this.bases.set(v.id, b);
    this.dressBase(b, v);
    // showBases() decides when it shows (and places it then).
    b.hidden = true;
    return b;
  }

  /** Show the pictures again once one has come (or failed). */
  private watch(img: HTMLImageElement | null) {
    if (!img || img.complete) return;
    const done = () => { this.showBases(); this.render(); };
    img.addEventListener('load', done, { once: true, signal: this.off.signal });
    img.addEventListener('error', done, { once: true, signal: this.off.signal });
  }

  /** Which base pictures show: the view's own; the coarser one round an overhang; the old one until the new picture has come. */
  private showBases() {
    const ready = (id: string) => { const img = this.bases.get(id)?.querySelector('img'); return !img || img.complete; };
    const keep = !ready(this.area.id) ? this.prev : null;
    let shown = false;
    for (const [id, b] of this.bases) {
      const on = id === this.area.id || id === keep || (id === this.soft?.under && ready(id));
      if (b.hidden === !on) continue;
      b.hidden = !on;
      if (on) shown = true;
    }
    // Placed at once, so a picture never shows a frame at an old place.
    if (shown) this.placeBases();
  }

  /** Base pictures: one transform each, for those showing. */
  private placeBases() {
    const vp = this.vp();
    if (!vp.w || !vp.h) return;
    this.views.forEach((v, i) => {
      const el = this.bases.get(v.id);
      if (!el || el.hidden) return;
      const b = this.levels[i].b;
      const p = K.toScreen(this.c, vp, b.x, b.y);
      el.style.transform = `translate3d(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px, 0) scale(${(this.c.s * factor(v)).toFixed(5)})`;
    });
  }

  /**
   * Street-level tiles over the finest view once its picture is magnified past
   * 1:1, placed with the same maths as the pictures; while a gesture or flight
   * is going no new tile zoom starts (tiles.ts). The picture's white wash gives
   * way to the layer's own ([data-tiled] in guide-map.css).
   */
  private placeTiles(vp: K.Vp) {
    const t = this.tiles, v = this.tileView;
    if (!t || !v) return;
    const on = this.area === v && this.c.s * factor(v) > TILES_FROM && t.update(this.c, vp, boundsOf(v), window.devicePixelRatio || 1, !this.live());
    if (!on) t.hide();
    this.root.toggleAttribute('data-tiles', on);
    // Only this view's own picture gives up its wash: a coarser map round an overhang keeps its own.
    this.bases.get(v.id)?.toggleAttribute('data-tiled', on);
  }

  private live() {
    return this.pointers.size > 0 || this.flying || this.wheeling;
  }

  /**
   * House's eased flight (zoom geometric); instant under reduced motion. With
   * `own`, the target is kept on the view's own map, not in an overhang the
   * flight starts from (which only its first frames need).
   */
  private flyTo(target: Cam, ms = 450, own = false) {
    cancelAnimationFrame(this.anim);
    const from = { ...this.c };
    const to = own ? K.clamp(target, this.bounds(), this.vp(), this.limits()) : this.clamp(target);
    this.target = to;
    this.placed = true;
    if (ms === 0 || reduced() || (Math.abs(from.cx - to.cx) < 0.01 && Math.abs(from.cy - to.cy) < 0.01 && Math.abs(from.s - to.s) < 1e-4)) {
      this.flying = false;
      this.c = to;
      this.settle();
      return;
    }
    this.flying = true;
    const t0 = performance.now();
    const step = (t: number) => {
      if (this.off.signal.aborted) return;
      const k = Math.min(1, (t - t0) / ms);
      this.c = K.between(from, to, K.ease(k));
      if (k < 1) {
        this.anim = requestAnimationFrame(step);
        this.paint();
      } else {
        this.flying = false;
        this.c = to;
        this.settle();
      }
    };
    this.anim = requestAnimationFrame(step);
  }

  /** Pan just enough to bring a pin into the free part of the view. */
  private keepInView(r: PinRec) {
    const vp = this.vp();
    if (!vp.w) return this.layout();
    const fr = K.freeRect(vp, this.free);
    const p = K.toScreen(this.c, vp, r.x, r.y);
    const m = 32;
    if (p.x >= fr.x + m && p.x <= fr.x + fr.w - m && p.y >= fr.y + m && p.y <= fr.y + fr.h - m) return this.layout();
    this.flyTo(K.centreIn(r.x, r.y, this.c.s, vp, this.free), 300);
  }

  // ---------------------------------------------------------------- drawing

  /** Paint on the next frame (many moves in one frame make one picture). */
  private render(full = false) {
    if (full) {
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => { this.frame = 0; this.settle(); });
      return;
    }
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); });
  }

  /** Re-cluster, re-place labels, redraw heat, then paint. */
  private settle() {
    if (this.off.signal.aborted) return;
    // An overhang narrows to what the camera still shows, and goes once the view's own map covers it.
    const soft = K.relax(this.soft, this.levels, this.area.id, this.c, this.vp());
    const gone = !!this.soft && !soft;
    this.soft = soft;
    if (gone) this.showBases();
    this.layout(false);
    this.drawHeat();
    this.paint();
    this.hooks.onCamera?.(this.camera(), this.area.id);
  }

  /** Clusters and labels for the current camera. */
  private layout(paint = true) {
    const vp = this.vp();
    if (!vp.w || !vp.h) return;
    this.doCluster(vp);
    this.doLabels(vp);
    this.tabStop();
    if (paint) this.paint();
  }

  private paint() {
    if (this.off.signal.aborted) return;
    const vp = this.vp();
    if (!vp.w || !vp.h) return;
    const c = this.c;
    // Base maps: one transform per picture showing.
    this.placeBases();
    this.placeTiles(vp);
    // Pins, clusters and labels keep their size: only their place changes.
    for (const r of this.order) {
      if (!r.shown) continue;
      const p = K.toScreen(c, vp, r.x, r.y);
      r.el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
      const l = this.labels.get(r.p.id);
      if (l) l.el.style.transform = `translate3d(${Math.round(p.x + l.dx)}px, ${Math.round(p.y + l.dy)}px, 0)`;
    }
    for (const { c: cl, el } of this.clusters) {
      const lead = this.pins.get(cl.lead)!;
      const p = K.toScreen(c, vp, lead.x, lead.y);
      el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
    }
    // You: the dot keeps its size; the ring shows how sure the browser is.
    if (this.me && this.meEl) {
      const b = this.bounds();
      const on = this.me.x >= b.x && this.me.y >= b.y && this.me.x <= b.x + b.w && this.me.y <= b.y + b.h;
      this.meEl.hidden = !on;
      if (on) {
        const p = K.toScreen(c, vp, this.me.x, this.me.y);
        this.meEl.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
        const ring = this.meEl.firstElementChild as HTMLElement;
        const d = Math.min(4000, 2 * this.me.r * c.s);
        ring.hidden = d < 20;
        ring.style.width = ring.style.height = `${Math.round(d)}px`;
      }
    }
    if (this.route) drawRoute(this.routeSvg, this.route.pts.map((w) => K.toScreen(c, vp, w.x, w.y)), this.route.mode);
    else drawRoute(this.routeSvg, null);
    // Heat: slide the drawn picture during gestures, draw afresh when it no longer covers.
    if (this.heat) {
      const d = this.heatDrawn;
      if (!d || d.w !== vp.w || d.h !== vp.h) this.drawHeat();
      else if (this.heatCovers(d, vp)) this.shiftHeat(d);
      else if (performance.now() - this.heatAt > 120) this.drawHeat();
      else { this.shiftHeat(d); this.render(); }
    }
    // While pinching, re-cluster when the scale has moved on.
    if (this.live() && Math.abs(Math.log(c.s / (this.clusteredAt.s || c.s))) > 0.08 && performance.now() - this.clusteredAt.t > 100) {
      this.doCluster(vp);
      this.doLabels(vp);
      this.paintMarks(vp);
    }
  }

  /** Pins and labels only (after a mid-gesture re-cluster). */
  private paintMarks(vp: K.Vp) {
    for (const r of this.order) {
      if (!r.shown) continue;
      const p = K.toScreen(this.c, vp, r.x, r.y);
      const l = this.labels.get(r.p.id);
      if (l) l.el.style.transform = `translate3d(${Math.round(p.x + l.dx)}px, ${Math.round(p.y + l.dy)}px, 0)`;
    }
    for (const { c: cl, el } of this.clusters) {
      const lead = this.pins.get(cl.lead)!;
      const p = K.toScreen(this.c, vp, lead.x, lead.y);
      el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
    }
  }

  // ---------------------------------------------------------------- pins

  /** Which pins show: visible in the data and on the current map. */
  private refreshShown() {
    const b = this.bounds();
    for (const r of this.order) {
      const on = r.p.visible && r.x >= b.x && r.y >= b.y && r.x <= b.x + b.w && r.y <= b.y + b.h;
      r.shown = on;
      if (r.el.hidden === on) r.el.hidden = !on;
    }
  }

  private isLone(r: PinRec) {
    return r.p.id === this.selected || r.p.kind === 'place' || r.p.step != null;
  }

  /** How close pins may be before they cluster, at a scale (pins.ts densityRadius: wider zoomed out, and on phones). */
  private radius(vp: K.Vp, s = this.c.s) {
    return densityRadius(14 + Math.log2(s), this.mpp14 / s, coarse() || vp.w < 600);
  }

  private doCluster(vp: K.Vp) {
    const r = this.radius(vp);
    // Pins a little beyond the edge take part too, so panning doesn't reshuffle them.
    const m = Math.max(40, r);
    const pts = this.order.filter((q) => q.shown).map((q) => {
      const p = K.toScreen(this.c, vp, q.x, q.y);
      return { id: q.p.id, x: p.x, y: p.y, pr: priority(q.p, q.p.id === this.selected, q.p.step != null), lone: this.isLone(q) };
    }).filter((p) => p.x > -m && p.y > -m && p.x < vp.w + m && p.y < vp.h + m);
    const groups = cluster(pts, r);
    this.clusteredAt = { s: this.c.s, t: performance.now() };
    const next = new Set<string>();
    groups.forEach((g) => g.ids.forEach((id) => next.add(id)));
    for (const r of this.order) r.el.classList.toggle('in-cluster', next.has(r.p.id));
    this.inCluster = next;
    // Reuse cluster buttons.
    while (this.clusters.length > groups.length) {
      const x = this.clusters.pop()!;
      x.el.hidden = true;
      this.clusterPool.push(x.el);
    }
    groups.forEach((g, i) => {
      let el = this.clusters[i]?.el;
      if (!el) {
        el = this.clusterPool.pop() ?? makeCluster();
        if (!el.isConnected) this.pinsEl.append(el);
        el.hidden = false;
        this.clusters[i] = { c: g, el };
      }
      this.clusters[i].c = g;
      const members = g.ids.map((id) => this.pins.get(id)!.p);
      const key = g.ids.join(' ');
      if (el.dataset.ids !== key) dressCluster(el, members[0], members);
      el.dataset.tier = members[0].tier ?? '';
      el.dataset.kind = members[0].kind;
    });
  }

  private doLabels(vp: K.Vp) {
    const vr = this.viewport.getBoundingClientRect();
    const obstacles: Box[] = [];
    const shown = this.order.filter((r) => r.shown && !this.inCluster.has(r.p.id));
    const screen = new Map<string, { x: number; y: number }>();
    for (const r of shown) {
      const p = K.toScreen(this.c, vp, r.x, r.y);
      screen.set(r.p.id, p);
      obstacles.push({ x: p.x - 9, y: p.y - 9, w: 18, h: 18 });
    }
    for (const { c: cl } of this.clusters) obstacles.push({ x: cl.x - 12, y: cl.y - 12, w: 24, h: 24 });
    // Map buttons, the legend and the attribution, wherever the stylesheet put them.
    this.root.querySelectorAll<HTMLElement>('.gd-mapui > *, .gd-legend, .gd-attrib').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width && b.height) obstacles.push({ x: b.left - vr.left - 2, y: b.top - vr.top - 2, w: b.width + 4, h: b.height + 4 });
    });
    const fr = K.freeRect(vp, this.free);
    // Zoomed out by the world's scale, not the picture's, so labels don't change when zooming switches views.
    const idOnly = this.c.s < 0.7;
    const want = shown.filter((r) => r.p.label || r.p.id === this.selected || r.p.step != null);
    const text = new Map<string, { id: string; rest: string; w: number }>();
    const items = want.map((r) => {
      // Zoomed out, labels shrink to the id; places keep their name (their plate already shows the letter).
      const rest = idOnly && r.p.id !== this.selected && r.p.kind !== 'place' ? '' : r.p.short;
      // A place's plate already shows its letter, so its label is just the name.
      const id = r.p.kind === 'place' ? '' : r.p.id;
      const w = Math.ceil((id ? this.measure(id, true) : 0) + (rest ? this.measure(id ? ` ${rest}` : rest) : 0)) + 8;
      text.set(r.p.id, { id, rest, w });
      const p = screen.get(r.p.id)!;
      return { id: r.p.id, x: p.x, y: p.y, w, h: LABEL_H, pr: priority(r.p, r.p.id === this.selected, r.p.step != null) };
    });
    const sides = placeLabels(items, obstacles, { x: fr.x, y: fr.y, w: fr.w, h: fr.h });
    for (const [id, l] of this.labels) {
      if (!sides.has(id)) { l.el.remove(); this.labels.delete(id); }
    }
    for (const [id, side] of sides) {
      const t = text.get(id)!;
      let l = this.labels.get(id);
      if (!l) {
        const el = document.createElement('span');
        el.className = 'gd-label';
        this.labelsEl.append(el);
        l = { el, key: '', dx: 0, dy: 0 };
        this.labels.set(id, l);
      }
      const key = `${t.id}|${t.rest}`;
      if (l.key !== key) {
        l.key = key;
        const b = document.createElement('b');
        b.textContent = t.id;
        l.el.replaceChildren(...(t.id ? [b] : []), ...(t.rest ? [document.createTextNode(t.id ? ` ${t.rest}` : t.rest)] : []));
      }
      l.el.dataset.side = side as Side;
      l.el.classList.toggle('is-selected', id === this.selected);
      l.dx = side === 'e' ? LABEL_GAP : -LABEL_GAP - t.w;
      l.dy = -LABEL_H / 2;
      l.el.style.width = `${t.w}px`;
    }
  }

  /** One tab stop for the whole group: the focused pin, else the selected one, else the first. */
  private tabStop() {
    const shown = this.order.filter((r) => r.shown);
    const focused = shown.find((r) => r.el === document.activeElement);
    const stop = focused ?? shown.find((r) => r.p.id === this.selected) ?? shown.find((r) => !this.inCluster.has(r.p.id)) ?? shown[0];
    for (const r of this.order) r.el.tabIndex = r === stop ? 0 : -1;
  }

  private dressBase(b: HTMLElement, v: MapView) {
    const img = b.querySelector('img');
    if (img) { img.style.width = `${v.width}px`; img.style.height = `${v.height}px`; }
    b.style.width = `${v.width}px`;
    b.style.height = `${v.height}px`;
    b.hidden = v !== this.area;
  }

  private syncButtons() {
    this.root.querySelectorAll<HTMLButtonElement>('[data-cmd="gd-heat"]').forEach((b) => b.setAttribute('aria-pressed', String(!!this.heat)));
    this.root.querySelectorAll<HTMLButtonElement>('[data-cmd="gd-area"]').forEach((b) => b.setAttribute('aria-pressed', String(this.area !== this.views[0])));
  }

  // ---------------------------------------------------------------- heat

  /** The heat ramp (--gd-heat-1 …, light to dark), read again when the scheme changes. */
  private readColours() {
    this.colours = readRamp(getComputedStyle(this.root));
    return this.colours;
  }

  private drawHeat() {
    const ctx = this.heatCtx;
    const vp = this.vp();
    if (!this.heat || !ctx || !vp.w || !vp.h) return;
    const ramp = this.colours ?? this.readColours();
    // Coarser cells close up, so the ramp's steps can be told apart.
    const cell = cellSize(this.c.s, CELL);
    const ox = Math.round(vp.w * OVER), oy = Math.round(vp.h * OVER);
    const cols = Math.ceil((vp.w + 2 * ox) / cell), rows = Math.ceil((vp.h + 2 * oy) / cell);
    const cv = this.heatCanvas;
    if (cv.width !== cols || cv.height !== rows) { cv.width = cols; cv.height = rows; }
    cv.style.width = `${cols * cell}px`;
    cv.style.height = `${rows * cell}px`;
    cv.style.left = `${(vp.w - cols * cell) / 2}px`;
    cv.style.top = `${(vp.h - rows * cell) / 2}px`;
    cv.style.transform = '';
    const left = (vp.w - cols * cell) / 2, top = (vp.h - rows * cell) / 2;
    const pts = this.heat.map((h) => {
      const p = K.toScreen(this.c, vp, h.x, h.y);
      return { x: (p.x - left) / cell, y: (p.y - top) / cell, w: h.w };
    });
    const img = ctx.createImageData(cols, rows);
    heatPixels(img.data, cols, rows, pts, (this.heatR * this.c.s) / cell, ramp, this.c.s);
    ctx.putImageData(img, 0, 0);
    this.heatDrawn = { c: { ...this.c }, w: vp.w, h: vp.h };
    this.heatAt = performance.now();
  }

  private heatCovers(d: { c: Cam; w: number; h: number }, vp: K.Vp) {
    const k = this.c.s / d.c.s;
    if (!this.flying && (k > 1.75 || k < 0.6)) return false;
    const ox = vp.w * OVER, oy = vp.h * OVER;
    const tx = Math.abs((d.c.cx - this.c.cx) * this.c.s), ty = Math.abs((d.c.cy - this.c.cy) * this.c.s);
    return tx + vp.w / 2 <= k * (vp.w / 2 + ox) && ty + vp.h / 2 <= k * (vp.h / 2 + oy);
  }

  private shiftHeat(d: { c: Cam }) {
    const s = this.c.s;
    this.heatCanvas.style.transform = `translate(${(d.c.cx - this.c.cx) * s}px, ${(d.c.cy - this.c.cy) * s}px) scale(${s / d.c.s})`;
  }

  // ---------------------------------------------------------------- input

  private wire() {
    const { signal } = this.off;
    const vpEl = this.viewport;
    const at = (e: { clientX: number; clientY: number }) => {
      const r = vpEl.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const forget = (id: number) => {
      if (!this.pointers.delete(id)) return;
      if (this.pointers.size < 2) this.pinch.d = 0;
      if (!this.pointers.size) {
        vpEl.classList.remove('dragging');
        this.settle(); // draw afresh where the gesture left it
      }
    };
    vpEl.addEventListener('pointerdown', (e) => {
      // Only the main button pans (a right-click is for menus).
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.lastPointer = e.pointerType;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.moved = 0;
      this.interrupt();
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    }, { signal });
    vpEl.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (e.pointerType === 'mouse' && !(e.buttons & 1)) return forget(e.pointerId);
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.moved += Math.abs(dx) + Math.abs(dy);
        if (this.moved > 4 && !vpEl.classList.contains('dragging')) {
          try { vpEl.setPointerCapture(e.pointerId); } catch { /* already gone */ }
          vpEl.classList.add('dragging');
        }
        this.c = this.clamp({ ...this.c, cx: this.c.cx - dx / this.c.s, cy: this.c.cy - dy / this.c.s });
        this.render();
      } else if (this.pointers.size === 2) {
        // Pinch: zoom about the midpoint, and follow the midpoint as it moves.
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (this.pinch.d) {
          const r = vpEl.getBoundingClientRect();
          this.zoomTo(this.zoomStep(d / this.pinch.d, mx - r.left, my - r.top));
          const c = this.c;
          this.c = this.clamp({ ...c, cx: c.cx - (mx - this.pinch.x) / c.s, cy: c.cy - (my - this.pinch.y) / c.s });
          this.render();
        }
        this.pinch = { d, x: mx, y: my };
        this.moved = 99;
      }
    }, { signal });
    const end = (e: PointerEvent) => forget(e.pointerId);
    vpEl.addEventListener('pointerup', (e) => {
      // Double-tap zooms in (a mouse uses dblclick).
      if (e.pointerType !== 'mouse' && this.moved <= 4 && this.pointers.size === 1) {
        const t = performance.now(), q = at(e);
        if (t - this.lastTap.t < 300 && Math.hypot(q.x - this.lastTap.x, q.y - this.lastTap.y) < 20) {
          this.lastTap.t = 0;
          this.interrupt();
          this.zoomTo(this.zoomStep(2, q.x, q.y), 250);
        } else this.lastTap = { t, x: q.x, y: q.y };
      }
      end(e);
    }, { signal });
    vpEl.addEventListener('pointercancel', end, { signal });
    // A finger starts captured by what it touched; only the viewport's own loss ends the drag.
    vpEl.addEventListener('lostpointercapture', (e) => { if (e.target === vpEl) end(e); }, { signal });
    vpEl.addEventListener('pointerleave', (e) => { if (!e.buttons) forget(e.pointerId); }, { signal });
    // A drag is not a click.
    vpEl.addEventListener('click', (e) => {
      if (this.moved > 4) {
        e.preventDefault();
        e.stopPropagation();
        this.moved = 0;
      }
    }, { capture: true, signal });
    vpEl.addEventListener('dblclick', (e) => {
      if (this.lastPointer !== 'mouse' || (e.target as Element).closest('.gd-pin, .gd-cluster')) return;
      e.preventDefault();
      const q = at(e);
      this.interrupt();
      this.zoomTo(this.zoomStep(2, q.x, q.y), 250);
    }, { signal });

    vpEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheeling = true;
      clearTimeout(this.wheelTimer);
      this.wheelTimer = window.setTimeout(() => { this.wheeling = false; this.settle(); }, 150);
      this.interrupt();
      const q = at(e);
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.zoomTo(this.zoomStep(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.001)), q.x, q.y));
      this.render();
    }, { passive: false, signal });

    // Keys on the viewport itself: arrows pan, + and - zoom, Home shows the whole map.
    vpEl.addEventListener('keydown', (e) => {
      if (e.target !== vpEl || e.ctrlKey || e.metaKey || e.altKey) return;
      const step = 120 / this.c.s;
      const k = e.key;
      let t: Cam | null = null;
      if (k === 'ArrowLeft') t = { ...this.c, cx: this.c.cx - step };
      else if (k === 'ArrowRight') t = { ...this.c, cx: this.c.cx + step };
      else if (k === 'ArrowUp') t = { ...this.c, cy: this.c.cy - step };
      else if (k === 'ArrowDown') t = { ...this.c, cy: this.c.cy + step };
      else if (k === '+' || k === '=') return (e.preventDefault(), this.zoomBy(1.4));
      else if (k === '-' || k === '_') return (e.preventDefault(), this.zoomBy(1 / 1.4));
      else if (k === 'Home') return (e.preventDefault(), this.home());
      else return;
      e.preventDefault();
      this.flyTo(t, 150);
    }, { signal });

    // Pins: select on click or Enter, Space too; arrows move between pins.
    this.pinsEl.addEventListener('click', (e) => {
      const t = e.target as Element;
      const cl = t.closest<HTMLButtonElement>('.gd-cluster');
      if (cl) {
        e.preventDefault();
        this.fitCluster((cl.dataset.ids ?? '').split(' ').filter(Boolean));
        return;
      }
      const a = t.closest<HTMLAnchorElement>('a.gd-pin[data-id]');
      if (!a) return;
      e.preventDefault();
      this.hooks.onSelect(a.dataset.id!, e.detail === 0 ? 'keyboard' : 'pointer');
    }, { signal });
    this.pinsEl.addEventListener('keydown', (e) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>('a.gd-pin[data-id]');
      if (!a || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ') {
        e.preventDefault();
        this.hooks.onSelect(a.dataset.id!, 'keyboard');
        return;
      }
      const shown = this.order.filter((r) => r.shown);
      const i = shown.findIndex((r) => r.el === a);
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = Math.min(shown.length - 1, i + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = Math.max(0, i - 1);
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = shown.length - 1;
      else return;
      e.preventDefault();
      const r = shown[j];
      if (!r) return;
      for (const x of this.order) x.el.tabIndex = x === r ? 0 : -1;
      r.el.focus({ preventScroll: true });
      this.keepInView(r);
    }, { signal });
    // A focused pin inside a cluster shows itself (CSS); keep the stop on it.
    this.pinsEl.addEventListener('focusin', (e) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>('a.gd-pin');
      if (a) for (const x of this.order) x.el.tabIndex = x.el === a ? 0 : -1;
    }, { signal });
    // No right-click menus or iOS previews on pins and the map picture.
    this.stage.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    this.stage.addEventListener('dragstart', (e) => e.preventDefault(), { signal });

    // Map buttons (heat and area are the program's: data-cmd="gd-heat" / "gd-area").
    this.root.querySelectorAll<HTMLButtonElement>('[data-gd-zoom]').forEach((b) => b.addEventListener('click', () => {
      const z = b.dataset.gdZoom;
      if (z === 'in') this.zoomBy(1.6);
      else if (z === 'out') this.zoomBy(1 / 1.6);
      else this.home();
    }, { signal }));
  }
}
