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
import { initControlPanel } from './apps/controlpanel';
import { session } from './session';
import { initSound } from './sound';
import { initTrails } from './trails';
import { initTray } from './tray';
import { escapeHtml, html } from './util';
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
initTooltips();
initSound();
initTrails();
initTray();
initControlPanel();

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

// F1 opens Help (where the browser lets the page have it).
addEventListener('keydown', (e) => {
  if (e.key === 'F1' && !e.altKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    navigate('/help', { source: 'keyboard' });
  }
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
