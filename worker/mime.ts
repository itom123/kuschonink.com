// The email, shaped for each of the two ways the EMAIL binding sends:
// forBinding() for the structured Email Service API, and buildMime(), a small
// RFC 5322 / MIME builder, for the classic Email Routing path, which only
// accepts a raw message (cloudflare:email EmailMessage).
import type { Attachment, EmailOut } from './contact';

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
/** File names are made by the Worker (ASCII); quotes and line breaks are dropped anyway. */
const fileName = (s: string) => s.replace(/["\\\r\n]/g, '');

/** One body part: headers, a blank line, the content (base64, already wrapped). */
const part = (headers: string[], body: string) => [...headers, '', body].join('\r\n');

/** A multipart body from parts; returns its Content-Type and the joined parts. */
function multipart(kind: 'alternative' | 'related' | 'mixed', boundary: string, parts: string[], extra = '') {
  return {
    type: `multipart/${kind}; boundary="${boundary}"${extra}`,
    body: [...parts.map((p) => `--${boundary}\r\n${p}`), `--${boundary}--`, ''].join('\r\n'),
  };
}

function attachmentPart(a: Attachment) {
  const headers = [
    `Content-Type: ${a.type}; name="${fileName(a.filename)}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: ${a.disposition}; filename="${fileName(a.filename)}"`,
  ];
  if (a.contentId) headers.push(`Content-ID: <${a.contentId}>`);
  return part(headers, wrap(a.content.replace(/\s+/g, '')).replace(/\r\n$/, ''));
}

export function buildMime(mail: EmailOut, to: string, id: string, date = new Date()): string {
  const top = [
    `From: ${addr(mail.from.email, mail.from.name)}`,
    `To: ${addr(to)}`,
    ...(mail.replyTo ? [`Reply-To: ${addr(mail.replyTo)}`] : []),
    `Subject: ${word(mail.subject)}`,
    `Message-ID: <${id}@kuschonink.com>`,
    `Date: ${date.toUTCString()}`,
    'MIME-Version: 1.0',
  ];
  const attachments = mail.attachments ?? [];
  if (!attachments.length) {
    // Text and HTML only: the message the contact form has always sent.
    const boundary = `kuschonink-${id}`;
    return [
      ...top,
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

  // With pictures: text and HTML side by side; pictures the HTML shows (cid:)
  // travel with it as multipart/related; anything else is attached (mixed).
  let root = multipart('alternative', `kuschonink-${id}-alt`, [
    part(['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64'], wrap(base64(mail.text)).replace(/\r\n$/, '')),
    part(['Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64'], wrap(base64(mail.html)).replace(/\r\n$/, '')),
  ]);
  const inline = attachments.filter((a) => a.disposition === 'inline' && a.contentId);
  const files = attachments.filter((a) => !inline.includes(a));
  if (inline.length) {
    root = multipart('related', `kuschonink-${id}-rel`, [part([`Content-Type: ${root.type}`], root.body), ...inline.map(attachmentPart)], '; type="multipart/alternative"');
  }
  if (files.length) {
    root = multipart('mixed', `kuschonink-${id}-mix`, [part([`Content-Type: ${root.type}`], root.body), ...files.map(attachmentPart)]);
  }
  return [...top, `Content-Type: ${root.type}`, '', root.body].join('\r\n');
}

/** Base64 → bytes. */
export function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The message for the structured API: env.EMAIL.send({ ...mail, to }), with
 * attachments as bytes. Given a string, the binding sends it as text (a
 * base64 string arrived as base64 text, not as the picture), so the
 * base64 `content` of each attachment is decoded first.
 */
export function forBinding(mail: EmailOut, to: string) {
  const { attachments, ...rest } = mail;
  if (!attachments?.length) return { ...rest, to };
  // An ArrayBuffer, as in Cloudflare's own examples (await file.arrayBuffer()).
  const bytes = new Map<string, ArrayBuffer>();
  return {
    ...rest,
    to,
    attachments: attachments.map((a) => {
      if (!bytes.has(a.content)) bytes.set(a.content, bytesFromBase64(a.content).buffer as ArrayBuffer);
      return { ...a, content: bytes.get(a.content)! };
    }),
  };
}
