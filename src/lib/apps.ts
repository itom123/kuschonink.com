// The programs of Xiangyin 98 and which URLs open in which program.
// No Astro imports: this file is also bundled into the browser (the shell).

export type AppId = 'welcome' | 'explorer' | 'about' | 'contact' | 'paint' | 'house' | 'help' | 'guide' | 'error';

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
  paint: { name: 'Paint', icon: 'paint', w: 900, h: 660 },
  house: { name: 'The House', icon: 'house', w: 1100, h: 760, max: true },
  help: { name: 'Help', icon: 'help', w: 800, h: 580 },
  guide: { name: 'Field Guide', icon: 'guide', w: 1100, h: 760, max: true },
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
  if (p === '/paint') return 'paint';
  if (p === '/house' || p.startsWith('/house/')) return 'house';
  if (p === '/help') return 'help';
  if (p === '/guides' || p.startsWith('/guides/')) return 'guide';
  return 'error';
}

/** What a window's address bar shows for a page. */
export function addressFor(path: string): string {
  const p = cleanPath(path);
  if (p === '/') return 'C:\\xiangyin\\Desktop';
  if (p === '/about') return 'C:\\xiangyin\\About.doc';
  if (p === '/contact') return 'C:\\xiangyin\\Contact';
  if (p === '/paint') return 'C:\\xiangyin\\Paint';
  if (p === '/help') return 'C:\\xiangyin\\Help';
  if (p === '/guides' || p.startsWith('/guides/')) return 'C:\\xiangyin\\Guides' + p.slice('/guides'.length).replace(/\//g, '\\');
  return 'C:\\xiangyin' + p.replace(/\//g, '\\');
}

/**
 * The toolbar's Up button: the folder a page sits in (null at the top). A
 * Field Guide guide has none: /guides is no folder, it goes to a guide.
 */
export function upOf(url: string): string | null {
  const p = cleanPath(url.split(/[?#]/)[0]);
  if (p.startsWith('/image/')) return '/image';
  if (p.startsWith('/house/') && p !== '/house/facade') return '/house';
  return null;
}

/** Programs whose window keeps the URL's query string (deep links such as /guides/x?place=A3). */
export const keepsQuery = (app: string) => app === 'house' || app === 'guide';

/**
 * Turn what someone typed into an address bar or the Run box into a site path.
 * Accepts site paths, kuschonink.com URLs and C:\xiangyin\… paths.
 * Returns null when it isn't an address on this site.
 */
export function addressToPath(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  s = s.replace(/^(https?:\/\/)?(www\.)?kuschonink\.com/i, '');
  if (/^[a-z]:\\/i.test(s)) {
    s = s.replace(/^[a-z]:\\(xiangyin|kuschonink)/i, '').replace(/^[a-z]:/i, '').replace(/\\/g, '/');
    s = s.replace(/^\/desktop$/i, '/').replace(/^\/about\.(doc|txt)$/i, '/about');
  }
  if (/^[a-z]+:/i.test(s)) return null;
  if (!s.startsWith('/')) s = '/' + s;
  const [path, rest = ''] = s.split(/(?=[?#])/);
  return cleanPath(path).toLowerCase() + rest;
}
