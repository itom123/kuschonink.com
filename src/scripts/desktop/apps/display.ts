// Display Properties (Background, Screen Saver, Appearance, Effects) and
// Folder Options. Loaded the first time one of them opens.
import { tabs } from '../appwindow';
import { desktopData } from '../data';
import { msgbox, openDialog } from '../dialogs';
import { startSaver } from '../screensaver';
import { settings, type Settings } from '../settings';
import { h } from '../util';
import type * as wm from '../wm';
import { check, dropdown, monitor, radios, sheetButtons } from './propsheet';
import { restoreDefaultDesktop } from './recycle';
import { render, SAVERS } from './savers';

const SCHEMES: [Settings['scheme'], string][] = [
  ['standard', 'Xiangyin 98 (standard)'],
  ['contrast', 'High Contrast White'],
  ['slate', 'Slate'],
];
const MODES: [Settings['wallpaperMode'], string][] = [
  ['center', 'Center'],
  ['tile', 'Tile'],
  ['stretch', 'Stretch'],
];

const sizes = new Map<string, Promise<[number, number]>>();
function naturalSize(src: string) {
  let p = sizes.get(src);
  if (!p) {
    const img = new Image();
    img.src = src;
    p = img.decode().then(() => [img.naturalWidth, img.naturalHeight] as [number, number]).catch(() => [0, 0] as [number, number]);
    sizes.set(src, p);
  }
  return p;
}

/** The wallpaper on the little monitor, at the same scale as on this screen. */
async function showWallpaper(screen: HTMLElement) {
  const s = settings.get();
  screen.style.background = '';
  if (!s.wallpaper) return;
  const scale = screen.clientWidth / innerWidth;
  const url = `url("${s.wallpaper.replace(/"/g, '%22')}")`;
  if (s.wallpaperMode === 'stretch') {
    screen.style.background = `var(--desktop-bg) ${url} center / cover no-repeat`;
    return;
  }
  const [nw, nh] = await naturalSize(s.wallpaper);
  if (settings.get().wallpaper !== s.wallpaper) return;
  const size = nw ? `${Math.max(2, nw * scale)}px ${Math.max(2, nh * scale)}px` : 'contain';
  screen.style.background = `var(--desktop-bg) ${url} center / ${size} ${s.wallpaperMode === 'tile' ? 'repeat' : 'no-repeat'}`;
}

function backgroundPage(s: Settings) {
  const screen = h('div', { class: 'mon-desktop' });
  const mon = monitor(screen);
  const list = h('select', { id: 'k98-wallpaper', size: '6', class: 'list-box', 'aria-label': 'Wallpaper' }, [h('option', { value: '' }, '(None)')]);
  const addOption = (value: string, label: string) => list.append(h('option', { value }, label));
  const current = () => {
    const w = settings.get().wallpaper;
    if (w && ![...list.options].some((o) => o.value === w)) addOption(w, 'Photograph (from a project)');
    list.value = w;
  };
  desktopData()
    .then((d) => {
      for (const w of d.wallpapers) if (![...list.options].some((o) => o.value === w.src)) addOption(w.src, w.name);
      current();
    })
    .catch(current);
  current();
  list.addEventListener('change', () => settings.set({ wallpaper: list.value }));
  const mode = dropdown<Settings['wallpaperMode']>('k98-wp-mode', 'Display:', MODES, s.wallpaperMode, (v) => settings.set({ wallpaperMode: v }), 'Center puts one copy in the middle of the screen, Tile repeats it, Stretch makes it fill the screen.');
  const off = settings.on((_s, c) => {
    if (!screen.isConnected) return void off();
    if ('wallpaper' in c || 'wallpaperMode' in c || 'scheme' in c) showWallpaper(screen);
  });
  requestAnimationFrame(() => showWallpaper(screen));
  return h('div', { class: 'prop-page' }, [
    mon,
    h('div', { class: 'wp-row', 'data-help': 'Choose a picture for the desktop, or (None) for the plain colour. Some of the pictures are the artist’s photographs.' }, [
      h('label', { for: 'k98-wallpaper' }, 'Wallpaper'),
      h('span', { class: 'prop-note' }, 'Select a picture for the desktop:'),
      list,
    ]),
    mode,
    h('p', { class: 'prop-note' }, 'Tip: right-click any photograph in a project and choose Set as Wallpaper.'),
  ]);
}

