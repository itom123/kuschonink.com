// Window menu bars (File, Edit, View, Go, Favorites, Help) and the system
// menu in each title bar.
import { shownText } from './util';
import * as menu from './menu';
import { barMenu, systemMenu } from './winmenus';
import * as wm from './wm';

function openBarMenu(b: HTMLElement, focusFirst: boolean) {
  const win = wm.byEl(b);
  if (!win) return;
  wm.focus(win);
  const r = b.getBoundingClientRect();
  menu.close('replace');
  b.setAttribute('aria-expanded', 'true');
  menu.popup(barMenu(win, b.dataset.menu ?? ''), r.left, r.bottom, {
    owner: b,
    focusFirst,
    label: shownText(b),
    onClose: () => b.setAttribute('aria-expanded', 'false'),
    onEdge: (dir) => {
      const items = [...b.parentElement!.querySelectorAll<HTMLElement>('.mb-item')];
      openBarMenu(items[(items.indexOf(b) + dir + items.length) % items.length], true);
    },
  });
}

export function initMenubars() {
  document.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.mb-item');
    if (!b) return;
    e.preventDefault();
    if (b.getAttribute('aria-expanded') === 'true') menu.close('escape');
    else openBarMenu(b, e.detail === 0);
  });
  // With a menu open, pointing at another menu bar item opens that one (as in Windows).
  document.addEventListener('pointerover', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.mb-item');
    if (!b || !menu.isOpen()) return;
    const open = b.parentElement?.querySelector<HTMLElement>('.mb-item[aria-expanded="true"]');
    if (open && open !== b) openBarMenu(b, false);
  });
  // F10 opens the active window's first menu; Alt+Space its system menu (where browsers allow).
  addEventListener('keydown', (e) => {
    const win = wm.getActive();
    if (!win) return;
    if (e.key === 'F10' && !e.shiftKey) {
      const b = win.el.querySelector<HTMLElement>('.mb-item');
      if (b) {
        e.preventDefault();
        openBarMenu(b, true);
      }
    } else if (e.key === ' ' && e.altKey) {
      e.preventDefault();
      const r = win.el.querySelector('.title-ico')?.getBoundingClientRect();
      menu.popup(systemMenu(win), r?.left ?? 20, (r?.bottom ?? 20) + 2, { focusFirst: true });
    }
  });
  wm.hooks.sysmenu = (win, x, y) => menu.popup(systemMenu(win), x, y, { owner: win.el.querySelector<HTMLElement>('.title-ico') });
}
