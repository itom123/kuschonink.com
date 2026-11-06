// The icons of kuschonink 98, drawn pixel by pixel at 32 × 32 (no Windows
// bitmaps). /system/icons.css turns each into a CSS class: .ico-<name>.
import { Canvas } from './pixels';

type Draw = () => Canvas;

const N = () => new Canvas(32, 32);

/** Black-outlined monitor with a bevelled bezel; returns the canvas and the screen box. */
function monitor(c: Canvas, x = 4, y = 1, w = 24, h = 20) {
  c.rect(x, y, w, h, 'k');
  c.rect(x + 1, y + 1, w - 2, h - 2, 's');
  c.rect(x + 1, y + 1, w - 3, 1, 'w').rect(x + 1, y + 1, 1, h - 3, 'w');
  c.rect(x + 2, y + h - 2, w - 3, 1, 'g').rect(x + w - 2, y + 2, 1, h - 3, 'g');
  c.rect(x + 3, y + 3, w - 6, h - 7, 'g');
  c.rect(x + 4, y + 4, w - 8, h - 9, 'k');
  return { sx: x + 4, sy: y + 4, sw: w - 8, sh: h - 9 };
}

function folderShape(c: Canvas, open = false) {
  if (!open) {
    c.poly([[2, 7], [4, 5], [12, 5], [14, 7], [29, 7], [29, 27], [2, 27]], 'o');
    c.rect(3, 6, 10, 2, 'y').rect(3, 8, 26, 2, 'y');
    c.rect(2, 10, 28, 1, 'k');
    c.rect(2, 11, 28, 17, 'y');
    c.rect(3, 11, 26, 1, 'h').rect(3, 11, 1, 16, 'h');
    c.rect(4, 26, 25, 1, 'o').rect(28, 12, 1, 15, 'o');
    c.outline('k');
  } else {
    c.poly([[2, 7], [4, 5], [12, 5], [14, 7], [27, 7], [27, 26], [2, 26]], 'o');
    c.rect(3, 6, 10, 2, 'y');
    c.rect(5, 9, 19, 9, 'w').box(5, 9, 19, 9, 'g');
    c.poly([[6, 14], [31, 14], [27, 28], [1, 28]], 'k');
    c.poly([[7, 15], [29.6, 15], [26.2, 27], [2.4, 27]], 'y');
    c.rect(7, 15, 22, 1, 'h');
    c.outline('k');
  }
  return c;
}

function balloon(c: Canvas) {
  c.ellipse(16, 13, 14.5, 11.5, 'k');
  c.ellipse(16, 13, 13.5, 10.5, 'w');
  c.poly([[8, 20], [15, 22], [6, 30]], 'k');
  c.poly([[9, 20], [13.5, 21.5], [7.5, 27.5]], 'w');
  return c;
}

/** Thick stroke made of parallel Bresenham lines. */
function thick(c: Canvas, x0: number, y0: number, x1: number, y1: number, col: string, t = 2) {
  for (let i = 0; i < t; i++) {
    c.line(x0 + i, y0, x1 + i, y1, col);
  }
  return c;
}

const KNIGHT = [
  '...........kk...........',
  '..........kwk...kk......',
  '.........kwwk..kwk......',
  '........kwwwwkkwwk......',
  '.......kwwwwwwwwwwk.....',
  '......kwwkwwwwwwwwwk....',
  '.....kwwwwwwwwwwwwwwk...',
  '....kwwwwwwwwwwwwwwwk...',
  '...kwwwwwwwwwwwwwwwwwk..',
  '..kwwwwwwwwwwwwwwwwwwk..',
  '..kwwwwwkkwwwwwwwwwwwwk.',
  '..kwwwwk..kwwwwwwwwwwwk.',
  '...kkkk..kwwwwwwwwwwwwk.',
  '........kwwwwwwwwwwwwwk.',
  '.......kwwwwwwwwwwwwwwk.',
  '......kwwwwwwwwwwwwwwwk.',
  '......kwwwwwwwwwwwwwwk..',
  '.....kwwwwwwwwwwwwwwwk..',
  '.....kwwwwwwwwwwwwwwwk..',
  '....kkkkkkkkkkkkkkkkkkk.',
  '....kwwwwwwwwwwwwwwwwwk.',
  '...kkkkkkkkkkkkkkkkkkkkk',
];

