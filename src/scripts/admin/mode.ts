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

export function initAdminMode() {
  if (!wired) {
    wired = true;
    document.addEventListener('admin:change', apply);
    document.addEventListener('desktop:login', apply);
  }
  apply();
  // The cookie only says admin mode was on: check it still is.
  if (isAdminPage()) void whoAmI();
}
