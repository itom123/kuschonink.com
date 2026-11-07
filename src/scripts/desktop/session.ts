// Who is logged on. Xiangyin 98 has no accounts: any name, no password.
// "Logged on" is a cookie, so new tabs see it (sessionStorage wouldn't). It
// runs out AWAY_MINUTES after the last page of the site was open: every open
// page renews it each minute and as it goes, so the computer stays on while a
// tab is open (idle or in the screen saver), and after a longer absence the
// next visit starts up again, BIOS and log-on included. The head script in
// src/layouts/Desktop.astro sets the same cookie for a guide's own link.
const COOKIE = 'kus98_session';
/** Away (no page of the site open) longer than this, and the next visit starts up again. */
export const AWAY_MINUTES = 30;

const secure = () => (location.protocol === 'https:' ? '; Secure' : '');
const write = (name: string) => {
  document.cookie = `${COOKIE}=${encodeURIComponent(name)}; path=/; max-age=${AWAY_MINUTES * 60}; SameSite=Lax${secure()}`;
};
// Logged on in this page: Log Off and Shut Down end it, so renewing stops.
let on = false;

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

export const session = {
  loggedOn: () => cookieValue() !== null,
  /** The name typed at log-on ("Guest" when none). */
  user(): string {
    const v = cookieValue();
    if (v) return v;
    try {
      return localStorage.getItem('kus98:user') ?? '';
    } catch {
      return '';
    }
  },
  /** The name to prefill in the log-on box. */
  lastUser(): string {
    try {
      return localStorage.getItem('kus98:user') || 'Guest';
    } catch {
      return 'Guest';
    }
  },
  logOn(name: string) {
    const n = clean(name) || 'Guest';
    write(n);
    on = true;
    try {
      localStorage.setItem('kus98:user', n);
    } catch { /* ignore */ }
    document.querySelectorAll('[data-username]').forEach((el) => (el.textContent = n));
    return n;
  },
  logOff() {
    on = false;
    document.cookie = `${COOKIE}=; path=/; max-age=0; SameSite=Lax${secure()}`;
  },
  /** While this page is open, keep the session from running out (see the top of this file). */
  keepAlive() {
    on = cookieValue() !== null;
    const renew = () => {
      if (on) write(cookieValue() || session.lastUser());
    };
    renew();
    setInterval(renew, 60_000);
    addEventListener('pagehide', renew);
    document.addEventListener('visibilitychange', renew);
  },
};
