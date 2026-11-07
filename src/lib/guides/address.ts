// Field Guide (导览): a guide's address. No guide content here, so the build
// and the Worker can both use it.
//
// A guide lives at /guides/<slug> for good, dormant or not:
//   <slug> = <city>-<yyyy>-<mm> for a dated guide   (paris-2026-11)
//            <city>-<topic>     for one without dates (paris-cafes)
// The city part is guide.json "city" written as an address (citySlug), so
// /guides/<city> can always open the newest listed guide for that city.
// An address never changes once shared. If one has to, access.json "moved"
// keeps the old one working: { "<old slug>": "<slug>" }.
import type { AccessFile } from './types';

/** What a slug may look like: lower-case-kebab. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "São Paulo" → "sao-paulo": a city written as the first part of an address. */
export function citySlug(city: string): string {
  return city
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type Access = Pick<AccessFile, 'guides' | 'moved'>;
const has = (o: object | undefined, k: string) => !!o && Object.hasOwn(o, k);

/** The guide an address names now: itself, or where "moved" sends an old one; null for neither. */
export function currentSlug(access: Access, slug: string): string | null {
  if (has(access.guides, slug)) return slug;
  const to = has(access.moved, slug) ? access.moved![slug] : undefined;
  return typeof to === 'string' && has(access.guides, to) ? to : null;
}

/** Every name a guide answers to: its slug first, then the old ones "moved" sends to it. */
export function slugNames(access: Access, slug: string): string[] {
  const old = Object.entries(access.moved ?? {}).filter(([k, v]) => !k.startsWith('_') && v === slug && k !== slug).map(([k]) => k);
  return [slug, ...old];
}

/**
 * The newest listed guide of each city, as the /guides page tells the Worker
 * (data-gd-cities): "paris:paris-2026-11 lisbon:lisbon-2027-06". `listed` is
 * in access.json order, so the first guide of a city there wins.
 */
export function cityLine(listed: { slug: string; city: string }[]): string {
  const seen = new Map<string, string>();
  for (const g of listed) {
    const c = citySlug(g.city);
    if (c && SLUG.test(c) && SLUG.test(g.slug) && !seen.has(c)) seen.set(c, g.slug);
  }
  return [...seen].map(([c, s]) => `${c}:${s}`).join(' ');
}

/** The guide /guides/<city> opens, from a cityLine(); null when there is none. */
export function cityGuide(line: string, city: string): string | null {
  for (const pair of line.split(' ')) {
    const [c, s] = pair.split(':');
    if (c === city && s && SLUG.test(s)) return s;
  }
  return null;
}
