// kuschonink 98: the desktop shell. Loaded once, in <head>, on every page.
import { api, type DesktopApi } from './api';
import { initRouter } from './router';
import { initSettings } from './settings';
import { initTaskbar } from './taskbar';
import { initWM } from './wm';

declare global {
  interface Window {
    kus98?: DesktopApi;
    __kus98?: boolean;
  }
}

window.__kus98 = true;
window.kus98 = api;

initSettings();
initWM();
initTaskbar();
initRouter();

// Once every script on the page has run, tell page content its window is ready.
function ready() {
  for (const el of document.querySelectorAll<HTMLElement>('#windows > [data-window]')) {
    el.dispatchEvent(new CustomEvent('desktop:content', { bubbles: true, detail: { url: el.dataset.url, initial: true } }));
  }
  document.dispatchEvent(new Event('astro:page-load'));
}
const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
if (document.readyState === 'complete' || (nav && nav.domContentLoadedEventStart > 0)) setTimeout(ready);
else document.addEventListener('DOMContentLoaded', ready, { once: true });
