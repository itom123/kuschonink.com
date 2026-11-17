#!/usr/bin/env node
// Kino: put an encoded film (scripts/kino/encode.mjs) into the private R2
// bucket kuschonink-kino, from your own computer (Windows, macOS or Linux).
//
//   node scripts/kino/upload.mjs <film id> <version> [--out kino-out] [--local] [--keep-old]
//
// Old versions go first, to save space. Before uploading, it removes this
// film's other versions:
// - from R2: the version src/content/kino.json lists for the film (with an R2
//   API token, below: every other version in the bucket). The film is then off
//   the Kino until kino.json lists the new version.
// - from kino-out/ on this computer: every other version of the film.
// --keep-old keeps them.
//
// Three ways to upload, picked in this order:
// - --local: into `npm run preview`'s own copy of the bucket (on this computer
//   only), to try a film before it goes live.
// - R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY set in your shell
//   (an R2 API token: R2 → Manage API tokens, "Object Read & Write" on this
//   bucket): the fastest, through R2's S3 address.
// - otherwise: wrangler, after `npx wrangler login`, six files at a time.
//
// It can be run again after a break: what is already up is skipped. Never put
// these keys in the repository.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pieces, variants } from './ladder.mjs';

const BUCKET = 'kuschonink-kino';
const TYPES = { '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.jpg': 'image/jpeg', '.key': 'application/octet-stream' };
const AT_ONCE = 6;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const local = flag('local');
const keepOld = flag('keep-old');
const out = resolve(opt('out', 'kino-out'));
const [id, version] = args;
const die = (msg) => {
  console.error(`\nupload: ${msg}`);
  process.exit(1);
};
if (!id || !version) die('usage: node scripts/kino/upload.mjs <film id> <version> [--out kino-out] [--local] [--keep-old]');
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !/^v\d{8}[a-z]?$/.test(version)) die('a film id is lower-case letters, digits and hyphens; a version is v + YYYYMMDD + an optional letter');
const dir = join(out, 'films', id, version);
const keyFile = join(out, 'keys', id, `${version}.key`);
if (!existsSync(join(dir, 'master.m3u8'))) die(`nothing encoded at ${dir} (run scripts/kino/encode.mjs first)`);
if (!existsSync(keyFile)) die(`no key at ${keyFile}`);

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.startsWith('.') ? [] : [join(d, e.name)]));
// The key last: a film is only playable once every piece is there.
const files = [...walk(dir), keyFile].map((path) => {
  const key = relative(out, path).split(sep).join('/');
  const ext = path.slice(path.lastIndexOf('.'));
  if (!TYPES[ext]) die(`unexpected file ${path}`);
  return { path, key, type: TYPES[ext], size: statSync(path).size };
});

const s3 = !local && process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY ? await s3Client() : null;
const where = local ? 'the local bucket (npm run preview)' : `R2 bucket ${BUCKET}`;

// ---- Wrangler, started with this very Node (on Windows npx is a .cmd file, which can't be started directly) ----

const require = createRequire(import.meta.url);
const wranglerPkg = require.resolve('wrangler/package.json');
const wranglerBin = join(dirname(wranglerPkg), JSON.parse(readFileSync(wranglerPkg, 'utf8')).bin.wrangler);

