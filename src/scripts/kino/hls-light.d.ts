// hls.js ships one set of types; its "light" build (no subtitles, alternate
// audio or DRM, which the Kino doesn't use) has the same API.
declare module 'hls.js/light' {
  import Hls from 'hls.js';
  export default Hls;
}
