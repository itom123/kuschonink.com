// Field Guide (导览): map labels. Times on white plates, beside their pin:
// east if there is room, else west, else none (no leader lines). Placed in
// priority order after each settle; moved with their pins between settles.

export interface Box { x: number; y: number; w: number; h: number }
export interface LabelIn { id: string; x: number; y: number; w: number; h: number; pr: number }
export type Side = 'e' | 'w';

/** Gap between a pin's centre and its label's near edge. */
export const LABEL_GAP = 11;

const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The box of a label put on one side of its pin. */
export const sideBox = (l: LabelIn, side: Side): Box => ({
  x: side === 'e' ? l.x + LABEL_GAP : l.x - LABEL_GAP - l.w,
  y: l.y - l.h / 2,
  w: l.w,
  h: l.h,
});

/**
 * Greedy placement: highest priority first, each label takes east, else west,
 * if that clears every obstacle (pins, map buttons, the sheet), every label
 * already placed, and the view `area`. The rest stay hidden.
 */
export function placeLabels(items: LabelIn[], obstacles: Box[], area: Box): Map<string, Side> {
  const out = new Map<string, Side>();
  const placed: Box[] = [];
  const inArea = (b: Box) => b.x >= area.x && b.y >= area.y && b.x + b.w <= area.x + area.w && b.y + b.h <= area.y + area.h;
  for (const l of [...items].sort((a, b) => b.pr - a.pr)) {
    for (const side of ['e', 'w'] as const) {
      const b = sideBox(l, side);
      if (!inArea(b) || placed.some((p) => hits(p, b)) || obstacles.some((o) => hits(o, b))) continue;
      placed.push(b);
      out.set(l.id, side);
      break;
    }
  }
  return out;
}

/** Text widths for the label font, measured once each (as the House's em()). */
export function makeMeasure() {
  const ctx = document.createElement('canvas').getContext('2d');
  const cache = new Map<string, number>();
  return (text: string, bold = false) => {
    const k = `${+bold}${text}`;
    let w = cache.get(k);
    if (w === undefined) {
      if (ctx) {
        ctx.font = `${bold ? 'bold ' : ''}13px "Times New Roman", Times, serif`;
        w = ctx.measureText(text).width;
      } else w = [...text].length * 7;
      cache.set(k, w);
    }
    return w;
  };
}
