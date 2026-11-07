// The window manager: stacking, focus, moving, resizing, minimising,
// maximising and closing windows, the Windows 98 way.
//
// Windows are never moved in the DOM once inserted (stacking is z-index), so
// iframes inside them (YouTube, Turnstile) never reload.
import { APPS, addressFor, cleanPath, upOf, type AppId } from '../../lib/apps';
import { settings } from './settings';
import { play } from './sound';
import { clamp, emit, html, isCompact, reducedMotion, siteTitle, lang, shownText, tr } from './util';

export type WinState = 'normal' | 'max' | 'min';

export interface Win {
  id: number;
  el: HTMLElement;
  app: string;
  state: WinState;
  /** State to return to when un-minimised. */
  restore: 'normal' | 'max';
  x: number;
  y: number;
  w: number;
  h: number;
  /** This window's own Back/Forward list. */
  hist: string[];
  hi: number;
  /** Nodes kept between pages of this window (see [data-keep]). */
  keep: Map<string, Element>;
  docTitle: string;
  /** The page's Chinese title (meta title-zh), for the 中/EN switch. */
  docTitleZh?: string;
  /** Has a taskbar button. */
  task: boolean;
  /** A dialog's owner (the dialog blocks it). */
  owner?: Win;
  /** The dialog blocking this window. */
  modal?: Win;
  /** A dialog that blocks the whole desktop. */
  global?: boolean;
  dialog?: boolean;
  onClose?: () => void;
}

/** Where a window was left (memory.ts keeps it): place and size, maximised, the bars it hides. */
export interface Place {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  max?: boolean;
  /** View ▸ Toolbars / Status Bar: the parts hidden ([data-hide]). */
  bars?: string;
}

export interface OpenOpts {
  docTitle?: string;
  docTitleZh?: string;
  state?: WinState;
  task?: boolean;
  owner?: Win;
  global?: boolean;
  dialog?: boolean;
  near?: Win | null;
  center?: boolean;
  /** Open exactly here (a refresh putting the desktop back), instead of where the program was last left. */
  at?: Place;
  /** No caption flying out (a refresh putting windows back). */
  quiet?: boolean;
  onClose?: () => void;
}

const MIN_W = 200;
const MIN_H = 110;

let layer!: HTMLElement;
const wins: Win[] = [];
const globals: Win[] = [];
let zTop = 20;
let nextId = 1;
let active: Win | null = null;
let hiddenByShowDesktop: Win[] = [];

/** Set by other modules so the window manager doesn't import them. */
export const hooks = {
  nav: (_win: Win, _cmd: string) => {},
  sysmenu: (_win: Win, _x: number, _y: number) => {},
  /** Where a program's window was last left (memory.ts), or null. */
  place: (_app: string): Place | null => null,
};

export const list = () => wins.slice();
export const getActive = () => active;
export const byId = (id: number) => wins.find((w) => w.id === id);
export function byEl(node: Element | null | undefined): Win | undefined {
  const el = node?.closest?.('[data-window]');
  return el ? wins.find((w) => w.el === el) : undefined;
}
/** The page window of a program (dialogs excluded). */
export const find = (app: string) => wins.find((w) => w.app === app && !w.dialog);
export const urlOf = (win: Win) => win.el.dataset.url ?? '';
/** The window's title, in the language showing. */
export const titleOf = (win: Win) => shownText(win.el.querySelector(':scope > .title-bar [data-title]'));
/** A window's title in both languages (Start ▸ Documents keeps both). */
export function titlesOf(win: Win) {
  const el = win.el.querySelector(':scope > .title-bar [data-title]');
  return { en: shownText(el, 'en').trim(), zh: shownText(el, 'zh').trim() };
}
/** The browser tab's title for a window's page, in the language showing. */
export const pageTitle = (win: Win) => (lang() === 'zh' && win.docTitleZh) || win.docTitle;
export const isPage = (win: Win) => !!win.el.dataset.url && !win.dialog;
const zOf = (win: Win) => Number(win.el.style.zIndex) || 0;

