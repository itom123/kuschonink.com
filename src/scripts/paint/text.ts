// Text: click (or tap) where the words should start, type, then click
// outside the box to put them down. The box is a real text field, so any
// keyboard or input method works (Chinese included); it is drawn into the
// picture in the font, size and colour chosen, line by line.
import { FONTS } from '../../lib/paint';
import { setAttr } from './dom';
import type { Host, Pt, Tool } from './tools';

export interface TextHost extends Host {
  zoom(): number;
  stage: HTMLElement;
  foreground(): string;
}

export class TextTool implements Tool {
  private box: HTMLTextAreaElement | null = null;
  private at = { x: 0, y: 0 };
  /** The press that put a box down doesn't also open a new one. */
  private closing = false;
  constructor(private host: TextHost) {}

  get open() { return !!this.box; }

  private css(scale: number) {
    const o = this.host.opts;
    const family = (FONTS.find((f) => f.id === o.font) ?? FONTS[0]).css;
    return `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${o.fontSize * scale}px ${family}`;
  }
  private lineHeight() {
    return Math.round(this.host.opts.fontSize * 1.25);
  }

  down() {
    // Presses inside the box never get here (they're typing), so this one is
    // outside it: put the words down, and don't start a new box.
    if (!this.box) return;
    this.put();
    this.closing = true;
  }
  move() {}
  up(p: Pt) {
    if (this.closing) {
      this.closing = false;
      return;
    }
    this.openAt(Math.floor(p.x), Math.floor(p.y));
  }

  private openAt(x: number, y: number) {
    const ta = document.createElement('textarea');
    ta.className = 'paint-textbox';
    ta.wrap = 'off';
    ta.spellcheck = false;
    ta.rows = 1;
    setAttr(ta, 'aria-label', { en: 'Text to write on the picture. Click outside the box (or press Escape) to put it down.', zh: '要写在图片上的文字。在框外单击（或按 Esc 键）即可放下。' });
    this.at = { x, y };
    this.box = ta;
    this.host.stage.append(ta);
    this.style();
    ta.addEventListener('input', () => this.fit());
    ta.addEventListener('keydown', (e) => {
      // While an input method is composing (Chinese, Japanese…), its keys are its own.
      if (e.isComposing) return;
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        e.stopPropagation();
        this.put();
      }
    });
    // The box sits on the picture: presses inside it are typing, not drawing.
    ta.addEventListener('pointerdown', (e) => e.stopPropagation());
    requestAnimationFrame(() => ta.focus({ preventScroll: true }));
  }

  /** Font, colour, size and place, after an option or the zoom changes. */
  style() {
    const ta = this.box;
    if (!ta) return;
    const z = this.host.zoom();
    ta.style.font = this.css(z);
    ta.style.lineHeight = `${this.lineHeight() * z}px`;
    ta.style.color = this.host.foreground();
    ta.style.background = this.host.opts.opaque ? this.host.background() : 'transparent';
    ta.style.left = `${this.at.x * z}px`;
    ta.style.top = `${this.at.y * z}px`;
    this.fit();
  }

  private fit() {
    const ta = this.box;
    if (!ta) return;
    const z = this.host.zoom();
    ta.style.width = '0px';
    ta.style.height = '0px';
    ta.style.width = `${Math.max(ta.scrollWidth + 4 * z, this.host.opts.fontSize * z * 2)}px`;
    ta.style.height = `${Math.max(ta.scrollHeight, this.lineHeight() * z)}px`;
  }

  /** Draw the words into the picture. */
  put() {
    const ta = this.box;
    if (!ta) return;
    this.box = null;
    ta.remove();
    const text = ta.value.replace(/\s+$/, '');
    if (!text) return;
    const { doc } = this.host;
    const ctx = doc.ctx;
    const lh = this.lineHeight();
    const lines = text.split('\n');
    doc.begin();
    ctx.save();
    ctx.font = this.css(1);
    ctx.textBaseline = 'middle';
    const width = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + 2;
    const { x, y } = this.at;
    if (this.host.opts.opaque) {
      ctx.fillStyle = this.host.background();
      ctx.fillRect(x, y, width, lines.length * lh);
    }
    ctx.fillStyle = this.host.foreground();
    lines.forEach((l, i) => ctx.fillText(l, x + 1, y + i * lh + lh / 2));
    ctx.restore();
    doc.touch(x - 2, y - 2, width + 6, lines.length * lh + 4);
    doc.commit();
  }

  cancel() {
    this.box?.remove();
    this.box = null;
  }

  finish() {
    this.put();
  }
}
