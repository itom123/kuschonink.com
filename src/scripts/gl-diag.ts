// Runtime facts about the browser's graphics, for when the 3D doesn't draw on someone's machine.
// Open a 3D page with ?debug=3d to see them in a small box; without it this does nothing.
// It only reads: WebGL / WebGL2 availability, the GPU and ANGLE backend Chrome reports,
// limits, the device pixel ratio, the canvases' sizes, and how often their graphics
// contexts were lost and restored (counted in each canvas's data-lost / data-restored).

export const diagOn = () => new URLSearchParams(location.search).get('debug') === '3d';

/** What one kind of WebGL context reports, or null if the browser won't create one. */
export function probeGL(type: 'webgl2' | 'webgl') {
  const c = document.createElement('canvas');
  const gl = c.getContext(type) as WebGLRenderingContext | null;
  if (!gl) return null;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const info = {
    renderer: String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
    vendor: String(dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
    maxTexture: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
  };
  gl.getExtension('WEBGL_lose_context')?.loseContext(); // give the context back straight away
  return info;
}

/** A one-line summary for the console, so a report always carries the evidence. */
export function glSummary(gl: WebGLRenderingContext | WebGL2RenderingContext | null, canvas?: HTMLCanvasElement) {
  if (!gl) return 'no WebGL context';
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const version = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1';
  const size = canvas ? ` · canvas ${canvas.width}×${canvas.height}` : '';
  return `${version} · ${renderer} · max texture ${gl.getParameter(gl.MAX_TEXTURE_SIZE)} · dpr ${devicePixelRatio}${size}`;
}

/** The ?debug=3d box: re-read every second, removed when the page's 3D is torn down. */
export function showDiag(host: HTMLElement, canvases: () => HTMLCanvasElement[], signal: AbortSignal) {
  if (!diagOn()) return;
  const box = document.createElement('pre');
  box.className = 'gl-diag';
  host.appendChild(box);
  const gl2 = probeGL('webgl2'), gl1 = probeGL('webgl');
  let lastError = '';
  window.addEventListener('error', (e) => (lastError = e.message), { signal });
  window.addEventListener('unhandledrejection', (e) => (lastError = String(e.reason)), { signal });
  const draw = () => {
    const lines = [
      `WebGL2: ${gl2 ? 'yes' : 'NO'}   WebGL: ${gl1 ? 'yes' : 'NO'}`,
      `GPU: ${(gl2 ?? gl1)?.renderer ?? '—'}`,
      `vendor: ${(gl2 ?? gl1)?.vendor ?? '—'}   max texture: ${(gl2 ?? gl1)?.maxTexture ?? '—'}`,
      `devicePixelRatio: ${devicePixelRatio}   reduced motion: ${matchMedia('(prefers-reduced-motion: reduce)').matches}`,
      ...canvases().map((c, i) => {
        const r = c.getBoundingClientRect();
        return `canvas ${i + 1}${c.className ? ` (${c.className})` : ''}: ${Math.round(r.width)}×${Math.round(r.height)} css, ${c.width}×${c.height} px, context lost ${c.dataset.lost ?? 0}, restored ${c.dataset.restored ?? 0}`;
      }),
      `last error: ${lastError || '—'}`,
    ];
    box.textContent = lines.join('\n');
  };
  draw();
  const timer = window.setInterval(draw, 1000);
  signal.addEventListener('abort', () => {
    clearInterval(timer);
    box.remove();
  });
}

/** Count a canvas's context losses and restores in its data-* (read by the box above). */
export function countLosses(canvas: HTMLCanvasElement, lostEvent: string, restoredEvent: string, signal: AbortSignal) {
  const bump = (k: 'lost' | 'restored') => (canvas.dataset[k] = String(Number(canvas.dataset[k] ?? 0) + 1));
  canvas.addEventListener(lostEvent, () => bump('lost'), { signal });
  canvas.addEventListener(restoredEvent, () => bump('restored'), { signal });
}

/** Call `fn` whenever the device pixel ratio changes (another monitor, browser zoom). */
export function onDprChange(fn: () => void, signal: AbortSignal) {
  let mq: MediaQueryList | null = null;
  const arm = () => {
    mq?.removeEventListener('change', changed);
    mq = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    mq.addEventListener('change', changed);
  };
  function changed() {
    fn();
    arm();
  }
  arm();
  signal.addEventListener('abort', () => mq?.removeEventListener('change', changed));
}
