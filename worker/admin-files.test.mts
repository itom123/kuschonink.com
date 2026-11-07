// npm test: admin mode's site editing (worker/admin-files.ts and
// src/lib/admin-files.ts), with the site's real content in an in-memory
// GitHub (scripts/dev/github-standin.mjs).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { github } from './github.ts';
import { filesForUrl, listFiles, newProject, readFile, recentChanges, saveFile, uploadPicture, type FilesDeps } from './admin-files.ts';
import { activeContent, filesFor, isEditableJson, jsonErrorAt, pictureName, pictureRule, slugify } from '../src/lib/admin-files.ts';
import type { AccessFile } from '../src/lib/guides/types';
import access from '../src/content/guides/access.json' with { type: 'json' };
// @ts-expect-error: plain JS module
import { githubStandIn } from '../scripts/dev/github-standin.mjs';

let fails = 0;
function check(name: string, ok: boolean, detail: unknown = '') {
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail));
}

// The repository as it is: every content file, and a few pictures.
const files: Record<string, string | Uint8Array> = { 'README.md': 'repo', 'worker/index.ts': '// code' };
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = `${d}/${n}`;
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.json')) files[p] = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  }
};
walk('src/content');
files['src/assets/images/projects/hanabi/burst.jpg'] = new Uint8Array(readFileSync('src/assets/images/projects/hanabi/burst.jpg'));
const ALL = Object.keys(files);
const SLUG = 'paris-2026-11';

function world() {
  const g = githubStandIn({ files, token: 'gh' });
  const d: FilesDeps = { gh: github({ token: 'gh', repo: 'itom123/kuschonink.com', fetch: g.fetch, base: g.base }), access: access as unknown as AccessFile };
  return { g, d };
}
const text = (g: ReturnType<typeof githubStandIn>, p: string) => g.files()[p] as string;

// ---- The rules (src/lib/admin-files.ts) ----

check('every content file is editable except who may open which guide', ALL.filter((p) => p.startsWith('src/content/')).every((p) => isEditableJson(p) === (p !== 'src/content/guides/access.json')));
check('code, the README and paths outside src/content are not editable', ['worker/index.ts', 'README.md', 'src/content/../worker/index.ts', 'src/content/x.ts', 'wrangler.jsonc', 'src/content/a/b/c.json', 'src/content/guides/access.json'].every((p) => !isEditableJson(p)));
check('pages map to their files', JSON.stringify(filesFor('/', ALL)) === JSON.stringify(['src/content/home.json', 'src/content/site.json'])
  && filesFor('/image/hanabi?x=1', ALL)[0] === 'src/content/projects/hanabi.json'
  && filesFor('/about/', ALL)[0] === 'src/content/about.json'
  && filesFor(`/guides/${SLUG}?place=A2`, ALL)[0] === `src/content/guides/${SLUG}/items.json`
  && filesFor('/house/kitchen', ALL)[0] === 'src/content/house.json'
  && filesFor('/house/3d', ALL)[0] === 'src/content/house3d.json', [filesFor('/', ALL), filesFor('/image/hanabi', ALL)]);
