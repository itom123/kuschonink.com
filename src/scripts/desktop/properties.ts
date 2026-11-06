// Properties: a Windows 98 property sheet with real facts about what was
// right-clicked (a project, a room, a photograph, a page, a desktop icon).
// Everything in it is in English and Chinese; the 中/EN switch shows one.
import { addressFor, cleanPath } from '../../lib/apps';
import { desktopData, type DesktopData } from './data';
import { openDialog } from './dialogs';
import * as wm from './wm';
import { h, lang, shownText, type Text } from './util';
import { W, both, floorsN, images, join, projectsN, roomsN, texts, topicsN, videos } from './words';

type Row = [Text, Text] | 'sep';

export interface Sheet { title: Text; icon: string; name: Text; rows: Row[]; attrs?: boolean }

const K = {
  type: { en: 'Type:', zh: '类型：' },
  location: { en: 'Location:', zh: '位置：' },
  contains: { en: 'Contains:', zh: '包含：' },
  inHouse: { en: 'In the house:', zh: '在房子里：' },
  chapter: { en: 'Chapter:', zh: '章节：' },
  floor: { en: 'Floor:', zh: '楼层：' },
  size: { en: 'Size:', zh: '大小：' },
  address: { en: 'Address:', zh: '地址：' },
  target: { en: 'Target:', zh: '目标：' },
  dimensions: { en: 'Dimensions:', zh: '尺寸：' },
  shownAt: { en: 'Shown at:', zh: '显示大小：' },
  sendsTo: { en: 'Sends to:', zh: '收件人：' },
  attributes: { en: 'Attributes:', zh: '属性：' },
};
const ATTRS = [
  { en: 'Read-only', zh: '只读' },
  { en: 'Hidden', zh: '隐藏' },
  { en: 'Archive', zh: '存档' },
];

function sheet(s: Sheet, owner?: Element | null) {
  const rows = s.rows.map((r) =>
    r === 'sep'
      ? h('div', { class: 'prop-sep', role: 'separator' })
      : h('div', { class: 'prop-row' }, [h('span', { class: 'prop-key' }, r[0]), h('span', { class: 'prop-val' }, r[1])]),
  );
  const tab = h('div', { class: 'window prop-panel', role: 'tabpanel' }, [
    h('div', { class: 'prop-head' }, [h('span', { class: `ico ico-${s.icon}`, 'aria-hidden': 'true' }), h('input', { type: 'text', value: s.name, readonly: '', 'aria-label': { en: 'Name', zh: '名称' } })]),
    h('div', { class: 'prop-sep', role: 'separator' }),
    ...rows,
    ...(s.attrs
      ? [
          h('div', { class: 'prop-sep', role: 'separator' }),
          h('div', { class: 'prop-row' }, [
            h('span', { class: 'prop-key' }, K.attributes),
            h('span', { class: 'prop-val prop-attrs' }, ATTRS.flatMap((a, i) => [
              h('input', { type: 'checkbox', id: `prop-attr-${i}`, checked: i === 0 ? '' : undefined, disabled: '' }),
              h('label', { for: `prop-attr-${i}` }, a),
            ])),
          ]),
        ]
      : []),
  ]);
  const ok = h('button', { type: 'button', class: 'default', 'data-btn': 'OK' }, W.ok);
  const cancel = h('button', { type: 'button', 'data-btn': 'Cancel' }, W.cancel);
  const apply = h('button', { type: 'button', disabled: '' }, W.apply);
  const body = h('div', { class: 'prop-sheet' }, [
    h('menu', { role: 'tablist', class: 'prop-tabs' }, [h('li', { role: 'tab', 'aria-selected': 'true' }, h('a', { href: '#' }, W.general))]),
    tab,
    h('div', { class: 'prop-buttons' }, [ok, cancel, apply]),
  ]);
  // Property sheets are ordinary windows in Windows 98: not modal, with a taskbar button.
  void owner;
  const win = openDialog({ title: both(s.title, (t, l) => (l === 'zh' ? `${t} 属性` : `${t} Properties`)), icon: s.icon, body, help: true, task: true, className: 'prop-window' });
  for (const b of [ok, cancel]) b.addEventListener('click', () => wm.close(win));
  body.querySelector('a')!.addEventListener('click', (e) => e.preventDefault());
  ok.focus();
  return win;
}

/** A General property sheet with these facts. */
export const showSheet = (s: Sheet, owner?: Element | null) => sheet(s, owner);

/** English and Chinese, falling back to English where there's no Chinese. */
const bi = (en: string, zh?: string): Text => ({ en, zh: zh || en });

function projectRows(d: DesktopData, slug: string): Sheet | null {
  const p = d.projects.find((x) => x.slug === slug);
  if (!p) return null;
  const name = bi(p.title, p.titleZh);
  const rows: Row[] = [
    [K.type, { en: 'Project folder', zh: '作品文件夹' }],
    [K.location, 'C:\\xiangyin\\image'],
    [K.contains, join([images(p.images), texts(p.texts), videos(p.videos)])],
  ];
  if (p.room) {
    rows.push(
      'sep',
      [K.inHouse, { en: `${p.room.en}, ${p.room.floor.toLowerCase()}`, zh: `${p.room.floorZh}${p.room.zh || p.room.en}` }],
      [K.chapter, String(p.room.chapter)],
    );
  }
  return { title: name, icon: 'folder', name, rows, attrs: true };
}

