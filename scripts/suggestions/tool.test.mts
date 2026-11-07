// npm test: the routine's tool (scripts/suggestions/tool.mts), run as the
// routine runs it. download.mjs takes it, every module it loads and the
// guides' files from a stand-in for raw.githubusercontent.com that serves this
// checkout; then the downloaded tool works against the Notion stand-in. Both
// are served on local ports.
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { GUIDE_FILES } from '../../src/lib/guides/check.ts';
import { notion, P } from '../../worker/notion.ts';
import { readSuggestion, S, suggestionProps, type Suggestion } from '../../worker/suggestions.ts';
import { nextId } from '../../worker/publish.ts';
// @ts-expect-error: plain JS module
import { standIn } from '../dev/notion-standin.mjs';
// @ts-expect-error: plain JS module
import { GUIDE_FILES as DOWNLOADED_FILES } from './download.mjs';

let fails = 0;
function check(name: string, ok: boolean, detail: unknown = '') {
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail));
}
const REPO = fileURLToPath(new URL('../../', import.meta.url));
const SLUG = 'paris-photo-days-2026';
// The id a new entry gets depends on the real guide, so work it out from its items.
const NEXT_C = nextId(JSON.parse(readFileSync(join(REPO, `src/content/guides/${SLUG}/items.json`), 'utf8')).items, 'C');
const node = (args: string[], env: NodeJS.ProcessEnv, cwd?: string) =>
  new Promise<{ code: number; out: any; text: string }>((resolve) => {
    execFile(process.execPath, args, { env, cwd, maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      let out: unknown = null;
      try { out = JSON.parse(stdout); } catch { /* text */ }
      resolve({ code: err ? (err as { code?: number }).code ?? 1 : 0, out, text: stdout + stderr });
    });
  });
const work = mkdtempSync(join(tmpdir(), 'kus-routine-'));

// ---- The download. The stand-in serves this checkout at any commit (raw.githubusercontent.com's
// /<commit>/<path>), and the site's home page with or without a build id.
const LIVE = '0123456789ab';
const asked: string[] = []; // "<commit> <path>", in order
let mainMovedOn = true; // main's ROUTINE.md is newer than the live commit's
const files = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/site/') return void res.end(`<!doctype html><meta name="kus98-build" content="${LIVE}"><title>kuschonink.com</title>`);
  if (url.pathname === '/site-without-id/') return void res.end('<!doctype html><title>kuschonink.com</title>');
  const m = /^\/raw\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (m) asked.push(`${m[1]} ${m[2]}`);
  const file = m && !m[2]!.split('/').includes('..') ? join(REPO, ...m[2]!.split('/')) : '';
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    res.statusCode = 404;
    return void res.end('404: Not Found');
  }
  const body = readFileSync(file);
  res.end(mainMovedOn && m![1] === 'main' && m![2] === 'scripts/suggestions/ROUTINE.md' ? Buffer.concat([body, Buffer.from('\nA newer line, on main only.\n')]) : body);
});
await new Promise<void>((r) => files.listen(0, '127.0.0.1', r));
const filesAt = `http://127.0.0.1:${(files.address() as { port: number }).port}`;
const download = (to: string, site: string, ...more: string[]) =>
  node([join(REPO, 'scripts', 'suggestions', 'download.mjs'), to, ...more], { ...process.env, KUS_RAW: `${filesAt}/raw`, KUS_SITE: `${filesAt}/${site}/` });
