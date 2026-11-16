// Kino (/kino): the cinema's door. Every request under /kino runs here
// (assets.run_worker_first in wrangler.jsonc).
//
//   GET  /kino, /kino/<film>        the built pages, as ASSETS has them, marked noindex
//   POST /kino/ticket               the box office: a Turnstile check, then a ticket
//   GET  /kino/<film>/play          with a ticket: where the film plays from
//   GET  /kino/<film>/m/<token>/…   with a ticket and that film's token: its playlists,
//                                   pieces, key and poster, read from R2
//
// The ticket is a signed HttpOnly cookie (kus98_kino, Path=/kino, 4 hours, gone
// when the browser closes). It holds a random id and nothing about the visitor.
// A film's media token (in the path) is signed for that film, its upload and
// that ticket's id, and lasts the film's length plus an hour: a link copied out
// of the page is no use without the ticket, and the ticket is no use for
// another film. The pieces are encrypted (HLS AES-128); the key is served like
// the rest. Playlists use relative addresses, so every piece and the key sit
// under the same token path.
//
// What this stops: crawlers and bots (no ticket without Turnstile), links to
// the files (none is public; the R2 bucket has no public address), opening a
// piece in a tab or on another site (Sec-Fetch checks), and mass fetching
// (rate limits). What it can't stop: a screen recording, or an expert with
// developer tools copying what their own browser was given. That would take
// DRM (docs/KINO.md).
import { FILM_ID, KINO_PREFIX, TICKET_COOKIE, TICKET_PATH, TICKET_S, TURNSTILE_ACTION, VERSION, mediaLife, sourceOf, type KinoFilm } from '../src/lib/kino.ts';
import type { TurnstileResult } from './contact.ts';
import { limitKey, sameOrigin } from './guides.ts';

export { isKinoPath } from '../src/lib/kino.ts';

/** An R2 object as the Worker reads it (env.KINO.get), narrowed to what is used here. */
export interface KinoObject {
  body: ReadableStream | null;
  size: number;
  httpEtag?: string;
  range?: { offset?: number; length?: number; suffix?: number };
}

export interface KinoDeps {
  films: KinoFilm[];
  /** The key that signs tickets and media tokens (24+ characters), or undefined: the Kino is closed. */
  secret: () => string | undefined;
  /** env.ASSETS.fetch: the built pages and the 404 page. */
  assets: (req: Request) => Promise<Response>;
  /** An object in the Kino's R2 bucket (with a Range header, part of it), or null; throws without the binding. */
  r2: (key: string, range?: string) => Promise<KinoObject | null>;
  turnstile: { secret: string | undefined; hostnames: Set<string>; verify: (secret: string, token: string, ip: string | null) => Promise<TurnstileResult> };
  /** Tickets asked for, per visitor (KINO_LIMIT). */
  allow: (key: string) => Promise<boolean>;
  /** Media fetched, per ticket (KINO_MEDIA_LIMIT); without it (a preview), no limit. */
  allowMedia?: (key: string) => Promise<boolean>;
  /** Random bytes (crypto.getRandomValues). */
  random: (n: number) => Uint8Array;
  now: () => number;
  /** Codes only: never a cookie, a token or a key. */
  log: (...args: unknown[]) => void;
}

export const MIN_SECRET = 24;
const ROBOTS = 'noindex, nofollow, noarchive, noimageindex';
const BASE = { 'x-robots-tag': ROBOTS, 'x-content-type-options': 'nosniff' };
const PRIVATE = { ...BASE, 'cache-control': 'private, no-store', vary: 'Cookie' };
const PAGE = { ...BASE, 'content-security-policy': "frame-ancestors 'none'", 'x-frame-options': 'DENY', 'referrer-policy': 'same-origin' };
const MEDIA = { ...BASE, 'cross-origin-resource-policy': 'same-origin', 'referrer-policy': 'no-referrer' };

const TICKET = /^v1\.([A-Za-z0-9_-]{22})\.(\d{10})\.([A-Za-z0-9_-]{43})$/;
/** /kino/<film>/m/<token>/<file> */
const MEDIA_PATH = /^\/m\/(v1\.[A-Za-z0-9_-]{22}\.\d{10}\.[A-Za-z0-9_-]{43})\/(master\.m3u8|key|poster\.jpg|(\d{3,4}p)\/(index\.m3u8|seg_\d{5}\.ts))$/;
/** Fetches that may read media: a script (hls.js), the video element, the poster. Never a page, a frame or an object. */
const MEDIA_DEST = new Set(['empty', 'video', 'audio', 'image', 'track']);
/** Plain bots and tools; Turnstile catches the rest. */
const BOT = /bot\b|crawl|spider|slurp|facebookexternalhit|embedly|whatsapp|headless|python-|curl\/|wget|httpclient|go-http|java\/|okhttp|scrapy|axios|node-fetch|undici/i;

