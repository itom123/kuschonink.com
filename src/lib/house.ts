import houseJson from '../content/house.json';
import perecJson from '../content/perec.json';
import drawersJson from '../content/drawers.json';
import { projects, site, about, contact } from './content';
import type { Block, Section } from './types';

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
  /** Grid square [column, row] where the knight first enters the room. */
  cell: [number, number];
  title: string;
  inventory: string[];
  constraints: Constraint[];
}

export type ConstraintStatus = 'fulfilled' | 'echoing' | 'semi-fulfilled' | 'not fulfilled' | 'clinamen';

export interface Constraint {
  list: string;
  name: string;
  value: string;
  hidden: boolean;
  status: ConstraintStatus;
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

/** The grid square containing a point, clamped to the grid. */
function cellAt(x: number, y: number): [number, number] {
  const find = (lines: number[], v: number) => {
    for (let i = 0; i < lines.length - 1; i++) if (v < lines[i + 1]) return i;
    return lines.length - 2;
  };
  return [Math.max(0, find(columns, x)), Math.max(0, find(rows, y))];
}

function buildRooms(): Room[] {
  const out: Room[] = [];
  let chapter = 0;
  for (const floor of floors) {
    const order: RoomData[] = [];
    const entry = new Map<RoomData, [number, number]>();
    for (const [c, row] of tour) {
      for (const r of floor.rooms) {
        if (!order.includes(r) && overlaps(r, c, row)) {
          order.push(r);
          entry.set(r, [c, row]);
        }
      }
    }
    for (const r of floor.rooms) {
      if (!order.includes(r)) {
        order.push(r);
        entry.set(r, cellAt(r.rect[0] + r.rect[2] / 2, r.rect[1] + r.rect[3] / 2));
      }
    }
    for (const r of order) {
      chapter++;
      out.push({
        ...r,
        key: `${floor.id}/${r.id}`,
        slug: `${floor.id}-${r.id}`,
        floor,
        chapter,
        cell: entry.get(r)!,
        title: contentTitle(r.contents) ?? r.en,
        inventory: inventory(r, floor),
        constraints: [],
      });
    }
  }
  return out;
}

/** Every room in the house, in chapter order. */
export const rooms = buildRooms();
export const roomByKey = new Map(rooms.map((r) => [r.key, r]));
export const roomBySlug = new Map(rooms.map((r) => [r.slug, r]));

// ---------------------------------------------------------------------------
// Constraints (perec.json): lists dealt by orthogonal Latin squares of order 5.
// ---------------------------------------------------------------------------

export interface PerecList {
  id: string;
  name: string;
  hidden?: boolean;
  /** 'row' = the grid row; k = the Latin square L_k(c, r) = (k·c + r) mod 5. */
  square: 'row' | number;
  items: { label: string; match: string[] }[];
}
export const perec = perecJson as unknown as {
  lists: PerecList[];
  clinamen: string;
  chronology: { when: string; what: string; room?: string }[];
};

const N = columns.length - 1;
export function latin(square: 'row' | number, [c, r]: [number, number]) {
  return square === 'row' ? r : (square * c + r) % N;
}

/** Column letter + row number, e.g. "B3". */
export const coordinate = ([c, r]: [number, number]) => `${String.fromCharCode(65 + c)}${r + 1}`;

/** Plain text of whatever is kept in a room. */
function roomText(r: Room): string {
  const c = r.contents;
  let sections: Section[] = [];
  let extra = '';
  if (c && 'project' in c) {
    const p = projects.find((x) => x.slug === c.project);
    if (p) { sections = p.sections; extra = p.title; }
  } else if (c && 'page' in c) {
    if (c.page === 'about') sections = about.sections;
    if (c.page === 'contact') sections = contact.sections;
  }
  const html = sections.flatMap((s) => s.blocks).map((b) =>
    b.type === 'text' ? b.html : b.type === 'marquee' ? b.items.join(' ') : 'caption' in b && b.caption ? b.caption : '',
  );
  return (extra + ' ' + html.join(' ')).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
}

function touches(a: RoomData, b: RoomData) {
  const [ax, ay, aw, ah] = a.rect, [bx, by, bw, bh] = b.rect;
  const overlapX = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
  const overlapY = Math.min(ay + ah, by + bh) - Math.max(ay, by);
  return (overlapX >= 0 && overlapY > 0) || (overlapY >= 0 && overlapX > 0);
}

// ---------------------------------------------------------------------------
// Drawers (drawers.json + writings/*.json). Pieces are placed by rule:
// 1. a piece goes to the room whose dealt list items it mentions most;
// 2. ties go to the earlier chapter; 3. one piece per drawer, oldest piece first.
// ---------------------------------------------------------------------------

export interface Furniture { id: string; zh: string; en: string; rect: [number, number, number, number]; drawers: number }
export interface Piece {
  id: string;
  title: string;
  date: string;
  excerpt?: string;
  object: 'letter' | 'page' | 'notebook';
  objectLabel: string;
  references: ({ project: string } | { room: string } | { piece: string })[];
  html: string;
}
export interface Placement {
  piece: Piece;
  room: Room;
  furniture: Furniture;
  drawer: number;
  /** The dealt constraints this piece fulfils in its room. */
  fulfils: { name: string; value: string }[];
}

const furnitureByRoom = (drawersJson as { rooms: Record<string, Furniture[]> }).rooms;
const pieceFiles = import.meta.glob<Omit<Piece, 'id'>>('../content/writings/*.json', { eager: true, import: 'default' });
export const pieces: Piece[] = Object.entries(pieceFiles)
  .map(([path, data]) => ({ ...data, id: path.split('/').pop()!.replace(/\.json$/, '') }))
  .sort((a, b) => a.date.localeCompare(b.date));

for (const key of Object.keys(furnitureByRoom)) {
  if (!roomByKey.has(key)) throw new Error(`drawers.json: unknown room "${key}"`);
}

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
const dealt = (room: Room) =>
  perec.lists.map((list) => ({ list, item: list.items[latin(list.square, room.cell)] }));

function place(): Placement[] {
  const free = new Map<string, { furniture: Furniture; drawer: number }[]>(
    Object.entries(furnitureByRoom).map(([key, fs]) => [key, fs.flatMap((f) => Array.from({ length: f.drawers }, (_, i) => ({ furniture: f, drawer: i + 1 })))]),
  );
  const out: Placement[] = [];
  for (const piece of pieces) {
    const text = plain(piece.title + ' ' + piece.html).toLowerCase();
    const candidates = Object.keys(furnitureByRoom)
      .map((key) => roomByKey.get(key)!)
      .filter((room) => free.get(room.key)!.length > 0)
      .map((room) => {
        const fulfils = dealt(room)
          .filter(({ item }) => item.match.some((w) => text.includes(w.toLowerCase())))
          .map(({ list, item }) => ({ name: list.name, value: item.label }));
        return { room, fulfils };
      })
      .sort((a, b) => b.fulfils.length - a.fulfils.length || a.room.chapter - b.room.chapter);
    const best = candidates[0];
    if (!best) throw new Error(`No free drawer for "${piece.title}". Add drawers in drawers.json.`);
    const slot = free.get(best.room.key)!.shift()!;
    out.push({ piece, room: best.room, ...slot, fulfils: best.fulfils });
  }
  return out;
}

export const placements = place();
export const furnitureOf = (room: Room) => furnitureByRoom[room.key] ?? [];
export const placementsIn = (room: Room) => placements.filter((p) => p.room === room);
export const placementOf = (id: string) => placements.find((p) => p.piece.id === id);

// References are declared once and must resolve, or the build stops.
for (const p of pieces) {
  for (const ref of p.references) {
    const ok =
      ('project' in ref && projects.some((x) => x.slug === ref.project)) ||
      ('room' in ref && roomByKey.has(ref.room)) ||
      ('piece' in ref && pieces.some((x) => x.id === ref.piece));
    if (!ok) throw new Error(`writings/${p.id}.json: reference ${JSON.stringify(ref)} does not exist`);
  }
}

/** Projects whose own text shares a list item with a piece: references found by the rules. */
export function sharedItems(piece: Piece) {
  const text = plain(piece.title + ' ' + piece.html).toLowerCase();
  const items = perec.lists.flatMap((l) => l.items).filter((i) => i.match.some((w) => text.includes(w.toLowerCase())));
  return items.map((item) => ({
    item,
    rooms: rooms.filter((r) => r.contents && item.match.some((w) => texts.get(r.key)!.includes(w.toLowerCase()))),
  }));
}

const drawerText = (r: Room) => placementsIn(r).map((p) => plain(p.piece.html)).join(' ');
const texts = new Map(rooms.map((r) => [r.key, (roomText(r) + ' ' + drawerText(r)).toLowerCase()]));
const has = (key: string, words: string[]) => words.some((w) => texts.get(key)!.includes(w.toLowerCase()));

/** Neighbouring rooms (sharing a wall) on the same floor. */
export const adjacent = new Map(
  rooms.map((r) => [r.key, rooms.filter((o) => o !== r && o.floor === r.floor && touches(r, o))]),
);

// The clinamen: on each floor, the last room the knight reaches (doors only).
const clinamenRooms = new Set(
  floors.map((f) => [...rooms].reverse().find((r) => r.floor === f && !r.locked && r.contents)?.key ?? ''),
);

for (const room of rooms) {
  room.constraints = perec.lists.map((list) => {
    const item = list.items[latin(list.square, room.cell)];
    let status: ConstraintStatus = 'not fulfilled';
    if (has(room.key, item.match)) status = 'fulfilled';
    else if (adjacent.get(room.key)!.some((o) => has(o.key, item.match))) status = 'echoing';
    else if (rooms.some((o) => o !== room && has(o.key, item.match))) status = 'semi-fulfilled';
    if (list.id === 'quote' && clinamenRooms.has(room.key)) status = 'clinamen';
    return { list: list.id, name: list.name, value: item.label, hidden: !!list.hidden, status };
  });
  room.constraints.unshift({
    list: 'coordinates',
    name: 'Room coordinates',
    value: `${room.floor.name.toLowerCase()}, square ${coordinate(room.cell)}`,
    hidden: true,
    status: 'fulfilled',
  });
}

/** Rooms whose own content mentions any of these words. */
export function roomsMentioning(words: string[]) {
  return rooms.filter((r) => has(r.key, words));
}

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
