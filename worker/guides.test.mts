// npm test: the Field Guide's password gate (worker/guides.ts), against a
// stand-in ASSETS, made-up audiences and made-up passwords.
import { createHmac, pbkdf2Sync } from 'node:crypto';
import { COOKIE, MIN_PEPPER, REMEMBER_S, SESSION_S, cleanNext, closure, handleGuides, isGuidesPath, limitKey, makeToken, normalise, viewOf, type GuidesDeps } from './guides.ts';
import type { AccessFile } from '../src/lib/guides/types';
import realAccess from '../src/content/guides/access.json' with { type: 'json' };

// Three audiences, least privileged first; staff includes member includes visitor.
const ACCESS = {
  audiences: [
    { id: 'visitor', label: 'Visitor', secret: 'GUIDES_PASSWORD' },
    { id: 'member', label: 'Member', secret: 'GUIDES_PASSWORD_MEMBER', includes: ['visitor'] },
    { id: 'staff', label: 'Staff', secret: 'GUIDES_PASSWORD_STAFF', includes: ['member'] },
  ],
  guides: { 'city-one': ['visitor', 'member'], 'members-only': ['member'], 'open-day': ['visitor'], _comment: 'not a guide' },
} as unknown as AccessFile;
const PW = { visitor: 'Test only: ink paper rain', member: 'test only: brush stone wind', staff: 'test only: lamp river moss' };
const SECRETS: Record<string, string | undefined> = { GUIDES_PASSWORD: PW.visitor, GUIDES_PASSWORD_MEMBER: PW.member, GUIDES_PASSWORD_STAFF: PW.staff };
// The pepper (GUIDES_COOKIE_SECRET), and another one for the rotation tests.
const PEPPER = 'test only: made-up cookie secret, not a real one';
const PEPPER2 = 'test only: another made-up cookie secret';
const NOW = Date.UTC(2026, 10, 9, 9, 0, 0);
const SITE = 'https://kuschonink.com';

// ---- Stand-in ASSETS: views only for allowed (guide, audience) pairs ----
let asked: string[] = [];
function assets(req: Request): Response {
  const p = new URL(req.url).pathname;
  asked.push(p);
  const page = (body: string, status = 200) =>
    new Response(req.method === 'HEAD' ? null : body, { status, headers: { 'content-type': 'text/html; charset=utf-8', etag: '"page"', 'last-modified': 'Mon, 02 Nov 2026 10:00:00 GMT' } });
  let m = /^\/guides\/([a-z0-9-]+)\/views\/([a-z0-9-]+)$/.exec(p);
  if (m && (ACCESS.guides[m[1]] ?? []).includes(m[2])) return page(`<html><body>VIEW ${m[1]} ${m[2]}</body></html>`);
  m = /^\/guides\/([a-z0-9-]+)\/locked$/.exec(p);
  if (m) return page(`<html><body><div class="gd-logon" data-gd-logon data-gd-state="none">LOCKED ${m[1]}</div></body></html>`);
  if (p === '/guides/city-one/img/A1.jpg' || p === '/guides/city-one/map/city.jpg' || p === '/guides/members-only/img/A1.jpg') {
    if (req.headers.get('if-none-match') === '"img1"') return new Response(null, { status: 304, headers: { etag: '"img1"' } });
    return new Response(req.method === 'HEAD' ? null : 'JPEG', { headers: { 'content-type': 'image/jpeg', etag: '"img1"', 'cache-control': 'public, max-age=0, must-revalidate' } });
  }
  return page('<html><body>SITE 404 PAGE</body></html>', p === '/404' ? 200 : 404); // /404 itself is a 200, like ASSETS
}
let logs: string[] = [];
let limited: string[] = [];
const deps = (o: Partial<GuidesDeps> & { secrets?: Record<string, string | undefined> } = {}): GuidesDeps => {
  const secrets = o.secrets ?? SECRETS;
  return {
    access: ACCESS,
    secret: (n) => secrets[n],
    cookieSecret: () => PEPPER,
    assets,
    allow: async (k) => (limited.push(k), true),
    now: () => NOW,
    log: (...a) => logs.push(a.join(' ')),
    ...o,
  };
};
const run = (req: Request, d = deps()) => handleGuides(req, d);

// ---- Requests ----
const get = (path: string, cookie?: string, headers: Record<string, string> = {}, method = 'GET') =>
  new Request(path.startsWith('http') ? path : SITE + path, { method, headers: { ...(cookie ? { cookie } : {}), ...headers } });
interface PostOpts { json?: boolean; origin?: string | null; site?: string | null; ct?: string; host?: string; referer?: string; body?: string; headers?: Record<string, string> }
function post(path: string, fields: Record<string, string> = {}, o: PostOpts = {}): Request {
  const host = o.host ?? SITE;
  const h: Record<string, string> = { 'content-type': o.ct ?? 'application/x-www-form-urlencoded;charset=UTF-8', 'cf-connecting-ip': '1.2.3.4', ...o.headers };
  if (o.origin !== null) h.origin = o.origin ?? host;
  if (o.site !== null) h['sec-fetch-site'] = o.site ?? 'same-origin';
  if (o.json) h.accept = 'application/json';
  if (o.referer) h.referer = o.referer;
  return new Request(host + path, { method: 'POST', headers: h, body: o.body ?? new URLSearchParams(fields).toString() });
}
const login = (slug: string, password: string, o: PostOpts & { remember?: boolean; next?: string } = {}) =>
  post(`/guides/${slug}/login`, { password, ...(o.remember ? { remember: '1' } : {}), next: o.next ?? '' }, o);
