// What lives on the kuschonink 98 desktop.
import { site } from './content';

export interface DeskIcon {
  id: string;
  label: string;
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
  { id: 'computer', label: 'My Computer', icon: 'computer', open: 'mycomputer', tip: 'The drives of this computer, and the Control Panel.', type: 'System Folder', fixed: true },
  { id: 'projects', label: 'Projects', icon: 'folder', href: '/image', tip: 'All the work, as a folder.', type: 'File Folder' },
  { id: 'house', label: 'The House', icon: 'house', href: '/house/facade', tip: 'Walk through the house: every room keeps a project.', type: 'Program' },
  { id: 'about', label: 'About.doc', icon: 'document', href: '/about', tip: 'About the artist.', type: 'Document' },
  { id: 'contact', label: 'Contact', icon: 'mail', href: '/contact', tip: 'Write a message.', type: 'Program' },
  { id: 'help', label: 'Help', icon: 'help', href: '/help', tip: 'How to use this computer (F1).', type: 'Help file' },
  { id: 'instagram', label: 'Instagram', icon: 'camera', href: site.social[0].href, external: true, shortcut: true, tip: 'kuschonink on Instagram (opens a new tab).', type: 'Internet Shortcut' },
  { id: 'recycle', label: 'Recycle Bin', icon: 'recycle', open: 'recycle-bin', tip: 'Icons you delete from the desktop wait here. Open it to put them back.', type: 'System Folder', fixed: true },
];
