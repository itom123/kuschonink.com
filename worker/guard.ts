// The Guard: what the Worker must remember for a while, kept in one Durable
// Object (worker/guard-do.ts) so it holds across every Cloudflare location
// (rate-limit bindings count per location, and only per 10 or 60 seconds).
//
// - hit():      true counters ("10 suggestions an hour from one visitor", "60 an
//               hour in all", "10 emails an hour", failed admin log-ons);
// - claim():    keys held for a while, set once: a suggestion sent twice within
//               ten minutes, an email that must never go twice, a used
//               authenticator step, the publisher's and the routine's locks;
// - sessions:   the admin's log-on sessions, so Log Off works everywhere and a
//               cookie is only a random id (its SHA-256 is all that is stored).
//
// This file is the logic, on a small key-value store, so worker/guard.test.mts
// runs it in Node with a Map. The Durable Object passes its own storage.

export interface GuardStore {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(options: { prefix: string; limit?: number }): Promise<Map<string, T>>;
}

export interface Hit { ok: boolean; count: number; reset: number }
export interface Claim { fresh: boolean; value: string }
export interface SessionCheck { ok: boolean; exp: number }

/** What handlers call (a Durable Object stub, or a GuardCore in tests). */
export interface GuardApi {
  hit(key: string, limit: number, windowS: number): Promise<Hit>;
  claim(key: string, ttlS: number, value?: string): Promise<Claim>;
  settle(key: string, value: string, ttlS: number): Promise<void>;
  release(key: string): Promise<void>;
  sessionCreate(ttlS: number): Promise<{ id: string; exp: number }>;
  sessionCheck(id: string): Promise<SessionCheck>;
  sessionEnd(id: string): Promise<void>;
  sessionEndAll(): Promise<void>;
  sweep(): Promise<number>;
}

interface Counter { n: number; reset: number }
interface Held { v: string; exp: number }
interface Session { exp: number; gen: number }

const KEY = /^[\w:./@-]{1,200}$/;
const MAX_TTL_S = 400 * 86400;

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sha256(s: string): Promise<string> {
  return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}

export class GuardCore implements GuardApi {
  private store: GuardStore;
  private now: () => number;

  constructor(store: GuardStore, now: () => number) {
    this.store = store;
    this.now = now;
  }

  private check(key: string, ttlS: number) {
    if (!KEY.test(key)) throw new Error(`guard: bad key ${JSON.stringify(key.slice(0, 40))}`);
    if (!(ttlS > 0 && ttlS <= MAX_TTL_S)) throw new Error('guard: bad time');
  }

  /** Count one more in a fixed window; `ok` is false once `limit` is passed (the refused try is counted too). */
  async hit(key: string, limit: number, windowS: number): Promise<Hit> {
    this.check(key, windowS);
    const now = this.now();
    const k = `c:${key}`;
    let c = await this.store.get<Counter>(k);
    if (!c || c.reset <= now) c = { n: 0, reset: now + windowS * 1000 };
    c.n++;
    await this.store.put(k, c);
    return { ok: c.n <= limit, count: c.n, reset: c.reset };
  }

  /** Hold a key for `ttlS` seconds. The first caller gets `fresh: true`; later ones get the value the holder left. */
  async claim(key: string, ttlS: number, value = 'pending'): Promise<Claim> {
    this.check(key, ttlS);
    const now = this.now();
    const k = `k:${key}`;
    const held = await this.store.get<Held>(k);
    if (held && held.exp > now) return { fresh: false, value: held.v };
    await this.store.put<Held>(k, { v: value, exp: now + ttlS * 1000 });
    return { fresh: true, value };
  }

  /** Change what a held key says (e.g. "pending" → the reference, or "sent"), and how long it is held. */
  async settle(key: string, value: string, ttlS: number): Promise<void> {
    this.check(key, ttlS);
    await this.store.put<Held>(`k:${key}`, { v: value, exp: this.now() + ttlS * 1000 });
  }

  /** Let go of a key (the work it guarded definitely failed, so a retry may run). */
  async release(key: string): Promise<void> {
    this.check(key, 1);
    await this.store.delete(`k:${key}`);
  }

  private async generation(): Promise<number> {
    return (await this.store.get<number>('g')) ?? 0;
  }

  /** A new admin session: a random id for the cookie; only its hash is stored. */
  async sessionCreate(ttlS: number): Promise<{ id: string; exp: number }> {
    this.check('s', ttlS);
    const id = b64u(crypto.getRandomValues(new Uint8Array(32)));
    const exp = this.now() + ttlS * 1000;
    await this.store.put<Session>(`s:${await sha256(id)}`, { exp, gen: await this.generation() });
    return { id, exp };
  }

  async sessionCheck(id: string): Promise<SessionCheck> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(id)) return { ok: false, exp: 0 };
    const s = await this.store.get<Session>(`s:${await sha256(id)}`);
    if (!s || s.exp <= this.now() || s.gen !== (await this.generation())) return { ok: false, exp: 0 };
    return { ok: true, exp: s.exp };
  }

  async sessionEnd(id: string): Promise<void> {
    if (/^[A-Za-z0-9_-]{43}$/.test(id)) await this.store.delete(`s:${await sha256(id)}`);
  }

  /** Log Off Everywhere: every session so far stops working. */
  async sessionEndAll(): Promise<void> {
    await this.store.put('g', (await this.generation()) + 1);
    for (const k of (await this.store.list({ prefix: 's:' })).keys()) await this.store.delete(k);
  }

  /** Forget what has expired (the daily cron calls this). Returns how many entries went. */
  async sweep(): Promise<number> {
    const now = this.now();
    const gen = await this.generation();
    let n = 0;
    for (const [prefix, dead] of [
      ['c:', (v: Counter) => v.reset <= now],
      ['k:', (v: Held) => v.exp <= now],
      ['s:', (v: Session) => v.exp <= now || v.gen !== gen],
    ] as [string, (v: never) => boolean][]) {
      for (const [k, v] of await this.store.list<never>({ prefix })) {
        if (dead(v)) {
          await this.store.delete(k);
          n++;
        }
      }
    }
    return n;
  }
}

/** A Map as a GuardStore, for tests and for wrangler dev without Durable Objects. */
export function memoryStore(): GuardStore & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    async get<T>(k: string) { return structuredClone(map.get(k)) as T | undefined; },
    async put<T>(k: string, v: T) { map.set(k, structuredClone(v)); },
    async delete(k: string) { return map.delete(k); },
    async list<T>({ prefix, limit }: { prefix: string; limit?: number }) {
      const out = new Map<string, T>();
      for (const [k, v] of [...map].sort(([a], [b]) => (a < b ? -1 : 1))) {
        if (!k.startsWith(prefix)) continue;
        out.set(k, structuredClone(v) as T);
        if (limit && out.size >= limit) break;
      }
      return out;
    },
  };
}
