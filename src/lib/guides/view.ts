// Field Guide (导览): one guide as one audience sees it. Pure: the raw JSON
// files + access.json + an audience id in, a GuideView out, with everything
// hidden from that audience already gone. load.ts calls it; node tests too.
import type {
  AccessFile,
  AudienceTag,
  Bi,
  EventsFile,
  GuideFile,
  GuideView,
  Item,
  ItemsFile,
  Listing,
  ListingsFile,
  LonLat,
  MapFile,
  Payload,
  Place,
  PlacesFile,
  RoutesFile,
  Section,
  TileSource,
} from './types';
import { daysBetween } from './core.ts';
import type { RawGuide } from './check.ts';

/** The audience and every audience it includes, recursively. */
export function audienceClosure(access: AccessFile, audience: string): Set<string> {
  const out = new Set<string>();
  const stack = [audience];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    const rec = access.audiences.find((a) => a.id === id);
    if (rec?.includes) stack.push(...rec.includes);
  }
  return out;
}

const b = (en: string | undefined, zh: string | undefined): Bi => ({ en: en || '', zh: zh || '' });
const cut = (s: string, n = 14) => ([...s].length <= n ? s : [...s].slice(0, n - 1).join('').trimEnd() + '…');

function fill(s: Bi, counts: Record<string, number>): Bi {
  const r = (t: string) => t.replace(/\{(items|listings|routes)\}/g, (_, k: string) => String(counts[k] ?? 0));
  return { en: r(s.en), zh: r(s.zh) };
}