const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0];
const tokenOf = (cookie: string) => cookie.slice(COOKIE.length + 1);
async function cookieFor(slug: string, password: string, d = deps()) {
  return cookieOf(await run(login(slug, password), d));
}
const body = (res: Response) => res.text();

// ---- Checks ----
let fails = 0;
let count = 0;
function check(name: string, ok: boolean, detail: unknown = '') {
  count++;
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail));
}
const isPage = (r: Response) =>
  r.headers.get('cache-control') === 'private, no-store' &&
  r.headers.get('vary') === 'Cookie' &&
  r.headers.get('x-robots-tag') === 'noindex, nofollow, noarchive' &&
  r.headers.get('content-security-policy') === "frame-ancestors 'none'" &&
  r.headers.get('x-frame-options') === 'DENY' &&
  r.headers.get('x-content-type-options') === 'nosniff' &&
  !r.headers.has('etag') &&
  !r.headers.has('last-modified');
async function expectView(name: string, req: Request, view: string | null, d = deps()) {
  const res = await run(req, d);
  const text = await body(res);
  const want = view ? `VIEW ${view}` : 'LOCKED';
  check(name, res.status === 200 && text.includes(want) && isPage(res), { status: res.status, text: text.slice(0, 120) });
}

// ---- Helpers ----
check('isGuidesPath: /guides/<slug> yes; /guides, /Guides/x, /guidesx no', isGuidesPath('/guides/x') && !isGuidesPath('/guides') && !isGuidesPath('/Guides/x') && !isGuidesPath('/guidesx'));
check('normalise: case, spaces, full width', normalise('  ＴＥＳＴ　only:   Ink\tPAPER rain ') === 'test only: ink paper rain' && normalise(PW.visitor) === 'test only: ink paper rain');
check('closure follows includes at any depth', [...closure(ACCESS, 'staff')].sort().join() === 'member,staff,visitor' && [...closure(ACCESS, 'visitor')].join() === 'visitor');
check('viewOf: most privileged listed audience it includes', viewOf(ACCESS, 'city-one', 'staff') === 'member' && viewOf(ACCESS, 'open-day', 'member') === 'visitor' && viewOf(ACCESS, 'members-only', 'visitor') === null && viewOf(ACCESS, 'nowhere', 'staff') === null);

// ---- The guide's address without a cookie ----
{
  asked = [];
  const res = await run(get('/guides/city-one'));
  const text = await body(res);
  check('no cookie → 200 log-on page, private/no-store/Vary/noindex/CSP/XFO/nosniff, no ETag', res.status === 200 && text.includes('LOCKED city-one') && text.includes('data-gd-state="none"') && isPage(res), { status: res.status, h: [...res.headers] });
  check('… fetched as /guides/<slug>/locked only', asked.join() === '/guides/city-one/locked', asked);
}
{
  const res = await run(get('/guides/city-one'), deps({ secrets: {} }));
  check('no password set → log-on page says "off"', res.status === 200 && (await body(res)).includes('data-gd-state="off"'));
  const short = await run(get('/guides/city-one'), deps({ secrets: { GUIDES_PASSWORD: 'short', GUIDES_PASSWORD_MEMBER: '   seven  ' } }));
  check('passwords under 6 characters count as unset → "off"', (await body(short)).includes('data-gd-state="off"'));
}
{
  const res = await run(get('/guides/city-one', undefined, {}, 'HEAD'));
  check('HEAD → 200, same headers, no body', res.status === 200 && res.body === null && isPage(res), res.status);
  const p = await run(get('/guides/city-one', undefined, {}, 'POST'));
  check('POST to the guide → 405, Allow: GET, HEAD', p.status === 405 && p.headers.get('allow') === 'GET, HEAD', p.status);
}

