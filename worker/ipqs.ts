// IPQualityScore's verdict on the visitor's address, for the start-up screen
// (src/lib/netcheck.ts), when IPQS_KEY is set. The Worker sends IPQS the
// address alone: no user agent, no cookie, nothing else about the visit. The
// key goes in a header, never in a URL. Only the verdict is kept (fraud score,
// VPN, proxy, Tor, abuse, bots, connection type): at the edge, for 6 hours,
// under an HMAC of the address, so a reload or the next page doesn't spend
// another lookup. The address itself is never kept or logged.
import type { IpqsFacts } from '../src/lib/netcheck.ts';

export const IPQS_API = 'https://ipqualityscore.com/api/json/ip';
/** How long the edge keeps a verdict. */
export const IPQS_EDGE_S = 6 * 3600;
/** IPQS must answer within this, or the screen goes on without it. */
export const IPQS_TIMEOUT_MS = 1200;

export interface IpqsDeps {
  /** The IPQualityScore API key (a secret); without it there is no lookup. */
  key: string | undefined;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** The edge cache (caches.default), if there is one. */
  cache?: { match(key: Request): Promise<Response | undefined>; put(key: Request, res: Response): Promise<unknown> };
  /** Lookups asked of IPQS for this visitor (a rate limit). Missing allows every one. */
  allow?: (ip: string) => Promise<boolean>;
  log: (...args: unknown[]) => void;
  timeoutMs?: number;
}

/** The verdict from IPQS's answer; null unless it is a successful one. */
export function ipqsOf(body: unknown): IpqsFacts | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.success !== true) return null;
  const fraud = typeof b.fraud_score === 'number' ? b.fraud_score : Number.NaN;
  if (!Number.isFinite(fraud) || fraud < 0 || fraud > 100) return null;
  const yes = (k: string) => b[k] === true;
  const out: IpqsFacts = {
    fraud: Math.round(fraud),
    proxy: yes('proxy'),
    vpn: yes('vpn') || yes('active_vpn'),
    tor: yes('tor') || yes('active_tor'),
    abuse: yes('recent_abuse'),
    bot: yes('bot_status'),
  };
  const type = typeof b.connection_type === 'string' ? b.connection_type.trim().slice(0, 40) : '';
  if (type && type.toUpperCase() !== 'N/A') out.type = type;
  return out;
}

/** What the edge keeps, read back in IPQS's own shape so ipqsOf checks it too. */
const keptOf = (k: Partial<IpqsFacts>) =>
  ipqsOf({ success: true, fraud_score: k.fraud, proxy: k.proxy, vpn: k.vpn, tor: k.tor, recent_abuse: k.abuse, bot_status: k.bot, connection_type: k.type });

async function hmac(key: string, text: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
  return Array.from(sig, (x) => x.toString(16).padStart(2, '0')).join('');
}

const why = (e: unknown) => (e as Error)?.message ?? String(e);

/** IPQS's verdict on one address: from the edge if it was asked lately, else from IPQS. null if it can't say. */
export async function ipqsLookup(ip: string, deps: IpqsDeps): Promise<IpqsFacts | null> {
  const key = deps.key?.trim();
  if (!key) return null;
  // The edge's key is an HMAC of the address with the API key: it can't be turned back into the address.
  const slot = new Request(`${IPQS_API}/kus98-verdict/${await hmac(key, ip)}`, { method: 'GET' });
  try {
    const hit = await deps.cache?.match(slot);
    if (hit) {
      const kept = keptOf((await hit.json()) as Partial<IpqsFacts>);
      if (kept) return kept;
    }
  } catch (e) {
    deps.log('whoami: ipqs cache match failed', why(e));
  }
  if (deps.allow && !(await deps.allow(ip))) return null;
  let body: unknown;
  try {
    const query = new URLSearchParams({ ip, strictness: '0', fast: 'true', allow_public_access_points: 'true' });
    const res = await deps.fetch(`${IPQS_API}?${query}`, {
      method: 'GET',
      headers: { 'IPQS-KEY': key, accept: 'application/json' },
      signal: AbortSignal.timeout(deps.timeoutMs ?? IPQS_TIMEOUT_MS),
    });
    if (!res.ok) {
      deps.log('whoami: ipqs HTTP', res.status);
      void res.body?.cancel().catch(() => {});
      return null;
    }
    body = await res.json();
  } catch (e) {
    deps.log('whoami: ipqs failed', why(e));
    return null;
  }
  const facts = ipqsOf(body);
  if (!facts) {
    // IPQS's message ("insufficient credits", a bad key...) never holds the address.
    const msg = (body as { message?: unknown } | null)?.message;
    deps.log('whoami: ipqs refused', typeof msg === 'string' ? msg.slice(0, 200) : '(no message)');
    return null;
  }
  try {
    await deps.cache?.put(slot, new Response(JSON.stringify(facts), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${IPQS_EDGE_S}` } }));
  } catch (e) {
    deps.log('whoami: ipqs cache put failed', why(e));
  }
  return facts;
}
