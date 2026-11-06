// Paint: the program around the picture. The tool box, the colour box, the
// menus and toolbar, pointers of every kind (mouse, finger, pen), zoom,
// the clipboard, opening and saving, and keeping the picture in this browser.
// Page content in a window: it works on its own and asks the desktop
// (window.kus98) for dialogs, menus and sounds when it's there.
import {
  AIRBRUSH_SIZES, BRUSHES, COLOR_NAMES, ERASER_SIZES, FILL_STYLES, FONTS, FONT_SIZES, LINE_WIDTHS, MAX_SIDE, PALETTE, TOOLS, ZOOMS,
  type FillStyle, type ToolId,
} from '../../lib/paint';
import { editColors } from './colors';
import { PaintDoc } from './doc';
import { desktop, dialog, h, message, setAttr, setText, tr, type Bi } from './dom';
import type { MenuSpec } from '../desktop/menu';
import { canvasOf, SelectTool } from './select';
import { howItWorks, openSend } from './send';
import { forget, keep, kept } from './store';
import { TextTool } from './text';
import { makeTool, type Host, type Options, type Pt, type Tool } from './tools';

const SETTINGS = 'kus98:paint';
interface Saved {
  tool?: ToolId;
  fg?: string;
  bg?: string;
  palette?: string[];
  custom?: string[];
  opts?: Partial<Options>;
  hide?: string[];
}
const DEFAULTS: Options = { brush: 1, eraser: 1, airbrush: 1, line: 0, fill: 'outline', zoom: 4, opaque: true, font: 'serif', fontSize: 28, bold: false, italic: false };
const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const MIN_ZOOM = 0.25, MAX_ZOOM = 16;
/** Keys for the tools (shown in their tooltips). */
const KEYS: Record<ToolId, string> = { select: 'S', eraser: 'E', fill: 'F', picker: 'I', zoom: 'Z', pencil: 'P', brush: 'B', airbrush: 'A', text: 'T', line: 'L', rect: 'R', ellipse: 'O' };
const UNTITLED: Bi = { en: 'untitled', zh: '未命名' };
type Turn = 'flip-h' | 'flip-v' | 'rot90' | 'rot180' | 'rot270';

function turned(src: HTMLCanvasElement, how: Turn) {
  const swap = how === 'rot90' || how === 'rot270';
  const c = canvasOf(swap ? src.height : src.width, swap ? src.width : src.height);
  const x = c.getContext('2d')!;
  if (how === 'flip-h') x.setTransform(-1, 0, 0, 1, c.width, 0);
  if (how === 'flip-v') x.setTransform(1, 0, 0, -1, 0, c.height);
  if (how === 'rot90') x.setTransform(0, 1, -1, 0, c.width, 0);
  if (how === 'rot180') x.setTransform(-1, 0, 0, -1, c.width, c.height);
  if (how === 'rot270') x.setTransform(0, -1, 1, 0, 0, c.height);
  x.drawImage(src, 0, 0);
  return c;
}

function inverted(src: HTMLCanvasElement) {
  const c = canvasOf(src.width, src.height);
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(src, 0, 0);
  const img = x.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 255 - img.data[i];
    img.data[i + 1] = 255 - img.data[i + 1];
    img.data[i + 2] = 255 - img.data[i + 2];
  }
  x.putImageData(img, 0, 0);
  return c;
}

/** A small picture for an option under the tool box. */
function swatchCanvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const c = canvasOf(w, h);
  c.className = 'opt-pic';
  const x = c.getContext('2d')!;
  x.fillStyle = '#000';
  x.strokeStyle = '#000';
  draw(x);
  return c;
}

interface Stroke { id: number; type: string; right: boolean; tool: Tool; t0: number; dist: number; lx: number; ly: number }

export class PaintApp {
  readonly root: HTMLElement;
  readonly win: HTMLElement;
  readonly view: HTMLElement;
  readonly stage: HTMLElement;
  readonly doc: PaintDoc;
  private readonly artist: string;
  private readonly artistFull: string;
  private readonly sitekey?: string;
  private readonly toolsEl: HTMLElement;
  private readonly optionsEl: HTMLElement;
  private readonly fontbar: HTMLElement;
  private readonly paletteEl: HTMLElement;
  private readonly fgEl: HTMLElement;
  private readonly bgEl: HTMLElement;
  private readonly fields: HTMLElement[];
  private readonly select: SelectTool;
  private readonly text: TextTool;
  private readonly impls = new Map<ToolId, Tool>();

  tool: ToolId = 'brush';
  private prevTool: ToolId = 'brush';
  fg = '#000000';
  bg = '#ffffff';
  private palette = [...PALETTE];
  private custom = Array<string>(16).fill('#ffffff');
  readonly opts: Options = { ...DEFAULTS };
  zoom = 1;
  private grid = false;
  private hide = new Set<string>();
  private name: Bi = UNTITLED;
  /** Nothing would be lost by starting again (saved, sent, or new). */
  private saved = true;
  private ready = false;
  private readonly ac = new AbortController();

  private stroke: Stroke | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private gesture: { d0: number; z0: number; ix: number; iy: number } | null = null;
  private pan: { id: number; x: number; y: number; sl: number; st: number } | null = null;
  private resizing: { id: number; dir: string; x0: number; y0: number; w: number; h: number; ghost: HTMLElement } | null = null;
  private penAt = 0;
  private keepTimer = 0;
  private clip: HTMLCanvasElement | null = null;
  private fileInput: HTMLInputElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.win = root.closest<HTMLElement>('[data-window]') ?? root;
    this.view = root.querySelector('[data-view]')!;
    this.stage = root.querySelector('[data-stage]')!;
    this.toolsEl = root.querySelector('.paint-tools')!;
    this.optionsEl = root.querySelector('[data-options]')!;
    this.fontbar = root.querySelector('[data-fontbar]')!;
    this.paletteEl = root.querySelector('[data-palette]')!;
    this.fgEl = root.querySelector('[data-fg]')!;
    this.bgEl = root.querySelector('[data-bg]')!;
    this.fields = [...this.win.querySelectorAll<HTMLElement>(':scope > [data-window-inner] > .status-bar > .status-bar-field')];
    this.artist = root.dataset.artist || 'Xiangyin';
    this.artistFull = root.dataset.artistFull || this.artist;
    this.sitekey = root.dataset.sitekey || undefined;
    this.doc = new PaintDoc(root.querySelector<HTMLCanvasElement>('[data-canvas]')!, root.querySelector<HTMLCanvasElement>('[data-overlay]')!);

    const host: Host & { zoom(): number; selectionChanged(): void; stage: HTMLElement; foreground(): string } = {
      doc: this.doc,
      opts: this.opts,
      ink: () => (this.stroke?.right ? this.bg : this.fg),
      paper: () => (this.stroke?.right ? this.fg : this.bg),
      background: () => this.bg,
      foreground: () => this.fg,
      picked: (c, done) => this.picked(c, done),
      magnify: (p, out) => this.magnify(p, out),
      measure: (w, h) => this.say(2, `${w} × ${h}`),
      zoom: () => this.zoom,
      selectionChanged: () => this.sizeField(),
      stage: this.stage,
    };
    this.select = new SelectTool(host, root.querySelector('[data-marquee]')!);
    this.text = new TextTool(host);
    for (const t of TOOLS) {
      const impl = makeTool(t.id, host);
      if (impl) this.impls.set(t.id, impl);
    }
    this.fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
    root.append(this.fileInput);

