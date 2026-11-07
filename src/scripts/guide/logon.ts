// Field Guide (导览): the log-on box (src/components/guide/LogOn.astro).
// With JavaScript the form posts with fetch and, once the Worker has set its
// cookie, the same window opens the guide again (kus98.open with reload).
// Errors come as Windows 98 message boxes. The password is never kept: it
// lives only in the field and in the request. Choosing another guide in the
// Guide list opens that guide's box in the same window, so the password always
// goes to the guide chosen.
//
// This file imports no guide content: everything it knows (the slug, the
// public title) comes from the page's own attributes.
import { pick } from '../lang';

interface Bi { en: string; zh: string }
type Icon = 'error' | 'warning' | 'info';
type State = 'wrong' | 'wait' | 'off' | 'denied' | 'error';

interface Shell {
  alert(o: { title?: string | Bi; text: string | Bi; icon?: string; owner?: Element | null }): Promise<string>;
  open(url: string, o?: { reload?: boolean }): Promise<void>;
  close(el: Element): void;
  menus?(el: Element, provider: (name: string) => unknown[] | null): void;
}
const shell = () => (window as unknown as { kus98?: Shell }).kus98;

const MSG: Record<State, { icon: Icon; text: Bi }> = {
  wrong: { icon: 'error', text: { en: 'The password is incorrect. Type it again.', zh: '密码不正确。请重新键入。' } },
  wait: { icon: 'warning', text: { en: 'Too many tries. Wait a minute, then try again.', zh: '尝试次数过多。请等一分钟，然后再试。' } },
  off: { icon: 'info', text: { en: 'This guide is not open yet. Try again later.', zh: '这份导览尚未开放。请稍后再试。' } },
  denied: { icon: 'error', text: { en: 'This guide could not check the password. Reload the page and try again.', zh: '这份导览无法检查密码。请刷新网页后再试。' } },
  error: { icon: 'error', text: { en: 'This guide could not check the password. Reload the page and try again.', zh: '这份导览无法检查密码。请刷新网页后再试。' } },
};

/** The Worker's error codes (worker/guides.ts) → what the box says. */
function stateOf(code: unknown): State {
  switch (code) {
    case 'wrong_password':
    case 'missing_password': return 'wrong';
    case 'rate_limited': return 'wait';
    case 'not_configured': return 'off';
    case 'origin_not_allowed': return 'denied';
    default: return 'error';
  }
}

/** Both languages as data-l spans (src/styles/lang.css shows one). */
function biNodes(t: Bi): Node[] {
  const en = document.createElement('span');
  en.dataset.l = 'en';
  en.textContent = t.en;
  const zh = document.createElement('span');
  zh.dataset.l = 'zh';
  zh.lang = 'zh-Hans';
  zh.textContent = t.zh || t.en;
  return [en, zh];
}

const fine = matchMedia('(pointer: fine)');

/** The guide just chosen in a Guide list: its box starts on the list, not on the password. */
let chosen = '';

export function initLogOn() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-gd-logon]:not([data-init])')) {
    root.dataset.init = '1';
    setUp(root);
  }
}

