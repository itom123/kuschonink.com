// What lives on the Xiangyin 98 desktop.
import { site } from './content';

export interface DeskIcon {
  id: string;
  label: string;
  /** Chinese label and tooltip (the 中/EN switch). */
  zh?: string;
  tipZh?: string;
  icon: string;
  href?: string;
  /** Program opened by the shell (no page of its own). */
  open?: string;
  external?: boolean;
  shortcut?: boolean;
  /** Tooltip. */
  tip: string;
  /** What Properties calls it. */
  type: string;
  /** Can't be sent to the Recycle Bin. */
  fixed?: boolean;
}

export const DESK_ICONS: DeskIcon[] = [
  { id: 'computer', label: 'My Computer', zh: '我的电脑', icon: 'computer', open: 'mycomputer', tip: 'The drives of this computer, and the Control Panel.', tipZh: '这台电脑的驱动器和控制面板。', type: 'System Folder', fixed: true },
  { id: 'projects', label: 'Projects', zh: '作品', icon: 'folder', href: '/image', tip: 'All the work, as a folder.', tipZh: '全部作品，放在一个文件夹里。', type: 'File Folder' },
  { id: 'house', label: 'The House', zh: '房子', icon: 'house', href: '/house/facade', tip: 'Walk through the house: every room keeps a project.', tipZh: '在房子里走一走：每个房间都保存着一件作品。', type: 'Program' },
  { id: 'about', label: 'About.doc', zh: '关于.doc', icon: 'document', href: '/about', tip: 'About the artist.', tipZh: '关于艺术家。', type: 'Document' },
  { id: 'contact', label: 'Contact', zh: '联系', icon: 'mail', href: '/contact', tip: 'Write a message.', tipZh: '写一条消息。', type: 'Program' },
  { id: 'help', label: 'Help', zh: '帮助', icon: 'help', href: '/help', tip: 'How to use this computer (F1).', tipZh: '如何使用这台电脑（F1）。', type: 'Help file' },
  { id: 'instagram', label: 'Instagram', icon: 'camera', href: site.social[0].href, external: true, shortcut: true, tip: 'Instagram (opens a new tab).', tipZh: 'Instagram（在新标签页中打开）。', type: 'Internet Shortcut' },
  { id: 'recycle', label: 'Recycle Bin', zh: '回收站', icon: 'recycle', open: 'recycle-bin', tip: 'Icons you delete from the desktop wait here. Open it to put them back.', tipZh: '从桌面删除的图标会放在这里。打开它可以把图标放回去。', type: 'System Folder', fixed: true },
];