const TYPES: Record<string, string> = {
  m3u8: 'application/vnd.apple.mpegurl',
  ts: 'video/mp2t',
  key: 'application/octet-stream',
  jpg: 'image/jpeg',
};

export async function handleKino(request: Request, deps: KinoDeps): Promise<Response> {
  let res: Response;
  try {
    res = await route(request, deps);
  } catch (e) {
    deps.log('kino: failed', (e as Error)?.message ?? String(e));
    res = json({ error: 'unavailable' }, 503);
  }
  return request.method === 'HEAD' && res.body ? new Response(null, { status: res.status, headers: res.headers }) : res;
}

async function route(req: Request, deps: KinoDeps): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  if (url.protocol === 'http:' && !isLocal(url.hostname)) return redirect(`https://${url.host}${p}${url.search}`, 308);
  if (p === TICKET_PATH) return ticket(req, url, deps);
  if (p === KINO_PREFIX) return page(req, url, KINO_PREFIX, deps);
  if (p === `${KINO_PREFIX}/` || p === `${KINO_PREFIX}/index` || p === `${KINO_PREFIX}/index.html`) return redirect(KINO_PREFIX + url.search, 307);

  const rest = p.slice(KINO_PREFIX.length + 1);
  const cut = rest.indexOf('/');
  let id = cut < 0 ? rest : rest.slice(0, cut);
  const sub = cut < 0 ? '' : rest.slice(cut);
  if (cut < 0 && id.endsWith('.html')) id = id.slice(0, -5);
  const film = FILM_ID.test(id) ? deps.films.find((f) => f.id === id) : undefined;
  if (!film) return notFound(url, deps);
  const home = `${KINO_PREFIX}/${film.id}`;
  if (cut < 0 && rest !== film.id) return redirect(home + url.search, 307); // /kino/<film>.html
  if (sub === '') return page(req, url, home, deps);
  if (sub === '/') return redirect(home + url.search, 307);
  if (sub === '/play') return play(req, url, film, deps);
  const m = MEDIA_PATH.exec(sub);
  if (m) return media(req, url, film, m[1], m[2], deps);
  return notFound(url, deps);
}

// ---- Pages ----

/** A built page, as ASSETS serves it, with the Kino's headers: never indexed, never framed. */
async function page(req: Request, url: URL, path: string, deps: KinoDeps): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { ...PAGE, allow: 'GET, HEAD' } });
  const fwd = new Headers();
  for (const h of ['if-none-match', 'if-modified-since']) {
    const v = req.headers.get(h);
    if (v) fwd.set(h, v);
  }
  const res = await deps.assets(new Request(new URL(path, url), { method: req.method, headers: fwd }));
  if (res.status === 404) return notFound(url, deps);
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(PAGE)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

async function notFound(url: URL, deps: KinoDeps): Promise<Response> {
  const res = await deps.assets(new Request(new URL('/404', url)));
  const type = res.headers.get('content-type') ?? 'text/html; charset=utf-8';
  return new Response(res.ok || res.status === 404 ? res.body : 'Not found', { status: 404, headers: { ...PAGE, 'content-type': type } });
}

// ---- The box office ----

/**
 * POST /kino/ticket {"token": "<Turnstile token>"} → 200 {"ok": true, "exp": <unix s>}
 * and the ticket cookie. Refused: 405 (not a POST), 403 (another site, a bot,
 * Turnstile said no), 429 (too many), 503 (closed: no key, or Turnstile
 * unreachable).
 */
