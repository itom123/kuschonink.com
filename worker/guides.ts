// Field Guide (导览): the password gate. /guides and every request under
// /guides/ run this code first (wrangler.jsonc run_worker_first). There is no
// list of guides to choose from: /guides goes to the first listed guide's own
// address, whose log-on box is where a guide is chosen (programHome() below).
//
// Who may open which guide is src/content/guides/access.json: the audiences,
// least privileged first, each with the NAME of the Cloudflare secret that
// holds its password, and each guide's list of audiences. The build makes one
// page per guide per audience (dist/guides/<slug>/views/<audience>.html) and
// one log-on page per guide (dist/guides/<slug>/locked.html). This handler
// picks one of them from the cookie and fetches it from ASSETS itself, so a
// view, a picture or a base map never leaves the Worker without a valid
// cookie, and every failure fails closed.
//
// The cookie: kus98_guides_<audience>=v1.<audience>.<expiry>.<HMAC-SHA256>,
// one per audience, so a device can be logged on to guides of different
// audiences at once (the photography guide with the visitors' password, the
// restaurant guide with its own). Cookies named plain kus98_guides, as they were
// before, are still read. The name only keeps them apart: the audience that
// counts is the one inside the signed value. Its key is
// an HMAC of that audience's password under a secret only the server has (the
// pepper: GUIDES_COOKIE_SECRET, else TURNSTILE_SECRET), so nobody can sign a
// cookie for a guessed password. Changing one password logs out only that
// audience; changing the pepper logs out everyone; without one, every guide is
// closed. Log Off forgets the cookies that open that guide, and no others. Written with its dependencies passed in, like contact.ts, so
// worker/guides.test.mts runs it in Node.
import type { AccessFile } from '../src/lib/guides/types';
import { cityGuide, currentSlug } from '../src/lib/guides/address.ts';

export const PREFIX = '/guides';
export const COOKIE = 'kus98_guides';
/** An audience's own cookie: kus98_guides_<audience>. */
export const cookieName = (audience: string) => `${COOKIE}_${audience}`;
/** The guide cookies a request may carry: each audience's, and the plain name of the cookies made before. */
const COOKIE_NAME = /^kus98_guides(?:_[a-z][a-z0-9-]{0,63})?$/;
/** At most this many guide cookies are checked in one request (one per audience, and an old plain one). */
const MAX_COOKIES = 8;
/** "Save this password": 30 days. Otherwise a browser-session cookie whose signed expiry is 12 hours. */
export const REMEMBER_S = 30 * 86400;
export const SESSION_S = 12 * 3600;
/** A password shorter than this (after normalise()) counts as not set. */
export const MIN_PASSWORD = 6;
/** A pepper shorter than this (after trim()) counts as not set, and every guide is closed. */
export const MIN_PEPPER = 24;
const MAX_BODY_BYTES = 4096;
/** Audience passwords live in secrets named GUIDES_…, never in another of the Worker's variables, nor in the pepper. */
const SECRET_NAME = /^GUIDES_(?!COOKIE_SECRET$)[A-Z0-9_]+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOKEN = /^v1\.([a-z][a-z0-9-]{0,63})\.(\d{10})\.([A-Za-z0-9_-]{43})$/;
/** One picture or base map: public/guides/<slug>/{img,map}/<file>. */
const FILE = /^\/(?:img|map)\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
/** One street-level tile: /tiles/<z>/<x>/<y>.png, whole numbers with no leading zeros (one spelling per tile). */
const TILE_PATH = /^\/tiles\/(\d{2})\/(0|[1-9]\d{0,5})\/(0|[1-9]\d{0,5})\.png$/;
/**
 * Tiles are proxied at these Web-Mercator zooms only (src/lib/guides/view.ts tells the browser the same range).
 * From 12: the region picture (z11) is magnified past 1:1 long before the city plan (z14) is, so the overview
 * round the city needs tiles at 12 and 13 to be sharp. Below 12 the region picture is the map.
 */
export const TILE_Z = { min: 12, max: 19 };
/**
 * Plan IGN v2 from IGN's Géoplateforme WMTS (Etalab 2.0 licence, no key). The
 * layer and every other parameter are fixed here; only z, x and y come from
 * the request, so this is not an open proxy.
 */
const TILE_UPSTREAM = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png';
const TILE_UA = 'kuschonink.com Field Guide tile proxy (+https://kuschonink.com)';
/** The edge keeps a tile for 30 days; a browser for a week, privately (the cookie decides who gets it). */
export const TILE_EDGE_S = 30 * 86400;
export const TILE_BROWSER_S = 7 * 86400;
/** A tile bigger than this is not a tile. */
const TILE_MAX_BYTES = 1024 * 1024;
const TILE_TIMEOUT_MS = 8000;
/** Other spellings of a guide's address (after /guides/<slug>). */
const CANONICAL = new Set(['/', '/index', '/index.html', '/views']);
/** The first listed guide, as the build writes it on the home page (src/pages/guides/index.astro). */
const FIRST = /\sdata-gd-first="([a-z0-9-]{1,100})"/;
/** Each city's newest listed guide, as the build writes it on the home page: "paris:paris-2026-11 …". */
const CITIES = /\sdata-gd-cities="([a-z0-9: -]{0,4000})"/;

