// Field Guide (导览): a suggestion from inside a guide, POST /guides/<slug>/suggest
// (routed from worker/guides.ts, so the guide's cookie comes with it). Only
// someone logged on to that guide can send one.
//
// In order: same origin → logged on to this guide → size → the fields → the
// spam trap and fill time → rate limits (per visitor and in all) → Turnstile →
// "already sent?" (the wizard's id, and the same place from the same visitor,
// for ten minutes) → the picture, cleaned of EXIF/GPS → Notion (Suggestions,
// and Contacts for a name or email) → a note to the owner. If Notion fails, the
// whole suggestion goes to the owner by email instead, so nothing is lost.
// Written with its dependencies passed in, so worker/suggest.test.mts runs it in Node.
import { SENDER, escapeHtml, isEmail, unsafe, type EmailOut, type TurnstileResult } from './contact.ts';
import type { GuardApi } from './guard.ts';
import { cleanImage, EXT, fromBase64 } from './image.ts';
import { NotionError, R, type Notion } from './notion.ts';
import { contactProps, KINDS, newReference, S, suggestionProps, type Kind, type Stamp, type Suggestion } from './suggestions.ts';
import { fingerprint } from '../src/lib/guides/dedupe.ts';

export const TURNSTILE_ACTION = 'kuschonink-suggest';
/** The picture, after base64: 4 MB. The browser sends ≤1600 px JPEGs, far smaller. */
export const MAX_PICTURE_BYTES = 4 * 1024 * 1024;
export const MAX_SIDE = 4096;
const MAX_BODY_BYTES = 6 * 1024 * 1024;
/** A person can't go through five steps faster than this. */
const MIN_FILL_MS = 3000;
const HOLD_S = 600;
export const LIMITS = { perVisitorHour: 10, allHour: 60 };

const ONE_LINE = { name: 160, show: 200, artists: 300, hours: 300, address: 200, pictureCredit: 160, submitter: 120, creditAs: 80 } as const;
const MAX_DESCRIPTION = 1000;
const MAX_LINKS = 5;
const MAX_URL = 500;

export interface SuggestDeps {
  /** The guide audience the request's cookie opens for this guide, or null (worker/guides.ts). */
  audienceFor: (req: Request, slug: string) => Promise<string | null>;
  guard: GuardApi;
  /** Null when NOTION_TOKEN isn't set: suggestions then go to the owner by email. */
  notion: Notion | null;
  db: { suggestions: string; contacts: string };
  turnstile: { secret: string | undefined; hostnames: Set<string>; verify: (secret: string, token: string, ip: string | null) => Promise<TurnstileResult> };
  /** Email to the owner's own inbox (the EMAIL binding). */
  notify: (mail: EmailOut) => Promise<unknown>;
  /** The SUGGEST_LIMIT binding (per location, per minute). */
  allow: (key: string) => Promise<boolean>;
  /** "guides:1.2.3.4" or an IPv6 /64, as worker/guides.ts limitKey() makes it. */
  visitor: (ip: string | null) => string;
  now: () => number;
  log: (...args: unknown[]) => void;
}

const PRIVATE = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff' };
const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...PRIVATE, 'content-type': 'application/json; charset=utf-8', ...extra } });
const fail = (error: string, status: number, field?: string) => json(field ? { error, field } : { error }, status);

/** "2026-11-08" and a real day; "" is allowed (not known). */
export function isDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** An http(s) address with a real host and no user:password, tidied; null when it isn't one. */
export function cleanUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s || s.length > MAX_URL) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return null;
  return u.toString();
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const oneLine = (s: string) => !/[\r\n]/.test(s);
const hasHtml = (s: string) => /<\s*[a-z!/?]/i.test(s);

export type Checked = { ok: true; s: Suggestion; picture: string; id: string; token: string; trap: string; elapsed: number } | { ok: false; error: string; field?: string };

