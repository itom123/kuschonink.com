// npm test: the start-up screen's network check (worker/whoami.ts, worker/ipqs.ts, src/lib/netcheck.ts).
import { assess, biosLines, factsOf, fraudBand, gradeOf, offsetOf, placeOf, type IpqsFacts, type NetFacts } from '../src/lib/netcheck.ts';
import { IPQS_API, IPQS_EDGE_S, ipqsLookup, ipqsOf, type IpqsDeps } from './ipqs.ts';
import { handleWhoami, WHOAMI_PATH } from './whoami.ts';

let fails = 0;
const check = (name: string, ok: boolean, got?: unknown) => {
  if (!ok) {
    fails++;
    console.error(`FAIL ${name}`, got === undefined ? '' : JSON.stringify(got));
  }
};

const BT = { city: 'London', region: 'England', country: 'GB', asn: 2856, asOrganization: 'British Telecommunications PLC', timezone: 'Europe/London', colo: 'LHR', latitude: '51.5', clientTcpRtt: 12 };
const req = (method = 'GET', ip: string | null = '203.0.113.7', cf: Record<string, unknown> | null = BT) => {
  const r = new Request(`https://kuschonink.com${WHOAMI_PATH}`, { method, headers: ip ? { 'cf-connecting-ip': ip } : {} });
  if (cf) Object.defineProperty(r, 'cf', { value: cf }); // null: no request.cf, as in some local runs
  return r;
};

// The Worker's answer: only the asker's own facts, never cached.
{
  const res = await handleWhoami(req());
  check('GET answers 200', res.status === 200, res.status);
  check('never cached', /no-store/.test(res.headers.get('cache-control') ?? ''), res.headers.get('cache-control'));
  check('not indexed', res.headers.get('x-robots-tag') === 'noindex');
  const body = (await res.json()) as NetFacts;
  check('ip', body.ip === '203.0.113.7', body);
  check('place', body.city === 'London' && body.region === 'England' && body.country === 'GB', body);
  check('network', body.asn === 2856 && body.org === 'British Telecommunications PLC', body);
  check('time zone', body.timezone === 'Europe/London', body);
  check('only the listed facts', Object.keys(body).sort().join() === 'asn,city,country,ip,org,region,timezone', Object.keys(body));
}
{
  const res = await handleWhoami(req('POST'));
  check('POST is refused', res.status === 405 && res.headers.get('allow') === 'GET, HEAD', res.status);
  check('HEAD has no body', (await (await handleWhoami(req('HEAD'))).text()) === '');
  check('no address, no answer', (await handleWhoami(req('GET', null))).status === 404);
  const bare = (await (await handleWhoami(req('GET', '2001:db8::1', null))).json()) as NetFacts;
  check('no request.cf: the address alone', bare.ip === '2001:db8::1' && Object.keys(bare).length === 1, bare);
}

// IPQualityScore: the Worker's lookup.
const CLEAN = { success: true, message: 'Success.', fraud_score: 0, proxy: false, vpn: false, active_vpn: false, tor: false, active_tor: false, recent_abuse: false, bot_status: false, connection_type: 'Residential', ISP: 'BT', city: 'London', request_id: 'r1' };
const KEY = 'test-ipqs-key-0123456789';
const calls: { url: string; init: RequestInit }[] = [];
const logs: string[] = [];
const store = new Map<string, { body: string; cc: string | null }>();
const cache: NonNullable<IpqsDeps['cache']> = {
  match: async (k) => {
    const v = store.get(k.url);
    return v ? new Response(v.body) : undefined;
  },
  put: async (k, res) => {
    store.set(k.url, { body: await res.text(), cc: res.headers.get('cache-control') });
  },
};
const answer = (body: unknown, status = 200) => async (url: string, init: RequestInit) => {
  calls.push({ url, init });
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
};
const qdeps = (o: Partial<IpqsDeps> = {}): IpqsDeps => ({ key: KEY, fetch: answer(CLEAN), cache, log: (...a) => logs.push(a.join(' ')), ...o });
const reset = () => {
  calls.length = 0;
  logs.length = 0;
  store.clear();
};

