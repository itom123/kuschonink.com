// A tiny pixel-art canvas. Icons and mouse pointers are drawn here at build
// time (no bitmaps from Windows), then written out as crisp SVG.
// Colours are one-letter codes from PALETTE; '.' is transparent.

export const PALETTE: Record<string, string> = {
  k: '#000000', // black
  w: '#ffffff', // white
  s: '#c0c0c0', // silver (button face)
  u: '#dfdfdf', // light grey (bevel)
  g: '#808080', // grey
  d: '#404040', // dark grey
  n: '#000080', // navy
  b: '#0000ff', // blue
  a: '#a6caf0', // sky blue
  t: '#008080', // teal
  c: '#00ffff', // cyan
  r: '#ff0000', // red
  m: '#800000', // maroon
  y: '#ffff00', // yellow
  h: '#ffffcc', // pale yellow (paper, folder light)
  o: '#808000', // olive
  e: '#008000', // green
  l: '#00ff00', // lime
  p: '#800080', // purple
  f: '#ff00ff', // fuchsia
  x: '#c08040', // tan (wood)
  z: '#fffbf0', // cream
  q: '#8a5a2b', // dark wood
};

export class Canvas {
  readonly px: string[][];
  constructor(readonly w = 32, readonly h = 32) {
    this.px = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  }
  get(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y][x] : '.';
  }
  set(x: number, y: number, c: string) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y][x] = c;
    return this;
  }
  /** Filled rectangle. */
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }
  /** 1-pixel rectangle outline. */
  box(x: number, y: number, w: number, h: number, c: string) {
    return this.rect(x, y, w, 1, c).rect(x, y + h - 1, w, 1, c).rect(x, y, 1, h, c).rect(x + w - 1, y, 1, h, c);
  }
  /** Bresenham line. */
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }
  /** Filled polygon (pixel centres inside, even-odd). */
  poly(pts: [number, number][], c: string) {
    for (let y = 0; y < this.h; y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] - 0.5); x++) this.set(x, y, c);
      }
    }
    return this;
  }
  /** Filled ellipse centred on (cx, cy) in pixel units (use .5 for odd sizes). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1.0) this.set(x, y, c);
      }
    }
    return this;
  }
  disc(cx: number, cy: number, r: number, c: string) {
    return this.ellipse(cx, cy, r, r, c);
  }
  /** Raised Windows bevel around a face. */
  raised(x: number, y: number, w: number, h: number, face = 's') {
    this.rect(x, y, w, h, face);
    this.rect(x, y, w - 1, 1, 'w').rect(x, y, 1, h - 1, 'w');
    this.rect(x, y + h - 1, w, 1, 'k').rect(x + w - 1, y, 1, h, 'k');
    this.rect(x + 1, y + h - 2, w - 2, 1, 'g').rect(x + w - 2, y + 1, 1, h - 2, 'g');
    return this;
  }
  /** Sunken Windows bevel around a face. */
  sunken(x: number, y: number, w: number, h: number, face = 'w') {
    this.rect(x, y, w, h, face);
    this.rect(x, y, w - 1, 1, 'g').rect(x, y, 1, h - 1, 'g');
    this.rect(x + 1, y + 1, w - 3, 1, 'k').rect(x + 1, y + 1, 1, h - 3, 'k');
    this.rect(x, y + h - 1, w, 1, 'w').rect(x + w - 1, y, 1, h, 'w');
    return this;
  }
  /** Checkerboard of one colour over a region (dithering). */
  dither(x: number, y: number, w: number, h: number, c: string, phase = 0) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if ((x + i + y + j + phase) % 2 === 0) this.set(x + i, y + j, c);
    return this;
  }
  /** Stamp a small map; '.' and ' ' leave pixels unchanged. */
  stamp(x: number, y: number, rows: string[]) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.' && ch !== ' ') this.set(x + i, y + j, ch); }));
    return this;
  }
  /** Draw colour c around every painted pixel (4-neighbours) where it's transparent. */
  outline(c = 'k') {
    const add: [number, number][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.px[y][x] !== '.') continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.get(x + dx, y + dy) !== '.')) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, c);
    return this;
  }
  /** Replace one colour with another inside a region. */
  swap(from: string, to: string, x = 0, y = 0, w = this.w, h = this.h) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.get(i, j) === from) this.set(i, j, to);
    return this;
  }
  rows() {
    return this.px.map((r) => r.join(''));
  }
}

/** Pixel rows → SVG with one path per colour (horizontal runs). */
export function toSvg(rows: string[], palette = PALETTE): string {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const paths = new Map<string, string>();
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') { x++; continue; }
      if (!(ch in palette)) throw new Error(`pixels: unknown colour "${ch}"`);
      let n = 1;
      while (row[x + n] === ch) n++;
      paths.set(ch, (paths.get(ch) ?? '') + `M${x} ${y}h${n}v1h-${n}z`);
      x += n;
    }
  });
  let body = '';
  for (const [ch, d] of paths) body += `<path fill="${palette[ch]}" d="${d}"/>`;
  // Every edge sits on a whole pixel, so at 1× and 2× the art stays sharp;
  // at 16 px it downsamples smoothly instead of dropping lines.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

/** SVG markup → CSS url() with a compact data URI. */
export function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${svg.replace(/"/g, "'").replace(/[<>#%{}]/g, (ch) => encodeURIComponent(ch))}")`;
}
