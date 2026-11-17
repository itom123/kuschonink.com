// npm test: the Kino's door (worker/kino.ts), against a stand-in ASSETS, a
// stand-in R2 bucket on a Map, a stand-in Turnstile and a made-up secret.
import { handleKino, MIN_SECRET, ticketOf, type KinoDeps, type KinoObject } from './kino.ts';
import { clock, loadKino, mediaLife, problems, sourceOf, TICKET_COOKIE, TICKET_S, TURNSTILE_ACTION, type KinoFile, type KinoFilm } from '../src/lib/kino.ts';
import realKino from '../src/content/kino.json' with { type: 'json' };

let count = 0;
let fails = 0;
function check(name: string, ok: boolean, detail: unknown = '') {
  count++;
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail));
}

const SITE = 'https://kuschonink.com';
const SECRET = 'test only: a made-up Kino secret, not a real one';
const NOW = Date.UTC(2026, 10, 16, 20, 0, 0);
const V = 'v20261116a';
const FILMS: KinoFilm[] = [
  { id: 'on-r2', title: 'On R2', titleZh: '在 R2', seconds: 600, youtubeId: 'AAAAAAAAAAA', stream: { version: V, width: 1920, height: 1080 } },
  { id: 'on-youtube', title: 'On YouTube', titleZh: '在 YouTube', youtubeId: 'BBBBBBBBBBB' },
];

