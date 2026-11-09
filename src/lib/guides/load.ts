// Field Guide (导览): the server-side loader. Only src/pages/guides/** import
// this file; browser scripts never do (they get a Payload instead). It reads
// every guide's JSON at build time, checks it once (a bad file fails the build
// and the old site stays live), and hands each page its audience's view.
// No node: modules, so `astro check` and the Worker build stay happy.
import type { AccessFile, GuideCard, GuideFile, GuideView, KindTab, Payload } from './types';
import { checkAll, type GuideFileName, type RawGuide } from './check.ts';
import { buildPayload, buildView } from './view.ts';
import { cityLine } from './address.ts';
import accessJson from '../../content/guides/access.json';

const files = import.meta.glob<unknown>('../../content/guides/*/*.json', { eager: true, import: 'default' });

let state: { access: AccessFile; guides: Record<string, RawGuide>; views: Map<string, GuideView> } | null = null;

function load() {
  if (state) return state;
  const guides: Record<string, RawGuide> = {};
  for (const [path, data] of Object.entries(files)) {
    const m = path.match(/\/guides\/([^/]+)\/([^/]+)\.json$/);
    if (!m) continue;
    const [, slug, name] = m;
    (guides[slug] ||= {})[name as GuideFileName] = data;
  }
  const access = accessJson as unknown as AccessFile;
  const reports = checkAll(guides, access); // throws: the build fails with every problem listed
  for (const [slug, raw] of Object.entries(guides)) {
    const n = (f: GuideFileName, k: string) => {
      const v = (raw[f] as Record<string, unknown> | undefined)?.[k];
      return Array.isArray(v) ? v.length : 0;
    };
    const views = access.guides[slug] || [];
    console.log(
      `Field Guide: ${slug}: ${n('items', 'items')} items, ${n('listings', 'records')} listings, ${n('routes', 'routes')} routes, ` +
        `${n('places', 'places')} places, ${n('events', 'events')} events; views ${views.join(', ')}; ${reports[slug].missingZh} texts without Chinese.`,
    );
  }
  state = { access, guides, views: new Map() };
  return state;
}

export function access(): AccessFile {
  return load().access;
}

/** Every guide named in access.json. */
export function guideSlugs(): string[] {
  return Object.keys(load().access.guides).filter((s) => !s.startsWith('_'));
}

/** Every (guide, audience) pair that gets a built view page. */
export function viewPaths(): { slug: string; audience: string }[] {
  const a = load().access;
  return guideSlugs().flatMap((slug) => a.guides[slug].map((audience) => ({ slug, audience })));
}

/** One guide for one audience, already filtered. */
export function loadView(slug: string, audience: string): GuideView {
  const s = load();
  const key = `${slug}\n${audience}`;
  let v = s.views.get(key);
  if (!v) {
    const raw = s.guides[slug];
    if (!raw) throw new Error(`Field Guide: no guide "${slug}".`);
    v = buildView(raw, slug, s.access, audience);
    s.views.set(key, v);
  }
  return v;
}

/** Neutral title and subtitle only: safe before the password. */
export function publicInfo(slug: string): GuideCard {
  const raw = load().guides[slug];
  if (!raw) throw new Error(`Field Guide: no guide "${slug}".`);
  const g = raw.guide as GuideFile;
  const p = g.public;
  return {
    slug,
    publicTitle: { en: p.title, zh: p.titleZh || '' },
    publicSubtitle: { en: p.subtitle || '', zh: p.subtitleZh || '' },
    kinds: [...(g.kinds || [])],
  };
}

/** The listed guides, in access.json order: the log-on box's list. /guides opens the first of them (src/pages/guides/index.astro). */
export function guideCards(): GuideCard[] {
  const s = load();
  return guideSlugs()
    .filter((slug) => (s.guides[slug]?.guide as GuideFile | undefined)?.listed)
    .map(publicInfo);
}

/**
 * The log-on box's tabs: each kind in access.json order with its listed
 * guides (in access.json order), kinds without one left out. Fewer than two
 * tabs: the box has none (src/pages/guides/[slug]/locked.astro).
 */
export function kindTabs(): KindTab[] {
  const cards = guideCards();
  return (load().access.kinds || [])
    .map((k) => ({ id: k.id, label: { en: k.label, zh: k.labelZh || '' }, guides: cards.filter((c) => c.kinds.includes(k.id)).map((c) => c.slug) }))
    .filter((t) => t.guides.length > 0);
}

/** Each city's newest listed guide, for /guides/<city> (src/lib/guides/address.ts): "paris:paris-2026-11 …". */
export function cityLinks(): string {
  const s = load();
  return cityLine(guideCards().map(({ slug }) => ({ slug, city: (s.guides[slug].guide as GuideFile).city })));
}

export function toPayload(view: GuideView): Payload {
  return buildPayload(view);
}

/** The Payload as JSON that is safe inside <script type="application/json">. */
export function payloadJson(view: GuideView): string {
  return JSON.stringify(buildPayload(view))
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
