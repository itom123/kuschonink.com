// The screen saver starts after a few idle minutes (Control Panel ▸ Display
// ▸ Screen Saver). Never on touch screens, during start-up, while a video
// plays or an embedded player has focus, or in full screen. Any key, click or
// mouse movement ends it. The savers themselves are in apps/savers.ts.
import { settings } from './settings';
import { coarseQuery, html } from './util';

let lastInput = performance.now();
let running: (() => void) | null = null;
let starting = false;

function busy() {
  return (
    coarseQuery.matches ||
    !!html.dataset.boot ||
    document.hidden ||
    !!document.fullscreenElement ||
    document.activeElement?.tagName === 'IFRAME' ||
    [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended)
  );
}

/** Start a screen saver now ('' = the chosen one). Preview ignores the click that started it. */
export async function startSaver(kind = settings.get().saver, preview = false) {
  if (running || starting || !kind) return;
  starting = true;
  try {
    const m = await import('./apps/savers');
    running = m.fullScreen(kind, {
      preview,
      onEnd: () => {
        running = null;
        lastInput = performance.now();
      },
    });
  } finally {
    starting = false;
  }
}

export function initScreensaver() {
  const poke = () => (lastInput = performance.now());
  for (const t of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(t, poke, { capture: true, passive: true });
  document.addEventListener('scroll', poke, { capture: true, passive: true });
  setInterval(() => {
    const s = settings.get();
    if (running || !s.saver) return;
    if (busy()) return poke();
    if (performance.now() - lastInput >= Math.max(1, s.saverWait) * 60_000) startSaver(s.saver);
  }, 5000);
}