{
  reset();
  const f = await ipqsLookup('203.0.113.7', qdeps());
  check('a clean verdict', JSON.stringify(f) === JSON.stringify({ fraud: 0, proxy: false, vpn: false, tor: false, abuse: false, bot: false, type: 'Residential' }), f);
  check('one call to IPQS', calls.length === 1, calls.length);
  const u = new URL(calls[0].url);
  check('the documented endpoint', `${u.origin}${u.pathname}` === IPQS_API, u.href);
  check('the address, gently', u.searchParams.get('ip') === '203.0.113.7' && u.searchParams.get('strictness') === '0' && u.searchParams.get('fast') === 'true', u.search);
  check('the key in a header, never the URL', (calls[0].init.headers as Record<string, string>)['IPQS-KEY'] === KEY && !calls[0].url.includes(KEY), calls[0].url);
  check('nothing else about the visit', [...u.searchParams.keys()].sort().join() === 'allow_public_access_points,fast,ip,strictness', [...u.searchParams.keys()]);
  check('a time limit', calls[0].init.signal instanceof AbortSignal);
  const [slot, kept] = [...store.entries()][0] ?? [];
  check('kept at the edge', !!kept && kept.cc === `public, max-age=${IPQS_EDGE_S}`, kept);
  check('the edge keeps no address and no key', !!slot && !slot.includes('203.0.113.7') && !slot.includes(KEY) && !kept!.body.includes('203.0.113.7') && !kept!.body.includes('London'), [slot, kept]);
  const again = await ipqsLookup('203.0.113.7', qdeps());
  check('the second time comes from the edge', calls.length === 1 && JSON.stringify(again) === JSON.stringify(f), calls.length);
  await ipqsLookup('203.0.113.8', qdeps());
  check('another address is asked', calls.length === 2 && store.size === 2, calls.length);
  check('nothing logged', logs.length === 0, logs);
}
{
  reset();
  check('no key, no lookup', (await ipqsLookup('203.0.113.7', qdeps({ key: undefined }))) === null && (await ipqsLookup('203.0.113.7', qdeps({ key: '  ' }))) === null && calls.length === 0);
  const seen: string[] = [];
  const limited = await ipqsLookup('203.0.113.7', qdeps({ allow: async (ip) => (seen.push(ip), false) }));
  check('over the limit, no lookup', limited === null && calls.length === 0 && seen[0] === '203.0.113.7', seen);
  const out = await ipqsLookup('203.0.113.7', qdeps({ fetch: answer({ success: false, message: 'You have insufficient credits to make this query.', request_id: 'r2' }) }));
  check('out of credits: none, and said', out === null && logs.some((l) => l.includes('insufficient credits')), logs);
  check('a refusal is not kept', store.size === 0);
  check('HTTP error: none', (await ipqsLookup('203.0.113.7', qdeps({ fetch: answer('oops', 500) }))) === null && logs.some((l) => l.includes('HTTP 500')), logs);
  check('not JSON: none', (await ipqsLookup('203.0.113.7', qdeps({ fetch: answer('<html>', 200) }))) === null);
  check('IPQS down: none', (await ipqsLookup('203.0.113.7', qdeps({ fetch: async () => { throw new Error('timed out'); } }))) === null && logs.some((l) => l.includes('timed out')));
  check('never logs the address', !logs.some((l) => l.includes('203.0.113.7')), logs);
  const broken = await ipqsLookup('203.0.113.7', qdeps({ cache: { match: async () => { throw new Error('x'); }, put: async () => { throw new Error('y'); } } }));
  check('a broken edge cache still answers', broken?.fraud === 0, broken);
}
{
  check('fraud score out of range: none', ipqsOf({ ...CLEAN, fraud_score: 101 }) === null && ipqsOf({ ...CLEAN, fraud_score: '5' }) === null && ipqsOf(null) === null);
  const v = ipqsOf({ ...CLEAN, fraud_score: 87.6, proxy: true, active_vpn: true, active_tor: true, recent_abuse: true, bot_status: true, connection_type: 'N/A' });
  check('every sign read, rounded', JSON.stringify(v) === JSON.stringify({ fraud: 88, proxy: true, vpn: true, tor: true, abuse: true, bot: true }), v);
}