// ---- Log on, then the views ----
let visitorCookie = '';
let memberCookie = '';
{
  const res = await run(login('city-one', PW.visitor));
  const sc = res.headers.get('set-cookie') ?? '';
  visitorCookie = cookieOf(res);
  const [, aud, exp] = tokenOf(visitorCookie).split('.');
  check('visitor password (no JS) → 303 to the guide', res.status === 303 && res.headers.get('location') === '/guides/city-one', { status: res.status, loc: res.headers.get('location') });
  check('session cookie: Path=/guides; HttpOnly; Secure; SameSite=Lax; no Max-Age; signed 12 h', /; Path=\/guides(;|$)/.test(sc) && sc.includes('; HttpOnly') && sc.includes('; Secure') && sc.includes('; SameSite=Lax') && !sc.includes('Max-Age') && aud === 'visitor' && Number(exp) === Math.floor(NOW / 1000) + SESSION_S, sc);
  // The same token, computed independently: the key is HMAC-SHA-256(pepper, guides|key|v1|<aud>\0<normalised password>), then HMAC over guides|v1|<aud>|<exp>.
  const key = createHmac('sha256', PEPPER).update(`guides|key|v1|visitor\0${normalise(PW.visitor)}`).digest();
  const sig = createHmac('sha256', key).update(`guides|v1|visitor|${exp}`).digest('base64url');
  check('cookie value is v1.<aud>.<exp>.<HMAC> with the key from the pepper and the password', tokenOf(visitorCookie) === `v1.visitor.${exp}.${sig}`, visitorCookie);
}
asked = [];
await expectView('visitor cookie → the visitor view', get('/guides/city-one', visitorCookie), 'city-one visitor');
check('… fetched from /guides/<slug>/views/visitor', asked.join() === '/guides/city-one/views/visitor', asked);
{
  const res = await run(login('city-one', PW.member, { json: true, remember: true }));
  const sc = res.headers.get('set-cookie') ?? '';
  memberCookie = cookieOf(res);
  const b = await res.json();
  check('member password (JSON, remember) → 200 {ok, next}, Max-Age 30 days', res.status === 200 && b.ok === true && b.next === '/guides/city-one' && sc.includes(`Max-Age=${REMEMBER_S}`) && tokenOf(memberCookie).startsWith('v1.member.'), { status: res.status, b, sc });
}
await expectView('member cookie → the member view', get('/guides/city-one', memberCookie), 'city-one member');
{
  const staff = await cookieFor('city-one', PW.staff);
  check('staff password works where staff is not listed but includes a listed audience', tokenOf(staff).startsWith('v1.staff.'), staff);
  await expectView('staff cookie → the most privileged view it includes (member)', get('/guides/city-one', staff), 'city-one member');
  await expectView('staff cookie → open-day: the visitor view', get('/guides/open-day', staff), 'open-day visitor');
}
await expectView('member cookie → open-day (visitor only): the visitor view', get('/guides/open-day', memberCookie), 'open-day visitor');
await expectView('visitor cookie → members-only: a guide it may not open → log-on page', get('/guides/members-only', visitorCookie), null);
await expectView('member cookie → members-only: the member view', get('/guides/members-only', memberCookie), 'members-only member');
{
  const res = await run(login('members-only', PW.visitor, { json: true }));
  check('visitor password on members-only → 401 wrong_password, no cookie', res.status === 401 && (await res.json()).error === 'wrong_password' && !res.headers.has('set-cookie'));
}
{
  logs = [];
  const same = deps({ secrets: { ...SECRETS, GUIDES_PASSWORD_MEMBER: `  ${PW.visitor.toUpperCase()} ` } });
  const c = await cookieFor('city-one', PW.visitor, same);
  check('two audiences share a password → the least privileged wins', tokenOf(c).startsWith('v1.visitor.'), c);
  await expectView('… its cookie opens the visitor view', get('/guides/city-one', c), 'city-one visitor', same);
  const forged = `${COOKIE}=${await makeToken(PEPPER, 'member', normalise(PW.visitor), Math.floor(NOW / 1000) + 3600)}`;
  await expectView('… and a member cookie signed with the shared password is refused', get('/guides/city-one', forged), null, same);
  check('… the log names the secret that is ignored (never the password)', logs.some((l) => l.includes('GUIDES_PASSWORD_MEMBER') && l.includes('same as GUIDES_PASSWORD')) && !logs.some((l) => l.toLowerCase().includes('ink paper')), logs);
}