/** The wizard's JSON as a Suggestion, or the first thing wrong with it. */
export function checkBody(v: Record<string, unknown>, guide: string): Checked {
  const bad = (field: string, error = 'invalid_field'): Checked => ({ ok: false, error, field });
  const id = str(v.id);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return bad('id');
  const token = str(v.turnstileToken);
  if (!token || token.length > 2048) return { ok: false, error: 'verification_failed' };
  const kind = (str(v.kind) || 'exhibition') as Kind;
  if (!KINDS.includes(kind)) return bad('kind');
  const t: Record<string, string> = {};
  for (const [k, max] of Object.entries(ONE_LINE)) {
    t[k] = str(v[k]);
    if (t[k].length > max) return bad(k, 'too_long');
    if (!oneLine(t[k]) || unsafe(t[k])) return bad(k);
    if (hasHtml(t[k])) return bad(k, 'html_not_allowed');
  }
  if ([...t.name].length < 2) return bad('name', 'missing');
  if ([...t.address].length < 5) return bad('address', 'missing');
  const description = str(v.description).replace(/\r\n?/g, '\n');
  if (description.length > MAX_DESCRIPTION) return bad('description', 'too_long');
  if (unsafe(description) || description.split('\n').length > 30) return bad('description');
  if (hasHtml(description)) return bad('description', 'html_not_allowed');
  const start = str(v.start), end = str(v.end);
  if (start && !isDate(start)) return bad('start');
  if (end && !isDate(end)) return bad('end');
  if (start && end && start > end) return bad('end', 'before_start');
  const website = str(v.website) ? cleanUrl(str(v.website)) : '';
  if (website === null) return bad('website');
  const rawLinks = Array.isArray(v.links) ? v.links : [];
  if (rawLinks.length > MAX_LINKS) return bad('links', 'too_many');
  const links: string[] = [];
  for (const l of rawLinks) {
    if (!str(l)) continue;
    const u = cleanUrl(str(l));
    if (!u) return bad('links');
    if (u !== website && !links.includes(u)) links.push(u);
  }
  const email = str(v.email);
  if (email && (email.length > 254 || !isEmail(email) || !oneLine(email))) return bad('email');
  const picture = str(v.picture);
  const rights = v.rights === true;
  if (picture && !rights) return bad('rights', 'missing');
  if (picture && !t.pictureCredit) return bad('pictureCredit', 'missing');
  const lang = v.lang === 'zh' ? 'zh' : 'en';
  return {
    ok: true,
    id: id.toLowerCase(),
    token,
    trap: str(v.homepage),
    elapsed: typeof v.elapsed === 'number' && Number.isFinite(v.elapsed) ? v.elapsed : 0,
    picture,
    s: {
      guide, kind, lang, links, description, start, end, rights, email,
      website: website || '',
      name: t.name, show: t.show, artists: t.artists, hours: t.hours, address: t.address,
      own: v.own === true, pictureCredit: t.pictureCredit, submitter: t.submitter,
      mayContact: v.mayContact === true && !!email, creditAs: t.creditAs,
    },
  };
}

async function sha(s: string): Promise<string> {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
}

/** Read the body, but stop once it passes `max` bytes. */
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

