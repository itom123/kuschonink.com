// Toolbars and Links bars of the programs (rendered by Window.astro).
import { site } from './content';

export interface Tool {
  /** A window command (back, forward, up, refresh, home, stop…) or a shell command. */
  cmd?: string;
  /** Or a link. */
  href?: string;
  label: string;
  icon: string;
  title?: string;
  /** Commands need JavaScript; links don't. */
  sep?: boolean;
}

export interface QuickLink { label: string; href: string; icon?: string; external?: boolean }

export const SEP: Tool = { sep: true, label: '', icon: '' };

export const EXPLORER_TOOLS: Tool[] = [
  { cmd: 'back', label: 'Back', icon: 'tb-back', title: 'Back to the previous page' },
  { cmd: 'forward', label: 'Forward', icon: 'tb-forward' },
  { cmd: 'up', label: 'Up', icon: 'tb-up', title: 'Up one level' },
];

export const EXPLORER_LINKS: QuickLink[] = [
  { label: 'Projects', href: '/image', icon: 'folder' },
  { label: 'All on one page', href: '/image/all', icon: 'documents' },
  { label: 'The House', href: '/house/facade', icon: 'house' },
  { label: 'About', href: '/about', icon: 'document' },
  { label: 'Contact', href: '/contact', icon: 'mail' },
];

/** The House's browser toolbar. `alt` is the same thing in the Projects folder. */
export function houseTools(alt?: string): Tool[] {
  return [
    { cmd: 'back', label: 'Back', icon: 'tb-back' },
    { cmd: 'forward', label: 'Forward', icon: 'tb-forward' },
    { cmd: 'stop', label: 'Stop', icon: 'tb-stop' },
    { cmd: 'refresh', label: 'Refresh', icon: 'tb-refresh' },
    { cmd: 'home', label: 'Home', icon: 'house', title: 'The front of the house' },
    SEP,
    { href: '/house', label: 'Floorplan', icon: 'plan', title: 'The floorplans' },
    { href: '/house/appendix/index', label: 'Index', icon: 'topic', title: 'The index of the house' },
    { href: alt ?? '/image', label: 'Projects', icon: 'folder', title: alt ? 'Show this in the Projects folder' : 'The Projects folder' },
  ];
}

export const HOUSE_LINKS: QuickLink[] = [
  { label: 'Façade', href: '/house/facade', icon: 'house' },
  { label: 'Floorplan', href: '/house', icon: 'house' },
  { label: 'Index', href: '/house/appendix/index', icon: 'topic' },
  { label: 'Rules', href: '/house/appendix/rules', icon: 'topic' },
  { label: 'Instagram', href: site.social[0].href, icon: 'camera', external: true },
];