function saverPage(s: Settings) {
  const screen = h('div', { class: 'mon-desktop' });
  const mon = monitor(screen);
  let stopMini: (() => void) | null = null;
  const mini = () => {
    stopMini?.();
    stopMini = null;
    const k = settings.get().saver;
    screen.classList.toggle('mon-black', !!k);
    if (k && screen.isConnected && !screen.closest('[hidden]')) stopMini = render(k, screen, { mini: true });
  };
  const kind = dropdown('k98-saver', 'Screen Saver:', SAVERS, s.saver, (v) => {
    settings.set({ saver: v });
    preview.disabled = !v;
    mini();
  }, 'The picture that appears when the computer has been left alone for a while. (None) turns it off.');
  const wait = h('input', { type: 'number', id: 'k98-saver-wait', min: '1', max: '60', step: '1', value: String(s.saverWait), class: 'num' });
  wait.addEventListener('change', () => {
    const n = Math.round(Math.min(60, Math.max(1, Number(wait.value) || 5)));
    wait.value = String(n);
    settings.set({ saverWait: n });
  });
  const preview = h('button', { type: 'button', disabled: s.saver ? undefined : '', 'data-help': 'Shows the screen saver now. Move the mouse or press a key to stop it.' }, 'Preview');
  preview.addEventListener('click', () => startSaver(settings.get().saver, true));
  const page = h('div', { class: 'prop-page' }, [
    mon,
    h('fieldset', {}, [
      h('legend', {}, 'Screen Saver'),
      kind,
      h('div', { class: 'field-row', 'data-help': 'How many minutes without a click, key or mouse movement before the screen saver starts.' }, [
        h('label', { for: 'k98-saver-wait' }, 'Wait:'),
        wait,
        h('span', {}, 'minutes'),
        h('span', { class: 'grow' }),
        preview,
      ]),
    ]),
    h('p', { class: 'prop-note' }, 'The screen saver never starts on touch screens, or while a video is playing.'),
  ]);
  return { page, mini, stop: () => stopMini?.() };
}

function appearancePage(s: Settings) {
  const preview = h('div', { class: 'ap-preview', 'aria-hidden': 'true' }, [
    h('div', { class: 'ap-win ap-back' }, [h('div', { class: 'ap-title inactive' }, 'Inactive Window')]),
    h('div', { class: 'ap-win ap-front' }, [
      h('div', { class: 'ap-title' }, 'Active Window'),
      h('div', { class: 'ap-menu' }, [h('span', {}, 'Normal'), h('span', { class: 'ap-disabled' }, 'Disabled'), h('span', { class: 'ap-sel' }, 'Selected')]),
      h('div', { class: 'ap-text' }, 'Window Text'),
    ]),
    h('div', { class: 'ap-win ap-msg' }, [h('div', { class: 'ap-title' }, 'Message Box'), h('div', { class: 'ap-msg-body' }, [h('span', {}, 'Message Text'), h('span', { class: 'ap-ok' }, 'OK')])]),
  ]);
  return h('div', { class: 'prop-page' }, [
    preview,
    dropdown('k98-scheme', 'Scheme:', SCHEMES, s.scheme, (v) => settings.set({ scheme: v }), 'The colours of windows, menus and the desktop. High Contrast White has black text on white with strong outlines, which some people find easier to read.'),
    h('p', { class: 'prop-note' }, 'Tip: High Contrast White (black text on white, with strong outlines) is easier to read. Pages inside windows keep their own colours.'),
  ]);
}

