// Field Guide (导览): Where am I? The browser's position, asked for only when
// someone presses Where am I?, kept in memory on this device and never sent
// anywhere. Distances are straight lines; walking times are rough guesses.
import type { Bi, LonLat } from '../../lib/guides/types';

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

const toFix = (p: GeolocationPosition): Fix => ({
  coordinates: [p.coords.longitude, p.coords.latitude],
  accuracy: Math.max(1, p.coords.accuracy || 0),
  at: p.timestamp || Date.now(),
});
const toError = (e: GeolocationPositionError): LocateError => (e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable');

/**
 * Follow the position until the returned stop() is called. onFix gets every
 * new position. onError gets a refusal at any time, and other failures only
 * before the first position (later ones keep the last position on the map).
 */
export function follow(onFix: (f: Fix) => void, onError: (e: LocateError) => void): () => void {
  const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
  if (!geo || (typeof isSecureContext === 'boolean' && !isSecureContext)) {
    queueMicrotask(() => onError('unsupported'));
    return () => {};
  }
  let got = false;
  let stopped = false;
  const id = geo.watchPosition(
    (p) => {
      if (stopped) return;
      got = true;
      onFix(toFix(p));
    },
    (e) => {
      if (stopped) return;
      if (e.code === 1 || !got) onError(toError(e));
    },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
  );
  return () => {
    stopped = true;
    geo.clearWatch(id);
  };
}
