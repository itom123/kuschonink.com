// Field Guide (导览): the server-rendered panes, kept in step with the state.
// Places: "Sort by:" and its Default button (the orders are order.ts), each
// row's day, the "Closed on <day>" group, theme and Find, listings on or off,
// the selected row. Routes: the radio and each stop's status. Days: today and
// past days, in the guide's own time zone.
import type { Bi, ISODate, StatusCode } from '../../lib/guides/types';
import { bi, h, setText } from './dom';
import { DEFAULT_SORT, sortInUse, sortRows } from './order';
import type { GdState, Sort } from './state';

export interface RowInfo {
  /** Passes theme and Find (and, for listings, the day if they have dates). */
  match: boolean;
  /** Open (or worth going) on the chosen day. */
  visitable: boolean;
  /** The row's day text; null keeps the server's weekly pattern. */
  cell: Bi | null;
  /** The chosen day's status: its square in the row, and "Open that day first". */
  code?: StatusCode;
}

/** What the Places pane asks the program; it comes with each render. */
export interface PlacesHooks {
  /** Straight-line metres from the visitor to a row; null without a position. */
  metres(id: string): number | null;
  /** Where am I? has a position now. */
  located(): boolean;
  /** An order picked in the pane (the select, its Default button) or on View ▸ Sort By. */
  pick(sort: Sort): void;
}

export class PlacesPane {
  private readonly table: HTMLTableElement | null;
  private readonly body: HTMLElement | null;
  private readonly items: HTMLTableSectionElement | null;
  private readonly closed: HTMLTableSectionElement | null;
  private readonly closedHead: HTMLElement | null;
  private readonly listings: HTMLTableSectionElement | null;
  private readonly empty: HTMLElement | null;
  private readonly sortSel: HTMLSelectElement | null;
  private readonly sortDefault: HTMLElement | null;
  private readonly rows = new Map<string, HTMLTableRowElement>();
  private readonly names = new Map<string, string>();
  private readonly cells = new Map<string, HTMLElement>();
  private readonly week = new Map<string, Node[]>();
  private hooks: PlacesHooks | null = null;
  private last: GdState | null = null;
  private used: Sort | null = null;

  constructor(root: HTMLElement) {
    this.table = root.querySelector('[data-gd-table]');
    this.body = this.table?.closest<HTMLElement>('.gd-pane-body') ?? null;
    this.items = root.querySelector('tbody[data-gd-group="items"]');
    this.closed = root.querySelector('tbody[data-gd-group="closed"]');
    this.closedHead = root.querySelector('[data-gd-closed-head]');
    this.listings = root.querySelector('tbody[data-gd-group="listings"]');
    this.empty = root.querySelector('[data-gd-empty]');
    this.sortSel = root.querySelector('[data-gd-sort-select]');
    this.sortDefault = root.querySelector('[data-gd-sort-default]');
    for (const tr of root.querySelectorAll<HTMLTableRowElement>('tr[data-gd-row]')) {
      const id = tr.dataset.gdRow!;
      this.rows.set(id, tr);
      this.names.set(id, tr.querySelector('.gd-row-name')?.textContent ?? '');
      const c = tr.querySelector<HTMLElement>('[data-gd-cell]');
      if (c) {
        this.cells.set(id, c);
        this.week.set(id, [...c.childNodes].map((n) => n.cloneNode(true)));
      }
    }
    const sel = this.sortSel;
    if (sel) {
      // The greyed options follow the day and the position whenever the select is used.
      for (const ev of ['focus', 'pointerdown', 'keydown']) sel.addEventListener(ev, () => this.syncOptions());
      sel.addEventListener('change', () => this.pick(sel.value as Sort));
    }
    this.sortDefault?.addEventListener('click', () => {
      this.pick(DEFAULT_SORT);
      // The button hides itself, so the focus moves to the select.
      sel?.focus();
    });
  }

  ids(kind?: string) { return [...this.rows.values()].filter((r) => !kind || r.dataset.kind === kind).map((r) => r.dataset.gdRow!); }
  query(id: string) { return this.rows.get(id)?.dataset.q ?? ''; }

  /** The order the list uses: the chosen one, or the default while that can't apply. */
  inUse(s: GdState): Sort { return sortInUse(s.sort, s.day !== 'any', !!this.hooks?.located()); }

  /** Open that day first needs a chosen day; Nearest first needs a position. */
  can(sort: Sort, s = this.last): boolean {
    if (sort === 'open') return !!s && s.day !== 'any';
    if (sort === 'near') return !!this.hooks?.located();
    return true;
  }

  /** Choose an order: the select, its Default button, View ▸ Sort By. */
  pick(sort: Sort) {
    this.hooks?.pick(this.can(sort) ? sort : DEFAULT_SORT);
    // A greyed choice changes nothing: show the order in use again.
    if (this.last) this.syncSort(this.inUse(this.last));
  }

