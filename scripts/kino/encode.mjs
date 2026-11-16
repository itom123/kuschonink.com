#!/usr/bin/env node
// Kino: encode a film for the cinema, on your own computer.
//
//   node scripts/kino/encode.mjs <master file> <film id> [--version v20261116a] [--out kino-out] [--preset slow] [--crf 18]
//
// Needs ffmpeg and ffprobe (https://ffmpeg.org; on a Mac: brew install ffmpeg).
// Makes, in kino-out/ (gitignored), exactly what the private R2 bucket holds:
//
//   films/<id>/<version>/master.m3u8        every size, largest first
//   films/<id>/<version>/<size>/index.m3u8   one size's pieces
//   films/<id>/<version>/<size>/seg_00000.ts six-second pieces, encrypted (AES-128)
//   films/<id>/<version>/poster.jpg          a frame from a tenth of the way in
//   keys/<id>/<version>.key                  the key (16 random bytes)
//
// Sizes: the master's own (never larger), then each standard one below it
// (1080p, 720p, 480p, 360p for a 1080p master). H.264 High, CRF 18 capped per
// size (12 Mbit/s at 1080p), a keyframe every 2 seconds, AAC 192k. Then:
//   node scripts/kino/upload.mjs <film id> <version>
// and paste the printed lines into src/content/kino.json (docs/KINO.md).
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bandwidth, ladder, levelFor, master, pieces, rate, versionFor } from './ladder.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const out = resolve(opt('out', 'kino-out'));
const preset = opt('preset', 'slow');
const crf = opt('crf', '18');
let version = opt('version', '');
const [input, id] = args;
const die = (msg) => {
  console.error(`encode: ${msg}`);
  process.exit(1);
};
if (!input || !id) die('usage: node scripts/kino/encode.mjs <master file> <film id> [--version v20261116a] [--out kino-out]');
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) die(`"${id}" is not a film id (lower-case letters, digits and hyphens)`);
if (!existsSync(input)) die(`no file ${input}`);
if (!version) {
  for (const l of 'abcdefghijklmnopqrstuvwxyz') {
    version = versionFor(new Date(), l);
    if (!existsSync(join(out, 'films', id, version))) break;
  }
}
if (!/^v\d{8}[a-z]?$/.test(version)) die(`"${version}" is not a version (v + YYYYMMDD + an optional letter)`);

const run = (cmd, a, quiet = false) => {
  const r = spawnSync(cmd, a, { stdio: quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) die(`${cmd} could not start (${r.error.message}). Is ffmpeg installed?`);
  if (r.status !== 0) die(`${cmd} failed${quiet ? `: ${r.stderr}` : ''}`);
  return r.stdout;
};

// What the master is.
const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate:format=duration', '-of', 'json', input], true));
const vs = probe.streams.find((s) => s.codec_type === 'video');
if (!vs) die('the master has no picture');
const audio = probe.streams.some((s) => s.codec_type === 'audio');
const fps = rate(vs.r_frame_rate);
const duration = Number(probe.format?.duration) || 0;
const gop = Math.max(1, Math.round(fps * 2));
const rungs = ladder(vs.width, vs.height);
console.log(`encode: ${input}: ${vs.width}×${vs.height}, ${fps.toFixed(3)} fps, ${duration.toFixed(1)} s${audio ? ', with sound' : ', silent'}`);
console.log(`encode: sizes ${rungs.map((r) => `${r.name} (${r.width}×${r.height})`).join(', ')} → ${join(out, 'films', id, version)}`);

const dir = join(out, 'films', id, version);
if (existsSync(dir)) die(`${dir} exists already: choose another --version`);
mkdirSync(dir, { recursive: true });
mkdirSync(join(out, 'keys', id), { recursive: true });

// The key, and ffmpeg's key info: the address the playlists write (one folder up from a size: the token path's /key), the key file, the IV.
const keyFile = join(out, 'keys', id, `${version}.key`);
writeFileSync(keyFile, randomBytes(16));
const keyInfo = join(dir, '.keyinfo');
writeFileSync(keyInfo, `../key\n${keyFile}\n${randomBytes(16).toString('hex')}\n`);

const made = [];
for (const r of rungs) {
  const rd = join(dir, r.name);
  mkdirSync(rd, { recursive: true });
  const { level } = levelFor(r.width, r.height);
  console.log(`encode: ${r.name}…`);
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-stats', '-y', '-i', input,
    '-map', '0:v:0', ...(audio ? ['-map', '0:a:0'] : []),
    '-vf', `scale=${r.width}:${r.height}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-profile:v', 'high', '-level', level, '-preset', preset, '-crf', crf,
    '-maxrate', String(r.maxrate), '-bufsize', String(r.maxrate * 2),
    '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0',
    ...(audio ? ['-c:a', 'aac', '-b:a', '192k', '-ac', '2'] : []),
    '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
    '-hls_segment_type', 'mpegts', '-hls_key_info_file', keyInfo,
    '-hls_segment_filename', join(rd, 'seg_%05d.ts'),
    join(rd, 'index.m3u8'),
  ]);
  const list = pieces(readFileSync(join(rd, 'index.m3u8'), 'utf8'));
  if (!list.length) die(`${r.name}: no pieces`);
  if (!readFileSync(join(rd, 'index.m3u8'), 'utf8').includes('URI="../key"')) die(`${r.name}: the playlist doesn't point at ../key`);
  made.push({ ...r, ...bandwidth(list, (u) => statSync(join(rd, u)).size) });
}
rmSync(keyInfo);
writeFileSync(join(dir, 'master.m3u8'), master(made, { fps, audio }));

// The poster: a frame a tenth of the way in, at most 1080 high.
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(Math.max(0, duration * 0.1)), '-i', input, '-frames:v', '1', '-vf', `scale=-2:${Math.min(1080, made[0].height)}`, '-q:v', '3', join(dir, 'poster.jpg')]);

const top = made[0];
const mb = made.reduce((s, r) => s + (r.average * r.seconds) / 8, 0) / 1e6;
console.log(`\nencode: done, about ${Math.ceil(mb)} MB in all. Next:\n  node scripts/kino/upload.mjs ${id} ${version}\nthen, in src/content/kino.json, film "${id}":\n`);
console.log(`      "seconds": ${Math.round(duration)},\n      "stream": { "version": "${version}", "width": ${top.width}, "height": ${top.height} }\n`);
