// npm test: the Field Guide engine (src/lib/guides/{core,check,view}.ts) on a
// small made-up guide, then on the real data if it is there.
import { daysBetween, dayLabel, dayLabelLong, dayStatus, isISODate, mapsRouteUrls, mapsSearchUrl, metresPerPixel, normalise, project, timeIn, todayIn, weekdayOf } from './core.ts';
import { checkAccess, checkAll, checkGuide, inspectGuide, type RawGuide } from './check.ts';
import { buildPayload, buildView } from './view.ts';
import type { AccessFile, DayRule } from './types';
import accessJson from '../../content/guides/access.json' with { type: 'json' };

let fails = 0;
const ok = (cond: boolean, name: string, extra = '') => {
  if (!cond) fails++;
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};

// ---------------------------------------------------------------------------
// Dates and "today".
ok(isISODate('2026-11-30') && !isISODate('2026-11-31') && !isISODate('2026-02-29') && isISODate('2028-02-29') && !isISODate('26-11-01'), 'isISODate knows real dates');
ok(weekdayOf('2026-11-08') === 'sun' && weekdayOf('2026-11-09') === 'mon', 'weekdayOf', weekdayOf('2026-11-08'));
ok(daysBetween('2026-11-08', '2026-11-15').length === 8 && daysBetween('2026-11-15', '2026-11-08').length === 0, 'daysBetween gives 8 days');
ok(daysBetween('2026-10-24', '2026-10-26').join() === '2026-10-24,2026-10-25,2026-10-26', 'daysBetween across the clock change');
ok(todayIn('Europe/Paris', new Date('2026-11-08T23:30:00Z')) === '2026-11-09', '"today" in Paris after midnight there', todayIn('Europe/Paris', new Date('2026-11-08T23:30:00Z')));
ok(todayIn('Europe/Paris', new Date('2026-11-08T22:59:00Z')) === '2026-11-08', '"today" in Paris just before midnight');
ok(todayIn('Asia/Shanghai', new Date('2026-11-08T22:59:00Z')) === '2026-11-09', 'a phone on China time still gets Paris "today" from todayIn(Paris)');
ok(timeIn('Europe/Paris', new Date('2026-11-08T23:30:00Z')) === '00:30', 'timeIn Paris', timeIn('Europe/Paris', new Date('2026-11-08T23:30:00Z')));
ok(dayLabel('2026-11-11').en === 'Wed 11 Nov' && dayLabel('2026-11-11').zh === '11月11日（周三）', 'dayLabel', JSON.stringify(dayLabel('2026-11-11')));
ok(dayLabelLong('2026-11-11').en === 'Wednesday 11 November' && dayLabelLong('2026-11-11').zh === '11月11日 星期三', 'dayLabelLong');

