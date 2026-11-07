#!/usr/bin/env node
// A stand-in for the few Notion API calls the site makes (pages, data-source
// queries, file uploads), so tests and `wrangler dev` never touch the real
// Notion. Plain Node ESM, no dependencies.
//
// In tests:   const s = standIn(); notion({ token: 't', fetch: s.fetch, base: s.base })
// As a server: node scripts/dev/notion-standin.mjs [port]   (default 8798)
//   then put NOTION_API=http://127.0.0.1:8798 and NOTION_TOKEN=dev in .dev.vars.
//   Data sources are created on first use; GET /_dump shows everything.
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const clone = (v) => structuredClone(v);

/** Notion's written property format → the format it returns. */
function stored(prop, files, base) {
  const out = clone(prop);
  for (const k of ['title', 'rich_text']) {
    if (Array.isArray(out[k])) out[k] = out[k].map((t) => ({ type: 'text', text: { content: t.text?.content ?? '' }, plain_text: t.text?.content ?? '' }));
  }
  if (Array.isArray(out.files)) {
    out.files = out.files.map((f) => {
      if (f.type === 'file_upload') {
        const up = files.get(f.file_upload?.id);
        if (!up || up.status !== 'uploaded') throw Object.assign(new Error('file upload not found or not sent'), { status: 400, code: 'validation_error' });
        return { name: f.name, type: 'file', file: { url: `${base}/files/${up.id}/${encodeURIComponent(f.name)}`, expiry_time: '2099-01-01T00:00:00.000Z' } };
      }
      return f;
    });
  }
  return out;
}

const plain = (p) => (p?.title ?? p?.rich_text ?? []).map((t) => t.plain_text ?? '').join('');
function value(p) {
  if (!p) return undefined;
  if ('title' in p || 'rich_text' in p) return plain(p);
  if ('select' in p) return p.select?.name ?? '';
  if ('status' in p) return p.status?.name ?? '';
  if ('checkbox' in p) return p.checkbox;
  if ('url' in p) return p.url ?? '';
  if ('email' in p) return p.email ?? '';
  if ('date' in p) return p.date?.start ?? '';
  return undefined;
}

function matches(page, f) {
  if (!f) return true;
  if (f.and) return f.and.every((x) => matches(page, x));
  if (f.or) return f.or.some((x) => matches(page, x));
  if (f.timestamp === 'created_time') {
    const t = page.created_time;
    const c = f.created_time;
    if (c.on_or_after) return t >= c.on_or_after;
    if (c.before) return t < c.before;
    if (c.on_or_before) return t <= c.on_or_before;
    if (c.after) return t > c.after;
    return true;
  }
  const v = value(page.properties[f.property]);
  const cond = f.rich_text ?? f.title ?? f.select ?? f.status ?? f.url ?? f.email ?? f.checkbox ?? f.date ?? {};
  if ('equals' in cond) return v === cond.equals;
  if ('does_not_equal' in cond) return v !== cond.does_not_equal;
  if ('contains' in cond) return String(v ?? '').includes(cond.contains);
  if (cond.is_empty) return v === '' || v === undefined || v === null;
  if (cond.is_not_empty) return !(v === '' || v === undefined || v === null);
  if ('on_or_after' in cond) return v >= cond.on_or_after;
  if ('before' in cond) return v !== '' && v < cond.before;
  return true;
}

