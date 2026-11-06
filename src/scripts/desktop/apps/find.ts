// Start ▸ Find ▸ Files or Folders…: look through the projects, the rooms of
// the House, the pages and Help by name (and by what they contain).
import { appWindow } from '../appwindow';
import { desktopData, type DesktopData } from '../data';
import { msgbox } from '../dialogs';
import { navigate } from '../router';
import { settings } from '../settings';
import { h, normText as norm, reducedMotion } from '../util';
import * as wm from '../wm';

type Scope = 'all' | 'projects' | 'house' | 'help';
interface Hit { name: string; icon: string; folder: string; type: string; url: string; text: string; scope: Scope; locked?: boolean }

function catalogue(d: DesktopData): Hit[] {
  return [
    ...d.projects.map((p): Hit => ({
      name: p.title,
      icon: 'folder',
      folder: 'C:\\kuschonink\\image',
      type: 'Project folder',
      url: p.url,
      text: [p.slug, p.description, p.room?.en, p.room?.zh].join(' '),
      scope: 'projects',
    })),
    ...d.rooms.map((r): Hit => ({
      name: r.zh ? `${r.en} ${r.zh}` : r.en,
      icon: r.locked ? 'error' : 'house',
      folder: `The House\\${r.floor}`,
      type: r.locked ? 'Room (no door)' : 'Room',
      url: r.url,
      text: [r.slug, r.title, `chapter ${r.chapter}`].join(' '),
      scope: 'house',
      locked: r.locked,
    })),
    ...d.pages.map((p): Hit => ({
      name: p.title,
      icon: p.icon,
      folder: p.url.startsWith('/house') ? 'The House' : 'C:\\kuschonink',
      type: p.type,
      url: p.url,
      text: '',
      scope: p.url.startsWith('/house') ? 'house' : p.url === '/image' || p.url === '/image/all' ? 'projects' : 'all',
    })),
    ...d.help.map((t): Hit => ({ name: t.title, icon: 'help', folder: 'Help', type: 'Help topic', url: t.url, text: t.keywords.join(' '), scope: 'help' })),
  ];
}

function search(all: Hit[], named: string, containing: string, scope: Scope) {
  const q = norm(named);
  const t = norm(containing);
  return all
    .filter((x) => scope === 'all' || x.scope === scope)
    .filter((x) => !q || norm(x.name).includes(q) || norm(x.text).split(' ').some((w) => w.startsWith(q)))
    .filter((x) => !t || norm(`${x.name} ${x.text}`).includes(t))
    .sort((a, b) => Number(!norm(a.name).startsWith(q)) - Number(!norm(b.name).startsWith(q)) || a.name.localeCompare(b.name));
}

function openHit(row: HTMLElement) {
  if (row.dataset.locked) {
    msgbox({ title: row.dataset.name, icon: 'error', text: 'This room has no door. Access is denied.', owner: row });
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
  const named = h('input', { type: 'text', id: 'k98-find-named', value: initial, autocomplete: 'off', spellcheck: 'false', 'data-help': 'Type all or part of a name: a project, a room, a page or a Help topic. Leave it empty to list everything.' });
  const containing = h('input', { type: 'text', id: 'k98-find-text', autocomplete: 'off', 'data-help': 'Find only things whose description contains these words.' });
  const look = h('select', { id: 'k98-find-in', 'data-help': 'Where to look.' }, [
    h('option', { value: 'all' }, 'kuschonink (C:)'),
    h('option', { value: 'projects' }, 'Projects'),
    h('option', { value: 'house' }, 'The House'),
    h('option', { value: 'help' }, 'Help'),
  ]);
  const findNow = h('button', { type: 'submit', class: 'default', 'data-help': 'Starts the search.' }, 'Find Now');
  const stop = h('button', { type: 'button', disabled: '', 'data-help': 'Stops the search.' }, 'Stop');
  const fresh = h('button', { type: 'button', 'data-help': 'Clears the boxes and the results, to start again.' }, 'New Search');
  const anim = h('span', { class: 'ico ico-find find-anim', 'aria-hidden': 'true' });
  const form = h('form', { class: 'find-form', autocomplete: 'off', role: 'search' }, [
    h('div', { class: 'find-fields' }, [
      h('label', { for: 'k98-find-named' }, 'Named:'),
      named,
      h('label', { for: 'k98-find-text' }, 'Containing text:'),
      containing,
      h('label', { for: 'k98-find-in' }, 'Look in:'),
      look,
    ]),
    h('div', { class: 'find-actions' }, [findNow, stop, fresh, anim]),
  ]);
  const tbody = h('tbody');
  const table = h('table', { class: 'find-results', 'aria-label': 'Search results' }, [
    h('thead', {}, h('tr', {}, [h('th', { scope: 'col' }, 'Name'), h('th', { scope: 'col' }, 'In Folder'), h('th', { scope: 'col' }, 'Type')])),
    tbody,
  ]);
  const win = appWindow({
    app: 'find',
    title: 'Find: All Files',
    icon: 'find',
    w: 600,
    h: 440,
    body: table,
    toolbar: form,
    bodyClass: 'find-body',
    status: ['Type a name, then click Find Now.', ''],
  });
  const status = win.el.querySelector<HTMLElement>('.status-bar-field')!;
  let timer = 0;

  const select = (tr: HTMLElement) => {
    tbody.querySelectorAll('tr.highlighted').forEach((r) => r.classList.remove('highlighted'));
    tr.classList.add('highlighted');
    tr.focus({ preventScroll: false });
  };
  const run = async () => {
    clearTimeout(timer);
    status.textContent = 'Searching…';
    stop.disabled = false;
    if (!reducedMotion.matches) anim.classList.add('searching');
    let d: DesktopData;
    try {
      d = await desktopData();
    } catch {
      status.textContent = 'Could not search: the computer is offline.';
      stop.disabled = true;
      anim.classList.remove('searching');
      return;
    }
    timer = window.setTimeout(() => {
      const hits = search(catalogue(d), named.value, containing.value, look.value as Scope);
      tbody.replaceChildren(
        ...hits.map((x) =>
          h('tr', { tabindex: '0', 'data-url': x.url, 'data-name': x.name, 'data-locked': x.locked ? '' : undefined }, [
            h('td', {}, h('span', { class: 'find-name' }, [h('span', { class: `ico ico16 ico-${x.icon}`, 'aria-hidden': 'true' }), x.name])),
            h('td', {}, x.folder),
            h('td', {}, x.type),
          ]),
        ),
      );
      status.textContent = `${hits.length} file(s) found`;
      win.el.querySelectorAll<HTMLElement>('.status-bar-field')[1].textContent = hits.length ? 'Double-click a result to open it.' : 'Try fewer letters, or look in kuschonink (C:).';
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
    status.textContent = 'Search stopped.';
  });
  fresh.addEventListener('click', () => {
    named.value = '';
    containing.value = '';
    look.value = 'all';
    tbody.replaceChildren();
    status.textContent = 'Type a name, then click Find Now.';
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
