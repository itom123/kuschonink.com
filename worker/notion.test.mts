// npm test: the Notion client (worker/notion.ts) and the suggestion schema
// (worker/suggestions.ts), against the local stand-in (scripts/dev/notion-standin.mjs).
import { notion, NotionError, P, R, texts } from './notion.ts';
import { contactProps, readSuggestion, suggestionProps, S, type Suggestion } from './suggestions.ts';
// @ts-expect-error: plain JS module
import { standIn } from '../scripts/dev/notion-standin.mjs';

let fails = 0;
function check(name: string, ok: boolean, detail: unknown = '') {
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail));
}

const s = standIn({ token: 'test-token' });
const waits: number[] = [];
const n = notion({ token: 'test-token', fetch: s.fetch, base: s.base, wait: async (ms) => { waits.push(ms); } });

const sugg: Suggestion = {
  guide: 'paris-2026-11', kind: 'exhibition', name: 'Galerie Exemple', show: 'Winter Light', artists: 'Ana Silva / Bo Chen',
  start: '2026-11-08', end: '2026-12-20', hours: 'Tue–Sat 11:00–19:00', address: '1 rue Exemple, 75003 Paris', website: 'https://exemple.fr/',
  links: ['https://exemple.fr/winter', 'https://instagram.com/exemple'], description: 'x'.repeat(2500), own: true, pictureCredit: 'Photo: Ana Silva',
  rights: true, submitter: 'Ana Silva', email: 'ana@example.com', mayContact: true, creditAs: 'Ana Silva', lang: 'en',
};

check('texts: cut into 2000-character pieces', texts('y'.repeat(4500)).length === 3 && texts('').length === 0 && texts('é'.repeat(2001)).length === 2);

const up = await n.uploadFile('picture.jpg', 'image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
check('uploadFile: an id once sent', typeof up === 'string' && s.files.get(up)?.status === 'uploaded');

const page = await n.createPage('ds-suggestions', suggestionProps(sugg, { reference: 'S-7F3K', submission: 'uuid-1', audience: 'visitor', fingerprint: 'fp-1', duplicate: '', picture: { id: up, name: 'picture.jpg' } }));
const row = readSuggestion(page);
check('a suggestion survives the round trip', row.name === 'Galerie Exemple' && row.status === 'NEW' && row.kind === 'exhibition' && row.start === '2026-11-08' && row.end === '2026-12-20' && row.links.length === 2 && row.own && row.rights && row.reference === 'S-7F3K' && row.tier === 'C' && row.showTo === 'Everyone', row);
check('a long description comes back whole', row.description.length === 2500);
check('the picture is attached and can be downloaded', row.pictures.length === 1 && (await (await s.fetch(row.pictures[0].url)).arrayBuffer()).byteLength === 4, row.pictures);
check('no private data in the Suggestions page', !JSON.stringify(page).includes('ana@example.com'));

const contact = await n.createPage('ds-contacts', contactProps(sugg, { reference: 'S-7F3K', submission: 'uuid-1', audience: 'visitor', fingerprint: 'fp-1', duplicate: '' }, page.id));
check('the contact page holds the email and consent', R.email(contact, 'Email') === 'ana@example.com' && R.checkbox(contact, 'May contact') && R.text(contact, 'Suggestion') === page.id);
check('no consent without an email', contactProps({ ...sugg, email: '' }, { reference: 'r', submission: 'u', audience: 'visitor', fingerprint: '', duplicate: '' }, 'p')['May contact'].checkbox === false);

await n.updatePage(page.id, { [S.status]: P.select('APPROVED'), [S.notes]: P.text('Use the gallery site for hours') });
const again = readSuggestion(await n.getPage(page.id));
check('updatePage changes only what it is given', again.status === 'APPROVED' && again.notes.startsWith('Use') && again.name === 'Galerie Exemple');

for (let i = 0; i < 5; i++) await n.createPage('ds-suggestions', suggestionProps({ ...sugg, name: `Place ${i}` }, { reference: `S-000${i}`, submission: `u${i}`, audience: 'visitor', fingerprint: `fp-${i}`, duplicate: '' }));
const approved = await n.query('ds-suggestions', { filter: { property: S.status, select: { equals: 'APPROVED' } } });
check('query: a select filter', approved.results.length === 1 && approved.results[0].id === page.id);
const all = await n.queryAll('ds-suggestions', { sorts: [{ timestamp: 'created_time', direction: 'descending' }], page_size: 2 } as never);
check('queryAll: follows the cursor, newest first', all.length === 6 && R.title(all[0], S.name) === 'Place 4', all.map((p) => R.title(p, S.name)));
const fp = await n.query('ds-suggestions', { filter: { or: [{ property: S.fingerprint, rich_text: { equals: 'fp-3' } }, { property: S.website, url: { equals: 'https://nowhere.example/' } }] } });
check('query: or-filter on fingerprint or website', fp.results.length === 1 && R.title(fp.results[0], S.name) === 'Place 3');

s.state.rateLimitOnce = true;
const afterWait = await n.getPage(page.id);
check('a 429 is retried once, after Retry-After', afterWait.id === page.id && waits.at(-1) === 1000, waits);
s.state.failNext = { status: 503 };
check('a 503 is retried once', (await n.getPage(page.id)).id === page.id);
s.state.failNext = { status: 400, code: 'validation_error' };
let e: unknown = null;
try { await n.getPage(page.id); } catch (x) { e = x; }
check('other errors throw NotionError with Notion\'s code', e instanceof NotionError && e.status === 400 && e.code === 'validation_error', String(e));
const wrong = notion({ token: 'nope', fetch: s.fetch, base: s.base, wait: async () => {} });
e = null;
try { await wrong.getPage(page.id); } catch (x) { e = x; }
check('a wrong token: 401 unauthorized', e instanceof NotionError && e.status === 401);

console.log(fails ? `${fails} FAILED` : 'all passed');
if (fails) process.exitCode = 1;
