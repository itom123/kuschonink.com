// npm test: admin mode (worker/admin.ts): the log-on, sessions, the queue,
// emailing a submitter, the routine, and editing a published entry. Against
// the Guard on a Map, the Notion stand-in, an in-memory GitHub with the real
// Paris guide, and a stand-in mailbox. Made-up secrets only.
import { readFileSync, readdirSync } from 'node:fs';
import { adminSession, COOKIE, COOKIE_LOCAL, EMAILS_PER_HOUR, FAILS, handleAdmin, UI_COOKIE, type AdminDeps, type OutMail } from './admin.ts';
import { GuardCore, memoryStore } from './guard.ts';
import { github } from './github.ts';
import { notion, P } from './notion.ts';
import { contactProps, readSuggestion, S, suggestionProps, type Suggestion } from './suggestions.ts';
import { base32Encode, hotp, stepAt } from './totp.ts';
import type { AccessFile, ItemsFile } from '../src/lib/guides/types';
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

const SITE = 'https://kuschonink.com';
const PASSWORD = 'test only: a long admin pass phrase';
const KEY = new TextEncoder().encode('0123456789abcdefghij'); // 20 bytes
const SECRET = base32Encode(KEY);
let now = Date.UTC(2026, 10, 9, 9, 0, 0);
const code = async (offset = 0) => hotp(KEY, stepAt(now) + offset);
const SLUG = 'paris-photo-days-2026';
const DIR = `src/content/guides/${SLUG}`;
const files: Record<string, string> = {};
for (const f of readdirSync(DIR)) if (f.endsWith('.json')) files[`${DIR}/${f}`] = readFileSync(`${DIR}/${f}`, 'utf8');

function world(o: Partial<AdminDeps> = {}) {
  const s = standIn({ token: 'nt' });
  const g = githubStandIn({ files, token: 'gh' });
  const n = notion({ token: 'nt', fetch: s.fetch, base: s.base, wait: async () => {} });
  const sent: OutMail[] = [];
  const fired: string[] = [];
  const logs: string[] = [];
  const guard = new GuardCore(memoryStore(), () => now);
  const deps: AdminDeps = {
    password: () => PASSWORD,
    totpSecret: () => SECRET,
    guard,
    allow: async () => true,
    visitor: (ip) => `guides:${ip ?? 'unknown'}`,
    access: access as unknown as AccessFile,
    notion: n,
    db: { suggestions: 'ds-s', contacts: 'ds-c', log: 'ds-log' },
    mail: async (m) => { sent.push(m); },
    fireRoutine: async (text) => (fired.push(text), { url: 'https://claude.ai/code/session_x' }),
    publish: async () => ({ committed: [], live: [], takenBack: [], needsCheck: [], errors: [] }),
    gh: github({ token: 'gh', repo: 'itom123/kuschonink.com', fetch: g.fetch, base: g.base }),
    now: () => now,
    log: (...a) => logs.push(a.map(String).join(' ')),
    ...o,
  };
  return { s, g, n, deps, sent, fired, logs, guard };
}
type W = ReturnType<typeof world>;

