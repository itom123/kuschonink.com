// The contact form backend: origin check → validation → rate limit →
// Turnstile → email to the inbox. Written with its dependencies passed in,
// so it can be tested without Cloudflare's services.

export const CONTACT_PATH = '/v1/contact/kuschonink';
const ALLOWED_ORIGINS = new Set(['https://kuschonink.com', 'https://www.kuschonink.com']);
const ALLOWED_HOSTNAMES = new Set(['kuschonink.com', 'www.kuschonink.com']);
const TURNSTILE_ACTION = 'kuschonink-contact';
const SENDER = { email: 'noreply@kuschonink.com', name: 'kuschonink.com' };
const MAX_BODY_BYTES = 32 * 1024;
const LIMITS = { name: 120, email: 254, subject: 180, message: 4000, website: 254, turnstileToken: 2048 };

export interface Submission { name: string; email: string; subject: string; message: string; website: string; turnstileToken: string }
export interface TurnstileResult { success: boolean; hostname?: string; action?: string; 'error-codes'?: string[] }
export interface EmailOut { from: { email: string; name: string }; replyTo: string; subject: string; text: string; html: string }

export interface Deps {
  secret: string | undefined;
  /** Turnstile siteverify. */
  verify: (secret: string, token: string, ip: string | null) => Promise<TurnstileResult>;
  /** Sends to the inbox configured on the EMAIL binding. Throws errors with a `code`. */
  send: (mail: EmailOut) => Promise<unknown>;
  /** Returns false when this visitor has sent too often. */
  allow: (key: string) => Promise<boolean>;
  log: (...args: unknown[]) => void;
}

const json = (body: unknown, status: number, origin?: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(origin && ALLOWED_ORIGINS.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
    },
  });

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const hasLineBreak = (s: string) => /[\r\n]/.test(s);
// eslint-disable-next-line no-control-regex
const unsafe = (s: string) => /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s);

export function validate(p: Submission): string | null {
  if (!p.name || !p.email || !p.subject || !p.message) return 'missing_required_field';
  if (!p.turnstileToken) return 'verification_failed';
  for (const [k, max] of Object.entries(LIMITS)) if ((p as unknown as Record<string, string>)[k].length > max) return 'field_too_long';
  if (!isEmail(p.email) || hasLineBreak(p.name) || hasLineBreak(p.subject) || [p.name, p.email, p.subject, p.message].some(unsafe)) {
    return 'invalid_submission';
  }
  return null;
}

export function buildEmail(p: Submission): EmailOut {
  const lines = [`Name: ${p.name}`, `Email: ${p.email}`, `Subject: ${p.subject}`, '', p.message];
  return {
    from: SENDER,
    replyTo: p.email,
    subject: `kuschonink.com: ${p.subject}`,
    text: ['New message from the kuschonink.com contact form', '', ...lines].join('\n'),
    html:
      '<p><strong>New message from the kuschonink.com contact form</strong></p><dl>' +
      `<dt>Name</dt><dd>${escapeHtml(p.name)}</dd>` +
      `<dt>Email</dt><dd>${escapeHtml(p.email)}</dd>` +
      `<dt>Subject</dt><dd>${escapeHtml(p.subject)}</dd>` +
      `<dt>Message</dt><dd style="white-space:pre-wrap">${escapeHtml(p.message)}</dd></dl>`,
  };
}

export async function handleContact(request: Request, deps: Deps): Promise<Response> {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ error: 'origin_not_allowed' }, 403);
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
        vary: 'Origin',
      },
    });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ error: 'origin_not_allowed' }, 403);
  if (!deps.secret) {
    deps.log('contact: TURNSTILE_SECRET is not set');
    return json({ error: 'service_not_configured' }, 503, origin);
  }
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'unsupported_media_type' }, 415, origin);
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413, origin);

  let p: Submission;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    p = { name: text(v.name), email: text(v.email), subject: text(v.subject), message: text(v.message), website: text(v.website), turnstileToken: text(v.turnstileToken) };
  } catch {
    return json({ error: 'invalid_submission' }, 400, origin);
  }
  // Spam trap filled in: pretend it worked.
  if (p.website) return json({ ok: true }, 202, origin);

  const invalid = validate(p);
  if (invalid) return json({ error: invalid }, invalid === 'verification_failed' ? 403 : 400, origin);

  const ip = request.headers.get('cf-connecting-ip');
  if (!(await deps.allow(`contact:${ip ?? 'unknown'}`))) return json({ error: 'rate_limited' }, 429, origin);

  let ts: TurnstileResult;
  try {
    ts = await deps.verify(deps.secret, p.turnstileToken, ip);
  } catch (e) {
    deps.log('contact: Turnstile siteverify unreachable', e);
    return json({ error: 'verification_unavailable' }, 503, origin);
  }
  if (!ts.success || !ts.hostname || !ALLOWED_HOSTNAMES.has(ts.hostname) || ts.action !== TURNSTILE_ACTION) {
    deps.log('contact: Turnstile rejected', { success: ts.success, hostname: ts.hostname, action: ts.action, errors: ts['error-codes'] });
    return json({ error: 'verification_failed', detail: ts['error-codes']?.join(',') || undefined }, 403, origin);
  }

  try {
    await deps.send(buildEmail(p));
  } catch (e) {
    const code = (e as { code?: string }).code ?? 'unknown';
    deps.log('contact: email send failed', code, (e as Error).message);
    return json({ error: 'delivery_failed', detail: code }, 502, origin);
  }
  return json({ ok: true }, 202, origin);
}
