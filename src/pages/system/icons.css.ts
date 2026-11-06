// /system/icons.css: every icon from src/lib/iconset.ts as a CSS class.
// <span class="ico ico-folder"></span> shows the folder; sizes are in desktop.css.
import type { APIRoute } from 'astro';
import { ICONS } from '../../lib/iconset';
import { svgUrl, toSvg } from '../../lib/pixels';

export const GET: APIRoute = () => {
  let css = '/* kuschonink 98 icons: drawn in src/lib/iconset.ts */\n';
  for (const [name, draw] of Object.entries(ICONS)) css += `.ico-${name}{--icon:${svgUrl(toSvg(draw().rows()))}}\n`;
  return new Response(css, { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
};