check('a page with no files of its own: the site file; never one that is missing', JSON.stringify(filesFor('/paint', ALL)) === '["src/content/site.json"]' && filesFor('/image/not-a-project', ALL).length === 0);
check('no existing content would be refused as active', ALL.filter((p) => p.endsWith('.json')).every((p) => !activeContent(JSON.parse(files[p] as string))));
const bad = [
  '<p>Hi<script>alert(1)</script></p>', '<img src=x onerror=alert(1)>', '<a href="javascript:alert(1)">x</a>', '<a href=" JaVaScRiPt:alert(1)">x</a>',
  '<iframe src="https://x"></iframe>', '<a href="&#106;avascript:alert(1)">x</a>', 'javascript:alert(1)', '<svg onload=alert(1)>', '<p style="background:url(javascript:alert(1))">',
  'data:text/html,<b>x</b>', '<form action="https://evil"><input></form>', '<STYLE>*{}</STYLE>', '<meta http-equiv="refresh" content="0;url=https://evil">',
];
check('text that could run code is refused (each kind)', bad.every((b) => activeContent({ sections: [{ blocks: [{ html: b }] }] })), bad.filter((b) => !activeContent({ x: b })));
check('…and says where', activeContent({ sections: [{ blocks: [{ html: '<p onclick="x()">' }] }] })?.at === 'sections[0].blocks[0].html');
check('ordinary HTML and text pass', !activeContent({ a: '<p><b>Bold</b> <i>it</i> <a href="https://kuschonink.com/about" target="_blank" rel="noopener">link</a></p>', b: 'Click on the map; online, one = two', c: '<span style="color:#333">x</span>', d: 'data:image/png;base64,AAAA' }));
check('picture rules: project folders, about/contact/home, guide entries', !!pictureRule('src/assets/images/projects/hanabi/new-one.jpg') && !!pictureRule('src/assets/images/home/x.png') && pictureRule(`public/guides/${SLUG}/img/C12.jpg`)?.maxBytes === 1024 * 1024);
check('…and nowhere else, no odd names', [
  'src/assets/images/projects/hanabi/../../../../worker/x.jpg', 'src/assets/images/projects/hanabi/New One.jpg', 'src/assets/house/a.png', 'public/x.jpg',
  `public/guides/${SLUG}/img/a.png`, 'src/assets/images/projects/hanabi/x.gif', 'src/assets/images/projects/hanabi/.jpg', 'src/assets/images/elsewhere/x.jpg',
].every((p) => !pictureRule(p)));
check('picture names and slugs', pictureName('Été à Paris (final).JPEG', 'jpeg') === 'ete-a-paris-final.jpg' && pictureName('???.png', 'png') === 'picture.png' && slugify('Hanabi: Part II — Été') === 'hanabi-part-ii-ete');
check('JSON errors: line and column', JSON.stringify(jsonErrorAt('{\n  "a": 1,\n  x\n}', 'Unexpected token x in JSON at position 14')) === '{"line":3,"col":3}' && jsonErrorAt('', 'Bad (line 4 column 7)')?.col === 7);

// ---- Listing and reading ----
{
  const { d } = world();
  const l = await listFiles(d);
  const fl = l.body.files as string[];
  check('the list: every editable file, nothing else', l.status === 200 && fl.length === ALL.filter(isEditableJson).length && !fl.includes('src/content/guides/access.json'), fl.length);
  check('…and where pictures may go', (l.body.folders as string[]).includes('src/assets/images/projects/hanabi') && (l.body.folders as string[]).includes(`public/guides/${SLUG}/img`), l.body.folders);
  const f = await filesForUrl('/image/hanabi', d);
  check('files for a page', JSON.stringify(f.body.files) === '["src/content/projects/hanabi.json"]', f.body);
  const r = await readFile('src/content/about.json', d);
  check('read a file (text and its version)', r.status === 200 && r.body.text === files['src/content/about.json'] && typeof r.body.sha === 'string');
  check('reading access.json or code is refused', (await readFile('src/content/guides/access.json', d)).status === 403 && (await readFile('worker/index.ts', d)).status === 403);
}

