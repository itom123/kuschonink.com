// Admin mode across the desktop: a key in the tray (open Administration) and
// the name Administrator. Loaded only when html[data-admin] is set (the
// harmless kus98_admin_ui cookie); it asks the server once, and if the session
// is gone the desktop goes back to Guest. Nothing here grants anything: the
// server checks every admin call.
import { AW } from '../../lib/admin-words';
import { isAdminPage, whoAmI } from './api';

const pick = (b: { en: string; zh: string }) => (document.documentElement.dataset.lang === 'zh' ? b.zh : b.en);
let wired = false;

function trayKey(on: boolean) {
  const tray = document.getElementById('k98-tray');
  if (!tray) return;
  let btn = document.getElementById('k98-admin-key') as HTMLAnchorElement | null;
  if (!on) {
    btn?.remove();
    return;
  }
  if (btn) return;
  btn = document.createElement('a');
  btn.id = 'k98-admin-key';
  btn.className = 'tray-btn tray-admin';
  btn.href = '/admin';
  btn.setAttribute('data-tip', AW.loggedOn.en);
  btn.setAttribute('data-tip-zh', AW.loggedOn.zh);
  btn.setAttribute('aria-label', pick(AW.loggedOn));
  btn.innerHTML = '<span class="ico ico16 ico-keys" aria-hidden="true"></span>';
  tray.prepend(btn);
}

/** "Log Off Administrator…" in the Start menu, and the name wherever it is shown. */
function names() {
  const n = isAdminPage() ? 'Administrator' : 'Guest';
  document.querySelectorAll('[data-username]').forEach((el) => (el.textContent = n));
  document.querySelectorAll('[data-logoff] .mi-label').forEach((el) => {
    el.innerHTML = `<span data-l="en"><u>L</u>og Off ${n}...</span><span data-l="zh" lang="zh-Hans">注销 ${n}(<u>L</u>)...</span>`;
  });
}

function apply() {
  trayKey(isAdminPage());
  names();
}

/** The page in the front-most window that isn't an admin window (what Edit This Page... edits). */
function frontPage(): string {
  const wins = [...document.querySelectorAll<HTMLElement>('[data-window][data-url]')]
    .filter((w) => !/^\/admin(?:\/|$|\?)/.test(w.dataset.url ?? '') && w.dataset.state !== 'min' && !w.hidden)
    .sort((a, b) => (Number(b.style.zIndex) || 0) - (Number(a.style.zIndex) || 0));
  return wins[0]?.dataset.url ?? '';
}

/** Edit This Page... (Start menu) opens Notepad on the files of the page in front. */
function pointEditLinks() {
  const page = frontPage();
  const href = page ? `/admin/edit?for=${encodeURIComponent(page)}` : '/admin/edit';
  document.querySelectorAll<HTMLAnchorElement>('[data-admin-edit-page]').forEach((a) => (a.href = href));
}

export function initAdminMode() {
  if (!wired) {
    wired = true;
    document.addEventListener('admin:change', apply);
    document.addEventListener('desktop:login', apply);
    // Whenever windows change (and as the Start menu is opened), point Edit This Page... at the page in front.
    document.addEventListener('wm:change', pointEditLinks);
    document.addEventListener('pointerdown', pointEditLinks, true);
  }
  apply();
  pointEditLinks();
  // The cookie only says admin mode was on: check it still is.
  if (isAdminPage()) void whoAmI();
}
