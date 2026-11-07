// Administration ▸ Suggestions: the queue window (src/pages/admin/suggestions.astro).
// Folders on the left, a list, a preview; toolbar buttons Approve, Refuse,
// Ask, Edit, Notion, Run Now, Publish. Everything goes through
// /v1/admin/* (worker/admin.ts), which checks the session each time.
import { AW, FOLDERS } from '../../lib/admin-words';
import { api, whoAmI, type AdminMe } from './api';
import { el, form as uiForm, kus, pick, setText, tell as uiTell, type Bi } from './ui';

interface Row {
  id: string; url: string; created: string; status: string; guide: string; kind: string; lang: string; sentBy: string;
  name: string; show: string; artists: string; start: string; end: string; hours: string; address: string; website: string;
  links: string[]; description: string; pictures: { name: string; url: string }[]; pictureCredit: string; rights: boolean; own: boolean;
  creditAs: string; reference: string; duplicate: string; tier: string; showTo: string; notes: string; entry: string;
  webPictures: { name: string; url: string }[]; result: string; itemId: string; commit: string;
}
interface Contact { submitter: string; email: string; mayContact: boolean }
interface LogLine { run: string; when: string; trigger: string; actor: string; outcome: string; pages: string; commit: string; session: string; details: string }

/** A message box titled with the queue's name. */
const tell = (text: Bi, icon = 'info', owner?: Element | null) => uiTell(AW.queue, text, icon, owner);

const statusClass = (s: string) => `adm-st adm-st-${s.toLowerCase().replace(/\s+/g, '-')}`;
const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '');

export function initQueue() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-adm-queue]:not([data-ready])')) {
    root.dataset.ready = '1';
    new Queue(root).start();
  }
}

