// Cookies on Xiangyin 98: asking for the choice that consent.ts keeps.
//
// - The Cookies dialog, a Windows 98 message box. It asks once a page until a
//   choice is made: when the desktop is ready after start-up and log-on (at
//   once when start-up is skipped, as for a guide's link). Start ▸ Settings ▸
//   Cookies... opens it again to change the choice. Esc or the close box
//   decides nothing, so it comes back next time.
// - The Information Bar, pale yellow across the top of the screen as in
//   Internet Explorer. After that first time, it asks again when something
//   that must have a cookie is used without one: a guide's log-on
//   (kus98.consent.ask('guide')). Only a feature being used asks again, never
//   a start-up on its own.
//
// Neither ever shows to bots and link previews (data-robot, from the head
// script in src/layouts/Desktop.astro). Loaded only when needed.
import { consent, LEVELS, type Level } from './consent';
import { openDialog } from './dialogs';
import { AWAY_MINUTES } from './session';
import { play } from './sound';
import { h, html, tr } from './util';
import { W } from './words';
import * as wm from './wm';

type Bi = { en: string; zh: string };

const TITLE: Bi = { en: 'Cookies on Xiangyin 98', zh: 'Xiangyin 98 的 Cookie' };
const NAMES: Record<Level, Bi> = {
  all: { en: 'Allow All', zh: '全部允许' },
  necessary: { en: 'Necessary Only', zh: '仅必要' },
  none: { en: 'None', zh: '全部拒绝' },
};
/** What's This? (F1 on a button). */
const HELP: Record<Level, Bi> = {
  all: { en: 'Keeps everything listed: the cookies, this tab’s memory and your lasting preferences.', zh: '保存列出的所有内容：Cookie、这个标签页的记忆和长期保存的偏好。' },
  necessary: { en: 'Keeps the cookies and this tab’s memory, but no lasting preferences.', zh: '保存 Cookie 和这个标签页的记忆，但不长期保存偏好。' },
  none: { en: 'Keeps nothing but this choice. Something that needs a cookie asks again.', zh: '除了这个选择，什么也不保存。需要 Cookie 的功能会再次询问。' },
};

const INTRO: Bi = { en: 'Xiangyin 98 can keep a few things in this browser. None of them is used to track you.', zh: 'Xiangyin 98 可以在这个浏览器里保存一些东西，但不会用它们跟踪你。' };
const NEED_HEAD: Bi = { en: 'Needs a cookie', zh: '需要 Cookie' };
const SKIP_HEAD: Bi = { en: 'Can do without', zh: '可以不用' };
/** [what, what it does and what happens without it] */
const NEEDS: [Bi, Bi][] = [
  [
    { en: 'Field Guide: ', zh: '导览：' },
    { en: 'remembers that you typed a guide’s password. Without it, you can’t open a guide.', zh: '记住你已经键入过导览的密码。没有它，就无法打开导览。' },
  ],
  [
    { en: 'Logging on: ', zh: '登录：' },
    {
      en: `keeps you logged on until you have been away for ${AWAY_MINUTES} minutes. Without it, you see the start-up and log-on every time you open or reload the site.`,
      zh: `让你保持登录，直到你离开 ${AWAY_MINUTES} 分钟。没有它，每次打开或刷新网站，都会看到启动和登录画面。`,
    },
  ],
];
const SKIPS: [Bi, Bi][] = [
  [
    { en: 'This tab only: ', zh: '只限这个标签页：' },
    { en: 'the windows you had open, a message not sent yet and your place in a guide, until you close the tab. Without it, a reload starts afresh.', zh: '打开着的窗口、还没发送的消息和你在导览里的位置，直到你关闭这个标签页。没有它，刷新后会从头开始。' },
  ],
  [
    { en: 'Lasting: ', zh: '长期保存：' },
    {
      en: 'your settings, where you put icons and windows, the Recycle Bin, Documents, your log-on name, what you typed in Run, Paint’s tools and picture, Field Guide’s heat map, labels and sorting, and the language. Without it, every visit starts with the defaults.',
      zh: '你的设置、图标和窗口的位置、回收站、文档、登录名、在“运行”里键入过的内容、“画图”的工具和图画、导览的热图、标签和排序方式，以及语言。没有它，每次访问都从默认设置开始。',
    },
  ],
];
const FOOT: Bi = {
  en: 'Allow All keeps all of these. Necessary Only keeps the cookies and this tab’s memory. None keeps nothing but this choice. To change it: Start → Settings → Cookies.',
  zh: '“全部允许”保存以上所有内容；“仅必要”只保存 Cookie 和这个标签页的记忆；“全部拒绝”除了这个选择，什么也不保存。要更改：开始 → 设置 → Cookie。',
};
const NOW = (l: Level): Bi => ({ en: `Your choice now: ${NAMES[l].en}.`, zh: `你现在的选择：${NAMES[l].zh}。` });