/** Runs wrangler; resolves { code, out (Buffer), err (text) }. */
function wrangler(a) {
  return new Promise((done) => {
    const p = spawn(process.execPath, [wranglerBin, ...a], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const o = [];
    let err = '';
    p.stdout.on('data', (b) => o.push(b));
    p.stderr.on('data', (b) => (err += b));
    p.on('error', (e) => done({ code: -1, out: Buffer.alloc(0), err: e.message }));
    p.on('close', (code) => done({ code, out: Buffer.concat(o), err }));
  });
}
const place = local ? '--local' : '--remote';
// Wrangler's messages, without its colours and banners.
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').split('\n').map((l) => l.trim()).filter((l) => l && !/^(⛅️|─|🪵|▲ \[WARNING\] Proxy)/.test(l)).join(' ').slice(0, 400);

/** Tries a job up to four times, waiting longer each time. */
async function retry(what, job) {
  for (let attempt = 1; ; attempt++) {
    const r = await job();
    if (r.ok) return r;
    if (attempt >= 4) die(`${what}: ${r.why}`);
    await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
  }
}

/** Runs `job` over `items`, AT_ONCE at a time. */
async function pool(items, job) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, queue.length) }, async () => {
    for (let x; (x = queue.shift()) !== undefined; ) await job(x);
  }));
}

const bucketOps = {
  /** An object's text, or null when it isn't there. */
  async get(key) {
    if (s3) {
      const res = await s3.fetch(s3.url(key));
      if (res.status === 404) return null;
      if (!res.ok) die(`${key}: HTTP ${res.status}`);
      return res.text();
    }
    const r = await wrangler(['r2', 'object', 'get', `${BUCKET}/${key}`, place, '--pipe']);
    if (r.code === 0) return r.out.toString('utf8');
    if (/does not exist|NoSuchKey|not found/i.test(r.err)) return null;
    die(`${key}: ${plain(r.err)}`);
  },
  async put(f) {
    if (s3) {
      return retry(f.key, async () => {
        const res = await s3.fetch(s3.url(f.key), { method: 'PUT', body: readFileSync(f.path), headers: { 'content-type': f.type } });
        return { ok: res.ok, why: `HTTP ${res.status} ${await res.text()}` };
      });
    }
    return retry(f.key, async () => {
      const r = await wrangler(['r2', 'object', 'put', `${BUCKET}/${f.key}`, '--file', f.path, '--content-type', f.type, place]);
      return { ok: r.code === 0, why: plain(r.err || r.out.toString('utf8')) };
    });
  },
  async del(key) {
    if (s3) {
      return retry(key, async () => {
        const res = await s3.fetch(s3.url(key), { method: 'DELETE' });
        return { ok: res.ok || res.status === 404, why: `HTTP ${res.status}` };
      });
    }
    return retry(key, async () => {
      const r = await wrangler(['r2', 'object', 'delete', `${BUCKET}/${key}`, place]);
      return { ok: r.code === 0, why: plain(r.err || r.out.toString('utf8')) };
    });
  },
};

async function s3Client() {
  const { AwsClient } = await import('aws4fetch');
  const aws = new AwsClient({ accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' });
  const base = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}`;
  return {
    fetch: (url, init) => aws.fetch(url, init),
    url: (key) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`,
    /** Every key under a prefix. */
    async list(prefix) {
      const keys = [];
      let token = '';
      do {
        const res = await aws.fetch(`${base}?list-type=2&prefix=${encodeURIComponent(prefix)}${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`);
        if (!res.ok) die(`listing ${prefix}: HTTP ${res.status}`);
        const xml = await res.text();
        for (const m of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? (/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1] ?? '') : '';
      } while (token);
      return keys;
    },
  };
}

let done = 0;
let count = 0;
const tick = (label, key) => {
  done++;
  process.stdout.write(`\rupload: ${label} ${done}/${count} ${key}`.padEnd(110).slice(0, 110));
};

// ---- 1. The old versions go first ----