async function ticket(req: Request, url: URL, deps: KinoDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method' }, 405, { allow: 'POST' });
  if (!sameOrigin(req, url.origin)) return json({ error: 'forbidden' }, 403);
  if (BOT.test(req.headers.get('user-agent') ?? '') || !req.headers.get('user-agent')) return json({ error: 'forbidden' }, 403);
  const key = await keyOf(deps);
  if (!key || !deps.turnstile.secret) return json({ error: 'closed' }, 503);
  const ip = req.headers.get('cf-connecting-ip');
  if (!(await deps.allow(visitor(ip)))) return json({ error: 'busy' }, 429, { 'retry-after': '60' });
  let token = '';
  try {
    const text = await readLimited(req, 4096);
    const body = text ? (JSON.parse(text) as { token?: unknown }) : {};
    if (typeof body.token === 'string') token = body.token;
  } catch {
    token = '';
  }
  if (!token || token.length > 2048) return json({ error: 'verification_failed' }, 403);
  let ts: TurnstileResult;
  try {
    ts = await deps.turnstile.verify(deps.turnstile.secret, token, ip);
  } catch (e) {
    deps.log('kino: Turnstile unreachable', (e as Error).message);
    return json({ error: 'verification_unavailable' }, 503);
  }
  // Cloudflare's test secret answers "example.com" with no action: only where example.com is allowed (.dev.vars, previews).
  const testAnswer = ts.hostname === 'example.com' && !ts.action && deps.turnstile.hostnames.has('example.com');
  if (!ts.success || !ts.hostname || !deps.turnstile.hostnames.has(ts.hostname) || (ts.action !== TURNSTILE_ACTION && !testAnswer)) {
    deps.log('kino: Turnstile refused', { success: ts.success, hostname: ts.hostname, action: ts.action, errors: ts['error-codes'] });
    return json({ error: 'verification_failed' }, 403);
  }
  const exp = Math.floor(deps.now() / 1000) + TICKET_S;
  const tid = b64u(deps.random(16));
  const value = `v1.${tid}.${exp}.${await sign(key, `kino|ticket|v1|${tid}|${exp}`)}`;
  const cookie = [`${TICKET_COOKIE}=${value}`, `Path=${KINO_PREFIX}`, 'HttpOnly', 'SameSite=Strict', ...(url.protocol === 'https:' ? ['Secure'] : [])].join('; ');
  return json({ ok: true, exp }, 200, { 'set-cookie': cookie });
}

/** The ticket's id and expiry when the request carries a valid, unexpired ticket; else null. */
export async function ticketOf(req: Request, deps: KinoDeps): Promise<{ tid: string; exp: number } | null> {
  const key = await keyOf(deps);
  if (!key) return null;
  const now = Math.floor(deps.now() / 1000);
  let n = 0;
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq).trim() !== TICKET_COOKIE) continue;
    if (++n > 4) break;
    const m = TICKET.exec(part.slice(eq + 1).trim());
    if (!m) continue;
    const [, tid, exp, sig] = m;
    const e = Number(exp);
    if (e <= now || e > now + TICKET_S + 60) continue;
    if (await verify(key, `kino|ticket|v1|${tid}|${exp}`, sig)) return { tid, exp: e };
  }
  return null;
}

// ---- Where a film plays from ----

/**
 * GET /kino/<film>/play, with a ticket. A film on R2:
 * {"kind": "hls", "src": ".../m/<token>/master.m3u8", "poster": ".../m/<token>/poster.jpg", "exp"}.
 * A film still on YouTube: {"kind": "youtube", "id"}. Without a ticket: 401.
 */
async function play(req: Request, url: URL, film: KinoFilm, deps: KinoDeps): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'method' }, 405, { allow: 'GET, HEAD' });
  if (!fromHere(req)) return json({ error: 'forbidden' }, 403);
  const key = await keyOf(deps);
  if (!key) return json({ error: 'closed' }, 503);
  const t = await ticketOf(req, deps);
  if (!t) return json({ error: 'ticket' }, 401);
  if (sourceOf(film) === 'youtube') return json({ kind: 'youtube', id: film.youtubeId });
  const s = film.stream!;
  const exp = Math.min(Math.floor(deps.now() / 1000) + mediaLife(film), t.exp);
  const token = `v1.${t.tid}.${exp}.${await sign(key, mediaSigned(film, t.tid, exp))}`;
  const base = `${KINO_PREFIX}/${film.id}/m/${token}`;
  return json({ kind: 'hls', src: `${base}/master.m3u8`, poster: `${base}/poster.jpg`, width: s.width, height: s.height, exp });
}

const mediaSigned = (film: KinoFilm, tid: string, exp: number | string) => `kino|media|v1|${film.id}|${film.stream?.version ?? ''}|${tid}|${exp}`;

// ---- The film itself ----

