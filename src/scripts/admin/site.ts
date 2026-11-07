// Upload Picture... and New Project... (the admin folder and Notepad). A
// picture that is too big for its folder is made smaller here first (a JPEG);
// /v1/admin/pictures and /v1/admin/projects (worker/admin-files.ts) then strip
// its metadata and check everything again, so nothing here is trusted.
import { AW } from '../../lib/admin-words';
import { pictureName, pictureRule, slugify, type PictureKind } from '../../lib/admin-files';
import { api } from './api';
import { el, kus, pick, tell, type Bi } from './ui';

const KIND: Record<string, PictureKind> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
/** Longest side a picture is made smaller to, when it has to be: the site's pictures, and guide entries'. */
const SHRINK = { asset: 4000, guide: 1280 };

const plain = (b: Bi) => pick(b).replace(/\(&.\)|&/g, '');

async function toBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * The picture as it will be sent: as it is when it fits the folder's rule,
 * else made smaller as a JPEG. Null when the browser can't read it.
 */
async function prepare(file: File, path: string): Promise<{ data: string; kind: PictureKind } | null> {
  const rule = pictureRule(path);
  let kind = KIND[file.type];
  if (!rule || !kind) return null;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return null;
  let blob: Blob = file;
  const side = Math.max(bmp.width, bmp.height);
  if (side > rule.maxSide || file.size > rule.maxBytes || !rule.kinds.includes(kind)) {
    const target = Math.min(side, rule.src === null ? SHRINK.guide : SHRINK.asset);
    const scale = target / side;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; // a JPEG has no transparency
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [0.9, 0.82, 0.72, 0.6, 0.5]) {
      blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b ?? new Blob()), 'image/jpeg', q));
      if (blob.size <= rule.maxBytes) break;
    }
    kind = 'jpeg';
  }
  bmp.close();
  return { data: await toBase64(blob), kind };
}

interface Row { label: Bi; input: HTMLElement; id: string }

/** A dialog with these rows; resolves true on OK (after `submit` says it may close), false on Cancel. */
function dialog(owner: Element | null, title: Bi, lead: Bi, rows: Row[], submit: () => Promise<boolean>): Promise<boolean> {
  return new Promise((resolve) => {
    const ok = el('button', { type: 'submit', class: 'default' }, pick(AW.ok));
    const cancel = el('button', { type: 'button' }, pick(AW.cancel));
    const body = el('form', { class: 'adm-form' },
      el('p', { class: 'adm-lead' }, lead),
      ...rows.map((r) => (r.input instanceof HTMLInputElement && r.input.type === 'checkbox'
        ? el('div', { class: 'adm-row adm-row-check' }, el('span'), el('span', {}, r.input, el('label', { for: r.id }, plain(r.label))))
        : el('div', { class: 'adm-row' }, el('label', { for: r.id }, plain(r.label)), r.input))),
      el('div', { class: 'adm-buttons' }, ok, cancel));
    let done = false;
    const k = kus();
    if (!k) return resolve(false);
    const d = k.dialog({ title, body, owner, icon: 'keys', className: 'adm-dialog', onClose: () => { if (!done) resolve(false); } });
    cancel.addEventListener('click', () => { done = true; d.close(); resolve(false); });
    body.addEventListener('submit', async (e) => {
      e.preventDefault();
      ok.disabled = true;
      try {
        if (await submit()) {
          done = true;
          d.close();
          resolve(true);
        }
      } finally {
        ok.disabled = false;
      }
    });
    rows[0]?.input.focus();
  });
}

const uid = () => Math.random().toString(36).slice(2, 8);

