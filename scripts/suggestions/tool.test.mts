// npm test: the routine's tool (scripts/suggestions/tool.mts), run as the
// routine runs it, against the Notion stand-in served on a local port.
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { notion, P } from '../../worker/notion.ts';
import { readSuggestion, S, suggestionProps, type Suggestion } from '../../worker/suggestions.ts';
// @ts-expect-error: plain JS module
import { standIn } from '../dev/notion-standin.mjs';

let fails = 0;
function check(name: string, ok: boolean, detail: unknown = '') {
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail));
}

// The stand-in, over HTTP, as the tool reaches Notion.
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
const tool = (...a: string[]) =>
  new Promise<{ code: number; out: any; text: string }>((resolve) => {
    execFile(process.execPath, ['--experimental-strip-types', '--no-warnings', 'scripts/suggestions/tool.mts', ...a], { env, maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      let out: unknown = null;
      try { out = JSON.parse(stdout); } catch { /* text */ }
      resolve({ code: err ? (err as { code?: number }).code ?? 1 : 0, out, text: stdout + stderr });
    });
  });

const dir = mkdtempSync(join(tmpdir(), 'kus-tool-'));
function write(v: unknown) {
  const p = join(dir, `e${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, JSON.stringify(v));
  return p;
}
const n = notion({ token: 'tok', fetch: s.fetch, base: s.base, wait: async () => {} });
const SLUG = 'paris-photo-days-2026';
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
  const orig = join(dir, 'orig.jpg');
  const got = await tool('picture', dup.id, orig);
  const web = join(dir, 'web.jpg');
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
  check('check: a good entry passes, as the next C id', ok.out?.ok === true && ok.out.item.id === 'C3' && ok.out.item.suggested.ref === fresh.id, ok.text.slice(0, 400));
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
console.log(fails ? `${fails} FAILED` : 'all passed');
if (fails) process.exitCode = 1;