// ---- Bad cookies ----
{
  const exp = (s: number) => Math.floor(NOW / 1000) + s;
  const vpw = normalise(PW.visitor);
  const [, , e, sig] = tokenOf(visitorCookie).split('.');
  const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
  await expectView('expired cookie → log-on page', get('/guides/city-one', `${COOKIE}=${await makeToken(PEPPER, 'visitor', vpw, exp(-1))}`), null);
  await expectView('cookie dated absurdly far ahead → log-on page', get('/guides/city-one', `${COOKIE}=${await makeToken(PEPPER, 'visitor', vpw, exp(400 * 86400))}`), null);
  await expectView('tampered signature → log-on page', get('/guides/city-one', `${COOKIE}=v1.visitor.${e}.${flip(sig, 10)}`), null);
  await expectView('audience changed to member → log-on page', get('/guides/city-one', `${COOKIE}=v1.member.${e}.${sig}`), null);
  await expectView("member cookie signed with the visitor's password → log-on page", get('/guides/city-one', `${COOKIE}=${await makeToken(PEPPER, 'member', vpw, exp(3600))}`), null);
  await expectView('unknown audience → log-on page', get('/guides/city-one', `${COOKIE}=${await makeToken(PEPPER, 'ghost', vpw, exp(3600))}`), null);
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const lowBits = sig.slice(0, -1) + B64[B64.indexOf(sig.at(-1)!) ^ 1]; // decodes to the same bytes
  const malformed: Record<string, string> = {
    empty: '',
    garbage: 'garbage',
    'no expiry or signature': 'v1.visitor',
    'version v2': `v2.visitor.${e}.${sig}`,
    'signature too long': `v1.visitor.${e}.${sig}x`,
    'capital audience': `v1.Visitor.${e}.${sig}`,
    'padded signature': `v1.visitor.${e}.${sig.slice(0, -1)}=`,
    quoted: `"v1.visitor.${e}.${sig}"`,
    'other spelling of the same signature': `v1.visitor.${e}.${lowBits}`,
    'expiry with 11 digits': `v1.visitor.0${e}.${sig}`,
  };
  for (const [what, bad] of Object.entries(malformed)) await expectView(`malformed cookie (${what}) → log-on page`, get('/guides/city-one', `${COOKIE}=${bad}`), null);
  await expectView('garbage cookie, then a valid one → the view', get('/guides/city-one', `other=1; ${COOKIE}=garbage; ${visitorCookie}`), 'city-one visitor');
  const changed = deps({ secrets: { ...SECRETS, GUIDES_PASSWORD: 'a new visitor password' } });
  await expectView('visitor password changed → visitor cookies stop working', get('/guides/city-one', visitorCookie), null, changed);
  await expectView('… member cookies still work', get('/guides/city-one', memberCookie), 'city-one member', changed);
  const off = await run(get('/guides/city-one', memberCookie), deps({ secrets: {} }));
  check('passwords removed → a once-valid cookie gets the log-on page, "off"', (await body(off)).includes('data-gd-state="off"'));
  const odd = { ...ACCESS, audiences: [{ id: 'visitor', label: 'Visitor', secret: 'CONTACT_TO' }] } as AccessFile;
  const r = await run(login('open-day', 'someone@example.com', { json: true }), deps({ access: odd, secrets: { CONTACT_TO: 'someone@example.com' } }));
  check('a secret name outside GUIDES_… is never a password → 503 not_configured', r.status === 503 && (await r.json()).error === 'not_configured', r.status);
  const peppered = { ...ACCESS, audiences: [{ id: 'visitor', label: 'Visitor', secret: 'GUIDES_COOKIE_SECRET' }] } as AccessFile;
  const rp = await run(login('open-day', PEPPER, { json: true }), deps({ access: peppered, secrets: { GUIDES_COOKIE_SECRET: PEPPER } }));
  check("the pepper's name, GUIDES_COOKIE_SECRET, is never a password → 503 not_configured", rp.status === 503 && (await rp.json()).error === 'not_configured', rp.status);
}

// ---- The pepper (GUIDES_COOKIE_SECRET): without one, every guide is closed ----
{
  const exp = Math.floor(NOW / 1000) + 3600;
  logs = [];
  const unset: [string, string | undefined][] = [
    ['no pepper', undefined],
    ['an empty pepper', ''],
    [`a pepper under ${MIN_PEPPER} characters`, 'x'.repeat(MIN_PEPPER - 1)],
    [`a pepper under ${MIN_PEPPER} characters once trimmed`, `   ${'x'.repeat(MIN_PEPPER - 1)}\n  `],
  ];
  for (const [what, pepper] of unset) {
    const d = deps({ cookieSecret: () => pepper });
    const pg = await run(get('/guides/city-one', visitorCookie), d);
    check(`${what} → the log-on page says "off", even with a valid cookie`, pg.status === 200 && (await body(pg)).includes('data-gd-state="off"') && isPage(pg), pg.status);
    const lj = await run(login('city-one', PW.visitor, { json: true }), d);
    check(`${what} → login 503 not_configured, no cookie`, lj.status === 503 && (await lj.json()).error === 'not_configured' && !lj.headers.has('set-cookie'), lj.status);
    const lh = await run(login('city-one', PW.member), d);
    check(`${what} → login (no JS) 503 log-on page, "off"`, lh.status === 503 && (await body(lh)).includes('data-gd-state="off"') && !lh.headers.has('set-cookie'), lh.status);
    asked = [];
    const img = await run(get('/guides/city-one/img/A1.jpg', memberCookie), d);
    check(`${what} → pictures 403, ASSETS never asked`, img.status === 403 && asked.length === 0, { s: img.status, asked });
  }
  const said = logs.filter((l) => l.includes('cookie secret'));
  check('… one neutral log line per isolate, with no values', said.length === 1 && !logs.some((l) => /xxxx|ink paper|brush stone/i.test(l)), logs);

  // Cookies made without this server's pepper: under another pepper, or the old way (PBKDF2 of the password alone).
  const other = `${COOKIE}=${await makeToken(PEPPER2, 'visitor', normalise(PW.visitor), exp)}`;
  await expectView('a cookie signed under another pepper → log-on page', get('/guides/city-one', other), null);
  const oldToken = (aud: string, pw: string) => {
    const k = pbkdf2Sync(normalise(pw), 'kuschonink.com guides cookie v1', 10_000, 32, 'sha256');
    return `v1.${aud}.${exp}.${createHmac('sha256', k).update(`guides|v1|${aud}|${exp}`).digest('base64url')}`;
  };
  await expectView('a cookie made the old way (PBKDF2, no pepper) with the right password → log-on page', get('/guides/city-one', `${COOKIE}=${oldToken('visitor', PW.visitor)}`), null);
  asked = [];
  const guesses = ['wrong guess one', 'wrong guess two', 'wrong guess three', PW.member].map((g) => `${COOKIE}=${oldToken('member', g)}`).join('; ');
  const og = await run(get('/guides/city-one/img/A1.jpg', guesses));
  const oo = await run(get('/guides/city-one/img/A1.jpg', other));
  check('… four such guesses in one request, the right one among them → pictures 403; so is the other pepper\'s cookie', og.status === 403 && oo.status === 403 && asked.length === 0, { s: [og.status, oo.status], asked });

  // Changing the pepper logs everyone out; with the new one, both passwords work again.
  const rotated = deps({ cookieSecret: () => PEPPER2 });
  await expectView('pepper changed → visitor cookies stop working', get('/guides/city-one', visitorCookie), null, rotated);
  await expectView('… and member cookies too', get('/guides/city-one', memberCookie), null, rotated);
  check('… the log-on page stays open ("none"), not "off"', (await body(await run(get('/guides/city-one', memberCookie), rotated))).includes('data-gd-state="none"'));
  for (const [aud, pw] of [['visitor', PW.visitor], ['member', PW.member]] as const) {
    const c = await cookieFor('city-one', pw, rotated);
    await expectView(`new pepper: the ${aud} password logs on and opens the ${aud} view`, get('/guides/city-one', c), `city-one ${aud}`, rotated);
    await expectView('… and that cookie is refused under the first pepper', get('/guides/city-one', c), null);
  }
  await expectView('the first pepper again → its cookies work again (keys made afresh, never mixed up)', get('/guides/city-one', visitorCookie), 'city-one visitor');
  await expectView('the pepper is trimmed: spaces and a newline around it change nothing', get('/guides/city-one', memberCookie), 'city-one member', deps({ cookieSecret: () => `  ${PEPPER}\n` }));
}