/** What the log-on page shows without JavaScript (its data-gd-state). */
export type LogonState = 'none' | 'wrong' | 'wait' | 'off' | 'denied' | 'error';

export interface GuidesDeps {
  /** src/content/guides/access.json. */
  access: AccessFile;
  /** A Worker secret by name (an audience's password), or undefined. */
  secret: (name: string) => string | undefined;
  /** The pepper: the server-only secret behind every cookie key (GUIDES_COOKIE_SECRET, else TURNSTILE_SECRET), or undefined. */
  cookieSecret: () => string | undefined;
  /** The built site (env.ASSETS.fetch): views, log-on pages, pictures, base maps, the 404 page. */
  assets: (request: Request) => Promise<Response> | Response;
  /** False once this visitor has tried too many passwords. */
  allow: (key: string) => Promise<boolean> | boolean;
  /**
   * False once this visitor has had too many tiles fetched from IGN. Asked only
   * on an edge-cache miss. Missing (a preview without the binding) allows every tile.
   */
  allowTile?: (key: string) => Promise<boolean> | boolean;
  /** Outbound fetch, for street-level tiles from IGN (the visitor's own request never reaches IGN). */
  fetch: (url: string, init?: RequestInit & { cf?: Record<string, unknown> }) => Promise<Response>;
  /** The edge cache for tiles (caches.default), if there is one. */
  cache?: { match(key: Request): Promise<Response | undefined>; put(key: Request, res: Response): Promise<unknown> };
  /** Milliseconds since 1970. */
  now: () => number;
  /** Codes and names only: never a password, a cookie or a request body. */
  log: (...args: unknown[]) => void;
  /** POST /guides/<slug>/suggest (worker/suggest.ts); without it, that address is a 404. */
  suggest?: (request: Request, slug: string) => Promise<Response>;
  /** A logged-on admin (worker/admin.ts) sees each guide's fullest view without its password. */
  isAdmin?: (request: Request) => Promise<boolean>;
}

/** Mirrors run_worker_first "/guides" and "/guides/*". */
export const isGuidesPath = (p: string) => p === PREFIX || p.startsWith(`${PREFIX}/`);

const ROBOTS = 'noindex, nofollow, noarchive';
const PRIVATE = { 'cache-control': 'private, no-store', vary: 'Cookie', 'x-robots-tag': ROBOTS, 'x-content-type-options': 'nosniff' };
const PAGE = { ...PRIVATE, 'content-security-policy': "frame-ancestors 'none'", 'x-frame-options': 'DENY' };
const HTML = 'text/html; charset=utf-8';

export async function handleGuides(request: Request, deps: GuidesDeps): Promise<Response> {
  let res: Response;
  try {
    res = await route(request, deps);
  } catch (e) {
    deps.log('guides: failed', (e as Error)?.message ?? String(e));
    res = unavailable();
  }
  // HEAD: the same headers, no body.
  return request.method === 'HEAD' && res.body ? new Response(null, { status: res.status, headers: res.headers }) : res;
}

async function route(req: Request, deps: GuidesDeps): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  if (url.protocol === 'http:' && !isLocal(url.hostname)) return redirect(`https://${url.host}${p}${url.search}`, 308);
  if (p === PREFIX || p === `${PREFIX}/`) return programHome(req, url, deps);
  const at = parse(p);
  if (!at) return notFound(url, deps);
  if (!isGuide(deps.access, at.slug)) return elsewhere(req, url, at, deps);
  const { slug, sub } = at;
  const home = `${PREFIX}/${slug}`;
  // /guides/<slug>.html, /<slug>/, the built views and log-on page: always the guide's own address.
  if (at.html || CANONICAL.has(sub) || sub.startsWith('/views/') || sub.startsWith('/locked')) return redirect(home + url.search, 307);
  if (sub === '/login') return logOn(req, url, slug, deps);
  if (sub === '/logout') return logOff(req, url, slug, deps);
  if (sub === '/suggest') return deps.suggest ? deps.suggest(req, slug) : notFound(url, deps);
  const isTile = sub.startsWith('/tiles/');
  const isFile = sub.startsWith('/img/') || sub.startsWith('/map/') || isTile;
  if (sub && !isFile) return notFound(url, deps);
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { ...PRIVATE, allow: 'GET, HEAD' } });

  const pepper = pepperOf(deps); // none: closed, and no cookie counts
  const view = (deps.isAdmin && (await deps.isAdmin(req)) ? topView(deps.access, slug) : null) ?? (pepper ? await viewFor(deps, pepper, slug, req.headers.get('cookie')) : null);
  if (isFile) {
    if (!view) return logOnFirst(slug); // assets are never read, and IGN is never asked
    if (isTile) return tile(req, url, sub, slug, deps);
    return FILE.test(sub) ? asset(req, url, deps) : notFound(url, deps);
  }
  if (view) return page(req, url, `${home}/views/${view}`, 'none', 200, deps);
  return page(req, url, `${home}/locked`, pepper && openers(deps, slug).length ? 'none' : 'off', 200, deps);
}

