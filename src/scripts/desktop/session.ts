// Who is logged on. Xiangyin 98 has no accounts and no passwords: everyone is
// Guest, whatever the log-on box once said. The site's owner can be
// Administrator through the separate, hidden admin log-on (/admin, checked on
// the server: worker/admin.ts); kus98_admin_ui only says that happened.
// "Logged on" is a session cookie, so new tabs see it (sessionStorage wouldn't).
const COOKIE = 'kus98_session';
const GUEST = 'Guest';

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
    document.cookie = `${COOKIE}=${GUEST}; path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    // Names typed before everyone was Guest.
    try {
      localStorage.removeItem('kus98:user');
    } catch { /* ignore */ }
    const n = session.user();
    document.querySelectorAll('[data-username]').forEach((el) => (el.textContent = n));
    return n;
  },
  logOff() {
    document.cookie = `${COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  },
};
