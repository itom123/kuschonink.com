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
import { emit, h, stored } from '../util';
import * as wm from '../wm';

interface Binned { id: string; t: number; gone?: boolean }
const store = stored<Binned[]>('kus98:bin', []);

const deskIcon = (id: string) => document.querySelector<HTMLElement>(`#k98-icons .icon[data-icon-id="${CSS.escape(id)}"]`);
const nameOf = (icon: Element | null) => icon?.querySelector('.icon-label')?.textContent?.trim() ?? '';
/** What's in the bin now (not emptied). */
export const inBin = () => store.get().filter((b) => !b.gone && deskIcon(b.id));
const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

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
    title: one ? 'Confirm File Delete' : 'Confirm Multiple File Delete',
    icon: 'recycle-full',
    text: one ? `Are you sure you want to send '${nameOf(list[0])}' to the Recycle Bin?` : `Are you sure you want to send these ${list.length} items to the Recycle Bin?`,
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
    title: one ? 'Confirm File Delete' : 'Confirm Multiple File Delete',
    icon: 'recycle-full',
    text: `${one ? `Are you sure you want to delete '${nameOf(deskIcon(ids[0]))}'?` : `Are you sure you want to delete these ${ids.length} items?`}\n\nYou can bring ${one ? 'it' : 'them'} back later with Restore Default Desktop (Control Panel ▸ Display ▸ Effects).`,
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
        h('button', { type: 'button', class: 'icon', 'data-open': 'bin-item', 'data-bin-id': b.id, 'data-type': 'Deleted item', 'data-tip': `Deleted ${when(b.t)}.` }, [
          ico,
          h('span', { class: 'icon-label' }, nameOf(src)),
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
  if (fields[0]) fields[0].textContent = `${n} object(s)`;
  const icon = n ? 'recycle-full' : 'recycle';
  win.el.dataset.icon = icon;
  win.el.querySelector('.title-ico')?.setAttribute('class', `ico ico16 ico-${icon} title-ico`);
}

function updateSelection(win: wm.Win) {
  const list = win.el.querySelector<HTMLElement>('[data-bin]')!;
  const sel = selectedIn(list);
  win.el.querySelector<HTMLButtonElement>('[data-bin-restore]')!.disabled = sel.length === 0;
  const hint = win.el.querySelectorAll('.status-bar-field')[1];
  if (hint) hint.textContent = sel.length ? `${sel.length} selected: click Restore to put ${sel.length === 1 ? 'it' : 'them'} back on the desktop.` : 'Select an item, then click Restore to put it back.';
}

export function recycleBin() {
  const existing = wm.find('recycle');
  if (existing) {
    wm.focus(existing);
    return existing;
  }
  const tool = (label: string, icon: string, attr: string, help: string) =>
    h('button', { type: 'button', class: 'tool', [attr]: '', title: help, 'data-help': help }, [h('span', { class: `ico ico20 ico-${icon}`, 'aria-hidden': 'true' }), h('span', { class: 'tool-label' }, label)]);
  const restoreBtn = tool('Restore', 'desktop', 'data-bin-restore', 'Puts the selected items back on the desktop.');
  const emptyBtn = tool('Empty Recycle Bin', 'recycle', 'data-bin-empty', 'Deletes everything in the Recycle Bin.');
  const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Recycle Bin' }, [restoreBtn, emptyBtn]);
  const list = h('ul', { class: 'folder-view', 'aria-label': 'Recycle Bin', 'data-bin': '' });
  const body = h('div', { class: 'bin-body' }, [list, h('p', { class: 'bin-empty' }, 'The Recycle Bin is empty. Icons you delete from the desktop wait here until you restore them.')]);
  const win = appWindow({
    app: 'recycle',
    title: 'Recycle Bin',
    icon: inBin().length ? 'recycle-full' : 'recycle',
    w: 520,
    h: 340,
    body,
    toolbar,
    address: 'Recycle Bin',
    status: ['0 object(s)', ''],
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
    { label: '&Open', bold: true, action: () => recycleBin() },
    { sep: true },
    { label: 'Empty Recycle &Bin', disabled: !inBin().length, action: () => emptyBin() },
    { sep: true },
    { label: 'Create &Shortcut', disabled: true },
    { sep: true },
    { label: 'P&roperties', action: () => showIconProperties(icon) },
  ];
}

/** Something inside the Recycle Bin. */
export function binItemMenu(icon: HTMLElement): MenuSpec[] {
  const group = icon.closest<HTMLElement>('[data-bin]')!;
  const ids = (icon.classList.contains('selected') ? selectedIn(group) : [icon]).map((i) => i.dataset.binId!);
  const b = store.get().find((x) => x.id === icon.dataset.binId);
  return [
    { label: 'R&estore', bold: true, action: () => restore(ids) },
    { sep: true },
    { label: 'Cu&t', disabled: true },
    { sep: true },
    { label: '&Delete', action: () => deleteForever(ids) },
    { sep: true },
    {
      label: 'P&roperties',
      action: () => {
        const src = deskIcon(icon.dataset.binId!);
        const name = nameOf(src);
        const ico = [...(src?.querySelector('.ico')?.classList ?? [])].find((c) => c.startsWith('ico-') && c !== 'ico-shortcut')?.slice(4) ?? 'document';
        showSheet({
          title: name,
          icon: ico,
          name,
          rows: [
            ['Type:', src?.dataset.type ?? 'Shortcut'],
            ['Original location:', 'Desktop'],
            ['Deleted:', b ? when(b.t) : ''],
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
      title: 'Recycle Bin',
      icon: 'info',
      text: `'${icon.textContent?.trim()}' is in the Recycle Bin.\n\nTo use it, restore it to the desktop first.`,
      buttons: ['Restore', 'Cancel'],
      owner: icon,
    });
    if (r === 'Restore') restore([icon.dataset.binId]);
  });
  sync();
}
