// Help ▸ About kuschonink 98.
import { openDialog } from './dialogs';
import { session } from './session';
import * as wm from './wm';
import { h } from './util';

export function aboutBox() {
  const ok = h('button', { type: 'button', class: 'default' }, 'OK');
  const body = h('div', { class: 'about-box' }, [
    h('div', { class: 'about-logo' }, [h('span', { class: 'ico ico-start', 'aria-hidden': 'true' }), h('div', {}, [h('b', {}, 'kuschonink'), ' 98'])]),
    h('div', { class: 'about-text' }, [
      h('p', {}, 'kuschonink 98'),
      h('p', {}, 'Version 4.10.1998, Second Edition'),
      h('p', {}, 'The website of Xiangyin Gu, set out as a computer.'),
      h('div', { class: 'prop-sep', role: 'separator' }),
      h('p', {}, ['This product is licensed to:', h('br'), h('b', {}, session.user() || 'Guest')]),
      h('p', { class: 'about-small' }, 'Icons, pointers and sounds were drawn and composed for this site. Window chrome after 98.css by Jordan Scales (MIT). Built with Astro.'),
      h('p', { class: 'about-small' }, 'Physical memory available to kuschonink 98: all of it.'),
    ]),
    h('div', { class: 'msg-buttons' }, [ok]),
  ]);
  const win = openDialog({ title: 'About kuschonink 98', icon: 'start', body, modal: true });
  ok.addEventListener('click', () => wm.close(win));
  ok.focus();
}
