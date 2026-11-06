// The Recycle Bin. Icons deleted from the desktop wait here until they are
// restored or the bin is emptied; Restore Default Desktop (Display Properties
// ▸ Effects) brings everything back. My Computer and the Recycle Bin itself
// can't be deleted. Kept in this browser only.
import { appWindow } from '../appwindow';
import { commands } from '../commands';
import { msgbox } from '../dialogs';
import { bindIconGroup, refreshIconPlaces, resetIconPlaces, selectedIn } from '../icons';
import type { MenuSpec } from '../menu';
import { showIconProperties, showSheet } from '../properties';
import { play } from '../sound';
import { emit, h, setText, stored, shownText, type Text } from '../util';
import { W, objects } from '../words';
import * as wm from '../wm';

interface Binned { id: string; t: number; gone?: boolean }
const store = stored<Binned[]>('kus98:bin', []);

const deskIcon = (id: string) => document.querySelector<HTMLElement>(`#k98-icons .icon[data-icon-id="${CSS.escape(id)}"]`);
const nameOf = (icon: Element | null) => shownText(icon?.querySelector('.icon-label')).trim();
/** An icon's name in both languages. */
function names(icon: Element | null): { en: string; zh: string } {
  const label = icon?.querySelector('.icon-label');
  const en = (label?.querySelector('[data-l="en"]')?.textContent ?? nameOf(icon)).trim();
  return { en, zh: (label?.querySelector('[data-l="zh"]')?.textContent ?? en).trim() };
}
/** What's in the bin now (not emptied). */
export const inBin = () => store.get().filter((b) => !b.gone && deskIcon(b.id));
const when = (t: number) => ({
  en: new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
  zh: new Date(t).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }),
});
const TITLE = (one: boolean) => (one ? { en: 'Confirm File Delete', zh: '确认文件删除' } : { en: 'Confirm Multiple File Delete', zh: '确认删除多个文件' });

/** Show and hide desktop icons, and fill the bin's icon, to match what's stored. */
function sync() {
  const all = store.get();
  document.querySelectorAll<HTMLElement>('#k98-icons > .desk-item').forEach((item) => {
    const id = item.querySelector<HTMLElement>('.icon')?.dataset.iconId;
    item.hidden = !!id && all.some((b) => b.id === id);
  });
  document.getElementById('k98-early-icons')?.remove();
  const full = inBin().length > 0;
  const ico = document.querySelector('#icon-recycle > .ico');
  ico?.classList.toggle('ico-recycle', !full);
  ico?.classList.toggle('ico-recycle-full', full);
  renderWindow();
  emit(document, 'bin:change');
}

/** Send desktop icons to the Recycle Bin (asks first). */
async function recycle(icons: HTMLElement[]) {
  const list = icons.filter((i) => i.closest('#k98-icons') && !i.hasAttribute('data-fixed'));
  if (!list.length) {
    play('ding');
    return;
  }
  const one = list.length === 1;
  const r = await msgbox({
    title: TITLE(one),
    icon: 'recycle-full',
    text: one
      ? { en: `Are you sure you want to send '${names(list[0]).en}' to the Recycle Bin?`, zh: `确实要把“${names(list[0]).zh}”放入回收站吗？` }
      : { en: `Are you sure you want to send these ${list.length} items to the Recycle Bin?`, zh: `确实要把这 ${list.length} 项放入回收站吗？` },
    buttons: ['Yes', 'No'],
    sound: false,
  });
  if (r !== 'Yes') return;
  const ids = list.map((i) => i.dataset.iconId!).filter(Boolean);
  const now = Date.now();
  store.set([...store.get().filter((b) => !ids.includes(b.id)), ...ids.map((id) => ({ id, t: now }))]);
  list.forEach((i) => {
    i.classList.remove('selected');
    i.removeAttribute('aria-selected');
  });
  sync();
}

/** Put icons back on the desktop. */
export function restore(ids: string[]) {
  store.set(store.get().filter((b) => !ids.includes(b.id)));
  sync();
  refreshIconPlaces();
}

