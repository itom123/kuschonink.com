// Field Guide (导览): the map's camera, as pure functions (node tests them in
// camera.test.mts). World units are global Web-Mercator pixels at zoom 14
// (core.ts project()). A camera {cx, cy, s} puts world point (cx, cy) at the
// middle of the viewport, s screen pixels per world pixel.

export interface Cam { cx: number; cy: number; s: number }
/** A box in world units. */
export interface Rect { x: number; y: number; w: number; h: number }
/** The viewport's size in screen pixels. */
export interface Vp { w: number; h: number }
/** Screen pixels covered by a sheet or drawer, on each side. */
export interface Insets { left?: number; top?: number; right?: number; bottom?: number }
export interface Limits { min: number; max: number }

const lim = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Scale that shows the whole box (contain fit). */
export const containScale = (b: Rect, vp: Vp) => Math.min(vp.w / b.w, vp.h / b.h);

/** Zoom limits for an area: zoomed out to the whole map, in to `max`. */
export function limitsFor(b: Rect, vp: Vp, max: number): Limits {
  const min = vp.w > 0 && vp.h > 0 ? containScale(b, vp) : max;
  return { min: Math.min(min, max), max };
}

/** Keep the map on screen: per axis, the view stays inside the map, or the map is centred when it is smaller. */
export function clamp(c: Cam, b: Rect, vp: Vp, l: Limits): Cam {
  const s = lim(Number.isFinite(c.s) && c.s > 0 ? c.s : l.min, l.min, l.max);
  const axis = (v: number, x0: number, len: number, view: number) => {
    const half = view / 2 / s;
    if (len * s <= view) return x0 + len / 2;
    return lim(Number.isFinite(v) ? v : x0 + len / 2, x0 + half, x0 + len - half);
  };
  return { s, cx: axis(c.cx, b.x, b.w, vp.w), cy: axis(c.cy, b.y, b.h, vp.h) };
}

export const toScreen = (c: Cam, vp: Vp, x: number, y: number) => ({ x: (x - c.cx) * c.s + vp.w / 2, y: (y - c.cy) * c.s + vp.h / 2 });
export const toWorld = (c: Cam, vp: Vp, px: number, py: number) => ({ x: c.cx + (px - vp.w / 2) / c.s, y: c.cy + (py - vp.h / 2) / c.s });

/** Zoom by f around screen point (px, py) (viewport pixels), which stays put. */
export function zoomAt(c: Cam, f: number, px: number, py: number, vp: Vp, b: Rect, l: Limits): Cam {
  const w = toWorld(c, vp, px, py);
  const s = lim(c.s * f, l.min, l.max);
  return clamp({ s, cx: w.x - (px - vp.w / 2) / s, cy: w.y - (py - vp.h / 2) / s }, b, vp, l);
}

/** The free part of the viewport (not under a sheet), in screen pixels. */
export function freeRect(vp: Vp, ins: Insets = {}) {
  const left = ins.left ?? 0, top = ins.top ?? 0;
  const w = Math.max(1, vp.w - left - (ins.right ?? 0)), h = Math.max(1, vp.h - top - (ins.bottom ?? 0));
  return { x: left, y: top, w, h };
}

/** A camera that puts world point (x, y) at the middle of the free rect at scale s. */
export function centreIn(x: number, y: number, s: number, vp: Vp, ins: Insets = {}): Cam {
  const f = freeRect(vp, ins);
  return { s, cx: x - (f.x + f.w / 2 - vp.w / 2) / s, cy: y - (f.y + f.h / 2 - vp.h / 2) / s };
}

/** Fit a box into the free rect with `pad` screen px around it, no closer than `cap`. */
export function fit(box: Rect, vp: Vp, ins: Insets, pad: number, b: Rect, l: Limits, cap = l.max): Cam {
  const f = freeRect(vp, ins);
  const sx = box.w > 0 ? Math.max(1, f.w - 2 * pad) / box.w : Infinity;
  const sy = box.h > 0 ? Math.max(1, f.h - 2 * pad) / box.h : Infinity;
  const s = lim(Math.min(sx, sy, cap), l.min, l.max);
  return clamp(centreIn(box.x + box.w / 2, box.y + box.h / 2, s, vp, ins), b, vp, l);
}

