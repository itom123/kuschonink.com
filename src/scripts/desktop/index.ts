// Xiangyin 98: the desktop shell. Loaded once, in <head>, on every page.
import { aboutBox } from './aboutbox';
import { api, type DesktopApi } from './api';
import { commands, initCommands } from './commands';
import { consent, keepAgain } from './consent';
import { initContextMenus } from './contextmenu';
import { initDesktopIcons } from './icons';
import { initMenubars } from './menubar';
import { initMenus } from './menu';
import { initMemory, restoreDesk, settleLoad } from './memory';
import { initRouter, navigate } from './router';
import { initSettings } from './settings';
import { initStartMenu, remember } from './startmenu';
import { initTaskbar } from './taskbar';
import { initTextZoom } from './textzoom';
import { initTooltips } from './tooltips';
import { initMyComputer } from './apps/mycomputer';
import { initRecycleBin } from './apps/recycle';
import { initViewer } from './apps/viewer';
import * as menu from './menu';
import { session } from './session';
import { initSound } from './sound';
import { initScreensaver, startSaver } from './screensaver';
import { initTrails } from './trails';
import { initTray } from './tray';
import { settings } from './settings';
import { emit, escapeHtml, html } from './util';
import { explainFocused, initWhatsThis } from './whatsthis';
import * as wm from './wm';

declare global {
  interface Window {
    kus98?: DesktopApi;
    __kus98?: boolean;
  }
}

window.__kus98 = true;
window.kus98 = api;

initSettings();
// Before the page's window is put on the desktop: each program opens where it was left.
initMemory();
wm.initWM();
settleLoad();
initTaskbar();
initRouter();
initCommands();
initMenus();
initStartMenu();
initMenubars();
initContextMenus();
initDesktopIcons();
initRecycleBin();
initTooltips();
initSound();
initTrails();
initTray();
initTextZoom();
initMyComputer();
initViewer();
initScreensaver();
session.keepAlive();
initWhatsThis();

