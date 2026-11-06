// File ▸ Send to Xiangyin…: the picture, with an optional name, email and
// note, goes to the site's Worker (worker/drawing.ts), which emails it to the
// artist's inbox. The dialog says what is sent and where before anything
// leaves the device, shows the upload, and says what happened after.
import { MAX_BYTES, SEND_ENDPOINT, TURNSTILE_ACTION } from '../../lib/paint';
import type { PaintDoc } from './doc';
import { desktop, dialog, fileSize, h, type Bi } from './dom';

const ERRORS: Record<string, Bi> = {
  verification_failed: { en: 'The anti-spam check failed. Please try again.', zh: '反垃圾验证失败，请重试。' },
  verification_unavailable: { en: 'The anti-spam check could not be reached. Please try again in a moment.', zh: '暂时无法连接反垃圾验证。请稍后再试。' },
  rate_limited: { en: 'Too many pictures just now. Please wait a minute, then try again.', zh: '刚才发送的图片太多了。请等一分钟再试。' },
  image_too_large: { en: 'The picture is too large to send. Make it smaller (Image ▸ Attributes) and try again.', zh: '这幅画太大，无法发送。请把它改小（图像 ▸ 属性）后再试。' },
  payload_too_large: { en: 'The picture is too large to send. Make it smaller (Image ▸ Attributes) and try again.', zh: '这幅画太大，无法发送。请把它改小（图像 ▸ 属性）后再试。' },
  invalid_image: { en: 'The picture could not be read. Please try again.', zh: '无法读取这幅画。请重试。' },
  invalid_submission: { en: 'Please check your email address (or leave it empty).', zh: '请检查你的电子邮箱地址（或者留空）。' },
  field_too_long: { en: 'The note is too long (2,000 characters at most).', zh: '附言太长了（最多 2000 个字符）。' },
};

