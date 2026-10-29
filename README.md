# kuschonink.com

Personal website of Xiangyin (Tom) Gu, migrated from Squarespace to a static
[Astro](https://astro.build) site hosted on **Cloudflare Workers**.

## Quick start

```bash
npm install
npm run dev       # local dev server at http://localhost:4321
npm run build     # build the static site into dist/
npm run preview   # run the built site on the local Workers runtime (wrangler)
npm run deploy    # build and deploy to Cloudflare Workers
```

## How the project is organised

Content and design are kept separate, so the site can be restyled without
touching the content.

| Path | What it is |
| --- | --- |
| `src/content/site.json` | Site name, menu, Instagram link, email, phone, contact form fields |
| `src/content/home.json` | Home page background and the **order** of projects |
| `src/content/about.json`, `contact.json` | About and Contact pages |
| `src/content/projects/*.json` | One file per project (`/image/<file-name>`) |
| `src/assets/images/` | All photos, grouped by page |
| `src/styles/global.css` | All styling. Design tokens (fonts, colours, spacing) are at the top |
| `src/components/` | Header, footer, sections and content blocks |
| `src/pages/` | Routes (`/`, `/about`, `/contact`, `/image`, `/image/<slug>`) |
| `wrangler.jsonc` | Cloudflare Workers config |

### Page content format

Every page is a list of **sections**. A section has a `theme` (`light` or
`dark`), an optional full-bleed `background` image, and a list of **blocks**:

| Block `type` | Fields |
| --- | --- |
| `text` | `html`. Classes you can use: `display`, `large`, `small`, `accent`, `align-center`, `align-right`; `<mark>` highlights |
| `image` | `src`, `alt`, optional `caption`, `link` |
| `gallery` | `style` (`slideshow`, `reel`, `fullscreen`, `masonry`, `strips`, `grid`) and `images` |
| `video` | `url`, `youtubeId` or `vimeoId`, optional `caption` |
| `marquee` | `items` (scrolling text) |
| `banner` | `images` shown full screen |
| `contactForm` | Uses the fields in `site.json` |

Image `src` paths are relative to `src/assets/images`. Images may also have a
`focal` point (`[x, y]`, 0–1) used when they are cropped.

### Common edits

- **Add a project:** create `src/content/projects/my-project.json` (copy an
  existing one), put its photos in `src/assets/images/projects/my-project/`, and
  add `"my-project"` to `projects` in `src/content/home.json`.
- **Reorder projects:** change the `projects` list in `src/content/home.json`.
- **Swap in a higher-resolution photo:** replace the file in
  `src/assets/images/...` with the new one, keeping the same file name. Astro
  generates all the web sizes (up to 2500 px wide, WebP) at build time.
- **Restyle:** start with the tokens at the top of `src/styles/global.css`.

## Deploying to Cloudflare Workers

The site is deployed as a Worker serving static assets (`dist/`).

**Option A: Cloudflare Git integration (recommended).** In the Cloudflare
dashboard go to *Workers & Pages → Create → Import a repository*, choose this
repo, and set:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

Every push to the main branch then deploys automatically, and pull requests get
preview URLs.

**Option B: from your computer.** Run `npx wrangler login` once, then
`npm run deploy`.

**Custom domain.** Once `kuschonink.com` is on Cloudflare, add it under the
Worker's *Settings → Domains & Routes*. Until then the site is available at
`kuschonink.<your-subdomain>.workers.dev`.

### Adding server features later

`wrangler.jsonc` currently serves static files only. To add things like a
contact-form backend or other API routes, add a `main` Worker script (or the
`@astrojs/cloudflare` adapter for server-rendered Astro pages).

## Migration notes

See [`docs/MIGRATION.md`](docs/MIGRATION.md) for what was moved from Squarespace
and what was intentionally left out.
