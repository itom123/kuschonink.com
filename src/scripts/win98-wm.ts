// The simple view's window manager, for computers with a mouse and a wide screen.
// Windows can be dragged, resized, minimised, maximised and closed, and several can
// be open at once. Each window loads a simple-view page into itself. On phones and
// narrow screens nothing here runs: pages stay plain links.

import { applyLang, getLang } from './lang';

const DESKTOP = '(min-width: 900px) and (hover: hover) and (pointer: fine)';
// Pages of the simple view. Anything else (the house) is a normal page load.
const SIMPLE = /^\/(?:image(?:\/[^/]+)?|about|contact)?$/;
const TASKBAR = 36;
const MIN_W = 280;
const MIN_H = 180;

type Box = { l: number; t: number; w: number; h: number };
type Win = {
  el: HTMLElement;
  task: HTMLButtonElement;
  url: string;
  titles: { en: string; zh: string };
  prefix: string;
  max: boolean;
  min: boolean;
  restore?: Box;
};

const wins: Win[] = [];
let active: Win | null = null;
let z = 10;
let seq = 0;
let cascade = 0;
// Scripts and styles already on the page, so a loaded page only adds what is new.
const seenScripts = new Set<string>();
const seenStyles = new Set<string>();

const desk = () => ({ w: window.innerWidth, h: window.innerHeight - TASKBAR });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const winOf = (n: Element | null) => wins.find((w) => n && w.el.contains(n));
// The window's name without " — site name", in both languages (the 中/EN toggle picks one).
function shortTitle(bar: Element | null) {
  const c = (bar?.cloneNode(true) ?? document.createTextNode('Window')) as Element;
  const last = c.lastChild;
  if (last?.nodeType === Node.TEXT_NODE) last.textContent = last.textContent!.replace(/\s*—[^—]*$/, '');
  return c instanceof Element ? c.innerHTML : c.textContent ?? '';
}
const pageTitles = (doc: Document) => {
  const en = doc.querySelector<HTMLMetaElement>('meta[name="title-en"]')?.content || doc.title;
  return { en, zh: doc.querySelector<HTMLMetaElement>('meta[name="title-zh"]')?.content || en };
};
// / and /image show the same Projects window.
const pathOf = (url: string) => { const p = new URL(url, location.href).pathname; return p === '/image' ? '/' : p; };

function setBox(w: Win, b: Box) {
  const d = desk();
  b.w = clamp(b.w, MIN_W, Math.max(MIN_W, d.w));
  b.h = clamp(b.h, MIN_H, Math.max(MIN_H, d.h));
  // Keep at least part of the title bar on screen, so the window can always be grabbed.
  b.l = clamp(b.l, 80 - b.w, d.w - 80);
  b.t = clamp(b.t, 0, d.h - 24);
  Object.assign(w.el.style, { left: `${b.l}px`, top: `${b.t}px`, width: `${b.w}px`, height: `${b.h}px` });
}
const boxOf = (w: Win): Box => ({ l: w.el.offsetLeft, t: w.el.offsetTop, w: w.el.offsetWidth, h: w.el.offsetHeight });

// Button names in both languages. 98.css draws the icons from the classes, so they
// stay when the 中/EN toggle changes the aria-label.
const LABELS = {
  min: { en: 'Minimize', zh: '最小化' },
  max: { en: 'Maximize', zh: '最大化' },
  restore: { en: 'Restore', zh: '还原' },
  close: { en: 'Close', zh: '关闭' },
};
function label(b: HTMLElement, k: keyof typeof LABELS) {
  b.dataset.ariaLabelEn = LABELS[k].en;
  b.dataset.ariaLabelZh = LABELS[k].zh;
  b.setAttribute('aria-label', LABELS[k][getLang()]);
}
function controls() {
  const c = document.createElement('div');
  c.className = 'title-bar-controls';
  for (const [k, cls] of [['min', 'minimize'], ['max', 'maximize'], ['close', 'close']] as const) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.dataset.wm = k;
    label(b, k);
    c.appendChild(b);
  }
  return c;
}

