// Field Guide (导览): street-level tiles over the base pictures. The maths is
// pure (node tests it in tiles.test.mts); TileLayer is the small DOM layer that
// GuideMap (map.ts) drives from paint(). World units are z14 pixels, as in
// camera.ts, so one tile at zoom z is 256 · 2^(14 − z) world px, and a tile is
// put on screen with the same toScreen() as the base pictures. The tiles cover
// every base map (the city plan and the region round it), so any view zooms
// on to street level.
//
// The tiles come from the Worker's proxy ("/guides/<slug>/tiles/{z}/{x}/{y}.png"),
// never from IGN directly, so the visitor's browser talks only to kuschonink.com.
import type { TileSource } from '../../lib/guides/types';
import { toScreen, type Cam, type Rect, type Vp } from './camera.ts';

export const TILE_PX = 256;
/** More tiles than this for one picture means the zoom is wrong for the window: show none rather than flood the proxy. */
export const MAX_TILES = 512;
/** A failed tile is not asked for again for this long. */
const RETRY_MS = 60_000;
/** Spare <img> elements kept for reuse. */
const POOL = 32;

export interface TileAt { z: number; x: number; y: number }
/** A tile's place on screen, in whole viewport pixels. */
export interface TileBox extends TileAt { key: string; left: number; top: number; w: number; h: number }
export interface TileRange { min: number; max: number }

/** World px per tile at zoom z. */
export const tileWorld = (z: number) => TILE_PX * Math.pow(2, 14 - z);
export const tileKey = (t: TileAt) => `${t.z}/${t.x}/${t.y}`;

/** The tile zoom for a camera: a tile pixel is about one device pixel, within the range the proxy serves. */
export function zoomFor(s: number, dpr: number, r: TileRange): number {
  const want = 14 + Math.round(Math.log2(Math.max(1e-9, s * Math.max(1, dpr || 1))));
  return Math.min(r.max, Math.max(r.min, want));
}

/** Round to a whole device pixel: on a 1.25× or 1.5× screen a whole CSS pixel is not one, and tiles would seam. */
const snap = (v: number, dpr: number) => Math.round(v * dpr) / dpr;

/**
 * Where a tile goes on screen, pixel-aligned: each grid line is rounded on its
 * own (to a whole device pixel), so neighbours share an edge exactly (no
 * seams, no overlaps) and a tile is 1 px wider or narrower at most.
 */
export function tileBox(t: TileAt, c: Cam, vp: Vp, dpr = 1): TileBox {
  const u = tileWorld(t.z);
  const a = toScreen(c, vp, t.x * u, t.y * u);
  const b = toScreen(c, vp, (t.x + 1) * u, (t.y + 1) * u);
  const left = snap(a.x, dpr), top = snap(a.y, dpr);
  return { ...t, key: tileKey(t), left, top, w: snap(b.x, dpr) - left, h: snap(b.y, dpr) - top };
}

/** A box in whole device pixels, or null when nothing of `r` is on screen. */
export function screenBox(r: Rect, c: Cam, vp: Vp, dpr = 1): { left: number; top: number; w: number; h: number } | null {
  const a = toScreen(c, vp, r.x, r.y), b = toScreen(c, vp, r.x + r.w, r.y + r.h);
  const left = Math.max(0, snap(a.x, dpr)), top = Math.max(0, snap(a.y, dpr));
  const right = Math.min(vp.w, snap(b.x, dpr)), bottom = Math.min(vp.h, snap(b.y, dpr));
  return right > left && bottom > top ? { left, top, w: right - left, h: bottom - top } : null;
}

/**
 * The tiles at zoom z that a camera shows inside `clip` (the box round the
 * base maps, tileClip(), so nothing is asked for beyond it), nearest the
 * middle first so the middle loads first. Empty when nothing shows, or when
 * there would be too many.
 */
export function visibleTiles(c: Cam, vp: Vp, clip: Rect, z: number): TileAt[] {
  if (!(c.s > 0) || !vp.w || !vp.h) return [];
  const u = tileWorld(z);
  const x0 = Math.max(c.cx - vp.w / 2 / c.s, clip.x), y0 = Math.max(c.cy - vp.h / 2 / c.s, clip.y);
  const x1 = Math.min(c.cx + vp.w / 2 / c.s, clip.x + clip.w), y1 = Math.min(c.cy + vp.h / 2 / c.s, clip.y + clip.h);
  if (!(x1 > x0 && y1 > y0)) return [];
  const n = Math.pow(2, z);
  const i0 = Math.max(0, Math.floor(x0 / u)), i1 = Math.min(n - 1, Math.ceil(x1 / u) - 1);
  const j0 = Math.max(0, Math.floor(y0 / u)), j1 = Math.min(n - 1, Math.ceil(y1 / u) - 1);
  if (i1 < i0 || j1 < j0 || (i1 - i0 + 1) * (j1 - j0 + 1) > MAX_TILES) return [];
  const out: TileAt[] = [];
  for (let y = j0; y <= j1; y++) for (let x = i0; x <= i1; x++) out.push({ z, x, y });
  const mx = (x0 + x1) / 2 / u, my = (y0 + y1) / 2 / u;
  const d = (t: TileAt) => Math.hypot(t.x + 0.5 - mx, t.y + 0.5 - my);
  return out.sort((a, b) => d(a) - d(b));
}

/** The address of one tile. */
export const tileUrl = (src: TileSource, t: TileAt) => src.url.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y));

/**
 * Where tiles may be asked for: the smallest box round every base map. The
 * tile bounds in access.json hold every base map (check.ts sees to it), so
 * tiles cover the whole of it; beyond it the proxy has none. Null without maps.
 */