  render(s: GdState, info: (id: string, kind: string) => RowInfo, dayName: Bi | null, closedLabel: (n: number) => Bi, hooks?: PlacesHooks) {
    if (!this.table) return;
    if (hooks) this.hooks = hooks;
    this.last = s;
    const use = this.inUse(s);
    this.syncSort(use);
    const metres = use === 'near' ? this.hooks?.metres : undefined;
    const list = [...this.rows.values()].filter((tr) => tr.dataset.kind !== 'place').map((tr) => {
      const id = tr.dataset.gdRow!;
      const r = info(id, tr.dataset.kind!);
      return { id, tr, r, name: this.names.get(id) ?? '', tier: tr.dataset.tier, zone: tr.dataset.zi ? Number(tr.dataset.zi) : undefined, code: r.code, m: metres ? metres(id) : null };
    });
    let open = 0, shut = 0, shown = 0;
    for (const { id, tr, r } of sortRows(list, use)) {
      const kind = tr.dataset.kind!;
      const cell = this.cells.get(id);
      if (cell) {
        // A chosen day: its status with the details panel's coloured square.
        if (r.cell) cell.replaceChildren(h('span', { class: 'gd-sq', 'data-code': r.code ?? '', 'aria-hidden': 'true' }), bi(r.cell));
        else cell.replaceChildren(...(this.week.get(id) ?? []).map((n) => n.cloneNode(true)));
      }
      tr.hidden = !r.match || (kind === 'listing' && !s.listings);
      tr.classList.toggle('gd-shut', !r.visitable);
      if (!tr.hidden && kind !== 'place') shown++;
      if (kind === 'item') {
        if (r.match && !r.visitable && dayName) { this.closed?.append(tr); if (!tr.hidden) shut++; }
        else { this.items?.append(tr); if (!tr.hidden && r.visitable) open++; }
      } else if (kind === 'listing') this.listings?.append(tr);
    }
    if (this.closed) this.closed.hidden = shut === 0;
    if (this.closedHead) setText(this.closedHead, closedLabel(shut));
    if (this.listings) this.listings.hidden = !s.listings;
    if (this.empty) this.empty.hidden = shown > 0;
    this.select(s.place);
    // A new order is read from its top (or from the selected row).
    if (this.used && this.used !== use) {
      if (s.place && this.rows.has(s.place)) this.reveal(s.place);
      else if (this.body) this.body.scrollTop = 0;
    }
    this.used = use;
    return { open, shut, shown };
  }

  /** The select shows the order in use; Default shows only away from the default. */
  private syncSort(use: Sort) {
    this.syncOptions();
    if (this.sortSel) this.sortSel.value = use;
    if (this.sortDefault) this.sortDefault.hidden = use === DEFAULT_SORT;
  }

  /** Grey the orders that can't apply (Open that day first, Nearest first). Also called when a position arrives or stops. */
  syncOptions() {
    if (!this.sortSel) return;
    for (const o of this.sortSel.options) o.disabled = !this.can(o.value as Sort);
  }

  select(id: string | null) {
    for (const [k, tr] of this.rows) {
      const on = k === id;
      tr.classList.toggle('highlighted', on);
      if (on) tr.setAttribute('aria-current', 'true');
      else tr.removeAttribute('aria-current');
    }
  }

  reveal(id: string) {
    this.rows.get(id)?.scrollIntoView({ block: 'nearest' });
  }
}

export class RoutesPane {
  private readonly radios: HTMLInputElement[];
  private readonly stops: HTMLElement[];
  private readonly cards: HTMLElement[];

  constructor(root: HTMLElement) {
    this.radios = [...root.querySelectorAll<HTMLInputElement>('[data-gd-route-radio]')];
    this.stops = [...root.querySelectorAll<HTMLElement>('[data-gd-stop-status]')];
    this.cards = [...root.querySelectorAll<HTMLElement>('[data-gd-route]')];
  }

  render(s: GdState, stopNote: (id: string) => Bi | null) {
    for (const r of this.radios) r.checked = (r.value || null) === s.route;
    for (const c of this.cards) c.classList.toggle('is-open', c.dataset.gdRoute === s.route);
    for (const el of this.stops) {
      const t = stopNote(el.dataset.gdStopStatus!);
      if (t) setText(el, t);
      else el.replaceChildren();
    }
  }
}

export class DaysPane {
  private readonly blocks: HTMLElement[];
  constructor(root: HTMLElement) {
    this.blocks = [...root.querySelectorAll<HTMLElement>('[data-gd-day]')];
  }
  render(s: GdState, today: ISODate) {
    for (const b of this.blocks) {
      const d = b.dataset.gdDay!;
      b.classList.toggle('is-today', d === today);
      b.classList.toggle('is-past', d < today);
      b.classList.toggle('is-chosen', d === s.day);
      const tag = b.querySelector<HTMLElement>('.gd-today-tag');
      if (tag) tag.hidden = d !== today;
    }
  }
}
