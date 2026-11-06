// Paint's "Send to Xiangyin": a drawing (a PNG), with an optional name, email
// and note, emailed to the artist's inbox: the picture is shown in the
// message and attached as a file.
// The same checks as the contact form: origin → size → validation → rate
// limit → Turnstile. Only a complete PNG within the size limits is accepted.
// Nothing is stored: the picture goes into the email and nowhere else.
import { ALLOWED_HOSTNAMES, ALLOWED_ORIGINS, SENDER, escapeHtml, hasLineBreak, isEmail, json, text, unsafe, type Deps, type EmailOut, type TurnstileResult } from './contact.ts';

export const DRAWING_PATH = '/v1/contact/drawing';
const TURNSTILE_ACTION = 'kuschonink-drawing';
/** The picture is at most 2 MB; as base64 in JSON, with a note, the request stays under 3 MB. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
/** Largest side of a picture, in pixels. */
export const MAX_SIDE = 2400;
const LIMITS = { name: 120, email: 254, message: 2000, website: 254, turnstileToken: 2048 };
/** The picture's Content-ID: the HTML shows it with <img src="cid:…">. */
const CID = 'drawing@kuschonink.com';

export interface DrawingSubmission { name: string; email: string; message: string; website: string; turnstileToken: string; image: string }
export interface Picture { base64: string; bytes: number; width: number; height: number }

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// The last chunk of every PNG: length 0, "IEND", and its fixed CRC.
const PNG_END = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

const bytesOf = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

/**
 * Check the picture without decoding all of it: base64 throughout, a PNG
 * signature and header (IHDR) at the start, the IEND chunk at the end.
 * Returns the picture, or an error code.
 */
