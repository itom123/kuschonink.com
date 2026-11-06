// My Computer: the drives (A: and D: are empty, as they usually were),
// xiangyin (C:) with everything on the site, and the Control Panel.
import { appWindow } from '../appwindow';
import { commands } from '../commands';
import { msgbox } from '../dialogs';
import { bindIconGroup } from '../icons';
import { h } from '../util';

function icon(label: string, ico: string, o: { open?: string; href?: string; type: string; tip?: string }) {
  const inner = [h('span', { class: `ico ico-${ico}`, 'aria-hidden': 'true' }), h('span', { class: 'icon-label' }, label)];
  return h('li', {}, [
    o.href
      ? h('a', { class: 'icon', href: o.href, 'data-type': o.type, 'data-tip': o.tip, draggable: 'false' }, inner)
      : h('button', { type: 'button', class: 'icon', 'data-open': o.open, 'data-type': o.type, 'data-tip': o.tip }, inner),
  ]);
}

async function notReady(drive: string) {
  for (;;) {
    const r = await msgbox({ title: drive, icon: 'error', text: `${drive}\\ is not accessible.\n\nThe device is not ready.`, buttons: ['Retry', 'Cancel'] });
    if (r !== 'Retry') return;
  }
}

export function myComputer() {
  const list = h('ul', { class: 'folder-view', 'aria-label': 'My Computer' }, [
    icon('3½ Floppy (A:)', 'floppy', { open: 'drive-a', type: '3½ Inch Floppy Disk' }),
    icon('xiangyin (C:)', 'drive', { open: 'drive-c', type: 'Local Disk', tip: 'Everything on this computer.' }),
    icon('Compact Disc (D:)', 'cd', { open: 'drive-d', type: 'CD-ROM Disc' }),
    icon('Control Panel', 'control', { open: 'control-panel', type: 'System Folder', tip: 'Mouse, sounds, display and more.' }),
  ]);
  appWindow({ app: 'mycomputer', title: 'My Computer', icon: 'computer', w: 540, h: 340, body: list, address: 'My Computer', status: ['4 object(s)', 'Double-click a drive to open it.'] });
  bindIconGroup(list);
}

export function driveC() {
  const list = h('ul', { class: 'folder-view', 'aria-label': 'xiangyin (C:)' }, [
    icon('Projects', 'folder', { href: '/image', type: 'File Folder' }),
    icon('The House', 'house', { href: '/house/facade', type: 'Program' }),
    icon('About.doc', 'document', { href: '/about', type: 'Document' }),
    icon('Contact', 'mail', { href: '/contact', type: 'Program' }),
    icon('Help', 'help', { href: '/help', type: 'Help file' }),
    icon('Welcome', 'welcome', { href: '/', type: 'Program' }),
  ]);
  appWindow({ app: 'drive-c', title: 'xiangyin (C:)', icon: 'drive', w: 560, h: 340, body: list, address: 'C:\\', status: ['6 object(s)', 'Double-click an item to open it.'] });
  bindIconGroup(list);
}

export function initMyComputer() {
  commands.register('mycomputer', () => myComputer());
  commands.register('drive-c', () => driveC());
  commands.register('drive-a', () => notReady('A:'));
  commands.register('drive-d', () => notReady('D:'));
}