/** Upload Picture...: into one of `folders`; resolves with what was added, or null. */
export async function uploadPicture(owner: Element | null, folders: string[], prefer = ''): Promise<{ path: string; src: string | null } | null> {
  const id = uid();
  const folder = el('select', { id: `${id}-f` }, ...folders.map((f) => el('option', { value: f }, f.replace(/^src\/assets\/images\//, 'images/'))));
  folder.value = folders.includes(prefer) ? prefer : folders[0] ?? '';
  const file = el('input', { id: `${id}-p`, type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  const name = el('input', { id: `${id}-n`, type: 'text', spellcheck: 'false', autocapitalize: 'off' });
  const replace = el('input', { id: `${id}-r`, type: 'checkbox' });
  const guide = () => folder.value.startsWith('public/guides/');
  const suggest = () => {
    const f = file.files?.[0];
    if (!f) return;
    if (guide()) name.placeholder = 'A12';
    else name.value = pictureName(f.name, KIND[f.type] ?? 'jpeg');
  };
  file.addEventListener('change', suggest);
  folder.addEventListener('change', () => { name.value = ''; suggest(); });
  let out: { path: string; src: string | null } | null = null;
  const owned = owner ?? null;
  await dialog(owned, { en: AW.uploadPicture.en, zh: AW.uploadPicture.zh }, AW.uploadLead, [
    { label: AW.folderLabel, input: folder, id: `${id}-f` },
    { label: AW.fileLabel, input: file, id: `${id}-p` },
    { label: AW.nameLabel, input: name, id: `${id}-n` },
    { label: AW.replaceLabel, input: replace, id: `${id}-r` },
  ], async () => {
    const f = file.files?.[0];
    if (!f) {
      await tell(AW.uploadPicture, { en: 'Choose a picture first.', zh: '请先选择一张图片。' }, 'warning', owned);
      return false;
    }
    // A guide entry's picture is named after the entry (A12.jpg); others keep their own name.
    const base = guide() ? `${name.value.trim().toUpperCase().replace(/\.JPE?G$/, '')}.jpg` : name.value.trim() || pictureName(f.name, KIND[f.type] ?? 'jpeg');
    let path = `${folder.value}/${base}`;
    const pic = await prepare(f, path);
    if (!pic) {
      await tell(AW.uploadPicture, { en: 'That isn’t a JPEG, PNG or WebP picture this browser can read.', zh: '这不是浏览器能读取的 JPEG、PNG 或 WebP 图片。' }, 'warning', owned);
      return false;
    }
    // Made smaller as a JPEG: the name follows.
    if (pic.kind === 'jpeg' && !/\.jpg$/.test(path)) path = path.replace(/\.[a-z]+$/, '.jpg');
    if (!pictureRule(path)) {
      await tell(AW.uploadPicture, guide() ? { en: 'Name it after the entry: a letter and a number, like A12.', zh: '请用条目编号命名：一个字母加数字，例如 A12。' } : { en: 'Use lower-case letters, digits and dashes, ending .jpg, .png or .webp.', zh: '请使用小写字母、数字和连字符，以 .jpg、.png 或 .webp 结尾。' }, 'warning', owned);
      return false;
    }
    const r = await api<{ src: string | null; path: string }>('/pictures', { path, data: pic.data, replace: replace.checked });
    if (!r.ok) {
      await tell(AW.uploadPicture, r.data.error === 'exists' ? AW.exists : r.data.error === 'not_configured' ? AW.notSetUp('GitHub (GITHUB_TOKEN)') : AW.failed2(r.data.error ?? String(r.status)), 'warning', owned);
      return false;
    }
    out = { path: r.data.path, src: r.data.src };
    kus()?.play('ding');
    if (r.data.src) {
      try { await navigator.clipboard.writeText(r.data.src); } catch { /* not allowed: it's in the message */ }
      await tell(AW.uploadPicture, AW.uploaded(r.data.src), 'info', owned);
    } else await tell(AW.uploadPicture, AW.uploadedGuide, 'info', owned);
    return true;
  });
  return out;
}

/** New Project...: resolves with the new project's content file, or null. */
export async function newProject(owner: Element | null): Promise<string | null> {
  const id = uid();
  const title = el('input', { id: `${id}-t`, type: 'text', maxlength: '120' });
  const titleZh = el('input', { id: `${id}-z`, type: 'text', maxlength: '120' });
  const slug = el('input', { id: `${id}-s`, type: 'text', maxlength: '60', spellcheck: 'false', autocapitalize: 'off', pattern: '[a-z0-9][a-z0-9-]{1,59}' });
  const file = el('input', { id: `${id}-p`, type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  const first = el('input', { id: `${id}-1`, type: 'checkbox' });
  first.checked = true;
  let slugTouched = false;
  slug.addEventListener('input', () => { slugTouched = true; });
  title.addEventListener('input', () => { if (!slugTouched) slug.value = slugify(title.value); });
  let made: string | null = null;
  const owned = owner ?? null;
  await dialog(owned, { en: AW.newProject.en, zh: AW.newProject.zh }, AW.projectLead, [
    { label: AW.titleLabel, input: title, id: `${id}-t` },
    { label: AW.titleZhLabel, input: titleZh, id: `${id}-z` },
    { label: AW.slugLabel, input: slug, id: `${id}-s` },
    { label: AW.fileLabel, input: file, id: `${id}-p` },
    { label: AW.firstLabel, input: first, id: `${id}-1` },
  ], async () => {
    const f = file.files?.[0];
    const s = slug.value.trim();
    if (title.value.trim().length < 2 || !/^[a-z0-9][a-z0-9-]{1,59}$/.test(s) || !f) {
      await tell(AW.newProject, { en: 'It needs a title, an address (lower-case letters, digits and dashes) and a first picture.', zh: '需要标题、地址（小写字母、数字和连字符）和第一张图片。' }, 'warning', owned);
      return false;
    }
    let name = pictureName(f.name, KIND[f.type] ?? 'jpeg');
    const pic = await prepare(f, `src/assets/images/projects/${s}/${name}`);
    if (!pic) {
      await tell(AW.newProject, { en: 'That isn’t a JPEG, PNG or WebP picture this browser can read.', zh: '这不是浏览器能读取的 JPEG、PNG 或 WebP 图片。' }, 'warning', owned);
      return false;
    }
    if (pic.kind === 'jpeg') name = name.replace(/\.[a-z]+$/, '.jpg');
    const r = await api<{ url: string; file: string }>('/projects', { slug: s, title: title.value.trim(), titleZh: titleZh.value.trim(), first: first.checked, picture: { name, data: pic.data } });
    if (!r.ok) {
      await tell(AW.newProject, r.data.error === 'exists' ? AW.projectExists : r.data.error === 'not_configured' ? AW.notSetUp('GitHub (GITHUB_TOKEN)') : AW.failed2(r.data.error ?? String(r.status)), 'warning', owned);
      return false;
    }
    made = r.data.file;
    kus()?.play('ding');
    await tell(AW.newProject, AW.projectMade(r.data.url), 'info', owned);
    return true;
  });
  return made;
}