function showTitle(w: Win) {
  const meta = (l: 'en' | 'zh') => {
    let m = document.querySelector<HTMLMetaElement>(`meta[name="title-${l}"]`);
    if (!m) { m = document.createElement('meta'); m.name = `title-${l}`; document.head.appendChild(m); }
    m.content = w.titles[l];
  };
  meta('en');
  meta('zh');
  document.title = w.titles[getLang()];
}

function focus(w: Win | null) {
  active = w;
  for (const o of wins) {
    o.el.querySelector('.title-bar')?.classList.toggle('inactive', o !== w);
    o.task.setAttribute('aria-pressed', String(o === w && !o.min));
  }
  if (!w) return;
  w.el.style.zIndex = String(++z);
  // The address bar follows the window in front, so a reload or a shared link opens it.
  if (location.pathname + location.hash !== w.url) history.replaceState(null, '', w.url);
  showTitle(w);
}

function topmost(except?: Win) {
  return wins.filter((o) => o !== except && !o.min).sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex))[0] ?? null;
}

function minimize(w: Win) {
  w.min = true;
  w.el.hidden = true;
  focus(topmost(w));
}

function restore(w: Win) {
  w.min = false;
  w.el.hidden = false;
  focus(w);
}

function toggleMax(w: Win) {
  const btn = w.el.querySelector<HTMLButtonElement>('[data-wm="max"]')!;
  if (w.max) {
    w.max = false;
    w.el.classList.remove('maximized');
    if (w.restore) setBox(w, w.restore);
    btn.className = 'maximize';
    label(btn, 'max');
  } else {
    w.restore = boxOf(w);
    w.max = true;
    w.el.classList.add('maximized');
    btn.className = 'restore';
    label(btn, 'restore');
  }
  focus(w);
}

function close(w: Win) {
  wins.splice(wins.indexOf(w), 1);
  w.el.remove();
  w.task.remove();
  if (active === w) focus(topmost());
}

// Give every id inside a window a prefix, so two windows can show the same page.
function prefixIds(root: HTMLElement, p: string) {
  if (!p) return;
  root.querySelectorAll<HTMLElement>('[id]').forEach((el) => (el.id = p + el.id));
  root.querySelectorAll<HTMLLabelElement>('label[for]').forEach((l) => (l.htmlFor = p + l.htmlFor));
  for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
    root.querySelectorAll(`[${attr}]`).forEach((el) => el.setAttribute(attr, el.getAttribute(attr)!.split(/\s+/).map((x) => p + x).join(' ')));
  }
  root.querySelectorAll<HTMLInputElement>('input[type=radio][name]').forEach((r) => (r.name = p + r.name));
}

function scrollToHash(w: Win, hash: string) {
  const page = w.el.querySelector<HTMLElement>('.page');
  const id = decodeURIComponent(hash.slice(1));
  const target = id ? w.el.querySelector(`#${CSS.escape(w.prefix + id)}`) : null;
  if (target) target.scrollIntoView({ block: 'start' });
  else if (page) page.scrollTop = 0;
}

// Bring in the styles and scripts a loaded page needs that this page does not have yet.
function adopt(doc: Document) {
  for (const s of doc.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel=stylesheet], style')) {
    const key = s instanceof HTMLLinkElement ? s.href : s.textContent ?? '';
    if (seenStyles.has(key)) continue;
    seenStyles.add(key);
    document.head.appendChild(s.cloneNode(true));
  }
  for (const s of doc.querySelectorAll<HTMLScriptElement>('script')) {
    if (s.type && s.type !== 'module' && s.type !== 'text/javascript') continue;
    const key = s.src || s.textContent || '';
    if (!key || seenScripts.has(key)) continue;
    seenScripts.add(key);
    const n = document.createElement('script');
    if (s.type) n.type = s.type;
    if (s.src) n.src = s.src;
    else n.textContent = s.textContent;
    document.body.appendChild(n);
  }
}

