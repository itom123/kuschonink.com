// Field Guide (导览): the server-rendered panes, kept in step with the state.
// Places: sort, Day column, the "Closed on <day>" group, theme and Find,
// listings on or off, the selected row. Routes: the radio and each stop's
// status. Days: today and past days, in the guide's own time zone.
import type { Bi, ISODate } from '../../lib/guides/types';
import { dayLabel } from '../../lib/guides/core';
import { setText } from './dom';
import type { GdState, Sort } from './state';

export interface RowInfo {
  /** Passes theme and Find (and, for listings, the day if they have dates). */
  match: boolean;
  /** Open (or worth going) on the chosen day. */
  visitable: boolean;
  /** Day column text; null keeps the server's weekly pattern. */
  cell: Bi | null;
}

const TIER_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 };
const num = (id: string) => Number(id.replace(/^\D+/, '')) || 0;

export class PlacesPane {
  private readonly table: HTMLTableElement | null;
  private readonly items: HTMLTableSectionElement | null;
  private readonly closed: HTMLTableSectionElement | null;
  private readonly closedHead: HTMLElement | null;
  private readonly listings: HTMLTableSectionElement | null;
  private readonly empty: HTMLElement | null;
  private readonly dayHead: HTMLElement | null;
  private readonly rows = new Map<string, HTMLTableRowElement>();
  private readonly cells = new Map<string, HTMLElement>();
  private readonly week = new Map<string, Node[]>();

  constructor(root: HTMLElement) {
    this.table = root.querySelector('[data-gd-table]');
    this.items = root.querySelector('tbody[data-gd-group="items"]');
    this.closed = root.querySelector('tbody[data-gd-group="closed"]');
    this.closedHead = root.querySelector('[data-gd-closed-head]');
    this.listings = root.querySelector('tbody[data-gd-group="listings"]');
    this.empty = root.querySelector('[data-gd-empty]');
    this.dayHead = root.querySelector('[data-gd-dayhead]');
    for (const tr of root.querySelectorAll<HTMLTableRowElement>('tr[data-gd-row]')) {
      this.rows.set(tr.dataset.gdRow!, tr);
      const c = tr.querySelector<HTMLElement>('[data-gd-cell]');
      if (c) {
        this.cells.set(tr.dataset.gdRow!, c);
        this.week.set(tr.dataset.gdRow!, [...c.childNodes].map((n) => n.cloneNode(true)));
      }
    }
  }

  ids(kind?: string) { return [...this.rows.values()].filter((r) => !kind || r.dataset.kind === kind).map((r) => r.dataset.gdRow!); }
  query(id: string) { return this.rows.get(id)?.dataset.q ?? ''; }

  render(s: GdState, info: (id: string, kind: string) => RowInfo, dayName: Bi | null, closedLabel: (n: number) => Bi) {
    if (!this.table) return;
    if (this.dayHead) setText(this.dayHead, dayName ? dayLabel(s.day as ISODate) : { en: 'Days', zh: '日期' });
    // Header sort state.
    for (const th of this.table.querySelectorAll<HTMLElement>('th[data-gd-sort]')) th.setAttribute('aria-sort', th.dataset.gdSort === s.sort ? 'ascending' : 'none');
    const sorted = this.sorted(s.sort);
    let open = 0, shut = 0, shown = 0;
    for (const tr of sorted) {
      const id = tr.dataset.gdRow!;
      const kind = tr.dataset.kind!;
      const r = info(id, kind);
      const cell = this.cells.get(id);
      if (cell) {
        if (r.cell) setText(cell, r.cell);
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
    return { open, shut, shown };
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

  private sorted(sort: Sort) {
    const list = [...this.rows.values()].filter((r) => r.dataset.kind !== 'place');
    const name = (r: HTMLElement) => r.querySelector('.gd-row-name')?.textContent ?? '';
    return list.sort((a, b) => {
      const ka = a.dataset.kind === 'listing' ? 1 : 0, kb = b.dataset.kind === 'listing' ? 1 : 0;
      if (ka !== kb) return ka - kb;
      if (sort === 'name') return name(a).localeCompare(name(b));
      if (sort === 'zone') return (a.dataset.zone ?? '').localeCompare(b.dataset.zone ?? '') || name(a).localeCompare(name(b));
      const ta = TIER_ORDER[a.dataset.tier ?? ''] ?? 9, tb = TIER_ORDER[b.dataset.tier ?? ''] ?? 9;
      return ta - tb || num(a.dataset.gdRow!) - num(b.dataset.gdRow!);
    });
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