/**
 * /guides and /guides/: no page in between. While any guide is listed, both go
 * to the first one's own address (307, the query kept): its log-on box, or the
 * guide itself with a valid cookie. The build names that guide on the home page
 * (data-gd-first), so the Worker reads no guide content, and it follows only a
 * slug that access.json knows. With none listed, /guides is the built page that
 * says so, served as ASSETS always served it, and /guides/ goes there.
 */
async function programHome(req: Request, url: URL, deps: GuidesDeps): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { ...PRIVATE, allow: 'GET, HEAD' } });
  const built = await deps.assets(new Request(new URL(PREFIX, url)));
  const text = await built.text();
  const slug = built.ok ? FIRST.exec(text)?.[1] : undefined;
  if (slug && SLUG.test(slug) && isGuide(deps.access, slug)) return redirect(`${PREFIX}/${slug}${url.search}`, 307);
  if (url.pathname !== PREFIX) return redirect(PREFIX + url.search, 307);
  return deps.assets(req);
}

/**
 * An address that is no guide (src/lib/guides/address.ts):
 * - an old one that access.json "moved" sends on: there for good, with the
 *   rest of the path and the query (308 keeps a POST a POST);
 * - a city, /guides/<city>: the newest listed guide there (307, as it moves
 *   on when a new guide is listed). The build names it on the /guides page
 *   (data-gd-cities), so the Worker reads no guide content;
 * - anything else: 404.
 */
async function elsewhere(req: Request, url: URL, at: { slug: string; sub: string; html: boolean }, deps: GuidesDeps): Promise<Response> {
  const to = currentSlug(deps.access, at.slug);
  if (to) return redirect(`${PREFIX}/${to}${at.sub}${url.search}`, req.method === 'GET' || req.method === 'HEAD' ? 301 : 308);
  if (!at.html && (at.sub === '' || at.sub === '/') && (req.method === 'GET' || req.method === 'HEAD')) {
    const built = await deps.assets(new Request(new URL(PREFIX, url)));
    const line = built.ok ? CITIES.exec(await built.text())?.[1] ?? '' : '';
    const slug = cityGuide(line, at.slug);
    if (slug && isGuide(deps.access, slug)) return redirect(`${PREFIX}/${slug}${url.search}`, 307);
  }
  return notFound(url, deps);
}

/** "/guides/<slug>[.html][/<sub>]" → its parts; null when the slug can't be one. */
function parse(p: string): { slug: string; sub: string; html: boolean } | null {
  const rest = p.slice(PREFIX.length + 1);
  const cut = rest.indexOf('/');
  let slug = cut < 0 ? rest : rest.slice(0, cut);
  const sub = cut < 0 ? '' : rest.slice(cut);
  const html = cut < 0 && slug.endsWith('.html');
  if (html) slug = slug.slice(0, -5);
  return SLUG.test(slug) ? { slug, sub, html } : null;
}

const isGuide = (access: AccessFile, slug: string) => Object.hasOwn(access.guides ?? {}, slug) && Array.isArray(access.guides[slug]);

// ---- Audiences ----

/** An audience and every audience it includes, through `includes`, at any depth. */
export function closure(access: AccessFile, id: string): Set<string> {
  const byId = new Map(access.audiences.map((a) => [a.id, a]));
  const out = new Set<string>();
  const walk = (x: string) => {
    const a = byId.get(x);
    if (!a || out.has(x)) return;
    out.add(x);
    for (const y of a.includes ?? []) walk(y);
  };
  walk(id);
  return out;
}

/**
 * The view of a guide that an audience gets: the most privileged audience on
 * the guide's list that it includes (itself or through `includes`), or null
 * when it may not open the guide.
 */
export function viewOf(access: AccessFile, slug: string, audience: string): string | null {
  const list = isGuide(access, slug) ? access.guides[slug] : [];
  const mine = closure(access, audience);
  let best: string | null = null;
  for (const a of access.audiences) if (mine.has(a.id) && list.includes(a.id)) best = a.id; // later = more privileged
  return best;
}

const rank = (access: AccessFile, id: string | null) => (id === null ? -1 : access.audiences.findIndex((a) => a.id === id));

