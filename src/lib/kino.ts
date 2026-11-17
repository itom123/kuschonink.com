// Kino (/kino): the cinema's films and the rules both sides share. Pure code,
// no imports, so the pages (Astro), the browser and the Worker
// (worker/kino.ts) can all use it. The films are in src/content/kino.json;
// each caller imports that file itself and hands it to loadKino().
//
// A film plays from its `stream` (protected HLS on Cloudflare R2, see
// docs/KINO.md) when it has one, otherwise from its YouTube video. No page
// ever holds either: the Worker gives a film's source only to a visitor with a
// ticket (worker/kino.ts).

export interface KinoStream {
  /** Which upload of the film: 'v' + YYYYMMDD + an optional letter, e.g. v20261116a. Files live under films/<id>/<version>/ in R2. */
  version: string;
  /** The top rung's picture size, in pixels. */
  width: number;
  height: number;
}

export interface KinoFilm {
  id: string;
  title: string;
  titleZh?: string;
  year?: number;
  /** Length in seconds. */
  seconds?: number;
  /** The film's project page (/image/<project>). */
  project?: string;
  /** A short note (HTML). */
  note?: string;
  noteZh?: string;
  /** The film's picture (lobby, before playing, project pages): a path under src/assets/images, as an image block's src. Without it, its project's first picture. */
  poster?: string;
  /** The fallback: the film's YouTube video. */
  youtubeId?: string;
  stream?: KinoStream;
  /** false: not in Now Showing, the garage or Previous/Next; its page and its project's card still work. */
  listed?: boolean;
  /** true: the film needs the Kino's password (the secret KINO_PASSWORD) before it plays. */
  password?: boolean;
}

export interface KinoFile {
  _comment?: string;
  films: KinoFilm[];
}

export type KinoSource = 'hls' | 'youtube';

export const KINO_PREFIX = '/kino';
/** The ticket: a signed HttpOnly cookie on /kino, set by POST /kino/ticket. */
export const TICKET_COOKIE = 'kus98_kino';
export const TICKET_PATH = '/kino/ticket';
/** A ticket lasts 4 hours, and goes when the browser closes. */
export const TICKET_S = 4 * 3600;
/** A film's media links last its length plus an hour, at most 6 hours, never past the ticket. */
export const MEDIA_EXTRA_S = 3600;
export const MEDIA_MAX_S = 6 * 3600;
/** Turnstile's action for the Kino's box office. */
export const TURNSTILE_ACTION = 'kuschonink-kino';

/** Words a film id can't be (they are the Worker's own paths under /kino). */
export const RESERVED = ['ticket', 'index', 'play', 'm', 'media'];
export const FILM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
export const VERSION = /^v\d{8}[a-z]?$/;
const FIELDS = new Set(['id', 'title', 'titleZh', 'year', 'seconds', 'project', 'note', 'noteZh', 'poster', 'youtubeId', 'stream', 'listed', 'password']);
const POSTER = /^[a-z0-9][a-z0-9/._-]*\.(?:jpe?g|png|webp)$/i;

export const isKinoPath = (p: string) => p === KINO_PREFIX || p.startsWith(`${KINO_PREFIX}/`);

export const sourceOf = (f: KinoFilm): KinoSource => (f.stream ? 'hls' : 'youtube');

/** "0:51", "12:05", "1:02:03". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Everything wrong with the films, as "kino.json › <id> › <field>: <problem>". Empty when all is well. */
export function problems(data: KinoFile, projects?: readonly string[]): string[] {
  const out: string[] = [];
  const say = (id: string, field: string, what: string) => out.push(`kino.json › ${id} › ${field}: ${what}`);
  if (!data || !Array.isArray(data.films)) return ['kino.json: "films" must be a list'];
  const seen = new Set<string>();
  data.films.forEach((f, i) => {
    const id = typeof f?.id === 'string' ? f.id : `#${i + 1}`;
    for (const k of Object.keys(f ?? {})) if (!FIELDS.has(k)) say(id, k, 'unknown field');
    if (!FILM_ID.test(f.id ?? '')) say(id, 'id', 'use lower-case letters, digits and hyphens');
    if (RESERVED.includes(f.id)) say(id, 'id', `"${f.id}" is reserved`);
    if (seen.has(f.id)) say(id, 'id', 'used twice');
    seen.add(f.id);
    if (typeof f.title !== 'string' || !f.title.trim()) say(id, 'title', 'missing');
    if (typeof f.titleZh !== 'string' || !f.titleZh.trim()) say(id, 'titleZh', 'missing');
    if (f.note && !f.noteZh) say(id, 'noteZh', 'missing (the note has no Chinese)');
    if (f.year !== undefined && !(Number.isInteger(f.year) && f.year >= 1900 && f.year <= 2100)) say(id, 'year', 'not a year');
    if (f.seconds !== undefined && !(Number.isFinite(f.seconds) && f.seconds > 0 && f.seconds < 24 * 3600)) say(id, 'seconds', 'not a length in seconds');
    for (const k of ['listed', 'password'] as const) if (f[k] !== undefined && typeof f[k] !== 'boolean') say(id, k, 'true or false');
    if (f.poster !== undefined && (typeof f.poster !== 'string' || !POSTER.test(f.poster) || f.poster.includes('..'))) say(id, 'poster', 'a picture under src/assets/images, e.g. projects/hanabi/flux.jpg');
    if (f.youtubeId !== undefined && !YOUTUBE_ID.test(f.youtubeId)) say(id, 'youtubeId', 'not a YouTube video id (11 characters)');
    if (f.stream !== undefined) {
      const s = f.stream;
      if (!VERSION.test(s?.version ?? '')) say(id, 'stream.version', 'use v + YYYYMMDD + an optional letter, e.g. v20261116a');
      for (const k of ['width', 'height'] as const) if (!(Number.isInteger(s?.[k]) && s[k] >= 144 && s[k] <= 8192)) say(id, `stream.${k}`, 'not a picture size');
      if (f.seconds === undefined) say(id, 'seconds', 'a film on R2 needs its length (encode.mjs prints it)');
    }
    if (!f.stream && !f.youtubeId) say(id, 'youtubeId', 'a film needs a stream or a YouTube video');
    if (projects && f.project !== undefined && !projects.includes(f.project)) say(id, 'project', `no project "${f.project}"`);
  });
  return out;
}

/** The films, checked: throws with every problem at once. */
export function loadKino(data: KinoFile, projects?: readonly string[]): KinoFilm[] {
  const p = problems(data, projects);
  if (p.length) throw new Error(`Kino: ${p.length} problem${p.length > 1 ? 's' : ''}\n  ${p.join('\n  ')}`);
  return data.films;
}

/** How long a film's media links last, from now (seconds). */
export function mediaLife(f: KinoFilm): number {
  return Math.min(MEDIA_MAX_S, Math.ceil(f.seconds ?? MEDIA_MAX_S) + MEDIA_EXTRA_S);
}
