// The mouse pointers of Xiangyin 98, drawn here pixel by pixel in the
// shapes of the classic pointers (no Windows bitmaps). /system/cursors.css
// turns them into CSS cursors with a hotspot each.
import { Canvas } from './pixels';

export interface Pointer {
  /** What Control Panel ▸ Mouse calls it. */
  label: string;
  rows: string[];
  /** Hotspot (the pixel that clicks). */
  hot: [number, number];
}

const ARROW = [
  'k...........',
  'kk..........',
  'kwk.........',
  'kwwk........',
  'kwwwk.......',
  'kwwwwk......',
  'kwwwwwk.....',
  'kwwwwwwk....',
  'kwwwwwwwk...',
  'kwwwwwwwwk..',
  'kwwwwwkkkkk.',
  'kwwkwwk.....',
  'kwk.kwwk....',
  'kk..kwwk....',
  'k....kwwk...',
  '.....kwwk...',
  '......kwwk..',
  '......kwwk..',
  '.......kk...',
];

const HOURGLASS = [
  'kkkkkkkkkkkkk',
  'kwwwwwwwwwwwk',
  'kkkkkkkkkkkkk',
  '.kwwwwwwwwwk.',
  '.kwwwwwwwwwk.',
  '.kwkgkgkgkwk.',
  '..kwkgkgkwk..',
  '...kwkgkwk...',
  '....kwgwk....',
  '.....kwk.....',
  '.....kwk.....',
  '....kwwwk....',
  '...kwwgwwk...',
  '..kwwwgwwwk..',
  '.kwwwgkgwwwk.',
  '.kwgkgkgkgwk.',
  '.kgkgkgkgkgk.',
  'kkkkkkkkkkkkk',
  'kwwwwwwwwwwwk',
  'kkkkkkkkkkkkk',
];

const HAND = [
  '.....kk.........',
  '....kwwk........',
  '....kwwk........',
  '....kwwk........',
  '....kwwk........',
  '....kwwkkk......',
  '....kwwkwwkkk...',
  '....kwwkwwkwwkk.',
  '.kk.kwwkwwkwwkwk',
  'kwwkkwwwwwwwwkwk',
  'kwwwkwwwwwwwwwwk',
  '.kwwkwwwwwwwwwwk',
  '..kwwwwwwwwwwwwk',
  '..kwwwwwwwwwwwk.',
  '...kwwwwwwwwwwk.',
  '...kwwwwwwwwwk..',
  '....kwwwwwwwwk..',
  '....kwwwwwwwwk..',
  '....kkkkkkkkkk..',
];

const BEAM = [
  'kkk.kkk',
  '...k...',
  '...k...',
  '...k...',
  '...k...',
  '...k...',
  '...k...',
  '...k...',
  '...k...',
  '...k...',
  '...k...',
  '...k...',
  '...k...',
  '...k...',
  '...k...',
  'kkk.kkk',
];

const QUESTION = [
  '.kkkkk..',
  'kwwwwwk.',
  'kwkkkwwk',
  'kk..kwwk',
  '...kwwk.',
  '..kwwk..',
  '..kwwk..',
  '..kkkk..',
  '..kwwk..',
  '..kwwk..',
  '..kkkk..',
];

const MINI_GLASS = [
  'kkkkkkk',
  'kwwwwwk',
  '.kwgwk.',
  '..kgk..',
  '...k...',
  '..kwk..',
  '.kwgwk.',
  'kwgggwk',
  'kkkkkkk',
];

/** A black shape with a white halo, so it shows on dark backgrounds too. */
function halo(c: Canvas) {
  const copy = c.rows();
  c.outline('w');
  c.stamp(0, 0, copy);
  return c;
}

function arrows(kind: 'ns' | 'ew' | 'nwse' | 'nesw' | 'move'): Canvas {
  const c = new Canvas(32, 32);
  const up = (cx: number, ty: number) => { for (let k = 0; k < 5; k++) c.rect(cx - k, ty + k, 2 * k + 1, 1, 'k'); };
  const down = (cx: number, by: number) => { for (let k = 0; k < 5; k++) c.rect(cx - k, by - k, 2 * k + 1, 1, 'k'); };
  const left = (lx: number, cy: number) => { for (let k = 0; k < 5; k++) c.rect(lx + k, cy - k, 1, 2 * k + 1, 'k'); };
  const right = (rx: number, cy: number) => { for (let k = 0; k < 5; k++) c.rect(rx - k, cy - k, 1, 2 * k + 1, 'k'); };
  if (kind === 'ns' || kind === 'move') {
    c.rect(15, 7, 1, 18, 'k');
    up(15, 3);
    down(15, 28);
  }
  if (kind === 'ew' || kind === 'move') {
    c.rect(7, 15, 18, 1, 'k');
    left(3, 15);
    right(28, 15);
  }
  if (kind === 'nwse' || kind === 'nesw') {
    for (let i = 0; i < 6; i++) c.rect(4, 4 + i, 6 - i, 1, 'k');
    for (let i = 0; i < 6; i++) c.rect(27 - i, 22 + i, i + 1, 1, 'k');
    c.line(7, 7, 24, 24, 'k').line(8, 7, 24, 23, 'k');
    if (kind === 'nesw') {
      const rows = c.rows().map((r) => [...r].reverse().join(''));
      c.rect(0, 0, 32, 32, '.').stamp(0, 0, rows);
    }
  }
  return halo(c);
}