// ---- Log-on errors ----
{
  const j = await run(login('city-one', 'not the password', { json: true }));
  check('wrong password (JSON) → 401 wrong_password, no cookie', j.status === 401 && (await j.json()).error === 'wrong_password' && !j.headers.has('set-cookie'));
  const h = await run(login('city-one', 'not the password'));
  const t = await body(h);
  check('wrong password (no JS) → 401 log-on page with data-gd-state="wrong"', h.status === 401 && t.includes('data-gd-state="wrong"') && isPage(h), h.status);
  check('spaces and capitals do not matter', tokenOf(await cookieFor('city-one', '  TEST ONLY:   ink  Paper RAIN ')).startsWith('v1.visitor.'));
  check('full-width characters (Chinese IME) do not matter', tokenOf(await cookieFor('city-one', 'ｔｅｓｔ　ｏｎｌｙ：　ｂｒｕｓｈ　ｓｔｏｎｅ　ｗｉｎｄ')).startsWith('v1.member.'));
  const empty = await run(login('city-one', '   ', { json: true }));
  check('empty password → 400 missing_password', empty.status === 400 && (await empty.json()).error === 'missing_password', empty.status);
  limited = [];
  const rl = deps({ allow: async (k) => (limited.push(k), false) });
  const r = await run(login('city-one', PW.visitor, { json: true }), rl);
  check('rate limited → 429 rate_limited, Retry-After 60, even with the right password', r.status === 429 && (await r.json()).error === 'rate_limited' && r.headers.get('retry-after') === '60' && !r.headers.has('set-cookie'), r.status);
  check('… the limit is keyed on the IP', limited.join() === 'guides:1.2.3.4', limited);
  const rh = await run(login('city-one', PW.visitor), rl);
  check('rate limited (no JS) → 429 log-on page, "wait"', rh.status === 429 && (await body(rh)).includes('data-gd-state="wait"'), rh.status);
  const fo = await run(login('city-one', PW.visitor, { json: true, origin: 'https://evil.example', site: 'cross-site' }));
  check('foreign Origin → 403 origin_not_allowed', fo.status === 403 && (await fo.json()).error === 'origin_not_allowed' && !fo.headers.has('set-cookie'), fo.status);
  const fh = await run(login('city-one', PW.visitor, { origin: 'https://evil.example', site: null }));
  check('foreign Origin (no JS) → 403 log-on page, "denied"', fh.status === 403 && (await body(fh)).includes('data-gd-state="denied"'), fh.status);
  const cs = await run(login('city-one', PW.visitor, { json: true, origin: null, site: 'cross-site' }));
  check('Sec-Fetch-Site: cross-site → 403', cs.status === 403, cs.status);
  check('Origin: null with Sec-Fetch-Site: same-origin → allowed', (await run(login('city-one', PW.visitor, { origin: 'null' }))).status === 303);
  check('no browser signals (a script) → allowed, still rate-limited', (await run(login('city-one', PW.visitor, { origin: null, site: null }))).status === 303);
  const pv = await run(login('city-one', PW.visitor, { host: 'https://field-guide-kuschonink.example.workers.dev' }));
  check('a preview host posting to itself → allowed, Secure cookie', pv.status === 303 && (pv.headers.get('set-cookie') ?? '').includes('; Secure'), pv.status);
  const lh = await run(login('city-one', PW.visitor, { host: 'http://localhost:8787' }));
  check('localhost (wrangler dev) → cookie without Secure', lh.status === 303 && !(lh.headers.get('set-cookie') ?? '').includes('Secure'), lh.headers.get('set-cookie'));
  const nc = await run(login('city-one', PW.visitor, { json: true }), deps({ secrets: { GUIDES_PASSWORD: 'short' } }));
  check('no password set → 503 not_configured', nc.status === 503 && (await nc.json()).error === 'not_configured', nc.status);
  const nh = await run(login('city-one', PW.visitor), deps({ secrets: {} }));
  check('no password set (no JS) → 503 log-on page, "off"', nh.status === 503 && (await body(nh)).includes('data-gd-state="off"'), nh.status);
  const ct = await run(login('city-one', PW.visitor, { json: true, ct: 'application/json', body: JSON.stringify({ password: PW.visitor }) }));
  check('JSON body → 415 unsupported_media_type', ct.status === 415 && (await ct.json()).error === 'unsupported_media_type', ct.status);
  const big = await run(login('city-one', PW.visitor, { json: true, body: `password=${encodeURIComponent(PW.visitor)}&pad=${'x'.repeat(5000)}` }));
  check('5 KB body → 413 payload_too_large', big.status === 413 && (await big.json()).error === 'payload_too_large', big.status);
  const cl = await run(login('city-one', PW.visitor, { json: true, headers: { 'content-length': '99999' } }));
  check('Content-Length over 4 KB → 413 before reading', cl.status === 413, cl.status);
  const g = await run(get('/guides/city-one/login'));
  const gj = await run(get('/guides/city-one/login', undefined, { accept: 'application/json' }));
  check('GET /login → 303 to the guide (JSON: 405)', g.status === 303 && g.headers.get('location') === '/guides/city-one' && gj.status === 405, [g.status, gj.status]);
  check('all log-on replies are private, no-store', [j, h, r, fo, nc, ct, big].every((x) => x.headers.get('cache-control') === 'private, no-store'));
}

