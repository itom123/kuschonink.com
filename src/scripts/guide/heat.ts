// Field Guide (导览): the heat map (热力图). An ordered dither (Bayer 4×4) in
// two palette colours, yellow and red (--gd-heat-lo / --gd-heat-hi), on a
// canvas at half the CSS resolution shown with image-rendering:pixelated.
// The normalisation is fixed, so days compare honestly.

export type RGB = [number, number, number];
export interface HeatPt { x: number; y: number; w: number }

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/**
 * Fill RGBA pixels (cols × rows cells). Points are in cell coordinates, the
 * radius in cells; `atten` thins the heat out when zoomed in.
 */
export function heatPixels(data: Uint8ClampedArray, cols: number, rows: number, pts: HeatPt[], r: number, lo: RGB, hi: RGB, atten: number) {
  const dens = new Float32Array(cols * rows);
  const r2 = r * r;
  for (const p of pts) {
    if (!(p.w > 0)) continue;
    const x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(cols - 1, Math.ceil(p.x + r));
    const y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(rows - 1, Math.ceil(p.y + r));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - p.y;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - p.x;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const k = 1 - d2 / r2;
        dens[y * cols + x] += p.w * k * k;
      }
    }
  }
  data.fill(0);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const D = dens[i];
      if (D <= 0) continue;
      // Full strength only where about four top-tier places overlap (fixed, so days compare honestly).
      const c = clamp01(D / 4) * atten;
      // At most half the cells are lit, and red only at the densest cores, so the map stays readable.
      const cover = 0.5 * c;
      const b = BAYER[(y & 3) * 4 + (x & 3)];
      if (b >= cover) continue;
      const col = b < cover * smooth(0.45, 1, c) ? hi : lo;
      const o = i * 4;
      data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
    }
  }
}

/** A CSS colour as RGB, through a canvas (custom properties come back as written). */
export function parseColour(css: string, fallback: RGB): RGB {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx || !css.trim()) return fallback;
  ctx.fillStyle = '#010203';
  ctx.fillStyle = css.trim();
  const v = String(ctx.fillStyle);
  if (v === '#010203' && css.trim() !== '#010203') return fallback;
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) { const n = parseInt(hex[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  const m = /rgba?\((\d+)\D+(\d+)\D+(\d+)/.exec(v);
  return m ? [+m[1], +m[2], +m[3]] : fallback;
}

/** Thinner when zoomed in: 1 up to scale 1, .5 at 1.7, down to .15 from 2.2 (street level). */
export const attenuation = (s: number) => Math.min(1, Math.max(0.15, (2.4 - s) / 1.4));
