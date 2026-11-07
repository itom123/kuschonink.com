// Field Guide (导览): the home folder. Its guides behave like folder icons
// (select, double-click or Enter opens) when the desktop is there; without
// it they are plain links.
export function initGuideHome() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-gd-home]:not([data-init])')) {
    root.dataset.init = '1';
    const list = root.querySelector<HTMLElement>('.gd-home-list');
    if (list && window.kus98) window.kus98.bindIcons(list);
  }
}
