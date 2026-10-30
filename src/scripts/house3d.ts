// The house in 3D: a rough dollhouse model built from the floorplan's rooms.
// Not a survey: rooms are the traced rectangles, heights come from the floor
// levels, and the roof, columns and balustrades follow the south elevation and
// a photo of the east side (brick walls, cream trim, two gables facing east).
// Plain three.js, no framework. Same page lifecycle as the 2D map (map.ts).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

type Pt = [number, number];
type Bi = { en: string; zh: string };
interface Exit { to: string; dir: string; at?: Pt; floorName?: string; floorZh?: string }
interface RoomM {
  slug: string; floor: string; chapter: number | null; en: string; zh: string; title: string; titleZh: string;
  points: Pt[]; rect: number[]; level: number; outdoor: boolean; locked: boolean; stairs: boolean; contents: boolean; exits: Exit[];
}
interface FloorM { id: string; label: string; name: string; zh: string; level: number; storey: number; stairs?: { box: number[]; up?: string; down?: string } }
interface Data { floors: FloorM[]; rooms: RoomM[]; grid: { columns: number[]; rows: number[] }; text: { noDoor: Bi } }

// Sizes in metres.
const GROUND = -0.6; // the lowest step outside
const LOW = 1.1; // cut-away wall height in the dollhouse
const FULL = 2.9; // wall height when you stand inside
const EAVE = 7.35; // from the south elevation
const THICK = 0.18;
const EYE = 1.6;
const LIFT = 3.4; // extra gap between floors when they're lifted apart

const C = {
  brick: 0xa65d45, cream: 0xefe6cf, wall: 0xfbfbf9, floor: 0xf3f0e8, outdoor: 0xe4e0d6, contents: 0xe9ecff,
  hover: 0xffffcc, here: 0xffff66, roof: 0x8e5b49, locked: 0xc9c9c9, step: 0xe8e2d4, ground: 0xf4f3ee, line: 0x555555,
};

