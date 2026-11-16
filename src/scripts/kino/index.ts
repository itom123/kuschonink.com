// Kino (/kino): the lobby and the player. Started once per window, at the
// top level and on astro:page-load, as every page script is (docs/DESKTOP.md).
import { desktop } from '../paint/dom';
import { KinoPlayer, kinoHelp } from './player';

type Menus = { menus?(el: Element, provider: (name: string) => unknown[] | null): void; open(url: string): Promise<void>; close(el: Element): void };

export function initKino() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-kino]:not([data-init])')) {
    root.dataset.init = '1';
    if (root.dataset.kinoFilm) new KinoPlayer(root);
    else lobby(root);
  }
}

/** Now Showing: its menus (File ▸ the films, Close; Help). */
function lobby(root: HTMLElement) {
  const win = root.closest<HTMLElement>('[data-window]') ?? root;
  const d = desktop() as unknown as Menus | undefined;
  const films = [...root.querySelectorAll<HTMLAnchorElement>('.kino-item-link')];
  d?.menus?.(win, (name) => {
    switch (name) {
      case 'file':
        return [
          ...films.map((a, i) => {
            const t = a.querySelector('.kino-item-title');
            const en = t?.querySelector('[data-l="en"]')?.textContent ?? t?.textContent ?? '';
            const zh = t?.querySelector('[data-l="zh"]')?.textContent ?? en;
            return { label: `&${i + 1} ${en}`, zh: `&${i + 1} ${zh}`, icon: 'kino', action: () => void d.open(a.getAttribute('href')!) };
          }),
          { sep: true },
          { label: '&Close', zh: '关闭(&C)', action: () => d.close(win) },
        ];
      case 'view':
      case 'play':
        return [{ label: '(Choose a film first)', zh: '（请先选择一部影片）', disabled: true }];
      case 'help':
        return kinoHelp(root);
      default:
        return null;
    }
  });
}
