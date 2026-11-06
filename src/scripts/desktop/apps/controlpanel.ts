// Control Panel, with Mouse and Sounds properties (loaded the first time one
// opens). Display and Folder Options live in display.ts.
import { POINTER_LABELS } from '../pointerlabels';
import { appWindow, tabs } from '../appwindow';
import { openDialog } from '../dialogs';
import { bindIconGroup } from '../icons';
import { settings, type Settings } from '../settings';
import { play, type SoundName } from '../sound';
import { h, type Text } from '../util';
import { W, objects } from '../words';
import type * as wm from '../wm';
import { check, dropdown, sheetButtons, slider } from './propsheet';

interface Item { cmd: string; label: Text; icon: string; tip: Text }
const items: Item[] = [
  { cmd: 'display-properties', label: { en: 'Display', zh: '显示' }, icon: 'display', tip: { en: 'Wallpaper, screen saver, colours and window effects.', zh: '墙纸、屏幕保护程序、颜色和窗口效果。' } },
  { cmd: 'folder-options', label: { en: 'Folder Options', zh: '文件夹选项' }, icon: 'folder', tip: { en: 'Open icons with one click or two.', zh: '单击还是双击打开图标。' } },
  { cmd: 'mouse-properties', label: { en: 'Mouse', zh: '鼠标' }, icon: 'mouse', tip: { en: 'Pointer trails, pointers and double-click speed.', zh: '指针轨迹、指针和双击速度。' } },
  { cmd: 'sounds-properties', label: { en: 'Sounds', zh: '声音' }, icon: 'speaker', tip: { en: 'Turn sounds on or off, set the volume.', zh: '打开或关闭声音，设置音量。' } },
];

export function controlPanel() {
  const list = h(
    'ul',
    { class: 'folder-view', 'aria-label': W.controlPanel },
    items.map((i) =>
      h('li', {}, [
        h('button', { type: 'button', class: 'icon', 'data-open': i.cmd, 'data-tip': i.tip, 'data-type': { en: 'Control Panel item', zh: '控制面板项目' } }, [
          h('span', { class: `ico ico-${i.icon}`, 'aria-hidden': 'true' }),
          h('span', { class: 'icon-label' }, i.label),
        ]),
      ]),
    ),
  );
  const win = appWindow({
    app: 'controlpanel',
    title: W.controlPanel,
    icon: 'control',
    w: 520,
    h: 360,
    body: list,
    address: W.controlPanel,
    status: [objects(items.length), { en: 'Double-click an item to change its settings.', zh: '双击一个项目可以更改它的设置。' }],
  });
  bindIconGroup(list);
  return win;
}

export function mouseProperties() {
  const s = settings.get();
  const before: Partial<Settings> = { trails: s.trails, trailLength: s.trailLength, dblClickMs: s.dblClickMs, pointers: s.pointers };
  let win!: wm.Win;

  // Buttons: double-click speed, with a folder to test it on.
  const test = h('button', { type: 'button', class: 'dbl-test', 'aria-label': { en: 'Test area: double-click the folder', zh: '测试区域：双击这个文件夹' }, 'data-help': { en: 'Double-click this folder to test the speed. If it opens, the computer understood your double-click.', zh: '双击这个文件夹来测试速度。如果它打开了，说明计算机识别出了你的双击。' } }, h('span', { class: 'ico ico-folder', 'aria-hidden': 'true' }));
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
      h('legend', {}, { en: 'Double-click speed', zh: '双击速度' }),
      slider('k98-dbl', { en: 'Double-click speed', zh: '双击速度' }, [{ en: 'Slow', zh: '慢' }, { en: 'Fast', zh: '快' }], speed(s.dblClickMs), [0, 10, 1], (v) => settings.set({ dblClickMs: Math.round(900 - (v / 10) * 700) }), { en: 'How quickly two clicks must follow each other to count as a double-click. Move it towards Slow if double-clicking is hard.', zh: '两次单击要多快才算作一次双击。如果双击有困难，请把它移向“慢”。' }),
      h('div', { class: 'dbl-row' }, [h('span', {}, { en: 'Test area:', zh: '测试区域：' }), test]),
    ]),
  ]);

  // Pointers: scheme and preview.
  const scheme = dropdown<Settings['pointers']>(
    'k98-pointers',
    { en: 'Scheme:', zh: '方案：' },
    [
      ['standard', { en: 'Xiangyin 98 (standard)', zh: 'Xiangyin 98（标准）' }],
      ['large', { en: 'Xiangyin 98 (large)', zh: 'Xiangyin 98（大）' }],
      ['system', { en: 'This computer’s own pointers', zh: '这台电脑自己的指针' }],
    ],
    s.pointers,
    (v) => settings.set({ pointers: v }),
    { en: 'Chooses how the mouse pointer looks. The large pointers are twice the size and easier to see.', zh: '选择鼠标指针的样子。大指针是两倍大小，更容易看清。' },
  );
  const preview = h(
    'ul',
    { class: 'pointer-list', 'data-help': { en: 'The pointers in this scheme, and when each one appears.', zh: '这个方案中的指针，以及每个指针出现的时候。' } },
    Object.entries(POINTER_LABELS).map(([name, label]) => h('li', {}, [h('span', {}, label), h('span', { class: 'pointer-img', style: `background-image:var(--k98i-${name})` })])),
  );
  const pointers = h('div', { class: 'prop-page' }, [scheme, preview]);

  // Motion: pointer trails.
  const motion = h('div', { class: 'prop-page' }, [
    h('fieldset', {}, [
      h('legend', {}, { en: 'Pointer trail', zh: '指针轨迹' }),
      check('k98-trails', { en: 'Show pointer trails', zh: '显示指针轨迹' }, s.trails, (v) => settings.set({ trails: v }), { en: 'Ghost pointers follow the mouse, so it is easier to see where it is.', zh: '一串淡淡的指针跟着鼠标，更容易看到它在哪里。' }),
      slider('k98-trail-len', { en: 'Trail length', zh: '轨迹长度' }, [{ en: 'Short', zh: '短' }, { en: 'Long', zh: '长' }], s.trailLength, [2, 8, 1], (v) => settings.set({ trailLength: v }), { en: 'How many ghost pointers follow the mouse.', zh: '有多少个淡淡的指针跟着鼠标。' }),
      h('p', { class: 'prop-note' }, { en: 'Trails are always off on touch screens and when your device asks for reduced motion.', zh: '在触摸屏上，或者设备要求减少动态效果时，轨迹总是关闭的。' }),
    ]),
  ]);

  const [tabList, holder] = tabs([{ en: 'Buttons', zh: '按钮' }, { en: 'Pointers', zh: '指针' }, { en: 'Motion', zh: '移动' }], [buttons, pointers, motion]);
  const body = h('div', { class: 'prop-sheet wide' }, [tabList, holder, sheetButtons(() => win, before)]);
  win = openDialog({ title: { en: 'Mouse Properties', zh: '鼠标 属性' }, icon: 'mouse', body, task: true, help: true, className: 'prop-window' });
}