// ---- Saving ----
{
  const { g, d } = world();
  const p = 'src/content/about.json';
  const r = await readFile(p, d);
  const data = JSON.parse(r.body.text as string);
  data.title = 'About me (edited)';
  const next = JSON.stringify(data, null, 2);
  const s = await saveFile({ path: p, text: next, base: r.body.sha }, d);
  check('save: one commit on main, the text as written plus a newline', s.status === 200 && text(g, p) === `${next}\n` && g.message() === `Admin: edit ${p}`, [s, g.message()]);
  const next2 = next.replace('(edited)', '(edited twice)');
  const s2 = await saveFile({ path: p, text: next2, base: s.body.sha }, d);
  check('…and gives the new version, so the next save from the same window goes through', typeof s.body.sha === 'string' && s2.status === 200 && text(g, p).includes('(edited twice)'), s2.body);
  const again = await saveFile({ path: p, text: next, base: r.body.sha }, d);
  check('saving again from the old version: "changed", nothing overwritten', again.status === 409 && again.body.error === 'changed' && typeof again.body.sha === 'string');
  const forced = await saveFile({ path: p, text: next.replace('(edited)', '(again)'), base: r.body.sha, force: true }, d);
  check('…unless asked to overwrite', forced.status === 200 && text(g, p).includes('(again)'));
  const head = g.head();
  const same = await saveFile({ path: p, text: text(g, p), base: (await readFile(p, d)).body.sha }, d);
  check('no change, no commit', same.status === 200 && same.body.unchanged === true && g.head() === head);
  const broken = await saveFile({ path: p, text: '{ "title": "x", }', base: 'x' }, d);
  check('broken JSON refused, with the parser\'s message', broken.status === 422 && broken.body.error === 'invalid_json' && String(broken.body.detail).length > 0);
  const script = await saveFile({ path: p, text: JSON.stringify({ ...data, sections: [{ blocks: [{ type: 'text', html: '<img src=x onerror=alert(1)>' }] }] }), base: (await readFile(p, d)).body.sha }, d);
  check('text that could run code refused, saying where', script.status === 422 && script.body.error === 'active_content' && script.body.at === 'sections[0].blocks[0].html', script.body);
  check('access.json and code can\'t be saved', (await saveFile({ path: 'src/content/guides/access.json', text: '{}', base: '' }, d)).status === 403 && (await saveFile({ path: 'worker/index.ts', text: '{}', base: '' }, d)).status === 403);
  check('a new file can\'t be made by saving', (await saveFile({ path: 'src/content/new-thing.json', text: '{}', base: '' }, d)).status === 404);
  check('a plain string is not a content file', (await saveFile({ path: p, text: '"just text"', base: '' }, d)).status === 422);
}

// ---- Saving a guide file: the guide's own checks ----
{
  const { g, d } = world();
  const p = `src/content/guides/${SLUG}/items.json`;
  const r = await readFile(p, d);
  const items = JSON.parse(r.body.text as string);
  items.items[1].why = 'Edited from the editor.';
  const ok = await saveFile({ path: p, text: JSON.stringify(items, null, 2), base: r.body.sha }, d);
  check('a guide file that passes its checks is saved', ok.status === 200 && text(g, p).includes('Edited from the editor.'), ok.body);
  const r2 = await readFile(p, d);
  const broken = JSON.parse(r2.body.text as string);
  broken.items[1].start = '2026-02-31';
  const b1 = await saveFile({ path: p, text: JSON.stringify(broken, null, 2), base: r2.body.sha }, d);
  check('…one that fails them is refused, with the problems', b1.status === 422 && b1.body.error === 'guide_check' && (b1.body.problems as string[]).length > 0, b1.body);
  const words = ((JSON.parse(files[`src/content/guides/${SLUG}/guide.json`] as string).sensitive ?? {}) as Record<string, string[]>);
  const secret = Object.entries(words).find(([k, v]) => k !== 'public' && v.length)?.[1][0];
  if (secret) {
    const leak = JSON.parse(r2.body.text as string);
    const everyone = leak.items.find((i: { audience?: unknown }) => !i.audience);
    everyone.why = `Part of the ${secret} week.`;
    const b2 = await saveFile({ path: p, text: JSON.stringify(leak, null, 2), base: r2.body.sha }, d);
    check('…and so is a word some readers mustn\'t see, in an entry for everyone', b2.status === 422 && JSON.stringify(b2.body.problems).includes(secret), b2.body);
  } else check('the guide has words only some readers may see (for the test above)', false);
}