/** What the bar says, by what asked for it (kus98.consent.ask). */
const BAR: Record<string, Bi> = {
  guide: { en: 'Field Guide needs a cookie to remember your password. Allow cookies?', zh: '导览需要使用 Cookie 来记住你的密码。允许使用 Cookie 吗？' },
};
const BAR_OTHER: Bi = { en: 'This needs a cookie. Allow cookies?', zh: '这项功能需要使用 Cookie。允许使用 Cookie 吗？' };

const robot = () => html.hasAttribute('data-robot');
let uid = 0;

let dialog: wm.Win | null = null;
/** The dialog has shown in this page: the first time asks with it, after that the bar asks. */
let asked = false;
/** Callers waiting for the dialog to close. */
let waiting: (() => void)[] = [];

/** The bar showing, what had the focus before it, and how to answer it. */
interface Bar { el: HTMLElement; back: Element | null; done: (ok: boolean) => void }
let bar: Bar | null = null;

/** Said through the desktop's live region (as router.ts does). */
function say(text: string) {
  const live = document.getElementById('k98-announcer');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => (live.textContent = text), 60);
}

/** Put the focus back where it was, if that's still there and reachable. */
function refocus(el: Element | null) {
  if (el instanceof HTMLElement && el !== document.body && el.isConnected && !el.closest('[inert]')) el.focus({ preventScroll: true });
}

// ---- The dialog ----

/** The Cookies dialog. Resolves when it closes, whether a choice was made or not (Esc, the close box). */
export function showDialog(): Promise<void> {
  asked = true;
  return new Promise((resolve) => {
    waiting.push(resolve);
    if (dialog) {
      wm.focus(dialog);
      return;
    }
    // A bar showing gives way: the dialog answers for it.
    let back = document.activeElement;
    if (bar) {
      const b = bar;
      if (b.el.contains(back)) back = b.back;
      b.el.hidden = true;
      waiting.push(() => b.done(consent.allows('cookie')));
    }
    const now = consent.level();
    // The first time Allow All; after that the choice made, so Enter keeps it.
    const first: Level = now ?? 'all';
    const id = `consent-${++uid}`;
    const list = (head: Bi, items: [Bi, Bi][], n: string) => [
      h('p', { class: 'consent-head', id: `${id}-${n}` }, head),
      h('ul', { 'aria-labelledby': `${id}-${n}` }, items.map(([what, does]) => h('li', {}, [h('b', {}, what), does]))),
    ];
    const btns = LEVELS.map((l) => h('button', { type: 'button', class: l === first ? 'default' : undefined, 'data-btn': l, 'data-help': HELP[l] }, NAMES[l]));
    const body = h('div', { class: 'msgbox consent-box' }, [
      h('div', { class: 'msg-row' }, [
        h('span', { class: 'ico ico-info', 'aria-hidden': 'true' }),
        h('div', { class: 'consent-text', id: `${id}-text` }, [
          h('p', {}, INTRO),
          ...list(NEED_HEAD, NEEDS, 'need'),
          ...list(SKIP_HEAD, SKIPS, 'skip'),
          h('p', {}, FOOT),
          now ? h('p', { class: 'consent-now' }, NOW(now)) : null,
        ]),
      ]),
      h('div', { class: 'msg-buttons' }, btns),
    ]);
    const win = openDialog({
      title: TITLE,
      icon: 'cookie',
      body,
      modal: true,
      role: 'alertdialog',
      className: 'consent-dialog',
      onClose: () => {
        dialog = null;
        refocus(back);
        const w = waiting;
        waiting = [];
        w.forEach((f) => f());
      },
    });
    dialog = win;
    win.el.setAttribute('aria-describedby', `${id}-text`);
    btns.forEach((b, i) =>
      b.addEventListener('click', () => {
        consent.set(LEVELS[i]);
        wm.close(win);
      }),
    );
    btns[LEVELS.indexOf(first)].focus();
  });
}

