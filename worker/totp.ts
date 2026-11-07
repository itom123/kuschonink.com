// Six-digit authenticator codes (TOTP, RFC 6238: HMAC-SHA-1, 30-second steps)
// for the admin log-on. WebCrypto only, so the same code runs in workerd and in
// Node (worker/totp.test.mts). The secret is base32, as authenticator apps take
// it; scripts/admin/totp.mjs makes one.

export const STEP_S = 30;
export const DIGITS = 6;
/** A secret shorter than this (in bytes, after base32) counts as not set. */
export const MIN_SECRET_BYTES = 16;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 (RFC 4648) to bytes; spaces, dashes, padding and case don't matter. Null when it isn't base32. */
export function base32Decode(s: string): Uint8Array | null {
  const clean = s.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = ((value << 5) | B32.indexOf(c)) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Bytes to base32, without padding. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = ((value << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** The HOTP code for one counter (RFC 4226). */
export async function hotp(key: Uint8Array, counter: number, digits = DIGITS): Promise<string> {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c % 256;
    c = Math.floor(c / 256);
  }
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg));
  const off = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** The 30-second step a time falls in. */
export const stepAt = (nowMs: number) => Math.floor(nowMs / 1000 / STEP_S);

/**
 * The step whose code this is (the current one, or one either side for a
 * clock that is a little off), or null. Every candidate is computed and
 * compared in full, so the time taken says nothing about the code.
 */
export async function checkTotp(secret: string, code: string, nowMs: number, window = 1): Promise<number | null> {
  const key = base32Decode(secret);
  const given = code.replace(/\s/g, '');
  if (!key || key.length < MIN_SECRET_BYTES || !/^\d{6}$/.test(given)) return null;
  const now = stepAt(nowMs);
  let found: number | null = null;
  for (let s = now - window; s <= now + window; s++) {
    const want = await hotp(key, s);
    let d = 0;
    for (let i = 0; i < DIGITS; i++) d |= want.charCodeAt(i) ^ given.charCodeAt(i);
    if (d === 0 && found === null) found = s;
  }
  return found;
}

/** The link an authenticator app reads (as a QR code or pasted). */
export function otpauthUri(secret: string, account = 'Administrator', issuer = 'Xiangyin 98'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const q = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_S) });
  return `otpauth://totp/${label}?${q}`;
}
