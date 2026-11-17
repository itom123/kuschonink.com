// npm test: the scrolling status bar field (src/scripts/desktop/marquee.ts).
import { marqueeFrames, REST, SPEED } from './marquee.ts';

let fails = 0;
const ok = (cond: boolean, name: string, extra = '') => {
  if (!cond) fails++;
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;

{
  // Words 300 px wide in a 120 px field.
  const { duration, frames } = marqueeFrames(300, 120);
  const off = frames.map((f) => f.offset as number);
  const at = frames.map((f) => f.textIndent);
  ok(duration === Math.round(REST + (420 / SPEED) * 1000), 'one pass: the rest, then 420 px at the set speed', String(duration));
  ok(off.every((o, i) => i === 0 || o >= off[i - 1]) && off[0] === 0 && off[off.length - 1] === 1, 'offsets run from 0 to 1 in order', off.join(' '));
  ok(at[0] === '0px' && at[1] === '0px' && near(off[1], REST / duration), 'the words rest at their start first');
  ok(at[2] === '-300px' && at[3] === '120px' && off[2] === off[3], 'gone off the left edge, then back in at the right edge at once', `${at[2]} ${at[3]}`);
  ok(at[4] === '0px', 'and back at their start to end the pass');
  // The same speed out and back: time is in proportion to distance.
  const outT = (off[2] - off[1]) * duration, backT = (off[4] - off[3]) * duration;
  ok(near(outT / 300, backT / 120, 1e-3), 'the same speed leaving and coming back', `${(300 / outT * 1000).toFixed(1)} / ${(120 / backT * 1000).toFixed(1)} px/s`);
  ok(near(300 / outT * 1000, SPEED, 0.5), 'at SPEED pixels a second');
}
{
  // Wider words take longer.
  ok(marqueeFrames(600, 120).duration > marqueeFrames(300, 120).duration, 'longer words, a longer pass');
}

console.log(fails ? `\n${fails} failed` : '\nall passed');
// Node runs this file (npm test); the site's type check knows only the browser.
const node = (globalThis as { process?: { exitCode?: number } }).process;
if (fails && node) node.exitCode = 1;