async function load(w: Win, href: string) {
  const url = new URL(href, location.href);
  document.body.classList.add('wm-loading');
  try {
    const res = await fetch(url.pathname + url.search);
    if (!res.ok) throw new Error(String(res.status));
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const body = doc.querySelector('.main-window .window-body');
    if (!body) throw new Error('not a simple-view page');
    const bar = doc.querySelector('.main-window .title-bar-text');
    w.el.querySelector('.title-bar-text')!.innerHTML = bar?.innerHTML ?? '';
    w.task.innerHTML = shortTitle(bar);
    const wb = w.el.querySelector<HTMLElement>('.window-body')!;
    wb.innerHTML = body.innerHTML;
    prefixIds(wb, w.prefix);
    w.url = url.pathname + url.hash;
    w.titles = pageTitles(doc);
    adopt(doc);
    // Page scripts (galleries, the contact form, sorting, the language) set up anything new.
    document.dispatchEvent(new Event('astro:page-load'));
    applyLang(w.el);
    scrollToHash(w, url.hash);
    if (active === w) focus(w);
  } catch {
    location.href = url.href;
  } finally {
    document.body.classList.remove('wm-loading');
  }
}

function makeWin(el: HTMLElement, url: string, prefix: string): Win {
  const task = document.createElement('button');
  task.type = 'button';
  task.className = 'task-btn';
  const w: Win = { el, task, url, titles: pageTitles(document), prefix, max: false, min: false };
  const name = el.querySelector('.title-bar-text');
  task.innerHTML = shortTitle(name);
  // The window is named by its title bar.
  if (name) {
    name.id = `wm-title-${seq}`;
    el.setAttribute('aria-labelledby', name.id);
  }
  task.addEventListener('click', () => {
    if (w.min) restore(w);
    else if (active === w) minimize(w);
    else focus(w);
  });
  document.querySelector('.task-buttons')!.appendChild(task);

  const resize = document.createElement('div');
  resize.className = 'wm-resize';
  resize.setAttribute('aria-hidden', 'true');
  el.appendChild(resize);

  el.addEventListener('pointerdown', () => { if (active !== w) focus(w); }, true);
  el.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-wm]');
    if (!b || !el.querySelector('.title-bar-controls')?.contains(b)) return;
    if (b.dataset.wm === 'min') minimize(w);
    else if (b.dataset.wm === 'max') toggleMax(w);
    else close(w);
  });
  const bar = el.querySelector<HTMLElement>('.title-bar')!;
  bar.addEventListener('dblclick', (e) => { if (!(e.target as Element).closest('button')) toggleMax(w); });
  drag(bar, (e) => !(e.target as Element).closest('button') && !w.max, () => boxOf(w), (b, dx, dy) => setBox(w, { ...b, l: b.l + dx, t: b.t + dy }));
  drag(resize, () => !w.max, () => boxOf(w), (b, dx, dy) => setBox(w, { ...b, w: b.w + dx, h: b.h + dy }));
  wins.push(w);
  return w;
}

// Pointer dragging with a start state; `move` gets the distance from where it began.
function drag<T>(handle: HTMLElement, can: (e: PointerEvent) => boolean, start: () => T, move: (s: T, dx: number, dy: number) => void) {
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !can(e)) return;
    e.preventDefault();
    const s = start();
    const x0 = e.clientX, y0 = e.clientY;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('wm-busy');
    const onMove = (m: PointerEvent) => move(s, m.clientX - x0, m.clientY - y0);
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('wm-busy');
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });
}

function open(href: string) {
  const prefix = `w${++seq}-`;
  const el = document.createElement('section');
  el.className = 'window wm-window';
  el.innerHTML = '<div class="title-bar"><div class="title-bar-text"><span data-l="en">Loading…</span><span data-l="zh" lang="zh-Hans">载入中…</span></div></div><div class="window-body"><div class="page sunken-panel"><p><span data-l="en">Please wait…</span><span data-l="zh" lang="zh-Hans">请稍候…</span></p></div></div>';
  el.querySelector('.title-bar')!.appendChild(controls());
  document.querySelector('.desktop')!.appendChild(el);
  const w = makeWin(el, href, prefix);
  const d = desk();
  const width = Math.min(900, d.w - 160);
  const height = Math.min(640, d.h - 60);
  cascade = (cascade + 1) % 8;
  setBox(w, { l: 120 + cascade * 26, t: 16 + cascade * 26, w: width, h: height });
  focus(w);
  load(w, href);
  return w;
}

