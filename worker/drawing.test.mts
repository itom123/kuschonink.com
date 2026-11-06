// npm test: Paint's "Send to Xiangyin" handler, against stand-in services.
import { deflateSync, crc32 } from 'node:zlib';
import { handleDrawing, parsePicture, pictureName, MAX_SIDE, type DrawingSubmission } from './drawing.ts';
import type { Deps, EmailOut } from './contact.ts';
import { buildMime } from './mime.ts';

/** A real PNG: w × h, RGB, a diagonal stripe so it compresses like a drawing. */
function png(w: number, h: number, { truncate = false } = {}): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3, 255);
    row[0] = 0;
    for (let x = 0; x < w; x++) {
      if (Math.abs(x - y) < 2) row.fill(0, 1 + x * 3, 4 + x * 3);
    }
    rows.push(row);
  }
  const file = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return truncate ? file.subarray(0, file.length - 12) : file;
}
const dataUrl = (b: Buffer) => `data:image/png;base64,${b.toString('base64')}`;

const picture = png(320, 240);
const good: DrawingSubmission = { name: 'Ann', email: 'ann@example.com', message: 'Line 1\nLine 2 <b>', website: '', turnstileToken: 'tok', image: dataUrl(picture) };
const req = (body: unknown, origin = 'https://kuschonink.com', method = 'POST', ct = 'application/json') =>
  new Request('https://kuschonink.com/v1/contact/drawing', {
    method,
    headers: { origin, 'content-type': ct, 'cf-connecting-ip': '1.2.3.4' },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
const sent: EmailOut[] = [];
const keys: string[] = [];
const deps = (o: Partial<Deps> = {}): Deps => ({
  secret: 's',
  verify: async () => ({ success: true, hostname: 'kuschonink.com', action: 'kuschonink-drawing' }),
  send: async (m) => { sent.push(m); },
  allow: async (key) => { keys.push(key); return true; },
  log: () => {},
  ...o,
});

let fails = 0;
const ok = (cond: boolean, name: string, extra = '') => {
  if (!cond) fails++;
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};
const check = async (name: string, r: Promise<Response>, status: number, error?: string) => {
  const res = await r;
  const b = res.status === 204 ? {} : await res.json();
  ok(res.status === status && (error === undefined || b.error === error), name, `${res.status} ${JSON.stringify(b).slice(0, 160)}`);
  return b;
};

// Sending
const b = await check('valid drawing is sent', handleDrawing(req(good), deps()), 202);
const m = sent[0];
const a = m?.attachments?.[0];
ok(!!a && a.disposition === 'inline' && a.type === 'image/png' && a.contentId === 'drawing@kuschonink.com' && a.content === picture.toString('base64'), '  the picture travels inline, unchanged');
ok(/^drawing-\d{8}-\d{4}-ann\.png$/.test(a?.filename ?? '') && b.filename === a?.filename && b.width === 320 && b.height === 240, '  named by date and drawer, size reported', a?.filename);
ok(m?.replyTo === 'ann@example.com' && m.subject === 'kuschonink.com: a drawing from Ann', '  reply goes to the visitor; subject names them');
ok(!!m && m.html.includes('src="cid:drawing@kuschonink.com"') && m.html.includes('&lt;b&gt;') && !m.html.includes('<b>'), '  HTML shows the picture and escapes the note');
ok(!!m && m.text.includes('Line 1\nLine 2 <b>') && m.text.includes('320 × 240 pixels'), '  plain text has the note and the size');
ok(keys[0] === 'drawing:1.2.3.4', '  rate-limited per visitor, apart from the contact form', keys[0]);

sent.length = 0;
await check('anonymous drawing, no note', handleDrawing(req({ ...good, name: '', email: '', message: '' }), deps()), 202);
ok(sent[0]?.replyTo === undefined && sent[0]?.subject === 'kuschonink.com: a drawing' && sent[0].text.includes('(No note.)'), '  no reply-to, plain subject');

// Refusals
await check('preflight', handleDrawing(req(null, 'https://kuschonink.com', 'OPTIONS'), deps()), 204);
await check('other origin rejected', handleDrawing(req(good, 'https://evil.example'), deps()), 403, 'origin_not_allowed');
await check('missing secret', handleDrawing(req(good), deps({ secret: undefined })), 503, 'service_not_configured');
await check('not JSON', handleDrawing(req(good, 'https://kuschonink.com', 'POST', 'text/plain'), deps()), 415, 'unsupported_media_type');
await check('broken JSON', handleDrawing(req('{"image": '), deps()), 400, 'invalid_submission');
await check('spam trap', handleDrawing(req({ ...good, website: 'x' }), deps({ send: async () => { throw new Error('should not send'); } })), 202);
await check('no token', handleDrawing(req({ ...good, turnstileToken: '' }), deps()), 403, 'verification_failed');
await check('no picture', handleDrawing(req({ ...good, image: '' }), deps()), 400, 'missing_image');
await check('a JPEG is refused', handleDrawing(req({ ...good, image: `data:image/png;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString('base64')}` }), deps()), 400, 'invalid_image');
await check('a cut-off PNG is refused', handleDrawing(req({ ...good, image: dataUrl(png(64, 64, { truncate: true })) }), deps()), 400, 'invalid_image');
await check('not base64', handleDrawing(req({ ...good, image: 'data:image/png;base64,' + '<script>'.repeat(40) }), deps()), 400, 'invalid_image');
await check('too wide', handleDrawing(req({ ...good, image: dataUrl(png(MAX_SIDE + 1, 2)) }), deps()), 413, 'image_too_large');
await check('request over 3 MB', handleDrawing(req({ ...good, message: 'x'.repeat(3.2 * 1024 * 1024) }), deps()), 413, 'payload_too_large');
await check('bad email', handleDrawing(req({ ...good, email: 'nope' }), deps()), 400, 'invalid_submission');
await check('newline in name', handleDrawing(req({ ...good, name: 'a\nBcc: x' }), deps()), 400, 'invalid_submission');
await check('note too long', handleDrawing(req({ ...good, message: 'x'.repeat(2001) }), deps()), 400, 'field_too_long');
await check('rate limited', handleDrawing(req(good), deps({ allow: async () => false })), 429, 'rate_limited');
await check('a contact-form token is refused', handleDrawing(req(good), deps({ verify: async () => ({ success: true, hostname: 'kuschonink.com', action: 'kuschonink-contact' }) })), 403, 'verification_failed');
await check('wrong hostname', handleDrawing(req(good), deps({ verify: async () => ({ success: true, hostname: 'evil.example', action: 'kuschonink-drawing' }) })), 403, 'verification_failed');
await check('siteverify down', handleDrawing(req(good), deps({ verify: async () => { throw new Error('down'); } })), 503, 'verification_unavailable');
const fail = await check('email error code surfaced', handleDrawing(req(good), deps({ send: async () => { throw Object.assign(new Error('nope'), { code: 'E_ATTACHMENT_TOO_LARGE' }); } })), 502, 'delivery_failed');
ok(fail.detail === 'E_ATTACHMENT_TOO_LARGE', '  with its code');

// The picture check on its own
ok(typeof parsePicture(picture.toString('base64')) === 'object', 'bare base64 (no data: prefix) is accepted');
ok(parsePicture('data:image/png;base64,' + picture.toString('base64').slice(0, -4)) === 'invalid_image', 'a base64 string cut short is refused');
ok(parsePicture(picture.toString('base64').slice(0, 32) + 'A'.repeat(Math.ceil((2.1 * 1024 * 1024 * 4) / 3 / 4) * 4)) === 'image_too_large', 'a picture over 2 MB is refused before decoding');

// File names
const at = new Date(Date.UTC(2026, 10, 6, 14, 32));
ok(pictureName('Ann Smith', at) === 'drawing-20261106-1432-ann-smith.png', 'file name: ASCII name', pictureName('Ann Smith', at));
ok(pictureName('小明', at) === 'drawing-20261106-1432.png', 'file name: Chinese name leaves just the date', pictureName('小明', at));
ok(pictureName('Zoë "the" <Painter>', at) === 'drawing-20261106-1432-zoe-the-painter.png', 'file name: accents and symbols', pictureName('Zoë "the" <Painter>', at));
ok(pictureName('a'.repeat(40), at).length === 'drawing-20261106-1432-'.length + 24 + 4, 'file name: long names are cut');

// The raw message (the classic Email Routing path) with the picture inside.
const mime = buildMime(sent[0] ?? m, 'to@example.com', 'abc', new Date(0));
const relIdx = mime.indexOf('Content-Type: multipart/related; boundary="kuschonink-abc-rel"; type="multipart/alternative"');
const altIdx = mime.indexOf('Content-Type: multipart/alternative; boundary="kuschonink-abc-alt"');
const imgIdx = mime.indexOf('Content-Type: image/png; name="');
ok(relIdx > 0 && altIdx > relIdx && imgIdx > altIdx, 'raw MIME: related ⊃ alternative, then the picture');
ok(mime.includes('Content-ID: <drawing@kuschonink.com>') && mime.includes('Content-Disposition: inline; filename="drawing-'), 'raw MIME: the picture has its Content-ID and file name');
ok(!mime.includes('Reply-To:'), 'raw MIME: no Reply-To when no email was given');
ok(mime.endsWith('--kuschonink-abc-rel--\r\n') && mime.includes('--kuschonink-abc-alt--'), 'raw MIME: both multiparts are closed');
ok(mime.split('\r\n').every((l) => l.length <= 998), 'raw MIME: no line over 998 characters');
const imgBody = mime.slice(imgIdx).split('\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, '');
ok(Buffer.from(imgBody, 'base64').equals(sent[0]?.attachments?.[0].content ? Buffer.from(sent[0].attachments[0].content, 'base64') : picture), 'raw MIME: the picture decodes back to the same bytes');
const withReply = buildMime(m, 'to@example.com', 'abc', new Date(0));
ok(withReply.includes('Reply-To: <ann@example.com>'), 'raw MIME: Reply-To when an email was given');

console.log(fails ? `${fails} FAILED` : 'all passed');
if (fails) process.exitCode = 1;
