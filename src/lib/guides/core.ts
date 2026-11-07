// Field Guide (导览): pure helpers shared by the server pages, the checks and
// the browser scripts. Dates, day rules, the map projection, Maps links and
// search normalisation. No guide content and no imports except types, so it
// is safe in the browser.
import type { Bi, DayRule, DayStatus, HHMM, ISODate, LonLat, RouteMode, StatusCode, Weekday } from './types';

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const DAY_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_EN_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_ZH = ['一', '二', '三', '四', '五', '六', '日'];
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_EN_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const parts = (d: ISODate) => d.split('-').map(Number) as [number, number, number];

/** A real calendar date written YYYY-MM-DD ("2026-11-31" is not). */
export function isISODate(s: string): boolean {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = parts(s);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const weekdayIndex = (d: ISODate) => (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7;

export function weekdayOf(d: ISODate): Weekday {
  return WEEKDAYS[weekdayIndex(d)];
}

/** Every day from a to b, both included ([] when b is before a). */
export function daysBetween(a: ISODate, b: ISODate): ISODate[] {
  const out: ISODate[] = [];
  if (!isISODate(a) || !isISODate(b)) return out;
  const t = new Date(a + 'T12:00:00Z');
  const end = new Date(b + 'T12:00:00Z').getTime();
  while (t.getTime() <= end && out.length < 3660) {
    out.push(t.toISOString().slice(0, 10));
    t.setUTCDate(t.getUTCDate() + 1);
  }
  return out;
}

function zoned(timezone: string, now: Date, o: Intl.DateTimeFormatOptions): Record<string, string> {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, ...o });
  const r: Record<string, string> = {};
  for (const p of f.formatToParts(now)) r[p.type] = p.value;
  return r;
}

