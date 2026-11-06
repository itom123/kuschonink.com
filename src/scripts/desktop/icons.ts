// Icons on the desktop (and in folders): click selects, double-click opens,
// drag to move, drag on empty desktop to select several, arrow keys.
import { commands } from './commands';
import { navigate, prefetch } from './router';
import { settings } from './settings';
import { tipFor } from './tooltips';
import { clamp, stored } from './util';

const CELL_W = 78;
const CELL_H = 74;
const PAD_X = 2;
const PAD_Y = 6;
const positions = stored<Record<string, [number, number]>>('kus98:icons', {});

let lastPointer = 'mouse';
let lastClick: { el: HTMLElement | null; t: number } = { el: null, t: 0 };
let suppressClick = false;
let hintsShown = 0;
let hintTimer = 0;

const iconsIn = (group: Element) => [...group.querySelectorAll<HTMLElement>('.icon')].filter((i) => i.getClientRects().length > 0);

export function selectedIn(group: Element) {
  return [...group.querySelectorAll<HTMLElement>('.icon.selected')];
}

export function clearSelection(group: Element) {
  group.querySelectorAll('.icon.selected').forEach((i) => {
    i.classList.remove('selected');
    i.removeAttribute('aria-selected');
  });
  group.dispatchEvent(new CustomEvent('icons:select', { bubbles: true }));
}

export function select(icon: HTMLElement, add = false) {
  const group = icon.closest<HTMLElement>('[data-icon-group]');
  if (group && !add) clearSelection(group);
  icon.classList.add('selected');
  icon.setAttribute('aria-selected', 'true');
  icon.focus({ preventScroll: true });
  icon.dispatchEvent(new CustomEvent('icons:select', { bubbles: true }));
}

/** Open an icon: its program, its page in a window, or an outside link in a new tab. */
export function openIcon(icon: HTMLElement) {
  const cmd = icon.dataset.open;
  if (cmd) {
    commands.run(cmd, { el: icon });
    return;
  }
  const raw = icon.getAttribute('href');
  if (!raw) return;
  const url = new URL(raw, location.href);
  if (url.origin !== location.origin) window.open(url.href, '_blank', 'noopener');
  else navigate(url, { from: icon, source: 'pointer' });
}

// ---------------------------------------------------------------------------
// Free placement on the desktop
// ---------------------------------------------------------------------------

function itemOf(icon: HTMLElement) {
  return icon.closest<HTMLElement>('.desk-item')!;
}

function rows(group: HTMLElement) {
  return Math.max(1, Math.floor((group.clientHeight - PAD_Y) / CELL_H));
}

function gridPos(group: HTMLElement, n: number): [number, number] {
  const r = rows(group);
  return [PAD_X + Math.floor(n / r) * CELL_W, PAD_Y + (n % r) * CELL_H];
}

function setPos(item: HTMLElement, [x, y]: [number, number]) {
  item.style.setProperty('--ix', `${Math.round(x)}px`);
  item.style.setProperty('--iy', `${Math.round(y)}px`);
}

function posOf(item: HTMLElement): [number, number] {
  return [parseFloat(item.style.getPropertyValue('--ix')) || item.offsetLeft, parseFloat(item.style.getPropertyValue('--iy')) || item.offsetTop];
}

/** Switch the desktop from its grid to free positions (first drag, or saved positions). */
function makeFree(group: HTMLElement) {
  if (group.classList.contains('free')) return;
  const items = [...group.querySelectorAll<HTMLElement>(':scope > .desk-item')].filter((i) => i.getClientRects().length > 0);
  const at = items.map((i) => [i.offsetLeft, i.offsetTop] as [number, number]);
  items.forEach((i, n) => setPos(i, at[n]));
  group.classList.add('free');
}

function savePositions(group: HTMLElement) {
  const out: Record<string, [number, number]> = {};
  group.querySelectorAll<HTMLElement>(':scope > .desk-item').forEach((item) => {
    const id = item.querySelector<HTMLElement>('.icon')?.dataset.iconId;
    if (id && item.style.getPropertyValue('--ix')) out[id] = posOf(item);
  });
  positions.set(out);
}

/** Arrange Icons: by name or by type, in columns from the top left. */
export function arrangeIcons(group: HTMLElement, by: 'name' | 'type' | 'none' = 'none') {
  makeFree(group);
  const items = [...group.querySelectorAll<HTMLElement>(':scope > .desk-item')].filter((i) => i.getClientRects().length > 0);
  const key = (i: HTMLElement) => {
    const icon = i.querySelector<HTMLElement>('.icon')!;
    return by === 'type' ? `${icon.dataset.type ?? ''} ${icon.textContent}` : icon.textContent ?? '';
  };
  const order = by === 'none' ? items : [...items].sort((a, b) => key(a).localeCompare(key(b)));
  // My Computer and the Recycle Bin stay first, as in Windows.
  order.sort((a, b) => Number(!!b.querySelector('[data-fixed]')) - Number(!!a.querySelector('[data-fixed]')));
  order.forEach((i, n) => setPos(i, gridPos(group, n)));
  savePositions(group);
}

