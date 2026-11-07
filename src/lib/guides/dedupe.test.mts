// npm test: is a suggestion something the guide already has? (dedupe.ts),
// against the real Paris items and official listings.
import { addressSimilarity, compare, datesOverlap, distanceM, findMatches, fingerprint, nameSimilarity, normText, normUrl, people, type Known } from './dedupe.ts';
import items from '../../content/guides/paris-photo-days-2026/items.json' with { type: 'json' };
import listings from '../../content/guides/paris-photo-days-2026/listings.json' with { type: 'json' };

let fails = 0;
function check(name: string, ok: boolean, detail: unknown = '') {
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(detail));
}

type It = { id: string; name: string; subtitle?: string; by?: string; address: string; sourceUrl?: string; links?: string[]; coordinates: [number, number]; start?: string; end?: string };
const known: Known[] = [
  ...(items.items as It[]).map((i) => ({ id: i.id, kind: 'item' as const, name: i.name, show: i.subtitle, artists: i.by, address: i.address, website: i.sourceUrl, links: i.links, coordinates: i.coordinates, start: i.start, end: i.end })),
  ...(listings.records as { id: string; name: string; url?: string; coordinates: [number, number]; start?: string; end?: string }[]).map((r) => ({ id: r.id, kind: 'listing' as const, name: r.name, website: r.url, coordinates: r.coordinates, start: r.start, end: r.end })),
];
const top = (c: Parameters<typeof findMatches>[0]) => findMatches(c, known)[0];

// ---- Normalising ----
check('normText: accents, case, punctuation', normText('  Maison Européenne — de la PHOTO! ') === 'maison europeenne de la photo');
check('normUrl: www, query, trailing slash, language prefix', normUrl('https://www.Example.com/fr/Expo/?utm=1#x') === 'example.com/expo' && normUrl('example.com/expo/') === 'example.com/expo');
check('normUrl: only web addresses', normUrl('javascript:alert(1)') === '' && normUrl('mailto:a@b.c') === '' && normUrl('') === '');
check('nameSimilarity: the same place written two ways', nameSimilarity('MEP · Maison européenne de la Photographie', 'Maison Europeenne de la Photographie') >= 0.6);
check('nameSimilarity: "Foundation" and "Fondation" are filler', nameSimilarity('Henri Cartier-Bresson Foundation', 'Fondation Henri Cartier-Bresson') >= 0.9);
check('nameSimilarity: different places', nameSimilarity('Galerie Polka', 'Fondation Henri Cartier-Bresson') < 0.3);
check('addressSimilarity: abbreviations, but the number must agree', addressSimilarity('1 r. Exemple, 75003 Paris', '1 rue Exemple') >= 0.9 && addressSimilarity('3 rue Exemple', '1 rue Exemple') === 0);
check('distanceM: about 111 m per 0.001° of latitude', Math.abs(distanceM([2.35, 48.85], [2.35, 48.851]) - 111.2) < 1);
check('datesOverlap', datesOverlap({ start: '2026-11-01', end: '2026-11-30' }, { start: '2026-11-20', end: '2026-12-10' }) === true && datesOverlap({ start: '2026-01-01', end: '2026-01-31' }, { start: '2026-11-01' }) === false && datesOverlap({}, { start: '2026-11-01' }) === null);
check('people: "A / B", "A, B & C", "A et B"', people('Irving Penn / Nanténé Traoré').join('|') === 'irving penn|nantene traore' && people('Ana Silva, Bo Chen & Cy Twombly').length === 3 && people('Ana et Bo').length === 2);

// ---- Against the Paris guide ----
{
  const m = top({ name: 'Maison Européenne de la Photographie', address: '5 rue de Fourcy, 75004 Paris', artists: 'Irving Penn', start: '2026-11-08', end: '2026-11-15' });
  check('MEP with Irving Penn → the same show as A4', m?.id === 'A4' && m.match === 'same-show', m);
}
{
  const m = top({ name: 'MEP', address: '5/7 Rue de Fourcy', show: 'A brand new winter show', artists: 'Someone Else', start: '2027-02-01', end: '2027-04-01' });
  check('MEP with another show and later dates → the same venue as A4, not the same show', m?.id === 'A4' && m.match === 'same-venue', m);
}
{
  const m = top({ name: 'Visiting the MEP', website: 'https://mep-fr.org/venir' });
  check('the MEP visit page as website → A4 by its web address', m?.id === 'A4' && m.why.includes('same web address'), m);
}
{
  const a1 = (items.items as It[]).find((i) => i.id === 'A1')!;
  const m = top({ name: 'Henri Cartier-Bresson Foundation', coordinates: [a1.coordinates[0] + 0.0001, a1.coordinates[1]], artists: 'Susan Meiselas' });
  check('HCB, 7 m away, with Susan Meiselas → the same show as A1', m?.id === 'A1' && m.match === 'same-show', m);
}
{
  const l = (listings.records as { id: string; name: string; coordinates: [number, number] }[])[0];
  const m = findMatches({ name: l.name, coordinates: l.coordinates }, known).find((x) => x.kind === 'listing');
  check('an official listing is found by name and place', m?.id === l.id, m);
}
check('a new gallery elsewhere matches nothing', findMatches({ name: 'Galerie Toute Neuve', address: '200 rue Imaginaire, 75020 Paris', coordinates: [2.41, 48.87] }, known).length === 0);
check('two different places 12 m apart are the same venue', compare({ name: 'Studio Nord', coordinates: [2.3, 48.86] }, { id: 'X', kind: 'submission', name: 'Atelier Sud', coordinates: [2.30016, 48.86] })?.match === 'same-venue');

// ---- Fingerprint ----
const f1 = fingerprint({ guide: 'paris', name: 'Galerie Exemple', address: '1 r. Exemple, 75003 Paris', website: 'https://www.exemple.fr/' });
const f2 = fingerprint({ guide: 'paris', name: '  galerie  EXEMPLE ', address: '1 rue Exemple', website: 'exemple.fr' });
check('fingerprint: case, spaces, abbreviations and www don\'t matter', f1 === f2, { f1, f2 });
check('fingerprint: another street number is another place', f1 !== fingerprint({ guide: 'paris', name: 'Galerie Exemple', address: '3 rue Exemple', website: 'exemple.fr' }));
check('fingerprint: another guide is another suggestion', f1 !== fingerprint({ guide: 'lisbon', name: 'Galerie Exemple', address: '1 rue Exemple', website: 'exemple.fr' }));

console.log(fails ? `${fails} FAILED` : 'all passed');
if (fails) process.exitCode = 1;