const FG = join(work, 'field-guide');
{
  const r = await download(FG, 'site');
  const got: string[] = r.out?.files ?? [];
  check('download: every file from the commit the live site runs (its build id)', r.code === 0 && r.out.commit === LIVE && asked.length > 10 && asked.every((a) => a.startsWith(`${LIVE} `) || a === 'main scripts/suggestions/ROUTINE.md'), r.text.slice(0, 600));
  const need = ['scripts/suggestions/tool.mts', 'worker/notion.ts', 'worker/suggestions.ts', 'worker/publish.ts', 'src/lib/guides/check.ts', 'src/lib/guides/dedupe.ts', 'wrangler.jsonc', 'src/content/guides/access.json', `src/content/guides/${SLUG}/guide.json`, `src/content/guides/${SLUG}/items.json`, 'scripts/suggestions/ROUTINE.md'];
  check("download: the tool, the modules it loads (no type-only ones, no tests) and the guides' files", need.every((f) => got.includes(f) && existsSync(join(FG, ...f.split('/')))) && !got.some((f) => /\.test\.|\/types\.ts$|^worker\/(guard|index)\.ts$/.test(f)), got);
  const pkg = existsSync(join(FG, 'package.json')) ? JSON.parse(readFileSync(join(FG, 'package.json'), 'utf8')) : {};
  const repo = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  check("download: package.json (ES modules, sharp at the repository's version) and a script that runs the tool", pkg.type === 'module' && JSON.stringify(pkg.dependencies) === JSON.stringify({ sharp: repo.dependencies.sharp }) && existsSync(join(FG, 'tool')) && readFileSync(join(FG, 'tool'), 'utf8').includes('tool.mts'), pkg);
  check("download: when main's ROUTINE.md differs, it says to follow the commit's", /^different from main's: read .*ROUTINE\.md/.test(r.out?.instructions ?? ''), r.out?.instructions);
  check("download: a guide's files are the ones the guide check knows", JSON.stringify(DOWNLOADED_FILES) === JSON.stringify(GUIDE_FILES), [DOWNLOADED_FILES, GUIDE_FILES]);
}
{
  mainMovedOn = false;
  asked.length = 0;
  const r = await download(join(work, 'from-main'), 'site-without-id');
  check('download: main, when the site gives no build id', r.code === 0 && r.out.commit === 'main' && /no build id/.test(r.out.why) && asked.every((a) => a.startsWith('main ')), r.text.slice(0, 300));
  const full = await download(FG, 'site');
  const odd = await download(join(work, 'odd'), 'site', '--commit', '../main');
  check("download: refuses a folder that isn't empty, and a commit that isn't one", full.code === 1 && /not empty/.test(full.text) && odd.code === 1 && /not a commit/.test(odd.text) && !existsSync(join(work, 'odd')), [full.text, odd.text]);
}
// In the routine, npm install puts sharp in the folder; here a stand-in package hands over this checkout's.
mkdirSync(join(FG, 'node_modules', 'sharp'), { recursive: true });
writeFileSync(join(FG, 'node_modules', 'sharp', 'package.json'), JSON.stringify({ name: 'sharp', main: 'index.cjs' }));
writeFileSync(join(FG, 'node_modules', 'sharp', 'index.cjs'), `module.exports = require(${JSON.stringify(createRequire(import.meta.url).resolve('sharp'))});\n`);

// ---- The Notion stand-in, over HTTP, as the tool reaches Notion.
const server = createServer();
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;
const s = standIn({ base: `http://127.0.0.1:${port}`, token: 'tok' });
server.on('request', async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const r = await s.fetch(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body: chunks.length ? Buffer.concat(chunks) : undefined, duplex: 'half' } as RequestInit);
  res.statusCode = r.status;
  r.headers.forEach((v: string, k: string) => res.setHeader(k, v));
  res.end(Buffer.from(await r.arrayBuffer()));
});
const env = { ...process.env, NOTION_API: `http://127.0.0.1:${port}`, NOTION_TOKEN: 'tok', NOTION_SUGGESTIONS: 'ds-s', NOTION_LOG: 'ds-log', VIPS_CONCURRENCY: '2' };
// The downloaded tool, run from another folder: it finds its files next to itself.
const tool = (...a: string[]) => node(['--experimental-strip-types', '--no-warnings', join(FG, 'scripts', 'suggestions', 'tool.mts'), ...a], env, work);

