// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://kuschonink.com',
  // Pages build to /about.html etc., so URLs match the old site (no trailing slash).
  trailingSlash: 'never',
  build: { format: 'file' },
  image: {
    // Responsive widths generated for every photo.
    breakpoints: [480, 800, 1200, 1600, 2000, 2500],
  },
});
