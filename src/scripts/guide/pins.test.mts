// npm test: map density (src/scripts/guide/pins.ts): how far apart shows
// must be at each zoom, the cluster radius that follows, and that it really
// caps the shows per km².
import { BASE_R, cluster, densityRadius, sameSpot, spacingAt, SPACING, type Pt } from './pins.ts';
import { metresPerPixel } from '../../lib/guides/core.ts';

let fails = 0;
const ok = (cond: boolean, name: string, extra = '') => {
  if (!cond) fails++;
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};

const LAT = 48.86; // Paris
const mpp = (z: number) => metresPerPixel(LAT, z);
const r = (z: number, phone = false) => densityRadius(z, mpp(z), phone);
const zooms = Array.from({ length: 13 }, (_, i) => 10 + i * 0.5); // 10 … 16

ok(zooms.every((z) => r(z) >= BASE_R.desktop && r(z, true) >= BASE_R.phone), 'never smaller than a pin (desktop) or a fingertip (phone)');
ok(r(16) === BASE_R.desktop && r(16, true) === BASE_R.phone && r(15.5) === BASE_R.desktop, 'no cap at street level', `${r(16)} ${r(16, true)}`);
ok(zooms.every((z) => r(z, true) >= r(z)), 'phones keep shows further apart than desktops', zooms.map((z) => `${z}:${r(z)}/${r(z, true)}`).join(' '));
ok(zooms.slice(1).every((z, i) => r(z) <= r(zooms[i]) && r(z, true) <= r(zooms[i], true)), 'zooming in never merges more (the radius never grows)', zooms.map((z) => r(z)).join(' '));
ok(r(12, true) > BASE_R.phone + 8 && r(12) > BASE_R.desktop + 6, 'the whole city in view: clearly fewer pins than before (14 / 26 px)', `${r(12)} / ${r(12, true)}`);
ok(r(13.0) === r(13.2) && r(13.2) === r(13.49) && r(13.5) === r(13.9), 'half-zoom steps: a pinch within a step changes nothing', `${r(13)} ${r(13.2)} ${r(13.49)} ${r(13.5)}`);
ok(spacingAt(12.5, false) > spacingAt(13, false) && spacingAt(12.5, false) < spacingAt(12, false), 'between two zooms, in between', `${spacingAt(12.5, false)}`);
ok(spacingAt(9, true) === SPACING.phone[0][1] * 4 && r(9, true) === r(11, true) && spacingAt(20, true) === 0, 'beyond the table: further out keeps the same distance on screen; closer in, none');

// The cap itself: a dense neighbourhood (300 shows in 2 km × 2 km), clustered
// at a zoom; what stays on screen (single pins and cluster buttons) per km²
// is at most about (1000 / d)², with room for the greedy packing.
function seeded(n: number) {
  let s = 1234567;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, mx: rnd() * 2000, my: rnd() * 2000 }));
}
const shows = seeded(300);
for (const phone of [false, true]) {
  for (const z of [11, 12, 13, 14]) {
    const m = mpp(z);
    const pts: Pt[] = shows.map((p) => ({ id: p.id, x: p.mx / m, y: p.my / m, pr: 30 }));
    const groups = cluster(pts, r(z, phone));
    const taken = new Set(groups.flatMap((g) => g.ids));
    const markers = groups.length + pts.filter((p) => !taken.has(p.id)).length;
    const d = spacingAt(Math.floor(z * 2) / 2, phone);
    const cap = d ? (1000 / d) ** 2 * 4 : Infinity; // 4 km² in all
    ok(markers <= cap * 2, `${phone ? 'phone' : 'desktop'} z${z}: at most about ${(cap / 4).toFixed(1)} shows per km² on screen`, `${markers} markers in 4 km² (cap ${cap.toFixed(0)})`);
  }
}

// Shows at one place: a list, not a zoom.
ok(sameSpot([{ x: 10, y: 10 }, { x: 10.2, y: 10.1 }, { x: 10, y: 10 }], 3, 26), 'shows at the same venue: one spot (open the list)');
ok(!sameSpot([{ x: 10, y: 10 }, { x: 40, y: 10 }], 3, 26), 'shows a street apart: not one spot (zoom in)');

console.log(fails ? `\n${fails} failed` : '\nall passed');
// Node runs this file (npm test); the site's type check knows only the browser.
const node = (globalThis as { process?: { exitCode?: number } }).process;
if (fails && node) node.exitCode = 1;
