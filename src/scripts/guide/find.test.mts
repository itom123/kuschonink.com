// npm test: the Field Guide's Find ranking (match.ts) and Where am I? (locate.ts).
import { field, fit, ranges, score, search, words, worthShowing, type Entry } from './match.ts';
import { distance, distanceText, nearest, walkMinutes } from './locate.ts';

let fails = 0;
const ok = (cond: boolean, name: string, extra = '') => {
  if (!cond) fails++;
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};

// ---- fit ----
ok(fit('irving penn', 'irv') === 1, 'a word at the start of a text fits best');
ok(fit('irving penn', 'pen') === 0.8, 'a word at the start of a later word');
ok(fit('irving penn', 'enn') === 0.5, 'a word inside another word');
ok(fit('irving penn', 'xyz') === 0, 'a word that is not there');
ok(fit('galerie (echo 119)', 'echo') === 0.8, 'punctuation counts as a word break');
ok(fit('欧洲摄影之家', '摄影') === 0.8, 'Chinese: any substring counts as a word start');

// ---- words, worthShowing ----
ok(words('  Écho   119 ').join('|') === 'echo|119', 'words: normalised and split', words('  Écho   119 ').join('|'));
ok(!worthShowing('a'), 'one Latin letter: no drop-down');
ok(worthShowing('ab'), 'two letters: a drop-down');
ok(worthShowing('3'), 'a digit: a drop-down (ids like A3)');
ok(worthShowing('摄'), 'one Chinese character: a drop-down');

// ---- score and search ----
const item = (id: string, tier: string, name: string, by = '', other = ''): Entry => ({
  kind: 'item', id, tier, name, fields: [field(10, name), field(12, id), field(7, by), field(3, other)],
});
const entries: Entry[] = [
  item('A3', 'A', 'Fondation Henri Cartier-Bresson', 'Irving Penn', 'Marais photography'),
  item('A4', 'A', 'Galerie Pennings', 'Irving Penn', 'Marais'),
  item('B2', 'B', 'Penninghen school show', 'Students', 'Saint-Germain'),
  item('C1', 'C', 'Galerie Écho 119', 'Various', 'Bastille'),
  { kind: 'listing', id: 'D12', name: 'Écho Bookshop', fields: [field(10, 'Écho Bookshop'), field(12, 'D12')] },
  { kind: 'route', id: 'marais', name: { en: 'Marais walk', zh: '玛黑步行' }, fields: [field(10, { en: 'Marais walk', zh: '玛黑步行' })] },
];
ok(score(entries[0], ['penn']) > 0, 'a match on the artist counts');
ok(score(entries[0], ['penn', 'nowhere']) === 0, 'every word must match');
ok(score(entries[0], ['marais', 'penn']) === score(entries[0], ['penn', 'marais']), 'word order does not matter');
const penn = search(entries, 'Penn').map((h) => h.e.id);
ok(penn.join(',') === 'B2,A4,A3', 'Penn: a name that starts with it, then a name with it, then the artist alone', penn.join(','));
ok(search(entries, 'a3')[0]?.e.id === 'A3', 'an id typed as is comes first');
const echo = search(entries, 'echo').map((h) => h.e.id);
ok(echo[0] === 'D12' && echo[1] === 'C1', 'accents do not count; a name that starts with the word wins', echo.join(','));
ok(search(entries, '玛黑')[0]?.e.id === 'marais', 'Chinese finds a route by its Chinese name');
ok(search(entries, '').length === 0 && search(entries, '   ').length === 0, 'an empty box finds nothing');
const tie = search([item('B9', 'B', 'Penn show'), item('A9', 'A', 'Penn show')], 'penn').map((h) => h.e.id);
ok(tie.join(',') === 'A9,B9', 'equal scores: the higher tier first', tie.join(','));

// ---- ranges (for the marked letters) ----
const r1 = ranges('Galerie Écho 119', ['echo']);
ok(JSON.stringify(r1) === JSON.stringify([[8, 12]]), 'ranges: an accented word is marked whole', JSON.stringify(r1));
const r2 = ranges('Œuvre Penn', ['oeuvre', 'penn']);
ok(JSON.stringify(r2) === JSON.stringify([[0, 5], [6, 10]]), 'ranges: a ligature and a second word', JSON.stringify(r2));
const r3 = ranges('Irving Penn', ['irv', 'irving']);
ok(JSON.stringify(r3) === JSON.stringify([[0, 6]]), 'ranges: overlapping matches merge', JSON.stringify(r3));
ok(ranges('Irving Penn', ['zzz']).length === 0, 'ranges: nothing to mark');

// ---- locate ----
const louvre: [number, number] = [2.3376, 48.8606];
const notreDame: [number, number] = [2.3499, 48.853];
const d = distance(louvre, notreDame);
ok(d > 1150 && d < 1250, 'distance: the Louvre to Notre-Dame is about 1.2 km', d.toFixed(0));
ok(distance(louvre, louvre) === 0, 'distance: a point to itself');
ok(walkMinutes(800) === 13 && walkMinutes(5) === 1, 'walking minutes: 800 m is about 13 min; never 0', `${walkMinutes(800)}, ${walkMinutes(5)}`);
ok(distanceText(340).en === '340 m' && distanceText(340).zh === '340 米', 'distance text: metres');
ok(distanceText(4).en === '10 m', 'distance text: never under 10 m');
ok(distanceText(1234).en === '1.2 km' && distanceText(1234).zh === '1.2 公里', 'distance text: kilometres');
ok(distanceText(12345).en === '12 km', 'distance text: whole kilometres from 10 km');
const near = nearest(louvre, [{ id: 'far', coordinates: [2.4, 48.9] as [number, number] }, { id: 'nd', coordinates: notreDame }, { id: 'here', coordinates: louvre }], 2);
ok(near.map((x) => x.id).join(',') === 'here,nd', 'nearest: the closest first, cut to n', near.map((x) => x.id).join(','));

console.log(fails ? `\n${fails} failed` : '\nall passed');
// Node runs this file (npm test); the site's type check knows only the browser.
const node = (globalThis as { process?: { exitCode?: number } }).process;
if (fails && node) node.exitCode = 1;
