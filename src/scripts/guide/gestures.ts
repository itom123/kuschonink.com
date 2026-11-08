// Field Guide (导览): the map's finger gestures, as a small state machine with
// no DOM (node tests it in gestures.test.mts). map.ts hands it pointer events
// in viewport pixels and carries out what it answers. They are the gestures
// map apps share (Google Maps, Apple Maps):
//
//   one finger    drag to move the map, and a flick glides on; a tap goes to
//                 what it touched (a pin, a cluster); a double-tap zooms in
//                 there; double-tap and hold, then slide down to zoom in or up
//                 to zoom out, round the place the finger came down;
//   two fingers   pinch to zoom, and move together to move the map; a tap
//                 with two fingers zooms out.
//
// A mouse only drags here: its double-click and wheel are map.ts's own. A pen
// counts as a finger.

export type Kind = 'mouse' | 'touch';

/** What the map does. Places are in viewport pixels; a glide's speed in pixels a millisecond. */
export type Act =
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'zoom'; f: number; x: number; y: number }
  | { type: 'tap'; id: number; x: number; y: number }
  | { type: 'zoomIn'; x: number; y: number }
  | { type: 'zoomOut'; x: number; y: number }
  | { type: 'glide'; vx: number; vy: number }
  | { type: 'end' };

/** Movement under this (px) is still a tap: a mouse is steadier than a finger. */
export const SLOP: Record<Kind, number> = { mouse: 4, touch: 10 };
/** A double-tap: the second touch comes down within this many ms of the first tap's lift… */
export const DOUBLE_MS = 300;
/** …and within this many px of it. */
export const DOUBLE_PX = 40;
/** A tap held longer than this can't start a double-tap (ms). */
export const TAP_MS = 350;
/** A two-finger tap: the second finger lands within TWO_GAP ms of the first, and both are off within TWO_MS. */
export const TWO_GAP = 200;
export const TWO_MS = 400;
/** One-finger zoom: px of slide for each doubling (as MapLibre's). */
export const ZOOM_PX = 128;
/**
 * A flick: the finger's speed over its last FLICK_MS, at most FLICK_MAX px/ms. The glide starts FLICK_MIN
 * slower, so a drag let go slowly doesn't drift and a faster one glides further, with no jump in between.
 */
export const FLICK_MS = 100;
export const FLICK_MIN = 0.15;
export const FLICK_MAX = 3;

interface Finger { x: number; y: number; x0: number; y0: number; t0: number }

/**
 * press: one finger down, not moved (a tap so far); pan: one finger moving
 * the map; second: the second touch of a double-tap, not moved; zoom: one
 * finger zooming; pinch: two fingers; lift: one finger left of what may still
 * be a two-finger tap.
 */
type Mode = 'idle' | 'press' | 'pan' | 'second' | 'zoom' | 'pinch' | 'lift';

export class Gestures {
  private kind: Kind = 'touch';
  private fingers = new Map<number, Finger>();
  private mode: Mode = 'idle';
  /** The last tap's lift, while a second tap may still make it a double-tap. */
  private last: { x: number; y: number; t: number } | null = null;
  /** Where a one-finger zoom zooms round: where its second touch came down. */
  private anchor = { x: 0, y: 0 };
  /** Two fingers at the last step: their distance and midpoint. */
  private pair = { d: 0, x: 0, y: 0 };
  /** A two-finger tap in the making: when the first finger landed, and where the midpoint was. */
  private two: { t0: number; x: number; y: number } | null = null;
  /** The moving finger's recent places, for a flick's speed. */
  private trail: { x: number; y: number; t: number }[] = [];
  /** The map moved in this gesture, so it is no tap (and no click). */
  moved = false;

  /** How many fingers (or the mouse button) are down. */
  get down() {
    return this.fingers.size;
  }

  /** The map took the last tap (a pin, a cluster): it starts no double-tap. */
  forgetTap() {
    this.last = null;
  }

  reset() {
    this.fingers.clear();
    this.mode = 'idle';
    this.last = this.two = null;
    this.trail = [];
    this.moved = false;
  }

  downAt(id: number, kind: Kind, x: number, y: number, t: number): Act[] {
    // Only two fingers count; a mouse is alone.
    if (this.fingers.has(id) || this.fingers.size >= 2) return [];
    if (this.fingers.size && (kind === 'mouse' || this.kind === 'mouse')) return [];
    const f: Finger = { x, y, x0: x, y0: y, t0: t };
    if (!this.fingers.size) {
      this.kind = kind;
      this.moved = false;
      this.two = null;
      this.trail = [{ x, y, t }];
      this.fingers.set(id, f);
      const l = this.last;
      if (kind === 'touch' && l && t - l.t <= DOUBLE_MS && Math.hypot(x - l.x, y - l.y) <= DOUBLE_PX) {
        this.mode = 'second';
        this.anchor = { x, y };
      } else this.mode = 'press';
      return [];
    }
    // A second finger: a pinch, or a two-finger tap if both came down together and the first hasn't moved.
    const [a] = this.fingers.values();
    this.two = this.mode === 'press' && t - a.t0 <= TWO_GAP ? { t0: a.t0, x: (a.x + x) / 2, y: (a.y + y) / 2 } : null;
    this.fingers.set(id, f);
    this.mode = 'pinch';
    this.last = null;
    this.pair = this.measure();
    return [];
  }

