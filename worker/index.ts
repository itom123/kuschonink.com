// The site's Worker. Static files are served by Cloudflare directly; only
// /v1/contact/*, /guides and /guides/* run this code: the contact form backend
// (worker/contact.ts), Paint's "Send to Xiangyin" (worker/drawing.ts), the
// Field Guide's password gate (worker/guides.ts) and its suggestions
// (worker/suggest.ts), and admin mode on /v1/admin/* (worker/admin.ts).
// Two crons: the publisher every ten minutes
// (worker/publish.ts) and, daily, the Guard's tidy-up and the privacy
// clean-up (worker/privacy.ts).
import { EmailMessage } from 'cloudflare:email';
// Who may open which guide: audience ids, secret NAMES and guide slugs only
// (no guide content). Wrangler bundles the JSON into the Worker.
import access from '../src/content/guides/access.json';
import type { AccessFile } from '../src/lib/guides/types';
import { ADMIN_PREFIX, adminSession, handleAdmin, type AdminDeps, type OutMail } from './admin';
import { CONTACT_PATH, handleContact, type Deps, type EmailOut, type TurnstileResult } from './contact';
import { DRAWING_PATH, handleDrawing } from './drawing';
import { guideAudience, handleGuides, isGuidesPath, limitKey, MIN_PEPPER, type GuidesDeps } from './guides';
import type { GuardApi } from './guard';
import { github } from './github';
import { buildMime, forBinding } from './mime';
import { notion } from './notion';
import { privacySweep } from './privacy';
import { publish } from './publish';
import { routineTrigger } from './routine';
import { handleSuggest, type SuggestDeps } from './suggest';

// The Durable Object class must be exported from the Worker's main module.
export { Guard } from './guard-do';

interface RateLimit { limit(options: { key: string }): Promise<{ success: boolean }> }
interface Namespace { idFromName(name: string): unknown; get(id: unknown, o?: { locationHint?: string }): GuardApi }

interface Env {
  ASSETS: Fetcher;
  /** send_email binding; its destination_address is the inbox. */
  EMAIL: { send(message: unknown): Promise<unknown> };
  /** The inbox (same as the EMAIL binding's destination_address). */
  CONTACT_TO: string;
  /** Rate limiting binding: a few messages per minute per visitor. */
  CONTACT_LIMIT: RateLimit;
  /** Turnstile secret key (set in the dashboard as a secret). Signs Field Guide cookies when GUIDES_COOKIE_SECRET isn't set. */
  TURNSTILE_SECRET?: string;
  /** Signs the Field Guide's log-on cookies (a secret, 32+ random characters); without it TURNSTILE_SECRET does, and under 24 characters it signs together with TURNSTILE_SECRET. */
  GUIDES_COOKIE_SECRET?: string;
  /** Rate limiting binding: Field Guide password tries per minute per visitor. */
  GUIDES_LIMIT: RateLimit;
  /** Rate limiting binding: street-level tiles fetched from IGN per minute per visitor. Optional: without it (a preview) every tile is allowed. */
  GUIDES_TILE_LIMIT?: RateLimit;
  // Each Field Guide audience's password is a secret, set in the dashboard,
  // named in access.json ("secret": GUIDES_PASSWORD, GUIDES_PASSWORD_…).

  /** The Guard Durable Object (worker/guard.ts): counters, held keys, sessions, locks. */
  GUARD: Namespace;
  /** Rate limiting binding: suggestions per minute per visitor. */
  SUGGEST_LIMIT: RateLimit;
  /** The suggestion form's own Turnstile widget (a secret). */
  TURNSTILE_SECRET_SUGGEST?: string;
  /** Hostnames a suggestion's Turnstile token may come from (default kuschonink.com and www). */
  TURNSTILE_HOSTNAMES?: string;
  /** The site's Notion integration (a secret). Without it, suggestions go to the owner by email. */
  NOTION_TOKEN?: string;
  /** Only for wrangler dev: a Notion stand-in (scripts/dev/notion-standin.mjs). */
  NOTION_API?: string;
  /** Data-source ids of the three Notion databases (vars, not secrets). */
  NOTION_SUGGESTIONS?: string;
  NOTION_CONTACTS?: string;
  NOTION_LOG?: string;
  /** Fine-grained token for this repository, Contents read/write (a secret): the publisher's commits. */
  GITHUB_TOKEN?: string;
  /** "owner/name". Only production names one (wrangler.jsonc vars), so a preview never publishes, even with a token. */
  GITHUB_REPO?: string;
  /** Only for wrangler dev: a GitHub stand-in. */
  GITHUB_API?: string;

