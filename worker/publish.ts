// Field Guide (导览): the publisher. Fixed code in the Worker (a cron every ten
// minutes, and Publish Now in the admin queue) that takes the entries the
// routine prepared in Notion (status READY) and commits them to main. The
// routine itself never writes to the repository: it reads strangers' text and
// gallery pages, so it could be tricked, and this code can't be.
//
// For each guide, on the newest main:
// - only the guide's own items.json changes (and routes.json / events.json when
//   a tier change renames an id), plus one picture per entry in its img/ folder;
// - an entry may only use known item fields; the id, tier, audience, picture
//   and "suggested" come from here, never from the entry;
// - a word only some readers may see, in an entry everyone sees → NEEDS CHECK;
// - the guide must pass checkGuide() (the build's own check) with the entry in;
// - one commit, fast-forward only; then PUBLISHING until the site runs that
//   commit (PUBLISHED) or its build fails (taken back in a new commit, ERROR).
// Entries are matched by suggested.ref (the Notion page id), so running twice
// never adds anything twice.
import type { AccessFile, ItemRecord, ItemsFile, TierId } from '../src/lib/guides/types';
import { checkGuide, type RawGuide } from '../src/lib/guides/check.ts';
import { todayIn } from '../src/lib/guides/core.ts';
import type { GuardApi } from './guard.ts';
import { commitOnMain, type Change, type CheckRun, type FileAt, type GitHub } from './github.ts';
import { cleanImage } from './image.ts';
import { P, type Notion } from './notion.ts';
import { isStatus, logProps, readSuggestion, S, type LogEntry, type SuggestionRow } from './suggestions.ts';

export const MAX_PICTURE = 1024 * 1024;
export const MAX_WIDTH = 640;
/**
 * Not live this long after the commit (a build takes about a minute): the site
 * never took it, so it is taken back. When the site's own build isn't known,
 * it is taken as live instead.
 */
const BUILD_WAIT_MS = 45 * 60 * 1000;
const LOCK_S = 600;
const BATCH = 10;

/** The item fields an entry may set. Everything else is the publisher's. */
export const ENTRY_KEYS = new Set([
  'name', 'short', 'subtitle', 'by', 'zone', 'themes', 'why', 'whyZh', 'address', 'hours', 'hoursZh', 'start', 'end', 'open',
  'holiday', 'access', 'exceptions', 'minutes', 'price', 'priceZh', 'note', 'noteZh', 'sourceUrl', 'links', 'listing', 'coordinates', 'image',
]);
const IMAGE_KEYS = new Set(['alt', 'altZh', 'caption']);
/**
 * Every string of an entry, for the sensitive-word check: whatever the views
 * may show, captions, one-day notes and "Suggested by" included. Only the
 * audience tags and the Notion reference are left out: they are never shown.
 */
function readable(v: unknown, key = ''): string[] {
  if (key === 'audience' || key === 'ref') return [];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap((x) => readable(x, key));
  if (v && typeof v === 'object') return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => readable(x, k));
  return [];
}

export interface PublishDeps {
  notion: Notion;
  db: { suggestions: string; log: string };
  gh: GitHub;
  repoUrl: string;
  guard: GuardApi;
  access: AccessFile;
  /** A Notion file link (signed, short-lived) to bytes, or null. */
  download: (url: string) => Promise<Uint8Array | null>;
  /** The commit the running site was built from (its first 12 characters, as its pages carry it), or null when not known. */
  liveBuild: () => Promise<string | null>;
  now: () => number;
  log: (...args: unknown[]) => void;
}

export interface PublishReport {
  skipped?: 'busy';
  committed: { sha: string; refs: string[] }[];
  live: string[];
  takenBack: string[];
  needsCheck: string[];
  errors: string[];
}

export const guideDir = (slug: string) => `src/content/guides/${slug}`;
export const imgPath = (slug: string, id: string) => `public/guides/${slug}/img/${id}.jpg`;
const shaOf = (commitUrl: string) => /\/commit\/([0-9a-f]{40})$/.exec(commitUrl)?.[1] ?? '';
export const stringify = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

