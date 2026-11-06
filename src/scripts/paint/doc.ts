// The picture: one canvas, the overlay for previews, and Undo / Redo.
// Every change is an "operation": begin() keeps a copy of the picture, the
// tool draws and reports the area it touched, commit() keeps only that area's
// before (and, once undone, after) for history. Memory is capped, so phones
// keep a shorter history rather than running out.

import type { Box } from './fill';

type Entry =
  | { kind: 'area'; x: number; y: number; before: ImageData; after?: ImageData }
  | { kind: 'whole'; before: ImageData; after?: ImageData };

const MAX_ENTRIES = 60;
const MAX_BYTES = 80 * 1024 * 1024;

export class PaintDoc {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly overlay: HTMLCanvasElement;
  readonly octx: CanvasRenderingContext2D;
  /** The picture as it was when the current operation began. */
  private snap = document.createElement('canvas');
  private sctx = this.snap.getContext('2d', { willReadFrequently: true })!;
  private dirty: Box | null = null;
  private inOp = false;
  private undoList: Entry[] = [];
  private redoList: Entry[] = [];
  /** After every change (draw, undo, redo, resize): autosave, menus, status bar. */
  onChange: () => void = () => {};

  constructor(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement) {
    this.canvas = canvas;
    this.overlay = overlay;
    // Read often (fill, Pick Color, Undo): kept in memory rather than on the graphics card.
    this.ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })!;
    this.octx = overlay.getContext('2d')!;
  }

  get width() { return this.canvas.width; }
  get height() { return this.canvas.height; }
  get busy() { return this.inOp; }
  get canUndo() { return this.undoList.length > 0; }
  get canRedo() { return this.redoList.length > 0; }

  /** A fresh picture filled with one colour (no history). */
  reset(w: number, h: number, color = '#ffffff') {
    this.setSize(w, h);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, w, h);
    this.undoList = [];
    this.redoList = [];
    this.onChange();
  }

  private setSize(w: number, h: number) {
    for (const c of [this.canvas, this.overlay, this.snap]) {
      c.width = w;
      c.height = h;
    }
    this.ctx.imageSmoothingEnabled = false;
  }

  // ---- Operations ----
  begin() {
    if (this.inOp) return;
    this.inOp = true;
    this.dirty = null;
    this.sctx.globalCompositeOperation = 'copy';
    this.sctx.drawImage(this.canvas, 0, 0);
  }

  /** The tool drew in this box (any coordinates; clipped here). */
  touch(x: number, y: number, w: number, h: number) {
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w)), y1 = Math.min(this.height, Math.ceil(y + h));
    if (x1 <= x0 || y1 <= y0) return;
    const d = this.dirty;
    if (!d) this.dirty = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    else {
      const nx = Math.min(d.x, x0), ny = Math.min(d.y, y0);
      this.dirty = { x: nx, y: ny, w: Math.max(d.x + d.w, x1) - nx, h: Math.max(d.y + d.h, y1) - ny };
    }
  }

  /** Keep the operation in history (if it changed anything). */
  commit() {
    if (!this.inOp) return;
    this.inOp = false;
    const d = this.dirty;
    this.dirty = null;
    if (!d) return;
    this.push({ kind: 'area', x: d.x, y: d.y, before: this.sctx.getImageData(d.x, d.y, d.w, d.h) });
  }

  /** Undo the operation in progress (a second finger arrived, Escape). */
  cancel() {
    if (!this.inOp) return;
    this.inOp = false;
    const d = this.dirty;
    this.dirty = null;
    if (d) this.ctx.drawImage(this.snap, d.x, d.y, d.w, d.h, d.x, d.y, d.w, d.h);
  }

  /** The picture as it was when the operation began (for tools that redraw from it). */
  get original() { return this.snap; }

  /**
   * A change to the whole picture (flip, rotate, resize, open, clear): `fn`
   * draws the new picture; the old one is kept for Undo.
   */
  whole(fn: () => void) {
    if (this.inOp) this.commit();
    const before = this.ctx.getImageData(0, 0, this.width, this.height);
    fn();
    this.push({ kind: 'whole', before });
  }

  /** Set the picture's size, keeping what fits and filling the rest. */
  resize(w: number, h: number, fill: string) {
    if (w === this.width && h === this.height) return;
    this.whole(() => {
      const keep = document.createElement('canvas');
      keep.width = this.width;
      keep.height = this.height;
      keep.getContext('2d')!.drawImage(this.canvas, 0, 0);
      this.setSize(w, h);
      this.ctx.fillStyle = fill;
      this.ctx.fillRect(0, 0, w, h);
      this.ctx.drawImage(keep, 0, 0);
    });
  }

  /** Replace the picture with another one, at its size. */
  replace(src: CanvasImageSource, w: number, h: number) {
    this.whole(() => {
      this.setSize(w, h);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, w, h);
      this.ctx.drawImage(src, 0, 0, w, h);
    });
  }

  // ---- History ----
  private push(e: Entry) {
    this.undoList.push(e);
    this.redoList = [];
    this.trim();
    this.onChange();
  }

  private trim() {
    const size = (e: Entry) => e.before.data.length + (e.after?.data.length ?? 0);
    let total = [...this.undoList, ...this.redoList].reduce((n, e) => n + size(e), 0);
    while (this.undoList.length > 1 && (this.undoList.length > MAX_ENTRIES || total > MAX_BYTES)) total -= size(this.undoList.shift()!);
  }

  undo() {
    if (this.inOp) this.cancel();
    const e = this.undoList.pop();
    if (!e) return;
    if (e.kind === 'area') {
      e.after ??= this.ctx.getImageData(e.x, e.y, e.before.width, e.before.height);
      this.ctx.putImageData(e.before, e.x, e.y);
    } else {
      e.after ??= this.ctx.getImageData(0, 0, this.width, this.height);
      this.setSize(e.before.width, e.before.height);
      this.ctx.putImageData(e.before, 0, 0);
    }
    this.redoList.push(e);
    this.onChange();
  }

  redo() {
    const e = this.redoList.pop();
    if (!e?.after) return;
    if (e.kind === 'area') this.ctx.putImageData(e.after, e.x, e.y);
    else {
      this.setSize(e.after.width, e.after.height);
      this.ctx.putImageData(e.after, 0, 0);
    }
    this.undoList.push(e);
    this.onChange();
  }

  // ---- Reading ----
  /** True while the picture is plain white (nothing drawn yet). */
  isBlank(): boolean {
    const { data } = this.ctx.getImageData(0, 0, this.width, this.height);
    for (let i = 0; i < data.length; i += 4) if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) return false;
    return true;
  }

  /** The picture as a PNG. */
  toBlob(scale = 1): Promise<Blob | null> {
    let src = this.canvas;
    if (scale !== 1) {
      src = document.createElement('canvas');
      src.width = Math.max(1, Math.round(this.width * scale));
      src.height = Math.max(1, Math.round(this.height * scale));
      const c = src.getContext('2d')!;
      c.imageSmoothingQuality = 'high';
      c.drawImage(this.canvas, 0, 0, src.width, src.height);
    }
    return new Promise((resolve) => src.toBlob(resolve, 'image/png'));
  }

  clearOverlay() {
    this.octx.clearRect(0, 0, this.width, this.height);
  }
}