// The handler with IPQS.
{
  const verdict: IpqsFacts = { fraud: 12, proxy: false, vpn: false, tor: false, abuse: false, bot: false, type: 'Residential' };
  const asked: string[] = [];
  const body = (await (await handleWhoami(req(), { ipqs: async (ip) => (asked.push(ip), verdict) })).json()) as NetFacts;
  check('the verdict goes along', JSON.stringify(body.ipqs) === JSON.stringify(verdict) && asked[0] === '203.0.113.7', body);
  await handleWhoami(req('HEAD'), { ipqs: async (ip) => (asked.push(ip), verdict) });
  check('HEAD asks no one', asked.length === 1, asked);
  const failed = (await (await handleWhoami(req(), { ipqs: async () => { throw new Error('boom'); } })).json()) as NetFacts;
  check('IPQS failing leaves Cloudflare’s facts', failed.ip === '203.0.113.7' && failed.ipqs === undefined, failed);
}

// What factsOf accepts.
{
  const f = factsOf(' 198.51.100.2 ', { asn: -3, country: 'gbr', city: '', asOrganization: 7, timezone: 'x'.repeat(200) });
  check('trims the address', f?.ip === '198.51.100.2', f);
  check('drops a bad ASN and empty or wrong-typed fields', f?.asn === undefined && f?.city === undefined && f?.org === undefined, f);
  check('country is two letters', f?.country === 'GB', f);
  check('long values are cut', (f?.timezone?.length ?? 0) === 64, f?.timezone?.length);
  check('a blank address is none', factsOf('  ', BT) === null);
}

// The score.
const at = new Date('2026-07-01T12:00:00Z');
const home = factsOf('203.0.113.7', BT)!;
{
  const a = assess(home, 'Europe/London', at);
  check('home broadband is clean', a.score === 100 && a.grade === 'A+' && a.flags.length === 0 && a.kind.startsWith('ISP'), a);
  check('same offset, other zone: still clean', assess(home, 'Europe/Lisbon', at).score === 100);
  const away = assess(home, 'America/New_York', at);
  check('time zone mismatch', away.score === 80 && away.grade === 'B' && away.flags[0] === 'Time zone differs from browser', away);
  check('unknown browser zone: no judgement', assess(home, undefined, at).score === 100);
}
{
  const aws = assess(factsOf('3.3.3.3', { ...BT, asn: 16509, asOrganization: 'AMAZON-02' })!, 'Europe/London', at);
  check('a server network', aws.score === 55 && aws.grade === 'C' && aws.kind === 'Hosting / data centre', aws);
  const named = assess(factsOf('5.5.5.5', { ...BT, asn: 64512, asOrganization: 'Example Hosting Ltd' })!, 'Europe/London', at);
  check('a server network by name', named.kind === 'Hosting / data centre', named);
  const colombia = assess(factsOf('5.5.5.6', { ...BT, asn: 64513, asOrganization: 'Colombia Movil' })!, 'Europe/London', at);
  check('"Colombia" is not "colo"', colombia.score === 100, colombia);
  const cloudflare = assess(factsOf('104.28.1.1', { ...BT, asn: 13335, asOrganization: 'Cloudflare, Inc.' })!, 'Europe/London', at);
  check('WARP / Private Relay', cloudflare.score === 75 && cloudflare.kind === 'Anonymous relay', cloudflare);
  const tor = assess(factsOf('185.220.101.1', { country: 'T1', asn: 60729, asOrganization: 'Stiftung Erneuerbare Freiheit', timezone: 'Europe/Berlin' })!, 'Asia/Tokyo', at);
  check('Tor exit', tor.score === 20 && tor.grade === 'F' && tor.flags.length === 1 && tor.kind === 'Tor', tor);
}
check('grades', ['A+', 'A', 'B', 'C', 'D', 'F'].join() === [100, 90, 75, 60, 30, 0].map(gradeOf).join());
check('offsets', offsetOf('Europe/London', at) === 60 && offsetOf('Asia/Kolkata', at) === 330 && offsetOf('UTC', at) === 0 && offsetOf('Not/AZone', at) === null);

