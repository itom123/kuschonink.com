// Windows 98 menus. The Start menu, window menu bars and right-click menus all
// use this engine: hover delays, cascading submenus, arrow keys, access keys.
import { accelKey, biAccelHtml } from '../../lib/menus';
import { h, html } from './util';

export interface MenuSpec {
  /** "&Open": the letter after & is the access key. */
  label?: string;
  /** The Chinese label, with the same access key: "打开(&O)" (the 中/EN switch). */
  zh?: string;
  icon?: string;
  sep?: boolean;
  disabled?: boolean;
  /** A tick (checkbox item) or, with radio, a bullet. */
  checked?: boolean;
  radio?: boolean;
  /** The default item, in bold (what double-click does). */
  bold?: boolean;
  /** Shortcut text on the right. */
  key?: string;
  sub?: MenuSpec[];
  action?: () => void;
}

type CloseReason = 'action' | 'escape' | 'outside' | 'edge' | 'replace';

interface Session {
  root: HTMLElement;
  owner?: HTMLElement | null;
  onClose?: (reason: CloseReason) => void;
  /** Menu bars: ←/→ at the edge moves to the neighbouring menu. */
  onEdge?: (dir: -1 | 1) => void;
  popup: boolean;
  specs: WeakMap<HTMLElement, MenuSpec>;
}

const SUB_DELAY = 300;
let session: Session | null = null;
let hoverTimer = 0;

export const isOpen = () => !!session;
export const openRoot = () => session?.root ?? null;

const itemsOf = (menu: Element) =>
  [...menu.querySelectorAll<HTMLElement>(':scope > li:not([hidden]) > .menu-item')].filter((el) => el.getClientRects().length > 0);
const subOf = (item: HTMLElement) => item.parentElement?.querySelector<HTMLElement>(':scope > ul.menu.sub') ?? null;
const menuOf = (item: HTMLElement) => item.closest<HTMLElement>('ul.menu')!;
const disabled = (item: HTMLElement) => item.getAttribute('aria-disabled') === 'true';

function focusItem(item?: HTMLElement | null) {
  item?.focus({ preventScroll: true });
}

/**
 * A submenu opens to the right of its item, or to the left when the right has no
 * room. When neither side has room (a phone), it opens on the roomier side and
 * moves back onto the screen, over its own menu, as Windows does at the edge.
 */
function placeSub(sub: HTMLElement) {
  const s = sub.style;
  sub.classList.remove('flip');
  s.left = s.top = s.maxHeight = s.overflowY = '';
  const right = innerWidth - 2;
  const limit = innerHeight - 2;
  // Taller than the screen: it scrolls. (Before the sideways check: a scroll bar widens it.)
  if (sub.getBoundingClientRect().height > limit - 4) {
    s.maxHeight = `${limit - 4}px`;
    s.overflowY = 'auto';
  }
  const r = sub.getBoundingClientRect();
  if (r.right > right) {
    sub.classList.add('flip');
    const f = sub.getBoundingClientRect();
    if (f.left < 2) {
      const toLeft = f.right - 2 > right - r.left;
      sub.classList.remove('flip');
      s.left = `${(toLeft ? 2 : right - r.width) - sub.parentElement!.getBoundingClientRect().left}px`;
    }
  }
  const r2 = sub.getBoundingClientRect();
  if (r2.bottom > limit) s.top = `${-3 - (r2.bottom - limit)}px`;
}

function closeSub(li: Element) {
  li.classList.remove('open');
  li.querySelector(':scope > .menu-item')?.setAttribute('aria-expanded', 'false');
  li.querySelectorAll(':scope li.open').forEach((x) => closeSub(x));
}

function closeSiblings(li: Element) {
  li.parentElement?.querySelectorAll(':scope > li.open').forEach((x) => {
    if (x !== li) closeSub(x);
  });
}