function req(path: string, o: { method?: string; body?: unknown; cookie?: string; site?: string | null; origin?: string | null; host?: string; ip?: string } = {}) {
  const host = o.host ?? SITE;
  const h: Record<string, string> = { 'cf-connecting-ip': o.ip ?? '1.2.3.4' };
  if (o.site !== null) h['sec-fetch-site'] = o.site ?? 'same-origin';
  if (o.origin !== null && (o.method ?? 'GET') !== 'GET') h.origin = o.origin ?? host;
  if (o.cookie) h.cookie = o.cookie;
  if (o.body !== undefined) h['content-type'] = 'application/json';
  return new Request(`${host}/v1/admin${path}`, { method: o.method ?? 'GET', headers: h, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}
async function call(w: W, path: string, o: Parameters<typeof req>[1] = {}) {
  const res = await handleAdmin(req(path, o), w.deps);
  const cookies = res.headers.getSetCookie?.() ?? [];
  return { status: res.status, body: (await res.json()) as Record<string, any>, cookies };
}
async function logOn(w: W, o: { host?: string; ip?: string } = {}) {
  const r = await call(w, '/login', { method: 'POST', body: { password: PASSWORD, code: await code() }, ...o });
  const c = r.cookies.find((x) => x.startsWith(`${o.host?.includes('127.0.0.1') ? COOKIE_LOCAL : COOKIE}=`)) ?? '';
  return { r, cookie: c.split(';')[0] };
}

// ---- Set-up ----
{
  const w = world({ password: () => 'too short' });
  const r = await call(w, '/login', { method: 'POST', body: { password: 'too short', code: await code() } });
  check('a password under 16 characters: admin is off (503)', r.status === 503 && r.body.error === 'not_configured');
  const w2 = world({ totpSecret: () => 'NOTBASE32!!' });
  check('no real authenticator secret: admin is off', (await call(w2, '/login', { method: 'POST', body: { password: PASSWORD, code: '000000' } })).status === 503);
}

// ---- Log-on ----
{
  const w = world();
  check('no Sec-Fetch-Site (not a browser on this site): 403', (await call(w, '/login', { method: 'POST', site: null, body: {} })).status === 403);
  check('another site: 403', (await call(w, '/login', { method: 'POST', origin: 'https://evil.example', body: {} })).status === 403);
  const badPw = await call(w, '/login', { method: 'POST', body: { password: 'wrong but long enough pass', code: await code() } });
  const badCode = await call(w, '/login', { method: 'POST', body: { password: PASSWORD, code: '000000' } });
  check('a wrong password and a wrong code get the same answer', badPw.status === 401 && badCode.status === 401 && badPw.body.error === 'wrong' && badCode.body.error === 'wrong');
  const { r, cookie } = await logOn(w);
  const main = r.cookies.find((c) => c.startsWith(`${COOKIE}=`)) ?? '';
  const ui = r.cookies.find((c) => c.startsWith(`${UI_COOKIE}=`)) ?? '';
  check('the right password and code: a session', r.status === 200 && r.body.ok && /^__Host-kus98_admin=[A-Za-z0-9_-]{43}$/.test(cookie), r);
  check('… cookie: HttpOnly, Secure, SameSite=Lax, Path=/, 12 hours', /HttpOnly/.test(main) && /Secure/.test(main) && /SameSite=Lax/.test(main) && /Path=\//.test(main) && /Max-Age=43200/.test(main) && !/Domain/i.test(main), main);
  check('… and the harmless UI cookie (readable by the page)', /^kus98_admin_ui=1;/.test(ui) && !/HttpOnly/.test(ui), ui);
  const again = await call(w, '/login', { method: 'POST', body: { password: PASSWORD, code: await code() } });
  check('the same code a second time: refused (someone who saw it can\'t reuse it)', again.status === 401);
  const me = await call(w, '/me', { cookie });
  check('/me with the session: admin', me.status === 200 && me.body.admin === true && me.body.notion === true);
  check('adminSession() for the guide gate', (await adminSession(req('/me', { cookie }), w.guard)) && !(await adminSession(req('/me'), w.guard)));
  const anon = await call(w, '/me');
  check('/me without it: 401, and the UI cookie is cleared', anon.status === 401 && anon.cookies.some((c) => c.startsWith(`${UI_COOKIE}=;`)));
  check('every other call without a session: 401', (await call(w, '/suggestions')).status === 401 && (await call(w, '/routine', { method: 'POST', body: {} })).status === 401);
  check('a GET from another site with the cookie: 403', (await call(w, '/suggestions', { cookie, site: 'cross-site' })).status === 403);
  const out = await call(w, '/logout', { method: 'POST', body: {}, cookie });
  check('Log Off: the session ends, the cookies are cleared', out.status === 200 && (await call(w, '/me', { cookie })).status === 401 && out.cookies.some((c) => c.startsWith(`${COOKIE}=;`)));
  now += 60_000;
  const a = (await logOn(w)).cookie;
  now += 60_000;
  const b = (await logOn(w, { ip: '9.9.9.9' })).cookie;
  await call(w, '/logout-all', { method: 'POST', body: {}, cookie: a });
  check('Log Off Everywhere: every session ends', (await call(w, '/me', { cookie: a })).status === 401 && (await call(w, '/me', { cookie: b })).status === 401);
}
{
  const w = world();
  let last = 0;
  for (let i = 0; i < FAILS.visitor; i++) last = (await call(w, '/login', { method: 'POST', body: { password: 'nope nope nope nope', code: '123456' } })).status;
  const right = await call(w, '/login', { method: 'POST', body: { password: PASSWORD, code: await code() } });
  check(`after ${FAILS.visitor} wrong tries: locked out, even with the right password and code`, last === 429 && right.status === 429 && right.body.error === 'wait', [last, right]);
  check('… another visitor is not locked out', (await logOn(w, { ip: '5.5.5.5' })).r.status === 200);
  now += 3601_000;
  check('… and an hour later it opens again', (await logOn(w)).r.status === 200);
}
{
  const w = world();
  let last = 0;
  for (let i = 0; i < FAILS.all + 1; i++) last = (await call(w, '/login', { method: 'POST', ip: `10.0.${i >> 8}.${i & 255}`, body: { password: 'nope nope nope nope', code: '123456' } })).status;
  const owner = await call(w, '/login', { method: 'POST', ip: '77.77.77.77', body: { password: PASSWORD, code: await code() } });
  check(`more than ${FAILS.all} wrong tries from many places in an hour: closed for everyone for an hour`, last === 429 && owner.status === 429 && owner.body.error === 'wait', [last, owner.status]);
}
{
  const w = world();
  const { r, cookie } = await logOn(w, { host: 'http://127.0.0.1:8787' });
  const c = r.cookies.find((x) => x.startsWith(`${COOKIE_LOCAL}=`)) ?? '';
  check('on http://127.0.0.1 (wrangler dev): a plain cookie name, not Secure', r.status === 200 && !!cookie && !/Secure/.test(c), c);
}

// ---- The queue ----
const form: Suggestion = {
  guide: SLUG, kind: 'exhibition', name: 'Galerie Exemple', show: 'Winter Light', artists: 'Ana Silva', start: '2026-11-08', end: '2026-12-20',
  hours: '', address: '1 rue Exemple, 75003 Paris', website: 'https://exemple.fr/', links: [], description: 'x', own: false,
  pictureCredit: '', rights: false, submitter: 'Ana Silva', email: 'ana@example.com', mayContact: true, creditAs: '', lang: 'en',
};
async function seed(w: W, o: Partial<Suggestion> = {}, ref = 'S-AAAA') {
  const sub = `sub-${ref}`;
  const p = await w.n.createPage('ds-s', suggestionProps({ ...form, ...o }, { reference: ref, submission: sub, audience: 'visitor', fingerprint: '', duplicate: '' }));
  const contact = { ...form, ...o };
  if (contact.email || contact.submitter) await w.n.createPage('ds-c', contactProps(contact, { reference: ref, submission: sub, audience: 'visitor', fingerprint: '', duplicate: '' }, p.id));
  return p.id;
}
{
  const w = world();
  const { cookie } = await logOn(w);
  const a = await seed(w, {}, 'S-AAAA');
  const b = await seed(w, { name: 'Second Place', email: 'bo@example.com', mayContact: false }, 'S-BBBB');
  const c = await seed(w, { name: 'No Email', email: '', submitter: '' }, 'S-CCCC');
  const all = await call(w, '/suggestions', { cookie });
  check('the queue: every suggestion, newest first, no emails in the list', all.status === 200 && all.body.rows.length === 3 && all.body.rows[0].reference === 'S-CCCC' && !JSON.stringify(all.body).includes('ana@example.com'));
  const one = await call(w, `/suggestions/${a}`, { cookie });
  check('one suggestion: its fields and its contact (for the owner\'s eyes)', one.status === 200 && one.body.row.name === 'Galerie Exemple' && one.body.contact.email === 'ana@example.com' && one.body.contact.mayContact === true);
  const contactPage = [...w.s.pages.values()].find((p: { parent: { data_source_id: string } }) => p.parent.data_source_id === 'ds-c') as { id: string };
  check('a Contacts page id is not a suggestion: 404', (await call(w, `/suggestions/${contactPage.id}`, { cookie })).status === 404);

  const appr = await call(w, `/suggestions/${a}`, { method: 'POST', cookie, body: { status: 'APPROVED', tier: 'B', showTo: 'Everyone', notes: 'Use the gallery site' } });
  const row = readSuggestion(await w.n.getPage(a));
  check('Approve: status, tier, notes in Notion', appr.status === 200 && row.status === 'APPROVED' && row.tier === 'B' && row.notes === 'Use the gallery site');
  check('… and the routine starts at once', appr.body.routine?.fired === true && w.fired.length === 1 && w.fired[0].includes('S-AAAA'));
  const appr2 = await call(w, `/suggestions/${b}`, { method: 'POST', cookie, body: { status: 'APPROVED' } });
  check('a second approval within ten minutes: no second run (the first handles it)', appr2.body.routine?.fired === false && appr2.body.routine?.reason === 'recently' && w.fired.length === 1);
  check('a status the admin can\'t set (PUBLISHED is the publisher\'s): 400', (await call(w, `/suggestions/${b}`, { method: 'POST', cookie, body: { status: 'PUBLISHED' } })).status === 400);
  check('Show to an audience the guide doesn\'t have: 400', (await call(w, `/suggestions/${b}`, { method: 'POST', cookie, body: { showTo: 'friends' } })).status === 400);
  const ed = await call(w, `/suggestions/${c}`, { method: 'POST', cookie, body: { name: 'No Email Gallery', start: '2026-11-10', end: '2026-11-12', website: 'https://noemail.example/' } });
  const er = readSuggestion(await w.n.getPage(c));
  check('Edit: fields and dates change in Notion', ed.status === 200 && er.name === 'No Email Gallery' && er.start === '2026-11-10' && er.end === '2026-11-12' && er.website === 'https://noemail.example/');
  check('Edit: an end before the start is refused', (await call(w, `/suggestions/${c}`, { method: 'POST', cookie, body: { start: '2026-12-10', end: '2026-12-01' } })).status === 400);
  check('the log has the admin\'s actions', [...w.s.pages.values()].filter((p: { parent: { data_source_id: string } }) => p.parent.data_source_id === 'ds-log').length >= 4);
  const log = await call(w, '/log', { cookie });
  check('the Log tab reads it back, newest first', log.status === 200 && log.body.entries.length >= 4 && typeof log.body.entries[0].run === 'string');
  const m = await call(w, `/suggestions/${a}/matches`, { cookie });
  check('Possible duplicates: run against the guide on main and the other suggestions', m.status === 200 && m.body.guideChecked === true && Array.isArray(m.body.matches));

  // ---- Email ----
  const key = () => crypto.randomUUID();
  const k1 = key();
  const e1 = await call(w, `/suggestions/${a}/email`, { method: 'POST', cookie, body: { subject: 'A question about Galerie Exemple', text: 'Is it open on Mondays?', key: k1, asked: true } });
  const mail = w.sent[0];
  check('Ask Submitter: sent to the address in Contacts, from noreply, replies to hi@', e1.status === 200 && mail?.to === 'ana@example.com' && mail.from.email === 'noreply@kuschonink.com' && mail.replyTo === 'hi@kuschonink.com' && mail.text.includes('Is it open on Mondays?') && mail.text.includes('S-AAAA'), mail);
  const e1again = await call(w, `/suggestions/${a}/email`, { method: 'POST', cookie, body: { subject: 'A question about Galerie Exemple', text: 'Is it open on Mondays?', key: k1 } });
  check('the same email again (a double click): not sent twice', e1again.body.repeat === true && w.sent.length === 1);
  check('no consent: refused', (await call(w, `/suggestions/${b}/email`, { method: 'POST', cookie, body: { subject: 'Hi', text: 'Hi', key: key() } })).body.error === 'no_consent' && w.sent.length === 1);
  check('no email address: refused', (await call(w, `/suggestions/${c}/email`, { method: 'POST', cookie, body: { subject: 'Hi', text: 'Hi', key: key() } })).body.error === 'no_email');
  check('a line break in the subject (a header trick): refused', (await call(w, `/suggestions/${a}/email`, { method: 'POST', cookie, body: { subject: 'Hi\nBcc: x@evil.example', text: 'Hi', key: key() } })).status === 400);
  check('the browser can\'t choose the recipient (a "to" field is ignored)', (await call(w, `/suggestions/${a}/email`, { method: 'POST', cookie, body: { to: 'evil@example.com', subject: 'Hi', text: 'Hi', key: key() } }), w.sent.at(-1)?.to === 'ana@example.com'));
  for (let i = w.sent.length; i < EMAILS_PER_HOUR; i++) await call(w, `/suggestions/${a}/email`, { method: 'POST', cookie, body: { subject: `Note ${i}`, text: 'Hi', key: key() } });
  check(`more than ${EMAILS_PER_HOUR} emails in an hour: 429`, (await call(w, `/suggestions/${a}/email`, { method: 'POST', cookie, body: { subject: 'One more', text: 'Hi', key: key() } })).status === 429 && w.sent.length === EMAILS_PER_HOUR);
}
{
  const unclear = world({ mail: async () => { throw new Error('timeout'); } });
  const { cookie } = await logOn(unclear);
  const a = await seed(unclear);
  const k = crypto.randomUUID();
  const first = await call(unclear, `/suggestions/${a}/email`, { method: 'POST', cookie, body: { subject: 'Hi', text: 'Hi', key: k } });
  let tries = 0;
  unclear.deps.mail = async () => { tries++; };
  const retry = await call(unclear, `/suggestions/${a}/email`, { method: 'POST', cookie, body: { subject: 'Hi', text: 'Hi', key: k } });
  check('an unclear send is never sent again with the same key', first.status === 502 && retry.body.repeat === true && retry.body.status === 'unclear' && tries === 0, [first, retry]);
}

// ---- Run Now, Publish Now, not set up ----
{
  const w = world();
  const { cookie } = await logOn(w);
  check('Run Now: starts the routine', (await call(w, '/routine', { method: 'POST', cookie, body: {} })).body.fired === true && w.fired.length === 1);
  check('Publish Now: runs the publisher', (await call(w, '/publish', { method: 'POST', cookie, body: {} })).body.ok === true);
  const bare = world({ notion: null, mail: null, fireRoutine: null, publish: null, gh: null });
  const bc = (await logOn(bare)).cookie;
  const me = await call(bare, '/me', { cookie: bc });
  check('nothing set up yet: /me says so, the queue says 503', me.body.notion === false && me.body.mail === false && (await call(bare, '/suggestions', { cookie: bc })).status === 503);
}

// ---- Editing a published entry ----
{
  const w = world();
  const { cookie } = await logOn(w);
  const got = await call(w, `/items/${SLUG}/A4`, { cookie });
  check('the editor starts from the entry as main has it', got.status === 200 && got.body.item.id === 'A4' && typeof got.body.item.why === 'string');
  check('… an entry that isn\'t there: 404', (await call(w, `/items/${SLUG}/A99`, { cookie })).status === 404);
  const r = await call(w, `/items/${SLUG}/A4`, { method: 'POST', cookie, body: { fields: { hours: 'Wed–Sun 11:00–20:00', hoursZh: '周三至周日 11:00–20:00' } } });
  const items = (JSON.parse(w.g.files()[`${DIR}/items.json`]) as ItemsFile).items;
  check('Edit… on A4: one commit, only items.json, the new hours', r.status === 200 && items.find((i) => i.id === 'A4')?.hours === 'Wed–Sun 11:00–20:00' && Object.keys(w.g.files()).every((p) => p.endsWith('items.json') || w.g.files()[p] === files[p]), r.body);
  const bad = await call(w, `/items/${SLUG}/A4`, { method: 'POST', cookie, body: { fields: { zone: 'nowhere' } } });
  check('an edit the guide\'s check refuses: 422 with its words, nothing committed', bad.status === 422 && bad.body.problems.some((p: string) => p.includes('nowhere')));
  const word = await call(w, `/items/${SLUG}/A4`, { method: 'POST', cookie, body: { fields: { note: 'Ask at the workshop.' } } });
  check('a participants-only word in an entry for everyone: refused', word.status === 422 && word.body.problems[0].includes('workshop'));
  check('fields an edit may not set (id, suggested): 400', (await call(w, `/items/${SLUG}/A4`, { method: 'POST', cookie, body: { fields: { id: 'A1' } } })).status === 400);
  const before = items.filter((i) => i.tier === 'B').length;
  const t = await call(w, `/items/${SLUG}/C2`, { method: 'POST', cookie, body: { fields: { tier: 'B' } } });
  const after = (JSON.parse(w.g.files()[`${DIR}/items.json`]) as ItemsFile).items;
  check('a new tier: a new id (C2 → B16), never reusing one', t.status === 200 && t.body.id === `B${before + 1}` && after.some((i) => i.id === t.body.id && i.tier === 'B') && !after.some((i) => i.id === 'C2'), t.body);
}

console.log(fails ? `${fails} FAILED` : 'all passed');
if (fails) process.exitCode = 1;
