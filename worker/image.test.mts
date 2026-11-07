// npm test: picture checks and metadata removal (worker/image.ts). The test
// pictures are made with sharp, with EXIF and GPS, a comment, a text chunk and
// data after the end of the image, as phones and cameras leave them.
import sharp from 'sharp';
import { cleanImage, fromBase64, sniff, toBase64, type CleanImage } from './image.ts';

let fails = 0;
function check(name: string, ok: boolean, detail: unknown = '') {
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail));
}
const has = (b: Uint8Array, s: string) => Buffer.from(b).includes(Buffer.from(s, 'latin1'));
const ok = (r: ReturnType<typeof cleanImage>): r is CleanImage => !('error' in r);
const trailer = Buffer.from('ftypmp42 a motion photo trailer with secrets', 'latin1');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const exif = { IFD0: { Copyright: 'Owner secret copyright', Artist: 'Jane Private' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 30/1', GPSLongitudeRef: 'E', GPSLongitude: '2/1 21/1 0/1' } };
const base = () => sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 40, b: 40 } } });

// ---- JPEG ----
{
  const jpeg = await base().withExif(exif).withIccProfile('srgb').jpeg({ quality: 80 }).toBuffer();
  // A comment segment after SOI, and a trailer after EOI.
  const note = Buffer.from('a private comment\0', 'latin1');
  const com = Buffer.concat([Buffer.from([0xff, 0xfe, (note.length + 2) >> 8, (note.length + 2) & 255]), note]);
  const dirty = Buffer.concat([jpeg.subarray(0, 2), com, jpeg.subarray(2), trailer]);
  check('test JPEG really has EXIF, GPS, a comment and a trailer', has(dirty, 'Exif') && has(dirty, 'Jane Private') && has(dirty, 'a private comment') && has(dirty, 'motion photo'));
  const r = cleanImage(dirty);
  check('JPEG: recognised, with its size', ok(r) && r.kind === 'jpeg' && r.type === 'image/jpeg' && r.width === 64 && r.height === 48, r);
  if (ok(r)) {
    check('JPEG: EXIF, GPS and the comment are gone', !has(r.bytes, 'Exif') && !has(r.bytes, 'Jane Private') && !has(r.bytes, 'Owner secret') && !has(r.bytes, 'a private comment'));
    check('JPEG: nothing after the end of the image', r.bytes[r.bytes.length - 2] === 0xff && r.bytes[r.bytes.length - 1] === 0xd9 && !has(r.bytes, 'motion photo'));
    const meta = await sharp(r.bytes).metadata();
    check('JPEG: still a picture, colour profile kept', meta.width === 64 && meta.height === 48 && !!meta.icc && !meta.exif, { w: meta.width, icc: !!meta.icc, exif: !!meta.exif });
  }
  const progressive = await base().withExif(exif).jpeg({ progressive: true }).toBuffer();
  const p = cleanImage(progressive);
  check('progressive JPEG (several scans) is cleaned and still decodes', ok(p) && !has(p.bytes, 'Jane Private') && (await sharp(p.bytes).metadata()).width === 64);
  check('a cut-off JPEG is refused', 'error' in cleanImage(jpeg.subarray(0, jpeg.length - 40)));
}

// ---- PNG ----
{
  const png = await base().png().toBuffer();
  const iend = png.length - 12;
  const text = pngChunk('tEXt', Buffer.from('Comment\0taken at 12 Rue Privee', 'latin1'));
  const exifChunk = pngChunk('eXIf', Buffer.from('MM\0*private exif', 'latin1'));
  const dirty = Buffer.concat([png.subarray(0, iend), text, exifChunk, png.subarray(iend), trailer]);
  check('test PNG really has text, eXIf and a trailer', has(dirty, 'Rue Privee') && has(dirty, 'private exif') && has(dirty, 'motion photo'));
  const r = cleanImage(dirty);
  check('PNG: recognised, with its size', ok(r) && r.kind === 'png' && r.width === 64 && r.height === 48, r);
  if (ok(r)) {
    check('PNG: text, eXIf and the trailer are gone', !has(r.bytes, 'Rue Privee') && !has(r.bytes, 'private exif') && !has(r.bytes, 'motion photo'));
    check('PNG: still a picture', (await sharp(r.bytes).metadata()).width === 64);
  }
}

// ---- WebP ----
{
  const webp = await base().withExif(exif).webp({ quality: 80 }).toBuffer();
  check('test WebP really has EXIF', has(webp, 'EXIF') && has(webp, 'Jane Private'));
  const r = cleanImage(Buffer.concat([webp, trailer]));
  check('WebP: recognised, with its size', ok(r) && r.kind === 'webp' && r.width === 64 && r.height === 48, r);
  if (ok(r)) {
    const riff = Buffer.from(r.bytes).readUInt32LE(4);
    check('WebP: EXIF is gone, RIFF size right', !has(r.bytes, 'Jane Private') && !has(r.bytes, 'EXIF') && riff === r.bytes.length - 8, { riff, len: r.bytes.length });
    const meta = await sharp(r.bytes).metadata();
    check('WebP: still a picture', meta.width === 64 && meta.height === 48 && !meta.exif);
  }
  const lossless = await base().webp({ lossless: true }).toBuffer();
  const l = cleanImage(lossless);
  check('lossless WebP (VP8L) reads its size', ok(l) && l.width === 64 && l.height === 48, l);
}

// ---- Not pictures ----
check('text is not a picture', 'error' in cleanImage(new TextEncoder().encode('<svg onload=alert(1)>')) && (cleanImage(new TextEncoder().encode('hello')) as { error: string }).error === 'not_an_image');
check('sniff', sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])) === 'jpeg' && sniff(new Uint8Array([1, 2, 3])) === null);
{
  const bytes = new Uint8Array(70000).map((_, i) => i % 251);
  const back = fromBase64(toBase64(bytes));
  check('base64 round trip of a large file', !!back && back.length === bytes.length && back.every((v, i) => v === bytes[i]));
  check('a data: URL is accepted, bad base64 is not', !!fromBase64('data:image/jpeg;base64,' + toBase64(bytes.subarray(0, 30))) && fromBase64('not base64!') === null);
}

console.log(fails ? `${fails} FAILED` : 'all passed');
if (fails) process.exitCode = 1;
