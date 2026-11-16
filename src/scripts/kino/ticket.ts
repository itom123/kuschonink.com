// Kino's box office: before the first film, a ticket. The desktop asks about
// cookies first (the ticket is one: kus98.consent.ask('kino')), then a small
// "Box Office" dialog runs Cloudflare Turnstile. Most visitors only see it
// for a moment: the check passes on its own ("Success!") and the dialog
// closes. The token
// goes to POST /kino/ticket (worker/kino.ts), which sets the ticket: an
// HttpOnly cookie this script never sees.
import { TICKET_PATH, TURNSTILE_ACTION } from '../../lib/kino';
import { desktop, dialog, h, setText, type Bi } from '../paint/dom';

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

const SAY: Record<string, Bi> = {
  checking: { en: 'Checking at the door… This takes a moment.', zh: '正在入口处验证……请稍候。' },
  failed: { en: 'The check at the door didn’t pass. Please try again.', zh: '入口处的验证没有通过。请重试。' },
  unreachable: { en: 'The check at the door could not be reached. Please try again in a moment.', zh: '暂时无法连接入口处的验证。请稍后再试。' },
  busy: { en: 'Too many tickets just now. Please wait a minute, then try again.', zh: '刚才发出的入场券太多了。请等一分钟再试。' },
  closed: { en: 'The Kino is closed just now. Please come back later.', zh: 'Kino 暂时关闭。请稍后再来。' },
};

export type TicketResult = 'ok' | 'cancelled' | 'cookies' | 'closed';

let pending: Promise<TicketResult> | null = null;

/** A ticket for this browser: resolves 'ok' once the Worker has set it. One box office at a time. */
export function getTicket(owner: Element, sitekey: string | undefined): Promise<TicketResult> {
  pending ??= run(owner, sitekey).finally(() => (pending = null));
  return pending;
}

async function run(owner: Element, sitekey: string | undefined): Promise<TicketResult> {
  const consent = desktop() as unknown as { consent?: { ask(feature: string): Promise<boolean> } } | undefined;
  if (consent?.consent && !(await consent.consent.ask('kino'))) return 'cookies';
  if (!sitekey) return 'closed';

  return new Promise<TicketResult>((resolve) => {
    let settled = false;
    let widget: string | undefined;
    const finish = (r: TicketResult) => {
      if (settled) return;
      settled = true;
      win.close();
      resolve(r);
    };
    const status = h('p', { class: 'kino-bo-status', role: 'status', 'aria-live': 'polite' }, SAY.checking);
    const box = h('div', { class: 'kino-bo-turnstile' });
    const again = h('button', { type: 'button', hidden: true }, { en: 'Try Again', zh: '重试' });
    const cancel = h('button', { type: 'button' }, { en: 'Cancel', zh: '取消' });
    const body = h('div', { class: 'kino-bo' }, [
      h('div', { class: 'kino-ticket', 'aria-hidden': 'true' }, [h('span', { class: 'kino-ticket-name' }, 'KINO'), h('span', { class: 'kino-ticket-admit' }, { en: 'ADMIT ONE', zh: '凭票入场' })]),
      h('p', {}, {
        en: 'Your ticket lets this browser watch the films for four hours. It is kept as a cookie until you close the browser, and says nothing about you.',
        zh: '入场券让这个浏览器在四小时内观看影片。它以 Cookie 保存，关闭浏览器即失效，不包含任何关于你的信息。',
      }),
      box,
      status,
      h('div', { class: 'kino-bo-buttons' }, [again, cancel]),
    ]);
    const win = dialog({
      title: { en: 'Box Office', zh: '售票处' },
      icon: 'kino',
      body,
      owner,
      className: 'kino-bo-dialog',
      onClose: () => {
        const w = window as unknown as { turnstile?: TS };
        if (widget) w.turnstile?.remove?.(widget);
        if (!settled) {
          settled = true;
          resolve('cancelled');
        }
      },
    });
    cancel.addEventListener('click', () => finish('cancelled'));
    const say = (b: Bi, retry = true) => {
      setText(status, b);
      again.hidden = !retry;
    };
    again.addEventListener('click', () => {
      again.hidden = true;
      setText(status, SAY.checking);
      const w = window as unknown as { turnstile?: TS };
      if (widget) w.turnstile?.reset(widget);
      else void start();
    });

    const send = async (token: string) => {
      let res: Response;
      try {
        res = await fetch(TICKET_PATH, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ token }), credentials: 'same-origin' });
      } catch {
        return say(SAY.unreachable);
      }
      if (res.ok) return finish('ok');
      const err = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? '';
      if (err === 'closed') {
        say(SAY.closed, false);
        return;
      }
      say(res.status === 429 ? SAY.busy : err === 'verification_unavailable' ? SAY.unreachable : SAY.failed);
    };

    const start = async () => {
      let ts: TS;
      try {
        ts = await loadTurnstile();
      } catch {
        return say(SAY.unreachable);
      }
      if (settled) return;
      widget = ts.render(box, {
        sitekey,
        action: TURNSTILE_ACTION,
        // Always shown, in the space kept for it (kino.css): the dialog is sized once, as it opens.
        appearance: 'always',
        size: 'normal',
        language: document.documentElement.dataset.lang === 'zh' ? 'zh-cn' : 'en',
        callback: (token: string) => void send(token),
        'error-callback': () => say(SAY.failed),
        'expired-callback': () => say(SAY.failed),
      });
    };
    void start();
  });
}
