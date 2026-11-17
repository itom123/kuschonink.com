// The small house beside the floor buttons: the whole house in 3D, in plain lines, turning
// slowly. It is built from the same rooms as the plan (walls where a room meets the outside,
// the doors, glass and windows on the façade, the roof from the roof plan, the attic's walls
// up to it).
//
// - Floors below yours stand whole; yours is cut open at waist height; floors above are faint.
// - The room you're in is yellow, as on the plan.
// - The part of the plan on screen is outlined on your floor, with a dot where you are.
//
// Drag it to turn it. With reduced motion it stands still, facing the front door.
// Canvas 2D and a hand-rolled projection, so the map pages don't need three.js.
import { EAVE, roofOf, type V3 } from '../lib/house-shell';
import { countLosses, onDprChange } from './gl-diag';

type Pt = [number, number];
type Seg = [number, number, number, number];

/** Built in HouseMap.astro, in metres (plan x → x, plan y → z, up is y). */
export interface MiniData {
  floors: { id: string; level: number }[];
  rooms: { slug: string; floor: string; points: Pt[]; level: number; outdoor: boolean; locked: boolean; stairs: boolean }[];
  /** Floor the rooms leave out (a lobby, a corridor), as polygons. */
  fills: Record<string, Pt[][]>;
  doors: Record<string, Seg[]>;
  glazing: Record<string, Seg[]>;
  /** Windows traced from the plans, by floor: sill and height above the floor. */
  windows: Record<string, { at: Seg; sill: number; height: number }[]>;
}

export interface MiniState {
  floor: string;
  room: string | null;
  /** The part of the plan on screen, in millimetres: [x, y, w, h]. */
  view: [number, number, number, number] | null;
}

const GROUND = -0.6;
const LOW = 1.1; // the cut-open walls of your floor
const DOOR = 2.1;
const GLAZED = 2.6;
const TILT = (27 * Math.PI) / 180; // looking down on the house
const SPIN = (2 * Math.PI) / 48; // one turn in 48 s
const FRONT = -0.55; // standing to the south-east, facing the front door

const INK = '#000';
const HERE = '#ffff66';
const LINK = '#0000ee';

