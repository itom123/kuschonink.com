// npm test: the Field Guide's Places orders, "Sort by:" (src/scripts/guide/order.ts).
import { DEFAULT_SORT, loadSort, nameKey, saveSort, sortInUse, sortRows, type SortRow } from './order.ts';

let fails = 0;
const ok = (cond: boolean, name: string, extra = '') => {
  if (!cond) fails++;
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};

const row = (id: string, name: string, more: Partial<SortRow> = {}): SortRow => ({ id, name, tier: id[0], ...more });
const ids = (rows: SortRow[]) => rows.map((r) => r.id).join(' ');
const rows: SortRow[] = [
  row('B13', 'Écho 119', { zone: 0, code: 'scheduled', m: 900 }),
  row('A10', 'BnF François Mitterrand', { zone: 2, code: 'appointment', m: 300 }),
  row('A2', 'Ithaque', { zone: 0, code: 'confirm', m: null }),
  row('C1', 'Editions Firmin-Didot', { zone: 0, code: 'scheduled', m: 120 }),
  row('A6', 'LE BAL', { zone: 1, code: 'scheduled', m: 300 }),
  row('B12', 'La Hune', { zone: 1, code: 'scheduled', m: 2000 }),
  row('D01', '« Lectures de Portfolio »', {}),
];

// ---- Recommended (the default): tier, then the number in the ref ----
ok(ids(sortRows(rows, 'tier')) === 'A2 A6 A10 B12 B13 C1 D01', 'recommended: tier, then ref (A2 before A10)', ids(sortRows(rows, 'tier')));
ok(DEFAULT_SORT === 'tier', 'the default order is the recommended one');

// ---- Name: A-Z, case, accents and leading quotes don't count ----
ok(nameKey('Écho 119') === 'echo 119', 'nameKey drops accents and case', nameKey('Écho 119'));
ok(nameKey('« Lectures »') === 'lectures »', 'nameKey drops leading quotes', nameKey('« Lectures »'));
ok(ids(sortRows(rows, 'name')) === 'A10 B13 C1 A2 B12 A6 D01', 'name: É sorts with E, "LE BAL" after "La Hune", quotes ignored', ids(sortRows(rows, 'name')));

// ---- Area: the guide's own order of areas, then tier ----
ok(ids(sortRows(rows, 'zone')) === 'A2 B13 C1 A6 B12 A10 D01', 'area: by the areas\' order, then tier; no area last', ids(sortRows(rows, 'zone')));

// ---- Open that day first: open, then check first, then appointment only ----
ok(ids(sortRows(rows, 'open')) === 'A6 B12 B13 C1 A2 A10 D01', 'open first: walk-in, then check first, then appointment', ids(sortRows(rows, 'open')));

// ---- Nearest first: metres, ties by tier; no distance last ----
ok(ids(sortRows(rows, 'near')) === 'C1 A6 A10 B13 B12 A2 D01', 'nearest: by metres, a tie by tier, no position last', ids(sortRows(rows, 'near')));

// ---- sortRows leaves its input alone ----
const before = ids(rows);
sortRows(rows, 'name');
ok(ids(rows) === before, 'sortRows returns a new array');

// ---- The order in use, and what is saved ----
ok(sortInUse('open', false, false) === 'tier', 'open first without a chosen day: the default');
ok(sortInUse('open', true, false) === 'open', 'open first with a chosen day');
ok(sortInUse('near', true, false) === 'tier', 'nearest first without a position: the default');
ok(sortInUse('near', false, true) === 'near', 'nearest first with a position');
ok(sortInUse('name', false, false) === 'name', 'name always applies');
ok(saveSort('near') === 'tier', 'nearest first is never saved');
ok(saveSort('zone') === 'zone' && saveSort('open') === 'open', 'other orders are saved');
ok(loadSort('near') === 'tier' && loadSort('bogus') === 'tier' && loadSort(undefined) === 'tier', 'a saved nearest first, or junk, reads back as the default');
ok(loadSort('name') === 'name' && loadSort('open') === 'open', 'a saved order reads back');

console.log(fails ? `${fails} FAILED` : 'All order tests passed.');
// Node runs this file (npm test); the site's type check knows only the browser.
const node = (globalThis as { process?: { exitCode?: number } }).process;
if (fails && node) node.exitCode = 1;
