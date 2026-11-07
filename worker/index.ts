// The site's Worker. Static files are served by Cloudflare directly; only
// /v1/contact/* and /guides/* run this code: the contact form backend
// (worker/contact.ts), Paint's "Send to Xiangyin" (worker/drawing.ts) and
// the Field Guide's password gate (worker/guides.ts).
import { EmailMessage } from 'cloudflare:email';
// Who may open which guide: audience ids, secret NAMES and guide slugs only
// (no guide content). Wrangler bundles the JSON into the Worker.
import access from '../src/content/guides/access.json';
import type { AccessFile } from '../src/lib/guides/types';
import { CONTACT_PATH, handleContact, type Deps, type EmailOut, type TurnstileResult } from './contact';
import { DRAWING_PATH, handleDrawing } from './drawing';
import { handleGuides, isGuidesPath, MIN_PEPPER, type GuidesDeps } from './guides';
import { buildMime, forBinding } from './mime';

interface Env {
  ASSETS: Fetcher;
  /** send_email binding; its destination_address is the inbox. */
  EMAIL: { send(message: unknown): Promise<unknown> };
  /** The inbox (same as the EMAIL binding's destination_address). */
  CONTACT_TO: string;
  /** Rate limiting binding: a few messages per minute per visitor. */
  CONTACT_LIMIT: { limit(options: { key: string }): Promise<{ success: boolean }> };
  /** Turnstile secret key (set in the dashboard as a secret). Signs Field Guide cookies when GUIDES_COOKIE_SECRET isn't set. */
  TURNSTILE_SECRET?: string;
  /** Signs the Field Guide's log-on cookies (a secret, 32+ random characters); without it, or when it is under 24 characters, TURNSTILE_SECRET does. */
  GUIDES_COOKIE_SECRET?: string;
  /** Rate limiting binding: Field Guide password tries per minute per visitor. */
  GUIDES_LIMIT: { limit(options: { key: string }): Promise<{ success: boolean }> };
  // Each Field Guide audience's password is a secret, set in the dashboard,
  // named in access.json ("secret": GUIDES_PASSWORD, GUIDES_PASSWORD_…).
}

async function siteverify(secret: string, token: string, ip: string | null): Promise<TurnstileResult> {
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`siteverify HTTP ${res.status}`);
  return (await res.json()) as TurnstileResult;
}

// Send with the structured Email Service API; if the binding only supports the
// classic Email Routing form (an error with no code), resend as a raw message.
// Pictures go along either way: as `attachments` (bytes), or as MIME parts.
async function sendMail(env: Env, mail: EmailOut): Promise<unknown> {
  try {
    return await env.EMAIL.send(forBinding(mail, env.CONTACT_TO));
  } catch (e) {
    if ((e as { code?: string }).code) throw e;
    console.error('contact: structured send failed, trying raw message:', (e as Error).message);
    const raw = buildMime(mail, env.CONTACT_TO, crypto.randomUUID());
    return await env.EMAIL.send(new EmailMessage(mail.from.email, env.CONTACT_TO, raw));
  }
}

const depsFor = (env: Env): Deps => ({
  secret: env.TURNSTILE_SECRET,
  verify: siteverify,
  send: (mail) => sendMail(env, mail),
  allow: async (key) => (await env.CONTACT_LIMIT.limit({ key })).success,
  log: (...args) => console.error(...args),
});

const guidesDeps = (env: Env): GuidesDeps => ({
  access: access as AccessFile,
  secret: (name) => {
    const v = (env as unknown as Record<string, unknown>)[name];
    return typeof v === 'string' ? v : undefined;
  },
  // The dedicated key when it is long enough, else the Turnstile secret: a
  // short GUIDES_COOKIE_SECRET must not close every guide.
  cookieSecret: () => [env.GUIDES_COOKIE_SECRET, env.TURNSTILE_SECRET].find((s) => (s?.trim().length ?? 0) >= MIN_PEPPER),
  assets: (r) => env.ASSETS.fetch(r),
  allow: async (key) => (await env.GUIDES_LIMIT.limit({ key })).success,
  now: () => Date.now(),
  log: (...args) => console.error(...args),
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === CONTACT_PATH) return handleContact(request, depsFor(env));
    if (url.pathname === DRAWING_PATH) return handleDrawing(request, depsFor(env));
    if (isGuidesPath(url.pathname)) return handleGuides(request, guidesDeps(env));
    return env.ASSETS.fetch(request);
  },
};