function no(): Canvas {
  const c = new Canvas(32, 32);
  c.disc(15.5, 15.5, 11, 'k').disc(15.5, 15.5, 8, '.');
  for (let i = -2; i <= 2; i++) c.line(9 + i, 9, 22 + i, 22, 'k');
  return halo(c);
}

/** Precision Select: a thin cross with an open centre. */
function cross(): Canvas {
  const c = new Canvas(32, 32);
  c.rect(4, 15, 9, 1, 'k').rect(19, 15, 9, 1, 'k');
  c.rect(15, 4, 1, 9, 'k').rect(15, 19, 1, 9, 'k');
  c.set(15, 15, 'k');
  return halo(c);
}

/** Handwriting (and Paint's pencil): a pencil, its point at the lower left. */
function pen(): Canvas {
  const c = new Canvas(32, 32);
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      const s = x + y - 19, t = x - y;
      if (Math.abs(s) > 1 || t < -17 || t > 15) continue;
      if (t <= -15) c.set(x, y, s === 0 ? 'k' : '.');
      else if (t <= -12) c.set(x, y, Math.abs(s) <= (t + 15) / 2 ? 'g' : '.');
      else c.set(x, y, t > 11 ? 'g' : 'w');
    }
  }
  return c.outline('k');
}

// Paint's tools: the bucket, the dropper and the magnifier, as in the tool box.
const BUCKET = [
  '......kk......',
  '.....kwwk.....',
  '....kw..wk....',
  '...kkk...wk...',
  '..kwwwkk..k...',
  '.kwwwwwwkkk...',
  'kgkwwwwwwwkk..',
  'kggkwwwwwwwk..',
  'kgggkwwwwwwk..',
  'kggggkwwwwk...',
  'kgggg.kkwwk...',
  'kgggg...kk....',
  'kgggg.........',
  '.kggk.........',
  '..kk..........',
];
const DROPPER = [
  '...........kkk.',
  '..........kkkkk',
  '..........kkkkk',
  '.........kkkkkk',
  '........kwkkkk.',
  '.......kwwk....',
  '......kwwk.....',
  '.....kwwk......',
  '....kwwk.......',
  '...kwwk........',
  '..kwwk.........',
  '.kwwk..........',
  '.kwk...........',
  'kk.............',
];
const MAGNIFIER = [
  '..kkkkk.....',
  '.kwwwwwk....',
  'kwwwwwwwk...',
  'kwwwwwwwk...',
  'kwwwwwwwk...',
  'kwwwwwwwk...',
  'kwwwwwwwk...',
  '.kwwwwwkk...',
  '..kkkkkkkk..',
  '.......kkkk.',
  '........kkkk',
  '.........kkk',
];

function from(rows: string[], extra?: (c: Canvas) => void): Canvas {
  const c = new Canvas(32, 32);
  c.stamp(0, 0, rows);
  extra?.(c);
  return c;
}

export const POINTERS: Record<string, () => Pointer> = {
  arrow: () => ({ label: 'Normal Select', rows: from(ARROW).rows(), hot: [0, 0] }),
  help: () => ({ label: 'Help Select', rows: from(ARROW, (c) => c.stamp(13, 1, QUESTION)).rows(), hot: [0, 0] }),
  appstarting: () => ({ label: 'Working in Background', rows: from(ARROW, (c) => c.stamp(13, 10, MINI_GLASS)).rows(), hot: [0, 0] }),
  wait: () => ({ label: 'Busy', rows: from(HOURGLASS).rows(), hot: [6, 10] }),
  text: () => ({ label: 'Text Select', rows: halo(from(BEAM)).rows(), hot: [3, 8] }),
  hand: () => ({ label: 'Link Select', rows: from(HAND).rows(), hot: [5, 0] }),
  no: () => ({ label: 'Unavailable', rows: no().rows(), hot: [15, 15] }),
  ns: () => ({ label: 'Vertical Resize', rows: arrows('ns').rows(), hot: [15, 15] }),
  ew: () => ({ label: 'Horizontal Resize', rows: arrows('ew').rows(), hot: [15, 15] }),
  nwse: () => ({ label: 'Diagonal Resize 1', rows: arrows('nwse').rows(), hot: [15, 15] }),
  nesw: () => ({ label: 'Diagonal Resize 2', rows: arrows('nesw').rows(), hot: [16, 15] }),
  move: () => ({ label: 'Move', rows: arrows('move').rows(), hot: [15, 15] }),
  cross: () => ({ label: 'Precision Select', rows: cross().rows(), hot: [15, 15] }),
  pen: () => ({ label: 'Handwriting', rows: pen().rows(), hot: [1, 18] }),
  // Paint only (not in Control Panel ▸ Mouse).
  'paint-fill': () => ({ label: 'Fill With Color', rows: from(BUCKET).rows(), hot: [2, 14] }),
  'paint-picker': () => ({ label: 'Pick Color', rows: from(DROPPER).rows(), hot: [0, 13] }),
  'paint-zoom': () => ({ label: 'Magnifier', rows: from(MAGNIFIER).rows(), hot: [4, 4] }),
};

export const POINTER_NAMES = Object.keys(POINTERS);
