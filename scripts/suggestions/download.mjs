#!/usr/bin/env node
// The routine's downloader. The routine's own repository, itom123/kuschonink-routine,
// is a copy that its GitHub Action makes with this (scripts/suggestions/routine-repo/),
// so that the routine never has this repository attached; you can also run it by
// hand. It takes the files the tool needs from raw.githubusercontent.com, every
// one from the same commit: the one the live site runs (the build id in its
// pages, which the publisher also goes by), or main when the site gives none. It
// only makes GET requests, and only writes into the folder it is given, which
// must be new or empty; given a folder it filled before, it takes nothing again
// and prints the same. The folder works wherever it is moved or cloned to. Plain
// Node, no packages, so it runs before anything is installed.
//
//   node download.mjs <folder> [--commit <id>|main]
//
// Into the folder, at their paths in the repository:
//   - scripts/suggestions/tool.mts and every module it imports, followed the
//     way Node loads them (type-only imports aside, since Node drops them);
//   - wrangler.jsonc (the Notion database ids), src/content/guides/access.json
//     and each guide's JSON files;
//   - scripts/suggestions/ROUTINE.md at that commit: the run's instructions;
//   - package.json: the .ts files are ES modules, and the packages the tool
//     imports (sharp) at the repository's versions, for `npm install`;
//   - tool: a script that runs the tool with the `node` on PATH, from any
//     folder (`./tool list`, `<folder>/tool list`);
//   - .download.json: which commit it took and its files (no paths of this
//     machine), for the routine's log and for a second run on the same folder.
// Then it starts the tool once, to check it loads, and prints what it took.
//
// KUS_RAW and KUS_SITE point it at stand-ins (scripts/suggestions/tool.test.mts).
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENTRY = 'scripts/suggestions/tool.mts';
export const ROUTINE = 'scripts/suggestions/ROUTINE.md';
/** A guide's files, as GUIDE_FILES in src/lib/guides/check.ts (tool.test.mts checks they agree). */
export const GUIDE_FILES = ['guide', 'items', 'places', 'events', 'routes', 'listings', 'map'];
const DATA = ['wrangler.jsonc', 'src/content/guides/access.json', ROUTINE];
/** In the folder, next to the repository's files: what the download printed. */
export const MARK = '.download.json';
const RAW = (process.env.KUS_RAW || 'https://raw.githubusercontent.com/itom123/kuschonink.com').replace(/\/+$/, '');
const SITE = process.env.KUS_SITE || 'https://kuschonink.com/';
const UA = 'kuschonink.com Field Guide (https://kuschonink.com)';
const COMMIT = /^(?:[0-9a-f]{7,40}|main)$/;

class Refusal extends Error {}

// ---------------------------------------------------------------------------
// Which modules a file loads. Comments, strings, template literals and regex
// literals are taken out first, so that a mention in a comment or a string is
// never an import (the same scanner as the Worker's guide-content check in
// worker/guides.test.mts). Each string becomes "\u0001<n>", kept in strs[n].

