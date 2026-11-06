// Opens pages inside windows. Every URL is a real page; with JavaScript a
// click fetches that page and shows its window on the desktop instead of
// loading a new document. Anything unusual falls back to a normal page load.
import { addressFor, addressToPath, appFor, cleanPath, upOf } from '../../lib/apps';
import { msgbox } from './dialogs';
import { settings } from './settings';
import { play } from './sound';
import * as wm from './wm';
import { emit, html } from './util';

interface Page { html: string; status: number }
export interface NavOpts {
  /** The element that was clicked: a link inside a window opens in that window. */
  from?: Element | null;
  history?: 'push' | 'replace' | 'none';
  reload?: boolean;
  /** Scroll position to restore (Back/Forward). */
  scroll?: number;
  source?: 'keyboard' | 'pointer' | 'script';
  /** Add the page to the window's own Back/Forward list. */
  winHistory?: boolean;
}

const CACHE_MAX = 20;
const cache = new Map<string, Page>();
const inflight = new Map<string, Promise<Page>>();
const executed = new Set<string>();
const controllers = new Map<string, AbortController>();
const seqs = new Map<string, number>();
let buildId = '';
let busyCount = 0;

const isExecutable = (s: HTMLScriptElement) => {
  const t = (s.getAttribute('type') ?? '').trim().toLowerCase();
  return !t || t === 'module' || t === 'text/javascript' || t === 'application/javascript';
};
const scriptKey = (s: HTMLScriptElement) => {
  const src = s.getAttribute('src');
  return src ? `src:${new URL(src, location.href).href}` : `inline:${s.textContent}`;
};

