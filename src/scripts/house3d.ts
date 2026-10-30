// The house in 3D: a dollhouse built from the floorplan's rooms, in the house's own colours.
// It follows the drawings: rooms from house.json; doors, glazing, extra walls, the stairs,
// the stairwells and the cellar from house3d.json (traced from the plans and from notes
// on how the house really is). "Blueprint" lays the original drawing on each floor.
//
// Not a survey: heights come from the floor levels; the roof, columns and balustrades
// follow the south elevation and photos of the house.
// Plain three.js, no framework. Same page lifecycle as the 2D map (map.ts).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EAVE, GABLES } from '../lib/house-shell';

type Pt = [number, number];
type Seg = [number, number, number, number];
type Bi = { en: string; zh: string };
interface RoomM {
  slug: string; floor: string; chapter: number | null; en: string; zh: string; title: string; titleZh: string;
  points: Pt[]; rect: number[]; level: number; outdoor: boolean; locked: boolean; stairs: boolean; contents: boolean;
}
interface FloorM { id: string; label: string; name: string; zh: string; level: number; storey: number }
interface Furniture { en: string; zh: string; drawers: number; rect: number[] }
/** house3d.json, in millimetres. */
interface Details {
  doors: Record<string, Seg[]>;
  glazing: Record<string, { line: Seg; kind: 'window' | 'door' | 'sliding' }[]>;
  partitions: Record<string, Seg[]>;
  floors: Record<string, Seg[] | string>;
  stairs: {
    u?: { from: string; to: string; east: Pt; north: Pt; west: Pt; start: number; end: number };
    flight?: { from: string; to: string; x: Pt; y: Pt };
  };
  wells: Record<string, Pt[]>;
  cellar?: { room: string; steps: { x: Pt; y: number }; stair: { x: Pt; y: Pt }; loft: { x: Pt; y: Pt; height: number } };
}
interface Data {
  floors: FloorM[]; rooms: RoomM[]; grid: { columns: number[]; rows: number[] }; text: { noDoor: Bi };
  furniture: Record<string, Furniture[]>; details: Details;
  scans: Record<string, { src: string; x: number; y: number; w: number; h: number }>;
}

// Sizes in metres.
const GROUND = -0.6; // the lowest step outside
const LOW = 1.1; // cut-away wall height in the dollhouse
const FULL = 2.9; // wall height
const DOOR = 2.1; // top of a door opening
const GLAZED = 2.6; // top of a floor-to-ceiling window or glass door
const THICK = 0.18;
const LIFT = 3.4; // extra gap between floors when they're lifted apart
const mm = (v: number) => v / 1000;

// The house's own colours, from the photos: brick with lighter bricks mixed in, cream trim
// and corner stones, white balusters, a brown roof. Yellow marks the room, as on the plan.
const C = {
  white: 0xffffff, cream: 0xefe6cf, stone: 0xe9e4d8, wall: 0xfbfbf9, floor: 0xf3f0e8, outdoor: 0xe4e0d6,
  locked: 0xc9c9c9, roof: 0x8e5b49, brick: 0xa65d45, step: 0xe8e2d4, wood: 0x8a5a36, furniture: 0xd9c4a3,
  glass: 0x46525a, ground: 0xf4f3ee, line: 0x555555, edge: 0x9a948a, grid: 0xbbbbbb,
  hover: 0xffffcc, here: 0xffff66,
};

let active: { root: HTMLElement; dispose: () => void } | null = null;

export function start3d() {
  init();
  document.addEventListener('astro:page-load', init);
  document.addEventListener('astro:before-swap', () => {
    active?.dispose();
    active = null;
  });
}

