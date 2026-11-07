// Admin mode's site editing, the rules both sides share (worker/admin-files.ts
// and src/scripts/admin/editor.ts): which files may be edited, which files a
// page is made from, and the check that no saved text can run code in a
// visitor's browser. Pure, so it is tested in Node (admin-files.test.mts).

export const CONTENT = 'src/content';

/** Content the admin may edit: every JSON file in src/content except who may open which guide. */
export function isEditableJson(path: string): boolean {
  if (path === `${CONTENT}/guides/access.json`) return false;
  return /^src\/content\/(?:[a-z0-9-]+\/)?[a-z0-9-]+\.json$/.test(path) || /^src\/content\/guides\/[a-z0-9-]+\/[a-z0-9-]+\.json$/.test(path);
}

export type PictureKind = 'jpeg' | 'png' | 'webp';
export interface PictureRule {
  /** What the picture may be. */
  kinds: readonly PictureKind[];
  maxBytes: number;
  /** Longest side, in pixels. */
  maxSide: number;
  /** What a content file writes to use it (src of an image block), or null (guide entries use their id). */
  src: string | null;
}

const EXT_KIND: Record<string, PictureKind> = { jpg: 'jpeg', png: 'png', webp: 'webp' };

/**
 * Where pictures may go: the site's own pictures (src/assets/images, made
 * into every size the pages need at build time) and Field Guide entries'
 * pictures (public/guides/<slug>/img/<id>.jpg, shown as they are).
 */
export function pictureRule(path: string): PictureRule | null {
  let m = /^src\/assets\/images\/((?:about|contact|home|projects\/[a-z0-9-]+)\/[a-z0-9][a-z0-9-]{0,79}\.(jpg|png|webp))$/.exec(path);
  if (m) return { kinds: [EXT_KIND[m[2]]], maxBytes: 8 * 1024 * 1024, maxSide: 8000, src: m[1] };
  m = /^public\/guides\/[a-z0-9-]+\/img\/[A-Z]{1,2}\d{0,3}\.jpg$/.exec(path);
  if (m) return { kinds: ['jpeg'], maxBytes: 1024 * 1024, maxSide: 1600, src: null };
  return null;
}

/** The folders pictures may go into, from a list of the repository's files. */
export function pictureFolders(paths: readonly string[]): string[] {
  const out = new Set<string>(['src/assets/images/about', 'src/assets/images/contact', 'src/assets/images/home']);
  for (const p of paths) {
    const a = /^(src\/assets\/images\/projects\/[a-z0-9-]+)\//.exec(p);
    if (a) out.add(a[1]);
    const g = /^src\/content\/guides\/([a-z0-9-]+)\/items\.json$/.exec(p);
    if (g) out.add(`public/guides/${g[1]}/img`);
  }
  return [...out].sort();
}

