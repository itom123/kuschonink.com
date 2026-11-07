// The visitor's choice about cookies and storage. cookies.ts asks for it (the
// Cookies dialog, and the Information Bar after that); every write asks
// allows() first.
//
// - 'all': everything below.
// - 'necessary': the cookies that features you ask for need (the log-on cookie
//   kus98_session; Field Guide's kus98_guides, which the Worker sets when you
//   log on to a guide), and what is kept for this tab only (sessionStorage).
//   No lasting preferences (localStorage, IndexedDB).
// - 'none': no cookies and no storage at all.
// - Not decided yet: nothing is allowed, and the dialog asks.
//
// The choice itself is strictly necessary, so it is always written: in
// localStorage, kus98:consent = {v: 1, level, at}. When storage fails it lives
// in memory for the page. Choosing a level removes the site's own keys that
// it doesn't allow, never anything else on the origin (on localhost, other
// projects share it).
//
// No imports: util.ts uses this without a cycle, and Node runs it in
// consent.test.mts. The head script in src/layouts/Desktop.astro reads the
// same key before the first paint.

export type Level = 'all' | 'necessary' | 'none';
/** What a write needs: a cookie, this tab's memory (sessionStorage), or lasting storage (localStorage, IndexedDB). */
export type Kind = 'cookie' | 'tab' | 'lasting';
export interface Choice { v: 1; level: Level; at: number }

export const KEY = 'kus98:consent';
export const LEVELS: readonly Level[] = ['all', 'necessary', 'none'];
/** The log-on cookie (session.ts): the only cookie the site's scripts set. Field Guide's is HttpOnly, the Worker's alone. */
export const SESSION_COOKIE = 'kus98_session';
/** Paint's picture (src/scripts/paint/store.ts). */
export const PAINT_DB = 'kus98-paint';

/**
 * Allow All chosen in this page after a choice that kept nothing lasting:
 * what the page still shows is written again, since that choice removed it
 * (stored() in util.ts, lang.ts, session.ts, Paint's tools). Another tab
 * writes only what was set there meanwhile, so its older copy doesn't win.
 */
export const keepAgain = (level: Level | null, was: Level | null, here: boolean) => here && level === 'all' && was !== 'all';

/** Does a level (null: not decided yet) allow this kind of storage? */
export function levelAllows(level: Level | null, kind: Kind): boolean {
  if (level === 'all') return true;
  if (level === 'necessary') return kind !== 'lasting';
  return false;
}

/** A stored choice, or null when there is none or it isn't one (then the dialog asks again). */
export function parseChoice(raw: string | null | undefined): Choice | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const c = v as Record<string, unknown>;
  if (c.v !== 1 || !LEVELS.includes(c.level as Level) || typeof c.at !== 'number' || !Number.isFinite(c.at)) return null;
  return { v: 1, level: c.level as Level, at: c.at };
}

/** One of the site's own keys in localStorage or sessionStorage. */
export const ownKey = (k: string) => k.startsWith('kus98:') || k === 'lang';

/** The site's own keys among `keys` that `level` doesn't allow there. The choice itself always stays. */
export function keysToClear(keys: readonly string[], where: 'local' | 'session', level: Level): string[] {
  if (levelAllows(level, where === 'local' ? 'lasting' : 'tab')) return [];
  return keys.filter((k) => ownKey(k) && k !== KEY);
}

