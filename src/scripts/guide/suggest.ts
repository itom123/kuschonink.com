// Field Guide (导览): File ▸ Suggest a Place… and the toolbar's Suggest button.
// A Windows 98 wizard in five steps (what, when and where, more, about you,
// check and send) that posts to the Worker (worker/suggest.ts). Page content:
// it asks the desktop for its dialog through window.kus98 (./dom.ts) and keeps
// to its own window. What was typed stays in this tab (sessionStorage) until
// it is sent or the tab is closed; the picture doesn't.
//
// The picture is re-encoded here, at most 1600 px and as a JPEG, which also
// drops its EXIF and location; the Worker strips metadata again anyway.
import { SW } from '../../lib/guides/suggest-words';
import { desktop, dialog, fileSize, h, message, readStore, writeStore, type Bi } from './dom';

const MAX_SIDE = 1600;
const MAX_UPLOAD = 3.5 * 1024 * 1024;
const PROD_HOSTS = new Set(['kuschonink.com', 'www.kuschonink.com']);
/** Cloudflare's always-pass test key, for wrangler dev and previews (the server's test secret matches it). */
const TEST_SITEKEY = '1x00000000000000000000AA';
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const ACTION = 'kuschonink-suggest';

type Kind = 'exhibition' | 'event' | 'place';
interface Draft {
  kind: Kind; name: string; show: string; artists: string; own: boolean;
  start: string; end: string; hours: string; address: string;
  website: string; links: string; description: string; credit: string; rights: boolean;
  submitter: string; email: string; mayContact: boolean; creditAs: string;
}
const EMPTY: Draft = {
  kind: 'exhibition', name: '', show: '', artists: '', own: false, start: '', end: '', hours: '', address: '',
  website: '', links: '', description: '', credit: '', rights: false, submitter: '', email: '', mayContact: false, creditAs: '',
};
interface Picture { blob: Blob; url: string; w: number; h: number }

const draftKey = (slug: string) => `kus98:guide:suggest:${slug}`;

// ---- Small helpers ----

/** "&Place:" → "Place:" with the P underlined, in both languages (as the log-on box does). */
function ak(t: Bi): Node {
  const one = (s: string, lang: 'en' | 'zh') => {
    const span = h('span', { 'data-l': lang, ...(lang === 'zh' ? { lang: 'zh-Hans' } : {}) });
    const i = s.indexOf('&');
    if (i < 0 || i === s.length - 1) span.textContent = s.replace('&', '');
    else span.append(s.slice(0, i), h('u', {}, s[i + 1]), s.slice(i + 2));
    return span;
  };
  const f = document.createDocumentFragment();
  f.append(one(t.en, 'en'), one(t.zh || t.en, 'zh'));
  return f;
}
const plain = (t: Bi): Bi => ({ en: t.en.replace('&', ''), zh: (t.zh || t.en).replace(/\(&.\)|&/g, '') });

export const isUrl = (s: string) => {
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname);
  } catch {
    return false;
  }
};
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const hasHtml = (s: string) => /<\s*[a-z!/?]/i.test(s);
const linksOf = (s: string) => s.split(/\s*\n\s*/).map((x) => x.trim()).filter(Boolean);