const KW = /(?:^|[^\w$.])(?:return|typeof|case|do|else|in|of|throw|new|delete|void|yield|await|instanceof)\s*$/;
function code(src) {
  const strs = [];
  let text = '';
  for (let i = 0; i < src.length; ) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); text += ' '; i = e < 0 ? src.length : e + 2; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      text += `"\u0001${strs.length}"`; strs.push(src.slice(i + 1, j)); i = j + 1; continue;
    }
    if (c === '`') {
      let j = i + 1, depth = 0;
      for (; j < src.length; j++) {
        if (src[j] === '\\') { j++; continue; }
        if (depth === 0 && src[j] === '`') break;
        if (src[j] === '$' && src[j + 1] === '{') { depth++; j++; } else if (depth && src[j] === '{') depth++; else if (depth && src[j] === '}') depth--;
      }
      text += '``'; i = j + 1; continue;
    }
    if (c === '/') { // a regex literal, unless what comes before makes this a division
      const prev = text.trimEnd();
      if (!prev || '(,=:[!&|?{};+-*%<>~^'.includes(prev.slice(-1)) || KW.test(prev)) {
        let j = i + 1, cls = false;
        for (; j < src.length && src[j] !== '\n'; j++) {
          if (src[j] === '\\') { j++; continue; }
          if (cls) cls = src[j] !== ']'; else if (src[j] === '[') cls = true; else if (src[j] === '/') break;
        }
        while (/[a-z]/.test(src[j + 1] ?? '')) j++;
        text += '/./'; i = j + 1; continue;
      }
    }
    text += c; i++;
  }
  return { text, strs };
}
// import x from "s" | import "s" | export * from "s" | export { a } from "s": [1] = type-only, [2] = the string
const STATIC = /(?<![\w$.])(?:import|export)\s*(type\s+(?!from\b))?(?:(?:(?!\b(?:import|export)\b)[\w$*{}\s,])*?\s*from\s*)?"\u0001(\d+)"/g;
const DYNAMIC = /(?<![\w$.])import\s*\(\s*(?:"\u0001(\d+)"|(`)|([^\s)]))/g;

/** The specifiers a module loads when Node runs it: static and dynamic imports, re-exports, side-effect imports. */
export function imports(src, where = 'a module') {
  const { text, strs } = code(src);
  const out = [];
  for (const m of text.matchAll(STATIC)) if (!m[1]) out.push(strs[+m[2]]);
  for (const m of text.matchAll(DYNAMIC)) {
    if (m[1] === undefined) throw new Refusal(`${where} has an import(…) of something other than a plain string, which can't be followed`);
    out.push(strs[+m[1]]);
  }
  return out;
}
const packageOf = (spec) => spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/');

// ---------------------------------------------------------------------------

/** One file of the repository at a commit; null for a missing optional one. Retries on 429 and 5xx. */
async function get(commit, path, optional = false) {
  if (!/^(?:[\w.-]+\/)*[\w.-]+$/.test(path) || path.split('/').some((s) => s === '.' || s === '..')) throw new Refusal(`not a path in the repository: ${path}`);
  let last = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000 * attempt));
    try {
      const res = await fetch(`${RAW}/${commit}/${path}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status === 404) {
        if (optional) return null;
        throw new Refusal(`${path} isn't in ${commit} (HTTP 404)`);
      }
      last = `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      if (e instanceof Refusal) throw e;
      last = e.cause?.message ?? e.message;
    }
  }
  throw new Refusal(`couldn't download ${path} at ${commit}: ${last}`);
}

/** At most n at a time, in order. */
async function all(list, fn, n = 8) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await fn(list[i]); }
  }));
  return out;
}

