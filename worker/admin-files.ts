// Admin mode's site editing (routed from worker/admin.ts, which has already
// checked the session, that the call comes from this site, and the rate):
// read and save the site's content files, add pictures and projects, and list
// recent changes with whether each one went live.
//
// Every save is one fast-forward commit to main (worker/github.ts), so the
// automatic deploy builds it, and a build that fails leaves the site as it
// was. Only files src/lib/admin-files.ts allows; JSON must parse; no text may
// run code in a browser; guide files must pass the guide's own checks; a file
// changed since it was opened is never overwritten unless asked.
// Written with its dependencies passed in, so admin-files.test.mts runs it in Node.
import type { AccessFile, ItemRecord } from '../src/lib/guides/types';
import { checkGuide } from '../src/lib/guides/check.ts';
import { activeContent, filesFor, isEditableJson, pictureFolders, pictureRule } from '../src/lib/admin-files.ts';
import { commitOnMain, type GitHub } from './github.ts';
import { cleanImage, fromBase64 } from './image.ts';
import { forbiddenWord, readGuide } from './publish.ts';

export interface FilesDeps {
  gh: GitHub;
  access: AccessFile;
}
export interface Out { status: number; body: Record<string, unknown> }

/** Content files are small (the largest is about 50 KB). */
export const MAX_TEXT = 1024 * 1024;
const ok = (body: Record<string, unknown>): Out => ({ status: 200, body });
const no = (status: number, error: string, extra: Record<string, unknown> = {}): Out => ({ status, body: { error, ...extra } });
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Every file admin mode may edit, and the folders pictures may go into. */
export async function listFiles(d: FilesDeps): Promise<Out> {
  const all = await d.gh.tree('main');
  return ok({ files: all.filter(isEditableJson).sort(), folders: pictureFolders(all) });
}

/** The content files a page of the site is made from. */
export async function filesForUrl(url: string, d: FilesDeps): Promise<Out> {
  return ok({ url, files: filesFor(url, await d.gh.tree('main')) });
}

export async function readFile(path: string, d: FilesDeps): Promise<Out> {
  if (!isEditableJson(path)) return no(403, 'not_allowed');
  const f = await d.gh.file(path, 'main');
  if (!f) return no(404, 'not_found');
  return ok({ path, text: f.text, sha: f.sha });
}

/**
 * Save one content file: { path, text, base (the sha it was opened at), force? }.
 * The text is kept exactly as written (with a final newline).
 */
export async function saveFile(body: Record<string, unknown>, d: FilesDeps): Promise<Out> {
  const path = typeof body.path === 'string' ? body.path : '';
  if (!isEditableJson(path)) return no(403, 'not_allowed');
  if (typeof body.text !== 'string' || body.text.length > MAX_TEXT) return no(400, 'invalid_field', { field: 'text' });
  const base = typeof body.base === 'string' ? body.base : '';
  const force = body.force === true;
  const text = body.text.replace(/\r\n?/g, '\n').replace(/\n*$/, '\n');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return no(422, 'invalid_json', { detail: (e as Error).message });
  }
  if (!data || typeof data !== 'object') return no(422, 'invalid_json', { detail: 'The file must be a JSON object or list.' });
  const active = activeContent(data);
  if (active) return no(422, 'active_content', { ...active });

  let stop: Out | null = null;
  const done = await commitOnMain(d.gh, `Admin: edit ${path}`, async (read) => {
    stop = null;
    const cur = await read(path);
    if (!cur) {
      stop = no(404, 'not_found');
      return null;
    }
    if (!force && base !== cur.sha) {
      stop = no(409, 'changed', { sha: cur.sha });
      return null;
    }
    if (cur.text.replace(/\r\n?/g, '\n') === text) return null;
    const g = /^src\/content\/guides\/([a-z0-9-]+)\/([a-z]+)\.json$/.exec(path);
    if (g && Object.hasOwn(d.access.guides, g[1])) {
      const raw = await readGuide(read, g[1]);
      (raw as Record<string, unknown>)[g[2]] = data;
      const problems = checkGuide(raw, g[1], d.access);
      const sensitive = ((raw.guide ?? {}) as { sensitive?: Record<string, string[]> }).sensitive ?? {};
      for (const it of (((raw.items ?? {}) as { items?: ItemRecord[] }).items ?? [])) {
        const w = forbiddenWord(it, d.access, g[1], sensitive);
        if (w) problems.push(`${it.id}: "${w.word}" is only for ${w.only}, but the entry is shown to others`);
      }
      if (problems.length) {
        stop = no(422, 'guide_check', { problems: problems.slice(0, 20) });
        return null;
      }
    }
    return { changes: [{ path, content: text }], result: true };
  });
  if (stop) return stop;
  if (!done) return ok({ ok: true, unchanged: true });
  // The file's new version, so the next save from the same window isn't taken for someone else's change.
  const now = await d.gh.file(path, done.sha);
  return ok({ ok: true, sha: now?.sha ?? '', commit: { sha: done.sha, url: done.url } });
}

type Picture = { bytes: Uint8Array; width: number; height: number } | Out;

