// Colors ▸ Edit Colors…: the Windows 98 colour dialog. Basic colours, custom
// colours (kept in this browser), and "Define Custom Colors >>": a spectrum
// of hue and saturation, a luminance bar, and Hue/Sat/Lum and Red/Green/Blue
// boxes (Windows counts hue, saturation and luminance from 0 to 240).
import { dialog, h, type Bi } from './dom';

const BASIC = [
  '#ff8080', '#ffff80', '#80ff80', '#00ff80', '#80ffff', '#0080ff', '#ff80c0', '#ff80ff',
  '#ff0000', '#ffff00', '#80ff00', '#00ff40', '#00ffff', '#0080c0', '#8080c0', '#ff00ff',
  '#804040', '#ff8040', '#00ff00', '#008080', '#004080', '#8080ff', '#800040', '#ff0080',
  '#800000', '#ff8000', '#008000', '#008040', '#0000ff', '#0000a0', '#800080', '#8000ff',
  '#400000', '#804000', '#004000', '#004040', '#000080', '#000040', '#400040', '#400080',
  '#000000', '#808000', '#808040', '#808080', '#408080', '#c0c0c0', '#400040', '#ffffff',
];

type RGB = [number, number, number];
const toHex = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const fromHex = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** RGB (0–255) → Windows HSL (hue 0–239, saturation and luminance 0–240). */
function toHsl([r, g, b]: RGB): RGB {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hue = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    hue = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hue /= 6;
  }
  return [Math.round(hue * 240) % 240, Math.round(s * 240), Math.round(l * 240)];
}

function toRgb([hue, s, l]: RGB): RGB {
  const H = hue / 240, S = s / 240, L = l / 240;
  if (S === 0) return [L * 255, L * 255, L * 255];
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S, p = 2 * L - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(H + 1 / 3) * 255, f(H) * 255, f(H - 1 / 3) * 255];
}

const W = 175, H = 151;

