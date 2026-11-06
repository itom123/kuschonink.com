// The drawing tools. Each takes pointer samples in picture pixels
// (down → move… → up) and draws through the PaintDoc, which keeps Undo.
// Hard-edged tools (pencil, eraser, airbrush, square brush) put down whole
// pixels, as in 1998; the round and slanted brushes and the shapes are
// smoothed, and the round brush follows a pen's pressure.
import { AIRBRUSH_SIZES, BRUSHES, ERASER_SIZES, LINE_WIDTHS, type FillStyle } from '../../lib/paint';
import type { PaintDoc } from './doc';
import { floodFill } from './fill';

export interface Pt {
  x: number;
  y: number;
  /** 0–1; 0.5 for a mouse button, the real pressure for a pen. */
  pressure: number;
  type: string;
  /** Right button (or a pen's barrel button): paints with the background colour. */
  right: boolean;
  shift: boolean;
  ctrl: boolean;
}

export interface Options {
  brush: number;
  eraser: number;
  airbrush: number;
  line: number;
  fill: FillStyle;
  zoom: number;
  /** Selections and text carry the background colour (opaque) or let the picture show through. */
  opaque: boolean;
  font: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
}

export interface Host {
  doc: PaintDoc;
  opts: Options;
  /** The colour this stroke paints with (foreground, or background with the right button). */
  ink(): string;
  /** The other colour (inside "outline and fill" shapes). */
  paper(): string;
  /** The background colour (the eraser, what a moved selection leaves behind). */
  background(): string;
  /** Pick Color: preview while pressing, then keep. */
  picked(color: string, done: boolean): void;
  magnify(p: Pt, out: boolean): void;
  /** The status bar's size field: a shape's width × height while drawing. */
  measure(w: number, h: number): void;
}

export interface Tool {
  down(p: Pt): void;
  move(p: Pt): void;
  up(p: Pt): void;
  /** Take back what this stroke did (a second finger arrived, Escape). */
  cancel(): void;
  /** The pointer moves without pressing (mouse, pen hovering): previews. */
  hover?(p: Pt | null): void;
  /** Put down anything still open (switching tools, sending, saving). */
  finish?(): void;
}

const floor = Math.floor;

