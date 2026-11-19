// Field Guide (导览): the log-on box's two rows of tabs, worked out from the
// listed guides. The top row has a tab per city (access.json "cities"), and
// under it the city's own row has a tab per kind (access.json "kinds": what a
// reader wants to see there). Pure, so the Node tests can import it; load.ts
// calls it with the real guides.
import type { CityRecord, CityTab, GuideCard, KindRecord } from './types';

const bi = (r: { label: string; labelZh?: string }) => ({ en: r.label, zh: r.labelZh || '' });

/**
 * The cities in access.json order, each with its listed guides (in the order
 * of `cards`, which is access.json's) and the kinds those guides answer, in
 * access.json order, each with its guides. A city or kind without a listed
 * guide is left out. Without "cities", every listed guide is in one city with
 * no name, so the box has one row of kinds, as before cities existed.
 */
export function cityTabsOf(cards: GuideCard[], cities: CityRecord[] | undefined, kinds: KindRecord[] | undefined): CityTab[] {
  const groups = cities?.length
    ? cities.map((c) => ({ id: c.id, label: bi(c), cards: cards.filter((g) => g.city === c.id) }))
    : [{ id: '', label: { en: '', zh: '' }, cards }];
  return groups
    .filter((g) => g.cards.length > 0)
    .map((g) => ({
      id: g.id,
      label: g.label,
      guides: g.cards.map((c) => c.slug),
      kinds: (kinds || [])
        .map((k) => ({ id: k.id, label: bi(k), guides: g.cards.filter((c) => c.kinds.includes(k.id)).map((c) => c.slug) }))
        .filter((t) => t.guides.length > 0),
    }));
}
