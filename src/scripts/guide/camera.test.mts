// npm test: the Field Guide map's camera (src/scripts/guide/camera.ts).
import {
  clamp, zoomAt, fit, home, limitsFor, toScreen, toWorld, between, zoomAcross, handover, relax, softFor, seen, deeper, HYSTERESIS,
  type Across, type Cam, type Level, type Rect, type Soft,
} from './camera.ts';

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

// ---- Views: Paris's city plan (z14) inside its regional map (z11), zoomed as one map.
const city: Level = { id: 'city', z: 14, b: { x: 2123851.0056, y: 1442294.7188, w: 1510, h: 1146 }, max: 3 };
const region: Level = { id: 'region', z: 11, b: { x: 2121307.0056, y: 1439616.7188, w: 8432, h: 7216 }, max: 3 / 8 };
const views = [city, region];
const win = { w: 800, h: 600 };
const lv = (id: string) => views.find((v) => v.id === id)!;
/** The guide's centre (Hotel Moris), well inside the city plan. */
const moris = { x: city.b.x + 768, y: city.b.y + 442 };
/** Does the camera's view lie on view `id`'s map, or on the overhang's box? */
const onMap = (r: Across) => {
  const v = seen(r.cam, win), b = r.soft ? r.soft.box : lv(r.id).b;
  const axis = (a0: number, len: number, x0: number, l: number) => (l <= len + 1e-6 ? true : a0 >= x0 - 1e-6 && a0 + len <= x0 + l + 1e-6);
  return axis(v.x, v.w, b.x, b.w) && axis(v.y, v.h, b.y, b.h);
};
/** Zoom n times by f about screen point (px, py); every step, how far the world point under it moved on screen. */
function zoomRun(id: string, c: Cam, f: number, px: number, py: number, n: number, soft: Soft | null = null, vs: Level[] = views) {
  const steps: (Across & { drift: number })[] = [];
  let r: Across = { id, cam: c, soft, load: [] };
  for (let i = 0; i < n; i++) {
    const w = toWorld(r.cam, win, px, py);
    const next = zoomAcross(vs, r.id, r.cam, f, px, py, win, r.soft);
    const p = toScreen(next.cam, win, w.x, w.y);
    steps.push({ ...next, drift: Math.hypot(p.x - px, p.y - py) });
    r = next;
  }
  return steps;
}
const trail = (st: { id: string; cam: Cam }[]) => st.map((x) => `${x.id[0]}${x.cam.s.toFixed(3)}`).join(' ');
const H = handover(region, city, win);
{
  ok(near(H, 0.375), 'handover: at the region map\'s own maximum when the whole city plan needs more', `${H}`);
  const phone = { w: 375, h: 700 };
  ok(near(handover(region, city, phone), limitsFor(city.b, phone, 3).min), 'handover: where the whole city plan fits, on a phone', `${handover(region, city, phone)}`);
}
{
  // Bird's-eye: the region's whole map, then + (×1.6 about the middle) all the way in.
  const start = clamp({ cx: 0, cy: 0, s: 0 }, region.b, win, limitsFor(region.b, win, region.max));
  const st = zoomRun('region', start, 1.6, 400, 300, 14);
  const last = st[st.length - 1];
  ok(last.id === 'city' && near(last.cam.s, 3), '+ from the whole region: reaches the city plan, then street level (s = 3)', trail(st));
  ok(st.every((x, i) => i === 0 || x.cam.s >= st[i - 1].cam.s - 1e-12), '+ from the whole region: never zooms back out');
  const at = st.findIndex((x) => x.id === 'city');
  ok(at > 0 && st[at - 1].cam.s <= region.max + 1e-12 && st[at].cam.s > region.max, '+ from the whole region: the city takes over past the region\'s maximum', trail(st.slice(Math.max(0, at - 1), at + 1)));
  ok(st.slice(0, at + 1).every((x) => x.drift < 0.5), '+ from the whole region: no jump up to and at the switch', st.slice(0, at + 1).map((x) => x.drift.toFixed(2)).join(' '));
  ok(st.every((x) => onMap(x)), '+ from the whole region: every camera on its map or its overhang');
  ok(st.some((x) => x.load.includes('city') && x.id === 'region'), '+ from the whole region: asks for the city picture before it is needed');
}
{
  // The same with a mouse wheel (small steps) over Hotel Moris, and over the city's east edge.
  const start: Cam = { cx: moris.x, cy: moris.y, s: 0.2 };
  for (const [name, p] of [['Moris', moris], ['the east edge', { x: city.b.x + city.b.w - 2, y: city.b.y + 600 }]] as const) {
    const q = toScreen(start, win, p.x, p.y);
    const st = zoomRun('region', start, Math.exp(0.1), q.x, q.y, 60);
    const last = st[st.length - 1];
    const worst = Math.max(...st.map((x) => x.drift));
    ok(last.id === 'city' && near(last.cam.s, 3), `wheel over ${name}: reaches street level on the city plan`, trail(st.filter((_, i) => i % 6 === 5)));
    ok(worst < 40, `wheel over ${name}: no notch moves the map more than a little`, `worst ${worst.toFixed(1)} px`);
    ok(!last.soft && st.every((x) => onMap(x)), `wheel over ${name}: the overhang has gone by street level`);
  }
}
{
  // − from the city's whole map: out through the overhang to the region's whole map.
  const whole = clamp({ cx: 0, cy: 0, s: 0 }, city.b, win, limitsFor(city.b, win, 3));
  const st = zoomRun('city', whole, 1 / 1.6, 400, 300, 8);
  const last = st[st.length - 1];
  const rmin = limitsFor(region.b, win, region.max).min;
  ok(last.id === 'region' && near(last.cam.s, rmin), '− from the whole city: reaches the region\'s whole map', trail(st));
  ok(st.every((x) => x.drift < 0.5 || x.id === 'region'), '− from the whole city: no jump while the city shows', st.map((x) => x.drift.toFixed(1)).join(' '));
  const wheel = zoomRun('city', whole, Math.exp(-0.1), 200, 150, 40);
  const sw = wheel.findIndex((x) => x.id === 'region');
  ok(wheel[wheel.length - 1].id === 'region' && wheel.every((x) => x.cam.s <= whole.s + 1e-12), 'wheel out from the whole city: down to the region, never back in', trail(wheel.filter((_, i) => i % 5 === 4)));
  ok(sw > 0 && wheel.slice(0, sw).every((x) => x.id === 'city' && !!x.soft && x.soft.under === 'region'), 'wheel out from the whole city: the region shows round the city until the switch', trail(wheel.slice(0, sw + 1)));
  ok(wheel.slice(0, sw + 1).every((x) => x.drift < 0.5), 'wheel out from the whole city: no jump up to and at the switch');
  ok(wheel.every((x) => onMap(x)), 'wheel out from the whole city: every camera on its map or its overhang');
}
{
  // A point well off the city plan (some 1200 world px west, beyond NEAR) stays on the region map.
  const off = { x: city.b.x - 1400, y: city.b.y + 600 };
  const st = zoomRun('region', { cx: off.x, cy: off.y, s: 0.3 }, 1.6, 400, 300, 8);
  ok(st.every((x) => x.id === 'region') && near(st[st.length - 1].cam.s, region.max), 'a point off the city plan stays on the region map, at its maximum', trail(st));
  // Just off its edge, as the window's middle may be on the region's whole map: the city takes over.
  const edge = { x: city.b.x + city.b.w + 150, y: city.b.y + 600 };
  const e2 = zoomRun('region', { cx: edge.x, cy: edge.y, s: 0.2 }, 1.6, 400, 300, 10);
  ok(e2[e2.length - 1].id === 'city' && near(e2[e2.length - 1].cam.s, 3), 'just off the city plan\'s edge, + still reaches street level', trail(e2));
}
{
  // No flip-flop at the boundary: a pinch wobbling ±3% about the handover keeps the view it has.
  const start: Cam = { cx: moris.x, cy: moris.y, s: H * 0.99 };
  const r1 = zoomAcross(views, 'region', start, 1.02, 400, 300, win);
  ok(r1.id === 'city', 'boundary: just past the handover, the city', `${r1.cam.s.toFixed(4)}`);
  let r = r1;
  const ids: string[] = [];
  for (const f of [0.97, 1.03, 0.97, 1.03, 0.97]) { r = zoomAcross(views, r.id, r.cam, f, 400, 300, win, r.soft); ids.push(r.id); }
  ok(ids.every((x) => x === 'city'), 'boundary: wobbling in and out stays on the city', ids.join(' '));
  const out = zoomAcross(views, r.id, r.cam, 1 / 1.1, 400, 300, win, r.soft);
  ok(out.id === 'region' && out.cam.s < H / HYSTERESIS, 'boundary: well below it, the region', `${out.cam.s.toFixed(4)}`);
  const back = zoomAcross(views, out.id, out.cam, 1.03, 400, 300, win, out.soft);
  ok(back.id === 'region', 'boundary: a small step back in stays on the region', `${back.cam.s.toFixed(4)}`);
}
{
  // The overhang narrows on a pan, goes once the city covers the window, and a stopped flight gets one.
  const r = zoomAcross(views, 'region', { cx: city.b.x + city.b.w, cy: moris.y, s: 0.3 }, 1.5, 400, 300, win);
  ok(r.id === 'city' && !!r.soft, 'overhang: the city at its edge shows the region beyond it', r.soft ? `${r.soft.box.w.toFixed(0)}×${r.soft.box.h.toFixed(0)}` : '');
  const panned = clamp({ ...r.cam, cx: r.cam.cx - 300 }, r.soft!.box, win, { min: r.soft!.min, max: 3 });
  const n = relax(r.soft, views, 'city', panned, win);
  ok(!!n && n.box.x + n.box.w < r.soft!.box.x + r.soft!.box.w, 'overhang: panning back onto the city narrows it');
  const inCity = clamp({ cx: moris.x, cy: moris.y, s: 1.2 }, city.b, win, limitsFor(city.b, win, 3));
  ok(relax(r.soft, views, 'city', inCity, win) === null, 'overhang: goes once the city covers the window');
  ok(softFor(views, 'city', inCity, win) === null && softFor(views, 'region', r.cam, win) === null, 'overhang: none needed on the map itself, nor for the region');
  const mid = softFor(views, 'city', { cx: city.b.x + city.b.w, cy: moris.y, s: 0.33 }, win);
  ok(!!mid && mid.min <= 0.33, 'overhang: a flight stopped half-way gets one that holds it');
  // A zoom inside the city that fits is the plain zoom.
  const c: Cam = { cx: moris.x, cy: moris.y, s: 1 };
  const plain = zoomAt(c, 1.6, 250, 200, win, city.b, limitsFor(city.b, win, 3));
  const across = zoomAcross(views, 'city', c, 1.6, 250, 200, win);
  ok(across.id === 'city' && !across.soft && near(across.cam.s, plain.s) && near(across.cam.cx, plain.cx) && near(across.cam.cy, plain.cy), 'inside the city plan: the same as zoomAt');
  const top = zoomAcross(views, 'city', { ...c, s: 3 }, 1.6, 400, 300, win);
  ok(top.id === 'city' && top.cam.s === 3, 'at street level, + stays put');
  const pinsBox: Rect = { x: moris.x - 20, y: moris.y - 10, w: 40, h: 30 };
  ok(deeper(views, 'region', pinsBox)?.id === 'city' && deeper(views, 'city', pinsBox) === null, 'a cluster on the city plan: the region can hand it to the city, the city to none');
  ok(deeper(views, 'region', { x: city.b.x + city.b.w - 10, y: moris.y, w: 40, h: 10 }) === null, 'a cluster across the city plan\'s edge stays on the region');
  const nearWhole = zoomAcross(views, 'city', { cx: moris.x, cy: moris.y, s: 0.9 }, 1 / 1.4, 400, 300, win);
  ok(nearWhole.id === 'city' && nearWhole.load.includes('region'), 'zooming out near the whole city asks for the region picture first', `${nearWhole.cam.s.toFixed(3)} ${nearWhole.load}`);
}
{
  // Other windows: a big desktop (the city needs s = 0.87 to fit) and a phone (0.25).
  for (const vp of [{ w: 1920, h: 1000 }, { w: 375, h: 700 }]) {
    const tag = `${vp.w}×${vp.h}`;
    const rl = limitsFor(region.b, vp, region.max), cl = limitsFor(city.b, vp, 3);
    let r: Across = { id: 'region', cam: clamp({ cx: moris.x, cy: moris.y, s: rl.min }, region.b, vp, rl), soft: null, load: [] };
    let worst = 0, back = false;
    for (let i = 0; i < 60; i++) {
      const q = toScreen(r.cam, vp, moris.x, moris.y);
      const next = zoomAcross(views, r.id, r.cam, Math.exp(0.1), q.x, q.y, vp, r.soft);
      const p = toScreen(next.cam, vp, moris.x, moris.y);
      // (Near its whole map the region's own clamp still centres it, as zoomAt does: count from the switch on.)
      if (next.id === 'city') worst = Math.max(worst, Math.hypot(p.x - q.x, p.y - q.y));
      if (r.id === 'city' && next.id === 'region') back = true;
      r = next;
    }
    // A wide window: the city plan spans 1920 px only from s = 1.27, so the view slides back to its middle, a few px a notch.
    ok(r.id === 'city' && near(r.cam.s, 3) && !back && worst < 12, `${tag}: wheel in from the whole region to street level, no notch moving the map more than a little`, `worst ${worst.toFixed(2)} px`);
    r = { id: 'city', cam: clamp({ cx: 0, cy: 0, s: 0 }, city.b, vp, cl), soft: null, load: [] };
    for (let i = 0; i < 40; i++) r = zoomAcross(views, r.id, r.cam, Math.exp(-0.1), vp.w / 2, vp.h / 2, vp, r.soft);
    ok(r.id === 'region' && near(r.cam.s, rl.min), `${tag}: wheel out from the whole city to the whole region`, `${r.cam.s.toFixed(4)}`);
  }
  // On a phone the handover comes below the region's maximum, so zooming into the region round an overhang goes back to it.
  const phone = { w: 375, h: 700 };
  const ph = handover(region, city, phone);
  let r = zoomAcross(views, 'city', clamp({ cx: 0, cy: 0, s: 0 }, city.b, phone, limitsFor(city.b, phone, 3)), 0.97, 187, 350, phone);
  ok(r.id === 'city' && !!r.soft, 'phone: just below the whole city, the city overhangs', `${r.cam.s.toFixed(4)} / ${ph.toFixed(4)}`);
  const far = toScreen(r.cam, phone, city.b.x + city.b.w / 2, city.b.y - 700);
  r = zoomAcross(views, r.id, r.cam, 1.1, far.x, far.y, phone, r.soft);
  ok(r.id === 'region', 'phone: zooming into the region well off the city goes back to the region', `${r.id} ${r.cam.s.toFixed(4)}`);
  // A pinch whose middle wobbles a few px across the "near the city" line, just above the city plan.
  const line = (0.2 * phone.w) / ph;
  r = zoomAcross(views, 'city', clamp({ cx: 0, cy: 0, s: 0 }, city.b, phone, limitsFor(city.b, phone, 3)), 0.97, 187, 350, phone);
  r = { ...r, cam: { ...r.cam, cy: city.b.y + 100 } };
  const seenIds: string[] = [];
  for (let i = 0; i < 24; i++) {
    const p = toScreen(r.cam, phone, city.b.x + city.b.w / 2, city.b.y - line * (i % 2 ? 0.95 : 1.05));
    r = zoomAcross(views, r.id, r.cam, 1.004, p.x, p.y, phone, r.soft);
    seenIds.push(r.id[0]);
  }
  const flips = seenIds.filter((x, i) => i && x !== seenIds[i - 1]).length;
  ok(flips <= 1, 'phone: a pinch wobbling across the line near the city doesn\'t flip-flop between the maps', seenIds.join(''));
}
{
  // A big window zoomed out of the whole city at its right edge: the view grows west past the region's edge,
  // and the overhang keeps it on the region map (as the region's own clamp would), not past it.
  const big = { w: 2560, h: 1440 };
  let r: Across = { id: 'city', cam: clamp({ cx: 0, cy: 0, s: 0 }, city.b, big, limitsFor(city.b, big, 3)), soft: null, load: [] };
  const past: string[] = [];
  for (let i = 0; i < 16; i++) {
    r = zoomAcross(views, r.id, r.cam, Math.exp(-0.1), 2550, 720, big, r.soft);
    const v = seen(r.cam, big);
    const off = Math.max(region.b.x - v.x, v.x + v.w - region.b.x - region.b.w, region.b.y - v.y, v.y + v.h - region.b.y - region.b.h);
    if (off > 1 && region.b.w * r.cam.s > big.w && region.b.h * r.cam.s > big.h) past.push(`${r.id}${r.cam.s.toFixed(3)}: ${off.toFixed(0)}`);
  }
  ok(!past.length && r.id === 'region', '2560×1440: zooming out of the city near the region\'s edge never shows past the region map', past.join(', '));
  const held = softFor(views, 'city', { cx: region.b.x + 1000, cy: moris.y, s: 0.5 }, big);
  ok(!!held && held.box.x >= region.b.x && held.box.w * 0.5 >= big.w - 0.01,'2560×1440: an overhang held at the region\'s edge is as wide as the window', held ? `${held.box.w.toFixed(0)} wide` : '');
}

