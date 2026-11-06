// The screen savers of Xiangyin 98: the artist's photographs, Lines (two
// four-cornered shapes bouncing round the screen with their echoes), and a
// blank screen. With "reduce motion", photographs change without drifting and
// Lines stands still.
import { desktopData } from '../data';
import { h, html, reducedMotion } from '../util';

type Stop = () => void;

export const SAVERS: [string, { en: string; zh: string }][] = [
  ['', { en: '(None)', zh: '(无)' }],
  ['blank', { en: 'Blank Screen', zh: '空白屏幕' }],
  ['lines', { en: 'Lines', zh: '线条' }],
  ['slideshow', { en: 'Photographs', zh: '照片' }],
];

function shuffle<T>(a: T[]) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** Photographs from the projects, one after another. */
function slides(box: HTMLElement, mini: boolean): Stop {
  let stopped = false;
  let timer = 0;
  let fallback: Stop | null = null;
  const layers = [h('figure', { class: 'saver-slide' }), h('figure', { class: 'saver-slide' })];
  box.append(...layers);
  let front = 0;
  desktopData()
    .then((d) => {
      if (stopped) return;
      const list = shuffle(mini ? d.projects.map((p) => ({ title: p.title, titleZh: p.titleZh, src: p.thumb })) : d.slideshow);
      if (!list.length) throw new Error('no pictures');
      let i = 0;
      const show = () => {
        if (stopped) return;
        const item = list[i++ % list.length];
        const img = new Image();
        img.alt = '';
        img.src = item.src;
        img
          .decode()
          .catch(() => {})
          .then(() => {
            if (stopped) return;
            const back = layers[1 - front];
            back.replaceChildren(img, mini ? '' : h('figcaption', {}, { en: item.title, zh: item.titleZh }));
            back.classList.remove('drift-a', 'drift-b');
            void back.offsetWidth;
            if (!reducedMotion.matches && !mini) back.classList.add(i % 2 ? 'drift-a' : 'drift-b');
            back.classList.add('on');
            layers[front].classList.remove('on');
            front = 1 - front;
            timer = window.setTimeout(show, mini ? 2600 : 9000);
          });
      };
      show();
    })
    .catch(() => {
      if (!stopped) fallback = lines(box, mini);
    });
  return () => {
    stopped = true;
    clearTimeout(timer);
    fallback?.();
    layers.forEach((l) => l.remove());
  };
}

interface Pt { x: number; y: number; vx: number; vy: number }

/** Lines: two shapes of four corners, each corner bouncing off the edges. */
function lines(box: HTMLElement, mini: boolean): Stop {
  const still = reducedMotion.matches;
  const canvas = h('canvas', { class: 'saver-canvas' });
  box.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => canvas.remove();
  let w = 1;
  let ht = 1;
  const size = () => {
    const r = box.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    w = Math.max(1, r.width);
    ht = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(ht * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(box);
  const speed = mini ? 1.2 : Math.max(3, Math.min(w, ht) / 140);
  const TRAIL = mini ? 5 : 12;
  const shapes = [0, 1].map((k) => ({
    hue: k * 150 + Math.random() * 60,
    pts: Array.from({ length: 4 }, (): Pt => ({ x: Math.random() * w, y: Math.random() * ht, vx: (Math.random() < 0.5 ? -1 : 1) * speed * (0.5 + Math.random()), vy: (Math.random() < 0.5 ? -1 : 1) * speed * (0.5 + Math.random()) })),
    trail: [] as { x: number; y: number }[][],
  }));
  const step = () => {
    for (const s of shapes) {
      for (const p of s.pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) {
          p.vx = -p.vx;
          p.x = Math.max(0, Math.min(w, p.x));
        }
        if (p.y < 0 || p.y > ht) {
          p.vy = -p.vy;
          p.y = Math.max(0, Math.min(ht, p.y));
        }
      }
      s.trail.push(s.pts.map(({ x, y }) => ({ x, y })));
      if (s.trail.length > TRAIL) s.trail.shift();
      s.hue = (s.hue + 0.35) % 360;
    }
  };
  const draw = () => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, ht);
    ctx.lineWidth = 1;
    for (const s of shapes) {
      ctx.strokeStyle = `hsl(${Math.round(s.hue)} 100% 60%)`;
      for (let i = 0; i < s.trail.length; i += mini ? 1 : 3) {
        const poly = s.trail[i];
        ctx.beginPath();
        poly.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.stroke();
      }
    }
  };
  let raf = 0;
  let last = 0;
  const frame = (t: number) => {
    raf = requestAnimationFrame(frame);
    if (t - last < 33) return;
    last = t;
    step();
    draw();
  };
  if (still) {
    for (let i = 0; i < TRAIL * 3; i++) step();
    draw();
  } else raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.remove();
  };
}

/** Draw a screen saver into a box (the screen, or the monitor in Display Properties). */
export function render(kind: string, box: HTMLElement, o: { mini?: boolean } = {}): Stop {
  const mini = !!o.mini;
  if (kind === 'slideshow') return slides(box, mini);
  if (kind === 'lines') return lines(box, mini);
  return () => {};
}

/** Run a screen saver over everything until the visitor moves the mouse or presses a key. */
export function fullScreen(kind: string, o: { preview?: boolean; onEnd: () => void }): Stop {
  const el = h('div', { class: 'screensaver', 'aria-hidden': 'true' });
  document.body.appendChild(el);
  html.dataset.saver = kind;
  const stopDrawing = render(kind, el);
  const t0 = performance.now();
  let origin: { x: number; y: number } | null = null;
  let ended = false;

  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const end = () => {
    if (ended) return;
    ended = true;
    removeEventListener('pointermove', onMove, true);
    removeEventListener('pointerdown', onDown, true);
    removeEventListener('keydown', onKey, true);
    removeEventListener('wheel', onWheel, true);
    stopDrawing();
    el.remove();
    delete html.dataset.saver;
    o.onEnd();
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return end();
    // Ignore the hand settling after the Preview click, and tiny jitters.
    if (!origin || performance.now() - t0 < (o.preview ? 800 : 200)) {
      origin = { x: e.clientX, y: e.clientY };
      return;
    }
    if (Math.abs(e.clientX - origin.x) + Math.abs(e.clientY - origin.y) > 10) end();
  };
  const onDown = (e: PointerEvent) => {
    swallow(e);
    // …and the click that follows, so waking up doesn't press anything.
    const once = (ev: Event) => swallow(ev);
    addEventListener('click', once, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', once, true), 800);
    end();
  };
  const onKey = (e: KeyboardEvent) => {
    swallow(e);
    addEventListener('keyup', swallow, { capture: true, once: true });
    end();
  };
  const onWheel = () => end();
  addEventListener('pointermove', onMove, true);
  addEventListener('pointerdown', onDown, true);
  addEventListener('keydown', onKey, true);
  addEventListener('wheel', onWheel, { capture: true, passive: true });
  return end;
}
