#!/usr/bin/env node
// npm run build, after the guard: a branch must have every entry that main's
// publisher added. The publisher commits approved suggestions straight to main
// (worker/publish.ts), so a branch made earlier lacks them: its preview shows an
// older guide, and a merge that resolves items.json carelessly would drop them.
//
// On any branch but main, this compares the branch's guides with main's, read
// from raw.githubusercontent.com, and fails the build when main has a published
// entry (one with `suggested`) that the branch doesn't, or a guide the branch
// doesn't. Merging main into the branch fixes it. Entries the branch has and
// main no longer does are only reported: raw.githubusercontent.com can serve main
// a few minutes old. When GitHub can't be reached, it only warns: a build never
// waits on GitHub.
//
// KUS_MAIN_RAW, KUS_BRANCH and KUS_GUIDES_ROOT point it at stand-ins (guides-main.test.mts).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.env.KUS_GUIDES_ROOT || fileURLToPath(new URL('..', import.meta.url)));
const RAW = (process.env.KUS_MAIN_RAW || 'https://raw.githubusercontent.com/itom123/kuschonink.com/main').replace(/\/+$/, '');
const GUIDES = 'src/content/guides';

/** The branch being built: Workers Builds names it; on a computer, git does. */
function branch() {
  if (process.env.KUS_BRANCH !== undefined) return process.env.KUS_BRANCH;
  if (process.env.WORKERS_CI_BRANCH) return process.env.WORKERS_CI_BRANCH;
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

class Offline extends Error {}

async function mainJson(path) {
  let res;
  try {
    res = await fetch(`${RAW}/${path}`, { signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new Offline(`${path}: ${e.cause?.message ?? e.message}`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Offline(`${path}: HTTP ${res.status}`);
  return JSON.parse(await res.text());
}

const here = (path) => {
  const file = join(ROOT, ...path.split('/'));
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
};
const published = (items) => new Map((items?.items ?? []).filter((i) => i?.suggested?.ref).map((i) => [i.suggested.ref, i]));

/** Problems (fail the build) and notes (only said), comparing this branch's guides with main's. */
export async function compareWithMain() {
  const problems = [];
  const notes = [];
  const mainAccess = await mainJson(`${GUIDES}/access.json`);
  const access = here(`${GUIDES}/access.json`) ?? {};
  for (const slug of Object.keys(mainAccess?.guides ?? {}).filter((s) => !s.startsWith('_'))) {
    // The branch may have renamed the guide: access.json "moved" sends main's name to the new one.
    const mine = Object.hasOwn(access.guides ?? {}, slug) ? slug : access.moved?.[slug];
    if (!mine || !Object.hasOwn(access.guides ?? {}, mine)) {
      problems.push(`main has the guide ${slug}, which this branch doesn't.`);
      continue;
    }
    const theirs = published(await mainJson(`${GUIDES}/${slug}/items.json`));
    const ours = published(here(`${GUIDES}/${mine}/items.json`));
    for (const [ref, i] of theirs) {
      if (!ours.has(ref)) problems.push(`${mine}: main has ${i.id} "${i.name}" (suggestion ${ref}), which this branch doesn't.`);
    }
    for (const [ref, i] of ours) {
      if (!theirs.has(ref)) notes.push(`${mine}: this branch has ${i.id} "${i.name}" (suggestion ${ref}), which main doesn't (any more).`);
    }
  }
  return { problems, notes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const name = branch();
  if (!name || name === 'main' || name === 'HEAD') {
    console.log(`Guides against main: ${name === 'main' ? 'this is main' : 'no branch name'}, nothing to compare.`);
    process.exit(0);
  }
  try {
    const { problems, notes } = await compareWithMain();
    for (const n of notes) console.log(`Guides against main (note): ${n}`);
    if (problems.length) {
      console.error(`Guides against main: the branch ${name} is behind main's guides.\n${problems.map((p) => `  - ${p}`).join('\n')}\nMerge main into this branch (GitHub: Update branch), then build again.`);
      process.exit(1);
    }
    console.log(`Guides against main: ${name} has every entry main published.`);
  } catch (e) {
    if (!(e instanceof Offline)) throw e;
    console.warn(`Guides against main: couldn't read main (${e.message}), so not compared.`);
  }
}