/** Spaces, capitals and full-width characters (a Chinese IME) don't matter. */
export const normalise = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Each audience's password, normalised, for the audiences that have one. Not
 * set: a missing secret, one shorter than 6 characters, a name that isn't
 * GUIDES_… (or is the pepper's, GUIDES_COOKIE_SECRET), or the same password
 * as a less privileged audience. That one wins
 * (least privilege), and the higher audience stays closed until it has a
 * password of its own: a shared password must never open the higher view, nor
 * sign cookies for it.
 */
function passwords(deps: GuidesDeps, notes?: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const owner = new Map<string, string>();
  for (const a of deps.access.audiences) {
    const named = SECRET_NAME.test(a.secret);
    const raw = named ? deps.secret(a.secret) : undefined;
    const pw = typeof raw === 'string' ? normalise(raw) : '';
    if (pw.length >= MIN_PASSWORD && !owner.has(pw)) {
      owner.set(pw, a.secret);
      out.set(a.id, pw);
    } else if (notes) {
      notes.push(`${a.secret}: ${!named ? 'not a GUIDES_… password name' :!pw ? 'not set' : pw.length < MIN_PASSWORD ? `under ${MIN_PASSWORD} characters` : `the same as ${owner.get(pw)}, so it is ignored`}`);
    }
  }
  return out;
}

/** The audiences with a password whose cookie opens this guide, least privileged first. */
function openers(deps: GuidesDeps, slug: string, pws = passwords(deps)): string[] {
  return deps.access.audiences.map((a) => a.id).filter((id) => pws.has(id) && viewOf(deps.access, slug, id) !== null);
}

/**
 * The audience whose view of this guide the request's cookie opens, or null:
 * what a suggestion from inside the guide is "sent by" (worker/suggest.ts).
 */
export async function guideAudience(req: Request, slug: string, deps: GuidesDeps): Promise<string | null> {
  if (!SLUG.test(slug) || !isGuide(deps.access, slug)) return null;
  const pepper = pepperOf(deps);
  return pepper ? viewFor(deps, pepper, slug, req.headers.get('cookie')) : null;
}

/** The most privileged view of a guide: what an admin sees. */
export function topView(access: AccessFile, slug: string): string | null {
  const list = isGuide(access, slug) ? access.guides[slug] : [];
  let best: string | null = null;
  for (const a of access.audiences) if (list.includes(a.id)) best = a.id; // later = more privileged
  return best;
}

/** The view of this guide that the request's cookie opens, or null. */
async function viewFor(deps: GuidesDeps, pepper: string, slug: string, header: string | null): Promise<string | null> {
  if (!header || !header.includes(COOKIE)) return null;
  const pws = passwords(deps);
  let best: string | null = null;
  for (const aud of await cookieAudiences(pepper, header, pws, deps.now())) {
    const v = viewOf(deps.access, slug, aud);
    if (v && rank(deps.access, v) > rank(deps.access, best)) best = v;
  }
  return best;
}

/** The guide cookies in a Cookie header as [name, value] (a few at most). */
function guideCookies(header: string | null): [string, string][] {
  const out: [string, string][] = [];
  for (const part of (header ?? '').split(';')) {
    const c = part.trim();
    const eq = c.indexOf('=');
    if (eq < 1 || !COOKIE_NAME.test(c.slice(0, eq))) continue;
    out.push([c.slice(0, eq), c.slice(eq + 1)]);
    if (out.length >= MAX_COOKIES) break;
  }
  return out;
}

/** The audiences of the valid guide cookies in a Cookie header. */
async function cookieAudiences(pepper: string, header: string, pws: Map<string, string>, now: number): Promise<string[]> {
  const out: string[] = [];
  for (const [, value] of guideCookies(header)) {
    const aud = await checkToken(pepper, value, pws, now);
    if (aud && !out.includes(aud)) out.push(aud);
  }
  return out;
}

// ---- Cookie (WebCrypto: the same code in workerd and in Node) ----

const enc = new TextEncoder();
const HMAC = { name: 'HMAC', hash: 'SHA-256' };
// Keys, not promises: a promise from one request must not be awaited by another in workerd.
const keys = new Map<string, CryptoKey>();
/** The pepper the cached keys were made with. */
let keysPepper = '';
let saidNoPepper = false;

/** The pepper, trimmed, or null when it is missing or too short: then every guide is closed. */
function pepperOf(deps: GuidesDeps): string | null {
  const raw = deps.cookieSecret();
  const pepper = typeof raw === 'string' ? raw.trim() : '';
  if (pepper.length >= MIN_PEPPER) return pepper;
  if (!saidNoPepper) {
    saidNoPepper = true; // once per isolate
    deps.log(`guides: no cookie secret of ${MIN_PEPPER}+ characters (GUIDES_COOKIE_SECRET, else TURNSTILE_SECRET), so every guide is closed`);
  }
  return null;
}

/**
 * The HMAC key for one audience and its (normalised) password:
 * HMAC-SHA-256(pepper, "guides|key|v1|<audience>\0<password>"). Cached per
 * isolate: 16 at most, all dropped when the pepper changes.
 */
async function keyFor(pepper: string, audience: string, pw: string): Promise<CryptoKey> {
  if (pepper.length < MIN_PEPPER) throw new Error('guides: cookie secret too short');
  if (pepper !== keysPepper) {
    keys.clear();
    keysPepper = pepper;
  }
  const id = `${audience}\0${pw}`;
  const hit = keys.get(id);
  if (hit) return hit;
  const base = await crypto.subtle.importKey('raw', enc.encode(pepper), HMAC, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', base, enc.encode(`guides|key|v1|${id}`));
  const key = await crypto.subtle.importKey('raw', bytes, HMAC, false, ['sign', 'verify']);
  if (pepper !== keysPepper) return key; // the pepper changed meanwhile: not cached
  if (keys.size >= 16) keys.clear();
  keys.set(id, key);
  return key;
}

const signed = (audience: string, exp: string) => `guides|v1|${audience}|${exp}`;
const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...(b instanceof Uint8Array ? b : new Uint8Array(b)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function unb64u(s: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** "v1.<audience>.<exp>.<sig>", signed with the key for this pepper, audience and password (normalised: normalise()). */
export async function makeToken(pepper: string, audience: string, password: string, exp: number): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', await keyFor(pepper, audience, password), enc.encode(signed(audience, String(exp))));
  return `v1.${audience}.${exp}.${b64u(mac)}`;
}

/** The token's audience when it is well formed, unexpired and signed with this pepper and that audience's current password; else null. */
export async function checkToken(pepper: string, token: string, pws: Map<string, string>, now: number): Promise<string | null> {
  if (pepper.length < MIN_PEPPER) return null;
  const m = TOKEN.exec(token);
  if (!m) return null;
  const [, audience, exp, sig] = m;
  const pw = pws.get(audience);
  if (!pw) return null;
  const t = Number(exp) * 1000;
  if (t <= now || t > now + (REMEMBER_S + 3600) * 1000) return null;
  const mac = unb64u(sig);
  if (!mac || b64u(mac) !== sig) return null; // one spelling per signature
  const ok = await crypto.subtle.verify('HMAC', await keyFor(pepper, audience, pw), mac, enc.encode(signed(audience, exp))); // constant time inside
  return ok ? audience : null;
}

export async function issueCookie(pepper: string, audience: string, password: string, now: number, remember: boolean, secure: boolean): Promise<string> {
  const ttl = remember ? REMEMBER_S : SESSION_S;
  const token = await makeToken(pepper, audience, password, Math.floor(now / 1000) + ttl);
  return [`${cookieName(audience)}=${token}`, `Path=${PREFIX}`, 'HttpOnly', 'SameSite=Lax', ...(secure ? ['Secure'] : []), ...(remember ? [`Max-Age=${ttl}`] : [])].join('; ');
}

const sha256 = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));

/**
 * The audience whose password was given: compared with every candidate, each
 * in constant time and all of them every time; the first (least privileged)
 * match wins.
 */
async function matchPassword(given: string, candidates: string[], pws: Map<string, string>): Promise<string | null> {
  const g = await sha256(normalise(given));
  let found: string | null = null;
  for (const id of candidates) {
    const s = await sha256(pws.get(id) ?? '');
    let d = 0;
    for (let i = 0; i < g.length; i++) d |= g[i] ^ s[i];
    if (d === 0 && found === null) found = id;
  }
  return found;
}

// ---- Log on, log off ----

/** A POST from this very site: kuschonink.com, a *.workers.dev preview, or localhost. Browsers always say where it came from. */
export function sameOrigin(req: Request, self: string): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return false;
  const origin = req.headers.get('origin');
  if (origin === 'null') return site === 'same-origin';
  return !origin || origin === self; // no browser signals: a script, still rate-limited
}

