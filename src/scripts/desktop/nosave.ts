// The site's pictures can't be saved: they are the artist's work, protected by
// copyright. No browser menu on a picture (Shift+right-click, or press and hold
// on Android, would offer to save it) and no dragging one out of a window. The
// desktop's own right-click menu still works: its Save Picture As..., like the
// Image Viewer's Save, says why instead (savePicture). desktop.css does the
// rest, without JavaScript too: no press-and-hold callout on an iPhone or iPad,
// no dragging in Safari and Chrome, and selecting a page leaves pictures out.
//
// Left alone: admin mode (html[data-admin]), and anything inside
// [data-savable], the visitor's own pictures (Paint, its Send preview, the
// picture in Suggest a Place).
import { msgbox } from './dialogs';
import { h } from './util';

/** Pictures: photographs, canvases (the house in 3D), drawings in SVG (the façade, the plans). */
const PICTURES = 'img, canvas, svg image';

/** Admin mode is on (the same test as isAdminPage() in scripts/admin/api.ts). */
const admin = () => document.documentElement.hasAttribute('data-admin');

/** The picture at `t` that a visitor may not save, or null. */
export function guardedPicture(t: EventTarget | null): Element | null {
  if (!(t instanceof Element) || admin()) return null;
  const pic = t.closest(PICTURES);
  return pic && !pic.closest('[data-savable]') ? pic : null;
}

/** Save Picture As... and the Image Viewer's Save: the file where the picture may be kept, otherwise why not. */
export function savePicture(pic: Element, src: string, name: string) {
  if (guardedPicture(pic)) {
    void msgbox({
      title: { en: 'Save Picture As', zh: '图片另存为' },
      icon: 'warning',
      text: { en: 'This picture is protected by copyright and can’t be saved.', zh: '这张图片受版权保护，不能保存。' },
      owner: pic,
    });
    return;
  }
  const a = h('a', { href: src, download: name, 'data-native': '' });
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function initNoSave() {
  // Last in line (on window, bubbling): the desktop's own menu (contextmenu.ts) and page
  // scripts have had their turn, so whatever would still open the browser's menu stops here.
  addEventListener('contextmenu', (e) => {
    if (!e.defaultPrevented && guardedPicture(e.target)) e.preventDefault();
  });
  addEventListener('dragstart', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    // A picture, or a link holding one (dragging the link would carry the picture too).
    if (guardedPicture(t.matches('a[href]') ? t.querySelector(PICTURES) : t)) e.preventDefault();
  }, true);
}