export function buildView(raw: RawGuide, slug: string, access: AccessFile, audience: string): GuideView {
  const allowed = access.guides[slug];
  if (!allowed) throw new Error(`Field Guide: "${slug}" is not in access.json.`);
  if (!allowed.includes(audience)) throw new Error(`Field Guide: audience "${audience}" may not open "${slug}".`);
  const audRec = access.audiences.find((a) => a.id === audience);
  if (!audRec) throw new Error(`Field Guide: unknown audience "${audience}".`);
  const sees = audienceClosure(access, audience);
  const visible = (t: AudienceTag | undefined) => t === undefined || t === null || (Array.isArray(t) ? t.some((x) => sees.has(x)) : sees.has(t));

  const g = raw.guide as GuideFile;
  const itemsRaw = ((raw.items as ItemsFile | undefined)?.items || []).filter((x) => visible(x.audience));
  const placesRaw = ((raw.places as PlacesFile | undefined)?.places || []).filter((x) => visible(x.audience));
  const ev = raw.events as EventsFile | undefined;
  const routesRaw = ((raw.routes as RoutesFile | undefined)?.routes || []).filter((x) => visible(x.audience));
  const lst = raw.listings as ListingsFile | undefined;
  const mp = raw.map as MapFile;

  const items: Item[] = itemsRaw.map((r) => ({
    id: r.id,
    tier: r.tier,
    name: r.name,
    short: r.short || cut(r.name),
    subtitle: r.subtitle || '',
    by: r.by || '',
    zone: r.zone,
    themes: [...r.themes],
    why: b(r.why, r.whyZh),
    address: r.address,
    hours: b(r.hours, r.hoursZh),
    ...(r.minutes !== undefined ? { minutes: r.minutes } : {}),
    price: b(r.price, r.priceZh),
    note: b(r.note, r.noteZh),
    ...(r.sourceUrl ? { sourceUrl: r.sourceUrl } : {}),
    links: [...(r.links || [])],
    ...(r.listing ? { listing: r.listing } : {}),
    coordinates: [r.coordinates[0], r.coordinates[1]] as LonLat,
    ...(r.image
      ? { image: { src: `/guides/${slug}/img/${r.image.file}`, credit: r.image.credit, caption: r.image.caption || '', alt: b(r.image.alt || r.name, r.image.altZh) } }
      : {}),
    label: r.label ?? r.tier === 'A',
    // Who suggested it, never the Notion reference (`ref`): that stays in the repo.
    ...(r.suggested ? { suggested: { on: r.suggested.on, by: r.suggested.by || '', own: !!r.suggested.own } } : {}),
    ...(r.start ? { start: r.start } : {}),
    ...(r.end ? { end: r.end } : {}),
    ...(r.open ? { open: [...r.open] } : {}),
    holiday: r.holiday || 'confirm',
    access: r.access || 'walk-in',
    exceptions: (r.exceptions || []).map((e) => ({ date: e.date, status: e.status, note: b(e.note, e.noteZh) })),
  }));

  const places: Place[] = placesRaw.map((p) => ({
    id: p.id,
    label: b(p.label, p.labelZh),
    name: p.name,
    short: p.short || cut(p.name),
    address: p.address,
    coordinates: [p.coordinates[0], p.coordinates[1]] as LonLat,
    hours: b(p.hours, p.hoursZh),
    note: b(p.note, p.noteZh),
    links: [...(p.links || [])],
  }));

  const ids = new Set<string>([...items.map((i) => i.id), ...places.map((p) => p.id)]);

  // An event at a place this audience can't see goes too.
  const events = (ev?.events || [])
    .filter((e) => visible(e.audience) && (!e.place || ids.has(e.place)))
    .map((e) => ({
      id: e.id,
      date: e.date,
      ...(e.until ? { until: e.until } : {}),
      ...(e.start ? { start: e.start } : {}),
      ...(e.end ? { end: e.end } : {}),
      ...(e.place ? { place: e.place } : {}),
      title: b(e.title, e.titleZh),
      note: b(e.note, e.noteZh),
      optional: !!e.optional,
    }))
    .sort((x, y) => (x.date + (x.start || '')).localeCompare(y.date + (y.start || '')));

  const days = (ev?.days || []).filter((d) => visible(d.audience)).map((d) => ({ date: d.date, plan: b(d.plan, d.planZh) }));

  const routes = routesRaw
    .map((r) => ({
      id: r.id,
      name: b(r.name, r.nameZh),
      length: b(r.length, r.lengthZh),
      stops: r.stops.filter((s) => ids.has(s)).filter((s, i, a) => i === 0 || a[i - 1] !== s),
      mode: r.mode,
      duration: b(r.duration, r.durationZh),
      when: b(r.when, r.whenZh),
      note: b(r.note, r.noteZh),
    }))
    .filter((r) => r.stops.length >= 2);

  const backLink = new Map<string, string>();
  for (const i of items) if (i.listing) backLink.set(i.listing, i.id);
  const records: Listing[] = (lst?.records || []).map((r) => {
    const item = backLink.get(r.id);
    return { ...r, ...(item ? { item } : {}) };
  });

  const counts = { items: items.length, listings: records.length, routes: routes.length };

  const texts: Section[] = [];
  for (const [id, s] of Object.entries(g.texts || {})) {
    if (id.startsWith('_') || !visible(s.audience)) continue;
    const paras = (s.paras || []).filter((p) => visible(p.audience)).map((p) => fill(b(p.text, p.textZh), counts));
    const list = (s.items || []).filter((p) => visible(p.audience)).map((p) => ({ lead: fill(b(p.lead, p.leadZh), counts), text: fill(b(p.text, p.textZh), counts) }));
    const had = (s.paras?.length || 0) + (s.items?.length || 0);
    if (had && !paras.length && !list.length) continue;
    texts.push({ id, heading: fill(b(s.heading, s.headingZh), counts), paras, items: list });
  }

  // Centre: the centre place if this audience sees it, else the middle of the
  // visible A-tier items (so no hidden coordinate is sent).
  let centre: LonLat | null = null;
  const c = g.map.centre;
  if (Array.isArray(c)) centre = [c[0], c[1]];
  else {
    const p = places.find((x) => x.id === c);
    if (p) centre = p.coordinates;
  }
  if (!centre) {
    const pool = items.filter((i) => i.tier === 'A').length ? items.filter((i) => i.tier === 'A') : items;
    if (pool.length) centre = [pool.reduce((s, i) => s + i.coordinates[0], 0) / pool.length, pool.reduce((s, i) => s + i.coordinates[1], 0) / pool.length];
  }
  if (!centre) centre = [0, 0];
  const tiles = tileSource(access, slug);

  return {
    slug,
    audience,
    audienceLabel: b(audRec.label, audRec.labelZh),
    title: fill(b(g.title, g.titleZh), counts),
    subtitle: fill(b(g.subtitle, g.subtitleZh), counts),
    publicTitle: b(g.public.title, g.public.titleZh),
    publicSubtitle: b(g.public.subtitle, g.public.subtitleZh),
    city: b(g.city, g.cityZh),
    timezone: g.timezone,
    timezoneLabel: b(g.timezoneLabel, g.timezoneLabelZh),
    checked: g.checked,
    ...(g.window ? { window: { start: g.window.start, end: g.window.end, days: daysBetween(g.window.start, g.window.end) } } : {}),
    ...(g.event ? { event: { name: b(g.event.name, g.event.nameZh), start: g.event.start, end: g.event.end, ...(g.event.url ? { url: g.event.url } : {}) } } : {}),
    holidays: (g.holidays || []).map((h) => ({ date: h.date, name: b(h.name, h.nameZh), notice: b(h.notice, h.noticeZh) })),
    tiers: g.tiers.map((t) => ({ id: t.id, name: b(t.name, t.nameZh), text: b(t.text, t.textZh), weight: t.weight })),
    themes: g.themes.map((t) => ({ id: t.id, name: b(t.name, t.nameZh) })),
    zones: g.zones.map((t) => ({ id: t.id, name: b(t.name, t.nameZh) })),
    categories: (g.categories || []).map((t) => ({ id: t.id, name: b(t.name, t.nameZh) })),
    labels: {
      item: b(g.labels.item, g.labels.itemZh),
      items: b(g.labels.items, g.labels.itemsZh),
      subtitle: b(g.labels.subtitle, g.labels.subtitleZh),
      by: b(g.labels.by, g.labels.byZh),
      listing: b(g.labels.listing, g.labels.listingZh),
      listings: b(g.labels.listings, g.labels.listingsZh),
    },
    texts,
    links: (g.links || []).filter((l) => visible(l.audience)).map((l) => ({ label: b(l.label, l.labelZh), url: l.url })),
    credits: { points: b(g.credits?.points, g.credits?.pointsZh), image: b(g.credits?.image, g.credits?.imageZh), basemap: mp.attribution },
    defaults: { price: b(g.defaults?.price, g.defaults?.priceZh), listingNote: b(g.defaults?.listingNote, g.defaults?.listingNoteZh) },
    centre,
    heatRadius: g.map.heatRadius,
    items,
    places,
    events,
    days,
    routes,
    listings: { source: lst?.source || { name: '', checked: g.checked, lang: '' }, records },
    map: {
      views: mp.views.map((v) => ({
        id: v.id,
        name: b(v.name, v.nameZh),
        src: `/guides/${slug}/map/${v.file}`,
        z: v.z,
        originX: v.originX,
        originY: v.originY,
        width: v.width,
        height: v.height,
      })),
      attribution: mp.attribution,
    },
    ...(tiles ? { tiles } : {}),
  };
}

