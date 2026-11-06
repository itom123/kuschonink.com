// Select: drag out a rectangle, then drag inside it to move it. Moving lifts
// the pixels (the hole is filled with the background colour, as in 1998) and
// they float on the overlay until put down: click outside, change tools,
// press Enter or Escape. Ctrl+drag leaves a copy behind. With "transparent"
// chosen below the tool box, the background colour lets the picture show through.
import type { Host, Pt, Tool } from './tools';

type State = 'none' | 'drawing' | 'selected' | 'floating';
export interface Rect { x: number; y: number; w: number; h: number }

export interface SelectHost extends Host {
  zoom(): number;
  /** The selection appeared, changed or went (menus, status bar). */
  selectionChanged(): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

export class SelectTool implements Tool {
  state: State = 'none';
  r: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private start: { x: number; y: number } | null = null;
  private grab: { dx: number; dy: number } | null = null;
  /** The lifted pixels, and what is shown (without the background colour if transparent). */
  private raw: HTMLCanvasElement | null = null;
  private float: HTMLCanvasElement | null = null;

  constructor(private host: SelectHost, private marquee: HTMLElement) {}

  get active() { return this.state === 'selected' || this.state === 'floating'; }
  get floating() { return this.state === 'floating'; }

  inside(p: { x: number; y: number }) {
    const r = this.r;
    return this.active && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  }

  down(p: Pt) {
    if (this.inside(p)) {
      if (this.state === 'selected') this.lift(p.ctrl);
      else if (p.ctrl) this.stampCopy();
      this.grab = { dx: p.x - this.r.x, dy: p.y - this.r.y };
      return;
    }
    this.place();
    const { doc } = this.host;
    const x = clamp(Math.floor(p.x), 0, doc.width - 1), y = clamp(Math.floor(p.y), 0, doc.height - 1);
    this.start = { x, y };
    this.state = 'drawing';
    this.r = { x, y, w: 1, h: 1 };
    this.layout();
  }

  move(p: Pt) {
    if (this.grab) {
      this.r.x = Math.round(p.x - this.grab.dx);
      this.r.y = Math.round(p.y - this.grab.dy);
      this.show();
      return;
    }
    if (this.state !== 'drawing' || !this.start) return;
    const { doc } = this.host;
    const x = clamp(Math.floor(p.x), 0, doc.width - 1), y = clamp(Math.floor(p.y), 0, doc.height - 1);
    const x0 = Math.min(this.start.x, x), y0 = Math.min(this.start.y, y);
    this.r = { x: x0, y: y0, w: Math.max(this.start.x, x) - x0 + 1, h: Math.max(this.start.y, y) - y0 + 1 };
    this.host.measure(this.r.w, this.r.h);
    this.layout();
  }

  up() {
    if (this.grab) {
      this.grab = null;
      return;
    }
    if (this.state === 'drawing') {
      this.state = this.r.w > 1 || this.r.h > 1 ? 'selected' : 'none';
      this.start = null;
      this.layout();
      this.host.selectionChanged();
    }
  }

  /** Lift the selected pixels so they can move; `copy` leaves the original in place. */
  private lift(copy = false) {
    const { doc } = this.host;
    const r = this.r;
    doc.begin();
    this.raw = canvasOf(r.w, r.h);
    this.raw.getContext('2d')!.drawImage(doc.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    this.makeFloat();
    if (!copy) {
      doc.ctx.fillStyle = this.host.background();
      doc.ctx.fillRect(r.x, r.y, r.w, r.h);
      doc.touch(r.x, r.y, r.w, r.h);
    }
    this.state = 'floating';
    this.show();
  }

  /** Ctrl+drag a floating selection: put a copy down here and keep moving. */
  private stampCopy() {
    if (!this.float) return;
    const { doc } = this.host;
    doc.ctx.drawImage(this.float, this.r.x, this.r.y);
    doc.touch(this.r.x, this.r.y, this.r.w, this.r.h);
  }

  private makeFloat() {
    if (!this.raw) return;
    if (this.host.opts.opaque) {
      this.float = this.raw;
      return;
    }
    const c = canvasOf(this.raw.width, this.raw.height);
    const x = c.getContext('2d')!;
    x.drawImage(this.raw, 0, 0);
    const img = x.getImageData(0, 0, c.width, c.height);
    const bg = parseInt(this.host.background().slice(1), 16);
    const [r, g, b] = [(bg >> 16) & 255, (bg >> 8) & 255, bg & 255];
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) if (d[i] === r && d[i + 1] === g && d[i + 2] === b) d[i + 3] = 0;
    x.putImageData(img, 0, 0);
    this.float = c;
  }

