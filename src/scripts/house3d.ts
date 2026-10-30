// The house in 3D: a dollhouse built from the floorplan's rooms, in the house's own colours,
// and a place to imagine the work shown inside it. Click a room and its walls go
// up with the project's photographs and text hung on them; the walls between you
// and the room drop away as you turn. Drawers with writings stand in as cabinets.
//
// Not a survey: rooms are the traced rectangles, heights come from the floor
// levels; the roof, columns, balustrades, stairs, cellar and loft follow the
// south elevation, photos of the house and notes from the family.
// Plain three.js, no framework. Same page lifecycle as the 2D map (map.ts).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

type Pt = [number, number];
type Bi = { en: string; zh: string };
interface RoomM {
  slug: string; floor: string; chapter: number | null; en: string; zh: string; title: string; titleZh: string;
  points: Pt[]; rect: number[]; level: number; outdoor: boolean; locked: boolean; stairs: boolean; contents: boolean;
}
interface FloorM { id: string; label: string; name: string; zh: string; level: number; storey: number }
interface Exhibit { title: Bi; text: Bi; images: { src: string; ratio: number }[] }
interface Furniture { en: string; zh: string; drawers: number; rect: number[] }
interface Data {
  floors: FloorM[]; rooms: RoomM[]; grid: { columns: number[]; rows: number[] }; text: { noDoor: Bi };
  exhibits: Record<string, Exhibit>; furniture: Record<string, Furniture[]>;
}

// Sizes in metres.
const GROUND = -0.6; // the lowest step outside
const LOW = 1.1; // cut-away wall height in the dollhouse
const FULL = 2.9; // wall height in a room you're looking into
const EAVE = 7.35; // from the south elevation
const THICK = 0.18;
const LIFT = 3.4; // extra gap between floors when they're lifted apart
const HANG = 1.5; // centre of a hung piece above the floor

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