export const ICONS: Record<string, Draw> = {
  computer() {
    const c = N();
    const s = monitor(c, 4, 0, 24, 20);
    c.rect(s.sx + 1, s.sy + 1, s.sw - 2, s.sh - 2, 't');
    c.rect(s.sx + 3, s.sy + 2, 8, 6, 's').rect(s.sx + 3, s.sy + 2, 8, 1, 'n').box(s.sx + 3, s.sy + 2, 8, 6, 'k');
    c.rect(s.sx + 3, s.sy + 2, 8, 1, 'n');
    c.set(s.sx + 1, s.sy + 1, 'c').set(s.sx + 2, s.sy + 1, 'c').set(s.sx + 1, s.sy + 2, 'c');
    c.set(24, 17, 'l');
    c.rect(12, 20, 8, 2, 'k').rect(13, 20, 6, 1, 'g');
    c.rect(2, 22, 28, 9, 'k');
    c.rect(3, 23, 26, 7, 's');
    c.rect(3, 23, 25, 1, 'w').rect(3, 23, 1, 6, 'w');
    c.rect(4, 29, 25, 1, 'g').rect(28, 24, 1, 6, 'g');
    c.rect(15, 25, 11, 1, 'k').rect(15, 26, 11, 1, 'g');
    c.set(6, 26, 'l').set(8, 26, 'e');
    return c;
  },
  folder() {
    return folderShape(N());
  },
  'folder-open'() {
    return folderShape(N(), true);
  },
  programs() {
    const c = folderShape(N());
    c.raised(10, 14, 13, 10);
    c.rect(11, 15, 11, 2, 'n');
    c.rect(12, 18, 9, 4, 'w');
    return c;
  },
  documents() {
    const c = folderShape(N());
    c.rect(11, 13, 11, 13, 'w').box(11, 13, 11, 13, 'k');
    for (const y of [16, 18, 20, 22]) c.rect(13, y, 7, 1, 'g');
    return c;
  },
  house() {
    const c = N();
    c.rect(21, 3, 4, 8, 'k').rect(22, 4, 2, 7, 'm');
    c.poly([[16, 1], [31, 15], [1, 15]], 'k');
    c.poly([[16, 3.2], [28.6, 14.2], [3.4, 14.2]], 'm');
    c.line(16, 3, 4, 13, 'r').line(16, 4, 6, 13, 'r');
    c.rect(4, 15, 24, 15, 'k');
    c.rect(5, 15, 22, 14, 'w');
    c.rect(5, 15, 22, 1, 's');
    c.rect(25, 16, 2, 13, 's');
    // windows
    for (const x of [7, 19]) {
      c.rect(x, 18, 6, 6, 'k').rect(x + 1, 19, 4, 4, 'a').rect(x + 3, 19, 1, 4, 'k').rect(x + 1, 21, 4, 1, 'k');
    }
    // door
    c.rect(13, 20, 6, 10, 'k').rect(14, 21, 4, 8, 'x').set(17, 25, 'k');
    c.rect(1, 30, 30, 1, 'e').rect(0, 31, 32, 1, 'o');
    return c;
  },
  document() {
    const c = N();
    c.poly([[6, 1], [21, 1], [27, 7], [27, 31], [6, 31]], 'k');
    c.poly([[7, 2], [20.6, 2], [26, 7.4], [26, 30], [7, 30]], 'w');
    c.poly([[20, 2], [20, 8], [26, 8]], 's');
    c.line(20, 1, 20, 8, 'k').line(20, 8, 27, 8, 'k');
    c.rect(9, 5, 9, 1, 'n');
    for (const y of [10, 12, 14]) c.rect(9, y, 15, 1, 'g');
    c.rect(9, 17, 7, 6, 'a').rect(9, 21, 7, 2, 'e').box(9, 17, 7, 6, 'k');
    for (const y of [17, 19, 21]) c.rect(18, y, 6, 1, 'g');
    for (const y of [25, 27]) c.rect(9, y, 15, 1, 'g');
    return c;
  },
  topic() {
    const c = ICONS.document();
    c.rect(8, 9, 18, 20, 'w');
    c.stamp(12, 11, [
      '..kkkkk..',
      '.kk...kk.',
      '.kk...kk.',
      '......kk.',
      '....kkk..',
      '....kk...',
      '....kk...',
      '.........',
      '....kk...',
      '....kk...',
    ]);
    return c;
  },
  mail() {
    const c = N();
    c.rect(2, 7, 28, 19, 'k');
    c.rect(3, 8, 26, 17, 'w');
    c.line(3, 8, 15, 18, 'k').line(28, 8, 16, 18, 'k');
    c.line(3, 24, 12, 16, 'g').line(28, 24, 19, 16, 'g');
    c.rect(22, 10, 5, 5, 'r').box(22, 10, 5, 5, 'm').rect(23, 11, 3, 1, 'y');
    c.rect(4, 25, 26, 1, 'g').rect(30, 8, 1, 18, 'g');
    return c;
  },
  recycle() {
    const c = N();
    c.ellipse(16, 6, 12, 3, 'k');
    c.poly([[4, 6], [28, 6], [25, 29], [7, 29]], 'k');
    c.poly([[5, 7], [27, 7], [24.2, 28], [7.8, 28]], 's');
    for (let x = 8; x <= 24; x += 3) c.line(x, 8, x + (x < 16 ? 1 : x > 16 ? -1 : 0), 27, 'g');
    c.ellipse(16, 6, 11, 2, 'u');
    c.ellipse(16, 6, 9, 1.4, 'g');
    // recycling triangle
    c.rect(10, 13, 13, 9, 's');
    c.stamp(10, 13, [
      '......e......',
      '.....ele.....',
      '....el.le....',
      '...el...le...',
      '..eel...lee..',
      '.el.......le.',
      'el.........le',
      'eeeeee.eeeeee',
      '.....eee.....',
    ]);
    return c;
  },
  'recycle-full'() {
    const c = ICONS.recycle();
    c.poly([[7, 6], [11, 1], [15, 4], [19, 0], [25, 5], [22, 8], [10, 8]], 'k');
    c.poly([[8.4, 6], [11, 2.4], [15, 5.2], [19, 1.4], [23.6, 5.2], [21.4, 7], [10, 7]], 'w');
    c.line(12, 4, 14, 6, 'g').line(19, 3, 18, 6, 'g');
    return c;
  },
  help() {
    const c = N();
    c.poly([[7, 2], [28, 2], [28, 25], [7, 25]], 'k');
    c.rect(8, 3, 19, 21, 'n');
    c.rect(8, 3, 3, 21, 'b');
    c.rect(8, 25, 20, 3, 'k').rect(9, 25, 19, 2, 'w').rect(9, 26, 19, 1, 's');
    c.poly([[4, 6], [8, 2], [8, 28], [4, 31]], 'k');
    c.poly([[5, 6.4], [7, 4.2], [7, 28.2], [5, 29.6]], 'p');
    c.stamp(13, 7, [
      '..kkkkkk..',
      '.kyyyyyyk.',
      'kyyk..kyyk',
      'kyyk..kyyk',
      '.kk..kyyk.',
      '....kyyk..',
      '....kyyk..',
      '.....kk...',
      '....kyyk..',
      '....kyyk..',
      '.....kk...',
    ]);
    return c;
  },
  camera() {
    const c = N();
    c.rect(8, 6, 9, 4, 'k').rect(9, 7, 7, 3, 's');
    c.rect(2, 9, 28, 18, 'k');
    c.rect(3, 10, 26, 16, 's');
    c.rect(3, 10, 25, 1, 'w').rect(3, 10, 1, 15, 'w');
    c.rect(4, 25, 25, 1, 'g').rect(28, 11, 1, 15, 'g');
    c.rect(3, 14, 26, 1, 'd').rect(3, 21, 26, 1, 'd');
    c.disc(16, 18, 7, 'k');
    c.disc(16, 18, 6, 'g');
    c.disc(16, 18, 4.4, 'n');
    c.disc(16, 18, 2.4, 'b');
    c.set(14, 16, 'w').set(13, 17, 'a');
    c.rect(23, 12, 4, 2, 'w').box(22, 11, 6, 4, 'k');
    c.rect(5, 11, 3, 2, 'r');
    return c;
  },
  welcome() {
    const c = N();
    c.raised(1, 3, 30, 26);
    c.rect(3, 5, 26, 3, 'n');
    c.rect(26, 5, 2, 2, 's');
    c.rect(3, 9, 26, 17, 'a');
    c.disc(16, 24, 6, 'y');
    for (const [x0, y0, x1, y1] of [[16, 11, 16, 14], [6, 19, 8, 19], [24, 19, 26, 19], [9, 13, 10, 14], [23, 13, 22, 14]]) c.line(x0, y0, x1, y1, 'y');
    c.rect(3, 23, 26, 3, 'e').rect(3, 23, 26, 1, 'l');
    c.rect(2, 26, 28, 1, 's');
    c.rect(2, 27, 28, 1, 'g').rect(1, 28, 30, 1, 'k');
    c.rect(0, 29, 32, 3, '.');
    return c;
  },
  error() {
    const c = N();
    c.disc(16, 16, 15, 'g');
    c.disc(15, 15, 14, 'k');
    c.disc(15, 15, 13, 'r');
    for (let i = -1; i <= 1; i++) {
      c.line(9 + i, 9, 20 + i, 20, 'w');
      c.line(20 + i, 9, 9 + i, 20, 'w');
    }
    return c;
  },
  warning() {
    const c = N();
    c.poly([[16, 1], [31.5, 29], [0.5, 29]], 'k');
    c.poly([[16, 3.4], [29.4, 27.6], [2.6, 27.6]], 'y');
    c.rect(14, 10, 4, 10, 'k').rect(15, 20, 2, 1, 'k');
    c.rect(14, 22, 4, 3, 'k');
    c.rect(2, 30, 30, 1, 'g');
    return c;
  },
  info() {
    const c = balloon(N());
    c.rect(14, 5, 4, 3, 'b');
    c.rect(13, 10, 5, 2, 'b').rect(14, 12, 4, 7, 'b').rect(12, 19, 8, 2, 'b');
    return c;
  },
  question() {
    const c = balloon(N());
    c.stamp(11, 4, [
      '..bbbbbb..',
      '.bbbbbbbb.',
      'bbb....bbb',
      'bbb....bbb',
      '......bbb.',
      '....bbbb..',
      '....bbb...',
      '....bbb...',
      '..........',
      '....bbb...',
      '....bbb...',
    ]);
    return c;
  },
  keys() {
    const c = N();
    const key = (ox: number, oy: number, fill: string, shade: string) => {
      c.disc(ox + 7, oy + 7, 7, 'k').disc(ox + 7, oy + 7, 6, fill);
      c.disc(ox + 6, oy + 6, 2.6, 'k').disc(ox + 6, oy + 6, 1.6, '.');
      c.set(ox + 3, oy + 4, 'w').set(ox + 4, oy + 3, 'w');
      c.poly([[ox + 9, oy + 13], [ox + 13, oy + 9], [ox + 25, oy + 21], [ox + 21, oy + 25]], 'k');
      c.poly([[ox + 10.4, oy + 13], [ox + 13, oy + 10.4], [ox + 23.6, oy + 21], [ox + 21, oy + 23.6]], fill);
      c.line(ox + 11, oy + 14, ox + 21, oy + 24, shade);
      // teeth
      c.poly([[ox + 14, oy + 20], [ox + 16, oy + 18], [ox + 19, oy + 21], [ox + 17, oy + 23]], 'k');
      c.poly([[ox + 18, oy + 24], [ox + 20, oy + 22], [ox + 22, oy + 24], [ox + 20, oy + 26]], 'k');
      c.poly([[ox + 15.4, oy + 20], [ox + 16, oy + 19.4], [ox + 17.6, oy + 21], [ox + 17, oy + 21.6]], fill);
    };
    key(10, 0, 's', 'g');
    key(1, 6, 'y', 'o');
    return c;
  },
  display() {
    const c = N();
    const s = monitor(c, 3, 2, 26, 21);
    c.rect(s.sx + 1, s.sy + 1, s.sw - 2, s.sh - 2, 'a');
    c.disc(s.sx + 12, s.sy + 4, 2.5, 'y');
    c.poly([[s.sx + 1, s.sy + s.sh - 1], [s.sx + 6, s.sy + 4], [s.sx + 10, s.sy + 8], [s.sx + 13, s.sy + 6], [s.sx + s.sw - 1, s.sy + s.sh - 1]], 'e');
    c.rect(11, 23, 10, 2, 'k').rect(7, 25, 18, 3, 'k').rect(8, 25, 16, 2, 's');
    c.rect(18, 26, 5, 1, 'g');
    return c;
  },
  mouse() {
    const c = N();
    c.line(16, 9, 16, 6, 'k').line(16, 6, 19, 3, 'k').line(19, 3, 25, 3, 'k').line(25, 3, 28, 0, 'k');
    c.ellipse(16, 20, 9, 12, 'k');
    c.ellipse(16, 20, 8, 11, 's');
    c.rect(8, 16, 17, 1, 'k');
    c.rect(16, 9, 1, 7, 'k');
    c.ellipse(12, 13, 3, 2.5, 'w');
    c.rect(10, 18, 2, 8, 'w').rect(21, 18, 2, 9, 'g');
    return c;
  },
  speaker() {
    const c = N();
    c.rect(3, 11, 8, 11, 'k').rect(4, 12, 6, 9, 's').rect(4, 12, 6, 1, 'w');
    c.poly([[10, 11], [19, 3], [19, 29], [10, 22]], 'k');
    c.poly([[11, 11.6], [18, 5.4], [18, 26.6], [11, 21.4]], 's');
    c.line(12, 12, 17, 7, 'w');
    for (const [x, r] of [[21, 4], [24, 7], [27, 10]] as const) {
      c.line(x, 16 - r, x + 1, 16 - r + 1, 'k').line(x + 1, 16 - r + 1, x + 2, 16 - r + 3, 'k');
      c.line(x + 2, 16 - r + 3, x + 2, 16 + r - 3, 'k');
      c.line(x + 2, 16 + r - 3, x + 1, 16 + r - 1, 'k').line(x + 1, 16 + r - 1, x, 16 + r, 'k');
    }
    return c;
  },
  'speaker-mute'() {
    const c = N();
    c.rect(3, 11, 8, 11, 'k').rect(4, 12, 6, 9, 's').rect(4, 12, 6, 1, 'w');
    c.poly([[10, 11], [19, 3], [19, 29], [10, 22]], 'k');
    c.poly([[11, 11.6], [18, 5.4], [18, 26.6], [11, 21.4]], 's');
    c.disc(24, 21, 7.5, 'r').disc(24, 21, 5, '.');
    for (let i = 0; i < 2; i++) c.line(19 + i, 26, 28 + i, 16, 'r');
    return c;
  },
  control() {
    const c = N();
    c.raised(2, 3, 28, 26);
    c.rect(4, 5, 24, 2, 'n');
    for (const [x, ky, col] of [[8, 16, 'r'], [16, 11, 'e'], [24, 19, 'b']] as const) {
      c.rect(x, 9, 1, 17, 'g').rect(x + 1, 9, 1, 17, 'w');
      c.raised(x - 3, ky, 8, 5, col);
    }
    return c;
  },
  floppy() {
    const c = N();
    c.poly([[3, 2], [27, 2], [30, 5], [30, 30], [3, 30]], 'k');
    c.poly([[4, 3], [26.6, 3], [29, 5.4], [29, 29], [4, 29]], 'd');
    c.rect(9, 3, 15, 10, 's').rect(9, 3, 15, 1, 'w');
    c.rect(19, 5, 3, 6, 'k');
    c.rect(7, 16, 19, 13, 'w').box(7, 16, 19, 13, 'k');
    c.rect(7, 16, 19, 3, 'b');
    for (const y of [21, 23, 25]) c.rect(9, y, 15, 1, 'g');
    c.rect(5, 26, 1, 2, 'k');
    return c;
  },
  drive() {
    const c = N();
    c.poly([[2, 13], [7, 8], [30, 8], [30, 20], [25, 25], [2, 25]], 'k');
    c.poly([[7.4, 9], [29, 9], [24.6, 13], [3, 13]], 'u');
    c.poly([[25, 14], [29, 10], [29, 20], [25, 24]], 'g');
    c.rect(3, 14, 22, 10, 's');
    c.rect(3, 14, 22, 1, 'w');
    c.rect(5, 18, 13, 1, 'g').rect(5, 20, 13, 1, 'g');
    c.rect(20, 19, 2, 1, 'l');
    return c;
  },
  cd() {
    const c = N();
    c.disc(16, 16, 15, 'k');
    c.disc(16, 16, 14, 's');
    c.poly([[16, 16], [16, 2], [24, 4]], 'a').poly([[16, 16], [24, 4], [29, 10]], 'c');
    c.poly([[16, 16], [3, 22], [8, 28]], 'y').poly([[16, 16], [8, 28], [14, 30]], 'h');
    c.disc(16, 16, 14, '.');
    c.disc(16, 16, 15, 'k');
    c.disc(16, 16, 14, 's');
    c.poly([[16, 16], [17, 2], [26, 6]], 'a');
    c.poly([[16, 16], [26, 6], [30, 13]], 'c');
    c.poly([[16, 16], [2, 20], [6, 27]], 'h');
    c.disc(16, 16, 5, 'w');
    c.disc(16, 16, 3.5, 'k');
    c.disc(16, 16, 2.4, '.');
    return c;
  },
  image() {
    const c = N();
    c.rect(2, 5, 28, 23, 'k');
    c.rect(3, 6, 26, 21, 'w');
    c.rect(5, 8, 22, 17, 'a');
    c.disc(21, 12, 3, 'y');
    c.poly([[5, 25], [11, 15], [16, 21], [20, 17], [27, 25]], 'e');
    c.poly([[11, 15], [13, 18.5], [9.5, 18]], 'l');
    return c;
  },
  find() {
    const c = N();
    c.poly([[3, 1], [17, 1], [21, 5], [21, 26], [3, 26]], 'k');
    c.poly([[4, 2], [16.6, 2], [20, 5.4], [20, 25], [4, 25]], 'w');
    for (const y of [6, 8, 10, 12]) c.rect(6, y, 11, 1, 'g');
    thick(c, 22, 23, 28, 29, 'k', 3);
    thick(c, 23, 23, 28, 28, 'm', 1);
    c.disc(18, 18, 7, 'k');
    c.disc(18, 18, 5.6, 'a');
    c.set(15, 15, 'w').set(16, 15, 'w').set(15, 16, 'w');
    return c;
  },
  run() {
    const c = N();
    c.raised(2, 4, 28, 24);
    c.rect(4, 6, 24, 3, 'n');
    c.rect(4, 10, 24, 16, 'w').box(4, 10, 24, 16, 'g');
    c.poly([[11, 13], [23, 18], [11, 23]], 'k');
    c.poly([[12, 14.6], [20.6, 18], [12, 21.4]], 'l');
    return c;
  },
  shutdown() {
    const c = N();
    const s = monitor(c, 4, 1, 24, 20);
    c.rect(s.sx + 1, s.sy + 1, s.sw - 2, s.sh - 2, 'n');
    c.disc(17, 10, 4, 'y').disc(19, 9, 3.6, 'n');
    c.set(12, 7, 'w').set(22, 13, 'w').set(13, 13, 'w');
    c.rect(12, 21, 8, 2, 'k').rect(6, 23, 20, 6, 'k').rect(7, 24, 18, 4, 's').rect(7, 24, 18, 1, 'w');
    c.rect(19, 26, 4, 1, 'r');
    return c;
  },
  start() {
    const c = N();
    c.stamp(4, 3, KNIGHT);
    c.swap('w', 'n', 0, 0, 32, 22);
    // light along the knight's face and mane
    for (const [x, y] of [[15, 5], [14, 6], [13, 7], [12, 8], [11, 9], [10, 10], [9, 11], [8, 12], [7, 12], [16, 4]]) c.set(x, y, 'b');
    for (const [x, y] of [[20, 8], [21, 9], [22, 10], [23, 11], [24, 12], [24, 13], [24, 14], [24, 15]]) c.set(x, y, 'b');
    c.set(13, 8, 'w').set(12, 8, 'w');
    c.swap('w', 'c', 0, 22, 32, 4);
    c.rect(8, 24, 20, 1, 'y');
    return c;
  },
  desktop() {
    const c = N();
    c.rect(2, 4, 28, 22, 'k');
    c.rect(3, 5, 26, 20, 't');
    for (const [x, y, col] of [[6, 8, 'y'], [6, 15, 'w'], [13, 8, 's']] as const) c.rect(x, y, 5, 4, col).box(x, y, 5, 4, 'k');
    c.rect(3, 22, 26, 3, 's').rect(3, 22, 26, 1, 'w');
    c.rect(4, 23, 6, 1, 'k');
    c.line(18, 18, 27, 9, 'k').line(19, 18, 28, 9, 'y').line(19, 19, 28, 10, 'o');
    c.set(17, 19, 'k').set(18, 19, 'm');
    return c;
  },
  'tb-back'() {
    const c = new Canvas(20, 20);
    c.poly([[1, 10], [9, 2], [9, 6], [18, 6], [18, 14], [9, 14], [9, 18]], 'k');
    c.poly([[2.8, 10], [8, 4.8], [8, 7], [17, 7], [17, 13], [8, 13], [8, 15.2]], 'e');
    c.poly([[3.2, 10], [8, 5.2], [8, 7.5], [16.5, 7.5], [16.5, 9.5], [7, 9.5]], 'l');
    return c;
  },
  'tb-forward'() {
    const c = new Canvas(20, 20);
    c.poly([[19, 10], [11, 2], [11, 6], [2, 6], [2, 14], [11, 14], [11, 18]], 'k');
    c.poly([[17.2, 10], [12, 4.8], [12, 7], [3, 7], [3, 13], [12, 13], [12, 15.2]], 'e');
    c.poly([[16.8, 10], [12, 5.2], [12, 7.5], [3.5, 7.5], [3.5, 9.5], [13, 9.5]], 'l');
    return c;
  },
  'tb-up'() {
    const c = new Canvas(20, 20);
    c.poly([[1, 8], [2, 6], [7, 6], [8, 8], [18, 8], [18, 19], [1, 19]], 'k');
    c.rect(2, 9, 15, 9, 'y').rect(2, 7, 5, 2, 'y').rect(2, 9, 15, 1, 'h');
    c.poly([[9.5, 1], [15, 6.5], [12, 6.5], [12, 14], [7, 14], [7, 6.5], [4, 6.5]], 'k');
    c.poly([[9.5, 2.6], [13, 5.6], [11, 5.6], [11, 13], [8, 13], [8, 5.6], [6, 5.6]], 'w');
    return c;
  },
  'tb-refresh'() {
    const c = new Canvas(20, 20);
    c.disc(10, 10, 8.5, 'k').disc(10, 10, 7, 'l').disc(10, 10, 4, 'k').disc(10, 10, 3, '.');
    c.rect(9, 0, 11, 9, '.');
    c.poly([[10, 1], [17, 1], [17, 8]], 'k');
    c.poly([[11.6, 2], [16, 2], [16, 6.4]], 'e');
    c.rect(1, 11, 2, 2, 'k');
    return c;
  },
  plan() {
    const c = new Canvas(20, 20);
    c.rect(1, 2, 18, 16, 'k').rect(2, 3, 16, 14, 'w');
    c.box(4, 5, 12, 10, 'n');
    c.rect(9, 5, 1, 5, 'n').rect(4, 10, 3, 1, 'n').rect(12, 10, 4, 1, 'n').rect(12, 5, 1, 3, 'n');
    c.rect(5, 11, 4, 3, 'h').rect(10, 6, 2, 3, 'a');
    return c;
  },
  'tb-views'() {
    const c = new Canvas(20, 20);
    for (const [x, y] of [[2, 2], [11, 2], [2, 11], [11, 11]]) {
      c.rect(x, y, 7, 7, 'k').rect(x + 1, y + 1, 5, 5, 'y').rect(x + 1, y + 1, 5, 1, 'w');
    }
    return c;
  },
  'tb-send'() {
    const c = new Canvas(20, 20);
    c.rect(1, 5, 15, 11, 'k').rect(2, 6, 13, 9, 'w');
    c.line(2, 6, 8, 11, 'k').line(14, 6, 8, 11, 'k');
    c.poly([[11, 13], [19, 13], [15, 9.5]], 'e').rect(13, 13, 4, 5, 'e').box(13, 13, 4, 5, 'k');
    c.line(11, 13, 15, 9, 'k').line(15, 9, 19, 13, 'k');
    return c;
  },
  'tb-print'() {
    const c = new Canvas(20, 20);
    c.rect(5, 1, 10, 7, 'k').rect(6, 2, 8, 6, 'w');
    c.rect(1, 7, 18, 9, 'k').rect(2, 8, 16, 7, 's').rect(2, 8, 16, 1, 'w');
    c.rect(14, 10, 2, 1, 'l');
    c.rect(5, 13, 10, 6, 'k').rect(6, 14, 8, 5, 'w');
    c.rect(7, 15, 6, 1, 'g').rect(7, 17, 5, 1, 'g');
    return c;
  },
  'tb-zoomin'() {
    const c = new Canvas(20, 20);
    c.disc(8, 8, 7, 'k').disc(8, 8, 5.6, 'w');
    c.rect(5, 7, 6, 2, 'k').rect(7, 5, 2, 6, 'k');
    for (let i = 0; i < 3; i++) c.line(12 + i, 13, 17 + i, 18, 'm');
    return c;
  },
  'tb-zoomout'() {
    const c = new Canvas(20, 20);
    c.disc(8, 8, 7, 'k').disc(8, 8, 5.6, 'w');
    c.rect(5, 7, 6, 2, 'k');
    for (let i = 0; i < 3; i++) c.line(12 + i, 13, 17 + i, 18, 'm');
    return c;
  },
  'tb-fit'() {
    const c = new Canvas(20, 20);
    c.rect(2, 3, 16, 14, 'k').rect(3, 4, 14, 12, 'a');
    c.poly([[3, 16], [8, 9], [11, 13], [13, 11], [17, 16]], 'e');
    for (const [x, y, dx, dy] of [[1, 1, 1, 1], [18, 1, -1, 1], [1, 18, 1, -1], [18, 18, -1, -1]]) {
      c.set(x, y, 'k').set(x + dx, y, 'k').set(x, y + dy, 'k');
    }
    return c;
  },
  'tb-stop'() {
    const c = new Canvas(20, 20);
    c.disc(10, 10, 9, 'k').disc(10, 10, 8, 'r');
    for (let i = -1; i <= 0; i++) {
      c.line(6 + i, 6, 13 + i, 13, 'w');
      c.line(13 + i, 6, 6 + i, 13, 'w');
    }
    return c;
  },
  grip() {
    const c = new Canvas(12, 12);
    for (const o of [0, 4, 8]) {
      c.line(11, o, o, 11, 'w');
      c.line(11, o + 1, o + 1, 11, 'g');
      c.line(11, o + 2, o + 2, 11, 'g');
    }
    return c;
  },
  shortcut() {
    const c = N();
    c.rect(0, 21, 11, 11, 'k');
    c.rect(1, 22, 9, 9, 'w');
    c.stamp(2, 23, [
      '...kkkk',
      '....kkk',
      '...kkkk',
      '..kk.kk',
      '.kk...k',
      '.k.....',
      '.k.....',
    ]);
    return c;
  },
};

export const ICON_NAMES = Object.keys(ICONS);
