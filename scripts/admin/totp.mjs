#!/usr/bin/env node
// Makes a new authenticator key for the admin log-on (docs/ADMIN.md).
//
//   node scripts/admin/totp.mjs
//
// It prints the key and an otpauth:// link. Add the key to your authenticator
// app (1Password, Bitwarden, Google Authenticator: "enter a setup key",
// time-based, 6 digits, 30 seconds), then save the same key as the Cloudflare
// secret ADMIN_TOTP_SECRET. Nothing is written to disk; run it yourself, in
// your own terminal, and don't paste the key anywhere else.
import { randomBytes } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes) {
  let bits = 0, value = 0, out = '';
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

const secret = base32(randomBytes(20)); // 160 bits, as RFC 4226 recommends
const label = `${encodeURIComponent('Xiangyin 98')}:${encodeURIComponent('Administrator')}`;
const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('Xiangyin 98')}&algorithm=SHA1&digits=6&period=30`;

console.log(`
New authenticator key for the admin log-on

  Key:   ${secret.replace(/(.{4})/g, '$1 ').trim()}

  Link:  ${uri}

1. In your authenticator app, add an account with this key (time-based,
   6 digits). Or open the link on a phone that has the app.
2. In Cloudflare (Workers & Pages > kuschonink > Settings > Variables and
   Secrets), add a Secret named ADMIN_TOTP_SECRET with the key (spaces don't
   matter).
3. Close this window. The key isn't kept anywhere else.
`);