function openSub(item: HTMLElement, focusFirst = false) {
  const li = item.parentElement!;
  const sub = subOf(item);
  if (!sub || disabled(item)) return;
  closeSiblings(li);
  if (!li.classList.contains('open')) {
    li.dispatchEvent(new CustomEvent('menu:open', { bubbles: true }));
    li.classList.add('open');
    item.setAttribute('aria-expanded', 'true');
    placeSub(sub);
  }
  if (focusFirst) focusItem(itemsOf(sub)[0]);
}

/** Run an item: built items call their action; links and data-cmd buttons get a click. */
function activate(item: HTMLElement, viaEvent?: Event) {
  const s = session;
  if (!s || disabled(item)) return;
  const spec = s.specs.get(item);
  close('action');
  if (spec) {
    viaEvent?.preventDefault();
    spec.action?.();
  } else if (!viaEvent) {
    item.click();
  }
}

function onPointerOver(e: PointerEvent) {
  const s = session;
  const item = (e.target as Element).closest<HTMLElement>('.menu-item');
  if (!s || !item || !s.root.contains(item)) return;
  if (document.activeElement !== item) focusItem(item);
  clearTimeout(hoverTimer);
  hoverTimer = window.setTimeout(() => {
    if (subOf(item)) openSub(item);
    else closeSiblings(item.parentElement!);
  }, e.pointerType === 'mouse' ? SUB_DELAY : 0);
}

function onClick(e: MouseEvent) {
  const s = session;
  const item = (e.target as Element).closest<HTMLElement>('.menu-item');
  if (!s || !item || !s.root.contains(item)) return;
  if (disabled(item)) {
    e.preventDefault();
    return;
  }
  if (subOf(item)) {
    e.preventDefault();
    clearTimeout(hoverTimer);
    openSub(item, e.detail === 0);
    return;
  }
  activate(item, e);
}

function onKey(e: KeyboardEvent) {
  const s = session;
  if (!s) return;
  const focused = (document.activeElement as HTMLElement | null)?.closest?.('.menu-item') as HTMLElement | null;
  const item = focused && s.root.contains(focused) ? focused : null;
  const menu = item ? menuOf(item) : s.root;
  const list = itemsOf(menu);
  const i = item ? list.indexOf(item) : -1;
  const key = e.key;
  if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
    e.preventDefault();
    if (!list.length) return;
    const n = key === 'Home' ? 0 : key === 'End' ? list.length - 1 : key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
    focusItem(list[n]);
  } else if (key === 'ArrowRight') {
    e.preventDefault();
    if (item && subOf(item)) openSub(item, true);
    else s.onEdge?.(1);
  } else if (key === 'ArrowLeft') {
    e.preventDefault();
    if (menu !== s.root) {
      const li = menu.parentElement!;
      closeSub(li);
      focusItem(li.querySelector<HTMLElement>(':scope > .menu-item'));
    } else s.onEdge?.(-1);
  } else if (key === 'Enter' || key === ' ') {
    e.preventDefault();
    if (!item) return;
    if (subOf(item)) openSub(item, true);
    else activate(item);
  } else if (key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (menu !== s.root) {
      const li = menu.parentElement!;
      closeSub(li);
      focusItem(li.querySelector<HTMLElement>(':scope > .menu-item'));
    } else close('escape');
  } else if (key === 'Tab') {
    e.preventDefault();
    close('escape');
  } else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const k = key.toLowerCase();
    const matches = list.filter((x) => x.dataset.key === k);
    if (!matches.length) return;
    e.preventDefault();
    if (matches.length === 1) {
      const m = matches[0];
      focusItem(m);
      if (subOf(m)) openSub(m, true);
      else activate(m);
    } else focusItem(matches.find((x) => list.indexOf(x) > i) ?? matches[0]);
  }
}

function onOutside(e: PointerEvent) {
  const s = session;
  if (!s) return;
  const t = e.target as Node;
  if (s.root.contains(t) || s.owner?.contains(t)) return;
  close('outside');
}

