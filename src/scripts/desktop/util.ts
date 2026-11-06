// Small helpers shared by the desktop shell.

export const html = document.documentElement;

export const compactQuery = matchMedia('(max-width: 700px), (max-height: 480px)');
export const coarseQuery = matchMedia('(pointer: coarse)');
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
/** Phones and small windows: every window is full-size. */
export const isCompact = () => compactQuery.matches;

type Child = Node | string | null | undefined | false;

/** Create an element: h('button', { type: 'button' }, 'OK'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | undefined | null | false> = {},
  children: Child | Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v);
  for (const c of [children].flat()) if (c != null && c !== false) el.append(c);
  return el;
}

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
/** Pick the English or Chinese version of a text. */
export const tr = (b: { en: string; zh?: string }) => (lang() === 'zh' && b.zh ? b.zh : b.en);
/** An element's text in the language showing (both languages may be inside, as data-l spans). */
export function shownText(el: Element | null | undefined): string {
  if (!el) return '';
  if (!el.querySelector('[data-l]')) return el.textContent ?? '';
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll(`[data-l]:not([data-l="${lang()}"])`).forEach((n) => n.remove());
  return c.textContent ?? '';
}

export const siteTitle = () =>
  document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content ?? 'Xiangyin 98';