/** Every pixel on the line from a to b (Bresenham). */
export function eachPixel(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void) {
  x0 = floor(x0); y0 = floor(y0); x1 = floor(x1); y1 = floor(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

const hexRgba = (hex: string): [number, number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

// ---- Pencil: one pixel, hard ----
class Pencil implements Tool {
  private last: [number, number] | null = null;
  constructor(private host: Host) {}
  private plot = (x: number, y: number) => {
    this.host.doc.ctx.fillRect(x, y, 1, 1);
    this.host.doc.touch(x, y, 1, 1);
  };
  down(p: Pt) {
    const { doc } = this.host;
    doc.begin();
    doc.ctx.fillStyle = this.host.ink();
    this.last = [p.x, p.y];
    eachPixel(p.x, p.y, p.x, p.y, this.plot);
  }
  move(p: Pt) {
    if (!this.last) return;
    this.host.doc.ctx.fillStyle = this.host.ink();
    eachPixel(this.last[0], this.last[1], p.x, p.y, this.plot);
    this.last = [p.x, p.y];
  }
  up() {
    this.last = null;
    this.host.doc.commit();
  }
  cancel() {
    this.last = null;
    this.host.doc.cancel();
  }
}

// ---- Brush: smoothed strokes, stamped along the path ----
interface Sample { x: number; y: number; p: number }

class Brush implements Tool {
  private prev: Sample | null = null;
  private mid: Sample | null = null;
  private pressure = 0.5;
  private pen = false;
  constructor(private host: Host) {}

  private get brush() { return BRUSHES[this.host.opts.brush] ?? BRUSHES[1]; }

  /** A pen draws thinner when pressed lightly, wider when pressed hard. */
  private sizeAt(pressure: number) {
    const base = this.brush.size;
    if (!this.pen) return base;
    return Math.max(1, base * Math.min(1.35, 0.2 + pressure * 1.15));
  }

  private stamps(list: Sample[]) {
    if (!list.length) return;
    const { doc } = this.host;
    const ctx = doc.ctx;
    const { shape } = this.brush;
    ctx.save();
    ctx.fillStyle = ctx.strokeStyle = this.host.ink();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    if (shape === 'square') {
      for (const s of list) {
        const w = Math.max(1, Math.round(this.sizeAt(s.p)));
        const x = Math.round(s.x - w / 2), y = Math.round(s.y - w / 2);
        ctx.fillRect(x, y, w, w);
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + w);
      }
    } else {
      ctx.beginPath();
      for (const s of list) {
        const size = this.sizeAt(s.p);
        if (shape === 'round') {
          const r = Math.max(0.6, size / 2);
          ctx.moveTo(s.x + r, s.y);
          ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        } else {
          // A short slanted nib, like a calligraphy pen: / or \.
          const v = (size / 2) * Math.SQRT1_2;
          const sx = shape === 'slash' ? 1 : -1;
          ctx.moveTo(s.x - v * sx, s.y + v);
          ctx.lineTo(s.x + v * sx, s.y - v);
        }
        x0 = Math.min(x0, s.x - size); y0 = Math.min(y0, s.y - size); x1 = Math.max(x1, s.x + size); y1 = Math.max(y1, s.y + size);
      }
      if (shape === 'round') ctx.fill();
      else {
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
    ctx.restore();
    doc.touch(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
  }

  /** Points along a quadratic curve from a to b bending towards c, spaced for the brush. */
  private along(a: Sample, c: Sample, b: Sample): Sample[] {
    const len = Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y);
    const spacing = this.brush.shape === 'square' ? 1 : this.brush.shape === 'round' ? Math.max(0.5, this.sizeAt(b.p) * 0.18) : 0.6;
    const n = Math.max(1, Math.ceil(len / spacing));
    const out: Sample[] = [];
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y, p: a.p + (b.p - a.p) * t });
    }
    return out;
  }

  down(p: Pt) {
    this.host.doc.begin();
    this.pen = p.type === 'pen';
    this.pressure = p.pressure || 0.5;
    const s = { x: p.x, y: p.y, p: this.pressure };
    this.prev = this.mid = s;
    this.stamps([s]);
  }
  move(p: Pt) {
    if (!this.prev || !this.mid) return;
    // Pressure is smoothed a little: pens report it in steps.
    this.pressure += ((p.pressure || 0.5) - this.pressure) * 0.45;
    const cur = { x: p.x, y: p.y, p: this.pressure };
    if (Math.hypot(cur.x - this.prev.x, cur.y - this.prev.y) < 0.35) return;
    const mid = { x: (this.prev.x + cur.x) / 2, y: (this.prev.y + cur.y) / 2, p: (this.prev.p + cur.p) / 2 };
    this.stamps(this.along(this.mid, this.prev, mid));
    this.mid = mid;
    this.prev = cur;
  }
  up(p: Pt) {
    if (this.prev && this.mid) {
      const end = { x: p.x, y: p.y, p: this.pressure };
      this.stamps(this.along(this.mid, this.prev, end));
    }
    this.prev = this.mid = null;
    this.host.doc.commit();
  }
  cancel() {
    this.prev = this.mid = null;
    this.host.doc.cancel();
  }
}

// ---- Airbrush: a spray of single pixels, more the longer you hold ----
class Airbrush implements Tool {
  private at: Pt | null = null;
  private frame = 0;
  private last = 0;
  constructor(private host: Host) {}
  private get radius() { return (AIRBRUSH_SIZES[this.host.opts.airbrush] ?? AIRBRUSH_SIZES[1]) / 2; }
  private spray(n: number) {
    const p = this.at;
    if (!p) return;
    const { doc } = this.host;
    const r = this.radius;
    doc.ctx.fillStyle = this.host.ink();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = r * Math.sqrt(Math.random());
      doc.ctx.fillRect(floor(p.x + Math.cos(a) * d), floor(p.y + Math.sin(a) * d), 1, 1);
    }
    doc.touch(p.x - r - 1, p.y - r - 1, r * 2 + 2, r * 2 + 2);
  }
  /** Dots per millisecond: denser for a bigger nozzle, and for a pen pressed hard. */
  private rate() {
    const r = this.radius;
    const pressure = this.at?.type === 'pen' ? 0.4 + (this.at.pressure || 0.5) * 1.2 : 1;
    return (r * r * 0.0065 + 0.08) * pressure;
  }
  private tick = (t: number) => {
    if (!this.at) return;
    const dt = Math.min(50, t - this.last);
    this.last = t;
    this.spray(Math.round(this.rate() * dt));
    this.frame = requestAnimationFrame(this.tick);
  };
  down(p: Pt) {
    this.host.doc.begin();
    this.at = p;
    this.spray(Math.max(2, Math.round(this.rate() * 16)));
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }
  move(p: Pt) {
    this.at = p;
  }
  up() {
    cancelAnimationFrame(this.frame);
    this.at = null;
    this.host.doc.commit();
  }
  cancel() {
    cancelAnimationFrame(this.frame);
    this.at = null;
    this.host.doc.cancel();
  }
}