/** The zooms the Worker proxies tiles at (worker/guides.ts TILE_Z says the same; the Worker can't import this file). */
export const TILE_Z = { min: 14, max: 19 };

/** Where the browser gets street-level tiles for a guide, or null when access.json declares no bounds for it. */
export function tileSource(access: AccessFile, slug: string): TileSource | null {
  const b = access.tiles && Object.hasOwn(access.tiles, slug) ? access.tiles[slug] : null;
  if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return { url: `/guides/${slug}/tiles/{z}/{x}/{y}.png`, min: TILE_Z.min, max: TILE_Z.max };
}

/** What the browser gets: ids, points, rules, short names. No long texts. */
export function buildPayload(v: GuideView): Payload {
  return {
    slug: v.slug,
    audience: v.audience,
    timezone: v.timezone,
    ...(v.window ? { window: { start: v.window.start, end: v.window.end, days: [...v.window.days] } } : {}),
    holidays: v.holidays.map((h) => ({ date: h.date, name: h.name, notice: h.notice })),
    tiers: v.tiers.map((t) => ({ id: t.id, name: t.name, weight: t.weight })),
    themes: v.themes.map((t) => ({ id: t.id, name: t.name })),
    centre: v.centre,
    heatRadius: v.heatRadius,
    map: { views: v.map.views },
    ...(v.tiles ? { tiles: { ...v.tiles } } : {}),
    items: v.items.map((i) => ({
      id: i.id,
      tier: i.tier,
      name: i.name,
      short: i.short,
      address: i.address,
      zone: i.zone,
      themes: i.themes,
      coordinates: i.coordinates,
      label: i.label,
      ...(i.listing ? { listing: i.listing } : {}),
      ...(i.start ? { start: i.start } : {}),
      ...(i.end ? { end: i.end } : {}),
      ...(i.open ? { open: i.open } : {}),
      holiday: i.holiday,
      access: i.access,
      exceptions: i.exceptions,
    })),
    places: v.places.map((p) => ({ id: p.id, label: p.label, name: p.name, short: p.short, address: p.address, coordinates: p.coordinates })),
    listings: v.listings.records.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      coordinates: r.coordinates,
      ...(r.start ? { start: r.start } : {}),
      ...(r.end ? { end: r.end } : {}),
      ...(r.item ? { item: r.item } : {}),
    })),
    routes: v.routes.map((r) => ({ id: r.id, name: r.name, stops: r.stops, mode: r.mode })),
    events: v.events.map((e) => ({
      id: e.id,
      date: e.date,
      ...(e.until ? { until: e.until } : {}),
      ...(e.start ? { start: e.start } : {}),
      ...(e.end ? { end: e.end } : {}),
      ...(e.place ? { place: e.place } : {}),
      title: e.title,
    })),
  };
}