const bi = (b: Bi) => `<span data-l="en">${esc(b.en)}</span><span data-l="zh" lang="zh-Hans">${esc(b.zh || b.en)}</span>`;
function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function inside([x, z]: Pt, poly: Pt[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}
const centroid = (r: RoomM): Pt => [r.rect[0] + r.rect[2] / 2, r.rect[1] + r.rect[3] / 2];
const isZh = () => document.documentElement.dataset.lang === 'zh';

/** The parts of wall a→b (straight along x or z) left after cutting out the openings that lie on it. */
function cutWall(a: Pt, b: Pt, cuts: Seg[]): { pieces: [Pt, Pt][]; gaps: [number, number][] } {
  const alongX = Math.abs(b[1] - a[1]) < 1e-3, alongZ = Math.abs(b[0] - a[0]) < 1e-3;
  if (!alongX && !alongZ) return { pieces: [[a, b]], gaps: [] };
  const k = alongX ? 0 : 1, fixed = alongX ? a[1] : a[0];
  const lo = Math.min(a[k], b[k]), hi = Math.max(a[k], b[k]);
  const gaps: [number, number][] = [];
  for (const [x0, y0, x1, y1] of cuts) {
    const onLine = alongX ? Math.abs(y0 - y1) < 1e-3 && Math.abs(y0 - fixed) < 0.15 : Math.abs(x0 - x1) < 1e-3 && Math.abs(x0 - fixed) < 0.15;
    if (!onLine) continue;
    const c0 = Math.max(lo, Math.min(alongX ? x0 : y0, alongX ? x1 : y1)), c1 = Math.min(hi, Math.max(alongX ? x0 : y0, alongX ? x1 : y1));
    if (c1 - c0 > 0.05) gaps.push([c0, c1]);
  }
  gaps.sort((p, q) => p[0] - q[0]);
  const at = (v: number): Pt => (alongX ? [v, fixed] : [fixed, v]);
  const pieces: [Pt, Pt][] = [];
  let v = lo;
  for (const [c0, c1] of gaps) {
    if (c0 - v > 0.05) pieces.push([at(v), at(c0)]);
    v = Math.max(v, c1);
  }
  if (hi - v > 0.05) pieces.push([at(v), at(hi)]);
  return { pieces, gaps };
}

function init() {
  const root = document.getElementById('house-3d');
  if (!root || root === active?.root) return;
  active?.dispose();
  active = null;

  const data = JSON.parse(document.getElementById('house-3d-data')!.textContent!) as Data;
  const D = data.details;
  const stage = root.querySelector<HTMLElement>('.h3d-stage')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    root.querySelector<HTMLElement>('.h3d-nogl')!.hidden = false;
    return;
  }
  const off = new AbortController();
  const signal = off.signal;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0xffffff);
  stage.appendChild(renderer.domElement);
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'h3d-labels';
  stage.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 70, 170);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc8b8, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(25, 40, 30);
  scene.add(sun);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 3;
  controls.maxDistance = 120;
  controls.maxPolarAngle = Math.PI * 0.49;

  // ---- Brick: terracotta with lighter cream bricks mixed in, as in the photos ----
  // One tile is 1.2 m × 0.6 m (four bricks across, eight courses).
  function brickTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e4dccf';
    g.fillRect(0, 0, 256, 128);
    const red = ['#b9694f', '#c47a5f', '#a95e47', '#bf7458'], light = ['#dcc29c', '#e6d2ad'];
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? 32 : 0;
      for (let x = -64; x < 256; x += 64) {
        g.fillStyle = rnd() < 0.22 ? light[Math.floor(rnd() * 2)] : red[Math.floor(rnd() * 4)];
        g.fillRect(x + off + 1, row * 16 + 1, 62, 14);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }
  const brickTex = brickTexture();
  /** A brick material sized for one face of `w` × `h` metres. */
  const brickFor = (w: number, h: number) => {
    const map = brickTex.clone();
    map.repeat.set(w / 1.2, h / 0.6);
    map.needsUpdate = true;
    return new THREE.MeshLambertMaterial({ map });
  };

  // ---- Materials (shared; disposed with the scene) ----
  const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const M = {
    white: lambert(C.white), cream: lambert(C.cream), stone: lambert(C.stone), wall: lambert(C.wall), step: lambert(C.step),
    wood: lambert(C.wood), furniture: lambert(C.furniture), locked: lambert(C.locked), ground: lambert(C.ground),
    roof: lambert(C.roof, { side: THREE.DoubleSide }), gable: lambert(C.brick, { side: THREE.DoubleSide }),
    glass: lambert(C.glass),
    pane: new THREE.MeshLambertMaterial({ color: 0x9fb6c2, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
    line: new THREE.LineBasicMaterial({ color: C.line }),
    edge: new THREE.LineBasicMaterial({ color: C.edge }),
    grid: new THREE.LineBasicMaterial({ color: C.grid }),
  };

  // ---- The ground and the structural grid ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), M.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(8, GROUND - 0.01, 7.5);
  scene.add(ground);
  {
    const { columns, rows } = data.grid;
    const pts: number[] = [];
    for (const x of columns) pts.push(x, GROUND, rows[0] - 1.5, x, GROUND, rows[rows.length - 1] + 1.5);
    for (const z of rows) pts.push(columns[0] - 1.5, GROUND, z, columns[columns.length - 1] + 1.5, GROUND, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(g, M.grid));
  }

  // ---- Shared shapes ----
  const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const unitEdges = new THREE.EdgesGeometry(unitBox);
  const wallBox = new THREE.BoxGeometry(1, 1, THICK).translate(0, 0.5, 0);
  const wallEdges = new THREE.EdgesGeometry(wallBox);
  // A bottle-shaped baluster, 0.7 m tall, like the ones on the balconies.
  const postGeo = new THREE.LatheGeometry(
    [[0.0, 0], [0.07, 0], [0.075, 0.06], [0.085, 0.24], [0.075, 0.38], [0.045, 0.52], [0.035, 0.6], [0.05, 0.64], [0.05, 0.7], [0, 0.7]].map(([x, y]) => new THREE.Vector2(x, y)),
    8,
  );
  const beamGeo = new THREE.BoxGeometry(0.26, 0.32, 1);
  const colGeo = new THREE.CylinderGeometry(0.17, 0.17, 1, 14).translate(0, 0.5, 0);

  // ---- Floors ----
  const floorIndex = new Map(data.floors.map((f, i) => [f.id, i]));
  const floorById = (id: string) => data.floors[floorIndex.get(id)!];
  const roofFloor = data.floors[data.floors.length - 1];
  const topRoomFloor = data.floors[data.floors.length - 2];
  const roomBySlug = new Map(data.rooms.map((r) => [r.slug, r]));
  const fullFor = (f: FloorM) => Math.min(FULL, Math.max(0.5, f.storey - 0.25));

  interface Wall { mesh: THREE.Mesh; floor: string; map?: THREE.Texture }
  const walls: Wall[] = [];
  interface FloorParts {
    group: THREE.Group; labels: CSS2DObject[];
    /** Windows, glazing, lintels and corner stones: shown only while the floor's walls stand at full height. */
    tall: THREE.Group;
    blueprint?: THREE.Mesh;
  }
  const parts = new Map<string, FloorParts>();
  const slabs: THREE.Mesh[] = [];
  for (const f of data.floors) {
    const group = new THREE.Group();
    group.position.y = f.level;
    scene.add(group);
    const tall = new THREE.Group();
    group.add(tall);
    parts.set(f.id, { group, labels: [], tall });
  }

  // house3d.json in metres.
  const segs = (list?: Seg[]) => (list ?? []).map((s) => s.map(mm) as Seg);
  const doorsOf = (floor: string) => segs(D.doors[floor]);
  const glazingOf = (floor: string) => (D.glazing[floor] ?? []).map((g) => ({ line: g.line.map(mm) as Seg, kind: g.kind }));
  const wellOf = (floor: string) => (D.wells[floor] ?? []).map((p) => p.map(mm) as Pt);

  function slabMesh(r: RoomM, f: FloorM, i: number) {
    const shape = new THREE.Shape(r.points.map(([x, z]) => new THREE.Vector2(x, -z)));
    // Leave the stairwell open where the stairs come up from the floor below.
    const well = wellOf(f.id);
    const [rx, rz, rw, rd] = r.rect;
    if (well.length && !r.outdoor && well.every(([x, z]) => x > rx && x < rx + rw && z > rz && z < rz + rd)) {
      shape.holes.push(new THREE.Path(well.map(([x, z]) => new THREE.Vector2(x, -z))));
    }
    const depth = i === 0 ? r.level - GROUND : 0.2;
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).rotateX(-Math.PI / 2);
    const base = r.outdoor ? C.outdoor : r.locked ? C.locked : C.floor;
    const mesh = new THREE.Mesh(geo, lambert(base));
    mesh.position.y = r.level - f.level - depth - (r.outdoor ? 0.02 : 0);
    mesh.userData = { slug: r.slug, base };
    slabs.push(mesh);
    return mesh;
  }

  function outline(r: RoomM, y: number) {
    const pts = r.points.map(([x, z]) => new THREE.Vector3(x, y, z));
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), M.line);
  }

  function edged(mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) {
    const m = new THREE.Mesh(unitBox, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.add(new THREE.LineSegments(unitEdges, M.edge));
    return m;
  }

  const seen = new Set<string>();
  const keyOf = (floor: string, a: Pt, b: Pt) => `${floor}:${[a, b].map((p) => p.map((v) => v.toFixed(2)).join(',')).sort().join('|')}`;

  /**
   * A stretch of wall a→b with its doors and glazing cut out: wall pieces, a lintel over
   * each opening, glass where it's glazed, and a window in long outside pieces.
   */
  function wallRun(f: FloorM, a: Pt, b: Pt, nx: number, nz: number, exterior: boolean, rel: number, windows: boolean) {
    const { group, tall } = parts.get(f.id)!;
    const glazing = glazingOf(f.id);
    const doors = doorsOf(f.id);
    const { pieces, gaps } = cutWall(a, b, [...doors, ...glazing.map((g) => g.line)]);
    for (const [p, q] of pieces) {
      wall(group, f.id, p, q, nx, nz, exterior, rel);
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (windows && exterior && len >= 2.4) tall.add(windowOn([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], Math.atan2(-(q[1] - p[1]), q[0] - p[0]), nx, nz, len, rel));
    }
    const alongX = Math.abs(b[1] - a[1]) < 1e-3;
    const top = fullFor(f);
    for (const [c0, c1] of gaps) {
      const mid = (c0 + c1) / 2, w = c1 - c0;
      const at: Pt = alongX ? [mid, a[1]] : [a[0], mid];
      const g = glazing.find((gl) => cutWall(a, b, [gl.line]).gaps.some(([g0, g1]) => Math.abs(g0 - c0) < 0.06 && Math.abs(g1 - c1) < 0.06));
      const lintelFrom = g ? GLAZED : DOOR;
      if (top > lintelFrom) {
        const lintel = new THREE.Mesh(wallBox, exterior ? brickFor(w, top - lintelFrom) : M.wall);
        lintel.rotation.y = alongX ? 0 : Math.PI / 2;
        lintel.scale.set(w, top - lintelFrom, 1);
        lintel.position.set(at[0], rel + lintelFrom, at[1]);
        tall.add(lintel);
      }
      if (g) tall.add(glazed(at, w, alongX, rel, g.kind));
    }
  }

  data.floors.forEach((f, i) => {
    if (f === roofFloor) return;
    const { group, labels } = parts.get(f.id)!;
    const here = data.rooms.filter((r) => r.floor === f.id);
    const indoor = here.filter((r) => !r.outdoor);
    for (const r of here) {
      const rel = r.level - f.level;
      group.add(slabMesh(r, f, i));
      group.add(outline(r, rel + 0.005));
      if (r.locked) {
        group.add(edged(M.locked, r.rect[2], 2.2, r.rect[3], r.rect[0] + r.rect[2] / 2, rel, r.rect[1] + r.rect[3] / 2));
        continue;
      }
      const n = r.points.length;
      for (let k = 0; k < n; k++) {
        const a = r.points[k], b = r.points[(k + 1) % n];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const len = Math.hypot(dx, dz);
        if (len < 0.05) continue;
        const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let nx = dz / len, nz = -dx / len;
        if (inside([mid[0] + nx * 0.05, mid[1] + nz * 0.05], r.points)) { nx = -nx; nz = -nz; }
        const out: Pt = [mid[0] + nx * 0.3, mid[1] + nz * 0.3];
        const neighbour = here.find((o) => o !== r && inside(out, o.points));
        if (r.outdoor) {
          // Balconies and terraces upstairs get a balustrade where they meet the air.
          if (!neighbour && i > 0) balustrade(group, a, b, rel);
          continue;
        }
        const key = keyOf(f.id, a, b);
        if (seen.has(key)) continue;
        seen.add(key);
        const exterior = !indoor.some((o) => o !== r && inside(out, o.points));
        wallRun(f, a, b, nx, nz, exterior, rel, !r.stairs);
      }
      addQuoins(f.id, r, indoor, rel, fullFor(f));
      for (const fu of data.furniture[r.slug] ?? []) group.add(cabinet(fu, rel));
      if (r.contents || r.stairs) {
        const el = document.createElement('div');
        el.className = 'h3d-label' + (r.contents ? ' has-contents' : '');
        el.innerHTML = `<small>${r.chapter ?? '—'}</small> ${bi({ en: r.contents ? r.title : r.en, zh: r.contents ? r.titleZh : r.zh })}`;
        const label = new CSS2DObject(el);
        const [cx, cz] = centroid(r);
        label.position.set(cx, rel + 0.4, cz);
        group.add(label);
        labels.push(label);
      }
    }
    // Floor the rooms leave out (a lobby, the attic corridor), just under the rooms' own floors.
    const fills = D.floors[f.id];
    if (Array.isArray(fills)) {
      for (const [x, z, w, d] of segs(fills)) {
        const fill = new THREE.Mesh(unitBox, M.wall);
        fill.scale.set(w, 0.2, d);
        fill.position.set(x + w / 2, -0.205, z + d / 2);
        group.add(fill);
      }
    }
    // Walls the rooms don't draw (the stair core, a store), with their doors.
    for (const [x0, z0, x1, z1] of segs(D.partitions[f.id])) {
      const a: Pt = [x0, z0], b: Pt = [x1, z1];
      if (seen.has(keyOf(f.id, a, b))) continue;
      seen.add(keyOf(f.id, a, b));
      const len = Math.hypot(x1 - x0, z1 - z0);
      wallRun(f, a, b, (z1 - z0) / len, -(x1 - x0) / len, false, 0, false);
    }
    if (D.stairs.u?.from === f.id) group.add(uStair(floorById(D.stairs.u.to).level - f.level));
    if (D.stairs.flight?.from === f.id) group.add(flight(floorById(D.stairs.flight.to).level - f.level));
    const cellar = D.cellar && roomBySlug.get(D.cellar.room.replace('/', '-'));
    if (cellar && cellar.floor === f.id) group.add(cellarStairs(cellar.level - f.level));
  });

  /** One wall from a to b: brick outside if it's an outside wall, white inside, a cream top. */
  function wall(group: THREE.Group, floor: string, a: Pt, b: Pt, nx: number, nz: number, exterior: boolean, rel: number) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const plusZOut = -dz * nx + dx * nz > 0;
    const brick = exterior ? brickFor(len + THICK, LOW) : null;
    const outsideFace = brick ?? M.wall;
    // Box faces: +x, -x (the ends), +y (the top), -y, +z, -z (the two sides).
    const ends = brick ?? M.wall;
    const mats = [ends, ends, M.cream, M.wall, plusZOut ? outsideFace : M.wall, plusZOut ? M.wall : outsideFace];
    const mesh = new THREE.Mesh(wallBox, mats);
    mesh.rotation.y = Math.atan2(-dz, dx);
    mesh.position.set((a[0] + b[0]) / 2, rel, (a[1] + b[1]) / 2);
    mesh.scale.set(len + THICK, LOW, 1);
    mesh.add(new THREE.LineSegments(wallEdges, M.edge));
    group.add(mesh);
    walls.push({ mesh, floor, map: brick?.map ?? undefined });
  }

  /** Floor-to-ceiling glass in an opening: a window with mullions, a glass door, or sliding doors. */
  function glazed(at: Pt, w: number, alongX: boolean, rel: number, kind: 'window' | 'door' | 'sliding') {
    const g = new THREE.Group();
    g.position.set(at[0], rel, at[1]);
    g.rotation.y = alongX ? 0 : Math.PI / 2;
    const d = THICK + 0.04;
    const bar = (mat: THREE.Material, cx: number, y0: number, bw: number, h: number, bd: number) => {
      const m = new THREE.Mesh(unitBox, mat);
      m.scale.set(bw, h, bd);
      m.position.set(cx, y0, 0);
      g.add(m);
    };
    bar(M.pane, 0, 0, w, GLAZED, 0.03);
    bar(M.white, -w / 2 + 0.05, 0, 0.1, GLAZED, d);
    bar(M.white, w / 2 - 0.05, 0, 0.1, GLAZED, d);
    bar(M.white, 0, GLAZED - 0.1, w, 0.1, d);
    bar(M.white, 0, 0, w, 0.06, d);
    if (kind === 'window') {
      const panes = Math.max(2, Math.round(w / 1.1));
      for (let k = 1; k < panes; k++) bar(M.white, -w / 2 + (w * k) / panes, 0, 0.06, GLAZED, d);
      bar(M.white, 0, 2.0, w, 0.06, d);
    } else {
      bar(M.white, 0, 0, 0.08, GLAZED, d); // two leaves
      for (const s of [-1, 1]) bar(M.cream, s * 0.12, 1.0, 0.04, 0.35, d + 0.08);
    }
    return g;
  }

  /** A window with a cream frame and a cross bar, on the outside face of a wall. */
  function windowOn(mid: Pt, theta: number, nx: number, nz: number, len: number, rel: number) {
    const w = Math.min(1.8, len * 0.45), h = 1.4, sill = 0.9;
    const win = new THREE.Group();
    win.position.set(mid[0] + nx * (THICK / 2 + 0.02), rel + sill + h / 2, mid[1] + nz * (THICK / 2 + 0.02));
    win.rotation.y = theta;
    const box = (mat: THREE.Material, sx: number, sy: number, sz: number, py = 0) => {
      const m = new THREE.Mesh(unitBox, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(0, py - sy / 2, 0);
      win.add(m);
    };
    box(M.cream, w + 0.26, h + 0.26, 0.05);
    box(M.glass, w, h, 0.07);
    box(M.cream, 0.06, h, 0.09);
    box(M.cream, w, 0.06, 0.09, h * 0.18);
    return win;
  }

  /** Corner stones (quoins) at the outside corners, alternating long and short. */
  function addQuoins(floor: string, r: RoomM, indoor: RoomM[], rel: number, height: number) {
    if (r.points.length !== 4) return;
    const [x, z, w, d] = r.rect;
    for (const [vx, vz, sx, sz] of [[x, z, -1, -1], [x + w, z, 1, -1], [x + w, z + d, 1, 1], [x, z + d, -1, 1]]) {
      const free = (p: Pt) => !indoor.some((o) => inside(p, o.points));
      if (!free([vx + sx * 0.4, vz + sz * 0.4]) || !free([vx + sx * 0.4, vz - sz * 0.4]) || !free([vx - sx * 0.4, vz + sz * 0.4])) continue;
      const n = Math.floor(height / 0.3);
      const inst = new THREE.InstancedMesh(unitBox, M.stone, n);
      const m4 = new THREE.Matrix4();
      const edge = THICK / 2 + 0.03;
      for (let j = 0; j < n; j++) {
        const bx = j % 2 ? 0.55 : 0.32, bz = j % 2 ? 0.32 : 0.55;
        m4.compose(new THREE.Vector3(vx + sx * (edge - bx / 2), rel + j * 0.3, vz + sz * (edge - bz / 2)), new THREE.Quaternion(), new THREE.Vector3(bx, 0.27, bz));
        inst.setMatrixAt(j, m4);
      }
      parts.get(floor)!.tall.add(inst);
    }
  }

  /** A balcony edge, as in the porch photo: a brick parapet, bottle balusters on it, a rail on top. */
  function balustrade(group: THREE.Group, a: Pt, b: Pt, y: number) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const theta = Math.atan2(-dz, dx);
    const at = (h: number) => new THREE.Vector3((a[0] + b[0]) / 2, y + h, (a[1] + b[1]) / 2);
    const parapet = new THREE.Mesh(unitBox, brickFor(len + 0.02, 0.55));
    parapet.rotation.y = theta;
    parapet.scale.set(len + 0.02, 0.55, 0.22);
    parapet.position.copy(at(-0.3));
    group.add(parapet);
    const rail = new THREE.Mesh(unitBox, M.cream);
    rail.rotation.y = theta;
    rail.scale.set(len + 0.02, 0.1, 0.24);
    rail.position.copy(at(0.95));
    group.add(rail);
    const count = Math.max(1, Math.round(len / 0.24));
    const posts = new THREE.InstancedMesh(postGeo, M.white, count);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      m4.makeTranslation(a[0] + dx * t, y + 0.25, a[1] + dz * t);
      posts.setMatrixAt(i, m4);
    }
    group.add(posts);
  }

  /** Steps as solid blocks: each [x, z, width (x), depth (z), height]. */
  function blocks(list: number[][], mat: THREE.Material) {
    const inst = new THREE.InstancedMesh(unitBox, mat, list.length);
    const m4 = new THREE.Matrix4();
    list.forEach(([x, z, w, d, h], i) => {
      m4.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
      inst.setMatrixAt(i, m4);
    });
    return inst;
  }

  /** The wooden U staircase round the core: north up the east side, west along the north, south down the west side. */
  function uStair(rise: number) {
    const u = D.stairs.u!;
    const [ex0, ex1] = u.east.map(mm), [nz0, nz1] = u.north.map(mm), [wx0, wx1] = u.west.map(mm);
    const start = mm(u.start), end = mm(u.end);
    const nE = 7, nN = 6, nW = 6, riser = rise / (nE + 1 + nN + 1 + nW);
    const list: number[][] = [];
    const tE = (start - nz1) / nE;
    for (let s = 0; s < nE; s++) list.push([(ex0 + ex1) / 2, start - tE * (s + 0.5), ex1 - ex0, tE, riser * (s + 1)]);
    list.push([(ex0 + ex1) / 2, (nz0 + nz1) / 2, ex1 - ex0, nz1 - nz0, riser * (nE + 1)]); // landing, north-east
    const tN = (ex0 - wx1) / nN;
    for (let s = 0; s < nN; s++) list.push([ex0 - tN * (s + 0.5), (nz0 + nz1) / 2, tN, nz1 - nz0, riser * (nE + 2 + s)]);
    list.push([(wx0 + wx1) / 2, (nz0 + nz1) / 2, wx1 - wx0, nz1 - nz0, riser * (nE + nN + 2)]); // landing, north-west
    const tW = (end - nz1) / nW;
    for (let s = 0; s < nW; s++) list.push([(wx0 + wx1) / 2, nz1 + tW * (s + 0.5), wx1 - wx0, tW, riser * (nE + nN + 3 + s)]);
    return blocks(list, M.wood);
  }

  /** The straight flight from the first floor to the attic. */
  function flight(rise: number) {
    const fl = D.stairs.flight!;
    const [x0, x1] = fl.x.map(mm), [z0, z1] = fl.y.map(mm);
    const steps = 15, t = (z1 - z0) / steps;
    return blocks(Array.from({ length: steps }, (_, s) => [(x0 + x1) / 2, z0 + t * (s + 0.5), x1 - x0, Math.abs(t), (rise * (s + 1)) / steps]), M.step);
  }

  /** The cellar: three steps down from the hall, the stair up to the loft on the right, and the loft. */
  function cellarStairs(rel: number) {
    const c = D.cellar!;
    const g = new THREE.Group();
    const depth = -rel;
    const [sx0, sx1] = c.steps.x.map(mm), sz = mm(c.steps.y);
    const s1 = blocks([0, 1, 2].map((i) => [(sx0 + sx1) / 2, sz - 0.15 - i * 0.3, sx1 - sx0, 0.3, (depth * (3 - i)) / 3]), M.step);
    s1.position.y = rel;
    g.add(s1);
    const [ax0, ax1] = c.stair.x.map(mm), [az0, az1] = c.stair.y.map(mm);
    const [lx0, lx1] = c.loft.x.map(mm), [lz0, lz1] = c.loft.y.map(mm), ly = mm(c.loft.height);
    const n = 10, rise = ly - rel, tw = (ax1 - ax0) / n;
    const s2 = blocks(Array.from({ length: n }, (_, i) => [ax0 + tw * (i + 0.5), (az0 + az1) / 2, tw, az1 - az0, (rise * (i + 1)) / n]), M.step);
    s2.position.y = rel;
    g.add(s2);
    g.add(edged(M.white, lx1 - lx0, 0.15, lz1 - lz0, (lx0 + lx1) / 2, ly - 0.15, (lz0 + lz1) / 2));
    g.add(edged(M.cream, lx1 - lx0, 0.05, 0.05, (lx0 + lx1) / 2, ly + 0.9, lz0));
    for (let x = lx0 + 0.3; x < lx1; x += 0.6) g.add(edged(M.cream, 0.04, 0.9, 0.04, x, ly, lz0));
    return g;
  }

  /** A piece of furniture from drawers.json; a chest with drawers drawn as stacked boxes. */
  function cabinet(fu: Furniture, rel: number) {
    const [x, z, w, d] = fu.rect;
    const name = fu.en.toLowerCase();
    const h = /shelf|wardrobe|cabinet|cupboard/.test(name) ? 1.9 : /bed/.test(name) ? 0.5 : /chair|stool/.test(name) ? 0.45 : 0.78;
    const g = new THREE.Group();
    if (fu.drawers > 0) {
      const each = h / fu.drawers;
      for (let i = 0; i < fu.drawers; i++) g.add(edged(M.furniture, w, each - 0.01, d, x + w / 2, rel + i * each, z + d / 2));
    } else g.add(edged(M.furniture, w, h, d, x + w / 2, rel, z + d / 2));
    return g;
  }

  // ---- Details from the elevation and the photos: columns and the east balcony's roof ----
  const col = (floor: string, x: number, z: number, y0: number, y1: number) => {
    const f = floorById(floor);
    const m = new THREE.Mesh(colGeo, M.cream);
    m.scale.y = y1 - y0;
    m.position.set(x, y0 - f.level, z);
    parts.get(floor)!.group.add(m);
  };
  const f2Level = data.floors[1]?.level ?? 3.6;
  if (floorIndex.has('f1') && floorIndex.has('f2')) {
    // Each column starts and ends inside the slab it stands on or holds up: faces that
    // meet exactly (or a column grazing a parapet) flicker on screen.
    const atticLevel = data.floors[floorIndex.get('attic') ?? 2]?.level ?? 7.0;
    for (const x of [4.95, 9.45]) {
      col('f1', x, 14.85, -0.4, f2Level - 0.1); // the porch
      col('f2', x, 14.4, f2Level - 0.1, atticLevel - 0.1); // the south balcony, under the attic terrace
    }
    for (const z of [5.3, 8.5]) {
      col('f1', 16.35, z, GROUND - 0.05, f2Level - 0.1);
      col('f2', 16.35, z, f2Level - 0.1, EAVE + 0.1); // the east balcony, as in the photo
    }
    parts.get('f2')!.group.add(edged(M.cream, 2.9, 0.22, 4.1, 15.45, EAVE - f2Level, 6.9));
  }

  // ---- The roof: two gables facing east and one facing south ----
  {
    const g = parts.get(roofFloor.id)!.group;
    const base = EAVE - roofFloor.level;
    for (const r of GABLES) gable(g, r.x[0], r.x[1], r.z[0], r.z[1], r.axis, base, r.ridge);
    const roof = data.rooms.find((r) => r.floor === roofFloor.id);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && roof) {
        o.userData = { slug: roof.slug, roof: true };
        slabs.push(o as THREE.Mesh);
      }
    });
  }

  /** A pitched roof over [x0..x1] × [z0..z1], ridge along `axis`, boards along its edges. */
  function gable(g: THREE.Group, x0: number, x1: number, z0: number, z1: number, axis: 'x' | 'z', eave: number, ridge: number) {
    const v = (x: number, y: number, z: number) => [x, y, z];
    let planes: number[][][], ends: number[][][];
    if (axis === 'x') {
      const zm = (z0 + z1) / 2;
      planes = [
        [v(x0, eave, z0), v(x1, eave, z0), v(x1, ridge, zm), v(x0, ridge, zm)],
        [v(x0, ridge, zm), v(x1, ridge, zm), v(x1, eave, z1), v(x0, eave, z1)],
      ];
      ends = [[v(x0, eave, z0), v(x0, ridge, zm), v(x0, eave, z1)], [v(x1, eave, z0), v(x1, ridge, zm), v(x1, eave, z1)]];
    } else {
      const xm = (x0 + x1) / 2;
      planes = [
        [v(x0, eave, z0), v(xm, ridge, z0), v(xm, ridge, z1), v(x0, eave, z1)],
        [v(xm, ridge, z0), v(x1, eave, z0), v(x1, eave, z1), v(xm, ridge, z1)],
      ];
      ends = [[v(x0, eave, z0), v(xm, ridge, z0), v(x1, eave, z0)], [v(x0, eave, z1), v(xm, ridge, z1), v(x1, eave, z1)]];
    }
    const quad = (q: number[][]) => [...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]];
    const mk = (pos: number[], mat: THREE.Material) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, mat));
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.line));
    };
    mk(planes.flatMap(quad), M.roof);
    mk(ends.flatMap((t) => t.flat()), M.gable);
    for (const t of ends) {
      beam(g, t[0], t[1]);
      beam(g, t[1], t[2]);
    }
    beam(g, ends[0][0], ends[1][0]);
    beam(g, ends[0][2], ends[1][2]);
  }
  function beam(g: THREE.Group, p: number[], q: number[]) {
    const a = new THREE.Vector3(p[0], p[1], p[2]), b = new THREE.Vector3(q[0], q[1], q[2]);
    const m = new THREE.Mesh(beamGeo, M.cream);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.scale.z = a.distanceTo(b) + 0.3;
    g.add(m);
    m.lookAt(b.add(g.position)); // lookAt takes a point in world space, so attach first
  }

  // ---- Blueprint: the original drawing laid on each floor, to check the model against it ----
  const loader = new THREE.TextureLoader();
  let blueprint = false;
  function showBlueprint(on: boolean) {
    blueprint = on;
    for (const f of data.floors) {
      const s = data.scans[f.id];
      const p = parts.get(f.id)!;
      if (!s || f === roofFloor) continue;
      if (on && !p.blueprint) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true });
        loader.load(s.src, (tex) => {
          if (signal.aborted) return tex.dispose();
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          mat.map = tex;
          mat.needsUpdate = true;
        });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
        plane.rotation.x = -Math.PI / 2;
        // Just above the highest floor of the storey, so the lines sit on the rooms.
        const top = Math.max(...data.rooms.filter((r) => r.floor === f.id).map((r) => r.level - f.level));
        plane.position.set(s.x + s.w / 2, top + 0.01, s.y + s.h / 2);
        plane.renderOrder = 1;
        p.group.add(plane);
        p.blueprint = plane;
      }
      if (p.blueprint) p.blueprint.visible = on;
    }
  }

  // ---- State ----
  let selected = roofFloor.id; // the roof button shows the whole house
  let lifted = false;
  let current: RoomM | null = null;
  let hovered: string | null = null;

  type Tween = { t0: number; ms: number; step: (e: number) => void; done?: () => void };
  let tweens: Tween[] = [];
  const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  function tween(ms: number, step: (e: number) => void, done?: () => void) {
    if (reduced || ms <= 0) {
      step(1);
      done?.();
      return;
    }
    tweens.push({ t0: performance.now(), ms, step, done });
  }

  const floorY = (f: FloorM) => f.level + (lifted ? LIFT * floorIndex.get(f.id)! : 0);

  function applyFloors(ms = 450) {
    const si = floorIndex.get(selected)!;
    const whole = selected === roofFloor.id;
    data.floors.forEach((f, i) => {
      const p = parts.get(f.id)!;
      p.group.visible = i <= si;
      for (const l of p.labels) l.visible = !whole && i === si;
      p.tall.visible = whole ? f !== topRoomFloor : i < si;
      const fromY = p.group.position.y, toY = floorY(f);
      tween(ms, (e) => (p.group.position.y = fromY + (toY - fromY) * e));
    });
    for (const w of walls) {
      const f = floorById(w.floor);
      const i = floorIndex.get(f.id)!;
      let h = fullFor(f);
      if (whole && f === topRoomFloor) h = EAVE - f.level; // under the roof
      else if (!whole && i === si) h = LOW;
      const from = w.mesh.scale.y;
      if (Math.abs(from - h) < 0.01) continue;
      tween(ms, (e) => {
        w.mesh.scale.y = from + (h - from) * e;
        if (w.map) w.map.repeat.y = w.mesh.scale.y / 0.6;
      });
    }
    root!.querySelectorAll<HTMLButtonElement>('[data-floor-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.floorBtn === selected)));
  }

  function paint() {
    for (const s of slabs) {
      if (s.userData.roof) continue;
      const slug = s.userData.slug as string;
      (s.material as THREE.MeshLambertMaterial).color.setHex(slug === current?.slug ? C.here : slug === hovered ? C.hover : s.userData.base);
    }
  }

  // ---- Camera ----
  const home = { pos: new THREE.Vector3(30, 20, 32), target: new THREE.Vector3(8, 4.5, 7.5) };
  camera.position.copy(home.pos);
  controls.target.copy(home.target);
  function flyTo(pos: THREE.Vector3, target: THREE.Vector3, ms = 700, done?: () => void) {
    const p0 = camera.position.clone(), t0 = controls.target.clone();
    tween(ms, (e) => {
      camera.position.lerpVectors(p0, pos, e);
      controls.target.lerpVectors(t0, target, e);
    }, done);
  }
  const narrow = () => (camera.aspect < 1 ? 1 / Math.sqrt(camera.aspect) : 1);

  // ---- The room card ----
  const card = root.querySelector<HTMLElement>('.h3d-card')!;
  const floorOf = (r: RoomM) => floorById(r.floor);
  function showCard(r: RoomM) {
    const f = floorOf(r);
    const ch: Bi = r.chapter ? { en: `Chapter ${r.chapter}`, zh: `第${r.chapter}章` } : { en: 'Chapter —', zh: '第—章' };
    card.querySelector('.h3d-card-where')!.innerHTML = `${bi(ch)} · ${bi({ en: f.name, zh: f.zh })}`;
    card.querySelector('.h3d-card-title')!.innerHTML = bi(r.contents ? { en: r.title, zh: r.titleZh } : { en: r.en, zh: r.zh });
    card.querySelector('.h3d-card-name')!.innerHTML = r.contents ? bi({ en: r.en, zh: r.zh }) : '';
    card.querySelector<HTMLAnchorElement>('.h3d-open')!.href = `/house/${r.slug}`;
    card.querySelector<HTMLElement>('.h3d-open')!.hidden = r.locked;
    card.hidden = false;
  }

  function setUrl() {
    history.replaceState(history.state, '', `/house/3d${current ? `?room=${current.slug}` : ''}`);
  }

  function select(r: RoomM, fly = true) {
    current = r;
    if (r.locked) toast(isZh() ? data.text.noDoor.zh : data.text.noDoor.en);
    selected = r.floor;
    applyFloors();
    paint();
    showCard(r);
    setUrl();
    if (!fly) return;
    // Keep the angle you're looking from; come close enough to see the room and its neighbours.
    const f = floorOf(r);
    const [cx, cz] = centroid(r);
    const target = new THREE.Vector3(cx, floorY(f) + (r.level - f.level), cz);
    const size = Math.max(r.rect[2], r.rect[3]);
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (dir.y < 0.5) dir.setY(0.5).normalize();
    const dist = (f === roofFloor ? 34 : Math.max(9, size * 2.6)) * narrow();
    flyTo(target.clone().add(dir.multiplyScalar(dist)), target);
  }

  function deselect() {
    current = null;
    card.hidden = true;
    paint();
    setUrl();
  }

  // ---- Toast ----
  const toastEl = root.querySelector<HTMLElement>('.h3d-toast')!;
  let toastTimer = 0;
  function toast(msg: string) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  // ---- Pointer: hover and click (a drag is not a click) ----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const shown = (o: THREE.Object3D | null) => {
    for (; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  function pick(ev: PointerEvent): RoomM | null {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(slabs.filter(shown), false)[0];
    return hit ? roomBySlug.get(hit.object.userData.slug) ?? null : null;
  }
  let down: { x: number; y: number } | null = null;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }), { signal });
  el.addEventListener('pointermove', (e) => {
    if (down) return;
    const slug = pick(e)?.slug ?? null;
    if (slug !== hovered) {
      hovered = slug;
      el.style.cursor = slug ? 'pointer' : '';
      paint();
    }
  }, { signal });
  el.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
    const r = pick(e);
    if (r) select(r);
    else if (current) deselect();
  }, { signal });
  el.addEventListener('pointerleave', () => {
    if (hovered) { hovered = null; paint(); }
  }, { signal });

  // ---- Controls ----
  root.querySelectorAll<HTMLButtonElement>('[data-floor-btn]').forEach((b) =>
    b.addEventListener('click', () => {
      selected = b.dataset.floorBtn!;
      if (current && current.floor !== selected) deselect();
      applyFloors();
      if (selected === roofFloor.id) return flyTo(home.pos, home.target);
      // Look at the chosen floor from where you are, standing back far enough to see it whole.
      const f = floorById(selected);
      const target = controls.target.clone().setY(floorY(f) + 0.5);
      const dir = camera.position.clone().sub(controls.target);
      const min = 22 * narrow();
      if (dir.length() < min) dir.setLength(min);
      if (dir.y < min * 0.45) dir.setY(min * 0.45);
      flyTo(target.clone().add(dir), target);
    }, { signal }),
  );
  root.querySelector<HTMLInputElement>('[data-lift]')!.addEventListener('change', (e) => {
    lifted = (e.target as HTMLInputElement).checked;
    applyFloors(600);
  }, { signal });
  root.querySelector<HTMLInputElement>('[data-blueprint3d]')!.addEventListener('change', (e) => showBlueprint((e.target as HTMLInputElement).checked), { signal });
  card.querySelector('.h3d-card-close')!.addEventListener('click', deselect, { signal });
  const floorKeys = new Map(data.floors.map((f) => [f.label.toUpperCase(), f.id]));
  document.addEventListener('keydown', (e) => {
    if ((e.target as Element).closest?.('input, textarea')) return;
    if (e.key === 'Escape' && current) return deselect();
    const f = !e.ctrlKey && !e.metaKey && !e.altKey && floorKeys.get(e.key.toUpperCase());
    if (f && document.activeElement && root!.contains(document.activeElement)) {
      root!.querySelector<HTMLButtonElement>(`[data-floor-btn="${f}"]`)?.click();
    }
  }, { signal });

  // ---- Size and render loop ----
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  let frame = 0;
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    if (document.hidden) return;
    if (tweens.length) {
      tweens = tweens.filter((t) => {
        const k = Math.min(1, (now - t.t0) / t.ms);
        t.step(ease(k));
        if (k >= 1) t.done?.();
        return k < 1;
      });
    }
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  };
  frame = requestAnimationFrame(loop);

  // ---- Start: whole house, or the room in the URL ----
  applyFloors(0);
  const start = roomBySlug.get(new URLSearchParams(location.search).get('room') ?? '');
  if (start) select(start, true);
  if (root.querySelector<HTMLInputElement>('[data-blueprint3d]')!.checked) showBlueprint(true);
  void blueprint;

  active = {
    root,
    dispose() {
      cancelAnimationFrame(frame);
      ro.disconnect();
      off.abort();
      clearTimeout(toastTimer);
      controls.dispose();
      const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) geos.add(m.geometry);
        if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x));
      });
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      });
      brickTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
    },
  };
}