/** Pages the desktop can open in a window (not files, APIs or unlisted drawer pieces). */
function isPageUrl(url: URL) {
  if (url.origin !== location.origin) return false;
  const p = url.pathname;
  if (/^\/(_astro|v1|system)\//.test(p) || p.startsWith('/house/drawer/')) return false;
  return !/\.[a-z0-9]+$/i.test(p) || p.endsWith('.html');
}

async function fetchPage(url: URL, reload = false, signal?: AbortSignal): Promise<Page> {
  const key = cleanPath(url.pathname);
  if (!reload) {
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const pending = inflight.get(key);
    if (pending) return pending;
  }
  const p = (async () => {
    const res = await fetch(url.pathname, {
      headers: { Accept: 'text/html' },
      cache: reload ? 'no-cache' : 'default',
      credentials: 'same-origin',
      signal,
    });
    if (new URL(res.url).origin !== location.origin) throw new Error('cross-origin');
    if (!(res.headers.get('content-type') ?? '').includes('text/html')) throw new Error('not-html');
    const page = { html: await res.text(), status: res.status };
    if (res.ok) {
      cache.set(key, page);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
    }
    return page;
  })();
  if (!reload) {
    inflight.set(key, p);
    p.finally(() => inflight.delete(key)).catch(() => {});
  }
  return p;
}

export function prefetch(href: string) {
  try {
    const url = new URL(href, location.href);
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (!isPageUrl(url) || conn?.saveData) return;
    fetchPage(url).catch(() => {});
  } catch { /* ignore */ }
}

function setBusy(win: wm.Win | undefined, on: boolean) {
  busyCount = Math.max(0, busyCount + (on ? 1 : -1));
  if (busyCount) html.dataset.busy = 'bg';
  else delete html.dataset.busy;
  if (!win) return;
  win.el.toggleAttribute('aria-busy', on);
  const f = win.el.querySelector<HTMLElement>('.status-bar-field');
  if (!f) return;
  if (on) {
    f.dataset.text = f.innerHTML;
    f.innerHTML = '<span data-l="en">Opening page…</span><span data-l="zh" lang="zh-Hans">正在打开网页……</span>';
  } else if (f.dataset.text != null) {
    f.innerHTML = f.dataset.text;
    delete f.dataset.text;
  }
}

async function mergeHead(doc: Document) {
  const have = new Set([...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href));
  const waits: Promise<void>[] = [];
  for (const l of doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    const href = new URL(l.getAttribute('href') ?? '', location.href).href;
    if (have.has(href)) continue;
    have.add(href);
    const n = document.createElement('link');
    n.rel = 'stylesheet';
    n.href = href;
    if (l.media) n.media = l.media;
    waits.push(new Promise((r) => {
      n.onload = n.onerror = () => r();
      setTimeout(r, 3000);
    }));
    document.head.appendChild(n);
  }
  const styles = new Set([...document.querySelectorAll('style')].map((s) => s.textContent));
  for (const s of doc.head.querySelectorAll('style')) {
    if (styles.has(s.textContent)) continue;
    styles.add(s.textContent);
    document.head.appendChild(document.importNode(s, true));
  }
  await Promise.all(waits);
}

function updateHeadMeta(doc: Document) {
  for (const sel of ['meta[name="description"]', 'link[rel="canonical"]']) {
    const next = doc.head.querySelector(sel);
    const cur = document.head.querySelector(sel);
    if (next && cur) cur.replaceWith(document.importNode(next, true));
  }
}

/** Run each script of a fetched page once: external ones by src, Astro's inlined ones by text. */
async function runScripts(list: HTMLScriptElement[]) {
  const waits: Promise<unknown>[] = [];
  for (const old of list) {
    const key = scriptKey(old);
    if (executed.has(key)) continue;
    executed.add(key);
    const s = document.createElement('script');
    for (const a of old.attributes) s.setAttribute(a.name, a.value);
    s.textContent = old.textContent;
    if (s.hasAttribute('src')) {
      waits.push(new Promise((r) => {
        s.onload = s.onerror = r;
        setTimeout(r, 10000);
      }));
    }
    document.head.appendChild(s);
  }
  await Promise.all(waits);
  await new Promise((r) => setTimeout(r, 0));
}

function rememberScroll() {
  const body = wm.getActive()?.el.querySelector<HTMLElement>('[data-window-body]');
  if (!body) return;
  try { history.replaceState({ ...(history.state ?? {}), scroll: body.scrollTop }, ''); } catch { /* ignore */ }
}

function writeHistory(url: URL, mode: 'push' | 'replace' | 'none', app: string) {
  if (mode === 'none') return;
  const href = cleanPath(url.pathname) + url.search + url.hash;
  if (cleanPath(location.pathname) + location.search + location.hash === href) return;
  if (mode === 'push') rememberScroll();
  try {
    const st = { kus98: 1, app, scroll: 0 };
    if (mode === 'replace') history.replaceState(st, '', href);
    else history.pushState(st, '', href);
  } catch { /* ignore */ }
}

function scrollToHash(win: wm.Win, hash: string) {
  const body = win.el.querySelector<HTMLElement>('[data-window-body]');
  if (!body) return;
  const id = decodeURIComponent(hash.slice(1));
  if (!id || id === 'top') {
    body.scrollTop = 0;
    return;
  }
  const t = win.el.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
  t?.scrollIntoView({ block: 'start' });
}

function announce(text: string) {
  const a = document.getElementById('k98-announcer');
  if (!a) return;
  a.textContent = '';
  setTimeout(() => (a.textContent = text), 60);
}

export function notFound(what: string, owner?: Element | null) {
  return msgbox({
    title: 'Xiangyin 98',
    icon: 'error',
    text: `Cannot find '${what}'. Make sure the path or Internet address is correct.`,
    owner,
  });
}

/** Open a site page in its program's window. */
export async function navigate(input: string | URL, o: NavOpts = {}): Promise<void> {
  const url = new URL(input, location.href);
  if (url.origin !== location.origin) {
    window.open(url.href, '_blank', 'noopener');
    return;
  }
  const path = cleanPath(url.pathname);
  const app = appFor(path);
  const fromWin = wm.byEl(o.from ?? null);
  let win = fromWin && fromWin.app === app && !fromWin.dialog ? fromWin : wm.find(app);
  const target = path + (app === 'house' ? url.search : '');
  const winHistory = o.winHistory ?? true;

  if (win && !o.reload && cleanPath(wm.urlOf(win).split('?')[0]) === path) {
    // Already showing this page: bring it forward (and follow the query or #hash).
    if (wm.urlOf(win) !== target) {
      wm.setUrl(win, target);
      emit(win.el, 'desktop:content', { url: target, same: true });
    }
    wm.focus(win, { history: false });
    if (url.hash) scrollToHash(win, url.hash);
    writeHistory(url, o.history ?? 'push', app);
    wm.syncTitle(win);
    return;
  }

  const seq = (seqs.get(app) ?? 0) + 1;
  seqs.set(app, seq);
  controllers.get(app)?.abort();
  const ctrl = new AbortController();
  controllers.set(app, ctrl);
  if (settings.get().navClick && o.source !== 'script') play('click');
  let busy = false;
  const busyTimer = setTimeout(() => {
    busy = true;
    setBusy(win, true);
  }, 120);
  const done = () => {
    clearTimeout(busyTimer);
    if (busy) setBusy(win, false);
    busy = false;
  };

  let page: Page;
  try {
    page = await fetchPage(url, o.reload, ctrl.signal);
  } catch (err) {
    done();
    if ((err as Error).name === 'AbortError' || seqs.get(app) !== seq) return;
    if (err instanceof TypeError || !navigator.onLine) {
      msgbox({
        title: 'Xiangyin 98',
        icon: 'error',
        text: `Xiangyin 98 cannot open ${addressFor(path)}.\n\nCheck your Internet connection, then try again.`,
        owner: win?.el,
      });
      return;
    }
    location.assign(url.href);
    return;
  } finally {
    if (controllers.get(app) === ctrl) controllers.delete(app);
  }
  if (seqs.get(app) !== seq) return done();

  const doc = new DOMParser().parseFromString(page.html, 'text/html');
  doc.querySelectorAll('noscript').forEach((n) => n.remove());
  const incoming = doc.querySelector<HTMLElement>('[data-window]');
  const build = doc.querySelector<HTMLMetaElement>('meta[name="kus98-build"]')?.content;
  if (page.status === 404) {
    done();
    notFound(addressFor(path), win?.el);
    return;
  }
  if (!incoming || build !== buildId) {
    location.assign(url.href);
    return;
  }
  await mergeHead(doc);
  if (seqs.get(app) !== seq) return done();

  writeHistory(url, o.history ?? 'push', app);
  const scripts = [...doc.querySelectorAll<HTMLScriptElement>('script')].filter(isExecutable);
  incoming.querySelectorAll<HTMLScriptElement>('script').forEach((s) => {
    if (isExecutable(s)) s.remove();
  });
  const docTitle = doc.head.querySelector<HTMLMetaElement>('meta[name="title-en"]')?.content || doc.title;
  const docTitleZh = doc.head.querySelector<HTMLMetaElement>('meta[name="title-zh"]')?.content;
  if (win && wm.list().includes(win)) {
    wm.swap(win, incoming, target, docTitle, winHistory, docTitleZh);
  } else {
    win = wm.open(document.adoptNode(incoming), { docTitle, docTitleZh });
    win.el.dataset.url = target;
    win.hist = [target];
    win.hi = 0;
    wm.updateNav(win);
  }
  updateHeadMeta(doc);
  wm.syncTitle(win);
  const body = win.el.querySelector<HTMLElement>('[data-window-body]');
  if (body) body.scrollTop = o.scroll ?? 0;
  if (url.hash) scrollToHash(win, url.hash);
  done();
  await runScripts(scripts);
  emit(win.el, 'desktop:content', { url: target });
  document.dispatchEvent(new Event('astro:page-load'));
  emit(document, 'desktop:navigate', { url: target, app, title: wm.titleOf(win), icon: win.el.dataset.icon ?? 'document', docTitle });
  wm.focus(win, { history: false });
  if (o.source === 'keyboard') {
    const h1 = win.el.querySelector<HTMLElement>('[data-window-body] h1');
    if (h1) {
      h1.tabIndex = -1;
      h1.focus({ preventScroll: true });
    } else body?.focus({ preventScroll: true });
  }
  announce(wm.pageTitle(win));
}

function linkOf(e: Event): { el: Element; href: string; target: string | null } | null {
  const t = e.target as Element | null;
  const el = t?.closest?.('a[href], area[href]');
  if (!el) return null;
  const raw = el.getAttribute('href');
  if (raw == null) return null;
  try {
    return { el, href: new URL(raw, location.href).href, target: el.getAttribute('target') };
  } catch {
    return null;
  }
}

function onClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = linkOf(e);
  if (!link) return;
  const { el, href, target } = link;
  if (el.hasAttribute('download') || el.hasAttribute('data-native') || el.hasAttribute('data-astro-reload')) return;
  const url = new URL(href);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin !== location.origin) {
    if (target && target !== '_self') return;
    e.preventDefault();
    window.open(url.href, '_blank', 'noopener');
    return;
  }
  if ((target && target !== '_self') || !isPageUrl(url)) return;
  e.preventDefault();
  navigate(url, { from: el, source: e.detail === 0 ? 'keyboard' : 'pointer' });
}