  private show() {
    const { doc } = this.host;
    doc.clearOverlay();
    if (this.float) doc.octx.drawImage(this.float, this.r.x, this.r.y);
    this.layout();
  }

  /** Put a floating selection down, and forget the selection. */
  place() {
    const { doc } = this.host;
    if (this.state === 'floating' && this.float) {
      doc.ctx.drawImage(this.float, this.r.x, this.r.y);
      doc.touch(this.r.x, this.r.y, this.r.w, this.r.h);
      doc.clearOverlay();
      doc.commit();
    }
    this.clear();
  }

  private clear() {
    const had = this.state !== 'none';
    this.state = 'none';
    this.raw = this.float = null;
    this.grab = this.start = null;
    this.layout();
    if (had) this.host.selectionChanged();
  }

  cancel() {
    if (this.state === 'floating') {
      this.host.doc.clearOverlay();
      this.host.doc.cancel();
    }
    this.clear();
  }

  finish() {
    this.place();
  }

  // ---- The Edit and Image menus ----
  selectAll() {
    this.place();
    const { doc } = this.host;
    this.r = { x: 0, y: 0, w: doc.width, h: doc.height };
    this.state = 'selected';
    this.layout();
    this.host.selectionChanged();
  }

  /** Delete: the selection becomes background colour (or a lifted one is dropped). */
  remove() {
    const { doc } = this.host;
    if (this.state === 'floating') {
      doc.clearOverlay();
      doc.commit();
    } else if (this.state === 'selected') {
      doc.begin();
      doc.ctx.fillStyle = this.host.background();
      doc.ctx.fillRect(this.r.x, this.r.y, this.r.w, this.r.h);
      doc.touch(this.r.x, this.r.y, this.r.w, this.r.h);
      doc.commit();
    }
    this.clear();
  }

  /** The selected pixels as they look (for Copy), or null. */
  pixels(): HTMLCanvasElement | null {
    if (this.state === 'floating' && this.raw) return this.raw;
    if (this.state !== 'selected') return null;
    const c = canvasOf(this.r.w, this.r.h);
    c.getContext('2d')!.drawImage(this.host.doc.canvas, this.r.x, this.r.y, this.r.w, this.r.h, 0, 0, this.r.w, this.r.h);
    return c;
  }

  /** Paste: a picture floats at (x, y), ready to be moved. */
  paste(src: CanvasImageSource, w: number, h: number, x = 0, y = 0) {
    this.place();
    this.host.doc.begin();
    this.raw = canvasOf(w, h);
    this.raw.getContext('2d')!.drawImage(src, 0, 0, w, h);
    this.makeFloat();
    this.r = { x, y, w, h };
    this.state = 'floating';
    this.show();
    this.host.selectionChanged();
  }

  /** Flip, rotate or invert just the selection. */
  transform(fn: (src: HTMLCanvasElement) => HTMLCanvasElement) {
    if (this.state === 'selected') this.lift();
    if (!this.raw) return;
    const cx = this.r.x + this.r.w / 2, cy = this.r.y + this.r.h / 2;
    this.raw = fn(this.raw);
    this.r = { x: Math.round(cx - this.raw.width / 2), y: Math.round(cy - this.raw.height / 2), w: this.raw.width, h: this.raw.height };
    this.makeFloat();
    this.show();
  }

  /** Arrow keys move the selection a pixel at a time. */
  nudge(dx: number, dy: number) {
    if (this.state === 'selected') this.lift();
    if (this.state !== 'floating') return;
    this.r.x += dx;
    this.r.y += dy;
    this.show();
  }

  /** "Draw opaque" changed: show the floating pixels the new way. */
  refresh() {
    if (this.state !== 'floating') return;
    this.makeFloat();
    this.show();
  }

  /** Place the marching ants over the selection, at the current zoom. */
  layout() {
    const m = this.marquee;
    if (this.state === 'none') {
      m.hidden = true;
      return;
    }
    const z = this.host.zoom();
    m.hidden = false;
    m.style.left = `${this.r.x * z}px`;
    m.style.top = `${this.r.y * z}px`;
    m.style.width = `${Math.max(1, this.r.w * z)}px`;
    m.style.height = `${Math.max(1, this.r.h * z)}px`;
    m.classList.toggle('floating', this.state === 'floating');
  }
}
