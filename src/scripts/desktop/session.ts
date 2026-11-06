// Who is logged on. kuschonink 98 has no accounts: any name, no password.
// "Logged on" is a session cookie, so new tabs see it (sessionStorage wouldn't).
const COOKIE = 'kus98_session';

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
    document.cookie = `${COOKIE}=${encodeURIComponent(n)}; path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    try {
      localStorage.setItem('kus98:user', n);
    } catch { /* ignore */ }
    document.querySelectorAll('[data-username]').forEach((el) => (el.textContent = n));
    return n;
  },
  logOff() {
    document.cookie = `${COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  },
};
