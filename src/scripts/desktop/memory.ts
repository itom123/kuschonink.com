// What Xiangyin 98 remembers between page loads, in this browser only.
//
// - Each program's window, as it was last left: where and how big, maximised
//   or not, and the bars it shows (View ▸ Toolbars, Status Bar), the way
//   Windows 98 remembers folder windows. localStorage, so it lasts.
// - The desktop, for a refresh: the pages open in windows, front to back,
//   minimised or not, how far down each one was read, and each one's Back and
//   Forward. sessionStorage: this tab only, gone when the tab is closed, and put
//   back only by a reload or Back/Forward, never by typing the address again.
// - "Show this screen each time Xiangyin 98 starts": the home page opens
//   Welcome only when it should (start-up and log-on decide in boot.ts).
import { navigate } from './router';
import { settings } from './settings';
import { html, isCompact, stored } from './util';
import * as wm from './wm';
import { consent } from './consent';

const windows = stored<Record<string, wm.Place>>('kus98:windows', {});

function keep(app: string, patch: wm.Place) {
  windows.set({ ...windows.get(), [app]: { ...windows.get()[app], ...patch } });
}

/** View ▸ Toolbars or Status Bar was used: the program keeps showing (or hiding) them. */
export function rememberBars(win: wm.Win) {
  if (!win.dialog) keep(win.app, { bars: win.el.dataset.hide ?? '' });
}

// ---- The desktop, for a refresh ----

const DESK = 'kus98:desk';
interface Saved extends wm.Place {
  app: string;
  url: string;
  state: wm.WinState;
  z: number;
  scroll: number;
  hist: string[];
  hi: number;
}
interface Desk {
  v: 1;
  /** In the order they were opened (the taskbar's order). */
  wins: Saved[];
  /** The program whose window was active, if any. */
  active: string | null;
}

function readDesk(): Desk | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DESK) || 'null') as Desk | null;
    return d && d.v === 1 && Array.isArray(d.wins) ? d : null;
  } catch {
    return null;
  }
}

const bodyOf = (w: wm.Win) => w.el.querySelector<HTMLElement>('[data-window-body]');

function snapshot(): Desk {
  const active = wm.getActive();
  const wins = wm.list().filter(wm.isPage).map((w): Saved => {
    const from = Math.max(0, w.hist.length - 30);
    return {
      app: w.app,
      url: wm.urlOf(w),
      state: w.state,
      x: Math.round(w.x),
      y: Math.round(w.y),
      w: Math.round(w.w),
      h: Math.round(w.h),
      max: w.state === 'max' || (w.state === 'min' && w.restore === 'max'),
      bars: w.el.dataset.hide ?? '',
      z: Number(w.el.style.zIndex) || 0,
      scroll: Math.round(bodyOf(w)?.scrollTop ?? 0),
      hist: w.hist.slice(from),
      hi: Math.max(0, w.hi - from),
    };
  });
  return { v: 1, wins, active: active && wm.isPage(active) ? active.app : null };
}

// Nothing is written until a refresh has put the desktop back (or found nothing to
// put back), so the desktop being restored is never written over half-way.
let ready = false;
let timer = 0;

function save() {
  clearTimeout(timer);
  if (!ready) return;
  // This tab's memory needs the visitor's leave ("Allow All" or "Necessary Only", consent.ts).
  if (!consent.allows('tab')) return;
  try {
    sessionStorage.setItem(DESK, JSON.stringify(snapshot()));
  } catch { /* private mode, full storage: a refresh starts afresh */ }
}

function saveSoon() {
  clearTimeout(timer);
  if (ready) timer = window.setTimeout(save, 250);
}

/** A window was moved, sized, maximised, minimised or restored. */
function onResize(e: Event) {
  const win = wm.byEl(e.target as Element);
  // On a phone every window fills the screen: there's no place to remember.
  if (win && ready && !win.dialog && !isCompact()) {
    const p: wm.Place = { x: Math.round(win.x), y: Math.round(win.y), w: Math.round(win.w), h: Math.round(win.h) };
    // With "Always maximize windows" on, that setting decides, not the window.
    if (!settings.get().alwaysMax) p.max = win.state === 'max' || (win.state === 'min' && win.restore === 'max');
    keep(win.app, p);
  }
  saveSoon();
}

