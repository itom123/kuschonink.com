// The Start menu: opened by the Start button or Ctrl+Esc, driven by the menu
// engine. Documents ▸ lists what was opened recently (kept in this browser).
import * as menu from './menu';
import { emit, escapeHtml, stored } from './util';

export interface Recent { url: string; title: string; icon: string }
const MAX_RECENT = 15;
export const recent = stored<Recent[]>('kus98:recent', []);

/** Remember a page opened in a window (Start ▸ Documents). */
export function remember(r: Recent) {
  if (!r.url || r.url.startsWith('/house/drawer/')) return;
  const path = r.url.split(/[?#]/)[0];
  const list = recent.get().filter((x) => x.url.split(/[?#]/)[0] !== path);
  list.unshift({ ...r, url: path });
  recent.set(list.slice(0, MAX_RECENT));
}

function fillDocuments(start: HTMLElement) {
  const sub = start.querySelector<HTMLElement>('[data-recent] + ul.menu.sub, li[data-recent-list] > ul.menu.sub');
  if (!sub) return;
  const list = recent.get();
  sub.innerHTML = list.length
    ? list
        .map(
          (r) =>
            `<li role="none"><a class="menu-item" role="menuitem" tabindex="-1" href="${escapeHtml(r.url)}"><span class="ico ico16 ico-${escapeHtml(r.icon)}" aria-hidden="true"></span><span class="mi-label">${escapeHtml(r.title)}</span></a></li>`,
        )
        .join('')
    : '<li role="none"><span class="menu-item" role="menuitem" aria-disabled="true" tabindex="-1"><span class="mi-label"><span data-l="en">(Empty)</span><span data-l="zh" lang="zh-Hans">(空)</span></span></span></li>';
}

export function initStartMenu() {
  const start = document.getElementById('k98-start') as HTMLDetailsElement | null;
  if (!start) return;
  const btn = start.querySelector<HTMLElement>('summary')!;
  const root = start.querySelector<HTMLElement>('.start-list')!;
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');

  const open = (focusFirst: boolean) => {
    fillDocuments(start);
    start.open = true;
    btn.setAttribute('aria-expanded', 'true');
    menu.openTree(root, {
      owner: btn,
      focusFirst,
      onClose: () => {
        start.open = false;
        btn.setAttribute('aria-expanded', 'false');
      },
    });
    emit(document, 'start:open');
  };

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (start.open) menu.close('escape');
    else open(e.detail === 0);
  });
  btn.addEventListener('keydown', (e) => {
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !start.open) {
      e.preventDefault();
      open(true);
    }
  });
  // Ctrl+Esc opens Start, where the computer lets the page have it.
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && e.ctrlKey && !start.open) {
      e.preventDefault();
      btn.focus();
      open(true);
    }
  });
  document.addEventListener('desktop:navigate', (e) => {
    const d = (e as CustomEvent<{ url: string; title: string; icon: string }>).detail;
    remember({ url: d.url, title: d.title, icon: d.icon });
  });
}
