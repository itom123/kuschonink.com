// The start-up screen's network check, after cleanip.io: the visitor's IP
// address, where it is, the network (ASN) it belongs to, and a rough purity
// score with what lowered it. The Worker (worker/whoami.ts) answers with what
// Cloudflare already knows about the request; nothing is looked up anywhere
// else, kept or logged. The browser adds its own time zone, and the BIOS
// screen (src/scripts/desktop/boot.ts) types the lines below. No imports:
// the Worker and `npm test` load this file as it is.

export const WHOAMI_PATH = '/v1/whoami';

/** What the Worker sends back: Cloudflare's view of the request. */
export interface NetFacts {
  ip: string;
  city?: string;
  region?: string;
  /** ISO 3166 code; "T1" is Tor, "XX" unknown. */
  country?: string;
  asn?: number;
  /** The ASN's owner, as registered. */
  org?: string;
  /** IANA time zone of the IP's location. */
  timezone?: string;
}

const text = (v: unknown, max = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/** The facts from the visitor's address and Cloudflare's request.cf; null without an address. */
export function factsOf(ip: string | null | undefined, cf: Record<string, unknown> | undefined): NetFacts | null {
  const addr = text(ip, 64);
  if (!addr) return null;
  const c = cf ?? {};
  const asn = typeof c.asn === 'number' && Number.isInteger(c.asn) && c.asn > 0 ? c.asn : undefined;
  const out: NetFacts = { ip: addr };
  const put = <K extends keyof NetFacts>(k: K, v: NetFacts[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  put('city', text(c.city));
  put('region', text(c.region));
  put('country', text(c.country, 2)?.toUpperCase());
  put('asn', asn);
  put('org', text(c.asOrganization));
  put('timezone', text(c.timezone, 64));
  return out;
}

/** Networks that rent out servers: VPNs and proxies leave the internet from these. */
const HOSTING_ASNS = new Set([
  16509, 14618, // Amazon
  15169, 396982, 19527, // Google
  8075, 8068, // Microsoft
  14061, // DigitalOcean
  16276, // OVH
  24940, 213230, // Hetzner
  63949, // Linode (Akamai)
  20473, // Vultr
  51167, // Contabo
  31898, // Oracle
  45102, // Alibaba
  132203, // Tencent
  12876, // Scaleway
  60781, 28753, // Leaseweb
  9009, // M247
  60068, 212238, // CDN77 / Datacamp
  62240, // Clouvider
  136787, // Tefincom
]);
const HOSTING_WORDS = /\b(hosting|host|cloud|data ?cent(?:er|re)s?|servers?|vps|colo(?:cation)?|amazon|digitalocean|ovh|hetzner|linode|vultr|choopa|contabo|leaseweb|scaleway|m247|datacamp|cdn77|clouvider|packethub|tefincom)\b/i;

/** Relays that hide the address on purpose: Cloudflare WARP and iCloud Private Relay. */
const RELAYS: Record<number, string> = {
  13335: 'Cloudflare WARP or Private Relay',
  36183: 'iCloud Private Relay',
  54113: 'iCloud Private Relay',
};

/** Minutes ahead of UTC in a time zone at a moment; null if the browser can't say. */
export function offsetOf(tz: string, at: Date): number | null {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    if (!name) return null;
    if (name === 'GMT') return 0;
    const m = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(name);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : null;
  } catch {
    return null;
  }
}

export interface Assessment {
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  /** What lowered the score, most serious first; empty for a clean address. */
  flags: string[];
  /** Tor, Anonymous relay, Hosting or ISP. */
  kind: string;
}

export function gradeOf(score: number): Assessment['grade'] {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 25) return 'D';
  return 'F';
}

/**
 * cleanip.io's purity score, roughly: 100 for an ordinary home or mobile
 * connection, less for a Tor exit, a relay, a server network (where VPNs and
 * proxies live), or an IP whose time zone isn't the browser's.
 */
export function assess(f: NetFacts, browserTz: string | undefined, at = new Date()): Assessment {
  const flags: string[] = [];
  let score = 100;
  let kind = 'ISP (home or mobile)';
  const tor = f.country === 'T1';
  const relay = f.asn ? RELAYS[f.asn] : undefined;
  const hosting = !relay && ((f.asn !== undefined && HOSTING_ASNS.has(f.asn)) || (!!f.org && HOSTING_WORDS.test(f.org)));
  if (tor) {
    flags.push('Tor exit');
    score -= 80;
    kind = 'Tor';
  } else if (relay) {
    flags.push(relay);
    score -= 25;
    kind = 'Anonymous relay';
  } else if (hosting) {
    flags.push('Server network (VPN or proxy?)');
    score -= 45;
    kind = 'Hosting / data centre';
  }
  if (!tor && f.timezone && browserTz && f.timezone !== browserTz) {
    const a = offsetOf(f.timezone, at);
    const b = offsetOf(browserTz, at);
    if (a !== null && b !== null && a !== b) {
      flags.push('Time zone differs from browser');
      score -= 20;
    }
  }
  score = Math.max(0, Math.min(100, score));
  return { score, grade: gradeOf(score), flags, kind };
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

/** "United Kingdom" for "GB"; Tor and unknown spelled out. */
export function countryName(code: string | undefined): string | undefined {
  if (!code || code === 'XX') return undefined;
  if (code === 'T1') return 'Tor network';
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** "London, England, United Kingdom", without repeats or gaps. */
export function placeOf(f: NetFacts): string {
  const parts: string[] = [];
  for (const p of [f.city, f.region, countryName(f.country)]) if (p && !parts.includes(p)) parts.push(p);
  return parts.join(', ') || 'Unknown';
}

const row = (label: string, value: string) => `${label.padEnd(17)}: ${value}`;

/** The BIOS screen's network lines, in the order cleanip.io shows them. */
export function biosLines(f: NetFacts, browserTz: string | undefined, at = new Date()): string[] {
  const a = assess(f, browserTz, at);
  return [
    row('IP Address', f.ip),
    row('Location', placeOf(f)),
    row('ASN Number', f.asn ? `AS${f.asn}` : 'Unknown'),
    row('ASN Owner', f.org ?? 'Unknown'),
    row('Network Type', a.kind),
    row('Proxy/VPN/Tor', a.flags.length ? a.flags.join(', ') : 'None detected'),
    row('IP Purity Score', `${a.score}/100 (${a.grade})`),
  ];
}
