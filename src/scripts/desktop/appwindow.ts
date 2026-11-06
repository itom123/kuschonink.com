// Windows for programs that live only in the browser (Control Panel, My
// Computer, the Recycle Bin…): the same chrome as Window.astro, one each.
import { h } from './util';
import * as wm from './wm';

export interface AppWindowOpts {
  app: string;
  title: string;
  icon: string;
  w: number;
  h: number;
  body: Node;
  status?: string[];
  address?: string;
  toolbar?: Node;
  className?: string;
  bodyClass?: string;
}

export function appWindow(o: AppWindowOpts): wm.Win {
  const existing = wm.find(o.app);
  if (existing) {
    wm.focus(existing);
    return existing;
  }
  const titleId = `${o.app}-title`;
  const el = h(
    'section',
    {
      class: `window app-window v-folder ${o.className ?? ''}`.trim(),
      'data-window': '',
      'data-app': o.app,
      'data-icon': o.icon,
      'data-state': 'normal',
      'aria-labelledby': titleId,
      style: `--w:${o.w}px;--h:${o.h}px`,
    },
    [
      h('div', { class: 'title-bar', 'data-drag': '' }, [
        h('div', { class: 'title-bar-text' }, [
          h('span', { class: `ico ico16 ico-${o.icon} title-ico`, 'data-cmd': 'sysmenu', 'aria-hidden': 'true' }),
          h('span', { class: 'title-text', id: titleId, 'data-title': '' }, o.title),
        ]),
        h('div', { class: 'title-bar-controls' }, [
          h('button', { type: 'button', class: 'tb-btn tb-min', 'data-cmd': 'minimize', 'aria-label': 'Minimize', title: 'Minimize' }),
          h('button', { type: 'button', class: 'tb-btn tb-max', 'data-cmd': 'maximize', 'aria-label': 'Maximize', title: 'Maximize' }),
          h('button', { type: 'button', class: 'tb-btn tb-close', 'data-cmd': 'close', 'aria-label': 'Close', title: 'Close' }),
        ]),
      ]),
      h('div', { class: 'window-inner', 'data-window-inner': '' }, [
        o.toolbar ?? null,
        o.address
          ? h('div', { class: 'addressbar' }, [
              h('label', {}, 'Address'),
              h('div', { class: 'address-field' }, [h('span', { class: `ico ico16 ico-${o.icon}`, 'aria-hidden': 'true' }), h('input', { type: 'text', value: o.address, readonly: '', 'aria-label': 'Address' })]),
            ])
          : null,
        h('div', { class: 'window-main' }, [h('div', { class: `wbody ${o.bodyClass ?? ''}`.trim(), 'data-window-body': '', tabindex: '-1' }, [o.body])]),
        o.status
          ? h('div', { class: 'status-bar' }, [...o.status.map((s) => h('p', { class: 'status-bar-field' }, s)), h('span', { class: 'grip ico ico-grip', 'data-resize': 'se', 'aria-hidden': 'true' })])
          : null,
      ]),
    ],
  );
  return wm.open(el, {});
}

/** A row of tabs over panels, as in Windows property sheets. */
export function tabs(names: string[], panels: HTMLElement[]) {
  const list = h(
    'menu',
    { role: 'tablist', class: 'prop-tabs' },
    names.map((n, i) => h('li', { role: 'tab', 'aria-selected': String(i === 0) }, h('a', { href: '#' }, n))),
  );
  const holder = h('div', { class: 'window prop-panel', role: 'tabpanel' }, panels);
  const show = (i: number) => {
    panels.forEach((p, j) => (p.hidden = j !== i));
    list.querySelectorAll('li').forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
  };
  list.querySelectorAll('a').forEach((a, i) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      show(i);
    }),
  );
  show(0);
  return [list, holder] as const;
}
