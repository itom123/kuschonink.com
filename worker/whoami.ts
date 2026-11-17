// GET /v1/whoami: the visitor's own IP address and what Cloudflare knows about
// it (place, network), for the start-up screen (src/lib/netcheck.ts). It only
// reads the request: nothing is asked of anyone else, kept or logged, and the
// answer is never cached, so it is only ever the asker's.
import { factsOf, WHOAMI_PATH } from '../src/lib/netcheck.ts';

export { WHOAMI_PATH };

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, private',
  'x-robots-tag': 'noindex',
  'referrer-policy': 'no-referrer',
};

export function handleWhoami(req: Request): Response {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...HEADERS, allow: 'GET, HEAD' } });
  }
  const cf = (req as Request & { cf?: Record<string, unknown> }).cf;
  const facts = factsOf(req.headers.get('cf-connecting-ip'), cf);
  if (!facts) return new Response(JSON.stringify({ error: 'unknown' }), { status: 404, headers: HEADERS });
  return new Response(req.method === 'HEAD' ? null : JSON.stringify(facts), { headers: HEADERS });
}
