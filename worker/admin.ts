// Admin mode: the hidden log-on and everything only the site's owner may do.
// /v1/admin/* runs this code (wrangler.jsonc run_worker_first).
//
// Log-on (POST /v1/admin/login): the password (ADMIN_PASSWORD, 16+
// characters) AND a six-digit authenticator code (ADMIN_TOTP_SECRET), both
// checked here, never in the browser. Admin is off unless both are set. A
// code works once. Wrong tries are counted per visitor and in all (the Guard),
// and every failure says the same thing.
//
// The session lives in the Guard; the cookie (__Host-kus98_admin, HttpOnly,
// Secure, SameSite=Lax, 12 hours) is only its random id. A second cookie,
// kus98_admin_ui=1, holds nothing secret: it tells the desktop to load the
// admin scripts, which then ask GET /v1/admin/me.
//
// Every other call needs the session, Sec-Fetch-Site: same-origin (so
// another site can't make the browser call it), and, for changes, the same
// Origin and JSON. The browser never names an email recipient: the Worker
// looks the address up in Notion (Contacts) and sends only with consent.
// Written with its dependencies passed in, so worker/admin.test.mts runs it in Node.
import type { AccessFile, ItemRecord, ItemsFile, TierId } from '../src/lib/guides/types';
import { checkGuide } from '../src/lib/guides/check.ts';
import { findMatches, type Known } from '../src/lib/guides/dedupe.ts';
import { escapeHtml, isEmail, unsafe } from './contact.ts';
import { filesForUrl, listFiles, MAX_TEXT, newProject, readFile, recentChanges, saveFile, uploadPicture, type Out } from './admin-files.ts';
import type { GuardApi } from './guard.ts';
import { commitOnMain, type Change, type GitHub } from './github.ts';
import { P, R, type Notion, type NotionPage } from './notion.ts';
import { ENTRY_KEYS, forbiddenWord, guideDir, imgPath, nextId, readGuide, renameRefs, stringify, type GuideFileChange, type PublishReport } from './publish.ts';
import { C, guideIs, isStatus, logProps, readSuggestion, S, STATUSES, type LogEntry, type Status, type SuggestionRow } from './suggestions.ts';
import { checkTotp, MIN_SECRET_BYTES, base32Decode } from './totp.ts';

export const ADMIN_PREFIX = '/v1/admin';
export const SESSION_S = 12 * 3600;
export const MIN_PASSWORD = 16;
export const COOKIE = '__Host-kus98_admin';
/** On http://localhost a __Host- cookie (which must be Secure) won't stick: a plain name there. */
export const COOKIE_LOCAL = 'kus98_admin';
export const UI_COOKIE = 'kus98_admin_ui';
/** Wrong log-ons: per visitor an hour, and in all an hour. */
export const FAILS = { visitor: 10, all: 200 };
/** Emails to submitters, an hour. */
export const EMAILS_PER_HOUR = 10;
const MAX_BODY = 64 * 1024;
/** A picture (8 MB at most) sent as base64, with room to spare. */
const MAX_UPLOAD = 12 * 1024 * 1024;
const ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export interface OutMail { to: string; from: { email: string; name: string }; replyTo: string; subject: string; text: string; html: string }

export interface AdminDeps {
  password: () => string | undefined;
  totpSecret: () => string | undefined;
  guard: GuardApi;
  /** The ADMIN_LIMIT binding (per location, per minute). */
  allow: (key: string) => Promise<boolean>;
  visitor: (ip: string | null) => string;
  access: AccessFile;
  notion: Notion | null;
  db: { suggestions: string; contacts: string; log: string };
  /** Email to anyone (MAIL_OUT, sender fixed to noreply@kuschonink.com); null when not set up. */
  mail: ((m: OutMail) => Promise<unknown>) | null;
  /** Start the routine now (its API trigger); null when not set up. */
  fireRoutine: ((text: string) => Promise<{ url?: string }>) | null;
  /** Run the publisher now; null without Notion and GitHub. */
  publish: (() => Promise<PublishReport | null>) | null;
  gh: GitHub | null;
  /** The commit the running site was built from (12 characters), or null: Changes' "Live?". */
  liveBuild?: () => Promise<string | null>;
  /** The repository's web address, for "Open on GitHub". */
  repoUrl?: string;
  now: () => number;
  log: (...args: unknown[]) => void;
}

