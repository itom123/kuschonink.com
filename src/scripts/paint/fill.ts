// Fill With Color: a scanline flood fill on RGBA pixels. Pure (no DOM), so it
// can be tested on its own (src/scripts/paint/fill.test.mts).
//
// Hard-edged drawing (pencil, eraser, airbrush) fills exactly, as in 1998.
// Brush strokes and shapes have soft, anti-aliased edges; a plain fill would
// leave a pale halo inside them. So the pixels just outside the filled area
// are "unmixed": a pixel that is part ink and part old colour keeps its ink
// and swaps the old colour for the new one.

export interface Pixels { width: number; height: number; data: Uint8ClampedArray }
export interface Box { x: number; y: number; w: number; h: number }

/** Largest difference over the four channels (0–255). */
function dist(d: Uint8ClampedArray, i: number, c: ArrayLike<number>) {
  return Math.max(Math.abs(d[i] - c[0]), Math.abs(d[i + 1] - c[1]), Math.abs(d[i + 2] - c[2]), Math.abs(d[i + 3] - c[3]));
}

/**
 * Fill the area around (x, y) whose colour is within `tolerance` of the colour
 * there. Returns the box of changed pixels, or null if nothing changed.
 */
export function floodFill(img: Pixels, x: number, y: number, rgba: [number, number, number, number], tolerance = 24): Box | null {
  const { width: W, height: H, data: d } = img;
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  const at = (y * W + x) * 4;
  const seed = [d[at], d[at + 1], d[at + 2], d[at + 3]];
  if (dist(d, at, rgba) === 0) return null;

  // 1. The region: connected pixels close to the seed colour (scanline spans).
  const inside = new Uint8Array(W * H);
  const like = (p: number) => !inside[p] && dist(d, p * 4, seed) <= tolerance;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  const stack: number[] = [x, y];
  while (stack.length) {
    const sy = stack.pop()!;
    const sx = stack.pop()!;
    let l = sx;
    const row = sy * W;
    if (!like(row + l)) continue;
    while (l > 0 && like(row + l - 1)) l--;
    let r = sx;
    while (r < W - 1 && like(row + r + 1)) r++;
    for (let i = l; i <= r; i++) inside[row + i] = 1;
    if (l < x0) x0 = l;
    if (r > x1) x1 = r;
    if (sy < y0) y0 = sy;
    if (sy > y1) y1 = sy;
    for (const ny of [sy - 1, sy + 1]) {
      if (ny < 0 || ny >= H) continue;
      const nrow = ny * W;
      let i = l;
      while (i <= r) {
        if (like(nrow + i)) {
          stack.push(i, ny);
          while (i <= r && like(nrow + i)) i++;
        } else i++;
      }
    }
  }
  if (x1 < 0) return null;

  // 2. The pixels just outside it, with soft edges, before anything changes.
  const fx0 = Math.max(0, x0 - 1), fx1 = Math.min(W - 1, x1 + 1);
  const fy0 = Math.max(0, y0 - 1), fy1 = Math.min(H - 1, y1 + 1);
  const edge: [number, number][] = [];
  for (let py = fy0; py <= fy1; py++) {
    for (let px = fx0; px <= fx1; px++) {
      const p = py * W + px;
      if (inside[p]) continue;
      let touches = false;
      // The ink this pixel is made of: the strongest colour around it outside the region.
      let ink = -1, inkDist = dist(d, p * 4, seed);
      const own = inkDist;
      for (let dy = -1; dy <= 1; dy++) {
        const qy = py + dy;
        if (qy < 0 || qy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const qx = px + dx;
          if ((!dx && !dy) || qx < 0 || qx >= W) continue;
          const q = qy * W + qx;
          if (inside[q]) touches = true;
          else {
            const dq = dist(d, q * 4, seed);
            if (dq > inkDist) { inkDist = dq; ink = q; }
          }
        }
      }
      if (!touches || ink < 0 || own <= tolerance) continue;
      const a = own / inkDist; // how much of this pixel is ink
      if (a >= 0.97) continue;
      // Only a true blend lies between the old colour and the ink, channel by channel.
      let between = true;
      for (let c = 0; c < 4; c++) {
        const lo = Math.min(seed[c], d[ink * 4 + c]) - 24, hi = Math.max(seed[c], d[ink * 4 + c]) + 24;
        if (d[p * 4 + c] < lo || d[p * 4 + c] > hi) { between = false; break; }
      }
      if (between) edge.push([p, 1 - a]);
    }
  }

  // 3. Paint: the region gets the colour; soft edges get their share of it.
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const p = py * W + px;
      if (!inside[p]) continue;
      const i = p * 4;
      d[i] = rgba[0];
      d[i + 1] = rgba[1];
      d[i + 2] = rgba[2];
      d[i + 3] = rgba[3];
    }
  }
  for (const [p, share] of edge) {
    const i = p * 4;
    for (let c = 0; c < 4; c++) d[i + c] = d[i + c] + share * (rgba[c] - seed[c]);
  }
  return { x: fx0, y: fy0, w: fx1 - fx0 + 1, h: fy1 - fy0 + 1 };
}
