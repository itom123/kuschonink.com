// Administration ▸ Notepad (src/pages/admin/edit.astro): the site's texts,
// one JSON file at a time. The list on the left is every file admin mode may
// edit (the files of the page being edited first); the status bar says
// whether the JSON is valid as you type. Save is one commit to main through
// /v1/admin/files (worker/admin-files.ts), which checks everything again; if
// someone changed the file meanwhile it asks before overwriting. Unsaved text
// is kept in this tab (sessionStorage) until it is saved.
import { AW } from '../../lib/admin-words';
import { jsonErrorAt } from '../../lib/admin-files';
import { api, whoAmI, type AdminMe } from './api';
import { newProject, uploadPicture } from './site';
import { ask, el, kus, setText, tell, type Bi } from './ui';

interface Saved { ok?: boolean; sha?: string; unchanged?: boolean; at?: string; why?: string; text?: string; problems?: string[]; detail?: string }
const DRAFT = 'kus98:admin:draft:';

export function initEditor() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-adm-editor]:not([data-ready])')) {
    root.dataset.ready = '1';
    void new Editor(root).start();
  }
}

/** What a file is called in the list: its path inside src/content. */
const short = (p: string) => p.replace(/^src\/content\//, '');
const groupOf = (p: string) => {
  const s = short(p);
  const i = s.lastIndexOf('/');
  return i < 0 ? '' : s.slice(0, i);
};

class Editor {
  root: HTMLElement;
  win: HTMLElement;
  text: HTMLTextAreaElement;
  list: HTMLElement;
  fields: HTMLElement[];
  me: AdminMe = { admin: false };
  all: string[] = [];
  folders: string[] = [];
  page: string[] = [];
  path = '';
  base = '';
  original = '';
  wrap = false;
  timer = 0;
  saving = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.win = root.closest<HTMLElement>('[data-window]') ?? document.body;
    this.text = root.querySelector<HTMLTextAreaElement>('[data-adm-text]')!;
    this.list = root.querySelector<HTMLElement>('[data-adm-files]')!;
    this.fields = [...this.win.querySelectorAll<HTMLElement>(':scope > [data-window-inner] > .status-bar > .status-bar-field')];
  }

  say(i: number, b: Bi | string) {
    const f = this.fields[i];
    if (!f) return;
    if (typeof b === 'string') f.textContent = b;
    else setText(f, b);
  }

  async start() {
    this.me = await whoAmI(true);
    if (!this.me.admin) {
      location.assign('/admin');
      return;
    }
    const u = new URL(location.href);
    const want = u.searchParams.get('path') ?? '';
    const forUrl = u.searchParams.get('for') ?? '';
    const r = await api<{ files: string[]; folders: string[] }>('/files');
    if (!r.ok) {
      const why = r.data.error === 'not_configured' ? AW.notSetUp('GitHub (GITHUB_TOKEN)') : AW.failed2(r.data.error ?? String(r.status));
      this.list.replaceChildren(el('p', { class: 'adm-hint' }, why));
      this.say(0, why);
      return;
    }
    this.all = r.data.files;
    this.folders = r.data.folders;
    if (forUrl) {
      const f = await api<{ files: string[] }>(`/files/for?url=${encodeURIComponent(forUrl)}`);
      this.page = f.ok ? f.data.files : [];
    }
    this.drawList();
    this.wire();
    const first = want || this.page[0] || '';
    if (first && this.all.includes(first)) await this.open(first);
    else this.idle();
  }

  wire() {
    this.list.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-file]');
      if (b) void this.open(b.dataset.file!);
    });
    this.win.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-cmd^="ed-"]');
      if (!b) return;
      e.preventDefault();
      void this.command(b.dataset.cmd!.slice(3));
    });
    this.text.addEventListener('input', () => {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.check(), 250);
    });
    this.win.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void this.save();
      }
    });
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty()) e.preventDefault();
    });
    kus()?.menus?.(this.win, (name) => this.menu(name));
  }

  async command(c: string) {
    if (c === 'open') return this.showList();
    if (c === 'save') return this.save();
    if (c === 'reload') return this.reload();
    if (c === 'format') return this.format();
    if (c === 'picture') return this.picture();
    if (c === 'github') return this.github();
  }

  menu(name: string) {
    const m = (b: Bi) => ({ label: b.en, zh: b.zh });
    if (name === 'file') {
      return [
        { ...m({ en: '&Open...', zh: '打开(&O)...' }), icon: 'tb-open', action: () => this.showList() },
        { ...m({ en: '&Save', zh: '保存(&S)' }), icon: 'tb-save', key: 'Ctrl+S', disabled: !this.path, action: () => void this.save() },
        { ...m(AW.reload), disabled: !this.path, action: () => void this.reload() },
        { sep: true },
        { ...m({ en: 'Upload &Picture...', zh: '上传图片(&P)...' }), action: () => void this.picture() },
        { ...m({ en: '&New Project...', zh: '新建项目(&N)...' }), action: () => void this.project() },
        { ...m(AW.onGitHub), disabled: !this.path || !this.me.repo, action: () => this.github() },
        { sep: true },
        { ...m({ en: '&Close', zh: '关闭(&C)' }), action: () => (window as unknown as { kus98?: { close(el: Element): void } }).kus98?.close(this.root) },
      ];
    }
    if (name === 'edit') {
      return [
        { ...m(AW.format), disabled: !this.path, action: () => this.format() },
        { ...m({ en: 'Select &All', zh: '全选(&A)' }), key: 'Ctrl+A', disabled: !this.path, action: () => { this.text.focus(); this.text.select(); } },
      ];
    }
    if (name === 'view') return [{ ...m(AW.wrap), checked: this.wrap, action: () => this.toggleWrap() }];
    return null;
  }

  drawList() {
    const item = (p: string) => el('li', {}, el('button', { type: 'button', class: 'adm-file', 'data-file': p, 'aria-current': p === this.path ? 'true' : undefined, title: p }, short(p).replace(/^.*\//, '')));
    const groups = new Map<string, string[]>();
    for (const p of this.all) groups.set(groupOf(p), [...(groups.get(groupOf(p)) ?? []), p]);
    const parts: Node[] = [];
    if (this.page.length) parts.push(el('h3', {}, AW.pageFiles), el('ul', {}, ...this.page.map((p) => el('li', {}, el('button', { type: 'button', class: 'adm-file', 'data-file': p, 'aria-current': p === this.path ? 'true' : undefined, title: p }, short(p))))));
    parts.push(el('h3', {}, AW.allFiles));
    for (const [g, ps] of [...groups].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))) {
      parts.push(el('details', { open: g === '' || this.path.startsWith(`src/content/${g}/`) ? true : undefined }, el('summary', {}, g ? `${g}/` : 'src/content/'), el('ul', {}, ...ps.map(item))));
    }
    this.list.replaceChildren(...parts);
  }

  showList() {
    this.root.toggleAttribute('data-list', !this.root.hasAttribute('data-list') || !this.path);
    this.list.querySelector<HTMLElement>('[aria-current="true"], .adm-file')?.focus();
  }

  idle() {
    this.say(0, AW.noFile);
    this.say(1, '');
    this.say(2, '');
    this.root.setAttribute('data-list', '');
  }

  dirty() {
    return !!this.path && this.text.value !== this.original;
  }

  title() {
    const t = this.win.querySelector(':scope > .title-bar [data-title]');
    const name = short(this.path);
    if (t) setText(t, { en: `${name} - ${AW.editor.en}`, zh: `${name} - ${AW.editor.zh}` });
  }

  async open(path: string, again = false) {
    if (path === this.path && !again) {
      this.root.removeAttribute('data-list');
      return;
    }
    if (this.dirty() && !again && !(await ask(AW.editor, AW.unsavedText(short(this.path)), this.win))) return;
    this.say(0, AW.loading);
    const r = await api<{ path: string; text: string; sha: string }>(`/files?path=${encodeURIComponent(path)}`);
    if (!r.ok) {
      await tell(AW.editor, AW.failed2(r.data.error ?? String(r.status)), 'error', this.win);
      this.say(0, this.path ? short(this.path) : AW.noFile);
      return;
    }
    this.path = path;
    this.base = r.data.sha;
    // A textarea gives back plain LF line ends: compare like with like.
    this.original = r.data.text.replace(/\r\n?/g, '\n');
    this.text.value = this.original;
    const d = this.draft();
    if (d && d.base === this.base && d.text !== this.original && (await ask(AW.editor, { en: `There is unsaved text for ${short(path)} from earlier in this tab. Bring it back?`, zh: `此标签页里有 ${short(path)} 之前未保存的文字。要恢复吗？` }, this.win))) this.text.value = d.text;
    else this.dropDraft();
    this.text.disabled = false;
    this.text.scrollTop = 0;
    this.text.setSelectionRange(0, 0);
    this.root.removeAttribute('data-list');
    this.title();
    this.drawList();
    this.check();
    (window as unknown as { kus98?: { replaceUrl(el: Element, url: string): void } }).kus98?.replaceUrl(this.root, `/admin/edit?path=${encodeURIComponent(path)}`);
    this.text.focus();
  }

  /** The status bar: the file, whether the JSON is valid, whether it has changed. Keeps a draft while it has. */
  check(): boolean {
    if (!this.path) return false;
    this.say(0, short(this.path));
    let ok = true;
    try {
      JSON.parse(this.text.value);
      this.say(1, AW.jsonOk);
    } catch (e) {
      ok = false;
      const msg = (e as Error).message.replace(/^JSON\.parse: /, '');
      const at = jsonErrorAt(this.text.value, msg);
      this.say(1, at ? AW.jsonBad(at.line, at.col, msg) : msg);
    }
    const dirty = this.dirty();
    this.say(2, dirty ? AW.modified : '');
    if (dirty) this.keepDraft();
    else this.dropDraft();
    return ok;
  }

  draft(): { base: string; text: string } | null {
    try {
      return JSON.parse(sessionStorage.getItem(DRAFT + this.path) ?? 'null');
    } catch {
      return null;
    }
  }
  keepDraft() {
    try { sessionStorage.setItem(DRAFT + this.path, JSON.stringify({ base: this.base, text: this.text.value })); } catch { /* full or blocked: fine */ }
  }
  dropDraft() {
    try { sessionStorage.removeItem(DRAFT + this.path); } catch { /* blocked: fine */ }
  }

  async save(force = false): Promise<void> {
    if (!this.path || this.saving) return;
    if (!this.check()) {
      await tell(AW.editor, AW.badJson, 'warning', this.win);
      return;
    }
    this.saving = true;
    this.say(0, AW.saving);
    const text = this.text.value;
    try {
      const r = await api<Saved>('/files', { path: this.path, text, base: this.base, force }, 'PUT');
      if (r.ok) {
        this.original = text;
        if (!r.data.unchanged && r.data.sha) this.base = r.data.sha;
        this.check();
        this.say(0, r.data.unchanged ? AW.unchanged : AW.savedLive);
        kus()?.play('ding');
        return;
      }
      this.check();
      const e = r.data.error;
      if (e === 'changed') {
        if (await ask(AW.changedTitle, AW.changedText, this.win)) {
          this.saving = false;
          return this.save(true);
        }
        try { await navigator.clipboard.writeText(text); } catch { /* not allowed */ }
        this.original = text; // so reloading doesn't ask again
        await this.open(this.path, true);
        return;
      }
      if (e === 'active_content') {
        this.find(r.data.text ?? '');
        await tell(AW.editor, AW.activeText(r.data.at ?? '', r.data.why ?? ''), 'warning', this.win);
      } else if (e === 'guide_check') {
        await tell(AW.editor, { en: `${AW.guideProblems.en}\n\n${(r.data.problems ?? []).join('\n')}`, zh: `${AW.guideProblems.zh}\n\n${(r.data.problems ?? []).join('\n')}` }, 'warning', this.win);
      } else if (e === 'invalid_json') {
        await tell(AW.editor, { en: `${AW.badJson.en} ${r.data.detail ?? ''}`, zh: `${AW.badJson.zh} ${r.data.detail ?? ''}` }, 'warning', this.win);
      } else {
        await tell(AW.editor, e === 'not_configured' ? AW.notSetUp('GitHub (GITHUB_TOKEN)') : AW.failed2(e ?? String(r.status)), 'error', this.win);
      }
    } finally {
      this.saving = false;
    }
  }

  /** Select the first place this text appears (as written in the JSON). */
  find(snippet: string) {
    if (!snippet) return;
    const v = this.text.value;
    let i = v.indexOf(JSON.stringify(snippet).slice(1, -1));
    if (i < 0) i = v.indexOf(snippet);
    if (i < 0) return;
    this.text.focus();
    this.text.setSelectionRange(i, i + Math.max(1, Math.min(snippet.length, 80)));
  }

  async reload() {
    if (!this.path) return;
    if (this.dirty() && !(await ask(AW.editor, AW.unsavedText(short(this.path)), this.win))) return;
    this.original = this.text.value;
    await this.open(this.path, true);
  }

  async format() {
    if (!this.path) return;
    try {
      const v = JSON.stringify(JSON.parse(this.text.value), null, 2) + '\n';
      if (v !== this.text.value) {
        this.text.value = v;
        this.check();
      }
    } catch {
      await tell(AW.editor, AW.badJson, 'warning', this.win);
    }
  }

  toggleWrap() {
    this.wrap = !this.wrap;
    this.text.setAttribute('wrap', this.wrap ? 'soft' : 'off');
    this.root.toggleAttribute('data-wrap', this.wrap);
  }

  github() {
    if (!this.path || !this.me.repo) return;
    window.open(`${this.me.repo}/blob/main/${this.path}`, '_blank', 'noopener');
  }

  /** A picture, into the folder that goes with the open file when there is one. */
  async picture() {
    const g = /^src\/content\/guides\/([a-z0-9-]+)\//.exec(this.path);
    const p = /^src\/content\/projects\/([a-z0-9-]+)\.json$/.exec(this.path);
    const prefer = g ? `public/guides/${g[1]}/img` : p ? `src/assets/images/projects/${p[1]}` : '';
    await uploadPicture(this.win, this.folders, prefer);
  }

  async project() {
    const file = await newProject(this.win);
    if (!file) return;
    if (!this.all.includes(file)) this.all = [...this.all, file].sort();
    // The commit is on main: open the new file once GitHub serves it.
    await this.open(file);
  }
}

