// Dialog windows and Windows 98 message boxes.
import * as wm from './wm';
import { play, type SoundName } from './sound';
import { h, type Text } from './util';
import { W, button } from './words';

export interface DialogOpts {
  title: Text;
  /** Title bar icon. */
  icon?: string;
  body: Node;
  /** Block only this element's window (window-modal). */
  owner?: Element | null;
  /** Block the whole desktop (when there's no owner). */
  modal?: boolean;
  className?: string;
  /** Fixed size; otherwise the dialog fits its content. */
  w?: number;
  h?: number;
  resizable?: boolean;
  /** Show a taskbar button. */
  task?: boolean;
  /** "?" button in the title bar (What's This?). */
  help?: boolean;
  role?: 'dialog' | 'alertdialog';
  app?: string;
  onClose?: () => void;
}

let uid = 0;

/** Build a dialog window and put it on the desktop. */
export function openDialog(o: DialogOpts): wm.Win {
  const titleId = `dlg-${++uid}`;
  const el = h(
    'section',
    {
      class: ['window', 'app-window', 'v-dialog', o.className, o.w ? '' : 'auto-size', o.resizable ? '' : 'no-resize'].filter(Boolean).join(' '),
      'data-window': '',
      'data-app': o.app ?? 'dialog',
      'data-icon': o.icon ?? 'info',
      role: o.role ?? 'dialog',
      'aria-modal': o.owner || o.modal ? 'true' : undefined,
      'aria-labelledby': titleId,
      style: o.w ? `--w:${o.w}px;--h:${o.h ?? 320}px` : undefined,
    },
    [
      h('div', { class: 'title-bar', 'data-drag': '' }, [
        h('div', { class: 'title-bar-text' }, [
          o.icon ? h('span', { class: `ico ico16 ico-${o.icon} title-ico`, 'aria-hidden': 'true' }) : null,
          h('span', { class: 'title-text', id: titleId, 'data-title': '' }, o.title),
        ]),
        h('div', { class: 'title-bar-controls' }, [
          o.help ? h('button', { type: 'button', class: 'tb-btn tb-help', 'data-cmd': 'whats-this', 'aria-label': W.help, title: W.whatsThis }) : null,
          h('button', { type: 'button', class: 'tb-btn tb-close', 'data-cmd': 'close', 'aria-label': W.close, title: W.close }),
        ]),
      ]),
      h('div', { class: 'window-inner', 'data-window-inner': '' }, [o.body]),
    ],
  );
  const owner = o.owner ? wm.byEl(o.owner) : undefined;
  return wm.open(el, {
    dialog: true,
    owner,
    global: !owner && !!o.modal,
    task: o.task ?? false,
    center: true,
    onClose: o.onClose,
  });
}

export interface MsgOpts {
  title?: Text;
  text: Text;
  /** error, warning, info, question, or any other icon name (recycle-full…). */
  icon?: 'error' | 'warning' | 'info' | 'question' | (string & {});
  /** Button names in English ('Yes', 'Retry'…): shown in the language showing, returned as given. */
  buttons?: string[];
  /** Block only this element's window instead of the whole desktop. */
  owner?: Element | null;
  sound?: SoundName | false;
}

/** A message box. Resolves with the button pressed ("Cancel"/last button when closed). */
export function msgbox(o: MsgOpts): Promise<string> {
  const buttons = o.buttons ?? ['OK'];
  return new Promise((resolve) => {
    let result = buttons.includes('Cancel') ? 'Cancel' : buttons[buttons.length - 1];
    const btns = buttons.map((b, i) => h('button', { type: 'button', class: i === 0 ? 'default' : undefined, 'data-btn': b }, button(b)));
    const text = h('p', { class: 'msg-text', id: `msg-${++uid}` }, o.text);
    const body = h('div', { class: 'msgbox' }, [
      h('div', { class: 'msg-row' }, [o.icon ? h('span', { class: `ico ico-${o.icon}`, 'aria-hidden': 'true' }) : null, text]),
      h('div', { class: 'msg-buttons' }, btns),
    ]);
    const win = openDialog({
      title: o.title ?? 'Xiangyin 98',
      icon: o.icon,
      body,
      owner: o.owner,
      modal: true,
      role: 'alertdialog',
      onClose: () => resolve(result),
    });
    win.el.setAttribute('aria-describedby', text.id);
    btns.forEach((b, i) => b.addEventListener('click', () => {
      result = buttons[i];
      wm.close(win);
    }));
    btns[0].focus();
    if (o.sound !== false) play(o.sound ?? (o.icon === 'error' ? 'chord' : o.icon === 'warning' ? 'exclamation' : 'ding'));
  });
}
