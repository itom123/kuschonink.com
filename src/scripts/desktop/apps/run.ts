// Start ▸ Run…: type the name of a project, a room, a page or a program (or
// an address), in English or Chinese, and Xiangyin 98 opens it. Remembers
// what was typed.
import { addressToPath, cleanPath } from '../../../lib/apps';
import { commands } from '../commands';
import { desktopData, type DesktopData } from '../data';
import { msgbox, openDialog } from '../dialogs';
import { navigate } from '../router';
import { h, normText, stored, type Text } from '../util';
import { W } from '../words';
import * as wm from '../wm';

const typed = stored<string[]>('kus98:run', []);

type Action = { cmd: string } | { url: string } | { external: string } | { denied: Text };

// Names in English and Chinese, compared after normText (lower case).
const ALIASES: [string[], Action][] = [
  [['control', 'control panel', 'settings', '控制面板', '设置'], { cmd: 'control-panel' }],
  [['display', 'wallpaper', 'display properties', '显示', '墙纸', '显示属性'], { cmd: 'display-properties' }],
  [['mouse', '鼠标'], { cmd: 'mouse-properties' }],
  [['sound', 'sounds', '声音'], { cmd: 'sounds-properties' }],
  [['folder options', '文件夹选项'], { cmd: 'folder-options' }],
  [['my computer', 'mycomputer', 'computer', '我的电脑', '电脑'], { cmd: 'mycomputer' }],
  [['c:', 'c:\\', 'c:/'], { cmd: 'drive-c' }],
  [['a:', 'a:\\', 'a:/'], { cmd: 'drive-a' }],
  [['d:', 'd:\\', 'd:/'], { cmd: 'drive-d' }],
  [['recycle bin', 'recycle', 'bin', 'trash', '回收站'], { cmd: 'recycle-bin' }],
  [['find', 'search', '查找', '搜索'], { cmd: 'find' }],
  [['screen saver', 'screensaver', '屏幕保护程序', '屏保'], { cmd: 'saver-now' }],
  [['ver', 'about xiangyin 98', 'xiangyin 98', '关于 xiangyin 98'], { cmd: 'about-k98' }],
  [['log off', 'logoff', '注销'], { cmd: 'logoff' }],
  [['shut down', 'shutdown', '关闭系统', '关机'], { cmd: 'shutdown' }],
  [['welcome', 'home', 'start', '欢迎', '主页', '开始'], { url: '/' }],
  [['help', 'help topics', '?', '帮助', '帮助主题'], { url: '/help' }],
  [['about', 'about.doc', 'biography', 'bio', 'cv', '关于', '关于.doc', '简历', '简介'], { url: '/about' }],
  [['contact', 'mail', 'email', 'e-mail', 'new message', 'write', '联系', '邮件', '电子邮件', '新邮件', '写信'], { url: '/contact' }],
  [['paint', 'mspaint', 'pbrush', 'paint.exe', 'draw', 'drawing', 'sketch', '画图', '绘图', '画画', '画'], { url: '/paint' }],
  [['guide', 'guides', 'field guide', 'fieldguide', '导览'], { url: '/guides' }],
  [['house', 'the house', 'facade', 'house.exe', '房子', '立面'], { url: '/house/facade' }],
  [['floorplan', 'floor plan', 'plan', 'map', '平面图', '地图'], { url: '/house' }],
  [['projects', 'project', 'image', 'images', 'work', 'works', 'explorer', 'portfolio', '作品', '图像'], { url: '/image' }],
  [['all', 'all projects', '全部', '全部作品'], { url: '/image/all' }],
  [['index', '索引'], { url: '/house/appendix/index' }],
  [['chronology', '年表'], { url: '/house/appendix/chronology' }],
  [['checklist', '清单', '章节清单'], { url: '/house/appendix/checklist' }],
  [['rules', 'rules of the house', '规则', '房子的规则'], { url: '/house/appendix/rules' }],
];

/** Suggestions under the box, in the language showing. */
const SUGGEST: { en: string; zh: string }[] = [
  { en: 'hanabi', zh: '花火' },
  { en: 'house', zh: '房子' },
  { en: 'floorplan', zh: '平面图' },
  { en: 'about', zh: '关于' },
  { en: 'contact', zh: '联系' },
  { en: 'help', zh: '帮助' },
  { en: 'control', zh: '控制面板' },
  { en: 'find', zh: '查找' },
];

const STATIC = new Set(['/', '/image', '/image/all', '/about', '/contact', '/paint', '/help', '/guides', '/house', '/house/facade', '/house/appendix/index', '/house/appendix/chronology', '/house/appendix/checklist', '/house/appendix/rules']);

const norm = normText;