/** A file name a picture can be saved under: lower case, letters, digits and dashes. */
export function pictureName(name: string, kind: PictureKind): string {
  const base = name.replace(/\.[^.]*$/, '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);
  return `${base || 'picture'}.${kind === 'jpeg' ? 'jpg' : kind}`;
}

/** A project's slug from its title. */
export function slugify(title: string): string {
  return title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/** The guide files, most edited first. */
const GUIDE_FILES = ['items', 'guide', 'events', 'routes', 'places', 'listings', 'map'];

/**
 * The content files a page of the site is made from, most relevant first,
 * kept to those that exist (`all`: the repository's files).
 */
export function filesFor(url: string, all: readonly string[]): string[] {
  let p: string;
  try {
    p = new URL(url, 'https://kuschonink.com').pathname.replace(/\/+$/, '') || '/';
  } catch {
    p = '/';
  }
  const c = (f: string) => `${CONTENT}/${f}.json`;
  const want: string[] = [];
  let m: RegExpExecArray | null;
  if (p === '/') want.push(c('home'), c('site'));
  else if (p === '/about') want.push(c('about'), c('site'));
  else if (p === '/contact') want.push(c('contact'), c('site'));
  else if (p === '/help') want.push(c('help'));
  else if (p === '/image' || p === '/image/all') want.push(c('home'), c('site'));
  else if ((m = /^\/image\/([a-z0-9-]+)$/.exec(p))) want.push(c(`projects/${m[1]}`));
  else if (p === '/house/3d') want.push(c('house3d'), c('house'));
  else if (p === '/house/facade') want.push(c('house'), c('home'));
  else if (p.startsWith('/house/appendix/')) want.push(c('perec'), c('house'));
  else if ((m = /^\/house\/drawer\/([a-z0-9-]+)$/.exec(p))) want.push(c(`writings/${m[1]}`), c('drawers'));
  else if (p === '/house' || p.startsWith('/house/')) want.push(c('house'));
  else if (p === '/guides') want.push(...all.filter((f) => /^src\/content\/guides\/[a-z0-9-]+\/guide\.json$/.test(f)), c('guides/suggest'));
  else if ((m = /^\/guides\/([a-z0-9-]+)/.exec(p))) want.push(...GUIDE_FILES.map((f) => c(`guides/${m![1]}/${f}`)));
  if (!want.length) want.push(c('site'));
  const have = new Set(all);
  return [...new Set(want)].filter((f) => have.has(f) && isEditableJson(f));
}

// ---- Nothing that runs ----
// Several fields are put into pages as HTML (text blocks, captions, help
// topics, writings), and links go into href attributes: a saved text must not
// be able to run code in a visitor's browser, whoever saves it.

const RULES: [RegExp, string][] = [
  [/<\s*\/?\s*(?:script|iframe|frame|frameset|object|embed|applet|style|link|meta|base|form|input|button|textarea|select|option|svg|math|template|portal|noscript|xml)\b/i, 'a tag that can run code or change the page'],
  [/<[^>]*\son[a-z]+\s*=/i, 'an event attribute (onclick, onerror…)'],
  [/<[^>]*\b(?:href|src|srcset|action|formaction|poster|background|xlink:href)\s*=\s*["']?\s*(?:javascript|vbscript|data)\s*:/i, 'a javascript: or data: link'],
  [/<[^>]*\b(?:href|src|srcset)\s*=\s*["']?\s*&/i, 'a link written with entities'],
  [/<[^>]*\bsrcdoc\s*=/i, 'a srcdoc attribute'],
  [/<[^>]*\bstyle\s*=\s*["'][^"']*(?:expression\s*\(|url\s*\(\s*["']?\s*(?:javascript|vbscript|data)\s*:)/i, 'a style that runs code'],
  [/^\s*(?:javascript|vbscript)\s*:/i, 'a javascript: link'],
  [/^\s*data\s*:(?!image\/(?:png|jpe?g|gif|webp)[;,])/i, 'a data: link'],
];

export interface Active { at: string; why: string; text: string }

/** The first text in a JSON value that could run code in a browser, or null. */
export function activeContent(v: unknown, at = ''): Active | null {
  if (typeof v === 'string') {
    for (const [re, why] of RULES) {
      const m = re.exec(v);
      if (m) {
        const i = Math.max(0, m.index - 20);
        return { at: at || '(the file)', why, text: v.slice(i, m.index + m[0].length + 20) };
      }
    }
    return null;
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const r = activeContent(v[i], `${at}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      const r = activeContent(x, at ? `${at}.${k}` : k);
      if (r) return r;
    }
  }
  return null;
}

/** Where a JSON.parse error is, as line and column (1-based), if the message says. */
export function jsonErrorAt(text: string, message: string): { line: number; col: number } | null {
  const lc = /line (\d+) column (\d+)/i.exec(message);
  if (lc) return { line: Number(lc[1]), col: Number(lc[2]) };
  const pos = /position (\d+)/i.exec(message);
  if (!pos) return null;
  const before = text.slice(0, Number(pos[1]));
  const lines = before.split('\n');
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}