class Queue {
  root: HTMLElement;
  win: HTMLElement;
  rows: Row[] = [];
  folder = 'inbox';
  selected: string | null = null;
  me: AdminMe = { admin: false };
  status: HTMLElement | null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.win = root.closest<HTMLElement>('[data-window]') ?? document.body;
    this.status = this.win.querySelector<HTMLElement>(':scope > [data-window-inner] > .status-bar > .status-bar-field');
  }

  say(b: Bi) {
    if (this.status) setText(this.status, b);
  }

  async start() {
    this.me = await whoAmI(true);
    if (!this.me.admin) {
      // Not logged on (or the session ended): to the log-on.
      location.assign('/admin');
      return;
    }
    const view = new URL(location.href).searchParams.get('view');
    this.folder = view === 'log' ? 'log' : 'inbox';
    this.root.querySelector('[data-adm-folders]')!.addEventListener('click', (e) => {
      const li = (e.target as Element).closest<HTMLElement>('[data-folder]');
      if (li) void this.open(li.dataset.folder!);
    });
    this.root.querySelector('[data-adm-rows]')!.addEventListener('click', (e) => {
      const tr = (e.target as Element).closest<HTMLElement>('[data-id]');
      if (tr) void this.select(tr.dataset.id!);
    });
    this.root.querySelector('[data-adm-rows]')!.addEventListener('keydown', (e) => this.keys(e as KeyboardEvent));
    this.win.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-cmd^="adm-"]');
      if (!b) return;
      e.preventDefault();
      void this.command(b.dataset.cmd!.slice(4));
    });
    await this.open(this.folder);
  }

  async open(folder: string) {
    this.folder = folder;
    this.root.dataset.view = folder === 'log' ? 'log' : 'queue';
    this.root.querySelectorAll<HTMLElement>('[data-folder]').forEach((li) => li.setAttribute('aria-selected', String(li.dataset.folder === folder)));
    if (folder === 'log') return this.showLog();
    this.say(AW.loading);
    const statuses = FOLDERS[folder] ?? [];
    const r = await api<{ rows: Row[] }>(`/suggestions${statuses.length ? `?status=${encodeURIComponent(statuses.join(','))}` : ''}`);
    if (!r.ok) {
      this.say(AW.failed2(r.data.error ?? String(r.status)));
      if (r.data.error === 'not_configured') this.preview(el('p', { class: 'adm-hint' }, AW.notSetUp('Notion (NOTION_TOKEN)')));
      return;
    }
    this.rows = r.data.rows;
    this.drawList();
    this.say({ en: `${this.rows.length} suggestion${this.rows.length === 1 ? '' : 's'}`, zh: `${this.rows.length} 条推荐` });
    if (this.selected && this.rows.some((x) => x.id === this.selected)) void this.select(this.selected);
    else this.preview(el('p', { class: 'adm-hint' }, AW.choose));
  }

  drawList() {
    const body = this.root.querySelector<HTMLElement>('[data-adm-rows]')!;
    const empty = this.root.querySelector<HTMLElement>('[data-adm-empty]')!;
    body.replaceChildren(
      ...this.rows.map((r) =>
        el('tr', { 'data-id': r.id, tabindex: '-1', 'aria-selected': String(r.id === this.selected), class: r.status === 'NEW' ? 'adm-new' : undefined },
          el('td', {}, r.reference),
          el('td', {}, el('span', { class: statusClass(r.status) }, r.status)),
          el('td', {}, r.name),
          el('td', {}, [r.show, r.artists].filter(Boolean).join(' · ')),
          el('td', {}, [r.start, r.end && r.end !== r.start ? r.end : ''].filter(Boolean).join(' – ')),
          el('td', {}, r.sentBy),
          el('td', {}, fmtDate(r.created)),
        ),
      ),
    );
    empty.hidden = this.rows.length > 0;
  }

  keys(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = this.rows.findIndex((r) => r.id === this.selected);
    const next = this.rows[Math.max(0, Math.min(this.rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (next) void this.select(next.id);
  }

  preview(...kids: Node[]) {
    this.root.querySelector<HTMLElement>('[data-adm-preview]')!.replaceChildren(...kids);
  }

  current(): Row | null {
    return this.rows.find((r) => r.id === this.selected) ?? null;
  }

  async select(id: string) {
    this.selected = id;
    this.root.querySelectorAll<HTMLElement>('[data-adm-rows] tr').forEach((tr) => tr.setAttribute('aria-selected', String(tr.dataset.id === id)));
    this.root.querySelector<HTMLElement>(`[data-adm-rows] tr[data-id="${id}"]`)?.focus({ preventScroll: false });
    this.preview(el('p', { class: 'adm-hint' }, AW.loading));
    const r = await api<{ row: Row; contact: Contact | null }>(`/suggestions/${id}`);
    if (this.selected !== id) return;
    if (!r.ok) return this.preview(el('p', { class: 'adm-hint' }, AW.failed2(r.data.error ?? String(r.status))));
    const { row, contact } = r.data;
    const i = this.rows.findIndex((x) => x.id === id);
    if (i >= 0) this.rows[i] = row;
    const field = (k: Bi, v: Node | string | null) => (v ? [el('dt', {}, k), el('dd', {}, v)] : []);
    const link = (u: string) => el('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, u);
    const dups = el('div', { class: 'adm-dups' }, el('b', {}, AW.duplicates), ' ', el('span', { class: 'adm-wait' }, AW.loading));
    this.preview(
      el('header', { class: 'adm-head' },
        el('h2', {}, row.name),
        el('p', {}, el('span', { class: statusClass(row.status) }, row.status), ` ${row.reference} · ${row.guide} · ${row.kind} · ${row.sentBy} · ${fmtDate(row.created)}`),
      ),
      el('dl', { class: 'adm-fields' },
        ...field({ en: 'Show', zh: '展览' }, row.show),
        ...field({ en: 'Artists', zh: '艺术家' }, row.artists),
        ...field({ en: 'Dates', zh: '日期' }, [row.start, row.end].filter(Boolean).join(' – ')),
        ...field({ en: 'Hours', zh: '开放时间' }, row.hours),
        ...field({ en: 'Address', zh: '地址' }, row.address),
        ...field({ en: 'Website', zh: '网站' }, row.website ? link(row.website) : null),
        ...field({ en: 'Other links', zh: '其他链接' }, row.links.length ? el('span', {}, ...row.links.flatMap((u, n) => [n ? el('br') : null, link(u)].filter(Boolean) as Node[])) : null),
        ...field({ en: 'Why', zh: '推荐理由' }, row.description),
        ...field({ en: 'Their own', zh: '本人作品' }, row.own ? 'yes' : null),
        ...field({ en: 'Credit as', zh: '署名' }, row.creditAs),
        ...field({ en: 'Tier / show to', zh: '级别 / 显示给' }, `${row.tier} / ${row.showTo}`),
        ...field({ en: 'Owner notes', zh: '说明' }, row.notes),
        ...field(AW.contact, contact ? `${contact.submitter || '—'} · ${contact.email || pick(AW.noContact)}${contact.email ? ` (${pick(contact.mayContact ? AW.mayContact : AW.noConsent)})` : ''}` : pick(AW.noContact)),
        ...field(AW.result, row.result),
        ...field({ en: 'Item', zh: '条目' }, row.itemId ? `${row.itemId}${row.commit ? ' · ' : ''}` : null),
        ...field({ en: 'Hint', zh: '提示' }, row.duplicate),
      ),
      ...(row.pictures[0] ? [el('figure', { class: 'adm-pic' }, el('img', { src: row.pictures[0].url, alt: '', loading: 'lazy' }), el('figcaption', {}, `${row.pictureCredit}${row.rights ? '' : ' (rights not confirmed)'}`))] : []),
      ...(row.entry ? [el('details', { class: 'adm-entry' }, el('summary', {}, AW.entry), el('pre', {}, (() => { try { return JSON.stringify(JSON.parse(row.entry), null, 2); } catch { return row.entry; } })()))] : []),
      dups,
    );
    const m = await api<{ matches: { id: string; kind: string; match: string; score: number; why: string[] }[]; guideChecked: boolean }>(`/suggestions/${id}/matches`);
    if (this.selected !== id) return;
    const list = m.ok ? m.data.matches : [];
    dups.replaceChildren(
      el('b', {}, AW.duplicates), ' ',
      list.length
        ? el('ul', {}, ...list.map((x) => el('li', {}, `${x.id} (${x.kind}): ${x.match.replace('-', ' ')}, ${x.why.join(', ')}`)))
        : el('span', {}, m.ok ? AW.noDuplicates : AW.failed2(m.data.error ?? String(m.status))),
    );
  }

  async command(cmd: string) {
    if (cmd === 'refresh') return this.open(this.folder);
    if (cmd === 'run') {
      const r = await api<{ fired: boolean; reason?: string }>('/routine', {});
      return tell(r.ok && r.data.fired ? AW.routineStarted : r.data.reason === 'recently' ? AW.routineRecently : r.status === 503 ? AW.routineOff : AW.failed2(r.data.error ?? r.data.reason ?? String(r.status)), 'info', this.win);
    }
    if (cmd === 'publish') {
      this.say(AW.loading);
      const r = await api<{ report: { committed: unknown[]; live: string[]; needsCheck: string[]; errors: string[] } | null }>('/publish', {});
      const rep = r.data.report;
      await tell(r.ok && rep ? { en: `Committed ${rep.committed.length}, live ${rep.live.length}, needs a look ${rep.needsCheck.length + rep.errors.length}.`, zh: `已提交 ${rep.committed.length}，已上线 ${rep.live.length}，需要查看 ${rep.needsCheck.length + rep.errors.length}。` } : r.status === 503 ? AW.notSetUp('publishing (GITHUB_TOKEN, NOTION_TOKEN)') : AW.failed2(r.data.error ?? String(r.status)), 'info', this.win);
      return this.open(this.folder);
    }
    const row = this.current();
    if (!row) return tell(AW.choose, 'info', this.win);
    if (cmd === 'notion') return void window.open(row.url, '_blank', 'noopener');
    if (cmd === 'refuse') return this.setStatus(row, 'REFUSED');
    if (cmd === 'approve') return this.approve(row);
    if (cmd === 'edit') return this.edit(row);
    if (cmd === 'ask') return this.ask(row);
  }

  async setStatus(row: Row, status: string, extra: Record<string, unknown> = {}) {
    const r = await api<{ row: Row; routine: { fired: boolean; reason?: string } | null }>(`/suggestions/${row.id}`, { status, ...extra });
    if (!r.ok) return tell(AW.failed2(r.data.error ?? String(r.status)), 'error', this.win);
    kus()?.play('ding');
    if (status === 'APPROVED') {
      const ro = r.data.routine;
      this.say(ro?.fired ? AW.routineStarted : ro?.reason === 'recently' ? AW.routineRecently : AW.routineOff);
    }
    await this.open(this.folder);
  }

  /** A small form in a dialog; resolves with the values, or null on Cancel. */
  form(title: Bi, lead: Bi | null, fields: { name: string; label: Bi; value: string; kind?: 'text' | 'area' | 'select' | 'date'; options?: [string, Bi][] }[], okLabel: Bi = AW.save): Promise<Record<string, string> | null> {
    return uiForm(this.win, title, lead, fields, okLabel, AW.cancel);
  }

  async approve(row: Row) {
    const audiences = ['Everyone', ...((await this.audiencesOf(row.guide)) ?? [])];
    const v = await this.form(AW.approveTitle, AW.approveLead, [
      { name: 'tier', label: AW.tier, value: row.tier || 'C', kind: 'select', options: [['A', { en: 'A', zh: 'A' }], ['B', { en: 'B', zh: 'B' }], ['C', { en: 'C', zh: 'C' }]] },
      { name: 'showTo', label: AW.showTo, value: row.showTo || 'Everyone', kind: 'select', options: audiences.map((a) => [a, a === 'Everyone' ? AW.everyone : (this.me.audiences?.[a] ?? { en: a, zh: a })]) },
      { name: 'notes', label: AW.notes, value: row.notes, kind: 'area' },
    ], AW.approve);
    if (v) await this.setStatus(row, 'APPROVED', v);
  }

  /** The audiences an entry may be kept for, besides everyone (the server sends each guide's list). */
  async audiencesOf(guide: string): Promise<string[] | null> {
    return (this.me.guides?.[guide] ?? []).slice(1);
  }

  async edit(row: Row) {
    const v = await this.form(AW.editTitle, null, [
      { name: 'name', label: { en: 'Place', zh: '地点' }, value: row.name },
      { name: 'show', label: { en: 'Show', zh: '展览' }, value: row.show },
      { name: 'artists', label: { en: 'Artists', zh: '艺术家' }, value: row.artists },
      { name: 'start', label: { en: 'First day', zh: '第一天' }, value: row.start, kind: 'date' },
      { name: 'end', label: { en: 'Last day', zh: '最后一天' }, value: row.end, kind: 'date' },
      { name: 'hours', label: { en: 'Hours', zh: '开放时间' }, value: row.hours },
      { name: 'address', label: { en: 'Address', zh: '地址' }, value: row.address },
      { name: 'website', label: { en: 'Website', zh: '网站' }, value: row.website },
      { name: 'links', label: { en: 'Other links', zh: '其他链接' }, value: row.links.join('\n'), kind: 'area' },
      { name: 'description', label: { en: 'Why', zh: '推荐理由' }, value: row.description, kind: 'area' },
      { name: 'creditAs', label: { en: 'Credit as', zh: '署名' }, value: row.creditAs },
      { name: 'notes', label: { en: 'Owner notes', zh: '说明' }, value: row.notes, kind: 'area' },
    ]);
    if (!v) return;
    const changed = Object.fromEntries(Object.entries(v).filter(([k, val]) => val !== (k === 'links' ? row.links.join('\n') : String((row as unknown as Record<string, unknown>)[k] ?? ''))));
    if (!Object.keys(changed).length) return;
    const r = await api(`/suggestions/${row.id}`, changed);
    if (!r.ok) return tell(AW.failed2(`${r.data.error}${(r.data as { field?: string }).field ? `: ${(r.data as { field?: string }).field}` : ''}`), 'error', this.win);
    kus()?.play('ding');
    await this.open(this.folder);
  }

  async ask(row: Row) {
    const zh = row.lang === 'zh';
    const texts: Record<string, { subject: string; text: string }> = {
      question: zh
        ? { subject: `关于你推荐的“${row.name}”`, text: `你好，\n\n谢谢你推荐“${row.name}”。在把它放进导览之前，想请你确认一下：\n\n` }
        : { subject: `A question about ${row.name}`, text: `Hello,\n\nThank you for suggesting ${row.name}. Before it goes into the guide, could you check something for me:\n\n` },
      published: zh
        ? { subject: `“${row.name}”已收录`, text: `你好，\n\n谢谢你推荐“${row.name}”。它已经收进导览了。\n` }
        : { subject: `${row.name} is in the guide`, text: `Hello,\n\nThank you for suggesting ${row.name}. It is now in the guide.\n` },
      declined: zh
        ? { subject: `关于你推荐的“${row.name}”`, text: `你好，\n\n谢谢你推荐“${row.name}”。这一次它不会收进导览：\n\n` }
        : { subject: `About your suggestion: ${row.name}`, text: `Hello,\n\nThank you for suggesting ${row.name}. It won't go into the guide this time:\n\n` },
    };
    const which = await this.form(AW.emailTitle, AW.emailLead, [{ name: 'template', label: AW.template, value: 'question', kind: 'select', options: Object.keys(texts).map((k) => [k, AW.templates[k]]) }], AW.ok);
    if (!which) return;
    const t = texts[which.template] ?? texts.question;
    const v = await this.form(AW.emailTitle, AW.emailLead, [
      { name: 'subject', label: AW.subject, value: t.subject },
      { name: 'text', label: AW.template, value: t.text, kind: 'area' },
    ], AW.send);
    if (!v) return;
    const r = await api(`/suggestions/${row.id}/email`, { subject: v.subject, text: v.text, key: crypto.randomUUID(), asked: which.template === 'question' });
    if (!r.ok) {
      const e = r.data.error ?? String(r.status);
      return tell(e === 'no_consent' ? { en: 'They didn’t agree to be emailed.', zh: '对方没有同意接收邮件。' } : e === 'no_email' ? { en: 'They didn’t leave an email address.', zh: '对方没有留下电子邮箱。' } : e === 'not_configured' ? AW.notSetUp('email (MAIL_OUT)') : AW.failed2(e), 'warning', this.win);
    }
    kus()?.play('ding');
    this.say(AW.sent);
    await this.open(this.folder);
  }

  async showLog() {
    this.say(AW.loading);
    const r = await api<{ entries: LogLine[] }>('/log');
    const table = this.root.querySelector<HTMLElement>('[data-adm-rows]')!;
    const empty = this.root.querySelector<HTMLElement>('[data-adm-empty]')!;
    if (!r.ok) return this.say(AW.failed2(r.data.error ?? String(r.status)));
    table.replaceChildren(...r.data.entries.map((x) =>
      el('tr', {},
        el('td', {}, fmtDate(x.when)),
        el('td', {}, el('span', { class: statusClass(x.outcome) }, x.outcome)),
        el('td', {}, x.run),
        el('td', {}, x.actor),
        el('td', {}, x.trigger),
        el('td', {}, x.pages.split('\n')[0] ?? ''),
        el('td', {}, x.commit ? el('a', { href: x.commit, target: '_blank', rel: 'noopener noreferrer' }, 'commit') : x.session ? el('a', { href: x.session, target: '_blank', rel: 'noopener noreferrer' }, 'session') : x.details.slice(0, 80)),
      ),
    ));
    empty.hidden = r.data.entries.length > 0;
    this.preview(el('p', { class: 'adm-hint' }, AW.logTip));
    this.say({ en: `${r.data.entries.length} entries`, zh: `${r.data.entries.length} 条记录` });
  }
}
