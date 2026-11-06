// kuschonink 98: the desktop shell. Loaded once, in <head>, on every page.
import { aboutBox } from './aboutbox';
import { api, type DesktopApi } from './api';
import { commands, initCommands } from './commands';
import { initContextMenus } from './contextmenu';
import { initDesktopIcons } from './icons';
import { initMenubars } from './menubar';
import { initMenus } from './menu';
import { initRouter, navigate } from './router';
import { initSettings } from './settings';
import { initStartMenu, remember } from './startmenu';
import { initTaskbar } from './taskbar';
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
import { escapeHtml, html } from './util';
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
wm.initWM();
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
initMyComputer();
initViewer();
initScreensaver();
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
      { label: 'Thu&mbnails', radio: true, checked: v === 'thumbs', action: () => settings.set({ explorerView: 'thumbs' }) },
      { label: '&List', radio: true, checked: v === 'list', action: () => settings.set({ explorerView: 'list' }) },
      { label: '&Details', radio: true, checked: v === 'details', action: () => settings.set({ explorerView: 'details' }) },
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
  document.querySelectorAll('[data-logoff] .mi-label').forEach((el) => (el.innerHTML = `<u>L</u>og Off ${name}...`));
}
logOffLabel();
document.addEventListener('desktop:login', logOffLabel);

commands.register('about-k98', () => aboutBox());
commands.register('help', () => navigate('/help'));

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
    if (w && wm.isPage(w)) remember({ url: wm.urlOf(w), title: wm.titleOf(w), icon: el.dataset.icon ?? 'document' });
  }
  document.dispatchEvent(new Event('astro:page-load'));
}
const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
if (document.readyState === 'complete' || (nav && nav.domContentLoadedEventStart > 0)) setTimeout(ready);
else document.addEventListener('DOMContentLoaded', ready, { once: true });
