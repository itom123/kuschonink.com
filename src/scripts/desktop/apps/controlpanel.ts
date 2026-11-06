// Control Panel, with Mouse and Sounds properties (more items are registered
// by other modules through addControlPanelItem).
import { POINTER_LABELS } from '../pointerlabels';
import { appWindow, tabs } from '../appwindow';
import { commands } from '../commands';
import { openDialog } from '../dialogs';
import { bindIconGroup } from '../icons';
import { settings, type Settings } from '../settings';
import { play, type SoundName } from '../sound';
import { h } from '../util';
import * as wm from '../wm';

interface Item { cmd: string; label: string; icon: string; tip: string }
const items: Item[] = [
  { cmd: 'mouse-properties', label: 'Mouse', icon: 'mouse', tip: 'Pointer trails, pointers and double-click speed.' },
  { cmd: 'sounds-properties', label: 'Sounds', icon: 'speaker', tip: 'Turn sounds on or off, set the volume.' },
];

export function addControlPanelItem(item: Item) {
  if (!items.some((i) => i.cmd === item.cmd)) items.unshift(item);
}

export function controlPanel() {
  const list = h(
    'ul',
    { class: 'folder-view', 'aria-label': 'Control Panel' },
    [...items]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((i) =>
        h('li', {}, [
          h('button', { type: 'button', class: 'icon', 'data-open': i.cmd, 'data-tip': i.tip, 'data-type': 'Control Panel item' }, [
            h('span', { class: `ico ico-${i.icon}`, 'aria-hidden': 'true' }),
            h('span', { class: 'icon-label' }, i.label),
          ]),
        ]),
      ),
  );
  const win = appWindow({
    app: 'controlpanel',
    title: 'Control Panel',
    icon: 'control',
    w: 520,
    h: 360,
    body: list,
    address: 'Control Panel',
    status: [`${items.length} object(s)`, 'Double-click an item to change its settings.'],
  });
  bindIconGroup(list);
  return win;
}

/** OK / Cancel / Apply under a property sheet; Cancel puts the settings back. */
function sheetButtons(win: () => wm.Win, before: Partial<Settings>) {
  const ok = h('button', { type: 'button', class: 'default' }, 'OK');
  const cancel = h('button', { type: 'button' }, 'Cancel');
  const apply = h('button', { type: 'button' }, 'Apply');
  ok.addEventListener('click', () => wm.close(win()));
  cancel.addEventListener('click', () => {
    settings.set(before);
    wm.close(win());
  });
  apply.addEventListener('click', () => apply.blur());
  return h('div', { class: 'prop-buttons' }, [ok, cancel, apply]);
}

function check(id: string, label: string, on: boolean, change: (v: boolean) => void) {
  const input = h('input', { type: 'checkbox', id, checked: on ? '' : undefined });
  input.addEventListener('change', () => change(input.checked));
  return h('div', { class: 'field-row' }, [input, h('label', { for: id }, label)]);
}