/** Open the dialog on a colour; resolves with the chosen colour, or null for Cancel. */
export function editColors(owner: Element, start: string, custom: string[], saveCustom: (list: string[]) => void, wide = false): Promise<string | null> {
  return new Promise((resolve) => {
    let rgb = fromHex(start);
    let hsl = toHsl(rgb);
    let result: string | null = null;
    let slot = 0;

    const swatch = (hex: string, label: Bi | string) =>
      h('button', { type: 'button', class: 'pc-swatch', style: `--c:${hex}`, 'data-hex': hex, title: label, 'aria-label': label });
    const basic = h('div', { class: 'pc-grid', role: 'group', 'aria-label': { en: 'Basic colors', zh: '基本颜色' } }, BASIC.map((c) => swatch(c, c)));
    const customGrid = h('div', { class: 'pc-grid pc-custom', role: 'group', 'aria-label': { en: 'Custom colors', zh: '自定义颜色' } });
    const drawCustom = () => customGrid.replaceChildren(...custom.map((c, i) => {
      const b = swatch(c, { en: `Custom colour ${i + 1}`, zh: `自定义颜色 ${i + 1}` });
      if (i === slot) b.classList.add('slot');
      return b;
    }));
    drawCustom();

    const spectrum = h('canvas', { class: 'pc-spectrum', width: W, height: H, 'aria-hidden': 'true' });
    const cross = h('span', { class: 'pc-cross', 'aria-hidden': 'true' });
    const lumbar = h('canvas', { class: 'pc-lumbar', width: 12, height: H, 'aria-hidden': 'true' });
    const arrow = h('span', { class: 'pc-arrow', 'aria-hidden': 'true' });
    const preview = h('span', { class: 'pc-preview', 'aria-hidden': 'true' });
    const num = (label: Bi, max: number, key: string) => {
      const input = h('input', { type: 'number', min: 0, max, step: 1, inputmode: 'numeric', 'data-key': key, 'aria-label': label });
      return { input, row: h('label', { class: 'pc-field' }, [h('span', {}, label), input]) };
    };
    const fields = {
      hue: num({ en: 'Hue:', zh: '色调：' }, 239, 'hue'),
      sat: num({ en: 'Sat:', zh: '饱和度：' }, 240, 'sat'),
      lum: num({ en: 'Lum:', zh: '亮度：' }, 240, 'lum'),
      red: num({ en: 'Red:', zh: '红：' }, 255, 'red'),
      green: num({ en: 'Green:', zh: '绿：' }, 255, 'green'),
      blue: num({ en: 'Blue:', zh: '蓝：' }, 255, 'blue'),
    };

    // The spectrum doesn't change: hue across, saturation up, at middle luminance.
    const sx = spectrum.getContext('2d')!;
    const img = sx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = toRgb([(x / (W - 1)) * 239, 240 - (y / (H - 1)) * 240, 120]);
      img.data.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
    }
    sx.putImageData(img, 0, 0);

    const paint = () => {
      const lx = lumbar.getContext('2d')!;
      for (let y = 0; y < H; y++) {
        lx.fillStyle = toHex(toRgb([hsl[0], hsl[1], 240 - (y / (H - 1)) * 240]));
        lx.fillRect(0, y, 12, 1);
      }
      // The pickers sit 2 px inside their frames.
      cross.style.left = `${2 + (hsl[0] / 239) * (W - 1)}px`;
      cross.style.top = `${2 + (1 - hsl[1] / 240) * (H - 1)}px`;
      arrow.style.top = `${2 + (1 - hsl[2] / 240) * (H - 1)}px`;
      preview.style.background = toHex(rgb);
      const vals = { hue: hsl[0], sat: hsl[1], lum: hsl[2], red: rgb[0], green: rgb[1], blue: rgb[2] };
      for (const [k, f] of Object.entries(fields)) if (document.activeElement !== f.input) f.input.value = String(Math.round(vals[k as keyof typeof vals]));
    };
    const setRgb = (c: RGB) => { rgb = c.map((v) => Math.min(255, Math.max(0, Math.round(v)))) as RGB; hsl = toHsl(rgb); paint(); };
    const setHsl = (c: RGB) => { hsl = c; rgb = toRgb(hsl).map(Math.round) as RGB; paint(); };

    const drag = (el: HTMLElement, fn: (x: number, y: number) => void) => {
      const target = el.querySelector('canvas')!;
      const at = (e: PointerEvent) => {
        const r = target.getBoundingClientRect();
        fn(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
      };
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); at(e); });
      el.addEventListener('pointermove', (e) => { if (el.hasPointerCapture(e.pointerId)) at(e); });
    };
    const specWrap = h('div', { class: 'pc-spec-wrap' }, [spectrum, cross]);
    const lumWrap = h('div', { class: 'pc-lum-wrap' }, [lumbar, arrow]);
    drag(specWrap, (x, y) => setHsl([Math.round(x * 239), Math.round((1 - y) * 240), hsl[2] === 0 || hsl[2] === 240 ? 120 : hsl[2]]));
    drag(lumWrap, (_x, y) => setHsl([hsl[0], hsl[1], Math.round((1 - y) * 240)]));
    for (const f of Object.values(fields)) {
      f.input.addEventListener('input', () => {
        const v = Number(f.input.value);
        if (!Number.isFinite(v)) return;
        const k = f.input.dataset.key!;
        if (k === 'hue' || k === 'sat' || k === 'lum') setHsl([k === 'hue' ? Math.min(239, v) : hsl[0], k === 'sat' ? Math.min(240, v) : hsl[1], k === 'lum' ? Math.min(240, v) : hsl[2]]);
        else setRgb([k === 'red' ? v : rgb[0], k === 'green' ? v : rgb[1], k === 'blue' ? v : rgb[2]]);
      });
    }
    const pick = (e: Event) => {
      const b = (e.target as Element).closest<HTMLElement>('.pc-swatch');
      if (!b) return;
      if (b.closest('.pc-custom')) {
        slot = [...customGrid.children].indexOf(b);
        drawCustom();
      }
      setRgb(fromHex(b.dataset.hex!));
    };
    basic.addEventListener('click', pick);
    customGrid.addEventListener('click', pick);

    const ok = h('button', { type: 'button', class: 'default' }, { en: 'OK', zh: '确定' });
    const cancel = h('button', { type: 'button' }, { en: 'Cancel', zh: '取消' });
    const define = h('button', { type: 'button', class: 'pc-define' }, { en: 'Define Custom Colors >>', zh: '规定自定义颜色 >>' });
    const add = h('button', { type: 'button', class: 'pc-add' }, { en: 'Add to Custom Colors', zh: '添加到自定义颜色' });
    const right = h('div', { class: 'pc-right', hidden: !wide }, [
      h('div', { class: 'pc-pickers' }, [specWrap, lumWrap]),
      h('div', { class: 'pc-values' }, [
        h('div', { class: 'pc-preview-box' }, [preview, h('span', { class: 'pc-preview-label' }, { en: 'Color|Solid', zh: '颜色|纯色' })]),
        h('div', { class: 'pc-fields' }, [fields.hue.row, fields.red.row, fields.sat.row, fields.green.row, fields.lum.row, fields.blue.row]),
      ]),
      add,
    ]);
    define.disabled = wide;
    define.addEventListener('click', () => {
      right.hidden = false;
      define.disabled = true;
      paint();
    });
    add.addEventListener('click', () => {
      custom[slot] = toHex(rgb);
      saveCustom(custom);
      slot = (slot + 1) % custom.length;
      drawCustom();
    });

    const body = h('div', { class: 'paint-colors' }, [
      h('div', { class: 'pc-left' }, [
        h('p', { class: 'pc-label' }, { en: 'Basic colors:', zh: '基本颜色：' }),
        basic,
        h('p', { class: 'pc-label' }, { en: 'Custom colors:', zh: '自定义颜色：' }),
        customGrid,
        define,
        h('div', { class: 'pc-buttons' }, [ok, cancel]),
      ]),
      right,
    ]);
    const win = dialog({ title: { en: 'Edit Colors', zh: '编辑颜色' }, icon: 'display', body, owner, className: 'paint-colors-dialog', onClose: () => resolve(result) });
    ok.addEventListener('click', () => {
      result = toHex(rgb);
      win.close();
    });
    cancel.addEventListener('click', () => win.close());
    paint();
    ok.focus();
  });
}