/** Delete for good (from the bin). */
async function deleteForever(ids: string[]) {
  if (!ids.length) return;
  const one = ids.length === 1;
  const r = await msgbox({
    title: TITLE(one),
    icon: 'recycle-full',
    text: {
      en: `${one ? `Are you sure you want to delete '${names(deskIcon(ids[0])).en}'?` : `Are you sure you want to delete these ${ids.length} items?`}\n\nYou can bring ${one ? 'it' : 'them'} back later with Restore Default Desktop (Control Panel ▸ Display ▸ Effects).`,
      zh: `${one ? `确实要删除“${names(deskIcon(ids[0])).zh}”吗？` : `确实要删除这 ${ids.length} 项吗？`}\n\n以后可以用“还原默认桌面”（控制面板 ▸ 显示 ▸ 效果）把${one ? '它' : '它们'}找回来。`,
    },
    buttons: ['Yes', 'No'],
    sound: false,
  });
  if (r !== 'Yes') return;
  store.set(store.get().map((b) => (ids.includes(b.id) ? { ...b, gone: true } : b)));
  play('recycle');
  sync();
}

export async function emptyBin() {
  const ids = inBin().map((b) => b.id);
  if (ids.length) await deleteForever(ids);
}

/** Display Properties ▸ Effects ▸ Restore Default Desktop. */
export function restoreDefaultDesktop() {
  store.set([]);
  resetIconPlaces();
  sync();
}

// ---------------------------------------------------------------------------
// The Recycle Bin window
// ---------------------------------------------------------------------------

function binItems() {
  return inBin()
    .sort((a, b) => b.t - a.t)
    .map((b) => {
      const src = deskIcon(b.id)!;
      const ico = src.querySelector('.ico')!.cloneNode(true) as HTMLElement;
      return h(
        'li',
        {},
        h('button', { type: 'button', class: 'icon', 'data-open': 'bin-item', 'data-bin-id': b.id, 'data-type': { en: 'Deleted item', zh: '已删除的项目' }, 'data-tip': { en: `Deleted ${when(b.t).en}.`, zh: `删除于 ${when(b.t).zh}。` } }, [
          ico,
          (() => {
            // Both languages of the name come along.
            const label = h('span', { class: 'icon-label' });
            label.innerHTML = src.querySelector('.icon-label')?.innerHTML ?? '';
            return label;
          })(),
        ]),
      );
    });
}

function renderWindow() {
  const win = wm.find('recycle');
  if (!win) return;
  const list = win.el.querySelector<HTMLElement>('[data-bin]');
  if (!list) return;
  const n = inBin().length;
  list.replaceChildren(...binItems());
  win.el.querySelector<HTMLElement>('.bin-empty')!.hidden = n > 0;
  win.el.querySelector<HTMLButtonElement>('[data-bin-empty]')!.disabled = n === 0;
  updateSelection(win);
  const fields = win.el.querySelectorAll('.status-bar-field');
  if (fields[0]) setText(fields[0], objects(n));
  const icon = n ? 'recycle-full' : 'recycle';
  win.el.dataset.icon = icon;
  win.el.querySelector('.title-ico')?.setAttribute('class', `ico ico16 ico-${icon} title-ico`);
}

function updateSelection(win: wm.Win) {
  const list = win.el.querySelector<HTMLElement>('[data-bin]')!;
  const sel = selectedIn(list);
  win.el.querySelector<HTMLButtonElement>('[data-bin-restore]')!.disabled = sel.length === 0;
  const hint = win.el.querySelectorAll('.status-bar-field')[1];
  if (hint) {
    setText(
      hint,
      sel.length
        ? { en: `${sel.length} selected: click Restore to put ${sel.length === 1 ? 'it' : 'them'} back on the desktop.`, zh: `已选定 ${sel.length} 项：单击“还原”把${sel.length === 1 ? '它' : '它们'}放回桌面。` }
        : { en: 'Select an item, then click Restore to put it back.', zh: '选定一个项目，然后单击“还原”把它放回去。' },
    );
  }
}

export function recycleBin() {
  const existing = wm.find('recycle');
  if (existing) {
    wm.focus(existing);
    return existing;
  }
  const tool = (label: Text, icon: string, attr: string, help: Text) =>
    h('button', { type: 'button', class: 'tool', [attr]: '', title: help, 'data-help': help }, [h('span', { class: `ico ico20 ico-${icon}`, 'aria-hidden': 'true' }), h('span', { class: 'tool-label' }, label)]);
  const restoreBtn = tool(W.restore, 'desktop', 'data-bin-restore', { en: 'Puts the selected items back on the desktop.', zh: '把选定的项目放回桌面。' });
  const emptyBtn = tool({ en: 'Empty Recycle Bin', zh: '清空回收站' }, 'recycle', 'data-bin-empty', { en: 'Deletes everything in the Recycle Bin.', zh: '删除回收站里的所有东西。' });
  const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': W.recycleBin }, [restoreBtn, emptyBtn]);
  const list = h('ul', { class: 'folder-view', 'aria-label': W.recycleBin, 'data-bin': '' });
  const body = h('div', { class: 'bin-body' }, [list, h('p', { class: 'bin-empty' }, { en: 'The Recycle Bin is empty. Icons you delete from the desktop wait here until you restore them.', zh: '回收站是空的。从桌面删除的图标会在这里等着，直到你把它们还原。' })]);
  const win = appWindow({
    app: 'recycle',
    title: W.recycleBin,
    icon: inBin().length ? 'recycle-full' : 'recycle',
    w: 520,
    h: 340,
    body,
    toolbar,
    address: W.recycleBin,
    status: [objects(0), ''],
  });
  bindIconGroup(list);
  list.addEventListener('icons:select', () => updateSelection(win));
  restoreBtn.addEventListener('click', () => restore(selectedIn(list).map((i) => i.dataset.binId!)));
  emptyBtn.addEventListener('click', () => emptyBin());
  renderWindow();
  return win;
}