// The BIOS lines.
{
  check('place', placeOf(home) === 'London, England, United Kingdom', placeOf(home));
  check('place without repeats', placeOf({ ip: '1', city: 'Singapore', region: 'Singapore', country: 'SG' }) === 'Singapore', placeOf({ ip: '1', city: 'Singapore', region: 'Singapore', country: 'SG' }));
  check('place unknown', placeOf({ ip: '1', country: 'XX' }) === 'Unknown');
  const lines = biosLines(home, 'Europe/London', at);
  const want = [
    'IP Address       : 203.0.113.7',
    'Location         : London, England, United Kingdom',
    'ASN Number       : AS2856',
    'ASN Owner        : British Telecommunications PLC',
    'Network Type     : ISP (home or mobile)',
    'Proxy/VPN/Tor    : None detected',
    'IP Purity Score  : 100/100 (A+)',
  ];
  check('lines', lines.join('\n') === want.join('\n'), lines);
  const bare = biosLines({ ip: '2001:db8::1' }, undefined, at);
  check('lines with the address alone', bare[2].endsWith('Unknown') && bare[3].endsWith('Unknown') && bare[6].endsWith('100/100 (A+)'), bare);
}

// The score with IPQS.
{
  const q = (o: Partial<IpqsFacts>): NetFacts => ({ ...home, ipqs: { fraud: 0, proxy: false, vpn: false, tor: false, abuse: false, bot: false, type: 'Residential', ...o } });
  const clean = assess(q({}), 'Europe/London', at);
  check('IPQS clean', clean.score === 100 && clean.kind === 'Residential' && clean.flags.length === 0, clean);
  check('IPQS mobile, corporate', assess(q({ type: 'Mobile' }), 'Europe/London', at).kind === 'Mobile' && assess(q({ type: 'corporate' }), 'Europe/London', at).kind === 'Business');
  const vpn = assess(q({ vpn: true, proxy: true, type: 'Data Center', fraud: 40 }), 'Europe/London', at);
  check('a VPN', vpn.score === 55 && vpn.grade === 'C' && vpn.flags.join() === 'VPN' && vpn.kind === 'Hosting / data centre', vpn);
  const proxy = assess(q({ proxy: true }), 'Europe/London', at);
  check('a proxy', proxy.score === 50 && proxy.flags.join() === 'Proxy', proxy);
  const dc = assess(q({ type: 'Data Center' }), 'Europe/London', at);
  check('IPQS data centre, no VPN', dc.score === 55 && dc.flags.join() === 'Server network', dc);
  const bt = assess(q({}), 'Europe/London', at);
  check('IPQS outranks the ASN guess', bt.kind === 'Residential', bt);
  const notHosting = assess({ ...factsOf('3.3.3.3', { ...BT, asn: 16509, asOrganization: 'AMAZON-02' })!, ipqs: { fraud: 0, proxy: false, vpn: false, tor: false, abuse: false, bot: false, type: 'Residential' } }, 'Europe/London', at);
  check('IPQS residential on a cloud ASN: residential', notHosting.score === 100 && notHosting.kind === 'Residential', notHosting);
  const bad = assess(q({ abuse: true, bot: true }), 'America/New_York', at);
  check('abuse, bots and a time zone add up', bad.score === 40 && bad.flags.join() === 'Recent abuse,Bot activity,Time zone differs from browser', bad);
  const fraud = assess(q({ fraud: 88 }), 'Europe/London', at);
  check('never above 100 minus the fraud score', fraud.score === 12 && fraud.grade === 'F', fraud);
  const tor = assess(q({ tor: true, proxy: true }), 'Europe/London', at);
  check('IPQS Tor', tor.kind === 'Tor' && tor.flags.join() === 'Tor exit' && tor.score === 20, tor);
  check('fraud bands', [0, 74, 75, 85, 90].map(fraudBand).join() === 'low risk,low risk,suspicious,high risk,likely abuse');
  const lines = biosLines(q({ fraud: 12 }), 'Europe/London', at);
  check('the IPQS line, before purity', lines.length === 8 && lines[6] === 'IPQS Fraud Score : 12/100 (low risk)' && lines[7] === 'IP Purity Score  : 88/100 (A)', lines);
}

if (fails) {
  console.error(`whoami: ${fails} failed`);
  process.exit(1);
}
console.log('whoami: all passed');
