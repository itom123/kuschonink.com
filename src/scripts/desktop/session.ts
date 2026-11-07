// Who is logged on. Xiangyin 98 has no accounts: any name, no password.
// "Logged on" is a cookie, so new tabs see it (sessionStorage wouldn't). It
// runs out AWAY_MINUTES after the last page of the site was open: every open
// page renews it each minute and as it goes, so the computer stays on while a
// tab is open (idle or in the screen saver), and after a longer absence the
// next visit starts up again, BIOS and log-on included. The head script in
// src/layouts/Desktop.astro sets the same cookie for a guide's own link.
//
// The cookie is written only with the visitor's leave (consent.ts: "Allow All"
// or "Necessary Only"); without it, this page stays logged on, and the next
// one starts up again. The name typed is kept only with "Allow All".
import { consent, keepAgain } from './consent';
import { html } from './util';

const COOKIE = 'kus98_session';
/** Away (no page of the site open) longer than this, and the next visit starts up again. */
export const AWAY_MINUTES = 30;

const secure = () => (location.protocol === 'https:' ? '; Secure' : '');
const write = (name: string) => {
  if (!consent.allows('cookie')) return;
  document.cookie = `${COOKIE}=${encodeURIComponent(name)}; path=/; max-age=${AWAY_MINUTES * 60}; SameSite=Lax${secure()}`;
};
// Logged on in this page: Log Off and Shut Down end it, so renewing stops.
let on = false;
// The name last logged on with in this page, for when nothing may keep it.
let last = '';

const clean = (name: string) => name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 32);

function cookieValue() {
  const c = document.cookie.split(/;\s*/).find((x) => x.startsWith(`${COOKIE}=`));
  if (!c) return null;
  try {
    return decodeURIComponent(c.slice(COOKIE.length + 1));
  } catch {
    return '';
  }
}

function storedUser() {
  try {
    return localStorage.getItem('kus98:user') ?? '';
  } catch {
    return '';
  }
}

// The name for the next log-on box is lasting: typed before "Allow All" (the
// first visit logs on before the Cookies dialog asks), it's kept once given,
// as stored() values are (util.ts).
let unsaved = false;
function keepUser(n: string) {
  unsaved = !consent.allows('lasting');
  if (unsaved) return;
  try {
    localStorage.setItem('kus98:user', n);
  } catch { /* ignore */ }
}
consent.on((level, was, here) => {
  if (!consent.allows('lasting')) return;
  if (unsaved) keepUser(last);
  else if (keepAgain(level, was, here)) {
    const n = last || cookieValue();
    if (n) keepUser(n);
  }
});

export const session = {
  loggedOn: () => cookieValue() !== null,
  /** The name typed at log-on ("Guest" when none). */
  user(): string {
    return cookieValue() || last || storedUser();
  },
  /** The name to prefill in the log-on box. */
  lastUser(): string {
    return last || storedUser() || 'Guest';
  },
  logOn(name: string) {
    const n = clean(name) || 'Guest';
    last = n;
    write(n);
    on = true;
    keepUser(n);
    document.querySelectorAll('[data-username]').forEach((el) => (el.textContent = n));
    return n;
  },
  logOff() {
    on = false;
    document.cookie = `${COOKIE}=; path=/; max-age=0; SameSite=Lax${secure()}`;
  },
  /** While this page is open, keep the session from running out (see the top of this file). */
  keepAlive() {
    // Logged on: the cookie says so, or there's no start-up to go through (a
    // guide's link, whose cookie may still wait for the visitor's leave).
    on = cookieValue() !== null || !html.dataset.boot;
    const renew = () => {
      if (on) write(cookieValue() || session.lastUser());
    };
    renew();
    setInterval(renew, 60_000);
    addEventListener('pagehide', renew);
    document.addEventListener('visibilitychange', renew);
    // A choice that allows cookies sets it at once.
    consent.on(renew);
  },
};