export function tileClip(maps: Rect[]): Rect | null {
  if (!maps.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of maps) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const overlaps = (a: { left: number; top: number; w: number; h: number }, b: { left: number; top: number; w: number; h: number }) =>
  a.left < b.left + b.w && b.left < a.left + a.w && a.top < b.top + b.h && b.top < a.top + a.h;

interface TileRec { t: TileAt; key: string; el: HTMLImageElement; state: 'loading' | 'ok' | 'failed' }

/**
 * The tile layer: <img> tiles inside one element (put in .gd-stage above the
 * base pictures and below the heat canvas). update() is called from paint();
 * it keeps the tiles of other zooms that still cover a tile not yet loaded,
 * so there are no holes, and drops them once the sharper ones have arrived.
 * A failed tile is simply dropped: the base picture shows there.
 */
export class TileLayer {
  readonly el: HTMLElement;
  private src: TileSource;
  private tiles = new Map<string, TileRec>();
  private pool: HTMLImageElement[] = [];
  private failed = new Map<string, number>();
  /** The zoom whose tiles were last asked for. */
  private z = 0;
  private gone = false;

  constructor(src: TileSource) {
    this.src = src;
    this.el = document.createElement('div');
    this.el.className = 'gd-tiles';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.hidden = true;
  }

  /**
   * Lay the tiles over the box `clip` (round the base maps) for this camera.
   * While a gesture is still going (`settled` false) a new zoom level is not
   * started: the tiles already there are moved, and the level changes when it
   * settles. True while the layer shows.
   */
  update(c: Cam, vp: Vp, clip: Rect, dpr: number, settled = true): boolean {
    if (this.gone) return false;
    const px = Math.max(1, dpr || 1);
    // Too far out for the first zoom (a tile would show under 0.7× its size, its lettering unreadable): the picture is the better map.
    if (c.s * px < Math.pow(2, this.src.min - 14.5)) {
      this.hide();
      return false;
    }
    const box = screenBox(clip, c, vp, px);
    if (!box) {
      this.hide();
      return false;
    }
    const st = this.el.style;
    st.left = `${box.left}px`;
    st.top = `${box.top}px`;
    st.width = `${box.w}px`;
    st.height = `${box.h}px`;
    this.el.hidden = false;

    const z = zoomFor(c.s, dpr, this.src);
    const fresh = settled || !this.tiles.size || z === this.z;
    const want = new Map<string, TileAt>();
    if (fresh) {
      this.z = z;
      for (const t of visibleTiles(c, vp, clip, z)) want.set(tileKey(t), t);
    }
    const now = performance.now();
    for (const [key, t] of want) {
      if (this.tiles.has(key)) continue;
      const since = this.failed.get(key);
      if (since !== undefined && now - since < RETRY_MS) continue;
      this.failed.delete(key);
      this.add(t, key);
    }
    // Old failures are forgotten, so the list stays short when IGN is down for a long time.
    if (this.failed.size > 256) for (const [k, since] of this.failed) if (now - since >= RETRY_MS) this.failed.delete(k);
    // Place every tile with the base picture's maths, relative to the layer's corner.
    const placed = new Map<string, TileBox>();
    for (const r of this.tiles.values()) {
      const b = tileBox(r.t, c, vp, px);
      placed.set(r.key, b);
      r.el.style.transform = `translate3d(${b.left - box.left}px, ${b.top - box.top}px, 0)`;
      r.el.style.width = `${b.w}px`;
      r.el.style.height = `${b.h}px`;
    }
    // Tiles not wanted now: off screen they go; mid-gesture the rest wait; otherwise
    // only a loaded tile of another zoom that still covers a wanted tile not yet loaded stays, so there are no holes.
    const loading = [...this.tiles.values()].filter((r) => want.has(r.key) && r.state === 'loading').map((r) => placed.get(r.key)!);
    const view = { left: box.left, top: box.top, w: box.w, h: box.h };
    for (const r of [...this.tiles.values()]) {
      if (want.has(r.key)) continue;
      const b = placed.get(r.key)!;
      const on = overlaps(b, view);
      const keep = fresh ? on && r.state === 'ok' && loading.some((l) => overlaps(b, l)) : on;
      if (!keep) this.drop(r);
    }
    return true;
  }

  /** Out of the tile zooms (the base picture is sharp enough): the layer goes, its tiles wait for the next time. */
  hide(): void {
    this.el.hidden = true;
  }

  destroy(): void {
    this.gone = true;
    for (const r of [...this.tiles.values()]) this.drop(r);
    this.pool = [];
    this.el.remove();
  }

  private add(t: TileAt, key: string): void {
    const el = this.pool.pop() ?? this.make();
    const r: TileRec = { t, key, el, state: 'loading' };
    el.onload = () => { r.state = 'ok'; };
    el.onerror = () => {
      r.state = 'failed';
      this.failed.set(key, performance.now());
      if (this.tiles.get(key) === r) this.drop(r);
    };
    el.style.zIndex = String(t.z - 14);
    el.src = tileUrl(this.src, t);
    this.el.append(el);
    this.tiles.set(key, r);
  }

  private drop(r: TileRec): void {
    this.tiles.delete(r.key);
    r.el.onload = r.el.onerror = null;
    r.el.remove();
    r.el.removeAttribute('src');
    if (this.pool.length < POOL) this.pool.push(r.el);
  }

  private make(): HTMLImageElement {
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.width = TILE_PX;
    img.height = TILE_PX;
    return img;
  }
}
