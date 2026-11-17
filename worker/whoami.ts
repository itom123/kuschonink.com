// GET /v1/whoami: the visitor's own IP address and what Cloudflare knows about
// it (place, network), for the start-up screen (src/lib/netcheck.ts), with
// IPQualityScore's verdict on the address when IPQS_KEY is set (worker/ipqs.ts).
// Nothing about the visitor is logged, and the answer is never cached in the
// browser or on the way, so it is only ever the asker's.
import { factsOf, WHOAMI_PATH, type IpqsFacts } from '../src/lib/netcheck.ts';

export { WHOAMI_PATH };

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, private',
  'x-robots-tag': 'noindex',
  'referrer-policy': 'no-referrer',
};

export interface WhoamiDeps {
  /** IPQualityScore's verdict on an address (worker/ipqs.ts); missing or null leaves it out. */
  ipqs?: (ip: string) => Promise<IpqsFacts | null>;
}

export async function handleWhoami(req: Request, deps: WhoamiDeps = {}): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...HEADERS, allow: 'GET, HEAD' } });
  }
  const cf = (req as Request & { cf?: Record<string, unknown> }).cf;
  const facts = factsOf(req.headers.get('cf-connecting-ip'), cf);
  if (!facts) return new Response(JSON.stringify({ error: 'unknown' }), { status: 404, headers: HEADERS });
  if (req.method === 'HEAD') return new Response(null, { headers: HEADERS });
  const verdict = deps.ipqs ? await deps.ipqs(facts.ip).catch(() => null) : null;
  if (verdict) facts.ipqs = verdict;
  return new Response(JSON.stringify(facts), { headers: HEADERS });
}