// ---- Pictures ----
const withExif = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#468' } }).withExif({ IFD0: { Artist: 'Private Person', Copyright: 'GPS here' } }).jpeg({ quality: 70 }).toBuffer();
const png = await sharp({ create: { width: 300, height: 200, channels: 4, background: '#468f' } }).png().toBuffer();
const huge = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#468' } }).jpeg({ quality: 30 }).toBuffer();
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
{
  const { g, d } = world();
  const p = 'src/assets/images/projects/hanabi/new-light.jpg';
  const u = await uploadPicture({ path: p, data: b64(withExif) }, d);
  const saved = g.files({ bytes: true })[p] as Uint8Array;
  check('a picture is added in one commit, with the src to use', u.status === 200 && u.body.src === 'projects/hanabi/new-light.jpg' && !!saved && g.message() === `Admin: add picture ${p}`, u.body);
  check('…without its metadata (EXIF, names, places)', !!saved && !Buffer.from(saved).includes('Private Person') && !Buffer.from(saved).includes('Exif'));
  const meta = await sharp(Buffer.from(saved)).metadata();
  check('…still the same picture', meta.width === 900 && meta.height === 600 && meta.format === 'jpeg');
  check('an existing picture is not replaced unless asked', (await uploadPicture({ path: p, data: b64(withExif) }, d)).status === 409);
  const rep = await uploadPicture({ path: p, data: b64(huge), replace: true }, d);
  check('…and is when asked', rep.status === 200 && g.message() === `Admin: replace picture ${p}`, rep.body);
  check('a PNG under a .jpg name is refused', (await uploadPicture({ path: 'src/assets/images/home/x.jpg', data: b64(png) }, d)).body.error === 'wrong_type');
  check('a PNG under .png is fine', (await uploadPicture({ path: 'src/assets/images/home/x.png', data: b64(png) }, d)).status === 200);
  check('not a picture: refused', (await uploadPicture({ path: 'src/assets/images/home/y.jpg', data: b64(new TextEncoder().encode('<script>alert(1)</script>')) }, d)).body.error === 'not_an_image');
  check('a guide picture over 1600 px: refused', (await uploadPicture({ path: `public/guides/${SLUG}/img/C1.jpg`, data: b64(huge) }, d)).body.error === 'too_big');
  check('a guide picture as PNG: refused', (await uploadPicture({ path: `public/guides/${SLUG}/img/C1.jpg`, data: b64(png) }, d)).body.error === 'wrong_type');
  check('outside the picture folders: refused', (await uploadPicture({ path: 'public/evil.jpg', data: b64(withExif) }, d)).status === 403 && (await uploadPicture({ path: 'src/assets/images/projects/hanabi/../x.jpg', data: b64(withExif) }, d)).status === 403);
}

