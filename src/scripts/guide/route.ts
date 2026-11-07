// Field Guide (导览): the route overlay. An SVG in screen space: a navy 3px
// line on a 5px white casing, dashed for walking and dotted for transit
// (colours and dashes in guide-map.css). Step numbers are on the pins
// (data-step), not here.
import type { RouteMode } from '../../lib/guides/types';

const NS = 'http://www.w3.org/2000/svg';

export function makeRouteSvg(): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'gd-route');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const c of ['gd-route-casing', 'gd-route-line']) {
    const p = document.createElementNS(NS, 'polyline');
    p.setAttribute('class', c);
    svg.append(p);
  }
  svg.style.display = 'none';
  return svg;
}

/** Draw the route through screen points, or hide it (null). */
export function drawRoute(svg: SVGSVGElement, pts: { x: number; y: number }[] | null, mode: RouteMode = 'walking') {
  if (!pts || pts.length < 2) {
    if (svg.style.display !== 'none') svg.style.display = 'none';
    return;
  }
  if (svg.style.display) svg.style.display = '';
  svg.dataset.mode = mode;
  const points = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  for (const line of svg.querySelectorAll('polyline')) {
    if (line.getAttribute('points') !== points) line.setAttribute('points', points);
  }
}
