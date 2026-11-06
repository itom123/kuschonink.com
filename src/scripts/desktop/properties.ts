// Properties: a Windows 98 property sheet with real facts about what was
// right-clicked (a project, a room, a photograph, a page, a desktop icon).
import { addressFor, cleanPath } from '../../lib/apps';
import { desktopData, type DesktopData } from './data';
import { openDialog } from './dialogs';
import * as wm from './wm';
import { h, shownText } from './util';

type Row = [string, string] | 'sep';

export interface Sheet { title: string; icon: string; name: string; rows: Row[]; attrs?: string[] }

function sheet(s: Sheet, owner?: Element | null) {
  const rows = s.rows.map((r) =>
    r === 'sep'
      ? h('div', { class: 'prop-sep', role: 'separator' })
      : h('div', { class: 'prop-row' }, [h('span', { class: 'prop-key' }, r[0]), h('span', { class: 'prop-val' }, r[1])]),
  );
  const tab = h('div', { class: 'window prop-panel', role: 'tabpanel' }, [
    h('div', { class: 'prop-head' }, [h('span', { class: `ico ico-${s.icon}`, 'aria-hidden': 'true' }), h('input', { type: 'text', value: s.name, readonly: '', 'aria-label': 'Name' })]),
    h('div', { class: 'prop-sep', role: 'separator' }),
    ...rows,
    ...(s.attrs
      ? [
          h('div', { class: 'prop-sep', role: 'separator' }),
          h('div', { class: 'prop-row' }, [
            h('span', { class: 'prop-key' }, 'Attributes:'),
            h('span', { class: 'prop-val prop-attrs' }, s.attrs.flatMap((a, i) => [
              h('input', { type: 'checkbox', id: `prop-attr-${i}-${a}`, checked: a === 'Read-only' ? '' : undefined, disabled: '' }),
              h('label', { for: `prop-attr-${i}-${a}` }, a),
            ])),
          ]),
        ]
      : []),
  ]);
  const ok = h('button', { type: 'button', class: 'default' }, 'OK');
  const cancel = h('button', { type: 'button' }, 'Cancel');
  const apply = h('button', { type: 'button', disabled: '' }, 'Apply');
  const body = h('div', { class: 'prop-sheet' }, [
    h('menu', { role: 'tablist', class: 'prop-tabs' }, [h('li', { role: 'tab', 'aria-selected': 'true' }, h('a', { href: '#' }, 'General'))]),
    tab,
    h('div', { class: 'prop-buttons' }, [ok, cancel, apply]),
  ]);
  // Property sheets are ordinary windows in Windows 98: not modal, with a taskbar button.
  void owner;
  const win = openDialog({ title: `${s.title} Properties`, icon: s.icon, body, help: true, task: true, className: 'prop-window' });
  for (const b of [ok, cancel]) b.addEventListener('click', () => wm.close(win));
  body.querySelector('a')!.addEventListener('click', (e) => e.preventDefault());
  ok.focus();
  return win;
}

/** A General property sheet with these facts. */
export const showSheet = (s: Sheet, owner?: Element | null) => sheet(s, owner);

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function projectRows(d: DesktopData, slug: string): Sheet | null {
  const p = d.projects.find((x) => x.slug === slug);
  if (!p) return null;
  const rows: Row[] = [
    ['Type:', 'Project folder'],
    ['Location:', 'C:\\xiangyin\\image'],
    ['Contains:', [plural(p.images, 'image'), plural(p.texts, 'text'), plural(p.videos, 'video')].join(', ')],
  ];
  if (p.room) rows.push('sep', ['In the house:', `${p.room.en}${p.room.zh ? ' ' + p.room.zh : ''}, ${p.room.floor.toLowerCase()}`], ['Chapter:', String(p.room.chapter)]);
  return { title: p.title, icon: 'folder', name: p.title, rows, attrs: ['Read-only', 'Hidden', 'Archive'] };
}