/** Line Up Icons: snap each icon to the nearest free grid cell. */
export function lineUpIcons(group: HTMLElement) {
  makeFree(group);
  const taken = new Set<string>();
  const r = rows(group);
  for (const item of [...group.querySelectorAll<HTMLElement>(':scope > .desk-item')].filter((i) => i.getClientRects().length > 0)) {
    const [x, y] = posOf(item);
    let col = Math.max(0, Math.round((x - PAD_X) / CELL_W));
    let row = clamp(Math.round((y - PAD_Y) / CELL_H), 0, r - 1);
    while (taken.has(`${col},${row}`)) {
      row++;
      if (row >= r) {
        row = 0;
        col++;
      }
    }
    taken.add(`${col},${row}`);
    setPos(item, [PAD_X + col * CELL_W, PAD_Y + row * CELL_H]);
  }
  savePositions(group);
}

const cellKey = ([x, y]: [number, number]) => `${Math.round((x - PAD_X) / CELL_W)},${Math.round((y - PAD_Y) / CELL_H)}`;

/** Put icons where the visitor left them; icons without a saved place take the first free cell. */
function applySaved(group: HTMLElement) {
  const saved = positions.get();
  if (!Object.keys(saved).length) return;
  group.classList.add('free');
  const a = { w: group.clientWidth, h: group.clientHeight };
  const taken = new Set<string>();
  const unsaved: HTMLElement[] = [];
  for (const item of group.querySelectorAll<HTMLElement>(':scope > .desk-item')) {
    if (!item.getClientRects().length) continue;
    const id = item.querySelector<HTMLElement>('.icon')?.dataset.iconId;
    const p = id ? saved[id] : undefined;
    if (!p) {
      unsaved.push(item);
      continue;
    }
    const at: [number, number] = [clamp(p[0], 0, Math.max(0, a.w - CELL_W)), clamp(p[1], 0, Math.max(0, a.h - CELL_H))];
    setPos(item, at);
    taken.add(cellKey(at));
  }
  let n = 0;
  for (const item of unsaved) {
    let at = gridPos(group, n++);
    while (taken.has(cellKey(at)) && n < 400) at = gridPos(group, n++);
    setPos(item, at);
    taken.add(cellKey(at));
  }
}

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

function onClick(e: MouseEvent) {
  const icon = (e.target as Element).closest<HTMLElement>('.icon');
  const group = icon?.closest<HTMLElement>('[data-icon-group]');
  if (!icon || !group) return;
  e.preventDefault();
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  const s = settings.get();
  const now = performance.now();
  const single = s.clickStyle === 'single' || lastPointer !== 'mouse' || e.detail === 0;
  if (single) {
    select(icon);
    openIcon(icon);
    return;
  }
  if (lastClick.el === icon && now - lastClick.t < s.dblClickMs) {
    lastClick = { el: null, t: 0 };
    clearTimeout(hintTimer);
    openIcon(icon);
    return;
  }
  lastClick = { el: icon, t: now };
  if (e.ctrlKey || e.metaKey) {
    if (icon.classList.contains('selected')) {
      icon.classList.remove('selected');
      icon.removeAttribute('aria-selected');
    } else select(icon, true);
  } else select(icon);
  const href = icon.getAttribute('href');
  if (href) prefetch(href);
  // A lone click: show how to open it (the first few times).
  clearTimeout(hintTimer);
  if (hintsShown < 3 && !group.dataset.noHint) {
    hintTimer = window.setTimeout(() => {
      if (lastClick.el === icon && icon.classList.contains('selected')) {
        hintsShown++;
        tipFor(icon, 'Double-click to open. (Or press Enter.)');
      }
    }, s.dblClickMs + 700);
  }
}

function onKey(e: KeyboardEvent) {
  const icon = (e.target as Element).closest?.<HTMLElement>('.icon');
  const group = icon?.closest<HTMLElement>('[data-icon-group]');
  if (!icon || !group) return;
  const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const d = dirs[e.key];
  if (d) {
    e.preventDefault();
    const r0 = icon.getBoundingClientRect();
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const other of iconsIn(group)) {
      if (other === icon) continue;
      const r = other.getBoundingClientRect();
      const dx = r.left + r.width / 2 - (r0.left + r0.width / 2);
      const dy = r.top + r.height / 2 - (r0.top + r0.height / 2);
      if (dx * d[0] + dy * d[1] <= 4) continue;
      const score = Math.abs(d[0] ? dx : dy) + 2.5 * Math.abs(d[0] ? dy : dx);
      if (score < bestScore) {
        bestScore = score;
        best = other;
      }
    }
    if (best) select(best);
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    const all = iconsIn(group);
    select(e.key === 'Home' ? all[0] : all[all.length - 1]);
  } else if (e.key === 'Delete') {
    if (commands.has('recycle-icon')) {
      e.preventDefault();
      commands.run('recycle-icon', { el: icon });
    }
  }
}

