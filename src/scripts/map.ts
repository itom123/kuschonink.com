// The house map: pan, zoom, floors, search, URL state. Plain DOM, no framework.
// Works like an indoor map: the viewport shows one floor at a time, rooms are links.
import { getLang, pick } from './lang';

type View = { cx: number; cy: number; z: number };
type Bounds = { x: number; y: number; w: number; h: number };
interface IndexRoom { slug: string; floor: string; title: string; titleZh: string; zh: string; en: string; chapter: number; locked: boolean }

const MIN_Z = 0.6;
const MAX_Z = 12;

export function initMap() {
  const root = document.getElementById('house-map');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '1';

  const viewport = root.querySelector<HTMLElement>('.map-viewport')!;
  const svgs = [...root.querySelectorAll<SVGSVGElement>('svg.floor')];
  const index = JSON.parse(document.getElementById('house-index')!.textContent!) as {
    rooms: IndexRoom[];
    floors: { id: string; name: string; zh: string; zhShort: string; level: string }[];
    text: { none: { en: string; zh: string }; noDoor: { en: string; zh: string } };
  };
  const floorName = root.querySelector<HTMLElement>('.map-floorname')!;
  const showFloorName = () => {
    const info = index.floors.find((x) => x.id === floor)!;
    floorName.textContent = `${getLang() === 'zh' ? info.zh : info.name} · ${info.level}`;
  };

  const bounds = new Map<string, Bounds>(
    svgs.map((s) => {
      const [x, y, w, h] = s.dataset.bounds!.split(' ').map(Number);
      return [s.dataset.floor!, { x, y, w, h }];
    }),
  );

  let floor = root.dataset.floor || 'f1';
  const views = new Map<string, View>();
  const home = (f: string): View => {
    const b = bounds.get(f)!;
    return { cx: b.x + b.w / 2, cy: b.y + b.h / 2, z: 1 };
  };
  let view: View = home(floor);

  const svgOf = (f: string) => svgs.find((s) => s.dataset.floor === f)!;

  // Pixels per millimetre at zoom 1 (floor fits the viewport).
  const baseScale = () => {
    const b = bounds.get(floor)!;
    return Math.min(viewport.clientWidth / b.w, viewport.clientHeight / b.h);
  };
  const scale = () => baseScale() * view.z;

  function render() {
    const s = scale();
    const w = viewport.clientWidth / s;
    const h = viewport.clientHeight / s;
    const svg = svgOf(floor);
    svg.setAttribute('viewBox', `${view.cx - w / 2} ${view.cy - h / 2} ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    // Keep labels a constant size on screen: 1 screen px in mm.
    svg.style.setProperty('--px', String(1 / s));
    const level = view.z < 1.8 ? 1 : view.z < 3.5 ? 2 : 3;
    if (root!.dataset.zoomLevel !== String(level)) {
      root!.dataset.zoomLevel = String(level);
      if (level >= 2) loadThumbs(svg);
    }
    scheduleUrl();
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
      view = to;
      render();
      return;
    }
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
      render();
      if (k < 1) anim = requestAnimationFrame(step);
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

  function setFloor(f: string, v?: View) {
    if (!bounds.has(f)) return;
    views.set(floor, view);
    const prev = svgOf(floor);
    floor = f;
    root!.dataset.floor = f;
    svgs.forEach((s) => s.toggleAttribute('hidden', s.dataset.floor !== f));
    const next = svgOf(f);
    if (prev !== next) {
      next.classList.remove('floor-enter');
      void next.getBoundingClientRect();
      next.classList.add('floor-enter');
    }
    root!.querySelectorAll<HTMLButtonElement>('[data-floor-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.floorBtn === f)));
    showFloorName();
    view = clampView(v ?? views.get(f) ?? { ...view, ...{ cx: home(f).cx, cy: home(f).cy } });
    root!.dataset.zoomLevel = '';
    render();
  }

  // Fit a room in view, leaving room for the side panel on wide screens.
  function roomView(slug: string): { floor: string; view: View } | null {
    const el = root!.querySelector<SVGGraphicsElement>(`.room[data-slug="${slug}"]`);
    if (!el) return null;
    const f = (el.closest('svg') as SVGSVGElement).dataset.floor!;
    const box = el.getBBox();
    const b = bounds.get(f)!;
    const panel = window.innerWidth > 800 ? Math.min(560, window.innerWidth * 0.45) : 0;
    const availW = viewport.clientWidth - panel;
    const availH = window.innerWidth > 800 ? viewport.clientHeight : viewport.clientHeight * 0.45;
    const base = Math.min(viewport.clientWidth / b.w, viewport.clientHeight / b.h);
    // Close enough to see the room, far enough to keep its neighbours in view.
    const z = Math.min(3, Math.max(1, Math.min(availW / (box.width * 2.2), availH / (box.height * 2.2)) / base));
    const s = base * z;
    // Shift the centre so the room sits in the free area (left of the panel / above the sheet).
    const dx = panel / 2 / s;
    const dy = window.innerWidth > 800 ? 0 : (viewport.clientHeight * 0.275) / s;
    return { floor: f, view: { z, cx: box.x + box.width / 2 + dx, cy: box.y + box.height / 2 + dy } };
  }

  function focusRoom(slug: string, animate = true) {
    root!.querySelectorAll('.room.current').forEach((r) => r.classList.remove('current'));
    root!.querySelector(`.room[data-slug="${slug}"]`)?.classList.add('current');
    const target = roomView(slug);
    if (!target) return;
    if (target.floor !== floor) setFloor(target.floor, { ...view, z: Math.max(1, view.z * 0.8) });
    flyTo(target.view, animate ? 550 : 0);
  }

  // ---- URL state (only on /house itself) ----
  let urlTimer = 0;
  function scheduleUrl() {
    if (!/^\/house\/?$/.test(location.pathname)) return;
    clearTimeout(urlTimer);
    urlTimer = window.setTimeout(() => {
      const q = new URLSearchParams({ floor, x: String(Math.round(view.cx)), y: String(Math.round(view.cy)), z: view.z.toFixed(2) });
      history.replaceState(history.state, '', `/house?${q}`);
    }, 250);
  }

  // ---- Pointer: drag to pan, pinch to zoom ----
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let pinchDist = 0;
  viewport.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('.map-ui')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    cancelAnimationFrame(anim);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  viewport.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
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
  });
  const end = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (!pointers.size) viewport.classList.remove('dragging');
  };
  viewport.addEventListener('pointerup', end);
  viewport.addEventListener('pointercancel', end);
  // A drag is not a click.
  viewport.addEventListener('click', (e) => {
    if (moved > 4) {
      e.preventDefault();
      e.stopPropagation();
      moved = 0;
      return;
    }
    const locked = (e.target as Element).closest('.room.locked');
    if (locked) toast(pick(index.text.noDoor));
  }, true);

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.001));
    zoomAt(factor, e.clientX, e.clientY);
  }, { passive: false });

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
      const order = index.floors.map((f) => f.id);
      const i = order.indexOf(floor) + (k === 'PageUp' ? 1 : -1);
      if (order[i]) setFloor(order[i]);
    } else return;
    e.preventDefault();
    view = clampView(view);
    render();
  });

  root.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach((b) =>
    b.addEventListener('click', () => {
      const r = viewport.getBoundingClientRect();
      const f = b.dataset.zoom === 'in' ? 1.6 : 1 / 1.6;
      flyTo({ ...view, z: view.z * f }, 250);
      void r;
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-floor-btn]').forEach((b) => b.addEventListener('click', () => setFloor(b.dataset.floorBtn!)));
  root.querySelector<HTMLInputElement>('[data-blueprint]')!.addEventListener('change', (e) => {
    root!.classList.toggle('blueprint', (e.target as HTMLInputElement).checked);
  });

  // ---- Search ----
  const input = root.querySelector<HTMLInputElement>('.map-search input')!;
  const results = root.querySelector<HTMLUListElement>('.search-results')!;
  const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const floorLabel = (id: string) => { const f = index.floors.find((f) => f.id === id)!; return getLang() === 'zh' ? f.zhShort : f.name; };
  function showResults() {
    const q = norm(input.value.trim());
    if (!q) { results.hidden = true; results.innerHTML = ''; return; }
    const hits = index.rooms.filter((r) => [r.title, r.titleZh, r.en, r.zh, String(r.chapter)].some((t) => norm(t).includes(q))).slice(0, 8);
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
  input.addEventListener('input', showResults);
  document.addEventListener('langchange', () => { showFloorName(); showResults(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const a = results.querySelector<HTMLAnchorElement>('a');
      if (a) { e.preventDefault(); a.click(); }
    }
    if (e.key === 'Escape') { input.value = ''; showResults(); }
  });
  results.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a');
    if (!a) return;
    if (a.hasAttribute('data-locked')) { e.preventDefault(); focusRoom(a.dataset.slug!); toast(pick(index.text.noDoor)); }
    input.value = '';
    showResults();
  });

  // ---- Toast ----
  let toastEl: HTMLElement | null = null;
  function toast(msg: string) {
    toastEl ??= Object.assign(document.createElement('div'), { className: 'map-toast', role: 'status' });
    root!.appendChild(toastEl);
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl?.classList.remove('show'), 2200);
  }

  // ---- Start ----
  const params = new URLSearchParams(location.search);
  const startFloor = params.get('floor');
  if (startFloor && bounds.has(startFloor)) floor = startFloor;
  const start: View = {
    cx: Number(params.get('x')) || home(floor).cx,
    cy: Number(params.get('y')) || home(floor).cy,
    z: Number(params.get('z')) || 1,
  };
  setFloor(floor, start);
  window.addEventListener('resize', () => render());

  // After every page (initial and ClientRouter navigations), follow the current room.
  const sync = () => {
    const page = document.querySelector<HTMLElement>('[data-room-page]');
    root!.classList.toggle('has-panel', !!page || !!document.querySelector('[data-panel]'));
    if (page) focusRoom(page.dataset.roomPage!, !!root!.dataset.synced);
    else root!.querySelectorAll('.room.current').forEach((r) => r.classList.remove('current'));
    root!.dataset.synced = '1';
  };
  document.addEventListener('astro:page-load', sync);
  if (document.readyState === 'complete') sync();
}

function escape(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
