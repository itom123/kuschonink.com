// npm test: the publisher (worker/publish.ts), with the real Paris guide in an
// in-memory GitHub (scripts/dev/github-standin.mjs) and READY pages in the
// Notion stand-in.
import { readFileSync, readdirSync } from 'node:fs';
import sharp from 'sharp';
import { GuardCore, memoryStore } from './guard.ts';
import { github } from './github.ts';
import { notion, P } from './notion.ts';
import { forbiddenWord, nextId, publish, type PublishDeps } from './publish.ts';
import { readSuggestion, S, suggestionProps, type Suggestion } from './suggestions.ts';
import type { AccessFile, ItemRecord, ItemsFile } from '../src/lib/guides/types';
import access from '../src/content/guides/access.json' with { type: 'json' };
// @ts-expect-error: plain JS module
import { standIn } from '../scripts/dev/notion-standin.mjs';
// @ts-expect-error: plain JS module
import { githubStandIn } from '../scripts/dev/github-standin.mjs';

let fails = 0;
function check(name: string, ok: boolean, detail: unknown = '') {
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail));
}

const SLUG = 'paris-photo-days-2026';
const DIR = `src/content/guides/${SLUG}`;
const files: Record<string, string> = { 'README.md': 'repo' };
for (const f of readdirSync(DIR)) if (f.endsWith('.json')) files[`${DIR}/${f}`] = readFileSync(`${DIR}/${f}`, 'utf8');
const ACCESS = access as unknown as AccessFile;
let now = Date.UTC(2026, 10, 9, 9, 0, 0);

const pic640 = await sharp({ create: { width: 640, height: 427, channels: 3, background: '#556' } }).withExif({ IFD0: { Artist: 'Private Person' } }).jpeg({ quality: 70 }).toBuffer();
const pic1200 = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#556' } }).jpeg().toBuffer();

const entry = {
  name: 'Galerie Exemple', short: 'Exemple', subtitle: 'Winter Light', by: 'Ana Silva / Bo Chen', zone: 'marais', themes: ['documentary'],
  why: 'Large prints of winter light, worth a short detour.', whyZh: '冬日光线的大幅照片，值得绕路一看。', address: '1 rue Exemple, 75003 Paris',
  hours: 'Tue–Sat 11:00–19:00', hoursZh: '周二至周六 11:00–19:00', start: '2026-11-08', end: '2026-12-20', open: ['tue', 'wed', 'thu', 'fri', 'sat'],
  minutes: 40, sourceUrl: 'https://exemple.fr/winter', links: ['https://exemple.fr/'], coordinates: [2.3601, 48.8619], image: { alt: 'A large winter photograph', altZh: '一张冬天的大照片' },
};
const form: Suggestion = {
  guide: SLUG, kind: 'exhibition', name: 'Galerie Exemple', show: 'Winter Light', artists: 'Ana Silva / Bo Chen', start: '2026-11-08', end: '2026-12-20',
  hours: 'Tue–Sat 11:00–19:00', address: '1 rue Exemple', website: 'https://exemple.fr/', links: [], description: 'Large prints', own: true,
  pictureCredit: 'Photo: Ana Silva', rights: true, submitter: '', email: '', mayContact: false, creditAs: 'Ana Silva', lang: 'en',
};

