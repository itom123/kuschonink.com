// What's This?: click the ? in a dialog's title bar, then click any control
// for a yellow note saying what it does. F1 on a control in a dialog shows
// the same note. Esc cancels. Notes come from data-help attributes.
import { commands } from './commands';
import { hideTip } from './tooltips';
import { h, html } from './util';

const NONE = 'No Help topic is associated with this item.';

/** What a control does, in a sentence or two. */
export function explain(el: Element): string {
  const own = el.closest<HTMLElement>('[data-help]')?.dataset.help;
  if (own) return own;
  const btn = el.closest('button');
  if (btn?.classList.contains('tb-close')) return 'Closes this window.';
  if (btn?.classList.contains('tb-help')) return 'Click this, then click any part of the dialog box to find out what it does.';
  const label = (btn?.textContent ?? '').trim();
  if (label === 'OK') return 'Closes this dialog box and keeps any changes you have made.';
  if (label === 'Cancel') return 'Closes this dialog box without keeping any changes.';
  if (label === 'Yes' || label === 'No') return `Answers the question with “${label}”.`;
  if (el.closest('.title-bar')) return 'The title bar shows the name of the window. Drag it to move the window.';
  if (el.closest('.status-bar')) return 'The status bar tells you what you are looking at and what you can do next.';
  return NONE;
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
  if (text === NONE) return false;
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