    this.loadSettings();
    this.buildToolbox();
    this.buildFontbar();
    this.drawPalette();
    this.colors();
    this.applyHide();
    this.bind();
    this.doc.onChange = () => {
      this.saved = false;
      this.scheduleKeep();
      this.refresh();
    };
    void this.start();
  }

  // ---- Start-up: the kept picture, or a fresh one the size of the window ----
  private async start() {
    const k = await kept();
    let restored = false;
    if (k) {
      try {
        const bmp = await createImageBitmap(k.blob);
        this.doc.reset(bmp.width, bmp.height);
        this.doc.ctx.drawImage(bmp, 0, 0);
        bmp.close?.();
        if (k.title && k.title !== UNTITLED.en) this.name = { en: k.title, zh: k.title };
        restored = true;
      } catch { /* start fresh */ }
    }
    if (!restored) {
      const { w, h } = this.fitSize();
      this.doc.reset(w, h);
    }
    this.saved = !restored || this.doc.isBlank();
    this.setZoom(1);
    this.view.scrollTo(0, 0);
    this.setTitle();
    this.refresh();
    this.ready = true;
    this.root.dataset.ready = 'ready';
  }

  /** A picture that fills the space the window has for it. */
  private fitSize() {
    const w = Math.floor(this.view.clientWidth - 14), h = Math.floor(this.view.clientHeight - 14);
    if (w < 80 || h < 60) return { w: 640, h: 400 };
    return { w: clamp(w, 160, 1200), h: clamp(h, 120, 900) };
  }

  // ---- Settings (this browser only) ----
  private loadSettings() {
    let s: Saved = {};
    try { s = JSON.parse(localStorage.getItem(SETTINGS) || '{}') || {}; } catch { /* defaults */ }
    if (s.tool && TOOLS.some((t) => t.id === s.tool) && s.tool !== 'picker' && s.tool !== 'zoom') this.tool = this.prevTool = s.tool;
    if (isHex(s.fg)) this.fg = s.fg;
    if (isHex(s.bg)) this.bg = s.bg;
    if (Array.isArray(s.palette) && s.palette.length === PALETTE.length && s.palette.every(isHex)) this.palette = s.palette;
    if (Array.isArray(s.custom) && s.custom.length === 16 && s.custom.every(isHex)) this.custom = s.custom;
    const o = s.opts ?? {};
    const idx = (v: unknown, n: number, d: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : d);
    this.opts.brush = idx(o.brush, BRUSHES.length, DEFAULTS.brush);
    this.opts.eraser = idx(o.eraser, ERASER_SIZES.length, DEFAULTS.eraser);
    this.opts.airbrush = idx(o.airbrush, AIRBRUSH_SIZES.length, DEFAULTS.airbrush);
    this.opts.line = idx(o.line, LINE_WIDTHS.length, DEFAULTS.line);
    if (FILL_STYLES.includes(o.fill as FillStyle)) this.opts.fill = o.fill as FillStyle;
    if (ZOOMS.includes(o.zoom as number) && o.zoom !== 1) this.opts.zoom = o.zoom as number;
    if (typeof o.opaque === 'boolean') this.opts.opaque = o.opaque;
    if (FONTS.some((f) => f.id === o.font)) this.opts.font = o.font!;
    if (FONT_SIZES.includes(o.fontSize as number)) this.opts.fontSize = o.fontSize as number;
    this.opts.bold = !!o.bold;
    this.opts.italic = !!o.italic;
    if (Array.isArray(s.hide)) this.hide = new Set(s.hide.filter((x) => ['toolbox', 'colorbox', 'note', 'status'].includes(x)));
  }

  private saveSettings() {
    const s: Saved = { tool: this.tool === 'picker' || this.tool === 'zoom' ? this.prevTool : this.tool, fg: this.fg, bg: this.bg, palette: this.palette, custom: this.custom, opts: this.opts, hide: [...this.hide] };
    try { localStorage.setItem(SETTINGS, JSON.stringify(s)); } catch { /* memory only */ }
  }

  // ---- Keeping the picture in this browser ----
  private scheduleKeep() {
    clearTimeout(this.keepTimer);
    this.keepTimer = window.setTimeout(() => void this.keepNow(), 600);
  }
  private async keepNow() {
    clearTimeout(this.keepTimer);
    if (!this.ready) return;
    if (this.doc.busy) return this.scheduleKeep();
    const blob = await this.doc.toBlob();
    if (blob) await keep({ blob, w: this.doc.width, h: this.doc.height, title: this.name.en, at: Date.now() });
  }

  // ---- The tool box ----
  private current(): Tool {
    if (this.tool === 'select') return this.select;
    if (this.tool === 'text') return this.text;
    return this.impls.get(this.tool)!;
  }

  private buildToolbox() {
    for (const b of this.toolsEl.querySelectorAll<HTMLElement>('[data-tool]')) {
      const t = TOOLS.find((x) => x.id === b.dataset.tool)!;
      setAttr(b, 'title', { en: `${t.name.en} (${KEYS[t.id]})`, zh: `${t.name.zh}（${KEYS[t.id]}）` });
    }
    this.showTool();
  }

  setTool(id: ToolId) {
    if (id === this.tool) return;
    this.current().finish?.();
    this.doc.clearOverlay();
    if (this.tool !== 'picker' && this.tool !== 'zoom') this.prevTool = this.tool;
    this.tool = id;
    this.showTool();
    this.saveSettings();
  }

  private showTool() {
    for (const b of this.toolsEl.querySelectorAll<HTMLElement>('[data-tool]')) {
      const on = b.dataset.tool === this.tool;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    this.root.dataset.activeTool = this.tool;
    this.fontbar.hidden = this.tool !== 'text';
    this.buildOptions();
    this.hint();
  }

  /** The box under the tools: sizes, shapes and styles for the tool in hand. */
  private buildOptions() {
    const o = this.optionsEl;
    o.replaceChildren();
    o.dataset.for = this.tool;
    const opt = (label: Bi, on: boolean, pic: Node, act: () => void) => {
      const b = h('button', { type: 'button', class: 'paint-opt', 'aria-pressed': String(on), title: label, 'aria-label': label }, pic);
      b.addEventListener('click', () => {
        act();
        this.saveSettings();
        this.buildOptions();
        this.text.style();
      });
      return b;
    };
    const opaque = () => {
      const colour = (c: HTMLCanvasElement) => (c.classList.add('in-colour'), c);
      o.append(
        opt({ en: 'Opaque: the background colour covers what is underneath', zh: '不透明：背景色盖住下面的内容' }, this.opts.opaque, colour(swatchCanvas(30, 18, (c) => {
          c.fillStyle = '#f00'; c.beginPath(); c.arc(9, 9, 7, 0, 7); c.fill();
          c.fillStyle = '#fff'; c.fillRect(11, 2, 17, 14); c.strokeRect(11.5, 2.5, 16, 13);
          c.fillStyle = '#00f'; c.fillRect(15, 6, 9, 6);
        })), () => { this.opts.opaque = true; this.select.refresh(); }),
        opt({ en: 'Transparent: the background colour lets the picture show through', zh: '透明：背景色处透出下面的图片' }, !this.opts.opaque, colour(swatchCanvas(30, 18, (c) => {
          c.fillStyle = '#f00'; c.beginPath(); c.arc(9, 9, 7, 0, 7); c.fill();
          c.setLineDash([1, 1]); c.strokeRect(11.5, 2.5, 16, 13);
          c.fillStyle = '#00f'; c.fillRect(15, 6, 9, 6);
        })), () => { this.opts.opaque = false; this.select.refresh(); }),
      );
    };
    switch (this.tool) {
      case 'select':
      case 'text':
        opaque();
        break;
      case 'eraser':
        ERASER_SIZES.forEach((s, i) => o.append(opt({ en: `${s} × ${s} pixels`, zh: `${s} × ${s} 像素` }, this.opts.eraser === i, swatchCanvas(20, 14, (c) => {
          const w = Math.max(2, Math.round(s / 2.4));
          c.fillRect(Math.round(10 - w / 2), Math.round(7 - w / 2), w, w);
        }), () => (this.opts.eraser = i))));
        break;
      case 'zoom':
        ZOOMS.slice(1).forEach((z) => o.append(opt({ en: `Zoom to ${z * 100}%`, zh: `缩放到 ${z * 100}%` }, this.opts.zoom === z, h('span', { class: 'opt-text' }, `${z}x`), () => (this.opts.zoom = z))));
        break;
      case 'brush':
        BRUSHES.forEach((b, i) => {
          const names = { round: { en: 'Round', zh: '圆形' }, square: { en: 'Square', zh: '方形' }, slash: { en: 'Slanted /', zh: '斜笔 /' }, backslash: { en: 'Slanted \\', zh: '斜笔 \\' } }[b.shape];
          o.append(opt({ en: `${names.en}, ${b.size} pixels`, zh: `${names.zh}，${b.size} 像素` }, this.opts.brush === i, swatchCanvas(14, 14, (c) => {
            const s = Math.min(12, Math.max(2, Math.round(b.size * 0.75)));
            if (b.shape === 'round') { c.beginPath(); c.arc(7, 7, s / 2, 0, 7); c.fill(); }
            else if (b.shape === 'square') c.fillRect(Math.round(7 - s / 2), Math.round(7 - s / 2), s, s);
            else {
              const v = s / 2;
              c.lineWidth = 1.5;
              c.beginPath();
              if (b.shape === 'slash') { c.moveTo(7 - v, 7 + v); c.lineTo(7 + v, 7 - v); } else { c.moveTo(7 - v, 7 - v); c.lineTo(7 + v, 7 + v); }
              c.stroke();
            }
          }), () => (this.opts.brush = i)));
        });
        break;
      case 'airbrush':
        AIRBRUSH_SIZES.forEach((s, i) => o.append(opt({ en: `Spray ${s} pixels wide`, zh: `喷洒宽度 ${s} 像素` }, this.opts.airbrush === i, swatchCanvas(26, 26, (c) => {
          let seed = s * 7;
          const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
          const r = s / 2;
          for (let k = 0; k < r * 3; k++) {
            const a = rnd() * Math.PI * 2, d = r * Math.sqrt(rnd());
            c.fillRect(Math.floor(13 + Math.cos(a) * d), Math.floor(13 + Math.sin(a) * d), 1, 1);
          }
        }), () => (this.opts.airbrush = i))));
        break;
      case 'line':
      case 'rect':
      case 'ellipse': {
        if (this.tool !== 'line') {
          const styles: Record<FillStyle, Bi> = {
            outline: { en: 'Outline only', zh: '只画轮廓' },
            both: { en: 'Outline, filled with the other colour', zh: '轮廓，并用另一种颜色填充' },
            solid: { en: 'Filled, no outline', zh: '填充，无轮廓' },
          };
          FILL_STYLES.forEach((f) => o.append(opt(styles[f], this.opts.fill === f, swatchCanvas(30, 12, (c) => {
            if (f !== 'outline') { c.fillStyle = f === 'solid' ? '#000' : '#808080'; c.fillRect(2, 1, 26, 10); }
            if (f !== 'solid') c.strokeRect(2.5, 1.5, 25, 9);
          }), () => (this.opts.fill = f))));
        }
        LINE_WIDTHS.forEach((w, i) => o.append(opt({ en: `Lines ${w} pixel${w > 1 ? 's' : ''} wide`, zh: `线宽 ${w} 像素` }, this.opts.line === i, swatchCanvas(30, 9, (c) => c.fillRect(3, Math.round(4.5 - w / 2), 24, w)), () => (this.opts.line = i))));
        break;
      }
      default:
        o.append(h('span', { class: 'opt-none' }, ''));
    }
  }

  // ---- The Text tool's font bar ----
  private buildFontbar() {
    const fonts = h('select', { 'aria-label': { en: 'Font', zh: '字体' }, title: { en: 'Font', zh: '字体' } }, FONTS.map((f) => {
      const op = h('option', { value: f.id }, '');
      op.textContent = tr(f.name);
      op.dataset.textEn = f.name.en;
      op.dataset.textZh = f.name.zh;
      return op;
    }));
    fonts.value = this.opts.font;
    const sizes = h('select', { 'aria-label': { en: 'Size', zh: '字号' }, title: { en: 'Size (pixels)', zh: '字号（像素）' } }, FONT_SIZES.map((s) => h('option', { value: s }, String(s))));
    sizes.value = String(this.opts.fontSize);
    const toggle = (label: Bi, key: 'bold' | 'italic', glyph: string) => {
      const b = h('button', { type: 'button', class: `pf-toggle pf-${key}`, 'aria-pressed': String(this.opts[key]), title: label, 'aria-label': label }, glyph);
      b.addEventListener('click', () => {
        this.opts[key] = !this.opts[key];
        b.setAttribute('aria-pressed', String(this.opts[key]));
        this.text.style();
        this.saveSettings();
      });
      return b;
    };
    fonts.addEventListener('change', () => { this.opts.font = fonts.value; this.text.style(); this.saveSettings(); });
    sizes.addEventListener('change', () => { this.opts.fontSize = Number(sizes.value); this.text.style(); this.saveSettings(); });
    // Choosing a font shouldn't put the words down: keep the text box.
    for (const el of [fonts, sizes]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.fontbar.replaceChildren(
      h('span', { class: 'pf-title' }, { en: 'Fonts', zh: '字体' }),
      fonts,
      sizes,
      toggle({ en: 'Bold', zh: '粗体' }, 'bold', 'B'),
      toggle({ en: 'Italic', zh: '斜体' }, 'italic', 'I'),
    );
  }

  // ---- Colours ----
  private drawPalette() {
    const swatches = [...this.paletteEl.querySelectorAll<HTMLElement>('.paint-swatch')];
    swatches.forEach((b, i) => {
      const c = this.palette[i];
      b.style.setProperty('--c', c);
      b.dataset.color = c;
      if (c !== PALETTE[i]) {
        setAttr(b, 'title', { en: `Custom colour ${c}. Right-click (or press and hold) for the background colour; double-click to change it.`, zh: `自定义颜色 ${c}。右击（或长按）设为背景色；双击可以更改。` });
        setAttr(b, 'aria-label', { en: `Custom colour ${c}`, zh: `自定义颜色 ${c}` });
      } else {
        setAttr(b, 'aria-label', COLOR_NAMES[i]);
      }
    });
  }

  private colors() {
    this.fgEl.style.setProperty('--c', this.fg);
    this.bgEl.style.setProperty('--c', this.bg);
    this.root.style.setProperty('--fg', this.fg);
    this.text.style();
  }

  private setColor(which: 'fg' | 'bg', c: string) {
    this[which] = c;
    this.colors();
    this.saveSettings();
  }

  private picked(c: string, done: boolean) {
    this.setColor(this.stroke?.right ? 'bg' : 'fg', c);
    this.say(2, c.toUpperCase());
    if (done) this.setTool(this.prevTool);
  }

  private async editColor(target: 'fg' | number) {
    const start = target === 'fg' ? this.fg : this.palette[target];
    const wide = this.win.getBoundingClientRect().width > 520;
    const c = await editColors(this.win, start, this.custom, (list) => { this.custom = list; this.saveSettings(); }, wide);
    if (!c) return;
    if (typeof target === 'number') {
      this.palette[target] = c;
      this.drawPalette();
    }
    this.setColor('fg', c);
  }

  // ---- Zoom ----
  private applyZoom(z: number) {
    this.zoom = z;
    const w = this.doc.width * z, hh = this.doc.height * z;
    for (const c of [this.doc.canvas, this.doc.overlay]) {
      c.style.width = `${w}px`;
      c.style.height = `${hh}px`;
    }
    this.stage.style.width = `${w}px`;
    this.stage.style.height = `${hh}px`;
    this.stage.style.setProperty('--z', `${z}px`);
    this.stage.classList.toggle('smooth', z < 1);
    this.stage.classList.toggle('grid', this.grid && z >= 4);
    this.select.layout();
    this.text.style();
    this.sizeField();
  }

  /** Zoom, keeping the picture point (ix, iy) at the screen point (cx, cy). */
  setZoom(z: number, anchor?: { ix: number; iy: number; cx: number; cy: number }) {
    z = clamp(z, MIN_ZOOM, MAX_ZOOM);
    const vr = this.view.getBoundingClientRect();
    const r = this.doc.canvas.getBoundingClientRect();
    if (!anchor) {
      const cx = vr.left + Math.min(vr.width, r.width) / 2, cy = vr.top + Math.min(vr.height, r.height) / 2;
      anchor = { cx, cy, ix: (cx - r.left) / this.zoom, iy: (cy - r.top) / this.zoom };
    }
    this.applyZoom(z);
    this.view.scrollLeft = this.stage.offsetLeft + anchor.ix * z - (anchor.cx - vr.left);
    this.view.scrollTop = this.stage.offsetTop + anchor.iy * z - (anchor.cy - vr.top);
  }

  private zoomFit() {
    const z = Math.min((this.view.clientWidth - 14) / this.doc.width, (this.view.clientHeight - 14) / this.doc.height);
    this.setZoom(clamp(z, MIN_ZOOM, 8));
    this.view.scrollTo(0, 0);
  }

  private magnify(p: Pt, out: boolean) {
    const r = this.doc.canvas.getBoundingClientRect();
    const anchor = { ix: p.x, iy: p.y, cx: r.left + p.x * this.zoom, cy: r.top + p.y * this.zoom };
    this.setZoom(out || this.zoom > 1 ? 1 : this.opts.zoom, anchor);
    this.setTool(this.prevTool);
  }

  // ---- Status bar, title, buttons ----
  private say(i: number, t: Bi | string) {
    const f = this.fields[i];
    if (f) setText(f, t);
  }
  private hint(t?: Bi) {
    const tool = TOOLS.find((x) => x.id === this.tool)!;
    this.say(0, t ?? tool.hint);
  }
  private sizeField() {
    if (this.select.active) this.say(2, `${this.select.r.w} × ${this.select.r.h}`);
    else this.say(2, `${this.doc.width} × ${this.doc.height}`);
  }
  private setTitle() {
    const t = this.win.querySelector(':scope > .title-bar [data-title]');
    if (t) setText(t, { en: `${this.name.en} - Paint`, zh: `${this.name.zh} - 画图` });
    document.dispatchEvent(new CustomEvent('wm:change'));
  }
  private refresh() {
    const set = (cmd: string, on: boolean) => this.win.querySelectorAll<HTMLButtonElement>(`[data-cmd="${cmd}"]`).forEach((b) => (b.disabled = !on));
    set('paint-undo', this.doc.canUndo || this.select.floating);
    set('paint-redo', this.doc.canRedo);
    this.sizeField();
  }

  private applyHide() {
    for (const part of ['toolbox', 'colorbox', 'note']) this.root.classList.toggle(`no-${part}`, this.hide.has(part));
    const set = new Set((this.win.dataset.hide ?? '').split(' ').filter(Boolean));
    if (this.hide.has('status')) set.add('status');
    else set.delete('status');
    if (this.win !== this.root) this.win.dataset.hide = [...set].join(' ');
  }
  private toggle(part: string) {
    if (this.hide.has(part)) this.hide.delete(part);
    else this.hide.add(part);
    this.applyHide();
    this.saveSettings();
  }

  // ---- Pointers ----
  private canvasRect() {
    return this.doc.canvas.getBoundingClientRect();
  }

  private pt(e: PointerEvent, r: DOMRect): Pt {
    const pressure = e.pointerType === 'pen' ? (e.pressure > 0 ? e.pressure : 0.5) : 0.5;
    return { x: (e.clientX - r.left) / this.zoom, y: (e.clientY - r.top) / this.zoom, pressure, type: e.pointerType, right: this.stroke?.right ?? false, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
  }

  private coords(e: PointerEvent, r: DOMRect) {
    const x = Math.floor((e.clientX - r.left) / this.zoom), y = Math.floor((e.clientY - r.top) / this.zoom);
    this.say(1, x >= 0 && y >= 0 && x < this.doc.width && y < this.doc.height ? `${x}, ${y}` : '');
  }

  private onDown = (e: PointerEvent) => {
    if (!this.ready) return;
    const t = e.target as Element;
    if (t.closest('.paint-textbox')) return;
    const handle = t.closest<HTMLElement>('[data-handle]');
    if (handle && e.button === 0) return this.startResize(e, handle.dataset.handle!);
    if (e.pointerType === 'pen') this.penAt = performance.now();
    if (e.pointerType === 'touch') {
      // Palm rejection: a hand resting on the screen while a pen draws.
      if (this.stroke?.type === 'pen' || performance.now() - this.penAt < 800) return;
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size >= 2) {
        this.startGesture();
        return;
      }
    }
    if (e.button === 1) return this.startPan(e);
    if (this.stroke || this.gesture) return;
    if (!t.closest('[data-stage]')) {
      // Around the picture: a finger scrolls; a click puts a selection down.
      if (e.pointerType === 'touch') this.startPan(e);
      else if (this.tool === 'select' && e.button === 0) this.select.place();
      return;
    }
    const eraserEnd = e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) !== 0);
    if (e.button !== 0 && e.button !== 2 && !eraserEnd) return;
    e.preventDefault();
    this.view.focus({ preventScroll: true });
    try { this.view.setPointerCapture(e.pointerId); } catch { /* still works without */ }
    const right = e.button === 2 || (e.pointerType === 'pen' && (e.buttons & 2) !== 0);
    // The far end of a pen rubs out, whatever tool is in hand.
    const tool = eraserEnd ? this.impls.get('eraser')! : this.current();
    if (tool !== this.current()) this.current().finish?.();
    this.stroke = { id: e.pointerId, type: e.pointerType, right, tool, t0: performance.now(), dist: 0, lx: e.clientX, ly: e.clientY };
    const r = this.canvasRect();
    tool.down(this.pt(e, r));
    this.coords(e, r);
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === 'pen') this.penAt = performance.now();
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.gesture) return this.moveGesture();
    }
    if (this.pan && e.pointerId === this.pan.id) {
      this.view.scrollLeft = this.pan.sl - (e.clientX - this.pan.x);
      this.view.scrollTop = this.pan.st - (e.clientY - this.pan.y);
      return;
    }
    if (this.resizing && e.pointerId === this.resizing.id) return this.moveResize(e);
    const r = this.canvasRect();
    const s = this.stroke;
    if (s && e.pointerId === s.id) {
      const list = e.getCoalescedEvents?.() ?? [];
      for (const ev of list.length ? list : [e]) s.tool.move(this.pt(ev, r));
      s.dist += Math.hypot(e.clientX - s.lx, e.clientY - s.ly);
      s.lx = e.clientX;
      s.ly = e.clientY;
      this.coords(e, r);
      return;
    }
    if (!s && e.pointerType !== 'touch' && this.ready) {
      const p = this.pt(e, r);
      const over = !!(e.target as Element).closest?.('[data-stage]');
      this.current().hover?.(over ? p : null);
      this.view.classList.toggle('over-selection', this.tool === 'select' && this.select.inside(p));
      this.coords(e, r);
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerType === 'pen') this.penAt = performance.now();
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (this.gesture) {
        if (!this.touches.size) this.gesture = null;
        return;
      }
    }
    if (this.pan && e.pointerId === this.pan.id) {
      this.pan = null;
      this.view.classList.remove('panning');
      return;
    }
    if (this.resizing && e.pointerId === this.resizing.id) return this.endResize(e.type === 'pointercancel');
    const s = this.stroke;
    if (!s || e.pointerId !== s.id) return;
    if (e.type === 'pointercancel') s.tool.cancel();
    else s.tool.up(this.pt(e, this.canvasRect()));
    this.stroke = null;
    this.refresh();
  };

  /** A second finger: pinch to zoom, drag to scroll. A stroke just begun is taken back. */
  private startGesture() {
    const s = this.stroke;
    if (s) {
      if (s.type !== 'touch' || (performance.now() - s.t0 > 350 && s.dist > 24)) return;
      s.tool.cancel();
      this.stroke = null;
    }
    this.pan = null;
    const [a, b] = [...this.touches.values()];
    const r = this.canvasRect();
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    this.gesture = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), z0: this.zoom, ix: (mx - r.left) / this.zoom, iy: (my - r.top) / this.zoom };
  }

  private moveGesture() {
    const g = this.gesture;
    const pts = [...this.touches.values()];
    if (!g || pts.length < 2) return;
    const [a, b] = pts;
    const z = clamp((g.z0 * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0, MIN_ZOOM, MAX_ZOOM);
    this.setZoom(z, { ix: g.ix, iy: g.iy, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 });
  }

  private startPan(e: PointerEvent) {
    e.preventDefault();
    this.pan = { id: e.pointerId, x: e.clientX, y: e.clientY, sl: this.view.scrollLeft, st: this.view.scrollTop };
    try { this.view.setPointerCapture(e.pointerId); } catch { /* fine */ }
    this.view.classList.add('panning');
  }

  // ---- Resizing the picture by its handles ----
  private startResize(e: PointerEvent, dir: string) {
    e.preventDefault();
    e.stopPropagation();
    this.current().finish?.();
    try { this.view.setPointerCapture(e.pointerId); } catch { /* fine */ }
    const ghost = h('div', { class: 'paint-ghost', 'aria-hidden': 'true' });
    this.stage.append(ghost);
    this.resizing = { id: e.pointerId, dir, x0: e.clientX, y0: e.clientY, w: this.doc.width, h: this.doc.height, ghost };
    this.moveResize(e);
  }
  private moveResize(e: PointerEvent) {
    const r = this.resizing!;
    const w = r.dir.includes('e') ? clamp(Math.round(this.doc.width + (e.clientX - r.x0) / this.zoom), 1, MAX_SIDE) : this.doc.width;
    const hh = r.dir.includes('s') ? clamp(Math.round(this.doc.height + (e.clientY - r.y0) / this.zoom), 1, MAX_SIDE) : this.doc.height;
    r.w = w;
    r.h = hh;
    r.ghost.style.width = `${w * this.zoom}px`;
    r.ghost.style.height = `${hh * this.zoom}px`;
    this.say(2, `${w} × ${hh}`);
  }
  private endResize(cancelled: boolean) {
    const r = this.resizing!;
    this.resizing = null;
    r.ghost.remove();
    if (!cancelled) this.resize(r.w, r.h);
    this.sizeField();
  }
  private resize(w: number, hh: number) {
    this.select.place();
    this.doc.resize(w, hh, this.bg);
    this.applyZoom(this.zoom);
  }

  // ---- Binding everything ----
  private bind() {
    const signal = this.ac.signal;
    const v = this.view;
    v.addEventListener('pointerdown', this.onDown);
    v.addEventListener('pointermove', this.onMove);
    v.addEventListener('pointerup', this.onUp);
    v.addEventListener('pointercancel', this.onUp);
    v.addEventListener('pointerleave', (e) => {
      if (!this.stroke && e.pointerType !== 'touch') {
        this.current().hover?.(null);
        this.say(1, '');
      }
    });
    // Right-click paints with the background colour, so no menu here.
    v.addEventListener('contextmenu', (e) => {
      if ((e.target as Element).closest('.paint-textbox')) return;
      e.preventDefault();
    });
    v.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = this.canvasRect();
      const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
      this.setZoom(this.zoom * f, { cx: e.clientX, cy: e.clientY, ix: (e.clientX - r.left) / this.zoom, iy: (e.clientY - r.top) / this.zoom });
    }, { passive: false });
    // Safari's trackpad pinch.
    let gz = 1;
    v.addEventListener('gesturestart', (e) => { e.preventDefault(); gz = this.zoom; });
    v.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      if (!this.touches.size) this.setZoom(gz * (e as unknown as { scale: number }).scale);
    });

    // The tool box.
    this.toolsEl.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-tool]');
      if (b) this.setTool(b.dataset.tool as ToolId);
    });
    this.toolsEl.addEventListener('keydown', (e) => {
      const ids = TOOLS.map((t) => t.id);
      const i = ids.indexOf(this.tool);
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[e.key];
      if (!step) return;
      e.preventDefault();
      this.setTool(ids[(i + step + ids.length) % ids.length]);
      this.toolsEl.querySelector<HTMLElement>(`[data-tool="${this.tool}"]`)?.focus();
    });
    for (const b of this.toolsEl.querySelectorAll<HTMLElement>('[data-tool]')) {
      const t = TOOLS.find((x) => x.id === b.dataset.tool)!;
      b.addEventListener('pointerenter', () => this.hint(t.hint));
      b.addEventListener('pointerleave', () => this.hint());
    }

    // The colour box: click for the foreground, right-click (or press and hold) for the background.
    let held = 0, heldAt = -Infinity;
    const swatch = (e: Event) => (e.target as Element).closest<HTMLElement>('.paint-swatch');
    this.paletteEl.addEventListener('click', (e) => {
      const b = swatch(e);
      if (!b || performance.now() - heldAt < 700) return;
      this.setColor('fg', b.dataset.color!);
    });
    this.paletteEl.addEventListener('contextmenu', (e) => {
      const b = swatch(e);
      if (!b) return;
      e.preventDefault();
      if (performance.now() - heldAt < 700) return;
      this.setColor('bg', b.dataset.color!);
    });
    this.paletteEl.addEventListener('dblclick', (e) => {
      const b = swatch(e);
      if (b) void this.editColor([...this.paletteEl.children].indexOf(b));
    });
    this.paletteEl.addEventListener('pointerdown', (e) => {
      const b = swatch(e);
      if (!b || e.pointerType !== 'touch') return;
      clearTimeout(held);
      held = window.setTimeout(() => {
        heldAt = performance.now();
        navigator.vibrate?.(10);
        this.setColor('bg', b.dataset.color!);
      }, 500);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.paletteEl.addEventListener(ev, () => clearTimeout(held));
    this.fgEl.addEventListener('click', () => void this.editColor('fg'));
    this.bgEl.addEventListener('click', () => this.swap());

    // Toolbar buttons and the note's link.
    this.win.addEventListener('click', (e) => {
      const c = (e.target as Element).closest<HTMLElement>('[data-cmd^="paint-"], [data-paint-cmd]');
      if (!c || !this.win.contains(c)) return;
      e.preventDefault();
      this.run((c.dataset.paintCmd ?? c.dataset.cmd!.slice(6)) as Cmd);
    });

    // Opening a picture: File ▸ Open, or dropping one on the window.
    this.fileInput.addEventListener('change', () => {
      const f = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (f) void this.openFile(f);
    });
    v.addEventListener('dragover', (e) => {
      if (![...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    });
    v.addEventListener('drop', (e) => {
      const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (!f) return;
      e.preventDefault();
      const r = this.canvasRect();
      void this.pasteFile(f, Math.max(0, Math.floor((e.clientX - r.left) / this.zoom)), Math.max(0, Math.floor((e.clientY - r.top) / this.zoom)));
    });

    // Keys, the clipboard, and leaving.
    document.addEventListener('keydown', this.onKey, { signal });
    document.addEventListener('copy', (e) => this.onClip(e, 'copy'), { signal });
    document.addEventListener('cut', (e) => this.onClip(e, 'cut'), { signal });
    document.addEventListener('paste', (e) => this.onPaste(e), { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) void this.keepNow(); }, { signal });
    window.addEventListener('pagehide', () => void this.keepNow(), { signal });
    this.win.addEventListener('desktop:close', () => this.destroy(), { once: true });
    window.kus98?.menus?.(this.win, (name) => this.menu(name));
  }

  private destroy() {
    this.current().finish?.();
    void this.keepNow();
    this.ac.abort();
  }

  /** Keys work while Paint is the window in front and no box has the focus. */
  private isActive() {
    if (this.win === this.root) return true;
    if (!this.win.isConnected || this.win.dataset.state === 'min' || !this.win.hasAttribute('data-active')) return false;
    return !this.win.querySelector(':scope > [data-window-inner]')?.hasAttribute('inert');
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.isActive() || e.defaultPrevented) return;
    const t = e.target as Element;
    if (t.closest?.('input, textarea, select, [contenteditable="true"], .menu')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    let handled = true;
    if (ctrl && e.altKey && k === 'n') this.run('new');
    else if (ctrl && !e.altKey) {
      if (k === 'z') this.run(e.shiftKey ? 'redo' : 'undo');
      else if (k === 'y') this.run('redo');
      else if (k === 'a') this.run('select-all');
      else if (k === 's') this.run('save');
      else if (k === 'o') this.run('open');
      else if (k === 'enter') this.run('send');
      else if (k === 'g') this.run('grid');
      else handled = false;
    } else if (!e.altKey) {
      const tool = (Object.keys(KEYS) as ToolId[]).find((id) => KEYS[id].toLowerCase() === k);
      if (e.key === 'F1') {
        e.stopPropagation();
        this.run('help');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.select.active) this.run('delete');
        else handled = false;
      } else if (e.key === 'Escape') {
        if (this.stroke) {
          this.stroke.tool.cancel();
          this.stroke = null;
        } else if (this.select.active) this.select.place();
        else handled = false;
      } else if (e.key === 'Enter' && this.select.active) this.select.place();
      else if (e.key.startsWith('Arrow') && this.select.active) {
        const n = e.shiftKey ? 10 : 1;
        this.select.nudge(e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0, e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0);
      } else if (e.key === '+' || e.key === '=') this.setZoom(this.zoom * 2);
      else if (e.key === '-') this.setZoom(this.zoom / 2);
      else if (e.key === '0') this.setZoom(1);
      else if (k === 'x') this.swap();
      else if (tool && !e.shiftKey) this.setTool(tool);
      else handled = false;
    } else handled = false;
    if (handled) e.preventDefault();
    this.refresh();
  };

  // ---- The clipboard ----
  private inBox(e: Event) {
    return !!(e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
  }

  private onClip(e: ClipboardEvent, kind: 'copy' | 'cut') {
    if (!this.isActive() || this.inBox(e)) return;
    if (getSelection()?.toString()) return;
    e.preventDefault();
    this.copy(kind === 'cut');
  }

  /** Copy the selection (or, with nothing selected, the whole picture). */
  private copy(cut = false) {
    const src = this.select.pixels() ?? (cut ? null : this.doc.canvas);
    if (!src) return;
    const c = canvasOf(src.width, src.height);
    c.getContext('2d')!.drawImage(src, 0, 0);
    this.clip = c;
    try {
      const blob = new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'));
      void navigator.clipboard?.write?.([new ClipboardItem({ 'image/png': blob })]).catch(() => {});
    } catch { /* Paint's own clipboard still works */ }
    if (cut) this.select.remove();
    this.refresh();
  }

  private onPaste(e: ClipboardEvent) {
    if (!this.isActive() || this.inBox(e)) return;
    const file = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile();
    if (!file && !this.clip) return;
    e.preventDefault();
    if (file) void this.pasteFile(file);
    else this.pasteCanvas(this.clip!);
  }

  /** Edit ▸ Paste (no keyboard event): ask the system clipboard, else Paint's own. */
  private async pasteMenu() {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith('image/'));
        if (type) return void this.pasteFile(await it.getType(type));
      }
    } catch { /* not allowed or empty */ }
    if (this.clip) this.pasteCanvas(this.clip);
  }

  private async pasteFile(f: Blob, x?: number, y?: number) {
    try {
      const bmp = await createImageBitmap(f);
      const c = canvasOf(bmp.width, bmp.height);
      c.getContext('2d')!.drawImage(bmp, 0, 0);
      bmp.close?.();
      await this.pasteCanvas(c, x, y);
    } catch {
      void message({ title: { en: 'Paint', zh: '画图' }, icon: 'error', text: { en: 'This picture could not be read.', zh: '无法读取这幅图片。' }, owner: this.win });
    }
  }

  private async pasteCanvas(c: HTMLCanvasElement, x?: number, y?: number) {
    let src = c;
    const w = Math.min(c.width, MAX_SIDE), hh = Math.min(c.height, MAX_SIDE);
    if (w < c.width || hh < c.height) {
      const s = Math.min(w / c.width, hh / c.height);
      src = canvasOf(Math.round(c.width * s), Math.round(c.height * s));
      src.getContext('2d')!.drawImage(c, 0, 0, src.width, src.height);
    }
    if (src.width > this.doc.width || src.height > this.doc.height) {
      const ans = await message({
        title: { en: 'Paint', zh: '画图' },
        icon: 'question',
        text: { en: 'The picture being pasted is larger than this one.\nWould you like this picture enlarged to fit it?', zh: '要粘贴的图片比这幅画大。\n要把这幅画放大以容纳它吗？' },
        buttons: ['Yes', 'No', 'Cancel'],
        owner: this.win,
      });
      if (ans === 'Cancel') return;
      if (ans === 'Yes') this.resize(Math.max(this.doc.width, src.width), Math.max(this.doc.height, src.height));
    }
    if (this.tool !== 'select') this.setTool('select');
    // At the top left of what's in view (or where it was dropped).
    const px = x ?? Math.max(0, Math.floor((this.view.scrollLeft - this.stage.offsetLeft) / this.zoom));
    const py = y ?? Math.max(0, Math.floor((this.view.scrollTop - this.stage.offsetTop) / this.zoom));
    this.select.paste(src, src.width, src.height, px, py);
    this.refresh();
  }

  // ---- Files ----
  private fileName() {
    return (this.name.en || 'untitled').replace(/\.[a-z0-9]+$/i, '').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60) || 'untitled';
  }

  private async save() {
    this.current().finish?.();
    const blob = await this.doc.toBlob();
    if (!blob) return;
    const a = h('a', { href: URL.createObjectURL(blob), download: `${this.fileName()}.png`, 'data-native': true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    this.saved = true;
  }

  /** "Save changes to untitled?" before the picture would be lost. Resolves false to stop. */
  private async askToSave(): Promise<boolean> {
    if (this.saved || this.doc.isBlank()) return true;
    const ans = await message({
      title: { en: 'Paint', zh: '画图' },
      icon: 'warning',
      text: { en: `Save changes to ${this.name.en}?\n\nYou can also send it to ${this.artist} first (File ▸ Send).`, zh: `是否保存对 ${this.name.zh} 的修改？\n\n你也可以先把它发给 ${this.artist}（文件 ▸ 发送）。` },
      buttons: ['Yes', 'No', 'Cancel'],
      owner: this.win,
    });
    if (ans === 'Cancel') return false;
    if (ans === 'Yes') await this.save();
    return true;
  }

  private async newPicture() {
    this.current().finish?.();
    if (!(await this.askToSave())) return;
    this.select.cancel();
    this.text.cancel();
    this.doc.reset(this.doc.width, this.doc.height);
    this.name = UNTITLED;
    this.saved = true;
    await forget();
    this.applyZoom(this.zoom);
    this.setTitle();
    this.refresh();
  }

  private async openFile(f: File) {
    this.current().finish?.();
    if (!(await this.askToSave())) return;
    try {
      const bmp = await createImageBitmap(f);
      let w = bmp.width, hh = bmp.height;
      const s = Math.min(1, MAX_SIDE / w, MAX_SIDE / hh);
      w = Math.max(1, Math.round(w * s));
      hh = Math.max(1, Math.round(hh * s));
      this.select.cancel();
      this.text.cancel();
      this.doc.replace(bmp, w, hh);
      bmp.close?.();
      const base = f.name.replace(/\.[a-z0-9]+$/i, '') || UNTITLED.en;
      this.name = { en: base, zh: base };
      this.saved = true;
      this.setTitle();
      this.zoomFit();
      if (s < 1) this.hint({ en: `The picture was made smaller to ${w} × ${hh} pixels, the largest Paint can send.`, zh: `这幅图片已缩小到 ${w} × ${hh} 像素，这是“画图”能发送的最大尺寸。` });
    } catch {
      void message({ title: { en: 'Paint', zh: '画图' }, icon: 'error', text: { en: `Paint cannot read this file.\nThis is not a valid picture, or its format is not supported.`, zh: '“画图”无法读取此文件。\n这不是有效的图片，或者不支持它的格式。' }, owner: this.win });
    }
  }

  private async send() {
    this.current().finish?.();
    if (this.doc.isBlank()) {
      await message({
        title: { en: `Send to ${this.artist}`, zh: `发给 ${this.artist}` },
        icon: 'info',
        text: { en: `The picture is still empty. Draw something first, then send it to ${this.artist}.`, zh: `这幅画还是空白的。先画点什么，再发给 ${this.artist}。` },
        owner: this.win,
      });
      return;
    }
    await openSend({
      owner: this.win,
      doc: this.doc,
      artist: this.artist,
      artistFull: this.artistFull,
      name: this.fileName(),
      sitekey: this.sitekey,
      onSent: () => { this.saved = true; },
      saveCopy: () => void this.save(),
    });
  }

  // ---- Image ▸ … ----
  private transform(fn: (c: HTMLCanvasElement) => HTMLCanvasElement) {
    this.text.finish();
    if (this.select.active) {
      this.select.transform(fn);
    } else {
      const c = fn(this.doc.canvas);
      this.doc.replace(c, c.width, c.height);
      this.applyZoom(this.zoom);
    }
    this.refresh();
  }

  private swap() {
    [this.fg, this.bg] = [this.bg, this.fg];
    this.colors();
    this.saveSettings();
  }

  private attributes() {
    const num = (v: number, label: Bi) => h('input', { type: 'number', min: 1, max: MAX_SIDE, step: 1, value: v, inputmode: 'numeric', 'aria-label': label });
    const wIn = num(this.doc.width, { en: 'Width', zh: '宽度' });
    const hIn = num(this.doc.height, { en: 'Height', zh: '高度' });
    const ok = h('button', { type: 'submit', class: 'default' }, { en: 'OK', zh: '确定' });
    const cancel = h('button', { type: 'button' }, { en: 'Cancel', zh: '取消' });
    const def = h('button', { type: 'button' }, { en: 'Default', zh: '默认' });
    const form = h('form', { class: 'paint-attrs' }, [
      h('p', {}, { en: `The picture is ${this.doc.width} × ${this.doc.height} pixels. Paint can send pictures up to ${MAX_SIDE} pixels on a side.`, zh: `这幅画是 ${this.doc.width} × ${this.doc.height} 像素。“画图”可以发送每边最多 ${MAX_SIDE} 像素的图片。` }),
      h('div', { class: 'pa-fields' }, [
        h('label', {}, [h('span', {}, { en: 'Width:', zh: '宽度：' }), wIn]),
        h('label', {}, [h('span', {}, { en: 'Height:', zh: '高度：' }), hIn]),
        h('span', { class: 'pa-units' }, { en: 'pixels', zh: '像素' }),
      ]),
      h('p', { class: 'pa-note' }, { en: 'New space is filled with the background colour.', zh: '新增的空间用背景色填充。' }),
      h('div', { class: 'pa-buttons' }, [ok, cancel, def]),
    ]);
    const win = dialog({ title: { en: 'Attributes', zh: '属性' }, icon: 'paint', body: form, owner: this.win, className: 'paint-attrs-dialog' });
    cancel.addEventListener('click', () => win.close());
    def.addEventListener('click', () => {
      const s = this.fitSize();
      wIn.value = String(s.w);
      hIn.value = String(s.h);
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const w = clamp(Math.round(Number(wIn.value)), 1, MAX_SIDE), hh = clamp(Math.round(Number(hIn.value)), 1, MAX_SIDE);
      if (!Number.isFinite(w) || !Number.isFinite(hh)) return;
      win.close();
      this.resize(w, hh);
    });
    wIn.focus();
    wIn.select();
  }

  private about() {
    void message({
      title: { en: 'About Paint', zh: '关于画图' },
      icon: 'paint',
      text: {
        en: `Paint\nfor Xiangyin 98\n\nDraw with a mouse, a finger or a pen, then send the picture to ${this.artist}: it goes to his inbox, not onto this website.`,
        zh: `画图\nXiangyin 98 附件\n\n用鼠标、手指或手写笔作画，然后把画发给 ${this.artist}：它会送到他的邮箱，不会发布在这个网站上。`,
      },
      owner: this.win,
    });
  }

  // ---- Commands (toolbar, menus, keys) ----
  run(cmd: Cmd) {
    switch (cmd) {
      case 'send': return void this.send();
      case 'new': return void this.newPicture();
      case 'open': return this.fileInput.click();
      case 'save': return void this.save();
      case 'how': return howItWorks(this.win, this.artist);
      case 'undo':
        this.text.cancel();
        if (this.select.floating) this.select.cancel();
        else {
          this.select.cancel();
          this.doc.undo();
          this.applyZoom(this.zoom);
        }
        return this.refresh();
      case 'redo':
        this.select.cancel();
        this.doc.redo();
        this.applyZoom(this.zoom);
        return this.refresh();
      case 'cut': return this.copy(true);
      case 'copy': return this.copy();
      case 'paste': return void this.pasteMenu();
      case 'delete': return this.select.remove();
      case 'select-all':
        this.setTool('select');
        return this.select.selectAll();
      case 'grid':
        this.grid = !this.grid;
        return this.applyZoom(this.zoom);
      case 'help': {
        const d = desktop();
        if (d) void d.open('/help#paint');
        else location.href = '/help#paint';
        return;
      }
      case 'about': return this.about();
    }
  }

  // ---- The menu bar (File, Edit, View, Image, Colors, Help) ----
  private menu(name: string): MenuSpec[] | null {
    const a = this.artist;
    switch (name) {
      case 'file':
        return [
          { label: '&New', zh: '新建(&N)', key: 'Ctrl+Alt+N', action: () => this.run('new') },
          { label: '&Open...', zh: '打开(&O)...', key: 'Ctrl+O', action: () => this.run('open') },
          { label: '&Save', zh: '保存(&S)', key: 'Ctrl+S', action: () => this.run('save') },
          { sep: true },
          { label: `S&end to ${a}...`, zh: `发送给 ${a}(&E)...`, key: 'Ctrl+Enter', icon: 'mail', bold: true, action: () => this.run('send') },
          { label: '&How Sending Works', zh: '如何发送(&H)', icon: 'help', action: () => this.run('how') },
          { sep: true },
          { label: 'E&xit', zh: '退出(&X)', key: 'Alt+F4', action: () => (window.kus98 ? window.kus98.close(this.win) : history.back()) },
        ];
      case 'edit':
        return [
          { label: '&Undo', zh: '撤消(&U)', key: 'Ctrl+Z', disabled: !this.doc.canUndo && !this.select.floating, action: () => this.run('undo') },
          { label: '&Repeat', zh: '重复(&R)', key: 'Ctrl+Y', disabled: !this.doc.canRedo, action: () => this.run('redo') },
          { sep: true },
          { label: 'Cu&t', zh: '剪切(&T)', key: 'Ctrl+X', disabled: !this.select.active, action: () => this.run('cut') },
          { label: '&Copy', zh: '复制(&C)', key: 'Ctrl+C', action: () => this.run('copy') },
          { label: '&Paste', zh: '粘贴(&P)', key: 'Ctrl+V', action: () => this.run('paste') },
          { label: 'C&lear Selection', zh: '清除选定内容(&L)', key: 'Del', disabled: !this.select.active, action: () => this.run('delete') },
          { label: 'Select &All', zh: '全选(&A)', key: 'Ctrl+A', action: () => this.run('select-all') },
        ];
      case 'view': {
        const zoomItem = (z: number, label: Bi) => ({ label: label.en, zh: label.zh, radio: true, checked: Math.abs(this.zoom - z) < 0.01, action: () => this.setZoom(z) });
        return [
          { label: '&Tool Box', zh: '工具箱(&T)', checked: !this.hide.has('toolbox'), action: () => this.toggle('toolbox') },
          { label: '&Color Box', zh: '颜料盒(&C)', checked: !this.hide.has('colorbox'), action: () => this.toggle('colorbox') },
          { label: '&Status Bar', zh: '状态栏(&S)', checked: !this.hide.has('status'), action: () => this.toggle('status') },
          { label: 'Sending &Note', zh: '发送提示(&N)', checked: !this.hide.has('note'), action: () => this.toggle('note') },
          { sep: true },
          {
            label: '&Zoom', zh: '缩放(&Z)',
            sub: [
              zoomItem(1, { en: '&Normal Size', zh: '常规尺寸(&N)' }),
              zoomItem(4, { en: '&Large Size', zh: '大尺寸(&L)' }),
              { label: 'Zoom to &Fit', zh: '缩放到适合大小(&F)', action: () => this.zoomFit() },
              { sep: true },
              ...ZOOMS.map((z) => zoomItem(z, { en: `&${z * 100}%`, zh: `&${z * 100}%` })),
              { sep: true },
              { label: 'Show &Grid', zh: '显示网格(&G)', key: 'Ctrl+G', checked: this.grid, disabled: this.zoom < 4, action: () => this.run('grid') },
            ],
          },
        ];
      }
      case 'image':
        return [
          {
            label: '&Flip/Rotate', zh: '翻转/旋转(&F)',
            sub: [
              { label: 'Flip &horizontal', zh: '水平翻转(&H)', action: () => this.transform((c) => turned(c, 'flip-h')) },
              { label: 'Flip &vertical', zh: '垂直翻转(&V)', action: () => this.transform((c) => turned(c, 'flip-v')) },
              { sep: true },
              { label: 'Rotate &90°', zh: '旋转 90°(&9)', action: () => this.transform((c) => turned(c, 'rot90')) },
              { label: 'Rotate &180°', zh: '旋转 180°(&1)', action: () => this.transform((c) => turned(c, 'rot180')) },
              { label: 'Rotate &270°', zh: '旋转 270°(&2)', action: () => this.transform((c) => turned(c, 'rot270')) },
            ],
          },
          { label: '&Invert Colors', zh: '反色(&I)', action: () => this.transform(inverted) },
          { label: '&Attributes...', zh: '属性(&A)...', action: () => this.attributes() },
          { label: '&Clear Image', zh: '清除图像(&C)', action: () => {
            this.select.place();
            this.doc.whole(() => {
              this.doc.ctx.fillStyle = this.bg;
              this.doc.ctx.fillRect(0, 0, this.doc.width, this.doc.height);
            });
          } },
          { sep: true },
          { label: '&Draw Opaque', zh: '不透明处理(&D)', checked: this.opts.opaque, action: () => {
            this.opts.opaque = !this.opts.opaque;
            this.select.refresh();
            this.buildOptions();
            this.saveSettings();
          } },
        ];
      case 'colors':
        return [{ label: '&Edit Colors...', zh: '编辑颜色(&E)...', icon: 'display', action: () => void this.editColor('fg') }];
      case 'help':
        return [
          { label: '&Help Topics', zh: '帮助主题(&H)', key: 'F1', icon: 'help', action: () => this.run('help') },
          { label: `How &Sending to ${a} Works`, zh: `如何发送给 ${a}(&S)`, action: () => this.run('how') },
          { sep: true },
          { label: '&About Paint', zh: '关于画图(&A)', action: () => this.run('about') },
        ];
    }
    return null;
  }
}

type Cmd = 'send' | 'new' | 'open' | 'save' | 'how' | 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'delete' | 'select-all' | 'grid' | 'help' | 'about';
