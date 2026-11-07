// Field Guide (导览): a copy of Paint's DOM helpers (src/scripts/paint/dom.ts),
// so the two programs stay independent. Text in both languages, and the
// desktop's dialogs through window.kus98, with a plain fallback.
import { pick } from '../lang';

export interface Bi { en: string; zh: string }
export type Text = string | Bi;

const isBi = (v: unknown): v is Bi => typeof v === 'object' && v !== null && !(v instanceof Node) && 'en' in v;
export const tr = (t: Text) => (typeof t === 'string' ? t : pick(t));

/** Text as nodes: both languages as data-l spans, or plain text. */
export function bi(t: Text): Node {
  if (typeof t === 'string' || !t.zh || t.zh === t.en) return document.createTextNode(typeof t === 'string' ? t : t.en);
  const f = document.createDocumentFragment();
  const en = document.createElement('span');
  en.dataset.l = 'en';
  en.textContent = t.en;
  const zh = document.createElement('span');
  zh.dataset.l = 'zh';
  zh.lang = 'zh-Hans';
  zh.textContent = t.zh;
  f.append(en, zh);
  return f;
}

export function setText(el: Element, t: Text) {
  el.replaceChildren(bi(t));
}

/** Attributes the 中/EN switch swaps (src/scripts/lang.ts). */
const SWAPPED = new Set(['title', 'aria-label', 'placeholder', 'alt']);

export function setAttr(el: Element, k: string, v: Text) {
  if (!isBi(v)) return el.setAttribute(k, v);
  el.setAttribute(k, tr(v));
  if (SWAPPED.has(k)) {
    el.setAttribute(`data-${k}-en`, v.en);
    el.setAttribute(`data-${k}-zh`, v.zh || v.en);
  }
}

type Child = Node | Text | null | undefined | false;

/** h('button', { type: 'button', title: { en, zh } }, ['OK']) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, Text | number | boolean | null | undefined> = {}, children: Child | Child[] = []): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (v === true) el.setAttribute(k, '');
    else if (typeof v === 'number') el.setAttribute(k, String(v));
    else setAttr(el, k, v);
  }
  for (const c of [children].flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : bi(c));
  }
  return el;
}

// ---- Dialogs ----
interface DesktopLike {
  alert(o: { title?: Text; text: Text; icon?: string; buttons?: string[]; owner?: Element | null }): Promise<string>;
  dialog(o: { title: Text; body: Node; owner?: Element | null; icon?: string; className?: string; w?: number; h?: number; resizable?: boolean; help?: boolean; onClose?: () => void }): { el: HTMLElement; close: () => void };
  open(url: string): Promise<void>;
  close(el: Element): void;
  play(name: string): void;
  menus?(el: Element, provider: (name: string) => unknown[] | null): void;
}
export const desktop = () => (window as unknown as { kus98?: DesktopLike }).kus98;

/** A message box; resolves with the button pressed (English name). */
export function message(o: { title?: Text; text: Text; icon?: string; buttons?: string[]; owner?: Element | null }): Promise<string> {
  const d = desktop();
  if (d) return d.alert(o);
  const buttons = o.buttons ?? ['OK'];
  if (buttons.length > 1) return Promise.resolve(window.confirm(tr(o.text)) ? buttons[0] : buttons[buttons.length - 1]);
  window.alert(tr(o.text));
  return Promise.resolve(buttons[0]);
}

/** A dialog window over Paint. Returns its element and how to close it. */
export function dialog(o: { title: Text; body: Node; owner: Element; icon?: string; className?: string; onClose?: () => void }): { el: HTMLElement; close: () => void } {
  const d = desktop();
  if (d) return d.dialog({ ...o, help: false });
  // On its own: a native <dialog> dressed as a Windows 98 window.
  const dlg = h('dialog', { class: `window paint-native-dialog ${o.className ?? ''}` }, [
    h('div', { class: 'title-bar' }, [h('div', { class: 'title-bar-text' }, o.title), h('div', { class: 'title-bar-controls' }, h('button', { type: 'button', 'aria-label': 'Close', 'data-close': true }))]),
    o.body,
  ]);
  document.body.append(dlg);
  const close = () => {
    if (!dlg.isConnected) return;
    dlg.close();
    dlg.remove();
    o.onClose?.();
  };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.querySelector('[data-close]')!.addEventListener('click', close);
  dlg.showModal();
  return { el: dlg, close };
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** "42 KB", "1.3 MB" */
export function fileSize(bytes: number): Bi {
  if (bytes < 1024 * 1024) {
    const kb = Math.max(1, Math.round(bytes / 1024));
    return { en: `${kb} KB`, zh: `${kb} KB` };
  }
  const mb = (bytes / 1024 / 1024).toFixed(1);
  return { en: `${mb} MB`, zh: `${mb} MB` };
}

/** Copy text: the async clipboard, else a hidden textarea. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

/** Storage that may be missing (private windows, blocked site data). */
export function readStore<T>(s: 'local' | 'session', key: string): T | null {
  try {
    const raw = (s === 'local' ? localStorage : sessionStorage).getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function writeStore(s: 'local' | 'session', key: string, v: unknown | null) {
  try {
    const st = s === 'local' ? localStorage : sessionStorage;
    if (v === null) st.removeItem(key);
    else st.setItem(key, JSON.stringify(v));
  } catch { /* ignore */ }
}
