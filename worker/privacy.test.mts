// npm test: contact details are deleted when promised (worker/privacy.ts).
import { github } from './github.ts';
import { notion, P, R } from './notion.ts';
import { privacySweep, type PrivacyDeps } from './privacy.ts';
import { C, S } from './suggestions.ts';
import type { AccessFile } from '../src/lib/guides/types';
// @ts-expect-error: plain JS module
import { standIn } from '../scripts/dev/notion-standin.mjs';
// @ts-expect-error: plain JS module
import { githubStandIn } from '../scripts/dev/github-standin.mjs';

let fails = 0;
function check(name: string, ok: boolean, detail: unknown = '') {
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(detail));
}

const access = { audiences: [{ id: 'visitor', label: 'Visitor', secret: 'GUIDES_PASSWORD' }], guides: { 'dated-guide': ['visitor'], 'cafes': ['visitor'] } } as unknown as AccessFile;
const g = githubStandIn({ token: 'gh', files: { 'src/content/guides/dated-guide/guide.json': JSON.stringify({ window: { start: '2026-11-08', end: '2026-11-15' } }), 'src/content/guides/cafes/guide.json': JSON.stringify({ title: 'no dates' }) } });

async function world(now: number) {
  const s = standIn({ token: 'nt', start: Date.UTC(2026, 10, 9) });
  const n = notion({ token: 'nt', fetch: s.fetch, base: s.base, wait: async () => {} });
  for (const guide of ['dated-guide', 'dated-guide', 'cafes']) await n.createPage('ds-c', { [C.reference]: P.title('S-AAAA'), [C.guide]: P.select(guide), [C.email]: P.email('a@example.com') });
  await n.createPage('ds-s', { [S.name]: P.title('X'), [S.guide]: P.select('dated-guide'), [S.creditAs]: P.text('Ana Silva') });
  const deps: PrivacyDeps = { notion: n, db: { contacts: 'ds-c', suggestions: 'ds-s', log: 'ds-log' }, gh: github({ token: 'gh', repo: 'itom123/kuschonink.com', fetch: g.fetch, base: g.base }), access, now: () => now, log: () => {} };
  const live = (ds: string) => [...s.pages.values()].filter((p: { parent: { data_source_id: string }; in_trash: boolean }) => p.parent.data_source_id === ds && !p.in_trash);
  return { deps, live };
}

{
  const w = await world(Date.UTC(2027, 1, 12)); // 89 days after 15 Nov
  const r = await privacySweep(w.deps);
  check('89 days after the guide ends: nothing deleted', r.contacts === 0 && w.live('ds-c').length === 3, r);
}
{
  const w = await world(Date.UTC(2027, 1, 14)); // 91 days after
  const r = await privacySweep(w.deps);
  check('91 days after: that guide\'s contacts are gone, the other guide\'s stay', r.contacts === 2 && w.live('ds-c').length === 1 && R.select(w.live('ds-c')[0], C.guide) === 'cafes', r);
  check('… and its credit names are cleared', r.credits === 1 && R.text(w.live('ds-s')[0], S.creditAs) === '');
  check('… and it is logged', w.live('ds-log').length === 1);
}
{
  const w = await world(Date.UTC(2027, 10, 10)); // a year after the cafés contact was sent
  const r = await privacySweep(w.deps);
  check('a guide without dates: contacts older than a year go', w.live('ds-c').length === 0 && r.guides.includes('cafes'), r);
}

{
  // A guide's old address (access.json "moved"): pages sent under it keep that name in Notion, and go too.
  const moved = { ...access, moved: { 'old-dated': 'dated-guide' } } as unknown as AccessFile;
  const s = standIn({ token: 'nt', start: Date.UTC(2026, 10, 9) });
  const n = notion({ token: 'nt', fetch: s.fetch, base: s.base, wait: async () => {} });
  await n.createPage('ds-c', { [C.reference]: P.title('S-OLD1'), [C.guide]: P.select('old-dated'), [C.email]: P.email('b@example.com') });
  await n.createPage('ds-s', { [S.name]: P.title('Y'), [S.guide]: P.select('old-dated'), [S.creditAs]: P.text('Bo Chen') });
  const deps: PrivacyDeps = { notion: n, db: { contacts: 'ds-c', suggestions: 'ds-s', log: 'ds-log' }, gh: github({ token: 'gh', repo: 'itom123/kuschonink.com', fetch: g.fetch, base: g.base }), access: moved, now: () => Date.UTC(2027, 1, 14), log: () => {} };
  const live = (ds: string) => [...s.pages.values()].filter((p: { parent: { data_source_id: string }; in_trash: boolean }) => p.parent.data_source_id === ds && !p.in_trash);
  const r = await privacySweep(deps);
  check("a guide's old address: contacts and credit names sent under it go too", r.contacts === 1 && live('ds-c').length === 0 && r.credits === 1 && R.text(live('ds-s')[0], S.creditAs) === '', r);
}

console.log(fails ? `${fails} FAILED` : 'all passed');
if (fails) process.exitCode = 1;
