// Start ▸ Run…: type the name of a project, a room, a page or a program (or
// an address) and Xiangyin 98 opens it. Remembers what was typed.
import { addressToPath, cleanPath } from '../../../lib/apps';
import { commands } from '../commands';
import { desktopData, type DesktopData } from '../data';
import { msgbox, openDialog } from '../dialogs';
import { navigate } from '../router';
import { h, normText, stored } from '../util';
import * as wm from '../wm';

const typed = stored<string[]>('kus98:run', []);

type Action = { cmd: string } | { url: string } | { external: string } | { denied: string };

const ALIASES: [string[], Action][] = [
  [['control', 'control panel', 'settings'], { cmd: 'control-panel' }],
  [['display', 'wallpaper', 'display properties'], { cmd: 'display-properties' }],
  [['mouse'], { cmd: 'mouse-properties' }],
  [['sound', 'sounds'], { cmd: 'sounds-properties' }],
  [['folder options'], { cmd: 'folder-options' }],
  [['my computer', 'mycomputer', 'computer'], { cmd: 'mycomputer' }],
  [['c:', 'c:\\', 'c:/'], { cmd: 'drive-c' }],
  [['a:', 'a:\\', 'a:/'], { cmd: 'drive-a' }],
  [['d:', 'd:\\', 'd:/'], { cmd: 'drive-d' }],
  [['recycle bin', 'recycle', 'bin', 'trash'], { cmd: 'recycle-bin' }],
  [['find', 'search'], { cmd: 'find' }],
  [['screen saver', 'screensaver'], { cmd: 'saver-now' }],
  [['ver', 'about Xiangyin 98', 'Xiangyin 98'], { cmd: 'about-k98' }],
  [['log off', 'logoff'], { cmd: 'logoff' }],
  [['shut down', 'shutdown'], { cmd: 'shutdown' }],
  [['welcome', 'home', 'start'], { url: '/' }],
  [['help', 'help topics', '?'], { url: '/help' }],
  [['about', 'about.doc', 'biography', 'bio', 'cv'], { url: '/about' }],
  [['contact', 'mail', 'email', 'e-mail', 'new message', 'write'], { url: '/contact' }],
  [['house', 'the house', 'facade', 'house.exe'], { url: '/house/facade' }],
  [['floorplan', 'floor plan', 'plan', 'map'], { url: '/house' }],
  [['projects', 'project', 'image', 'images', 'work', 'works', 'explorer', 'portfolio'], { url: '/image' }],
  [['all', 'all projects'], { url: '/image/all' }],
  [['index'], { url: '/house/appendix/index' }],
  [['chronology'], { url: '/house/appendix/chronology' }],
  [['checklist'], { url: '/house/appendix/checklist' }],
  [['rules', 'rules of the house'], { url: '/house/appendix/rules' }],
];

const STATIC = new Set(['/', '/image', '/image/all', '/about', '/contact', '/help', '/house', '/house/facade', '/house/appendix/index', '/house/appendix/chronology', '/house/appendix/checklist', '/house/appendix/rules']);

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
    const known = STATIC.has(path) || path.startsWith('/house/drawer/') || !!d?.projects.some((x) => x.url === path) || !!d?.rooms.some((r) => r.url === path);
    if (!known) return null;
    const room = d?.rooms.find((r) => r.url === path);
    return room?.locked ? { denied: room.en } : { url: p };
  }
  if (/^(https?:\/\/|www\.)[^\s]+\.[^\s]+$/i.test(text)) return { external: /^www\./i.test(text) ? `https://${text}` : text };
  if (!d) return null;

  // Names: projects, rooms, pages, Help topics.
  const named: { keys: string[]; action: Action }[] = [
    ...d.projects.map((p) => ({ keys: [p.slug, p.title], action: { url: p.url } as Action })),
    ...d.rooms.map((r) => ({ keys: [r.slug, r.en, r.zh, r.title], action: (r.locked ? { denied: r.en } : { url: r.url }) as Action })),
    ...d.pages.map((p) => ({ keys: [p.title], action: { url: p.url } as Action })),
    ...d.help.map((t) => ({ keys: [t.title], action: { url: t.url } as Action })),
  ];
  const exact = named.find((n) => n.keys.some((k) => k && norm(k) === q));
  if (exact) return exact.action;
  if (q.length >= 3) {
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
  const suggestions = [...new Set([...typed.get(), 'hanabi', 'house', 'floorplan', 'about', 'contact', 'help', 'control', 'find'])];
  const input = h('input', { type: 'text', id: 'k98-run-input', list: listId, autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', value: typed.get()[0] ?? '', 'aria-describedby': 'k98-run-text', 'data-help': 'Type a name, then press Enter. Try a project (hanabi), a room (kitchen), or a program (house, about, contact, help, control).' });
  const ok = h('button', { type: 'submit', class: 'default', 'data-help': 'Opens what you typed.' }, 'OK');
  const cancel = h('button', { type: 'button', 'data-help': 'Closes this dialog box.' }, 'Cancel');
  const browse = h('button', { type: 'button', 'data-help': 'Shows everything on this computer, so you can pick from it.' }, 'Browse...');
  const form = h('form', { class: 'run-body', autocomplete: 'off' }, [
    h('div', { class: 'run-row' }, [
      h('span', { class: 'ico ico-run', 'aria-hidden': 'true' }),
      h('p', { id: 'k98-run-text' }, 'Type the name of a program, folder, document, or Internet resource, and Xiangyin 98 will open it for you.'),
    ]),
    h('div', { class: 'run-open' }, [h('label', { for: 'k98-run-input' }, 'Open:'), input, h('datalist', { id: listId }, suggestions.map((v) => h('option', { value: v })))]),
    h('div', { class: 'run-buttons' }, [ok, cancel, browse]),
  ]);
  const win = openDialog({ title: 'Run', icon: 'run', body: form, app: 'run' });
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
        text: `Cannot find the file '${text}' (or one of its components). Make sure the path and filename are correct, then try again.\n\nTry the name of a project (hanabi), a room (kitchen), or a program (house, about, contact, help).`,
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
    else msgbox({ title: action.denied, icon: 'error', text: 'This room has no door. Access is denied.' });
  });
  input.focus();
  input.select();
}