function onAddressKey(e: KeyboardEvent) {
  const input = (e.target as Element | null)?.closest?.('[data-address]') as HTMLInputElement | null;
  if (!input || e.key !== 'Enter') return;
  e.preventDefault();
  const v = input.value.trim();
  if (/^https?:\/\//i.test(v) && !/^https?:\/\/(www\.)?kuschonink\.com/i.test(v)) {
    window.open(v, '_blank', 'noopener');
    return;
  }
  const path = addressToPath(v);
  if (!path) {
    notFound(v, input);
    return;
  }
  navigate(path, { from: input, source: 'keyboard' });
}

function enableAddressBars(root: ParentNode) {
  root.querySelectorAll<HTMLInputElement>('[data-address]').forEach((i) => (i.readOnly = false));
}

export function initRouter() {
  buildId = document.querySelector<HTMLMetaElement>('meta[name="kus98-build"]')?.content ?? '';
  for (const s of document.querySelectorAll('script')) if (isExecutable(s)) executed.add(scriptKey(s));
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  try {
    history.replaceState({ ...(history.state ?? {}), kus98: 1, app: appFor(location.pathname), scroll: 0 }, '');
  } catch { /* ignore */ }

  document.addEventListener('click', onClick);
  addEventListener('popstate', (e) => {
    const st = (e.state ?? {}) as { scroll?: number };
    navigate(location.href, { history: 'none', scroll: st.scroll, source: 'script' });
  });
  document.addEventListener('keydown', onAddressKey);
  document.addEventListener('focusin', (e) => {
    const input = (e.target as Element | null)?.closest?.('[data-address]') as HTMLInputElement | null;
    if (input) setTimeout(() => input.select(), 0);
  });

  let hoverTimer = 0;
  document.addEventListener('pointerover', (e) => {
    const link = linkOf(e);
    if (!link) return;
    clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => prefetch(link.href), 80);
  }, { passive: true });
  document.addEventListener('pointerout', () => clearTimeout(hoverTimer), { passive: true });

  enableAddressBars(document);
  document.addEventListener('desktop:content', (e) => enableAddressBars(e.target as Element));

  wm.hooks.nav = (win, cmd) => {
    const body = win.el.querySelector<HTMLElement>('[data-window-body]');
    if (cmd === 'back' && win.hi > 0) {
      win.hi--;
      wm.updateNav(win);
      navigate(win.hist[win.hi], { from: win.el, winHistory: false, source: 'script' });
    } else if (cmd === 'forward' && win.hi < win.hist.length - 1) {
      win.hi++;
      wm.updateNav(win);
      navigate(win.hist[win.hi], { from: win.el, winHistory: false, source: 'script' });
    } else if (cmd === 'up') {
      const up = upOf(wm.urlOf(win));
      if (up) navigate(up, { from: win.el });
    } else if (cmd === 'home') {
      navigate(win.el.dataset.home ?? '/', { from: win.el });
    } else if (cmd === 'refresh') {
      navigate(wm.urlOf(win), { from: win.el, reload: true, history: 'replace', winHistory: false, scroll: body?.scrollTop, source: 'script' });
    } else if (cmd === 'stop') {
      controllers.get(win.app)?.abort();
    }
  };
}
