// The cloud routine's API trigger (a Claude Code scheduled task, formerly a
// routine; docs/GUIDES.md section 11.6): admin mode's Approve and Run Now POST
// to its Fire URL with the trigger's own token.
//
// Anthropic ships the /fire endpoint behind a dated beta header while it is
// in research preview. A newer date is a one-line change here; the two
// previous dates keep working for a while.

export const ROUTINE_BETA = 'experimental-cc-routine-2026-04-01';
export const ANTHROPIC_VERSION = '2023-06-01';
/** Only Anthropic's own fire endpoint, so the token never goes anywhere else. */
export const FIRE_URL = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9_-]+\/fire$/;

/** Start the routine with a text, or null when the trigger isn't set up (or its URL isn't Anthropic's). */
export function routineTrigger(o: { url?: string; token?: string; fetch: typeof fetch }): ((text: string) => Promise<{ url?: string }>) | null {
  const url = o.url?.trim() ?? '';
  if (!o.token || !FIRE_URL.test(url)) return null;
  return async (text) => {
    const res = await o.fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${o.token}`,
        'anthropic-beta': ROUTINE_BETA,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`routine fire HTTP ${res.status}`);
    const j = (await res.json().catch(() => ({}))) as { claude_code_session_url?: string };
    return { url: j.claude_code_session_url };
  };
}
