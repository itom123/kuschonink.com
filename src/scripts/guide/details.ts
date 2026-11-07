// Field Guide (导览): the details articles (server-rendered, one per item, place
// and listing). Shows the selected one, fills its day-status box and the
// details bar's title, and lists the members of a cluster.
import type { DayStatus } from '../../lib/guides/types';
import { W } from '../../lib/guides/words';
import { bi, h, setText, type Bi } from './dom';

export class Details {
  private readonly body: HTMLElement;
  private readonly title: HTMLElement | null;
  private readonly cluster: HTMLElement | null;
  private readonly arts = new Map<string, HTMLElement>();
  shown: string | null = null;

  constructor(root: HTMLElement) {
    this.body = root.querySelector<HTMLElement>('[data-gd-details-body]')!;
    this.title = root.querySelector('[data-gd-details-title]');
    this.cluster = root.querySelector('[data-gd-cluster]');
    for (const a of root.querySelectorAll<HTMLElement>('[data-gd-article]')) this.arts.set(a.dataset.gdArticle!, a);
    // A picture that doesn't load says so, instead of an empty frame.
    for (const img of root.querySelectorAll<HTMLImageElement>('.gd-photo img')) {
      const fail = () => {
        img.hidden = true;
        const p = img.parentElement?.querySelector<HTMLElement>('.gd-photo-failed');
        if (p) p.hidden = false;
      };
      if (img.complete && img.naturalWidth === 0 && img.currentSrc) fail();
      else img.addEventListener('error', fail, { once: true });
    }
  }

  has(id: string) { return this.arts.has(id); }
  article(id: string) { return this.arts.get(id) ?? null; }

  /** Show one article (or none). With focus: move the keyboard to its heading. */
  show(id: string | null, focus = false) {
    if (this.cluster) this.cluster.hidden = true;
    for (const [k, a] of this.arts) a.classList.toggle('is-shown', k === id);
    this.shown = id;
    const a = id ? this.arts.get(id) : null;
    if (this.title) setText(this.title, a ? `${id} ${a.querySelector('.gd-name')?.textContent ?? ''}`.trim() : '');
    if (a) {
      this.body.scrollTop = 0;
      if (focus) a.querySelector<HTMLElement>('.gd-name')?.focus({ preventScroll: true });
    }
  }

  /** The members of a cluster, as links (at maximum zoom). */
  showCluster(ids: string[], name: (id: string) => string) {
    if (!this.cluster) return;
    for (const a of this.arts.values()) a.classList.remove('is-shown');
    this.shown = null;
    this.cluster.replaceChildren(
      h('h2', { class: 'gd-name' }, W.here(ids.length)),
      h('ul', {}, ids.map((id) => h('li', {}, h('a', { href: `#gd-item-${id}`, 'data-gd-sel': id }, `${id} ${name(id)}`)))),
    );
    this.cluster.hidden = false;
    if (this.title) setText(this.title, W.here(ids.length));
  }

  /** Where am I?: the nearest places as links, how far each is, and a way to stop. */
  showNear(o: { title: Bi; note: Bi; empty: Bi; stop: Bi; rows: { id: string; name: string; icon: string; line: Bi }[] }) {
    if (!this.cluster) return;
    for (const a of this.arts.values()) a.classList.remove('is-shown');
    this.shown = null;
    const list = o.rows.length
      ? h('ol', { class: 'gd-near' }, o.rows.map((r) => h('li', {}, h('a', { href: `#gd-item-${r.id}`, 'data-gd-sel': r.id }, [
        h('span', { class: `ico ico16 ${r.icon}`, 'aria-hidden': 'true' }),
        h('span', { class: 'gd-near-text' }, [h('span', { class: 'gd-near-name' }, `${r.id} ${r.name}`), h('span', { class: 'gd-near-dist' }, r.line)]),
      ]))))
      : h('p', {}, o.empty);
    this.cluster.replaceChildren(
      h('h2', { class: 'gd-name', tabindex: -1 }, o.title),
      h('p', { class: 'gd-near-note' }, o.note),
      list,
      h('p', {}, h('button', { type: 'button', 'data-gd-me-stop': true }, o.stop)),
    );
    this.cluster.hidden = false;
    this.body.scrollTop = 0;
    if (this.title) setText(this.title, o.title);
  }

  /** Move the keyboard to the shown list's heading. */
  focusList() {
    this.cluster?.querySelector<HTMLElement>('.gd-name')?.focus({ preventScroll: true });
  }

  /** Each item's day-status box: a coloured square, the label and its note. */
  fillStatus(status: (id: string) => DayStatus | null) {
    for (const [id, a] of this.arts) {
      const box = a.querySelector<HTMLElement>('[data-gd-status]');
      if (!box) continue;
      const st = status(id);
      if (!st) continue;
      box.querySelector<HTMLElement>('.gd-sq')!.dataset.code = st.code;
      const text = box.querySelector<HTMLElement>('[data-gd-status-text]');
      if (text) setText(text, st.label);
      const note = box.querySelector<HTMLElement>('[data-gd-status-note]');
      if (note) note.replaceChildren(st.note.en ? bi(st.note as Bi) : '');
    }
  }

  /** The text to copy for "Copy address". */
  address(id: string) { return this.arts.get(id)?.dataset.gdAddress ?? ''; }
}
