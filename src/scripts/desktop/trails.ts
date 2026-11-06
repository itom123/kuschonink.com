// Pointer trails, the Windows 98 way: ghost pointers follow the mouse and
// disappear when it stops. Control Panel ▸ Mouse turns them off or sets their
// length. Never on touch screens, with "reduce motion", or with the
// computer's own pointers.
import { settings } from './settings';
import { coarseQuery, html, reducedMotion } from './util';

const ghosts: HTMLElement[] = [];
let history: { x: number; y: number; kind: string }[] = [];
let pos = { x: -100, y: -100, kind: 'arrow' };
let raf = 0;
let lastMove = 0;
let running = false;

function wanted() {
  const s = settings.get();
  return s.trails && s.pointers !== 'system' && !coarseQuery.matches && !reducedMotion.matches;
}

function kindAt(t: Element | null) {
  if (!t) return 'arrow';
  if (t.closest('a[href], .hotspot, .welcome-option, .drawer')) return 'hand';
  if (t.closest('input[type="text"], input[type="email"], input[type="search"], input:not([type]), textarea')) return 'text';
  return 'arrow';
}

function ensureGhosts(n: number) {
  while (ghosts.length < n) {
    const g = document.createElement('div');
    g.className = 'trail-ghost';
    g.setAttribute('aria-hidden', 'true');
    document.body.appendChild(g);
    ghosts.push(g);
  }
  while (ghosts.length > n) ghosts.pop()!.remove();
}

function frame() {
  raf = 0;
  if (!running) return;
  history.unshift({ ...pos });
  const n = ghosts.length;
  const step = 2;
  history.length = Math.min(history.length, n * step + 1);
  const idle = performance.now() - lastMove > 90;
  ghosts.forEach((g, i) => {
    const p = history[(i + 1) * step];
    const show = !!p && !idle && (Math.abs(p.x - pos.x) > 3 || Math.abs(p.y - pos.y) > 3) && html.dataset.dragging === undefined;
    if (show) {
      g.style.transform = `translate(${p.x}px, ${p.y}px)`;
      g.dataset.kind = p.kind;
      g.style.opacity = String(0.85 - i * (0.5 / n));
    }
    g.hidden = !show;
  });
  if (!idle) raf = requestAnimationFrame(frame);
  else history = [];
}

function onMove(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return;
  pos = { x: e.clientX, y: e.clientY, kind: kindAt(e.target as Element) };
  lastMove = performance.now();
  if (!raf) raf = requestAnimationFrame(frame);
}

function update() {
  const on = wanted();
  if (on && !running) {
    running = true;
    addEventListener('pointermove', onMove, { passive: true });
  } else if (!on && running) {
    running = false;
    removeEventListener('pointermove', onMove);
    ghosts.forEach((g) => (g.hidden = true));
  }
  ensureGhosts(on ? Math.max(1, Math.min(8, settings.get().trailLength)) : 0);
}

export function initTrails() {
  update();
  settings.on(update);
  coarseQuery.addEventListener?.('change', update);
  reducedMotion.addEventListener?.('change', update);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ghosts.forEach((g) => (g.hidden = true));
  });
  document.addEventListener('pointerleave', () => ghosts.forEach((g) => (g.hidden = true)));
}
