// npm test: the Field Guide heat map (src/scripts/guide/heat.ts).
import { attenuation, cellSize, DREF, heatPixels, MAX_COVER, MIN_REF, RAMP, readRamp, stretch, THIN, type HeatPt, type RGB } from './heat.ts';

let fails = 0;
const ok = (cond: boolean, name: string, extra = '') => {
  if (!cond) fails++;
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};

const W = 64, H = 64;
const key = (c: ArrayLike<number>) => `${c[0]},${c[1]},${c[2]}`;
const STEP = new Map(RAMP.map((c, i) => [key(c), i]));
const inCircle = (cx: number, cy: number, r: number) => (x: number, y: number) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < r * r;
/** Draw at camera scale `s`, then census the lit cells (within `only`, if given): count, steps used, off-palette and outside cells. */
function draw(pts: HeatPt[], r: number, s = 0.5, only?: (x: number, y: number) => boolean, within?: (x: number, y: number) => boolean) {
  const data = new Uint8ClampedArray(W * H * 4);
  const res = heatPixels(data, W, H, pts, r, RAMP, s);
  const n = { lit: 0, other: 0, outside: 0, steps: new Map<number, number>(), sum: 0, data, ...res };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (!data[o + 3] || (only && !only(x, y))) continue;
      n.lit++;
      const i = STEP.get(key(data.subarray(o, o + 3)));
      if (i === undefined) n.other++;
      else { n.steps.set(i, (n.steps.get(i) ?? 0) + 1); n.sum += i; }
      if (within && !within(x, y)) n.outside++;
    }
  }
  return n;
}
const pile = (k: number, x = 32, y = 32): HeatPt[] => Array.from({ length: k }, () => ({ x, y, w: 1 }));