function effectsPage(s: Settings, owner: () => wm.Win) {
  const reset = h('button', { type: 'button', 'data-help': 'Brings back icons you sent to the Recycle Bin, and puts every icon back in its first place.' }, 'Restore Default Desktop');
  reset.addEventListener('click', async () => {
    const r = await msgbox({
      title: 'Display Properties',
      icon: 'question',
      text: 'Put every desktop icon back where it started, including any icons in the Recycle Bin?',
      buttons: ['Yes', 'No'],
      owner: owner().el,
    });
    if (r === 'Yes') restoreDefaultDesktop();
  });
  return h('div', { class: 'prop-page' }, [
    h('fieldset', {}, [
      h('legend', {}, 'Visual effects'),
      check('k98-dragfull', 'Show window contents while dragging', s.dragFull, (v) => settings.set({ dragFull: v }), 'When this is off, a dotted outline follows the mouse while you move a window, as in 1998. When it is on, the whole window moves.'),
      check('k98-maxall', 'Always maximize windows', s.alwaysMax, (v) => settings.set({ alwaysMax: v }), 'Every window fills the screen, one at a time. Good if overlapping windows are confusing. Switch between windows with the taskbar.'),
    ]),
    h('fieldset', {}, [
      h('legend', {}, 'Desktop icons'),
      h('p', { class: 'prop-note' }, 'Deleted or moved an icon by mistake? This puts the desktop back the way it was.'),
      h('div', { class: 'field-row' }, [reset]),
    ]),
  ]);
}

/** Display Properties; `tab` 0–3 (Background, Screen Saver, Appearance, Effects). */
export function displayProperties(tab = 0) {
  const s = settings.get();
  const before: Partial<Settings> = {
    wallpaper: s.wallpaper,
    wallpaperMode: s.wallpaperMode,
    saver: s.saver,
    saverWait: s.saverWait,
    scheme: s.scheme,
    dragFull: s.dragFull,
    alwaysMax: s.alwaysMax,
  };
  let win!: wm.Win;
  const saver = saverPage(s);
  const [tabList, holder] = tabs(
    ['Background', 'Screen Saver', 'Appearance', 'Effects'],
    [backgroundPage(s), saver.page, appearancePage(s), effectsPage(s, () => win)],
    {
      start: tab,
      onShow: (i) => {
        if (i === 1) requestAnimationFrame(saver.mini);
        else saver.stop();
      },
    },
  );
  const body = h('div', { class: 'prop-sheet wide display-sheet' }, [tabList, holder, sheetButtons(() => win, before)]);
  win = openDialog({ title: 'Display Properties', icon: 'display', body, task: true, help: true, className: 'prop-window', onClose: saver.stop });
}

export function folderOptions() {
  const s = settings.get();
  const before: Partial<Settings> = { clickStyle: s.clickStyle };
  let win!: wm.Win;
  const page = h('div', { class: 'prop-page' }, [
    h('div', { class: 'fo-art', 'aria-hidden': 'true' }, [h('span', { class: 'ico ico-folder' }), h('span', { class: 'ico ico-folder-open' })]),
    h('fieldset', {}, [
      h('legend', {}, 'Click items as follows'),
      ...radios<Settings['clickStyle']>(
        'k98-click',
        [
          ['double', 'Double-click to open an item (single-click to select)', 'Classic style, as in 1998: click once to select an icon, twice to open it.'],
          ['single', 'Single-click to open an item (as on the Web)', 'Web style: one click opens an icon, like a link. Icon names are underlined when you point at them.'],
        ],
        s.clickStyle,
        (v) => settings.set({ clickStyle: v }),
      ),
    ]),
    h('p', { class: 'prop-note' }, 'On a touch screen, one tap always opens an item.'),
  ]);
  const [tabList, holder] = tabs(['General'], [page]);
  const body = h('div', { class: 'prop-sheet wide' }, [tabList, holder, sheetButtons(() => win, before)]);
  win = openDialog({ title: 'Folder Options', icon: 'folder', body, task: true, help: true, className: 'prop-window' });
}
