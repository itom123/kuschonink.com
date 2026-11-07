// Field Guide (导览): the heat map (热力图). An ordered dither (Bayer 4×4) over
// a ramp of web-safe colours, from peach at the faint edge to a deep red-black
// at the densest cores (--gd-heat-1 … in guide-map.css; a scheme may override
// them). Every lit cell is one palette colour: between two steps the Bayer
// pattern mixes them, so the heat changes gradually, the Windows 98 way. The
// canvas is half the CSS resolution, shown with image-rendering:pixelated.
//
// Density goes through a log curve, so dense cores keep their gradations. At
// city zoom the reference is fixed, so days compare honestly; zoomed in, the
// ramp stretches to the densest point drawn, so a close-up of a busy quarter
// still shows several steps. At most MAX_COVER of the cells are lit, and far
// fewer at street level (attenuation()), so the map's streets and names show
// through: there a blob is wider than the window, and the colour alone says
// how hot the quarter is.

export type RGB = [number, number, number];
export interface HeatPt { x: number; y: number; w: number }

const hexRGB = (h: string): RGB => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
/** The ramp, light to dark, from the 216 web-safe colours and with no yellow: the defaults of --gd-heat-1 … --gd-heat-7. */
export const RAMP: readonly RGB[] = ['#ffcc99', '#ff9966', '#ff6633', '#ff3300', '#cc0000', '#990000', '#660000'].map(hexRGB);

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
/** Density below which a cell stays unlit, and the share of cells lit at the faint edge and at the core. */
export const FLOOR = 0.12, MIN_COVER = 0.25, MAX_COVER = 0.5;
/** At city zoom, the density that reaches the darkest step (about six top-tier places close together). */
export const DREF = 6;
/** Zoomed in, the ramp never stretches below this, so one lone place doesn't look like a busy core. */
export const MIN_REF = 2;
/** How far the ramp stretches to the densest point drawn: not at all up to scale 1, fully from scale 2. */
export const stretch = (s: number) => smooth(1, 2, s);

/**
 * Fill RGBA pixels (cols × rows cells). Points are in cell coordinates, the
 * radius in cells, `s` the camera scale. Returns the densest point drawn and
 * the density that reached the darkest step.
 */
export function heatPixels(data: Uint8ClampedArray, cols: number, rows: number, pts: HeatPt[], r: number, ramp: readonly RGB[], s: number) {
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
  let peak = 0;
  for (let i = 0; i < dens.length; i++) if (dens[i] > peak) peak = dens[i];
  // Fixed at city zoom; zoomed in, blended towards the densest point drawn (the view and its margin).
  const ref = DREF + (Math.max(peak, MIN_REF) - DREF) * stretch(s);
  const lref = Math.log1p(ref), atten = attenuation(s), n = ramp.length - 1;
  data.fill(0);
  if (n < 0) return { peak, ref };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const D = dens[i];
      // A trace of a far kernel's tail stays unlit, so the zone has an edge.
      if (D <= FLOOR) continue;
      const v = clamp01(Math.log1p(D) / lref);
      // From a quarter of the cells at the edge to half at the core, thinned when zoomed in.
      const cover = (MIN_COVER + (MAX_COVER - MIN_COVER) * v) * atten;
      const b = BAYER[(y & 3) * 4 + (x & 3)];
      if (b >= cover) continue;
      // Between two steps, the lit cells with the lowest thresholds take the darker one.
      const t = v * n, j = Math.min(Math.max(n - 1, 0), Math.floor(t));
      const col = ramp[b < cover * (t - j) ? j + 1 : j];
      const o = i * 4;
      data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
    }
  }
  return { peak, ref };
}

/** The ramp from --gd-heat-1 … (up to eight steps, light to dark), or the defaults when fewer than two are set. */
export function readRamp(css: { getPropertyValue(name: string): string }): RGB[] {
  const ramp: RGB[] = [];
  for (let i = 1; i <= 8; i++) {
    const v = css.getPropertyValue(`--gd-heat-${i}`);
    if (!v.trim()) break;
    ramp.push(parseColour(v, RAMP[Math.min(i, RAMP.length) - 1]));
  }
  return ramp.length > 1 ? ramp : RAMP.map((c) => [...c] as RGB);
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

/** Past the picture's detail the lattice thins again, to this share by scale 6: at street level a zone's blob is wider than the window. */
export const THIN = 0.25;
/**
 * Thinner when zoomed in: 1 up to scale 1, down to .5 from 1.7 (the picture's
 * street level), then on down to THIN × .5 from scale 6 (the tiles' street
 * level, where one blob fills the window), so street names show through.
 */
export const attenuation = (s: number) => Math.min(1, Math.max(0.5, (2.4 - s) / 1.4)) * (1 - (1 - THIN) * clamp01((s - 2) / 4));
/** Heat cells in CSS px: `base` (2) at city zoom, coarser from scale 1.75 (3), so each dot's step can be told apart; never bigger, or a dot hides a letter. */
export const cellSize = (s: number, base = 2) => Math.round(base * (s >= 1.75 ? 1.5 : 1));