async function media(req: Request, url: URL, film: KinoFilm, token: string, file: string, deps: KinoDeps): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return bare(405, { allow: 'GET, HEAD' });
  if (!film.stream || !VERSION.test(film.stream.version)) return bare(404);
  if (!fromHere(req)) return bare(403);
  const dest = req.headers.get('sec-fetch-dest');
  if (dest && !MEDIA_DEST.has(dest)) return bare(403); // opened in a tab, a frame, an object
  const key = await keyOf(deps);
  if (!key) return bare(503);
  const t = await ticketOf(req, deps);
  if (!t) return bare(401);
  const [, tid, exp, sig] = TICKET.exec(token)!;
  const now = Math.floor(deps.now() / 1000);
  if (tid !== t.tid || Number(exp) <= now || Number(exp) > t.exp || !(await verify(key, mediaSigned(film, tid, exp), sig))) return bare(403);
  if (deps.allowMedia && !(await deps.allowMedia(`kino:${tid}`))) return bare(429, { 'retry-after': '10' });

  const v = film.stream.version;
  const r2key = file === 'key' ? `keys/${film.id}/${v}.key` : `films/${film.id}/${v}/${file}`;
  const ext = file === 'key' ? 'key' : file.slice(file.lastIndexOf('.') + 1);
  const isPiece = ext === 'ts';
  const range = isPiece ? req.headers.get('range') ?? undefined : undefined;
  let obj: KinoObject | null;
  try {
    obj = await deps.r2(r2key, range && /^bytes=\d*-\d*$/.test(range) ? range : undefined);
  } catch (e) {
    deps.log('kino: R2 failed', film.id, (e as Error)?.message ?? String(e));
    return bare(503);
  }
  if (!obj || !obj.body) {
    deps.log('kino: missing', film.id, v, file);
    return bare(404);
  }
  const h = new Headers({
    ...MEDIA,
    'content-type': TYPES[ext],
    // Playlists and the key are never kept; pieces and the poster may stay in this browser for an hour (the path holds the token).
    'cache-control': ext === 'm3u8' || ext === 'key' ? 'private, no-store' : 'private, max-age=3600',
    'accept-ranges': isPiece ? 'bytes' : 'none',
  });
  if (obj.httpEtag && ext !== 'key') h.set('etag', obj.httpEtag);
  if (req.method === 'HEAD') {
    void obj.body.cancel().catch(() => {});
    h.set('content-length', String(obj.size));
    return new Response(null, { status: 200, headers: h });
  }
  const r = range ? partOf(obj) : null;
  if (r) {
    h.set('content-range', `bytes ${r.start}-${r.end}/${obj.size}`);
    h.set('content-length', String(r.end - r.start + 1));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set('content-length', String(obj.size));
  return new Response(obj.body, { status: 200, headers: h });
}

/** The byte range R2 returned, as start and end (inclusive), or null for the whole object. */
function partOf(obj: KinoObject): { start: number; end: number } | null {
  const r = obj.range;
  if (!r) return null;
  if (r.suffix !== undefined) return { start: Math.max(0, obj.size - r.suffix), end: obj.size - 1 };
  const start = r.offset ?? 0;
  const len = r.length ?? obj.size - start;
  if (start === 0 && len >= obj.size) return null;
  return { start, end: Math.min(obj.size, start + len) - 1 };
}

/** Same site, or no browser signal at all (Safari's own player sends none). */
function fromHere(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  return !site || site === 'same-origin';
}

// ---- Signing ----

const enc = new TextEncoder();
const HMAC = { name: 'HMAC', hash: 'SHA-256' } as const;
let cached: { secret: string; key: CryptoKey } | null = null;

/** The Kino's own HMAC key, derived from the secret under a "kino" label, so nothing signed here counts elsewhere. */
async function keyOf(deps: KinoDeps): Promise<CryptoKey | null> {
  const secret = deps.secret()?.trim() ?? '';
  if (secret.length < MIN_SECRET) return null;
  if (cached?.secret === secret) return cached.key;
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), HMAC, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', base, enc.encode('kino|key|v1'));
  const key = await crypto.subtle.importKey('raw', bytes, HMAC, false, ['sign', 'verify']);
  cached = { secret, key };
  return key;
}

const sign = async (key: CryptoKey, data: string) => b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));

async function verify(key: CryptoKey, data: string, sig: string): Promise<boolean> {
  const mac = unb64u(sig);
  if (!mac || b64u(mac) !== sig) return false; // one spelling per signature
  return crypto.subtle.verify('HMAC', key, mac, enc.encode(data));
}

export const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function unb64u(s: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

// ---- Small things ----

const visitor = (ip: string | null) => limitKey(ip).replace(/^guides:/, 'kino:');
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...PRIVATE, 'content-type': 'application/json; charset=utf-8', ...extra } });
const bare = (status: number, extra: Record<string, string> = {}) => new Response(null, { status, headers: { ...MEDIA, 'cache-control': 'private, no-store', ...extra } });
const redirect = (to: string, status: number) => new Response(null, { status, headers: { ...PRIVATE, location: to } });
const isLocal = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');

/** The request body as text, or null once it passes `max` bytes. */
async function readLimited(request: Request, max: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      void reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}
