// Start ▸ Find ▸ Files or Folders…: look through the projects, the rooms of
// the House, the pages and Help by name (and by what they contain), in
// English and Chinese. Results show the language showing.
import { appWindow } from '../appwindow';
import { desktopData, type DesktopData } from '../data';
import { msgbox } from '../dialogs';
import { navigate } from '../router';
import { settings } from '../settings';
import { h, lang, normText as norm, reducedMotion, setText, type Text } from '../util';
import { W, filesFound } from '../words';
import * as wm from '../wm';

type Scope = 'all' | 'projects' | 'house' | 'help';
interface Hit { name: { en: string; zh: string }; icon: string; folder: Text; type: Text; url: string; text: string; scope: Scope; locked?: boolean }

const bi = (en: string, zh: string | undefined) => ({ en, zh: zh || en });

function catalogue(d: DesktopData): Hit[] {
  return [
    ...d.projects.map((p): Hit => ({
      name: bi(p.title, p.titleZh),
      icon: 'folder',
      folder: 'C:\\xiangyin\\image',
      type: { en: 'Project folder', zh: '作品文件夹' },
      url: p.url,
      text: [p.slug, p.description, p.descriptionZh, p.room?.en, p.room?.zh].join(' '),
      scope: 'projects',
    })),
    ...d.rooms.map((r): Hit => ({
      name: bi(r.zh ? `${r.en} ${r.zh}` : r.en, r.zh),
      icon: r.locked ? 'error' : 'house',
      folder: { en: `The House\\${r.floor}`, zh: `房子\\${r.floorZh || r.floor}` },
      type: r.locked ? { en: 'Room (no door)', zh: '房间（没有门）' } : { en: 'Room', zh: '房间' },
      url: r.url,
      text: [r.slug, r.title, r.titleZh, `chapter ${r.chapter}`, `第${r.chapter}章`].join(' '),
      scope: 'house',
      locked: r.locked,
    })),
    ...d.pages.map((p): Hit => ({
      name: bi(p.title, p.titleZh),
      icon: p.icon,
      folder: p.url.startsWith('/house') ? W.theHouse : 'C:\\xiangyin',
      type: bi(p.type, p.typeZh),
      url: p.url,
      text: '',
      scope: p.url.startsWith('/house') ? 'house' : p.url === '/image' || p.url === '/image/all' ? 'projects' : 'all',
    })),
    ...d.help.map((t): Hit => ({
      name: bi(t.title, t.titleZh),
      icon: 'help',
      folder: W.help,
      type: { en: 'Help topic', zh: '帮助主题' },
      url: t.url,
      text: [...t.keywords, ...t.keywordsZh].join(' '),
      scope: 'help',
    })),
  ];
}

const CJK = /[\u3400-\u9fff]/;

function search(all: Hit[], named: string, containing: string, scope: Scope) {
  const q = norm(named);
  const t = norm(containing);
  const l = lang();
  const has = (x: Hit, s: string) => norm(x.name.en).includes(s) || norm(x.name.zh).includes(s);
  // Chinese is written without spaces: look for it anywhere; English words by their start.
  const inText = (x: Hit) => (CJK.test(q) ? norm(x.text).includes(q) : norm(x.text).split(' ').some((w) => w.startsWith(q)));
  const first = (x: Hit) => Number(!norm(x.name[l]).startsWith(q));
  return all
    .filter((x) => scope === 'all' || x.scope === scope)
    .filter((x) => !q || has(x, q) || inText(x))
    .filter((x) => !t || has(x, t) || norm(x.text).includes(t))
    .sort((a, b) => first(a) - first(b) || a.name[l].localeCompare(b.name[l], l === 'zh' ? 'zh-CN' : 'en'));
}

function openHit(row: HTMLElement) {
  if (row.dataset.locked) {
    msgbox({ title: { en: row.dataset.name ?? '', zh: row.dataset.nameZh }, icon: 'error', text: W.noDoor, owner: row });
    return;
  }
  navigate(row.dataset.url!, { source: 'pointer' });
}