function world(o: { ghFetch?: (g: ReturnType<typeof githubStandIn>) => typeof fetch } = {}) {
  const s = standIn({ token: 'nt' });
  const g = githubStandIn({ files, token: 'gh' });
  const n = notion({ token: 'nt', fetch: s.fetch, base: s.base, wait: async () => {} });
  const logs: string[] = [];
  const deps: PublishDeps = {
    notion: n,
    db: { suggestions: 'ds-s', log: 'ds-log' },
    gh: github({ token: 'gh', repo: 'itom123/kuschonink.com', fetch: o.ghFetch ? o.ghFetch(g) : g.fetch, base: g.base }),
    repoUrl: 'https://github.com/itom123/kuschonink.com',
    guard: new GuardCore(memoryStore(), () => now),
    access: ACCESS,
    download: async (u) => new Uint8Array(await (await s.fetch(u)).arrayBuffer()),
    now: () => now,
    log: (...a) => logs.push(a.map(String).join(' ')),
  };
  async function ready(patch: Partial<typeof entry> | Record<string, unknown> = {}, o2: { tier?: string; showTo?: string; picture?: Buffer | null; name?: string } = {}) {
    const page = await n.createPage('ds-s', suggestionProps({ ...form, name: o2.name ?? form.name }, { reference: `S-${String(s.pages.size).padStart(4, 'A')}`, submission: `u${s.pages.size}`, audience: 'visitor', fingerprint: '', duplicate: '' }));
    const props: Record<string, unknown> = { [S.status]: P.select('READY'), [S.entry]: P.text(JSON.stringify({ ...entry, ...patch })), [S.tier]: P.select(o2.tier ?? 'C'), [S.showTo]: P.select(o2.showTo ?? 'Everyone') };
    if (o2.picture !== null) props[S.webPicture] = P.files([{ id: await n.uploadFile('web.jpg', 'image/jpeg', o2.picture ?? pic640), name: 'web.jpg' }]);
    await n.updatePage(page.id, props as never);
    return page.id;
  }
  const row = async (id: string) => readSuggestion(await n.getPage(id));
  const items = () => (JSON.parse(g.files()[`${DIR}/items.json`]) as ItemsFile).items;
  return { s, g, n, deps, ready, row, items, logs };
}

// ---- Helpers ----
check('nextId: one more than the highest in the tier', nextId([{ id: 'C1', tier: 'C' }, { id: 'C7', tier: 'C' }, { id: 'B2', tier: 'B' }] as ItemRecord[], 'C') === 'C8' && nextId([], 'A') === 'A1');
{
  const it = { ...entry, id: 'C9', tier: 'C', why: 'Meet at the workshop first.' } as unknown as ItemRecord;
  const sens = { public: ['FotoFilmic'], fotofilmic: ['workshop'] };
  check('forbiddenWord: a participants-only word in an entry for everyone', forbiddenWord(it, ACCESS, SLUG, sens)?.word === 'workshop');
  check('forbiddenWord: fine when only participants see it', forbiddenWord({ ...it, audience: 'fotofilmic' }, ACCESS, SLUG, sens) === null);
}

