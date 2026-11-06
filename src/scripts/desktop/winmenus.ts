// What the menus of a window say: the menu bar (File, Edit, View, Go,
// Favorites, Help), the system menu (title bar), and right-click menus for
// pages, links and photographs inside windows.
import { cleanPath, upOf } from '../../lib/apps';
import { aboutBox } from './aboutbox';
import { commands } from './commands';
import type { MenuSpec } from './menu';
import { rememberBars } from './memory';
import { showImageProperties, showPropertiesFor } from './properties';
import { navigate } from './router';
import { settings } from './settings';
import { isCompact, tr } from './util';
import * as wm from './wm';

const open = (url: string) => () => navigate(url);
const newTab = (url: string) => () => window.open(new URL(url, location.href).href, '_blank', 'noopener');

export function copyText(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {
    const t = document.createElement('textarea');
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  });
}

const selectionText = () => getSelection()?.toString() ?? '';

function selectAll(win: wm.Win) {
  const body = win.el.querySelector('[data-window-body]');
  if (!body) return;
  const r = document.createRange();
  r.selectNodeContents(body);
  const s = getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
}

/** Open Contact with the subject filled in (Send To ▸ Mail Recipient). */
export async function mailAbout(title: string) {
  await navigate('/contact');
  const input = document.querySelector<HTMLInputElement>('[data-app="contact"] input[name="subject"]');
  if (input && !input.value) input.value = tr({ en: `About “${title}”`, zh: `关于《${title}》` });
  document.querySelector<HTMLElement>('[data-app="contact"] textarea')?.focus();
}

function hidden(win: wm.Win, part: string) {
  return (win.el.dataset.hide ?? '').split(' ').includes(part);
}
function toggleBar(win: wm.Win, part: string) {
  const set = new Set((win.el.dataset.hide ?? '').split(' ').filter(Boolean));
  if (set.has(part)) set.delete(part);
  else set.add(part);
  win.el.dataset.hide = [...set].join(' ');
  rememberBars(win);
}

export function toolbarsMenu(win: wm.Win): MenuSpec[] {
  const has = (sel: string) => !!win.el.querySelector(`:scope > [data-window-inner] > ${sel}`);
  const items: MenuSpec[] = [];
  if (has('.toolbar')) items.push({ label: '&Standard Buttons', zh: '标准按钮(&S)', checked: !hidden(win, 'toolbar'), action: () => toggleBar(win, 'toolbar') });
  if (has('.addressbar')) items.push({ label: '&Address Bar', zh: '地址栏(&A)', checked: !hidden(win, 'address'), action: () => toggleBar(win, 'address') });
  if (has('.linksbar')) items.push({ label: '&Links', zh: '链接(&L)', checked: !hidden(win, 'links'), action: () => toggleBar(win, 'links') });
  return items;
}

/** The system menu: click the icon in a title bar, or right-click the title bar. */
export function systemMenu(win: wm.Win): MenuSpec[] {
  const normal = win.state === 'normal';
  const fixed = isCompact() && !win.dialog;
  return [
    { label: '&Restore', zh: '还原(&R)', disabled: normal, action: () => wm.restore(win) },
    { label: '&Move', zh: '移动(&M)', disabled: !normal || fixed, action: () => wm.keyboardMove(win, 'move') },
    { label: '&Size', zh: '大小(&S)', disabled: !normal || fixed || win.el.classList.contains('no-resize'), action: () => wm.keyboardMove(win, 'size') },
    { label: 'Mi&nimize', zh: '最小化(&N)', disabled: win.state === 'min' || !!win.dialog, action: () => wm.minimize(win) },
    { label: 'Ma&ximize', zh: '最大化(&X)', disabled: win.state === 'max' || !!win.dialog || fixed, action: () => (win.state === 'min' ? wm.restore(win) : wm.toggleMax(win)) },
    { sep: true },
    { label: '&Close', zh: '关闭(&C)', key: 'Alt+F4', bold: true, action: () => wm.close(win) },
  ];
}

/** Menu bars a program draws itself (kus98.menus), by window. */
export const ownMenus = new WeakMap<HTMLElement, (name: string) => MenuSpec[] | null>();

