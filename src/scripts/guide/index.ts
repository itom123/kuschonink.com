// Field Guide (导览): set up each guide window once (page scripts run again
// when a window opens another page, see docs/DESKTOP.md).
import { GuideApp } from './app';

export function initGuide() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-gd]:not([data-init])')) {
    root.dataset.init = '1';
    try {
      new GuideApp(root);
    } catch (e) {
      // The page still reads as one column without the program.
      root.removeAttribute('data-init');
      root.classList.add('gd-failed');
      console.error('Field Guide could not start', e);
    }
  }
}