function slider(id: string, label: string, [lo, hi]: [string, string], value: number, min: number, max: number, step: number, change: (v: number) => void) {
  const input = h('input', { type: 'range', id, min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
  input.addEventListener('input', () => change(Number(input.value)));
  return h('div', { class: 'field-row slider-row' }, [h('label', { for: id }, lo), input, h('span', {}, hi)]);
}

export function mouseProperties() {
  const s = settings.get();
  const before: Partial<Settings> = { trails: s.trails, trailLength: s.trailLength, dblClickMs: s.dblClickMs, pointers: s.pointers };
  let win!: wm.Win;

  // Buttons: double-click speed, with a folder to test it on.
  const test = h('button', { type: 'button', class: 'dbl-test', 'aria-label': 'Test area: double-click the folder' }, h('span', { class: 'ico ico-folder', 'aria-hidden': 'true' }));
  let last = 0;
  test.addEventListener('click', () => {
    const now = performance.now();
    if (now - last < settings.get().dblClickMs) {
      const ico = test.querySelector('.ico')!;
      ico.classList.toggle('ico-folder');
      ico.classList.toggle('ico-folder-open');
      last = 0;
    } else last = now;
  });
  const speed = (ms: number) => Math.round(((900 - ms) / 700) * 10);
  const buttons = h('div', { class: 'prop-page' }, [
    h('fieldset', {}, [
      h('legend', {}, 'Double-click speed'),
      slider('k98-dbl', 'Double-click speed', ['Slow', 'Fast'], speed(s.dblClickMs), 0, 10, 1, (v) => settings.set({ dblClickMs: Math.round(900 - (v / 10) * 700) })),
      h('div', { class: 'dbl-row' }, [h('span', {}, 'Test area:'), test]),
    ]),
  ]);

  // Pointers: scheme and preview.
  const scheme = h('select', { id: 'k98-pointers', 'aria-label': 'Scheme' }, [
    h('option', { value: 'standard' }, 'kuschonink 98 (standard)'),
    h('option', { value: 'large' }, 'kuschonink 98 (large)'),
    h('option', { value: 'system' }, 'This computer’s own pointers'),
  ]);
  scheme.value = s.pointers;
  scheme.addEventListener('change', () => settings.set({ pointers: scheme.value as Settings['pointers'] }));
  const preview = h(
    'ul',
    { class: 'pointer-list' },
    Object.entries(POINTER_LABELS).map(([name, label]) => h('li', {}, [h('span', {}, label), h('span', { class: 'pointer-img', style: `background-image:var(--k98i-${name})` })])),
  );
  const pointers = h('div', { class: 'prop-page' }, [h('div', { class: 'field-row' }, [h('label', { for: 'k98-pointers' }, 'Scheme:'), scheme]), preview]);

  // Motion: pointer trails.
  const motion = h('div', { class: 'prop-page' }, [
    h('fieldset', {}, [
      h('legend', {}, 'Pointer trail'),
      check('k98-trails', 'Show pointer trails', s.trails, (v) => settings.set({ trails: v })),
      slider('k98-trail-len', 'Trail length', ['Short', 'Long'], s.trailLength, 2, 8, 1, (v) => settings.set({ trailLength: v })),
      h('p', { class: 'prop-note' }, 'Trails are always off on touch screens and when your device asks for reduced motion.'),
    ]),
  ]);

  const [tabList, holder] = tabs(['Buttons', 'Pointers', 'Motion'], [buttons, pointers, motion]);
  const body = h('div', { class: 'prop-sheet wide' }, [tabList, holder, sheetButtons(() => win, before)]);
  win = openDialog({ title: 'Mouse Properties', icon: 'mouse', body, task: true, help: true, className: 'prop-window' });
}

const EVENTS: [SoundName, string][] = [
  ['startup', 'Start kuschonink 98'],
  ['shutdown', 'Exit kuschonink 98'],
  ['logoff', 'Log off'],
  ['ding', 'Default sound'],
  ['chord', 'Critical stop'],
  ['exclamation', 'Exclamation'],
  ['click', 'Start navigation'],
  ['recycle', 'Empty Recycle Bin'],
];

export function soundsProperties() {
  const s = settings.get();
  const before: Partial<Settings> = { sound: s.sound, volume: s.volume, navClick: s.navClick };
  let win!: wm.Win;
  const events = h('select', { size: '6', class: 'sound-events', 'aria-label': 'Events' }, EVENTS.map(([v, l]) => h('option', { value: v }, l)));
  events.value = 'startup';
  const previewBtn = h('button', { type: 'button' }, '▶ Preview');
  previewBtn.addEventListener('click', () => play(events.value));
  events.addEventListener('dblclick', () => play(events.value));
  const page = h('div', { class: 'prop-page' }, [
    h('fieldset', {}, [
      h('legend', {}, 'Sounds'),
      check('k98-sound', 'Play sounds', s.sound, (v) => settings.set({ sound: v })),
      slider('k98-volume-slider', 'Volume', ['Low', 'High'], Math.round(s.volume * 100), 0, 100, 5, (v) => settings.set({ volume: v / 100 })),
      check('k98-navclick', 'Click when a page opens', s.navClick, (v) => settings.set({ navClick: v })),
    ]),
    h('fieldset', {}, [h('legend', {}, 'Events'), events, h('div', { class: 'field-row', style: 'justify-content:flex-end;margin-top:6px' }, [previewBtn])]),
    h('p', { class: 'prop-note' }, 'The sounds of kuschonink 98 were composed for this site.'),
  ]);
  const [tabList, holder] = tabs(['Sounds'], [page]);
  const body = h('div', { class: 'prop-sheet' }, [tabList, holder, sheetButtons(() => win, before)]);
  win = openDialog({ title: 'Sounds Properties', icon: 'speaker', body, task: true, help: true, className: 'prop-window' });
}

export function initControlPanel() {
  commands.register('control-panel', () => controlPanel());
  commands.register('mouse-properties', () => mouseProperties());
  commands.register('sounds-properties', () => soundsProperties());
}
