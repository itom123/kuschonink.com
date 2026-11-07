// npm test: suggestions from inside a guide (worker/suggest.ts), against the
// Notion stand-in, the Guard on a Map, a stand-in Turnstile and a stand-in inbox.
import sharp from 'sharp';
import { GuardCore, memoryStore } from './guard.ts';
import { notion, P } from './notion.ts';
import { handleSuggest, LIMITS, TURNSTILE_ACTION, type SuggestDeps } from './suggest.ts';
import { readSuggestion, S } from './suggestions.ts';
import type { AccessFile } from '../src/lib/guides/types';
import accessJson from '../src/content/guides/access.json' with { type: 'json' };
import { toBase64 } from './image.ts';
import type { EmailOut, TurnstileResult } from './contact.ts';
// @ts-expect-error: plain JS module
import { standIn } from '../scripts/dev/notion-standin.mjs';

let fails = 0;
function check(name: string, ok: boolean, detail: unknown = '') {
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail));
}

const SITE = 'https://kuschonink.com';
const SLUG = 'paris-2026-11';
const now = Date.UTC(2026, 10, 9, 9, 0, 0);
const goodTurnstile: TurnstileResult = { success: true, hostname: 'kuschonink.com', action: TURNSTILE_ACTION };

interface World { deps: SuggestDeps; s: ReturnType<typeof standIn>; mail: EmailOut[]; logs: string[]; guard: GuardCore }
function world(o: Partial<SuggestDeps> & { notionFetch?: (s: ReturnType<typeof standIn>) => typeof fetch; mailFails?: boolean; ts?: TurnstileResult | (() => Promise<TurnstileResult>) } = {}): World {
  const s = standIn({ token: 'tok' });
  const mail: EmailOut[] = [];
  const logs: string[] = [];
  const guard = new GuardCore(memoryStore(), () => now);
  const n = notion({ token: 'tok', fetch: o.notionFetch ? o.notionFetch(s) : s.fetch, base: s.base, wait: async () => {} });
  const deps: SuggestDeps = {
    audienceFor: async (req) => ((req.headers.get('cookie') ?? '').includes('kus98_guides=ok') ? 'visitor' : null),
    guard,
    notion: n,
    db: { suggestions: 'ds-s', contacts: 'ds-c' },
    turnstile: { secret: 'ts-secret', hostnames: new Set(['kuschonink.com', 'www.kuschonink.com']), verify: async () => (typeof o.ts === 'function' ? o.ts() : o.ts ?? goodTurnstile) },
    notify: async (m) => { if (o.mailFails) throw Object.assign(new Error('no'), { code: 'E_DOWN' }); mail.push(m); },
    allow: async () => true,
    visitor: (ip) => `guides:${ip ?? 'unknown'}`,
    now: () => now,
    log: (...a) => logs.push(a.map(String).join(' ')),
    ...o,
  };
  return { deps, s, mail, logs, guard };
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = {
  kind: 'exhibition', name: 'Galerie Exemple', show: 'Winter Light', artists: 'Ana Silva / Bo Chen', start: '2026-11-08', end: '2026-12-20',
  hours: 'Tue–Sat 11:00–19:00', address: '1 rue Exemple, 75003 Paris', website: 'exemple.fr', links: ['https://exemple.fr/winter'],
  description: 'Large prints of\nwinter light.', own: true, submitter: 'Ana Silva', email: 'ana@example.com', mayContact: true, creditAs: 'Ana Silva',
  lang: 'en', homepage: '', elapsed: 45000, turnstileToken: 'tok',
};
function req(body: Record<string, unknown>, o: { origin?: string | null; site?: string | null; cookie?: string | null; ct?: string; ip?: string; raw?: string } = {}) {
  const h: Record<string, string> = { 'content-type': o.ct ?? 'application/json', 'cf-connecting-ip': o.ip ?? '1.2.3.4' };
  if (o.origin !== null) h.origin = o.origin ?? SITE;
  if (o.site !== null) h['sec-fetch-site'] = o.site ?? 'same-origin';
  if (o.cookie !== null) h.cookie = o.cookie ?? 'kus98_guides=ok';
  return new Request(`${SITE}/guides/${SLUG}/suggest`, { method: 'POST', headers: h, body: o.raw ?? JSON.stringify(body) });
}
async function send(w: World, body: Record<string, unknown>, o = {}) {
  const res = await handleSuggest(req(body, o), SLUG, w.deps);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const pagesIn = (w: World, ds: string) => [...w.s.pages.values()].filter((p: { parent: { data_source_id: string } }) => p.parent.data_source_id === ds);

// A real JPEG with EXIF and GPS.
const jpeg = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#335' } })
  .withExif({ IFD0: { Artist: 'Private Person' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 30/1' } })
  .jpeg().toBuffer();

// ---- The good path ----
{
  const w = world();
  const r = await send(w, { ...base, id: uuid(1), picture: toBase64(jpeg), pictureCredit: 'Photo: Ana Silva', rights: true });
  check('a good suggestion: 202 with a reference', r.status === 202 && /^S-[A-Z2-9]{4}$/.test(String(r.body.reference)), r);
  const sp = pagesIn(w, 'ds-s');
  const row = sp[0] && readSuggestion(sp[0]);
  check('… one Suggestions page, NEW, with the fields', sp.length === 1 && row.status === 'NEW' && row.name === 'Galerie Exemple' && row.website === 'https://exemple.fr/' && row.sentBy === 'visitor' && row.reference === r.body.reference && row.own, row);
  check('… no name or email in Suggestions', !JSON.stringify(sp).includes('ana@example.com'));
  const cp = pagesIn(w, 'ds-c');
  check('… one Contacts page with the email and consent', cp.length === 1 && JSON.stringify(cp).includes('ana@example.com'));
  const up = [...w.s.files.values()][0] as { bytes: Uint8Array };
  check('… the picture reached Notion without its EXIF or GPS', !!up && !Buffer.from(up.bytes).includes(Buffer.from('Private Person')) && (await sharp(up.bytes).metadata()).width === 80);
  check('… the owner was told, without the email address', w.mail.length === 1 && w.mail[0].subject.includes('Galerie Exemple') && !w.mail[0].text.includes('ana@example.com') && w.mail[0].text.includes('/admin/suggestions'), w.mail[0]?.text);

  const again = await send(w, { ...base, id: uuid(1), picture: toBase64(jpeg), pictureCredit: 'Photo: Ana Silva', rights: true });
  check('the same wizard sent twice: the same reference, nothing new', again.status === 200 && again.body.reference === r.body.reference && again.body.repeat === true && pagesIn(w, 'ds-s').length === 1 && w.mail.length === 1, again);
  const reload = await send(w, { ...base, id: uuid(2), picture: toBase64(jpeg), pictureCredit: 'Photo: Ana Silva', rights: true });
  check('after a reload (a new id), exactly the same suggestion: the same reference', reload.status === 200 && reload.body.reference === r.body.reference && pagesIn(w, 'ds-s').length === 1, reload);
  const withMore = await send(w, { ...base, id: uuid(6), description: 'Now with a better description.' });
  check('the same place, changed (a better description): a new suggestion, marked as a possible duplicate', withMore.status === 202 && withMore.body.reference !== r.body.reference && readSuggestion(pagesIn(w, 'ds-s').at(-1)).duplicate.includes(String(r.body.reference)), withMore);
  const before = pagesIn(w, 'ds-s').length;
  const other = await send(w, { ...base, id: uuid(3), name: 'Another Place', address: '9 rue Ailleurs', website: '' }, { ip: '5.6.7.8' });
  check('a different place goes in', other.status === 202 && pagesIn(w, 'ds-s').length === before + 1 && readSuggestion(pagesIn(w, 'ds-s').at(-1)).duplicate === '');
  const dupe = await send(w, { ...base, id: uuid(4) }, { ip: '9.9.9.9' });
  const dupeRow = readSuggestion(pagesIn(w, 'ds-s').at(-1));
  check('the same place from someone else: in, marked as a possible duplicate', dupe.status === 202 && dupeRow.duplicate.includes(String(r.body.reference)), dupeRow.duplicate);
}

// A place suggested before the guide moved (access.json "moved"): its fingerprint starts with the old address.
{
  const ACCESS = accessJson as unknown as AccessFile;
  const OLD = Object.entries(ACCESS.moved ?? {}).find(([, v]) => v === SLUG)?.[0] ?? '';
  const w = world({ access: ACCESS });
  const first = await send(w, { ...base, id: uuid(20), website: '', links: [] });
  const page = pagesIn(w, 'ds-s')[0] as { id: string };
  const fp = readSuggestion(page as never).fingerprint;
  await w.deps.notion!.updatePage(page.id, { [S.guide]: P.select(OLD), [S.fingerprint]: P.text(OLD + fp.slice(SLUG.length)) } as never);
  const again = await send(w, { ...base, id: uuid(21), website: '', links: [], description: 'Seen again.' }, { ip: '7.7.7.7' });
  const row = readSuggestion(pagesIn(w, 'ds-s').at(-1));
  check('a place first suggested under the old address is still marked as a possible duplicate', !!OLD && fp.startsWith(`${SLUG}|`) && again.status === 202 && row.duplicate.includes(String(first.body.reference)), { fp, dup: row.duplicate });
}

// ---- Who may send ----
{
  const w = world();
  check('no Origin: 403', (await send(w, { ...base, id: uuid(5) }, { origin: null })).status === 403);
  check('another site: 403', (await send(w, { ...base, id: uuid(5) }, { origin: 'https://evil.example' })).status === 403);
  check('Sec-Fetch-Site cross-site: 403', (await send(w, { ...base, id: uuid(5) }, { site: 'cross-site' })).status === 403);
  const r = await send(w, { ...base, id: uuid(5) }, { cookie: null });
  check('not logged on to the guide: 403 log_on_first', r.status === 403 && r.body.error === 'log_on_first');
  check('not JSON: 415', (await send(w, {}, { ct: 'text/plain' })).status === 415);
  check('too large: 413', (await send(w, {}, { raw: 'x'.repeat(6 * 1024 * 1024 + 10) })).status === 413);
  check('nothing was stored', w.s.pages.size === 0 && w.mail.length === 0);
}

// ---- The fields ----
{
  const w = world();
  const bad = async (patch: Record<string, unknown>, error: string, field?: string) => {
    const r = await send(w, { ...base, id: uuid(10), ...patch });
    return r.status === 400 && r.body.error === error && (field === undefined || r.body.field === field) ? true : r;
  };
  check('no name', (await bad({ name: '' }, 'missing', 'name')) === true);
  check('no address', (await bad({ address: '1' }, 'missing', 'address')) === true);
  check('a website that isn\'t one', (await bad({ website: 'javascript:alert(1)' }, 'invalid_field', 'website')) === true);
  check('a link with a password in it', (await bad({ links: ['https://user:pw@example.com/'] }, 'invalid_field', 'links')) === true);
  check('HTML in the description', (await bad({ description: 'see <script>x</script>' }, 'html_not_allowed', 'description')) === true);
  check('a line break in the name', (await bad({ name: 'A\nB' }, 'invalid_field', 'name')) === true);
  check('a date that doesn\'t exist', (await bad({ end: '2026-11-31' }, 'invalid_field', 'end')) === true);
  check('ends before it starts', (await bad({ start: '2026-12-01', end: '2026-11-01' }, 'before_start', 'end')) === true);
  check('a picture without rights', (await bad({ picture: toBase64(jpeg), pictureCredit: 'x', rights: false }, 'missing', 'rights')) === true);
  check('a picture without a credit', (await bad({ picture: toBase64(jpeg), rights: true }, 'missing', 'pictureCredit')) === true);
  check('too many links', (await bad({ links: Array(6).fill('https://a.example/') }, 'too_many', 'links')) === true);
  check('a bad email', (await bad({ email: 'nope' }, 'invalid_field', 'email')) === true);
  check('a bad id', (await bad({ id: 'abc' }, 'invalid_field', 'id')) === true);
  const notPic = await send(w, { ...base, id: uuid(11), picture: toBase64(new TextEncoder().encode('<svg onload=alert(1)>'.repeat(10))), pictureCredit: 'x', rights: true });
  check('a "picture" that isn\'t one: 400, and the keys are let go', notPic.status === 400 && notPic.body.error === 'bad_picture' && (await w.guard.claim(`suggest:id:${uuid(11)}`, 600)).fresh, notPic);
  check('nothing was stored', w.s.pages.size === 0);
}

// ---- Spam and limits ----
{
  const w = world();
  const trap = await send(w, { ...base, id: uuid(20), homepage: 'http://spam.example' });
  const fast = await send(w, { ...base, id: uuid(21), elapsed: 900 });
  check('the spam trap and a too-fast form: "accepted", nothing kept', trap.status === 202 && fast.status === 202 && w.s.pages.size === 0 && w.mail.length === 0);
  const lim = world({ allow: async () => false });
  check('the per-minute binding says no: 429', (await send(lim, { ...base, id: uuid(22) })).status === 429);
  const hour = world();
  let last = 0;
  for (let i = 0; i < LIMITS.perVisitorHour + 1; i++) last = (await send(hour, { ...base, id: uuid(100 + i), name: `Place ${i}`, website: '' })).status;
  check(`the ${LIMITS.perVisitorHour + 1}th in an hour from one visitor: 429`, last === 429 && pagesIn(hour, 'ds-s').length === LIMITS.perVisitorHour);
  const all = world();
  for (let i = 0; i < LIMITS.allHour; i++) await all.guard.hit('suggest:all', LIMITS.allHour, 3600);
  const busy = await send(all, { ...base, id: uuid(30) });
  check('the hourly limit for everyone: 429 busy', busy.status === 429 && busy.body.error === 'busy');
}

// ---- Turnstile ----
{
  check('no Turnstile secret: 503', (await send(world({ turnstile: { secret: undefined, hostnames: new Set(), verify: async () => goodTurnstile } }), { ...base, id: uuid(40) })).status === 503);
  check('Turnstile says no: 403', (await send(world({ ts: { success: false, 'error-codes': ['invalid-input-response'] } }), { ...base, id: uuid(41) })).status === 403);
  check('another action (the contact form\'s): 403', (await send(world({ ts: { success: true, hostname: 'kuschonink.com', action: 'kuschonink-contact' } }), { ...base, id: uuid(42) })).status === 403);
  check('another hostname: 403', (await send(world({ ts: { success: true, hostname: 'evil.example', action: TURNSTILE_ACTION } }), { ...base, id: uuid(43) })).status === 403);
  const testKeyAnswer: TurnstileResult = { success: true, hostname: 'example.com' }; // what Cloudflare's test secret says
  check('the test key\'s answer is refused on the live site', (await send(world({ ts: testKeyAnswer }), { ...base, id: uuid(45) })).status === 403);
  const dev = world({ ts: testKeyAnswer });
  dev.deps.turnstile.hostnames = new Set(['example.com', 'localhost']);
  check('… and accepted where example.com is allowed (wrangler dev, previews)', (await send(dev, { ...base, id: uuid(46) })).status === 202);
  check('Turnstile unreachable: 503',(await send(world({ ts: async () => { throw new Error('down'); } }), { ...base, id: uuid(44) })).status === 503);
}

// ---- When things fail ----
{
  const down = world({ notionFetch: () => async () => new Response('{"code":"internal_server_error"}', { status: 500 }) });
  const r = await send(down, { ...base, id: uuid(50) });
  check('Notion down: still 202, and the owner gets all of it, contact included', r.status === 202 && down.mail.length === 1 && down.mail[0].subject.includes('[not in Notion]') && down.mail[0].text.includes('ana@example.com') && down.mail[0].text.includes('Winter Light'), down.mail[0]?.subject);
  const both = world({ notionFetch: () => async () => new Response('{}', { status: 500 }), mailFails: true });
  const r2 = await send(both, { ...base, id: uuid(51) });
  check('Notion and email both down: 502, and a retry may run', r2.status === 502 && (await both.guard.claim(`suggest:id:${uuid(51)}`, 600)).fresh, r2);
  const contactsDown = world({
    notionFetch: (s) => async (input, init) => (String(init?.body ?? '').includes('"ds-c"') ? new Response('{}', { status: 500 }) : s.fetch(input, init)),
  });
  const r3 = await send(contactsDown, { ...base, id: uuid(52) });
  check('only Contacts failed: the suggestion is in Notion, the email carries the contact', r3.status === 202 && pagesIn(contactsDown, 'ds-s').length === 1 && contactsDown.mail[0].text.includes('ana@example.com') && !contactsDown.mail[0].subject.includes('[not in Notion]'));
  const busy = world();
  await busy.guard.claim(`suggest:id:${uuid(53)}`, 600);
  check('the same wizard still being handled: 409 in_progress', (await send(busy, { ...base, id: uuid(53) })).body.error === 'in_progress');
  const noNotion = world({ notion: null });
  check('without Notion set up: by email, 202', (await send(noNotion, { ...base, id: uuid(54) })).status === 202 && noNotion.mail.length === 1);
  check('no contact given: no Contacts page', await (async () => { const w = world(); await send(w, { ...base, id: uuid(55), submitter: '', email: '' }); return pagesIn(w, 'ds-c').length === 0 && pagesIn(w, 'ds-s').length === 1; })());
}
check('Notion property names used here exist in the schema', [S.fingerprint, S.website, S.reference].every(Boolean));

console.log(fails ? `${fails} FAILED` : 'all passed');
if (fails) process.exitCode = 1;
