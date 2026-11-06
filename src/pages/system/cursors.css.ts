// /system/cursors.css: the kuschonink 98 mouse pointers (src/lib/cursors.ts)
// as CSS cursors. Each is an SVG with a PNG fallback (for browsers that
// won't take SVG cursors), plus a 2× set for Control Panel ▸ Mouse ▸ Large.
// <html data-pointers="system"> turns them all off.
import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { POINTERS } from '../../lib/cursors';
import { svgUrl, toSvg } from '../../lib/pixels';

const P = 'html:not([data-pointers="system"]) body.kus98';

async function variants(rows: string[], scale: number) {
  const svg = toSvg(rows).replace(/width="32" height="32"/, `width="${32 * scale}" height="${32 * scale}" shape-rendering="crispEdges"`);
  const png = await sharp(new TextEncoder().encode(toSvg(rows))).resize(32 * scale, 32 * scale, { kernel: 'nearest' }).png().toBuffer();
  return { svg: svgUrl(svg), png: `url("data:image/png;base64,${png.toString('base64')}")` };
}

export const GET: APIRoute = async () => {
  let normal = '';
  let large = '';
  for (const [name, make] of Object.entries(POINTERS)) {
    const p = make();
    const [x, y] = p.hot;
    const n = await variants(p.rows, 1);
    const l = await variants(p.rows, 2);
    normal += `--k98c-${name}:${n.svg} ${x} ${y},${n.png} ${x} ${y},auto;--k98i-${name}:${n.svg};--k98h-${name}:${x}px ${y}px;`;
    large += `--k98c-${name}:${l.svg} ${x * 2} ${y * 2},${l.png} ${x * 2} ${y * 2},auto;--k98i-${name}:${l.svg};--k98h-${name}:${x * 2}px ${y * 2}px;`;
  }
  const css = `/* kuschonink 98 pointers: drawn in src/lib/cursors.ts */
:root{${normal}--k98-pointer-size:32px}
html[data-pointers="large"]{${large}--k98-pointer-size:64px}
${P},${P} *{cursor:var(--k98c-arrow)}
${P} .doc :is(p,li,dd,dt,td,th,h1,h2,h3,h4,figcaption,blockquote,pre,code,em,strong,b,i,small,address,mark),
${P} :is(input:not([type]),input[type="text"],input[type="email"],input[type="search"],input[type="url"],input[type="tel"],input[type="number"],textarea,[contenteditable="true"]){cursor:var(--k98c-text)}
${P} :is(a[href],a[href] *,area[href],.hotspot,.hotspot *,.welcome-option,.welcome-option *,.drawer,.drawer *,.constraints summary,[data-tab],[data-viewable]){cursor:var(--k98c-hand)}
${P} :is(.icon,.icon *,.menu-item,.menu-item *,.tool,.tool *,.ql-btn,.ql-btn *){cursor:var(--k98c-arrow)}
html[data-click="single"]:not([data-pointers="system"]) body.kus98 :is(.icon,.icon *){cursor:var(--k98c-hand)}
${P} :is(.room.locked,.room.locked *){cursor:var(--k98c-no)}
${P} :is([data-resize="n"],[data-resize="s"]){cursor:var(--k98c-ns)}
${P} :is([data-resize="e"],[data-resize="w"]){cursor:var(--k98c-ew)}
${P} :is([data-resize="ne"],[data-resize="sw"]){cursor:var(--k98c-nesw)}
${P} :is([data-resize="nw"],[data-resize="se"],.grip){cursor:var(--k98c-nwse)}
${P} :is(.map-viewport.dragging,.map-viewport.dragging *){cursor:var(--k98c-move)}
html[data-dragging="move"]:not([data-pointers="system"]) body.kus98 *{cursor:var(--k98c-move)!important}
html:is([data-dragging="n"],[data-dragging="s"]):not([data-pointers="system"]) body.kus98 *{cursor:var(--k98c-ns)!important}
html:is([data-dragging="e"],[data-dragging="w"]):not([data-pointers="system"]) body.kus98 *{cursor:var(--k98c-ew)!important}
html:is([data-dragging="ne"],[data-dragging="sw"]):not([data-pointers="system"]) body.kus98 *{cursor:var(--k98c-nesw)!important}
html:is([data-dragging="nw"],[data-dragging="se"]):not([data-pointers="system"]) body.kus98 *{cursor:var(--k98c-nwse)!important}
html[data-busy="bg"]:not([data-pointers="system"]) body.kus98 *{cursor:var(--k98c-appstarting)!important}
html[data-busy="wait"]:not([data-pointers="system"]) body.kus98 *,html:is([data-boot="boot"],[data-boot="shutting"]):not([data-pointers="system"]) body.kus98 *{cursor:var(--k98c-wait)!important}
html[data-help-mode]:not([data-pointers="system"]) body.kus98 *{cursor:var(--k98c-help)!important}
html[data-saver]:not([data-pointers="none"]) body.kus98 *{cursor:none!important}
`;
  return new Response(css, { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
};
