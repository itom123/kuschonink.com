import houseJson from '../content/house.json';
import { projects, site } from './content';
import type { Block } from './types';

export type RoomContents =
  | { project: string }
  | { page: 'about' | 'contact' | 'writings' | 'colophon' };

export interface RoomData {
  id: string;
  zh: string;
  en: string;
  /** [x, y, width, height] in millimetres */
  rect: [number, number, number, number];
  poly?: [number, number][];
  level?: string;
  windows?: string[];
  doors?: string[];
  stairs?: string;
  outdoor?: boolean;
  arc?: boolean;
  locked?: boolean;
  contents?: RoomContents;
}

export interface FloorData {
  id: string;
  label: string;
  name: string;
  zh: string;
  level: string;
  area?: string;
  scan: { src: string; x: number; y: number; width: number; height: number };
  rooms: RoomData[];
}

export interface Room extends RoomData {
  /** Unique key, e.g. "f1/kitchen" */
  key: string;
  /** URL slug, e.g. "f1-kitchen" */
  slug: string;
  floor: FloorData;
  chapter: number;
  title: string;
  inventory: string[];
}

interface HouseData {
  grid: { columns: number[]; rows: number[] };
  tourStart: [number, number];
  floors: FloorData[];
  elevation: { src: string; hotspots: { room: string; label: string; box: [number, number, number, number] }[] };
  lockedNote: string;
}

export const house = houseJson as unknown as HouseData;
export const floors = house.floors;

/**
 * Perec's constraint: a knight's tour over the 5 × 5 structural grid shared
 * by every floor. Chapter numbers follow the order in which the tour first
 * enters each room, floor by floor from the ground up.
 */
export function knightsTour(cols: number, rows: number, start: [number, number]): [number, number][] {
  const moves = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const seen = new Set<string>();
  const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows;
  const next = (c: number, r: number) =>
    moves.map(([dc, dr]) => [c + dc, r + dr] as [number, number]).filter(([a, b]) => inside(a, b) && !seen.has(`${a},${b}`));
  const path: [number, number][] = [start];
  seen.add(start.join(','));
  let cur = start;
  // Warnsdorff's rule: always move to the square with the fewest onward moves.
  while (path.length < cols * rows) {
    const options = next(...cur).sort((a, b) => next(...a).length - next(...b).length);
    if (!options.length) break;
    cur = options[0];
    seen.add(cur.join(','));
    path.push(cur);
  }
  return path;
}

const { columns, rows } = house.grid;
export const tour = knightsTour(columns.length - 1, rows.length - 1, house.tourStart);

function overlaps(r: RoomData, c: number, row: number) {
  const [x, y, w, h] = r.rect;
  const cx0 = columns[c], cx1 = columns[c + 1], cy0 = rows[row], cy1 = rows[row + 1];
  return x < cx1 && x + w > cx0 && y < cy1 && y + h > cy0;
}

function contentTitle(c?: RoomContents): string | undefined {
  if (!c) return undefined;
  if ('project' in c) return projects.find((p) => p.slug === c.project)?.title;
  return { about: 'About', contact: 'Contact', writings: 'Writings', colophon: 'Colophon' }[c.page];
}

function countBlocks(blocks: Block[]) {
  let images = 0, texts = 0, videos = 0;
  for (const b of blocks) {
    if (b.type === 'image') images++;
    if (b.type === 'gallery' || b.type === 'banner') images += b.images.length;
    if (b.type === 'text' || b.type === 'marquee') texts++;
    if (b.type === 'video') videos++;
  }
  return { images, texts, videos };
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** A Perec-style inventory, built only from facts in the drawings and the content. */
function inventory(r: RoomData, floor: FloorData): string[] {
  const [, , w, h] = r.rect;
  const list = [`${r.zh ? r.zh + ' · ' : ''}${r.en}`, `${w} × ${h} mm`, `floor level ${r.level ?? floor.level}`];
  if (r.windows?.length) list.push(`window${r.windows.length > 1 ? 's' : ''} ${r.windows.join(', ')}`);
  if (r.doors?.length) list.push(`door${r.doors.length > 1 ? 's' : ''} ${r.doors.join(', ')}`);
  if (r.stairs) list.push(`stairs up to the ${floors.find((f) => f.id === r.stairs)?.name.toLowerCase()}`);
  if (r.outdoor) list.push('open to the sky');
  if (r.contents && 'project' in r.contents) {
    const p = projects.find((p) => p.slug === (r.contents as { project: string }).project);
    if (p) {
      const n = p.sections.reduce(
        (acc, s) => {
          const c = countBlocks(s.blocks);
          return { images: acc.images + c.images + (s.background ? 1 : 0), texts: acc.texts + c.texts, videos: acc.videos + c.videos };
        },
        { images: 0, texts: 0, videos: 0 },
      );
      list.push(`“${p.title}”`);
      if (n.images) list.push(plural(n.images, 'photograph'));
      if (n.texts) list.push(plural(n.texts, 'text'));
      if (n.videos) list.push(plural(n.videos, 'video'));
    }
  }
  if (r.locked) list.push('no door', 'no window');
  return list;
}

function buildRooms(): Room[] {
  const out: Room[] = [];
  let chapter = 0;
  for (const floor of floors) {
    const order: RoomData[] = [];
    for (const [c, row] of tour) {
      for (const r of floor.rooms) if (!order.includes(r) && overlaps(r, c, row)) order.push(r);
    }
    for (const r of floor.rooms) if (!order.includes(r)) order.push(r);
    for (const r of order) {
      chapter++;
      out.push({
        ...r,
        key: `${floor.id}/${r.id}`,
        slug: `${floor.id}-${r.id}`,
        floor,
        chapter,
        title: contentTitle(r.contents) ?? r.en,
        inventory: inventory(r, floor),
      });
    }
  }
  return out;
}

/** Every room in the house, in chapter order. */
export const rooms = buildRooms();
export const roomByKey = new Map(rooms.map((r) => [r.key, r]));
export const roomBySlug = new Map(rooms.map((r) => [r.slug, r]));

export function roomForProject(slug: string) {
  return rooms.find((r) => r.contents && 'project' in r.contents && r.contents.project === slug);
}

export function roomForPage(page: string) {
  return rooms.find((r) => r.contents && 'page' in r.contents && r.contents.page === page);
}

/** Next / previous room in chapter order, skipping nothing: Perec's reader walks every room. */
export function neighbours(room: Room) {
  const i = rooms.indexOf(room);
  return { prev: rooms[i - 1], next: rooms[i + 1] };
}

/** Bounding box of a floor (rooms only), in mm. */
export function floorBounds(floor: FloorData) {
  const xs = floor.rooms.flatMap((r) => [r.rect[0], r.rect[0] + r.rect[2]]);
  const ys = floor.rooms.flatMap((r) => [r.rect[1], r.rect[1] + r.rect[3]]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

export function roomPoints(r: RoomData): [number, number][] {
  if (r.poly) return r.poly;
  const [x, y, w, h] = r.rect;
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

export const siteName = site.name;
