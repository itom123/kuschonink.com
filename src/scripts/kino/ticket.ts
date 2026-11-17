// Kino's ticket, invisible unless needed. Before the first film the desktop
// asks about cookies if no choice allows them yet (the ticket is one:
// kus98.consent.ask('kino')). Then Cloudflare Turnstile runs in a box on the
// player's own screen, in its "interaction-only" form: for most visitors
// nothing shows and the film just starts. Only when Cloudflare wants a person
// to tick its box does the box appear, with one line saying why. The token
// goes to POST /kino/ticket (worker/kino.ts), which sets the ticket: an
// HttpOnly cookie this script never sees.
import { TICKET_PATH, TURNSTILE_ACTION } from '../../lib/kino';
import { desktop, type Bi } from '../paint/dom';

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

/** What the screen says while the ticket is being had. */
export const SAY: Record<string, Bi> = {
  checking: { en: 'One moment…', zh: '请稍候……' },
  asks: { en: 'Cloudflare asks you to confirm you’re a person, then the film starts.', zh: 'Cloudflare 请你确认自己是真人，确认后影片就会开始。' },
  failed: { en: 'The check at the door didn’t pass. Press Play to try again.', zh: '入口处的验证没有通过。请按“播放”重试。' },
  unreachable: { en: 'The check at the door could not be reached. Press Play to try again in a moment.', zh: '暂时无法连接入口处的验证。请稍后按“播放”重试。' },
  busy: { en: 'Too many tickets just now. Please wait a minute, then press Play.', zh: '刚才发出的入场券太多了。请等一分钟再按“播放”。' },
  closed: { en: 'The Kino is closed just now. Please come back later.', zh: 'Kino 暂时关闭。请稍后再来。' },
  cookies: { en: 'The Kino needs a cookie for your ticket. Allow cookies (Start ▸ Settings ▸ Cookies), then press Play.', zh: 'Kino 需要使用 Cookie 来保存你的入场券。请允许 Cookie（开始 ▸ 设置 ▸ Cookie），然后按“播放”。' },
};

export type TicketResult = 'ok' | 'cookies' | 'closed' | 'failed' | 'unreachable' | 'busy';

interface TicketUi {
  sitekey: string | undefined;
  /** The box on the screen that Turnstile renders into. */
  box: HTMLElement;
  /** Say something on the screen (null: say nothing). */
  say: (b: Bi | null) => void;
}

let pending: Promise<TicketResult> | null = null;

/** A ticket for this browser: resolves 'ok' once the Worker has set it. One check at a time. */
export function getTicket(ui: TicketUi): Promise<TicketResult> {
  pending ??= run(ui).finally(() => (pending = null));
  return pending;
}

async function run(ui: TicketUi): Promise<TicketResult> {
  const consent = desktop() as unknown as { consent?: { ask(feature: string): Promise<boolean> } } | undefined;
  if (consent?.consent && !(await consent.consent.ask('kino'))) return 'cookies';
  if (!ui.sitekey) return 'closed';
  let ts: TS;
  try {
    ts = await loadTurnstile();
  } catch {
    return 'unreachable';
  }
  ui.say(SAY.checking);
  const token = await new Promise<string | null>((resolve) => {
    let widget: string | undefined;
    const finish = (t: string | null) => {
      ui.box.classList.remove('is-asking');
      if (widget) ts.remove?.(widget);
      resolve(t);
    };
    // Cloudflare's own limit is five minutes for someone to tick the box.
    const timer = setTimeout(() => finish(null), 5 * 60 * 1000);
    widget = ts.render(ui.box, {
      sitekey: ui.sitekey,
      action: TURNSTILE_ACTION,
      appearance: 'interaction-only',
      language: document.documentElement.dataset.lang === 'zh' ? 'zh-cn' : 'en',
      callback: (t: string) => {
        clearTimeout(timer);
        finish(t);
      },
      'error-callback': () => {
        clearTimeout(timer);
        finish(null);
      },
      'expired-callback': () => {
        clearTimeout(timer);
        finish(null);
      },
      'before-interactive-callback': () => {
        ui.box.classList.add('is-asking');
        ui.say(SAY.asks);
      },
      'after-interactive-callback': () => {
        ui.box.classList.remove('is-asking');
        ui.say(SAY.checking);
      },
    });
  });
  if (!token) return 'failed';
  let res: Response;
  try {
    res = await fetch(TICKET_PATH, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ token }), credentials: 'same-origin' });
  } catch {
    return 'unreachable';
  }
  if (res.ok) return 'ok';
  const err = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? '';
  if (err === 'closed') return 'closed';
  if (res.status === 429) return 'busy';
  return err === 'verification_unavailable' ? 'unreachable' : 'failed';
}