type TS = { render: (el: Element, o: object) => string; reset: (id?: string) => void; remove?: (id: string) => void };
let loading: Promise<TS> | null = null;
function loadTurnstile(): Promise<TS> {
  const w = window as unknown as { turnstile?: TS };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  loading ??= new Promise<TS>((resolve, reject) => {
    const done = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error('turnstile')));
    const old = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`);
    if (old) {
      old.addEventListener('load', done, { once: true });
      setTimeout(done, 8000);
      return;
    }
    const s = document.createElement('script');
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.onload = done;
    s.onerror = () => reject(new Error('turnstile'));
    document.head.appendChild(s);
  });
  loading.catch(() => (loading = null));
  return loading;
}

/** A picture file → at most 1600 px, as a JPEG (no EXIF), or null when the browser can't read it. */
async function shrink(file: Blob): Promise<Picture | null> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const ht = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = ht;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff'; // transparent PNGs get a white ground, as a JPEG must
  ctx.fillRect(0, 0, w, ht);
  ctx.drawImage(bmp, 0, 0, w, ht);
  bmp.close();
  let q = 0.86;
  let blob: Blob | null = null;
  for (;;) {
    blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', q));
    if (!blob || blob.size <= MAX_UPLOAD || q < 0.45) break;
    q -= 0.15;
  }
  if (!blob || blob.size > MAX_UPLOAD) return null;
  return { blob, url: URL.createObjectURL(blob), w, h: ht };
}

const asBase64 = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

// ---- The wizard ----

export function openSuggest(root: HTMLElement, onClosed?: () => void) {
  const slug = root.dataset.slug ?? '';
  const owner = root.closest<HTMLElement>('[data-window]') ?? root;
  const prod = PROD_HOSTS.has(location.hostname);
  const sitekey = prod ? root.dataset.suggestKey || '' : TEST_SITEKEY;
  const d: Draft = { ...EMPTY, ...(readStore<Partial<Draft>>('session', draftKey(slug)) ?? {}) };
  const save = () => writeStore('session', draftKey(slug), d);
  let picture: Picture | null = null;
  let step = 0;
  let token = '';
  let widget: string | undefined;
  let sending = false;
  const opened = Date.now();
  const id = crypto.randomUUID();

  // Fields, kept across steps.
  const input = (k: keyof Draft, o: Record<string, string | number | boolean | Bi> = {}) => {
    const el = h('input', { type: 'text', name: k, ...o });
    el.value = String(d[k] ?? '');
    el.addEventListener('input', () => { (d as unknown as Record<string, unknown>)[k] = el.value; save(); });
    return el;
  };
  const area = (k: keyof Draft, o: Record<string, string | number | Bi> = {}) => {
    const el = h('textarea', { name: k, ...o });
    el.value = String(d[k] ?? '');
    el.addEventListener('input', () => { (d as unknown as Record<string, unknown>)[k] = el.value; save(); });
    return el;
  };
  // 98.css draws a tick box or radio button only for an <input> followed by its <label for>.
  const uid = Math.random().toString(36).slice(2, 8);
  const tick = (k: 'own' | 'rights' | 'mayContact', text: Bi) => {
    const id = `gs-${uid}-${k}`;
    const el = h('input', { type: 'checkbox', name: k, id });
    el.checked = d[k];
    el.addEventListener('change', () => { d[k] = el.checked; save(); });
    return { el, row: h('div', { class: 'gs-tick' }, [el, h('label', { for: id }, text)]) };
  };
  const row = (label: Bi, field: HTMLElement, note?: Bi) => {
    const fid = `gs-${uid}-${field.getAttribute('name')}`;
    field.id = fid;
    return h('div', { class: 'gs-row' }, [h('label', { for: fid }, [ak(label)]), h('div', { class: 'gs-field' }, [field, note ? h('small', {}, note) : null])]);
  };

  const f = {
    name: input('name', { maxlength: 160, required: true, autocomplete: 'off', placeholder: SW.namePh }),
    show: input('show', { maxlength: 200, autocomplete: 'off' }),
    artists: input('artists', { maxlength: 300, autocomplete: 'off', placeholder: SW.artistsPh }),
    start: input('start', { type: 'date' }),
    end: input('end', { type: 'date' }),
    hours: input('hours', { maxlength: 300, autocomplete: 'off', placeholder: SW.hoursPh }),
    address: input('address', { maxlength: 200, required: true, autocomplete: 'street-address', placeholder: SW.addressPh }),
    website: input('website', { type: 'url', maxlength: 500, inputmode: 'url', autocomplete: 'url', placeholder: 'https://' }),
    links: area('links', { rows: 3, maxlength: 2600, placeholder: SW.linksPh }),
    description: area('description', { rows: 4, maxlength: 1000 }),
    credit: input('credit', { maxlength: 160, autocomplete: 'off', placeholder: SW.creditPh }),
    submitter: input('submitter', { maxlength: 120, autocomplete: 'name' }),
    email: input('email', { type: 'email', maxlength: 254, inputmode: 'email', autocomplete: 'email' }),
    creditAs: input('creditAs', { maxlength: 80, autocomplete: 'off', placeholder: SW.creditAsPh }),
  };
  const own = tick('own', SW.own);
  const rights = tick('rights', SW.rights);
  const mayContact = tick('mayContact', SW.mayContact);
  const kinds = (Object.keys(SW.kinds) as Kind[]).map((k) => {
    const id = `gs-${uid}-kind-${k}`;
    const el = h('input', { type: 'radio', name: `gs-${uid}-kind`, value: k, id });
    el.checked = d.kind === k;
    el.addEventListener('change', () => { if (el.checked) { d.kind = k; save(); } });
    return h('div', { class: 'gs-tick' }, [el, h('label', { for: id }, SW.kinds[k])]);
  });

  // The picture: a hidden file input, a thumbnail, and Choose / Remove.
  const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif', class: 'gs-file', tabindex: -1, 'aria-hidden': 'true' });
  const choose = h('button', { type: 'button', name: 'picture' }, SW.pictureChoose);
  const remove = h('button', { type: 'button', hidden: true }, SW.pictureRemove);
  const thumb = h('span', { class: 'gs-thumb' }, SW.pictureNone);
  const pictureNote = h('small', { role: 'status' }, SW.pictureNote);
  const showPicture = () => {
    thumb.replaceChildren(picture ? h('img', { src: picture.url, alt: '', width: picture.w, height: picture.h }) : h('span', {}, SW.pictureNone));
    if (picture) thumb.append(h('span', {}, `${picture.w} × ${picture.h} · ${fileSize(picture.blob.size).en}`));
    remove.hidden = !picture;
  };
  choose.addEventListener('click', () => file.click());
  remove.addEventListener('click', () => {
    if (picture) URL.revokeObjectURL(picture.url);
    picture = null;
    file.value = '';
    showPicture();
  });
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    pictureNote.replaceChildren(h('span', {}, SW.pictureReading));
    const p = await shrink(chosen);
    if (picture) URL.revokeObjectURL(picture.url);
    picture = p;
    pictureNote.replaceChildren(h('span', {}, p ? SW.pictureNote : SW.pictureBad));
    showPicture();
  });

  // Steps.
  const pane = (title: Bi, lead: Bi, ...kids: (Node | null)[]) => h('div', { class: 'gs-pane' }, [h('h2', { class: 'gs-title' }, title), h('p', { class: 'gs-lead' }, lead), ...kids]);
  const summary = h('dl', { class: 'gs-summary' });
  const verify = h('div', { class: 'gs-turnstile' });
  const trap = h('input', { type: 'text', name: 'homepage', tabindex: -1, autocomplete: 'off', class: 'gs-trap', 'aria-hidden': 'true' });
  const panes = [
    pane(SW.whatTitle, SW.whatLead, h('fieldset', { class: 'gs-kinds' }, [h('legend', {}, SW.kind), ...kinds]), row(SW.name, f.name), row(SW.show, f.show), row(SW.artists, f.artists), own.row),
    pane(SW.whenTitle, SW.whenLead, h('div', { class: 'gs-pair' }, [row(SW.start, f.start), row(SW.end, f.end)]), row(SW.hours, f.hours), row(SW.address, f.address)),
    pane(
      SW.moreTitle, SW.moreLead,
      row(SW.website, f.website), row(SW.links, f.links), row(SW.description, f.description),
      h('div', { class: 'gs-row' }, [h('span', { class: 'gs-label' }, [ak(SW.picture)]), h('div', { class: 'gs-field gs-picture' }, [thumb, h('span', { class: 'gs-pic-buttons' }, [choose, remove]), pictureNote, file])]),
      row(SW.credit, f.credit), rights.row,
    ),
    pane(SW.youTitle, SW.youLead, row(SW.submitter, f.submitter), row(SW.email, f.email), mayContact.row, row(SW.creditAs, f.creditAs), h('p', { class: 'gs-privacy' }, [h('span', { class: 'ico ico16 ico-info', 'aria-hidden': 'true' }), h('span', {}, SW.privacy)])),
    pane(SW.checkTitle, SW.checkLead, summary, verify, trap),
  ];

  const problem = h('p', { class: 'gs-problem', role: 'alert', hidden: true });
  const stepText = h('span', { class: 'gs-step' });
  const back = h('button', { type: 'button' }, SW.back);
  const next = h('button', { type: 'submit', class: 'default' }, SW.next);
  const cancel = h('button', { type: 'button' }, SW.cancel);
  const body = h('form', { class: 'gd-suggest', novalidate: true }, [
    h('div', { class: 'gs-side', 'aria-hidden': 'true' }, h('span', { class: 'ico ico-guide' })),
    h('div', { class: 'gs-main' }, [...panes, problem]),
    h('div', { class: 'gs-buttons' }, [stepText, back, next, cancel]),
  ]);
  const win = dialog({
    title: SW.title,
    icon: 'guide',
    body,
    owner,
    className: 'gd-suggest-dialog',
    onClose: () => {
      onClosed?.();
      if (picture) URL.revokeObjectURL(picture.url);
      const w = window as unknown as { turnstile?: TS };
      if (widget) w.turnstile?.remove?.(widget);
    },
  });

  const say = (t: Bi | null, focus?: HTMLElement) => {
    problem.hidden = !t;
    problem.replaceChildren(t ? h('span', {}, t) : '');
    focus?.focus();
  };

  /** The first thing wrong on a step, with the field to go to. */
  function wrong(n: number): [Bi, HTMLElement] | null {
    if (n === 0) {
      if ([...d.name.trim()].length < 2) return [SW.required, f.name];
      for (const k of ['name', 'show', 'artists'] as const) if (hasHtml(d[k])) return [SW.noHtml, f[k]];
    }
    if (n === 1) {
      if (d.start && !isDate(d.start)) return [SW.badDate, f.start];
      if (d.end && !isDate(d.end)) return [SW.badDate, f.end];
      if (d.start && d.end && d.start > d.end) return [SW.beforeStart, f.end];
      if ([...d.address.trim()].length < 5) return [SW.required, f.address];
      if (hasHtml(d.hours) || hasHtml(d.address)) return [SW.noHtml, hasHtml(d.hours) ? f.hours : f.address];
    }
    if (n === 2) {
      if (d.website.trim() && !isUrl(d.website.trim())) return [SW.badUrl, f.website];
      const l = linksOf(d.links);
      if (l.length > 5) return [SW.tooManyLinks, f.links];
      if (l.some((x) => !isUrl(x))) return [SW.badUrl, f.links];
      if (hasHtml(d.description)) return [SW.noHtml, f.description];
      if (picture && !d.credit.trim()) return [SW.needCredit, f.credit];
      if (picture && !d.rights) return [SW.needRights, rights.el];
    }
    if (n === 3) {
      if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) return [SW.badEmail, f.email];
      if (hasHtml(d.submitter) || hasHtml(d.creditAs)) return [SW.noHtml, hasHtml(d.submitter) ? f.submitter : f.creditAs];
    }
    return null;
  }

  function fillSummary() {
    const item = (k: Bi, v: string | Bi | null) => [h('dt', {}, plain(k)), h('dd', {}, v === null || v === '' ? SW.nothing : v)];
    const dates = [d.start, d.end].filter(Boolean).join(' – ');
    summary.replaceChildren(
      ...item(SW.kind, SW.kinds[d.kind]),
      ...item(SW.name, d.name.trim()),
      ...item(SW.show, d.show.trim()),
      ...item(SW.artists, d.artists.trim()),
      ...item({ en: 'Dates', zh: '日期' }, dates),
      ...item(SW.hours, d.hours.trim()),
      ...item(SW.address, d.address.trim()),
      ...item(SW.website, d.website.trim()),
      ...item(SW.links, linksOf(d.links).join('\n')),
      ...item(SW.description, d.description.trim()),
      ...item(SW.picture, picture ? `${picture.w} × ${picture.h} JPEG, ${fileSize(picture.blob.size).en} · ${d.credit.trim()}` : null),
      ...item({ en: 'Your own', zh: '你自己的' }, d.own ? SW.yes : SW.no),
      ...item(SW.submitter, d.submitter.trim()),
      ...item(SW.email, d.email.trim() ? `${d.email.trim()} (${d.mayContact ? plain(SW.mayContact).en : '—'})` : ''),
      ...item(SW.creditAs, d.creditAs.trim()),
    );
  }

  function prepareTurnstile() {
    if (widget || !panes[4].isConnected) return;
    if (!sitekey) {
      next.disabled = true;
      say(SW.notOpen);
      return;
    }
    next.disabled = true;
    verify.replaceChildren(h('span', { class: 'gs-wait' }, SW.verifying));
    loadTurnstile()
      .then((ts) => {
        if (!body.isConnected) return;
        verify.replaceChildren();
        widget = ts.render(verify, {
          sitekey,
          action: ACTION,
          language: document.documentElement.dataset.lang === 'zh' ? 'zh-cn' : 'en',
          callback: (t: string) => { token = t; if (!sending) next.disabled = false; },
          'expired-callback': () => { token = ''; next.disabled = true; },
          'error-callback': () => say(SW.errors.verification_unavailable),
        });
      })
      .catch(() => {
        verify.replaceChildren();
        say(SW.errors.verification_unavailable);
      });
  }

  function show(n: number) {
    step = n;
    panes.forEach((p, i) => (p.hidden = i !== n));
    say(null);
    back.disabled = n === 0;
    next.replaceChildren(h('span', {}, n === panes.length - 1 ? SW.send : SW.next));
    next.disabled = false;
    stepText.replaceChildren(h('span', {}, SW.step(n + 1, panes.length)));
    if (n === panes.length - 1) {
      fillSummary();
      prepareTurnstile();
      if (widget && !token) next.disabled = true;
      next.focus();
    } else panes[n].querySelector<HTMLElement>('input:not([type=hidden]):not([type=file]), textarea')?.focus();
  }

  back.addEventListener('click', () => step > 0 && show(step - 1));
  cancel.addEventListener('click', () => win.close());
  body.addEventListener('submit', (e) => {
    e.preventDefault();
    if (step < panes.length - 1) {
      const w = wrong(step);
      if (w) return say(w[0], w[1]);
      return show(step + 1);
    }
    void send();
  });

  /** Back to the step and field the server named. */
  function serverSays(error: string, field?: string) {
    const at: Record<string, [number, HTMLElement]> = {
      name: [0, f.name], show: [0, f.show], artists: [0, f.artists], start: [1, f.start], end: [1, f.end], hours: [1, f.hours], address: [1, f.address],
      website: [2, f.website], links: [2, f.links], description: [2, f.description], picture: [2, choose], pictureCredit: [2, f.credit], rights: [2, rights.el],
      submitter: [3, f.submitter], email: [3, f.email], creditAs: [3, f.creditAs],
    };
    const msg: Bi =
      SW.errors[error] ??
      (error === 'missing' ? (field === 'rights' ? SW.needRights : field === 'pictureCredit' ? SW.needCredit : SW.required)
        : error === 'before_start' ? SW.beforeStart
        : error === 'html_not_allowed' ? SW.noHtml
        : error === 'too_many' ? SW.tooManyLinks
        : field === 'email' ? SW.badEmail
        : field === 'website' || field === 'links' ? SW.badUrl
        : field === 'start' || field === 'end' ? SW.badDate
        : { en: `This could not be sent (${error}${field ? `: ${field}` : ''}).`, zh: `无法发送（${error}${field ? `：${field}` : ''}）。` });
    const target = field ? at[field] : undefined;
    if (target) {
      show(target[0]);
      say(msg, target[1]);
    } else say(msg);
  }

  async function send() {
    if (sending || !token) return;
    sending = true;
    next.disabled = back.disabled = true;
    say(SW.sending);
    const payload = {
      id, kind: d.kind, name: d.name.trim(), show: d.show.trim(), artists: d.artists.trim(), own: d.own,
      start: d.start, end: d.end, hours: d.hours.trim(), address: d.address.trim(),
      website: d.website.trim(), links: linksOf(d.links), description: d.description.trim(),
      picture: picture ? await asBase64(picture.blob) : '', pictureCredit: picture ? d.credit.trim() : '', rights: !!picture && d.rights,
      submitter: d.submitter.trim(), email: d.email.trim(), mayContact: d.mayContact && !!d.email.trim(), creditAs: d.creditAs.trim(),
      lang: document.documentElement.dataset.lang === 'zh' ? 'zh' : 'en',
      homepage: trap.value, elapsed: Date.now() - opened, turnstileToken: token,
    };
    let res: Response | null = null;
    try {
      res = await fetch(`/guides/${encodeURIComponent(slug)}/suggest`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload), credentials: 'same-origin' });
    } catch { /* offline */ }
    const out = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; reference?: string; repeat?: boolean; error?: string; field?: string }) : { error: 'offline' };
    sending = false;
    if (res?.ok && out.reference) return done(out.reference, !!out.repeat);
    // A token works once: the check runs again before the next try.
    token = '';
    const w = window as unknown as { turnstile?: TS };
    if (widget) w.turnstile?.reset(widget);
    back.disabled = false;
    desktop()?.play('chord');
    serverSays(out.error ?? 'error', out.field);
  }

  function done(reference: string, repeat: boolean) {
    writeStore('session', draftKey(slug), null);
    const ok = h('button', { type: 'button', class: 'default' }, SW.close);
    body.replaceChildren(
      h('div', { class: 'gs-side', 'aria-hidden': 'true' }, h('span', { class: 'ico ico-guide' })),
      h('div', { class: 'gs-main' }, h('div', { class: 'gs-pane gs-done' }, [
        h('h2', { class: 'gs-title' }, SW.doneTitle),
        h('p', {}, repeat ? SW.doneAgain(reference) : SW.done(reference)),
        h('p', { class: 'gs-ref' }, reference),
        h('p', {}, SW.doneMail),
      ])),
      h('div', { class: 'gs-buttons' }, [ok]),
    );
    ok.addEventListener('click', () => win.close());
    ok.focus();
    desktop()?.play('ding');
  }

  showPicture();
  show(0);
  return win;
}

/** Wire the toolbar button and the gd:suggest event of each guide window, once. */
export function initSuggest() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-gd]:not([data-suggest-ready])')) {
    root.dataset.suggestReady = '1';
    const win = root.closest<HTMLElement>('[data-window]') ?? document.body;
    const open = () => {
      if (!document.contains(root)) return;
      // One wizard per guide window.
      if (root.dataset.suggestOpen) return void message({ title: SW.title, text: { en: 'The wizard is already open.', zh: '向导已经打开了。' }, owner: win });
      root.dataset.suggestOpen = '1';
      openSuggest(root, () => delete root.dataset.suggestOpen);
    };
    win.addEventListener('click', (e) => {
      if ((e.target as Element).closest?.('[data-cmd="gd-suggest"]')) {
        e.preventDefault();
        open();
      }
    });
    root.addEventListener('gd:suggest', open);
  }
}
