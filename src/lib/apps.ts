// The programs of kuschonink 98 and which URLs open in which program.
// No Astro imports: this file is also bundled into the browser (the shell).

export type AppId = 'welcome' | 'explorer' | 'about' | 'contact' | 'house' | 'help' | 'error';

export interface AppInfo {
  /** Program name, shown in tooltips and Properties. */
  name: string;
  /** Icon name (see src/lib/iconset.ts). */
  icon: string;
  /** Default window size in CSS pixels. */
  w: number;
  h: number;
  /** Opens maximised. */
  max?: boolean;
}

export const APPS: Record<AppId, AppInfo> = {
  welcome: { name: 'Welcome', icon: 'welcome', w: 640, h: 460 },
  explorer: { name: 'Explorer', icon: 'folder-open', w: 880, h: 600 },
  about: { name: 'Document', icon: 'document', w: 720, h: 640 },
  contact: { name: 'New Message', icon: 'mail', w: 660, h: 620 },
  house: { name: 'The House', icon: 'house', w: 1100, h: 760, max: true },
  help: { name: 'Help', icon: 'help', w: 800, h: 580 },
  error: { name: 'Error', icon: 'error', w: 460, h: 300 },
};

/** "/image/hanabi.html" → "/image/hanabi", "/index.html" → "/". */
export function cleanPath(path: string): string {
  let p = path.replace(/\.html$/, '').replace(/\/index$/, '/');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

export function appFor(path: string): AppId {
  const p = cleanPath(path);
  if (p === '/') return 'welcome';
  if (p === '/image' || p.startsWith('/image/')) return 'explorer';
  if (p === '/about') return 'about';
  if (p === '/contact') return 'contact';
  if (p === '/house' || p.startsWith('/house/')) return 'house';
  if (p === '/help') return 'help';
  return 'error';
}

/** What a window's address bar shows for a page. */
export function addressFor(path: string): string {
  const p = cleanPath(path);
  const app = appFor(p);
  if (app === 'house') return `http://kuschonink.com${p}`;
  if (p === '/') return 'C:\\kuschonink\\Desktop';
  if (p === '/about') return 'C:\\kuschonink\\About.doc';
  if (p === '/contact') return 'C:\\kuschonink\\Contact';
  if (p === '/help') return 'C:\\kuschonink\\Help';
  return 'C:\\kuschonink' + p.replace(/\//g, '\\');
}

/** The toolbar's Up button: the folder a page sits in (null at the top). */
export function upOf(url: string): string | null {
  const p = cleanPath(url.split(/[?#]/)[0]);
  if (p.startsWith('/image/')) return '/image';
  if (p.startsWith('/house/') && p !== '/house/facade') return '/house';
  return null;
}

/**
 * Turn what someone typed into an address bar or the Run box into a site path.
 * Accepts site paths, kuschonink.com URLs and C:\kuschonink\… paths.
 * Returns null when it isn't an address on this site.
 */
export function addressToPath(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  s = s.replace(/^(https?:\/\/)?(www\.)?kuschonink\.com/i, '');
  if (/^[a-z]:\\/i.test(s)) {
    s = s.replace(/^[a-z]:\\kuschonink/i, '').replace(/^[a-z]:/i, '').replace(/\\/g, '/');
    s = s.replace(/^\/desktop$/i, '/').replace(/^\/about\.(doc|txt)$/i, '/about');
  }
  if (/^[a-z]+:/i.test(s)) return null;
  if (!s.startsWith('/')) s = '/' + s;
  const [path, rest = ''] = s.split(/(?=[?#])/);
  return cleanPath(path).toLowerCase() + rest;
}