/** The smallest box around some points. */
export function bbox(pts: { x: number; y: number }[]): Rect | null {
  if (!pts.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * "Whole map": centred on the guide's centre, as close as still shows every
 * point (with `pad` px to spare), between the area's minimum and `cap`.
 */
export function home(centre: { x: number; y: number }, pts: { x: number; y: number }[], vp: Vp, ins: Insets, pad: number, b: Rect, l: Limits, cap: number): Cam {
  const f = freeRect(vp, ins);
  let dx = 0, dy = 0;
  for (const p of pts) { dx = Math.max(dx, Math.abs(p.x - centre.x)); dy = Math.max(dy, Math.abs(p.y - centre.y)); }
  let s = Math.min(dx ? Math.max(1, f.w / 2 - pad) / dx : Infinity, dy ? Math.max(1, f.h / 2 - pad) / dy : Infinity);
  if (!Number.isFinite(s)) s = pts.length ? cap : l.min;
  s = lim(s, l.min, Math.max(l.min, Math.min(cap, l.max)));
  return clamp(centreIn(centre.x, centre.y, s, vp, ins), b, vp, l);
}

/** In-between camera for a flight: position eased linearly, zoom geometrically. */
export function between(a: Cam, b: Cam, e: number): Cam {
  return { cx: a.cx + (b.cx - a.cx) * e, cy: a.cy + (b.cy - a.cy) * e, s: a.s * Math.pow(b.s / a.s, e) };
}

/** House's ease-in-out. */
export const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

// ---------------------------------------------------------------- views
// Several base-map views (a city plan inside a regional one) zoom as one map
// with levels of detail. Zooming in hands over to a finer view that holds (or
// nearly holds) the point zoomed into; zooming out below a view's whole map
// shows the coarser view round it (an "overhang"), then hands back to it.
// The camera never jumps at a switch: an overhang lets the finer view show
// what the coarser one showed, and narrows as you zoom in.

/** A base-map view for the camera: its box (world units), its zoom level (an image pixel is 2^(14 - z) world pixels) and its own maximum scale. */
export interface Level { id: string; z: number; b: Rect; max: number }
/**
 * A view shown beyond its own map, with the coarser view `under` drawn round
 * it: the camera may roam `box` and come out to `min`, below the view's whole
 * map. It narrows as you zoom in and goes once the view's own map covers the
 * window again.
 */
export interface Soft { box: Rect; min: number; under: string }
/** One zoom step across views: the view to show, its camera, its overhang, and the views whose pictures to start loading. */
export interface Across { id: string; cam: Cam; soft: Soft | null; load: string[] }

/** Zooming out leaves a finer view this much below where zooming in took it over, so a pinch can't flip-flop. */
export const HYSTERESIS = 1.05;
/** Start loading a view's picture once zooming gets this close to needing it. */
export const PRELOAD = 0.7;
/**
 * Zooming in hands over to a finer view that holds the point zoomed into, or
 * nearly: within this share of the window's short side, at the handover (the
 * + button zooms into the middle of the window, which may sit just off it).
 */
export const NEAR = 0.2;
/** Zooming in, an overhang has gone by this many times the handover scale (or once the view's map covers the window, if later). */
export const SETTLE = 4;

type Pt = { x: number; y: number };
const holds = (b: Rect, p: Pt, m = 0) => p.x >= b.x - m && p.y >= b.y - m && p.x <= b.x + b.w + m && p.y <= b.y + b.h + m;
const hull = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};
const meet = (a: Rect, b: Rect): Rect => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
};
const own = (l: Level, vp: Vp) => limitsFor(l.b, vp, l.max);

