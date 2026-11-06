// My Computer: the drives (A: and D: are empty, as they usually were),
// xiangyin (C:) with everything on the site, and the Control Panel.
import { appWindow } from '../appwindow';
import { commands } from '../commands';
import { msgbox } from '../dialogs';
import { bindIconGroup } from '../icons';
import { h, type Text } from '../util';
import { W, objects } from '../words';

function icon(label: Text, ico: string, o: { open?: string; href?: string; type: Text; tip?: Text }) {
  const inner = [h('span', { class: `ico ico-${ico}`, 'aria-hidden': 'true' }), h('span', { class: 'icon-label' }, label)];
  return h('li', {}, [
    o.href
      ? h('a', { class: 'icon', href: o.href, 'data-type': o.type, 'data-tip': o.tip, draggable: 'false' }, inner)
      : h('button', { type: 'button', class: 'icon', 'data-open': o.open, 'data-type': o.type, 'data-tip': o.tip }, inner),
  ]);
}

async function notReady(drive: string) {
  for (;;) {
    const r = await msgbox({
      title: drive,
      icon: 'error',
      text: { en: `${drive}\\ is not accessible.\n\nThe device is not ready.`, zh: `无法访问 ${drive}\\。\n\n设备未就绪。` },
      buttons: ['Retry', 'Cancel'],
    });
    if (r !== 'Retry') return;
  }
}

export function myComputer() {
  const list = h('ul', { class: 'folder-view', 'aria-label': W.myComputer }, [
    icon({ en: '3½ Floppy (A:)', zh: '3.5 英寸软盘 (A:)' }, 'floppy', { open: 'drive-a', type: { en: '3½ Inch Floppy Disk', zh: '3.5 英寸软盘' } }),
    icon('xiangyin (C:)', 'drive', { open: 'drive-c', type: { en: 'Local Disk', zh: '本地磁盘' }, tip: { en: 'Everything on this computer.', zh: '这台电脑上的一切。' } }),
    icon({ en: 'Compact Disc (D:)', zh: '光盘 (D:)' }, 'cd', { open: 'drive-d', type: { en: 'CD-ROM Disc', zh: 'CD-ROM 光盘' } }),
    icon(W.controlPanel, 'control', { open: 'control-panel', type: { en: 'System Folder', zh: '系统文件夹' }, tip: { en: 'Mouse, sounds, display and more.', zh: '鼠标、声音、显示等。' } }),
  ]);
  appWindow({ app: 'mycomputer', title: W.myComputer, icon: 'computer', w: 540, h: 340, body: list, address: W.myComputer, status: [objects(4), { en: 'Double-click a drive to open it.', zh: '双击驱动器即可打开。' }] });
  bindIconGroup(list);
}

const FOLDER = { en: 'File Folder', zh: '文件夹' };
const PROGRAM = { en: 'Program', zh: '程序' };

export function driveC() {
  const list = h('ul', { class: 'folder-view', 'aria-label': 'xiangyin (C:)' }, [
    icon(W.projects, 'folder', { href: '/image', type: FOLDER }),
    icon(W.theHouse, 'house', { href: '/house/facade', type: PROGRAM }),
    icon({ en: 'About.doc', zh: '关于.doc' }, 'document', { href: '/about', type: { en: 'Document', zh: '文档' } }),
    icon({ en: 'Contact', zh: '联系' }, 'mail', { href: '/contact', type: PROGRAM }),
    icon({ en: 'Paint', zh: '画图' }, 'paint', { href: '/paint', type: PROGRAM }),
    icon(W.help, 'help', { href: '/help', type: { en: 'Help file', zh: '帮助文件' } }),
    icon({ en: 'Welcome', zh: '欢迎' }, 'welcome', { href: '/', type: PROGRAM }),
  ]);
  appWindow({ app: 'drive-c', title: 'xiangyin (C:)', icon: 'drive', w: 560, h: 340, body: list, address: 'C:\\', status: [objects(7), { en: 'Double-click an item to open it.', zh: '双击项目即可打开。' }] });
  bindIconGroup(list);
}

export function initMyComputer() {
  commands.register('mycomputer', () => myComputer());
  commands.register('drive-c', () => driveC());
  commands.register('drive-a', () => notReady('A:'));
  commands.register('drive-d', () => notReady('D:'));
}
