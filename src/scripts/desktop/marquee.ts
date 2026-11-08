// Xiangyin 98: a status bar field too narrow for its words scrolls them, as the
// scrolling status-bar messages of the time did. The words rest at their start,
// slide left until they have gone, come back in from the right and rest again,
// for as long as they don't fit. It works on every status bar on the page,
// whatever writes to it: only the words' position moves (the field's
// text-indent), never the words themselves, so screen readers and live regions
// hear them as before. With reduced motion the words wrap onto more lines
// instead. A mouse resting on the field holds them still.

/** How fast the words slide, in pixels a second: slow enough to read on a phone. */
export const SPEED = 45;
/** How long the words rest at their start before each pass, in milliseconds. */
export const REST = 1800;

/**
 * One pass of the scroll for words `text` px wide in a field `box` px wide
 * (its content box): rest, slide left until gone, jump to the right edge,
 * slide back to the start. The same speed throughout.
 */
export function marqueeFrames(text: number, box: number): { duration: number; frames: Keyframe[] } {
  const run = ((text + box) / SPEED) * 1000;
  const duration = Math.round(REST + run);
  const rest = REST / duration;
  const gone = rest + (1 - rest) * (text / (text + box));
  const px = (n: number) => `${Math.round(n * 10) / 10}px`;
  return {
    duration,
    frames: [
      { textIndent: '0px', offset: 0 },
      { textIndent: '0px', offset: rest },
      { textIndent: px(-text), offset: gone },
      { textIndent: px(box), offset: gone },
      { textIndent: '0px', offset: 1 },
    ],
  };
}

interface State { key: string; anim: Animation | null }
const states = new WeakMap<HTMLElement, State>();
const fields = new Set<HTMLElement>();
const pending = new Set<HTMLElement>();
let frame = 0;
let ro: ResizeObserver | null = null;
let mo: MutationObserver | null = null;
let reduce: MediaQueryList | null = null;

/** The width of the words shown (one language; the other is display: none), on one line. */
function wordsWidth(el: HTMLElement): number {
  const r = document.createRange();
  r.selectNodeContents(el);
  return r.getBoundingClientRect().width;
}

/** Start, stop or keep the field's scroll. Unchanged words in an unchanged width keep scrolling where they are. */
function refresh(el: HTMLElement, force = false) {
  if (!el.isConnected) return forget(el);
  const st = states.get(el) ?? { key: '', anim: null };
  states.set(el, st);
  const cs = getComputedStyle(el);
  const box = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const still = !!reduce?.matches;
  const key = `${document.documentElement.dataset.lang ?? ''}|${Math.round(box)}|${still}|${el.textContent ?? ''}`;
  if (!force && key === st.key) return;
  st.key = key;
  st.anim?.cancel();
  st.anim = null;
  el.classList.remove('is-marquee', 'is-wrapped');
  // Hidden (a minimised window, a status bar left to screen readers) or empty: nothing to show.
  if (box < 8 || !el.textContent?.trim()) return;
  const text = wordsWidth(el);
  if (text <= box + 0.5) return;
  if (still) {
    el.classList.add('is-wrapped');
    return;
  }
  el.classList.add('is-marquee');
  const { duration, frames } = marqueeFrames(text, box);
  st.anim = el.animate(frames, { duration, iterations: Infinity, easing: 'linear' });
  if (el.matches(':hover') && matchMedia('(hover: hover)').matches) st.anim.pause();
}

function forget(el: HTMLElement) {
  states.get(el)?.anim?.cancel();
  states.delete(el);
  fields.delete(el);
  ro?.unobserve(el);
}

/** At most one look a frame, however often the words change (Paint writes its pointer position on every move). */
function queue(el: HTMLElement) {
  pending.add(el);
  frame ||= requestAnimationFrame(() => {
    frame = 0;
    for (const f of [...pending]) refresh(f);
    pending.clear();
  });
}

function watch(el: HTMLElement) {
  if (fields.has(el)) return;
  fields.add(el);
  ro?.observe(el);
  mo?.observe(el, { childList: true, subtree: true, characterData: true });
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') states.get(el)?.anim?.pause(); });
  el.addEventListener('pointerleave', () => { states.get(el)?.anim?.play(); });
  queue(el);
}

/** Every status bar field on the page, old and new; the ones gone are let go. */
function scan() {
  for (const el of fields) if (!el.isConnected) forget(el);
  document.querySelectorAll<HTMLElement>('.status-bar-field').forEach(watch);
}

export function initMarquee() {
  if (typeof ResizeObserver === 'undefined' || typeof Element.prototype.animate !== 'function') return;
  reduce = matchMedia('(prefers-reduced-motion: reduce)');
  ro = new ResizeObserver((entries) => { for (const e of entries) queue(e.target as HTMLElement); });
  mo = new MutationObserver((records) => {
    for (const r of records) {
      const el = (r.target instanceof Element ? r.target : r.target.parentElement)?.closest<HTMLElement>('.status-bar-field');
      if (el) queue(el);
    }
  });
  const all = (force = false) => { for (const el of fields) force ? refresh(el, true) : queue(el); };
  // The 中/EN switch shows the other words; reduced motion turned on or off.
  new MutationObserver(() => all()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-lang'] });
  reduce.addEventListener('change', () => all(true));
  // New windows and new pages bring new status bars.
  for (const ev of ['desktop:content', 'wm:change', 'astro:page-load']) document.addEventListener(ev, scan);
  // The pixel font may arrive after the first look, and words then take another width.
  document.fonts?.ready.then(() => all(true));
  scan();
}