/** A window's menu bar menus. */
export function barMenu(win: wm.Win, name: string): MenuSpec[] {
  const own = ownMenus.get(win.el)?.(name);
  if (own) return own;
  const url = wm.urlOf(win);
  const title = wm.titleOf(win);
  const icon = win.el.dataset.icon ?? 'document';
  const isFolderList = win.app === 'explorer' && cleanPath(url) === '/image';
  switch (name) {
    case 'file': {
      const selected = win.el.querySelector<HTMLElement>('[data-icon-group] .icon.selected');
      return [
        ...(isFolderList ? [{ label: '&Open', zh: '打开(&O)', bold: true, disabled: !selected, action: () => selected?.click() } as MenuSpec, { sep: true } as MenuSpec] : []),
        { label: 'New &Window', zh: '新建窗口(&W)', action: newTab(url) },
        { label: 'Sen&d To', zh: '发送到(&D)', sub: [{ label: '&Mail Recipient', zh: '邮件收件人(&M)', icon: 'mail', action: () => mailAbout(title) }] },
        { sep: true },
        { label: '&Print...', zh: '打印(&P)...', key: 'Ctrl+P', action: () => window.print() },
        { sep: true },
        { label: 'P&roperties', zh: '属性(&R)', action: () => showPropertiesFor(url, title, icon, win.el) },
        { sep: true },
        { label: '&Close', zh: '关闭(&C)', key: 'Alt+F4', action: () => wm.close(win) },
      ];
    }
    case 'edit':
      return [
        { label: 'Cu&t', zh: '剪切(&T)', key: 'Ctrl+X', disabled: true },
        { label: '&Copy', zh: '复制(&C)', key: 'Ctrl+C', disabled: !selectionText(), action: () => copyText(selectionText()) },
        { label: '&Paste', zh: '粘贴(&P)', key: 'Ctrl+V', disabled: true },
        { sep: true },
        { label: 'Select &All', zh: '全选(&A)', key: 'Ctrl+A', action: () => selectAll(win) },
      ];
    case 'view': {
      const bars = toolbarsMenu(win);
      const items: MenuSpec[] = [];
      if (bars.length) items.push({ label: '&Toolbars', zh: '工具栏(&T)', sub: bars });
      if (win.el.querySelector(':scope > [data-window-inner] > .status-bar')) items.push({ label: 'Status &Bar', zh: '状态栏(&B)', checked: !hidden(win, 'status'), action: () => toggleBar(win, 'status') });
      if (isFolderList) {
        const v = settings.get().explorerView;
        items.push(
          { sep: true },
          { label: 'Thu&mbnails', zh: '缩略图(&M)', radio: true, checked: v === 'thumbs', action: () => settings.set({ explorerView: 'thumbs' }) },
          { label: '&List', zh: '列表(&L)', radio: true, checked: v === 'list', action: () => settings.set({ explorerView: 'list' }) },
          { label: '&Details', zh: '详细资料(&D)', radio: true, checked: v === 'details', action: () => settings.set({ explorerView: 'details' }) },
        );
      }
      items.push({ sep: true }, { label: '&Refresh', zh: '刷新(&R)', key: 'F5', action: () => wm.hooks.nav(win, 'refresh') });
      if (win.app === 'explorer') items.push({ sep: true }, { label: 'Folder &Options...', zh: '文件夹选项(&O)...', action: () => commands.run('folder-options') });
      return items;
    }
    case 'go':
      return [
        { label: '&Back', zh: '后退(&B)', key: 'Alt+Left', disabled: win.hi <= 0, action: () => wm.hooks.nav(win, 'back') },
        { label: '&Forward', zh: '前进(&F)', key: 'Alt+Right', disabled: win.hi >= win.hist.length - 1, action: () => wm.hooks.nav(win, 'forward') },
        { label: '&Up One Level', zh: '向上一级(&U)', disabled: !upOf(url), action: () => wm.hooks.nav(win, 'up') },
        { sep: true },
        { label: '&Home Page', zh: '主页(&H)', action: () => wm.hooks.nav(win, 'home') },
        { sep: true },
        { label: '&Projects', zh: '作品(&P)', icon: 'folder', action: open('/image') },
        { label: 'The &House', zh: '房子(&H)', icon: 'house', action: open('/house/facade') },
        { label: '&About.doc', zh: '关于.doc(&A)', icon: 'document', action: open('/about') },
        { label: '&Contact', zh: '联系(&C)', icon: 'mail', action: open('/contact') },
        { label: 'Pai&nt', zh: '画图(&N)', icon: 'paint', action: open('/paint') },
      ];
    case 'favorites':
      return [
        { label: '&Add to Favorites...', zh: '添加到收藏夹(&A)...', disabled: true },
        { label: '&Organize Favorites...', zh: '整理收藏夹(&O)...', disabled: true },
        { sep: true },
        { label: '&Instagram', zh: 'Instagram(&I)', icon: 'camera', action: newTab('https://www.instagram.com/kuschonink') },
        { label: '&All projects on one page', zh: '全部作品在一页(&A)', icon: 'documents', action: open('/image/all') },
        { label: 'The &rules of the house', zh: '房子的规则(&R)', icon: 'topic', action: open('/house/appendix/rules') },
      ];
    case 'help':
      return [
        { label: '&Help Topics', zh: '帮助主题(&H)', key: 'F1', icon: 'help', action: open('/help') },
        { sep: true },
        { label: '&About Xiangyin 98', zh: '关于 Xiangyin 98(&A)', action: aboutBox },
      ];
  }
  return [];
}

