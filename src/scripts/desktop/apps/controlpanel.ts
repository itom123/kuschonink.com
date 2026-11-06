// Control Panel, with Mouse and Sounds properties (loaded the first time one
// opens). Display and Folder Options live in display.ts.
import { POINTER_LABELS } from '../pointerlabels';
import { appWindow, tabs } from '../appwindow';
import { openDialog } from '../dialogs';
import { bindIconGroup } from '../icons';
import { settings, type Settings } from '../settings';
import { play, type SoundName } from '../sound';
import { h } from '../util';
import type * as wm from '../wm';
import { check, dropdown, sheetButtons, slider } from './propsheet';

interface Item { cmd: string; label: string; icon: string; tip: string }
const items: Item[] = [
  { cmd: 'display-properties', label: 'Display', icon: 'display', tip: 'Wallpaper, screen saver, colours and window effects.' },
  { cmd: 'folder-options', label: 'Folder Options', icon: 'folder', tip: 'Open icons with one click or two.' },
  { cmd: 'mouse-properties', label: 'Mouse', icon: 'mouse', tip: 'Pointer trails, pointers and double-click speed.' },
  { cmd: 'sounds-properties', label: 'Sounds', icon: 'speaker', tip: 'Turn sounds on or off, set the volume.' },
];

export function controlPanel() {
  const list = h(
    'ul',
    { class: 'folder-view', 'aria-label': 'Control Panel' },
    items.map((i) =>
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

export function mouseProperties() {
  const s = settings.get();
  const before: Partial<Settings> = { trails: s.trails, trailLength: s.trailLength, dblClickMs: s.dblClickMs, pointers: s.pointers };
  let win!: wm.Win;

  // Buttons: double-click speed, with a folder to test it on.
  const test = h('button', { type: 'button', class: 'dbl-test', 'aria-label': 'Test area: double-click the folder', 'data-help': 'Double-click this folder to test the speed. If it opens, the computer understood your double-click.' }, h('span', { class: 'ico ico-folder', 'aria-hidden': 'true' }));
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
      slider('k98-dbl', 'Double-click speed', ['Slow', 'Fast'], speed(s.dblClickMs), [0, 10, 1], (v) => settings.set({ dblClickMs: Math.round(900 - (v / 10) * 700) }), 'How quickly two clicks must follow each other to count as a double-click. Move it towards Slow if double-clicking is hard.'),
      h('div', { class: 'dbl-row' }, [h('span', {}, 'Test area:'), test]),
    ]),
  ]);

  // Pointers: scheme and preview.
  const scheme = dropdown<Settings['pointers']>(
    'k98-pointers',
    'Scheme:',
    [['standard', 'Xiangyin 98 (standard)'], ['large', 'Xiangyin 98 (large)'], ['system', 'This computer’s own pointers']],
    s.pointers,
    (v) => settings.set({ pointers: v }),
    'Chooses how the mouse pointer looks. The large pointers are twice the size and easier to see.',
  );
  const preview = h(
    'ul',
    { class: 'pointer-list', 'data-help': 'The pointers in this scheme, and when each one appears.' },
    Object.entries(POINTER_LABELS).map(([name, label]) => h('li', {}, [h('span', {}, label), h('span', { class: 'pointer-img', style: `background-image:var(--k98i-${name})` })])),
  );
  const pointers = h('div', { class: 'prop-page' }, [scheme, preview]);

  // Motion: pointer trails.
  const motion = h('div', { class: 'prop-page' }, [
    h('fieldset', {}, [
      h('legend', {}, 'Pointer trail'),
      check('k98-trails', 'Show pointer trails', s.trails, (v) => settings.set({ trails: v }), 'Ghost pointers follow the mouse, so it is easier to see where it is.'),
      slider('k98-trail-len', 'Trail length', ['Short', 'Long'], s.trailLength, [2, 8, 1], (v) => settings.set({ trailLength: v }), 'How many ghost pointers follow the mouse.'),
      h('p', { class: 'prop-note' }, 'Trails are always off on touch screens and when your device asks for reduced motion.'),
    ]),
  ]);

  const [tabList, holder] = tabs(['Buttons', 'Pointers', 'Motion'], [buttons, pointers, motion]);
  const body = h('div', { class: 'prop-sheet wide' }, [tabList, holder, sheetButtons(() => win, before)]);
  win = openDialog({ title: 'Mouse Properties', icon: 'mouse', body, task: true, help: true, className: 'prop-window' });
}

const EVENTS: [SoundName, string][] = [
  ['startup', 'Start Xiangyin 98'],
  ['shutdown', 'Exit Xiangyin 98'],
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
  const events = h('select', { size: '6', class: 'sound-events', 'aria-label': 'Events', 'data-help': 'The moments that make a sound. Double-click one to hear it.' }, EVENTS.map(([v, l]) => h('option', { value: v }, l)));
  events.value = 'startup';
  const previewBtn = h('button', { type: 'button', 'data-help': 'Plays the sound of the event selected in the list.' }, '▶ Preview');
  previewBtn.addEventListener('click', () => play(events.value));
  events.addEventListener('dblclick', () => play(events.value));
  const page = h('div', { class: 'prop-page' }, [
    h('fieldset', {}, [
      h('legend', {}, 'Sounds'),
      check('k98-sound', 'Play sounds', s.sound, (v) => settings.set({ sound: v }), 'Turns all the sounds of Xiangyin 98 on or off. The speaker next to the clock does the same.'),
      slider('k98-volume-slider', 'Volume', ['Low', 'High'], Math.round(s.volume * 100), [0, 100, 5], (v) => settings.set({ volume: v / 100 }), 'How loud the sounds are.'),
      check('k98-navclick', 'Click when a page opens', s.navClick, (v) => settings.set({ navClick: v }), 'A soft click each time a window opens a page.'),
    ]),
    h('fieldset', {}, [h('legend', {}, 'Events'), events, h('div', { class: 'field-row', style: 'justify-content:flex-end;margin-top:6px' }, [previewBtn])]),
    h('p', { class: 'prop-note' }, 'The sounds of Xiangyin 98 were composed for this site.'),
  ]);
  const [tabList, holder] = tabs(['Sounds'], [page]);
  const body = h('div', { class: 'prop-sheet' }, [tabList, holder, sheetButtons(() => win, before)]);
  win = openDialog({ title: 'Sounds Properties', icon: 'speaker', body, task: true, help: true, className: 'prop-window' });
}