if (keepOld) {
  console.log('upload: --keep-old: the old versions stay');
} else {
  // On this computer: the film's other versions in kino-out/.
  const others = existsSync(join(out, 'films', id)) ? readdirSync(join(out, 'films', id)).filter((v) => v !== version && /^v\d{8}[a-z]?$/.test(v)) : [];
  const oldKeys = existsSync(join(out, 'keys', id)) ? readdirSync(join(out, 'keys', id)).filter((f) => f.endsWith('.key') && f !== `${version}.key`) : [];
  for (const v of others) rmSync(join(out, 'films', id, v), { recursive: true, force: true });
  for (const f of oldKeys) rmSync(join(out, 'keys', id, f), { force: true });
  const notes = new RegExp(`^\\.uploaded-(?:local|r2)-${id}-(v\\d{8}[a-z]?)\\.txt$`);
  for (const f of readdirSync(out)) if (notes.exec(f)?.[1] && notes.exec(f)[1] !== version) rmSync(join(out, f), { force: true });
  if (others.length || oldKeys.length) console.log(`upload: removed from kino-out on this computer: ${[...new Set([...others, ...oldKeys.map((f) => f.slice(0, -4))])].join(', ')}`);

  // In the bucket.
  let gone = [];
  if (s3) {
    // With a token the bucket can be listed: every other version of this film.
    gone = [...(await s3.list(`films/${id}/`)), ...(await s3.list(`keys/${id}/`))].filter((k) => !k.startsWith(`films/${id}/${version}/`) && k !== `keys/${id}/${version}.key`);
  } else {
    const kino = JSON.parse(readFileSync(join(ROOT, 'src/content/kino.json'), 'utf8'));
    const old = kino.films?.find((f) => f.id === id)?.stream?.version;
    if (old && old !== version) {
      console.log(`upload: finding the old version ${old} of "${id}" in ${where}…`);
      const base = `films/${id}/${old}`;
      const top = await bucketOps.get(`${base}/master.m3u8`);
      if (top !== null) {
        for (const v of variants(top)) {
          if (!/^\d{3,4}p\/index\.m3u8$/.test(v)) continue;
          const size = v.slice(0, v.indexOf('/'));
          const list = await bucketOps.get(`${base}/${v}`);
          if (list !== null) gone.push(...pieces(list).filter((p) => /^seg_\d{5}\.ts$/.test(p.uri)).map((p) => `${base}/${size}/${p.uri}`));
          gone.push(`${base}/${v}`);
        }
      }
      // The pieces first, the playlists, poster and key last: if this stops half-way, running it again finds the rest.
      gone.push(`${base}/master.m3u8`, `${base}/poster.jpg`, `keys/${id}/${old}.key`);
    } else if (!old) {
      console.log(`upload: kino.json lists no other version of "${id}", so there is nothing old to remove from ${where}`);
    }
  }
  if (gone.length) {
    console.log(`upload: removing ${gone.length} old files of "${id}" from ${where}. The film is off the Kino until kino.json lists the new version.`);
    done = 0;
    count = gone.length;
    await pool(gone, async (k) => {
      await bucketOps.del(k);
      tick('removed', k);
    });
    console.log('');
  }
}

// ---- 2. The new version ----

// What is already up (this computer keeps a note), so a second run goes on where the first stopped.
const note = join(out, `.uploaded-${local ? 'local' : 'r2'}-${id}-${version}.txt`);
const up = new Set(existsSync(note) ? readFileSync(note, 'utf8').split('\n').filter(Boolean) : []);
const todo = files.filter((f) => !up.has(`${f.key} ${f.size}`));
const total = todo.reduce((n, f) => n + f.size, 0);
console.log(`upload: ${todo.length} files, ${(total / 1e6).toFixed(1)} MB → ${where}${todo.length < files.length ? ` (${files.length - todo.length} already there)` : ''}`);
if (!s3 && !local) console.log('upload: with wrangler (run `npx wrangler login` first if it asks)');

const putOne = async (f) => {
  await bucketOps.put(f);
  appendFileSync(note, `${f.key} ${f.size}\n`);
  tick('put', f.key);
};
done = 0;
count = todo.length;
const last = todo.find((f) => f.path === keyFile);
await pool(todo.filter((f) => f !== last), putOne);
if (last) await putOne(last);
console.log(`\nupload: done. Add the "seconds" and "stream" lines that encode.mjs printed to "${id}" in src/content/kino.json.`);
