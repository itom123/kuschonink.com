// Field Guide (导览): the details panel. Wide: a column beside the map. Compact:
// a House-style sheet over the map or list, at half height (55% of the
// program) or full, with Half/Full, Map and ×. The size is CSS
// (src/styles/guide.css, [data-detail]); this only switches it and reports how
// much of the map the sheet covers. On a landscape phone it is a right drawer.
import type { Detail } from './state';
import { setText } from './dom';
import { W } from '../../lib/guides/words';

export class Sheet {
  readonly el: HTMLElement;
  private readonly root: HTMLElement;
  private readonly sizeBtn: HTMLElement | null;

  constructor(root: HTMLElement, el: HTMLElement) {
    this.root = root;
    this.el = el;
    this.sizeBtn = el.querySelector('[data-gd-sheet-size]');
  }

  set(mode: Detail) {
    this.root.dataset.detail = mode;
    if (this.sizeBtn) {
      setText(this.sizeBtn, mode === 'full' ? W.half : W.full);
      this.sizeBtn.setAttribute('aria-expanded', String(mode === 'full'));
    }
  }

  /** The part of the map the sheet or drawer covers, for GuideMap.setFree(). */
  covers(wide: boolean): { right?: number; bottom?: number } {
    if (wide || this.root.dataset.detail === 'closed') return {};
    const r = this.el.getBoundingClientRect();
    const m = this.root.getBoundingClientRect();
    if (!r.width || !r.height) return {};
    // Full covers the whole map, except on a landscape phone, where it is the same drawer as Half.
    if (this.root.dataset.detail === 'full' && r.width >= m.width * 0.9) return {};
    // A drawer on the right (landscape phone) or a sheet at the bottom.
    if (r.height >= m.height * 0.9) return { right: Math.round(r.width) };
    return { bottom: Math.round(r.height) };
  }
}