export function findWindow(initial = '') {
  const existing = wm.find('find');
  if (existing) {
    wm.focus(existing);
    const input = existing.el.querySelector<HTMLInputElement>('#k98-find-named')!;
    if (initial) input.value = initial;
    input.select();
    return existing;
  }
  const named = h('input', {
    type: 'text',
    id: 'k98-find-named',
    value: initial,
    autocomplete: 'off',
    spellcheck: 'false',
    'data-help': {
      en: 'Type all or part of a name: a project, a room, a page or a Help topic. Leave it empty to list everything.',
      zh: '键入名称的全部或一部分：一件作品、一个房间、一个网页或一个帮助主题。留空则列出所有内容。',
    },
  });
  const containing = h('input', { type: 'text', id: 'k98-find-text', autocomplete: 'off', 'data-help': { en: 'Find only things whose description contains these words.', zh: '只查找说明中含有这些文字的项目。' } });
  const look = h('select', { id: 'k98-find-in', 'data-help': { en: 'Where to look.', zh: '在哪里查找。' } }, [
    h('option', { value: 'all' }, 'xiangyin (C:)'),
    h('option', { value: 'projects' }, W.projects),
    h('option', { value: 'house' }, W.theHouse),
    h('option', { value: 'help' }, W.help),
  ]);
  const findNow = h('button', { type: 'submit', class: 'default', 'data-help': { en: 'Starts the search.', zh: '开始搜索。' } }, { en: 'Find Now', zh: '开始查找' });
  const stop = h('button', { type: 'button', disabled: '', 'data-help': { en: 'Stops the search.', zh: '停止搜索。' } }, { en: 'Stop', zh: '停止' });
  const fresh = h('button', { type: 'button', 'data-help': { en: 'Clears the boxes and the results, to start again.', zh: '清除方框和结果，重新开始。' } }, { en: 'New Search', zh: '新搜索' });
  const anim = h('span', { class: 'ico ico-find find-anim', 'aria-hidden': 'true' });
  const form = h('form', { class: 'find-form', autocomplete: 'off', role: 'search' }, [
    h('div', { class: 'find-fields' }, [
      h('label', { for: 'k98-find-named' }, { en: 'Named:', zh: '名称：' }),
      named,
      h('label', { for: 'k98-find-text' }, { en: 'Containing text:', zh: '包含文字：' }),
      containing,
      h('label', { for: 'k98-find-in' }, { en: 'Look in:', zh: '搜索：' }),
      look,
    ]),
    h('div', { class: 'find-actions' }, [findNow, stop, fresh, anim]),
  ]);
  const tbody = h('tbody');
  const table = h('table', { class: 'find-results', 'aria-label': { en: 'Search results', zh: '搜索结果' } }, [
    h('thead', {}, h('tr', {}, [h('th', { scope: 'col' }, { en: 'Name', zh: '名称' }), h('th', { scope: 'col' }, { en: 'In Folder', zh: '所在文件夹' }), h('th', { scope: 'col' }, { en: 'Type', zh: '类型' })])),
    tbody,
  ]);
  const READY = { en: 'Type a name, then click Find Now.', zh: '键入名称，然后单击“开始查找”。' };
  const win = appWindow({
    app: 'find',
    title: { en: 'Find: All Files', zh: '查找: 所有文件' },
    icon: 'find',
    w: 600,
    h: 440,
    body: table,
    toolbar: form,
    bodyClass: 'find-body',
    status: [READY, ''],
  });
  const [status, hint] = win.el.querySelectorAll<HTMLElement>('.status-bar-field');
  let timer = 0;

  const select = (tr: HTMLElement) => {
    tbody.querySelectorAll('tr.highlighted').forEach((r) => r.classList.remove('highlighted'));
    tr.classList.add('highlighted');
    tr.focus({ preventScroll: false });
  };
  const run = async () => {
    clearTimeout(timer);
    setText(status, { en: 'Searching…', zh: '正在搜索…' });
    stop.disabled = false;
    if (!reducedMotion.matches) anim.classList.add('searching');
    let d: DesktopData;
    try {
      d = await desktopData();
    } catch {
      setText(status, { en: 'Could not search: the computer is offline.', zh: '无法搜索：这台电脑处于脱机状态。' });
      stop.disabled = true;
      anim.classList.remove('searching');
      return;
    }
    timer = window.setTimeout(() => {
      const hits = search(catalogue(d), named.value, containing.value, look.value as Scope);
      tbody.replaceChildren(
        ...hits.map((x) =>
          h('tr', { tabindex: '0', 'data-url': x.url, 'data-name': x.name.en, 'data-name-zh': x.name.zh, 'data-locked': x.locked ? '' : undefined }, [
            h('td', {}, h('span', { class: 'find-name' }, [h('span', { class: `ico ico16 ico-${x.icon}`, 'aria-hidden': 'true' }), x.name])),
            h('td', {}, x.folder),
            h('td', {}, x.type),
          ]),
        ),
      );
      setText(status, filesFound(hits.length));
      setText(hint, hits.length ? { en: 'Double-click a result to open it.', zh: '双击一个结果即可打开它。' } : { en: 'Try fewer letters, or look in xiangyin (C:).', zh: '试试少键入几个字，或者在 xiangyin (C:) 中查找。' });
      stop.disabled = true;
      anim.classList.remove('searching');
    }, 300);
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run();
  });
  stop.addEventListener('click', () => {
    clearTimeout(timer);
    stop.disabled = true;
    anim.classList.remove('searching');
    setText(status, { en: 'Search stopped.', zh: '搜索已停止。' });
  });
  fresh.addEventListener('click', () => {
    named.value = '';
    containing.value = '';
    look.value = 'all';
    tbody.replaceChildren();
    setText(status, READY);
    setText(hint, '');
    named.focus();
  });
  tbody.addEventListener('click', (e) => {
    const tr = (e.target as Element).closest<HTMLElement>('tr[data-url]');
    if (!tr) return;
    select(tr);
    if (settings.get().clickStyle === 'single' || (e as PointerEvent).pointerType === 'touch') openHit(tr);
  });
  tbody.addEventListener('dblclick', (e) => {
    const tr = (e.target as Element).closest<HTMLElement>('tr[data-url]');
    if (tr) openHit(tr);
  });
  tbody.addEventListener('keydown', (e) => {
    const tr = (e.target as Element).closest<HTMLElement>('tr[data-url]');
    if (!tr) return;
    if (e.key === 'Enter') openHit(tr);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling) as HTMLElement | null;
      if (next) select(next);
    }
  });
  named.focus();
  if (initial) run();
  return win;
}