/** An audience and everything it includes. */
function closure(access: AccessFile, id: string): Set<string> {
  const out = new Set<string>();
  const walk = (x: string) => {
    if (out.has(x)) return;
    out.add(x);
    for (const y of access.audiences.find((a) => a.id === x)?.includes ?? []) walk(y);
  };
  walk(id);
  return out;
}

/** "Everyone" or an audience id from the Show to column; null when it names no audience of this guide. */
export function audienceOf(showTo: string, access: AccessFile, slug: string): string | undefined | null {
  if (!showTo || showTo === 'Everyone') return undefined;
  return (access.guides[slug] ?? []).includes(showTo) ? showTo : null;
}

/**
 * A word the item's readers mustn't all see. An item without an audience is
 * read by every audience of the guide; `sensitive.<x>` words may only reach
 * audiences that include x.
 */
export function forbiddenWord(item: ItemRecord, access: AccessFile, slug: string, sensitive: Record<string, string[]>): { word: string; only: string } | null {
  const readers = item.audience ? (Array.isArray(item.audience) ? item.audience : [item.audience]) : access.guides[slug] ?? [];
  // Everyone who sees the item: the audiences on the guide's list that include a reader tag.
  const seers = (access.guides[slug] ?? []).filter((a) => readers.some((r) => closure(access, a).has(r)));
  const text = readable(item).join('\n').toLowerCase();
  for (const [aud, words] of Object.entries(sensitive)) {
    if (aud === 'public') continue;
    if (seers.every((s) => closure(access, s).has(aud))) continue; // all who see it may see these words
    for (const w of words) if (w && text.includes(w.toLowerCase())) return { word: w, only: aud };
  }
  return null;
}

/** The next free id in a tier: one more than the highest used (ids are never reused). */
export function nextId(items: ItemRecord[], tier: TierId): string {
  let max = 0;
  for (const i of items) {
    const m = /^([A-C])(\d+)$/.exec(i.id);
    if (m && m[1] === tier) max = Math.max(max, Number(m[2]));
  }
  return `${tier}${max + 1}`;
}

/** Point routes and events at a renamed item. */
export function renameRefs(raw: RawGuide, from: string, to: string): GuideFileChange[] {
  const out: GuideFileChange[] = [];
  const routes = raw.routes as { routes?: { stops: string[] }[] } | undefined;
  if (routes?.routes?.some((r) => r.stops.includes(from))) {
    for (const r of routes.routes) r.stops = r.stops.map((s) => (s === from ? to : s));
    out.push('routes');
  }
  const events = raw.events as { events?: { place?: string }[] } | undefined;
  if (events?.events?.some((e) => e.place === from)) {
    for (const e of events.events) if (e.place === from) e.place = to;
    out.push('events');
  }
  return out;
}
export type GuideFileChange = 'routes' | 'events';

export type Built = { ok: true; item: ItemRecord; picture: Uint8Array | null; note: string } | { ok: false; status: 'NEEDS CHECK' | 'ERROR'; why: string };

