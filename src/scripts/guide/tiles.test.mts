// npm test: the Field Guide map's street-level tiles (src/scripts/guide/tiles.ts), the pure part.
import { MAX_TILES, TILE_PX, screenBox, tileBox, tileClip, tileKey, tileUrl, tileWorld, visibleTiles, zoomFor, type TileAt } from './tiles.ts';
import { toScreen, type Cam } from './camera.ts';

let fails = 0;
const ok = (cond: boolean, name: string, extra = '') => {
  if (!cond) fails++;
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};
const R = { min: 14, max: 19 };
const vp = { w: 600, h: 400 };
const world = { x: -1e9, y: -1e9, w: 2e9, h: 2e9 };
const keys = (ts: TileAt[]) => ts.map(tileKey).sort().join(' ');

{
  ok(tileWorld(14) === 256 && tileWorld(15) === 128 && tileWorld(18) === 16 && tileWorld(19) === 8, 'a tile is 256 · 2^(14 − z) world px');
  ok(TILE_PX === 256, 'tiles are 256 px');
}
{
  // z = clamp(14 + round(log2(s · dpr)), 14, 19).
  const z = (s: number, dpr: number) => zoomFor(s, dpr, R);
  ok(z(1, 1) === 14 && z(0.5, 1) === 14 && z(0.1, 1) === 14, 'zoomFor: never below 14 (1:1 and out)');
  ok(z(1.3, 1) === 14 && z(1.5, 1) === 15, 'zoomFor: just past 1:1 still z14, so the lettering keeps its size (z15 would show it at half size)');
  ok(z(2, 1) === 15 && z(2.9, 1) === 16 && z(4, 1) === 16 && z(5.7, 1) === 17 && z(8, 1) === 17 && z(16, 1) === 18, 'zoomFor: one tile pixel about one screen pixel');
  ok(z(1, 2) === 15 && z(2, 2) === 16 && z(16, 2) === 19 && z(8, 2) === 18, 'zoomFor: a 2× screen gets the next zoom');
  ok(z(16, 3) === 19 && z(1000, 2) === 19, 'zoomFor: never above 19');
  ok(z(4, 0) === 16 && z(4, NaN) === 16 && z(4, 0.5) === 16, 'zoomFor: an odd devicePixelRatio counts as 1');
  ok(zoomFor(4, 1, { min: 13, max: 17 }) === 16 && zoomFor(1, 1, { min: 13, max: 17 }) === 14, 'zoomFor: the range comes from the payload');
}
{
  // At s = 4 a z16 tile (64 world px) is 256 screen px: the 600×400 window shows 150×100 world px.
  const c: Cam = { cx: 1000, cy: 2000, s: 4 };
  const ts = visibleTiles(c, vp, world, 16);
  ok(ts.length === 9 && keys(ts) === '16/14/30 16/14/31 16/14/32 16/15/30 16/15/31 16/15/32 16/16/30 16/16/31 16/16/32', 'visibleTiles: the 3×3 tiles under the window', keys(ts));
  ok(tileKey(ts[0]) === '16/15/31', 'visibleTiles: the middle tile comes first', tileKey(ts[0]));
  const far = ts[ts.length - 1];
  ok(Math.hypot(far.x + 0.5 - 1000 / 64, far.y + 0.5 - 2000 / 64) >= Math.hypot(ts[1].x + 0.5 - 1000 / 64, ts[1].y + 0.5 - 2000 / 64), 'visibleTiles: the farthest comes last');
  // Clipped to the base picture's box: nothing is asked for beyond it.
  const clip = visibleTiles(c, vp, { x: 1000, y: 2000, w: 100, h: 50 }, 16);
  ok(keys(clip) === '16/15/31 16/15/32 16/16/31 16/16/32', 'visibleTiles: clipped to the picture', keys(clip));
  const edge = visibleTiles(c, vp, { x: 960, y: 1984, w: 128, h: 64 }, 16);
  ok(keys(edge) === '16/15/31 16/16/31', 'visibleTiles: a box ending exactly on a tile line does not take the next tile', keys(edge));
  ok(visibleTiles(c, vp, { x: 5000, y: 5000, w: 10, h: 10 }, 16).length === 0, 'visibleTiles: nothing when the picture is off screen');
  ok(visibleTiles(c, { w: 0, h: 400 }, world, 16).length === 0 && visibleTiles({ ...c, s: 0 }, vp, world, 16).length === 0, 'visibleTiles: nothing without a window or a scale');
  ok(visibleTiles({ cx: 1000, cy: 2000, s: 0.01 }, vp, world, 19).length === 0, `visibleTiles: more than ${MAX_TILES} tiles → none (the zoom is wrong for the window)`);
  // At s = 2 a z15 tile (128 world px) is 256 screen px too: the same 3×3 under a 600×400 window.
  ok(visibleTiles({ cx: 1000, cy: 2000, s: 2 }, vp, world, 15).length === 9, 'visibleTiles: a whole window of z15 at 2× is 3×3 tiles of 256 px', String(visibleTiles({ cx: 1000, cy: 2000, s: 2 }, vp, world, 15).length));
  const corner = visibleTiles({ cx: 10, cy: 10, s: 4 }, vp, world, 16);
  ok(corner.every((t) => t.x >= 0 && t.y >= 0), 'visibleTiles: never a negative tile number');
}
{
  // Pixel alignment: whole numbers, neighbours share an edge, and the boxes agree with the base picture's maths.
  const c: Cam = { cx: 1000.37, cy: 2000.91, s: 1.3 };
  const row = [14, 15, 16, 17].map((x) => tileBox({ z: 16, x, y: 31 }, c, vp));
  ok(row.every((b) => Number.isInteger(b.left) && Number.isInteger(b.top) && Number.isInteger(b.w) && Number.isInteger(b.h)), 'tileBox: whole pixels');
  ok(row.every((b, i) => i === 0 || row[i - 1].left + row[i - 1].w === b.left), 'tileBox: neighbours share an edge (no seams, no overlaps)', row.map((b) => `${b.left}+${b.w}`).join(' '));
  const col = [30, 31, 32].map((y) => tileBox({ z: 16, x: 15, y }, c, vp));
  ok(col.every((b, i) => i === 0 || col[i - 1].top + col[i - 1].h === b.top), 'tileBox: rows too');
  const want = 64 * 1.3;
  ok(row.every((b) => Math.abs(b.w - want) <= 1 && Math.abs(b.h - want) <= 1), 'tileBox: a tile is its world size times the scale, give or take a pixel', row.map((b) => b.w).join(' '));
  const b = tileBox({ z: 16, x: 15, y: 31 }, c, vp);
  const p = toScreen(c, vp, 15 * 64, 31 * 64);
  ok(b.left === Math.round(p.x) && b.top === Math.round(p.y) && b.key === '16/15/31', 'tileBox: the same toScreen() as the base picture');
  const whole = tileBox({ z: 18, x: 100, y: 200 }, { cx: 1000, cy: 2000, s: 16 }, vp);
  ok(whole.w === 256 && whole.h === 256, 'tileBox: at z18 and 16× a tile is exactly 256 px');
}
{
  // A 1.5× screen: every edge on a whole device pixel (a multiple of 1/1.5 CSS px), neighbours still share it.
  const c: Cam = { cx: 1000.37, cy: 2000.91, s: 1.3 };
  const dpr = 1.5;
  const onDevice = (v: number) => Math.abs(v * dpr - Math.round(v * dpr)) < 1e-9;
  const row = [14, 15, 16, 17].map((x) => tileBox({ z: 16, x, y: 31 }, c, vp, dpr));
  ok(row.every((b) => onDevice(b.left) && onDevice(b.top) && onDevice(b.left + b.w) && onDevice(b.top + b.h)), 'tileBox at 1.5×: every edge on a whole device pixel', row.map((b) => `${b.left}+${b.w}`).join(' '));
  ok(row.every((b, i) => i === 0 || Math.abs(row[i - 1].left + row[i - 1].w - b.left) < 1e-9), 'tileBox at 1.5×: neighbours share an edge', row.map((b) => `${b.left}+${b.w}`).join(' '));
  const col = [30, 31, 32].map((y) => tileBox({ z: 16, x: 15, y }, c, vp, dpr));
  ok(col.every((b, i) => i === 0 || Math.abs(col[i - 1].top + col[i - 1].h - b.top) < 1e-9), 'tileBox at 1.5×: rows too');
  ok(row.every((b) => Math.abs(b.w - 64 * 1.3) <= 1 / dpr + 1e-9), 'tileBox at 1.5×: a tile is its world size times the scale, give or take a device pixel');
  const sb = screenBox({ x: 990, y: 1990, w: 100, h: 100 }, c, vp, dpr)!;
  ok(onDevice(sb.left) && onDevice(sb.top) && onDevice(sb.left + sb.w) && onDevice(sb.top + sb.h), 'screenBox at 1.5×: on whole device pixels too', JSON.stringify(sb));
  const one = tileBox({ z: 16, x: 15, y: 31 }, c, vp, 1), dflt = tileBox({ z: 16, x: 15, y: 31 }, c, vp);
  ok(one.left === dflt.left && one.w === dflt.w && Number.isInteger(one.left), 'tileBox: a 1× screen is the whole-pixel default');
}
{
  const c: Cam = { cx: 1000, cy: 2000, s: 2 };
  const pic = { x: 900, y: 1950, w: 300, h: 300 };
  const sb = screenBox(pic, c, vp)!;
  // The picture's corner is at screen (300 − 200, 200 − 100) = (100, 100); it runs 600 px wide, so it is clipped at the window's right edge.
  ok(sb && sb.left === 100 && sb.top === 100 && sb.w === 500 && sb.h === 300, 'screenBox: the picture on screen, clipped to the window', JSON.stringify(sb));
  ok(screenBox({ x: 5000, y: 5000, w: 10, h: 10 }, c, vp) === null, 'screenBox: null when the picture is off screen');
  const big = screenBox(world, c, vp)!;
  ok(big.left === 0 && big.top === 0 && big.w === 600 && big.h === 400, 'screenBox: a huge picture fills the window');
}
{
  const src = { url: '/guides/paris/tiles/{z}/{x}/{y}.png', min: 15, max: 19 };
  ok(tileUrl(src, { z: 18, x: 132784, y: 90122 }) === '/guides/paris/tiles/18/132784/90122.png', 'tileUrl: the proxy address, same origin');
}
{
  // Where tiles may go: the box round every base map (Paris's city plan lies inside its region map), so the region zooms to street level too.
  const city = { x: 2123851.0056, y: 1442294.7188, w: 1510, h: 1146 };
  const region = { x: 2121307.0056, y: 1439616.7188, w: 8432, h: 7216 };
  const clip = tileClip([city, region])!;
  ok(clip.x === region.x && clip.y === region.y && clip.w === region.w && clip.h === region.h, 'tileClip: the region map, which holds the city plan', JSON.stringify(clip));
  const two = tileClip([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: -5, w: 10, h: 10 }])!;
  ok(two.x === 0 && two.y === -5 && two.w === 30 && two.h === 15, 'tileClip: the smallest box round maps apart', JSON.stringify(two));
  ok(tileClip([]) === null, 'tileClip: null without maps');
  // On the region map at street level: a sane number of tiles for a desktop window and a phone, none beyond the region.
  const desk = { w: 1366, h: 738 }, phone = { w: 390, h: 844 };
  const versailles = { cx: region.x + 1200, cy: region.y + 4200 };
  const first = visibleTiles({ ...versailles, s: 0.75 }, desk, clip, zoomFor(0.75, 1, R));
  ok(first.length > 0 && first.length <= 60 && first.every((t) => t.z === 14), 'region at 0.75×: a window of z14 tiles', String(first.length));
  const street = visibleTiles({ ...versailles, s: 16 }, phone, clip, zoomFor(16, 2, R));
  ok(street.length > 0 && street.length <= 48 && street.every((t) => t.z === 19), 'region at 16× on a 2× phone: a window of z19 tiles', String(street.length));
  const inside = (t: TileAt) => { const u = tileWorld(t.z); return (t.x + 1) * u > clip.x && t.x * u < clip.x + clip.w && (t.y + 1) * u > clip.y && t.y * u < clip.y + clip.h; };
  const corner = visibleTiles({ cx: region.x + 100, cy: region.y + 100, s: 2 }, desk, clip, 15);
  ok(corner.length > 0 && corner.every(inside), 'region\'s corner at 2×: no tile beyond the region map');
  ok([...first, ...street].every(inside), 'region at street level: every tile lies on the region map');
}

