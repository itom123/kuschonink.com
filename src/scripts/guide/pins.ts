// Field Guide (导览): map pins and clusters. Pins are <a class="gd-pin"> in
// screen space (they never scale with the map). The server renders the items'
// and places' pins (GuideMap.astro); the map reuses them and makes the rest.
import type { Bi, TierId } from '../../lib/guides/types';

export interface PinLike { id: string; kind: 'item' | 'place' | 'listing'; tier?: TierId; letter?: string; aria: Bi }

/** Screen point of one pin, for clustering. */
export interface Pt { id: string; x: number; y: number; pr: number; lone?: boolean }
export interface Cluster { lead: string; ids: string[]; x: number; y: number }

/** Higher draws on top, labels first and never clusters away. */
export function priority(p: { kind: string; tier?: string }, selected: boolean, step: boolean) {
  if (selected) return 100;
  if (p.kind === 'place') return 90;
  if (step) return 80;
  if (p.kind === 'listing') return 10;
  return p.tier === 'A' ? 50 : p.tier === 'B' ? 40 : 30;
}

/**
 * Greedy clusters in screen space: the highest pin takes every lower one
 * within r px. `lone` pins (selected, places, route stops) never join one.
 * Returns only groups of two or more.
 */
export function cluster(pts: Pt[], r: number): Cluster[] {
  const order = [...pts].sort((a, b) => b.pr - a.pr || (a.id < b.id ? -1 : 1));
  const taken = new Set<string>();
  const out: Cluster[] = [];
  const r2 = r * r;
  for (const p of order) {
    if (taken.has(p.id) || p.lone) continue;
    const ids = [p.id];
    for (const q of order) {
      if (q === p || q.lone || taken.has(q.id)) continue;
      const dx = q.x - p.x, dy = q.y - p.y;
      if (dx * dx + dy * dy < r2) ids.push(q.id);
    }
    if (ids.length > 1) {
      ids.forEach((id) => taken.add(id));
      out.push({ lead: p.id, ids, x: p.x, y: p.y });
    }
  }
  return out;
}

/**
 * Map density: how far apart shows must be on the ground, in metres, before
 * they fold into one cluster. That caps the shows per km² at about
 * (1000 / d)²: few when the whole city is in view, more as you zoom in, no
 * cap at street level. Phones (a touch screen or a narrow window) keep them
 * further apart. Between the zooms listed, in proportion.
 */
export const SPACING: Record<'desktop' | 'phone', [zoom: number, metres: number][]> = {
  desktop: [[11, 1200], [12, 600], [13, 250], [14, 100], [15, 0]],
  phone: [[11, 2000], [12, 1000], [13, 450], [14, 180], [15, 60], [16, 0]],
};
/** The smallest cluster radius in screen pixels: about a pin, or a fingertip. */
export const BASE_R = { desktop: 14, phone: 26 };

/** The ground spacing at zoom z (halfway between two zooms: the geometric middle; to nothing at the end). */
export function spacingAt(z: number, phone: boolean): number {
  const t = SPACING[phone ? 'phone' : 'desktop'];
  // Further out than the table: the same distance on screen (it only gets wider on the ground).
  if (z <= t[0][0]) return t[0][1] * Math.pow(2, t[0][0] - z);
  for (let i = 1; i < t.length; i++) {
    const [z0, d0] = t[i - 1];
    const [z1, d1] = t[i];
    if (z > z1) continue;
    const f = (z - z0) / (z1 - z0);
    return d1 === 0 ? d0 * (1 - f) : d0 * Math.pow(d1 / d0, f);
  }
  return 0;
}

/**
 * The cluster radius in screen pixels at map zoom z (as on slippy maps:
 * fractional), where a screen pixel is `metresPerPx` on the ground. The zoom
 * is taken in half steps, so pins don't come and go during a pinch.
 */
export function densityRadius(z: number, metresPerPx: number, phone: boolean): number {
  const zq = Math.floor(z * 2) / 2;
  const mpp = metresPerPx * Math.pow(2, z - zq); // a pixel at the half step
  return Math.round(Math.max(BASE_R[phone ? 'phone' : 'desktop'], spacingAt(zq, phone) / mpp));
}

/**
 * Shows at one place (a venue with several): still one cluster even at the
 * closest zoom, so a tap should list them rather than zoom. Points in world
 * units; `scale` is screen pixels per world unit at the closest zoom.
 */
export function sameSpot(pts: { x: number; y: number }[], scale: number, radius: number): boolean {
  let far = 0;
  for (const a of pts) for (const b of pts) far = Math.max(far, Math.hypot(a.x - b.x, a.y - b.y));
  return far * scale < radius;
}

/** Natural order for keyboard moves: places, then A1 A2 … A10, B…, C…, then listings. */
export function compareIds(a: PinLike, b: PinLike) {
  const rank = (p: PinLike) => (p.kind === 'place' ? 0 : p.kind === 'item' ? 1 : 2);
  return rank(a) - rank(b) || a.id.localeCompare(b.id, 'en', { numeric: true });
}

const pick = (b: Bi) => (document.documentElement.dataset.lang === 'zh' && b.zh ? b.zh : b.en);

/** A bilingual attribute the 中/EN switch swaps (as paint/dom.ts setAttr). */
export function setBiAttr(el: Element, k: 'aria-label' | 'title', v: Bi) {
  el.setAttribute(k, pick(v));
  el.setAttribute(`data-${k}-en`, v.en);
  el.setAttribute(`data-${k}-zh`, v.zh || v.en);
}

export const glyphClass = (p: { kind: string; tier?: string }) =>
  `ico ico16 ico-pin-${p.kind === 'listing' ? 'd' : (p.tier ?? 'c').toLowerCase()}`;

/** The pin's inside: a 16px pixel icon, or a letter plate for a place. */
export function glyph(p: PinLike): HTMLElement {
  const g = document.createElement('span');
  if (p.kind === 'place') {
    g.className = 'gd-plate';
    g.textContent = p.letter ?? p.id;
  } else g.className = glyphClass(p);
  g.setAttribute('aria-hidden', 'true');
  return g;
}

/** A new pin element, for pins the server didn't render (listings). */
export function makePin(p: PinLike): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'gd-pin';
  a.dataset.id = p.id;
  a.href = `#gd-item-${p.id}`;
  a.append(glyph(p));
  return a;
}

/** Keep a pin element in step with its data. */
export function dressPin(a: HTMLElement, p: PinLike) {
  a.dataset.kind = p.kind;
  if (p.tier) a.dataset.tier = p.tier;
  else delete a.dataset.tier;
  setBiAttr(a, 'aria-label', p.aria);
  a.style.removeProperty('left');
  a.style.removeProperty('top');
}

/** A cluster's button: the lead's glyph and a count badge. */
export function makeCluster(): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'gd-cluster';
  b.tabIndex = -1;
  b.append(document.createElement('span'), Object.assign(document.createElement('span'), { className: 'gd-count' }));
  return b;
}

export function dressCluster(b: HTMLButtonElement, lead: PinLike, members: (PinLike & { short: string })[]) {
  const [g, n] = b.children as unknown as [HTMLElement, HTMLElement];
  const ng = glyph(lead);
  g.replaceWith(ng);
  n.textContent = String(members.length);
  b.dataset.ids = members.map((m) => m.id).join(' ');
  const names = members.map((m) => `${m.id} ${m.short}`);
  const en = `${members.length} places: ${names.join(', ')}`;
  const zh = `${members.length} 个地点：${names.join('、')}`;
  setBiAttr(b, 'aria-label', { en, zh });
}
