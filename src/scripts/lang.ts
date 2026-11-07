// The 中/EN toggle. The page carries both languages; <html data-lang> decides
// which one shows (src/styles/lang.css). Attributes that can't be hidden with
// CSS (aria-label, title, placeholder, alt) carry data-<attr>-en / -zh and are
// swapped here, as is text marked data-text-en / -zh. Other scripts read the language with getLang() and listen for
// the 'langchange' event.

export type Lang = 'en' | 'zh';
const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];

export const getLang = (): Lang => (document.documentElement.dataset.lang === 'zh' ? 'zh' : 'en');
export const pick = (b: { en: string; zh: string }) => (getLang() === 'zh' && b.zh ? b.zh : b.en);

export function applyLang(root: ParentNode = document) {
  const l = getLang();
  for (const a of ATTRS) {
    root.querySelectorAll(`[data-${a}-zh]`).forEach((el) => {
      const v = el.getAttribute(`data-${a}-${l}`);
      if (v !== null) el.setAttribute(a, v);
    });
  }
  // Text that CSS can't hide, like SVG <title>: data-text-en / data-text-zh.
  root.querySelectorAll('[data-text-zh]').forEach((el) => {
    const v = el.getAttribute(`data-text-${l}`);
    if (v !== null) el.textContent = v;
  });
  const title = document.querySelector<HTMLMetaElement>(`meta[name="title-${l}"]`);
  if (title?.content) document.title = title.content;
  document.querySelectorAll('[data-lang-toggle]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-lang-toggle') === l)));
}

/** Remembering the language is a lasting preference: only with "Allow All" when the desktop asks (src/scripts/desktop/consent.ts). */
const mayKeep = () => (window as unknown as { kus98?: { consent?: { allows(kind: 'lasting'): boolean } } }).kus98?.consent?.allows('lasting') ?? true;
/** The language the visitor chose (kept, or switched in this page), and whether it waits to be kept. */
let chosen: Lang | null = null;
let unsaved = false;
function keep() {
  if (!chosen) return;
  unsaved = !mayKeep();
  if (unsaved) return;
  try { localStorage.setItem('lang', chosen); } catch { /* private mode */ }
}

export function setLang(l: Lang) {
  chosen = l;
  keep();
  const html = document.documentElement;
  html.dataset.lang = l;
  html.lang = l === 'zh' ? 'zh-Hans' : 'en-GB';
  applyLang();
  document.dispatchEvent(new CustomEvent('langchange', { detail: l }));
}

let ready = false;
export function initLang() {
  if (ready) return;
  ready = true;
  document.addEventListener('click', (e) => {
    const b = (e.target as Element).closest?.('[data-lang-toggle]');
    if (b) setLang(b.getAttribute('data-lang-toggle') === 'zh' ? 'zh' : 'en');
  });
  document.addEventListener('astro:page-load', () => applyLang());
  try {
    const s = localStorage.getItem('lang');
    if (s === 'en' || s === 'zh') chosen = s;
  } catch { /* nothing kept */ }
  // "Allow All": a language switched before it is kept now, and with `again`
  // (chosen here after a stricter choice, which removed it) the one chosen before.
  document.addEventListener('consent:change', (e) => {
    if (mayKeep() && (unsaved || (e as CustomEvent<{ again?: boolean }>).detail?.again)) keep();
  });
  applyLang();
}
