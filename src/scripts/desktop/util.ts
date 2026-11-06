// Small helpers shared by the desktop shell.

export const html = document.documentElement;

export const compactQuery = matchMedia('(max-width: 700px), (max-height: 480px)');
export const coarseQuery = matchMedia('(pointer: coarse)');
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
/** Phones and small windows: every window is full-size. */
export const isCompact = () => compactQuery.matches;

/** Text in English and (optionally) Chinese; the 中/EN switch shows one (src/scripts/lang.ts). */
export type Text = string | { en: string; zh?: string };
type Child = Node | Text | null | undefined | false;

const isBi = (v: unknown): v is { en: string; zh?: string } => typeof v === 'object' && v !== null && !(v instanceof Node) && 'en' in v;

/** Text as nodes: both languages as data-l spans (src/styles/lang.css shows one), or plain text. */
export function bi(t: Text): Node {
  if (typeof t === 'string') return document.createTextNode(t);
  if (!t.zh || t.zh === t.en) return document.createTextNode(t.en);
  const en = document.createElement('span');
  en.dataset.l = 'en';
  en.textContent = t.en;
  const zh = document.createElement('span');
  zh.dataset.l = 'zh';
  zh.lang = 'zh-Hans';
  zh.textContent = t.zh;
  const f = document.createDocumentFragment();
  f.append(en, zh);
  return f;
}

/** Replace what an element says, in both languages. */
export function setText(el: Element, t: Text) {
  el.replaceChildren(bi(t));
}

/** Attributes the switch swaps (lang.ts does the first four; this file does value). */
const SWAPPED = new Set(['title', 'aria-label', 'placeholder', 'alt', 'value']);
/** Attributes read when they're used: English in the attribute, Chinese in <name>-zh. */
const READ_LATER = new Set(['data-tip', 'data-help', 'data-type']);

function setAttr(el: Element, k: string, v: Text) {
  if (!isBi(v)) {
    el.setAttribute(k, v);
    return;
  }
  if (SWAPPED.has(k)) {
    el.setAttribute(k, tr(v));
    el.setAttribute(`data-${k}-en`, v.en);
    el.setAttribute(`data-${k}-zh`, v.zh || v.en);
  } else if (READ_LATER.has(k)) {
    el.setAttribute(k, v.en);
    if (v.zh) el.setAttribute(`${k}-zh`, v.zh);
  } else el.setAttribute(k, tr(v));
}

/**
 * Create an element: h('button', { type: 'button' }, 'OK'). Text can be
 * { en, zh }, as a child or an attribute value, and follows the 中/EN switch.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, Text | undefined | null | false> = {},
  children: Child | Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) setAttr(el, k, v);
  for (const c of [children].flat()) {
    if (c == null || c === false) continue;
    if (typeof c === 'string' || c instanceof Node) el.append(c);
    else if (tag === 'option' || tag === 'textarea') {
      // No spans in here: the language showing, swapped by lang.ts (data-text-*).
      el.setAttribute('data-text-en', c.en);
      el.setAttribute('data-text-zh', c.zh || c.en);
      el.append(tr(c));
    } else el.append(bi(c));
  }
  return el;
}

/** Boxes and suggestions with two-language values (address bars, Run) follow the switch. */
document.addEventListener('langchange', () => {
  const l = lang();
  document.querySelectorAll<HTMLInputElement | HTMLOptionElement>('input[data-value-zh], option[data-value-zh]').forEach((i) => (i.value = i.getAttribute(`data-value-${l}`) ?? i.value));
});

/** Fire a bubbling custom event. */
export function emit<T>(target: EventTarget, name: string, detail?: T) {
  target.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** JSON in localStorage, never throwing (private mode, full storage…). */
export function stored<T>(key: string, fallback: T) {
  let mem: T = fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw) mem = JSON.parse(raw) as T;
  } catch { /* keep fallback */ }
  return {
    get: () => mem,
    set(v: T) {
      mem = v;
      try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* memory only */ }
    },
  };
}

/** For matching what people type: lower case, no accents or quotes, single spaces. */
export const normText = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/["“”‘’']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The language the 中/EN switch shows (src/scripts/lang.ts). */
export const lang = (): 'en' | 'zh' => (html.dataset.lang === 'zh' ? 'zh' : 'en');
/** Pick the English or Chinese version of a text, now. */
export const tr = (b: Text) => (typeof b === 'string' ? b : lang() === 'zh' && b.zh ? b.zh : b.en);
/** An element's text in the language showing, or in `l` (both languages may be inside, as data-l spans). */
export function shownText(el: Element | null | undefined, l: 'en' | 'zh' = lang()): string {
  if (!el) return '';
  if (!el.querySelector('[data-l]')) return el.textContent ?? '';
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll(`[data-l]:not([data-l="${l}"])`).forEach((n) => n.remove());
  return c.textContent ?? '';
}

export const siteTitle = () =>
  document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content ?? 'Xiangyin 98';
