// A small Notion API client: pages in a data source, queries, and file
// uploads. Used by the Worker (suggestions, the admin queue, the publisher)
// and by the routine's tools (scripts/suggestions/nt.mts). `fetch` and the
// base URL are passed in, so tests and `wrangler dev` use a stand-in
// (scripts/dev/notion-standin.mjs) and nothing reaches the real Notion.

export const NOTION_VERSION = '2026-03-11';
export const NOTION_API = 'https://api.notion.com';
/** Notion's limit for one text object. */
const TEXT_MAX = 2000;
/** And for the text objects in one property. */
const TEXTS_MAX = 100;

export interface NotionDeps {
  /** An integration token; empty when a proxy adds it (the routine's network secret). */
  token: string;
  fetch: typeof fetch;
  base?: string;
  /** Waits before the one retry after a 429 or a 5xx; tests pass a no-op. */
  wait?: (ms: number) => Promise<void>;
}

export class NotionError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(`Notion ${status} ${code}: ${message}`);
    this.status = status;
    this.code = code;
  }
}

// ---- Property values: writing ----

export type Prop = Record<string, unknown>;

/** Text cut into Notion's 2000-character pieces (at most 100 of them). */
export function texts(s: string | undefined | null): { text: { content: string } }[] {
  const out: { text: { content: string } }[] = [];
  const chars = [...(s ?? '')];
  for (let i = 0; i < chars.length && out.length < TEXTS_MAX; i += TEXT_MAX) out.push({ text: { content: chars.slice(i, i + TEXT_MAX).join('') } });
  return out;
}

export const P = {
  title: (s: string): Prop => ({ title: texts(s) }),
  text: (s: string | undefined | null): Prop => ({ rich_text: texts(s) }),
  select: (name: string | undefined | null): Prop => ({ select: name ? { name } : null }),
  checkbox: (b: boolean): Prop => ({ checkbox: !!b }),
  url: (u: string | undefined | null): Prop => ({ url: u || null }),
  email: (e: string | undefined | null): Prop => ({ email: e || null }),
  date: (start: string | undefined | null, end?: string | null): Prop => ({ date: start ? { start, end: end || null } : null }),
  files: (list: { id: string; name: string }[]): Prop => ({ files: list.map((f) => ({ type: 'file_upload', file_upload: { id: f.id }, name: f.name })) }),
  noFiles: (): Prop => ({ files: [] }),
};

// ---- Property values: reading ----

export interface NotionPage {
  id: string;
  url?: string;
  created_time?: string;
  last_edited_time?: string;
  in_trash?: boolean;
  properties: Record<string, Record<string, unknown>>;
}
export interface NotionFile { name: string; url: string; expiry?: string }

const plain = (list: unknown): string =>
  Array.isArray(list) ? list.map((t) => (t as { plain_text?: string; text?: { content?: string } }).plain_text ?? (t as { text?: { content?: string } }).text?.content ?? '').join('') : '';

export const R = {
  title: (p: NotionPage, k: string) => plain(p.properties[k]?.title),
  text: (p: NotionPage, k: string) => plain(p.properties[k]?.rich_text),
  select: (p: NotionPage, k: string) => ((p.properties[k]?.select as { name?: string } | null)?.name ?? ''),
  checkbox: (p: NotionPage, k: string) => p.properties[k]?.checkbox === true,
  url: (p: NotionPage, k: string) => (typeof p.properties[k]?.url === 'string' ? (p.properties[k].url as string) : ''),
  email: (p: NotionPage, k: string) => (typeof p.properties[k]?.email === 'string' ? (p.properties[k].email as string) : ''),
  date: (p: NotionPage, k: string) => {
    const d = p.properties[k]?.date as { start?: string; end?: string | null } | null | undefined;
    return { start: d?.start ?? '', end: d?.end ?? '' };
  },
  files: (p: NotionPage, k: string): NotionFile[] => {
    const list = (p.properties[k]?.files ?? []) as { name?: string; type?: string; file?: { url: string; expiry_time?: string }; external?: { url: string } }[];
    return list
      .map((f) => ({ name: f.name ?? '', url: f.file?.url ?? f.external?.url ?? '', expiry: f.file?.expiry_time }))
      .filter((f) => f.url);
  },
};

// ---- The client ----

export interface QueryOptions {
  filter?: unknown;
  sorts?: unknown[];
  page_size?: number;
  start_cursor?: string;
}

export function notion(deps: NotionDeps) {
  const base = (deps.base || NOTION_API).replace(/\/+$/, '');
  const wait = deps.wait ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  async function call<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { 'notion-version': NOTION_VERSION };
      if (deps.token) headers.authorization = `Bearer ${deps.token}`;
      if (body !== undefined) headers['content-type'] = 'application/json';
      const res = await deps.fetch(`${base}${path}`, {
        method,
        headers,
        body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return (await res.json()) as T;
      const retryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
      if (retryable && attempt === 0) {
        const after = Number(res.headers.get('retry-after'));
        const ms = Number.isFinite(after) && after > 0 ? after * 1000 : 800;
        if (ms <= 5000) {
          await res.body?.cancel().catch(() => {});
          await wait(ms);
          continue;
        }
      }
      let code = 'unknown';
      let message = res.statusText;
      try {
        const e = (await res.json()) as { code?: string; message?: string };
        code = e.code ?? code;
        message = e.message ?? message;
      } catch { /* not JSON */ }
      throw new NotionError(res.status, code, message);
    }
  }

  const api = {
    createPage: (dataSource: string, properties: Record<string, Prop>, children?: unknown[]) =>
      call<NotionPage>('POST', '/v1/pages', { parent: { type: 'data_source_id', data_source_id: dataSource }, properties, ...(children ? { children } : {}) }),
    updatePage: (id: string, properties: Record<string, Prop>) => call<NotionPage>('PATCH', `/v1/pages/${encodeURIComponent(id)}`, { properties }),
    trashPage: (id: string) => call<NotionPage>('PATCH', `/v1/pages/${encodeURIComponent(id)}`, { in_trash: true }),
    getPage: (id: string) => call<NotionPage>('GET', `/v1/pages/${encodeURIComponent(id)}`),
    query: (dataSource: string, o: QueryOptions = {}) =>
      call<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>('POST', `/v1/data_sources/${encodeURIComponent(dataSource)}/query`, { page_size: 100, ...o }),
    /** Every page a query matches, up to `max`. */
    async queryAll(dataSource: string, o: QueryOptions = {}, max = 500): Promise<NotionPage[]> {
      const out: NotionPage[] = [];
      let cursor: string | undefined;
      do {
        const r = await api.query(dataSource, { ...o, start_cursor: cursor, page_size: Math.min(100, max - out.length) });
        out.push(...r.results);
        cursor = r.has_more && r.next_cursor ? r.next_cursor : undefined;
      } while (cursor && out.length < max);
      return out;
    },
    /** Upload one file (≤20 MB) and return its id, to put in a files property within the hour. */
    async uploadFile(name: string, contentType: string, bytes: Uint8Array): Promise<string> {
      const up = await call<{ id: string }>('POST', '/v1/file_uploads', { mode: 'single_part', filename: name, content_type: contentType });
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: contentType }), name);
      await call('POST', `/v1/file_uploads/${encodeURIComponent(up.id)}/send`, undefined, form);
      return up.id;
    },
  };
  return api;
}

export type Notion = ReturnType<typeof notion>;
