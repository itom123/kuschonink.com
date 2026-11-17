// The outside of the house that the floor plans don't give: the roof, from the roof plan
// (屋顶平面图) and the south elevation. In metres, plan x → x, plan y → z, up is y.
// Used by the 3D house (/house/3d) and by the small turning house beside the floor buttons.
//
// All three ridges are at the roof plan's 11.160 (the roof's floor level). The roof's edge is
// 410 mm out from the attic's walls, at 8.050 on the elevation, so the attic has knee walls
// about 1.35 m high under the eaves. (The 7.350 on the elevation is the attic windows' sills.)

/** The eaves, above ±0.000: the bottom of the roof's edge. */
export const EAVE = 8.05;

export interface Gable {
  /** The roof's outline in plan, eaves and gable ends included. */
  x: [number, number];
  z: [number, number];
  /** The ridge runs down the middle, along x or along z. */
  axis: 'x' | 'z';
  /** Height of its eaves, if not EAVE. */
  eave?: number;
  /** A gable end with no wall under it, which the roof fills in: the end at z[1]. */
  open?: boolean;
}

/**
 * The main roof, east to west, with gable ends east and west; a wing running north into it
 * with its gable facing north; and a gable facing south over the attic terrace.
 * A roof along z that starts inside one along x runs into it: it begins where it comes out
 * of that roof's slope, and that slope is cut away under it (the valleys on the roof plan).
 */
export const GABLES: Gable[] = [
  { x: [-0.41, 14.41], z: [5.79, 13.21], axis: 'x' }, // ridge at z 9.5, slopes of 83.9 %
  { x: [-0.41, 8.21], z: [2.39, 9.5], axis: 'z' }, // ridge at x 3.9, slopes of 71.35 %
  { x: [3.2, 11.2], z: [9.5, 13.21], axis: 'z', eave: 8.8, open: true }, // ridge at x 7.2; eaves at 8.8 on the elevation
];

export type V3 = [number, number, number];
export interface Slope {
  /**
   * Its surface, as convex polygons that meet corner to corner (no corner of one lies along
   * another's edge, which would leave hairline cracks), so fill each around its middle.
   */
  pieces: V3[][];
  /** Its edges: eaves, rakes, ridge, valleys. */
  edges: [V3, V3][];
  /** Tiles, as lines running down the slope every 0.7 m. */
  stripes: [V3, V3][];
  /** Unit normal, pointing up. */
  n: V3;
}
export interface Roof {
  slopes: Slope[];
  /** Gable ends, as triangles: `open` ones have no wall under them. */
  ends: { pts: V3[]; open: boolean }[];
  /** The roof's edges, for boards: eaves and rakes. */
  trims: [V3, V3][];
  /** Height of the roof over a point, or null outside it. */
  at(x: number, z: number): number | null;
}

const STRIPE = 0.7;

/** The points of `pts` that lie along a→b strictly between its ends, in order from a. */
function between(a: V3, b: V3, pts: V3[]) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const found = new Map<string, { t: number; p: V3 }>();
  for (const p of pts) {
    const v = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const t = (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / len2;
    if (t < 1e-6 || t > 1 - 1e-6) continue;
    const off = Math.hypot(v[0] - d[0] * t, v[1] - d[1] * t, v[2] - d[2] * t);
    if (off < 1e-6) found.set(p.map((c) => c.toFixed(6)).join(','), { t, p });
  }
  return [...found.values()].sort((m, n) => m.t - n.t).map((f) => f.p);
}

