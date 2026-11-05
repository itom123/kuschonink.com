import houseJson from '../content/house.json';
import perecJson from '../content/perec.json';
import drawersJson from '../content/drawers.json';
import { projects, site, about, contact } from './content';
import type { Block, Section } from './types';
import { floorZh, t } from './i18n';

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
  /** Floor that is no room (a lobby, a corridor), as polygons in mm. */
  passages?: Passage[];
  /** Walls the rooms don't draw, [x0, y0, x1, y1] in mm. */
  walls?: [number, number, number, number][];
  doors?: DoorData[];
}

export interface Passage { id: string; en: string; zh: string; poly: [number, number][] }

export type DoorKind = 'door' | 'double' | 'opening' | 'glass' | 'sliding' | 'garage';
export interface DoorData {
  /** Along a wall, [x0, y0, x1, y1] in mm. */
  at: [number, number, number, number];
  kind: DoorKind;
  /** The label on the drawing, e.g. M0922 (900 mm wide, 2200 mm high). */
  code?: string;
  /** Which end of `at` the leaf hangs from. */
  hinge?: 'start' | 'end';
  /** The room or passage the leaf swings into. */
  into?: string;
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
  titleZh: string;
  inventory: string[];
  inventoryZh: string[];
  constraints: Constraint[];
}

export type ConstraintStatus = 'fulfilled' | 'echoing' | 'semi-fulfilled' | 'not fulfilled' | 'clinamen';

export interface Constraint {
  list: string;
  name: string;
  nameZh: string;
  value: string;
  valueZh: string;
  hidden: boolean;
  status: ConstraintStatus;
}

