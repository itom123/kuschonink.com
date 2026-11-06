// Display Properties (Background, Screen Saver, Appearance, Effects) and
// Folder Options. Loaded the first time one of them opens.
import { tabs } from '../appwindow';
import { desktopData } from '../data';
import { msgbox, openDialog } from '../dialogs';
import { startSaver } from '../screensaver';
import { settings, type Settings } from '../settings';
import { h, type Text } from '../util';
import { W } from '../words';
import type * as wm from '../wm';
import { check, dropdown, monitor, radios, sheetButtons } from './propsheet';
import { restoreDefaultDesktop } from './recycle';
import { render, SAVERS } from './savers';

const SCHEMES: [Settings['scheme'], Text][] = [
  ['standard', { en: 'Xiangyin 98 (standard)', zh: 'Xiangyin 98（标准）' }],
  ['contrast', { en: 'High Contrast White', zh: '高对比白色' }],
  ['slate', { en: 'Slate', zh: '石板灰' }],
];
const MODES: [Settings['wallpaperMode'], Text][] = [
  ['center', { en: 'Center', zh: '居中' }],
  ['tile', { en: 'Tile', zh: '平铺' }],
  ['stretch', { en: 'Stretch', zh: '拉伸' }],
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
  const list = h('select', { id: 'k98-wallpaper', size: '6', class: 'list-box', 'aria-label': { en: 'Wallpaper', zh: '墙纸' } }, [h('option', { value: '' }, { en: '(None)', zh: '(无)' })]);
  const addOption = (value: string, label: Text) => list.append(h('option', { value }, label));
  const current = () => {
    const w = settings.get().wallpaper;
    if (w && ![...list.options].some((o) => o.value === w)) addOption(w, { en: 'Photograph (from a project)', zh: '照片（来自一件作品）' });
    list.value = w;
  };
  desktopData()
    .then((d) => {
      for (const w of d.wallpapers) if (![...list.options].some((o) => o.value === w.src)) addOption(w.src, { en: w.name, zh: w.nameZh || w.name });
      current();
    })
    .catch(current);
  current();
  list.addEventListener('change', () => settings.set({ wallpaper: list.value }));
  const mode = dropdown<Settings['wallpaperMode']>('k98-wp-mode', { en: 'Display:', zh: '显示：' }, MODES, s.wallpaperMode, (v) => settings.set({ wallpaperMode: v }), { en: 'Center puts one copy in the middle of the screen, Tile repeats it, Stretch makes it fill the screen.', zh: '“居中”把一张图放在屏幕中间，“平铺”重复它，“拉伸”让它铺满屏幕。' });
  const off = settings.on((_s, c) => {
    if (!screen.isConnected) return void off();
    if ('wallpaper' in c || 'wallpaperMode' in c || 'scheme' in c) showWallpaper(screen);
  });
  requestAnimationFrame(() => showWallpaper(screen));
  return h('div', { class: 'prop-page' }, [
    mon,
    h('div', { class: 'wp-row', 'data-help': { en: 'Choose a picture for the desktop, or (None) for the plain colour. Some of the pictures are the artist’s photographs.', zh: '为桌面选一张图片，或选“(无)”只用纯色。其中一些图片是艺术家的照片。' } }, [
      h('label', { for: 'k98-wallpaper' }, { en: 'Wallpaper', zh: '墙纸' }),
      h('span', { class: 'prop-note' }, { en: 'Select a picture for the desktop:', zh: '为桌面选择一张图片：' }),
      list,
    ]),
    mode,
    h('p', { class: 'prop-note' }, { en: 'Tip: right-click any photograph in a project and choose Set as Wallpaper.', zh: '提示：在作品中右击任意照片，然后选择“设为墙纸”。' }),
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
  const kind = dropdown('k98-saver', { en: 'Screen Saver:', zh: '屏幕保护程序：' }, SAVERS, s.saver, (v) => {
    settings.set({ saver: v });
    preview.disabled = !v;
    mini();
  }, { en: 'The picture that appears when the computer has been left alone for a while. (None) turns it off.', zh: '电脑一段时间没人用时出现的画面。选“(无)”就关闭它。' });
  const wait = h('input', { type: 'number', id: 'k98-saver-wait', min: '1', max: '60', step: '1', value: String(s.saverWait), class: 'num' });
  wait.addEventListener('change', () => {
    const n = Math.round(Math.min(60, Math.max(1, Number(wait.value) || 5)));
    wait.value = String(n);
    settings.set({ saverWait: n });
  });
  const preview = h('button', { type: 'button', disabled: s.saver ? undefined : '', 'data-help': { en: 'Shows the screen saver now. Move the mouse or press a key to stop it.', zh: '现在显示屏幕保护程序。移动鼠标或按任意键即可停止。' } }, { en: 'Preview', zh: '预览' });
  preview.addEventListener('click', () => startSaver(settings.get().saver, true));
  const page = h('div', { class: 'prop-page' }, [
    mon,
    h('fieldset', {}, [
      h('legend', {}, { en: 'Screen Saver', zh: '屏幕保护程序' }),
      kind,
      h('div', { class: 'field-row', 'data-help': { en: 'How many minutes without a click, key or mouse movement before the screen saver starts.', zh: '没有单击、按键或鼠标移动多少分钟后，屏幕保护程序开始。' } }, [
        h('label', { for: 'k98-saver-wait' }, { en: 'Wait:', zh: '等待：' }),
        wait,
        h('span', {}, { en: 'minutes', zh: '分钟' }),
        h('span', { class: 'grow' }),
        preview,
      ]),
    ]),
    h('p', { class: 'prop-note' }, { en: 'The screen saver never starts on touch screens, or while a video is playing.', zh: '在触摸屏上，或正在播放视频时，屏幕保护程序不会启动。' }),
  ]);
  return { page, mini, stop: () => stopMini?.() };
}

function appearancePage(s: Settings) {
  const preview = h('div', { class: 'ap-preview', 'aria-hidden': 'true' }, [
    h('div', { class: 'ap-win ap-back' }, [h('div', { class: 'ap-title inactive' }, { en: 'Inactive Window', zh: '非活动窗口' })]),
    h('div', { class: 'ap-win ap-front' }, [
      h('div', { class: 'ap-title' }, { en: 'Active Window', zh: '活动窗口' }),
      h('div', { class: 'ap-menu' }, [h('span', {}, { en: 'Normal', zh: '正常' }), h('span', { class: 'ap-disabled' }, { en: 'Disabled', zh: '已禁用' }), h('span', { class: 'ap-sel' }, { en: 'Selected', zh: '已选定' })]),
      h('div', { class: 'ap-text' }, { en: 'Window Text', zh: '窗口文字' }),
    ]),
    h('div', { class: 'ap-win ap-msg' }, [h('div', { class: 'ap-title' }, { en: 'Message Box', zh: '消息框' }), h('div', { class: 'ap-msg-body' }, [h('span', {}, { en: 'Message Text', zh: '消息文字' }), h('span', { class: 'ap-ok' }, W.ok)])]),
  ]);
  return h('div', { class: 'prop-page' }, [
    preview,
    dropdown('k98-scheme', { en: 'Scheme:', zh: '方案：' }, SCHEMES, s.scheme, (v) => settings.set({ scheme: v }), { en: 'The colours of windows, menus and the desktop. High Contrast White has black text on white with strong outlines, which some people find easier to read.', zh: '窗口、菜单和桌面的颜色。“高对比白色”是白底黑字加粗轮廓，有些人觉得更容易阅读。' }),
    h('p', { class: 'prop-note' }, { en: 'Tip: High Contrast White (black text on white, with strong outlines) is easier to read. Pages inside windows keep their own colours.', zh: '提示：“高对比白色”（白底黑字，轮廓清晰）更容易阅读。窗口里的网页保留它们自己的颜色。' }),
  ]);
}

function effectsPage(s: Settings, owner: () => wm.Win) {
  const reset = h('button', { type: 'button', 'data-help': { en: 'Brings back icons you sent to the Recycle Bin, and puts every icon back in its first place.', zh: '找回放入回收站的图标，并把每个图标放回原来的位置。' } }, { en: 'Restore Default Desktop', zh: '还原默认桌面' });
  reset.addEventListener('click', async () => {
    const r = await msgbox({
      title: { en: 'Display Properties', zh: '显示 属性' },
      icon: 'question',
      text: { en: 'Put every desktop icon back where it started, including any icons in the Recycle Bin?', zh: '把每个桌面图标都放回原来的位置，包括回收站里的图标吗？' },
      buttons: ['Yes', 'No'],
      owner: owner().el,
    });
    if (r === 'Yes') restoreDefaultDesktop();
  });
  return h('div', { class: 'prop-page' }, [
    h('fieldset', {}, [
      h('legend', {}, { en: 'Visual effects', zh: '视觉效果' }),
      check('k98-dragfull', { en: 'Show window contents while dragging', zh: '拖动时显示窗口内容' }, s.dragFull, (v) => settings.set({ dragFull: v }), { en: 'When this is off, a dotted outline follows the mouse while you move a window, as in 1998. When it is on, the whole window moves.', zh: '关闭时，移动窗口只有一个虚线框跟着鼠标，就像1998年那样。打开时，整个窗口一起移动。' }),
      check('k98-maxall', { en: 'Always maximize windows', zh: '总是最大化窗口' }, s.alwaysMax, (v) => settings.set({ alwaysMax: v }), { en: 'Every window fills the screen, one at a time. Good if overlapping windows are confusing. Switch between windows with the taskbar.', zh: '每个窗口都铺满屏幕，一次一个。如果重叠的窗口让人困惑，这样更好。用任务栏在窗口之间切换。' }),
    ]),
    h('fieldset', {}, [
      h('legend', {}, { en: 'Desktop icons', zh: '桌面图标' }),
      h('p', { class: 'prop-note' }, { en: 'Deleted or moved an icon by mistake? This puts the desktop back the way it was.', zh: '误删或移动了图标？这会把桌面恢复原样。' }),
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
    [{ en: 'Background', zh: '背景' }, { en: 'Screen Saver', zh: '屏幕保护程序' }, { en: 'Appearance', zh: '外观' }, { en: 'Effects', zh: '效果' }],
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
  win = openDialog({ title: { en: 'Display Properties', zh: '显示 属性' }, icon: 'display', body, task: true, help: true, className: 'prop-window', onClose: saver.stop });
}

export function folderOptions() {
  const s = settings.get();
  const before: Partial<Settings> = { clickStyle: s.clickStyle };
  let win!: wm.Win;
  const page = h('div', { class: 'prop-page' }, [
    h('div', { class: 'fo-art', 'aria-hidden': 'true' }, [h('span', { class: 'ico ico-folder' }), h('span', { class: 'ico ico-folder-open' })]),
    h('fieldset', {}, [
      h('legend', {}, { en: 'Click items as follows', zh: '按如下方式单击项目' }),
      ...radios<Settings['clickStyle']>(
        'k98-click',
        [
          ['double', { en: 'Double-click to open an item (single-click to select)', zh: '双击打开项目（单击选定）' }, { en: 'Classic style, as in 1998: click once to select an icon, twice to open it.', zh: '传统风格，就像1998年那样：单击选定图标，双击打开它。' }],
          ['single', { en: 'Single-click to open an item (as on the Web)', zh: '单击打开项目（像在网页上一样）' }, { en: 'Web style: one click opens an icon, like a link. Icon names are underlined when you point at them.', zh: 'Web 风格：单击就像点链接一样打开图标。指向图标时，它的名称会加下划线。' }],
        ],
        s.clickStyle,
        (v) => settings.set({ clickStyle: v }),
      ),
    ]),
    h('p', { class: 'prop-note' }, { en: 'On a touch screen, one tap always opens an item.', zh: '在触摸屏上，轻点一下总是打开项目。' }),
  ]);
  const [tabList, holder] = tabs([W.general], [page]);
  const body = h('div', { class: 'prop-sheet wide' }, [tabList, holder, sheetButtons(() => win, before)]);
  win = openDialog({ title: { en: 'Folder Options', zh: '文件夹选项' }, icon: 'folder', body, task: true, help: true, className: 'prop-window' });
}
