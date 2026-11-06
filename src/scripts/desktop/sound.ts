// System sounds, composed for kuschonink 98 and played with Web Audio (no
// recordings, nothing from Windows). Browsers only allow sound after a click
// or key press: the log-on click unlocks it, and so does any first press.
import { settings } from './settings';

export type SoundName = 'startup' | 'shutdown' | 'logoff' | 'ding' | 'chord' | 'exclamation' | 'click' | 'recycle' | 'menu';

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let master: GainNode | null = null;
let room: ConvolverNode | null = null;

function audio(): Ctx | null {
  if (ctx) return ctx;
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  ctx = new C();
  master = ctx.createGain();
  master.gain.value = settings.get().volume;
  master.connect(ctx.destination);
  // A small room: decaying noise as an impulse response.
  room = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 2.2);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  room.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  room.connect(wet).connect(master);
  settings.on((s) => {
    if (master && ctx) master.gain.setTargetAtTime(s.volume, ctx.currentTime, 0.02);
  });
  return ctx;
}

/** Call inside a click or key handler so browsers allow audio. */
export function unlockAudio() {
  const a = audio();
  if (!a) return;
  if (a.state === 'suspended') a.resume().catch(() => {});
  const b = a.createBuffer(1, 1, 22050);
  const s = a.createBufferSource();
  s.buffer = b;
  s.connect(a.destination);
  s.start(0);
}

/** One note with an envelope, sent dry and into the room. */
function tone(a: Ctx, f: number, t: number, dur: number, o: { type?: OscillatorType; gain?: number; attack?: number; wet?: boolean; detune?: number; glide?: number } = {}) {
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(f, t);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t + dur);
  if (o.detune) osc.detune.value = o.detune;
  const peak = o.gain ?? 0.2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(master!);
  if (o.wet !== false && room) g.connect(room);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** A bell: a sine with a quieter, faster-fading octave and fifth above. */
function bell(a: Ctx, f: number, t: number, dur = 2.4, gain = 0.16) {
  tone(a, f, t, dur, { gain });
  tone(a, f * 2, t, dur * 0.45, { gain: gain * 0.35 });
  tone(a, f * 3.01, t, dur * 0.25, { gain: gain * 0.12 });
}

function noise(a: Ctx, t: number, dur: number, freq: number, q: number, gain: number) {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master!);
  src.start(t);
}

const N = (semitonesFromA4: number) => 440 * Math.pow(2, semitonesFromA4 / 12);

const RECIPES: Record<SoundName, (a: Ctx) => void> = {
  // A soft pad that opens while bells climb (E major 9), then a high shimmer.
  startup(a) {
    const t = a.currentTime + 0.05;
    for (const s of [-17, -10, -5, -1]) tone(a, N(s), t, 3.6, { type: 'triangle', gain: 0.045, attack: 0.6, detune: s % 2 ? 4 : -4 });
    [-5, -1, 2, 6, 9, 14].forEach((s, i) => bell(a, N(s), t + 0.22 + i * 0.2, 2.6, 0.13));
    bell(a, N(19), t + 1.6, 2.2, 0.07);
    tone(a, N(-29), t, 3.2, { type: 'sine', gain: 0.08, attack: 0.3 });
  },
  shutdown(a) {
    const t = a.currentTime + 0.05;
    [9, 6, 2, -1, -5].forEach((s, i) => bell(a, N(s), t + i * 0.24, 2.4, 0.12));
    for (const s of [-17, -13, -10]) tone(a, N(s), t + 0.3, 2.6, { type: 'triangle', gain: 0.04, attack: 0.4 });
  },
  logoff(a) {
    const t = a.currentTime + 0.03;
    bell(a, N(7), t, 1.4, 0.12);
    bell(a, N(2), t + 0.18, 1.6, 0.12);
  },
  // "Default beep": one bright bell.
  ding(a) {
    bell(a, N(19), a.currentTime + 0.01, 0.9, 0.16);
  },
  // "Critical stop": a short, low, slightly sour chord.
  chord(a) {
    const t = a.currentTime + 0.01;
    for (const s of [-12, -9, -5, 1]) tone(a, N(s), t, 0.7, { type: 'square', gain: 0.035, attack: 0.004 });
    tone(a, N(-24), t, 0.8, { type: 'triangle', gain: 0.12 });
  },
  exclamation(a) {
    const t = a.currentTime + 0.01;
    bell(a, N(15), t, 0.6, 0.12);
    bell(a, N(10), t + 0.12, 0.8, 0.12);
  },
  // The click a browser made when you followed a link.
  click(a) {
    const t = a.currentTime + 0.005;
    noise(a, t, 0.012, 2600, 1.2, 0.5);
    noise(a, t + 0.03, 0.01, 1900, 1.4, 0.35);
  },
  // Paper crumpled into the bin.
  recycle(a) {
    const t = a.currentTime + 0.01;
    for (let i = 0; i < 9; i++) noise(a, t + i * 0.045 + Math.random() * 0.02, 0.04 + Math.random() * 0.04, 1200 + Math.random() * 3200, 0.8, 0.5);
  },
  menu() {
    /* Windows 98 menus were silent. */
  },
};

/** Play a system sound (unless sounds are off). */
export function play(name: SoundName | string) {
  const s = settings.get();
  if (!s.sound || s.volume <= 0) return;
  const recipe = RECIPES[name as SoundName];
  const a = audio();
  if (!recipe || !a) return;
  if (a.state === 'suspended') {
    a.resume().then(() => recipe(a)).catch(() => {});
    return;
  }
  recipe(a);
}

/** The first click or key press anywhere unlocks audio (for visitors already logged on). */
export function initSound() {
  const once = () => {
    unlockAudio();
    removeEventListener('pointerdown', once, true);
    removeEventListener('keydown', once, true);
  };
  addEventListener('pointerdown', once, true);
  addEventListener('keydown', once, true);
}