// ---- With street-level tiles (map.ts TILE_ZOOM): every view goes on to 16×, its picture's own maximum kept as `pic`.
const cityT: Level = { ...city, max: 16, pic: 3 };
const regionT: Level = { ...region, max: 16, pic: 3 / 8 };
const viewsT = [cityT, regionT];
/** A world point on the region map, well off the city plan (beyond NEAR's reach): Versailles way. */
const off = { x: city.b.x - 1000, y: city.b.y + 600 };
const onT = (r: Across) => {
  const v = seen(r.cam, win), b = r.soft ? r.soft.box : viewsT.find((x) => x.id === r.id)!.b;
  const axis = (a0: number, len: number, x0: number, l: number) => (l <= len + 1e-6 ? true : a0 >= x0 - 1e-6 && a0 + len <= x0 + l + 1e-6);
  return axis(v.x, v.w, b.x, b.w) && axis(v.y, v.h, b.y, b.h);
};
{
  ok(near(handover(regionT, cityT, win), H) && near(handover(regionT, cityT, { w: 375, h: 700 }), handover(region, city, { w: 375, h: 700 })), 'tiles: the handover to the city plan is where it was (the region picture\'s own maximum)', `${handover(regionT, cityT, win)}`);
  // The owner's case: bird's-eye, then + with the window's middle off Paris. The region zooms on to street level.
  const start = clamp({ cx: off.x, cy: off.y, s: 0.2 }, region.b, win, limitsFor(region.b, win, regionT.max));
  const st = zoomRun('region', start, 1.6, 400, 300, 14, null, viewsT);
  const last = st[st.length - 1];
  ok(st.every((x) => x.id === 'region') && near(last.cam.s, 16), 'tiles: + off the city plan goes on to street level on the region map', trail(st));
  ok(st.every((x, i) => i === 0 || x.cam.s >= st[i - 1].cam.s - 1e-12) && st.every((x) => onT(x) && !x.soft), 'tiles: … never back out, always on the region map');
  ok(st.filter((x) => x.cam.s > region.max + 1e-9).every((x) => x.drift < 0.5), 'tiles: … and past the picture\'s old maximum no press moves the point under the middle', st.map((x) => x.drift.toFixed(2)).join(' '));
  // The same without tiles: the old limit holds (the region picture stops at 3 screen px per image pixel).
  const plain = zoomRun('region', start, 1.6, 400, 300, 14);
  ok(plain.every((x) => x.id === 'region') && near(plain[plain.length - 1].cam.s, region.max), 'no tiles: + off the city plan still stops at the region picture\'s maximum', trail(plain));
}
{
  // Every input, from points all over the region map: the wheel, +, the + key, a double-tap and a slow pinch all reach 16.
  const pts = [off, { x: region.b.x + 300, y: region.b.y + 300 }, { x: region.b.x + region.b.w - 300, y: region.b.y + region.b.h - 300 }, { x: city.b.x + city.b.w + 1200, y: city.b.y - 500 }];
  const fs: [string, number, number][] = [['wheel', Math.exp(0.1), 60], ['+', 1.6, 14], ['+ key', 1.4, 20], ['double-tap', 2, 10], ['pinch', 1.03, 180]];
  const bad: string[] = [];
  for (const p of pts) {
    for (const [name, f, n] of fs) {
      const start: Cam = { cx: p.x, cy: p.y, s: 0.3 };
      const st = zoomRun('region', start, f, 400, 300, n, null, viewsT);
      const last = st[st.length - 1];
      if (!near(last.cam.s, 16) || !st.every((x) => onT(x))) bad.push(`${name} at (${(p.x - region.b.x).toFixed(0)}, ${(p.y - region.b.y).toFixed(0)}): ${trail(st.slice(-2))}`);
    }
  }
  ok(!bad.length, 'tiles: wheel, +, the + key, a double-tap and a pinch all reach 16× from anywhere on the region map', bad.join('; '));
  // A wheel over Versailles: no notch moves the map more than a little once the region's own clamp has let go.
  const q = toScreen({ cx: off.x, cy: off.y, s: 0.3 }, win, off.x + 50, off.y + 40);
  const wheel = zoomRun('region', { cx: off.x, cy: off.y, s: 0.3 }, Math.exp(0.1), q.x, q.y, 60, null, viewsT);
  ok(wheel[wheel.length - 1].id === 'region' && near(wheel[wheel.length - 1].cam.s, 16) && wheel.every((x) => x.drift < 0.5), 'tiles: a wheel off the city plan reaches 16× on the region map without a jump', `worst ${Math.max(...wheel.map((x) => x.drift)).toFixed(2)} px`);
}
{
  // Over Paris the city plan still takes over at the handover, then goes on to 16 (its picture is the better map there).
  const start = clamp({ cx: moris.x, cy: moris.y, s: 0.2 }, region.b, win, limitsFor(region.b, win, regionT.max));
  const st = zoomRun('region', start, 1.6, 400, 300, 14, null, viewsT);
  const at = st.findIndex((x) => x.id === 'city');
  ok(at > 0 && st[at - 1].cam.s <= region.max + 1e-12 && st[at].cam.s > region.max && near(st[st.length - 1].cam.s, 16) && st[st.length - 1].id === 'city', 'tiles: + over Paris hands over to the city plan past the region picture\'s maximum, then reaches 16×', trail(st));
  ok(st.slice(0, at + 1).every((x) => x.drift < 0.5), 'tiles: … with no jump up to and at the switch');
  const q = toScreen({ cx: moris.x, cy: moris.y, s: 0.2 }, win, moris.x, moris.y);
  const wheel = zoomRun('region', { cx: moris.x, cy: moris.y, s: 0.2 }, Math.exp(0.1), q.x, q.y, 60, null, viewsT);
  const sw = wheel.findIndex((x) => x.id === 'city');
  ok(sw > 0 && near(wheel[sw - 1].cam.s, H, 0.04) && wheel[wheel.length - 1].id === 'city' && near(wheel[wheel.length - 1].cam.s, 16), 'tiles: a wheel over Moris switches at the handover, as without tiles', trail(wheel.filter((_, i) => i % 6 === 5)));
  // Already past its picture (tiles over the region), the region keeps the zoom even over Paris: no switch, no jump, no pan limit appearing.
  const deep = zoomRun('region', { cx: moris.x, cy: moris.y, s: 1 }, 1.6, 400, 300, 8, null, viewsT);
  ok(deep.every((x) => x.id === 'region' && !x.soft && x.drift < 0.5) && near(deep[deep.length - 1].cam.s, 16), 'tiles: a region camera past its picture zooms on there, even over Paris', trail(deep));
  // At the picture's own maximum (where the region used to stop) a press over Paris still hands over.
  const edge = zoomAcross(viewsT, 'region', { cx: moris.x, cy: moris.y, s: region.max }, 1.6, 400, 300, win);
  ok(edge.id === 'city' && near(edge.cam.s, region.max * 1.6), 'tiles: from the region picture\'s maximum a press over Paris hands over to the city plan', `${edge.id} ${edge.cam.s.toFixed(3)}`);
  // Zooming out from street level on the city: the overhang, then the region, as before.
  const out = zoomRun('city', { cx: moris.x, cy: moris.y, s: 16 }, 1 / 1.6, 400, 300, 14, null, viewsT);
  const rmin = limitsFor(region.b, win, regionT.max).min;
  ok(out[out.length - 1].id === 'region' && near(out[out.length - 1].cam.s, rmin) && out.every((x) => onT(x)), 'tiles: − from street level comes out through the city plan to the whole region', trail(out));
}
{
  // On the city plan with the region round it (an overhang), zooming at a point well off the city goes back to the region, and on to 16 there.
  const r = zoomAcross(viewsT, 'region', { cx: city.b.x + city.b.w, cy: moris.y, s: 0.3 }, 1.5, 400, 300, win);
  ok(r.id === 'city' && !!r.soft, 'tiles: the city at its edge still shows the region beyond it');
  const far = toScreen(r.cam, win, city.b.x + city.b.w + 900, moris.y);
  const back = zoomAcross(viewsT, r.id, r.cam, 1.5, far.x, far.y, win, r.soft);
  ok(back.id === 'region' && !back.soft, 'tiles: zooming into the region beside the city goes back to the region map', `${back.id} ${back.cam.s.toFixed(3)}`);
  const on = zoomRun(back.id, back.cam, 1.6, far.x, far.y, 10, back.soft, viewsT);
  ok(on.every((x) => x.id === 'region') && near(on[on.length - 1].cam.s, 16), 'tiles: … and goes on to street level there', trail(on));
  // Clusters: the region can still hand a box inside the city plan to it.
  ok(deeper(viewsT, 'region', { x: moris.x - 20, y: moris.y - 10, w: 40, h: 30 })?.id === 'city', 'tiles: a cluster on the city plan can still go to it');
}

console.log(fails ? `${fails} FAILED` : 'all passed');
// Node runs this file (npm test); the site's type check knows only the browser.
const node = (globalThis as { process?: { exitCode?: number } }).process;
if (fails && node) node.exitCode = 1;
