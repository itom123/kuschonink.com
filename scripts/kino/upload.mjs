#!/usr/bin/env node
// Kino: put an encoded film (scripts/kino/encode.mjs) into the private R2
// bucket kuschonink-kino, from your own computer.
//
//   node scripts/kino/upload.mjs <film id> <version> [--out kino-out] [--local]
//
// Three ways, picked in this order:
// - --local: into `npm run preview`'s own copy of the bucket (on this computer
//   only), with wrangler, to try a film before it goes live.
// - R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY set in your shell
//   (an R2 API token: R2 → Manage API tokens, "Object Read & Write" on this
//   bucket): fast, six files at a time, through R2's S3 address.
// - otherwise: wrangler, one file at a time (slower), after `npx wrangler login`.
//
// Files already in the bucket with the same size are skipped, so it can be
// run again after a break. Never put these keys in the repository.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const BUCKET = 'kuschonink-kino';
const TYPES = { '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.jpg': 'image/jpeg', '.key': 'application/octet-stream' };

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
const out = resolve(opt('out', 'kino-out'));
const [id, version] = args;
const die = (msg) => {
  console.error(`upload: ${msg}`);
  process.exit(1);
};
if (!id || !version) die('usage: node scripts/kino/upload.mjs <film id> <version> [--out kino-out] [--local]');
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
const total = files.reduce((s, f) => s + f.size, 0);
console.log(`upload: ${files.length} files, ${(total / 1e6).toFixed(1)} MB → ${local ? 'the local bucket (npm run preview)' : `R2 bucket ${BUCKET}`}`);

const wrangler = (f, where) => {
  const r = spawnSync('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${f.key}`, '--file', f.path, '--content-type', f.type, where], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) die(`${f.key}: ${r.stderr || r.stdout}`);
};

let done = 0;
const tick = (f, skipped = false) => {
  done++;
  process.stdout.write(`\rupload: ${done}/${files.length} ${skipped ? '(already there) ' : ''}${f.key}`.padEnd(100).slice(0, 100));
};

if (local) {
  for (const f of files) {
    wrangler(f, '--local');
    tick(f);
  }
} else if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
  const { AwsClient } = await import('aws4fetch');
  const aws = new AwsClient({ accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' });
  const base = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}`;
  const queue = [...files.slice(0, -1)];
  const one = async (f) => {
    const url = `${base}/${f.key.split('/').map(encodeURIComponent).join('/')}`;
    const head = await aws.fetch(url, { method: 'HEAD' });
    if (head.ok && Number(head.headers.get('content-length')) === f.size) return tick(f, true);
    for (let attempt = 1; ; attempt++) {
      const res = await aws.fetch(url, { method: 'PUT', body: readFileSync(f.path), headers: { 'content-type': f.type } });
      if (res.ok) return tick(f);
      if (attempt >= 4) die(`${f.key}: HTTP ${res.status} ${await res.text()}`);
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  };
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let f; (f = queue.shift()); ) await one(f);
  }));
  await one(files[files.length - 1]);
} else {
  console.log('upload: no R2 API token in this shell, so wrangler uploads one file at a time (run `npx wrangler login` first)');
  for (const f of files) {
    wrangler(f, '--remote');
    tick(f);
  }
}
console.log(`\nupload: done. Add the "stream" lines that encode.mjs printed to "${id}" in src/content/kino.json.`);