/** The commit the live site runs: the build id in its pages (src/lib/build.ts), as worker/index.ts reads it. */
async function liveBuild() {
  try {
    const res = await fetch(SITE, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return { why: `the site answered HTTP ${res.status}` };
    const id = /<meta\s+name="kus98-build"\s+content="([0-9a-f]{12})"/.exec(await res.text())?.[1];
    return id ? { id } : { why: 'the site gave no build id' };
  } catch (e) {
    return { why: `the site didn't answer (${e.cause?.message ?? e.message})` };
  }
}

const lf = (b) => b.toString('utf8').replace(/\r\n/g, '\n');

/** What an earlier, complete download into this folder took; null if there was none. */
function earlier(folder) {
  try {
    const took = JSON.parse(readFileSync(join(folder, MARK), 'utf8'));
    return COMMIT.test(took?.commit) && existsSync(join(folder, 'tool')) ? took : null;
  } catch {
    return null;
  }
}

/** What it prints: what it took, and where it is on this machine. The instructions are the commit's, so that they go with its tool. */
const printed = (folder, took) => ({
  commit: took.commit,
  why: took.why,
  folder,
  tool: join(folder, 'tool'),
  instructions: `read ${join(folder, ...ROUTINE.split('/'))} and follow it`,
  guides: took.guides,
  packages: took.packages,
  files: took.files,
});

export async function download(args) {
  args = [...args];
  const at = args.indexOf('--commit');
  const asked = at < 0 ? undefined : args.splice(at, 2)[1] ?? '';
  if (args.length !== 1) throw new Refusal('usage: node download.mjs <folder> [--commit <id>|main]');
  const folder = resolve(args[0]);
  if (asked !== undefined && !COMMIT.test(asked)) throw new Refusal(`"${asked}" is not a commit id or main`);
  if (existsSync(folder) && readdirSync(folder).length) {
    // Run again on the same folder, it goes on with the files it took the first time.
    const took = earlier(folder);
    if (!took) throw new Refusal(`${folder} is not empty: use a new, empty folder`);
    if (asked !== undefined && !(took.commit.startsWith(asked) || asked.startsWith(took.commit))) {
      throw new Refusal(`${folder} already holds ${took.commit}: use a new, empty folder for ${asked}`);
    }
    return { ...printed(folder, took), reused: 'downloaded into this folder before: nothing taken again' };
  }

  let commit = asked;
  let why = 'the commit asked for';
  if (!commit) {
    const live = await liveBuild();
    commit = live.id ?? 'main';
    why = live.id ? `the commit the live site runs (its build id, from ${SITE})` : `main, since ${live.why}`;
  }

  const files = new Map(); // path in the repository → bytes
  const packages = new Set();
  // The tool and every module it loads, wave by wave.
  const wanted = new Set([ENTRY]);
  for (let wave = [ENTRY]; wave.length; ) {
    const got = await all(wave, (p) => get(commit, p));
    const next = [];
    wave.forEach((from, i) => {
      files.set(from, got[i]);
      if (from.endsWith('.json')) return;
      for (const spec of imports(got[i].toString('utf8'), from)) {
        if (!/^\.{1,2}\//.test(spec)) {
          if (isBuiltin(spec)) continue;
          if (/^[a-z][\w+.-]*:|^[/\\]/i.test(spec)) throw new Refusal(`${from} imports ${spec}, which can't be downloaded`);
          packages.add(packageOf(spec));
          continue;
        }
        const to = posix.normalize(posix.join(posix.dirname(from), spec));
        if (to.startsWith('../')) throw new Refusal(`${from} imports ${spec}, outside the repository`);
        if (!/\.(?:[cm]?[jt]s|json)$/.test(to)) throw new Refusal(`${from} imports ${spec} without its file extension, which Node can't load`);
        if (!wanted.has(to)) { wanted.add(to); next.push(to); }
      }
    });
    wave = next;
  }

  // What the tool reads: the Notion ids, who may see which guide, each guide's files.
  const data = await all(DATA, (p) => get(commit, p));
  DATA.forEach((p, i) => files.set(p, data[i]));
  let guides;
  try {
    guides = Object.keys(JSON.parse(lf(files.get('src/content/guides/access.json'))).guides ?? {});
  } catch (e) {
    throw new Refusal(`access.json at ${commit} is not JSON: ${e.message}`);
  }
  for (const slug of guides) if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Refusal(`access.json names a guide "${slug}", which is not a folder name`);
  const own = guides.flatMap((slug) => GUIDE_FILES.map((f) => `src/content/guides/${slug}/${f}.json`));
  const got = await all(own, (p) => get(commit, p, true));
  own.forEach((p, i) => { if (got[i]) files.set(p, got[i]); });

  // The packages the tool imports, at the versions the repository names.
  const repo = JSON.parse(lf(await get(commit, 'package.json')));
  const dependencies = {};
  for (const name of [...packages].sort()) {
    dependencies[name] = repo.dependencies?.[name] ?? repo.devDependencies?.[name] ?? '';
    if (!dependencies[name]) throw new Refusal(`the tool imports ${name}, which package.json doesn't name`);
  }

  mkdirSync(folder, { recursive: true });
  for (const [p, bytes] of files) {
    const to = join(folder, ...p.split('/'));
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, bytes);
  }
  writeFileSync(join(folder, 'package.json'), `${JSON.stringify({ private: true, type: 'module', dependencies }, null, 2)}\n`);
  const tool = join(folder, ...ENTRY.split('/'));
  writeFileSync(join(folder, 'tool'), [
    '#!/bin/sh',
    `# The routine's tool, from ${commit}: ${ENTRY} next to this script, wherever the`,
    "# folder is, with the node on PATH. NODE_USE_ENV_PROXY: Node's fetch goes through",
    '# the proxy in HTTPS_PROXY, as curl and npm do, when the session names one.',
    'export NODE_USE_ENV_PROXY=1',
    `exec node --experimental-strip-types --no-warnings "$(dirname "$0")/${ENTRY}" "$@"`,
    '',
  ].join('\n'));
  chmodSync(join(folder, 'tool'), 0o755);

  // Start it once: it prints its commands if every module it loads is here and this Node can run it.
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', tool], { cwd: folder, encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0 || !/\blist\b/.test(r.stdout ?? '')) {
    throw new Refusal(`the tool doesn't start (${process.version}): ${(r.stderr || r.stdout || String(r.error ?? '')).trim().split('\n').slice(0, 8).join(' | ')}`);
  }
  const took = { commit, why, guides, packages: dependencies, files: [...files.keys()].sort() };
  writeFileSync(join(folder, MARK), `${JSON.stringify(took, null, 2)}\n`); // last, so only a complete download has one
  return printed(folder, took);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  download(process.argv.slice(2)).then(
    (done) => console.log(JSON.stringify(done, null, 2)),
    (e) => {
      console.error(`download: ${e instanceof Refusal ? e.message : (e?.stack ?? e)}`);
      process.exit(1);
    },
  );
}
