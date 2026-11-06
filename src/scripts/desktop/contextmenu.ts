// Right-click menus for everything on the desktop. Also: press and hold on a
// touch screen, and Shift+F10 or the Menu key on a keyboard. Text fields and
// Shift+right-click keep the browser's own menu.
import { commands } from './commands';
import { arrangeIcons, lineUpIcons, openIcon, select } from './icons';
import * as menu from './menu';
import { showIconProperties } from './properties';
import { navigate } from './router';
import { isCompact } from './util';
import { linkMenu, mailAbout, pageMenu, photoMenu, systemMenu, toolbarsMenu } from './winmenus';
import { binItemMenu, recycleIconMenu } from './apps/recycle';
import * as wm from './wm';

type Target = { specs: menu.MenuSpec[]; owner?: HTMLElement | null } | null;

function iconMenu(icon: HTMLElement): menu.MenuSpec[] {
  const group = icon.closest('[data-icon-group]');
  const label = icon.querySelector('.icon-label')?.textContent?.trim() ?? icon.textContent?.trim() ?? '';
  const href = icon.getAttribute('href');
  const outside = !!href && new URL(href, location.href).origin !== location.origin;
  return [
    { label: '&Open', bold: true, action: () => openIcon(icon) },
    ...(href && !outside ? [{ label: 'Open in &New Window', action: () => window.open(new URL(href, location.href).href, '_blank', 'noopener') } as menu.MenuSpec] : []),
    { sep: true },
    { label: 'Se&nd To', sub: [{ label: '&Mail Recipient', icon: 'mail', action: () => mailAbout(label) }] },
    { sep: true },
    { label: 'Cu&t', disabled: true },
    { label: '&Copy', disabled: true },
    { sep: true },
    { label: 'Create &Shortcut', disabled: true },
    {
      label: '&Delete',
      disabled: icon.hasAttribute('data-fixed') || !group?.hasAttribute('data-free') || !commands.has('recycle-icon'),
      action: () => commands.run('recycle-icon', { el: icon }),
    },
    { label: 'Rena&me', disabled: true },
    { sep: true },
    { label: 'P&roperties', action: () => showIconProperties(icon) },
  ];
}

function desktopMenu(): menu.MenuSpec[] {
  const group = document.getElementById('k98-icons')!;
  return [
    {
      label: 'Arrange &Icons',
      sub: [
        { label: 'by &Name', action: () => arrangeIcons(group, 'name') },
        { label: 'by &Type', action: () => arrangeIcons(group, 'type') },
      ],
    },
    { label: 'Line &Up Icons', action: () => lineUpIcons(group) },
    { sep: true },
    {
      label: 'R&efresh',
      action: () => {
        group.style.visibility = 'hidden';
        setTimeout(() => (group.style.visibility = ''), 150);
      },
    },
    { sep: true },
    { label: '&Paste', disabled: true },
    { label: 'Paste &Shortcut', disabled: true },
    { sep: true },
    {
      label: 'Ne&w',
      sub: [
        { label: '&Folder', icon: 'folder', disabled: true },
        { label: '&Shortcut', disabled: true },
        { sep: true },
        { label: 'Text Document', icon: 'document', disabled: true },
      ],
    },
    { sep: true },
    { label: 'P&roperties', disabled: !commands.has('display-properties'), action: () => commands.run('display-properties') },
  ];
}

function taskbarMenu(): menu.MenuSpec[] {
  const many = wm.list().filter((w) => !w.dialog && w.state !== 'min').length;
  return [
    { label: '&Cascade Windows', disabled: !many || isCompact(), action: () => wm.arrange('cascade') },
    { label: 'Tile Windows &Horizontally', disabled: !many || isCompact(), action: () => wm.arrange('tile-h') },
    { label: 'Tile Windows V&ertically', disabled: !many || isCompact(), action: () => wm.arrange('tile-v') },
    { sep: true },
    { label: '&Minimize All Windows', action: () => wm.minimizeAll() },
    { sep: true },
    { label: 'P&roperties', disabled: !commands.has('taskbar-properties'), action: () => commands.run('taskbar-properties') },
  ];
}

function startButtonMenu(): menu.MenuSpec[] {
  return [
    { label: '&Open', bold: true, action: () => document.querySelector<HTMLElement>('#k98-start summary')?.click() },
    { label: '&Explore', action: () => navigate('/image') },
    { label: '&Find...', disabled: !commands.has('find'), action: () => commands.run('find') },
  ];
}

