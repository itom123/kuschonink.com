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

export function setLang(l: Lang) {
  try { localStorage.setItem('lang', l); } catch { /* private mode */ }
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
  applyLang();
}
