// Paint (画图): set up each Paint window once (page scripts can run again
// when the window opens another page, see docs/DESKTOP.md).
import { PaintApp } from './app';

export function initPaint() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-paint]:not([data-init])')) {
    root.dataset.init = '1';
    new PaintApp(root);
  }
}