const DIR_EN: Record<string, string> = { north: 'North', east: 'East', south: 'South', west: 'West' };
const DIR_ZH: Record<string, string> = { north: '北', east: '东', south: '南', west: '西' };

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
  const outsideLimits = () => {
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.minDistance = 3;
    controls.maxDistance = 120;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.rotateSpeed = 1;
  };
  outsideLimits();

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
    brick: lambert(C.brick), cream: lambert(C.cream), wall: lambert(C.wall), step: lambert(C.step),
    roof: lambert(C.roof, { side: THREE.DoubleSide }), gable: lambert(C.brick, { side: THREE.DoubleSide }),
    locked: lambert(C.locked), ground: lambert(C.ground), stone: lambert(0xe9e4d8), glass: lambert(0x46525a),
    line: new THREE.LineBasicMaterial({ color: C.line }),
    grid: new THREE.LineBasicMaterial({ color: 0xbbbbbb }),
    edge: new THREE.LineBasicMaterial({ color: 0x9a948a }),
  };

  // ---- The ground and the structural grid ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), M.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(8, GROUND - 0.01, 7.5);
  scene.add(ground);
  {
    const { columns, rows } = data.grid;
    const pts: number[] = [];
    const y = GROUND;
    for (const x of columns) pts.push(x, y, rows[0] - 1.5, x, y, rows[rows.length - 1] + 1.5);
    for (const z of rows) pts.push(columns[0] - 1.5, y, z, columns[columns.length - 1] + 1.5, y, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(g, M.grid));
  }

  // ---- Floors ----
  const floorIndex = new Map(data.floors.map((f, i) => [f.id, i]));
  const roofFloor = data.floors[data.floors.length - 1];
  const topRoomFloor = data.floors[data.floors.length - 2];
  const roomBySlug = new Map(data.rooms.map((r) => [r.slug, r]));
  interface Wall { mesh: THREE.Mesh; floor: string; map?: THREE.Texture }
  // Windows and corner stones show only when a floor's walls stand at full height.
  const facade = new Map<string, { windows: THREE.Group; quoins: THREE.Group }>();
  interface FloorParts { group: THREE.Group; labels: CSS2DObject[]; y: number }
  const parts = new Map<string, FloorParts>();
  const walls: Wall[] = [];
  const slabs: THREE.Mesh[] = [];
  const slabOf = new Map<string, THREE.Mesh[]>();
  for (const f of data.floors) {
    const group = new THREE.Group();
    group.position.y = f.level;
    scene.add(group);
    parts.set(f.id, { group, labels: [], y: f.level });
    const windows = new THREE.Group(), quoins = new THREE.Group();
    group.add(windows, quoins);
    facade.set(f.id, { windows, quoins });
  }

  // Stairs: one run per floor that has stairs up, alternating direction like a switchback.
  const runs = new Map<string, { x0: number; x1: number; z0: number; z1: number; rise: number; east: boolean }>();
  data.floors.forEach((f, i) => {
    if (!f.stairs?.up || i >= data.floors.length - 1) return;
    const [bx, bz, bw, bd] = f.stairs.box;
    const above = data.floors[i + 1].stairs?.box ?? f.stairs.box;
    const zc = Math.min(bz + bd - 0.6, Math.max(bz + 0.6, above[1] + above[3] / 2));
    const toRoof = i + 1 === data.floors.length - 1;
    runs.set(f.id, { x0: bx + 0.3, x1: bx + bw - 0.3, z0: zc - 0.55, z1: zc + 0.55, rise: toRoof ? 2.4 : f.storey, east: i % 2 === 0 });
  });

  const fullFor = (f: FloorM) => Math.min(FULL, Math.max(0.5, f.storey - 0.25));
  const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const wallBox = new THREE.BoxGeometry(1, 1, THICK).translate(0, 0.5, 0);
  // A bottle-shaped baluster, 0.7 m tall, like the ones on the balconies.
  const wallEdges = new THREE.EdgesGeometry(wallBox);
  const postGeo = new THREE.LatheGeometry(
    [[0.0, 0], [0.07, 0], [0.075, 0.06], [0.085, 0.24], [0.075, 0.38], [0.045, 0.52], [0.035, 0.6], [0.05, 0.64], [0.05, 0.7], [0, 0.7]].map(([x, y]) => new THREE.Vector2(x, y)),
    8,
  );
  const beamGeo = new THREE.BoxGeometry(0.26, 0.32, 1);
  const colGeo = new THREE.CylinderGeometry(0.17, 0.17, 1, 14).translate(0, 0.5, 0);

  function slabMesh(r: RoomM, f: FloorM, i: number) {
    const shape = new THREE.Shape(r.points.map(([x, z]) => new THREE.Vector2(x, -z)));
    // Leave a stairwell where the stairs come up from the floor below.
    const below = data.floors[i - 1];
    const run = below && runs.get(below.id);
    if (run && !r.outdoor) {
      const [rx, rz, rw, rd] = r.rect;
      const x0 = Math.max(run.x0, rx + 0.05), x1 = Math.min(run.x1, rx + rw - 0.05);
      const z0 = Math.max(run.z0, rz + 0.05), z1 = Math.min(run.z1, rz + rd - 0.05);
      if (x1 - x0 > 0.3 && z1 - z0 > 0.3) {
        shape.holes.push(new THREE.Path([new THREE.Vector2(x0, -z0), new THREE.Vector2(x0, -z1), new THREE.Vector2(x1, -z1), new THREE.Vector2(x1, -z0)]));
      }
    }
    const depth = i === 0 ? r.level - GROUND : 0.2;
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).rotateX(-Math.PI / 2);
    const base = r.outdoor ? C.outdoor : r.locked ? C.locked : r.contents ? C.contents : C.floor;
    const mat = lambert(base);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = r.level - f.level - depth - (r.outdoor ? 0.02 : 0);
    mesh.userData = { slug: r.slug, base };
    slabs.push(mesh);
    slabOf.set(r.slug, [...(slabOf.get(r.slug) ?? []), mesh]);
    return mesh;
  }

  function outline(r: RoomM, y: number) {
    const pts = r.points.map(([x, z]) => new THREE.Vector3(x, y, z));
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), M.line);
  }

  const seen = new Set<string>();
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
        const box = new THREE.Mesh(unitBox, M.locked);
        box.scale.set(r.rect[2], 2.2, r.rect[3]);
        box.position.set(r.rect[0] + r.rect[2] / 2, rel, r.rect[1] + r.rect[3] / 2);
        box.userData = { slug: r.slug, base: C.locked };
        group.add(box);
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
          // Balconies and terraces upstairs get a cream balustrade where they meet the air.
          if (!neighbour && i > 0) balustrade(group, a, b, rel);
          continue;
        }
        const exterior = !indoor.some((o) => o !== r && inside(out, o.points));
        const key = `${f.id}:${[a, b].map((p) => p.map((v) => v.toFixed(2)).join(',')).sort().join('|')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const theta = Math.atan2(-dz, dx);
        const plusZOut = -dz * nx + dx * nz > 0;
        const brick = exterior ? brickFor(len + THICK, LOW) : null;
        const outsideFace = brick ?? M.wall;
        // Box faces: +x, -x (the ends), +y (the top), -y, +z, -z (the two sides).
        const ends = brick ?? M.wall;
        const mats = [ends, ends, M.cream, M.wall, plusZOut ? outsideFace : M.wall, plusZOut ? M.wall : outsideFace];
        const mesh = new THREE.Mesh(wallBox, mats);
        mesh.rotation.y = theta;
        mesh.position.set(mid[0], rel, mid[1]);
        mesh.scale.set(len + THICK, LOW, 1);
        mesh.add(new THREE.LineSegments(wallEdges, M.edge));
        group.add(mesh);
        walls.push({ mesh, floor: f.id, map: brick?.map ?? undefined });
        if (exterior && len >= 2.4 && !r.stairs) addWindow(f.id, mid, theta, nx, nz, len, rel);
      }
      addQuoins(f.id, r, indoor, rel, fullFor(f));
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
    // The stairs up from this floor.
    const run = runs.get(f.id);
    if (run) {
      const steps = 16;
      const inst = new THREE.InstancedMesh(unitBox, M.step, steps);
      const w = (run.x1 - run.x0) / steps;
      const m4 = new THREE.Matrix4();
      for (let s = 0; s < steps; s++) {
        const h = (run.rise * (s + 1)) / steps;
        const x = run.east ? run.x0 + w * (s + 0.5) : run.x1 - w * (s + 0.5);
        m4.compose(new THREE.Vector3(x, 0, (run.z0 + run.z1) / 2), new THREE.Quaternion(), new THREE.Vector3(w, h, run.z1 - run.z0));
        inst.setMatrixAt(s, m4);
      }
      group.add(inst);
    }
  });

  // A balcony edge, as in the porch photo: a brick parapet over the slab edge,
  // white bottle balusters on it, and a cream rail on top.
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
    const posts = new THREE.InstancedMesh(postGeo, M.wall, count);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      m4.makeTranslation(a[0] + dx * t, y + 0.25, a[1] + dz * t);
      posts.setMatrixAt(i, m4);
    }
    group.add(posts);
  }

  // A window with a white frame and a cross bar, on the outside face of a wall.
  function addWindow(floor: string, mid: Pt, theta: number, nx: number, nz: number, len: number, rel: number) {
    const w = Math.min(1.8, len * 0.45), h = 1.4, sill = 0.9;
    const win = new THREE.Group();
    win.position.set(mid[0] + nx * (THICK / 2 + 0.02), rel + sill + h / 2, mid[1] + nz * (THICK / 2 + 0.02));
    win.rotation.y = theta;
    const box = (mat: THREE.Material, sx: number, sy: number, sz: number, py = 0, px = 0) => {
      const m = new THREE.Mesh(unitBox, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(px, py - sy / 2, 0);
      win.add(m);
    };
    box(M.cream, w + 0.26, h + 0.26, 0.05);
    box(M.glass, w, h, 0.07);
    box(M.cream, 0.06, h, 0.09);
    box(M.cream, w, 0.06, 0.09, h * 0.18);
    facade.get(floor)!.windows.add(win);
  }

  // Corner stones (quoins) at the outside corners, alternating long and short.
  function addQuoins(floor: string, r: RoomM, indoor: RoomM[], rel: number, height: number) {
    if (r.points.length !== 4) return; // rectangles only; enough for a guide
    const [x, z, w, d] = r.rect;
    for (const [vx, vz, sx, sz] of [[x, z, -1, -1], [x + w, z, 1, -1], [x + w, z + d, 1, 1], [x, z + d, -1, 1]]) {
      const out: Pt = [vx + sx * 0.4, vz + sz * 0.4];
      const sideX: Pt = [vx + sx * 0.4, vz - sz * 0.4], sideZ: Pt = [vx - sx * 0.4, vz + sz * 0.4];
      const free = (p: Pt) => !indoor.some((o) => inside(p, o.points));
      if (!free(out) || !free(sideX) || !free(sideZ)) continue;
      const n = Math.floor(height / 0.3);
      const inst = new THREE.InstancedMesh(unitBox, M.stone, n);
      const m4 = new THREE.Matrix4();
      const edge = THICK / 2 + 0.03;
      for (let j = 0; j < n; j++) {
        const bx = j % 2 ? 0.55 : 0.32, bz = j % 2 ? 0.32 : 0.55;
        m4.compose(
          new THREE.Vector3(vx + sx * (edge - bx / 2), rel + j * 0.3, vz + sz * (edge - bz / 2)),
          new THREE.Quaternion(),
          new THREE.Vector3(bx, 0.27, bz),
        );
        inst.setMatrixAt(j, m4);
      }
      facade.get(floor)!.quoins.add(inst);
    }
  }

  // ---- Details from the elevation and the photo: columns and the east balcony's roof ----
  const col = (floor: string, x: number, z: number, y0: number, y1: number) => {
    const f = data.floors[floorIndex.get(floor)!];
    const m = new THREE.Mesh(colGeo, M.cream);
    m.scale.y = y1 - y0;
    m.position.set(x, y0 - f.level, z);
    parts.get(floor)!.group.add(m);
  };
  const f2Level = data.floors[1]?.level ?? 3.6;
  if (floorIndex.has('f1') && floorIndex.has('f2')) {
    for (const x of [4.95, 9.45]) {
      col('f1', x, 14.85, -0.28, f2Level); // the porch
      col('f2', x, 14.75, f2Level, EAVE); // the south balcony
    }
    for (const z of [5.3, 8.5]) {
      col('f1', 16.35, z, GROUND, f2Level);
      col('f2', 16.35, z, f2Level, EAVE); // the east balcony, as in the photo
    }
    const cap = new THREE.Mesh(unitBox, M.cream);
    cap.scale.set(2.9, 0.22, 4.1);
    cap.position.set(15.45, EAVE - f2Level, 6.9);
    parts.get('f2')!.group.add(cap);
  }

  // ---- The roof: two gables facing east and one facing south (after the elevation and the photo) ----
  {
    const g = parts.get(roofFloor.id)!.group;
    const base = EAVE - roofFloor.level;
    const top = 0; // the roof level (11.160)
    gable(g, -0.3, 8.1, 2.4, 6.0, 'x', base, top - 1.0);
    gable(g, -0.3, 14.4, 5.6, 11.5, 'x', base, top);
    gable(g, 3.4, 11.0, 7.8, 11.8, 'z', base, top - 0.8);
    const roof = data.rooms.find((r) => r.floor === roofFloor.id);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && roof) {
        o.userData = { slug: roof.slug, base: C.roof, roof: true };
        slabs.push(o as THREE.Mesh);
      }
    });
  }

  /** A pitched roof over [x0..x1] × [z0..z1], ridge along `axis`, gable ends brick. */
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
      const mesh = new THREE.Mesh(geo, mat);
      g.add(mesh);
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.line));
    };
    mk(planes.flatMap(quad), M.roof);
    mk(ends.flatMap((t) => t.flat()), M.gable);
    // Cream boards along the eaves and up the gables, as in the photos.
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

  // ---- State ----
  let selected = roofFloor.id; // the roof button shows the whole house
  let lifted = false;
  let mode: 'outside' | 'inside' = 'outside';
  let current: RoomM | null = null;
  let hovered: string | null = null;

  // Tweens, stepped in the render loop.
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

  const floorY = (f: FloorM) => f.level + (lifted && mode === 'outside' ? LIFT * floorIndex.get(f.id)! : 0);

  function applyFloors(ms = 450) {
    const si = floorIndex.get(selected)!;
    const ci = current && mode === 'inside' ? floorIndex.get(current.floor)! : si;
    const whole = mode === 'outside' && selected === roofFloor.id;
    data.floors.forEach((f, i) => {
      const p = parts.get(f.id)!;
      const shown = mode === 'inside' ? i <= ci && f !== roofFloor : i <= si;
      p.group.visible = shown;
      for (const l of p.labels) l.visible = shown && mode === 'outside' && !whole && i === si;
      const fromY = p.group.position.y, toY = floorY(f);
      tween(ms, (e) => (p.group.position.y = fromY + (toY - fromY) * e));
    });
    for (const w of walls) {
      const f = data.floors[floorIndex.get(w.floor)!];
      const i = floorIndex.get(f.id)!;
      let h = fullFor(f);
      if (whole && f === topRoomFloor) h = EAVE - f.level; // under the roof
      else if (mode === 'outside' && !whole && i === si) h = LOW;
      const from = w.mesh.scale.y;
      tween(ms, (e) => {
        w.mesh.scale.y = from + (h - from) * e;
        if (w.map) w.map.repeat.y = w.mesh.scale.y / 0.6;
      });
    }
    data.floors.forEach((f, i) => {
      const fc = facade.get(f.id)!;
      const full = whole ? f !== topRoomFloor : mode === 'inside' ? true : i < si;
      fc.windows.visible = full;
      fc.quoins.visible = full && !(mode === 'inside' && i === ci);
    });
    root!.querySelectorAll<HTMLButtonElement>('[data-floor-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.floorBtn === selected)));
  }

  function paint() {
    for (const s of slabs) {
      const slug = s.userData.slug as string;
      const mat = s.material as THREE.MeshLambertMaterial;
      if (s.userData.roof) continue;
      const here = slug === current?.slug && mode === 'outside';
      mat.color.setHex(here ? C.here : slug === hovered ? C.hover : s.userData.base);
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
  const roomCentre = (r: RoomM, y = 0.6) => {
    const [x, z] = centroid(r);
    const f = data.floors[floorIndex.get(r.floor)!];
    return new THREE.Vector3(x, floorY(f) + (r.level - f.level) + y, z);
  };

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
    card.querySelector<HTMLElement>('.h3d-in')!.hidden = r.locked || f === roofFloor || mode === 'inside';
    // Inside, every way out is also listed here: the ones behind you aren't drawn until you turn.
    const list = card.querySelector<HTMLElement>('.h3d-card-exits')!;
    list.hidden = mode !== 'inside';
    list.innerHTML = '';
    if (mode === 'inside') {
      for (const ex of r.exits) {
        const to = roomBySlug.get(ex.to);
        if (!to) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = exitText(ex, to);
        b.addEventListener('click', () => walkTo(to));
        list.append(b);
      }
    }
    card.hidden = false;
  }

  function exitText(ex: Exit, to: RoomM) {
    if (ex.dir === 'up' || ex.dir === 'down') {
      return `${ex.dir === 'up' ? '▲' : '▼'} ${bi({ en: `${ex.dir === 'up' ? 'Up' : 'Down'} to the ${ex.floorName!.toLowerCase()}`, zh: `${ex.dir === 'up' ? '上楼' : '下楼'}到${ex.floorZh}` })}`;
    }
    const t = to.contents ? { en: `${to.en}: ${to.title}`, zh: `${to.zh}：${to.titleZh}` } : { en: to.en, zh: to.zh };
    return `→ ${bi(t)} <small>${bi({ en: DIR_EN[ex.dir], zh: DIR_ZH[ex.dir] })}</small>`;
  }

  function setUrl() {
    const q = current ? `?room=${current.slug}` : '';
    history.replaceState(history.state, '', `/house/3d${q}`);
  }

  function select(r: RoomM, fly = true) {
    current = r;
    if (r.locked) toast(pickText(data.text.noDoor));
    selected = r.floor;
    applyFloors();
    paint();
    showCard(r);
    setUrl();
    if (!fly) return;
    // Keep the angle you're looking from; come close enough to see the room and its neighbours.
    const target = roomCentre(r, 0);
    if (floorOf(r) !== roofFloor) target.y = floorY(floorOf(r)) + (r.level - floorOf(r).level);
    const size = Math.max(r.rect[2], r.rect[3]);
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (dir.y < 0.45) dir.y = 0.45;
    dir.normalize();
    // Portrait screens need to stand further back to fit the same width.
    const narrow = camera.aspect < 1 ? 1 / Math.sqrt(camera.aspect) : 1;
    const dist = (floorOf(r) === roofFloor ? 34 : Math.max(9, size * 2.6)) * narrow;
    flyTo(target.clone().add(dir.multiplyScalar(dist)), target);
  }

  function deselect() {
    current = null;
    card.hidden = true;
    paint();
    setUrl();
  }

  // ---- Step inside ----
  const exitLabels: CSS2DObject[] = [];
  const help = { outside: root.querySelector<HTMLElement>('[data-help-outside]')!, inside: root.querySelector<HTMLElement>('[data-help-inside]')! };
  const outBtn = root.querySelector<HTMLButtonElement>('.h3d-out')!;

  function clearExits() {
    for (const l of exitLabels) {
      l.removeFromParent();
      l.element.remove();
    }
    exitLabels.length = 0;
  }

  function showExits(r: RoomM) {
    clearExits();
    const f = floorOf(r);
    for (const ex of r.exits) {
      const to = roomBySlug.get(ex.to);
      if (!to) continue;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'h3d-exit';
      let pos: THREE.Vector3;
      if (ex.dir === 'up' || ex.dir === 'down') {
        const box = f.stairs?.box ?? r.rect;
        pos = new THREE.Vector3(box[0] + box[2] / 2, f.level + (ex.dir === 'up' ? EYE + 0.3 : 0.5), box[1] + box[3] / 2);
        el.innerHTML = exitText(ex, to);
      } else {
        pos = new THREE.Vector3(ex.at![0], f.level + (r.level - f.level) + EYE - 0.2, ex.at![1]);
        el.innerHTML = exitText(ex, to);
      }
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        walkTo(to);
      });
      const label = new CSS2DObject(el);
      label.position.copy(pos);
      scene.add(label);
      exitLabels.push(label);
    }
  }

  function eyeOf(r: RoomM) {
    const [x, z] = centroid(r);
    const f = floorOf(r);
    return new THREE.Vector3(x, f.level + (r.level - f.level) + EYE, z);
  }

  function setFov(fov: number) {
    const from = camera.fov;
    tween(500, (e) => {
      camera.fov = from + (fov - from) * e;
      camera.updateProjectionMatrix();
    });
  }

  function enterLook(eye: THREE.Vector3, dir: THREE.Vector3, ms: number, done?: () => void) {
    const d = dir.clone().setY(0);
    if (d.lengthSq() < 1e-6) d.set(0, 0, -1);
    d.normalize();
    // Orbit around a point just ahead of the eye: dragging turns your head.
    const target = eye.clone().add(d.clone().multiplyScalar(0.1));
    controls.minDistance = 0;
    controls.maxDistance = Infinity;
    flyTo(eye, target, ms, () => {
      controls.minDistance = controls.maxDistance = 0.1;
      done?.();
    });
  }

  function stepInside(r: RoomM) {
    if (r.locked || floorOf(r) === roofFloor) return;
    mode = 'inside';
    current = r;
    applyFloors(300);
    paint();
    showCard(r);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI * 0.3;
    controls.maxPolarAngle = Math.PI * 0.7;
    controls.rotateSpeed = -0.35;
    const eye = eyeOf(r);
    const first = r.exits.find((e) => e.at);
    const look = first ? new THREE.Vector3(first.at![0], eye.y, first.at![1]).sub(eye) : new THREE.Vector3(0, 0, -1);
    setFov(68);
    help.outside.hidden = true;
    help.inside.hidden = false;
    outBtn.hidden = false;
    root!.classList.add('inside');
    enterLook(eye, look, 900, () => showExits(r));
    setUrl();
  }

  function walkTo(to: RoomM) {
    if (to.locked) return toast(pickText(data.text.noDoor));
    const from = current!;
    current = to;
    clearExits();
    const eye = eyeOf(to);
    const dir = eye.clone().sub(camera.position);
    applyFloors(250);
    paint();
    showCard(to);
    setUrl();
    enterLook(eye, dir.lengthSq() > 0.01 ? dir : new THREE.Vector3(0, 0, -1), from.floor === to.floor ? 650 : 1100, () => showExits(to));
  }

  function stepOutside() {
    if (mode !== 'inside') return;
    mode = 'outside';
    clearExits();
    outsideLimits();
    setFov(40);
    help.outside.hidden = false;
    help.inside.hidden = true;
    outBtn.hidden = true;
    root!.classList.remove('inside');
    const r = current;
    if (r) select(r);
    else applyFloors();
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
  const pickText = (b: Bi) => (document.documentElement.dataset.lang === 'zh' ? b.zh : b.en);

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
    if (down || mode === 'inside') return;
    const r = pick(e);
    const slug = r?.slug ?? null;
    if (slug !== hovered) {
      hovered = slug;
      el.style.cursor = slug ? 'pointer' : '';
      paint();
    }
  }, { signal });
  el.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || mode === 'inside') return;
    const r = pick(e);
    if (r) select(r);
    else deselect();
  }, { signal });
  el.addEventListener('pointerleave', () => {
    if (hovered) { hovered = null; paint(); }
  }, { signal });

  // ---- Controls ----
  root.querySelectorAll<HTMLButtonElement>('[data-floor-btn]').forEach((b) =>
    b.addEventListener('click', () => {
      if (mode === 'inside') stepOutside();
      selected = b.dataset.floorBtn!;
      if (current && current.floor !== selected) deselect();
      applyFloors();
      if (selected === roofFloor.id) flyTo(home.pos, home.target);
    }, { signal }),
  );
  root.querySelector<HTMLInputElement>('[data-lift]')!.addEventListener('change', (e) => {
    lifted = (e.target as HTMLInputElement).checked;
    applyFloors(600);
  }, { signal });
  card.querySelector('.h3d-in')!.addEventListener('click', () => current && stepInside(current), { signal });
  card.querySelector('.h3d-card-close')!.addEventListener('click', () => (mode === 'inside' ? stepOutside() : deselect()), { signal });
  outBtn.addEventListener('click', stepOutside, { signal });
  const floorKeys = new Map(data.floors.map((f) => [f.label.toUpperCase(), f.id]));
  document.addEventListener('keydown', (e) => {
    if ((e.target as Element).closest?.('input, textarea')) return;
    if (e.key === 'Escape') return mode === 'inside' ? stepOutside() : deselect();
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

  active = {
    root,
    dispose() {
      cancelAnimationFrame(frame);
      ro.disconnect();
      off.abort();
      clearTimeout(toastTimer);
      clearExits();
      controls.dispose();
      const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) geos.add(m.geometry);
        if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x));
      });
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => (m as THREE.MeshLambertMaterial).map?.dispose());
      brickTex.dispose();
      mats.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
    },
  };
}
