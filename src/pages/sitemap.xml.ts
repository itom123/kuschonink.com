import type { APIRoute } from 'astro';
import { projects, site } from '../lib/content';
import { rooms } from '../lib/house';

export const GET: APIRoute = () => {
  const paths = [
    '/', '/house', '/house/facade', '/image', '/image/all', '/about', '/contact',
    ...projects.map((p) => `/image/${p.slug}`),
    ...rooms.map((r) => `/house/${r.slug}`),
  ];
  const urls = paths.map((p) => `  <url><loc>${site.url}${p === '/' ? '/' : p}</loc></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml' },
  });
};