function inside([x, z]: Pt, poly: Pt[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

interface Wall {
  a: Pt; b: Pt; n: Pt; y0: number; y1: number;
  /** On the attic, its top under the roof: [metres from a, height], from a to b. */
  top?: Pt[];
  /** Openings along the wall, as [from, to] in metres from a, with their kind. */
  openings: { u0: number; u1: number; kind: 'door' | 'glass' }[];
  /** Windows: [from, to] in metres from a, and their sill and head heights. */
  windows: { u0: number; u1: number; y0: number; y1: number }[];
}
/** A face of the roof: its pieces (filled), its edges (drawn) and tiles. */
interface Face { pieces: V3[][]; edges: [V3, V3][]; n: V3; stripes: [V3, V3][] }

export function startMini(canvas: HTMLCanvasElement, data: MiniData, signal: AbortSignal) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { set: () => {} };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- The house, once ----
  const floors = data.floors;
  const roofFloor = floors[floors.length - 1];
  const topRoomFloor = floors[floors.length - 2];
  const roomsOf = (id: string) => data.rooms.filter((r) => r.floor === id);
  const wallTop = (i: number) => (floors[i] === topRoomFloor ? EAVE : floors[i + 1].level);
  const roof = roofOf(roofFloor.level);
  const roofAt = (x: number, z: number) => roof.at(x, z) ?? EAVE;

  /** Openings that lie on the line a→b, as [u0, u1] from a. */
  function openingsOn(a: Pt, b: Pt, segs: Seg[]) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const out: [number, number][] = [];
    for (const [x0, z0, x1, z1] of segs) {
      // Both ends on the line (within 15 cm), then project.
      const off = (x: number, z: number) => Math.abs((x - a[0]) * uz - (z - a[1]) * ux);
      if (off(x0, z0) > 0.15 || off(x1, z1) > 0.15) continue;
      const p = (x0 - a[0]) * ux + (z0 - a[1]) * uz, q = (x1 - a[0]) * ux + (z1 - a[1]) * uz;
      const u0 = Math.max(0, Math.min(p, q)), u1 = Math.min(len, Math.max(p, q));
      if (u1 - u0 > 0.05) out.push([u0, u1]);
    }
    return out;
  }

  // Outside walls: the parts of each indoor room's edges with no indoor floor beyond them.
  const walls = new Map<string, Wall[]>();
  floors.forEach((f, i) => {
    if (f === roofFloor) return;
    const here = roomsOf(f.id);
    const indoor = [...here.filter((r) => !r.outdoor).map((r) => r.points), ...(data.fills[f.id] ?? [])];
    const doors = (data.doors[f.id] ?? []);
    const glass = (data.glazing[f.id] ?? []);
    const traced = data.windows[f.id] ?? [];
    const list: Wall[] = [];
    // Rooms, and passages where they meet the outside (the attic corridor's north wall).
    const shapes = [
      ...here.filter((r) => !r.outdoor),
      ...(data.fills[f.id] ?? []).map((points) => ({ points, level: f.level, stairs: false })),
    ];
    for (const r of shapes) {
      const n = r.points.length;
      for (let k = 0; k < n; k++) {
        const a = r.points[k], b = r.points[(k + 1) % n];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 0.05) continue;
        const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
        let nx = uz, nz = -ux;
        const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (inside([mid[0] + nx * 0.05, mid[1] + nz * 0.05], r.points)) { nx = -nx; nz = -nz; }
        // Walk the edge in short steps and keep the runs that face the outside.
        const steps = Math.max(1, Math.round(len / 0.2));
        let start = -1;
        for (let s = 0; s <= steps; s++) {
          let outside = false;
          if (s < steps) {
            const u = ((s + 0.5) / steps) * len;
            const p: Pt = [a[0] + ux * u + nx * 0.3, a[1] + uz * u + nz * 0.3];
            outside = !indoor.some((poly) => poly !== r.points && inside(p, poly));
          }
          if (outside && start < 0) start = s;
          if (!outside && start >= 0) {
            const u0 = (start / steps) * len, u1 = (s / steps) * len;
            const p: Pt = [a[0] + ux * u0, a[1] + uz * u0], q: Pt = [a[0] + ux * u1, a[1] + uz * u1];
            const tall = wallTop(i) - r.level;
            const openings = [
              ...openingsOn(p, q, doors).map(([o0, o1]) => ({ u0: o0, u1: o1, kind: 'door' as const })),
              ...openingsOn(p, q, glass).map(([o0, o1]) => ({ u0: o0, u1: o1, kind: 'glass' as const })),
            ].sort((m, o) => m.u0 - o.u0);
            // The windows traced from the plan; else one in the middle of each long solid stretch
            // (not on the stairs), as in /house/3d.
            const windows: Wall['windows'] = [];
            for (const w of traced) {
              for (const [o0, o1] of openingsOn(p, q, [w.at])) windows.push({ u0: o0, u1: o1, y0: r.level + w.sill, y1: r.level + w.sill + w.height });
            }
            if (!traced.length && !r.stairs && tall > 2.4) {
              let v = 0;
              for (const o of [...openings, { u0: u1 - u0, u1: u1 - u0 }]) {
                const piece = o.u0 - v;
                if (piece >= 2.4) {
                  const w = Math.min(1.8, piece * 0.45), c = v + piece / 2;
                  windows.push({ u0: c - w / 2, u1: c + w / 2, y0: r.level + 0.9, y1: r.level + 2.3 });
                }
                v = Math.max(v, o.u1);
              }
            }
            // On the attic the walls rise to the roof: their gables, and the knee walls under the eaves.
            let top: Pt[] | undefined;
            if (f === topRoomFloor) {
              const len = u1 - u0, k = Math.max(1, Math.ceil(len / 0.1));
              top = Array.from({ length: k + 1 }, (_, j): Pt => {
                const u = (len * j) / k;
                return [u, roofAt(p[0] + ux * u, p[1] + uz * u)];
              });
            }
            list.push({ a: p, b: q, n: [nx, nz], y0: r.level, y1: wallTop(i), top, openings, windows });
            start = -1;
          }
        }
      }
    }
    walls.set(f.id, list);
  });

  // The roof (shared with /house/3d), its slopes tiled with stripes running down them. The attic's
  // walls make its gable ends; the one over the terrace, with no wall under it, is filled in.
  const outline = (pts: V3[]) => pts.map((p, k): [V3, V3] => [p, pts[(k + 1) % pts.length]]);
  const roofs: Face[] = roof.slopes.map((sl) => ({ pieces: sl.pieces, edges: sl.edges, n: sl.n, stripes: sl.stripes }));
  const roofPts = roofs.flatMap((r) => r.pieces.flat());
  const mid = (k: 0 | 2) => (Math.min(...roofPts.map((p) => p[k])) + Math.max(...roofPts.map((p) => p[k]))) / 2;
  const ends: Face[] = roof.ends.filter((e) => e.open).map(({ pts }) => {
    // Facing out, away from the middle of the roof.
    const k = Math.abs(pts[0][0] - pts[2][0]) < 1e-6 ? 0 : 2;
    const out = Math.sign(pts[0][k] - mid(k)) || 1;
    const n: V3 = k === 0 ? [out, 0, 0] : [0, 0, out];
    return { pieces: [pts], edges: outline(pts), n, stripes: [] };
  });
  // The flat roof over the east balcony, level with the attic's floor, on its columns (as in /house/3d).
  const attic = topRoomFloor.level;
  const flat: V3[] = [[14.0, attic, 4.85], [16.9, attic, 4.85], [16.9, attic, 8.95], [14.0, attic, 8.95]];
  ends.push({ pieces: [flat], edges: outline(flat), n: [0, 1, 0], stripes: [] });

  // Columns from the elevation and photos (as in /house/3d): the porch and the east balcony.
  const columns: [V3, V3][] = [
    ...[4.95, 9.45].map((x) => [[x, -0.4, 14.7], [x, attic - 0.1, 14.7]] as [V3, V3]),
    ...[5.3, 8.5].map((z) => [[16.35, GROUND, z], [16.35, attic, z]] as [V3, V3]),
  ];

  // ---- Fitting it in the box ----
  const xs = data.rooms.flatMap((r) => r.points.map((p) => p[0])), zs = data.rooms.flatMap((r) => r.points.map((p) => p[1]));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const top = Math.max(...roofPts.map((p) => p[1]));
  const cy = (GROUND + top) / 2;
  const radius = Math.max(...data.rooms.flatMap((r) => r.points.map(([x, z]) => Math.hypot(x - cx, z - cz))));
  const cf = Math.cos(TILT), sf = Math.sin(TILT);

  // ---- State ----
  const state: MiniState = { floor: floors[0].id, room: null, view: null };
  let angle = FRONT;
  let dragging = false;
  let resumeAt = 0;
  let dirty = true;
  let lost = false;
  let W = 0, H = 0, S = 1, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = 6;
    S = Math.min((W - pad * 2) / (radius * 2), (H - pad * 2) / ((top - GROUND) * cf + radius * 2 * sf));
    dirty = true;
  }

  // ---- Drawing ----
  let ct = 1, st = 0;
  /** World → [screen x, screen y, nearness]. */
  const P = ([x, y, z]: V3): V3 => {
    const px = x - cx, py = y - cy, pz = z - cz;
    const xr = px * ct - pz * st, zr = px * st + pz * ct;
    return [W / 2 + xr * S, H / 2 + (zr * sf - py * cf) * S, zr * cf + py * sf];
  };
  const near = (pts: V3[]) => pts.reduce((s, p) => s + P(p)[2], 0) / pts.length;
  const facing = ([nx, , nz]: V3) => nx * st + nz * ct; // > 0: towards you
  /** Flat shading with a light from the south-west and above; turns as the house turns. */
  const shade = (n: V3, lo = 205, hi = 255) => {
    const l = Math.max(0, n[0] * -0.55 + n[1] * 0.55 + n[2] * 0.63);
    const v = Math.round(lo + (hi - lo) * l);
    return `rgb(${v},${v},${v})`;
  };

  function path(pts: V3[], close = true) {
    ctx!.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = P(p);
      if (i) ctx!.lineTo(x, y);
      else ctx!.moveTo(x, y);
    });
    if (close) ctx!.closePath();
  }
  function line(p: V3, q: V3) {
    path([p, q], false);
    ctx!.stroke();
  }
  const style = (stroke: string, width = 1, dash: number[] = []) => {
    ctx!.strokeStyle = stroke;
    ctx!.lineWidth = width;
    ctx!.setLineDash(dash);
  };

  const at = (w: Wall, u: number, y: number, out = 0.02): V3 => {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    return [w.a[0] + ((w.b[0] - w.a[0]) * u) / len + w.n[0] * out, y, w.a[1] + ((w.b[1] - w.a[1]) * u) / len + w.n[1] * out];
  };
  const wallLen = (w: Wall) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);

  /** How high the wall stands at u: its top under the roof on the attic, else y1. */
  const topAt = (w: Wall, u: number, y1: number) => {
    if (!w.top) return y1;
    const k = w.top.findIndex(([v]) => v >= u);
    if (k <= 0) return w.top[Math.max(0, k)][1];
    const [v0, h0] = w.top[k - 1], [v1, h1] = w.top[k];
    return h0 + ((h1 - h0) * (u - v0)) / (v1 - v0 || 1);
  };

  /** A wall up to y1 (cut open), or, on the attic, up to the roof. */
  function drawWall(w: Wall, y1: number, details: boolean, cut: boolean) {
    const n: V3 = [w.n[0], 0, w.n[1]];
    const front = facing(n) > 0;
    const len = wallLen(w);
    const roofed = !cut && w.top;
    if (roofed) path([at(w, 0, w.y0, 0), at(w, len, w.y0, 0), ...[...roofed].reverse().map(([u, h]) => at(w, u, h, 0))]);
    else path([at(w, 0, w.y0, 0), at(w, len, w.y0, 0), at(w, len, y1, 0), at(w, 0, y1, 0)]);
    ctx!.fillStyle = front ? shade(n) : '#e6e6e6';
    ctx!.fill();
    style(INK, 0.8);
    ctx!.stroke();
    if (!details || !front) return;
    style(INK, 0.6);
    for (const o of w.openings) {
      const h = Math.min(topAt(w, o.u0, y1), topAt(w, o.u1, y1), w.y0 + (o.kind === 'glass' ? GLAZED : DOOR));
      path([at(w, o.u0, w.y0), at(w, o.u1, w.y0), at(w, o.u1, h), at(w, o.u0, h)]);
      ctx!.fillStyle = o.kind === 'glass' ? '#cfd6da' : '#fff';
      ctx!.fill();
      ctx!.stroke();
      // Glass as stripes; a door split in two leaves.
      const step = o.kind === 'glass' ? 0.45 : (o.u1 - o.u0) / 2;
      for (let u = o.u0 + step; u < o.u1 - 0.1; u += step) line(at(w, u, w.y0), at(w, u, h));
    }
    for (const { u0, u1, y0, y1: head } of w.windows) {
      const yt = Math.min(topAt(w, u0, y1) - 0.1, topAt(w, u1, y1) - 0.1, head);
      if (yt <= y0) continue;
      path([at(w, u0, y0), at(w, u1, y0), at(w, u1, yt), at(w, u0, yt)]);
      ctx!.fillStyle = '#cfd6da';
      ctx!.fill();
      ctx!.stroke();
      line(at(w, (u0 + u1) / 2, y0), at(w, (u0 + u1) / 2, yt));
    }
  }

  function drawSlabs(id: string, here: boolean, level: number) {
    const fills = data.fills[id] ?? [];
    for (const poly of fills) {
      path(poly.map(([x, z]): V3 => [x, level, z]));
      ctx!.fillStyle = '#fff';
      ctx!.fill();
    }
    for (const r of roomsOf(id)) {
      path(r.points.map(([x, z]): V3 => [x, r.level, z]));
      ctx!.fillStyle = here && r.slug === state.room ? HERE : r.locked ? '#d6d6d6' : r.outdoor ? '#f4f4f4' : '#fff';
      ctx!.fill();
      style(here ? INK : '#555', here ? 0.7 : 0.5, r.outdoor ? [2, 2] : []);
      ctx!.stroke();
    }
  }

  function drawRoof(highlight: boolean) {
    const faces = [...roofs.map((r) => ({ r, end: false })), ...ends.map((r) => ({ r, end: true }))];
    faces.sort((m, o) => near(m.r.pieces.flat()) - near(o.r.pieces.flat()));
    for (const { r, end } of faces) {
      // Its pieces, outlined in their own colour so no seam shows between them; then its edges.
      const fill = highlight && !end ? HERE : shade(r.n, end ? 190 : 175, end ? 245 : 235);
      style(fill, 0.8);
      ctx!.fillStyle = fill;
      for (const piece of r.pieces) {
        path(piece);
        ctx!.fill();
        ctx!.stroke();
      }
      style(INK, 0.8);
      for (const [p, q] of r.edges) line(p, q);
      style(highlight ? '#8a8a00' : '#777', 0.5);
      for (const [p, q] of r.stripes) line(p, q);
    }
  }

  function drawGhost(id: string, isRoof: boolean) {
    style('rgba(0,0,0,0.22)', 0.6, [2, 2]);
    if (isRoof) {
      for (const r of [...roofs, ...ends]) for (const [p, q] of r.edges) line(p, q);
      return;
    }
    for (const w of walls.get(id) ?? []) {
      const len = wallLen(w);
      path(w.top ? w.top.map(([u, h]) => at(w, u, h, 0)) : [at(w, 0, w.y1, 0), at(w, len, w.y1, 0)], false);
      ctx!.stroke();
    }
  }

  /** The part of the plan on screen, on your floor, and a dot where you are. */
  function viewMarks(level: number, isRoof: boolean) {
    const id = state.floor;
    const here = roomsOf(id);
    const room = here.find((r) => r.slug === state.room);
    const xs = here.flatMap((r) => r.points.map((p) => p[0])), zs = here.flatMap((r) => r.points.map((p) => p[1]));
    const b = { x0: Math.min(...xs) - 0.6, x1: Math.max(...xs) + 0.6, z0: Math.min(...zs) - 0.6, z1: Math.max(...zs) + 0.6 };
    let dot: Pt | null = null;
    if (state.view) {
      const [vx, vy, vw, vh] = state.view.map((v) => v / 1000);
      const x0 = Math.max(b.x0, vx), x1 = Math.min(b.x1, vx + vw), z0 = Math.max(b.z0, vy), z1 = Math.min(b.z1, vy + vh);
      // Only when you're zoomed in: zoomed out, the whole floor is on screen.
      const all = x0 <= b.x0 + 0.01 && x1 >= b.x1 - 0.01 && z0 <= b.z0 + 0.01 && z1 >= b.z1 - 0.01;
      if (x1 > x0 && z1 > z0 && !all && !isRoof) {
        path([[x0, level, z0], [x1, level, z0], [x1, level, z1], [x0, level, z1]]);
        ctx!.fillStyle = 'rgba(0,0,238,0.08)';
        ctx!.fill();
        style(LINK, 1, [3, 2]);
        ctx!.stroke();
      }
      dot = [Math.min(b.x1, Math.max(b.x0, vx + vw / 2)), Math.min(b.z1, Math.max(b.z0, vy + vh / 2))];
    }
    if (room) dot = [room.points.reduce((s, p) => s + p[0], 0) / room.points.length, room.points.reduce((s, p) => s + p[1], 0) / room.points.length];
    if (!dot) return null;
    const under = here.find((r) => inside(dot!, r.points));
    return [dot[0], isRoof ? roofAt(dot[0], dot[1]) : (under?.level ?? level), dot[1]] as V3;
  }

  function draw() {
    if (!W || !H) return;
    ct = Math.cos(angle);
    st = Math.sin(angle);
    // Set the scale on every draw: a restored context comes back with none, and at a device
    // pixel ratio of 1.5 the house would otherwise be drawn at 2/3 size in the corner.
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, W, H);
    const si = Math.max(0, floors.findIndex((f) => f.id === state.floor));
    const onRoof = floors[si] === roofFloor;
    let dot: V3 | null = null;
    for (let i = 0; i <= si; i++) {
      const f = floors[i];
      if (f === roofFloor) {
        drawRoof(onRoof);
        continue;
      }
      const here = i === si;
      drawSlabs(f.id, here, f.level);
      if (here) dot = viewMarks(f.level, false);
      // Walls and columns, back to front. Yours are cut open at waist height.
      const items: { d: number; draw: () => void }[] = [];
      for (const w of walls.get(f.id) ?? []) {
        const y1 = here ? Math.min(w.y1, w.y0 + LOW) : w.y1;
        items.push({ d: near([at(w, wallLen(w) / 2, (w.y0 + y1) / 2, 0)]), draw: () => drawWall(w, y1, !here, here) });
      }
      const y0 = i === 0 ? -Infinity : f.level, y1 = here ? f.level + LOW : wallTop(i);
      for (const [p, q] of columns) {
        const a = Math.max(p[1], y0), b = Math.min(q[1], y1);
        if (b > a) items.push({ d: near([[p[0], (a + b) / 2, p[2]]]), draw: () => { style(INK, 0.9); line([p[0], a, p[2]], [q[0], b, q[2]]); } });
      }
      items.sort((m, o) => m.d - o.d).forEach((it) => it.draw());
    }
    if (onRoof) dot = viewMarks(roofFloor.level, true);
    floors.forEach((f, i) => { if (i > si) drawGhost(f.id, f === roofFloor); });
    if (dot) {
      const [x, y] = P(dot);
      ctx!.setLineDash([]);
      ctx!.beginPath();
      ctx!.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx!.fillStyle = INK;
      ctx!.fill();
      ctx!.strokeStyle = '#fff';
      ctx!.lineWidth = 1.2;
      ctx!.stroke();
    }
    dirty = false;
  }

  // ---- Turning ----
  let last = performance.now();
  let raf = 0;
  const frame = (t: number) => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    if (!reduced && !dragging && t > resumeAt && canvas.offsetParent) {
      angle += SPIN * dt;
      dirty = true;
    }
    if (dirty && !lost) draw();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  let lastX = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('turning');
  }, { signal });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    angle += (e.clientX - lastX) * 0.015;
    lastX = e.clientX;
    dirty = true;
  }, { signal });
  const stop = () => {
    if (!dragging) return;
    dragging = false;
    resumeAt = performance.now() + 2500;
    canvas.classList.remove('turning');
  };
  canvas.addEventListener('pointerup', stop, { signal });
  canvas.addEventListener('pointercancel', stop, { signal });
  // Double-click: back to the front.
  canvas.addEventListener('dblclick', () => { angle = FRONT; dirty = true; }, { signal });

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // Chrome drops a GPU-backed canvas's pixels when the GPU process restarts, the driver resets
  // or GPU memory runs short, then restores an empty context. The house turns every frame,
  // but with reduced motion it stands still and would stay blank, so redraw when that happens,
  // when the tab is shown again, and when the device pixel ratio changes (another monitor, zoom).
  countLosses(canvas, 'contextlost', 'contextrestored', signal);
  canvas.addEventListener('contextlost', () => (lost = true), { signal });
  canvas.addEventListener('contextrestored', () => {
    lost = false;
    resize();
    dirty = true;
  }, { signal });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) dirty = true;
  }, { signal });
  onDprChange(resize, signal);
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
  });

  return {
    set(next: Partial<MiniState>) {
      Object.assign(state, next);
      dirty = true;
    },
  };
}
