// A small RFC 5322 / MIME builder for the classic Email Routing send path,
// which only accepts a raw message (cloudflare:email EmailMessage).
import type { EmailOut } from './contact';

const encoder = new TextEncoder();

function base64(s: string): string {
  const bytes = encoder.encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const wrap = (s: string) => s.replace(/.{1,76}/g, '$&\r\n');
/** Encoded-word for headers that may contain non-ASCII text. */
const word = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${base64(s)}?=`);
const addr = (email: string, name?: string) => (name ? `"${word(name).replace(/"/g, '')}" <${email}>` : `<${email}>`);

export function buildMime(mail: EmailOut, to: string, id: string, date = new Date()): string {
  const boundary = `kuschonink-${id}`;
  return [
    `From: ${addr(mail.from.email, mail.from.name)}`,
    `To: ${addr(to)}`,
    `Reply-To: ${addr(mail.replyTo)}`,
    `Subject: ${word(mail.subject)}`,
    `Message-ID: <${id}@kuschonink.com>`,
    `Date: ${date.toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(base64(mail.text)),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(base64(mail.html)),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}
