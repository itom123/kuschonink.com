// What's This?: click the ? in a dialog's title bar, then click any control
// for a yellow note saying what it does. F1 on a control in a dialog shows
// the same note. Esc cancels. Notes come from data-help attributes.
import { commands } from './commands';
import { hideTip } from './tooltips';
import { h, html, lang, tr } from './util';

/** Said when a control has no note of its own. */
const NONE = { en: 'No Help topic is associated with this item.', zh: '此项没有相关的帮助主题。' };

/** What a control does, in a sentence or two, in the language showing. */
export function explain(el: Element): string {
  const own = el.closest<HTMLElement>('[data-help]');
  if (own) return (lang() === 'zh' && own.dataset.helpZh) || own.dataset.help || '';
  const btn = el.closest<HTMLElement>('button');
  if (btn?.classList.contains('tb-close')) return tr({ en: 'Closes this window.', zh: '关闭这个窗口。' });
  if (btn?.classList.contains('tb-help')) return tr({ en: 'Click this, then click any part of the dialog box to find out what it does.', zh: '单击这里，然后单击对话框的任何部分，就能知道它是做什么的。' });
  // Message box buttons carry their English name in data-btn.
  const id = btn?.dataset.btn ?? (btn?.textContent ?? '').trim();
  if (id === 'OK') return tr({ en: 'Closes this dialog box and keeps any changes you have made.', zh: '关闭这个对话框，并保留你所做的更改。' });
  if (id === 'Cancel') return tr({ en: 'Closes this dialog box without keeping any changes.', zh: '关闭这个对话框，不保留任何更改。' });
  if (id === 'Yes' || id === 'No') return tr({ en: `Answers the question with “${id}”.`, zh: `用“${id === 'Yes' ? '是' : '否'}”回答这个问题。` });
  if (el.closest('.title-bar')) return tr({ en: 'The title bar shows the name of the window. Drag it to move the window.', zh: '标题栏显示窗口的名称。拖动它可以移动窗口。' });
  if (el.closest('.status-bar')) return tr({ en: 'The status bar tells you what you are looking at and what you can do next.', zh: '状态栏告诉你正在看什么，以及接下来可以做什么。' });
  return tr(NONE);
}

let note: HTMLElement | null = null;

export function closeNote() {
  note?.remove();
  note = null;
  removeEventListener('pointerdown', dismiss, true);
  removeEventListener('keydown', dismiss, true);
}

/** The click or key that closes a note does nothing else (as in Windows 98). */
function dismiss(e: Event) {
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.type === 'pointerdown') {
    const eat = (ev: Event) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    };
    addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', eat, true), 800);
  }
  closeNote();
}

/** Show a What's This? note at a point. */
export function showNote(text: string, x: number, y: number) {
  closeNote();
  hideTip();
  note = h('div', { class: 'tooltip whats-this', role: 'note' }, text);
  document.body.appendChild(note);
  const r = note.getBoundingClientRect();
  note.style.left = `${Math.max(4, Math.min(x, innerWidth - r.width - 4))}px`;
  note.style.top = `${y + r.height > innerHeight - 4 ? Math.max(4, y - r.height - 20) : y}px`;
  const live = document.getElementById('k98-announcer');
  if (live) live.textContent = text;
  // Any click or key closes it.
  setTimeout(() => {
    if (!note) return;
    addEventListener('pointerdown', dismiss, true);
    addEventListener('keydown', dismiss, true);
  });
}

/** F1 on a control inside a dialog: explain it. Returns false when there's nothing to say. */
export function explainFocused(el: Element) {
  const text = explain(el);
  if (text === tr(NONE)) return false;
  const r = el.getBoundingClientRect();
  showNote(text, r.left + 8, r.bottom + 4);
  return true;
}

function helpMode() {
  if (html.hasAttribute('data-help-mode')) return;
  closeNote();
  hideTip();
  html.setAttribute('data-help-mode', '');
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const done = () => {
    html.removeAttribute('data-help-mode');
    removeEventListener('pointerdown', onDown, true);
    removeEventListener('keydown', onKey, true);
    removeEventListener('contextmenu', swallow, true);
  };
  const onDown = (e: PointerEvent) => {
    swallow(e);
    done();
    addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', swallow, true), 800);
    const t = e.target as Element;
    if (t.closest('.tb-help')) return;
    showNote(explain(t), e.clientX + 2, e.clientY + 14);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      swallow(e);
      done();
    }
  };
  // Wait for the click that pressed "?" to finish.
  setTimeout(() => {
    addEventListener('pointerdown', onDown, true);
    addEventListener('keydown', onKey, true);
    addEventListener('contextmenu', swallow, true);
  });
}

export function initWhatsThis() {
  commands.register('whats-this', () => helpMode());
}