function roomRows(d: DesktopData, slug: string): Sheet | null {
  const r = d.rooms.find((x) => x.slug === slug);
  if (!r) return null;
  const project = d.projects.find((p) => p.room?.slug === slug);
  return {
    title: bi(r.en, r.zh),
    icon: r.locked ? 'error' : 'house',
    name: bi(r.en, r.zh),
    rows: [
      [K.type, { en: 'Room', zh: '房间' }],
      [K.floor, bi(r.floor, r.floorZh)],
      [K.chapter, r.locked ? { en: '— (missing: the room has no door)', zh: '—（缺失：这个房间没有门）' } : String(r.chapter)],
      [K.size, r.size],
      'sep',
      [
        K.contains,
        project
          ? { en: `“${project.title}”`, zh: `《${project.titleZh || project.title}》` }
          : r.title !== r.en
            ? bi(r.title, r.titleZh)
            : { en: 'Only an inventory', zh: '只有一份清单' },
      ],
      [K.address, addressFor(r.url)],
    ],
  };
}

function pageRows(d: DesktopData, url: string, title: Text, icon: string): Sheet {
  const path = cleanPath(url.split(/[?#]/)[0]);
  const page = d.pages.find((p) => p.url === path);
  const m = /^\/image\/([^/]+)$/.exec(path);
  if (m) return projectRows(d, m[1]) ?? { title, icon, name: title, rows: [] };
  const room = /^\/house\/([^/]+)$/.exec(path);
  if (room && room[1] !== 'facade' && room[1] !== '3d') return roomRows(d, room[1]) ?? { title, icon, name: title, rows: [] };
  const rows: Row[] = [
    [K.type, page ? bi(page.type, page.typeZh) : { en: 'Web page', zh: '网页' }],
    [K.address, addressFor(path)],
  ];
  if (path === '/image') rows.push([K.contains, join([projectsN(d.projects.length), images(d.projects.reduce((n, p) => n + p.images, 0))])]);
  if (path === '/house/facade' || path === '/house') rows.push([K.contains, join([floorsN(d.floors.length), roomsN(d.rooms.length)])]);
  if (path === '/help') rows.push([K.contains, topicsN(d.help.length)]);
  if (path === '/contact' || path === '/paint') rows.push([K.sendsTo, d.site.name]);
  const name = page ? bi(page.title, page.titleZh) : title;
  return { title: name, icon: page?.icon ?? icon, name, rows };
}

/** Properties of a link, an icon or a page (by its URL). */
export async function showPropertiesFor(url: string, fallbackTitle: Text, icon = 'document', owner?: Element | null) {
  let d: DesktopData;
  try {
    d = await desktopData();
  } catch {
    sheet({ title: fallbackTitle, icon, name: fallbackTitle, rows: [[K.address, url]] }, owner);
    return;
  }
  const u = new URL(url, location.href);
  if (u.origin !== location.origin) {
    sheet({ title: fallbackTitle, icon: 'camera', name: fallbackTitle, rows: [[K.type, { en: 'Internet Shortcut', zh: 'Internet 快捷方式' }], [K.target, u.href]] }, owner);
    return;
  }
  sheet(pageRows(d, u.pathname, fallbackTitle, icon), owner);
}

/** Properties of a photograph. */
export function showImageProperties(img: HTMLImageElement, owner?: Element | null) {
  const src = img.currentSrc || img.src;
  const file = decodeURIComponent(new URL(src, location.href).pathname.split('/').pop() ?? '');
  const ext = (file.split('.').pop() ?? '').toUpperCase();
  const kind = ext === 'JPG' ? 'JPEG' : ext;
  const shown = img.getBoundingClientRect();
  sheet(
    {
      title: file || { en: 'Picture', zh: '图片' },
      icon: 'image',
      name: img.alt || file,
      rows: [
        [K.type, { en: `${kind} Image`, zh: `${kind} 图像` }],
        [K.dimensions, { en: `${img.naturalWidth} × ${img.naturalHeight} pixels`, zh: `${img.naturalWidth} × ${img.naturalHeight} 像素` }],
        [K.shownAt, `${Math.round(shown.width)} × ${Math.round(shown.height)}`],
        [K.address, new URL(src, location.href).pathname],
      ],
      attrs: true,
    },
    owner,
  );
}

/** Properties of a desktop icon. */
export async function showIconProperties(icon: HTMLElement) {
  // The name in both languages, from the icon's label.
  const label = icon.querySelector('.icon-label') ?? icon;
  const en = label.querySelector('[data-l="en"]')?.textContent ?? shownText(label);
  const zh = label.querySelector('[data-l="zh"]')?.textContent ?? '';
  const name: Text = { en: en.trim(), zh: zh.trim() };
  const ico = [...icon.querySelector('.ico')!.classList].find((c) => c.startsWith('ico-') && c !== 'ico-shortcut')?.slice(4) ?? 'document';
  const href = icon.getAttribute('href');
  if (href) return showPropertiesFor(href, name, ico, null);
  const type = icon.dataset.type ? bi(icon.dataset.type, icon.dataset.typeZh) : { en: 'System folder', zh: '系统文件夹' };
  sheet({ title: name, icon: ico, name, rows: [[K.type, type]] });
}

/** Today's language, for dates. */
export const locale = () => (lang() === 'zh' ? 'zh-CN' : undefined);