{
  // The DOM layer, against a stand-in document: what stays, what goes, what is never asked for twice.
  class Fake {
    style: Record<string, string> = {};
    hidden = false;
    className = '';
    src = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    kids: Fake[] = [];
    up: Fake | null = null;
    setAttribute() {}
    removeAttribute(n: string) { if (n === 'src') this.src = ''; }
    append(k: Fake) { k.up = this; this.kids.push(k); }
    remove() { if (this.up) this.up.kids = this.up.kids.filter((x) => x !== this); this.up = null; }
  }
  const made: Fake[] = [];
  (globalThis as unknown as { document: unknown }).document = { createElement: () => { const f = new Fake(); made.push(f); return f; } };
  const { TileLayer } = await import('./tiles.ts');
  const src = { url: '/t/{z}/{x}/{y}.png', min: 14, max: 19 };
  const layer = new TileLayer(src);
  const el = layer.el as unknown as Fake;
  const load = () => el.kids.forEach((k) => k.onload?.());
  const clip = { x: 0, y: 0, w: 1e7, h: 1e7 };
  const at = (s: number): Cam => ({ cx: 1000, cy: 2000, s });

  ok(el.hidden === true, 'TileLayer: hidden until there is something to show');
  ok(layer.update(at(4), vp, clip, 1) === true && el.hidden === false && el.kids.length === 9 && el.kids.every((k) => k.src.startsWith('/t/16/')), 'TileLayer: 3×3 z16 tiles asked for, the layer shows', String(el.kids.length));
  load();
  layer.update(at(8), vp, clip, 1);
  // At 8× the window shows 2×2 of the z16 tiles (the rest are off screen and go) and 3×3 of the new z17 ones.
  ok(el.kids.length === 13 && el.kids.filter((k) => k.src.startsWith('/t/16/')).length === 4 && el.kids.filter((k) => k.src.startsWith('/t/17/')).length === 9, 'TileLayer: a new zoom asks for its tiles and keeps the loaded ones beneath until they arrive (no holes)', String(el.kids.length));
  load();
  layer.update(at(8), vp, clip, 1);
  ok(el.kids.length === 9 && el.kids.every((k) => k.src.startsWith('/t/17/')), 'TileLayer: once the sharper tiles are in, the old ones go', String(el.kids.length));
  const before = el.kids.length;
  layer.update(at(16), vp, clip, 1, false);
  ok(el.kids.length <= before && el.kids.length > 0 && el.kids.every((k) => k.src.startsWith('/t/17/')), 'TileLayer: mid-gesture no new zoom level starts (the tiles are stretched)');
  layer.update(at(16), vp, clip, 1, true);
  ok(el.kids.some((k) => k.src.startsWith('/t/18/')), 'TileLayer: it starts when the gesture settles');
  load();
  layer.update(at(16), vp, clip, 1, true);
  ok(el.kids.every((k) => k.src.startsWith('/t/18/')), 'TileLayer: and the old zoom goes once loaded');

  // A failed tile leaves at once, and is not asked for again for a minute.
  const bad = el.kids[0], badSrc = bad.src;
  const n = el.kids.length;
  bad.onerror?.();
  ok(el.kids.length === n - 1 && !el.kids.includes(bad), 'TileLayer: a failed tile is dropped');
  const asked = made.length;
  layer.update(at(16), vp, clip, 1, true);
  ok(!el.kids.some((k) => k.src === badSrc) && el.kids.length === n - 1, 'TileLayer: … and not asked for again within the minute');

  // Moving away: tiles off screen are dropped, the element count stays bounded, spare <img>s are reused.
  for (let i = 0; i < 40; i++) {
    layer.update({ cx: 1000 + i * 90, cy: 2000, s: 16 }, vp, clip, 1, true);
    load();
  }
  ok(el.kids.length <= MAX_TILES && el.kids.length <= 12, 'TileLayer: panning far keeps only what is on screen', String(el.kids.length));
  ok(made.length < asked + 60, 'TileLayer: spare images are reused, not made afresh for every tile', String(made.length - asked));

  ok(layer.update({ cx: -5000, cy: -5000, s: 4 }, vp, { x: 0, y: 0, w: 10, h: 10 }, 1) === false && el.hidden === true, 'TileLayer: a picture that is off screen hides the layer');
  const kidsBefore = el.kids.length;
  ok(layer.update(at(0.5), vp, clip, 1) === false && el.hidden === true && el.kids.length === kidsBefore, 'TileLayer: too far out for the first zoom (under 0.7×) → hidden, nothing asked for');
  ok(layer.update(at(0.72), vp, clip, 1) === true && layer.update(at(0.3), vp, clip, 2) === false && layer.update(at(0.4), vp, clip, 2) === true, 'TileLayer: the scale that counts is in device pixels (0.4 on a 2× screen shows, 0.3 does not)');
  layer.destroy();
  ok(el.kids.length === 0 && layer.update(at(4), vp, clip, 1) === false, 'TileLayer: destroy leaves nothing, and nothing after it');
}

console.log(fails ? `${fails} FAILED` : 'all passed');
// Node runs this file (npm test); the site's type check knows only the browser.
const node = (globalThis as { process?: { exitCode?: number } }).process;
if (fails && node) node.exitCode = 1;
