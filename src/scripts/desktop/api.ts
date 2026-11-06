// What page content (the house map, drawers, the contact form) may ask of the
// desktop, as window.kus98. Content checks it exists, so pages still work alone.
import { msgbox, openDialog } from './dialogs';
import { navigate } from './router';
import { settings } from './settings';
import { play } from './sound';
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
  /** Open a site page in its window. */
  open: (url: string) => navigate(url),
  play,
  /** Visitor settings (Control Panel). */
  settings,
};

export type DesktopApi = typeof api;