// ---- Eraser: a hard square of the background colour ----
class Eraser implements Tool {
  private last: [number, number] | null = null;
  constructor(private host: Host) {}
  get size() { return ERASER_SIZES[this.host.opts.eraser] ?? ERASER_SIZES[1]; }
  private rub = (x: number, y: number) => {
    const s = this.size, o = floor(s / 2);
    this.host.doc.ctx.fillRect(x - o, y - o, s, s);
    this.host.doc.touch(x - o, y - o, s, s);
  };
  down(p: Pt) {
    this.host.doc.begin();
    this.host.doc.ctx.fillStyle = this.host.background();
    this.last = [p.x, p.y];
    eachPixel(p.x, p.y, p.x, p.y, this.rub);
    this.hover(p);
  }
  move(p: Pt) {
    if (!this.last) return;
    this.host.doc.ctx.fillStyle = this.host.background();
    eachPixel(this.last[0], this.last[1], p.x, p.y, this.rub);
    this.last = [p.x, p.y];
    this.hover(p);
  }
  up() {
    this.last = null;
    this.host.doc.commit();
  }
  cancel() {
    this.last = null;
    this.host.doc.cancel();
  }
  /** The eraser's square, outlined where it will rub (mouse and pen). */
  hover(p: Pt | null) {
    const { doc } = this.host;
    doc.clearOverlay();
    if (!p || p.type === 'touch') return;
    const s = this.size, o = floor(s / 2);
    const x = floor(p.x) - o, y = floor(p.y) - o;
    doc.octx.fillStyle = '#000';
    doc.octx.fillRect(x, y, s, 1);
    doc.octx.fillRect(x, y + s - 1, s, 1);
    doc.octx.fillRect(x, y, 1, s);
    doc.octx.fillRect(x + s - 1, y, 1, s);
  }
  finish() {
    this.host.doc.clearOverlay();
  }
}

// ---- Fill With Color ----
class Fill implements Tool {
  private at: Pt | null = null;
  constructor(private host: Host) {}
  down(p: Pt) { this.at = p; }
  move(p: Pt) { this.at = p; }
  up(p: Pt) {
    if (!this.at) return;
    this.at = null;
    const { doc } = this.host;
    const img = doc.ctx.getImageData(0, 0, doc.width, doc.height);
    const box = floodFill(img, p.x, p.y, hexRgba(this.host.ink()));
    if (!box) return;
    doc.begin();
    doc.ctx.putImageData(img, 0, 0, box.x, box.y, box.w, box.h);
    doc.touch(box.x, box.y, box.w, box.h);
    doc.commit();
  }
  cancel() { this.at = null; }
}