// ---- Publishing ----
{
  const w = world();
  const id = await w.ready();
  const r = await publish(w.deps);
  const item = w.items().find((i) => i.suggested?.ref === id);
  check('a READY entry is committed to main', r.committed.length === 1 && !!item, r);
  check('… as the next C id, with suggested (by, own, ref) and no audience', item?.id === 'C3' && item.tier === 'C' && item.suggested?.by === 'Ana Silva' && item.suggested?.own === true && item.audience === undefined, item);
  check('… the picture saved as img/C3.jpg, without EXIF, with its credit and alt', !!w.g.files({ bytes: true })[`public/guides/${SLUG}/img/C3.jpg`] && !Buffer.from(w.g.files({ bytes: true })[`public/guides/${SLUG}/img/C3.jpg`]).includes(Buffer.from('Private Person')) && item?.image?.file === 'C3.jpg' && item.image.credit === 'Photo: Ana Silva' && item.image.alt === 'A large winter photograph', item?.image);
  check('… only items.json and the picture changed', Object.keys(w.g.files()).filter((p) => !(p in files)).join() === `public/guides/${SLUG}/img/C3.jpg` && Object.entries(files).every(([p, t]) => p.endsWith('items.json') || w.g.files()[p] === t));
  check('… items.json is formatted like the rest (2 spaces, final newline), C3 after C2', w.g.files()[`${DIR}/items.json`].endsWith('}\n') && w.items().findIndex((i) => i.id === 'C3') === w.items().findIndex((i) => i.id === 'C2') + 1);
  check('… the commit says what it added', /^Field Guide: add Galerie Exemple \(S-\w+ C3\) to paris-photo-days-2026$/.test(w.g.message() ?? ''), w.g.message());
  const row = await w.row(id);
  check('… Notion: PUBLISHING, Item id C3, the commit link', row.status === 'PUBLISHING' && row.itemId === 'C3' && /\/commit\/[0-9a-f]{40}$/.test(row.commit), row);
  check('… and a log entry', [...w.s.pages.values()].some((p: { parent: { data_source_id: string } }) => p.parent.data_source_id === 'ds-log'));

  const r2 = await publish(w.deps);
  check('no build check yet: still PUBLISHING, nothing committed', r2.committed.length === 0 && (await w.row(id)).status === 'PUBLISHING');
  w.g.checks.set(w.g.head(), [{ name: 'Workers Builds: kuschonink', status: 'completed', conclusion: 'success', html_url: 'https://dash', output: { title: 'Success' } }]);
  const r3 = await publish(w.deps);
  check('the build passed: PUBLISHED', r3.live.length === 1 && (await w.row(id)).status === 'PUBLISHED' && (await w.row(id)).result.includes('C3'));

  await w.n.updatePage(id, { [S.status]: P.select('READY') });
  const before = w.g.head();
  const r4 = await publish(w.deps);
  check('READY again (a lost Notion update): nothing new on main, PUBLISHED', w.g.head() === before && r4.live.length === 1 && w.items().filter((i) => i.suggested?.ref === id).length === 1 && (await w.row(id)).status === 'PUBLISHED', r4);

  await w.n.updatePage(id, { [S.status]: P.select('READY'), [S.tier]: P.select('B'), [S.webPicture]: P.noFiles() });
  await publish(w.deps);
  const moved = w.items().find((i) => i.suggested?.ref === id);
  const all = w.g.files({ bytes: true });
  check('a tier change: a new id (B16), the picture moves with it, C3 never comes back', moved?.id === 'B16' && moved.image?.file === 'B16.jpg' && !!all[`public/guides/${SLUG}/img/B16.jpg`] && !all[`public/guides/${SLUG}/img/C3.jpg`] && !w.items().some((i) => i.id === 'C3'), moved);
}

// ---- What is refused ----
{
  const w = world();
  const a = await w.ready({ id: 'A1' } as never);
  const b = await w.ready({ tier: 'A' } as never);
  const c = await w.ready({ why: 'Start at the workshop on rue Sancerre.' });
  const d = await w.ready({ zone: 'nowhere' });
  const e = await w.ready({}, { name: 'Good One' });
  const r = await publish(w.deps);
  check('an entry setting its own id or tier: NEEDS CHECK', (await w.row(a)).status === 'NEEDS CHECK' && (await w.row(b)).status === 'NEEDS CHECK' && (await w.row(a)).result.includes('id'));
  check('a participants-only word in an entry for everyone: NEEDS CHECK, with the word', (await w.row(c)).status === 'NEEDS CHECK' && (await w.row(c)).result.includes('fotofilmic'), (await w.row(c)).result);
  check('an entry the guide\'s check refuses: ERROR, with the check\'s words', (await w.row(d)).status === 'ERROR' && (await w.row(d)).result.includes('nowhere'), (await w.row(d)).result);
  check('… and the good one in the same batch still goes in', (await w.row(e)).status === 'PUBLISHING' && w.items().some((i) => i.suggested?.ref === e) && r.committed.length === 1, r);
  check('… nothing refused reached main', ![a, b, c, d].some((x) => w.items().some((i) => i.suggested?.ref === x)));
  // Off the middle of every map crop: a participants-only point there would give itself away (the guide's check).
  const f = await w.ready({ why: 'Start at the workshop on rue Sancerre.', zone: 'north-clichy', coordinates: [2.3268, 48.8849] }, { showTo: 'fotofilmic' });
  await publish(w.deps);
  check('the same word, shown to participants only: published with that audience', w.items().find((i) => i.suggested?.ref === f)?.audience === 'fotofilmic');
  const g = await w.ready({}, { picture: pic1200, name: 'Big Picture' });
  await publish(w.deps);
  const gi = w.items().find((i) => i.suggested?.ref === g);
  check('a picture over 640 px: published without it, and the result says why', !!gi && !gi.image && (await w.row(g)).result.includes('640'), (await w.row(g)).result);
  const h = await w.ready({}, { showTo: 'friends' });
  await publish(w.deps);
  check('Show to an audience the guide doesn\'t have: NEEDS CHECK', (await w.row(h)).status === 'NEEDS CHECK');
}