export interface StorageLike {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** Where the choice is kept and what it clears (the browser's, or a test's). */
export interface Env {
  /** localStorage and sessionStorage, or null when they can't be used. */
  local: StorageLike | null;
  session: StorageLike | null;
  /** document.cookie = … */
  setCookie(c: string): void;
  /** Delete an IndexedDB database. */
  dropDb(name: string): void;
  /** On https cookies are Secure. */
  secure: boolean;
  now(): number;
  /** Another tab changed the choice: called with the new stored value. */
  watch?(f: (raw: string | null) => void): void;
}

function keysOf(st: StorageLike): string[] {
  const out: string[] = [];
  for (let i = 0; i < st.length; i++) {
    const k = st.key(i);
    if (k !== null) out.push(k);
  }
  return out;
}

/**
 * Remove what `level` doesn't allow: the site's own keys, and unless told
 * otherwise the log-on cookie and Paint's picture. Field Guide's cookie is
 * HttpOnly: only the guide's File ▸ Log Off (the Worker) removes it.
 */
export function clearFor(level: Level, env: Env, o: { cookie?: boolean; db?: boolean } = {}) {
  for (const [where, st] of [['local', env.local], ['session', env.session]] as const) {
    if (!st) continue;
    try {
      for (const k of keysToClear(keysOf(st), where, level)) st.removeItem(k);
    } catch { /* storage turned off */ }
  }
  if (o.cookie !== false && !levelAllows(level, 'cookie')) {
    try {
      env.setCookie(`${SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax${env.secure ? '; Secure' : ''}`);
    } catch { /* cookies turned off */ }
  }
  if (o.db !== false && !levelAllows(level, 'lasting')) {
    try {
      env.dropDb(PAINT_DB);
    } catch { /* no IndexedDB */ }
  }
}

/** `here`: chosen in this page (false: in another tab, which follows it). */
export type Listener = (level: Level | null, was: Level | null, here: boolean) => void;

export interface Consent {
  /** 'all', 'necessary' or 'none'; null before any choice. */
  level(): Level | null;
  decided(): boolean;
  allows(kind: Kind): boolean;
  /** Can the choice itself be kept? Not when the browser blocks site data: then it lasts only for the page. */
  lasts(): boolean;
  /** Choose a level: written at once, and what it doesn't allow is removed. */
  set(level: Level): void;
  /** Called after each change, here or in another tab. Returns a function that stops it. */
  on(f: Listener): () => void;
}

export function createConsent(env: Env): Consent {
  let level: Level | null = null;
  let lasts = env.local !== null;
  try {
    level = parseChoice(env.local?.getItem(KEY))?.level ?? null;
  } catch {
    lasts = false;
  }
  const fns = new Set<Listener>();
  const tell = (was: Level | null, here: boolean) => {
    for (const f of [...fns]) {
      try {
        f(level, was, here);
      } catch (e) {
        console.error(e);
      }
    }
  };
  // Anything left over that the choice doesn't allow (written by an older
  // version, or a tab that hadn't heard yet) goes before anyone reads it.
  if (level && level !== 'all') clearFor(level, env, { cookie: false, db: false });
  // Chosen in another tab: this one follows (its own sessionStorage too).
  env.watch?.((raw) => {
    const next = parseChoice(raw)?.level ?? null;
    if (next === level) return;
    const was = level;
    level = next;
    if (next) clearFor(next, env);
    tell(was, false);
  });
  return {
    level: () => level,
    decided: () => level !== null,
    allows: (kind) => levelAllows(level, kind),
    lasts: () => lasts,
    set(next) {
      const was = level;
      level = next;
      const choice: Choice = { v: 1, level: next, at: env.now() };
      try {
        env.local?.setItem(KEY, JSON.stringify(choice));
      } catch {
        lasts = false; // kept in memory, for this page
      }
      clearFor(next, env);
      tell(was, true);
    },
    on(f) {
      fns.add(f);
      return () => {
        fns.delete(f);
      };
    },
  };
}

// ---- This page's choice ----

function webStorage(which: 'localStorage' | 'sessionStorage'): StorageLike | null {
  try {
    // Reading the property itself throws when site data is blocked.
    return (globalThis as unknown as Record<string, StorageLike | undefined>)[which] ?? null;
  } catch {
    return null;
  }
}

function browserEnv(): Env {
  return {
    local: webStorage('localStorage'),
    session: webStorage('sessionStorage'),
    setCookie: (c) => {
      document.cookie = c;
    },
    dropDb: (name) => {
      globalThis.indexedDB?.deleteDatabase(name);
    },
    secure: location.protocol === 'https:',
    now: () => Date.now(),
    watch: (f) =>
      addEventListener('storage', (e) => {
        if (e.key === KEY) f(e.newValue);
      }),
  };
}

let main: Consent | undefined;
const one = () => (main ??= createConsent(browserEnv()));

/** The choice in this page (read the first time it's needed). */
export const consent: Consent = {
  level: () => one().level(),
  decided: () => one().decided(),
  allows: (kind) => one().allows(kind),
  lasts: () => one().lasts(),
  set: (level) => one().set(level),
  on: (f) => one().on(f),
};