function resolve(raw: string, d: DesktopData | null): Action | null {
  const text = raw.trim();
  const q = norm(text);
  if (!q) return null;
  for (const [names, action] of ALIASES) if (names.includes(q)) return action;
  if (q === 'instagram' || q === 'insta') return { external: d?.site.instagram ?? 'https://www.instagram.com/kuschonink' };

  // Addresses: C:\xiangyin\…, kuschonink.com/…, /…, or the wider Internet.
  if (/^([a-z]:\\|\/|(https?:\/\/)?(www\.)?kuschonink\.com)/i.test(text)) {
    const p = addressToPath(text);
    if (!p) return null;
    const path = cleanPath(p.split(/[?#]/)[0]);
    const known = STATIC.has(path) || path.startsWith('/house/drawer/') || /^\/guides\/[a-z0-9-]+$/.test(path) || !!d?.projects.some((x) => x.url === path) || !!d?.rooms.some((r) => r.url === path);
    if (!known) return null;
    const room = d?.rooms.find((r) => r.url === path);
    return room?.locked ? { denied: { en: room.en, zh: room.zh } } : { url: p };
  }
  if (/^(https?:\/\/|www\.)[^\s]+\.[^\s]+$/i.test(text)) return { external: /^www\./i.test(text) ? `https://${text}` : text };
  if (!d) return null;

  // Names: projects, rooms, pages, Help topics.
  const named: { keys: string[]; action: Action }[] = [
    ...d.projects.map((p) => ({ keys: [p.slug, p.title, p.titleZh], action: { url: p.url } as Action })),
    ...d.rooms.map((r) => ({ keys: [r.slug, r.en, r.zh, r.title, r.titleZh], action: (r.locked ? { denied: { en: r.en, zh: r.zh } } : { url: r.url }) as Action })),
    ...d.pages.map((p) => ({ keys: [p.title, p.titleZh], action: { url: p.url } as Action })),
    ...d.help.map((t) => ({ keys: [t.title, t.titleZh], action: { url: t.url } as Action })),
  ];
  const exact = named.find((n) => n.keys.some((k) => k && norm(k) === q));
  if (exact) return exact.action;
  // Three letters, or two Chinese characters, are enough to find a unique name.
  if (q.length >= 3 || (q.length >= 2 && /[\u3400-\u9fff]/.test(q))) {
    const starts = named.filter((n) => n.keys.some((k) => k && norm(k).startsWith(q)));
    const unique = [...new Map(starts.map((n) => [JSON.stringify(n.action), n.action])).values()];
    if (unique.length === 1) return unique[0];
  }
  return null;
}

function remember(text: string) {
  typed.set([text, ...typed.get().filter((t) => t !== text)].slice(0, 12));
}

export function runDialog() {
  const existing = wm.find('run');
  if (existing) {
    wm.focus(existing);
    existing.el.querySelector<HTMLInputElement>('input')?.select();
    return;
  }
  desktopData().catch(() => {});
  const listId = 'k98-run-list';
  const history = typed.get();
  const suggestions: Text[] = [...history, ...SUGGEST.filter((s) => !history.includes(s.en) && !history.includes(s.zh))];
  const input = h('input', {
    type: 'text',
    id: 'k98-run-input',
    list: listId,
    autocomplete: 'off',
    spellcheck: 'false',
    autocapitalize: 'off',
    value: history[0] ?? '',
    'aria-describedby': 'k98-run-text',
    'data-help': {
      en: 'Type a name, then press Enter. Try a project (hanabi), a room (kitchen), or a program (house, about, contact, help, control).',
      zh: '键入名称，然后按 Enter 键。可以试试一件作品（花火）、一个房间（厨房）或一个程序（房子、关于、联系、帮助、控制面板）。',
    },
  });
  const ok = h('button', { type: 'submit', class: 'default', 'data-help': { en: 'Opens what you typed.', zh: '打开你键入的内容。' } }, W.ok);
  const cancel = h('button', { type: 'button', 'data-help': { en: 'Closes this dialog box.', zh: '关闭这个对话框。' } }, W.cancel);
  const browse = h('button', { type: 'button', 'data-help': { en: 'Shows everything on this computer, so you can pick from it.', zh: '显示这台电脑上的所有内容，让你从中挑选。' } }, { en: 'Browse...', zh: '浏览...' });
  const form = h('form', { class: 'run-body', autocomplete: 'off' }, [
    h('div', { class: 'run-row' }, [
      h('span', { class: 'ico ico-run', 'aria-hidden': 'true' }),
      h('p', { id: 'k98-run-text' }, {
        en: 'Type the name of a program, folder, document, or Internet resource, and Xiangyin 98 will open it for you.',
        zh: '请键入程序、文件夹、文档或 Internet 资源的名称，Xiangyin 98 将为你打开它。',
      }),
    ]),
    h('div', { class: 'run-open' }, [h('label', { for: 'k98-run-input' }, { en: 'Open:', zh: '打开：' }), input, h('datalist', { id: listId }, suggestions.map((v) => h('option', { value: v })))]),
    h('div', { class: 'run-buttons' }, [ok, cancel, browse]),
  ]);
  const win = openDialog({ title: { en: 'Run', zh: '运行' }, icon: 'run', body: form, app: 'run' });
  const sync = () => (ok.disabled = !input.value.trim());
  input.addEventListener('input', sync);
  sync();
  cancel.addEventListener('click', () => wm.close(win));
  browse.addEventListener('click', () => commands.run('drive-c'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    let d: DesktopData | null = null;
    try {
      d = await desktopData();
    } catch { /* offline: names of programs still work */ }
    const action = resolve(text, d);
    if (!action) {
      await msgbox({
        title: text,
        icon: 'error',
        text: {
          en: `Cannot find the file '${text}' (or one of its components). Make sure the path and filename are correct, then try again.\n\nTry the name of a project (hanabi), a room (kitchen), or a program (house, about, contact, help).`,
          zh: `找不到文件“${text}”（或它的某一组件）。请确定路径和文件名是否正确，然后再试一次。\n\n可以试试一件作品的名称（花火）、一个房间（厨房）或一个程序（房子、关于、联系、帮助）。`,
        },
        owner: win.el,
      });
      input.select();
      return;
    }
    remember(text);
    wm.close(win);
    if ('cmd' in action) commands.run(action.cmd);
    else if ('url' in action) navigate(action.url, { source: 'keyboard' });
    else if ('external' in action) window.open(action.external, '_blank', 'noopener');
    else msgbox({ title: action.denied, icon: 'error', text: W.noDoor });
  });
  input.focus();
  input.select();
}