// ---------------------------------------------------------------------------
// Day rules, modelled on the real places.
const HOL = [{ date: '2026-11-11', name: { en: 'Armistice Day', zh: '停战纪念日' } }];
const rule = (r: Partial<DayRule>): DayRule => ({ holiday: 'confirm', access: 'walk-in', exceptions: [], ...r });
const st = (r: Partial<DayRule>, d: string | null) => dayStatus(rule(r), d, HOL);
const tueSun: DayRule['open'] = ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
ok(st({ open: tueSun, holiday: 'open' }, '2026-11-09').code === 'closed-weekday', 'closed on its weekday (Monday)');
ok(st({ open: tueSun, holiday: 'open' }, '2026-11-11').code === 'scheduled', 'holiday "open" → scheduled');
{
  const s = st({ holiday: 'closed' }, '2026-11-11');
  ok(s.code === 'closed' && s.note.en === 'Armistice Day' && !s.visitable, 'holiday "closed" → closed, with the holiday name', JSON.stringify(s.note));
}
ok(st({}, '2026-11-11').code === 'confirm' && st({}, '2026-11-11').visitable, 'holiday default → confirm');
{
  const alta = { start: '2026-11-10', exceptions: [{ date: '2026-11-15', status: 'appointment' as const, note: { en: 'Last day: appointment only', zh: '最后一天仅限预约' } }] };
  ok(st(alta, '2026-11-15').code === 'appointment' && st(alta, '2026-11-15').note.zh === '最后一天仅限预约', 'exception → appointment with its note');
  ok(st(alta, '2026-11-14').code === 'scheduled', 'the day before → scheduled');
  ok(st(alta, '2026-11-09').code === 'not-yet' && !st(alta, '2026-11-09').visitable, 'before start → not-yet', st(alta, '2026-11-09').note.en);
}
ok(st({ access: 'appointment' }, '2026-11-12').code === 'appointment' && st({ access: 'appointment' }, '2026-11-11').code === 'appointment', 'appointment only, holiday too');
ok(st({ end: '2026-11-13' }, '2026-11-14').code === 'ended' && !st({ end: '2026-11-13' }, '2026-11-14').heat, 'after end → ended');
ok(st({ open: tueSun, exceptions: [{ date: '2026-11-09', status: 'open', note: { en: 'Open this Monday', zh: '' } }] }, '2026-11-09').code === 'scheduled', 'an "open" exception on a closed weekday → scheduled');
ok(st({ end: '2026-11-08', exceptions: [{ date: '2026-11-10', status: 'closed', note: { en: '', zh: '' } }] }, '2026-11-10').code === 'closed', 'exceptions win over dates');
ok(st({}, null).code === 'choose-day' && st({}, null).heat && st({}, null).visitable, 'no day → choose-day');
{
  const codes = ['choose-day', 'scheduled', 'confirm', 'appointment', 'closed', 'closed-weekday', 'not-yet', 'ended'] as const;
  const sample: Record<string, ReturnType<typeof st>> = {
    'choose-day': st({}, null), scheduled: st({}, '2026-11-12'), confirm: st({}, '2026-11-11'), appointment: st({ access: 'appointment' }, '2026-11-12'),
    closed: st({ holiday: 'closed' }, '2026-11-11'), 'closed-weekday': st({ open: ['tue'] }, '2026-11-12'), 'not-yet': st({ start: '2026-11-13' }, '2026-11-12'), ended: st({ end: '2026-11-11' }, '2026-11-12'),
  };
  ok(codes.every((c) => sample[c].code === c), 'every status code is reachable');
  ok(codes.every((c) => sample[c].heat === (c === 'scheduled' || c === 'choose-day')), 'heat only for scheduled and choose-day');
  ok(codes.every((c) => sample[c].short.en && sample[c].short.zh && sample[c].label.en && sample[c].label.zh), 'every code has short and long words in both languages');
}

