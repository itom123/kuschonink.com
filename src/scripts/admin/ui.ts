// Small helpers the admin windows share: both languages in one element, a DOM
// builder, message boxes and form dialogs through the desktop (window.kus98,
// docs/DESKTOP.md), with plain browser fallbacks when it isn't there.

export type Bi = { en: string; zh: string };

export interface Kus {
  alert(o: { title?: unknown; text: unknown; icon?: string; buttons?: string[]; owner?: Element | null }): Promise<string>;
  dialog(o: { title: unknown; body: Node; owner?: Element | null; icon?: string; className?: string; onClose?: () => void }): { el: HTMLElement; close: () => void };
  play(n: string): void;
  open(url: string, o?: { reload?: boolean }): Promise<void>;
  menus?(el: Element, provider: (name: string) => unknown[] | null): void;
}
export const kus = () => (window as unknown as { kus98?: Kus }).kus98;
export const pick = (b: Bi) => (document.documentElement.dataset.lang === 'zh' && b.zh ? b.zh : b.en);

/** Both languages, as the 中/EN switch expects (two data-l spans). */
export function setText(el: Element, b: Bi) {
  const en = document.createElement('span');
  en.dataset.l = 'en';
  en.textContent = b.en;
  const zh = document.createElement('span');
  zh.dataset.l = 'zh';
  zh.lang = 'zh-Hans';
  zh.textContent = b.zh || b.en;
  el.replaceChildren(en, zh);
}

/** An element: attributes (false/undefined left out), then children (text, nodes, or both languages). */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | undefined> = {}, ...kids: (Node | string | Bi | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (typeof k === 'string' || k instanceof Node) e.append(k);
    else {
      const s = document.createElement('span');
      setText(s, k);
      e.append(...s.childNodes);
    }
  }
  return e;
}

/** A message box (the desktop's), or the browser's alert. */
export async function tell(title: Bi, text: Bi, icon = 'info', owner?: Element | null) {
  const k = kus();
  if (k) await k.alert({ title, text, icon, owner });
  else window.alert(pick(text));
}

/** A Yes/No question; resolves true for Yes. */
export async function ask(title: Bi, text: Bi, owner?: Element | null, yes = 'Yes', no = 'No'): Promise<boolean> {
  const k = kus();
  if (k) return (await k.alert({ title, text, icon: 'question', buttons: [yes, no], owner })) === yes;
  return window.confirm(pick(text));
}

export interface Field { name: string; label: Bi; value: string; kind?: 'text' | 'area' | 'select' | 'date' | 'check'; options?: [string, Bi][] }

/** A small form in a dialog; resolves with the values ("1"/"" for ticks), or null on Cancel. */
export function form(owner: Element | null, title: Bi, lead: Bi | null, fields: Field[], okLabel: Bi, cancelLabel: Bi): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();
    const uid = Math.random().toString(36).slice(2, 8);
    const rows = fields.map((f) => {
      const id = `adm-${uid}-${f.name}`;
      const label = pick(f.label).replace(/\(&.\)|&/g, '');
      if (f.kind === 'check') {
        // 98.css draws a tick only for an input followed by its label.
        const box = el('input', { id, type: 'checkbox' });
        box.checked = f.value === '1';
        inputs.set(f.name, box);
        return el('div', { class: 'adm-row adm-row-check' }, el('span'), el('span', {}, box, el('label', { for: id }, label)));
      }
      let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (f.kind === 'area') input = el('textarea', { id, rows: '5' });
      else if (f.kind === 'select') input = el('select', { id }, ...(f.options ?? []).map(([v, b]) => el('option', { value: v }, pick(b))));
      else input = el('input', { id, type: f.kind === 'date' ? 'date' : 'text' });
      input.value = f.value;
      inputs.set(f.name, input);
      return el('div', { class: 'adm-row' }, el('label', { for: id }, label), input);
    });
    const ok = el('button', { type: 'submit', class: 'default' }, pick(okLabel));
    const cancel = el('button', { type: 'button' }, pick(cancelLabel));
    const body = el('form', { class: 'adm-form' }, ...(lead ? [el('p', { class: 'adm-lead' }, lead)] : []), ...rows, el('div', { class: 'adm-buttons' }, ok, cancel));
    let done = false;
    const k = kus();
    const d = k ? k.dialog({ title, body, owner, icon: 'keys', className: 'adm-dialog', onClose: () => { if (!done) resolve(null); } }) : null;
    const close = () => { done = true; d?.close(); };
    cancel.addEventListener('click', () => { close(); resolve(null); });
    body.addEventListener('submit', (e) => {
      e.preventDefault();
      const out: Record<string, string> = {};
      for (const [n, i] of inputs) out[n] = i instanceof HTMLInputElement && i.type === 'checkbox' ? (i.checked ? '1' : '') : i.value;
      close();
      resolve(out);
    });
    if (!d) {
      // Without the desktop: a plain prompt per field.
      const out: Record<string, string> = {};
      for (const f of fields) out[f.name] = window.prompt(pick(f.label), f.value) ?? f.value;
      resolve(out);
    } else rows[0]?.querySelector<HTMLElement>('input, textarea, select')?.focus();
  });
}

/** The window an element is in (or the page). */
export const windowOf = (node: Element) => node.closest<HTMLElement>('[data-window]') ?? document.body;

/** The status bar's first field of the window an element is in. */
export const statusOf = (node: Element) => windowOf(node).querySelector<HTMLElement>(':scope > [data-window-inner] > .status-bar > .status-bar-field');