function attach(root: HTMLElement) {
  if (root.dataset.menuReady) return;
  root.dataset.menuReady = '1';
  root.addEventListener('pointerover', onPointerOver);
  root.addEventListener('click', onClick);
  root.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Make a menu tree (a ul.menu) the open menu. */
export function openTree(
  root: HTMLElement,
  o: { owner?: HTMLElement | null; onClose?: (r: CloseReason) => void; onEdge?: (dir: -1 | 1) => void; popup?: boolean; specs?: WeakMap<HTMLElement, MenuSpec>; focusFirst?: boolean } = {},
) {
  close('replace');
  session = { root, owner: o.owner, onClose: o.onClose, onEdge: o.onEdge, popup: !!o.popup, specs: o.specs ?? new WeakMap() };
  attach(root);
  if (!root.hasAttribute('tabindex')) root.tabIndex = -1;
  if (o.focusFirst) focusItem(itemsOf(root)[0]);
  else root.focus({ preventScroll: true });
}

export function close(reason: CloseReason = 'escape') {
  const s = session;
  if (!s) return;
  session = null;
  clearTimeout(hoverTimer);
  s.root.querySelectorAll('li.open').forEach((li) => closeSub(li));
  if (s.popup) s.root.remove();
  s.onClose?.(reason);
  if ((reason === 'escape' || reason === 'action') && s.owner && document.activeElement?.closest?.('.menu')) {
    s.owner.focus?.({ preventScroll: true });
  }
}

function build(specs: MenuSpec[], map: WeakMap<HTMLElement, MenuSpec>, sub = false): HTMLUListElement {
  const ul = h('ul', { class: sub ? 'menu sub' : 'menu popup', role: 'menu' });
  if (specs.some((s) => s.checked !== undefined)) ul.classList.add('check');
  for (const s of specs) {
    if (s.sep) {
      ul.append(h('li', { class: 'menu-sep', role: 'separator' }));
      continue;
    }
    const b = h('button', {
      type: 'button',
      class: ['menu-item', s.bold ? 'default' : '', s.radio ? 'radio' : ''].filter(Boolean).join(' '),
      role: s.checked === undefined ? 'menuitem' : s.radio ? 'menuitemradio' : 'menuitemcheckbox',
      tabindex: '-1',
      'aria-checked': s.checked === undefined ? undefined : String(!!s.checked),
      'aria-disabled': s.disabled ? 'true' : undefined,
      'aria-haspopup': s.sub ? 'menu' : undefined,
      'aria-expanded': s.sub ? 'false' : undefined,
      'data-key': accelKey(s.label) || undefined,
    });
    if (s.icon) b.append(h('span', { class: `ico ico16 ico-${s.icon}`, 'aria-hidden': 'true' }));
    const label = h('span', { class: 'mi-label' });
    label.innerHTML = biAccelHtml(s.label ?? '', s.zh);
    b.append(label);
    if (s.key) b.append(h('span', { class: 'mi-key' }, s.key));
    map.set(b, s);
    const li = h('li', { role: 'none', class: s.sub ? 'has-sub' : undefined }, b);
    if (s.sub) li.append(build(s.sub, map, true));
    ul.append(li);
  }
  return ul;
}

/** Open a menu at a point (right-click) or under an anchor (menu bars). */
export function popup(
  specs: MenuSpec[],
  x: number,
  y: number,
  o: { owner?: HTMLElement | null; onClose?: (r: CloseReason) => void; onEdge?: (dir: -1 | 1) => void; focusFirst?: boolean; className?: string; label?: string } = {},
) {
  const map = new WeakMap<HTMLElement, MenuSpec>();
  const root = build(specs, map);
  if (o.className) root.classList.add(o.className);
  if (o.label) root.setAttribute('aria-label', o.label);
  root.style.left = '0px';
  root.style.top = '0px';
  document.body.appendChild(root);
  const r = root.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + r.width > innerWidth - 2) left = Math.max(2, x - r.width);
  if (top + r.height > innerHeight - 2) top = Math.max(2, y - r.height);
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
  openTree(root, { ...o, popup: true, specs: map });
  return root;
}

export function initMenus() {
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onOutside, true);
  addEventListener('blur', () => close('outside'));
  addEventListener('resize', () => close('outside'));
  html.classList.add('menus-ready');
}
