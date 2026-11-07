// Image Viewer: click a photograph in a project (or in a room of the house)
// to see it large, zoom in, step through the others, or set it as wallpaper.
// Save says the picture can't be saved, except in admin mode (nosave.ts).
import { appWindow } from '../appwindow';
import { commands } from '../commands';
import { savePicture } from '../nosave';
import { settings } from '../settings';
import { h, setText, type Text } from '../util';
import { largestSrc } from '../winmenus';
import * as wm from '../wm';

interface Pic { src: string; name: string; w: number; h: number; alt: string }

const VIEWABLE = '.app-window[data-app="explorer"] .doc-page img, .app-window[data-app="house"] .room-panel .section img';

let pics: Pic[] = [];
let index = 0;
let zoom: number | 'fit' = 'fit';
let win: wm.Win | null = null;
let img: HTMLImageElement;
let stage: HTMLElement;

const fileName = (src: string) => decodeURIComponent(new URL(src, location.href).pathname.split('/').pop() ?? 'picture').replace(/\.[A-Za-z0-9_-]{6,}(?=\.)/, '');

function picsFrom(scope: Element): HTMLImageElement[] {
  return [...scope.querySelectorAll<HTMLImageElement>('img')].filter((i) => i.matches(VIEWABLE) && !i.closest('a[href]') && i.naturalWidth > 64);
}

function tool(cmd: string, label: Text, icon: string, title: Text = label) {
  return h('button', { type: 'button', class: 'tool', 'data-viewer': cmd, title }, [h('span', { class: `ico ico20 ico-${icon}`, 'aria-hidden': 'true' }), label]);
}

function show() {
  const p = pics[index];
  if (!p || !win) return;
  img.src = p.src;
  img.alt = p.alt;
  setText(win.el.querySelector('[data-title]')!, { en: `${p.name} - Image Viewer`, zh: `${p.name} - 图像查看器` });
  const fields = win.el.querySelectorAll('.status-bar-field');
  setText(fields[0], { en: `Image ${index + 1} of ${pics.length}`, zh: `第 ${index + 1} 张，共 ${pics.length} 张` });
  setText(fields[1], p.w ? { en: `${p.w} × ${p.h} pixels`, zh: `${p.w} × ${p.h} 像素` } : '');
  applyZoom();
  win.el.querySelectorAll<HTMLButtonElement>('[data-viewer="prev"], [data-viewer="next"]').forEach((b) => (b.disabled = pics.length < 2));
  document.dispatchEvent(new CustomEvent('wm:change'));
}

function applyZoom() {
  stage.classList.toggle('fit', zoom === 'fit');
  if (zoom === 'fit') img.style.width = '';
  else img.style.width = `${Math.round((pics[index]?.w || img.naturalWidth) * zoom)}px`;
  const z = win?.el.querySelectorAll('.status-bar-field')[2];
  if (z) setText(z, zoom === 'fit' ? { en: 'Best fit', zh: '最适合' } : `${Math.round(zoom * 100)}%`);
}

function go(d: number) {
  if (pics.length < 2) return;
  index = (index + d + pics.length) % pics.length;
  zoom = 'fit';
  show();
}

function zoomBy(f: number) {
  const base = zoom === 'fit' ? img.clientWidth / (pics[index]?.w || img.naturalWidth || 1) : zoom;
  zoom = Math.min(4, Math.max(0.1, base * f));
  applyZoom();
}