function targetFor(t: Element): Target {
  if (t.closest('.menu.popup')) return { specs: [] };
  const task = t.closest<HTMLElement>('.task');
  if (task) {
    const w = wm.byId(Number(task.dataset.winId));
    return w ? { specs: systemMenu(w), owner: task } : null;
  }
  if (t.closest('#k98-start > summary')) return { specs: startButtonMenu() };
  if (t.closest('#k98-start')) return { specs: [] };
  if (t.closest('.taskbar')) return { specs: taskbarMenu() };
  const icon = t.closest<HTMLElement>('[data-icon-group] .icon');
  if (icon) {
    if (!icon.classList.contains('selected')) select(icon);
    if (icon.closest('[data-bin]')) return { specs: binItemMenu(icon), owner: icon };
    if (icon.dataset.iconId === 'recycle') return { specs: recycleIconMenu(icon), owner: icon };
    return { specs: iconMenu(icon), owner: icon };
  }
  const win = wm.byEl(t);
  if (win) {
    if (t.closest('.title-bar')) return { specs: systemMenu(win) };
    if (t.closest('.toolbar, .addressbar, .linksbar, .menubar')) {
      const bars = toolbarsMenu(win);
      return { specs: bars };
    }
    if (t.closest('[data-window-body], .sheet-holder')) {
      const img = t.closest('img');
      if (img instanceof HTMLImageElement && img.naturalWidth > 64) {
        const view: menu.MenuSpec[] = commands.has('view-image')
          ? [{ label: '&Open in Image Viewer', bold: true, action: () => commands.run('view-image', { el: img }) }, { sep: true }]
          : [];
        return { specs: photoMenu(img, view) };
      }
      const link = t.closest('a[href]');
      if (link) {
        const name = (link.textContent ?? '').trim() || link.getAttribute('aria-label') || 'Link';
        return { specs: linkMenu(link, name) };
      }
      return win.dialog ? { specs: [] } : { specs: pageMenu(win) };
    }
    return { specs: systemMenu(win) };
  }
  if (t.closest('#k98-desktop') || t === document.body || t === document.documentElement) return { specs: desktopMenu() };
  return null;
}

/** When a press-and-hold last opened a menu (the browser's own contextmenu event follows it). */
let longPressAt = 0;
let lastPointerType = 'mouse';

function show(target: Target, x: number, y: number, focusFirst = false) {
  if (!target?.specs.length) return;
  menu.popup(target.specs, x, y, { owner: target.owner ?? null, focusFirst });
}

export function initContextMenus() {
  document.addEventListener('pointerdown', (e) => (lastPointerType = e.pointerType), true);

  document.addEventListener('contextmenu', (e) => {
    const t = e.target as Element;
    if (e.shiftKey || t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
    const touch = ((e as PointerEvent).pointerType || lastPointerType) === 'touch';
    // On phones, pressing and holding a photo or text keeps the phone's own menu (Save image…).
    if (touch && t.closest('[data-window-body], .sheet-holder')) return;
    if (performance.now() - longPressAt < 800) {
      e.preventDefault();
      return;
    }
    const target = targetFor(t);
    if (!target) return;
    e.preventDefault();
    const keyboard = e.button === 0 && e.clientX === 0 && e.clientY === 0;
    if (keyboard) {
      const r = t.getBoundingClientRect();
      show(target, r.left + 8, r.top + Math.min(r.height, 22), true);
    } else show(target, e.clientX, e.clientY);
  });

  // Shift+F10 / the Menu key: the menu for whatever has focus.
  addEventListener('keydown', (e) => {
    if (!((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu')) return;
    const el = (document.activeElement as HTMLElement | null) ?? document.body;
    if (el.closest('input, textarea, select')) return;
    const target = targetFor(el === document.body ? document.getElementById('k98-desktop')! : el);
    if (!target?.specs.length) return;
    e.preventDefault();
    const r = el === document.body ? new DOMRect(40, 40, 0, 0) : el.getBoundingClientRect();
    show(target, r.left + 8, r.top + Math.min(r.height, 22), true);
  });

  // Press and hold (touch screens without a right-click): desktop, icons, title bars, taskbar.
  let timer = 0;
  let start: { x: number; y: number; id: number } | null = null;
  let swallowClick = false;
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const t = e.target as Element;
    if (!t.closest('#k98-desktop, .title-bar, .taskbar, [data-icon-group] .icon')) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!start) return;
      const target = targetFor(t);
      if (!target?.specs.length) return;
      swallowClick = true;
      navigator.vibrate?.(10);
      longPressAt = performance.now();
      show(target, start.x, start.y);
      start = null;
    }, 550);
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (start && e.pointerId === start.id && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) {
      clearTimeout(timer);
      start = null;
    }
  }, { passive: true });
  const cancel = () => {
    clearTimeout(timer);
    start = null;
  };
  document.addEventListener('pointerup', cancel, true);
  document.addEventListener('pointercancel', cancel, true);
  document.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
}
