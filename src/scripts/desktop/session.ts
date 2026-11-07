// Who is logged on. Xiangyin 98 has no accounts and no passwords: everyone is
// Guest, whatever the log-on box once said. The site's owner can be
// Administrator through the separate, hidden admin log-on (/admin, checked on
// the server: worker/admin.ts); kus98_admin_ui only says that happened.
// "Logged on" is a cookie, so new tabs see it (sessionStorage wouldn't). It
// runs out AWAY_MINUTES after the last page of the site was open: every open
// page renews it each minute and as it goes, so the computer stays on while a
// tab is open (idle or in the screen saver), and after a longer absence the
// next visit starts up again, BIOS and log-on included. The head script in
// src/layouts/Desktop.astro sets the same cookie for a guide's own link.
//
// The cookie is written only with the visitor's leave (consent.ts: "Allow All"
// or "Necessary Only"); without it, this page stays logged on, and the next
// one starts up again. No name is kept: there is only Guest.
import { consent } from './consent';
import { html } from './util';

const COOKIE = 'kus98_session';
const GUEST = 'Guest';
/** Away (no page of the site open) longer than this, and the next visit starts up again. */
export const AWAY_MINUTES = 30;

const secure = () => (location.protocol === 'https:' ? '; Secure' : '');
const write = () => {
  if (!consent.allows('cookie')) return;
  document.cookie = `${COOKIE}=${GUEST}; path=/; max-age=${AWAY_MINUTES * 60}; SameSite=Lax${secure()}`;
};
// Logged on in this page: Log Off and Shut Down end it, so renewing stops.
let on = false;

const isAdmin = () => /(?:^|;\s*)kus98_admin_ui=1/.test(document.cookie);

function cookieValue() {
  const c = document.cookie.split(/;\s*/).find((x) => x.startsWith(`${COOKIE}=`));
  if (!c) return null;
  try {
    return decodeURIComponent(c.slice(COOKIE.length + 1));
  } catch {
    return '';
  }
}

export const session = {
  loggedOn: () => cookieValue() !== null,
  /** Guest, or Administrator in admin mode. */
  user(): string {
    return isAdmin() ? 'Administrator' : GUEST;
  },
  /** What the log-on box shows: always Guest. */
  lastUser(): string {
    return GUEST;
  },
  /** Log on as Guest (the box's name can't be changed, and nothing typed elsewhere counts). */
  logOn(_name?: string) {
    write();
    on = true;
    // Names typed before everyone was Guest. Removing needs no leave.
    try {
      localStorage.removeItem('kus98:user');
    } catch { /* ignore */ }
    const n = session.user();
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
      if (on) write();
    };
    renew();
    setInterval(renew, 60_000);
    addEventListener('pagehide', renew);
    document.addEventListener('visibilitychange', renew);
    // A choice that allows cookies sets it at once.
    consent.on(renew);
  },
};