/** Today's date in the guide's own time zone (never the device's). */
export function todayIn(timezone: string, now: Date = new Date()): ISODate {
  const p = zoned(timezone, now, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}

/** The time now in the guide's own time zone, HH:MM. */
export function timeIn(timezone: string, now: Date = new Date()): HHMM {
  const p = zoned(timezone, now, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const h = p.hour === '24' ? '00' : p.hour;
  return `${h.padStart(2, '0')}:${p.minute}`;
}

/** "Wed 11 Nov" / "11月11日（周三）". */
export function dayLabel(d: ISODate): Bi {
  const [, m, day] = parts(d);
  const w = weekdayIndex(d);
  return { en: `${DAY_EN[w]} ${day} ${MONTH_EN[m - 1]}`, zh: `${m}月${day}日（周${DAY_ZH[w]}）` };
}

/** "Wednesday 11 November" / "11月11日 星期三". */
export function dayLabelLong(d: ISODate): Bi {
  const [, m, day] = parts(d);
  const w = weekdayIndex(d);
  return { en: `${DAY_EN_LONG[w]} ${day} ${MONTH_EN_LONG[m - 1]}`, zh: `${m}月${day}日 星期${DAY_ZH[w]}` };
}

const STATUS: Record<StatusCode, { short: Bi; label: Bi }> = {
  'choose-day': { short: { en: 'Any day', zh: '选择日期' }, label: { en: 'Choose a day to check opening', zh: '选择日期，查看开放情况' } },
  scheduled: { short: { en: 'Open', zh: '开放' }, label: { en: 'Open as published (not live status)', zh: '按公布时间开放（非实时）' } },
  confirm: { short: { en: 'Check first', zh: '假日请先确认' }, label: { en: 'Public holiday: confirm access first', zh: '公共假日：请先确认是否开放' } },
  appointment: { short: { en: 'Appt', zh: '需预约' }, label: { en: 'Appointment only', zh: '仅限预约' } },
  closed: { short: { en: 'Closed', zh: '闭馆' }, label: { en: 'Closed on this day', zh: '当天闭馆' } },
  'closed-weekday': { short: { en: 'Closed', zh: '闭馆' }, label: { en: 'Closed on this weekday', zh: '每周这一天闭馆' } },
  'not-yet': { short: { en: 'Not yet', zh: '尚未开幕' }, label: { en: 'Not open yet', zh: '尚未开幕' } },
  ended: { short: { en: 'Ended', zh: '已结束' }, label: { en: 'Already ended', zh: '已结束' } },
};

const NO_NOTE: Bi = { en: '', zh: '' };

function status(code: StatusCode, note: Bi = NO_NOTE): DayStatus {
  return {
    code,
    short: { ...STATUS[code].short },
    label: { ...STATUS[code].label },
    note: { ...note },
    visitable: !(code === 'not-yet' || code === 'ended' || code === 'closed-weekday' || code === 'closed'),
    heat: code === 'scheduled' || code === 'choose-day',
  };
}

/**
 * What a place does on one day. In this order: no day → choose-day; an
 * exception on the day; before start / after end; not an opening weekday;
 * a holiday it closes on; appointment only; a holiday to confirm; scheduled.
 */
export function dayStatus(rule: DayRule, day: ISODate | null, holidays: { date: ISODate; name: Bi }[]): DayStatus {
  if (!day) return status('choose-day');
  const ex = (rule.exceptions || []).find((e) => e.date === day);
  if (ex) return status(ex.status === 'open' ? 'scheduled' : ex.status, ex.note);
  if (rule.start && day < rule.start) {
    const l = dayLabel(rule.start);
    return status('not-yet', { en: `From ${l.en}`, zh: `${l.zh}起` });
  }
  if (rule.end && day > rule.end) {
    const l = dayLabel(rule.end);
    return status('ended', { en: `Until ${l.en}`, zh: `至${l.zh}` });
  }
  if (rule.open && !rule.open.includes(weekdayOf(day))) return status('closed-weekday');
  const hol = holidays.find((h) => h.date === day);
  const policy = rule.holiday || 'confirm';
  if (hol && policy === 'closed') return status('closed', hol.name);
  if (rule.access === 'appointment') return status('appointment');
  if (hol && policy === 'confirm') return status('confirm', hol.name);
  return status('scheduled');
}

/** Global Web-Mercator pixel position at zoom z (256-px tiles). */
export function project(lonlat: LonLat, z = 14): { x: number; y: number } {
  const w = 256 * Math.pow(2, z);
  const sin = Math.sin((lonlat[1] * Math.PI) / 180);
  return {
    x: ((lonlat[0] + 180) / 360) * w,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * w,
  };
}

/** Ground metres per pixel at a latitude and zoom. */
export function metresPerPixel(lat: number, z: number): number {
  return (156543.03392804097 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z);
}

const enc = encodeURIComponent;
const place = (s: { name: string; address: string }) => [s.name, s.address].filter(Boolean).join(', ');

export function mapsSearchUrl(name: string, address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${enc(place({ name, address }))}`;
}

function dirUrl(stops: { name: string; address: string }[], mode: RouteMode): string {
  const a = stops[0];
  const b = stops[stops.length - 1];
  const mid = stops.slice(1, -1);
  let u = `https://www.google.com/maps/dir/?api=1&origin=${enc(place(a))}&destination=${enc(place(b))}`;
  if (mid.length) u += `&waypoints=${mid.map((s) => enc(place(s))).join('%7C')}`;
  return u + `&travelmode=${mode}`;
}

/**
 * Google Maps directions. Walking: one link with at most 3 waypoints (longer
 * routes are cut into parts that share their end stops). Transit: one link per
 * leg, because Google ignores waypoints in transit mode.
 */
export function mapsRouteUrls(stops: { name: string; address: string }[], mode: RouteMode): { href: string; label: Bi }[] {
  if (stops.length < 2) return [];
  if (mode === 'transit') {
    return stops.slice(1).map((b, i) => {
      const a = stops[i];
      return { href: dirUrl([a, b], 'transit'), label: { en: `${i + 1}. ${a.name} to ${b.name}`, zh: `${i + 1}. ${a.name} 到 ${b.name}` } };
    });
  }
  const chunks: { name: string; address: string }[][] = [];
  for (let i = 0; i < stops.length - 1; i += 4) chunks.push(stops.slice(i, i + 5));
  if (chunks.length === 1) return [{ href: dirUrl(chunks[0], 'walking'), label: { en: 'Walking directions', zh: '步行路线' } }];
  return chunks.map((c, i) => ({
    href: dirUrl(c, 'walking'),
    label: { en: `Walking directions (${i + 1} of ${chunks.length})`, zh: `步行路线（${i + 1}/${chunks.length}）` },
  }));
}

/** For Find: lower case, accents and ligatures flattened ("Œuvre" → "oeuvre"). */
export function normalise(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
