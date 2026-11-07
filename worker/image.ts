// Pictures sent with a suggestion (or uploaded by the admin): check that the
// bytes really are a JPEG, PNG or WebP, read their size, and remove what a
// phone or camera hides in them: EXIF (with GPS), XMP, comments, text chunks,
// and anything after the end of the image (some phones append a video there).
// Colour profiles stay, so colours don't change. The browser already re-encodes
// pictures before sending, but a request can skip the browser, so the server
// does this too. Pure code on bytes, tested in worker/image.test.mts.

export type ImageKind = 'jpeg' | 'png' | 'webp';
export interface ImageInfo { kind: ImageKind; width: number; height: number }
export interface CleanImage extends ImageInfo { bytes: Uint8Array; type: string }

export const MIME: Record<ImageKind, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const EXT: Record<ImageKind, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const le24 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const le32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

/** What the first bytes say the file is. */
export function sniff(b: Uint8Array): ImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  return null;
}

/** A cleaned copy of a picture, or the reason it isn't one. */
export function cleanImage(b: Uint8Array): CleanImage | { error: 'not_an_image' | 'broken_image' } {
  const kind = sniff(b);
  if (!kind) return { error: 'not_an_image' };
  const r = kind === 'jpeg' ? cleanJpeg(b) : kind === 'png' ? cleanPng(b) : cleanWebp(b);
  if (!r || !r.width || !r.height) return { error: 'broken_image' };
  return { kind, type: MIME[kind], ...r };
}

// ---- JPEG ----

// APP0 (JFIF), APP2 (ICC colour profile) and APP14 (Adobe: needed to decode
// CMYK pictures) stay; other APPn (APP1 is EXIF and XMP) and COM go.
const KEEP_APP = new Set([0xe0, 0xe2, 0xee]);
/** Start-of-frame markers, which carry the size (not DHT C4, JPG C8 or DAC CC). */
const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

function cleanJpeg(b: Uint8Array): { bytes: Uint8Array; width: number; height: number } | null {
  const out: Uint8Array[] = [b.subarray(0, 2)]; // SOI
  let i = 2;
  let width = 0;
  let height = 0;
  let scanning = false; // inside entropy-coded data, after SOS
  let scanStart = 0;
  while (i < b.length) {
    if (scanning) {
      // Entropy-coded data: FF00 is data, FFD0–D7 restart markers, FFFF fill; any other marker ends the scan.
      if (b[i] !== 0xff) { i++; continue; }
      const n = b[i + 1];
      if (n === 0x00 || (n >= 0xd0 && n <= 0xd7) || n === 0xff) { i += n === 0xff ? 1 : 2; continue; }
      out.push(b.subarray(scanStart, i));
      scanning = false;
      continue;
    }
    if (b[i] !== 0xff) return null;
    while (b[i] === 0xff && b[i + 1] === 0xff) i++; // fill bytes before a marker
    const m = b[i + 1];
    if (m === undefined) return null;
    if (m === 0xd9) { out.push(b.subarray(i, i + 2)); break; } // EOI: anything after it is dropped
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { out.push(b.subarray(i, i + 2)); i += 2; continue; } // no length
    if (i + 4 > b.length) return null;
    const len = be16(b, i + 2);
    if (len < 2 || i + 2 + len > b.length) return null;
    const seg = b.subarray(i, i + 2 + len);
    if (isSof(m) && len >= 7) {
      height = be16(b, i + 5);
      width = be16(b, i + 7);
    }
    const drop = m === 0xfe || (m >= 0xe0 && m <= 0xef && !KEEP_APP.has(m));
    if (!drop) out.push(seg);
    i += 2 + len;
    if (m === 0xda) { scanning = true; scanStart = i; } // SOS: its data follows
  }
  if (scanning || out[out.length - 1][1] !== 0xd9) return null; // no end of image
  return { bytes: concat(out), width, height };
}

// ---- PNG ----

// Image data, palette, transparency, colour and pixel-size chunks, and APNG
// animation; never text (tEXt, zTXt, iTXt), EXIF (eXIf) or time stamps.
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'bKGD', 'hIST', 'pHYs', 'acTL', 'fcTL', 'fdAT', 'cICP']);

function cleanPng(b: Uint8Array): { bytes: Uint8Array; width: number; height: number } | null {
  const out: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  let width = 0;
  let height = 0;
  let ended = false;
  while (i + 12 <= b.length) {
    const len = be32(b, i);
    const type = ascii(b, i + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type) || i + 12 + len > b.length) return null;
    if (i === 8) {
      if (type !== 'IHDR' || len !== 13) return null;
      width = be32(b, i + 8);
      height = be32(b, i + 12);
    }
    if (PNG_KEEP.has(type)) out.push(b.subarray(i, i + 12 + len));
    i += 12 + len;
    if (type === 'IEND') { ended = true; break; } // anything after it is dropped
  }
  return ended ? { bytes: concat(out), width, height } : null;
}

// ---- WebP ----

function cleanWebp(b: Uint8Array): { bytes: Uint8Array; width: number; height: number } | null {
  const size = le32(b, 4);
  const end = Math.min(b.length, 8 + size);
  const chunks: Uint8Array[] = [];
  let i = 12;
  let width = 0;
  let height = 0;
  let vp8x: Uint8Array | null = null;
  while (i + 8 <= end) {
    const four = ascii(b, i, 4);
    const len = le32(b, i + 4);
    const padded = len + (len & 1);
    if (i + 8 + len > end) return null;
    const data = b.subarray(i + 8, i + 8 + len);
    if (four === 'VP8X' && len >= 10) {
      width = le24(data, 4) + 1;
      height = le24(data, 7) + 1;
      vp8x = b.slice(i, i + 8 + padded); // a copy: its flags change below
    } else if (four === 'VP8 ' && len >= 10 && !width) {
      if (data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) return null;
      width = le16(data, 6) & 0x3fff;
      height = le16(data, 8) & 0x3fff;
    } else if (four === 'VP8L' && len >= 5 && !width) {
      if (data[0] !== 0x2f) return null;
      const bits = le32(data, 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    }
    if (four !== 'EXIF' && four !== 'XMP ' && four !== 'VP8X') chunks.push(b.subarray(i, i + 8 + Math.min(padded, end - i - 8)));
    i += 8 + padded;
  }
  if (vp8x) {
    vp8x[8] &= ~0x0c; // the EXIF (0x08) and XMP (0x04) flags: those chunks are gone
    chunks.unshift(vp8x);
  }
  const body = concat(chunks);
  const head = new Uint8Array(12);
  head.set([0x52, 0x49, 0x46, 0x46]); // RIFF
  const total = 4 + body.length;
  head.set([total & 255, (total >>> 8) & 255, (total >>> 16) & 255, (total >>> 24) & 255], 4);
  head.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  return { bytes: concat([head, body]), width, height };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Base64 (optionally a data: URL) to bytes, or null when it isn't base64. */
export function fromBase64(s: string): Uint8Array | null {
  const b64 = s.replace(/^data:image\/[a-z]+;base64,/, '');
  if (!b64 || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  try {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Bytes to base64, in slices so a large picture doesn't overflow the call stack. */
export function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
