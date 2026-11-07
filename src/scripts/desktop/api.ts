// What page content (the house map, drawers, the contact form) may ask of the
// desktop, as window.kus98. Content checks it exists, so pages still work alone.
import { msgbox, openDialog } from './dialogs';
import { bindIconGroup } from './icons';
import { navigate } from './router';
import { settings } from './settings';
import type { MenuSpec } from './menu';
import { play } from './sound';
import { ownMenus } from './winmenus';
import * as wm from './wm';

export const api = {
  /** A message box; resolves with the button pressed. */
  alert: msgbox,
  /** A dialog window. Returns an object with close(). */
  dialog(o: Parameters<typeof openDialog>[0]) {
    const win = openDialog(o);
    return { el: win.el, close: () => wm.close(win) };
  },
  /** Close the window that holds this element. */
  close(el: Element) {
    const w = wm.byEl(el);
    if (w) wm.close(w);
  },
  /** Keep a window's URL in step with its content (map pans, zooms). */
  replaceUrl(el: Element, url: string) {
    const w = wm.byEl(el);
    if (w) wm.setUrl(w, url);
    else {
      try { history.replaceState(history.state, '', url); } catch { /* ignore */ }
    }
  },
  /**
   * Open a site page in its window. `reload` fetches it afresh into the same
   * window (after a log-on or log-off), replacing the history entry.
   */
  open: (url: string, o?: { reload?: boolean }) =>
    navigate(url, o?.reload ? { reload: true, history: 'replace', winHistory: false, source: 'script' } : {}),
  play,
  /** Visitor settings (Control Panel). */
  settings,
  /** Give a list of .icon elements folder behaviour (select, double-click, arrows). */
  bindIcons: (el: HTMLElement) => bindIconGroup(el),
  /**
   * A program's own menu bar (Paint's File, Edit, View, Image…): `provider`
   * gets the menu's name ("file") and returns its items, or null for the
   * standard ones. Asked each time a menu opens, so items can be ticked or
   * greyed out as things stand.
   */
  menus(el: Element, provider: (name: string) => MenuSpec[] | null) {
    const w = wm.byEl(el);
    if (w) ownMenus.set(w.el, provider);
  },
};

export type DesktopApi = typeof api;
