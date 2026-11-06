// Visitor settings (Control Panel), kept in this browser only.
import { html, stored } from './util';

export interface Settings {
  v: 1;
  /** Sounds on/off and volume 0–1. */
  sound: boolean;
  volume: number;
  /** The click when a page opens in a window. */
  navClick: boolean;
  /** Pointer trails (off to begin with, as in Windows 98) and their length (number of ghosts). */
  trails: boolean;
  trailLength: number;
  /** Show window contents while dragging (otherwise a dotted outline). */
  dragFull: boolean;
  /** 'double': double-click opens icons (classic); 'single': web style. */
  clickStyle: 'double' | 'single';
  dblClickMs: number;
  showWelcome: boolean;
  /** Colour scheme. */
  scheme: 'standard' | 'contrast' | 'slate';
  pointers: 'standard' | 'large' | 'system';
  alwaysMax: boolean;
  /** Wallpaper image URL (or '' for none) and how it's laid out. */
  wallpaper: string;
  wallpaperMode: 'center' | 'tile' | 'stretch';
  /** Screen saver id ('' = none) and minutes before it starts. */
  saver: string;
  saverWait: number;
  explorerView: 'thumbs' | 'list' | 'details';
}

export const DEFAULTS: Settings = {
  v: 1,
  sound: true,
  volume: 0.7,
  navClick: true,
  trails: false,
  trailLength: 3,
  dragFull: false,
  clickStyle: 'double',
  dblClickMs: 500,
  showWelcome: true,
  scheme: 'standard',
  pointers: 'standard',
  alwaysMax: false,
  wallpaper: '',
  wallpaperMode: 'center',
  saver: 'slideshow',
  saverWait: 5,
  explorerView: 'thumbs',
};

const store = stored<Partial<Settings>>('kus98:settings', {});
let current: Settings = { ...DEFAULTS, ...store.get() };
const listeners = new Set<(s: Settings, changed: Partial<Settings>) => void>();

/** Reflect settings that CSS needs onto <html> (the head script does the same before first paint). */
function apply(s: Settings) {
  html.dataset.scheme = s.scheme;
  html.dataset.pointers = s.pointers;
  html.dataset.click = s.clickStyle;
  html.toggleAttribute('data-maxall', s.alwaysMax);
  if (s.wallpaper) {
    html.style.setProperty('--wallpaper', `url("${s.wallpaper.replace(/"/g, '%22')}")`);
    html.style.setProperty('--wallpaper-repeat', s.wallpaperMode === 'tile' ? 'repeat' : 'no-repeat');
    html.style.setProperty('--wallpaper-size', s.wallpaperMode === 'stretch' ? 'cover' : 'auto');
  } else {
    html.style.removeProperty('--wallpaper');
  }
  html.classList.toggle('has-wallpaper', !!s.wallpaper);
}

export const settings = {
  get: () => current,
  set(patch: Partial<Settings>) {
    current = { ...current, ...patch };
    const saved: Partial<Settings> = {};
    for (const k of Object.keys(current) as (keyof Settings)[]) {
      if (current[k] !== DEFAULTS[k]) (saved as Record<string, unknown>)[k] = current[k];
    }
    store.set(saved);
    apply(current);
    listeners.forEach((f) => f(current, patch));
  },
  on(f: (s: Settings, changed: Partial<Settings>) => void) {
    listeners.add(f);
    return () => listeners.delete(f);
  },
};

export function initSettings() {
  apply(current);
}
