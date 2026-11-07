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