const EVENTS: [SoundName, Text][] = [
  ['startup', { en: 'Start Xiangyin 98', zh: '启动 Xiangyin 98' }],
  ['shutdown', { en: 'Exit Xiangyin 98', zh: '退出 Xiangyin 98' }],
  ['logoff', { en: 'Log off', zh: '注销' }],
  ['ding', { en: 'Default sound', zh: '默认声音' }],
  ['chord', { en: 'Critical stop', zh: '严重错误' }],
  ['exclamation', { en: 'Exclamation', zh: '感叹号' }],
  ['click', { en: 'Start navigation', zh: '开始导航' }],
  ['recycle', { en: 'Empty Recycle Bin', zh: '清空回收站' }],
];

export function soundsProperties() {
  const s = settings.get();
  const before: Partial<Settings> = { sound: s.sound, volume: s.volume, navClick: s.navClick };
  let win!: wm.Win;
  const events = h('select', { size: '6', class: 'sound-events', 'aria-label': { en: 'Events', zh: '事件' }, 'data-help': { en: 'The moments that make a sound. Double-click one to hear it.', zh: '会发出声音的时刻。双击一个就能听到。' } }, EVENTS.map(([v, l]) => h('option', { value: v }, l)));
  events.value = 'startup';
  const previewBtn = h('button', { type: 'button', 'data-help': { en: 'Plays the sound of the event selected in the list.', zh: '播放列表中选定事件的声音。' } }, { en: '▶ Preview', zh: '▶ 预览' });
  previewBtn.addEventListener('click', () => play(events.value));
  events.addEventListener('dblclick', () => play(events.value));
  const page = h('div', { class: 'prop-page' }, [
    h('fieldset', {}, [
      h('legend', {}, { en: 'Sounds', zh: '声音' }),
      check('k98-sound', { en: 'Play sounds', zh: '播放声音' }, s.sound, (v) => settings.set({ sound: v }), { en: 'Turns all the sounds of Xiangyin 98 on or off. The speaker next to the clock does the same.', zh: '打开或关闭 Xiangyin 98 的所有声音。时钟旁边的喇叭也能做到。' }),
      slider('k98-volume-slider', { en: 'Volume', zh: '音量' }, [{ en: 'Low', zh: '低' }, { en: 'High', zh: '高' }], Math.round(s.volume * 100), [0, 100, 5], (v) => settings.set({ volume: v / 100 }), { en: 'How loud the sounds are.', zh: '声音有多响。' }),
      check('k98-navclick', { en: 'Click when a page opens', zh: '打开网页时发出咔嗒声' }, s.navClick, (v) => settings.set({ navClick: v }), { en: 'A soft click each time a window opens a page.', zh: '每次窗口打开网页时，轻轻咔嗒一声。' }),
    ]),
    h('fieldset', {}, [h('legend', {}, { en: 'Events', zh: '事件' }), events, h('div', { class: 'field-row', style: 'justify-content:flex-end;margin-top:6px' }, [previewBtn])]),
    h('p', { class: 'prop-note' }, { en: 'The sounds of Xiangyin 98 were composed for this site.', zh: 'Xiangyin 98 的声音是为这个网站创作的。' }),
  ]);
  const [tabList, holder] = tabs([{ en: 'Sounds', zh: '声音' }], [page]);
  const body = h('div', { class: 'prop-sheet' }, [tabList, holder, sheetButtons(() => win, before)]);
  win = openDialog({ title: { en: 'Sounds Properties', zh: '声音 属性' }, icon: 'speaker', body, task: true, help: true, className: 'prop-window' });
}
