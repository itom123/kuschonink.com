// npm test: the pure parts of encoding a film for the Kino (scripts/kino/ladder.mjs).
// @ts-expect-error a plain .mjs module, no types
import { bandwidth, ladder, levelFor, master, pieces, rate, subtitlesFilter, subtitlesOf, variants, versionFor } from './ladder.mjs';

let count = 0;
let fails = 0;
function check(name: string, ok: boolean, detail: unknown = '') {
  count++;
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail));
}
type Rung = { name: string; width: number; height: number; maxrate: number };
const names = (l: Rung[]) => l.map((r) => r.name).join(',');

{
  const l: Rung[] = ladder(1920, 1080);
  check('a 1080p master: 1080p, 720p, 480p, 360p', names(l) === '1080p,720p,480p,360p', names(l));
  check('… each 16:9, even sizes', l.every((r) => r.width % 2 === 0 && r.height % 2 === 0) && l[1].width === 1280 && l[3].width === 640, l);
  check('… 1080p capped at 12 Mbit/s', l[0].maxrate === 12_000_000 && l[1].maxrate === 6_000_000);
  const k: Rung[] = ladder(3840, 2160);
  check('a 4K master starts at 2160p and keeps every size below', names(k) === '2160p,1440p,1080p,720p,480p,360p', names(k));
  const w: Rung[] = ladder(1920, 800);
  check('a widescreen master (1920×800): its own size first, never larger', w[0].name === '800p' && w[0].width === 1920 && w[0].height === 800 && names(w) === '800p,720p,480p,360p', names(w));
  check('… which counts as 720p for its bitrate cap', w[0].maxrate === 6_000_000, w[0]);
  const p: Rung[] = ladder(1080, 1920);
  check('a portrait master: named by its shorter side', names(p) === '1080p,720p,480p,360p' && p[1].width === 720 && p[1].height === 1280, p);
  const s: Rung[] = ladder(640, 360);
  check('a small master: only its own size', names(s) === '360p', names(s));
  let threw = false;
  try {
    ladder(0, 0);
  } catch {
    threw = true;
  }
  check('no picture size: an error', threw);
}

check('levels: 720p 3.1, 1080p 4.0, 1440p 5.0, 4K 5.1', levelFor(1280, 720).level === '3.1' && levelFor(1920, 1080).codec === 'avc1.640028' && levelFor(2560, 1440).level === '5.0' && levelFor(3840, 2160).codec === 'avc1.640033');
check('rate: 30000/1001 and 25/1', Math.abs(rate('30000/1001') - 29.97) < 0.01 && rate('25/1') === 25 && rate('0/0') === 25);
check('versionFor: v + date + letter', versionFor(new Date('2026-11-16T12:00:00Z'), 'b') === 'v20261116b');

{
  const pl = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="../key",IV=0x01\n#EXTINF:6.000000,\nseg_00000.ts\n#EXTINF:4.000000,\nseg_00001.ts\n#EXT-X-ENDLIST\n';
  const list = pieces(pl);
  check('pieces: each with its length', list.length === 2 && list[0].uri === 'seg_00000.ts' && list[1].seconds === 4, list);
  const bw = bandwidth(list, (u: string) => (u === 'seg_00000.ts' ? 6_000_000 : 2_000_000));
  check('bandwidth: the peak piece and the average', bw.peak === 8_000_000 && bw.average === 6_400_000 && bw.seconds === 10, bw);
  const m: string = master([{ name: '1080p', width: 1920, height: 1080, peak: 9_000_000, average: 6_000_000 }, { name: '720p', width: 1280, height: 720, peak: 4_000_000, average: 3_000_000 }], { fps: 25, audio: true });
  check('master: largest first, relative addresses, codecs', m.startsWith('#EXTM3U\n') && m.indexOf('1080p/index.m3u8') < m.indexOf('720p/index.m3u8') && m.includes('RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",FRAME-RATE=25.000') && !m.includes('http') && !m.includes('/kino/'), m);
  const silent: string = master([{ name: '360p', width: 640, height: 360, peak: 1, average: 1 }], { fps: 0, audio: false });
  check('master: a silent film has no audio codec', silent.includes('CODECS="avc1.64001f"') && !silent.includes('mp4a'), silent);
}

{
  const v = { codec_type: 'video' };
  const a = { codec_type: 'audio' };
  const sub = (codec_name: string, language = '', def = 0) => ({ codec_type: 'subtitle', codec_name, tags: language ? { language } : undefined, disposition: { default: def } });
  check('subtitles: none', subtitlesOf([v, a]).pick === null && subtitlesOf([v, a]).pictures.length === 0);
  const one = subtitlesOf([v, a, sub('mov_text', 'eng')]);
  check("subtitles: an MP4's text track (mov_text), saved as .srt", one.pick?.index === 0 && one.pick.ext === 'srt' && one.pick.lang === 'eng', one);
  const many = subtitlesOf([v, sub('subrip', 'chi', 1), sub('subrip', 'eng'), sub('ass', 'fre')]);
  check('subtitles: English before the default track', many.pick?.index === 1, many);
  const def = subtitlesOf([v, sub('subrip', 'chi'), sub('ass', 'fre', 1)]);
  check('subtitles: then the default track (ASS kept as .ass)', def.pick?.index === 1 && def.pick.ext === 'ass', def);
  const pgs = subtitlesOf([v, sub('hdmv_pgs_subtitle', 'eng'), sub('dvd_subtitle')]);
  check("subtitles: picture-based tracks are reported, not drawn", pgs.pick === null && pgs.pictures.join(',') === 'hdmv_pgs_subtitle,dvd_subtitle', pgs);
  check('subtitlesFilter: a plain file name', subtitlesFilter('.subs-min-shi-e-v20261117a.srt') === 'subtitles=filename=.subs-min-shi-e-v20261117a.srt');
  let threw = 0;
  for (const bad of ['C:\\films\\a.srt', 'a b.srt', "a'.srt", 'x:y.srt', '../a.srt']) {
    try {
      subtitlesFilter(bad);
    } catch {
      threw++;
    }
  }
  check('subtitlesFilter: never a path, a space, a quote or a colon', threw === 5, threw);
  check('variants: the sizes a master playlist points at', variants('#EXTM3U\r\n#EXT-X-STREAM-INF:BANDWIDTH=1\r\n1080p/index.m3u8\r\n#EXT-X-STREAM-INF:BANDWIDTH=2\r\n720p/index.m3u8\r\n').join(',') === '1080p/index.m3u8,720p/index.m3u8');
}

console.log(fails ? `${fails} of ${count} FAILED` : `all ${count} passed`);
if (fails) process.exitCode = 1;
