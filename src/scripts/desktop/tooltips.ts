import { tr, type Text } from './util';

// Yellow Windows 98 tooltips. Anything with a title or data-tip gets one
// after a short rest of the mouse (the browser's own tooltip is suppressed).

let tip: HTMLElement | null = null;
let timer = 0;
let hideTimer = 0;
let current: HTMLElement | null = null;
let last = { x: 0, y: 0 };

function el() {
  tip ??= Object.assign(document.createElement('div'), { className: 'tooltip', role: 'tooltip', hidden: true });
  if (!tip.isConnected) document.body.appendChild(tip);
  return tip;
}

/** Show a tooltip at a point (or below an element) for a while. */
export function showTip(text: string, x: number, y: number, ms = 5000, cls = '') {
  const t = el();
  t.className = `tooltip ${cls}`.trim();
  t.textContent = text;
  t.hidden = false;
  t.style.left = '0px';
  t.style.top = '0px';
  const r = t.getBoundingClientRect();
  t.style.left = `${Math.max(2, Math.min(x, innerWidth - r.width - 2))}px`;
  t.style.top = `${y + r.height > innerHeight - 2 ? y - r.height - 24 : y}px`;
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(hideTip, ms);
}

export function hideTip() {
  clearTimeout(timer);
  if (tip) tip.hidden = true;
}

/** A tooltip pointing at an element (hints such as "Double-click to open"). */
export function tipFor(target: Element, text: Text, ms = 3500) {
  const r = target.getBoundingClientRect();
  showTip(tr(text), r.left + 8, r.bottom + 2, ms);
}

function textOf(node: HTMLElement) {
  if (node.hasAttribute('title')) {
    const t = node.getAttribute('title') ?? '';
    node.removeAttribute('title');
    if (t) {
      node.dataset.tip = t;
      if (!node.hasAttribute('aria-label') && !node.textContent?.trim()) node.setAttribute('aria-label', t);
    }
  }
  // A Chinese tip (data-tip-zh) when the 中/EN switch shows Chinese.
  if (document.documentElement.dataset.lang === 'zh' && node.dataset.tipZh) return node.dataset.tipZh;
  return node.dataset.tip ?? '';
}

export function initTooltips() {
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const node = (e.target as Element).closest?.<HTMLElement>('[title], [data-tip]');
    if (!node || node === current) return;
    const text = textOf(node);
    hideTip();
    current = node;
    if (!text) return;
    timer = window.setTimeout(() => {
      if (current === node && node.isConnected && !document.querySelector('.menu.popup, .start[open]')) showTip(text, last.x + 2, last.y + 20);
    }, 600);
  });
  document.addEventListener('pointermove', (e) => {
    last = { x: e.clientX, y: e.clientY };
  }, { passive: true });
  document.addEventListener('pointerout', (e) => {
    if (current && !current.contains(e.relatedTarget as Node)) {
      current = null;
      hideTip();
    }
  });
  document.addEventListener('pointerdown', () => hideTip(), true);
  document.addEventListener('keydown', () => hideTip(), true);
  addEventListener('scroll', () => hideTip(), true);
}