// ---------------------------------------------------------------------------
// The made-up guide. W is participants-only and the map centre (but not the
// base maps' centre: they are cropped off-centre so their size can't give it away).
const W: [number, number] = [2.357512, 48.869191];
const CITY = { id: 'city', name: 'Central', nameZh: '市中心', file: 'city.jpg', z: 14, originX: 2123851.005587911, originY: 1442294.7187901973, width: 1510, height: 1146 };
const REGION = { id: 'region', name: 'Region', nameZh: '大区', file: 'region.jpg', z: 11, originX: 265163.37569848885, originY: 179952.08984877466, width: 1054, height: 902 };
const access = accessJson as unknown as AccessFile;
const P = 'fotofilmic';
const item = (id: string, coordinates: [number, number], extra: Record<string, unknown> = {}) => ({
  id, tier: id[0], name: `Fixture ${id} gallery`, zone: 'centre', themes: ['street'], why: `Why ${id}.`, whyZh: `${id} 的理由。`,
  address: `${id} Rue Fixture, 75001`, hours: '10:00–18:00', hoursZh: '10:00–18:00', coordinates, ...extra,
});
const base = (): RawGuide => ({
  guide: {
    _comment: 'test',
    title: 'Fixture Days', titleZh: '测试日', subtitle: '{items} picks', public: { title: 'Fixture 2026', titleZh: '测试 2026' }, listed: true,
    city: 'Paris', cityZh: '巴黎', timezone: 'Europe/Paris', checked: '2026-11-01', window: { start: '2026-11-08', end: '2026-11-15' },
    holidays: [{ date: '2026-11-11', name: 'Armistice Day', nameZh: '停战纪念日' }],
    tiers: [{ id: 'A', name: 'Must', weight: 3 }, { id: 'B', name: 'Good', weight: 2 }, { id: 'C', name: 'Maybe', weight: 1 }],
    themes: [{ id: 'street', name: 'Street', nameZh: '街头' }], zones: [{ id: 'centre', name: 'Centre' }],
    categories: [{ id: 'galleries', source: 'Galeries', name: 'Galleries' }],
    labels: { item: 'Exhibition', items: 'Exhibitions' },
    texts: {
      intro: { heading: 'Intro', paras: [{ text: '{items} picks, {listings} entries and {routes} routes.' }, { text: 'Class starts 09:30.', textZh: '课程 09:30 开始。', audience: P }] },
      protect: { heading: 'Protect the class time', audience: P, paras: [{ text: 'Be on time.' }] },
    },
    links: [{ label: 'Site', url: 'https://example.org/' }],
    credits: { points: 'Points', image: 'Images' },
    map: { centre: 'W', heatRadius: 600 },
    sensitive: { public: ['Hotel Fixture'], [P]: ['Hotel Fixture'] },
  },
  items: { items: [
    item('A1', [2.3376, 48.8606], { listing: 'D01', image: { file: 'a1.jpg', credit: '© Someone' } }),
    item('A2', [2.3266, 48.8662], { image: { file: 'a2.jpg', credit: '© Venue Artist', source: 'Published by the venue', sourceZh: '由场馆发布' } }),
    item('A3', [2.37, 48.853], { start: '2026-10-01', end: '2026-12-01' }),
    item('B1', [2.349, 48.853], { open: ['tue', 'wed', 'thu', 'fri', 'sat'], holiday: 'closed' }),
    item('C1', [2.30, 48.87], { access: 'appointment' }),
  ] },
  places: { places: [
    { id: 'W', label: 'Workshop', labelZh: '工作坊', name: 'Hotel Fixture', address: '13 Rue Fixture', coordinates: W, audience: P },
    { id: 'F', label: 'Gallery', name: 'Fixture Gallery', address: '1 Rue Gallery', coordinates: [2.3622, 48.8625] },
    { id: 'M', label: 'Meet-up', name: 'Le Fixture Bar', address: '2 Rue Bar', coordinates: [2.353, 48.884], audience: [P] },
  ] },
  events: {
    events: [
      { id: 'class-1', date: '2026-11-09', start: '09:30', place: 'W', title: 'Class', audience: P },
      { id: 'meet', date: '2026-11-08', start: '17:00', place: 'M', title: 'Meet-up' },
      { id: 'opening', date: '2026-11-10', start: '18:00', end: '21:00', place: 'F', title: 'Opening <3', titleZh: '开幕' },
      { id: 'launch', date: '2026-11-13', place: 'F', title: 'Launch' },
    ],
    days: [{ date: '2026-11-09', plan: 'Class all day', audience: P }, { date: '2026-11-10', plan: 'Walk', audience: P }],
  },
  routes: { routes: [
    { id: 'after-class', name: 'After class', stops: ['W', 'A1', 'A2'], mode: 'walking', audience: P },
    { id: 'marais', name: 'Marais', stops: ['F', 'A3', 'B1'], mode: 'transit' },
    { id: 'short', name: 'Short', stops: ['W', 'A1'], mode: 'walking' },
  ] },
  listings: {
    source: { name: 'Official map', checked: '2026-11-01', lang: 'fr' },
    records: [
      { id: 'D01', name: 'Galerie Un', category: 'galleries', coordinates: [2.3377, 48.8607], details: 'Galerie\nexpo' },
      { id: 'D02', name: 'Galerie Deux', category: 'galleries', coordinates: [2.34, 48.86], details: 'Galerie deux', image: { file: 'd02.jpg', credit: '© Someone Else', caption: 'Untitled, 2026' } },
    ],
  },
  map: { views: [CITY, REGION], attribution: '© Base map' },
});