/** The roof, with its ridges at `ridge` (the roof's floor level). */
export function roofOf(ridge: number): Roof {
  const R = ridge;
  const eaveOf = (g: Gable) => g.eave ?? EAVE;
  const heightOf = (g: Gable, x: number, z: number) => {
    if (x < g.x[0] - 1e-6 || x > g.x[1] + 1e-6 || z < g.z[0] - 1e-6 || z > g.z[1] + 1e-6) return null;
    const [c, [lo, hi]] = g.axis === 'x' ? [z, g.z] : [x, g.x];
    const half = (hi - lo) / 2;
    return eaveOf(g) + (R - eaveOf(g)) * (1 - Math.abs(c - (lo + hi) / 2) / half);
  };
  const normal = (p: V3[]): V3 => {
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const w = [p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]];
    let n: V3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
    const l = Math.hypot(...n);
    return [n[0] / l, n[1] / l, n[2] / l];
  };

  /** How a wing (along z) runs into a host (along x): `side` +1 runs south, −1 north. */
  interface Join { w: Gable; side: 1 | -1; outer: number; sR: number; sE: number; sEnd: number }
  const joins = new Map<Gable, { host: Gable; join: Join }>();
  const wingsOf = new Map<Gable, Join[]>();
  for (const w of GABLES) {
    if (w.axis !== 'z') continue;
    for (const o of GABLES) {
      if (o.axis !== 'x' || o.x[0] > w.x[0] || o.x[1] < w.x[1]) continue;
      const within = (z: number) => z > o.z[0] && z < o.z[1];
      const side = within(w.z[0]) ? 1 : within(w.z[1]) ? -1 : 0;
      if (!side) continue;
      const zm = (o.z[0] + o.z[1]) / 2, L = (o.z[1] - o.z[0]) / 2, E = eaveOf(o), e = eaveOf(w);
      const inner = side === 1 ? w.z[0] : w.z[1], outer = side === 1 ? w.z[1] : w.z[0];
      // s: distance from the host's ridge towards the wing. Its ridge comes out of the host's
      // slope at sR, its eaves at sE; the host is cut away under it as far as sEnd.
      const sR = Math.max(0, side * (inner - zm));
      const sE = Math.min(L, Math.max(sR, ((R - e) / (R - E)) * L));
      const join: Join = { w, side, outer, sR, sE, sEnd: Math.min(L, side * (outer - zm)) };
      joins.set(w, { host: o, join });
      wingsOf.set(o, [...(wingsOf.get(o) ?? []), join]);
      break;
    }
  }

  const slopes: Slope[] = [];
  const ends: Roof['ends'] = [];
  const trims: [V3, V3][] = [];
  for (const g of GABLES) {
    const e = eaveOf(g);
    if (g.axis === 'x') {
      const [x0, x1] = g.x, zm = (g.z[0] + g.z[1]) / 2, L = (g.z[1] - g.z[0]) / 2;
      const y = (s: number) => R - ((R - e) * s) / L;
      for (const side of [-1, 1] as const) {
        const P = (x: number, s: number): V3 => [x, y(s), zm + side * s];
        const wings = (wingsOf.get(g) ?? []).filter((j) => j.side === side).sort((a, b) => a.w.x[0] - b.w.x[0]);
        const pieces: V3[][] = [], edges: [V3, V3][] = [], stripes: [V3, V3][] = [];
        edges.push([P(x0, 0), P(x1, 0)], [P(x0, 0), P(x0, L)], [P(x1, 0), P(x1, L)]);
        let x = x0;
        const plain = (a: number, b: number) => {
          if (b - a < 1e-6) return;
          pieces.push([P(a, L), P(b, L), P(b, 0), P(a, 0)]);
          edges.push([P(a, L), P(b, L)]);
          trims.push([P(a, L), P(b, L)]);
        };
        for (const j of wings) {
          plain(x, j.w.x[0]);
          const [a, b] = j.w.x, xm = (a + b) / 2;
          // Left of the wing's ridge, right of it, and below where the wing ends.
          pieces.push([P(a, j.sE), P(xm, j.sR), P(xm, 0), P(a, 0)], [P(xm, j.sR), P(b, j.sE), P(b, 0), P(xm, 0)]);
          edges.push([P(a, j.sE), P(xm, j.sR)], [P(xm, j.sR), P(b, j.sE)], [P(a, j.sE), P(a, j.sEnd)], [P(b, j.sE), P(b, j.sEnd)]);
          if (j.sEnd < L - 1e-6) {
            pieces.push([P(a, L), P(b, L), P(b, j.sEnd), P(a, j.sEnd)]);
            edges.push([P(a, j.sEnd), P(b, j.sEnd)], [P(a, L), P(b, L)]);
            trims.push([P(a, L), P(b, L)]);
          }
          x = b;
        }
        plain(x, x1);
        // Tiles down the slope; under a wing, down to the valley (and on below it).
        const n = Math.max(1, Math.round((x1 - x0) / STRIPE));
        for (let k = 1; k < n; k++) {
          const sx = x0 + ((x1 - x0) * k) / n;
          const j = wings.find((v) => sx > v.w.x[0] && sx < v.w.x[1]);
          if (!j) { stripes.push([P(sx, 0), P(sx, L)]); continue; }
          const xm = (j.w.x[0] + j.w.x[1]) / 2, edge = sx < xm ? j.w.x[0] : j.w.x[1];
          const valley = j.sR + ((j.sE - j.sR) * (sx - xm)) / (edge - xm);
          if (valley > 1e-6) stripes.push([P(sx, 0), P(sx, valley)]);
          if (j.sEnd < L - 1e-6) stripes.push([P(sx, j.sEnd), P(sx, L)]);
        }
        slopes.push({ pieces, edges, stripes, n: normal(pieces[0]) });
      }
      for (const ex of [x0, x1]) {
        const pts: V3[] = [[ex, e, g.z[0]], [ex, R, zm], [ex, e, g.z[1]]];
        ends.push({ pts, open: false });
        trims.push([pts[0], pts[1]], [pts[1], pts[2]]);
      }
    } else {
      const [x0, x1] = g.x, xm = (x0 + x1) / 2;
      const j = joins.get(g)?.join;
      // Without a host the roof runs its whole length, from z[0] to z[1].
      const zR = j ? zAt(g, j, j.sR) : g.z[0], zE = j ? zAt(g, j, j.sE) : g.z[0], outer = j ? j.outer : g.z[1];
      for (const xa of [x0, x1]) {
        const p: V3[] = [[xa, e, zE], [xa, e, outer], [xm, R, outer], [xm, R, zR]];
        const edges: [V3, V3][] = [[p[0], p[1]], [p[1], p[2]], [p[2], p[3]], [p[3], p[0]]];
        trims.push([p[0], p[1]]);
        const stripes: [V3, V3][] = [];
        const z0 = Math.min(zR, outer), z1 = Math.max(zR, outer);
        const n = Math.max(1, Math.round((z1 - z0) / STRIPE));
        for (let k = 1; k < n; k++) {
          const z = z0 + ((z1 - z0) * k) / n;
          // Down to the eave, or to the valley where the wing comes out of its host.
          const t = Math.abs(zE - zR) < 1e-6 ? 1 : Math.min(1, Math.abs(z - zR) / Math.abs(zE - zR));
          stripes.push([[xm, R, z], [xm + (xa - xm) * t, R + (e - R) * t, z]]);
        }
        slopes.push({ pieces: [p], edges, stripes, n: normal(p) });
      }
      for (const ez of j ? [outer] : [g.z[0], g.z[1]]) {
        const pts: V3[] = [[x0, e, ez], [xm, R, ez], [x1, e, ez]];
        ends.push({ pts, open: !!g.open && ez === g.z[1] });
        trims.push([pts[0], pts[1]], [pts[1], pts[2]]);
      }
    }
  }

  function zAt(w: Gable, j: Join, s: number) {
    const o = joins.get(w)!.host;
    return (o.z[0] + o.z[1]) / 2 + j.side * s;
  }

  // Where a corner of one piece lies along another's edge (a slope cut at a valley next to
  // one that isn't, a ridge cut at different places on its two sides), add it to that edge.
  const corners = slopes.flatMap((sl) => sl.pieces.flat());
  for (const sl of slopes) sl.pieces = sl.pieces.map((poly) => poly.flatMap((a, i) => [a, ...between(a, poly[(i + 1) % poly.length], corners)]));

  return {
    slopes, ends, trims,
    at(x, z) {
      let best: number | null = null;
      for (const g of GABLES) {
        const h = heightOf(g, x, z);
        if (h !== null && (best === null || h > best)) best = h;
      }
      return best;
    },
  };
}