// Programs loaded the first time they're opened.
const panel = () => import('./apps/controlpanel');
const display = () => import('./apps/display');
commands.register('control-panel', () => panel().then((m) => m.controlPanel()));
commands.register('mouse-properties', () => panel().then((m) => m.mouseProperties()));
commands.register('sounds-properties', () => panel().then((m) => m.soundsProperties()));
const find = () => import('./apps/find');
commands.register('display-properties', () => display().then((m) => m.displayProperties()));
commands.register('folder-options', () => display().then((m) => m.folderOptions()));
commands.register('run', () => import('./apps/run').then((m) => m.runDialog()));
commands.register('find', () => find().then((m) => m.findWindow()));
commands.register('saver-now', () => startSaver(settings.get().saver || 'lines', true));
// Start ▸ Find ▸ Rooms in the House: the floorplan, with its search box ready.
commands.register('find-room', async () => {
  await navigate('/house');
  const input = document.querySelector<HTMLInputElement>('[data-app="house"] .map-search input');
  input?.focus();
  input?.select();
});
// F3 finds, on the desktop and in folders (elsewhere the browser keeps it).
addEventListener('keydown', (e) => {
  if (e.key !== 'F3' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const w = wm.getActive();
  if ((e.target as Element).closest?.('input, textarea, select, [contenteditable]')) return;
  if (w && w.app !== 'explorer' && w.app !== 'mycomputer' && w.app !== 'drive-c' && w.app !== 'find') return;
  e.preventDefault();
  commands.run('find');
});

// Views ▾ in a folder's toolbar.
commands.register('views', (ctx) => {
  const el = ctx.el as HTMLElement | null;
  if (!el) return;
  const v = settings.get().explorerView;
  const r = el.getBoundingClientRect();
  menu.popup(
    [
      { label: 'Thu&mbnails', zh: '缩略图(&M)', radio: true, checked: v === 'thumbs', action: () => settings.set({ explorerView: 'thumbs' }) },
      { label: '&List', zh: '列表(&L)', radio: true, checked: v === 'list', action: () => settings.set({ explorerView: 'list' }) },
      { label: '&Details', zh: '详细资料(&D)', radio: true, checked: v === 'details', action: () => settings.set({ explorerView: 'details' }) },
    ],
    r.left,
    r.bottom,
    { owner: el },
  );
});
// Send in the New Message window.
commands.register('mail-send', (ctx) => {
  const form = wm.byEl(ctx.el)?.el.querySelector<HTMLFormElement>('form.contact-form');
  form?.requestSubmit();
});
// Backspace goes up a level in folders and the House.
addEventListener('keydown', (e) => {
  if (e.key !== 'Backspace' || e.defaultPrevented || (e.target as Element).closest?.('input, textarea, select, [contenteditable]')) return;
  const w = wm.getActive();
  if (w && (w.app === 'explorer' || w.app === 'house')) {
    e.preventDefault();
    wm.hooks.nav(w, 'up');
  }
});

// Start-up, log-on, log-off and shut-down live in their own file, loaded when needed.
const boot = () => import('./boot');
commands.register('logoff', () => boot().then((m) => m.logOff()));
commands.register('shutdown', () => boot().then((m) => m.shutDownDialog()));
if (html.dataset.boot) {
  boot()
    .then((m) => m.startUp())
    .catch(() => delete html.dataset.boot);
}

// Start ▸ "Log Off <name>..."
function logOffLabel() {
  const name = escapeHtml(session.user() || 'Guest');
  document.querySelectorAll('[data-logoff] .mi-label').forEach(
    (el) => (el.innerHTML = `<span data-l="en"><u>L</u>og Off ${name}...</span><span data-l="zh" lang="zh-Hans">注销 ${name}(<u>L</u>)...</span>`),
  );
}
logOffLabel();
document.addEventListener('desktop:login', logOffLabel);

// Admin mode (the hidden /admin log-on, checked on the server): its scripts load only when it is on.
const adminMode = () => import('../admin/mode').then((m) => m.initAdminMode()).catch(() => {});
if (html.hasAttribute('data-admin')) void adminMode();
document.addEventListener('admin:change', () => void adminMode());

commands.register('about-k98', () => aboutBox());
commands.register('help', () => navigate('/help'));
// Start ▸ Settings ▸ Cookies...: the Cookies dialog, to change the choice (cookies.ts).
commands.register('cookies', () => api.consent.show());
// Page content hears of a new choice (lang.ts keeps a language chosen before it).
// `again`: what the page shows is to be kept again (keepAgain() in consent.ts).
consent.on((level, was, here) => emit(document, 'consent:change', { level, again: keepAgain(level, was, here) }));

/**
 * Before any choice about cookies, the Cookies dialog asks once the desktop
 * is ready: after start-up and log-on, or at once when they don't show (a
 * guide's link). After a choice nothing asks here: the Information Bar comes
 * back only when a feature that must have a cookie is used (cookies.ts),
 * never after a start-up on its own. Never for bots and link previews.
 */
function askAboutCookies() {
  if (html.hasAttribute('data-robot')) return;
  const go = () => {
    // Nothing to ask: a choice made, or none could be kept (site data blocked).
    if (consent.decided() || !consent.lasts()) return;
    import('./cookies').then((m) => m.atStart(), () => {});
  };
  if (html.dataset.boot) document.addEventListener('desktop:login', go, { once: true });
  else go();
}

// F1 opens Help (where the browser lets the page have it). In a dialog, it
// explains the control that has the focus (What's This?).
addEventListener('keydown', (e) => {
  if (e.key !== 'F1' || e.altKey || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  const el = document.activeElement;
  if (el && el !== document.body && el.closest('.prop-window, .v-dialog') && explainFocused(el)) return;
  navigate('/help', { source: 'keyboard' });
});

// Once every script on the page has run, tell page content its window is ready.
function ready() {
  for (const el of document.querySelectorAll<HTMLElement>('#k98-windows > [data-window]')) {
    el.dispatchEvent(new CustomEvent('desktop:content', { bubbles: true, detail: { url: el.dataset.url, initial: true } }));
    const w = wm.byEl(el);
    if (w && wm.isPage(w)) {
      const t = wm.titlesOf(w);
      remember({ url: wm.urlOf(w), title: t.en, titleZh: t.zh, icon: el.dataset.icon ?? 'document' });
    }
  }
  document.dispatchEvent(new Event('astro:page-load'));
  // After a refresh, the other windows come back as they were; then the cookies are asked about.
  void restoreDesk().finally(askAboutCookies);
}
const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
if (document.readyState === 'complete' || (nav && nav.domContentLoadedEventStart > 0)) setTimeout(ready);
else document.addEventListener('DOMContentLoaded', ready, { once: true });