function roomRows(d: DesktopData, slug: string): Sheet | null {
  const r = d.rooms.find((x) => x.slug === slug);
  if (!r) return null;
  const project = d.projects.find((p) => p.room?.slug === slug);
  return {
    title: r.en,
    icon: r.locked ? 'error' : 'house',
    name: `${r.en}${r.zh ? ' · ' + r.zh : ''}`,
    rows: [
      ['Type:', 'Room'],
      ['Floor:', r.floor],
      ['Chapter:', r.locked ? '— (missing: the room has no door)' : String(r.chapter)],
      ['Size:', r.size],
      'sep',
      ['Contains:', project ? `“${project.title}”` : r.title !== r.en ? r.title : 'Only an inventory'],
      ['Address:', addressFor(r.url)],
    ],
  };
}

function pageRows(d: DesktopData, url: string, title: string, icon: string): Sheet {
  const path = cleanPath(url.split(/[?#]/)[0]);
  const page = d.pages.find((p) => p.url === path);
  const m = /^\/image\/([^/]+)$/.exec(path);
  if (m) return projectRows(d, m[1]) ?? { title, icon, name: title, rows: [] };
  const room = /^\/house\/([^/]+)$/.exec(path);
  if (room && room[1] !== 'facade') return roomRows(d, room[1]) ?? { title, icon, name: title, rows: [] };
  const rows: Row[] = [
    ['Type:', page?.type ?? 'Web page'],
    ['Address:', addressFor(path)],
  ];
  if (path === '/image') rows.push(['Contains:', `${plural(d.projects.length, 'project')}, ${plural(d.projects.reduce((n, p) => n + p.images, 0), 'image')}`]);
  if (path === '/house/facade' || path === '/house') rows.push(['Contains:', `${d.floors.length} floors, ${plural(d.rooms.length, 'room')}`]);
  if (path === '/help') rows.push(['Contains:', plural(d.help.length, 'topic')]);
  if (path === '/contact') rows.push(['Sends to:', d.site.name]);
  return { title: page?.title ?? title, icon: page?.icon ?? icon, name: page?.title ?? title, rows };
}

/** Properties of a link, an icon or a page (by its URL). */
export async function showPropertiesFor(url: string, fallbackTitle: string, icon = 'document', owner?: Element | null) {
  let d: DesktopData;
  try {
    d = await desktopData();
  } catch {
    sheet({ title: fallbackTitle, icon, name: fallbackTitle, rows: [['Address:', url]] }, owner);
    return;
  }
  const u = new URL(url, location.href);
  if (u.origin !== location.origin) {
    sheet({ title: fallbackTitle, icon: 'camera', name: fallbackTitle, rows: [['Type:', 'Internet Shortcut'], ['Target:', u.href]] }, owner);
    return;
  }
  sheet(pageRows(d, u.pathname, fallbackTitle, icon), owner);
}

/** Properties of a photograph. */
export function showImageProperties(img: HTMLImageElement, owner?: Element | null) {
  const src = img.currentSrc || img.src;
  const file = decodeURIComponent(new URL(src, location.href).pathname.split('/').pop() ?? '');
  const ext = (file.split('.').pop() ?? '').toUpperCase();
  sheet(
    {
      title: file || 'Picture',
      icon: 'image',
      name: img.alt || file,
      rows: [
        ['Type:', `${ext === 'JPG' ? 'JPEG' : ext} Image`],
        ['Dimensions:', `${img.naturalWidth} × ${img.naturalHeight} pixels`],
        ['Shown at:', `${Math.round(img.getBoundingClientRect().width)} × ${Math.round(img.getBoundingClientRect().height)}`],
        ['Address:', new URL(src, location.href).pathname],
      ],
      attrs: ['Read-only', 'Hidden', 'Archive'],
    },
    owner,
  );
}

/** Properties of a desktop icon. */
export async function showIconProperties(icon: HTMLElement) {
  const label = shownText(icon.querySelector('.icon-label') ?? icon).trim();
  const ico = [...icon.querySelector('.ico')!.classList].find((c) => c.startsWith('ico-'))?.slice(4) ?? 'document';
  const href = icon.getAttribute('href');
  if (href) return showPropertiesFor(href, label, ico, null);
  sheet({ title: label, icon: ico, name: label, rows: [['Type:', icon.dataset.type ?? 'System folder']] });
}