  /** Admin log-on: a password of 16+ characters and an authenticator key (base32), both secrets. */
  ADMIN_PASSWORD?: string;
  ADMIN_TOTP_SECRET?: string;
  /** Rate limiting binding: admin calls per minute per visitor. */
  ADMIN_LIMIT: RateLimit;
  /** send_email binding that may write to anyone, but only from noreply@kuschonink.com (emails to submitters). */
  MAIL_OUT?: { send(message: unknown): Promise<unknown> };
  /** The routine's API trigger (https://api.anthropic.com/v1/claude_code/routines/trig_…/fire) and its token (secrets). */
  ROUTINE_FIRE_URL?: string;
  ROUTINE_TOKEN?: string;
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

let saidShortKey = false;

/**
 * The key that signs guide cookies: GUIDES_COOKIE_SECRET when it is long
 * enough, else TURNSTILE_SECRET. A short GUIDES_COOKIE_SECRET must not close
 * every guide, but it still counts: it is signed in together with the
 * Turnstile secret, so setting or changing it still logs everyone out.
 */
function cookieSecretOf(env: Pick<Env, 'GUIDES_COOKIE_SECRET' | 'TURNSTILE_SECRET'>): string | undefined {
  const own = env.GUIDES_COOKIE_SECRET?.trim() ?? '';
  if (own.length >= MIN_PEPPER) return own;
  if (own && !saidShortKey) {
    saidShortKey = true; // once per isolate; the name only, never the value
    console.error(`guides: GUIDES_COOKIE_SECRET is under ${MIN_PEPPER} characters, so it signs together with TURNSTILE_SECRET`);
  }
  const t = env.TURNSTILE_SECRET?.trim() ?? '';
  if (t.length < MIN_PEPPER) return undefined;
  return own ? `${t}\n${own}` : t;
}

const guidesDeps = (env: Env): GuidesDeps => ({
  access: access as AccessFile,
  secret: (name) => {
    const v = (env as unknown as Record<string, unknown>)[name];
    return typeof v === 'string' ? v : undefined;
  },
  cookieSecret: () => cookieSecretOf(env),
  assets: (r) => env.ASSETS.fetch(r),
  allow: async (key) => (await env.GUIDES_LIMIT.limit({ key })).success,
  // Tiles fetched from IGN per visitor; no binding (a preview) means no limit.
  allowTile: env.GUIDES_TILE_LIMIT ? async (key) => (await env.GUIDES_TILE_LIMIT!.limit({ key })).success : undefined,
  // Street-level tiles: the Worker asks IGN and keeps the answer at the edge; the visitor never talks to IGN.
  fetch: (url, init) => fetch(url, init as RequestInit),
  cache: (caches as unknown as { default?: GuidesDeps['cache'] }).default,
  now: () => Date.now(),
  log: (...args) => console.error(...args),
  suggest: (req, slug) => handleSuggest(req, slug, suggestDeps(env)),
  isAdmin: (req) => adminSession(req, guardOf(env)),
});

/** The one Guard, in Western Europe (most visitors and the owner are there). */
const guardOf = (env: Env): GuardApi => env.GUARD.get(env.GUARD.idFromName('guard'), { locationHint: 'weur' });

/** Notion, when it is set up: the token and the three databases. */
function notionOf(env: Env) {
  if (!env.NOTION_TOKEN || !env.NOTION_SUGGESTIONS || !env.NOTION_CONTACTS || !env.NOTION_LOG) return null;
  return {
    api: notion({ token: env.NOTION_TOKEN, fetch: (i, o) => fetch(i, o), base: env.NOTION_API }),
    db: { suggestions: env.NOTION_SUGGESTIONS, contacts: env.NOTION_CONTACTS, log: env.NOTION_LOG },
  };
}

/** GitHub, when it is set up: a token and the repository's name (a preview has no name, so no publishing). */
const githubOf = (env: Env) => (env.GITHUB_TOKEN && env.GITHUB_REPO ? github({ token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO, fetch: (i, o) => fetch(i, o), base: env.GITHUB_API }) : null);

function suggestDeps(env: Env): SuggestDeps {
  const n = notionOf(env);
  return {
    // A guide's own cookie, or the admin's session (sent by "admin").
    audienceFor: async (req, slug) => (await guideAudience(req, slug, guidesDeps(env))) ?? ((await adminSession(req, guardOf(env))) ? 'admin' : null),
    guard: guardOf(env),
    notion: n?.api ?? null,
    db: { suggestions: n?.db.suggestions ?? '', contacts: n?.db.contacts ?? '' },
    turnstile: {
      secret: env.TURNSTILE_SECRET_SUGGEST,
      hostnames: new Set((env.TURNSTILE_HOSTNAMES || 'kuschonink.com,www.kuschonink.com').split(',').map((h) => h.trim()).filter(Boolean)),
      verify: siteverify,
    },
    notify: (mail) => sendMail(env, mail),
    allow: async (key) => (await env.SUGGEST_LIMIT.limit({ key })).success,
    visitor: limitKey,
    now: () => Date.now(),
    log: (...args) => console.error(...args),
    access: access as AccessFile,
  };
}

/** A Notion file link (signed, short-lived) to bytes; at most 2 MB. */
async function download(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const b = new Uint8Array(await res.arrayBuffer());
    return b.length <= 2 * 1024 * 1024 ? b : null;
  } catch {
    return null;
  }
}

