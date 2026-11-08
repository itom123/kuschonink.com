// npm test: the Field Guide map's finger gestures (src/scripts/guide/gestures.ts).
import { Gestures, DOUBLE_MS, DOUBLE_PX, FLICK_MAX, FLICK_MIN, SLOP, TWO_MS, ZOOM_PX, type Act } from './gestures.ts';

let fails = 0;
const ok = (cond: boolean, name: string, extra = '') => {
  if (!cond) fails++;
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;
const types = (acts: Act[]) => acts.map((a) => a.type).join(' ');
const of = <T extends Act['type']>(acts: Act[], type: T) => acts.filter((a): a is Extract<Act, { type: T }> => a.type === type);
/** Every pan added up, and every zoom multiplied. */
const sum = (acts: Act[]) => ({
  dx: of(acts, 'pan').reduce((s, a) => s + a.dx, 0),
  dy: of(acts, 'pan').reduce((s, a) => s + a.dy, 0),
  f: of(acts, 'zoom').reduce((s, a) => s * a.f, 1),
});

/** One finger from (x, y): a tap at time t, held for `ms`. */
const tap = (g: Gestures, x: number, y: number, t: number, ms = 80, id = 1) => [...g.downAt(id, 'touch', x, y, t), ...g.upAt(id, x, y, t + ms)];
/** One finger dragged from a to b in `steps` moves over `ms`, then lifted `rest` ms later where it stopped. */
const drag = (g: Gestures, a: [number, number], b: [number, number], t: number, ms: number, steps = 10, rest = 0, kind: 'touch' | 'mouse' = 'touch') => {
  const acts = [...g.downAt(1, kind, a[0], a[1], t)];
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    acts.push(...g.moveTo(1, a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, t + ms * k));
  }
  acts.push(...g.upAt(1, b[0], b[1], t + ms + rest));
  return acts;
};