/** The scale at which a view's picture shows 1:1. */
export const oneToOne = (z: number) => Math.pow(2, z - 14);
/** The part of the world a camera shows. */
export const seen = (c: Cam, vp: Vp): Rect => ({ x: c.cx - vp.w / 2 / c.s, y: c.cy - vp.h / 2 / c.s, w: vp.w / c.s, h: vp.h / c.s });
/** What a camera shows once kept on map b at its scale, as b's own clamp would (so an overhang never shows past the coarser map's edge). */
const seenOn = (c: Cam, b: Rect, vp: Vp) => seen(clamp(c, b, vp, { min: c.s, max: c.s }), vp);

/** The coarser view a view is drawn over: the most detailed one (lower z) that holds its middle. */
export function under(views: Level[], l: Level): Level | null {
  const m = { x: l.b.x + l.b.w / 2, y: l.b.y + l.b.h / 2 };
  let best: Level | null = null;
  for (const v of views) if (v.z < l.z && holds(v.b, m) && (!best || v.z > best.z)) best = v;
  return best;
}

/**
 * Where zooming in hands over from a coarse view to a finer one: where the
 * finer view's whole map fits the window, but no later than the coarse view's
 * own maximum and no earlier than its 1:1.
 */
export function handover(coarse: Level, fine: Level, vp: Vp): number {
  return Math.max(Math.min(oneToOne(coarse.z), coarse.max), Math.min(own(fine, vp).min, coarse.max));
}

/** How near (world units) to a finer view the point zoomed into must be for zooming in to hand over to it. */
const reach = (coarse: Level, fine: Level, vp: Vp) => (NEAR * Math.min(vp.w, vp.h)) / handover(coarse, fine, vp);

/** The next finer view (higher z) that holds point p, or nearly. */
function finerAt(views: Level[], l: Level, p: Pt, vp: Vp): Level | null {
  let best: Level | null = null;
  for (const v of views) if (v.z > l.z && holds(v.b, p, reach(l, v, vp)) && (!best || v.z < best.z)) best = v;
  return best;
}

/**
 * Zooming in from s0 to s, an overhang's box narrows towards the view's own
 * map: the part beyond it shrinks on screen in step with the scale, to nothing
 * by `end` (about as fast as the window itself closes in on the map), so the
 * map slides back onto the view without a jump.
 */