/**
 * The commit the running site was built from: the first 12 characters of
 * WORKERS_CI_COMMIT_SHA, which every page carries (src/lib/build.ts), read
 * from this Worker's own files. null for a build made without one.
 */
async function liveBuild(env: Env): Promise<string | null> {
  try {
    const res = await env.ASSETS.fetch(new Request('https://assets.invalid/'));
    if (!res.ok) return null;
    return /<meta\s+name="kus98-build"\s+content="([0-9a-f]{12})"/.exec(await res.text())?.[1] ?? null;
  } catch {
    return null;
  }
}

/** The publisher, when Notion and GitHub are both set up. */
async function runPublisher(env: Env, trigger: 'scheduled' | 'manual') {
  const n = notionOf(env);
  const gh = githubOf(env);
  if (!n || !gh) return null;
  return publish(
    { notion: n.api, db: n.db, gh, repoUrl: `https://github.com/${env.GITHUB_REPO}`, guard: guardOf(env), access: access as AccessFile, download, liveBuild: () => liveBuild(env), now: () => Date.now(), log: (...a) => console.error(...a) },
    trigger,
  );
}

/** The routine's trigger: only Anthropic's routine endpoint, with its own token (worker/routine.ts). */
function routineOf(env: Env): AdminDeps['fireRoutine'] {
  return routineTrigger({ url: env.ROUTINE_FIRE_URL, token: env.ROUTINE_TOKEN, fetch: (i, o) => fetch(i, o) });
}

function adminDeps(env: Env): AdminDeps {
  const n = notionOf(env);
  return {
    password: () => env.ADMIN_PASSWORD,
    totpSecret: () => env.ADMIN_TOTP_SECRET,
    guard: guardOf(env),
    allow: async (key) => (await env.ADMIN_LIMIT.limit({ key })).success,
    visitor: limitKey,
    access: access as AccessFile,
    notion: n?.api ?? null,
    db: n?.db ?? { suggestions: '', contacts: '', log: '' },
    mail: env.MAIL_OUT ? (m: OutMail) => env.MAIL_OUT!.send({ to: m.to, from: m.from, replyTo: m.replyTo, subject: m.subject, text: m.text, html: m.html }) : null,
    fireRoutine: routineOf(env),
    publish: n && githubOf(env) ? () => runPublisher(env, 'manual') : null,
    gh: githubOf(env),
    liveBuild: () => liveBuild(env),
    repoUrl: `https://github.com/${env.GITHUB_REPO || 'itom123/kuschonink.com'}`,
    now: () => Date.now(),
    log: (...args) => console.error(...args),
  };
}

const DAILY = '17 3 * * *';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === CONTACT_PATH) return handleContact(request, depsFor(env));
    if (url.pathname === DRAWING_PATH) return handleDrawing(request, depsFor(env));
    if (isGuidesPath(url.pathname)) return handleGuides(request, guidesDeps(env));
    if (url.pathname.startsWith(`${ADMIN_PREFIX}/`)) return handleAdmin(request, adminDeps(env));
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller: { cron: string }, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    if (controller.cron === DAILY) {
      ctx.waitUntil(
        (async () => {
          const swept = await guardOf(env).sweep();
          const n = notionOf(env);
          const gh = githubOf(env);
          const priv = n && gh ? await privacySweep({ notion: n.api, db: n.db, gh, access: access as AccessFile, now: () => Date.now(), log: (...a) => console.error(...a) }) : null;
          console.log('daily: guard swept', swept, 'privacy', JSON.stringify(priv));
        })().catch((e) => console.error('daily: failed', (e as Error).message)),
      );
      return;
    }
    ctx.waitUntil(
      runPublisher(env, 'scheduled')
        .then((r) => r && (r.committed.length || r.live.length || r.takenBack.length || r.errors.length) && console.log('publish:', JSON.stringify(r)))
        .catch((e) => console.error('publish: failed', (e as Error).message)),
    );
  },
};
