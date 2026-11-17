// Kino (/kino): Now Showing and the player. Started once per window, at the
// top level and on astro:page-load, as every page script is (docs/DESKTOP.md).
// Now Showing's selection, Web View and status bar are the Projects folder's
// (src/scripts/explorer.ts); here are its menus.
import { desktop } from '../paint/dom';
import { KinoPlayer, kinoHelp } from './player';

type Desk = { menus?(el: Element, provider: (name: string) => unknown[] | null): void; open(url: string): Promise<void>; close(el: Element): void };

export function initKino() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-kino]:not([data-init])')) {
    root.dataset.init = '1';
    if (root.dataset.kinoFilm) new KinoPlayer(root);
    else lobby(root);
  }
}

/** Now Showing's menus: File ▸ Open, Close; Play ▸ each film; Help. */
function lobby(root: HTMLElement) {
  const win = root.closest<HTMLElement>('[data-window]') ?? root;
  const d = desktop() as unknown as Desk | undefined;
  if (!d?.menus) return;
  const films = () => [...root.querySelectorAll<HTMLAnchorElement>('.kino-films a.icon')];
  const titleOf = (a: HTMLAnchorElement) => {
    const t = a.querySelector('.icon-label');
    const en = t?.querySelector('[data-l="en"]')?.textContent ?? t?.textContent ?? '';
    return { en, zh: t?.querySelector('[data-l="zh"]')?.textContent ?? en };
  };
  const open = (a: HTMLAnchorElement) => void d.open(a.getAttribute('href')!);
  d.menus(win, (name) => {
    switch (name) {
      case 'file': {
        const sel = root.querySelector<HTMLAnchorElement>('.kino-films a.icon.selected');
        return [
          { label: '&Open', zh: '打开(&O)', key: 'Enter', disabled: !sel, action: () => sel && open(sel) },
          { sep: true },
          { label: '&Close', zh: '关闭(&C)', action: () => d.close(win) },
        ];
      }
      case 'play':
        return films().map((a, i) => {
          const t = titleOf(a);
          return { label: `&${i + 1} ${t.en}`, zh: `&${i + 1} ${t.zh}`, icon: 'kino', action: () => open(a) };
        });
      case 'help':
        return kinoHelp(root);
      default:
        return null;
    }
  });
}
