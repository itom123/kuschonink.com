// Field Guide (导览): Find's drop-down. As you type, the best matches drop
// down under the box: places, routes, days and topics, best first (match.ts).
// Up and Down choose, Enter opens, Esc closes the list (a second Esc clears
// the box, in app.ts). The box still filters the list and the map as before.
import { W } from '../../lib/guides/words';
import { bi, h, setAttr, tr, type Bi, type Text } from './dom';
import { ranges, search, SHOWN, words, worthShowing, type Entry, type Hit } from './match.ts';

export type { Entry } from './match.ts';

function marked(name: string, ws: string[]): Node {
  const f = document.createDocumentFragment();
  let at = 0;
  for (const [a, b] of ranges(name, ws)) {
    if (a > at) f.append(name.slice(at, a));
    f.append(h('mark', {}, name.slice(a, b)));
    at = b;
  }
  if (at < name.length) f.append(name.slice(at));
  return f;
}

export interface FinderHooks {
  /** Everything Find can reach (built once, on first use). */
  entries(): Entry[];
  /** The short day status for a place ("Open", "Closed"…), or null. */
  status(e: Entry): Bi | null;
  pick(e: Entry, how: 'pointer' | 'keyboard'): void;
  /** "Show all in the list": the list pane, filtered by the box. */
  showAll(): void;
  /** How many places the box keeps in the list and on the map. */
  shownCount(): number;
}

export class Finder {
  private readonly input: HTMLInputElement;
  private readonly host: HTMLElement;
  private readonly hooks: FinderHooks;
  private readonly list: HTMLUListElement;
  private entries: Entry[] | null = null;
  private hits: Hit[] = [];
  private active = -1;
  private uid = Math.random().toString(36).slice(2, 7);
  private announceTimer = 0;