/** A picture as sent (base64), cleaned (metadata gone) and checked against the folder's rule. */
function picture(path: string, data: unknown): Picture {
  const rule = pictureRule(path);
  if (!rule) return no(403, 'not_allowed');
  const raw = typeof data === 'string' ? fromBase64(data) : null;
  if (!raw || !raw.length) return no(400, 'invalid_field', { field: 'data' });
  if (raw.length > rule.maxBytes) return no(413, 'too_large', { max: rule.maxBytes });
  const img = cleanImage(raw);
  if ('error' in img) return no(422, img.error);
  if (!rule.kinds.includes(img.kind)) return no(422, 'wrong_type', { kind: img.kind, want: rule.kinds });
  if (Math.max(img.width, img.height) > rule.maxSide) return no(422, 'too_big', { max: rule.maxSide });
  return { bytes: img.bytes, width: img.width, height: img.height };
}

/** Add (or, with replace, replace) a picture: { path, data (base64), replace? }. */
export async function uploadPicture(body: Record<string, unknown>, d: FilesDeps): Promise<Out> {
  const path = typeof body.path === 'string' ? body.path : '';
  const pic = picture(path, body.data);
  if ('status' in pic) return pic;
  const replace = body.replace === true;
  let exists = false;
  const done = await commitOnMain(d.gh, `Admin: add picture ${path}`, async (read) => {
    const cur = await read(path);
    exists = !!cur;
    if (cur && !replace) return null;
    if (cur && same(cur.bytes, pic.bytes)) return null;
    return { changes: [{ path, content: pic.bytes }], result: true, message: cur ? `Admin: replace picture ${path}` : undefined };
  });
  if (exists && !replace) return no(409, 'exists');
  const rule = pictureRule(path)!;
  return ok({ ok: true, path, src: rule.src, width: pic.width, height: pic.height, ...(done ? { commit: { sha: done.sha, url: done.url } } : { unchanged: true }) });
}

const line = (v: unknown, max: number) => (typeof v === 'string' && !/[\r\n<>]/.test(v) ? v.trim().slice(0, max) : '');

/**
 * A new project page: { slug, title, titleZh?, picture: { name, data }, first? }.
 * One commit: its JSON (one picture to start with), the picture, and its
 * place in home.json (first by default).
 */
export async function newProject(body: Record<string, unknown>, d: FilesDeps): Promise<Out> {
  const slug = typeof body.slug === 'string' ? body.slug : '';
  if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(slug)) return no(400, 'invalid_field', { field: 'slug' });
  const title = line(body.title, 120);
  const titleZh = line(body.titleZh, 120);
  if (title.length < 2) return no(400, 'invalid_field', { field: 'title' });
  const p = (body.picture ?? {}) as { name?: unknown; data?: unknown };
  const name = typeof p.name === 'string' ? p.name : '';
  const picPath = `src/assets/images/projects/${slug}/${name}`;
  const pic = picture(picPath, p.data);
  if ('status' in pic) return pic.body.error === 'not_allowed' ? no(400, 'invalid_field', { field: 'picture' }) : pic;
  const first = body.first !== false;
  const jsonPath = `src/content/projects/${slug}.json`;

  let stop: Out | null = null;
  const done = await commitOnMain(d.gh, `Admin: new project ${slug}`, async (read) => {
    stop = null;
    if (await read(jsonPath)) {
      stop = no(409, 'exists');
      return null;
    }
    const homeAt = await read('src/content/home.json');
    const siteAt = await read('src/content/site.json');
    if (!homeAt || !siteAt) {
      stop = no(500, 'failed', { detail: 'home.json or site.json is missing' });
      return null;
    }
    const home = JSON.parse(homeAt.text) as { projects: string[] };
    const siteName = (JSON.parse(siteAt.text) as { name?: string }).name ?? 'Xiangyin Gu';
    const project = {
      title,
      ...(titleZh ? { titleZh } : {}),
      order: home.projects.length + 1,
      seo: { title: `${title} — ${siteName}`, ...(titleZh ? { titleZh: `${titleZh} — ${siteName}` } : {}) },
      sections: [{ theme: 'light', blocks: [{ type: 'image', src: `projects/${slug}/${name}`, alt: '' }] }],
    };
    if (activeContent(project)) {
      stop = no(422, 'active_content');
      return null;
    }
    home.projects = first ? [slug, ...home.projects.filter((s) => s !== slug)] : [...home.projects.filter((s) => s !== slug), slug];
    return {
      changes: [
        { path: jsonPath, content: `${JSON.stringify(project, null, 2)}\n` },
        { path: picPath, content: pic.bytes },
        { path: 'src/content/home.json', content: `${JSON.stringify(home, null, 2)}\n` },
      ],
      result: true,
    };
  });
  if (stop) return stop;
  if (!done) return no(500, 'failed');
  return ok({ ok: true, slug, url: `/image/${slug}`, file: jsonPath, commit: { sha: done.sha, url: done.url } });
}

export type Build = 'live' | 'building' | 'failed' | 'none';

/** The newest commits on main, and whether each one's build went live. */
export async function recentChanges(d: FilesDeps, n = 15): Promise<Out> {
  const commits = await d.gh.recent(n);
  const rows = await Promise.all(
    commits.map(async (c) => {
      let build: Build = 'none';
      let buildUrl = '';
      try {
        const run = (await d.gh.checks(c.sha)).find((r) => /workers builds/i.test(r.name));
        if (run) {
          build = run.status !== 'completed' ? 'building' : run.conclusion === 'success' ? 'live' : 'failed';
          buildUrl = run.url;
        }
      } catch {
        // No checks for this one (or GitHub said no): show it without.
      }
      return { sha: c.sha, message: c.message.split('\n')[0].slice(0, 200), date: c.date, url: c.url, build, buildUrl };
    }),
  );
  return ok({ commits: rows });
}
