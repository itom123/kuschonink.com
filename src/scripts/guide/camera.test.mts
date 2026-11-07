// npm test: the Field Guide map's camera (src/scripts/guide/camera.ts).
import { clamp, zoomAt, fit, home, limitsFor, toScreen, toWorld, between, type Cam, type Rect } from './camera.ts';

let fails = 0;
const ok = (cond: boolean, name: string, extra = '') => {
  if (!cond) fails++;
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;
const show = (c: Cam) => `(${c.cx.toFixed(2)}, ${c.cy.toFixed(2)}, ${c.s.toFixed(3)})`;

// A 1536×1408 city map with its corner at (1000, 2000), in a 600×400 window.
const map: Rect = { x: 1000, y: 2000, w: 1536, h: 1408 };
const vp = { w: 600, h: 400 };
const l = limitsFor(map, vp, 3);
/** Is the whole viewport on the map (on each axis where the map is the larger)? */
const inside = (c: Cam) => {
  const a = toWorld(c, vp, 0, 0), b = toWorld(c, vp, vp.w, vp.h);
  const xs = map.w * c.s <= vp.w + 1e-9 ? near(c.cx, map.x + map.w / 2) : a.x >= map.x - 1e-9 && b.x <= map.x + map.w + 1e-9;
  const ys = map.h * c.s <= vp.h + 1e-9 ? near(c.cy, map.y + map.h / 2) : a.y >= map.y - 1e-9 && b.y <= map.y + map.h + 1e-9;
  return xs && ys;
};

{
  ok(near(l.min, Math.min(600 / 1536, 400 / 1408)) && l.max === 3, 'limits: whole map to 3×', `${l.min}`);
  const tiny = limitsFor(map, { w: 10000, h: 10000 }, 3);
  ok(tiny.min === 3, 'limits: min never above max');
}
{
  const c = clamp({ cx: 0, cy: 0, s: 1 }, map, vp, l);
  ok(inside(c), 'clamp: panned far off comes back to the corner', show(c));
  ok(near(c.cx, map.x + 300) && near(c.cy, map.y + 200), 'clamp: corner exactly', show(c));
  const d = clamp({ cx: 99999, cy: 99999, s: 2 }, map, vp, l);
  ok(inside(d) && near(d.cx, map.x + map.w - 150), 'clamp: far corner at 2×', show(d));
  const z = clamp({ cx: 1200, cy: 2100, s: 0.01 }, map, vp, l);
  ok(near(z.s, l.min) && inside(z), 'clamp: zoomed out to the minimum, map centred on the short axis', show(z));
  ok(clamp({ cx: 1500, cy: 2500, s: 50 }, map, vp, l).s === 3, 'clamp: scale stops at 3');
  ok(clamp({ cx: NaN, cy: 2500, s: NaN }, map, vp, l).s === l.min, 'clamp: NaN scale falls back to the minimum');
}
{
  const c: Cam = { cx: 1700, cy: 2600, s: 1 };
  const w0 = toWorld(c, vp, 100, 50);
  const z = zoomAt(c, 2, 100, 50, vp, map, l);
  const w1 = toWorld(z, vp, 100, 50);
  ok(near(z.s, 2) && near(w0.x, w1.x) && near(w0.y, w1.y), 'zoomAt: the point under the pointer stays put', show(z));
  const big = zoomAt(c, 100, 300, 200, vp, map, l);
  ok(big.s === 3 && inside(big), 'zoomAt: stops at the maximum', show(big));
  const out = zoomAt(c, 0.001, 0, 0, vp, map, l);
  ok(near(out.s, l.min) && inside(out), 'zoomAt: out to the whole map stays inside', show(out));
  const s = toScreen(z, vp, w1.x, w1.y);
  ok(near(s.x, 100) && near(s.y, 50), 'toScreen undoes toWorld');
}
{
  const box: Rect = { x: 1600, y: 2500, w: 200, h: 100 };
  const c = fit(box, vp, {}, 20, map, l);
  const a = toScreen(c, vp, box.x, box.y), b = toScreen(c, vp, box.x + box.w, box.y + box.h);
  ok(a.x >= 20 - 1e-6 && b.x <= 580 + 1e-6 && a.y >= 20 - 1e-6 && b.y <= 380 + 1e-6, 'fit: the box is on screen with padding', show(c));
  ok(near(c.s, 2.8), 'fit: as close as the box allows (560/200)', show(c));
  const sheet = fit(box, vp, { bottom: 200 }, 20, map, l);
  const sb = toScreen(sheet, vp, box.x + box.w / 2, box.y + box.h);
  ok(sb.y <= 200 + 1e-6, 'fit: keeps the box above a sheet', show(sheet));
  const one = fit({ x: 1700, y: 2600, w: 0, h: 0 }, vp, {}, 20, map, l, 1.5);
  ok(near(one.s, 1.5), 'fit: a single point stops at the cap', show(one));
}
{
  const centre = { x: 1768, y: 2704 };
  const pts = [{ x: 1668, y: 2704 }, { x: 1868, y: 2754 }, { x: 1768, y: 2624 }];
  const c = home(centre, pts, vp, {}, 24, map, l, 1.6);
  ok(near(c.cx, centre.x) && near(c.cy, centre.y), 'home: centred on the centre', show(c));
  ok(pts.every((p) => { const s = toScreen(c, vp, p.x, p.y); return s.x >= 24 - 1e-6 && s.x <= 576 + 1e-6 && s.y >= 24 - 1e-6 && s.y <= 376 + 1e-6; }), 'home: every point shows', show(c));
  ok(c.s <= 1.6, 'home: no closer than the cap');
  const far = home(centre, [{ x: 1000, y: 2000 }], vp, {}, 24, map, l, 1.6);
  ok(near(far.s, l.min) && inside(far), 'home: a far point zooms out to the minimum', show(far));
  const none = home(centre, [], vp, {}, 24, map, l, 1.6);
  ok(near(none.s, l.min), 'home: no points shows the whole map');
  const edge = home({ x: 1010, y: 2010 }, pts, vp, {}, 24, map, l, 1.6);
  ok(inside(edge), 'home: a centre near the edge is still clamped', show(edge));
}
{
  const a: Cam = { cx: 0, cy: 0, s: 1 }, b: Cam = { cx: 100, cy: 50, s: 4 };
  const m = between(a, b, 0.5);
  ok(near(m.cx, 50) && near(m.s, 2), 'between: zoom is geometric', show(m));
}

console.log(fails ? `${fails} FAILED` : 'all passed');
// Node runs this file (npm test); the site's type check knows only the browser.
const node = (globalThis as { process?: { exitCode?: number } }).process;
if (fails && node) node.exitCode = 1;
