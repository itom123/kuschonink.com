// npm test: Paint's Fill With Color (src/scripts/paint/fill.ts) on small made-up pictures.
import { floodFill, type Pixels } from './fill.ts';

const W = 12, H = 12;
const blank = (rgb = [255, 255, 255]): Pixels => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([...rgb, 255], i * 4);
  return { width: W, height: H, data };
};
const set = (img: Pixels, x: number, y: number, rgb: number[]) => img.data.set([...rgb, 255], (y * W + x) * 4);
const at = (img: Pixels, x: number, y: number) => [...img.data.slice((y * W + x) * 4, (y * W + x) * 4 + 3)];
const box = (img: Pixels, x0: number, y0: number, x1: number, y1: number, rgb: number[]) => {
  for (let x = x0; x <= x1; x++) { set(img, x, y0, rgb); set(img, x, y1, rgb); }
  for (let y = y0; y <= y1; y++) { set(img, x0, y, rgb); set(img, x1, y, rgb); }
};
const RED: [number, number, number, number] = [255, 0, 0, 255];
const same = (a: number[], b: number[], slack = 1) => a.every((v, i) => Math.abs(v - b[i]) <= slack);

let fails = 0;
const ok = (cond: boolean, name: string, extra = '') => {
  if (!cond) fails++;
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};

{
  // A black box: filling inside stays inside.
  const img = blank();
  box(img, 2, 2, 9, 9, [0, 0, 0]);
  const b = floodFill(img, 5, 5, RED);
  ok(same(at(img, 5, 5), [255, 0, 0]) && same(at(img, 3, 3), [255, 0, 0]), 'fills the inside');
  ok(same(at(img, 2, 2), [0, 0, 0]) && same(at(img, 9, 5), [0, 0, 0]), 'the black border stays black');
  ok(same(at(img, 0, 0), [255, 255, 255]) && same(at(img, 11, 11), [255, 255, 255]), 'outside is untouched');
  ok(!!b && b.x === 2 && b.y === 2 && b.w === 8 && b.h === 8, 'reports the changed box', JSON.stringify(b));
}
{
  // A one-pixel line across the picture: the fill doesn't cross it.
  const img = blank();
  for (let x = 0; x < W; x++) set(img, x, 6, [0, 0, 0]);
  floodFill(img, 3, 2, RED);
  ok(same(at(img, 3, 2), [255, 0, 0]) && same(at(img, 3, 9), [255, 255, 255]) && same(at(img, 3, 6), [0, 0, 0]), 'a 1-pixel line keeps the fill on its side');
}
{
  // A pale yellow line (light, but a real colour) still holds the fill.
  const img = blank();
  for (let x = 0; x < W; x++) set(img, x, 6, [255, 255, 128]);
  floodFill(img, 3, 2, RED);
  ok(same(at(img, 3, 9), [255, 255, 255]), 'a pale line holds the fill too');
}
{
  // Soft edge: a grey pixel half black, half white, next to the black ink.
  // After filling the white with red it should be half black, half red.
  const img = blank();
  for (let x = 0; x < W; x++) { set(img, x, 6, [128, 128, 128]); set(img, x, 7, [0, 0, 0]); }
  floodFill(img, 3, 2, RED);
  ok(same(at(img, 4, 6), [128, 1, 1], 2), 'a soft edge keeps its ink and takes the new colour (no white halo)', JSON.stringify(at(img, 4, 6)));
  ok(same(at(img, 4, 7), [0, 0, 0]), 'the ink itself is untouched');
}
{
  // Nearly white (JPEG noise, a faint smudge) is filled with the rest.
  const img = blank();
  set(img, 4, 4, [250, 251, 249]);
  floodFill(img, 0, 0, RED);
  ok(same(at(img, 4, 4), [255, 0, 0]), 'near-white is filled with the white around it');
}
{
  const img = blank([255, 0, 0]);
  ok(floodFill(img, 1, 1, RED) === null, 'filling with the colour already there changes nothing');
  ok(floodFill(img, -1, 3, [0, 0, 0, 255]) === null && floodFill(img, W, 3, [0, 0, 0, 255]) === null, 'outside the picture changes nothing');
}

console.log(fails ? `${fails} FAILED` : 'all passed');
// Node runs this file (npm test); the site's type check knows only the browser.
const node = (globalThis as { process?: { exitCode?: number } }).process;
if (fails && node) node.exitCode = 1;
