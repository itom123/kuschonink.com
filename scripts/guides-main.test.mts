// npm test: the build's check of a branch's guides against main (scripts/guides-main.mjs), with a
// stand-in for main on raw.githubusercontent.com and a made-up branch in a temporary folder.
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let fails = 0;
function check(name: string, ok: boolean, detail: unknown = '') {
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail));
}

const SCRIPT = fileURLToPath(new URL('./guides-main.mjs', import.meta.url));
const item = (id: string, ref?: string) => ({ id, tier: id[0], name: `Venue ${id}`, ...(ref ? { suggested: { on: '2026-11-07', ref } } : {}) });
const access = (guides: string[], moved: Record<string, string> = {}) => ({ guides: Object.fromEntries(guides.map((g) => [g, ['visitor']])), moved });

// main, as raw.githubusercontent.com serves it: /<path>
let main: Record<string, unknown> = {};
const server = createServer((req, res) => {
  const body = main[decodeURIComponent((req.url ?? '/').slice(1))];
  if (body === undefined) {
    res.statusCode = 404;
    return void res.end('404: Not Found');
  }
  res.end(JSON.stringify(body));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const RAW = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

const work = mkdtempSync(join(tmpdir(), 'kus-guides-main-'));
let n = 0;
/** A branch's guide files in a new folder: { 'access.json': …, '<slug>/items.json': … }. */
function branchWith(files: Record<string, unknown>) {
  const root = join(work, `b${n++}`);
  for (const [p, body] of Object.entries(files)) {
    const f = join(root, 'src', 'content', 'guides', ...p.split('/'));
    mkdirSync(join(f, '..'), { recursive: true });
    writeFileSync(f, JSON.stringify(body));
  }
  return root;
}
const run = (root: string, branch: string, raw = RAW) =>
  new Promise<{ code: number; text: string }>((resolve) => {
    execFile(process.execPath, [SCRIPT], { env: { ...process.env, KUS_MAIN_RAW: raw, KUS_BRANCH: branch, KUS_GUIDES_ROOT: root } }, (err, stdout, stderr) => {
      resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, text: stdout + stderr });
    });
  });

main = {
  'src/content/guides/access.json': access(['paris']),
  'src/content/guides/paris/items.json': { items: [item('A1'), item('C1', 'page-1'), item('C2', 'page-2')] },
};
{
  const r = await run(branchWith({}), 'main');
  check('on main: nothing to compare', r.code === 0 && /this is main/.test(r.text), r.text);
}
{
  const root = branchWith({ 'access.json': access(['paris']), 'paris/items.json': { items: [item('A1'), item('C1', 'page-1'), item('C2', 'page-2'), item('B5')] } });
  const r = await run(root, 'feature');
  check("a branch with every entry main published (and its own edits): passes", r.code === 0 && /has every entry main published/.test(r.text), r.text);
}
{
  const root = branchWith({ 'access.json': access(['paris']), 'paris/items.json': { items: [item('A1'), item('C1', 'page-1')] } });
  const r = await run(root, 'old-branch');
  check('a branch made before the publisher added C2: fails, names it, says to merge main', r.code === 1 && r.text.includes('C2 "Venue C2" (suggestion page-2)') && /Merge main into this branch/.test(r.text), r.text);
}
{
  const root = branchWith({ 'access.json': access(['paris']), 'paris/items.json': { items: [item('A1'), item('C1', 'page-1'), item('C2', 'page-2'), item('C3', 'page-3')] } });
  const r = await run(root, 'feature');
  check('an entry main no longer has (raw may be minutes old): only a note', r.code === 0 && /\(note\).*page-3/.test(r.text), r.text);
}
{
  const r = await run(branchWith({ 'access.json': access(['lisbon']) }), 'feature');
  check("main has a guide the branch doesn't: fails", r.code === 1 && /main has the guide paris/.test(r.text), r.text);
}
{
  const root = branchWith({ 'access.json': access(['paris-2026-11'], { paris: 'paris-2026-11' }), 'paris-2026-11/items.json': { items: [item('C1', 'page-1'), item('C2', 'page-2')] } });
  const r = await run(root, 'rename');
  check('a branch that renamed the guide ("moved"): compared under the new name', r.code === 0, r.text);
}
{
  const root = branchWith({ 'access.json': access(['paris']), 'paris/items.json': { items: [] } });
  const r = await run(root, 'feature', 'http://127.0.0.1:9');
  check("main can't be read: only a warning, the build goes on", r.code === 0 && /couldn't read main/.test(r.text), r.text);
}

server.close();
rmSync(work, { recursive: true, force: true });
console.log(fails ? `${fails} FAILED` : 'all passed');
if (fails) process.exitCode = 1;