{
  // The ramp: 6 to 8 web-safe steps, warm (no yellow), each darker than the last.
  const lum = ([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  ok(RAMP.length >= 6 && RAMP.length <= 8, 'ramp: 6 to 8 steps', `${RAMP.length}`);
  ok(RAMP.every((c) => c.every((v) => v % 51 === 0)), 'ramp: web-safe colours only');
  ok(RAMP.every(([r, g, b]) => g <= 0.8 * r && b <= g), 'ramp: warm, no yellow');
  ok(RAMP.every((c, i) => i === 0 || lum(c) < lum(RAMP[i - 1])), 'ramp: each step darker than the last');
  const fromCss = readRamp({ getPropertyValue: () => '' });
  ok(fromCss.length === RAMP.length && fromCss.every((c, i) => key(c) === key(RAMP[i])), 'readRamp: defaults when no steps are set');
}
{
  // A lone top-tier place: only palette colours, nothing beyond its radius, lighter outwards, never the darkest step.
  const n = draw([{ x: 32, y: 32, w: 1 }], 12, 0.5, undefined, inCircle(32, 32, 12));
  ok(n.lit > 0 && n.other === 0, 'lone point: palette colours only', `${n.lit} lit, ${n.other} other`);
  ok(n.outside === 0, 'lone point: nothing beyond its radius', `${n.outside}`);
  ok(!n.steps.has(RAMP.length - 1), 'lone point: not the darkest step', JSON.stringify([...n.steps]));
  ok(n.lit / (Math.PI * 144) > 0.15, 'lone point: a fair share of its disc lit', (n.lit / (Math.PI * 144)).toFixed(3));
  // Mean step by ring, from the centre out: never darker further out.
  const rings = [0, 3, 6, 9].map((a) => draw([{ x: 32, y: 32, w: 1 }], 12, 0.5, (x, y) => inCircle(32, 32, a + 3)(x, y) && !inCircle(32, 32, a)(x, y)));
  const means = rings.map((m) => m.sum / Math.max(1, m.lit));
  ok(means.every((m, i) => i === 0 || m <= means[i - 1]), 'lone point: lighter outwards', means.map((m) => m.toFixed(2)).join(' > '));
}
{
  // More places, darker: the mean step at the centre grows with the pile, and a big pile reaches the darkest step.
  const core = inCircle(32, 32, 3);
  const means = [1, 2, 4, 8].map((k) => { const m = draw(pile(k), 12, 0.5, core); return m.sum / Math.max(1, m.lit); });
  ok(means.every((m, i) => i === 0 || m > means[i - 1]), 'steps: darker with more places', means.map((m) => m.toFixed(2)).join(' < '));
  ok(draw(pile(8), 12, 0.5, core).steps.has(RAMP.length - 1), 'steps: a dense core reaches the darkest step');
}
{
  // However dense, at most MAX_COVER is lit (the map stays readable): in a 4×4 block that's 8 of 16 cells.
  const n = draw(pile(40), 40);
  let worst = 0;
  for (let by = 0; by < H; by += 4) {
    for (let bx = 0; bx < W; bx += 4) {
      let lit = 0;
      for (let y = by; y < by + 4; y++) for (let x = bx; x < bx + 4; x++) if (n.data[(y * W + x) * 4 + 3]) lit++;
      worst = Math.max(worst, lit / 16);
    }
  }
  ok(worst > 0.4 && worst <= MAX_COVER && MAX_COVER <= 0.6, 'cover: at most half a block, never above 60%', `${worst}`);
  ok(n.lit / (W * H) <= MAX_COVER, 'cover: never above MAX_COVER overall', (n.lit / (W * H)).toFixed(3));
  const thin = draw(pile(40), 40, 3);
  ok(thin.lit < n.lit * 0.6 && thin.lit > n.lit * 0.25, 'cover: thinner but still there at the picture\'s street level', `${thin.lit} of ${n.lit}`);
  // At the tiles' street level (a blob wider than the window) far fewer: one cell in sixteen, so street names show through.
  const blocks = (m: { data: Uint8ClampedArray }) => {
    let worst = 0;
    for (let by = 0; by < H; by += 4) for (let bx = 0; bx < W; bx += 4) {
      let lit = 0;
      for (let y = by; y < by + 4; y++) for (let x = bx; x < bx + 4; x++) if (m.data[(y * W + x) * 4 + 3]) lit++;
      worst = Math.max(worst, lit / 16);
    }
    return worst;
  };
  for (const s of [6, 16]) {
    const street = draw(pile(40), 40, s);
    ok(street.lit > 0 && street.lit < n.lit * 0.2 && blocks(street) <= 1 / 16 + 1e-9, `cover: at scale ${s} at most one cell in sixteen, and still there`, `${street.lit} of ${n.lit}, worst block ${blocks(street)}`);
  }
  const mid = draw(pile(40), 40, 4);
  ok(blocks(mid) <= 2 / 16 + 1e-9 && mid.lit < thin.lit && mid.lit > draw(pile(40), 40, 6).lit, 'cover: thins steadily between scale 2 and 6', `${mid.lit}, worst block ${blocks(mid)}`);
}
{
  // Street level still reads: the ramp's steps carry the heat (the core darker than the edge), with several of them in use.
  const core = inCircle(32, 32, 8), rim = (x: number, y: number) => inCircle(32, 32, 28)(x, y) && !inCircle(32, 32, 20)(x, y);
  for (const s of [6, 16]) {
    const all = draw(pile(20), 30, s), c = draw(pile(20), 30, s, core), r = draw(pile(20), 30, s, rim);
    ok(all.steps.size >= 4 && c.sum / Math.max(1, c.lit) > r.sum / Math.max(1, r.lit) + 1, `street level ${s}×: several steps, the core darker than the rim`, `${all.steps.size} steps, core ${(c.sum / Math.max(1, c.lit)).toFixed(2)} rim ${(r.sum / Math.max(1, r.lit)).toFixed(2)}`);
  }
}
{
  // City zoom: the reference is fixed, so a lone place looks the same whatever else is on the map.
  const lone: HeatPt = { x: 12, y: 12, w: 1 };
  const alone = draw([lone], 8, 0.5);
  const crowd = draw([lone, ...pile(20, 48, 48)], 8, 0.5, inCircle(12, 12, 8));
  ok(alone.ref === DREF && crowd.ref === DREF, 'city zoom: fixed reference', `${alone.ref} ${crowd.ref}`);
  ok(alone.sum === crowd.sum && alone.lit === crowd.lit, 'city zoom: a lone place unchanged by a crowd elsewhere');
}
{
  // Zoomed in: the ramp stretches to the densest point drawn, so a dense core shows several steps, not one colour.
  const core = inCircle(32, 32, 7.5);
  const far = draw(pile(20), 12, 0.5, core), near = draw(pile(20), 12, 2.5, core);
  const top = RAMP.length - 1;
  ok((far.steps.get(top) ?? 0) / far.lit > 0.9, 'stretch: at city zoom the core is one colour', JSON.stringify([...far.steps]));
  ok(near.steps.size >= 3 && (near.steps.get(top) ?? 0) / near.lit < 0.5, 'stretch: zoomed in it shows several steps', JSON.stringify([...near.steps]));
  ok(Math.abs(near.ref - near.peak) < 1e-6 && near.peak > DREF, 'stretch: the reference is the densest point', `${near.ref.toFixed(2)} ${near.peak.toFixed(2)}`);
  const mid = draw(pile(20), 12, 1.5);
  ok(mid.ref > DREF && mid.ref < mid.peak, 'stretch: blended between scale 1 and 2', mid.ref.toFixed(2));
  // A lone place close up: stretched, but never past MIN_REF, so it doesn't look like a busy core.
  const lone = draw([{ x: 32, y: 32, w: 1 }], 12, 3);
  ok(lone.ref === MIN_REF && !lone.steps.has(top), 'stretch: a lone place stays short of the darkest step', `${lone.ref}`);
}
{
  // A faint tail (below the floor) stays unlit, zero and NaN weights draw nothing, an empty ramp draws nothing.
  ok(draw([{ x: 32, y: 32, w: 0.05 }], 12).lit === 0, 'floor: a faint point lights nothing');
  ok(draw([{ x: 32, y: 32, w: 0 }, { x: 10, y: 10, w: NaN }], 12).lit === 0, 'weights: zero and NaN draw nothing');
  const data = new Uint8ClampedArray(W * H * 4);
  heatPixels(data, W, H, pile(3), 12, [], 0.5);
  ok(data.every((v) => v === 0), 'ramp: an empty ramp draws nothing');
}
{
  ok(attenuation(0.5) === 1 && attenuation(1) === 1, 'attenuation: 1 up to scale 1');
  ok(attenuation(1.7) === 0.5 && attenuation(2) === 0.5, 'attenuation: .5 at the picture\'s street level', `${attenuation(1.7)}`);
  ok(Math.abs(attenuation(4) - 0.5 * (1 + THIN) / 2) < 1e-9 && attenuation(6) === 0.5 * THIN && attenuation(16) === 0.5 * THIN && THIN >= 0.2 && THIN <= 0.4, 'attenuation: thins again from scale 2, to THIN × .5 from 6', `${attenuation(4)} ${attenuation(6)}`);
  ok([1, 2, 3, 4, 5, 6, 8].every((s, i, a) => i === 0 || attenuation(s) <= attenuation(a[i - 1])), 'attenuation: never thicker when zooming in');
  ok(stretch(0.9) === 0 && stretch(1.5) === 0.5 && stretch(2.2) === 1, 'stretch: none to scale 1, all from 2');
  ok(cellSize(0.5) === 2 && cellSize(2) === 3 && cellSize(3) === 3 && cellSize(16) === 3, 'cells: 2 px, then 3 px from scale 1.75, never bigger');
}

console.log(fails ? `${fails} FAILED` : 'all passed');
// Node runs this file (npm test); the site's type check knows only the browser.
const node = (globalThis as { process?: { exitCode?: number } }).process;
if (fails && node) node.exitCode = 1;