{
  const g = new Gestures();
  const a = tap(g, 100, 100, 1000);
  ok(types(a) === 'tap end' && !g.moved && g.down === 0, 'a tap: the thing touched gets it, the map stays', types(a));
  const b = [...g.downAt(1, 'touch', 100, 100, 3000), ...g.moveTo(1, 100 + SLOP.touch - 1, 100, 3040), ...g.upAt(1, 100 + SLOP.touch - 1, 100, 3080)];
  ok(types(b) === 'tap end', 'a finger that wobbles within the slop still taps', types(b));
}
{
  const g = new Gestures();
  const a = drag(g, [100, 100], [160, 140], 1000, 600, 12, 0);
  const s = sum(a);
  ok(near(s.dx, 60) && near(s.dy, 40) && g.moved, 'a drag moves the map as far as the finger went', `${s.dx} ${s.dy}`);
  ok(of(a, 'pan')[0].dx > SLOP.touch - 5, 'past the slop, the map catches up with the finger at once', `${of(a, 'pan')[0].dx}`);
  ok(!of(a, 'tap').length && types(a).endsWith('end') && !of(a, 'glide').length, 'a slow drag is no tap and doesn\'t glide on', types(a));
}
{
  const g = new Gestures();
  const a = drag(g, [100, 300], [100, 100], 1000, 120);
  const gl = of(a, 'glide')[0];
  ok(!!gl && gl.vy < -1 && near(gl.vx, 0) && !of(a, 'end').length, 'a flick glides on, the way the finger went', gl ? `${gl.vx} ${gl.vy}` : types(a));
  const b = drag(new Gestures(), [0, 0], [3000, 0], 1000, 100);
  ok(near(of(b, 'glide')[0]?.vx ?? 0, FLICK_MAX - FLICK_MIN), 'a very fast flick glides no faster than FLICK_MAX', `${of(b, 'glide')[0]?.vx}`);
  // Let go at 0.2 px/ms and at 0.1: a short glide, then none, with no jump between (the glide starts FLICK_MIN slower).
  const slow = of(drag(new Gestures(), [0, 0], [100, 0], 1000, 500, 25), 'glide')[0];
  const slower = of(drag(new Gestures(), [0, 0], [50, 0], 1000, 500, 25), 'glide')[0];
  ok(!!slow && near(slow.vx, 0.2 - FLICK_MIN, 1e-9) && !slower, 'a drag let go slowly glides a little, or not at all', `${slow?.vx} ${slower?.vx}`);
  const c = drag(new Gestures(), [100, 300], [100, 100], 1000, 120, 10, 200);
  ok(!of(c, 'glide').length && types(c).endsWith('end'), 'a finger that stopped before it lifted doesn\'t glide', types(c));
  const m = drag(new Gestures(), [100, 300], [100, 100], 1000, 120, 10, 0, 'mouse');
  ok(!of(m, 'glide').length && near(sum(m).dy, -200), 'a mouse drags but never glides', types(m));
}
{
  const g = new Gestures();
  const a = tap(g, 200, 200, 1000);
  const b = tap(g, 210, 205, 1080 + DOUBLE_MS - 20);
  const z = of(b, 'zoomIn')[0];
  ok(types(a) === 'tap end' && !!z && z.x === 210 && z.y === 205 && !of(b, 'tap').length, 'a double-tap zooms in where the second tap was', types(b));
  const c = tap(g, 210, 205, 1080 + DOUBLE_MS + 100);
  ok(types(c) === 'tap end', 'a third tap is a new tap, not another double-tap', types(c));
}
{
  const g = new Gestures();
  tap(g, 200, 200, 1000);
  ok(types(tap(g, 200, 200, 1080 + DOUBLE_MS + 1)) === 'tap end', 'two taps too far apart in time are two taps');
  const h = new Gestures();
  tap(h, 200, 200, 1000);
  ok(types(tap(h, 200 + DOUBLE_PX + 5, 200, 1150)) === 'tap end', 'two taps too far apart on the map are two taps');
  const k = new Gestures();
  tap(k, 200, 200, 1000, 600);
  ok(types(tap(k, 200, 200, 1700)) === 'tap end', 'a long press then a tap is no double-tap');
  const p = new Gestures();
  tap(p, 200, 200, 1000);
  p.forgetTap();
  ok(types(tap(p, 200, 200, 1150)) === 'tap end', 'a tap the map took (a pin) starts no double-tap');
  const m = new Gestures();
  const ma = [...m.downAt(1, 'mouse', 50, 50, 1000), ...m.upAt(1, 50, 50, 1050), ...m.downAt(1, 'mouse', 50, 50, 1100), ...m.upAt(1, 50, 50, 1150)];
  ok(!of(ma, 'zoomIn').length, 'a mouse double-click is left to dblclick', types(ma));
}
{
  // Double-tap and hold, then slide.
  const g = new Gestures();
  tap(g, 300, 300, 1000);
  const acts = [...g.downAt(2, 'touch', 305, 302, 1200)];
  for (let i = 1; i <= 8; i++) acts.push(...g.moveTo(2, 305, 302 + 16 * i, 1200 + 20 * i));
  acts.push(...g.upAt(2, 305, 302 + 128, 1400));
  const s = sum(acts), zs = of(acts, 'zoom');
  ok(near(s.f, 2, 1e-9) && zs.every((z) => z.x === 305 && z.y === 302), 'one-finger zoom: sliding down ZOOM_PX doubles, round where the finger came down', `${s.f}`);
  ok(!of(acts, 'zoomIn').length && !of(acts, 'tap').length && !of(acts, 'pan').length && types(acts).endsWith('end'), '… and neither taps, zooms in a step nor pans', types(acts));
  const h = new Gestures();
  tap(h, 300, 300, 1000);
  const up = [...h.downAt(2, 'touch', 300, 300, 1200), ...h.moveTo(2, 300, 300 - ZOOM_PX, 1300), ...h.upAt(2, 300, 300 - ZOOM_PX, 1350)];
  ok(near(sum(up).f, 0.5, 1e-9), 'one-finger zoom: sliding up zooms out', `${sum(up).f}`);
}
{
  // Pinch: spread from 100 px apart to 200, the midpoint moving 30 px right.
  const g = new Gestures();
  const acts = [...g.downAt(1, 'touch', 150, 200, 1000), ...g.downAt(2, 'touch', 250, 200, 1010)];
  for (let i = 1; i <= 10; i++) {
    const k = i / 10;
    acts.push(...g.moveTo(1, 150 - 50 * k + 30 * k, 200, 1010 + 30 * i), ...g.moveTo(2, 250 + 50 * k + 30 * k, 200, 1015 + 30 * i));
  }
  const s = sum(acts);
  ok(near(s.f, 2, 1e-9) && near(s.dx, 30, 1e-9) && near(s.dy, 0), 'pinch: zooms by the change in spread and follows the midpoint', `${s.f} ${s.dx}`);
  // One finger lifts; the other drags on, from where it is.
  const lift = g.upAt(1, 130, 200, 1400);
  const on = [...g.moveTo(2, 360, 200, 1450), ...g.moveTo(2, 380, 200, 1500)];
  ok(!of(lift, 'end').length && near(sum(on).dx, 50), 'pinch: the finger left drags on without a jump', `${sum(on).dx}`);
  const end = g.upAt(2, 380, 200, 1800);
  ok(types(end) === 'end' && g.down === 0, '… and lifting it ends the gesture, with no tap', types(end));
}
{
  // Two-finger tap.
  const g = new Gestures();
  const acts = [...g.downAt(1, 'touch', 100, 300, 1000), ...g.downAt(2, 'touch', 180, 320, 1040), ...g.moveTo(2, 182, 321, 1080), ...g.upAt(1, 100, 300, 1150), ...g.upAt(2, 182, 321, 1170)];
  const z = of(acts, 'zoomOut')[0];
  ok(!!z && near(z.x, 140) && near(z.y, 310) && !of(acts, 'tap').length && !of(acts, 'zoom').length, 'a two-finger tap zooms out round the midpoint', types(acts));
  const h = new Gestures();
  const slow = [...h.downAt(1, 'touch', 100, 300, 1000), ...h.downAt(2, 'touch', 180, 320, 1040), ...h.upAt(1, 100, 300, 1000 + TWO_MS + 50), ...h.upAt(2, 180, 320, 1000 + TWO_MS + 80)];
  ok(!of(slow, 'zoomOut').length && types(slow).endsWith('end'), 'two fingers held too long are no two-finger tap', types(slow));
  const k = new Gestures();
  const late = [...k.downAt(1, 'touch', 100, 300, 1000), ...k.downAt(2, 'touch', 180, 320, 1500), ...k.upAt(1, 100, 300, 1550), ...k.upAt(2, 180, 320, 1560)];
  ok(!of(late, 'zoomOut').length, 'a second finger long after the first is no two-finger tap', types(late));
  const m = new Gestures();
  const moved = [...m.downAt(1, 'touch', 100, 300, 1000), ...m.downAt(2, 'touch', 180, 320, 1030), ...m.moveTo(2, 230, 320, 1080), ...m.upAt(1, 100, 300, 1150), ...m.upAt(2, 230, 320, 1170)];
  ok(!of(moved, 'zoomOut').length && of(moved, 'zoom').length > 0, 'two fingers that spread are a pinch, not a tap', types(moved));
}
{
  const g = new Gestures();
  g.downAt(1, 'touch', 10, 10, 1000);
  g.downAt(2, 'touch', 90, 10, 1010);
  ok(!g.downAt(3, 'touch', 50, 50, 1020).length && g.down === 2, 'a third finger is left out');
  ok(!g.moveTo(3, 70, 70, 1030).length && !g.upAt(3, 70, 70, 1040).length, '… and its moves and lift do nothing');
  const c = new Gestures();
  c.downAt(1, 'touch', 10, 10, 1000);
  const x = c.cancel(1, 1050);
  ok(types(x) === 'end' && c.down === 0, 'a finger the browser takes back ends the gesture, with no tap', types(x));
  ok(types(tap(c, 10, 10, 1100)) === 'tap end', '… and starts no double-tap');
}

console.log(fails ? `${fails} FAILED` : 'all passed');
// Node runs this file (npm test); the site's type check knows only the browser.
const node = (globalThis as { process?: { exitCode?: number } }).process;
if (fails && node) node.exitCode = 1;