export async function handleSuggest(req: Request, slug: string, deps: SuggestDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  const url = new URL(req.url);
  // Same origin only, and say so: a script without an Origin doesn't get in.
  const origin = req.headers.get('origin');
  const site = req.headers.get('sec-fetch-site');
  if (!origin || origin !== url.origin || (site && site !== 'same-origin')) return fail('origin_not_allowed', 403);
  const audience = await deps.audienceFor(req, slug);
  if (!audience) return fail('log_on_first', 403);
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) return fail('unsupported_media_type', 415);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return fail('payload_too_large', 413);
  const raw = await readLimited(req, MAX_BODY_BYTES);
  if (raw === null) return fail('payload_too_large', 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
  } catch {
    return fail('invalid_submission', 400);
  }
  const c = checkBody(body, slug);
  if (!c.ok) return fail(c.error, c.error === 'verification_failed' ? 403 : 400, c.field);
  // The spam trap, or faster than a person: say it worked, and do nothing.
  if (c.trap || c.elapsed < MIN_FILL_MS) return json({ ok: true, reference: newReference() }, 202);

  const ip = req.headers.get('cf-connecting-ip');
  const who = deps.visitor(ip).replace(/^guides:/, '');
  if (!(await deps.allow(`suggest:${who}`))) return fail('rate_limited', 429);
  if (!(await deps.guard.hit(`suggest:v:${who}`, LIMITS.perVisitorHour, 3600)).ok) return fail('rate_limited', 429);
  if (!(await deps.guard.hit('suggest:all', LIMITS.allHour, 3600)).ok) {
    deps.log('suggest: the hourly limit for everyone was reached');
    return fail('busy', 429);
  }

  if (!deps.turnstile.secret) {
    deps.log('suggest: TURNSTILE_SECRET_SUGGEST is not set');
    return fail('not_configured', 503);
  }
  let ts: TurnstileResult;
  try {
    ts = await deps.turnstile.verify(deps.turnstile.secret, c.token, ip);
  } catch (e) {
    deps.log('suggest: Turnstile unreachable', (e as Error).message);
    return fail('verification_unavailable', 503);
  }
  if (!ts.success || ts.action !== TURNSTILE_ACTION || !ts.hostname || !deps.turnstile.hostnames.has(ts.hostname)) {
    deps.log('suggest: Turnstile refused', { success: ts.success, hostname: ts.hostname, action: ts.action, errors: ts['error-codes'] });
    return fail('verification_failed', 403);
  }

  // Sent already? The same wizard (its id), or the same place from the same visitor after a reload.
  const fp = fingerprint({ guide: slug, name: c.s.name, address: c.s.address, website: c.s.website });
  const keys = [`suggest:id:${c.id}`, `suggest:fp:${await sha(`${fp}|${who}`)}`];
  for (const k of keys) {
    const held = await deps.guard.claim(k, HOLD_S);
    if (!held.fresh) {
      // Let go of the keys this request took before it saw the repeat.
      for (const mine of keys.slice(0, keys.indexOf(k))) await deps.guard.release(mine);
      if (held.value === 'pending') return fail('in_progress', 409);
      return json({ ok: true, reference: held.value, repeat: true }, 200);
    }
  }
  const settle = async (value: string) => { for (const k of keys) await deps.guard.settle(k, value, HOLD_S); };
  const release = async () => { for (const k of keys) await deps.guard.release(k); };

  // The picture: real, small enough, and with its metadata gone.
  let pic: { bytes: Uint8Array; type: string; name: string } | null = null;
  if (c.picture) {
    const bytes = fromBase64(c.picture);
    const reason = !bytes ? 'bad_picture' : bytes.length > MAX_PICTURE_BYTES ? 'picture_too_large' : '';
    const clean = bytes && !reason ? cleanImage(bytes) : null;
    if (reason || !clean || 'error' in clean || clean.width > MAX_SIDE || clean.height > MAX_SIDE) {
      await release();
      return fail(reason || (clean && 'error' in clean ? 'bad_picture' : 'picture_too_large'), 400, 'picture');
    }
    pic = { bytes: clean.bytes, type: clean.type, name: `picture.${EXT[clean.kind]}` };
  }

  const reference = newReference();
  const stamp: Stamp = { reference, submission: c.id, audience, fingerprint: fp, duplicate: '' };
  let page: { id: string; url?: string } | null = null;
  let contactSaved = !(c.s.submitter || c.s.email); // nothing to save is saved
  if (deps.notion) {
    try {
      const n = deps.notion;
      // A hint for the owner: the same fingerprint or website already in the queue.
      const same = await n.query(deps.db.suggestions, {
        filter: { or: [{ property: S.fingerprint, rich_text: { equals: fp } }, ...(c.s.website ? [{ property: S.website, url: { equals: c.s.website } }] : [])] },
        page_size: 3,
      });
      stamp.duplicate = same.results.map((p) => `${R.text(p, S.reference) || p.id} ${R.title(p, S.name)}`.trim()).join('; ').slice(0, 500);
      if (pic) stamp.picture = { id: await n.uploadFile(pic.name, pic.type, pic.bytes), name: pic.name };
      page = await n.createPage(deps.db.suggestions, suggestionProps(c.s, stamp));
      if (!contactSaved) {
        await n.createPage(deps.db.contacts, contactProps(c.s, stamp, page.id));
        contactSaved = true;
      }
    } catch (e) {
      // Whatever didn't reach Notion goes in the owner's email below.
      deps.log('suggest: Notion failed, emailing instead', e instanceof NotionError ? `${e.status} ${e.code}` : (e as Error).message);
    }
  }

  const inNotion = !!page;
  try {
    await deps.notify(ownerEmail(c.s, stamp, page?.url ?? '', inNotion, !contactSaved, !!pic, url.origin));
  } catch (e) {
    deps.log('suggest: owner email failed', (e as { code?: string }).code ?? (e as Error).message);
    if (!inNotion) {
      await release();
      return fail('delivery_failed', 502);
    }
  }
  await settle(reference);
  return json({ ok: true, reference }, 202);
}