// The map.
{
  const p = project(W, 14);
  const x = p.x - CITY.originX, y = p.y - CITY.originY;
  ok(Math.abs(x - 768) <= 0.5 && Math.abs(y - 442) <= 0.5, 'project(W) on the city view = (768, 442)', `${x.toFixed(2)}, ${y.toFixed(2)}`);
  const r = project(W, 11);
  ok(Math.abs(r.x - REGION.originX - 414) <= 0.5 && Math.abs(r.y - REGION.originY - 390) <= 0.5, 'project(W) on the region view = (414, 390)');
  ok(Math.hypot(x - CITY.width / 2, y - CITY.height / 2) > 120 && Math.hypot(r.x - REGION.originX - REGION.width / 2, r.y - REGION.originY - REGION.height / 2) > 120, 'W is well off both map centres');
  ok(Math.abs(600 / metresPerPixel(W[1], 14) - 95.5) < 0.3, '600 m ≈ 95.5 px on the city map', (600 / metresPerPixel(W[1], 14)).toFixed(2));
}
// Maps links.
{
  const s = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Stop ${i + 1}`, address: `${i + 1} Rue X, Paris` }));
  const w3 = mapsRouteUrls(s(3), 'walking');
  ok(w3.length === 1 && w3[0].href.includes('/maps/dir/?api=1') && w3[0].href.includes('waypoints=') && w3[0].href.includes('travelmode=walking'), 'walking → 1 link with waypoints', w3[0]?.href);
  const w5 = mapsRouteUrls(s(5), 'walking');
  ok(w5.length === 1 && (w5[0].href.match(/%7C/g) || []).length === 2, 'walking with 5 stops → 1 link, 3 waypoints');
  ok(mapsRouteUrls(s(6), 'walking').length === 2, 'walking with 6 stops → 2 parts');
  const t3 = mapsRouteUrls(s(3), 'transit');
  ok(t3.length === 2 && t3.every((l) => l.href.includes('travelmode=transit') && !l.href.includes('waypoints=')) && t3[1].label.en.includes('Stop 2 to Stop 3'), 'transit with 3 stops → 2 legs');
  ok(mapsRouteUrls(s(1), 'walking').length === 0, 'one stop → no link');
  ok(mapsSearchUrl('Le Bal', '6 Impasse de la Défense').startsWith('https://www.google.com/maps/search/?api=1&query=Le%20Bal%2C%206%20Impasse'), 'mapsSearchUrl');
  ok(normalise('  Œuvre  Étienne  Penn ') === 'oeuvre etienne penn' && normalise('agnès b.').includes('agnes'), 'normalise strips accents and case');
}

// ---------------------------------------------------------------------------
// The fixture passes; views filter by audience.
{
  const raw = base();
  const probs = checkGuide(raw, 'fixture', { ...access, guides: { fixture: ['visitor', 'fotofilmic'] } });
  ok(probs.length === 0, 'the fixture guide passes the checks', probs.join('\n  '));
  const acc: AccessFile = { ...access, guides: { fixture: ['visitor', 'fotofilmic'] }, tiles: { fixture: [2.07, 48.63, 2.8, 49.05] } };
  ok(checkAccess(acc, ['fixture']).length === 0, 'access.json fixture passes', checkAccess(acc, ['fixture']).join('\n  '));
  const rep = inspectGuide(raw, 'fixture', acc);
  ok(rep.missingZh > 0, 'texts without Chinese are counted', String(rep.missingZh));

  const pv = buildView(raw, 'fixture', acc, P);
  const vv = buildView(raw, 'fixture', acc, 'visitor');
  ok(pv.places.map((p) => p.id).join() === 'W,F,M', 'participants see W, F and M');
  ok(vv.places.map((p) => p.id).join() === 'F', 'visitors see only F (W and M dropped)', vv.places.map((p) => p.id).join());
  ok(Math.abs(pv.centre[0] - W[0]) < 1e-9 && Math.abs(pv.centre[1] - W[1]) < 1e-9, 'participants: centre is W');
  const a = vv.items.filter((i) => i.tier === 'A');
  const cx = a.reduce((s, i) => s + i.coordinates[0], 0) / a.length;
  ok(Math.abs(vv.centre[0] - cx) < 1e-9 && vv.centre[0] !== W[0], 'visitors: centre moves to the middle of the A items', JSON.stringify(vv.centre));
  ok(!vv.events.some((e) => e.id === 'class-1') && pv.events.some((e) => e.id === 'class-1'), 'visitors lose the class events');
  ok(!vv.events.some((e) => e.id === 'meet'), 'an event at a hidden place (M) is dropped too');
  ok(vv.days.length === 0 && pv.days.length === 2, 'visitors lose the day plans');
  ok(!vv.routes.some((r) => r.id === 'after-class') && pv.routes.some((r) => r.id === 'after-class'), 'visitors lose "after-class"');
  ok(!vv.routes.some((r) => r.id === 'short') && pv.routes.some((r) => r.id === 'short'), 'a route left with 1 stop is dropped');
  ok(!vv.texts.some((t) => t.id === 'protect') && pv.texts.some((t) => t.id === 'protect'), 'visitors lose a participants-only section');
  ok(vv.texts[0].paras.length === 1 && pv.texts[0].paras.length === 2, 'and a participants-only paragraph');
  ok(vv.texts[0].paras[0].en === '5 picks, 2 entries and 1 routes.' && vv.subtitle.en === '5 picks', 'placeholders become counts', vv.texts[0].paras[0].en);
  ok(vv.items[0].why.zh === 'A1 的理由。' && vv.items[1].note.zh === '' && vv.items[0].image?.src === '/guides/fixture/img/a1.jpg', 'Bi filled; image src');
  ok(vv.map.views[0].src === '/guides/fixture/map/city.jpg', 'map view src');
  ok(vv.listings.records[0].item === 'A1' && vv.listings.records[1].item === undefined, 'listings link back to their item');
  ok(vv.listings.records[1].image?.src === '/guides/fixture/img/d02.jpg' && vv.listings.records[1].image.caption === 'Untitled, 2026' && vv.listings.records[1].image.alt.en === 'Galerie Deux' && !vv.listings.records[0].image, 'a listing record\'s picture: src, caption, alt from its name');
  ok(vv.items[1].image?.source?.en === 'Published by the venue' && vv.items[1].image.source.zh === '由场馆发布' && vv.items[0].image?.source === undefined, 'a picture\'s own "published by" comes through; without one, none');
  ok(vv.items[0].label && !vv.items[3].label && vv.items[3].holiday === 'closed' && vv.items[0].holiday === 'confirm', 'defaults: label for tier A, holiday confirm');
  ok(vv.audienceLabel.en === 'Visitor' && vv.window?.days.length === 8, 'audience label and window days');
  const pay = buildPayload(vv);
  const js = JSON.stringify(pay);
  ok(!js.includes('Hotel Fixture') && !js.includes(String(W[0])) && !js.includes('Why A1') && !js.includes('Galerie\\nexpo'), 'the visitor payload holds no hidden place and no long texts');
  ok(pay.items.length === 5 && pay.places.length === 1 && pay.routes.length === 1, 'payload counts');
  ok(js.includes('Opening <3') && !JSON.stringify(pay).replace(/</g, '\\u003c').includes('<'), 'payload "<" can be escaped (load.ts payloadJson)');
  ok(pay.tiles?.url === '/guides/fixture/tiles/{z}/{x}/{y}.png' && pay.tiles.min === 12 && pay.tiles.max === 19 && vv.tiles?.url === pay.tiles.url, 'payload tiles: the Worker\'s proxy for this guide, z12 to z19', JSON.stringify(pay.tiles));
  ok(buildPayload(buildView(raw, 'fixture', { ...acc, tiles: undefined }, 'visitor')).tiles === undefined && !('tiles' in buildPayload(buildView(raw, 'fixture', { ...acc, tiles: {} }, 'visitor'))), 'no tile bounds in access.json → no tiles in the payload');
  let threw = false;
  try { buildView(raw, 'fixture', { ...acc, guides: { fixture: ['visitor'] } }, P); } catch { threw = true; }
  ok(threw, 'an audience not allowed on the guide throws');
  const noZh = base();
  delete (noZh.items as { items: Record<string, unknown>[] }).items[0].whyZh;
  ok(checkGuide(noZh, 'fixture', acc).length === 0 && buildView(noZh, 'fixture', acc, 'visitor').items[0].why.zh === '', 'deleting whyZh passes, and why.zh is ""');
}

// ---------------------------------------------------------------------------
// Broken copies: each must fail with file › id › field.
{
  const acc: AccessFile = { ...access, guides: { fixture: ['visitor', 'fotofilmic'] }, tiles: { fixture: [2.07, 48.63, 2.8, 49.05] } };
  type G = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const cases: [string, (g: G) => void, string, string?][] = [
    ['bad date', (g) => { g.items.items[3].end = '2026-11-31'; }, 'guides/fixture/items.json › B1 › end', 'not a real date'],
    ['start after end', (g) => { Object.assign(g.items.items[1], { start: '2026-12-01', end: '2026-11-01' }); }, 'items.json › A2 › end', 'before the start'],
    ['wrong year', (g) => { Object.assign(g.items.items[2], { start: '2025-10-01', end: '2025-12-01' }); }, 'items.json › A3 › end', 'check the year'],
    ['duplicate id', (g) => { g.items.items[1].id = 'A1'; }, 'items.json › A1 › id', 'used twice'],
    ['tier letter', (g) => { g.items.items[1].id = 'B9'; }, 'items.json › B9 › id', 'tier letter'],
    ['unknown theme', (g) => { g.items.items[0].themes = ['nope']; }, 'items.json › A1 › themes[0]', 'not a theme'],
    ['unknown zone', (g) => { g.items.items[0].zone = 'north'; }, 'items.json › A1 › zone', 'not a zone'],
    ['unknown route stop', (g) => { g.routes.routes[1].stops[1] = 'B55'; }, 'routes.json › marais › stops[1]', 'not an item or place'],
    ['image without credit', (g) => { g.items.items[0].image = { file: 'a1.jpg' }; }, 'items.json › A1 › image.credit', 'needs a credit'],
    ['listing image without credit', (g) => { g.listings.records[1].image = { file: 'd02.jpg', credit: ' ' }; }, 'listings.json › D02 › image.credit', 'needs a credit'],
    ['listing image in a folder', (g) => { g.listings.records[1].image.file = 'x/d02.jpg'; }, 'listings.json › D02 › image.file', 'should be a file name'],
    ['listing image typo', (g) => { g.listings.records[1].image.credt = 'x'; }, 'listings.json › D02 › image.credt', 'did you mean "credit"'],
    ['swapped [lat, lon]', (g) => { g.items.items[1].coordinates = [48.8662, 2.3266]; }, 'items.json › A2 › coordinates', 'swap'],
    ['outside the region', (g) => { g.places.places[1].coordinates = [10, 50]; }, 'places.json › F › coordinates', 'outside the map'],
    ['unknown listing link', (g) => { g.items.items[1].listing = 'D99'; }, 'items.json › A2 › listing', 'not a record'],
    ['duplicate listing link', (g) => { g.items.items[1].listing = 'D01'; }, 'items.json › A2 › listing', 'already linked'],
    ['hoursZH typo', (g) => { g.items.items[0].hoursZH = g.items.items[0].hoursZh; delete g.items.items[0].hoursZh; }, 'items.json › A1 › hoursZH', 'did you mean "hoursZh"'],
    ['zh times differ', (g) => { g.items.items[0].hoursZh = '10:00–19:00'; }, 'items.json › A1 › hoursZh', 'times'],
    ['HTML in a text', (g) => { g.guide.texts.intro.paras[0].text = 'Hello <b>there</b>'; }, 'guide.json › texts › intro.paras[0].text', 'HTML'],
    ['unknown placeholder', (g) => { g.guide.texts.intro.paras[0].text = '{venues} venues'; }, 'guide.json › texts › intro.paras[0].text', 'placeholder'],
    ['centre not a place', (g) => { g.guide.map.centre = 'Q'; }, 'guide.json › map › centre', 'not a place'],
    ['unknown audience', (g) => { g.places.places[0].audience = 'staff'; }, 'places.json › W › audience', 'not an audience'],
    ['place id', (g) => { g.places.places[1].id = 'FF'; }, 'places.json › FF › id', 'one capital letter'],
    ['event place', (g) => { g.events.events[2].place = 'Z'; }, 'events.json › opening › place', 'not an item or place'],
    ['bad time', (g) => { g.events.events[2].start = '9:30'; }, 'events.json › opening › start', 'HH:MM'],
    ['missing field', (g) => { delete g.items.items[0].why; }, 'items.json › A1 › why', 'missing'],
    ['bad enum', (g) => { g.routes.routes[1].mode = 'bike'; }, 'routes.json › marais › mode', 'not one of'],
    ['duplicate listing id', (g) => { g.listings.records[1].id = 'D01'; }, 'listings.json › D01 › id', 'used twice'],
    ['unknown category', (g) => { g.listings.records[1].category = 'cafes'; }, 'listings.json › D02 › category', 'not a category'],
    ['deep unknown key', (g) => { g.items.items[0].image.credt = 'x'; }, 'items.json › A1 › image.credt', 'did you mean "credit"'],
    ['exception in the wrong year', (g) => { g.items.items[3].exceptions = [{ date: '2025-11-15', status: 'appointment' }]; }, 'items.json › B1 › exceptions[0].date', "outside the guide's days"],
    ['unknown placeholder in the subtitle', (g) => { g.guide.subtitle = '{exhibitions} to see'; }, 'guide.json › guide › subtitle', 'unknown placeholder {exhibitions}'],
    ['unknown placeholder in titleZh', (g) => { g.guide.titleZh = '{venues} 测试'; }, 'guide.json › guide › titleZh', 'unknown placeholder {venues}'],
    ['placeholder with spaces', (g) => { g.guide.subtitle = '{ items } to see'; }, 'guide.json › guide › subtitle', 'without spaces'],
    ['placeholder in public.subtitle', (g) => { g.guide.public = { ...g.guide.public, subtitle: '{items} to see' }; }, 'guide.json › guide › public.subtitle', 'work only in the title'],
    ['placeholder in a label', (g) => { g.guide.labels.items = '{items} picks'; }, 'guide.json › guide › labels.items', 'work only in the title'],
    ['[lon, lat] centre on a hidden place', (g) => { g.guide.map.centre = [W[0], W[1]]; }, 'guide.json › map › centre', 'next to "W"'],
    ['map centred on a hidden place', (g) => { Object.assign(g.map.views[0], { originY: 1442032.7187901973, width: 1536, height: 1408 }); }, 'places.json › W › coordinates', 'too close to the centre of map view "city"'],
    ['map centred on a hidden item', (g) => { g.items.items[4].audience = P; const c = project(g.items.items[4].coordinates, 11); Object.assign(g.map.views[1], { originX: c.x - 527, originY: c.y - 451 }); }, 'items.json › C1 › coordinates', 'too close to the centre of map view "region"'],
  ];
  for (const [name, mutate, where, what] of cases) {
    const g = structuredClone(base()) as G;
    mutate(g);
    const probs = checkGuide(g as RawGuide, 'fixture', acc);
    const hit = probs.find((p) => p.includes(where) && (!what || p.toLowerCase().includes(what.toLowerCase())));
    ok(!!hit, `broken copy: ${name}`, hit || probs.join(' | ') || '(no problems found)');
  }
  // Keys starting with _ are notes, not fields.
  const g = structuredClone(base()) as G;
  g.items.items[0]._todo = 'check hours';
  ok(checkGuide(g as RawGuide, 'fixture', acc).length === 0, 'keys starting with _ are ignored');
  // "1h30" is a duration, not a time, so its Chinese needs no "01:30".
  const dur = structuredClone(base()) as G;
  Object.assign(dur.routes.routes[1], { duration: 'Allow 1h30 between venues', durationZh: '留出1小时30分钟' });
  ok(checkGuide(dur as RawGuide, 'fixture', acc).length === 0, '"1h30" is not read as a time', checkGuide(dur as RawGuide, 'fixture', acc).join(' | '));
  // access.json and folders.
  const a2 = checkAccess({ ...acc, guides: { ...acc.guides, ghost: ['visitor'] } }, ['fixture', 'orphan']);
  ok(a2.some((p) => p.includes('access.json › guides › ghost')) && a2.some((p) => p.includes('guides/orphan/')), 'access.json and folders must agree', a2.join(' | '));
  const a3 = checkAccess({ ...acc, audiences: [...acc.audiences, { id: 'staff', label: 'Staff', secret: 'hunter2', includes: ['nobody'] }] }, ['fixture']);
  ok(a3.some((p) => p.includes('› staff › secret')) && a3.some((p) => p.includes('› staff › includes[0]')), 'audience secret names and includes are checked');
  const a4 = checkAccess({ ...acc, audiences: [...acc.audiences].reverse() }, ['fixture']);
  ok(a4.length === 1 && a4[0].includes('access.json › fotofilmic › includes[0]') && a4[0].includes('"visitor" must be listed before "fotofilmic"'), 'audiences must go from least to most privileged', a4.join(' | '));
  // Street-level tile bounds: [west, south, east, north], for a guide that exists, one region wide.
  const t1 = checkAccess({ ...acc, tiles: { fixture: [2.8, 48.63, 2.07, 49.05] } }, ['fixture']);
  ok(t1.length === 1 && t1[0].includes('access.json › tiles › fixture') && t1[0].includes('west 2.8 should be less than east 2.07'), 'tile bounds: west before east', t1.join(' | '));
  const t2 = checkAccess({ ...acc, tiles: { fixture: [2.07, 49.05, 2.8, 48.63] } }, ['fixture']);
  ok(t2.length === 1 && t2[0].includes('south 49.05 should be less than north 48.63'), 'tile bounds: south before north', t2.join(' | '));
  const t3 = checkAccess({ ...acc, tiles: { ghost: [2.07, 48.63, 2.8, 49.05], fixture: [2.07, 48.63, 2.8], _comment: 'fine' } }, ['fixture']);
  ok(t3.some((p) => p.includes('› tiles › ghost') && p.includes('not a guide')) && t3.some((p) => p.includes('› tiles › fixture') && p.includes('four numbers')) && !t3.some((p) => p.includes('_comment')), 'tile bounds: a known guide, four numbers; _comment allowed', t3.join(' | '));
  const t4 = checkAccess({ ...acc, tiles: { fixture: [-1, 40, 5, 49] } }, ['fixture']);
  ok(t4.length === 1 && t4[0].includes('spans more than 3°'), 'tile bounds: one region, not a country', t4.join(' | '));
  const t5 = checkAccess({ ...acc, tiles: { fixture: [2.07, 48.63, 2.8, 91] } }, ['fixture']);
  ok(t5.some((p) => p.includes('latitudes') && p.includes('85.06')), 'tile bounds: Web Mercator latitudes', t5.join(' | '));
  const t6 = inspectGuide(base(), 'fixture', { ...acc, tiles: { fixture: [2.2, 48.8, 2.5, 48.9] } }).problems;
  ok(t6.length === 1 && t6[0].includes('guides/fixture/map.json › region') && t6[0].includes('outside the tile bounds'), 'a base map reaching beyond the tile bounds is reported (the city map fits)', t6.join(' | '));
  ok(checkAccess({ ...acc, tiles: undefined }, ['fixture']).length === 0 && inspectGuide(base(), 'fixture', { ...acc, tiles: undefined }).problems.length === 0, 'no tile bounds: nothing to report');
  // checkAll throws once with every line.
  const bad = structuredClone(base()) as G;
  bad.items.items[3].end = '2026-11-31';
  bad.routes.routes[1].stops[1] = 'B55';
  let msg = '';
  try { checkAll({ fixture: bad as RawGuide }, acc); } catch (e) { msg = (e as Error).message; }
  ok(/^Field Guide: 2 problems in src\/content\/guides\/\. The site was not updated\./.test(msg) && msg.includes('\n  guides/fixture/routes.json › marais › stops[1]'), 'checkAll throws one error with every line', msg.split('\n')[0]);
}

// ---------------------------------------------------------------------------
// The real data (A1 writes it); skipped until it exists.
{
  const dir = '../../content/guides/paris-photo-days-2026/';
  const files = ['guide', 'items', 'places', 'events', 'routes', 'listings', 'map'] as const;
  const raw: RawGuide = {};
  let missing = '';
  for (const f of files) {
    try {
      raw[f] = (await import(dir + f + '.json', { with: { type: 'json' } })).default;
    } catch (e) {
      if (f === 'items') missing = (e as Error).message;
    }
  }
  if (missing) console.log('SKIP the real data: items.json is not there yet');
  else {
    const rep = inspectGuide(raw, 'paris-photo-days-2026', access);
    ok(rep.problems.length === 0, 'the real data passes the checks', rep.problems.slice(0, 40).join('\n  '));
    if (!rep.problems.length) {
      const counts = (aud: string) => {
        const v = buildView(raw, 'paris-photo-days-2026', access, aud);
        return `${v.items.length} items, ${v.places.length} places, ${v.routes.length} routes, ${v.events.length} events, ${v.days.length} days`;
      };
      const pv = buildView(raw, 'paris-photo-days-2026', access, P);
      const vv = buildView(raw, 'paris-photo-days-2026', access, 'visitor');
      ok(!vv.places.some((p) => p.id === 'W' || p.id === 'M') && vv.days.length === 0 && !vv.routes.some((r) => r.id === 'after-class'), 'real visitor view drops W, M, day plans and after-class');
      ok(pv.places.some((p) => p.id === 'W') && vv.centre.join() !== pv.centre.join(), 'real centre moves for visitors');
      const vjs = JSON.stringify(buildPayload(vv));
      const words = ((raw.guide as { sensitive?: Record<string, string[]> }).sensitive?.[P]) || [];
      ok(words.every((w) => !vjs.includes(w)), 'real visitor payload holds no participant words', words.filter((w) => vjs.includes(w)).join(', '));
      console.log(`  visitor: ${counts('visitor')}; ${P}: ${counts(P)}; ${rep.missingZh} texts without Chinese`);
    }
  }
}

console.log(fails ? `${fails} FAILED` : 'all passed');
// Node runs this file (npm test); the site's type check knows only the browser.
const node = (globalThis as { process?: { exitCode?: number } }).process;
if (fails && node) node.exitCode = 1;