// ---- Rate-limit keys: IPv4 whole, IPv6 by its /64 ----
{
  const notAll = (want: string, ...ips: (string | null)[]) => ips.filter((ip) => limitKey(ip) !== want).map((ip) => `${ip} → ${limitKey(ip)}`);
  const v4 = notAll('guides:1.2.3.4', '1.2.3.4', ' 1.2.3.4 ');
  check('limitKey: an IPv4 address stays whole', !v4.length && limitKey('1.2.3.5') === 'guides:1.2.3.5' && limitKey(null) === 'guides:unknown', v4);
  const v6 = notAll('guides:2001:db8:1:2::/64', '2001:db8:1:2::abcd', '2001:0db8:0001:0002:ffff::1', '2001:db8:1:2:3:4:5:6', '2001:db8:1:2::');
  check('limitKey: an IPv6 address counts by its /64', !v6.length && limitKey('2001:db8:1:3::abcd') === 'guides:2001:db8:1:3::/64' && limitKey('2001:db8::1') === 'guides:2001:db8:0:0::/64' && limitKey('::1') === 'guides:0:0:0:0::/64', v6);
  const mapped = notAll('guides:1.2.3.4', '::ffff:1.2.3.4', '::ffff:102:304', '0:0:0:0:0:ffff:1.2.3.4');
  check('limitKey: an IPv4-mapped IPv6 address counts as that IPv4 address', !mapped.length, mapped);
  const zone = notAll('guides:fe80:0:0:0::/64', 'fe80::1%eth0', 'FE80::1%25ETH0', 'FE80:0:0:0:ABCD::1');
  check('limitKey: zone ids and capitals do not matter', !zone.length && limitKey('::FFFF:1.2.3.4') === 'guides:1.2.3.4' && limitKey('2001:DB8:1:2::ABCD') === 'guides:2001:db8:1:2::/64', zone);
  check('limitKey: something that is not an address is kept whole', limitKey('1::2::3') === 'guides:1::2::3' && limitKey('::ffff:1.2.3.400') === 'guides:::ffff:1.2.3.400', [limitKey('1::2::3'), limitKey('::ffff:1.2.3.400')]);
  limited = [];
  await run(login('city-one', 'not the password', { headers: { 'cf-connecting-ip': '2001:db8:1:2:aaaa:bbbb:cccc:dddd' } }));
  await run(login('city-one', 'not the password', { headers: { 'cf-connecting-ip': '2001:db8:1:2::1' } }));
  check('… log-on tries from one IPv6 /64 share one bucket', limited.join() === 'guides:2001:db8:1:2::/64,guides:2001:db8:1:2::/64', limited);
}