/** The owner's note: a pointer to Notion, plus whatever Notion didn't take (this email is then the only copy). */
function ownerEmail(s: Suggestion, t: Stamp, notionUrl: string, inNotion: boolean, withContact: boolean, picture: boolean, origin: string): EmailOut {
  const rows: [string, string][] = [
    ['Reference', t.reference],
    ['Guide', s.guide],
    ['Kind', s.kind],
    ['Place', s.name],
    ['Show', s.show],
    ['Artists', s.artists],
    ['Dates', [s.start, s.end].filter(Boolean).join(' – ')],
    ['Hours', s.hours],
    ['Address', s.address],
    ['Website', s.website],
    ['Other links', s.links.join('\n')],
    ['Their own show', s.own ? 'yes' : 'no'],
    ['Description', s.description],
    ['Picture', picture ? (inNotion ? 'in Notion' : 'not kept (Notion was down)') : 'none'],
    ['Picture credit', s.pictureCredit],
    ['Credit as', s.creditAs],
    ['Sent by', t.audience],
    ['Possible duplicate', t.duplicate],
    // Contact details only when this email is the only copy of them.
    ...(withContact ? ([['Submitter', s.submitter], ['Email', s.email], ['May contact', s.mayContact ? 'yes' : 'no']] as [string, string][]) : []),
  ].filter(([, v]) => v) as [string, string][];
  const queue = `${origin}/admin/suggestions`;
  const head = !inNotion
    ? 'Notion could not take this suggestion, so here it is in full. Add it to the queue by hand.'
    : withContact
      ? 'A new suggestion is in the Field Guide queue. Notion could not take the contact details, so they are only in this email.'
      : 'A new suggestion is in the Field Guide queue.';
  return {
    from: SENDER,
    subject: `Field Guide suggestion: ${s.name.slice(0, 80)} (${t.reference})${inNotion ? '' : ' [not in Notion]'}`,
    text: [head, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', ...(notionUrl ? [`Notion: ${notionUrl}`] : []), `Queue: ${queue}`].join('\n'),
    html:
      `<p>${escapeHtml(head)}</p><dl>` +
      rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd style="white-space:pre-wrap">${escapeHtml(v)}</dd>`).join('') +
      `</dl><p>${notionUrl ? `<a href="${escapeHtml(notionUrl)}">Open in Notion</a> · ` : ''}<a href="${escapeHtml(queue)}">Open the queue</a></p>`,
  };
}