/**
 * At load, once the page's window is on the desktop. The window manager has
 * placed it, so the head script's early placement goes (Desktop.astro). And the
 * home page opens Welcome only when it should: with "Show this screen each time
 * Xiangyin 98 starts" unticked it stays closed, and after a refresh it's there
 * only if it was open before.
 */
export function settleLoad() {
  document.getElementById('k98-early-windows')?.remove();
  const welcome = wm.find('welcome');
  if (welcome && !html.dataset.boot) {
    const desk = readDesk();
    if (!settings.get().showWelcome || (desk && !desk.wins.some((s) => s?.app === 'welcome'))) wm.close(welcome);
  }
  delete html.dataset.nowelcome;
}

/** A refresh, or Back/Forward to this page; not an address typed or a link followed. */
function cameBack() {
  const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  return !nav || nav.type === 'reload' || nav.type === 'back_forward';
}

/**
 * After a refresh, put the windows back as they were; from then on, keep the
 * desktop up to date. Only a refresh (or Back/Forward) does: going to
 * kuschonink.com again in the same tab shows the page asked for, not the
 * program that was in front last time.
 */
export async function restoreDesk() {
  const desk = html.dataset.boot || !cameBack() ? null : readDesk();
  const go = () => {
    if (ready) return;
    ready = true;
    save();
  };
  // A page that hangs on its way back doesn't stop the desktop being kept.
  const wait = setTimeout(go, 15000);
  try {
    if (desk) await putBack(desk);
  } finally {
    clearTimeout(wait);
    go();
  }
}

async function putBack(desk: Desk) {
  // The page this load is for is open already.
  const here = wm.list().find(wm.isPage);
  const showWelcome = settings.get().showWelcome;
  const saved = desk.wins.filter((s) => s && typeof s.url === 'string' && s.url.startsWith('/') && (s.app !== 'welcome' || showWelcome));
  for (const s of saved) {
    let win = wm.find(s.app);
    if (win && win === here) wm.setPlace(win, s);
    else if (!win) {
      await navigate(s.url, { history: 'none', source: 'script', restore: s, scroll: s.scroll });
      win = wm.find(s.app);
    } else continue;
    if (!win || wm.urlOf(win) !== s.url) continue;
    if (Array.isArray(s.hist) && s.hist[s.hi] === s.url) {
      win.hist = s.hist.slice();
      win.hi = s.hi;
      wm.updateNav(win);
    }
    const body = bodyOf(win);
    if (body) body.scrollTop = s.scroll;
  }
  // Front to back as they were; then the minimised ones go back down.
  const byZ = [...saved].sort((a, b) => a.z - b.z);
  for (const s of byZ) {
    const w = wm.find(s.app);
    if (w && s.state !== 'min') wm.focus(w, { history: false });
  }
  for (const s of byZ) {
    const w = wm.find(s.app);
    if (w && s.state === 'min') wm.setState(w, 'min', false);
  }
  // In front: a page this load asked for that wasn't open before, or else the one that was
  // active (or, if that one didn't come back, the next one down). If none was, none is.
  const asked = here && wm.list().includes(here) && !saved.some((s) => s.app === here.app) ? here : undefined;
  const next = () => [...byZ].reverse().map((s) => wm.find(s.app)).find((w) => w && w.state !== 'min');
  const front = asked ?? (desk.active ? (wm.find(desk.active) ?? next()) : undefined);
  if (front && front.state !== 'min') wm.focus(front);
  else wm.blurAll();
}

export function initMemory() {
  wm.hooks.place = (app) => windows.get()[app] ?? null;
  document.addEventListener('wm:change', saveSoon);
  document.addEventListener('desktop:resize', onResize);
  // Leaving or reloading the page, or a phone switching to another app: write it down now.
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
}
