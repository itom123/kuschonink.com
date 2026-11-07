// npm test: the Field Guide's password gate (worker/guides.ts), against a
// stand-in ASSETS, made-up audiences and made-up passwords.
import { createHmac, pbkdf2Sync } from 'node:crypto';
import { COOKIE, MIN_PEPPER, REMEMBER_S, SESSION_S, TILE_BROWSER_S, TILE_EDGE_S, TILE_Z, cleanNext, closure, guideAudience, handleGuides, isGuidesPath, limitKey, makeToken, normalise, tileBounds, tileRange, viewOf, type GuidesDeps } from './guides.ts';
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
  // Street-level tiles: the Paris region's box for two guides; open-day has none.
  tiles: { 'city-one': [2.07, 48.63, 2.8, 49.05], 'members-only': [2.07, 48.63, 2.8, 49.05] },
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
// Stand-in IGN: every call is recorded; a PNG with a few bytes after the signature, and headers of its own.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7]);
let upstream: { url: string; init?: RequestInit & { cf?: Record<string, unknown> } }[] = [];
const ign: GuidesDeps['fetch'] = async (url, init) => {
  upstream.push({ url, init });
  return new Response(PNG, { headers: { 'content-type': 'image/png', 'cache-control': 'max-age=60', server: 'IGN-upstream', 'set-cookie': 'ign=1' } });
};
const deps = (o: Partial<GuidesDeps> & { secrets?: Record<string, string | undefined> } = {}): GuidesDeps => {
  const secrets = o.secrets ?? SECRETS;
  return {
    access: ACCESS,
    secret: (n) => secrets[n],
    cookieSecret: () => PEPPER,
    assets,
    allow: async (k) => (limited.push(k), true),
    fetch: ign,
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
check('isGuidesPath: /guides and /guides/<slug> yes; /Guides/x, /guidesx, /guides.html no', isGuidesPath('/guides/x') && isGuidesPath('/guides') && isGuidesPath('/guides/') && !isGuidesPath('/Guides/x') && !isGuidesPath('/guidesx') && !isGuidesPath('/guides.html'));
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

// ---- /guides: no list to choose from; the first listed guide's own address ----
{
  // The built home page: index.astro writes data-gd-first="<slug>" while any guide is listed.
  const HOME = (marker: string) => `<!doctype html><html><body><section data-window data-app="guide"><div class="folder-page"${marker}><p>HOME PAGE</p></div></section></body></html>`;
  const withHome = (html: string | null) =>
    deps({
      assets: (req) => {
        const p = new URL(req.url).pathname;
        if (p !== '/guides' || html === null) return assets(req);
        asked.push(p);
        return new Response(req.method === 'HEAD' ? null : html, { headers: { 'content-type': 'text/html; charset=utf-8', etag: '"home"', 'cache-control': 'public, max-age=0, must-revalidate' } });
      },
    });
  const to = async (req: Request, d: GuidesDeps) => {
    const r = await run(req, d);
    return `${r.status} ${r.headers.get('location')}`;
  };

  const one = withHome(HOME(' data-gd-first="city-one"'));
  asked = [];
  const r = await run(get('/guides'), one);
  check('a listed guide → /guides 307 to its own address, private, no-store, no body', r.status === 307 && r.headers.get('location') === '/guides/city-one' && r.headers.get('cache-control') === 'private, no-store' && r.body === null, { s: r.status, loc: r.headers.get('location') });
  check('… only the built home page is read: no view, no log-on page', asked.join() === '/guides', asked);
  check('… the query is kept', (await to(get('/guides?place=A3&day=2026-11-10'), one)) === '307 /guides/city-one?place=A3&day=2026-11-10');
  check('… /guides/ goes there in one step', (await to(get('/guides/?x=1'), one)) === '307 /guides/city-one?x=1');
  check('… a cookie changes nothing (the guide decides what it shows)', (await to(get('/guides', memberCookie), one)) === '307 /guides/city-one');
  const head = await run(get('/guides', undefined, {}, 'HEAD'), one);
  check('HEAD /guides → the same 307, no body', head.status === 307 && head.headers.get('location') === '/guides/city-one' && head.body === null, head.status);
  check('several listed guides: the build names the first, and /guides goes to it', (await to(get('/guides'), withHome(HOME(' data-gd-first="open-day"')))) === '307 /guides/open-day');

  const none = withHome(HOME(''));
  const n = await run(get('/guides'), none);
  check('no guide listed (no marker) → /guides is the built page, as ASSETS serves it', n.status === 200 && n.headers.get('etag') === '"home"' && n.headers.get('cache-control') === 'public, max-age=0, must-revalidate' && (await body(n)).includes('HOME PAGE'), { s: n.status, h: [...n.headers] });
  check('… /guides/ → 307 /guides, query kept', (await to(get('/guides/?x=1'), none)) === '307 /guides?x=1');
  const nh = await run(get('/guides', undefined, {}, 'HEAD'), none);
  check('… HEAD /guides → 200, no body', nh.status === 200 && nh.body === null, nh.status);

  const odd = ['nowhere', 'constructor', '__proto__', '_comment', 'City-One', 'city-one/views/member', '../city-one', '-city-one', 'city--one', ''];
  const followed: string[] = [];
  for (const slug of odd) {
    const res = await run(get('/guides'), withHome(HOME(` data-gd-first="${slug}"`)));
    if (res.status !== 200 || !(await body(res)).includes('HOME PAGE')) followed.push(`${slug} → ${res.status} ${res.headers.get('location')}`);
  }
  check('a marker naming no guide in access.json, or not a slug → no redirect, the built page', !followed.length, followed);
  const plain = await run(get('/guides'), withHome('<html><body><p data-gd-first-x="city-one">city-one</p></body></html>'));
  check('… nor does the slug written anywhere else on the page', plain.status === 200, plain.status);
  const missing = await run(get('/guides'));
  check("the home page missing from the build → ASSETS' own answer (404), no redirect", missing.status === 404 && !missing.headers.has('location'), missing.status);
  const bad = await run(get('/guides', undefined, {}, 'POST'), one);
  check('POST /guides → 405, Allow: GET, HEAD', bad.status === 405 && bad.headers.get('allow') === 'GET, HEAD', bad.status);
  check('http /guides (not localhost) → 308 https first', (await to(get('http://kuschonink.com/guides?x=1'), one)) === '308 https://kuschonink.com/guides?x=1');
  check('localhost /guides → the guide, no https redirect', (await to(get('http://localhost:8787/guides'), one)) === '307 /guides/city-one');
  check('ASSETS throws on /guides → 503 neutral page', (await run(get('/guides'), deps({ assets: () => { throw new Error('boom'); } }))).status === 503);
}

// ---- The Worker never imports guide content: only access.json, types, and guide code that reads none ----
{
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('./', import.meta.url);
  const IMPORTS = /^\s*(?:import|export)\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]/gm;
  const isContent = (spec: string) => /content\/guides\//.test(spec) && !/content\/guides\/access\.json$/.test(spec);
  const name = (u: URL) => u.pathname.split('/').slice(-2).join('/');
  // A module from src/lib/guides may be bundled only if neither it nor anything
  // it imports (types aside) reads guide content: load.ts does, check.ts doesn't.
  const reaches = (file: URL, seen = new Set<string>()): string | null => {
    if (seen.has(file.href) || file.pathname.endsWith('.json')) return null;
    seen.add(file.href);
    const src = readFileSync(file, 'utf8');
    if (/import\.meta\.glob/.test(src)) return `${name(file)} reads every guide (import.meta.glob)`;
    for (const m of src.matchAll(IMPORTS)) {
      const spec = m[2] ?? m[3];
      if (m[1] || !spec.startsWith('.')) continue;
      if (isContent(spec)) return `${name(file)} imports ${spec}`;
      const hit = reaches(new URL(/\.(ts|json)$/.test(spec) ? spec : `${spec}.ts`, file), seen);
      if (hit) return hit;
    }
    return null;
  };
  const found: string[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(IMPORTS)) {
      const spec = m[2] ?? m[3];
      if (isContent(spec)) found.push(`${f}: ${spec}`);
      else if (/lib\/guides\//.test(spec) && !m[1]) {
        const hit = reaches(new URL(/\.ts$/.test(spec) ? spec : `${spec}.ts`, new URL(f, dir)));
        if (hit) found.push(`${f}: ${spec} → ${hit}`);
      }
    }
  }
  check('worker/*.ts bundle no guide content (access.json, types, and guide code that reads none)', !found.length, found);
  check('… and the check would catch the module that loads every guide (load.ts)', reaches(new URL('../src/lib/guides/load.ts', dir)) !== null);
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

// ---- Street-level tiles: IGN through the Worker, only with a cookie, only inside the guide's box ----
{
  // An independent reckoning of the tile that holds a point (OpenStreetMap's slippy-map formula).
  const tileOf = (lon: number, lat: number, z: number) => {
    const n = 2 ** z, r = (lat * Math.PI) / 180;
    return { x: Math.floor(((lon + 180) / 360) * n), y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n) };
  };
  const BOX: [number, number, number, number] = [2.07, 48.63, 2.8, 49.05];
  const r18 = tileRange(BOX, 18);
  const nd = tileOf(2.3522, 48.8566, 18); // a point in the middle of the box
  check('tileRange: the box\'s corners, both ends included', r18.x0 === tileOf(2.07, 49.05, 18).x && r18.x1 === tileOf(2.8, 48.63, 18).x && r18.y0 === tileOf(2.07, 49.05, 18).y && r18.y1 === tileOf(2.8, 48.63, 18).y && nd.x > r18.x0 && nd.x < r18.x1 && nd.y > r18.y0 && nd.y < r18.y1, r18);
  check('tileRange: never beyond the world', tileRange([-180, -85, 180, 85], 15).x1 === 2 ** 15 - 1 && tileRange([-180, -85, 180, 85], 15).x0 === 0);
  check('tileBounds: a guide\'s box, or null', tileBounds(ACCESS, 'city-one')?.join() === BOX.join() && tileBounds(ACCESS, 'open-day') === null && tileBounds(ACCESS, 'nowhere') === null && tileBounds({ ...ACCESS, tiles: { 'city-one': [2.8, 48.63, 2.07, 49.05] } }, 'city-one') === null && tileBounds({ ...ACCESS, tiles: { 'city-one': [2.07, 48.63, 2.8] as unknown as [number, number, number, number] } }, 'city-one') === null && tileBounds({ ...ACCESS, tiles: undefined }, 'city-one') === null);
  check('TILE_Z is 14 to 19', TILE_Z.min === 14 && TILE_Z.max === 19);
  // The browser is told the same range (view.ts repeats it: the Worker may not import that file, but a test may).
  const { TILE_Z: browserZ } = await import('../src/lib/guides/view.ts');
  check('the Worker and the payload (view.ts) agree on the zoom range', browserZ.min === TILE_Z.min && browserZ.max === TILE_Z.max, browserZ);

  const path = (z: number | string, x: number | string, y: number | string, slug = 'city-one') => `/guides/${slug}/tiles/${z}/${x}/${y}.png`;
  const inside = path(18, nd.x, nd.y);
  const tileHeaders = (r: Response) =>
    r.headers.get('content-type') === 'image/png' &&
    r.headers.get('cache-control') === `private, max-age=${TILE_BROWSER_S}` &&
    r.headers.get('x-robots-tag') === 'noindex, nofollow, noarchive' &&
    r.headers.get('x-content-type-options') === 'nosniff' &&
    r.headers.get('cross-origin-resource-policy') === 'same-origin' &&
    !r.headers.has('server') && !r.headers.has('set-cookie') && !r.headers.has('vary');
  // A stand-in edge cache, like the real one: put() reads the body, match() gives a fresh Response each time.
  type Kept = { bytes: ArrayBuffer; headers: Headers };
  const fakeCache = (store: Map<string, Kept>): NonNullable<GuidesDeps['cache']> => ({
    match: async (k) => { const e = store.get(k.url); return e && new Response(e.bytes.slice(0), { headers: e.headers }); },
    put: async (k, r) => { store.set(k.url, { bytes: await r.arrayBuffer(), headers: new Headers(r.headers) }); },
  });
  const store = new Map<string, Kept>();
  const cache = fakeCache(store);

  // The cookie rules: the same as for pictures.
  upstream = [];
  const none = await run(get(inside));
  const noneHead = await run(get(inside, undefined, {}, 'HEAD'));
  check('no cookie → 403 (GET and HEAD), IGN never asked', none.status === 403 && noneHead.status === 403 && upstream.length === 0 && none.headers.get('cache-control') === 'private, no-store', { s: [none.status, noneHead.status], upstream });
  check("a cookie for an audience the guide doesn't allow → 403, IGN never asked", (await run(get(path(18, nd.x, nd.y, 'members-only'), visitorCookie))).status === 403 && upstream.length === 0);
  check('member cookie on members-only → 200', (await run(get(path(18, nd.x, nd.y, 'members-only'), memberCookie))).status === 200);
  const noPepper = await run(get(inside, visitorCookie), deps({ cookieSecret: () => undefined }));
  check('no pepper → 403, even with a once-valid cookie', noPepper.status === 403);
  const expired = `${COOKIE}=${await makeToken(PEPPER, 'visitor', normalise(PW.visitor), Math.floor(NOW / 1000) - 1)}`;
  check('expired cookie → 403', (await run(get(inside, expired))).status === 403);
  upstream = [];
  check('… none of those reached IGN', upstream.length === 0, upstream);

  // The tile itself.
  upstream = [];
  const ok = await run(get(inside, visitorCookie), deps({ cache }));
  const bytes = new Uint8Array(await ok.arrayBuffer());
  check('valid cookie, z18 tile inside the box → 200 image/png, private max-age=604800, nosniff, same-origin; IGN\'s headers dropped', ok.status === 200 && tileHeaders(ok) && bytes.length === PNG.length && bytes.every((b, i) => b === PNG[i]), { s: ok.status, h: [...ok.headers] });
  const up = upstream[0];
  check('… fetched once from IGN\'s WMTS with z, x and y only', upstream.length === 1 && up.url === `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX=18&TILEROW=${nd.y}&TILECOL=${nd.x}`, upstream.map((u) => u.url));
  const h = new Headers(up?.init?.headers);
  check('… with a neutral User-Agent naming kuschonink.com, no cookie, and a timeout', /kuschonink\.com/.test(h.get('user-agent') ?? '') && !h.has('cookie') && up?.init?.signal instanceof AbortSignal, { ua: h.get('user-agent') });
  // Upstream caching: 30 days for a good tile only. cacheTtl would also keep an IGN 404 or 5xx that long.
  check('… cached upstream 30 days for 2xx only (cacheTtlByStatus), never 4xx or 5xx, and no plain cacheTtl', up?.init?.cf?.cacheEverything === true && up?.init?.cf?.cacheTtl === undefined && JSON.stringify(up?.init?.cf?.cacheTtlByStatus) === JSON.stringify({ '200-299': TILE_EDGE_S, '400-599': 0 }), { cf: up?.init?.cf });
  const kept = store.get(up.url);
  check('… kept at the edge as public, max-age=2592000', !!kept && kept.headers.get('cache-control') === `public, max-age=${TILE_EDGE_S}` && kept.headers.get('content-type') === 'image/png' && kept.bytes.byteLength === PNG.length, kept ? [...kept.headers] : 'nothing cached');
  const again = await run(get(inside, memberCookie), deps({ cache }));
  check('the same tile again (another audience) → from the edge cache, IGN not asked again', again.status === 200 && tileHeaders(again) && upstream.length === 1 && (await again.arrayBuffer()).byteLength === PNG.length, { s: again.status, n: upstream.length });
  const head = await run(get(inside, visitorCookie, {}, 'HEAD'), deps({ cache }));
  check('HEAD with a cookie → 200, the same headers, no body', head.status === 200 && head.body === null && tileHeaders(head), head.status);
  upstream = [];
  const noCache = await run(get(inside, visitorCookie));
  check('no edge cache at all → still served, straight from IGN', noCache.status === 200 && upstream.length === 1, noCache.status);
  upstream = [];
  logs = [];
  const broken = await run(get(inside, visitorCookie), deps({ cache: { match: async () => { throw new Error('cache down'); }, put: async () => { throw new Error('cache down'); } } }));
  check('edge cache failing → still served from IGN, logged', broken.status === 200 && upstream.length === 1 && logs.some((l) => l.includes('tile cache')), { s: broken.status, logs });
  // Corner tiles: the first and last of the range are in, their neighbours out.
  const corners = await Promise.all([path(18, r18.x0, r18.y0), path(18, r18.x1, r18.y1), path(18, r18.x0 - 1, r18.y0), path(18, r18.x1 + 1, r18.y1), path(18, r18.x0, r18.y0 - 1), path(18, r18.x1, r18.y1 + 1)].map((p) => run(get(p, visitorCookie))));
  check('tile bounds: the box\'s corner tiles → 200; one tile beyond on any side → 404', corners.map((r) => r.status).join() === '200,200,404,404,404,404', corners.map((r) => r.status));
  for (const z of [14, 15, 16, 17, 19]) {
    const t = tileOf(2.3522, 48.8566, z);
    const r = await run(get(path(z, t.x, t.y), visitorCookie));
    check(`z${z} inside → 200`, r.status === 200, r.status);
  }
  upstream = [];
  const outZ = await Promise.all([13, 20, 0, 99].map((z) => { const t = tileOf(2.3522, 48.8566, z); return run(get(path(z, t.x, t.y), visitorCookie)); }));
  check('z13, z20, z0, z99 → 404', outZ.every((r) => r.status === 404), outZ.map((r) => r.status));
  const t17 = tileOf(2.3522, 48.8566, 17);
  const malformed = [path('7', 1, 1), path('018', nd.x, nd.y), path(18, `0${nd.x}`, nd.y), path(18, nd.x, `${nd.y}0000000`), path(18, '1.5', nd.y), path(18, '-1', nd.y), path(18, 'x', 'y'), path(18, nd.x, `${nd.y}.PNG`.replace('.png', '')), `${inside}/`, `/guides/city-one/tiles/18/${nd.x}.png`, `/guides/city-one/tiles/18/${nd.x}/${nd.y}.jpg`, `/guides/city-one/tiles/18/${nd.x}/${nd.y}.png?LAYER=other`, `/guides/city-one/tiles/18/${nd.x}/${nd.y}.png%2F..%2F..`, `/guides/city-one/tiles/18/${nd.x}/${nd.y}.png;TILEMATRIXSET=x`];
  const mal = await Promise.all(malformed.map((p) => run(get(p, visitorCookie))));
  const malOk = mal.map((r, i) => (malformed[i].includes('?LAYER=other') ? r.status === 200 : r.status === 404));
  check('malformed tile paths → 404 (a query is ignored: the address alone names the tile)', malOk.every(Boolean), malformed.filter((_, i) => !malOk[i]).map((p, i) => `${p} → ${mal[i]?.status}`));
  check('… and only the one with a query reached IGN, for its own tile', upstream.length === 1 && upstream[0].url.endsWith(`&TILEMATRIX=18&TILEROW=${nd.y}&TILECOL=${nd.x}`) && !upstream.some((u) => u.url.includes('other')), upstream.map((u) => u.url));
  check('a guide without tile bounds → 404 even with a cookie', (await run(get(path(17, t17.x, t17.y, 'open-day'), visitorCookie))).status === 404);
  check('POST to a tile → 405', (await run(get(inside, visitorCookie, {}, 'POST'))).status === 405);
  check('tile paths of an unknown guide → 404', (await run(get(path(18, nd.x, nd.y, 'nowhere'), visitorCookie))).status === 404);

  // Upstream failures: a bare 502, never IGN's page, nothing cached.
  const fresh = () => { const s = new Map<string, Kept>(); return { s, c: fakeCache(s) }; };
  const html = '<html><body>IGN error: tile not found</body></html>';
  const down = fresh();
  logs = [];
  const f1 = await run(get(inside, visitorCookie), deps({ cache: down.c, fetch: async () => { throw new Error('ECONNRESET'); } }));
  const f2 = await run(get(inside, visitorCookie), deps({ cache: down.c, fetch: async () => new Response(html, { status: 404, headers: { 'content-type': 'text/html' } }) }));
  const f3 = await run(get(inside, visitorCookie), deps({ cache: down.c, fetch: async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }) }));
  const f4 = await run(get(inside, visitorCookie), deps({ cache: down.c, fetch: async () => new Response(PNG, { status: 500, headers: { 'content-type': 'image/png' } }) }));
  const f5 = await run(get(inside, visitorCookie), deps({ cache: down.c, fetch: async () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(5 * 1024 * 1024) } }) }));
  const f6 = await run(get(inside, visitorCookie, {}, 'HEAD'), deps({ cache: down.c, fetch: async () => { throw new Error('timeout'); } }));
  const bodies = await Promise.all([f1, f2, f3, f4, f5].map((r) => body(r)));
  check('IGN unreachable, 404 page, HTML, 500, oversize → 502 with an empty body (HEAD too)', [f1, f2, f3, f4, f5, f6].every((r) => r.status === 502 && r.headers.get('cache-control') === 'private, no-store' && !r.headers.has('content-type')) && bodies.every((b) => b === ''), [f1, f2, f3, f4, f5, f6].map((r) => r.status));
  check('… IGN\'s words never reach the visitor, and nothing is cached', !bodies.some((b) => b.includes('IGN')) && down.s.size === 0 && !logs.some((l) => l.includes('tile not found')), { logs, cached: down.s.size });
  check('… each failure is logged by status or message, never with a cookie', logs.filter((l) => l.includes('tile upstream')).length === 6 && !logs.some((l) => l.includes(COOKIE)), logs);
  // A 200 with an image type that is not a PNG, or a body that breaks half-way: a bare 502, and no 30-day copy of it.
  const liar = fresh();
  logs = [];
  const notPng = await run(get(inside, visitorCookie), deps({ cache: liar.c, fetch: async () => new Response('<html>IGN: service down</html>', { status: 200, headers: { 'content-type': 'image/png' } }) }));
  const tiny = await run(get(inside, visitorCookie), deps({ cache: liar.c, fetch: async () => new Response(PNG.slice(0, 5), { status: 200, headers: { 'content-type': 'image/png' } }) }));
  const tearing = () => new Response(new ReadableStream({ start(c) { c.enqueue(PNG); c.error(new Error('reset')); } }), { status: 200, headers: { 'content-type': 'image/png' } });
  const torn = await run(get(inside, visitorCookie), deps({ cache: liar.c, fetch: async () => tearing() }));
  check('a 200 image/png that is not a PNG, is cut short, or breaks mid-body → 502, empty, nothing cached', [notPng, tiny, torn].every((r) => r.status === 502 && r.body === null) && liar.s.size === 0 && !(await Promise.all([notPng, tiny, torn].map((r) => body(r)))).some((b) => b.includes('IGN')), { s: [notPng.status, tiny.status, torn.status], cached: liar.s.size, logs });

  // The request budget (allowTile): asked only on an edge-cache miss, just before IGN.
  const ip = { 'cf-connecting-ip': '203.0.113.7' };
  const asks: string[] = [];
  const budget = (answer: boolean) => async (k: string) => (asks.push(k), answer);
  const bucket = fresh();
  upstream = [];
  const allowed = await run(get(inside, visitorCookie, ip), deps({ cache: bucket.c, allowTile: budget(true) }));
  check('tile budget left → 200, asked once with the visitor\'s own key, IGN asked once', allowed.status === 200 && tileHeaders(allowed) && asks.length === 1 && asks[0] === limitKey('203.0.113.7') && upstream.length === 1, { s: allowed.status, asks, n: upstream.length });
  const t2 = tileOf(2.36, 48.86, 18);
  const second = await run(get(path(18, t2.x, t2.y), visitorCookie, ip), deps({ cache: bucket.c, allowTile: budget(true) }));
  check('… a second tile that is not cached yet is counted again', second.status === 200 && asks.length === 2 && upstream.length === 2, { s: second.status, asks, n: upstream.length });
  // A cache hit is free, even for a visitor who is over the budget; so are HEAD and another audience.
  const hits = await Promise.all([
    run(get(inside, visitorCookie, ip), deps({ cache: bucket.c, allowTile: budget(false) })),
    run(get(inside, memberCookie, ip), deps({ cache: bucket.c, allowTile: budget(false) })),
    run(get(inside, visitorCookie, ip, 'HEAD'), deps({ cache: bucket.c, allowTile: budget(false) })),
  ]);
  check('edge-cache hits (GET, another audience, HEAD) are never counted, even over the budget → 200', hits.every((r) => r.status === 200 && tileHeaders(r)) && asks.length === 2 && upstream.length === 2, { s: hits.map((r) => r.status), asks, n: upstream.length });

  const spent = fresh();
  asks.length = 0;
  upstream = [];
  const over = await run(get(inside, visitorCookie, ip), deps({ cache: spent.c, allowTile: budget(false) }));
  const overHead = await run(get(inside, visitorCookie, ip, 'HEAD'), deps({ cache: spent.c, allowTile: budget(false) }));
  check('over the budget on a cache miss → 429 (GET and HEAD), Retry-After 60, private, no body, no content type', [over, overHead].every((r) => r.status === 429 && r.headers.get('retry-after') === '60' && r.headers.get('cache-control') === 'private, no-store' && r.headers.get('x-robots-tag') === 'noindex, nofollow, noarchive' && !r.headers.has('content-type') && r.body === null), { s: [over.status, overHead.status], h: [...over.headers] });
  check('… IGN is never asked and nothing is cached', upstream.length === 0 && spent.s.size === 0 && asks.length === 2, { n: upstream.length, cached: spent.s.size, asks });
  // The budget is asked after the cookie and the bounds, so those refusals never spend it.
  asks.length = 0;
  const early = await Promise.all([
    run(get(inside, undefined, ip), deps({ allowTile: budget(false) })),
    run(get(inside, expired, ip), deps({ allowTile: budget(false) })),
    run(get(path(18, nd.x, nd.y, 'members-only'), visitorCookie, ip), deps({ allowTile: budget(false) })),
    run(get(path(13, nd.x, nd.y), visitorCookie, ip), deps({ allowTile: budget(false) })),
    run(get(path(18, r18.x1 + 1, r18.y1), visitorCookie, ip), deps({ allowTile: budget(false) })),
    run(get(path(17, t17.x, t17.y, 'open-day'), visitorCookie, ip), deps({ allowTile: budget(false) })),
    run(get(inside, visitorCookie, ip, 'POST'), deps({ allowTile: budget(false) })),
  ]);
  check('no cookie, expired cookie, wrong audience, z13, outside the box, no bounds, POST → 403/403/403/404/404/404/405, budget never asked', early.map((r) => r.status).join() === '403,403,403,404,404,404,405' && asks.length === 0, { s: early.map((r) => r.status), asks });
  // No binding: the deps carry no allowTile (index.ts leaves it out), and every tile is allowed.
  upstream = [];
  const open = fresh();
  const unlimited = await run(get(inside, visitorCookie, ip), deps({ cache: open.c }));
  check('no tile limiter (a preview without the binding) → 200, nothing refused', deps().allowTile === undefined && unlimited.status === 200 && upstream.length === 1, { s: unlimited.status, n: upstream.length });
  // A limiter that throws does not close the map; it is logged.
  logs = [];
  upstream = [];
  const broke = await run(get(inside, visitorCookie, ip), deps({ allowTile: async () => { throw new Error('no binding'); } }));
  check('tile limiter throws → 200 from IGN, logged', broke.status === 200 && upstream.length === 1 && logs.some((l) => l.includes('tile limiter')), { s: broke.status, logs });
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