// ---- next: the deep link's query, kept and cleaned ----
{
  const loc = async (o: Parameters<typeof login>[2]) => (await run(login('city-one', PW.visitor, o))).headers.get('location') ?? '';
  check('next "?place=A3&day=…" is kept', (await loc({ next: '?place=A3&day=2026-11-10' })) === '/guides/city-one?place=A3&day=2026-11-10');
  check('next "//evil.example" → the guide', (await loc({ next: '//evil.example' })) === '/guides/city-one');
  check('next "https://evil.example/" → the guide', (await loc({ next: 'https://evil.example/' })) === '/guides/city-one');
  const crlf = await loc({ next: '?place=A3\r\nSet-Cookie: x=1' });
  check('next with CR/LF → dropped', crlf === '/guides/city-one' && !/[\r\n]/.test(crlf), crlf);
  check('odd keys and long values are dropped, the rest re-encoded', (await loc({ next: `?place=A3&%3Cscript%3E=1&q=${'x'.repeat(201)}&route=a%20b` })) === '/guides/city-one?place=A3&route=a+b');
  check('no next: the query of a same-origin Referer on this guide', (await loc({ referer: `${SITE}/guides/city-one?place=B2` })) === '/guides/city-one?place=B2');
  check('… not from another site or another page', (await loc({ referer: 'https://evil.example/guides/city-one?place=B2' })) === '/guides/city-one' && (await loc({ referer: `${SITE}/guides/open-day?place=B2` })) === '/guides/city-one');
  const j = await (await run(login('city-one', PW.visitor, { json: true, next: '?route=marais' }))).json();
  check('JSON next is the guide address with its query', j.next === '/guides/city-one?route=marais', j);
  check('cleanNext never leaves /guides/<slug>', ['?a=b', '', '\\\\evil', '?x=%0d%0a', 'javascript:alert(1)'].every((n) => cleanNext(n, 'city-one').startsWith('/guides/city-one') && !/[\r\n]/.test(cleanNext(n, 'city-one'))));
}

// ---- Canonical addresses and unknown paths ----
{
  const to = async (path: string, cookie?: string) => {
    const r = await run(get(path, cookie));
    return `${r.status} ${r.headers.get('location')}`;
  };
  check('/guides/ → 307 /guides', (await to('/guides/?x=1')) === '307 /guides?x=1');
  check('/guides/<slug>.html → 307, query kept', (await to('/guides/city-one.html?place=A3')) === '307 /guides/city-one?place=A3');
  check('/guides/<slug>/ and /index.html → 307', (await to('/guides/city-one/')) === '307 /guides/city-one' && (await to('/guides/city-one/index.html')) === '307 /guides/city-one');
  asked = [];
  check('/views/<audience> asked for directly → 307, even with a cookie; never served', (await to('/guides/city-one/views/member', memberCookie)) === '307 /guides/city-one' && (await to('/guides/city-one/views/visitor.html')) === '307 /guides/city-one' && asked.length === 0, asked);
  check('/locked and /locked.html → 307', (await to('/guides/city-one/locked?place=A3')) === '307 /guides/city-one?place=A3' && (await to('/guides/city-one/locked.html')) === '307 /guides/city-one');
  const nf = await run(get('/guides/nowhere'));
  check('unknown guide → the site 404 page with status 404', nf.status === 404 && (await body(nf)).includes('SITE 404 PAGE') && nf.headers.get('cache-control') === 'private, no-store', nf.status);
  const odd = await Promise.all(['/guides/__proto__', '/guides/constructor', '/guides/_comment', '/guides/City-One', '/guides/city-one/whatever', '/guides/city-one/login/', '/guides/nowhere/img/A1.jpg', '/guides//city-one'].map((p) => run(get(p))));
  check('__proto__, constructor, _comment, capitals, unknown sub-paths → 404', odd.every((r) => r.status === 404), odd.map((r) => r.status));
  const http = await run(get('http://kuschonink.com/guides/city-one?place=A3'));
  check('http (not localhost) → 308 https', http.status === 308 && http.headers.get('location') === 'https://kuschonink.com/guides/city-one?place=A3', http.status);
}

// ---- Log off ----
{
  const r = await run(post('/guides/city-one/logout'));
  const sc = r.headers.get('set-cookie') ?? '';
  check('log off (no JS) → 303 to the guide, cookie cleared', r.status === 303 && r.headers.get('location') === '/guides/city-one' && sc.startsWith(`${COOKIE}=;`) && sc.includes('Max-Age=0') && sc.includes('Path=/guides'), { s: r.status, sc });
  const j = await run(post('/guides/city-one/logout', {}, { json: true }));
  check('log off (JSON) → 200 {ok:true}, cookie cleared', j.status === 200 && (await j.json()).ok === true && (j.headers.get('set-cookie') ?? '').includes('Max-Age=0'));
  const x = await run(post('/guides/city-one/logout', {}, { json: true, origin: 'https://evil.example', site: 'cross-site' }));
  check('log off from another site → 403, cookie kept', x.status === 403 && !x.headers.has('set-cookie'), x.status);
  const g = await run(get('/guides/city-one/logout'));
  check('GET /logout → 303, cookie kept', g.status === 303 && !g.headers.has('set-cookie'), g.status);
}