export function standIn(o = {}) {
  const base = o.base ?? 'http://notion.standin';
  const token = o.token ?? null; // when set, requests must carry it
  const pages = new Map();
  const files = new Map();
  const calls = [];
  let n = 0;
  let clock = o.start ?? Date.UTC(2026, 10, 9, 9, 0, 0);
  const state = { pages, files, calls, failNext: null, rateLimitOnce: false };

  const err = (status, code, message) => new Response(JSON.stringify({ object: 'error', status, code, message }), { status, headers: { 'content-type': 'application/json' } });
  const ok = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

  async function handle(req) {
    const url = new URL(req.url);
    const p = url.pathname;
    calls.push(`${req.method} ${p}`);
    if (p.startsWith('/files/')) {
      const up = files.get(p.split('/')[2]);
      return up ? new Response(up.bytes, { headers: { 'content-type': up.content_type } }) : new Response('not found', { status: 404 });
    }
    if (!req.headers.get('notion-version')) return err(400, 'missing_version', 'Notion-Version header is required');
    if (token && req.headers.get('authorization') !== `Bearer ${token}`) return err(401, 'unauthorized', 'API token is invalid.');
    if (state.rateLimitOnce) {
      state.rateLimitOnce = false;
      return new Response(JSON.stringify({ object: 'error', status: 429, code: 'rate_limited', message: 'slow down' }), { status: 429, headers: { 'retry-after': '1', 'content-type': 'application/json' } });
    }
    if (state.failNext) {
      const f = state.failNext;
      state.failNext = null;
      return err(f.status, f.code ?? 'internal_server_error', 'made to fail');
    }
    try {
      if (req.method === 'POST' && p === '/v1/pages') {
        const b = await req.json();
        const ds = b.parent?.data_source_id;
        if (!ds) return err(400, 'validation_error', 'parent.data_source_id is required');
        const id = `${String(++n).padStart(8, '0')}-0000-4000-8000-${'0'.repeat(12)}`;
        clock += 1000;
        const props = {};
        for (const [k, v] of Object.entries(b.properties ?? {})) props[k] = stored(v, files, base);
        const page = { object: 'page', id, url: `https://www.notion.so/${id.replace(/-/g, '')}`, created_time: new Date(clock).toISOString(), last_edited_time: new Date(clock).toISOString(), in_trash: false, parent: { data_source_id: ds }, properties: props };
        pages.set(id, page);
        return ok(clone(page));
      }
      let m = /^\/v1\/pages\/([^/]+)$/.exec(p);
      if (m) {
        const page = pages.get(decodeURIComponent(m[1]));
        if (!page) return err(404, 'object_not_found', 'Could not find page');
        if (req.method === 'GET') return ok(clone(page));
        if (req.method === 'PATCH') {
          const b = await req.json();
          for (const [k, v] of Object.entries(b.properties ?? {})) page.properties[k] = stored(v, files, base);
          if ('in_trash' in b) page.in_trash = !!b.in_trash;
          page.last_edited_time = new Date((clock += 1000)).toISOString();
          return ok(clone(page));
        }
      }
      m = /^\/v1\/data_sources\/([^/]+)\/query$/.exec(p);
      if (m && req.method === 'POST') {
        const ds = decodeURIComponent(m[1]);
        const b = await req.json();
        let list = [...pages.values()].filter((x) => x.parent.data_source_id === ds && !x.in_trash && matches(x, b.filter));
        for (const s of [...(b.sorts ?? [])].reverse()) {
          const key = (x) => (s.timestamp === 'created_time' ? x.created_time : s.timestamp === 'last_edited_time' ? x.last_edited_time : value(x.properties[s.property]) ?? '');
          list.sort((a, c) => (key(a) < key(c) ? -1 : key(a) > key(c) ? 1 : 0) * (s.direction === 'descending' ? -1 : 1));
        }
        const start = Number(b.start_cursor ?? 0);
        const size = Math.min(100, b.page_size ?? 100);
        const results = list.slice(start, start + size).map(clone);
        const more = start + size < list.length;
        return ok({ object: 'list', results, has_more: more, next_cursor: more ? String(start + size) : null });
      }
      if (req.method === 'POST' && p === '/v1/file_uploads') {
        const b = await req.json();
        const id = `up-${++n}`;
        files.set(id, { id, status: 'pending', filename: b.filename, content_type: b.content_type, bytes: null });
        return ok({ object: 'file_upload', id, status: 'pending' });
      }
      m = /^\/v1\/file_uploads\/([^/]+)\/send$/.exec(p);
      if (m && req.method === 'POST') {
        const up = files.get(decodeURIComponent(m[1]));
        if (!up) return err(404, 'object_not_found', 'no such upload');
        const form = await req.formData();
        const file = form.get('file');
        if (!file || typeof file === 'string') return err(400, 'validation_error', 'file is required');
        up.bytes = new Uint8Array(await file.arrayBuffer());
        up.status = 'uploaded';
        return ok({ object: 'file_upload', id: up.id, status: 'uploaded' });
      }
      return err(404, 'invalid_request_url', `${req.method} ${p} is not in the stand-in`);
    } catch (e) {
      return err(e.status ?? 500, e.code ?? 'internal_server_error', e.message);
    }
  }

  return { base, state, pages, files, calls, fetch: (input, init) => handle(new Request(input, init)) };
}

// ---- As a local server for wrangler dev ----
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.argv[2] ?? 8798);
  const s = standIn({ base: `http://localhost:${port}` });
  createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    if (req.url === '/_dump') {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ pages: [...s.pages.values()], uploads: [...s.files.values()].map(({ bytes, ...f }) => ({ ...f, size: bytes?.length ?? 0 })) }, null, 2));
      return;
    }
    const r = await s.fetch(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers, body, duplex: 'half' });
    res.statusCode = r.status;
    r.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await r.arrayBuffer()));
  }).listen(port, () => console.log(`Notion stand-in on http://localhost:${port} (GET /_dump to see what it holds)`));
}