  constructor(input: HTMLInputElement, host: HTMLElement, hooks: FinderHooks, signal: AbortSignal) {
    this.input = input;
    this.host = host;
    this.hooks = hooks;
    this.list = h('ul', { class: 'gd-find-list', role: 'listbox', id: `gd-find-${this.uid}`, hidden: true });
    setAttr(this.list, 'aria-label', W.findResults);
    host.append(this.list);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', this.list.id);

    const on = { signal };
    input.addEventListener('input', () => this.update(), on);
    input.addEventListener('focus', () => { if (this.input.value.trim()) this.update(); }, on);
    input.addEventListener('blur', () => window.setTimeout(() => { if (document.activeElement !== this.input) this.close(); }, 120), on);
    input.addEventListener('keydown', (e) => this.key(e), on);
    // Keep the keyboard in the box while choosing with the mouse or a finger.
    this.list.addEventListener('pointerdown', (e) => e.preventDefault(), on);
    this.list.addEventListener('click', (e) => {
      const li = (e.target as Element).closest<HTMLElement>('[data-hit]');
      if (!li) return;
      if (li.dataset.hit === 'all') return this.all();
      this.choose(Number(li.dataset.hit), 'pointer');
    }, on);
    this.list.addEventListener('pointermove', (e) => {
      const li = (e.target as Element).closest<HTMLElement>('[data-hit]');
      if (li && li.dataset.hit !== 'all' && e.pointerType === 'mouse') this.setActive(Number(li.dataset.hit), false);
    }, on);
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Node;
      if (!this.list.hidden && !this.list.contains(t) && t !== this.input) this.close();
    }, { ...on, capture: true });
    signal.addEventListener('abort', () => { window.clearTimeout(this.announceTimer); this.list.remove(); }, { once: true });
  }

  get isOpen() { return !this.list.hidden; }

  /** Drop the index (the language or the audience's page changed). */
  reset() { this.entries = null; if (this.isOpen) this.update(); }

  close() {
    if (this.list.hidden) return;
    this.list.hidden = true;
    this.active = -1;
    this.input.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
  }

  update() {
    const q = this.input.value.trim();
    if (!q || !worthShowing(q)) return this.close();
    this.entries ??= this.hooks.entries();
    this.hits = search(this.entries, q);
    this.render(q);
  }

  private render(q: string) {
    const ws = words(q);
    const rows: HTMLElement[] = this.hits.slice(0, SHOWN).map((hit, i) => this.row(hit, i, ws));
    if (!rows.length) rows.push(h('li', { class: 'gd-hit gd-hit-none', role: 'option', 'aria-disabled': 'true' }, W.findNone));
    const n = this.hooks.shownCount();
    if (this.hits.length && n > 0) {
      rows.push(h('li', { class: 'gd-hit gd-hit-all', role: 'option', id: `gd-hit-${this.uid}-all`, 'data-hit': 'all' }, W.findShowAll(n)));
    }
    this.list.replaceChildren(...rows);
    this.place();
    this.list.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
    this.setActive(-1, false);
    window.clearTimeout(this.announceTimer);
    this.announceTimer = window.setTimeout(() => announce(this.hits.length ? W.findCount(this.hits.length) : W.findNone), 700);
  }

  private row(hit: Hit, i: number, ws: string[]): HTMLElement {
    const e = hit.e;
    const icon = e.plate
      ? h('span', { class: 'gd-plate', 'aria-hidden': 'true' }, e.plate)
      : h('span', { class: `ico ico16 ${e.icon ?? 'ico-pin-d'}`, 'aria-hidden': 'true' });
    const name = typeof e.name === 'string' ? marked(e.name, ws) : bi(e.name);
    const showId = e.kind === 'item' || e.kind === 'listing';
    const sub = e.sub == null ? null : e.sub instanceof Node ? e.sub.cloneNode(true) : bi(e.sub);
    const st = this.hooks.status(e);
    return h('li', { class: 'gd-hit', role: 'option', id: `gd-hit-${this.uid}-${i}`, 'data-hit': i, 'data-kind': e.kind, 'aria-selected': 'false' }, [
      h('span', { class: 'gd-hit-ico' }, icon),
      h('span', { class: 'gd-hit-text' }, [
        h('span', { class: 'gd-hit-name' }, [showId ? h('b', { class: 'gd-hit-id' }, e.id) : null, showId ? ' ' : null, name]),
        sub ? h('span', { class: 'gd-hit-sub' }, sub) : null,
      ]),
      st ? h('span', { class: 'gd-hit-day' }, st) : null,
    ]);
  }

  /** Under the box; as wide as the band on a narrow program. */
  private place() {
    const host = this.host.getBoundingClientRect();
    const box = this.input.getBoundingClientRect();
    const narrow = host.width < 560;
    const left = narrow ? 2 : Math.max(2, box.left - host.left);
    const width = narrow ? host.width - 4 : Math.min(Math.max(box.width, 320), host.width - left - 2);
    this.list.style.left = `${Math.round(left)}px`;
    this.list.style.top = `${Math.round(box.bottom - host.top + 1)}px`;
    this.list.style.width = `${Math.round(width)}px`;
    this.list.style.maxHeight = `${Math.max(120, Math.round(host.bottom - box.bottom - 8))}px`;
  }

  private options() { return [...this.list.querySelectorAll<HTMLElement>('[data-hit]')]; }

  private setActive(i: number, scroll = true) {
    const opts = this.options();
    this.active = i;
    opts.forEach((o, k) => o.setAttribute('aria-selected', String(k === i)));
    const cur = opts[i];
    if (cur) {
      this.input.setAttribute('aria-activedescendant', cur.id);
      if (scroll) cur.scrollIntoView({ block: 'nearest' });
    } else this.input.removeAttribute('aria-activedescendant');
  }

  private key(e: KeyboardEvent) {
    if (e.isComposing) return;
    const opts = this.options();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (this.list.hidden) {
        if (!this.input.value.trim()) return;
        this.update();
      }
      const n = this.options().length;
      if (!n) return;
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      this.setActive(this.active < 0 ? (d > 0 ? 0 : n - 1) : (this.active + d + n) % n);
      return;
    }
    if (e.key === 'Escape' && !this.list.hidden) {
      e.preventDefault();
      e.stopPropagation();
      this.close();
      return;
    }
    if (e.key === 'Enter' && !this.list.hidden) {
      e.preventDefault();
      const cur = opts[this.active];
      if (cur?.dataset.hit === 'all') return this.all();
      if (cur) return this.choose(Number(cur.dataset.hit), 'keyboard');
      // Enter with nothing chosen: the best match, if it stands out; else the whole list.
      const [a, b] = this.hits;
      if (a && (!b || a.score >= b.score * 1.5)) return this.choose(0, 'keyboard');
      return this.all();
    }
    if (e.key === 'Tab') this.close();
  }

  private choose(i: number, how: 'pointer' | 'keyboard') {
    const hit = this.hits[i];
    if (!hit) return;
    this.close();
    this.hooks.pick(hit.e, how);
  }

  private all() {
    this.close();
    this.hooks.showAll();
  }
}

/** Say something through the desktop's live region (router.ts announce()). */
function announce(t: Text) {
  const live = document.getElementById('k98-announcer');
  if (!live) return;
  live.textContent = '';
  window.setTimeout(() => { live.textContent = tr(t); }, 60);
}
