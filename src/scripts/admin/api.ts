// Admin mode in the browser: calls to /v1/admin/* (worker/admin.ts). The
// session is an HttpOnly cookie the browser sends by itself; the server
// checks every call. These helpers only make the calls and read the answers.

export interface AdminMe { admin: boolean; exp?: number; notion?: boolean; mail?: boolean; routine?: boolean; publish?: boolean; github?: boolean; guides?: Record<string, string[]>; audiences?: Record<string, { en: string; zh: string }> }

export async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  let res: Response;
  try {
    res = await fetch(`/v1/admin${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 0, data: { error: 'offline' } as T & { error?: string } };
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401 && path !== '/login') adminOff();
  return { ok: res.ok, status: res.status, data };
}

/** Admin mode is on in this page (the harmless UI cookie; the server decides the rest). */
export const isAdminPage = () => document.documentElement.hasAttribute('data-admin');

export function adminOn() {
  document.documentElement.setAttribute('data-admin', '');
  document.dispatchEvent(new CustomEvent('admin:change', { detail: { admin: true } }));
}

export function adminOff() {
  if (!isAdminPage()) return;
  document.cookie = 'kus98_admin_ui=; path=/; max-age=0; SameSite=Lax';
  document.documentElement.removeAttribute('data-admin');
  document.dispatchEvent(new CustomEvent('admin:change', { detail: { admin: false } }));
}

let me: Promise<AdminMe> | null = null;
/** Ask the server once per page load (and again after a log-on or log-off). */
export function whoAmI(fresh = false): Promise<AdminMe> {
  if (fresh || !me) me = api<AdminMe>('/me').then((r) => (r.ok ? r.data : { admin: false }));
  return me;
}
export const forget = () => (me = null);