// ---- Stand-ins ----
const R2 = new Map<string, Uint8Array>();
const bytes = (s: string) => new TextEncoder().encode(s);
R2.set(`films/on-r2/${V}/master.m3u8`, bytes('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080\n1080p/index.m3u8\n'));
R2.set(`films/on-r2/${V}/1080p/index.m3u8`, bytes('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="../key",IV=0x00\n#EXTINF:6.0,\nseg_00000.ts\n#EXT-X-ENDLIST\n'));
R2.set(`films/on-r2/${V}/1080p/seg_00000.ts`, bytes('0123456789'));
R2.set(`films/on-r2/${V}/poster.jpg`, bytes('JPEG'));
R2.set(`keys/on-r2/${V}.key`, bytes('sixteen-byte-key'));
let r2Asked: string[] = [];
async function r2(key: string, range?: string): Promise<KinoObject | null> {
  r2Asked.push(key);
  const b = R2.get(key);
  if (!b) return null;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range)!;
    const start = m[1] ? Number(m[1]) : b.length - Number(m[2]);
    const end = m[1] && m[2] ? Number(m[2]) : b.length - 1;
    return { body: new Blob([b.slice(start, end + 1)]).stream(), size: b.length, httpEtag: '"e"', range: { offset: start, length: end - start + 1 } };
  }
  return { body: new Blob([b]).stream(), size: b.length, httpEtag: '"e"' };
}
let assetsAsked: string[] = [];
async function assets(req: Request): Promise<Response> {
  const p = new URL(req.url).pathname;
  assetsAsked.push(p);
  if (p === '/kino' || p === '/kino/on-r2' || p === '/kino/on-youtube') return new Response(`<html>${p}</html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' } });
  return new Response('<html>404</html>', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
let tsAnswer: { success: boolean; hostname?: string; action?: string } = { success: true, hostname: 'kuschonink.com', action: TURNSTILE_ACTION };
let allowTickets = true;
let mediaKeys: string[] = [];
let allowMedia = true;
let now = NOW;
let secret: string | undefined = SECRET;
let hostnames = new Set(['kuschonink.com', 'www.kuschonink.com']);
const logs: unknown[][] = [];
const deps = (): KinoDeps => ({
  films: FILMS,
  secret: () => secret,
  assets,
  r2,
  turnstile: { secret: 'turnstile-secret', hostnames, verify: async () => tsAnswer },
  allow: async () => allowTickets,
  allowMedia: async (k) => (mediaKeys.push(k), allowMedia),
  random: (n) => crypto.getRandomValues(new Uint8Array(n)),
  now: () => now,
  log: (...a) => logs.push(a),
});
function reset() {
  tsAnswer = { success: true, hostname: 'kuschonink.com', action: TURNSTILE_ACTION };
  allowTickets = true;
  allowMedia = true;
  now = NOW;
  secret = SECRET;
  hostnames = new Set(['kuschonink.com', 'www.kuschonink.com']);
  r2Asked = [];
  assetsAsked = [];
  mediaKeys = [];
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const get = (path: string, h: Record<string, string> = {}) => new Request(SITE + path, { headers: { 'user-agent': UA, 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'empty', ...h } });
const post = (path: string, body: unknown, h: Record<string, string> = {}) =>
  new Request(SITE + path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'user-agent': UA, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: SITE, 'cf-connecting-ip': '203.0.113.9', ...h } });
const run = (r: Request) => handleKino(r, deps());
async function getTicket(): Promise<string> {
  const res = await run(post('/kino/ticket', { token: 'turnstile-token' }));
  const set = res.headers.get('set-cookie') ?? '';
  return set.split(';')[0];
}
async function playOf(film: string, cookie: string) {
  const res = await run(get(`/kino/${film}/play`, { cookie }));
  return { res, body: res.ok ? ((await res.json()) as Record<string, unknown>) : null };
}

// ---- The shared rules ----
{
  check('the real kino.json is valid', problems(realKino as KinoFile).length === 0, problems(realKino as KinoFile));
  check('… and every real film has a source', (realKino as KinoFile).films.every((f) => f.stream || f.youtubeId));
  const bad: KinoFile = {
    films: [
      { id: 'ticket', title: 'x', titleZh: 'x', youtubeId: 'AAAAAAAAAAA' },
      { id: 'Bad Id', title: '', youtubeId: 'short' },
      { id: 'dup', title: 'a', titleZh: 'a', youtubeId: 'AAAAAAAAAAA' },
      { id: 'dup', title: 'b', titleZh: 'b', stream: { version: '2026', width: 1, height: 1080 } },
      { id: 'none', title: 'c', titleZh: 'c', note: 'only English', extra: 1 } as unknown as KinoFilm,
      { id: 'proj', title: 'd', titleZh: 'd', youtubeId: 'AAAAAAAAAAA', project: 'nope' },
    ],
  };
  const p = problems(bad, ['real-project']);
  const has = (s: string) => p.some((x) => x.includes(s));
  check('problems: a reserved id', has('› ticket › id: "ticket" is reserved'), p);
  check('problems: a bad id, a missing title, a missing Chinese title, a bad YouTube id', has('Bad Id › id') && has('Bad Id › title: missing') && has('Bad Id › titleZh: missing') && has('Bad Id › youtubeId: not a YouTube'), p);
  check('problems: an id used twice', has('dup › id: used twice'), p);
  check('problems: a bad stream (version, width) and no length', has('dup › stream.version') && has('dup › stream.width') && has('dup › seconds: a film on R2'), p);
  check('problems: no source, an untranslated note, an unknown field', has('none › youtubeId: a film needs') && has('none › noteZh') && has('none › extra: unknown field'), p);
  check('problems: an unknown project', has('proj › project: no project "nope"'), p);
  let threw = '';
  try {
    loadKino(bad);
  } catch (e) {
    threw = (e as Error).message;
  }
  check('loadKino throws with every problem at once', threw.startsWith('Kino: ') && threw.includes('reserved') && threw.includes('used twice'), threw);
  check('sourceOf: a stream plays from R2, else YouTube', sourceOf(FILMS[0]) === 'hls' && sourceOf(FILMS[1]) === 'youtube');
  check('clock', clock(51) === '0:51' && clock(725) === '12:05' && clock(3723) === '1:02:03');
  check('mediaLife: the length plus an hour, at most six hours', mediaLife(FILMS[0]) === 600 + 3600 && mediaLife({ ...FILMS[0], seconds: 9 * 3600 }) === 6 * 3600 && mediaLife(FILMS[1]) === 6 * 3600);
}

// ---- Pages ----
{
  reset();
  for (const p of ['/kino', '/kino/on-r2', '/kino/on-youtube']) {
    const res = await run(get(p, { 'sec-fetch-dest': 'document' }));
    check(`page ${p}: served, noindex, never framed`, res.status === 200 && res.headers.get('x-robots-tag') === 'noindex, nofollow, noarchive, noimageindex' && res.headers.get('x-frame-options') === 'DENY' && (res.headers.get('content-security-policy') ?? '').includes("frame-ancestors 'none'") && (await res.text()).includes(p), res.status);
  }
  const r404 = await run(get('/kino/no-such-film'));
  check('an unknown film is the 404 page (noindex)', r404.status === 404 && r404.headers.get('x-robots-tag')!.includes('noindex') && (await r404.text()).includes('404'));
  const r404b = await run(get('/kino/../guides'));
  check('a strange path is a 404', r404b.status === 404);
  const slash = await run(get('/kino/'));
  check('/kino/ goes to /kino', slash.status === 307 && slash.headers.get('location') === '/kino');
  const html = await run(get('/kino/on-r2.html?x=1'));
  check('/kino/<film>.html goes to /kino/<film>, query kept', html.status === 307 && html.headers.get('location') === '/kino/on-r2?x=1');
  const http = await run(new Request('http://kuschonink.com/kino'));
  check('http goes to https', http.status === 308 && http.headers.get('location') === 'https://kuschonink.com/kino');
  const postPage = await run(new Request(SITE + '/kino', { method: 'POST' }));
  check('a POST to a page: 405', postPage.status === 405);
  const head = await run(new Request(SITE + '/kino/on-r2', { method: 'HEAD' }));
  check('HEAD: the headers, no body', head.status === 200 && head.body === null && head.headers.get('x-robots-tag') !== null);
}

// ---- The box office ----
{
  reset();
  const res = await run(post('/kino/ticket', { token: 'turnstile-token' }));
  const set = res.headers.get('set-cookie') ?? '';
  const body = (await res.json()) as { ok: boolean; exp: number };
  check('a ticket: 200, the cookie, its expiry', res.status === 200 && body.ok === true && body.exp === NOW / 1000 + TICKET_S);
  check('… HttpOnly, Secure, SameSite=Strict, Path=/kino, no Max-Age (gone when the browser closes)', set.startsWith(`${TICKET_COOKIE}=v1.`) && set.includes('HttpOnly') && set.includes('Secure') && set.includes('SameSite=Strict') && set.includes('Path=/kino') && !set.includes('Max-Age'), set);
  check('… never cached', res.headers.get('cache-control') === 'private, no-store');
  const t = await ticketOf(get('/kino', { cookie: set.split(';')[0] }), deps());
  check('… and it reads back as a ticket', !!t && t.tid.length === 22 && t.exp === NOW / 1000 + TICKET_S);
  const local = await handleKino(new Request('http://localhost:8787/kino/ticket', { method: 'POST', body: '{"token":"x"}', headers: { 'user-agent': UA, origin: 'http://localhost:8787', 'sec-fetch-site': 'same-origin' } }), deps());
  check('on http://localhost the cookie is not Secure (wrangler dev)', local.status === 200 && !(local.headers.get('set-cookie') ?? '').includes('Secure'));

  const cases: [string, () => Request, number, string][] = [
    ['a GET', () => get('/kino/ticket'), 405, 'method'],
    ['another site', () => post('/kino/ticket', { token: 'x' }, { 'sec-fetch-site': 'cross-site', origin: 'https://elsewhere.example' }), 403, 'forbidden'],
    ['a bot', () => post('/kino/ticket', { token: 'x' }, { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }), 403, 'forbidden'],
    ['curl', () => post('/kino/ticket', { token: 'x' }, { 'user-agent': 'curl/8.4.0' }), 403, 'forbidden'],
    ['no user agent', () => post('/kino/ticket', { token: 'x' }, { 'user-agent': '' }), 403, 'forbidden'],
    ['no token', () => post('/kino/ticket', {}), 403, 'verification_failed'],
    ['a body that is not JSON', () => post('/kino/ticket', 'token=x'), 403, 'verification_failed'],
    ['a body too big', () => post('/kino/ticket', { token: 'x'.repeat(5000) }), 403, 'verification_failed'],
  ];
  for (const [name, mk, status, error] of cases) {
    reset();
    const r = await run(mk());
    const b = (await r.json()) as { error?: string };
    check(`no ticket for ${name}: ${status} ${error}`, r.status === status && b.error === error && !r.headers.get('set-cookie'), { status: r.status, b });
  }
  reset();
  tsAnswer = { success: false, hostname: 'kuschonink.com', action: TURNSTILE_ACTION };
  check('Turnstile says no: 403', (await run(post('/kino/ticket', { token: 'x' }))).status === 403);
  tsAnswer = { success: true, hostname: 'evil.example', action: TURNSTILE_ACTION };
  check('Turnstile answered for another hostname: 403', (await run(post('/kino/ticket', { token: 'x' }))).status === 403);
  tsAnswer = { success: true, hostname: 'kuschonink.com', action: 'kuschonink-contact' };
  check("Turnstile's token was for the contact form: 403", (await run(post('/kino/ticket', { token: 'x' }))).status === 403);
  tsAnswer = { success: true, hostname: 'example.com' };
  check("Cloudflare's test answer on the live site: 403", (await run(post('/kino/ticket', { token: 'x' }))).status === 403);
  hostnames = new Set(['example.com']);
  check('… but counts where example.com is allowed (.dev.vars, previews)', (await run(post('/kino/ticket', { token: 'x' }))).status === 200);
  reset();
  allowTickets = false;
  const busy = await run(post('/kino/ticket', { token: 'x' }));
  check('too many tickets: 429 with retry-after', busy.status === 429 && busy.headers.get('retry-after') === '60');
  reset();
  secret = 'too short';
  const closed = await run(post('/kino/ticket', { token: 'x' }));
  check(`no secret of ${MIN_SECRET}+ characters: closed (503)`, closed.status === 503 && ((await closed.json()) as { error: string }).error === 'closed');
}

// ---- Where a film plays from ----
{
  reset();
  const c = await getTicket();
  const yt = await playOf('on-youtube', c);
  check('play, a YouTube film: its id, only with a ticket', yt.res.status === 200 && yt.body?.kind === 'youtube' && yt.body?.id === 'BBBBBBBBBBB' && yt.res.headers.get('cache-control') === 'private, no-store');
  const hls = await playOf('on-r2', c);
  const src = String(hls.body?.src ?? '');
  check('play, a film on R2: a master playlist under a token path, and a poster', hls.res.status === 200 && hls.body?.kind === 'hls' && /^\/kino\/on-r2\/m\/v1\.[\w-]{22}\.\d{10}\.[\w-]{43}\/master\.m3u8$/.test(src) && String(hls.body?.poster).endsWith('/poster.jpg') && hls.body?.height === 1080, hls.body);
  check('… the token lasts the film plus an hour', hls.body?.exp === NOW / 1000 + 600 + 3600);
  check('… and no film reaches R2 by asking where it plays', r2Asked.length === 0);
  const none = await run(get('/kino/on-r2/play'));
  check('play without a ticket: 401', none.status === 401);
  const forged = await run(get('/kino/on-r2/play', { cookie: c.replace(/.$/, (x) => (x === 'A' ? 'B' : 'A')) }));
  check('play with a forged ticket: 401', forged.status === 401);
  const cross = await run(get('/kino/on-r2/play', { cookie: c, 'sec-fetch-site': 'cross-site' }));
  check('play asked by another site: 403', cross.status === 403);
  now = NOW + (TICKET_S + 1) * 1000;
  check('play with an expired ticket: 401', (await run(get('/kino/on-r2/play', { cookie: c }))).status === 401);
  now = NOW;
  secret = 'test only: another made-up secret, rotated';
  check('a new secret ends every ticket', (await run(get('/kino/on-r2/play', { cookie: c }))).status === 401);
  reset();
  now = NOW + (TICKET_S - 300) * 1000;
  const late = await playOf('on-r2', c);
  check('a token never outlasts its ticket', late.body?.exp === NOW / 1000 + TICKET_S);
}

// ---- The film itself ----
{
  reset();
  const c = await getTicket();
  const { body } = await playOf('on-r2', c);
  const base = String(body!.src).replace(/\/master\.m3u8$/, '');
  const m = (file: string, h: Record<string, string> = {}) => run(get(`${base}/${file}`, { cookie: c, ...h }));

  const master = await m('master.m3u8');
  const masterText = await master.text();
  check('the master playlist: served from R2, never kept', master.status === 200 && master.headers.get('content-type') === 'application/vnd.apple.mpegurl' && master.headers.get('cache-control') === 'private, no-store' && masterText.includes('1080p/index.m3u8'));
  check('… its relative addresses stay under the token path', new URL('1080p/index.m3u8', SITE + base + '/master.m3u8').pathname === `${base}/1080p/index.m3u8`);
  const variant = await m('1080p/index.m3u8');
  const vText = await variant.text();
  check('a variant playlist, with its key one folder up (still under the token)', variant.status === 200 && vText.includes('URI="../key"') && new URL('../key', SITE + base + '/1080p/index.m3u8').pathname === `${base}/key`);
  const seg = await m('1080p/seg_00000.ts');
  check('a piece: video/mp2t, kept an hour in this browser only, same-origin only, noindex', seg.status === 200 && seg.headers.get('content-type') === 'video/mp2t' && seg.headers.get('cache-control') === 'private, max-age=3600' && seg.headers.get('cross-origin-resource-policy') === 'same-origin' && seg.headers.get('x-robots-tag')!.includes('noindex') && (await seg.text()) === '0123456789');
  const part = await m('1080p/seg_00000.ts', { range: 'bytes=2-5' });
  check('a piece in part: 206 with Content-Range', part.status === 206 && part.headers.get('content-range') === 'bytes 2-5/10' && (await part.text()) === '2345', { s: part.status, r: part.headers.get('content-range') });
  const key = await m('key');
  check('the key: 16 bytes, never kept, no ETag', key.status === 200 && key.headers.get('cache-control') === 'private, no-store' && !key.headers.get('etag') && (await key.arrayBuffer()).byteLength === 16);
  check('… read from keys/, not beside the pieces', r2Asked.includes(`keys/on-r2/${V}.key`));
  const poster = await m('poster.jpg', { 'sec-fetch-dest': 'image' });
  check('the poster, for an <img> or the video', poster.status === 200 && poster.headers.get('content-type') === 'image/jpeg');
  check('every media fetch counted against the ticket', mediaKeys.length === 6 && mediaKeys.every((k) => /^kino:[\w-]{22}$/.test(k)), mediaKeys);
  const safari = await run(get(`${base}/1080p/seg_00000.ts`, { cookie: c, 'sec-fetch-site': '', 'sec-fetch-dest': '' }));
  check("Safari's own player (no Sec-Fetch headers) still plays", safari.status === 200);

  reset();
  const refused: [string, () => Promise<Response>, number][] = [
    ['no ticket', () => run(get(`${base}/1080p/seg_00000.ts`)), 401],
    ['opened in a tab', () => m('1080p/seg_00000.ts', { 'sec-fetch-dest': 'document' }), 403],
    ['in a frame', () => m('key', { 'sec-fetch-dest': 'iframe' }), 403],
    ['from another site', () => m('1080p/seg_00000.ts', { 'sec-fetch-site': 'cross-site' }), 403],
    ['a tampered token', () => run(get(`${base.replace(/.$/, (x) => (x === 'A' ? 'B' : 'A'))}/key`, { cookie: c })), 403],
    ['another film', () => run(get(`${base.replace('/kino/on-r2/', '/kino/on-youtube/')}/key`, { cookie: c })), 404],
    ['path traversal', () => run(get(`${base}/../../on-youtube/play`, { cookie: c })), 404],
    ['a file that is not media', () => m('1080p/../../../keys/on-r2.key'), 404],
    ['an odd name', () => m('1080p/seg_1.ts'), 404],
    ['a POST', () => run(new Request(`${SITE}${base}/key`, { method: 'POST', headers: { cookie: c } })), 405],
  ];
  for (const [name, go, status] of refused) {
    const r = await go();
    check(`media refused, ${name}: ${status}`, r.status === status, r.status);
  }
  check('… and none of them read R2', r2Asked.length === 0, r2Asked);

  const other = await getTicket();
  check("a token with someone else's ticket: 403", (await run(get(`${base}/key`, { cookie: other }))).status === 403);
  now = NOW + (600 + 3600 + 1) * 1000;
  check('an expired token: 403 (play gives a new one)', (await m('key')).status === 403);
  now = NOW;
  allowMedia = false;
  const flood = await m('1080p/seg_00000.ts');
  check('too many pieces on one ticket: 429', flood.status === 429 && flood.headers.get('retry-after') === '10');
  allowMedia = true;
  R2.delete(`films/on-r2/${V}/1080p/seg_00000.ts`);
  check('a piece missing from R2: 404, and logged', (await m('1080p/seg_00000.ts')).status === 404 && logs.some((l) => l[0] === 'kino: missing'));
  const broken = await handleKino(get(`${base}/key`, { cookie: c }), { ...deps(), r2: async () => { throw new Error('no KINO binding'); } });
  check('no R2 binding: 503, logged', broken.status === 503 && logs.some((l) => l[0] === 'kino: R2 failed'));
}

console.log(fails ? `${fails} of ${count} FAILED` : `all ${count} passed`);
if (fails) process.exitCode = 1;
