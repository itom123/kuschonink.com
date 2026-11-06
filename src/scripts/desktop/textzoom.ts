// iPhone and iPad zoom the page into a text box whose text is smaller than 16px
// as soon as it's tapped, and leave the page zoomed in (after which a double-tap
// zooms as well). The desktop's text is 11px, so while a text box is in use the
// page keeps its normal size; once the box is left, pinching zooms again.
// (A double-tap itself never zooms: touch-action in desktop.css.)

const FIELD =
  'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"], [type="range"], [type="color"], [type="file"], [type="image"], [type="hidden"]), textarea, select, [contenteditable]:not([contenteditable="false"])';

const apple = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** The text box a touch would put the cursor in: the box itself, or the one a label is for. */
function fieldFor(t: EventTarget | null): Element | null {
  if (!(t instanceof Element)) return null;
  const f = t.closest(FIELD);
  if (f) return f;
  const c = t.closest('label')?.control;
  return c?.matches(FIELD) ? c : null;
}

export function initTextZoom() {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta || !apple()) return;
  const normal = meta.content;
  const held = `${normal}, maximum-scale=1`;
  const set = (v: string) => {
    if (meta.content !== v) meta.content = v;
  };
  // Before the tap reaches the box: iOS decides whether to zoom as the box takes the focus.
  document.addEventListener('touchstart', (e) => fieldFor(e.target) && set(held), { capture: true, passive: true });
  document.addEventListener('focusin', (e) => fieldFor(e.target) && set(held));
  // Leaving the box, or a touch that didn't end in one (a scroll, say): pinching zooms again.
  const later = () => setTimeout(() => fieldFor(document.activeElement) || set(normal), 400);
  document.addEventListener('touchend', later, { capture: true, passive: true });
  document.addEventListener('touchcancel', later, { capture: true, passive: true });
  document.addEventListener('focusout', later);
}