export function parsePicture(input: string): Picture | 'invalid_image' | 'image_too_large' {
  const base64 = input.replace(/^data:image\/png;base64,/, '');
  if (base64.length < 100 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return 'invalid_image';
  const bytes = (base64.length / 4) * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (bytes > MAX_IMAGE_BYTES) return 'image_too_large';
  const head = bytesOf(base64.slice(0, 32));
  if (PNG_SIGNATURE.some((v, i) => head[i] !== v)) return 'invalid_image';
  // IHDR must be the first chunk: length 13, then "IHDR", width, height.
  if (be32(head, 8) !== 13 || String.fromCharCode(...head.subarray(12, 16)) !== 'IHDR') return 'invalid_image';
  const width = be32(head, 16), height = be32(head, 20);
  if (!width || !height) return 'invalid_image';
  if (width > MAX_SIDE || height > MAX_SIDE) return 'image_too_large';
  // The last 12 bytes: decode enough of the tail to cover them.
  const tailChars = 24;
  const tail = bytesOf(base64.slice(-tailChars));
  const end = tail.subarray(tail.length - PNG_END.length);
  if (PNG_END.some((v, i) => end[i] !== v)) return 'invalid_image';
  return { base64, bytes, width, height };
}

/** The request body as text, or null once it passes `max` bytes (it stops reading there). */
async function readLimited(request: Request, max: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export function validateDrawing(p: DrawingSubmission): string | null {
  if (!p.turnstileToken) return 'verification_failed';
  if (!p.image) return 'missing_image';
  for (const [k, max] of Object.entries(LIMITS)) if ((p as unknown as Record<string, string>)[k].length > max) return 'field_too_long';
  if ((p.email && !isEmail(p.email)) || hasLineBreak(p.name) || hasLineBreak(p.email) || [p.name, p.email, p.message].some(unsafe)) {
    return 'invalid_submission';
  }
  return null;
}

/** "drawing-20261106-1432-ann.png": when it arrived, and who drew it (ASCII letters only). */
export function pictureName(name: string, date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/, '');
  return `drawing-${stamp}${slug ? `-${slug}` : ''}.png`;
}

export function buildDrawingEmail(p: DrawingSubmission, pic: Picture, date = new Date()): EmailOut {
  const filename = pictureName(p.name, date);
  const who = p.name || 'someone who left no name';
  const kb = Math.max(1, Math.round(pic.bytes / 1024));
  const size = `${pic.width} × ${pic.height} pixels, ${kb} KB`;
  const reply = p.email ? `${p.email} (reply to this email to answer)` : '(not given, so there is no address to reply to)';
  // Shown at most 640 px wide in the message; the file itself is full size.
  const showW = Math.min(pic.width, 640);
  const showH = Math.round((pic.height * showW) / pic.width);
  const lines = [`From: ${who}`, `Email: ${reply}`, `Picture: ${filename} (${size}), attached`, ''];
  if (p.message) lines.push('Note:', p.message);
  else lines.push('(No note.)');
  return {
    from: SENDER,
    replyTo: p.email || undefined,
    subject: p.name ? `kuschonink.com: a drawing from ${p.name}` : 'kuschonink.com: a drawing',
    text: ['New drawing from Paint on kuschonink.com', '', ...lines].join('\n'),
    html:
      '<p><strong>New drawing from Paint on kuschonink.com</strong></p>' +
      `<p><img src="cid:${CID}" width="${showW}" height="${showH}" alt="${escapeHtml(`Drawing from ${who}`)}" style="max-width:100%;height:auto;border:1px solid #808080"></p>` +
      '<dl>' +
      `<dt>From</dt><dd>${escapeHtml(who)}</dd>` +
      `<dt>Email</dt><dd>${escapeHtml(reply)}</dd>` +
      `<dt>Note</dt><dd style="white-space:pre-wrap">${p.message ? escapeHtml(p.message) : '<i>No note.</i>'}</dd>` +
      `<dt>Picture</dt><dd>${escapeHtml(filename)}, ${escapeHtml(size)} (attached)</dd>` +
      '</dl>',
    // The same PNG twice: shown in the message (cid:), and as a file to save.
    attachments: [
      { content: pic.base64, filename, type: 'image/png', disposition: 'inline', contentId: CID },
      { content: pic.base64, filename, type: 'image/png', disposition: 'attachment' },
    ],
  };
}

export async function handleDrawing(request: Request, deps: Deps): Promise<Response> {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ error: 'origin_not_allowed' }, 403);
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
        vary: 'Origin',
      },
    });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ error: 'origin_not_allowed' }, 403);
  if (!deps.secret) {
    deps.log('drawing: TURNSTILE_SECRET is not set');
    return json({ error: 'service_not_configured' }, 503, origin);
  }
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'unsupported_media_type' }, 415, origin);
  }
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413, origin);
  const raw = await readLimited(request, MAX_BODY_BYTES);
  if (raw === null) return json({ error: 'payload_too_large' }, 413, origin);

  let p: DrawingSubmission;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    p = {
      name: text(v.name),
      email: text(v.email),
      message: text(v.message),
      website: text(v.website),
      turnstileToken: text(v.turnstileToken),
      image: typeof v.image === 'string' ? v.image : '',
    };
  } catch {
    return json({ error: 'invalid_submission' }, 400, origin);
  }
  // Spam trap filled in: pretend it worked.
  if (p.website) return json({ ok: true }, 202, origin);

  const invalid = validateDrawing(p);
  if (invalid) return json({ error: invalid }, invalid === 'verification_failed' ? 403 : 400, origin);
  const pic = parsePicture(p.image);
  if (typeof pic === 'string') return json({ error: pic }, pic === 'image_too_large' ? 413 : 400, origin);

  const ip = request.headers.get('cf-connecting-ip');
  if (!(await deps.allow(`drawing:${ip ?? 'unknown'}`))) return json({ error: 'rate_limited' }, 429, origin);

  let ts: TurnstileResult;
  try {
    ts = await deps.verify(deps.secret, p.turnstileToken, ip);
  } catch (e) {
    deps.log('drawing: Turnstile siteverify unreachable', e);
    return json({ error: 'verification_unavailable' }, 503, origin);
  }
  if (!ts.success || !ts.hostname || !ALLOWED_HOSTNAMES.has(ts.hostname) || ts.action !== TURNSTILE_ACTION) {
    deps.log('drawing: Turnstile rejected', { success: ts.success, hostname: ts.hostname, action: ts.action, errors: ts['error-codes'] });
    return json({ error: 'verification_failed', detail: ts['error-codes']?.join(',') || undefined }, 403, origin);
  }

  const mail = buildDrawingEmail(p, pic);
  try {
    await deps.send(mail);
  } catch (e) {
    const code = (e as { code?: string }).code ?? ((e as Error).message || 'unknown').slice(0, 140);
    deps.log('drawing: email send failed', code, (e as Error).message);
    return json({ error: 'delivery_failed', detail: code }, 502, origin);
  }
  return json({ ok: true, filename: mail.attachments![0].filename, width: pic.width, height: pic.height }, 202, origin);
}