// ---- A failed build ----
{
  const w = world();
  const id = await w.ready();
  await publish(w.deps);
  const sha = w.g.head();
  w.g.checks.set(sha, [{ name: 'Workers Builds: kuschonink', status: 'completed', conclusion: 'failure', html_url: 'https://dash/build/1', output: { title: 'Build failed', summary: 'Field Guide guard: leak' } }]);
  const r = await publish(w.deps);
  const row = await w.row(id);
  check('the build failed: taken back in a new commit, item and picture gone', r.takenBack.length === 1 && w.g.head() !== sha && !w.items().some((i) => i.suggested?.ref === id) && !w.g.files()[`public/guides/${SLUG}/img/C3.jpg`], r);
  check('… ERROR, with the build\'s message and link', row.status === 'ERROR' && row.result.includes('leak') && row.result.includes('https://dash/build/1'), row.result);

  const x = await w.ready({}, { name: 'One' });
  const y = await w.ready({ coordinates: [2.3611, 48.8629] }, { name: 'Two' });
  await publish(w.deps);
  w.g.checks.set(w.g.head(), [{ name: 'Workers Builds: kuschonink', status: 'completed', conclusion: 'failure', html_url: 'https://dash/build/2', output: { title: 'Build failed' } }]);
  const failed = w.g.head();
  const rf = await publish(w.deps);
  check('two in a failed build: both taken back, each to try again on its own', rf.takenBack.length === 2 && (await w.row(x)).run === 'solo' && (await w.row(y)).run === 'solo' && !JSON.parse(w.g.files()[`${DIR}/items.json`]).items.some((i: ItemRecord) => i.suggested?.ref === y), rf);
  check('… the first goes again at once, alone in its commit; the second waits', rf.committed.length === 1 && rf.committed[0].refs.length === 1 && (await w.row(x)).status === 'PUBLISHING' && (await w.row(y)).status === 'READY' && w.g.head() !== failed);
  w.g.checks.set(w.g.head(), [{ name: 'Workers Builds: kuschonink', status: 'completed', conclusion: 'success', html_url: 'https://dash/build/3', output: { title: 'Success' } }]);
  await publish(w.deps);
  check('… once its build passes, the second goes alone too', (await w.row(x)).status === 'PUBLISHED' && (await w.row(y)).status === 'PUBLISHING');
}

// ---- Races ----
{
  let moved = false;
  const w = world({
    ghFetch: (g) => async (input, init) => {
      if (!moved && init?.method === 'PATCH') { moved = true; g.moveMain('README.md', 'someone else pushed'); }
      return g.fetch(input, init);
    },
  });
  const id = await w.ready();
  const r = await publish(w.deps);
  check('main moved during the commit: made again on the new main, nothing lost', moved && r.committed.length === 1 && w.g.files()['README.md'] === 'someone else pushed' && w.items().some((i) => i.suggested?.ref === id), r);
  await w.deps.guard.claim('publish:lock', 600);
  check('another publish already running: skipped', (await publish(w.deps)).skipped === 'busy');
}

console.log(fails ? `${fails} FAILED` : 'all passed');
if (fails) process.exitCode = 1;
