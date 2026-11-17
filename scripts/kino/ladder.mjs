// Kino: the pure parts of encoding a film (scripts/kino/encode.mjs), tested in
// scripts/kino/encode.test.mts. No dependencies.

/** Picture heights (of the shorter side) the ladder may use, largest first. */
export const RUNGS = [2160, 1440, 1080, 720, 480, 360];

/** The highest bitrate each rung may use (bits per second); its buffer is twice that. */
export const MAXRATE = { 2160: 35_000_000, 1440: 18_000_000, 1080: 12_000_000, 720: 6_000_000, 480: 2_500_000, 360: 1_200_000 };

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

/**
 * The sizes to encode a master of width × height into: its own size first
 * (never larger), then each standard size below it. Sizes are named by the
 * shorter side ("1080p"), so a portrait film works the same way.
 */
export function ladder(width, height) {
  if (!(width > 0 && height > 0)) throw new Error('ladder: no picture size');
  const short = Math.min(width, height);
  const top = even(short);
  const heights = [top, ...RUNGS.filter((r) => r < top - 8)];
  return heights.map((s) => {
    const f = s / short;
    const w = even(width * f);
    const h = even(height * f);
    const std = RUNGS.find((r) => r <= s + 8) ?? 360;
    return { name: `${s}p`, width: w, height: h, maxrate: MAXRATE[std] ?? MAXRATE[360] };
  });
}

/** The H.264 level for a picture (and its CODECS string). */
export function levelFor(width, height) {
  const px = width * height;
  if (px <= 1280 * 720) return { level: '3.1', codec: 'avc1.64001f' };
  if (px <= 1920 * 1088) return { level: '4.0', codec: 'avc1.640028' };
  if (px <= 2560 * 1600) return { level: '5.0', codec: 'avc1.640032' };
  return { level: '5.1', codec: 'avc1.640033' };
}

/** A variant playlist's pieces: [{ uri, seconds }]. */
export function pieces(playlist) {
  const out = [];
  let dur = null;
  for (const raw of playlist.split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^#EXTINF:([\d.]+)/.exec(line);
    if (m) dur = Number(m[1]);
    else if (line && !line.startsWith('#') && dur !== null) {
      out.push({ uri: line, seconds: dur });
      dur = null;
    }
  }
  return out;
}

/** Peak and average bitrate (bits per second) from the pieces and their sizes in bytes. */
export function bandwidth(list, sizeOf) {
  let peak = 0, bytes = 0, secs = 0;
  for (const p of list) {
    const b = sizeOf(p.uri);
    bytes += b;
    secs += p.seconds;
    if (p.seconds > 0) peak = Math.max(peak, (b * 8) / p.seconds);
  }
  return { peak: Math.ceil(peak), average: secs ? Math.ceil((bytes * 8) / secs) : 0, seconds: secs };
}

/** The master playlist: each rung, its bitrates, size and codecs, largest first. Relative addresses only. */
export function master(rungs, { fps, audio }) {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS'];
  for (const r of rungs) {
    const codecs = [levelFor(r.width, r.height).codec, ...(audio ? ['mp4a.40.2'] : [])].join(',');
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${r.peak},AVERAGE-BANDWIDTH=${r.average},RESOLUTION=${r.width}x${r.height},CODECS="${codecs}"${fps ? `,FRAME-RATE=${fps.toFixed(3)}` : ''}`);
    lines.push(`${r.name}/index.m3u8`);
  }
  return lines.join('\n') + '\n';
}

/** "30000/1001" → 29.97. */
export function rate(s) {
  const [a, b] = String(s ?? '').split('/').map(Number);
  const r = b ? a / b : a;
  return Number.isFinite(r) && r > 0 && r < 241 ? r : 25;
}

/** Today's upload name: v + YYYYMMDD + a letter (a for the first upload of the day). */
export function versionFor(date, letter = 'a') {
  const d = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `v${d}${letter}`;
}

/** Text subtitle tracks the subtitles filter can draw, and what to save them as first. */
export const TEXT_SUBS = { mov_text: 'srt', subrip: 'srt', srt: 'srt', webvtt: 'srt', text: 'srt', ass: 'ass', ssa: 'ass' };

/**
 * The master's subtitle tracks, from ffprobe's streams: `pick`, the text track
 * to draw into the picture (English first, then the default one, then the
 * first), as { index (among the subtitle tracks), codec, ext, lang }, or null;
 * and `pictures`, the picture-based tracks (a DVD's, a Blu-ray's), which can't
 * be drawn this way.
 */
export function subtitlesOf(streams) {
  const subs = (streams ?? [])
    .filter((s) => s.codec_type === 'subtitle')
    .map((s, n) => ({ n, codec: String(s.codec_name ?? ''), lang: String(s.tags?.language ?? '').toLowerCase(), def: s.disposition?.default === 1 }));
  const score = (s) => (/^en/.test(s.lang) ? 2 : 0) + (s.def ? 1 : 0);
  const best = subs.filter((s) => TEXT_SUBS[s.codec]).sort((a, b) => score(b) - score(a) || a.n - b.n)[0];
  return {
    pick: best ? { index: best.n, codec: best.codec, ext: TEXT_SUBS[best.codec], lang: best.lang } : null,
    pictures: subs.filter((s) => !TEXT_SUBS[s.codec]).map((s) => s.codec),
  };
}

/**
 * The filter that draws a subtitle file into the picture. The file is a plain
 * name in ffmpeg's working folder, so nothing in it needs escaping (a Windows
 * path, with its drive letter and backslashes, would).
 */
export function subtitlesFilter(file) {
  if (!/^[A-Za-z0-9._-]+$/.test(file)) throw new Error(`subtitlesFilter: "${file}" is not a plain file name`);
  return `subtitles=filename=${file}`;
}

/** A master playlist's sizes: the variant playlists it points at ("1080p/index.m3u8"). */
export function variants(masterPlaylist) {
  return masterPlaylist.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}