  moveTo(id: number, x: number, y: number, t: number): Act[] {
    const f = this.fingers.get(id);
    if (!f) return [];
    const dx = x - f.x, dy = y - f.y;
    f.x = x;
    f.y = y;
    const far = Math.hypot(x - f.x0, y - f.y0) > SLOP[this.kind];
    switch (this.mode) {
      case 'press':
        this.note(x, y, t);
        if (!far) return [];
        // Past the slop it's a drag, and the map catches up with the finger.
        this.mode = 'pan';
        this.moved = true;
        this.last = null;
        return [{ type: 'pan', dx: x - f.x0, dy: y - f.y0 }];
      case 'pan':
        this.note(x, y, t);
        return dx || dy ? [{ type: 'pan', dx, dy }] : [];
      case 'second':
        if (!far) return [];
        this.mode = 'zoom';
        this.moved = true;
        this.last = null;
        return [this.zoom(y - f.y0)];
      case 'zoom':
        return dy ? [this.zoom(dy)] : [];
      case 'lift':
        // The finger left of a two-finger tap moves on: from here it drags the map.
        if (!far) return [];
        this.two = null;
        this.mode = 'pan';
        this.moved = true;
        this.trail = [{ x, y, t }];
        return [{ type: 'pan', dx: x - f.x0, dy: y - f.y0 }];
      case 'pinch': {
        if (this.fingers.size < 2) return [];
        // Still a two-finger tap while neither finger has gone past the slop, in time.
        if (this.two) {
          if (!far && t - this.two.t0 <= TWO_MS) return [];
          this.two = null;
        }
        this.moved = true;
        const p = this.pair, n = this.measure();
        this.pair = n;
        const acts: Act[] = [];
        // Zoom round the midpoint, and follow it as it moves.
        if (p.d > 0 && n.d > 0 && n.d !== p.d) acts.push({ type: 'zoom', f: n.d / p.d, x: n.x, y: n.y });
        if (n.x !== p.x || n.y !== p.y) acts.push({ type: 'pan', dx: n.x - p.x, dy: n.y - p.y });
        return acts;
      }
    }
    return [];
  }

  upAt(id: number, x: number, y: number, t: number): Act[] {
    const f = this.fingers.get(id);
    if (!f) return [];
    // Where it lifted is its last move.
    const acts = this.moveTo(id, x, y, t);
    this.fingers.delete(id);
    const mode = this.mode;
    if (mode === 'pinch' || mode === 'lift') {
      const [rest] = this.fingers.values();
      if (rest && mode === 'pinch') {
        // One finger of two is off: the other one carries on from where it is,
        // or lifts soon after for a two-finger tap.
        rest.x0 = rest.x;
        rest.y0 = rest.y;
        this.trail = [{ x: rest.x, y: rest.y, t }];
        if (this.two && t - this.two.t0 <= TWO_MS) this.mode = 'lift';
        else {
          this.two = null;
          this.mode = 'pan';
        }
        return acts;
      }
      const two = this.two;
      this.mode = 'idle';
      this.two = this.last = null;
      // A two-finger tap touches nothing under it.
      this.moved = true;
      if (mode === 'lift' && two && t - two.t0 <= TWO_MS) acts.push({ type: 'zoomOut', x: two.x, y: two.y });
      acts.push({ type: 'end' });
      return acts;
    }
    this.mode = 'idle';
    if (mode === 'press') {
      // A tap. A quick one may be the first of a double-tap.
      this.last = this.kind === 'touch' && t - f.t0 <= TAP_MS ? { x, y, t } : null;
      acts.push({ type: 'tap', id, x, y });
    } else {
      this.last = null;
      if (mode === 'second') acts.push({ type: 'zoomIn', x: this.anchor.x, y: this.anchor.y });
      if (mode === 'pan' && this.kind === 'touch') {
        const v = this.flick(t);
        if (v) {
          acts.push({ type: 'glide', vx: v.vx, vy: v.vy });
          return acts;
        }
      }
    }
    acts.push({ type: 'end' });
    return acts;
  }

  /** The browser took a finger back (or the mouse left): no tap, no double-tap. */
  cancel(id: number, t: number): Act[] {
    if (!this.fingers.delete(id)) return [];
    this.last = this.two = null;
    if (!this.fingers.size) {
      this.mode = 'idle';
      return [{ type: 'end' }];
    }
    // One finger of two is left: it moves the map from where it is.
    const [rest] = this.fingers.values();
    rest.x0 = rest.x;
    rest.y0 = rest.y;
    this.trail = [{ x: rest.x, y: rest.y, t }];
    this.mode = 'pan';
    this.moved = true;
    return [];
  }

  private measure() {
    const [a, b] = [...this.fingers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /** One-finger zoom: sliding down zooms in, up zooms out, a doubling every ZOOM_PX. */
  private zoom(dy: number): Act {
    return { type: 'zoom', f: Math.pow(2, dy / ZOOM_PX), x: this.anchor.x, y: this.anchor.y };
  }

  private note(x: number, y: number, t: number) {
    this.trail.push({ x, y, t });
    while (this.trail.length > 2 && t - this.trail[0].t > 2 * FLICK_MS) this.trail.shift();
  }

  /** The glide's speed as the finger lifted, or null when it was too slow to glide (or had stopped). */
  private flick(t: number) {
    const tr = this.trail.filter((s) => t - s.t <= FLICK_MS);
    if (tr.length < 2) return null;
    const a = tr[0], b = tr[tr.length - 1];
    const dt = Math.max(b.t - a.t, 16);
    const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
    const v = Math.hypot(vx, vy);
    if (v <= FLICK_MIN) return null;
    const k = (Math.min(v, FLICK_MAX) - FLICK_MIN) / v;
    return { vx: vx * k, vy: vy * k };
  }
}