// ---- A new project ----
{
  const { g, d } = world();
  const before = JSON.parse(files['src/content/home.json'] as string).projects as string[];
  const n = await newProject({ slug: 'winter-light', title: 'Winter Light', titleZh: '冬光', picture: { name: 'first.jpg', data: b64(withExif) } }, d);
  const all = g.files();
  const project = JSON.parse(all['src/content/projects/winter-light.json'] as string);
  const home = JSON.parse(all['src/content/home.json'] as string);
  check('new project: its file, its picture and its place on the home page, in one commit', n.status === 200 && g.message() === 'Admin: new project winter-light' && !!g.files({ bytes: true })['src/assets/images/projects/winter-light/first.jpg'], n.body);
  check('…first on the home page, the rest unchanged', home.projects[0] === 'winter-light' && JSON.stringify(home.projects.slice(1)) === JSON.stringify(before));
  check('…a page with titles, SEO titles and the picture', project.title === 'Winter Light' && project.titleZh === '冬光' && project.seo.title === 'Winter Light — Xiangyin Gu' && project.sections[0].blocks[0].src === 'projects/winter-light/first.jpg');
  check('the same slug again: refused', (await newProject({ slug: 'winter-light', title: 'Again', picture: { name: 'first.jpg', data: b64(withExif) } }, d)).status === 409);
  check('a bad slug, title or picture: refused', (await newProject({ slug: 'Winter Light', title: 'x y', picture: { name: 'a.jpg', data: b64(withExif) } }, d)).body.field === 'slug'
    && (await newProject({ slug: 'ok-slug', title: '<b>x</b>', picture: { name: 'a.jpg', data: b64(withExif) } }, d)).body.field === 'title'
    && (await newProject({ slug: 'ok-slug', title: 'Fine', picture: { name: '../a.jpg', data: b64(withExif) } }, d)).body.field === 'picture');
  const last = await newProject({ slug: 'at-the-end', title: 'At the End', first: false, picture: { name: 'a.png', data: b64(png) } }, d);
  check('…or last on the home page, when asked', last.status === 200 && JSON.parse(g.files()['src/content/home.json'] as string).projects.at(-1) === 'at-the-end');
}

// ---- Changes ----
{
  const { g, d } = world();
  const r = await readFile('src/content/about.json', d);
  await saveFile({ path: 'src/content/about.json', text: (r.body.text as string).replace('"title"', '"title"'), base: r.body.sha, force: true }, d);
  const h1 = g.head();
  const r2 = await readFile('src/content/site.json', d);
  await saveFile({ path: 'src/content/site.json', text: (r2.body.text as string).replace(/\n$/, '\n\n'), base: r2.body.sha }, d);
  const s = JSON.parse(r2.body.text as string);
  s.tagline = `${s.tagline} (edited)`;
  await saveFile({ path: 'src/content/site.json', text: JSON.stringify(s, null, 2), base: r2.body.sha }, d);
  const h2 = g.head();
  type Row = { sha: string; build: string; buildUrl: string; message: string };
  const rowsOf = async () => (await recentChanges(d)).body.commits as Row[];
  // The running site's build id, as the Worker reads it from its own files.
  let live: string | null = h1.slice(0, 12);
  d.liveBuild = async () => live;
  const c = await recentChanges(d);
  let rows = c.body.commits as Row[];
  check('changes: newest first; the site runs an older one, so the newest is not live yet', c.status === 200 && rows[0].sha === h2 && rows[0].build === 'waiting' && rows.find((x) => x.sha === h1)?.build === 'live' && rows[0].message.startsWith('Admin: edit src/content/site.json'), rows.slice(0, 3));
  g.checks.set(h2, [{ name: 'Workers Builds: kuschonink', status: 'completed', conclusion: 'failure', html_url: 'https://x/2', output: {} }]);
  rows = await rowsOf();
  check('…its build failed (the check run, read without the token): Build failed, with its link', rows[0].build === 'failed' && rows[0].buildUrl === 'https://x/2', rows[0]);
  live = h2.slice(0, 12);
  rows = await rowsOf();
  check('…the site runs the newest: every change is live', rows.length > 1 && rows.every((x) => x.build === 'live'), rows.map((x) => x.build));
  d.liveBuild = async () => null;
  g.checks.set(h2, [{ name: 'Workers Builds: kuschonink', status: 'completed', conclusion: 'success', html_url: 'https://x/1', output: {} }]);
  rows = await rowsOf();
  check('…no build id: only what the check runs say', rows[0].build === 'live' && rows.slice(1).every((x) => x.build === 'none'), rows.map((x) => x.build));
  g.limitAnonymous();
  rows = await rowsOf();
  check('…and when GitHub won\'t show them either: nothing is claimed', rows.every((x) => x.build === 'none'), rows.map((x) => x.build));
}

console.log(fails ? `\n${fails} failed` : '\nall passed');
if (fails) process.exit(1);