/** One READY page as the item to publish (without its id yet), or why it can't be. */
export async function buildItem(row: SuggestionRow, slug: string, guide: { timezone?: string; sensitive?: Record<string, string[]> }, deps: Pick<PublishDeps, 'access' | 'download' | 'now'>): Promise<Built> {
  let entry: Record<string, unknown>;
  try {
    entry = JSON.parse(row.entry);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('not an object');
  } catch {
    return { ok: false, status: 'ERROR', why: 'Entry is not a JSON object.' };
  }
  const extra = Object.keys(entry).filter((k) => !ENTRY_KEYS.has(k));
  if (extra.length) return { ok: false, status: 'NEEDS CHECK', why: `Entry has fields the publisher sets or doesn't know: ${extra.join(', ')}.` };
  const img = entry.image as Record<string, unknown> | undefined;
  if (img !== undefined && (typeof img !== 'object' || img === null || Object.keys(img).some((k) => !IMAGE_KEYS.has(k)))) return { ok: false, status: 'NEEDS CHECK', why: 'Entry image may only give alt, altZh and caption.' };
  const tier = (['A', 'B', 'C'].includes(row.tier) ? row.tier : 'C') as TierId;
  const audience = audienceOf(row.showTo, deps.access, slug);
  if (audience === null) return { ok: false, status: 'NEEDS CHECK', why: `Show to "${row.showTo}" is not an audience of ${slug}.` };
  const on = todayIn(guide.timezone || 'UTC', new Date(deps.now()));
  const item = {
    ...entry,
    id: '',
    tier,
    ...(audience ? { audience } : {}),
    suggested: { on, ...(row.creditAs ? { by: row.creditAs } : {}), ...(row.own ? { own: true } : {}), ref: row.id },
  } as unknown as ItemRecord;
  delete (item as { image?: unknown }).image;
  let picture: Uint8Array | null = null;
  let note = '';
  const web = row.webPictures[0];
  if (web) {
    const bytes = await deps.download(web.url);
    const clean = bytes ? cleanImage(bytes) : null;
    if (!clean || 'error' in clean) note = 'The picture could not be read, so it was left out.';
    else if (clean.kind !== 'jpeg' || clean.bytes.length > MAX_PICTURE || clean.width > MAX_WIDTH) note = `The picture must be a JPEG of at most 640 px and 1 MB (it is ${clean.kind}, ${clean.width} px, ${Math.round(clean.bytes.length / 1024)} KB), so it was left out.`;
    else if (!row.pictureCredit) note = 'The picture has no credit, so it was left out.';
    else {
      picture = clean.bytes;
      item.image = { file: '', credit: row.pictureCredit, ...(typeof img?.caption === 'string' ? { caption: img.caption } : {}), alt: typeof img?.alt === 'string' ? img.alt : `${row.name}`, ...(typeof img?.altZh === 'string' ? { altZh: img.altZh } : {}) };
    }
  }
  const bad = forbiddenWord(item, deps.access, slug, guide.sensitive ?? {});
  if (bad) return { ok: false, status: 'NEEDS CHECK', why: `It contains "${bad.word}", which only ${bad.only} may see. Set "Show to" to ${bad.only}, or take the word out of the entry.` };
  return { ok: true, item, picture, note };
}

const FILES = ['guide', 'items', 'places', 'events', 'routes', 'listings', 'map'] as const;

export async function readGuide(read: (p: string) => Promise<FileAt | null>, slug: string): Promise<RawGuide> {
  const raw: RawGuide = {};
  for (const f of FILES) {
    const at = await read(`${guideDir(slug)}/${f}.json`);
    if (at) raw[f] = JSON.parse(at.text);
  }
  return raw;
}