// ---------------------------------------------------------------------------
// Right-click menus
// ---------------------------------------------------------------------------

/** The Recycle Bin icon on the desktop. */
export function recycleIconMenu(icon: HTMLElement): MenuSpec[] {
  return [
    { label: '&Open', zh: '打开(&O)', bold: true, action: () => recycleBin() },
    { sep: true },
    { label: 'Empty Recycle &Bin', zh: '清空回收站(&B)', disabled: !inBin().length, action: () => emptyBin() },
    { sep: true },
    { label: 'Create &Shortcut', zh: '创建快捷方式(&S)', disabled: true },
    { sep: true },
    { label: 'P&roperties', zh: '属性(&R)', action: () => showIconProperties(icon) },
  ];
}

/** Something inside the Recycle Bin. */
export function binItemMenu(icon: HTMLElement): MenuSpec[] {
  const group = icon.closest<HTMLElement>('[data-bin]')!;
  const ids = (icon.classList.contains('selected') ? selectedIn(group) : [icon]).map((i) => i.dataset.binId!);
  const b = store.get().find((x) => x.id === icon.dataset.binId);
  return [
    { label: 'R&estore', zh: '还原(&E)', bold: true, action: () => restore(ids) },
    { sep: true },
    { label: 'Cu&t', zh: '剪切(&T)', disabled: true },
    { sep: true },
    { label: '&Delete', zh: '删除(&D)', action: () => deleteForever(ids) },
    { sep: true },
    {
      label: 'P&roperties', zh: '属性(&R)',
      action: () => {
        const src = deskIcon(icon.dataset.binId!);
        const name = names(src);
        const ico = [...(src?.querySelector('.ico')?.classList ?? [])].find((c) => c.startsWith('ico-') && c !== 'ico-shortcut')?.slice(4) ?? 'document';
        showSheet({
          title: name,
          icon: ico,
          name,
          rows: [
            [{ en: 'Type:', zh: '类型：' }, src?.dataset.type ? { en: src.dataset.type, zh: src.dataset.typeZh || src.dataset.type } : { en: 'Shortcut', zh: '快捷方式' }],
            [{ en: 'Original location:', zh: '原位置：' }, { en: 'Desktop', zh: '桌面' }],
            [{ en: 'Deleted:', zh: '删除日期：' }, b ? when(b.t) : ''],
          ],
        });
      },
    },
  ];
}

export function initRecycleBin() {
  commands.register('recycle-bin', () => recycleBin());
  commands.register('empty-bin', () => emptyBin());
  // Delete (menu, key, or dropping an icon on the bin).
  commands.register('recycle-icon', (ctx) => {
    const icon = ctx.el?.closest<HTMLElement>('.icon');
    const group = icon?.closest<HTMLElement>('[data-icon-group]');
    if (!icon || !group) return;
    const many = icon.classList.contains('selected') ? selectedIn(group) : [icon];
    if (group.hasAttribute('data-bin')) deleteForever(many.map((i) => i.dataset.binId!));
    else recycle(many);
  });
  // Double-click something in the bin.
  commands.register('bin-item', async (ctx) => {
    const icon = ctx.el?.closest<HTMLElement>('.icon');
    if (!icon?.dataset.binId) return;
    const r = await msgbox({
      title: W.recycleBin,
      icon: 'info',
      text: { en: `'${names(icon).en}' is in the Recycle Bin.\n\nTo use it, restore it to the desktop first.`, zh: `“${names(icon).zh}”在回收站里。\n\n要使用它，请先把它还原到桌面。` },
      buttons: ['Restore', 'Cancel'],
      owner: icon,
    });
    if (r === 'Restore') restore([icon.dataset.binId]);
  });
  sync();
}
