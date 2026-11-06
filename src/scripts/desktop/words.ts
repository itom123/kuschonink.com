// Words the desktop uses in many places, in English and Chinese (as in the
// Chinese edition of Windows 98). The 中/EN switch shows one.
import type { Text } from './util';

type Bi = { en: string; zh: string };

export const W = {
  ok: { en: 'OK', zh: '确定' },
  cancel: { en: 'Cancel', zh: '取消' },
  apply: { en: 'Apply', zh: '应用' },
  yes: { en: 'Yes', zh: '是' },
  no: { en: 'No', zh: '否' },
  close: { en: 'Close', zh: '关闭' },
  help: { en: 'Help', zh: '帮助' },
  open: { en: 'Open', zh: '打开' },
  restore: { en: 'Restore', zh: '还原' },
  minimize: { en: 'Minimize', zh: '最小化' },
  maximize: { en: 'Maximize', zh: '最大化' },
  properties: { en: 'Properties', zh: '属性' },
  general: { en: 'General', zh: '常规' },
  address: { en: 'Address', zh: '地址' },
  whatsThis: { en: 'What’s This?', zh: '这是什么？' },
  controlPanel: { en: 'Control Panel', zh: '控制面板' },
  myComputer: { en: 'My Computer', zh: '我的电脑' },
  recycleBin: { en: 'Recycle Bin', zh: '回收站' },
  projects: { en: 'Projects', zh: '作品' },
  theHouse: { en: 'The House', zh: '房子' },
  noDoor: { en: 'This room has no door. Access is denied.', zh: '这个房间没有门。拒绝访问。' },
} satisfies Record<string, Bi>;

/** Message box buttons by the English name msgbox() returns. */
const BUTTONS: Record<string, string> = {
  OK: '确定',
  Cancel: '取消',
  Yes: '是',
  No: '否',
  Retry: '重试',
  Restore: '还原',
  Close: '关闭',
  Help: '帮助',
  Open: '打开',
  Apply: '应用',
};
export const button = (id: string): Text => (BUTTONS[id] ? { en: id, zh: BUTTONS[id] } : id);

const count = (n: number, one: string, many: string, zh: string): Bi => ({ en: `${n} ${n === 1 ? one : many}`, zh: `${n} ${zh}` });
export const objects = (n: number): Bi => ({ en: `${n} object(s)`, zh: `${n} 个对象` });
export const images = (n: number) => count(n, 'image', 'images', '张图片');
export const texts = (n: number) => count(n, 'text', 'texts', '段文字');
export const videos = (n: number) => count(n, 'video', 'videos', '段视频');
export const projectsN = (n: number) => count(n, 'project', 'projects', '件作品');
export const roomsN = (n: number) => count(n, 'room', 'rooms', '个房间');
export const floorsN = (n: number) => count(n, 'floor', 'floors', '层');
export const topicsN = (n: number) => count(n, 'topic', 'topics', '个主题');
export const filesFound = (n: number): Bi => ({ en: `${n} file(s) found`, zh: `找到 ${n} 个文件` });

/** Join texts with a separator in each language (", " and "，"). */
export function join(parts: Text[], sep: Bi = { en: ', ', zh: '，' }): Bi {
  const en = (t: Text) => (typeof t === 'string' ? t : t.en);
  const zh = (t: Text) => (typeof t === 'string' ? t : t.zh || t.en);
  return { en: parts.map(en).join(sep.en), zh: parts.map(zh).join(sep.zh) };
}

/** A two-language text from a template: both(t => `${t} Properties`, …). */
export const both = (t: Text, f: (s: string, l: 'en' | 'zh') => string): Bi =>
  typeof t === 'string' ? { en: f(t, 'en'), zh: f(t, 'zh') } : { en: f(t.en, 'en'), zh: f(t.zh || t.en, 'zh') };