/** Where to go after logging on: the guide, with the deep link's query kept (query only; nothing that could leave the site). */
export function cleanNext(raw: string | null | undefined, slug: string): string {
  const home = `${PREFIX}/${slug}`;
  if (!raw || raw.length > 2000 || raw[0] !== '?' || raw.includes('//') || /[\r\n\\]/.test(raw)) return home;
  const out = new URLSearchParams();
  let n = 0;
  for (const [k, v] of new URLSearchParams(raw)) {
    // eslint-disable-next-line no-control-regex
    if (/^[a-z][a-z0-9_-]{0,15}$/i.test(k) && v.length <= 200 && !/[\u0000-\u001f\u007f]/.test(v) && ++n <= 12) out.append(k, v);
  }
  const qs = out.toString();
  return qs && qs.length <= 1000 ? `${home}?${qs}` : home;
}

/** Without JavaScript the form's `next` is empty: the query comes from a same-origin Referer on the guide's own address. */
function refererQuery(req: Request, url: URL, home: string): string {
  try {
    const r = new URL(req.headers.get('referer') ?? '');
    return r.origin === url.origin && r.pathname === home ? r.search : '';
  } catch {
    return '';
  }
}

const wantsJson = (req: Request) => (req.headers.get('accept') ?? '').includes('application/json');

/**
 * The rate-limit key for a client address. IPv4 stays whole; IPv6 counts by
 * its /64 (one home, phone or server, which may use any address in it); an
 * IPv4-mapped IPv6 address counts as its IPv4 address.
 */