// ---- The Information Bar ----

/** The bar across the top of the screen. Resolves true after Allow, false after × or Esc. */
function showBar(feature: string, takeFocus: boolean): Promise<boolean> {
  bar?.done(false);
  return new Promise((resolve) => {
    const text = Object.hasOwn(BAR, feature) ? BAR[feature] : BAR_OTHER;
    const allow = h('button', { type: 'button', class: 'infobar-allow' }, { en: 'Allow', zh: '允许' });
    const close = h('button', { type: 'button', class: 'tb-btn tb-close infobar-close', 'aria-label': W.close, title: W.close });
    const el = h('div', { class: 'infobar', role: 'region', 'aria-label': { en: 'Information Bar', zh: '信息栏' } }, [
      h('span', { class: 'ico ico16 ico-info', 'aria-hidden': 'true' }),
      h('p', { class: 'infobar-text' }, text),
      allow,
      close,
    ]);
    const back = document.activeElement;
    // The desktop and the windows move down to make room (system.css), as the
    // page did under Internet Explorer's bar: nothing is hidden behind it, such
    // as a full-size window's title bar and menus on a phone.
    const fit = () => html.style.setProperty('--infobar-h', `${el.offsetHeight}px`);
    const room = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    let over = false;
    const done = (ok: boolean) => {
      if (over) return;
      over = true;
      room?.disconnect();
      const hadFocus = el.contains(document.activeElement);
      el.remove();
      if (bar?.el === el) {
        bar = null;
        html.style.removeProperty('--infobar-h');
      }
      if (hadFocus) refocus(back);
      resolve(ok);
    };
    allow.addEventListener('click', () => {
      // Necessary Only is enough; Allow All, if chosen meanwhile, stays.
      if (!consent.allows('cookie')) consent.set('necessary');
      done(true);
    });
    close.addEventListener('click', () => done(false));
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      done(false);
    });
    bar = { el, back, done };
    // First in the page, so it's also the first thing a screen reader or Tab finds.
    document.body.prepend(el);
    fit();
    room?.observe(el);
    say(tr(text));
    if (takeFocus) {
      play('ding');
      allow.focus({ preventScroll: true });
    }
  });
}

// A choice made (in the dialog, or in another tab) answers the dialog, and the
// bar too when it allows cookies.
consent.on(() => {
  if (dialog && consent.decided()) wm.close(dialog);
  if (bar && consent.allows('cookie')) bar.done(true);
});

// ---- Asking ----

/**
 * Something that must have a cookie is about to be used (a guide's log-on,
 * through kus98.consent.ask): true once it may go ahead. Before any choice,
 * the first time asks with the dialog; after that the bar asks.
 */
export async function ask(feature: string): Promise<boolean> {
  if (consent.allows('cookie')) return true;
  // Bots never see either. Logging on is their own request, as without JavaScript.
  if (robot()) return true;
  if (dialog || (!consent.decided() && !asked)) {
    await showDialog();
    return consent.allows('cookie');
  }
  return showBar(feature, true);
}

/**
 * The desktop is ready (after start-up and log-on, if they showed): before
 * any choice, the dialog asks. After a choice nothing asks here; the bar comes
 * back only when a feature that must have a cookie is used.
 */
export function atStart() {
  if (robot() || consent.decided()) return;
  // The browser blocks site data: no answer could be kept, so it would ask on every page.
  if (!consent.lasts()) return;
  setTimeout(() => {
    if (!asked && !consent.decided()) void showDialog();
  }, 250);
}