function write(v: unknown) {
  const p = join(work, `e${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, JSON.stringify(v));
  return p;
}
const n = notion({ token: 'tok', fetch: s.fetch, base: s.base, wait: async () => {} });
const form: Suggestion = {
  guide: SLUG, kind: 'exhibition', name: 'Maison Européenne de la Photographie', show: 'PENN & FASHION', artists: 'Irving Penn', start: '2026-11-08', end: '2026-11-30',
  hours: '', address: '5/7 Rue de Fourcy, 75004 Paris', website: 'https://www.mep-fr.org/', links: [], description: '', own: false,
  pictureCredit: 'Photo: someone', rights: true, submitter: '', email: '', mayContact: false, creditAs: '', lang: 'en',
};
const pic = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#789' } }).jpeg().toBuffer();
const upload = await n.uploadFile('picture.jpg', 'image/jpeg', new Uint8Array(pic));
const dup = await n.createPage('ds-s', suggestionProps(form, { reference: 'S-DUPE', submission: 'u1', audience: 'visitor', fingerprint: '', duplicate: '', picture: { id: upload, name: 'picture.jpg' } }));
const fresh = await n.createPage('ds-s', suggestionProps({ ...form, name: 'Galerie Exemple', show: 'Winter Light', artists: 'Ana Silva', address: '1 rue Exemple, 75003 Paris', website: 'https://exemple.fr/' }, { reference: 'S-NEWW', submission: 'u2', audience: 'visitor', fingerprint: '', duplicate: '' }));
for (const id of [dup.id, fresh.id]) await n.updatePage(id, { [S.status]: P.select('APPROVED') });

{
  const r = await tool('list', '--status', 'APPROVED');
  check('list --status APPROVED', r.code === 0 && Array.isArray(r.out) && r.out.length === 2 && r.out.every((x: { email?: string }) => !('email' in x)), r.text);
  const here = await node(['--experimental-strip-types', '--no-warnings', join(REPO, 'scripts', 'suggestions', 'tool.mts'), 'list', '--status', 'APPROVED'], env, REPO);
  check("list, with the checkout's own copy too (GUIDES.md 11.5)", here.code === 0 && Array.isArray(here.out) && here.out.length === 2, here.text);
}
{
  const a = await tool('claim', fresh.id, '--run', 'r-test-1');
  const b = await tool('claim', fresh.id, '--run', 'r-test-2');
  check('claim: the first run gets it, a second run does not', a.out?.claimed === true && b.out?.claimed === false && readSuggestion(await n.getPage(fresh.id)).run === 'r-test-1', [a.out, b.out]);
}
{
  const r = await tool('match', dup.id);
  check('match: the MEP with Irving Penn is the same show as A4', r.code === 0 && r.out.matches[0]?.id === 'A4' && r.out.matches[0]?.match === 'same-show', r.text.slice(0, 300));
}
{
  const r = await tool('match', fresh.id, '--entry', write({ name: 'Galerie Exemple', coordinates: [2.3601, 48.8619] }));
  check('match: a new place, with the zones of the nearest items', r.code === 0 && !r.out.matches.some((m: { kind: string }) => m.kind === 'item') && r.out.nearestZones.length === 5 && typeof r.out.nearestZones[0].zone === 'string', r.text.slice(0, 300));
}
{
  const orig = join(work, 'orig.jpg');
  const got = await tool('picture', dup.id, orig);
  const web = join(work, 'web.jpg');
  const w = await tool('web-picture', orig, web);
  const meta = await sharp(readFileSync(web)).metadata();
  check('picture, then web-picture: 640 px wide, a JPEG under 1 MB', got.code === 0 && w.code === 0 && meta.width === 640 && meta.format === 'jpeg' && readFileSync(web).length < 1024 * 1024, [got.text, w.text]);

  const good = { name: 'Galerie Exemple', short: 'Exemple', subtitle: 'Winter Light', by: 'Ana Silva', zone: 'marais', themes: ['documentary'], why: 'Large prints of winter light.', whyZh: '冬日光线的大幅照片。', address: '1 rue Exemple, 75003 Paris', start: '2026-11-08', end: '2026-12-20', coordinates: [2.3601, 48.8619], image: { alt: 'A winter photograph' } };
  const bad = await tool('check', fresh.id, write({ ...good, zone: 'nowhere', id: 'A1' }));
  check('check: an entry that sets its own id is refused', bad.out?.ok === false && bad.out.problems.some((p: string) => p.includes('id')), bad.text.slice(0, 300));
  const zone = await tool('check', fresh.id, write({ ...good, zone: 'nowhere' }));
  check("check: the guide's own check runs (an unknown zone)", zone.out?.ok === false && zone.out.problems.some((p: string) => p.includes('nowhere')), zone.text.slice(0, 300));
  const word = await tool('check', fresh.id, write({ ...good, why: 'Meet at the workshop first.' }));
  check('check: a participants-only word in an entry for everyone', word.out?.ok === false && word.out.problems.some((p: string) => p.includes('NEEDS CHECK')), word.text.slice(0, 300));
  const ok = await tool('check', fresh.id, write(good), '--picture', web);
  check('check: a good entry passes, as the next C id', ok.out?.ok === true && ok.out.item.id === NEXT_C && ok.out.item.suggested.ref === fresh.id, ok.text.slice(0, 400));
  const refused = await tool('ready', fresh.id, write({ ...good, zone: 'nowhere' }), '--result', 'x');
  check('ready: refuses an entry that fails the checks (exit 2), nothing changes', refused.code === 2 && readSuggestion(await n.getPage(fresh.id)).status === 'PROCESSING', refused.text.slice(0, 200));
  const ready = await tool('ready', fresh.id, write(good), '--picture', web, '--result', 'Checked on exemple.fr');
  const row = readSuggestion(await n.getPage(fresh.id));
  check('ready: READY, with the entry, the web picture and the result', ready.code === 0 && row.status === 'READY' && JSON.parse(row.entry).name === 'Galerie Exemple' && row.webPictures.length === 1 && row.result === 'Checked on exemple.fr', ready.text);
}
{
  await tool('claim', dup.id, '--run', 'r-test-1');
  const m = await tool('mark', dup.id, 'DUPLICATE', '--result', 'Same show as A4');
  const no = await tool('mark', dup.id, 'PUBLISHED', '--result', 'x');
  check('mark: DUPLICATE is allowed, PUBLISHED is the publisher\'s', m.code === 0 && readSuggestion(await n.getPage(dup.id)).status === 'DUPLICATE' && no.code !== 0);
}
{
  const r = await tool('log', '--run', 'r-test-1', '--trigger', 'manual', '--outcome', 'OK', '--pages', 'S-NEWW, S-DUPE', '--details', 'one ready, one duplicate');
  check('log: an entry in the processing log', r.code === 0 && [...s.pages.values()].some((p: { parent: { data_source_id: string } }) => p.parent.data_source_id === 'ds-log'));
}

server.close();
files.close();
rmSync(work, { recursive: true, force: true });
console.log(fails ? `${fails} FAILED` : 'all passed');
if (fails) process.exitCode = 1;