export function limitKey(ip: string | null | undefined): string {
  const s = (ip ?? '').trim().toLowerCase().split('%')[0]; // no zone id
  if (!s.includes(':')) return `guides:${s || 'unknown'}`;
  const h = hextets(s);
  if (!h) return `guides:${s}`; // not an IPv6 address: kept whole
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return `guides:${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`;
  return `guides:${h.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`;
}

/** An IPv6 address as its eight 16-bit groups ("::" filled in, a dotted IPv4 tail read as two groups), or null. */
function hextets(ip: string): number[] | null {
  let s = ip;
  const v4 = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) {
    const b = v4.slice(2).map(Number);
    if (b.some((x) => x > 255)) return null;
    s = `${v4[1]}${((b[0] << 8) | b[1]).toString(16)}:${((b[2] << 8) | b[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const groups = (x: string) => (x ? x.split(':') : []);
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  const gap = 8 - head.length - tail.length;
  if (halves.length === 2 ? gap < 1 : gap !== 0) return null;
  const all = [...head, ...Array.from({ length: halves.length === 2 ? gap : 0 }, () => '0'), ...tail];
  return all.every((x) => /^[0-9a-f]{1,4}$/.test(x)) ? all.map((x) => parseInt(x, 16)) : null;
}

async function logOn(req: Request, url: URL, slug: string, deps: GuidesDeps): Promise<Response> {
  const home = `${PREFIX}/${slug}`;
  const asJson = wantsJson(req);
  const fail = async (error: string, status: number, state: LogonState, extra: Record<string, string> = {}) =>
    asJson ? json({ error }, status, extra) : withHeaders(await page(req, url, `${home}/locked`, state, status, deps), extra);

  if (req.method !== 'POST') return asJson ? json({ error: 'method_not_allowed' }, 405, { allow: 'POST' }) : redirect(home, 303);
  if (!sameOrigin(req, url.origin)) return fail('origin_not_allowed', 403, 'denied');
  const notes: string[] = [];
  const pws = passwords(deps, notes);
  const candidates = openers(deps, slug, pws);
  const pepper = pepperOf(deps);
  if (!pepper || !candidates.length) {
    if (!candidates.length) deps.log(`guides: ${slug} has no audience with a password`, notes.join('; '));
    return fail('not_configured', 503, 'off');
  }
  const shared = notes.filter((n) => n.includes('the same as'));
  if (shared.length) deps.log('guides: two audiences share a password', shared.join('; '));
  if (!/^application\/x-www-form-urlencoded\b/i.test(req.headers.get('content-type') ?? '')) return fail('unsupported_media_type', 415, 'error');
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return fail('payload_too_large', 413, 'error');
  const raw = await readLimited(req, MAX_BODY_BYTES);
  if (raw === null) return fail('payload_too_large', 413, 'error');
  const form = new URLSearchParams(raw);
  const given = form.get('password') ?? '';
  if (!given.trim()) return fail('missing_password', 400, 'wrong');
  if (!(await deps.allow(limitKey(req.headers.get('cf-connecting-ip'))))) return fail('rate_limited', 429, 'wait', { 'retry-after': '60' });

  const audience = await matchPassword(given, candidates, pws);
  if (!audience) return fail('wrong_password', 401, 'wrong');
  const cookie = await issueCookie(pepper, audience, pws.get(audience)!, deps.now(), form.get('remember') === '1', !isLocal(url.hostname));
  const next = cleanNext(form.get('next') || refererQuery(req, url, home), slug);
  return asJson ? json({ ok: true, next }, 200, { 'set-cookie': cookie }) : redirect(next, 303, { 'set-cookie': cookie });
}

/**
 * The cookies Log Off clears on this guide: those of every audience that opens
 * it, and an old plain kus98_guides when the audience it names opens it too (or
 * says none). A cookie for guides of other audiences stays: logging off the
 * restaurant guide keeps the photography guide open.
 */
export function cookiesToClear(access: AccessFile, slug: string, header: string | null): string[] {
  const names = access.audiences.filter((a) => viewOf(access, slug, a.id) !== null).map((a) => cookieName(a.id));
  const old = guideCookies(header).find(([name]) => name === COOKIE);
  const oldAudience = old ? TOKEN.exec(old[1])?.[1] : undefined;
  if (!oldAudience || viewOf(access, slug, oldAudience) !== null) names.unshift(COOKIE);
  return names;
}

function logOff(req: Request, url: URL, slug: string, deps: GuidesDeps): Response {
  const home = `${PREFIX}/${slug}`;
  const asJson = wantsJson(req);
  if (req.method !== 'POST') return asJson ? json({ error: 'method_not_allowed' }, 405, { allow: 'POST' }) : redirect(home, 303);
  if (!sameOrigin(req, url.origin)) {
    return asJson ? json({ error: 'origin_not_allowed' }, 403) : note(403, 'This page could not log off. Reload it and try again.', '无法注销。请刷新网页后再试。');
  }
  const secure = isLocal(url.hostname) ? [] : ['Secure'];
  const res = asJson ? json({ ok: true }, 200) : redirect(home, 303);
  for (const name of cookiesToClear(deps.access, slug, req.headers.get('cookie')))
    res.headers.append('set-cookie', [`${name}=`, `Path=${PREFIX}`, 'Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT', 'HttpOnly', 'SameSite=Lax', ...secure].join('; '));
  return res;
}

// ---- Responses ----

/** A built page (a view or the log-on page) as this guide's own address: private, never cached, no ETag. */
async function page(req: Request, url: URL, file: string, state: LogonState, status: number, deps: GuidesDeps): Promise<Response> {
  const head = req.method === 'HEAD';
  const res = await deps.assets(new Request(new URL(file, url), { method: head ? 'HEAD' : 'GET' }));
  if (!res.ok) {
    deps.log('guides: page missing', file, res.status);
    return unavailable();
  }
  const headers = { ...PAGE, 'content-type': res.headers.get('content-type') ?? HTML };
  if (head) return new Response(null, { status, headers });
  if (state === 'none') return new Response(res.body, { status, headers });
  return new Response((await res.text()).replace('data-gd-state="none"', `data-gd-state="${state}"`), { status, headers });
}

/** A picture or base map: private, revalidated every time (its ETag kept), so a logged-off browser gets 403. */
async function asset(req: Request, url: URL, deps: GuidesDeps): Promise<Response> {
  const fwd = new Headers();
  for (const h of ['if-none-match', 'if-modified-since', 'range', 'if-range']) {
    const v = req.headers.get(h);
    if (v) fwd.set(h, v);
  }
  const res = await deps.assets(new Request(new URL(url.pathname, url), { method: req.method, headers: fwd }));
  const h = new Headers(res.headers);
  h.set('cache-control', 'private, no-cache');
  h.set('x-robots-tag', ROBOTS);
  h.set('x-content-type-options', 'nosniff');
  h.set('cross-origin-resource-policy', 'same-origin');
  h.delete('access-control-allow-origin');
  h.delete('set-cookie');
  const empty = req.method === 'HEAD' || res.status === 204 || res.status === 205 || res.status === 304;
  return new Response(empty ? null : res.body, { status: res.status, headers: h });
}

// ---- Street-level tiles ----

/** A guide's tile bounds from access.json, [west, south, east, north] in degrees, when they make sense. */
export function tileBounds(access: AccessFile, slug: string): [number, number, number, number] | null {
  const tiles = access.tiles;
  if (!tiles || !Object.hasOwn(tiles, slug)) return null;
  const b = tiles[slug];
  if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [w, s, e, n] = b;
  if (!(w < e && s < n) || Math.abs(w) > 180 || Math.abs(e) > 180 || Math.abs(s) > 85.06 || Math.abs(n) > 85.06) return null;
  return [w, s, e, n];
}

/** The tile numbers a box covers at zoom z, both ends included (Web-Mercator, 256-px tiles). */
export function tileRange(b: [number, number, number, number], z: number): { x0: number; x1: number; y0: number; y1: number } {
  const n = Math.pow(2, z);
  const lim = (v: number) => Math.min(n - 1, Math.max(0, Math.floor(v)));
  const tx = (lon: number) => lim(((lon + 180) / 360) * n);
  const ty = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return lim(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  return { x0: tx(b[0]), x1: tx(b[2]), y0: ty(b[3]), y1: ty(b[1]) };
}

/**
 * One tile of Plan IGN for a visitor who may open the guide: fetched from IGN
 * by the Worker (so IGN sees the Worker, never the visitor), kept at the edge
 * for 30 days, and answered privately. Only tiles inside the guide's declared
 * bounds and between TILE_Z.min and TILE_Z.max exist; anything else is 404.
 * An upstream failure is a bare 502, never IGN's own error page. Only an
 * edge-cache miss costs an IGN fetch, so only a miss spends the visitor's
 * tile budget (deps.allowTile); over it, a bare 429.
 */
async function tile(req: Request, url: URL, sub: string, slug: string, deps: GuidesDeps): Promise<Response> {
  const m = TILE_PATH.exec(sub);
  const box = tileBounds(deps.access, slug);
  if (!m || !box) return notFound(url, deps);
  const z = Number(m[1]), x = Number(m[2]), y = Number(m[3]);
  if (z < TILE_Z.min || z > TILE_Z.max) return notFound(url, deps);
  const r = tileRange(box, z);
  if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) return notFound(url, deps);

  const upstream = `${TILE_UPSTREAM}&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`;
  const key = new Request(upstream, { method: 'GET' });
  let hit: Response | undefined;
  try {
    hit = await deps.cache?.match(key);
  } catch (e) {
    deps.log('guides: tile cache match failed', (e as Error)?.message ?? String(e));
  }
  if (!hit) {
    if (!(await tileBudget(req, deps))) return new Response(null, { status: 429, headers: { ...PRIVATE, 'retry-after': '60' } });
    let up: Response;
    try {
      up = await deps.fetch(upstream, {
        method: 'GET',
        headers: { 'user-agent': TILE_UA, accept: 'image/png' },
        signal: AbortSignal.timeout(TILE_TIMEOUT_MS),
        // Only a good tile is kept for 30 days: an IGN 404 or 5xx is never held (cacheTtl would cover those too).
        cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': TILE_EDGE_S, '400-599': 0 } },
      });
    } catch (e) {
      deps.log('guides: tile upstream failed', z, (e as Error)?.message ?? String(e));
      return badGateway();
    }
    const type = (up.headers.get('content-type') ?? '').toLowerCase();
    if (!up.ok || !type.startsWith('image/png') || Number(up.headers.get('content-length') ?? 0) > TILE_MAX_BYTES) {
      deps.log('guides: tile upstream', up.status, type || '(no type)');
      void up.body?.cancel().catch(() => {}); // not awaited: a tee'd stream's cancel can wait on its twin
      return badGateway();
    }
    let bytes: ArrayBuffer;
    try {
      bytes = await up.arrayBuffer(); // the 8 s timeout covers the body too
    } catch (e) {
      deps.log('guides: tile upstream body failed', z, (e as Error)?.message ?? String(e));
      return badGateway();
    }
    // A tile is a whole PNG: the right size, and the PNG signature (an error page with an image type is not cached for 30 days).
    if (bytes.byteLength > TILE_MAX_BYTES || !isPng(bytes)) {
      deps.log('guides: tile upstream is not a tile', bytes.byteLength);
      return badGateway();
    }
    // Only the bytes are kept: none of IGN's headers reach the visitor, and the edge copy carries its own lifetime.
    hit = new Response(bytes, { status: 200, headers: { 'content-type': 'image/png', 'cache-control': `public, max-age=${TILE_EDGE_S}` } });
    try {
      await deps.cache?.put(key, hit.clone());
    } catch (e) {
      deps.log('guides: tile cache put failed', (e as Error)?.message ?? String(e));
    }
  }
  const headers = {
    'content-type': 'image/png',
    'cache-control': `private, max-age=${TILE_BROWSER_S}`,
    'x-robots-tag': ROBOTS,
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
  };
  if (req.method === 'HEAD') {
    void hit.body?.cancel().catch(() => {});
    return new Response(null, { status: 200, headers });
  }
  return new Response(hit.body, { status: 200, headers });
}

const badGateway = () => new Response(null, { status: 502, headers: PRIVATE });

/** May this visitor have one more tile fetched from IGN? No limiter, or one that fails, says yes (a map is not worth closing over it). */
async function tileBudget(req: Request, deps: GuidesDeps): Promise<boolean> {
  if (!deps.allowTile) return true;
  try {
    return await deps.allowTile(limitKey(req.headers.get('cf-connecting-ip')));
  } catch (e) {
    deps.log('guides: tile limiter failed', (e as Error)?.message ?? String(e));
    return true;
  }
}

/** Does this start with the PNG signature? */
function isPng(b: ArrayBuffer): boolean {
  const s = new Uint8Array(b, 0, Math.min(8, b.byteLength));
  return s.length === 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => s[i] === v);
}

/** The site's own 404 page, with status 404 (ASSETS serves /404 itself as a 200). */
async function notFound(url: URL, deps: GuidesDeps): Promise<Response> {
  const res = await deps.assets(new Request(new URL('/404', url)));
  if (!res.ok && res.status !== 404) return note(404, 'This page does not exist.', '这个网页不存在。');
  return new Response(res.body, { status: 404, headers: { ...PAGE, 'content-type': res.headers.get('content-type') ?? HTML } });
}

/** A minimal neutral page: no guide's name, title or content. */
function note(status: number, en: string, zh: string): Response {
  const body =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<meta name="robots" content="noindex, nofollow"><title>Field Guide</title></head><body><p>${en}</p><p lang="zh-Hans">${zh}</p></body></html>`;
  return new Response(body, { status, headers: { ...PAGE, 'content-type': HTML } });
}
const unavailable = () => note(503, 'Field Guide is not available right now. Try again later.', '导览暂时无法使用。请稍后再试。');
const logOnFirst = (slug: string) => note(403, `Log on to <a href="${PREFIX}/${slug}">this guide</a> first.`, `请先登录<a href="${PREFIX}/${slug}">这份导览</a>。`);

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...PRIVATE, 'content-type': 'application/json; charset=utf-8', ...extra } });
const redirect = (location: string, status: number, extra: Record<string, string> = {}) =>
  new Response(null, { status, headers: { ...PRIVATE, location, ...extra } });
function withHeaders(res: Response, extra: Record<string, string>): Response {
  for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
  return res;
}

/** localhost and friends: wrangler dev on http, so no Secure flag and no https redirect. */
const isLocal = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');

/** The request body as text, or null once it passes `max` bytes (it stops reading there). From drawing.ts. */
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
      await reader.cancel().catch(() => {});
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