interface HouseData {
  grid: { columns: number[]; rows: number[] };
  tourStart: [number, number];
  floors: FloorData[];
  elevation: { src: string; hotspots: { room: string; label: string; zh: string; box: [number, number, number, number] }[] };
  lockedNote: string;
  lockedNoteZh: string;
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

function contentTitle(c?: RoomContents): { en: string; zh: string } | undefined {
  if (!c) return undefined;
  if ('project' in c) {
    const p = projects.find((p) => p.slug === c.project);
    return p && { en: p.title, zh: p.titleZh ?? '' };
  }
  return { about: t.about, contact: t.contact, writings: t.writings, colophon: t.colophon }[c.page];
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

// ---------------------------------------------------------------------------
// Doors (house.json, per floor): the one list the 2D map, the room pages and
// the 3D model all read. Each door is checked against the rooms at build time.
// ---------------------------------------------------------------------------

/** What lies at a point on a floor: a room, a passage (floor that is no room), or nothing (outside). */
export type Space = { room: RoomData; passage?: undefined } | { passage: Passage; room?: undefined } | null;

function pointIn(poly: [number, number][], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export function spaceAt(floor: FloorData, x: number, y: number): Space {
  const room = floor.rooms.find((r) => pointIn(roomPoints(r), x, y));
  if (room) return { room };
  const passage = floor.passages?.find((p) => pointIn(p.poly, x, y));
  return passage ? { passage } : null;
}
const spaceId = (s: Space) => s?.room?.id ?? s?.passage?.id ?? null;

export interface Door extends DoorData {
  floor: FloorData;
  /** Along x (a wall running east–west) or along y. */
  alongX: boolean;
  width: number;
  /** Top of the opening above the floor, in mm. */
  height: number;
  /** What's on each side: [north, south] for a wall along x, [west, east] along y. */
  sides: [Space, Space];
  /** Unit normal pointing into the side the leaf swings into (or the first side). */
  normal: [number, number];
}

const DOOR_HEIGHT: Record<DoorKind, number> = { door: 2100, double: 2100, opening: 2100, glass: 2600, sliding: 2600, garage: 2400 };

function resolveDoor(floor: FloorData, d: DoorData): Door {
  const [x0, y0, x1, y1] = d.at;
  const where = `house.json: door [${d.at.join(', ')}] on ${floor.id}`;
  const alongX = y0 === y1;
  if (!alongX && x0 !== x1) throw new Error(`${where} is not along x or y`);
  const width = Math.hypot(x1 - x0, y1 - y0);
  if (width < 500) throw new Error(`${where} is narrower than 500 mm`);
  // Codes like M0922 / TLM2718: width and height in decimetres.
  const code = d.code?.match(/^[A-Z]+(\d\d)(\d\d)$/);
  const height = code ? Number(code[2]) * 100 : DOOR_HEIGHT[d.kind];
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const n: [number, number] = alongX ? [0, -1] : [-1, 0];
  const sides: [Space, Space] = [spaceAt(floor, mx + n[0] * 300, my + n[1] * 300), spaceAt(floor, mx - n[0] * 300, my - n[1] * 300)];
  let normal: [number, number] = n;
  if (d.into) {
    const i = sides.findIndex((s) => spaceId(s) === d.into);
    if (i < 0) throw new Error(`${where} swings into "${d.into}", which is on neither side (${sides.map((s) => spaceId(s) ?? 'outside').join(' / ')})`);
    if (i === 1) normal = [-n[0], -n[1]];
  }
  if ((d.kind === 'door') !== !!d.hinge) throw new Error(`${where}: a "door" needs a hinge, and only a door has one`);
  if ((d.kind === 'door' || d.kind === 'double') && !d.into) throw new Error(`${where}: say which way it swings ("into")`);
  return { ...d, floor, alongX, width, height, sides, normal };
}

/** Does segment `at` lie along one of the lines `edges`? */
function onEdge(at: [number, number, number, number], edges: [number, number, number, number][]) {
  const [x0, y0, x1, y1] = at;
  return edges.some(([a0, b0, a1, b1]) =>
    y0 === y1
      ? b0 === b1 && b0 === y0 && Math.min(x0, x1) >= Math.min(a0, a1) - 1 && Math.max(x0, x1) <= Math.max(a0, a1) + 1
      : a0 === a1 && a0 === x0 && Math.min(y0, y1) >= Math.min(b0, b1) - 1 && Math.max(y0, y1) <= Math.max(b0, b1) + 1,
  );
}
const edgesOf = (pts: [number, number][]) => pts.map((p, i) => [...p, ...pts[(i + 1) % pts.length]] as [number, number, number, number]);

function buildDoors(floor: FloorData): Door[] {
  const doors = (floor.doors ?? []).map((d) => resolveDoor(floor, d));
  const roomEdges = [...floor.rooms.map(roomPoints), ...(floor.passages ?? []).map((p) => p.poly)].flatMap(edgesOf);
  const walls = floor.walls ?? [];
  for (const d of doors) {
    const where = `house.json: door [${d.at.join(', ')}] on ${floor.id}`;
    const inWall = onEdge(d.at, walls);
    if (!inWall && !onEdge(d.at, roomEdges)) throw new Error(`${where} is not on a room's wall`);
    const [a, b] = d.sides.map(spaceId);
    if (a === b && !inWall) throw new Error(`${where} has ${a ?? 'outside'} on both sides`);
    for (const s of d.sides) if (s?.room?.locked) throw new Error(`${where} opens into ${s.room.id}, which has no door`);
  }
  return doors;
}

export const doorsByFloor = new Map(floors.map((f) => [f.id, buildDoors(f)]));
/** The doors in and out of a room (not those inside it, in a wall the room doesn't draw). */
export const doorsOfRoom = (floor: FloorData, r: RoomData) =>
  (doorsByFloor.get(floor.id) ?? []).filter((d) => d.sides.some((s) => s?.room?.id === r.id) && d.sides[0]?.room !== d.sides[1]?.room);

/**
 * How a door is drawn on a plan, as on the drawings, in mm: the gap it makes in the wall,
 * and its marks (a leaf and the quarter circle it swings through; jambs for an opening;
 * two offset panes for a sliding door; a dashed line for a garage door).
 */
export function doorPlan(d: Door): { gap: [number, number, number, number]; marks: string; swing: string } {
  const [x0, y0, x1, y1] = d.at;
  const [nx, ny] = d.normal;
  const ux = (x1 - x0) / d.width, uy = (y1 - y0) / d.width;
  const r = (v: number) => Math.round(v);
  const leaf = (hx: number, hy: number, ex: number, ey: number) => {
    const w = Math.hypot(ex - hx, ey - hy);
    const lx = hx + nx * w, ly = hy + ny * w;
    // Sweep from the closed position (the far jamb) to the open leaf, the short way round.
    const sweep = (ex - hx) * (ly - hy) - (ey - hy) * (lx - hx) > 0 ? 1 : 0;
    return { leaf: `M ${r(hx)} ${r(hy)} L ${r(lx)} ${r(ly)}`, swing: `M ${r(ex)} ${r(ey)} A ${r(w)} ${r(w)} 0 0 ${sweep} ${r(lx)} ${r(ly)}` };
  };
  let marks = '', swing = '';
  if (d.kind === 'door') {
    const [h, e] = d.hinge === 'end' ? [[x1, y1], [x0, y0]] : [[x0, y0], [x1, y1]];
    const l = leaf(h[0], h[1], e[0], e[1]);
    marks = l.leaf;
    swing = l.swing;
  } else if (d.kind === 'double') {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const a = leaf(x0, y0, mx, my), b = leaf(x1, y1, mx, my);
    marks = `${a.leaf} ${b.leaf}`;
    swing = `${a.swing} ${b.swing}`;
  } else if (d.kind === 'opening') {
    const j = 220;
    marks = [[x0, y0], [x1, y1]].map(([x, y]) => `M ${r(x - nx * j)} ${r(y - ny * j)} L ${r(x + nx * j)} ${r(y + ny * j)}`).join(' ');
  } else if (d.kind === 'sliding') {
    const o = 50, part = d.width * 0.55;
    marks = `M ${r(x0 + nx * o)} ${r(y0 + ny * o)} L ${r(x0 + ux * part + nx * o)} ${r(y0 + uy * part + ny * o)} M ${r(x1 - nx * o)} ${r(y1 - ny * o)} L ${r(x1 - ux * part - nx * o)} ${r(y1 - uy * part - ny * o)}`;
  } else {
    // glass and garage doors: a pane (or the closed door) along the wall
    marks = `M ${r(x0)} ${r(y0)} L ${r(x1)} ${r(y1)}`;
  }
  return { gap: [x0, y0, x1, y1], marks, swing };
}

const KIND: Record<DoorKind, { en: string; zh: string; m: string }> = {
  door: { en: 'door', zh: '门', m: '扇' },
  double: { en: 'double door', zh: '双开门', m: '扇' },
  opening: { en: 'opening', zh: '门洞', m: '个' },
  glass: { en: 'glass door', zh: '玻璃门', m: '扇' },
  sliding: { en: 'sliding door', zh: '推拉门', m: '扇' },
  garage: { en: 'garage door', zh: '车库门', m: '扇' },
};

/** "door M0922", "2 sliding doors TLM2718", "1 opening" — doors counted by kind and code. */
function doorInventory(doors: Door[]): { en: string[]; zh: string[] } {
  const groups = new Map<string, { kind: DoorKind; code?: string; n: number }>();
  for (const d of doors) {
    const key = `${d.kind} ${d.code ?? ''}`;
    const g = groups.get(key) ?? { kind: d.kind, code: d.code, n: 0 };
    g.n++;
    groups.set(key, g);
  }
  const en: string[] = [], zh: string[] = [];
  for (const { kind, code, n } of groups.values()) {
    const k = KIND[kind];
    if (code) {
      en.push(n === 1 ? `${k.en} ${code}` : `${plural(n, k.en)} ${code}`);
      zh.push(n === 1 ? `${k.zh} ${code}` : `${n} ${k.m}${k.zh} ${code}`);
    } else {
      en.push(plural(n, k.en));
      zh.push(`${n} ${k.m}${k.zh}`);
    }
  }
  return { en, zh };
}

/** A Perec-style inventory, built only from facts in the drawings and the content. English and Chinese. */
function inventory(r: RoomData, floor: FloorData): { en: string[]; zh: string[] } {
  const [, , w, h] = r.rect;
  const level = r.level ?? floor.level;
  const list = [r.en, `${w} × ${h} mm`, `floor level ${level}`];
  const zh = [r.zh || r.en, `${w} × ${h} 毫米`, `楼面标高 ${level}`];
  if (r.windows?.length) {
    list.push(`window${r.windows.length > 1 ? 's' : ''} ${r.windows.join(', ')}`);
    zh.push(`窗 ${r.windows.join('、')}`);
  }
  const doors = doorInventory(doorsOfRoom(floor, r));
  list.push(...doors.en);
  zh.push(...doors.zh);
  if (r.stairs) {
    const up = floors.find((f) => f.id === r.stairs);
    list.push(`stairs up to the ${up?.name.toLowerCase()}`);
    zh.push(`楼梯通往${up ? floorZh(up.zh) : ''}`);
  }
  if (r.outdoor) { list.push('open to the sky'); zh.push('露天'); }
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
      zh.push(`《${p.titleZh ?? p.title}》`);
      if (n.images) { list.push(plural(n.images, 'photograph')); zh.push(`${n.images} 张照片`); }
      if (n.texts) { list.push(plural(n.texts, 'text')); zh.push(`${n.texts} 段文字`); }
      if (n.videos) { list.push(plural(n.videos, 'video')); zh.push(`${n.videos} 段视频`); }
    }
  }
  if (r.locked) { list.push('no door', 'no window'); zh.push('无门', '无窗'); }
  return { en: list, zh };
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
      const title = contentTitle(r.contents);
      const inv = inventory(r, floor);
      out.push({
        ...r,
        key: `${floor.id}/${r.id}`,
        slug: `${floor.id}-${r.id}`,
        floor,
        chapter,
        cell: entry.get(r)!,
        title: title?.en ?? r.en,
        titleZh: title?.zh || r.zh,
        inventory: inv.en,
        inventoryZh: inv.zh,
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
  zh: string;
  hidden?: boolean;
  /** 'row' = the grid row; k = the Latin square L_k(c, r) = (k·c + r) mod 5. */
  square: 'row' | number;
  items: { label: string; zh: string; match: string[] }[];
}
export const perec = perecJson as unknown as {
  lists: PerecList[];
  clinamen: string;
  clinamenZh: string;
  chronology: { when: string; whenZh: string; what: string; whatZh: string; room?: string }[];
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
  titleZh?: string;
  date: string;
  excerpt?: string;
  excerptZh?: string;
  object: 'letter' | 'page' | 'notebook';
  objectLabel: string;
  objectLabelZh?: string;
  references: ({ project: string } | { room: string } | { piece: string })[];
  html: string;
  htmlZh?: string;
}
export interface Placement {
  piece: Piece;
  room: Room;
  furniture: Furniture;
  drawer: number;
  /** The dealt constraints this piece fulfils in its room. */
  fulfils: { name: string; nameZh: string; value: string; valueZh: string }[];
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
          .map(({ list, item }) => ({ name: list.name, nameZh: list.zh, value: item.label, valueZh: item.zh }));
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
    return { list: list.id, name: list.name, nameZh: list.zh, value: item.label, valueZh: item.zh, hidden: !!list.hidden, status };
  });
  room.constraints.unshift({
    list: 'coordinates',
    name: 'Room coordinates',
    nameZh: '房间坐标',
    value: `${room.floor.name.toLowerCase()}, square ${coordinate(room.cell)}`,
    valueZh: `${floorZh(room.floor.zh)}，${coordinate(room.cell)} 格`,
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

// ---------------------------------------------------------------------------
// Walking: stairs between floors, and the rooms next door.
// ---------------------------------------------------------------------------

export interface StairLink { from: Room; to: Room; floor: FloorData }
export interface Stairs {
  /** Where the stairs are drawn on this floor, in mm. */
  box: [number, number, number, number];
  up?: StairLink;
  down?: StairLink;
}

const contains = (r: RoomData, x: number, y: number) => {
  const [rx, ry, rw, rh] = r.rect;
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
};

/** The room you arrive in on `floor` when the stairs in `from` lead there. */
function landing(floor: FloorData, from: RoomData): Room {
  const [x, y, w, h] = from.rect;
  const data =
    floor.rooms.find((r) => r.stairs) ??
    floor.rooms.find((r) => !r.locked && contains(r, x + w / 2, y + h / 2)) ??
    floor.rooms.find((r) => !r.locked)!;
  return roomByKey.get(`${floor.id}/${data.id}`)!;
}

/** The stairs on a floor: up to the next floor (a room's `stairs`), down to the floor whose stairs lead here. */
export function stairsOf(floor: FloorData): Stairs | undefined {
  const own = floor.rooms.find((r) => r.stairs);
  const below = floors.find((f) => f.rooms.some((r) => r.stairs === floor.id));
  const belowStairs = below?.rooms.find((r) => r.stairs === floor.id);
  const here = own ?? belowStairs;
  if (!here) return undefined;
  const fromRoom = landing(floor, here);
  const out: Stairs = { box: here.rect };
  if (own) {
    const upFloor = floors.find((f) => f.id === own.stairs);
    if (!upFloor) throw new Error(`house.json: ${floor.id}/${own.id} has stairs to unknown floor "${own.stairs}"`);
    out.up = { from: fromRoom, to: landing(upFloor, own), floor: upFloor };
  }
  if (below && belowStairs) {
    out.down = { from: fromRoom, to: roomByKey.get(`${below.id}/${belowStairs.id}`)!, floor: below };
  }
  return out;
}

export const stairsByFloor = new Map(floors.map((f) => [f.id, stairsOf(f)]));

export type Direction = 'north' | 'east' | 'south' | 'west';
const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];
const centre = (r: RoomData) => [r.rect[0] + r.rect[2] / 2, r.rect[1] + r.rect[3] / 2];

const roomOf = (floor: FloorData, r: RoomData) => roomByKey.get(`${floor.id}/${r.id}`)!;

/** Which wall of the room a door is in (top of the plan is north). */
function sideOf(room: RoomData, d: Door): Direction {
  const [cx, cy] = centre(room);
  const [x0, y0, x1, y1] = d.at;
  return d.alongX ? (y0 < cy ? 'north' : 'south') : (x0 + x1) / 2 < cx ? 'west' : 'east';
}

/**
 * The rooms a room's doors lead to, each with the wall its door is in. A door onto a passage
 * (a lobby, a corridor) leads to every room that opens onto that passage too.
 */
function throughDoors(room: Room): { to: Room; dir: Direction }[] {
  const floor = room.floor;
  const doors = doorsByFloor.get(floor.id) ?? [];
  const out: { to: Room; dir: Direction }[] = [];
  const add = (to: RoomData, dir: Direction) => {
    if (to.id === room.id || to.locked || out.some((o) => o.to.id === to.id)) return;
    out.push({ to: roomOf(floor, to), dir });
  };
  for (const d of doorsOfRoom(floor, room)) {
    const other = d.sides.find((s) => s?.room?.id !== room.id);
    if (!other) continue;
    const dir = sideOf(room, d);
    if (other.room) add(other.room, dir);
    else for (const e of doors) {
      if (!e.sides.some((s) => s?.passage === other.passage)) continue;
      for (const s of e.sides) if (s?.room) add(s.room, dir);
    }
  }
  return out;
}

/** The ways out of a room: rooms through its doors, by direction (no locked rooms), and the stairs if it has them. */
export function exitsOf(room: Room) {
  const next = throughDoors(room);
  const byDir = DIRECTIONS.map((dir) => ({
    dir,
    rooms: next.filter((o) => o.dir === dir).map((o) => o.to).sort((a, b) => a.chapter - b.chapter),
  })).filter((g) => g.rooms.length);
  const s = stairsByFloor.get(room.floor.id);
  const onStairs = s && (s.up?.from === room || s.down?.from === room);
  return { byDir, up: onStairs ? s.up : undefined, down: onStairs ? s.down : undefined };
}

// Every room you can enter is reached through doors from its floor's stairs, or the build stops.
for (const floor of floors) {
  const start = floor.rooms.find((r) => r.stairs);
  if (!start) continue;
  const seen = new Set([start.id]);
  const queue = [roomOf(floor, start)];
  while (queue.length) for (const { to } of throughDoors(queue.shift()!)) if (!seen.has(to.id)) { seen.add(to.id); queue.push(to); }
  const cut = floor.rooms.filter((r) => !r.outdoor && !r.locked && !seen.has(r.id));
  if (cut.length) throw new Error(`house.json: on ${floor.id}, no door leads to ${cut.map((r) => r.id).join(', ')}`);
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

// ---------------------------------------------------------------------------
// The 3D model (/house/3d): the same rooms, in metres, with heights.
// Plan x → world x, plan y (south is down) → world z, up is y.
// ---------------------------------------------------------------------------

/** "±0.000", "3.600", "−0.450" → metres. */
export function levelMetres(s: string): number {
  return Number(s.replace('±', '').replace('−', '-')) || 0;
}

/** The curved front of the porch and of the balcony above it (the rooms marked `arc`), bulging south over the porch's width. */
function arcPoints(r: RoomData): [number, number][] {
  const porch = floors[0].rooms.find((o) => o.arc);
  const pts = roomPoints(r);
  if (!r.arc || !porch) return pts;
  // The south edge, running west: replace its middle with the curve.
  const yb = r.rect[1] + r.rect[3];
  const i = pts.findIndex((p, k) => {
    const q = pts[(k + 1) % pts.length];
    return p[1] === yb && q[1] === yb && q[0] < p[0];
  });
  if (i < 0) return pts;
  const [xa] = pts[i], [xb] = pts[(i + 1) % pts.length];
  const x0 = Math.max(xb, porch.rect[0]), x1 = Math.min(xa, porch.rect[0] + porch.rect[2]);
  const curve: [number, number][] = [];
  if (x1 < xa) curve.push([x1, yb]);
  for (let k = 1; k < 16; k++) {
    const t = k / 16;
    curve.push([x1 + (x0 - x1) * t, yb + 2800 * t * (1 - t)]);
  }
  if (x0 > xb) curve.push([x0, yb]);
  return [...pts.slice(0, i + 1), ...curve, ...pts.slice(i + 1)];
}

export function model3d() {
  const m = (v: number) => Math.round(v) / 1000;
  const levels = floors.map((f) => levelMetres(f.level));
  return {
    grid: { columns: house.grid.columns.map(m), rows: house.grid.rows.map(m) },
    floors: floors.map((f, i) => ({
      id: f.id, label: f.label, name: f.name, zh: floorZh(f.zh), level: levels[i],
      storey: i < floors.length - 1 ? levels[i + 1] - levels[i] : 0,
    })),
    rooms: rooms.map((r) => {
      return {
        slug: r.slug, floor: r.floor.id, chapter: r.locked ? null : r.chapter,
        en: r.en, zh: r.zh || r.en, title: r.title, titleZh: r.titleZh,
        points: arcPoints(r).map(([x, y]) => [m(x), m(y)]),
        rect: r.rect.map(m),
        level: levelMetres(r.level ?? r.floor.level),
        outdoor: !!r.outdoor, locked: !!r.locked, stairs: !!r.stairs, contents: !!r.contents,
      };
    }),
    doors: floors.flatMap((f) =>
      (doorsByFloor.get(f.id) ?? []).map((d) => ({
        floor: f.id, at: d.at.map(m), kind: d.kind, code: d.code ?? null, hinge: d.hinge ?? null,
        height: m(d.height), normal: d.normal,
      })),
    ),
    walls: floors.flatMap((f) => (f.walls ?? []).map((w) => ({ floor: f.id, at: w.map(m) }))),
    passages: floors.flatMap((f) => (f.passages ?? []).map((p) => ({ floor: f.id, id: p.id, points: p.poly.map(([x, y]) => [m(x), m(y)]) }))),
  };
}
export type Model3d = ReturnType<typeof model3d>;
