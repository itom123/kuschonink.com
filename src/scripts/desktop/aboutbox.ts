// Help ▸ About Xiangyin 98.
import { openDialog } from './dialogs';
import { session } from './session';
import * as wm from './wm';
import { h } from './util';
import { W } from './words';

export function aboutBox() {
  const ok = h('button', { type: 'button', class: 'default', 'data-btn': 'OK' }, W.ok);
  const body = h('div', { class: 'about-box' }, [
    h('div', { class: 'about-logo' }, [h('span', { class: 'ico ico-start', 'aria-hidden': 'true' }), h('div', {}, [h('b', {}, 'Xiangyin'), ' 98'])]),
    h('div', { class: 'about-text' }, [
      h('p', {}, 'Xiangyin 98'),
      h('p', {}, { en: 'Version 4.10.1998, Second Edition', zh: '版本 4.10.1998，第二版' }),
      h('p', {}, { en: 'The website of Xiangyin Gu, set out as a computer.', zh: 'Xiangyin Gu 的网站，布置成一台电脑的样子。' }),
      h('div', { class: 'prop-sep', role: 'separator' }),
      h('p', {}, [{ en: 'This product is licensed to:', zh: '本产品的使用权属于：' }, h('br'), h('b', {}, session.user() || 'Guest')]),
      h('p', { class: 'about-small' }, {
        en: 'Icons, pointers and sounds were drawn and composed for this site. Window chrome after 98.css by Jordan Scales (MIT). Built with Astro.',
        zh: '图标、指针和声音都是为这个网站绘制和创作的。窗口外观参照 Jordan Scales 的 98.css（MIT 许可证）。用 Astro 构建。',
      }),
      h('p', { class: 'about-small' }, { en: 'Physical memory available to Xiangyin 98: all of it.', zh: 'Xiangyin 98 可用的物理内存：全部。' }),
    ]),
    h('div', { class: 'msg-buttons' }, [ok]),
  ]);
  const win = openDialog({ title: { en: 'About Xiangyin 98', zh: '关于 Xiangyin 98' }, icon: 'start', body, modal: true });
  ok.addEventListener('click', () => wm.close(win));
  ok.focus();
}