// ---- Pick Color: press, slide to the colour you want, let go ----
class Picker implements Tool {
  /** The picture's pixels, read once when the press begins. */
  private px: ImageData | null = null;
  constructor(private host: Host) {}
  private read(p: Pt, done: boolean) {
    const img = this.px;
    if (!img) return;
    const x = Math.floor(p.x), y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
    const i = (y * img.width + x) * 4;
    const hex = `#${[img.data[i], img.data[i + 1], img.data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    this.host.picked(hex, done);
  }
  down(p: Pt) {
    const { doc } = this.host;
    this.px = doc.ctx.getImageData(0, 0, doc.width, doc.height);
    this.read(p, false);
  }
  move(p: Pt) { this.read(p, false); }
  up(p: Pt) {
    this.read(p, true);
    this.px = null;
  }
  cancel() { this.px = null; }
}

// ---- Magnifier: click to zoom in there, again (or the right button) to zoom out ----
class Magnifier implements Tool {
  private on = false;
  constructor(private host: Host) {}
  down() { this.on = true; }
  move() {}
  up(p: Pt) {
    if (!this.on) return;
    this.on = false;
    this.host.magnify(p, p.right);
  }
  cancel() { this.on = false; }
}

// ---- Line, Rectangle, Ellipse: dragged out on the overlay, then put down ----
type ShapeKind = 'line' | 'rect' | 'ellipse';

class Shape implements Tool {
  private from: Pt | null = null;
  private to: Pt | null = null;
  constructor(private host: Host, private kind: ShapeKind) {}

  private end(p: Pt): Pt {
    if (!this.from || !p.shift) return p;
    const dx = p.x - this.from.x, dy = p.y - this.from.y;
    if (this.kind === 'line') {
      // Hold Shift: the nearest multiple of 45°.
      const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      return { ...p, x: this.from.x + Math.round(Math.cos(a) * len), y: this.from.y + Math.round(Math.sin(a) * len) };
    }
    const s = Math.max(Math.abs(dx), Math.abs(dy));
    return { ...p, x: this.from.x + Math.sign(dx || 1) * s, y: this.from.y + Math.sign(dy || 1) * s };
  }

  private draw(ctx: CanvasRenderingContext2D, a: Pt, b: Pt) {
    const w = LINE_WIDTHS[this.host.opts.line] ?? 1;
    const ink = this.host.ink(), paper = this.host.paper();
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.lineWidth = w;
    let box: [number, number, number, number];
    if (this.kind === 'line') {
      const off = w % 2 ? 0.5 : 0;
      const ax = floor(a.x) + off, ay = floor(a.y) + off, bx = floor(b.x) + off, by = floor(b.y) + off;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      box = [Math.min(ax, bx) - w, Math.min(ay, by) - w, Math.abs(bx - ax) + w * 2, Math.abs(by - ay) + w * 2];
      this.host.measure(Math.abs(floor(b.x) - floor(a.x)) + 1, Math.abs(floor(b.y) - floor(a.y)) + 1);
    } else {
      const x0 = floor(Math.min(a.x, b.x)), y0 = floor(Math.min(a.y, b.y));
      const bw = floor(Math.max(a.x, b.x)) - x0 + 1, bh = floor(Math.max(a.y, b.y)) - y0 + 1;
      const style = this.host.opts.fill;
      const fill = style === 'solid' ? ink : style === 'both' ? paper : null;
      const stroke = style !== 'solid';
      ctx.fillStyle = fill ?? ink;
      if (this.kind === 'rect') {
        if (stroke && (bw <= w * 2 || bh <= w * 2)) ctx.fillRect(x0, y0, bw, bh);
        else {
          if (fill) ctx.fillRect(x0, y0, bw, bh);
          if (stroke) ctx.strokeRect(x0 + w / 2, y0 + w / 2, bw - w, bh - w);
        }
      } else {
        const rx = Math.max(0.5, bw / 2 - (stroke ? w / 2 : 0)), ry = Math.max(0.5, bh / 2 - (stroke ? w / 2 : 0));
        ctx.beginPath();
        ctx.ellipse(x0 + bw / 2, y0 + bh / 2, rx, ry, 0, 0, Math.PI * 2);
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
      }
      box = [x0 - 1, y0 - 1, bw + 2, bh + 2];
      this.host.measure(bw, bh);
    }
    ctx.restore();
    return box;
  }

  down(p: Pt) {
    this.host.doc.begin();
    this.from = this.to = p;
    this.preview();
  }
  move(p: Pt) {
    if (!this.from) return;
    this.to = this.end(p);
    this.preview();
  }
  private preview() {
    const { doc } = this.host;
    doc.clearOverlay();
    if (this.from && this.to) this.draw(doc.octx, this.from, this.to);
  }
  up(p: Pt) {
    if (!this.from) return;
    const { doc } = this.host;
    doc.clearOverlay();
    const box = this.draw(doc.ctx, this.from, this.end(p));
    doc.touch(...box);
    doc.commit();
    this.from = this.to = null;
  }
  cancel() {
    this.from = this.to = null;
    this.host.doc.clearOverlay();
    this.host.doc.cancel();
  }
  finish() {
    this.host.doc.clearOverlay();
  }
}

export function makeTool(id: string, host: Host): Tool | null {
  switch (id) {
    case 'pencil': return new Pencil(host);
    case 'brush': return new Brush(host);
    case 'airbrush': return new Airbrush(host);
    case 'eraser': return new Eraser(host);
    case 'fill': return new Fill(host);
    case 'picker': return new Picker(host);
    case 'zoom': return new Magnifier(host);
    case 'line':
    case 'rect':
    case 'ellipse':
      return new Shape(host, id);
  }
  return null;
}

