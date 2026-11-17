// npm test: the start-up screen's network check (worker/whoami.ts, src/lib/netcheck.ts).
import { assess, biosLines, factsOf, gradeOf, offsetOf, placeOf, type NetFacts } from '../src/lib/netcheck.ts';
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
  const res = handleWhoami(req());
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
  const res = handleWhoami(req('POST'));
  check('POST is refused', res.status === 405 && res.headers.get('allow') === 'GET, HEAD', res.status);
  check('HEAD has no body', (await handleWhoami(req('HEAD')).text()) === '');
  check('no address, no answer', handleWhoami(req('GET', null)).status === 404);
  const bare = (await handleWhoami(req('GET', '2001:db8::1', null)).json()) as NetFacts;
  check('no request.cf: the address alone', bare.ip === '2001:db8::1' && Object.keys(bare).length === 1, bare);
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

if (fails) {
  console.error(`whoami: ${fails} failed`);
  process.exit(1);
}
console.log('whoami: all passed');
