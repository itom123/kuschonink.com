// The start-up screen's network check, after cleanip.io: the visitor's IP
// address, where it is, the network (ASN) it belongs to, IPQualityScore's
// fraud score, and a purity score with what lowered it. The Worker
// (worker/whoami.ts) answers with what Cloudflare already knows about the
// request, and with IPQualityScore's verdict on the address when it is set up
// (worker/ipqs.ts). The browser adds its own time zone, and the BIOS screen
// (src/scripts/desktop/boot.ts) types the lines below. No imports: the Worker
// and `npm test` load this file as it is.

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
  /** IPQualityScore's verdict, when it answered (worker/ipqs.ts). */
  ipqs?: IpqsFacts;
}

/** The part of IPQualityScore's answer the screen shows. Nothing else of it is kept. */
export interface IpqsFacts {
  /** 0 to 100; IPQS reads 75+ as suspicious, 85+ as high risk, 90+ as likely abuse. */
  fraud: number;
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  /** Seen in recent abuse: fraud, chargebacks, compromised devices. */
  abuse: boolean;
  /** Bots seen on the address. */
  bot: boolean;
  /** IPQS's connection type: Residential, Mobile, Corporate, Data Center, Education. */
  type?: string;
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
  /** The kind of network: Tor, a relay, IPQS's connection type, or a guess from the ASN. */
  kind: string;
}

/** IPQS's own reading of its fraud score. */
export function fraudBand(fraud: number): string {
  if (fraud >= 90) return 'likely abuse';
  if (fraud >= 85) return 'high risk';
  if (fraud >= 75) return 'suspicious';
  return 'low risk';
}

const TYPES: Record<string, string> = {
  residential: 'Residential',
  mobile: 'Mobile',
  corporate: 'Business',
  'data center': 'Hosting / data centre',
  education: 'Education',
};

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
 * connection, less for a Tor exit, a relay, a VPN or proxy, a server network
 * (where VPNs and proxies live), recent abuse or bots, or an IP whose time zone
 * isn't the browser's. Only the worst of the hiding signs counts. With
 * IPQualityScore's verdict, the score is never above 100 minus its fraud score.
 */
export function assess(f: NetFacts, browserTz: string | undefined, at = new Date()): Assessment {
  const q = f.ipqs;
  const flags: string[] = [];
  let hiding = 0;
  const mark = (flag: string, penalty: number) => {
    flags.push(flag);
    hiding = Math.max(hiding, penalty);
  };
  const tor = f.country === 'T1' || !!q?.tor;
  const relay = f.asn ? RELAYS[f.asn] : undefined;
  const hostingGuess = !relay && ((f.asn !== undefined && HOSTING_ASNS.has(f.asn)) || (!!f.org && HOSTING_WORDS.test(f.org)));
  const type = q?.type ? TYPES[q.type.toLowerCase()] ?? q.type : undefined;
  // IPQS's connection type, when it gave one, outranks the guess from the ASN.
  const server = type ? type === TYPES['data center'] : hostingGuess;
  if (tor) mark('Tor exit', 80);
  else {
    if (relay) mark(relay, 25);
    if (q?.vpn) mark('VPN', 45);
    else if (q?.proxy) mark('Proxy', 50);
    else if (server && !relay) mark(q ? 'Server network' : 'Server network (VPN or proxy?)', 45);
  }
  let score = 100 - hiding;
  if (q?.abuse) {
    flags.push('Recent abuse');
    score -= 25;
  }
  if (q?.bot) {
    flags.push('Bot activity');
    score -= 15;
  }
  if (!tor && f.timezone && browserTz && f.timezone !== browserTz) {
    const a = offsetOf(f.timezone, at);
    const b = offsetOf(browserTz, at);
    if (a !== null && b !== null && a !== b) {
      flags.push('Time zone differs from browser');
      score -= 20;
    }
  }
  if (q) score = Math.min(score, 100 - q.fraud);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const kind = tor ? 'Tor' : relay ? 'Anonymous relay' : type ?? (hostingGuess ? TYPES['data center'] : 'ISP (home or mobile)');
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
    ...(f.ipqs ? [row('IPQS Fraud Score', `${f.ipqs.fraud}/100 (${fraudBand(f.ipqs.fraud)})`)] : []),
    row('IP Purity Score', `${a.score}/100 (${a.grade})`),
  ];
}