// ---- Suggestions from inside a guide (worker/suggest.ts) ----
{
  const c = await cookieFor('city-one', PW.member);
  const none = await run(post('/guides/city-one/suggest', {}, { ct: 'application/json', body: '{}' }));
  check("/suggest without a handler: the site's 404", none.status === 404);
  const seen: string[] = [];
  const d = deps({ suggest: async (req, slug) => (seen.push(`${req.method} ${slug}`), new Response('handled', { status: 202 })) });
  const res = await run(post('/guides/city-one/suggest', {}, { ct: 'application/json', body: '{}', headers: { cookie: c } }), d);
  check('/suggest goes to the handler, with the guide', res.status === 202 && seen.join() === 'POST city-one', seen);
  check('guideAudience: the view the cookie opens', (await guideAudience(get('/guides/city-one/suggest', c), 'city-one', d)) === 'member');
  check('guideAudience: null without a cookie or for an unknown guide', (await guideAudience(get('/guides/city-one/suggest'), 'city-one', d)) === null && (await guideAudience(get('/x', c), 'nowhere', d)) === null && (await guideAudience(get('/x', c), 'Bad Slug', d)) === null);
  check('guideAudience: a cookie is an audience, so it opens what that audience may see elsewhere too', (await guideAudience(get('/x', c), 'open-day', d)) === 'visitor' && (await guideAudience(get('/x', c), 'members-only', d)) === 'member');
}

console.log(fails ? `${fails} of ${count} FAILED` : `all ${count} passed`);
if (fails) process.exitCode = 1;