// ---- Pictures and base maps ----
{
  asked = [];
  const r = await run(get('/guides/city-one/img/A1.jpg'));
  const h = await run(get('/guides/city-one/map/city.jpg', undefined, {}, 'HEAD'));
  check('no cookie → 403 (GET and HEAD), ASSETS never asked', r.status === 403 && h.status === 403 && asked.length === 0 && r.headers.get('cache-control') === 'private, no-store', { s: [r.status, h.status], asked });
  const t403 = await body(r);
  check('… the 403 page is neutral: a link back to the log-on page, nothing else', t403.includes('href="/guides/city-one"') && !/VIEW |JPEG|LOCKED/.test(t403), t403);
  const head = await run(get('/guides/city-one/img/A1.jpg', visitorCookie, {}, 'HEAD'));
  check('HEAD with a cookie → 200, no body, ETag', head.status === 200 && head.body === null && head.headers.get('etag') === '"img1"', head.status);
  const ok = await run(get('/guides/city-one/img/A1.jpg', visitorCookie));
  check('valid cookie → the file: private, no-cache, ETag kept, nosniff, same-origin', ok.status === 200 && (await body(ok)) === 'JPEG' && ok.headers.get('cache-control') === 'private, no-cache' && ok.headers.get('etag') === '"img1"' && ok.headers.get('x-content-type-options') === 'nosniff' && ok.headers.get('cross-origin-resource-policy') === 'same-origin', [...ok.headers]);
  const nm = await run(get('/guides/city-one/img/A1.jpg', visitorCookie, { 'if-none-match': '"img1"' }));
  check('If-None-Match → 304', nm.status === 304 && nm.body === null, nm.status);
  const map = await run(get('/guides/city-one/map/city.jpg', memberCookie));
  check('base map with a cookie → 200', map.status === 200, map.status);
  const miss = await run(get('/guides/city-one/img/Z9.jpg', visitorCookie));
  check('missing file → 404', miss.status === 404, miss.status);
  const other = await run(get('/guides/members-only/img/A1.jpg', visitorCookie));
  check("a cookie for an audience the guide doesn't allow → 403", other.status === 403, other.status);
  asked = [];
  const bad = await run(get('/guides/city-one/img/..%2Fviews%2Fmember', memberCookie));
  check('odd file names → 404, ASSETS never asked for them', bad.status === 404 && !asked.some((p) => p.includes('img')), { s: bad.status, asked });
  const post405 = await run(get('/guides/city-one/img/A1.jpg', visitorCookie, {}, 'POST'));
  check('POST to a picture → 405', post405.status === 405, post405.status);
}

// ---- Unexpected failures: a minimal neutral 503 ----
{
  const neutral = async (r: Response) => r.status === 503 && isPage(r) && (await body(r)).includes('Field Guide is not available');
  check('ASSETS throws → 503 neutral page', await neutral(await run(get('/guides/city-one'), deps({ assets: () => { throw new Error('boom'); } }))));
  logs = [];
  const missing = (req: Request) => (new URL(req.url).pathname.includes('/views/') ? new Response('gone', { status: 404 }) : assets(req));
  check('a view missing from the build → 503 neutral page, logged', (await neutral(await run(get('/guides/city-one', visitorCookie), deps({ assets: missing })))) && logs.some((l) => l.includes('page missing')), logs);
  check('rate limiter fails → 503 neutral page', await neutral(await run(login('city-one', PW.visitor), deps({ allow: async () => { throw new Error('no binding'); } }))));
}

// ---- The real access.json: each audience of each guide gets its own view ----
{
  const real = realAccess as unknown as AccessFile;
  const badNames = real.audiences.filter((a) => !/^GUIDES_(?!COOKIE_SECRET$)[A-Z0-9_]+$/.test(a.secret)).map((a) => `${a.id}: ${a.secret}`);
  check('access.json: every audience secret is named GUIDES_…, never the pepper (the Worker reads no other)', !badNames.length, badNames.join(', '));
  const secrets = Object.fromEntries(real.audiences.map((a) => [a.secret, `made-up password for ${a.id}`]));
  const slugs = Object.keys(real.guides).filter((s) => !s.startsWith('_'));
  const views = (req: Request) => {
    const p = new URL(req.url).pathname;
    const m = /^\/guides\/([a-z0-9-]+)\/views\/([a-z0-9-]+)$/.exec(p);
    if (m && real.guides[m[1]]?.includes(m[2])) return new Response(`VIEW ${m[1]} ${m[2]}`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    return assets(req);
  };
  const d = deps({ access: real, secrets, assets: views });
  let all = slugs.length > 0;
  for (const slug of slugs)
    for (const aud of real.guides[slug]) {
      const c = await cookieFor(slug, `made-up password for ${aud}`, d);
      const text = await body(await run(get(`/guides/${slug}`, c), d));
      if (text !== `VIEW ${slug} ${viewOf(real, slug, aud)}` || viewOf(real, slug, aud) !== aud) {
        all = false;
        console.log('   ', slug, aud, text.slice(0, 80));
      }
    }
  check(`access.json: each audience of each guide opens its own view (${slugs.join(', ')})`, all);
}

console.log(fails ? `${fails} of ${count} FAILED` : `all ${count} passed`);
if (fails) process.exitCode = 1;