function setUp(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('[data-gd-logon-form]');
  const pass = root.querySelector<HTMLInputElement>('[data-gd-pass]');
  const ok = root.querySelector<HTMLButtonElement>('[data-gd-ok]');
  const next = root.querySelector<HTMLInputElement>('[data-gd-next]');
  const cancel = root.querySelector<HTMLAnchorElement>('[data-gd-cancel]');
  const list = root.querySelector<HTMLSelectElement>('[data-gd-guide]');
  if (!form || !pass || !ok || !next) return;

  const win = root.closest<HTMLElement>('[data-window]');
  const slug = root.dataset.gdSlug ?? '';
  const title: Bi = { en: root.dataset.gdTitleEn ?? '', zh: root.dataset.gdTitleZh ?? '' };
  const field = win?.querySelector<HTMLElement>('.status-bar-field') ?? null;
  const statusText = field?.innerHTML ?? '';
  const ac = new AbortController();
  const { signal } = ac;
  let busy = false;
  let waitTimer = 0;

  // ---- Tear-down: the window closes, or another page replaces this one ----
  const stop = () => {
    if (signal.aborted) return;
    clearInterval(waitTimer);
    ac.abort();
    // The window now shows another page: it isn't busy with this box any more.
    if (!root.isConnected) win?.removeAttribute('aria-busy');
  };
  win?.addEventListener('desktop:close', stop, { once: true, signal });
  document.addEventListener('desktop:content', () => {
    if (!root.isConnected) stop();
  }, { signal });

  // ---- Status bar ----
  const status = (t: Bi | null) => {
    if (!field) return;
    if (t) field.replaceChildren(...biNodes(t));
    else field.innerHTML = statusText;
  };

  // ---- Menus: File ▸ Close; Help ▸ Help Topics ----
  // The provider stays with the window after a swap until the next page sets
  // its own, so it answers only while this box is on screen.
  const k = shell();
  if (win && k?.menus) {
    k.menus(win, (name) => {
      if (!root.isConnected) return null;
      switch (name) {
        case 'file':
          return [{ label: '&Close', zh: '关闭(&C)', key: 'Alt+F4', action: () => closeWindow() }];
        case 'help':
          return [{ label: '&Help Topics', zh: '帮助主题(&H)', key: 'F1', icon: 'help', action: () => openUrl('/help#guides') }];
      }
      return null;
    });
  }

  const closeWindow = () => {
    const d = shell();
    if (d && win) d.close(win);
    else location.assign('/');
  };
  const openUrl = (url: string) => {
    const d = shell();
    if (d) void d.open(url);
    else location.assign(url);
  };

  // ---- Focus: fine pointers only (a phone keyboard shouldn't jump up) ----
  const focus = () => {
    if (!fine.matches || !root.isConnected || ok.disabled) return;
    if (document.documentElement.dataset.boot) return; // the start-up screens are on top; desktop:login comes next
    requestAnimationFrame(() => {
      pass.focus({ preventScroll: true });
      pass.select();
    });
  };
  document.addEventListener('desktop:login', focus, { signal });

  // ---- "Not open yet": the Worker said so when it served this page ----
  if (root.dataset.gdState === 'off') {
    ok.disabled = true;
    status(MSG.off.text);
  }

  // ---- First focus: the Guide list when a guide was just chosen in it (arrow keys go on choosing), else the password ----
  const fromList = !!list && chosen === slug;
  chosen = '';
  if (fromList && fine.matches) requestAnimationFrame(() => list?.focus({ preventScroll: true }));
  else focus();

  // ---- Guide: another listed guide's box, in this window ----
  let choosing = 0;
  const choose = async (other: string) => {
    const n = ++choosing;
    const url = `/guides/${other}`;
    const d = shell();
    if (!d || !win) {
      location.assign(url);
      return;
    }
    // Until it opens, OK waits: the password is for the guide chosen.
    busy = true;
    root.toggleAttribute('data-busy', true);
    chosen = other;
    try {
      await d.open(url);
    } catch {
      location.assign(url);
      return;
    }
    if (n !== choosing) return; // another guide was chosen meanwhile
    chosen = '';
    // Still here (it couldn't open): back to this guide.
    if (root.isConnected && !signal.aborted) {
      busy = false;
      root.removeAttribute('data-busy');
      list!.value = slug;
    }
  };
  if (list) {
    list.value = slug; // not a choice the browser kept from an earlier visit
    list.addEventListener('change', () => {
      if (list.value && list.value !== slug) void choose(list.value);
    }, { signal });
  }

  // ---- Cancel closes the window (the link goes home without JavaScript) ----
  cancel?.addEventListener('click', (e) => {
    if (!shell() || !win) return;
    e.preventDefault();
    closeWindow();
  }, { signal });

  // ---- OK ----
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy || ok.disabled) return;
    void logOn();
  }, { signal });

  const setBusy = (on: boolean) => {
    busy = on;
    ok.disabled = on;
    if (list) list.disabled = on; // no other guide while this one checks the password
    root.toggleAttribute('data-busy', on);
    if (on) win?.setAttribute('aria-busy', 'true');
    else win?.removeAttribute('aria-busy');
  };

  /** The guide's address in this window, with the query it was opened with (?place=A3). */
  const guideUrl = () => {
    const home = `/guides/${slug}`;
    const raw = win?.dataset.url || `${home}${location.pathname.startsWith(home) ? location.search : ''}`;
    const url = new URL(raw, location.origin);
    // Always this box's guide, the one the form logs on to.
    return url.pathname === home ? url : new URL(home, location.origin);
  };

  const logOn = async () => {
    root.dataset.gdState = 'none';
    if (!pass.value.trim()) {
      await fail('wrong');
      return;
    }
    if (!(await cookiesAllowed()) || signal.aborted) return;
    const url = guideUrl();
    next.value = url.search;
    setBusy(true);
    status({ en: 'Checking the password…', zh: '正在检查密码……' });
    let res: Response;
    let data: { ok?: boolean; next?: unknown; error?: unknown } = {};
    try {
      res = await fetch(form.action, {
        method: 'POST',
        body: new URLSearchParams(new FormData(form) as unknown as Record<string, string>),
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
      });
      data = await res.json().catch(() => ({}));
    } catch {
      if (signal.aborted) return;
      setBusy(false);
      await fail('error');
      return;
    }
    if (signal.aborted) return;

    if (res.ok && data.ok) {
      pass.value = '';
      status({ en: `Opening ${title.en}…`, zh: `正在打开 ${title.zh || title.en}……` });
      const target = url.pathname + url.search + url.hash;
      const d = shell();
      try {
        if (d) await d.open(target, { reload: true });
        else location.assign(target);
      } catch {
        location.assign(target);
      }
      // Still here (the shell kept the page): let the box be used again.
      if (root.isConnected && !signal.aborted) {
        setBusy(false);
        status(null);
      }
      return;
    }

    setBusy(false);
    const state = stateOf(data.error ?? (res.status === 429 ? 'rate_limited' : res.status === 401 ? 'wrong_password' : res.status === 503 ? 'not_configured' : res.status === 403 ? 'origin_not_allowed' : undefined));
    if (state === 'wait') holdOff(Number(res.headers.get('retry-after')) || 60);
    if (state === 'off') ok.disabled = true;
    await fail(state);
  };

  /** The message box, then back to the password (selected, as Windows does). */
  const fail = async (state: State) => {
    root.dataset.gdState = state;
    if (state !== 'wait') status(state === 'off' ? MSG.off.text : null);
    const m = MSG[state];
    const d = shell();
    const text = m.text;
    if (d) await d.alert({ title, text, icon: m.icon, owner: win });
    else window.alert(pick(text));
    if (!root.isConnected || signal.aborted) return;
    if (!ok.disabled || state === 'wait') {
      pass.focus({ preventScroll: true });
      pass.select();
    }
  };

  /** Too many tries: OK waits out the Worker's Retry-After, counting down in the status bar. */
  const holdOff = (seconds: number) => {
    clearInterval(waitTimer);
    let left = Math.min(Math.max(Math.round(seconds), 1), 600);
    ok.disabled = true;
    const tick = () => {
      if (!root.isConnected || signal.aborted) return clearInterval(waitTimer);
      if (left <= 0) {
        clearInterval(waitTimer);
        ok.disabled = false;
        if (root.dataset.gdState === 'wait') root.dataset.gdState = 'none';
        status(null);
        return;
      }
      status({ en: `Too many tries. You can try again in ${left} s.`, zh: `尝试次数过多。${left} 秒后可以再试。` });
      left--;
    };
    tick();
    waitTimer = window.setInterval(tick, 1000);
  };
}

// ---- Cookies ----
// The guide's cookie needs the visitor's leave (src/scripts/desktop/consent.ts).
// Without it the desktop asks first, with a bar at the top of the screen; after
// Allow the log-on goes ahead, the password still in its box. On its own,
// without the desktop, it goes ahead at once, as the form does without
// JavaScript: typing the password is asking for the cookie.
let asking = false;
async function cookiesAllowed(): Promise<boolean> {
  const c = (window as unknown as { kus98?: { consent?: { ask(feature: string): Promise<boolean> } } }).kus98?.consent;
  if (!c) return true;
  if (asking) return false; // OK pressed again while the bar waits for an answer
  asking = true;
  try {
    return await c.ask('guide');
  } finally {
    asking = false;
  }
}
