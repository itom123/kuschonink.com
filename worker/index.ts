// The site's Worker. Static files are served by Cloudflare directly; only
// /v1/contact/* runs this code: the contact form backend (worker/contact.ts).
import { EmailMessage } from 'cloudflare:email';
import { CONTACT_PATH, handleContact, type EmailOut, type TurnstileResult } from './contact';
import { buildMime } from './mime';

interface Env {
  ASSETS: Fetcher;
  /** send_email binding; its destination_address is the inbox. */
  EMAIL: { send(message: unknown): Promise<unknown> };
  /** The inbox (same as the EMAIL binding's destination_address). */
  CONTACT_TO: string;
  /** Rate limiting binding: a few messages per minute per visitor. */
  CONTACT_LIMIT: { limit(options: { key: string }): Promise<{ success: boolean }> };
  /** Turnstile secret key (set in the dashboard as a secret). */
  TURNSTILE_SECRET?: string;
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
async function sendMail(env: Env, mail: EmailOut): Promise<unknown> {
  try {
    return await env.EMAIL.send({ ...mail, to: env.CONTACT_TO });
  } catch (e) {
    if ((e as { code?: string }).code) throw e;
    console.error('contact: structured send failed, trying raw message:', (e as Error).message);
    const raw = buildMime(mail, env.CONTACT_TO, crypto.randomUUID());
    return await env.EMAIL.send(new EmailMessage(mail.from.email, env.CONTACT_TO, raw));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === CONTACT_PATH) {
      return handleContact(request, {
        secret: env.TURNSTILE_SECRET,
        verify: siteverify,
        send: (mail) => sendMail(env, mail),
        allow: async (key) => (await env.CONTACT_LIMIT.limit({ key })).success,
        log: (...args) => console.error(...args),
      });
    }
    return env.ASSETS.fetch(request);
  },
};
