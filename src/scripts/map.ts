// The house map: pan, zoom, floors, search, URL state. Plain DOM, no framework.
// Works like an indoor map: the viewport shows one floor at a time, rooms are links.
// It lives inside The House's window, so it measures the window, never the screen.
import { getLang, pick } from './lang';
import { searchRooms, type SearchRoom } from './search';
import { startMini, type MiniData } from './house-mini';
import { showDiag } from './gl-diag';

type View = { cx: number; cy: number; z: number };
type Bounds = { x: number; y: number; w: number; h: number };
type IndexRoom = SearchRoom;

const MIN_Z = 0.6;
const MAX_Z = 12;

// The map currently on the page. The House window keeps its map while it
// changes page; closing the window drops it, and opening the House again
// brings a fresh copy, so set up whichever map is present after every page.
let active: { root: HTMLElement; off: AbortController } | null = null;

export function startMap() {
  initMap();
  document.addEventListener('astro:page-load', () => initMap());
}

function initMap() {
  const root = document.getElementById('house-map');
  if (root && root === active?.root) return;
  active?.off.abort();
  active = null;
  if (!root) return;
  root.dataset.ready = '1';
  const off = new AbortController();
  const { signal } = off;
  const win = root.closest<HTMLElement>('[data-window]');
  win?.addEventListener('desktop:close', () => off.abort(), { once: true });
  /** This page's URL: the window's (on the desktop) or the browser's. */
  const pageUrl = () => new URL(win?.dataset.url ?? location.pathname + location.search, location.origin);
  /** Side panel on the right when the window is wide; a sheet at the bottom when narrow. */
  const wide = () => root.clientWidth > 800;

  const viewport = root.querySelector<HTMLElement>('.map-viewport')!;
  // The small turning house beside the floor buttons.
  const mini = startMini(
    root.querySelector<HTMLCanvasElement>('.map-mini')!,
    JSON.parse(root.querySelector('#house-mini')!.textContent!) as MiniData,
    signal,
  );
  showDiag(root, () => [...root.querySelectorAll<HTMLCanvasElement>('canvas')], signal);
  const svgs = [...root.querySelectorAll<SVGSVGElement>('svg.floor')];
  const index = JSON.parse(root.querySelector('#house-index')!.textContent!) as {
    rooms: IndexRoom[];
    floors: { id: string; name: string; zh: string; zhShort: string; level: string }[];
    text: { none: { en: string; zh: string }; noDoor: { en: string; zh: string } };
  };
  const floorName = root.querySelector<HTMLElement>('.map-floorname')!;
  // The arrow shows which way the last change of floor went, until the next one.
  let arrow = '';
  const showFloorName = () => {
    const info = index.floors.find((x) => x.id === floor)!;
    floorName.textContent = `${arrow}${getLang() === 'zh' ? info.zh : info.name} · ${info.level}`;
  };
  const order = index.floors.map((f) => f.id);

  const bounds = new Map<string, Bounds>(
    svgs.map((s) => {
      const [x, y, w, h] = s.dataset.bounds!.split(' ').map(Number);
      return [s.dataset.floor!, { x, y, w, h }];
    }),
  );

  // Every floor is drawn on the same grid, so one camera serves them all:
  // zoom 1 fits the whole house, and changing floors keeps the same spot in view.
  const all: Bounds = (() => {
    const bs = [...bounds.values()];
    const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
    return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
  })();

  let floor = root.dataset.floor || 'f1';
  const home = (): View => ({ cx: all.x + all.w / 2, cy: all.y + all.h / 2, z: 1 });
  let view: View = home();

  const svgOf = (f: string) => svgs.find((s) => s.dataset.floor === f)!;
  // The floor fading out after a change of floor, kept in step with the camera.
  let leaving: SVGSVGElement | null = null;
  let leaveTimer = 0;

  // Pixels per millimetre at zoom 1 (the house fits the viewport).
  const baseScale = () => Math.min(viewport.clientWidth / all.w, viewport.clientHeight / all.h);
  const scale = () => baseScale() * view.z;

  // ---- Drawing ----
  // A new viewBox makes the browser lay out and paint the whole floor again (Safari, and
  // so every browser on an iPhone, measures each label anew): far too slow for every move
  // of a finger. So while the map is dragged, pinched, flown or zoomed with the wheel, the
  // floor already drawn slides and scales as a picture (a transform on .map-pan, done by
  // the graphics chip), and it is drawn afresh when that ends, or sooner when the picture
  // no longer fills the window. It is drawn a quarter larger than the window on every
  // side, so a drag has something to show at the edges.
  const pan = root.querySelector<HTMLElement>('.map-pan')!;
  const OVER = 0.25;
  type Drawn = { cx: number; cy: number; s: number; w: number; h: number; ox: number; oy: number };
  let drawn: Drawn | null = null;
  let drawnAt = 0;
  let frame = 0;
  let flying = false;
  let wheeling = false;
  const pointers = new Map<number, { x: number; y: number }>();
  const live = () => pointers.size > 0 || flying || wheeling;
  const shown = () => (leaving ? [svgOf(floor), leaving] : [svgOf(floor)]);
  svgs.forEach((svg) => svg.setAttribute('preserveAspectRatio', 'none'));

  /** Show the view on the next frame (many moves in one frame make one picture). */
  function render() {
    if (!frame) frame = requestAnimationFrame(paint);
  }

  /** Show the view now: slide the picture during a gesture, draw it afresh otherwise. */
  function paint() {
    cancelAnimationFrame(frame);
    frame = 0;
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    if (!vw || !vh) return;
    const s = scale();
    if (!live() || !drawn || drawn.w !== vw || drawn.h !== vh) draw(s, vw, vh);
    else if (covers(drawn, s, vw, vh)) shift(drawn, s);
    else if (performance.now() - drawnAt > 120) draw(s, vw, vh);
    else {
      shift(drawn, s);
      render(); // and draw it afresh in a moment
    }
    mini.set({ view: visibleArea(s, vw / s, vh / s) });
    scheduleUrl();
  }

  function draw(s: number, vw: number, vh: number) {
    const ox = Math.round(vw * OVER), oy = Math.round(vh * OVER);
    if (drawn?.ox !== ox || drawn?.oy !== oy) {
      pan.style.setProperty('--ox', `${ox}px`);
      pan.style.setProperty('--oy', `${oy}px`);
    }
    const w = (vw + 2 * ox) / s, h = (vh + 2 * oy) / s;
    const box = `${view.cx - w / 2} ${view.cy - h / 2} ${w} ${h}`;
    // Keep labels a constant size on screen: 1 screen px in mm.
    const px = String(1 / s);
    for (const svg of shown()) {
      if (svg.getAttribute('viewBox') !== box) svg.setAttribute('viewBox', box);
      if (svg.style.getPropertyValue('--px') !== px) svg.style.setProperty('--px', px);
    }
    pan.style.transform = '';
    drawn = { cx: view.cx, cy: view.cy, s, w: vw, h: vh, ox, oy };
    drawnAt = performance.now();
    const level = view.z < 1.8 ? 1 : view.z < 3.5 ? 2 : 3;
    if (root!.dataset.zoomLevel !== String(level)) {
      root!.dataset.zoomLevel = String(level);
      if (level >= 2) loadThumbs(svgOf(floor));
    }
  }

  /** Move the picture drawn for view d to where the current view puts it. */
  function shift(d: Drawn, s: number) {
    pan.style.transform = `translate(${(d.cx - view.cx) * s}px, ${(d.cy - view.cy) * s}px) scale(${s / d.s})`;
  }

  /** Does the picture drawn for view d still fill the window (and look sharp enough)? */
  function covers(d: Drawn, s: number, vw: number, vh: number) {
    const k = s / d.s;
    // Flights zoom a long way for a moment: let them blur, and draw sharp at the end.
    if (!flying && (k > 1.75 || k < 0.6)) return false;
    const tx = Math.abs((d.cx - view.cx) * s), ty = Math.abs((d.cy - view.cy) * s);
    return tx + vw / 2 <= k * (vw / 2 + d.ox) && ty + vh / 2 <= k * (vh / 2 + d.oy);
  }

  /** The part of the plan that isn't under the room panel, in mm: [x, y, w, h]. */
  function visibleArea(s: number, w: number, h: number): [number, number, number, number] {
    let vw = w, vh = h;
    if (root!.classList.contains('has-panel')) {
      if (wide()) vw -= Math.min(560, root!.clientWidth * 0.45) / s;
      else vh -= (root!.clientHeight * 0.55) / s;
    }
    return [view.cx - w / 2, view.cy - h / 2, Math.max(0, vw), Math.max(0, vh)];
  }

  function loadThumbs(svg: SVGSVGElement) {
    svg.querySelectorAll<SVGImageElement>('.thumbs image[data-href]').forEach((im) => {
      im.setAttribute('href', im.dataset.href!);
      im.removeAttribute('data-href');
    });
  }

  function clampView(v: View): View {
    const b = bounds.get(floor)!;
    const z = Math.min(MAX_Z, Math.max(MIN_Z, v.z));
    return { z, cx: Math.min(b.x + b.w, Math.max(b.x, v.cx)), cy: Math.min(b.y + b.h, Math.max(b.y, v.cy)) };
  }

  let anim = 0;
  function flyTo(target: View, ms = 450) {
    cancelAnimationFrame(anim);
    const from = { ...view };
    const to = clampView(target);
    if (ms === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      flying = false;
      view = to;
      paint();
      return;
    }
    flying = true;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      // Interpolate zoom geometrically so it feels even.
      view = {
        cx: from.cx + (to.cx - from.cx) * e,
        cy: from.cy + (to.cy - from.cy) * e,
        z: from.z * Math.pow(to.z / from.z, e),
      };
      if (k < 1) anim = requestAnimationFrame(step);
      else flying = false;
      paint();
    };
    anim = requestAnimationFrame(step);
  }

  // Screen point -> millimetres.
  function toMm(px: number, py: number) {
    const r = viewport.getBoundingClientRect();
    const s = scale();
    return { x: view.cx + (px - r.left - r.width / 2) / s, y: view.cy + (py - r.top - r.height / 2) / s };
  }

  function zoomAt(factor: number, px?: number, py?: number) {
    const r = viewport.getBoundingClientRect();
    px ??= r.left + r.width / 2;
    py ??= r.top + r.height / 2;
    const before = toMm(px, py);
    const z = Math.min(MAX_Z, Math.max(MIN_Z, view.z * factor));
    const s = baseScale() * z;
    view = clampView({
      z,
      cx: before.x - (px - r.left - r.width / 2) / s,
      cy: before.y - (py - r.top - r.height / 2) / s,
    });
    render();
  }

  function endLeave() {
    clearTimeout(leaveTimer);
    if (!leaving) return;
    leaving.classList.remove('floor-leave');
    if (leaving.dataset.floor !== floor) leaving.setAttribute('hidden', '');
    leaving = null;
  }

  function setFloor(f: string, v?: View) {
    if (!bounds.has(f)) return;
    endLeave();
    const prev = svgOf(floor);
    const dir = order.indexOf(f) > order.indexOf(floor) ? 'up' : 'down';
    floor = f;
    root!.dataset.floor = f;
    const next = svgOf(f);
    svgs.forEach((s) => s.toggleAttribute('hidden', s !== next));
    if (prev !== next) {
      arrow = dir === 'up' ? '↑ ' : '↓ ';
      root!.dataset.dir = dir;
      next.classList.remove('floor-enter');
      void next.getBoundingClientRect();
      next.classList.add('floor-enter');
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        // Let the old floor fade away under the new one, on the same grid.
        leaving = prev;
        prev.removeAttribute('hidden');
        prev.classList.add('floor-leave');
        leaveTimer = window.setTimeout(endLeave, 400);
      }
    }
    root!.querySelectorAll<HTMLButtonElement>('[data-floor-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.floorBtn === f)));
    mini.set({ floor: f });
    showFloorName();
    view = clampView(v ?? view);
    root!.dataset.zoomLevel = '';
    drawn = null;
    paint();
  }

  // Fit a room in view, leaving room for the side panel on wide screens.
  function roomView(slug: string): { floor: string; view: View } | null {
    const el = root!.querySelector<SVGGraphicsElement>(`.room[data-slug="${slug}"]`);
    if (!el) return null;
    const f = (el.closest('svg') as SVGSVGElement).dataset.floor!;
    const box = el.getBBox();
    const b = all;
    const panel = wide() ? Math.min(560, root!.clientWidth * 0.45) : 0;
    const availW = viewport.clientWidth - panel;
    const availH = wide() ? viewport.clientHeight : viewport.clientHeight * 0.45;
    const base = Math.min(viewport.clientWidth / b.w, viewport.clientHeight / b.h);
    // Close enough to see the room, far enough to keep its neighbours in view.
    const z = Math.min(3, Math.max(1, Math.min(availW / (box.width * 2.2), availH / (box.height * 2.2)) / base));
    const s = base * z;
    // Shift the centre so the room sits in the free area (left of the panel / above the sheet).
    const dx = panel / 2 / s;
    const dy = wide() ? 0 : (viewport.clientHeight * 0.275) / s;
    return { floor: f, view: { z, cx: box.x + box.width / 2 + dx, cy: box.y + box.height / 2 + dy } };
  }

  function focusRoom(slug: string, animate = true) {
    root!.querySelectorAll('.room.current').forEach((r) => r.classList.remove('current'));
    mini.set({ room: slug });
    root!.querySelector(`.room[data-slug="${slug}"]`)?.classList.add('current');
    const el = root!.querySelector(`.room[data-slug="${slug}"]`);
    if (!el) return;
    // Show the room's floor before measuring it: a hidden SVG has no geometry.
    const f = (el.closest('svg') as SVGSVGElement).dataset.floor!;
    if (f !== floor) setFloor(f, { ...view, z: Math.max(1, view.z * 0.8) });
    const target = roomView(slug);
    if (!target) return;
    flyTo(target.view, animate ? 550 : 0);
  }

  // ---- URL state (only on /house itself) ----
  let urlTimer = 0;
  function scheduleUrl() {
    if (!/^\/house\/?$/.test(pageUrl().pathname)) return;
    clearTimeout(urlTimer);
    urlTimer = window.setTimeout(() => {
      if (!root!.isConnected || !/^\/house\/?$/.test(pageUrl().pathname)) return;
      const q = new URLSearchParams({ floor, x: String(Math.round(view.cx)), y: String(Math.round(view.cy)), z: view.z.toFixed(2) });
      const url = `/house?${q}`;
      if (window.kus98 && win) window.kus98.replaceUrl(root!, url);
      else {
        try { history.replaceState(history.state, '', url); } catch { /* Safari limits replaceState */ }
      }
    }, 400);
  }

  // ---- Pointer: drag to pan, pinch to zoom ----
  let moved = 0;
  let pinchDist = 0;
  const forget = (id: number) => {
    if (!pointers.delete(id)) return;
    if (pointers.size < 2) pinchDist = 0;
    if (!pointers.size) {
      viewport.classList.remove('dragging');
      render(); // draw the floor afresh where the gesture left it
    }
  };
  viewport.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('.map-ui')) return;
    // Only the main button pans (a right-click opens a menu instead).
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    cancelAnimationFrame(anim);
    flying = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }, { signal });
  viewport.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) return forget(e.pointerId);
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (pointers.size === 1) {
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) {
        viewport.setPointerCapture(e.pointerId);
        viewport.classList.add('dragging');
      }
      const s = scale();
      view = clampView({ ...view, cx: view.cx - dx / s, cy: view.cy - dy / s });
      render();
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) zoomAt(d / pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchDist = d;
      moved = 99;
    }
  }, { signal });
  const end = (e: PointerEvent) => forget(e.pointerId);
  viewport.addEventListener('pointerup', end, { signal });
  viewport.addEventListener('pointercancel', end, { signal });
  // On a touch screen the finger starts out captured by whatever it touched (a room, a line);
  // that element's lostpointercapture bubbles up here when the map takes the finger over,
  // and must not end the drag. Only the map's own loss counts.
  viewport.addEventListener('lostpointercapture', (e) => { if (e.target === viewport) end(e); }, { signal });
  viewport.addEventListener('pointerleave', (e) => { if (!e.buttons) forget(e.pointerId); }, { signal });
  // A drag is not a click.
  viewport.addEventListener('click', (e) => {
    if (moved > 4) {
      e.preventDefault();
      e.stopPropagation();
      moved = 0;
      return;
    }
    const locked = (e.target as Element).closest('.room.locked');
    if (locked) noDoor();
  }, { capture: true, signal });

  let wheelTimer = 0;
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    wheeling = true;
    clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => {
      wheeling = false;
      render();
    }, 150);
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.001));
    zoomAt(factor, e.clientX, e.clientY);
  }, { passive: false, signal });

  // R / A / 2 / 1: the labels on the floor buttons.
  const floorKeys = new Map(
    [...root.querySelectorAll<HTMLButtonElement>('[data-floor-btn]')].map((b) => [b.textContent!.trim().toUpperCase(), b.dataset.floorBtn!]),
  );
  viewport.addEventListener('keydown', (e) => {
    const step = 120 / scale();
    const k = e.key;
    if (k === 'ArrowLeft') view.cx -= step;
    else if (k === 'ArrowRight') view.cx += step;
    else if (k === 'ArrowUp') view.cy -= step;
    else if (k === 'ArrowDown') view.cy += step;
    else if (k === '+' || k === '=') return zoomAt(1.4);
    else if (k === '-') return zoomAt(1 / 1.4);
    else if (k === 'PageUp' || k === 'PageDown') {
      const i = order.indexOf(floor) + (k === 'PageUp' ? 1 : -1);
      if (order[i]) setFloor(order[i]);
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey && floorKeys.has(k.toUpperCase())) {
      setFloor(floorKeys.get(k.toUpperCase())!);
    } else return;
    e.preventDefault();
    view = clampView(view);
    render();
  }, { signal });

  root.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach((b) =>
    b.addEventListener('click', () => {
      const f = b.dataset.zoom === 'in' ? 1.6 : 1 / 1.6;
      flyTo({ ...view, z: view.z * f }, 250);
    }, { signal }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-floor-btn]').forEach((b) => b.addEventListener('click', () => setFloor(b.dataset.floorBtn!), { signal }));
  root.querySelector<HTMLInputElement>('[data-blueprint]')!.addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    // The scans are large pictures: fetch them only when someone wants to see them.
    if (on) root!.querySelectorAll<SVGImageElement>('image.scan[data-href]').forEach((im) => {
      im.setAttribute('href', im.dataset.href!);
      im.removeAttribute('data-href');
    });
    root!.classList.toggle('blueprint', on);
  }, { signal });

  // ---- Search ----
  const input = root.querySelector<HTMLInputElement>('.map-search input')!;
  const results = root.querySelector<HTMLUListElement>('.search-results')!;
  const floorLabel = (id: string) => { const f = index.floors.find((f) => f.id === id)!; return getLang() === 'zh' ? f.zhShort : f.name; };
  function showResults() {
    if (!input.value.trim()) { results.hidden = true; results.innerHTML = ''; return; }
    const hits = searchRooms(index.rooms, input.value);
    results.innerHTML = hits.length
      ? hits.map((r) => {
          const zh = getLang() === 'zh';
          const n = r.locked ? '—' : r.chapter;
          const title = zh ? r.titleZh || r.title : r.title;
          const name = zh ? (r.zh === title ? '' : r.zh) : (r.en === title ? '' : r.en);
          const where = zh ? `${floorLabel(r.floor)} · 第${n}章` : `${floorLabel(r.floor)} · ch. ${n}`;
          return `<li><a href="/house/${r.slug}" data-slug="${r.slug}" ${r.locked ? 'data-locked' : ''}><b>${escape(title)}</b> <small>${escape(name)} · ${where}</small></a></li>`;
        }).join('')
      : `<li class="none">${escape(pick(index.text.none))}</li>`;
    results.hidden = false;
  }
  input.addEventListener('input', showResults, { signal });
  document.addEventListener('langchange', () => { showFloorName(); showResults(); }, { signal });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const a = results.querySelector<HTMLAnchorElement>('a');
      if (a) { e.preventDefault(); a.click(); }
    }
    if (e.key === 'Escape') { input.value = ''; showResults(); }
  }, { signal });
  results.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a');
    if (!a) return;
    if (a.hasAttribute('data-locked')) { e.preventDefault(); focusRoom(a.dataset.slug!); noDoor(); }
    input.value = '';
    showResults();
  }, { signal });

  // ---- The room without a door: "Access is denied" on the desktop ----
  function noDoor() {
    if (window.kus98) {
      window.kus98.alert({
        title: pick({ en: 'Room without a door', zh: '没有门的房间' }),
        icon: 'error',
        text: pick({ en: 'This room has no door. Access is denied.', zh: '这个房间没有门。拒绝访问。' }),
        owner: root,
      });
    } else toast(pick(index.text.noDoor));
  }

  // ---- Toast (when the map runs outside the desktop) ----
  let toastEl: HTMLElement | null = null;
  function toast(msg: string) {
    toastEl ??= Object.assign(document.createElement('div'), { className: 'map-toast', role: 'status' });
    root!.appendChild(toastEl);
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl?.classList.remove('show'), 2200);
  }

  // ---- Start ----
  const params = pageUrl().searchParams;
  const startFloor = params.get('floor');
  if (startFloor && bounds.has(startFloor)) floor = startFloor;
  const start: View = {
    cx: Number(params.get('x')) || home().cx,
    cy: Number(params.get('y')) || home().cy,
    z: Number(params.get('z')) || 1,
  };
  setFloor(floor, start);
  arrow = '';
  showFloorName();
  // The window can be any size: follow the map's own box, not the screen.
  const ro = new ResizeObserver(() => paint());
  ro.observe(viewport);
  signal.addEventListener('abort', () => {
    endLeave();
    cancelAnimationFrame(anim);
    cancelAnimationFrame(frame);
    ro.disconnect();
    clearTimeout(urlTimer);
    clearTimeout(wheelTimer);
  });

  // After every page shown in the window, follow the current room (or the floor in the URL).
  const sync = () => {
    if (!root!.isConnected) return;
    const scope: ParentNode = win ?? document;
    const page = scope.querySelector<HTMLElement>('[data-room-page]');
    root!.classList.toggle('has-panel', !!page || !!scope.querySelector('[data-panel]'));
    // The 3D link opens the model at the room you're in.
    const link3d = root!.querySelector<HTMLAnchorElement>('.map-3d');
    if (link3d) link3d.href = page ? `/house/3d?room=${encodeURIComponent(page.dataset.roomPage!)}` : '/house/3d';
    if (page) focusRoom(page.dataset.roomPage!, !!root!.dataset.synced);
    else {
      root!.querySelectorAll('.room.current').forEach((r) => r.classList.remove('current'));
      mini.set({ room: null });
      const f = pageUrl().searchParams.get('floor');
      if (root!.dataset.synced && f && f !== floor && bounds.has(f)) setFloor(f);
    }
    render();
    root!.dataset.synced = '1';
  };
  // On the desktop the window says when it shows a new page; on its own, the document does.
  if (win) win.addEventListener('desktop:content', sync, { signal });
  else document.addEventListener('astro:page-load', sync, { signal });
  sync();
  active = { root, off };
}

function escape(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