export async function publish(deps: PublishDeps, trigger: LogEntry['trigger'] = 'scheduled'): Promise<PublishReport> {
  const report: PublishReport = { committed: [], live: [], takenBack: [], needsCheck: [], errors: [] };
  const lock = await deps.guard.claim('publish:lock', LOCK_S);
  if (!lock.fresh) return { ...report, skipped: 'busy' };
  try {
    try {
      await watchBuilds(deps, report);
    } catch (e) {
      // Even when the builds can't be watched, new entries still go in.
      deps.log('publish: could not watch the builds', (e as Error).message);
      report.errors.push((e as Error).message);
    }
    const ready = (await deps.notion.queryAll(deps.db.suggestions, { filter: isStatus('READY'), sorts: [{ timestamp: 'created_time', direction: 'ascending' }] }, BATCH)).map((p) => readSuggestion(p, deps.access));
    const bySlug = new Map<string, SuggestionRow[]>();
    for (const r of ready) {
      if (!Object.hasOwn(deps.access.guides, r.guide)) {
        await mark(deps, r, 'ERROR', `There is no guide "${r.guide}".`);
        report.errors.push(r.reference);
        continue;
      }
      bySlug.set(r.guide, [...(bySlug.get(r.guide) ?? []), r]);
    }
    for (const [slug, rows] of bySlug) {
      try {
        // After a failed build, entries go one per commit, so the next failure names its entry.
        const solo = rows.filter((r) => r.run === 'solo');
        const batches = solo.length ? [[solo[0]]] : [rows];
        for (const batch of batches) await publishBatch(deps, slug, batch, trigger, report);
      } catch (e) {
        // One guide failing holds up no other.
        deps.log('publish: failed for', slug, (e as Error).message);
        report.errors.push(`${slug}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    deps.log('publish: failed', (e as Error).message);
    report.errors.push((e as Error).message);
  } finally {
    await deps.guard.release('publish:lock');
  }
  return report;
}

async function publishBatch(deps: PublishDeps, slug: string, rows: SuggestionRow[], trigger: LogEntry['trigger'], report: PublishReport): Promise<void> {
  const excluded = new Map<string, { status: 'NEEDS CHECK' | 'ERROR'; why: string }>();
  const notes = new Map<string, string>();
  let again = false; // an entry was put aside after the check: build the commit again without it
  const done = await commitOnMain(deps.gh, '', async (read) => {
    again = false;
    const raw = await readGuide(read, slug);
    const guide = (raw.guide ?? {}) as { timezone?: string; sensitive?: Record<string, string[]> };
    const items = (raw.items as ItemsFile).items;
    const ids = new Map<string, string>(); // page id → item id
    const pictures: Change[] = [];
    const touched = new Set<GuideFileChange>();
    let changed = false;
    for (const row of rows) {
      if (excluded.has(row.id)) continue;
      const b = await buildItem(row, slug, guide, deps);
      if (!b.ok) {
        excluded.set(row.id, { status: b.status, why: b.why });
        continue;
      }
      if (b.note) notes.set(row.id, b.note);
      const at = items.findIndex((i) => i.suggested?.ref === row.id);
      const old = at >= 0 ? items[at] : null;
      const id = old && old.tier === b.item.tier ? old.id : nextId(items, b.item.tier);
      b.item.id = id;
      if (b.item.image) b.item.image.file = `${id}.jpg`;
      // The same picture already on main (a second run) isn't committed again.
      if (b.picture && old?.id === id) {
        const prev = await read(imgPath(slug, id));
        if (prev && prev.bytes.length === b.picture.length && prev.bytes.every((x, k) => x === b.picture![k])) b.picture = null;
      }
      if (b.picture) pictures.push({ path: imgPath(slug, id), content: b.picture });
      else if (old?.image && !b.item.image) {
        // No new picture: keep the one already published (moved along if the id changed).
        b.item.image = { ...old.image, file: `${id}.jpg` };
        if (old.id !== id) {
          const prev = await read(imgPath(slug, old.id));
          if (prev) pictures.push({ path: imgPath(slug, id), content: prev.bytes });
          else delete b.item.image;
        }
      }
      if (old && old.id !== id) {
        for (const f of renameRefs(raw, old.id, id)) touched.add(f);
        if (old.image) pictures.push({ path: imgPath(slug, old.id), content: null });
      }
      ids.set(row.id, id);
      // What main already has (an earlier run that couldn't update Notion): nothing to change.
      const same = (x: ItemRecord) => stringify({ ...x, suggested: { ...x.suggested, on: '' } });
      if (old && old.id === id && !b.picture && same(old) === same(b.item)) continue;
      if (old) items[at] = b.item;
      else {
        const lastOfTier = items.map((i) => i.tier).lastIndexOf(b.item.tier);
        items.splice(lastOfTier >= 0 ? lastOfTier + 1 : items.length, 0, b.item);
      }
      changed = true;
    }
    // The build's own check, with these entries in. A problem that names one of them puts that one aside.
    const problems = checkGuide(raw, slug, deps.access);
    if (problems.length) {
      const named = (id: string) => problems.filter((p) => p.includes(` › ${id} `) || p.endsWith(` › ${id}`) || p.includes(` › ${id}:`));
      const mine = [...ids].filter(([, id]) => named(id).length);
      if (!mine.length) throw new Error(`publish: ${slug} fails its check without any new entry: ${problems.slice(0, 3).join(' | ')}`);
      for (const [pageId, id] of mine) excluded.set(pageId, { status: 'ERROR', why: `The guide's check refused it:\n${named(id).slice(0, 4).join('\n')}` });
      again = true;
      return null;
    }
    if (!changed && !touched.size && !pictures.length) return null;
    const list = [...ids].map(([pageId, id]) => `${rows.find((r) => r.id === pageId)?.reference} ${id}`);
    const first = rows.find((r) => ids.has(r.id) && !excluded.has(r.id));
    const message = list.length === 1 && first ? `Field Guide: add ${first.name} (${list[0]}) to ${slug}` : `Field Guide: add ${list.length} suggestions to ${slug} (${list.join(', ')})`;
    const changes: Change[] = [
      { path: `${guideDir(slug)}/items.json`, content: stringify(raw.items) },
      ...[...touched].map((f) => ({ path: `${guideDir(slug)}/${f}.json`, content: stringify(raw[f]) })),
      ...pictures,
    ];
    return { changes, result: ids, message };
  });

  for (const [pageId, x] of excluded) {
    const row = rows.find((r) => r.id === pageId)!;
    await mark(deps, row, x.status, x.why);
    (x.status === 'NEEDS CHECK' ? report.needsCheck : report.errors).push(row.reference);
  }
  const kept = rows.filter((r) => !excluded.has(r.id));
  if (again) {
    // Something failed the check: the rest try again at once, on the newest main.
    if (kept.length) await publishBatch(deps, slug, kept, trigger, report);
    return;
  }
  if (!kept.length) return;
  if (!done) {
    // main already had every entry: they're live.
    for (const r of kept) await mark(deps, r, 'PUBLISHED', `Already in the guide.${notes.get(r.id) ? ` ${notes.get(r.id)}` : ''}`);
    report.live.push(...kept.map((r) => r.reference));
    return;
  }
  report.committed.push({ sha: done.sha, refs: kept.map((r) => r.reference) });
  for (const r of kept) {
    const id = done.result.get(r.id) ?? '';
    await deps.notion.updatePage(r.id, {
      [S.status]: P.select('PUBLISHING'),
      [S.itemId]: P.text(id),
      [S.commit]: P.url(done.url),
      [S.processed]: P.date(new Date(deps.now()).toISOString()),
      [S.result]: P.text(`Committed as ${id}; waiting for the build.${notes.get(r.id) ? ` ${notes.get(r.id)}` : ''}`),
    });
  }
  await addLog(deps, { run: `Publish ${slug}`, trigger, actor: 'publisher', pages: kept.map((r) => `${r.reference} ${r.name}`).join('\n'), outcome: excluded.size ? 'Partial' : 'OK', commit: done.url, details: [...excluded.values()].map((x) => x.why).join('\n') });
}

/**
 * PUBLISHING pages: PUBLISHED once the site runs their commit (or a later one
 * built on it), taken back when their build fails.
 *
 * - Live: the running site's own build id (deps.liveBuild), compared with the
 *   commit on GitHub, which the fine-grained token may do.
 * - Failed: the build's check run says so. The token can't read check runs,
 *   so they are read without it, when GitHub allows (see checks()).
 * - Neither after BUILD_WAIT_MS: the site never took the commit, so it is
 *   taken back too (or taken as live, when the site's build isn't known).
 * Each commit is watched on its own: one that can't be checked now waits for
 * the next run and holds up nothing else.
 */
async function watchBuilds(deps: PublishDeps, report: PublishReport) {
  const rows = (await deps.notion.queryAll(deps.db.suggestions, { filter: isStatus('PUBLISHING') }, 50)).map((p) => readSuggestion(p, deps.access));
  const bySha = new Map<string, SuggestionRow[]>();
  for (const r of rows) {
    const sha = shaOf(r.commit);
    if (sha) bySha.set(sha, [...(bySha.get(sha) ?? []), r]);
  }
  if (!bySha.size) return;
  const live = await deps.liveBuild().catch(() => null);
  for (const [sha, group] of bySha) {
    try {
      await watchCommit(deps, sha, group, live, report);
    } catch (e) {
      deps.log('publish: could not check the build of', sha.slice(0, 12), (e as Error).message);
      report.errors.push(`build ${sha.slice(0, 12)}: ${(e as Error).message}`);
    }
  }
}

/** Check-run endings that say nothing about the entry (a cancelled build too): the site's own build decides. */
const NO_VERDICT = new Set(['neutral', 'skipped', 'cancelled', 'stale']);

async function watchCommit(deps: PublishDeps, sha: string, group: SuggestionRow[], live: string | null, report: PublishReport) {
  const published = async (how = '') => {
    for (const r of group) await mark(deps, r, 'PUBLISHED', `Live as ${r.itemId}${how}.`);
    report.live.push(...group.map((r) => r.reference));
  };
  if (live && (sha.startsWith(live) || ['ahead', 'identical'].includes((await deps.gh.compare(sha, live))?.status ?? ''))) return published();
  let build: CheckRun | undefined;
  try {
    const runs = await deps.gh.checks(sha);
    build = runs.find((c) => /workers builds/i.test(c.name)) ?? runs[0];
  } catch {
    // Not readable now (GitHub's allowance without a token is used up): wait.
  }
  const done = build?.status === 'completed' ? build.conclusion ?? '' : '';
  if (done === 'success') return published();
  if (build && done && !NO_VERDICT.has(done)) {
    const why = [build.title, build.summary].filter(Boolean).join(': ').slice(0, 600) || `the build ${done}`;
    return takeBackGroup(deps, group, { what: 'The build failed', why, link: build.url }, report);
  }
  const age = deps.now() - Date.parse(group[0].processed || new Date(0).toISOString());
  if (age <= BUILD_WAIT_MS) return;
  if (!live) return published(" (its build couldn't be checked)");
  await takeBackGroup(deps, group, { what: `It didn't go live within ${BUILD_WAIT_MS / 60000} minutes`, why: `the site still runs ${live}`, link: '' }, report);
}

/** Take a commit's entries back. Alone in it, an entry is the one that broke the build (ERROR); with others, each tries again on its own. */
async function takeBackGroup(deps: PublishDeps, group: SuggestionRow[], f: { what: string; why: string; link: string }, report: PublishReport) {
  const back = await takeBack(deps, group);
  for (const r of group) {
    if (group.length === 1) await mark(deps, r, 'ERROR', `${f.what} (${f.why}). Taken back in ${back ?? 'no commit'}.${f.link ? ` ${f.link}` : ''}`);
    else await deps.notion.updatePage(r.id, { [S.status]: P.select('READY'), [S.run]: P.text('solo'), [S.result]: P.text(`${f.what} with other entries (${f.why}); trying again on its own.`) });
  }
  report.takenBack.push(...group.map((r) => r.reference));
  await addLog(deps, { run: 'Take back', trigger: 'scheduled', actor: 'publisher', pages: group.map((r) => r.reference).join('\n'), outcome: 'Failed', commit: back ?? undefined, details: f.why });
}

/** Remove these entries (by ref) and their pictures from main, in one commit. */
async function takeBack(deps: PublishDeps, rows: SuggestionRow[]): Promise<string | null> {
  const slug = rows[0].guide;
  const refs = new Set(rows.map((r) => r.id));
  const done = await commitOnMain(deps.gh, `Field Guide: take back ${rows.map((r) => r.reference).join(', ')} (the build failed)`, async (read) => {
    const at = await read(`${guideDir(slug)}/items.json`);
    if (!at) return null;
    const file = JSON.parse(at.text) as ItemsFile;
    const gone = file.items.filter((i) => i.suggested && refs.has(i.suggested.ref));
    if (!gone.length) return null;
    file.items = file.items.filter((i) => !(i.suggested && refs.has(i.suggested.ref)));
    const changes: Change[] = [{ path: `${guideDir(slug)}/items.json`, content: stringify(file) }];
    for (const i of gone) if (i.image && (await read(imgPath(slug, i.id)))) changes.push({ path: imgPath(slug, i.id), content: null });
    return { changes, result: null };
  });
  return done?.url ?? null;
}

async function mark(deps: PublishDeps, r: SuggestionRow, status: 'PUBLISHED' | 'NEEDS CHECK' | 'ERROR', why: string) {
  await deps.notion.updatePage(r.id, { [S.status]: P.select(status), [S.result]: P.text(why.slice(0, 1900)), [S.processed]: P.date(new Date(deps.now()).toISOString()) });
}

async function addLog(deps: PublishDeps, e: LogEntry) {
  try {
    await deps.notion.createPage(deps.db.log, logProps(e, new Date(deps.now())));
  } catch (x) {
    deps.log('publish: could not write the log', (x as Error).message);
  }
}