type TS = { render: (el: Element, o: object) => string; reset: (id?: string) => void; remove?: (id: string) => void };
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TS> | null = null;
function loadTurnstile(): Promise<TS> {
  const w = window as unknown as { turnstile?: TS };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  loading ??= new Promise<TS>((resolve, reject) => {
    const done = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error('turnstile')));
    const old = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`);
    if (old) {
      // The contact form is loading it already.
      old.addEventListener('load', done, { once: true });
      old.addEventListener('error', () => reject(new Error('turnstile')), { once: true });
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

/** The picture as a PNG small enough for the Worker, as a data: URL. */
async function encode(doc: PaintDoc) {
  let scale = 1;
  let blob = await doc.toBlob(1);
  // Very busy pictures (a photograph opened in Paint) are made smaller to fit.
  for (let i = 0; i < 4 && blob && blob.size > MAX_BYTES * 0.97; i++) {
    scale *= Math.sqrt((MAX_BYTES * 0.85) / blob.size);
    blob = await doc.toBlob(scale);
  }
  if (!blob || blob.size > MAX_BYTES) return null;
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob!);
  });
  return { blob, url, w: Math.round(doc.width * scale), h: Math.round(doc.height * scale), scaled: scale < 1 };
}

export interface SendOpts {
  owner: Element;
  doc: PaintDoc;
  /** The artist's first name ("Xiangyin") and full name. */
  artist: string;
  artistFull: string;
  /** The picture's name ("untitled"). */
  name: string;
  sitekey?: string;
  onSent: () => void;
  saveCopy: () => void;
}

/** What sending does, in four steps and four facts (Help ▸ How Sending Works, and the note's link). */
export function howItWorks(owner: Element, artist: string) {
  const li = (t: Bi) => h('li', {}, t);
  const fact = (k: Bi, v: Bi) => h('p', {}, [h('b', {}, k), ' ', v]);
  const ok = h('button', { type: 'button', class: 'default' }, { en: 'OK', zh: '确定' });
  const body = h('div', { class: 'paint-how' }, [
    h('div', { class: 'ph-row' }, [
      h('span', { class: 'ico ico-paint', 'aria-hidden': 'true' }),
      h('div', {}, [
        h('p', { class: 'ph-lead' }, { en: `Paint is for drawing something for ${artist}. Here is how it reaches him:`, zh: `“画图”是用来给 ${artist} 画点什么的。它是这样送到他那里的：` }),
        h('ol', {}, [
          li({ en: 'Draw with a mouse, a finger or a pen. You can also open a picture you made somewhere else (File ▸ Open) and draw on it.', zh: '用鼠标、手指或手写笔作画。你也可以打开在别处画好的图片（文件 ▸ 打开），在上面接着画。' }),
          li({ en: `Click Send to ${artist}, in the toolbar or the File menu.`, zh: `单击工具栏或“文件”菜单里的“发给 ${artist}”。` }),
          li({ en: 'If you like, add your name, a note, and your email address so he can reply. All three are optional.', zh: '如果愿意，可以写上你的名字、一段附言，以及你的电子邮箱地址，方便他回复。三项都可以不填。' }),
          li({ en: `Click Send. The picture arrives in ${artist}’s inbox, with your note.`, zh: `单击“发送”。这幅画会连同你的附言一起送到 ${artist} 的邮箱。` }),
        ]),
        fact({ en: 'What is sent:', zh: '发送的内容：' }, { en: 'the picture (a PNG file), and your name, email and note if you fill them in. Nothing else.', zh: '这幅画（PNG 文件），以及你填写的名字、电子邮箱和附言。没有别的。' }),
        fact({ en: 'Where it goes:', zh: '它去哪里：' }, { en: `by email to ${artist}, through this website’s server. It isn’t posted on the website or shown to anyone else, and the website doesn’t keep a copy.`, zh: `通过这个网站的服务器，以电子邮件发给 ${artist}。它不会发布在网站上，也不会给别人看，网站也不保留副本。` }),
        fact({ en: 'While you draw:', zh: '作画的时候：' }, { en: 'the picture is kept only in this browser, so closing Paint doesn’t lose it. File ▸ New starts again.', zh: '这幅画只保存在这个浏览器里，所以关闭“画图”也不会丢失。文件 ▸ 新建可以重新开始。' }),
        fact({ en: 'Other ways:', zh: '其他方式：' }, { en: 'File ▸ Save keeps a copy on your device, to share however you like, for example on Instagram.', zh: '文件 ▸ 保存可以在你的设备上保留一份，随你怎么分享，比如发到 Instagram。' }),
      ]),
    ]),
    h('div', { class: 'ph-buttons' }, [ok]),
  ]);
  const win = dialog({ title: { en: 'How Sending Works', zh: '如何发送' }, icon: 'help', body, owner, className: 'paint-how-dialog' });
  ok.addEventListener('click', () => win.close());
  ok.focus();
}

export async function openSend(o: SendOpts) {
  const pic = await encode(o.doc);
  const fileName = `${o.name}.png`;
  const thumbUrl = pic ? URL.createObjectURL(pic.blob) : '';

  const nameIn = h('input', { type: 'text', name: 'name', maxlength: 120, autocomplete: 'name', placeholder: { en: 'Your name (optional)', zh: '你的名字（可不填）' } });
  const emailIn = h('input', { type: 'email', name: 'email', maxlength: 254, autocomplete: 'email', inputmode: 'email', placeholder: { en: 'So he can reply (optional)', zh: '方便他回复（可不填）' } });
  const note = h('textarea', { name: 'message', rows: 3, maxlength: 2000, placeholder: { en: 'A note to go with it (optional)', zh: '附上几句话（可不填）' } });
  const trap = h('input', { type: 'text', name: 'website', tabindex: -1, autocomplete: 'off', class: 'ps-trap', 'aria-hidden': 'true' });
  const status = h('p', { class: 'ps-status', role: 'status', 'aria-live': 'polite', hidden: true });
  const bar = h('span', { class: 'progress-indicator-bar' });
  const progressText = h('p', { class: 'ps-progress-text' });
  const progress = h('div', { class: 'ps-progress', hidden: true }, [progressText, h('div', { class: 'progress-indicator segmented' }, bar)]);
  const verify = h('div', { class: 'ps-turnstile' });
  const send = h('button', { type: 'submit', class: 'default' }, { en: 'Send', zh: '发送' });
  const cancel = h('button', { type: 'button' }, { en: 'Cancel', zh: '取消' });
  const say = (t: Bi | null) => {
    status.hidden = !t;
    status.replaceChildren(t ? h('span', {}, t) : '');
  };

  const sizeText = pic ? fileSize(pic.blob.size) : { en: '', zh: '' };
  const row = (key: Bi, field: Node) => h('label', { class: 'ps-row' }, [h('span', { class: 'ps-key' }, key), field]);
  const form = h('form', { class: 'paint-send', novalidate: true }, [
    h('div', { class: 'ps-picture' }, [
      pic ? h('img', { class: 'ps-thumb', src: thumbUrl, alt: { en: 'Your picture', zh: '你的画' }, width: pic.w, height: pic.h }) : null,
      h('div', { class: 'ps-file' }, [
        h('b', {}, fileName),
        h('span', {}, pic ? { en: `${pic.w} × ${pic.h} pixels · ${sizeText.en} · PNG picture`, zh: `${pic.w} × ${pic.h} 像素 · ${sizeText.zh} · PNG 图片` } : ''),
        pic?.scaled ? h('span', { class: 'ps-scaled' }, { en: `Made smaller to send (from ${o.doc.width} × ${o.doc.height}).`, zh: `为了发送，已缩小（原为 ${o.doc.width} × ${o.doc.height}）。` }) : null,
      ]),
    ]),
    h('div', { class: 'ps-headers' }, [
      h('div', { class: 'ps-row' }, [h('span', { class: 'ps-key' }, { en: 'To:', zh: '收件人：' }), h('span', { class: 'ps-to' }, [h('span', { class: 'ico ico16 ico-mail', 'aria-hidden': 'true' }), { en: `${o.artistFull} (the artist’s inbox)`, zh: `${o.artistFull}（艺术家的邮箱）` }])]),
      row({ en: 'From:', zh: '发件人：' }, nameIn),
      row({ en: 'E-mail:', zh: '电子邮箱：' }, emailIn),
    ]),
    h('label', { class: 'ps-note' }, [h('span', { class: 'sr-only' }, { en: 'Note', zh: '附言' }), note]),
    trap,
    h('div', { class: 'ps-how' }, [
      h('span', { class: 'ico ico16 ico-info', 'aria-hidden': 'true' }),
      h('p', {}, {
        en: `Clicking Send emails the picture, with your name, email and note if you fill them in, to ${o.artist}. It isn’t posted on this website, and nothing else is sent. An anti-spam check by Cloudflare runs first.`,
        zh: `单击“发送”后，这幅画会连同你填写的名字、电子邮箱和附言，以电子邮件发给 ${o.artist}。它不会发布在这个网站上，也不会发送别的内容。发送前会先进行 Cloudflare 的反垃圾验证。`,
      }),
    ]),
    verify,
    progress,
    status,
    h('div', { class: 'ps-buttons' }, [send, cancel]),
  ]);

  let token = '';
  let widget: string | undefined;
  let sending = false;
  let xhr: XMLHttpRequest | null = null;
  const win = dialog({
    title: { en: `Send to ${o.artist}`, zh: `发给 ${o.artist}` },
    icon: 'mail',
    body: form,
    owner: o.owner,
    className: 'paint-send-dialog',
    onClose: () => {
      xhr?.abort();
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
      const w = window as unknown as { turnstile?: TS };
      if (widget) w.turnstile?.remove?.(widget);
    },
  });
  cancel.addEventListener('click', () => win.close());

  if (!pic) {
    say({ en: 'The picture could not be prepared for sending. Try File ▸ Save instead.', zh: '无法准备这幅画以便发送。请改用 文件 ▸ 保存。' });
    send.disabled = true;
    return;
  }
  if (!o.sitekey) {
    say({ en: 'Sending isn’t available right now. File ▸ Save keeps a copy you can share another way.', zh: '目前无法发送。文件 ▸ 保存可以留一份，用别的方式分享。' });
    send.disabled = true;
  } else {
    send.disabled = true;
    verify.append(h('span', { class: 'ps-wait' }, { en: 'Loading the anti-spam check…', zh: '正在加载反垃圾验证……' }));
    loadTurnstile()
      .then((ts) => {
        if (!form.isConnected) return;
        verify.replaceChildren();
        widget = ts.render(verify, {
          sitekey: o.sitekey,
          action: TURNSTILE_ACTION,
          language: document.documentElement.dataset.lang === 'zh' ? 'zh-cn' : 'en',
          callback: (t: string) => {
            token = t;
            if (!sending) send.disabled = false;
          },
          'expired-callback': () => {
            token = '';
            send.disabled = true;
          },
          'error-callback': () => {
            say({ en: 'The anti-spam check didn’t work. Reload the page and try again, or use File ▸ Save.', zh: '反垃圾验证没有成功。请刷新页面后再试，或使用 文件 ▸ 保存。' });
          },
        });
      })
      .catch(() => {
        verify.replaceChildren();
        say({ en: 'The anti-spam check could not load, so the picture can’t be sent from here. File ▸ Save keeps a copy you can share another way.', zh: '反垃圾验证无法加载，所以这里无法发送。文件 ▸ 保存可以留一份，用别的方式分享。' });
      });
  }
  nameIn.focus();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (sending || !token) return;
    const email = emailIn.value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      say(ERRORS.invalid_submission);
      emailIn.focus();
      return;
    }
    sending = true;
    send.disabled = true;
    say(null);
    progress.hidden = false;
    progressText.replaceChildren(h('span', {}, { en: `Sending ${fileName} (${sizeText.en}) to ${o.artist}…`, zh: `正在把 ${fileName}（${sizeText.zh}）发给 ${o.artist}……` }));
    bar.style.width = '2%';
    const body = JSON.stringify({ name: nameIn.value.trim(), email, message: note.value.trim(), website: trap.value, image: pic.url, turnstileToken: token });
    xhr = new XMLHttpRequest();
    xhr.open('POST', SEND_ENDPOINT);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) bar.style.width = `${Math.max(2, Math.round((ev.loaded / ev.total) * 92))}%`;
    };
    const failed = (msg: Bi) => {
      sending = false;
      progress.hidden = true;
      say(msg);
      // A token is used once: the check runs again before the next try.
      token = '';
      const w = window as unknown as { turnstile?: TS };
      if (widget) w.turnstile?.reset(widget);
      desktop()?.play('chord');
    };
    xhr.onload = () => {
      const res = (() => { try { return JSON.parse(xhr!.responseText); } catch { return {}; } })() as { error?: string; detail?: string; filename?: string };
      if (xhr!.status >= 200 && xhr!.status < 300) {
        bar.style.width = '100%';
        done(res.filename || fileName, email);
        return;
      }
      const code = [res.error ?? 'error', res.detail].filter(Boolean).join(': ');
      failed(ERRORS[res.error ?? ''] ?? { en: `The picture could not be sent (${code}, ${xhr!.status}). Please try again later, or use File ▸ Save.`, zh: `这幅画未能发送（${code}，${xhr!.status}）。请稍后再试，或使用 文件 ▸ 保存。` });
    };
    xhr.onerror = () => failed({ en: 'The picture could not be sent: check your connection, then try again.', zh: '这幅画未能发送：请检查网络连接，然后再试一次。' });
    xhr.send(body);
  });

  /** Sent: say what happened, plainly. */
  function done(sentAs: string, email: string) {
    o.onSent();
    const ok = h('button', { type: 'button', class: 'default' }, { en: 'OK', zh: '确定' });
    const copy = h('button', { type: 'button' }, { en: 'Save a Copy', zh: '保存一份' });
    form.replaceChildren(
      h('div', { class: 'ps-done' }, [
        h('span', { class: 'ico ico-mail', 'aria-hidden': 'true' }),
        h('div', {}, [
          h('p', { class: 'ps-done-title' }, { en: 'Sent. Thank you!', zh: '已发送。谢谢你！' }),
          h('p', {}, { en: `Your picture is on its way to ${o.artist}’s inbox, as ${sentAs}.`, zh: `你的画正在送往 ${o.artist} 的邮箱，文件名是 ${sentAs}。` }),
          h('p', {}, email
            ? { en: `If he writes back, it will be to ${email}.`, zh: `如果他回信，会寄到 ${email}。` }
            : { en: 'You didn’t leave an email address, so he can’t write back, but he will see it.', zh: '你没有留下电子邮箱地址，所以他无法回信，但他会看到这幅画。' }),
        ]),
      ]),
      h('div', { class: 'ps-buttons' }, [ok, copy]),
    );
    ok.addEventListener('click', () => win.close());
    copy.addEventListener('click', () => o.saveCopy());
    ok.focus();
    desktop()?.play('ding');
  }
}