function init() {
  const root = document.getElementById('house-3d');
  if (!root || root === active?.root) return;
  active?.dispose();
  active = null;

  const data = JSON.parse(document.getElementById('house-3d-data')!.textContent!) as Data;
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
    glass: lambert(C.glass), frame: lambert(0x1a1a1a),
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
  const plane = new THREE.PlaneGeometry(1, 1);

  // ---- Floors ----
  const floorIndex = new Map(data.floors.map((f, i) => [f.id, i]));
  const roofFloor = data.floors[data.floors.length - 1];
  const topRoomFloor = data.floors[data.floors.length - 2];
  const roomBySlug = new Map(data.rooms.map((r) => [r.slug, r]));
  const fullFor = (f: FloorM) => Math.min(FULL, Math.max(0.5, f.storey - 0.25));

  /** A wall, and what hangs on it or sits in it (windows, glazing, works): shown only while it stands tall. */
  interface Wall { mesh: THREE.Mesh; floor: string; map?: THREE.Texture; h: number; extras: THREE.Object3D[] }
  /** A room's side of a wall: which way is out, and where along it things can hang. */
  interface Side { wall: Wall; a: Pt; b: Pt; nx: number; nz: number; hang: boolean }
  const walls: Wall[] = [];
  const sides = new Map<string, Side[]>();
  const quoinsOf = new Map<string, THREE.Group>();
  interface FloorParts { group: THREE.Group; labels: CSS2DObject[] }
  const parts = new Map<string, FloorParts>();
  const slabs: THREE.Mesh[] = [];
  for (const f of data.floors) {
    const group = new THREE.Group();
    group.position.y = f.level;
    scene.add(group);
    const quoins = new THREE.Group();
    group.add(quoins);
    quoinsOf.set(f.id, quoins);
    parts.set(f.id, { group, labels: [] });
  }

  // ---- The stairs as they are in the house ----
  // Ground to first floor: a wooden staircase that turns back on itself (a U): up
  // eastwards along the south side, round a half-turn, and back westwards to the first floor.
  // First floor to attic: one straight flight. No stairs to the roof.
  const U = { floor: 'f1', above: 'f2', x0: 4.3, xTurn: 6.6, xEnd: 5.0, zSplit: 4.8, zSouth: 5.5, zNorth: 4.1 };
  const FLIGHT = { floor: 'f2', above: 'attic', x0: 3.9, x1: 7.5, z0: 2.95, z1: 3.95 };
  const hasStairs = floorIndex.has(U.floor) && floorIndex.has(U.above) && floorIndex.has(FLIGHT.above);
  const stairwells: Record<string, [number, number, number, number]> = hasStairs
    ? { [U.above]: [U.xEnd - 0.1, U.zNorth - 0.05, U.xTurn + 0.75, U.zSouth + 0.05], [FLIGHT.above]: [FLIGHT.x0, FLIGHT.z0, FLIGHT.x1, FLIGHT.z1] }
    : {};

  // ---- The garage: a cellar a few steps down from the hall, for wine and things kept
  // a long time; on the right as you come in, a small stair up to a narrow loft. ----
  const CELLAR = { room: 'f1-garage', steps: { x0: 8.5, x1: 9.5, z: 5.6 }, stair: { x0: 9.8, x1: 12.0, z0: 5.0, z1: 5.5 }, loft: { x0: 12.0, x1: 14.6, z0: 4.3, z1: 5.5, y: 1.6 } };

  // The south front of the living room, onto the porch: a tall picture window and, to its
  // right as you face the house, a wide glass door. Plan x ranges in metres.
  const OPENINGS: Record<string, { x0: number; x1: number; door: boolean }[]> = {
    'f1-living-room:south': [{ x0: 4.0, x1: 8.3, door: false }, { x0: 8.7, x1: 10.4, door: true }],
  };
  const OPENING_TOP = 2.6;

  function slabMesh(r: RoomM, f: FloorM, i: number) {
    const shape = new THREE.Shape(r.points.map(([x, z]) => new THREE.Vector2(x, -z)));
    // Leave a stairwell where the stairs come up from the floor below.
    const well = stairwells[f.id];
    if (well && !r.outdoor) {
      const [rx, rz, rw, rd] = r.rect;
      const x0 = Math.max(well[0], rx + 0.05), x1 = Math.min(well[2], rx + rw - 0.05);
      const z0 = Math.max(well[1], rz + 0.05), z1 = Math.min(well[3], rz + rd - 0.05);
      if (x1 - x0 > 0.3 && z1 - z0 > 0.3) {
        shape.holes.push(new THREE.Path([new THREE.Vector2(x0, -z0), new THREE.Vector2(x0, -z1), new THREE.Vector2(x1, -z1), new THREE.Vector2(x1, -z0)]));
      }
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

  const wallByKey = new Map<string, Wall>();
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
      const roomSides: Side[] = [];
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
        const exterior = !indoor.some((o) => o !== r && inside(out, o.points));
        const key = `${f.id}:${[a, b].map((p) => p.map((v) => v.toFixed(2)).join(',')).sort().join('|')}`;
        const known = wallByKey.get(key);
        if (known) {
          // A wall already built from the room next door: this room's side of it.
          roomSides.push({ wall: known, a, b, nx, nz, hang: len >= 1.2 });
          continue;
        }
        const side = Math.abs(nz) > Math.abs(nx) ? (nz > 0 ? 'south' : 'north') : nx > 0 ? 'east' : 'west';
        const openings = OPENINGS[`${r.slug}:${side}`];
        if (openings && Math.abs(dz) < 0.01) {
          // Wall pieces between the openings, glazing in them, a lintel above.
          const lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
          let x = lo;
          for (const o of [...openings].sort((p, q) => p.x0 - q.x0)) {
            if (o.x0 - x > 0.05) roomSides.push({ wall: wall(group, f.id, [x, a[1]], [o.x0, a[1]], nx, nz, exterior, rel), a: [x, a[1]], b: [o.x0, a[1]], nx, nz, hang: false });
            const w = roomSides.at(-1)?.wall ?? wall(group, f.id, [o.x0, a[1]], [o.x0 + 0.01, a[1]], nx, nz, exterior, rel);
            w.extras.push(glazing(group, f, o.x0, o.x1, a[1], rel, o.door, exterior));
            x = o.x1;
          }
          if (hi - x > 0.05) roomSides.push({ wall: wall(group, f.id, [x, a[1]], [hi, a[1]], nx, nz, exterior, rel), a: [x, a[1]], b: [hi, a[1]], nx, nz, hang: false });
          continue;
        }
        const w = wall(group, f.id, a, b, nx, nz, exterior, rel);
        wallByKey.set(key, w);
        roomSides.push({ wall: w, a, b, nx, nz, hang: len >= 1.2 && !r.stairs });
        if (exterior && len >= 2.4 && !r.stairs) w.extras.push(windowOn(group, mid, Math.atan2(-dz, dx), nx, nz, len, rel));
      }
      sides.set(r.slug, roomSides);
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
    if (hasStairs && f.id === U.floor) group.add(uStair(data.floors[floorIndex.get(U.above)!].level - f.level));
    if (hasStairs && f.id === FLIGHT.floor) group.add(flight(data.floors[floorIndex.get(FLIGHT.above)!].level - f.level));
    const cellar = roomBySlug.get(CELLAR.room);
    if (cellar && cellar.floor === f.id) group.add(cellarStairs(cellar.level - f.level));
  });

  /** One wall from a to b: drawn brick outside if it's an outside wall, white inside. */
  function wall(group: THREE.Group, floor: string, a: Pt, b: Pt, nx: number, nz: number, exterior: boolean, rel: number): Wall {
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
    const w: Wall = { mesh, floor, map: brick?.map ?? undefined, h: LOW, extras: [] };
    walls.push(w);
    return w;
  }

  /** A floor-to-ceiling picture window or a glass door in an east–west wall, with frames and a lintel. */
  function glazing(group: THREE.Group, f: FloorM, x0: number, x1: number, z: number, rel: number, door: boolean, exterior: boolean) {
    const g = new THREE.Group();
    const bar = (mat: THREE.Material, cx: number, y0: number, w: number, h: number, d: number) => {
      const m = new THREE.Mesh(unitBox, mat);
      m.scale.set(w, h, d);
      m.position.set(cx, rel + y0, z);
      g.add(m);
    };
    const w = x1 - x0, mid = (x0 + x1) / 2, d = THICK + 0.04;
    bar(M.pane, mid, 0, w, OPENING_TOP, 0.03);
    bar(M.white, x0 + 0.05, 0, 0.1, OPENING_TOP, d);
    bar(M.white, x1 - 0.05, 0, 0.1, OPENING_TOP, d);
    bar(M.white, mid, OPENING_TOP - 0.1, w, 0.1, d);
    bar(M.white, mid, 0, w, 0.06, d);
    if (door) {
      bar(M.white, mid, 0, 0.08, OPENING_TOP, d); // two leaves
      for (const s of [-1, 1]) bar(M.cream, mid + s * 0.12, 1.0, 0.04, 0.35, d + 0.08); // handles
    } else {
      const panes = Math.max(2, Math.round(w / 1.1));
      for (let k = 1; k < panes; k++) bar(M.white, x0 + (w * k) / panes, 0, 0.06, OPENING_TOP, d);
      bar(M.white, mid, 2.0, w, 0.06, d); // transom
    }
    const top = fullFor(f);
    if (top > OPENING_TOP) {
      const lintel = new THREE.Mesh(unitBox, exterior ? brickFor(w, top - OPENING_TOP) : M.wall);
      lintel.scale.set(w, top - OPENING_TOP, THICK);
      lintel.position.set(mid, rel + OPENING_TOP, z);
      g.add(lintel);
    }
    group.add(g);
    return g;
  }

  /** A window with a white frame and a cross bar, on the outside face of a wall. */
  function windowOn(group: THREE.Group, mid: Pt, theta: number, nx: number, nz: number, len: number, rel: number) {
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
    group.add(win);
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
      quoinsOf.get(floor)!.add(inst);
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
    rail.add(new THREE.LineSegments(unitEdges, M.edge));
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

  /** The ground-to-first-floor staircase: a U, up east, a half-turn, back west. */
  function uStair(rise: number) {
    const g = new THREE.Group();
    const nA = 8, nTurn = 4, nB = 7, total = nA + nTurn + nB;
    const riser = rise / total;
    const list: number[][] = [];
    const tA = (U.xTurn - U.x0) / nA;
    const zA = (U.zSplit + U.zSouth) / 2, dA = U.zSouth - U.zSplit;
    for (let s = 0; s < nA; s++) list.push([U.x0 + tA * (s + 0.5), zA, tA, dA, riser * (s + 1)]);
    const tB = (U.xTurn - U.xEnd) / nB;
    const zB = (U.zNorth + U.zSplit) / 2, dB = U.zSplit - U.zNorth;
    for (let s = 0; s < nB; s++) list.push([U.xTurn - tB * (s + 0.5), zB, tB, dB, riser * (nA + nTurn + s + 1)]);
    g.add(blocks(list, M.wood));
    // The half-turn: wedge-shaped winders round the end.
    const r = U.zSouth - U.zSplit;
    const wedge = new THREE.BoxGeometry(r, 1, (Math.PI * r) / nTurn + 0.05).translate(r / 2, 0.5, 0);
    const winders = new THREE.InstancedMesh(wedge, M.wood, nTurn);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (let s = 0; s < nTurn; s++) {
      // From pointing south (+z) round through east to north (−z).
      const ang = Math.PI / 2 - (Math.PI * (s + 0.5)) / nTurn;
      q.setFromAxisAngle(up, -ang);
      m4.compose(new THREE.Vector3(U.xTurn, 0, U.zSplit), q, new THREE.Vector3(1, riser * (nA + s + 1), 1));
      winders.setMatrixAt(s, m4);
    }
    g.add(winders);
    return g;
  }

  /** The straight flight from the first floor to the attic. */
  function flight(rise: number) {
    const { x0, x1, z0, z1 } = FLIGHT;
    const steps = 18, w = (x1 - x0) / steps;
    return blocks(Array.from({ length: steps }, (_, s) => [x0 + w * (s + 0.5), (z0 + z1) / 2, w, z1 - z0, (rise * (s + 1)) / steps]), M.step);
  }

  /** The cellar: three steps down from the hall, the stair up to the loft on the right, and the loft. */
  function cellarStairs(rel: number) {
    const g = new THREE.Group();
    const down = rel; // the cellar floor, below the hall
    const depth = -down;
    const { steps, stair, loft } = CELLAR;
    // Down from the hall door: three steps, each a third of the way.
    const s1 = blocks([0, 1, 2].map((i) => [(steps.x0 + steps.x1) / 2, steps.z - 0.15 - i * 0.3, steps.x1 - steps.x0, 0.3, (depth * (3 - i)) / 3]), M.step);
    s1.position.y = down;
    g.add(s1);
    // Up eastwards to the loft.
    const n = 10, rise = loft.y - down, tw = (stair.x1 - stair.x0) / n;
    const s2 = blocks(Array.from({ length: n }, (_, i) => [stair.x0 + tw * (i + 0.5), (stair.z0 + stair.z1) / 2, tw, stair.z1 - stair.z0, (rise * (i + 1)) / n]), M.step);
    s2.position.y = down;
    g.add(s2);
    // The loft: a narrow floor with a rail along its open sides.
    g.add(edged(M.white, loft.x1 - loft.x0, 0.15, loft.z1 - loft.z0, (loft.x0 + loft.x1) / 2, loft.y - 0.15, (loft.z0 + loft.z1) / 2));
    g.add(edged(M.white, loft.x1 - loft.x0, 0.05, 0.05, (loft.x0 + loft.x1) / 2, loft.y + 0.9, loft.z0));
    for (let x = loft.x0 + 0.3; x < loft.x1; x += 0.6) g.add(edged(M.white, 0.04, 0.9, 0.04, x, loft.y, loft.z0));
    return g;
  }

  /** A piece of furniture from drawers.json; a chest with drawers drawn as stacked boxes (the archive). */
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
    const f = data.floors[floorIndex.get(floor)!];
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
    gable(g, -0.3, 8.1, 2.4, 6.0, 'x', base, -1.0);
    gable(g, -0.3, 14.4, 5.6, 11.5, 'x', base, 0);
    gable(g, 3.4, 11.0, 7.8, 11.8, 'z', base, -0.8);
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
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(beamGeo), M.edge));
    g.add(m);
    m.lookAt(b.add(g.position)); // lookAt takes a point in world space, so attach first
  }

  // ---- The exhibition: a room's photographs, framed, and its text on a panel ----
  const loader = new THREE.TextureLoader();
  const hung = new Map<string, { side: Side; obj: THREE.Object3D }[]>();
  const panels: { draw: () => void }[] = [];

  function textPanel(ex: Exhibit) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 640;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const draw = () => {
      const g = c.getContext('2d')!;
      const zh = isZh();
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 512, 640);
      g.fillStyle = '#000000';
      g.font = '34px "Times New Roman", Times, serif';
      const title = zh ? ex.title.zh || ex.title.en : ex.title.en;
      let y = wrap(g, title, 40, 70, 432, 40, 3);
      g.font = '22px "Times New Roman", Times, serif';
      wrap(g, zh ? ex.text.zh || ex.text.en : ex.text.en, 40, y + 24, 432, 30, 16);
      tex.needsUpdate = true;
    };
    draw();
    panels.push({ draw });
    return tex;
  }
  /** Draw text wrapped to a width (by word, or by character for Chinese); returns the next line's y. */
  function wrap(g: CanvasRenderingContext2D, s: string, x: number, y: number, width: number, lh: number, maxLines: number) {
    const units = /[㐀-鿿]/.test(s) ? [...s] : s.split(/(\s+)/);
    let line = '', lines = 0;
    for (const u of units) {
      const next = line + u;
      if (g.measureText(next).width > width && line.trim()) {
        if (++lines >= maxLines) { g.fillText(line.trimEnd() + '…', x, y); return y + lh; }
        g.fillText(line.trimEnd(), x, y);
        y += lh;
        line = u.trimStart();
      } else line = next;
    }
    if (line.trim()) { g.fillText(line, x, y); y += lh; }
    return y;
  }

  /** Hang a room's work on its walls, the first time it's opened: the text first, then the photographs. */
  function hang(r: RoomM) {
    if (hung.has(r.slug)) return hung.get(r.slug)!;
    const ex = data.exhibits[r.slug];
    const out: { side: Side; obj: THREE.Object3D }[] = [];
    hung.set(r.slug, out);
    if (!ex) return out;
    const f = data.floors[floorIndex.get(r.floor)!];
    const group = parts.get(f.id)!.group;
    const rel = r.level - f.level;
    // Places along each wall, about one every 1.3 m; walls taken in turn so the work spreads round the room.
    const perWall = (sides.get(r.slug) ?? []).filter((s) => s.hang).map((s) => {
      const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      const k = Math.max(1, Math.floor((len - 0.3) / 1.3));
      return Array.from({ length: k }, (_, i) => ({ side: s, t: (i + 0.5) / k, room: len / k }));
    });
    const slots: { side: Side; t: number; room: number }[] = [];
    for (let i = 0; perWall.some((w) => w[i]); i++) for (const w of perWall) if (w[i]) slots.push(w[i]);
    const items: ({ text: true } | { src: string; ratio: number })[] = [...(ex.text.en || ex.text.zh ? [{ text: true as const }] : []), ...ex.images];
    items.slice(0, slots.length).forEach((item, i) => {
      const { side, t, room } = slots[i];
      const maxW = Math.min(1.1, room - 0.3), maxH = 1.0;
      let w: number, h: number, mat: THREE.Material;
      if ('text' in item) {
        w = Math.min(maxW, 0.8);
        h = w * 1.25;
        mat = new THREE.MeshBasicMaterial({ map: textPanel(ex) });
      } else {
        w = Math.min(maxW, maxH * item.ratio);
        h = w / item.ratio;
        const m = new THREE.MeshBasicMaterial({ color: 0xffffff, map: null });
        mat = m;
        loader.load(item.src, (tex) => {
          if (signal.aborted) return tex.dispose();
          tex.colorSpace = THREE.SRGBColorSpace;
          m.map = tex;
          m.needsUpdate = true;
        });
      }
      const piece = new THREE.Group();
      const px = side.a[0] + (side.b[0] - side.a[0]) * t, pz = side.a[1] + (side.b[1] - side.a[1]) * t;
      const off = THICK / 2 + 0.03;
      piece.position.set(px - side.nx * off, rel + HANG, pz - side.nz * off);
      piece.rotation.y = Math.atan2(-side.nx, -side.nz);
      const frame = new THREE.Mesh(unitBox, M.frame);
      frame.scale.set(w + 0.06, h + 0.06, 0.03);
      frame.position.set(0, -(h + 0.06) / 2, -0.02);
      const pic = new THREE.Mesh(plane, mat);
      pic.scale.set(w, h, 1);
      piece.add(frame, pic);
      piece.visible = false;
      group.add(piece);
      out.push({ side, obj: piece });
    });
    return out;
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

  function setWall(w: Wall, h: number, ms: number) {
    if (Math.abs(w.h - h) < 0.01) return;
    w.h = h;
    const from = w.mesh.scale.y;
    tween(ms, (e) => {
      w.mesh.scale.y = from + (h - from) * e;
      if (w.map) w.map.repeat.y = w.mesh.scale.y / 0.6;
    });
    for (const x of w.extras) x.visible = h >= 2;
  }

  /** The room you're looking into: its walls up, except those between you and it. */
  function focusWalls(ms: number) {
    const r = current;
    const open = r && selected === r.floor && selected !== roofFloor.id;
    const items = r ? hung.get(r.slug) ?? [] : [];
    if (!open || !r) {
      for (const it of items) it.obj.visible = false;
      return;
    }
    const f = data.floors[floorIndex.get(r.floor)!];
    const full = fullFor(f);
    const cam = camera.position;
    for (const s of sides.get(r.slug) ?? []) {
      const mx = (s.a[0] + s.b[0]) / 2, mz = (s.a[1] + s.b[1]) / 2;
      const facing = (cam.x - mx) * s.nx + (cam.z - mz) * s.nz > 0;
      setWall(s.wall, facing ? LOW : full, ms);
    }
    for (const it of items) it.obj.visible = it.side.wall.h >= 2;
  }

  function applyFloors(ms = 450) {
    const si = floorIndex.get(selected)!;
    const whole = selected === roofFloor.id;
    data.floors.forEach((f, i) => {
      const p = parts.get(f.id)!;
      p.group.visible = i <= si;
      for (const l of p.labels) l.visible = !whole && i === si;
      quoinsOf.get(f.id)!.visible = whole ? f !== topRoomFloor : i < si;
      const fromY = p.group.position.y, toY = floorY(f);
      tween(ms, (e) => (p.group.position.y = fromY + (toY - fromY) * e));
    });
    for (const w of walls) {
      const f = data.floors[floorIndex.get(w.floor)!];
      const i = floorIndex.get(f.id)!;
      let h = fullFor(f);
      if (whole && f === topRoomFloor) h = EAVE - f.level; // under the roof
      else if (!whole && i === si) h = LOW;
      setWall(w, h, ms);
    }
    focusWalls(ms);
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
  const floorOf = (r: RoomM) => data.floors[floorIndex.get(r.floor)!];
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
    if (current && current !== r) for (const it of hung.get(current.slug) ?? []) it.obj.visible = false;
    current = r;
    if (r.locked) toast(isZh() ? data.text.noDoor.zh : data.text.noDoor.en);
    selected = r.floor;
    hang(r);
    applyFloors();
    paint();
    showCard(r);
    setUrl();
    if (!fly) return;
    // Look down into the room from the side you're on, steep enough to see its walls.
    const f = floorOf(r);
    const [cx, cz] = centroid(r);
    const target = new THREE.Vector3(cx, floorY(f) + (r.level - f.level) + (f === roofFloor ? 0 : 0.8), cz);
    const size = Math.max(r.rect[2], r.rect[3]);
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (dir.y < 0.75) dir.setY(0.75).normalize();
    const dist = (f === roofFloor ? 34 : Math.max(7.5, size * 2.2)) * narrow();
    flyTo(target.clone().add(dir.multiplyScalar(dist)), target);
  }

  function deselect() {
    if (current) for (const it of hung.get(current.slug) ?? []) it.obj.visible = false;
    current = null;
    card.hidden = true;
    applyFloors(300);
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
      const f = data.floors[floorIndex.get(selected)!];
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
  document.addEventListener('langchange', () => panels.forEach((p) => p.draw()), { signal });

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
    // As you turn round a room, the walls between you and it drop away.
    if (current) focusWalls(250);
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  };
  frame = requestAnimationFrame(loop);

  // ---- Start: whole house, or the room in the URL ----
  applyFloors(0);
  const start = roomBySlug.get(new URLSearchParams(location.search).get('room') ?? '');
  if (start) select(start, true);

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