function openOrFocus(href: string) {
  const url = new URL(href, location.href);
  if (!SIMPLE.test(url.pathname)) return void (location.href = url.href);
  const w = wins.find((o) => pathOf(o.url) === pathOf(url.pathname));
  if (!w) return open(url.pathname + url.hash);
  if (w.min) restore(w);
  else focus(w);
  if (url.hash) scrollToHash(w, url.hash);
}

function setupIcons() {
  const icons = [...document.querySelectorAll<HTMLAnchorElement>('.desk-icon')];
  const select = (a: HTMLAnchorElement | null) => icons.forEach((i) => i.classList.toggle('selected', i === a));
  icons.forEach((a, i) => {
    a.style.left = '10px';
    a.style.top = `${10 + i * 84}px`;
    let moved = false;
    drag(a, () => true, () => { moved = false; select(a); return { l: a.offsetLeft, t: a.offsetTop }; }, (s, dx, dy) => {
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      const d = desk();
      a.style.left = `${clamp(s.l + dx, 0, d.w - a.offsetWidth)}px`;
      a.style.top = `${clamp(s.t + dy, 0, d.h - a.offsetHeight)}px`;
    });
    // Like Windows: one click selects, a double-click (or Enter) opens.
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (e.detail === 0) openOrFocus(a.href);
      else select(a);
    });
    a.addEventListener('dblclick', (e) => { e.preventDefault(); if (!moved) openOrFocus(a.href); });
  });
  document.querySelector('.desktop')!.addEventListener('pointerdown', (e) => {
    if (!(e.target as Element).closest('.desk-icon')) select(null);
  });
}

function setupLinks() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey) return;
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    const start = a.closest('.start');
    if (start) {
      start.removeAttribute('open');
      if (SIMPLE.test(url.pathname)) { e.preventDefault(); openOrFocus(url.href); }
      return;
    }
    const w = winOf(a);
    if (!w) return;
    // A link to a place on the same page scrolls inside the window.
    if (a.getAttribute('href')!.startsWith('#')) { e.preventDefault(); scrollToHash(w, url.hash); return; }
    if (!SIMPLE.test(url.pathname)) return;
    e.preventDefault();
    if (e.shiftKey) open(url.pathname + url.hash);
    else load(w, url.href);
  });
  // Clicking anywhere else closes the Start menu.
  document.addEventListener('pointerdown', (e) => {
    const start = document.querySelector('.start');
    if (start?.hasAttribute('open') && !start.contains(e.target as Node)) start.removeAttribute('open');
  });
}

export function startWindowManager() {
  if (!matchMedia(DESKTOP).matches) return;
  const main = document.querySelector<HTMLElement>('.main-window');
  const current = document.querySelector('.task-current');
  if (!main || !current) return;
  document.querySelectorAll<HTMLScriptElement>('script').forEach((s) => seenScripts.add(s.src || s.textContent || ''));
  document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel=stylesheet], style').forEach((s) => seenStyles.add(s instanceof HTMLLinkElement ? s.href : s.textContent ?? ''));

  document.body.classList.add('wm');
  const tasks = document.createElement('div');
  tasks.className = 'task-buttons';
  current.replaceWith(tasks);

  main.classList.add('wm-window');
  main.querySelector('.title-bar-controls')?.replaceWith(controls());
  const w = makeWin(main, location.pathname + location.hash, '');
  const d = desk();
  setBox(w, { l: 110, t: 10, w: Math.min(1100, d.w - 130), h: d.h - 20 });
  focus(w);

  setupIcons();
  setupLinks();
  window.addEventListener('resize', () => wins.forEach((o) => { if (!o.max) setBox(o, boxOf(o)); }));
}
