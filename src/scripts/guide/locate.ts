// Field Guide (导览): Where am I? The browser's position, asked for only when
// someone presses Where am I?, followed until they stop or leave the page,
// kept in this page's memory and never sent anywhere. Nothing here is saved,
// so after a refresh it stays off until the button is pressed again.
// Distances are straight lines; walking times are rough guesses.
import type { Bi, LonLat } from '../../lib/guides/types';
import { metresPerPixel, project } from '../../lib/guides/core.ts';

export interface Fix { coordinates: LonLat; accuracy: number; at: number }
export type LocateError = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

const EARTH = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Straight-line distance in metres (haversine). */
export function distance(a: LonLat, b: LonLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Minutes on foot: streets add about a quarter to the straight line, at 4.8 km/h. */
export const walkMinutes = (m: number) => Math.max(1, Math.round((m * 1.25) / 80));

/** "350 m" / "1.2 km" (米 / 公里). */
export function distanceText(m: number): Bi {
  if (m < 950) {
    const r = Math.max(10, Math.round(m / 10) * 10);
    return { en: `${r} m`, zh: `${r} 米` };
  }
  const km = m < 9950 ? (Math.round(m / 100) / 10).toFixed(1) : String(Math.round(m / 1000));
  return { en: `${km} km`, zh: `${km} 公里` };
}

/** The nearest few, closest first. */
export function nearest<T extends { coordinates: LonLat }>(from: LonLat, list: T[], n: number): (T & { m: number })[] {
  return list
    .map((x) => ({ ...x, m: distance(from, x.coordinates) }))
    .sort((a, b) => a.m - b.m)
    .slice(0, n);
}

/**
 * How far a position is from the nearest map, in metres (0 when a map holds
 * it): to the nearest edge of the closest view's box, not to its middle.
 */
export function offMaps(c: LonLat, views: { z: number; originX: number; originY: number; width: number; height: number }[]): number {
  const p = project(c, 14);
  let best = Infinity;
  for (const v of views) {
    const f = Math.pow(2, 14 - v.z);
    const x0 = v.originX * f, y0 = v.originY * f, x1 = x0 + v.width * f, y1 = y0 + v.height * f;
    const dx = Math.max(x0 - p.x, 0, p.x - x1), dy = Math.max(y0 - p.y, 0, p.y - y1);
    best = Math.min(best, Math.hypot(dx, dy) * metresPerPixel(c[1], 14));
  }
  return best;
}

const toFix = (p: GeolocationPosition): Fix => ({
  coordinates: [p.coords.longitude, p.coords.latitude],
  accuracy: Math.max(1, p.coords.accuracy || 0),
  at: p.timestamp || Date.now(),
});
const toError = (e: GeolocationPositionError): LocateError => (e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable');
const TIMEOUT = 20000;

/**
 * Follow the position until the returned stop() is called. Call it straight
 * from a click, so the browser can show its own permission prompt. onFix gets
 * every new position. onError gets a refusal at any time and other failures
 * only before the first position (later ones keep the last position on the
 * map). A position that isn't ready yet (iOS indoors) often comes a moment
 * later, so before the first fix that error waits for the timeout.
 */
export function follow(onFix: (f: Fix) => void, onError: (e: LocateError) => void): () => void {
  const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
  if (!geo || (typeof isSecureContext === 'boolean' && !isSecureContext)) {
    queueMicrotask(() => onError('unsupported'));
    return () => {};
  }
  let got = false;
  let stopped = false;
  let wait = 0;
  const id = geo.watchPosition(
    (p) => {
      if (stopped) return;
      got = true;
      clearTimeout(wait);
      onFix(toFix(p));
    },
    (e) => {
      if (stopped) return;
      if (e.code === 1) return onError('denied');
      if (got) return;
      if (e.code !== 2) return onError(toError(e));
      // Not ready yet: the browser keeps watching. Give up only if nothing comes.
      if (!wait) wait = setTimeout(() => { if (!got && !stopped) onError('unavailable'); }, TIMEOUT) as unknown as number;
    },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: TIMEOUT },
  );
  return () => {
    stopped = true;
    clearTimeout(wait);
    geo.clearWatch(id);
  };
}

/** What the browser says about location for this site, without asking: 'prompt', 'granted', 'denied' or null. */
export async function permission(): Promise<PermissionState | null> {
  try {
    const st = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return st?.state ?? null;
  } catch {
    return null;
  }
}