function area() {
  return { w: layer.clientWidth || innerWidth, h: layer.clientHeight || innerHeight };
}

function place(win: Win) {
  const s = win.el.style;
  s.setProperty('--x', `${Math.round(win.x)}px`);
  s.setProperty('--y', `${Math.round(win.y)}px`);
  s.setProperty('--w', `${Math.round(win.w)}px`);
  s.setProperty('--h', `${Math.round(win.h)}px`);
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Size and put a window as it was left, kept within this screen, with the bars it showed. */
function fitPlace(win: Win, p: Place) {
  const a = area();
  if (num(p.w) && num(p.h)) {
    win.w = Math.max(MIN_W, Math.min(p.w, a.w - 16));
    win.h = Math.max(MIN_H, Math.min(p.h, a.h - 16));
  }
  if (num(p.x) && num(p.y)) Object.assign(win, clampMove({ x: p.x, y: p.y, w: win.w, h: win.h }));
  if (typeof p.bars === 'string') {
    if (p.bars) win.el.dataset.hide = p.bars;
    else delete win.el.dataset.hide;
  }
}

const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
function addHandles(el: HTMLElement) {
  if (el.querySelector(':scope > .rz')) return;
  for (const d of DIRS) {
    const r = document.createElement('div');
    r.className = `rz rz-${d}`;
    r.dataset.resize = d;
    r.setAttribute('aria-hidden', 'true');
    el.appendChild(r);
  }
}

function cascadeFrom(near: Win | null | undefined, w: number, h: number) {
  const a = area();
  if (!near || near.state !== 'normal' || near.dialog) return null;
  let x = near.x + 26;
  let y = near.y + 26;
  if (x + w > a.w - 4 || y + h > a.h - 4) {
    const n = wins.length % 6;
    x = 16 + n * 26;
    y = 10 + n * 26;
  }
  return { x, y };
}

function adopt(el: HTMLElement, o: OpenOpts = {}): Win {
  const app = el.dataset.app ?? 'dialog';
  const info = APPS[app as AppId];
  const a = area();
  const cs = getComputedStyle(el);
  const w = Math.max(MIN_W, Math.min(parseFloat(cs.getPropertyValue('--w')) || info?.w || 420, a.w - 16));
  const h = Math.max(MIN_H, Math.min(parseFloat(cs.getPropertyValue('--h')) || info?.h || 300, a.h - 16));
  const pos = (!o.center && cascadeFrom(o.near, w, h)) || { x: (a.w - w) / 2, y: Math.max(8, (a.h - h) / 2) };
  const win: Win = {
    id: nextId++,
    el,
    app,
    state: 'normal',
    restore: 'normal',
    x: pos.x,
    y: pos.y,
    w,
    h,
    hist: [el.dataset.url ?? ''],
    hi: 0,
    keep: new Map(),
    docTitle: o.docTitle ?? document.title,
    docTitleZh: o.docTitleZh,
    task: o.task ?? true,
    owner: o.owner,
    global: o.global,
    dialog: o.dialog,
    onClose: o.onClose,
  };
  el.dataset.winId = String(win.id);
  addHandles(el);
  wins.push(win);
  // A program's window opens where it was last left (dialog boxes always open in the middle).
  const p = o.dialog ? null : (o.at ?? hooks.place(app));
  if (p) fitPlace(win, p);
  place(win);
  const wasMax = typeof p?.max === 'boolean' ? p.max : el.dataset.state === 'max';
  const max = !o.dialog && (o.state === 'max' || wasMax || settings.get().alwaysMax);
  win.state = max ? 'max' : 'normal';
  if (max) win.restore = 'max';
  el.dataset.state = win.state;
  updateMaxButton(win);
  updateNav(win);
  if (o.owner) {
    o.owner.modal = win;
    blockOwner(o.owner, true);
  }
  if (o.global) {
    globals.push(win);
    refreshInert();
  }
  return win;
}

/** Size an auto-sized dialog to its content, then centre it. */
function fit(win: Win) {
  const owner = win.owner;
  const a = area();
  win.w = Math.min(win.el.offsetWidth, a.w - 16);
  win.h = Math.min(win.el.offsetHeight, a.h - 16);
  win.el.classList.remove('auto-size');
  if (owner && owner.state === 'normal') {
    win.x = clamp(owner.x + (owner.w - win.w) / 2, 4, a.w - win.w - 4);
    win.y = clamp(owner.y + Math.min(80, (owner.h - win.h) / 2), 4, a.h - win.h - 4);
  } else {
    win.x = (a.w - win.w) / 2;
    win.y = Math.max(8, (a.h - win.h) / 2.4);
  }
  place(win);
}

/** Put a server-rendered or built window on the desktop and focus it. */
export function open(el: HTMLElement, o: OpenOpts = {}): Win {
  if (!el.isConnected) layer.appendChild(el);
  const win = adopt(el, { near: active, ...o });
  if (el.classList.contains('auto-size')) fit(win);
  if (!o.dialog && !o.quiet && !reducedMotion.matches) {
    // Windows 98 draws the caption flying out when a program starts.
    zoomRect(rectFor(win, 'min') ?? centerRect(win), rectFor(win, win.state));
  }
  focus(win, { history: false });
  emit(document, 'wm:change');
  return win;
}

function centerRect(win: Win) {
  const r = rectFor(win, win.state)!;
  return { left: r.left + r.width / 2 - 20, top: r.top + r.height / 2, width: 40, height: 18 };
}

function updateMaxButton(win: Win) {
  const b = win.el.querySelector<HTMLElement>(':scope > .title-bar [data-cmd="maximize"]');
  if (!b) return;
  // Both languages, so the 中/EN switch (lang.ts) swaps in the right word.
  const label = win.state === 'max' ? { en: 'Restore', zh: '还原' } : { en: 'Maximize', zh: '最大化' };
  for (const a of ['aria-label', 'title']) {
    b.setAttribute(a, tr(label));
    b.setAttribute(`data-${a}-en`, label.en);
    b.setAttribute(`data-${a}-zh`, label.zh);
  }
}

export function updateNav(win: Win) {
  win.el.querySelectorAll<HTMLButtonElement>('[data-cmd="back"]').forEach((b) => (b.disabled = win.hi <= 0));
  win.el.querySelectorAll<HTMLButtonElement>('[data-cmd="forward"]').forEach((b) => (b.disabled = win.hi >= win.hist.length - 1));
  win.el.querySelectorAll<HTMLButtonElement>('[data-cmd="up"]').forEach((b) => (b.disabled = !upOf(urlOf(win))));
}

type Rect = { left: number; top: number; width: number; height: number };
function rectFor(win: Win, state: WinState): Rect | null {
  const L = layer.getBoundingClientRect();
  if (state === 'min') {
    const t = document.querySelector(`.task[data-win-id="${win.id}"]`);
    return t ? t.getBoundingClientRect() : null;
  }
  if (state === 'max' || isCompact()) return { left: L.left, top: L.top, width: L.width, height: L.height };
  return { left: L.left + win.x, top: L.top + win.y, width: win.w, height: win.h };
}

/** The caption "zoom": a title bar flying between two places. */
function zoomRect(from: Rect | null, to: Rect | null) {
  if (!from || !to || reducedMotion.matches) return;
  const z = document.createElement('div');
  z.className = 'wm-zoom';
  document.body.appendChild(z);
  const f = (r: Rect) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${Math.min(18, r.height)}px` });
  const anim = z.animate([f(from), f(to)], { duration: 200, easing: 'linear' });
  anim.onfinish = anim.oncancel = () => z.remove();
}

export function setState(win: Win, state: WinState, animate = true) {
  if (win.state === state) return;
  const from = win.state;
  if (animate) zoomRect(rectFor(win, from), rectFor(win, state));
  if (state === 'min') win.restore = from === 'max' ? 'max' : 'normal';
  win.state = state;
  win.el.dataset.state = state;
  refreshInert();
  updateMaxButton(win);
  emit(win.el, 'desktop:resize');
  emit(document, 'wm:change');
}

function topVisible(except?: Win, pagesOnly = false) {
  return wins
    .filter((w) => w !== except && w.state !== 'min' && (!pagesOnly || isPage(w)))
    .sort((a, b) => zOf(b) - zOf(a))[0];
}

function raise(win: Win) {
  if (win.owner) win.owner.el.style.zIndex = String(++zTop);
  win.el.style.zIndex = String(++zTop);
  const g = globals[globals.length - 1];
  if (g && g !== win) g.el.style.zIndex = String(++zTop);
  if (zTop > 1_000_000) {
    zTop = 20;
    wins.slice().sort((a, b) => zOf(a) - zOf(b)).forEach((w) => (w.el.style.zIndex = String(++zTop)));
  }
}

/** Bring a window forward and make it the active one. */
export function focus(win: Win, o: { history?: boolean } = {}) {
  if (win.modal) return focus(win.modal, o);
  const g = globals[globals.length - 1];
  if (g && g !== win && win.owner !== g) {
    flash(g);
    return;
  }
  if (win.state === 'min') setState(win, win.restore);
  raise(win);
  if (active !== win) {
    active = win;
    for (const w of wins) {
      w.el.querySelector(':scope > .title-bar')?.classList.toggle('inactive', w !== win);
      w.el.toggleAttribute('data-active', w === win);
    }
  }
  if (o.history !== false) syncLocation(win);
  emit(document, 'wm:change');
}

/** The browser's address bar and title follow the active window. */
export function syncLocation(win: Win) {
  if (!isPage(win)) return;
  const url = urlOf(win);
  if (cleanPath(location.pathname) + location.search !== url) {
    try {
      history.replaceState({ ...(history.state ?? {}), kus98: 1, app: win.app }, '', url);
    } catch { /* Safari rate limit */ }
  }
  syncTitle(win);
}

/** The browser tab's title (and the title metas the 中/EN switch reads) follow a window's page. */
export function syncTitle(win: Win) {
  if (!win.docTitle) return;
  document.title = pageTitle(win);
  for (const [name, value] of [['title-en', win.docTitle], ['title-zh', win.docTitleZh || win.docTitle]]) {
    let m = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!m) {
      m = document.createElement('meta');
      m.name = name;
      document.head.appendChild(m);
    }
    m.content = value;
  }
}

/** Clicking the desktop: no window is active. */
export function blurAll() {
  if (!active || globals.length) return;
  active = null;
  for (const w of wins) {
    w.el.querySelector(':scope > .title-bar')?.classList.add('inactive');
    w.el.removeAttribute('data-active');
  }
  emit(document, 'wm:change');
}

export function minimize(win: Win) {
  if (win.modal || win.dialog) return;
  setState(win, 'min');
  if (active === win) {
    active = null;
    const next = topVisible(win);
    if (next) focus(next);
    else blurAll();
  }
}

export function toggleMax(win: Win) {
  if (isCompact() || win.dialog || win.el.classList.contains('no-resize')) return;
  setState(win, win.state === 'max' ? 'normal' : 'max');
  focus(win);
}

export function restore(win: Win) {
  if (win.state === 'min') setState(win, win.restore);
  else if (win.state === 'max') setState(win, 'normal');
  focus(win);
}

/** Put an open window back as it was left (a refresh): place, size, maximised, bars. */
export function setPlace(win: Win, p: Place) {
  if (win.dialog) return;
  fitPlace(win, p);
  place(win);
  if (typeof p.max === 'boolean' && win.state !== 'min') setState(win, p.max || settings.get().alwaysMax ? 'max' : 'normal', false);
  emit(win.el, 'desktop:resize');
}

export function close(win: Win) {
  if (win.modal) {
    flash(win.modal);
    return;
  }
  if (!wins.includes(win)) return;
  win.el.dispatchEvent(new CustomEvent('desktop:close', { bubbles: true }));
  wins.splice(wins.indexOf(win), 1);
  if (win.owner) {
    win.owner.modal = undefined;
    blockOwner(win.owner, false);
  }
  if (win.global) globals.splice(globals.indexOf(win), 1);
  win.el.remove();
  win.keep.clear();
  refreshInert();
  const wasActive = active === win;
  if (wasActive) active = null;
  win.onClose?.();
  if (wasActive) {
    const next = (win.owner && win.owner.state !== 'min' ? win.owner : null) ?? topVisible();
    if (next) focus(next);
  }
  if (isPage(win) && !wins.some(isPage)) {
    try {
      history.replaceState({ kus98: 1, app: 'desktop' }, '', '/');
    } catch { /* ignore */ }
    document.title = siteTitle();
  }
  emit(document, 'wm:change');
}

/** A blocked window was clicked: ding, and flash the dialog's title bar. */
export function flash(win: Win) {
  play('ding');
  let n = 0;
  const t = setInterval(() => {
    win.el.classList.toggle('flash');
    if (++n >= 6) {
      clearInterval(t);
      win.el.classList.remove('flash');
    }
  }, 75);
}

function blockOwner(owner: Win, on: boolean) {
  for (const part of owner.el.querySelectorAll(':scope > .title-bar, :scope > [data-window-inner]')) part.toggleAttribute('inert', on);
}

/** Minimised windows and everything behind a desktop-wide dialog can't be reached. */
function refreshInert() {
  const g = globals[globals.length - 1];
  document.getElementById('k98-desktop')?.toggleAttribute('inert', !!g);
  for (const w of wins) {
    const behind = !!g && w !== g && !(w.owner && w.owner === g);
    w.el.inert = w.state === 'min' || behind;
  }
}

export function showDesktop() {
  const visible = wins.filter((w) => w.state !== 'min' && !w.dialog);
  if (visible.length) {
    hiddenByShowDesktop = visible;
    visible.forEach((w) => setState(w, 'min'));
    active = null;
    blurAll();
  } else {
    hiddenByShowDesktop.filter((w) => wins.includes(w)).forEach((w) => setState(w, w.restore));
    const top = topVisible();
    if (top) focus(top);
    hiddenByShowDesktop = [];
  }
  emit(document, 'wm:change');
}

export function minimizeAll() {
  wins.filter((w) => !w.dialog).forEach((w) => setState(w, 'min'));
  blurAll();
}

export function arrange(how: 'cascade' | 'tile-h' | 'tile-v') {
  const a = area();
  const ws = wins.filter((w) => w.state !== 'min' && !w.dialog).sort((x, y) => zOf(x) - zOf(y));
  if (!ws.length) return;
  ws.forEach((w, i) => {
    if (w.state === 'max') setState(w, 'normal', false);
    if (how === 'cascade') {
      w.w = Math.min(w.w, a.w - 40 - i * 26);
      w.h = Math.min(w.h, a.h - 40 - i * 26);
      w.x = 10 + i * 26;
      w.y = 8 + i * 26;
    } else if (how === 'tile-h') {
      const hh = Math.floor(a.h / ws.length);
      Object.assign(w, { x: 0, y: i * hh, w: a.w, h: Math.max(MIN_H, hh) });
    } else {
      const ww = Math.floor(a.w / ws.length);
      Object.assign(w, { x: i * ww, y: 0, w: Math.max(MIN_W, ww), h: a.h });
    }
    place(w);
    emit(w.el, 'desktop:resize');
  });
  focus(ws[ws.length - 1]);
}

/**
 * Show another page in an existing window: everything below the title bar is
 * replaced, except nodes marked [data-keep] (the house map keeps its state).
 */
export function swap(win: Win, incoming: HTMLElement, url: string, docTitle: string, pushHistory: boolean, docTitleZh?: string) {
  const oldInner = win.el.querySelector<HTMLElement>(':scope > [data-window-inner]');
  const newInner = incoming.querySelector<HTMLElement>(':scope > [data-window-inner]');
  if (!oldInner || !newInner) return;
  const adopted = document.adoptNode(newInner);
  const live = new Map(win.keep);
  oldInner.querySelectorAll<HTMLElement>('[data-keep]').forEach((n) => live.set(n.dataset.keep!, n));
  adopted.querySelectorAll<HTMLElement>('[data-keep]').forEach((ph) => {
    const node = live.get(ph.dataset.keep!);
    if (node) {
      ph.replaceWith(node);
      live.delete(ph.dataset.keep!);
    }
  });
  if (oldInner.inert) adopted.inert = true;
  oldInner.replaceWith(adopted);
  win.keep = live;
  for (const attr of ['data-icon', 'data-alt-href', 'data-home']) {
    const v = incoming.getAttribute(attr);
    if (v == null) win.el.removeAttribute(attr);
    else win.el.setAttribute(attr, v);
  }
  win.el.className = incoming.className;
  // Both languages of the title come along (the 中/EN switch shows one).
  const title = incoming.querySelector(':scope > .title-bar [data-title]');
  const t = win.el.querySelector(':scope > .title-bar [data-title]');
  if (t && title) t.innerHTML = title.innerHTML;
  const ico = win.el.querySelector(':scope > .title-bar .title-ico');
  if (ico) ico.className = `ico ico16 ico-${win.el.dataset.icon} title-ico`;
  win.el.dataset.url = url;
  win.docTitle = docTitle;
  win.docTitleZh = docTitleZh;
  if (pushHistory) {
    win.hist = win.hist.slice(0, win.hi + 1);
    win.hist.push(url);
    win.hi = win.hist.length - 1;
  } else {
    win.hist[win.hi] = url;
  }
  if (active !== win) win.el.querySelector(':scope > .title-bar')?.classList.add('inactive');
  updateNav(win);
  emit(document, 'wm:change');
}

/** Update the address bar of a window (house map pans, etc.). */
export function setUrl(win: Win, url: string) {
  win.el.dataset.url = url;
  win.hist[win.hi] = url;
  const input = win.el.querySelector<HTMLInputElement>('[data-address]');
  if (input && document.activeElement !== input) {
    const u = new URL(url, location.origin);
    input.value = addressFor(u.pathname) + u.search;
  }
  if (active === win) syncLocation(win);
}

// ---------------------------------------------------------------------------
// Moving and resizing
// ---------------------------------------------------------------------------

type Geom = { x: number; y: number; w: number; h: number };

function clampMove(g: Geom): Geom {
  const a = area();
  return { ...g, x: clamp(g.x, -(g.w - 72), a.w - 72), y: clamp(g.y, 0, a.h - 22) };
}

function resized(s: Geom, dir: string, dx: number, dy: number): Geom {
  const a = area();
  let { x, y, w, h } = s;
  if (dir.includes('e')) w = Math.max(MIN_W, Math.min(s.w + dx, a.w - s.x + 40));
  if (dir.includes('s')) h = Math.max(MIN_H, Math.min(s.h + dy, a.h - s.y));
  if (dir.includes('w')) {
    w = Math.max(MIN_W, s.w - dx);
    x = s.x + s.w - w;
  }
  if (dir.includes('n')) {
    h = Math.max(MIN_H, s.h - dy);
    y = s.y + s.h - h;
    if (y < 0) {
      h += y;
      y = 0;
    }
  }
  return { x, y, w, h };
}

function drag(win: Win, e: PointerEvent, mode: string) {
  const sx = e.clientX;
  const sy = e.clientY;
  const start: Geom = { x: win.x, y: win.y, w: win.w, h: win.h };
  const full = settings.get().dragFull || e.pointerType === 'touch';
  let moved = false;
  let g = start;
  let outline: HTMLElement | null = null;
  const target = e.target as Element;
  try { target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  const L = layer.getBoundingClientRect();
  const show = (r: Geom) => {
    if (!outline) return;
    outline.style.cssText = `left:${L.left + r.x}px;top:${L.top + r.y}px;width:${r.w}px;height:${r.h}px`;
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    const dx = ev.clientX - sx;
    const dy = ev.clientY - sy;
    if (!moved) {
      if (Math.abs(dx) + Math.abs(dy) < 3) return;
      moved = true;
      html.dataset.dragging = mode;
      if (!full) {
        outline = document.createElement('div');
        outline.className = 'wm-outline';
        document.body.appendChild(outline);
      }
    }
    g = mode === 'move' ? clampMove({ ...start, x: start.x + dx, y: start.y + dy }) : resized(start, mode, dx, dy);
    if (full) {
      Object.assign(win, g);
      place(win);
    } else show(g);
  };
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    delete html.dataset.dragging;
    outline?.remove();
    if (moved) {
      Object.assign(win, g);
      place(win);
      emit(win.el, 'desktop:resize');
    }
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
}

/** System menu ▸ Move / Size: arrow keys move the outline, Enter puts it down, Esc cancels. */
export function keyboardMove(win: Win, mode: 'move' | 'size') {
  if (win.state !== 'normal') return;
  const L = layer.getBoundingClientRect();
  let g: Geom = { x: win.x, y: win.y, w: win.w, h: win.h };
  const outline = document.createElement('div');
  outline.className = 'wm-outline';
  document.body.appendChild(outline);
  html.dataset.dragging = mode === 'move' ? 'move' : 'se';
  const show = () => (outline.style.cssText = `left:${L.left + g.x}px;top:${L.top + g.y}px;width:${g.w}px;height:${g.h}px`);
  show();
  const done = (apply: boolean) => {
    removeEventListener('keydown', key, true);
    removeEventListener('pointerdown', click, true);
    outline.remove();
    delete html.dataset.dragging;
    if (apply) {
      Object.assign(win, g);
      place(win);
      emit(win.el, 'desktop:resize');
    }
  };
  const key = (e: KeyboardEvent) => {
    const step = e.ctrlKey ? 1 : 8;
    const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
    if (d) {
      g = mode === 'move' ? clampMove({ ...g, x: g.x + d[0], y: g.y + d[1] }) : { ...g, w: Math.max(MIN_W, g.w + d[0]), h: Math.max(MIN_H, g.h + d[1]) };
      show();
    } else if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Enter') done(true);
    if (e.key === 'Escape') done(false);
  };
  const click = () => done(true);
  addEventListener('keydown', key, true);
  addEventListener('pointerdown', click, true);
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0 || !e.isPrimary) return;
  const t = e.target as Element;
  const handle = t.closest<HTMLElement>('[data-resize]');
  const bar = handle ? null : t.closest<HTMLElement>('.title-bar');
  if (!handle && !bar) return;
  if (bar && t.closest('.title-bar-controls, [data-cmd]')) return;
  const win = byEl(t);
  if (!win || win.modal || win.state !== 'normal') return;
  if (isCompact() && !win.dialog) return;
  if (handle && win.el.classList.contains('no-resize')) return;
  e.preventDefault();
  drag(win, e, handle ? handle.dataset.resize! : 'move');
}

/** Any press inside a window focuses it; a press on the desktop unfocuses all. */
function onPointerDownCapture(e: PointerEvent) {
  const t = e.target as Element;
  if (!(t instanceof Element) || t.closest('.taskbar, .menu.popup, .tooltip')) return;
  const g = globals[globals.length - 1];
  if (g && !g.el.contains(t)) {
    e.preventDefault();
    e.stopPropagation();
    flash(g);
    return;
  }
  const win = byEl(t);
  if (win) {
    if (win.modal) {
      e.preventDefault();
      e.stopPropagation();
      focus(win.modal);
      flash(win.modal);
      return;
    }
    if (win !== active) focus(win);
  } else if (t.closest('#k98-desktop') || t === document.body || t === html) {
    blurAll();
  }
}

function onClick(e: MouseEvent) {
  const c = (e.target as Element).closest<HTMLElement>('[data-cmd]');
  if (!c) return;
  const win = byEl(c);
  if (!win) return;
  const cmd = c.dataset.cmd!;
  switch (cmd) {
    case 'minimize':
      e.preventDefault();
      minimize(win);
      break;
    case 'maximize':
      e.preventDefault();
      toggleMax(win);
      break;
    case 'close':
      e.preventDefault();
      close(win);
      break;
    case 'sysmenu': {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      hooks.sysmenu(win, r.left, r.bottom + 2);
      break;
    }
    case 'back':
    case 'forward':
    case 'up':
    case 'home':
    case 'refresh':
    case 'stop':
      e.preventDefault();
      hooks.nav(win, cmd);
      break;
  }
}

function onDblClick(e: MouseEvent) {
  const t = e.target as Element;
  const win = byEl(t);
  if (!win) return;
  if (t.closest('[data-cmd="sysmenu"]')) close(win);
  else if (t.closest('.title-bar') && !t.closest('.title-bar-controls')) toggleMax(win);
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'F4' && e.altKey && active) {
    e.preventDefault();
    close(active);
  } else if (e.key === 'Escape' && active?.dialog && !e.defaultPrevented) {
    e.preventDefault();
    close(active);
  }
}

function onViewportResize() {
  const a = area();
  for (const w of wins) {
    if (w.w > a.w - 8) w.w = Math.max(MIN_W, a.w - 8);
    if (w.h > a.h - 8) w.h = Math.max(MIN_H, a.h - 8);
    Object.assign(w, clampMove(w));
    place(w);
  }
}

export function initWM() {
  layer = document.getElementById('k98-windows')!;
  const meta = (n: string) => document.head.querySelector<HTMLMetaElement>(`meta[name="${n}"]`)?.content;
  for (const el of layer.querySelectorAll<HTMLElement>(':scope > [data-window]')) {
    const win = adopt(el, { docTitle: meta('title-en') || document.title, docTitleZh: meta('title-zh') });
    // A fresh load of /guides/<slug>?place=… keeps its query in the window's address (the server page has none).
    const u = el.dataset.url;
    if (el.dataset.app === 'guide' && location.search && u && u === cleanPath(location.pathname)) setUrl(win, u + location.search);
  }
  document.addEventListener('pointerdown', onPointerDownCapture, true);
  layer.addEventListener('pointerdown', onPointerDown);
  layer.addEventListener('click', onClick);
  layer.addEventListener('dblclick', onDblClick);
  addEventListener('keydown', onKey);
  addEventListener('resize', onViewportResize);
  // The 中/EN switch: the browser tab's title and the taskbar follow.
  document.addEventListener('langchange', () => {
    if (active) syncLocation(active);
    emit(document, 'wm:change');
  });
  // Control Panel ▸ Display ▸ "Always maximize windows": maximise what's open now, too.
  settings.on((s, changed) => {
    if (!changed.alwaysMax || !s.alwaysMax) return;
    for (const w of wins) {
      if (w.dialog || w.el.classList.contains('no-resize')) continue;
      if (w.state === 'normal') setState(w, 'max');
      else if (w.state === 'min') w.restore = 'max';
    }
  });
  const top = wins[wins.length - 1];
  if (top) focus(top, { history: false });
}
