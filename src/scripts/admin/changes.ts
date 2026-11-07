// Administration ▸ Changes (src/pages/admin/changes.astro): the newest commits
// on main and whether each build went live, from /v1/admin/changes.
import { AW } from '../../lib/admin-words';
import { api, whoAmI } from './api';
import { el, setText, statusOf } from './ui';

interface Change { sha: string; message: string; date: string; url: string; build: string; buildUrl: string }

export function initChanges() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-adm-changes]:not([data-ready])')) {
    root.dataset.ready = '1';
    void show(root);
    root.closest('[data-window]')?.addEventListener('click', (e) => {
      if (!(e.target as Element).closest('[data-cmd="ch-refresh"]')) return;
      e.preventDefault();
      void show(root);
    });
  }
}

async function show(root: HTMLElement) {
  const status = statusOf(root);
  const say = (b: { en: string; zh: string }) => status && setText(status, b);
  if (!(await whoAmI(true)).admin) {
    location.assign('/admin');
    return;
  }
  say(AW.loading);
  const r = await api<{ commits: Change[] }>('/changes');
  const rows = root.querySelector('[data-adm-changes-rows]')!;
  if (!r.ok) {
    const why = r.data.error === 'not_configured' ? AW.notSetUp('GitHub (GITHUB_TOKEN)') : AW.failed2(r.data.error ?? String(r.status));
    rows.replaceChildren(el('tr', {}, el('td', { colspan: '3' }, why)));
    say(why);
    return;
  }
  const when = (iso: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '');
  rows.replaceChildren(...r.data.commits.map((c) => el('tr', {},
    el('td', {}, when(c.date)),
    el('td', {}, el('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer' }, c.message)),
    el('td', {}, c.buildUrl
      ? el('a', { href: c.buildUrl, target: '_blank', rel: 'noopener noreferrer', class: `adm-st adm-st-${c.build}` }, AW.build[c.build] ?? AW.build.none)
      : el('span', { class: `adm-st adm-st-${c.build}` }, AW.build[c.build] ?? AW.build.none)),
  )));
  say({ en: `${r.data.commits.length} changes`, zh: `${r.data.commits.length} 项更改` });
}