const PRIVATE = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff' };
const json = (body: unknown, status = 200, extra: HeadersInit = {}) => {
  const h = new Headers({ ...PRIVATE, 'content-type': 'application/json; charset=utf-8' });
  for (const [k, v] of new Headers(extra)) h.append(k, v);
  return new Response(JSON.stringify(body), { status, headers: h });
};
const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);

const isLocal = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
const enc = new TextEncoder();
const sha256 = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));

/** Same bytes, compared in full whatever they are. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const x = await sha256(a), y = await sha256(b);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

function cookieValue(header: string | null, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const c = part.trim();
    if (c.startsWith(`${name}=`)) return c.slice(name.length + 1);
  }
  return null;
}

/** Is this request from a logged-on admin? (The guide gate asks this too.) */
export async function adminSession(req: Request, guard: GuardApi): Promise<boolean> {
  const local = isLocal(new URL(req.url).hostname);
  const id = cookieValue(req.headers.get('cookie'), local ? COOKIE_LOCAL : COOKIE);
  return !!id && (await guard.sessionCheck(id)).ok;
}

function sessionCookies(url: URL, id: string | null): string[] {
  const local = isLocal(url.hostname);
  const name = local ? COOKIE_LOCAL : COOKIE;
  const secure = local ? [] : ['Secure'];
  const age = id ? [`Max-Age=${SESSION_S}`] : ['Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'];
  return [
    [`${name}=${id ?? ''}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', ...secure, ...age].join('; '),
    [`${UI_COOKIE}=${id ? '1' : ''}`, 'Path=/', 'SameSite=Lax', ...secure, ...age].join('; '),
  ];
}
const withCookies = (res: Response, cookies: string[]) => {
  for (const c of cookies) res.headers.append('set-cookie', c);
  return res;
};

/** Is admin set up: a long enough password and a real authenticator secret? */
function configured(deps: AdminDeps): { password: string; secret: string } | null {
  const password = deps.password()?.trim() ?? '';
  const secret = deps.totpSecret()?.trim() ?? '';
  const key = base32Decode(secret);
  if ([...password].length < MIN_PASSWORD || !key || key.length < MIN_SECRET_BYTES) return null;
  return { password, secret };
}

async function readBody(req: Request, max = MAX_BODY): Promise<Record<string, unknown> | null> {
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) return null;
  if (Number(req.headers.get('content-length') ?? 0) > max) return null;
  const text = await req.text();
  if (text.length > max) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export async function handleAdmin(req: Request, deps: AdminDeps): Promise<Response> {
  try {
    return await route(req, deps);
  } catch (e) {
    deps.log('admin: failed', (e as Error).message);
    return fail('failed', 500, { detail: (e as Error).message.slice(0, 200) });
  }
}

async function route(req: Request, deps: AdminDeps): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.slice(ADMIN_PREFIX.length) || '/';
  const ip = req.headers.get('cf-connecting-ip');
  const who = deps.visitor(ip).replace(/^guides:/, '');
  // Only this site, in a browser: another site can't make a logged-on browser call this.
  const site = req.headers.get('sec-fetch-site');
  const origin = req.headers.get('origin');
  if (site !== 'same-origin') return fail('origin_not_allowed', 403);
  if (req.method !== 'GET' && origin !== url.origin) return fail('origin_not_allowed', 403);
  if (!(await deps.allow(`admin:${who}`))) return fail('rate_limited', 429);

  if (path === '/login') return logOn(req, url, who, deps);

  const local = isLocal(url.hostname);
  const sid = cookieValue(req.headers.get('cookie'), local ? COOKIE_LOCAL : COOKIE);
  const session = sid ? await deps.guard.sessionCheck(sid) : { ok: false, exp: 0 };
  if (path === '/me' && req.method === 'GET') {
    if (!session.ok) return withCookies(json({ admin: false }, 401), sessionCookies(url, null));
    // Each guide's audiences, least privileged first (for "Show to"): sent to the admin only, never in a public script.
    const guides = Object.fromEntries(Object.entries(deps.access.guides).filter(([k]) => !k.startsWith('_')));
    const audiences = Object.fromEntries(deps.access.audiences.map((a) => [a.id, { en: a.label || a.id, zh: a.labelZh || a.label || a.id }]));
    return json({ admin: true, exp: session.exp, notion: !!deps.notion, mail: !!deps.mail, routine: !!deps.fireRoutine, publish: !!deps.publish, github: !!deps.gh, repo: deps.repoUrl ?? '', guides, audiences });
  }
  if (!session.ok) return withCookies(fail('log_on_first', 401), sessionCookies(url, null));
  if (path === '/logout' && req.method === 'POST') {
    await deps.guard.sessionEnd(sid!);
    return withCookies(json({ ok: true }), sessionCookies(url, null));
  }
  if (path === '/logout-all' && req.method === 'POST') {
    await deps.guard.sessionEndAll();
    await addLog(deps, { run: 'Log off everywhere', trigger: 'manual', actor: 'admin', outcome: 'OK' });
    return withCookies(json({ ok: true }), sessionCookies(url, null));
  }

  // The queue.
  let m: RegExpExecArray | null;
  if (path === '/suggestions' && req.method === 'GET') return list(url, deps);
  if ((m = /^\/suggestions\/([0-9a-f-]{32,36})$/i.exec(path)) && req.method === 'GET') return detail(m[1], deps);
  if ((m = /^\/suggestions\/([0-9a-f-]{32,36})$/i.exec(path)) && req.method === 'POST') return update(m[1], req, deps);
  if ((m = /^\/suggestions\/([0-9a-f-]{32,36})\/matches$/i.exec(path)) && req.method === 'GET') return matches(m[1], deps);
  if ((m = /^\/suggestions\/([0-9a-f-]{32,36})\/email$/i.exec(path)) && req.method === 'POST') return email(m[1], req, deps);
  if (path === '/log' && req.method === 'GET') return logList(deps);
  if (path === '/routine' && req.method === 'POST') return runRoutine(deps, 'manual');
  if (path === '/publish' && req.method === 'POST') {
    if (!deps.publish) return fail('not_configured', 503);
    return json({ ok: true, report: await deps.publish() });
  }
  if ((m = /^\/items\/([a-z0-9-]+)\/([A-C]\d+)$/.exec(path)) && req.method === 'POST') return editItem(m[1], m[2], req, deps);
  if ((m = /^\/items\/([a-z0-9-]+)\/([A-C]\d+)$/.exec(path)) && req.method === 'GET') return getItem(m[1], m[2], deps);
  if (/^\/(?:files(?:\/for)?|pictures|projects|changes)$/.test(path)) return siteFiles(path, req, url, deps);
  return fail('not_found', 404);
}

// ---- Editing the site (worker/admin-files.ts) ----

async function siteFiles(path: string, req: Request, url: URL, deps: AdminDeps): Promise<Response> {
  if (!deps.gh) return fail('not_configured', 503, { what: 'github' });
  const d = { gh: deps.gh, access: deps.access, liveBuild: deps.liveBuild };
  const send = (o: Out) => json(o.body, o.status);
  const body = async (max: number) => readBody(req, max);
  const m = req.method;
  if (path === '/files' && m === 'GET') return send(url.searchParams.has('path') ? await readFile(url.searchParams.get('path') ?? '', d) : await listFiles(d));
  if (path === '/files/for' && m === 'GET') return send(await filesForUrl(url.searchParams.get('url') ?? '/', d));
  if (path === '/changes' && m === 'GET') return send(await recentChanges(d));
  if (path === '/files' && m === 'PUT') {
    const b = await body(MAX_TEXT + 64 * 1024);
    return b ? send(await saveFile(b, d)) : fail('invalid_request', 400);
  }
  if ((path === '/pictures' || path === '/projects') && m === 'POST') {
    const b = await body(MAX_UPLOAD);
    if (!b) return fail('invalid_request', 400);
    return send(path === '/pictures' ? await uploadPicture(b, d) : await newProject(b, d));
  }
  return fail('method_not_allowed', 405);
}

// ---- Log on ----

async function logOn(req: Request, url: URL, who: string, deps: AdminDeps): Promise<Response> {
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  const cfg = configured(deps);
  if (!cfg) {
    deps.log('admin: ADMIN_PASSWORD (16+ characters) and ADMIN_TOTP_SECRET must both be set');
    return fail('not_configured', 503);
  }
  // Locked out after too many wrong tries: from this visitor, or from everyone (a spread-out attack).
  if ((await deps.guard.held(`admin:locked:${who}`)) === 'locked') return fail('wait', 429);
  if ((await deps.guard.held('admin:locked:all')) === 'locked') return fail('wait', 429);
  const body = await readBody(req);
  const password = typeof body?.password === 'string' ? body.password : '';
  const code = typeof body?.code === 'string' ? body.code : '';
  const wrong = async () => {
    const a = await deps.guard.hit(`admin:fail:${who}`, FAILS.visitor, 3600);
    const b = await deps.guard.hit('admin:fail:all', FAILS.all, 3600);
    // The tenth wrong try locks this visitor out for an hour; many from everywhere lock everyone.
    const lockMe = a.count >= FAILS.visitor;
    if (lockMe) await deps.guard.settle(`admin:locked:${who}`, 'locked', 3600);
    if (!b.ok) {
      // Wrong tries from everywhere at once: an attack spread over many addresses. Close for an hour.
      await deps.guard.settle('admin:locked:all', 'locked', 3600);
      deps.log('admin: many wrong log-ons from many places: closed for an hour');
    }
    return fail(lockMe || !b.ok ? 'wait' : 'wrong', lockMe || !b.ok ? 429 : 401);
  };
  if (!password || !code || password.length > 200) return wrong();
  const passOk = await sameSecret(password.trim(), cfg.password);
  const step = await checkTotp(cfg.secret, code, deps.now());
  if (!passOk || step === null) return wrong();
  // A code works once (someone who saw it can't use it again).
  if (!(await deps.guard.claim(`admin:totp:${step}`, 120)).fresh) return wrong();
  const s = await deps.guard.sessionCreate(SESSION_S);
  await addLog(deps, { run: 'Log on', trigger: 'manual', actor: 'admin', outcome: 'OK' });
  return withCookies(json({ ok: true, exp: s.exp }), sessionCookies(url, s.id));
}

// ---- The queue ----

const needNotion = (deps: AdminDeps) => (deps.notion ? null : fail('not_configured', 503, { what: 'notion' }));

async function list(url: URL, deps: AdminDeps): Promise<Response> {
  const no = needNotion(deps);
  if (no) return no;
  const status = url.searchParams.get('status') ?? '';
  const guide = url.searchParams.get('guide') ?? '';
  const statuses = status.split(',').filter((s) => (STATUSES as readonly string[]).includes(s)) as Status[];
  const and: unknown[] = [];
  if (statuses.length) and.push({ or: statuses.map((s) => isStatus(s)) });
  if (guide) and.push(guideIs(deps.access, guide));
  const pages = await deps.notion!.queryAll(deps.db.suggestions, { ...(and.length ? { filter: { and } } : {}), sorts: [{ timestamp: 'created_time', direction: 'descending' }] }, 300);
  return json({ rows: pages.map((p) => readSuggestion(p, deps.access)) });
}

async function contactOf(deps: AdminDeps, row: SuggestionRow): Promise<{ submitter: string; email: string; mayContact: boolean } | null> {
  if (!row.submission) return null;
  const r = await deps.notion!.query(deps.db.contacts, { filter: { property: C.submission, rich_text: { equals: row.submission } }, page_size: 1 });
  const p = r.results[0];
  return p ? { submitter: R.text(p, C.submitter), email: R.email(p, C.email), mayContact: R.checkbox(p, C.mayContact) } : null;
}

async function page(deps: AdminDeps, id: string): Promise<NotionPage | null> {
  if (!ID.test(id)) return null;
  try {
    const p = await deps.notion!.getPage(id);
    // Only a Suggestions page (not a contact or a log entry, which the integration can also read).
    const parent = (p as unknown as { parent?: { data_source_id?: string } }).parent?.data_source_id ?? '';
    return parent.replace(/-/g, '') === deps.db.suggestions.replace(/-/g, '') ? p : null;
  } catch {
    return null;
  }
}

async function detail(id: string, deps: AdminDeps): Promise<Response> {
  const no = needNotion(deps);
  if (no) return no;
  const p = await page(deps, id);
  if (!p) return fail('not_found', 404);
  const row = readSuggestion(p, deps.access);
  return json({ row, contact: await contactOf(deps, row) });
}

/** What the admin may change in a suggestion (Notion's names in worker/suggestions.ts). */
const TEXT_FIELDS: Record<string, string> = {
  name: S.name, show: S.show, artists: S.artists, hours: S.hours, address: S.address, description: S.description,
  pictureCredit: S.pictureCredit, creditAs: S.creditAs, notes: S.notes, links: S.links,
};
const LIMITS: Record<string, number> = { name: 160, show: 200, artists: 300, hours: 300, address: 200, description: 2000, pictureCredit: 160, creditAs: 80, notes: 2000, links: 2600 };

async function update(id: string, req: Request, deps: AdminDeps): Promise<Response> {
  const no = needNotion(deps);
  if (no) return no;
  const body = await readBody(req);
  if (!body) return fail('invalid_request', 400);
  const p = await page(deps, id);
  if (!p) return fail('not_found', 404);
  const before = readSuggestion(p, deps.access);
  const props: Record<string, Record<string, unknown>> = {};
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !['NEW', 'ASKED', 'APPROVED', 'REFUSED', 'SPAM', 'NEEDS CHECK'].includes(body.status)) return fail('invalid_field', 400, { field: 'status' });
    props[S.status] = P.select(body.status);
  }
  if (body.tier !== undefined) {
    if (!['A', 'B', 'C'].includes(String(body.tier))) return fail('invalid_field', 400, { field: 'tier' });
    props[S.tier] = P.select(String(body.tier));
  }
  if (body.showTo !== undefined) {
    const v = String(body.showTo);
    if (v !== 'Everyone' && !(deps.access.guides[before.guide] ?? []).includes(v)) return fail('invalid_field', 400, { field: 'showTo' });
    props[S.showTo] = P.select(v);
  }
  for (const [k, prop] of Object.entries(TEXT_FIELDS)) {
    if (body[k] === undefined) continue;
    const v = typeof body[k] === 'string' ? (body[k] as string).trim() : null;
    if (v === null || v.length > LIMITS[k] || unsafe(v) || (k === 'name' && v.length < 2)) return fail('invalid_field', 400, { field: k });
    props[prop] = k === 'name' ? P.title(v) : P.text(v);
  }
  if (body.website !== undefined) {
    const v = String(body.website).trim();
    if (v && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(v)) return fail('invalid_field', 400, { field: 'website' });
    props[S.website] = P.url(v);
  }
  for (const k of ['start', 'end'] as const) {
    if (body[k] !== undefined && body[k] !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(body[k]))) return fail('invalid_field', 400, { field: k });
  }
  if (body.start !== undefined || body.end !== undefined) {
    const start = String(body.start ?? before.start), end = String(body.end ?? before.end);
    if (start && end && start > end) return fail('invalid_field', 400, { field: 'end' });
    props[S.dates] = P.date(start || end || null, start && end && end !== start ? end : null);
  }
  if (!Object.keys(props).length) return fail('nothing_to_change', 400);
  const after = readSuggestion(await deps.notion!.updatePage(before.id, props), deps.access);
  const changed = Object.keys(body).filter((k) => k !== 'status').join(', ');
  await addLog(deps, { run: `${after.status !== before.status ? after.status : 'Edit'} ${before.reference}`, trigger: 'manual', actor: 'admin', outcome: 'OK', pages: `${before.reference} ${before.name}`, details: [after.status !== before.status ? `${before.status} → ${after.status}` : '', changed ? `changed: ${changed}` : ''].filter(Boolean).join('; ') });
  // Approved here: the routine runs now (at most once every ten minutes), not at the next hour.
  let routine: unknown = null;
  if (after.status === 'APPROVED' && before.status !== 'APPROVED' && deps.fireRoutine) routine = await fire(deps, 'approved', `approved ${before.reference}`);
  return json({ row: after, routine });
}

async function matches(id: string, deps: AdminDeps): Promise<Response> {
  const no = needNotion(deps);
  if (no) return no;
  const p = await page(deps, id);
  if (!p) return fail('not_found', 404);
  const row = readSuggestion(p, deps.access);
  const known: Known[] = [];
  if (deps.gh && Object.hasOwn(deps.access.guides, row.guide)) {
    const raw = await readGuide((path) => deps.gh!.file(path), row.guide);
    for (const i of ((raw.items as ItemsFile | undefined)?.items ?? [])) known.push({ id: i.id, kind: 'item', name: i.name, show: i.subtitle, artists: i.by, address: i.address, website: i.sourceUrl, links: i.links, coordinates: i.coordinates, start: i.start, end: i.end });
    for (const l of ((raw.listings as { records?: { id: string; name: string; url?: string; coordinates: [number, number]; start?: string; end?: string }[] } | undefined)?.records ?? [])) known.push({ id: l.id, kind: 'listing', name: l.name, website: l.url, coordinates: l.coordinates, start: l.start, end: l.end });
  }
  const others = (await deps.notion!.queryAll(deps.db.suggestions, { filter: guideIs(deps.access, row.guide) }, 500)).map((p) => readSuggestion(p, deps.access)).filter((o) => o.id !== row.id && o.status !== 'SPAM');
  for (const o of others) known.push({ id: `${o.reference} (${o.status})`, kind: 'submission', name: o.name, show: o.show, artists: o.artists, address: o.address, website: o.website, links: o.links, start: o.start, end: o.end });
  return json({ matches: findMatches({ name: row.name, show: row.show, artists: row.artists, address: row.address, website: row.website, links: row.links, start: row.start, end: row.end }, known).slice(0, 10), guideChecked: !!deps.gh });
}

// ---- Email to a submitter ----

const SENDER = { email: 'noreply@kuschonink.com', name: 'Field Guide · kuschonink.com' };
const REPLY_TO = 'hi@kuschonink.com';

async function email(id: string, req: Request, deps: AdminDeps): Promise<Response> {
  const no = needNotion(deps);
  if (no) return no;
  if (!deps.mail) return fail('not_configured', 503, { what: 'mail' });
  const body = await readBody(req);
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const text = typeof body?.text === 'string' ? body.text.replace(/\r\n?/g, '\n').trim() : '';
  const key = typeof body?.key === 'string' ? body.key : '';
  const asked = body?.asked === true;
  if (!subject || subject.length > 150 || /[\r\n]/.test(subject) || unsafe(subject)) return fail('invalid_field', 400, { field: 'subject' });
  if (!text || text.length > 5000 || unsafe(text)) return fail('invalid_field', 400, { field: 'text' });
  if (!/^[0-9a-f-]{36}$/i.test(key)) return fail('invalid_field', 400, { field: 'key' });
  const p = await page(deps, id);
  if (!p) return fail('not_found', 404);
  const row = readSuggestion(p, deps.access);
  const contact = await contactOf(deps, row);
  // Only with an address and their consent; the address never comes from the browser.
  if (!contact?.email || !isEmail(contact.email)) return fail('no_email', 409);
  if (!contact.mayContact) return fail('no_consent', 409);
  // One email per key, ever; an unclear result is never sent again.
  const held = await deps.guard.claim(`admin:email:${key}`, 30 * 86400);
  if (!held.fresh) return json({ ok: held.value === 'sent', repeat: true, status: held.value });
  if (!(await deps.guard.hit('admin:emails', EMAILS_PER_HOUR, 3600)).ok) {
    await deps.guard.release(`admin:email:${key}`);
    return fail('rate_limited', 429);
  }
  const footer = row.lang === 'zh'
    ? `\n\n——\n你在 kuschonink.com 的导览里推荐了“${row.name}”（编号 ${row.reference}），并同意我们就此联系你。直接回复这封邮件即可。`
    : `\n\n--\nYou suggested "${row.name}" (${row.reference}) in a Field Guide on kuschonink.com and said we could email you about it. Just reply to this email.`;
  const all = text + footer;
  try {
    await deps.mail({
      to: contact.email,
      from: SENDER,
      replyTo: REPLY_TO,
      subject,
      text: all,
      html: `<div style="font:15px/1.5 Georgia,serif;white-space:pre-wrap">${escapeHtml(all)}</div>`,
    });
  } catch (e) {
    const code = (e as { code?: string }).code;
    // A definite refusal may be tried again; anything unclear stays "unclear" (never sent twice).
    if (code && /^E_/.test(code)) await deps.guard.release(`admin:email:${key}`);
    else await deps.guard.settle(`admin:email:${key}`, 'unclear', 30 * 86400);
    deps.log('admin: email failed', code ?? (e as Error).message);
    return fail('delivery_failed', 502, { detail: code ?? 'unclear' });
  }
  await deps.guard.settle(`admin:email:${key}`, 'sent', 30 * 86400);
  if (asked && !['APPROVED', 'PROCESSING', 'READY', 'PUBLISHING', 'PUBLISHED'].includes(row.status)) await deps.notion!.updatePage(row.id, { [S.status]: P.select('ASKED') });
  await addLog(deps, { run: `Email ${row.reference}`, trigger: 'manual', actor: 'admin', outcome: 'OK', pages: `${row.reference} ${row.name}`, details: subject });
  return json({ ok: true });
}

// ---- The routine, the log ----

async function fire(deps: AdminDeps, trigger: 'approved' | 'manual', why: string): Promise<{ fired: boolean; reason?: string; url?: string }> {
  if (!deps.fireRoutine) return { fired: false, reason: 'not_configured' };
  // At most once every ten minutes: one run handles everything approved by then.
  const gate = await deps.guard.claim('routine:fire', 600);
  if (!gate.fresh) return { fired: false, reason: 'recently' };
  try {
    const r = await deps.fireRoutine(`${trigger}: ${why}`);
    await addLog(deps, { run: `Routine started (${trigger})`, trigger, actor: 'admin', outcome: 'OK', session: r.url, details: why });
    return { fired: true, url: r.url };
  } catch (e) {
    // Not retried: a lost reply may still have started a run, and runs mustn't double up.
    deps.log('admin: routine fire failed', (e as Error).message);
    return { fired: false, reason: 'failed' };
  }
}

async function runRoutine(deps: AdminDeps, trigger: 'manual'): Promise<Response> {
  if (!deps.fireRoutine) return fail('not_configured', 503, { what: 'routine' });
  return json(await fire(deps, trigger, 'Run Now'));
}

async function logList(deps: AdminDeps): Promise<Response> {
  const no = needNotion(deps);
  if (no) return no;
  const r = await deps.notion!.query(deps.db.log, { sorts: [{ timestamp: 'created_time', direction: 'descending' }], page_size: 50 });
  return json({
    entries: r.results.map((p) => ({ run: R.title(p, 'Run'), when: R.date(p, 'When').start || p.created_time, trigger: R.select(p, 'Trigger'), actor: R.select(p, 'Actor'), outcome: R.select(p, 'Outcome'), pages: R.text(p, 'Pages'), commit: R.url(p, 'Commit'), session: R.url(p, 'Session'), details: R.text(p, 'Details') })),
  });
}

async function addLog(deps: AdminDeps, e: LogEntry) {
  if (!deps.notion) return;
  try {
    await deps.notion.createPage(deps.db.log, logProps(e, new Date(deps.now())));
  } catch (x) {
    deps.log('admin: could not write the log', (x as Error).message);
  }
}

// ---- Editing a published entry (Edit… in the guide) ----

/** An entry as items.json on main has it (the editor's starting point). */
async function getItem(slug: string, id: string, deps: AdminDeps): Promise<Response> {
  if (!deps.gh) return fail('not_configured', 503, { what: 'github' });
  if (!Object.hasOwn(deps.access.guides, slug)) return fail('not_found', 404);
  const at = await deps.gh.file(`${guideDir(slug)}/items.json`);
  const item = at ? (JSON.parse(at.text) as ItemsFile).items.find((i) => i.id === id) : undefined;
  return item ? json({ item }) : fail('not_found', 404);
}

async function editItem(slug: string, id: string, req: Request, deps: AdminDeps): Promise<Response> {
  if (!deps.gh) return fail('not_configured', 503, { what: 'github' });
  if (!Object.hasOwn(deps.access.guides, slug)) return fail('not_found', 404);
  const body = await readBody(req);
  const fields = body?.fields as Record<string, unknown> | undefined;
  if (!fields || typeof fields !== 'object') return fail('invalid_request', 400);
  const allowed = new Set([...ENTRY_KEYS, 'tier', 'audience', 'label']);
  const extra = Object.keys(fields).filter((k) => !allowed.has(k));
  if (extra.length) return fail('invalid_field', 400, { field: extra[0] });
  let problems: string[] = [];
  let newId = id;
  const done = await commitOnMain(deps.gh, '', async (read) => {
    problems = [];
    const raw = await readGuide(read, slug);
    const items = (raw.items as ItemsFile).items;
    const at = items.findIndex((i) => i.id === id);
    if (at < 0) {
      problems = [`there is no ${id} in ${slug}`];
      return null;
    }
    const old = items[at];
    const next = { ...old } as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(fields)) {
      if (v === null || v === '') delete next[k];
      else next[k] = k === 'image' ? { ...(old.image ?? {}), ...(v as object) } : v;
    }
    const item = next as unknown as ItemRecord;
    const changes: Change[] = [];
    const touched = new Set<GuideFileChange>();
    if (item.tier !== old.tier) {
      // A new tier is a new id (ids start with their tier letter, and are never reused).
      newId = nextId(items, item.tier as TierId);
      item.id = newId;
      for (const f of renameRefs(raw, old.id, newId)) touched.add(f);
      if (old.image) {
        const pic = await read(imgPath(slug, old.id));
        if (pic) changes.push({ path: imgPath(slug, newId), content: pic.bytes }, { path: imgPath(slug, old.id), content: null });
        item.image = { ...old.image, file: `${newId}.jpg` };
      }
    }
    items[at] = item;
    const word = forbiddenWord(item, deps.access, slug, ((raw.guide ?? {}) as { sensitive?: Record<string, string[]> }).sensitive ?? {});
    if (word) {
      problems = [`"${word.word}" may only be seen by ${word.only}: give the entry that audience, or take the word out.`];
      return null;
    }
    problems = checkGuide(raw, slug, deps.access).filter((p) => p.includes(` › ${item.id} `) || p.includes(` › ${item.id}:`) || p.endsWith(` › ${item.id}`));
    if (problems.length) return null;
    return {
      changes: [{ path: `${guideDir(slug)}/items.json`, content: stringify(raw.items) }, ...[...touched].map((f) => ({ path: `${guideDir(slug)}/${f}.json`, content: stringify(raw[f]) })), ...changes],
      result: null,
      message: `Field Guide: edit ${old.id}${newId !== old.id ? ` (now ${newId})` : ''} ${old.name} in ${slug}`,
    };
  });
  if (problems.length) return fail('check_failed', 422, { problems: problems.slice(0, 8) });
  if (!done) return json({ ok: true, unchanged: true });
  await addLog(deps, { run: `Edit ${id}`, trigger: 'manual', actor: 'admin', outcome: 'OK', commit: done.url, details: `${slug} ${id}${newId !== id ? ` → ${newId}` : ''}: ${Object.keys(fields).join(', ')}` });
  return json({ ok: true, id: newId, commit: done.url });
}