function build() {
  img = h('img', { class: 'viewer-img', alt: '', draggable: 'false' });
  stage = h('div', { class: 'viewer-stage fit' }, img);
  const VIEWER = { en: 'Image Viewer', zh: '图像查看器' };
  const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': VIEWER }, [
    tool('prev', { en: 'Previous', zh: '上一张' }, 'tb-back'),
    tool('next', { en: 'Next', zh: '下一张' }, 'tb-forward'),
    h('span', { class: 'tool-sep', 'aria-hidden': 'true' }),
    tool('in', { en: 'Zoom In', zh: '放大' }, 'tb-zoomin'),
    tool('out', { en: 'Zoom Out', zh: '缩小' }, 'tb-zoomout'),
    tool('fit', { en: 'Best Fit', zh: '最适合' }, 'tb-fit'),
    h('span', { class: 'tool-sep', 'aria-hidden': 'true' }),
    tool('wallpaper', { en: 'Wallpaper', zh: '墙纸' }, 'desktop', { en: 'Set as wallpaper', zh: '设为墙纸' }),
    tool('save', { en: 'Save', zh: '保存' }, 'tb-print', { en: 'Save the picture', zh: '保存图片' }),
  ]);
  win = appWindow({ app: 'viewer', title: VIEWER, icon: 'image', w: 820, h: 620, body: stage, toolbar, status: ['', '', ''], className: 'viewer-window', bodyClass: 'viewer-body' });
  win.el.addEventListener('desktop:close', () => (win = null), { once: true });
  toolbar.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-viewer]');
    switch (b?.dataset.viewer) {
      case 'prev': return go(-1);
      case 'next': return go(1);
      case 'in': return zoomBy(1.4);
      case 'out': return zoomBy(1 / 1.4);
      case 'fit':
        zoom = 'fit';
        return applyZoom();
      case 'wallpaper':
        return settings.set({ wallpaper: pics[index].src, wallpaperMode: 'stretch' });
      case 'save':
        return savePicture(img, pics[index].src, pics[index].name);
    }
  });
  stage.addEventListener('dblclick', () => {
    zoom = zoom === 'fit' ? 1 : 'fit';
    applyZoom();
  });
  // Swipe on touch screens.
  let sx = 0;
  stage.addEventListener('pointerdown', (e) => (sx = e.clientX));
  stage.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse' && Math.abs(e.clientX - sx) > 50 && zoom === 'fit') go(e.clientX < sx ? 1 : -1);
  });
}

/** Open the viewer on one photograph, with its neighbours. */
export function openViewer(target: HTMLImageElement) {
  const scope = target.closest('.doc-page, .room-panel') ?? target.parentElement!;
  const list = picsFrom(scope);
  const all = list.includes(target) ? list : [target];
  pics = all.map((i) => {
    const src = largestSrc(i);
    return { src, name: fileName(src), w: 0, h: 0, alt: i.alt };
  });
  index = Math.max(0, all.indexOf(target));
  zoom = 'fit';
  if (!win) build();
  else wm.focus(win);
  img.onload = () => {
    const p = pics[index];
    if (p && !p.w) {
      p.w = img.naturalWidth;
      p.h = img.naturalHeight;
      show();
    }
  };
  show();
}

export function initViewer() {
  commands.register('view-image', (ctx) => {
    if (ctx.el instanceof HTMLImageElement) openViewer(ctx.el);
  });
  // Mark what can be opened, and open it with a click.
  document.addEventListener('desktop:content', (e) => mark(e.target as Element));
  mark(document);
  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (e.defaultPrevented || e.button !== 0 || !(t instanceof HTMLImageElement) || !t.hasAttribute('data-viewable')) return;
    e.preventDefault();
    openViewer(t);
  });
  addEventListener('keydown', (e) => {
    if (!win || wm.getActive() !== win || (e.target as Element).closest?.('input, textarea')) return;
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === '+' || e.key === '=') zoomBy(1.4);
    else if (e.key === '-') zoomBy(1 / 1.4);
    else if (e.key === '0') {
      zoom = 'fit';
      applyZoom();
    } else return;
    e.preventDefault();
  });
}

function mark(root: ParentNode) {
  root.querySelectorAll<HTMLImageElement>(VIEWABLE).forEach((i) => {
    if (!i.closest('a[href]')) i.setAttribute('data-viewable', '');
  });
}
