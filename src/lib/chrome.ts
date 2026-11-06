// Toolbars and Links bars of the programs (rendered by Window.astro).
import { site } from './content';

export interface Tool {
  /** A window command (back, forward, up, refresh, home, stop…) or a shell command. */
  cmd?: string;
  /** Or a link. */
  href?: string;
  label: string;
  /** Chinese label and tooltip (the 中/EN switch). */
  zh?: string;
  icon: string;
  title?: string;
  titleZh?: string;
  /** Commands need JavaScript; links don't. */
  sep?: boolean;
}

export interface QuickLink { label: string; zh?: string; href: string; icon?: string; external?: boolean }

export const SEP: Tool = { sep: true, label: '', icon: '' };

export const EXPLORER_TOOLS: Tool[] = [
  { cmd: 'back', label: 'Back', zh: '后退', icon: 'tb-back', title: 'Back to the previous page', titleZh: '回到上一页' },
  { cmd: 'forward', label: 'Forward', zh: '前进', icon: 'tb-forward' },
  { cmd: 'up', label: 'Up', zh: '向上', icon: 'tb-up', title: 'Up one level', titleZh: '向上一级' },
];

export const EXPLORER_LINKS: QuickLink[] = [
  { label: 'Projects', zh: '作品', href: '/image', icon: 'folder' },
  { label: 'All on one page', zh: '全部在一页', href: '/image/all', icon: 'documents' },
  { label: 'The House', zh: '房子', href: '/house/facade', icon: 'house' },
  { label: 'About', zh: '关于', href: '/about', icon: 'document' },
  { label: 'Contact', zh: '联系', href: '/contact', icon: 'mail' },
];

/** The House's browser toolbar. `alt` is the same thing in the Projects folder. */
export function houseTools(alt?: string): Tool[] {
  return [
    { cmd: 'back', label: 'Back', zh: '后退', icon: 'tb-back' },
    { cmd: 'forward', label: 'Forward', zh: '前进', icon: 'tb-forward' },
    { cmd: 'stop', label: 'Stop', zh: '停止', icon: 'tb-stop' },
    { cmd: 'refresh', label: 'Refresh', zh: '刷新', icon: 'tb-refresh' },
    { cmd: 'home', label: 'Home', zh: '主页', icon: 'house', title: 'The front of the house', titleZh: '房子的正面' },
    SEP,
    { href: '/house', label: 'Floorplan', zh: '平面图', icon: 'plan', title: 'The floorplans', titleZh: '各层平面图' },
    { href: '/house/appendix/index', label: 'Index', zh: '索引', icon: 'topic', title: 'The index of the house', titleZh: '房子的索引' },
    { href: alt ?? '/image', label: 'Projects', zh: '作品', icon: 'folder', title: alt ? 'Show this in the Projects folder' : 'The Projects folder', titleZh: alt ? '在“作品”文件夹中显示' : '“作品”文件夹' },
  ];
}

export const HOUSE_LINKS: QuickLink[] = [
  { label: 'Façade', zh: '立面', href: '/house/facade', icon: 'house' },
  { label: 'Floorplan', zh: '平面图', href: '/house', icon: 'house' },
  { label: '3D', zh: '3D', href: '/house/3d', icon: 'house' },
  { label: 'Index', zh: '索引', href: '/house/appendix/index', icon: 'topic' },
  { label: 'Rules', zh: '规则', href: '/house/appendix/rules', icon: 'topic' },
  { label: 'Instagram', href: site.social[0].href, icon: 'camera', external: true },
];
