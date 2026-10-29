// The site's Worker. Static files are served by Cloudflare directly; only
// /v1/contact/* runs this code: the contact form backend (worker/contact.ts).
import { CONTACT_PATH, handleContact, type EmailOut, type TurnstileResult } from './contact';

interface Env {
  ASSETS: Fetcher;
  /** send_email binding; its destination_address is the inbox. */
  EMAIL: { send(message: EmailOut & { to?: string }): Promise<unknown> };
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === CONTACT_PATH) {
      return handleContact(request, {
        secret: env.TURNSTILE_SECRET,
        verify: siteverify,
        send: (mail) => env.EMAIL.send(mail),
        allow: async (key) => (await env.CONTACT_LIMIT.limit({ key })).success,
        log: (...args) => console.error(...args),
      });
    }
    return env.ASSETS.fetch(request);
  },
};