/** Right-click on a page inside a window. */
export function pageMenu(win: wm.Win): MenuSpec[] {
  const url = wm.urlOf(win);
  const title = wm.titleOf(win);
  return [
    { label: '&Back', zh: '后退(&B)', disabled: win.hi <= 0, action: () => wm.hooks.nav(win, 'back') },
    { label: 'F&orward', zh: '前进(&O)', disabled: win.hi >= win.hist.length - 1, action: () => wm.hooks.nav(win, 'forward') },
    { sep: true },
    { label: '&Copy', zh: '复制(&C)', disabled: !selectionText(), action: () => copyText(selectionText()) },
    { label: 'Select &All', zh: '全选(&A)', action: () => selectAll(win) },
    { sep: true },
    { label: 'Create Shor&tcut', zh: '创建快捷方式(&T)', action: () => copyText(new URL(url, location.href).href) },
    { label: '&Print...', zh: '打印(&P)...', action: () => window.print() },
    { label: 'R&efresh', zh: '刷新(&E)', action: () => wm.hooks.nav(win, 'refresh') },
    { sep: true },
    { label: 'P&roperties', zh: '属性(&R)', action: () => showPropertiesFor(url, title, win.el.dataset.icon, win.el) },
  ];
}

/** Right-click on a link. */
export function linkMenu(a: Element, title: string): MenuSpec[] {
  const href = a.getAttribute('href') ?? '';
  const abs = new URL(href, location.href);
  const outside = abs.origin !== location.origin;
  return [
    { label: '&Open', zh: '打开(&O)', bold: true, action: () => (outside ? window.open(abs.href, '_blank', 'noopener') : navigate(abs, { from: a })) },
    { label: 'Open in &New Window', zh: '在新窗口中打开(&N)', action: newTab(abs.href) },
    { sep: true },
    { label: 'Copy Shor&tcut', zh: '复制快捷方式(&T)', action: () => copyText(abs.href) },
    ...(outside ? [] : [{ sep: true } as MenuSpec, { label: 'P&roperties', zh: '属性(&R)', action: () => showPropertiesFor(abs.href, title, 'document', a) } as MenuSpec]),
  ];
}

/** Right-click on a photograph. */
export function photoMenu(img: HTMLImageElement, extra: MenuSpec[] = []): MenuSpec[] {
  const largest = largestSrc(img);
  const file = decodeURIComponent(new URL(largest, location.href).pathname.split('/').pop() ?? 'picture');
  const link = img.closest('a[href]');
  return [
    ...extra,
    ...(link ? [{ label: 'Open &Link', zh: '打开链接(&L)', action: () => (link as HTMLElement).click() } as MenuSpec, { sep: true } as MenuSpec] : []),
    {
      label: '&Save Picture As...', zh: '图片另存为(&S)...',
      action: () => {
        const a = document.createElement('a');
        a.href = largest;
        a.download = file;
        a.setAttribute('data-native', '');
        document.body.appendChild(a);
        a.click();
        a.remove();
      },
    },
    { label: 'Set as &Wallpaper', zh: '设为墙纸(&W)', action: () => settings.set({ wallpaper: largest, wallpaperMode: 'stretch' }) },
    { sep: true },
    { label: 'Copy Shor&tcut', zh: '复制快捷方式(&T)', action: () => copyText(new URL(largest, location.href).href) },
    { sep: true },
    { label: 'P&roperties', zh: '属性(&R)', action: () => showImageProperties(img, img) },
  ];
}

/** The largest version of a responsive image. */
export function largestSrc(img: HTMLImageElement) {
  const set = img.getAttribute('srcset');
  if (!set) return img.currentSrc || img.src;
  let best = '';
  let bestW = 0;
  for (const part of set.split(',')) {
    const [u, d] = part.trim().split(/\s+/);
    const w = parseInt(d ?? '0', 10);
    if (w > bestW) {
      bestW = w;
      best = u;
    }
  }
  return best ? new URL(best, location.href).href : img.currentSrc || img.src;
}
