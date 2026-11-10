// scripts/google-list.mjs: reading a shared list's answer, without asking Google.
// The answer below is made up, in the shape Google sends (")]}'" then JSON).
import { compare, listId, parseList, placeNumber } from './google-list.mjs';

let failed = 0;
const ok = (cond: boolean, name: string, extra = '') => {
  if (cond) console.log(`PASS ${name}`);
  else { failed++; console.log(`FAIL ${name} ${extra}`); }
};

const place = (name: string, address: string, lat: number, lng: number, signed: string, note = '') =>
  [null, [null, null, `${name}, ${address}`, null, address, [null, null, lat, lng], ['123', signed], '/g/x'], name, note];
const answer = ")]}'\n" + JSON.stringify([[
  ['LISTID', 1, null, 1, 1], 4, [2, 1, 'https://www.google.com/maps/placelists/list/LISTID'],
  ['Someone Private', 'https://example.org/face.jpg', '1000'], 'Weekend list', '', null, null,
  [
    place('Chez Exemple', '1 Rue Exemple, 75003 Paris', 48.8619, 2.3601, '5750501904841008585', 'Also the coffee'),
    place('Bistro Négatif', '2 Rue Exemple, 75011 Paris', 48.8536, 2.3809, '-8220894163020210397'),
    [null, null, 'no point'],
  ],
]]);

const l = parseList(answer);
ok(l.name === 'Weekend list' && l.places.length === 2, 'the list name and its places (one without a point skipped)', JSON.stringify(l));
ok(!JSON.stringify(l).includes('Someone Private') && !JSON.stringify(l).includes('face.jpg'), "the list owner's name and picture are never kept");
ok(JSON.stringify(l.places[0].coordinates) === '[2.3601,48.8619]', 'points are [longitude, latitude]');
ok(l.places[0].note === 'Also the coffee' && l.places[0].maps === 'https://maps.google.com/?cid=5750501904841008585', 'the note and the place page');
ok(placeNumber('-8220894163020210397') === '10225849910689341219' && placeNumber('x') === '', "a negative id becomes Google's unsigned place number");
let threw = false;
try { parseList('<html>Our systems have detected unusual traffic</html>'); } catch { threw = true; }
ok(threw, "a 'sorry' page is not read as a list");

ok(listId('https://www.google.com/maps/placelists/list/AbCdEfGhIjKlMnOpQrStUvWxYz0123?shh=CAE') === 'AbCdEfGhIjKlMnOpQrStUvWxYz0123', 'the id from a share link');
ok(listId('https://example.org/maps/placelists/list/AbCdEfGhIjKlMnOpQrStUvWxYz0123') === null && listId('not a link') === null, 'only Google links');

const items = [
  { id: 'B1', name: 'Chez Exemple', coordinates: [2.36011, 48.86191] },
  { id: 'B2', name: 'Somewhere else', coordinates: [2.3, 48.85], links: ['https://maps.google.com/?cid=10225849910689341219'] },
  { id: 'C1', name: 'Gone Café', coordinates: [2.31, 48.84] },
];
const c = compare(l.places, items);
ok(c.known.map((k: { id: string }) => k.id).join() === 'B1,B2' && c.fresh.length === 0, 'matched by name and distance, or by the place page in links', JSON.stringify(c.known));
ok(c.gone.length === 1 && c.gone[0].id === 'C1', 'a guide entry the list no longer has');

if (failed) {
  console.log(`${failed} FAILED`);
  process.exit(1);
}
console.log('all passed');