function narrow(box: Rect, b: Rect, s0: number, s: number, end: number): Rect {
  const k = s >= end || s0 >= end ? 0 : ((s0 / s) * (end - s)) / (end - s0);
  const x0 = b.x - (b.x - box.x) * k, y0 = b.y - (b.y - box.y) * k;
  const x1 = b.x + b.w + (box.x + box.w - b.x - b.w) * k, y1 = b.y + b.h + (box.y + box.h - b.y - b.h) * k;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Does view l show camera c on its own map, as its own clamp would? */
function fits(c: Cam, l: Level, vp: Vp) {
  const n = clamp(c, l.b, vp, own(l, vp));
  return Math.abs(n.s - c.s) <= 1e-9 * c.s && Math.abs(n.cx - c.cx) * c.s < 0.5 && Math.abs(n.cy - c.cy) * c.s < 0.5;
}

/**
 * One zoom step by f about screen point (px, py), across the views. Zooming in
 * past the handover of a finer view that holds (or nearly holds) the point
 * switches to it on the spot; zooming out below a view's whole map lets it
 * overhang, and below the handover (less HYSTERESIS) switches to the coarser
 * view. The point under (px, py) stays put, except where a view's own clamp
 * (as zoomAt) or a narrowing overhang moves it.
 */
export function zoomAcross(views: Level[], id: string, c: Cam, f: number, px: number, py: number, vp: Vp, soft: Soft | null = null): Across {
  let l = views.find((v) => v.id === id) ?? views[0];
  if (!vp.w || !vp.h || !l) return { id, cam: c, soft, load: [] };
  const w = toWorld(c, vp, px, py);
  const want = c.s * f;
  const load = new Set<string>();
  let moved = false;
  if (f > 1) {
    // Zooming into the coarser map round an overhang goes back to that map, if it can show the scale.
    // Only from half as far again off the finer map as NEAR reaches, so a pinch wobbling across that line can't flip-flop.
    const back = soft ? under(views, l) : null;
    if (back && soft!.under === back.id && !holds(l.b, w, 1.5 * reach(back, l, vp)) && holds(back.b, w) && want <= back.max) {
      l = back;
      moved = true;
    }
    for (let b = finerAt(views, l, w, vp); b; b = finerAt(views, l, w, vp)) {
      const h = handover(l, b, vp);
      if (want < h) {
        if (want >= PRELOAD * h) load.add(b.id);
        break;
      }
      l = b;
      moved = true;
    }
  } else if (f < 1) {
    const mid = { x: c.cx, y: c.cy };
    for (let a = under(views, l); a && holds(a.b, mid) && want < handover(a, l, vp) / HYSTERESIS; a = under(views, l)) {
      l = a;
      moved = true;
    }
  }
  const a = under(views, l);
  const lim0 = own(l, vp);
  const h = a ? handover(a, l, vp) : lim0.min;
  const lo = a ? Math.min(lim0.min, h / HYSTERESIS) : lim0.min;
  const s = lim(want, lo, l.max);
  if (a && s <= lim0.min / PRELOAD) load.add(a.id);
  let cam: Cam = { s, cx: w.x - (px - vp.w / 2) / s, cy: w.y - (py - vp.h / 2) / s };
  let out: Soft | null = null;
  const was = !moved && soft && a && soft.under === a.id ? soft : null;
  if (a && ((moved && f > 1) || s < lim0.min || was)) {
    // Overhang: as much of the coarser map as the camera shows; zooming in, less and less of it.
    let box = meet(hull(l.b, seenOn(cam, a.b, vp)), a.b);
    if (was && f > 1) box = meet(box, narrow(was.box, l.b, c.s, s, Math.max(vp.w / l.b.w, vp.h / l.b.h, SETTLE * h)));
    cam = clamp(cam, box, vp, { min: lo, max: l.max });
    if (!fits(cam, l, vp)) out = { box, min: lo, under: a.id };
  }
  if (out) load.add(out.under);
  else cam = clamp(cam, l.b, vp, lim0);
  return { id: l.id, cam, soft: out, load: [...load] };
}

/** The next finer view (higher z) whose map holds the whole box (a cluster's pins, say), or null. */
export function deeper(views: Level[], id: string, box: Rect): Level | null {
  const l = views.find((v) => v.id === id);
  let best: Level | null = null;
  if (l) for (const v of views) if (v.z > l.z && holds(v.b, box) && holds(v.b, { x: box.x + box.w, y: box.y + box.h }) && (!best || v.z < best.z)) best = v;
  return best;
}

/** The overhang view `id` needs to show camera c as it is (after a flight stops half-way, say); null when its own map covers it. */
export function softFor(views: Level[], id: string, c: Cam, vp: Vp): Soft | null {
  const l = views.find((v) => v.id === id);
  const a = l ? under(views, l) : null;
  if (!l || !a || !vp.w || !vp.h || fits(c, l, vp)) return null;
  return { box: meet(hull(l.b, seenOn(c, a.b, vp)), a.b), min: Math.min(c.s, own(l, vp).min, handover(a, l, vp) / HYSTERESIS), under: a.id };
}

/** After a pan or a flight: the overhang narrows to what the camera still shows, and goes once the view's own map covers it. */
export function relax(soft: Soft | null, views: Level[], id: string, c: Cam, vp: Vp): Soft | null {
  const l = views.find((v) => v.id === id);
  if (!soft || !l || !vp.w || !vp.h || fits(c, l, vp)) return null;
  return { ...soft, box: meet(soft.box, hull(l.b, seen(c, vp))) };
}
