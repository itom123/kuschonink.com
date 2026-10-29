import type { APIRoute } from 'astro';
import { projects, site } from '../lib/content';

export const GET: APIRoute = () => {
  const paths = ['/', '/about', '/contact', '/image', ...projects.map((p) => `/image/${p.slug}`)];
  const urls = paths.map((p) => `  <url><loc>${new URL(p, site.url).href.replace(/\/$/, p === '/' ? '/' : '')}</loc></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml' },
  });
};
