// Windows for programs that live only in the browser (Control Panel, My
// Computer, the Recycle Bin…): the same chrome as Window.astro, one each.
import { h, type Text } from './util';
import { W } from './words';
import * as wm from './wm';

export interface AppWindowOpts {
  app: string;
  title: Text;
  icon: string;
  w: number;
  h: number;
  body: Node;
  status?: Text[];
  address?: Text;
  toolbar?: Node;
  className?: string;
  bodyClass?: string;
  /** A pane on the left (Web View). */
  side?: Node;
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
          h('button', { type: 'button', class: 'tb-btn tb-min', 'data-cmd': 'minimize', 'aria-label': W.minimize, title: W.minimize }),
          h('button', { type: 'button', class: 'tb-btn tb-max', 'data-cmd': 'maximize', 'aria-label': W.maximize, title: W.maximize }),
          h('button', { type: 'button', class: 'tb-btn tb-close', 'data-cmd': 'close', 'aria-label': W.close, title: W.close }),
        ]),
      ]),
      h('div', { class: 'window-inner', 'data-window-inner': '' }, [
        o.toolbar ?? null,
        o.address
          ? h('div', { class: 'addressbar' }, [
              h('label', {}, [h('span', { 'data-l': 'en' }, ['A', h('u', {}, 'd'), 'dress']), h('span', { 'data-l': 'zh', lang: 'zh-Hans' }, ['地址(', h('u', {}, 'D'), ')'])]),
              h('div', { class: 'address-field' }, [h('span', { class: `ico ico16 ico-${o.icon}`, 'aria-hidden': 'true' }), h('input', { type: 'text', value: o.address, readonly: '', 'aria-label': W.address })]),
            ])
          : null,
        h('div', { class: 'window-main' }, [
          o.side ? h('aside', { class: 'window-side' }, [o.side]) : null,
          h('div', { class: `wbody ${o.bodyClass ?? ''}`.trim(), 'data-window-body': '', tabindex: '-1' }, [o.body]),
        ]),
        o.status
          ? h('div', { class: 'status-bar' }, [...o.status.map((s) => h('p', { class: 'status-bar-field' }, s)), h('span', { class: 'grip ico ico-grip', 'data-resize': 'se', 'aria-hidden': 'true' })])
          : null,
      ]),
    ],
  );
  return wm.open(el, {});
}

/** A row of tabs over panels, as in Windows property sheets. */
export function tabs(names: Text[], panels: HTMLElement[], o: { start?: number; onShow?: (i: number) => void } = {}) {
  const list = h(
    'menu',
    { role: 'tablist', class: 'prop-tabs' },
    names.map((n, i) => h('li', { role: 'tab', 'aria-selected': String(i === 0), 'data-help': { en: 'Click a tab to see another page of settings.', zh: '单击选项卡可以查看另一页设置。' } }, h('a', { href: '#' }, n))),
  );
  const holder = h('div', { class: 'window prop-panel', role: 'tabpanel' }, panels);
  const show = (i: number) => {
    panels.forEach((p, j) => (p.hidden = j !== i));
    list.querySelectorAll('li').forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    o.onShow?.(i);
  };
  list.querySelectorAll('a').forEach((a, i) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      show(i);
    }),
  );
  show(o.start ?? 0);
  return [list, holder] as const;
}
