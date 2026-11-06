// Building blocks for property sheets (Mouse, Sounds, Display, Folder
// Options): OK / Cancel / Apply, check boxes, sliders, radio buttons, lists.
// Changes show at once; Cancel puts them back, Apply keeps them.
// `help` is what What's This? says about a control.
import { settings, type Settings } from '../settings';
import { h } from '../util';
import * as wm from '../wm';

export function sheetButtons(win: () => wm.Win, before: Partial<Settings>) {
  const keys = Object.keys(before) as (keyof Settings)[];
  const ok = h('button', { type: 'button', class: 'default', 'data-help': 'Closes this dialog box and keeps any changes you have made.' }, 'OK');
  const cancel = h('button', { type: 'button', 'data-help': 'Closes this dialog box and puts back the settings as they were.' }, 'Cancel');
  const apply = h('button', { type: 'button', disabled: '', 'data-help': 'Keeps the changes you have made without closing this dialog box.' }, 'Apply');
  ok.addEventListener('click', () => wm.close(win()));
  cancel.addEventListener('click', () => {
    settings.set(before);
    wm.close(win());
  });
  apply.addEventListener('click', () => {
    const now = settings.get();
    for (const k of keys) (before as Record<string, unknown>)[k] = now[k];
    apply.disabled = true;
    ok.focus();
  });
  const off = settings.on((_s, changed) => {
    if (!apply.isConnected) return void off();
    if (keys.some((k) => k in changed)) apply.disabled = false;
  });
  return h('div', { class: 'prop-buttons' }, [ok, cancel, apply]);
}

export function check(id: string, label: string, on: boolean, change: (v: boolean) => void, help?: string) {
  const input = h('input', { type: 'checkbox', id, checked: on ? '' : undefined });
  input.addEventListener('change', () => change(input.checked));
  return h('div', { class: 'field-row', 'data-help': help }, [input, h('label', { for: id }, label)]);
}

export function slider(
  id: string,
  label: string,
  [lo, hi]: [string, string],
  value: number,
  [min, max, step]: [number, number, number],
  change: (v: number) => void,
  help?: string,
) {
  const input = h('input', { type: 'range', id, min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
  input.addEventListener('input', () => change(Number(input.value)));
  return h('div', { class: 'field-row slider-row', 'data-help': help }, [h('label', { for: id }, lo), input, h('span', {}, hi)]);
}

/** A group of radio buttons: [value, label, help?]. */
export function radios<T extends string>(name: string, options: [T, string, string?][], value: T, change: (v: T) => void) {
  return options.map(([v, label, help], i) => {
    const id = `${name}-${i}`;
    const input = h('input', { type: 'radio', id, name, value: v, checked: v === value ? '' : undefined });
    input.addEventListener('change', () => input.checked && change(v));
    return h('div', { class: 'field-row', 'data-help': help }, [input, h('label', { for: id }, label)]);
  });
}

/** A drop-down list with its label. */
export function dropdown<T extends string>(id: string, label: string, options: [T, string][], value: T, change: (v: T) => void, help?: string) {
  const select = h('select', { id }, options.map(([v, l]) => h('option', { value: v }, l)));
  select.value = value;
  select.addEventListener('change', () => change(select.value as T));
  return h('div', { class: 'field-row', 'data-help': help }, [h('label', { for: id }, label), select]);
}

/** The little monitor at the top of Display Properties; `screen` is what it shows. */
export function monitor(screen: HTMLElement) {
  screen.classList.add('mon-screen');
  return h('div', { class: 'monitor', 'aria-hidden': 'true' }, [h('div', { class: 'mon-case' }, [screen, h('span', { class: 'mon-led' })]), h('div', { class: 'mon-neck' }), h('div', { class: 'mon-foot' })]);
}