/** Drag icons around the desktop. */
function onIconPointerDown(e: PointerEvent, group: HTMLElement) {
  const icon = (e.target as Element).closest<HTMLElement>('.icon');
  if (!icon || e.button !== 0 || e.pointerType !== 'mouse' || !group.hasAttribute('data-free')) return;
  if (!icon.classList.contains('selected') && !e.ctrlKey) select(icon);
  const items = (icon.classList.contains('selected') ? selectedIn(group) : [icon]).map(itemOf);
  const sx = e.clientX;
  const sy = e.clientY;
  let starts: [number, number][] = [];
  let dragging = false;
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - sx;
    const dy = ev.clientY - sy;
    if (!dragging) {
      if (Math.abs(dx) + Math.abs(dy) < 5) return;
      dragging = true;
      makeFree(group);
      starts = items.map(posOf);
      group.classList.add('dragging-icons');
    }
    items.forEach((item, n) => setPos(item, [clamp(starts[n][0] + dx, 0, group.clientWidth - CELL_W), clamp(starts[n][1] + dy, 0, group.clientHeight - CELL_H + 10)]));
  };
  const up = (ev: PointerEvent) => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    group.classList.remove('dragging-icons');
    if (!dragging) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    // Dropped on the Recycle Bin?
    const under = document.elementsFromPoint(ev.clientX, ev.clientY).find((n) => n.closest?.('.icon') && !items.includes(itemOf(n.closest('.icon') as HTMLElement)));
    const target = under?.closest<HTMLElement>('.icon');
    if (target?.dataset.iconId === 'recycle' && commands.has('recycle-icon')) {
      items.forEach((item, n) => setPos(item, starts[n]));
      commands.run('recycle-icon', { el: icon });
    }
    savePositions(group);
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
}

/** Drag across empty desktop: the dotted rubber band selects what it touches. */
function onBackgroundPointerDown(e: PointerEvent, area: HTMLElement, group: HTMLElement) {
  if (e.button !== 0 || e.pointerType !== 'mouse' || (e.target as Element).closest('.icon')) return;
  if (!e.ctrlKey) clearSelection(group);
  const sx = e.clientX;
  const sy = e.clientY;
  let band: HTMLElement | null = null;
  const icons = iconsIn(group);
  const move = (ev: PointerEvent) => {
    const x = Math.min(sx, ev.clientX);
    const y = Math.min(sy, ev.clientY);
    const w = Math.abs(ev.clientX - sx);
    const h = Math.abs(ev.clientY - sy);
    if (!band) {
      if (w + h < 4) return;
      band = document.createElement('div');
      band.className = 'rubber-band';
      document.body.appendChild(band);
    }
    band.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    for (const icon of icons) {
      const r = icon.getBoundingClientRect();
      const hit = r.left < x + w && r.right > x && r.top < y + h && r.bottom > y;
      icon.classList.toggle('selected', hit);
      icon.toggleAttribute('aria-selected', hit);
    }
  };
  const up = () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    band?.remove();
    group.dispatchEvent(new CustomEvent('icons:select', { bubbles: true }));
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  void area;
}

/** Wire a group of icons (the desktop, or the icons in a folder window). */
export function bindIconGroup(group: HTMLElement, area: HTMLElement = group) {
  if (group.dataset.iconsReady) return;
  group.dataset.iconsReady = '1';
  group.setAttribute('data-icon-group', '');
  group.addEventListener('pointerdown', (e) => {
    lastPointer = e.pointerType;
    onIconPointerDown(e, group);
  });
  group.addEventListener('click', onClick);
  group.addEventListener('keydown', onKey);
  area.addEventListener('pointerdown', (e) => {
    lastPointer = e.pointerType;
    if (!(e.target as Element).closest('.icon')) onBackgroundPointerDown(e, area, group);
  });
}

export function initDesktopIcons() {
  const group = document.getElementById('k98-icons');
  const area = document.getElementById('k98-desktop');
  if (!group || !area) return;
  group.setAttribute('data-free', '');
  bindIconGroup(group, area);
  applySaved(group);
  addEventListener('resize', () => {
    if (group.classList.contains('free')) applySaved(group);
  });
}
