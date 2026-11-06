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

## kuschonink 98

The whole site works like a computer from 1998, called **kuschonink 98**. The
first page of a visit starts up (a short BIOS screen and a splash) and asks the
visitor to log on: any name works, and there's no password. Then the desktop
appears with the page they asked for open in a window.

- **The desktop**: icons for My Computer, Projects, The House, About.doc,
  Contact, Help, Instagram and the Recycle Bin. Double-click to open; drag to
  arrange; right-click almost anything for a menu (press and hold on a phone).
- **Windows** move, resize, minimise and maximise, and each has a button on the
  taskbar. The **Start menu** reaches every page, plus Find, Run, Help, the
  Control Panel, Log Off and Shut Down.
- **Programs**: Projects (`/image`, a folder with thumbnails, list and details
  views, and a Web View pane), each project (`/image/<slug>`, with an Image
  Viewer for the photographs), About.doc (`/about`, a document), Contact
  (`/contact`, a New Message window), The House (`/house/…`, a browser window),
  Help (`/help`), and Welcome (`/`).
- **The Control Panel**: Display (wallpaper, screen saver, colour schemes
  including High Contrast, window effects), Mouse (pointer trails, larger
  pointers, double-click speed), Sounds, and Folder Options (single or double
  click). Settings stay in the visitor's browser.
- Sounds, pointers, icons and screens are made for the site: nothing is taken
  from Windows.

Every URL is still a real page with its content in the HTML, so search engines,
link previews and visitors without JavaScript see ordinary pages. How it's
built, and how to add a program, an icon or a setting:
[`docs/DESKTOP.md`](docs/DESKTOP.md).

### The House

**The House** (`/house/facade`, `/house`, `/house/<room>`) opens as a program in
a browser-style window. The site is the family house, drawn from the 2008
renovation plans. The façade (`/house/facade`) is the south elevation: the door
and windows lead inside. The floorplan works like an indoor map: drag to move,
scroll or pinch to zoom, switch floors with **R / A / 2 / 1**, search with
*Search this house*, and tick **Blueprint** to see the original drawings. Rooms
hold projects, About and Contact. Inside its window, the House is set in Times
New Roman.

### The rules of the house (after Perec)

Like Georges Perec's *Life A User's Manual*, the order is set by a constraint, not
by hand. Every floor sits on the same 5 × 5 structural grid (columns 3600 · 3600 ·
3600 · 3200 · 2000 mm, rows 2800 · 2800 · 3000 · 4800 · 1400 mm). A knight's tour of
that grid, repeated on each floor from the ground up, numbers the rooms: chapter 1
is the first room the knight lands in, and so on (37 chapters). Each room lists an
inventory built only from facts: name, size, floor level, window and door codes,
and what's inside. One room, drawn in the attic with no door, can't be entered.
It's the missing chapter.

### Editing the house: `src/content/house.json`

- Each floor has `rooms`. A room is a rectangle in millimetres `[x, y, width, height]`
  (or a `poly` for L-shaped rooms), traced from the drawings.
- **What's in a room** is its `contents`: `{ "project": "<slug>" }`, or
  `{ "page": "about" | "contact" | "writings" | "colophon" }`. To move a project,
  move its `contents` to another room. Rooms without `contents` are only described.
- `locked: true` makes a room impossible to enter.
- `scan` places the original drawing under the traced rooms (the Blueprint layer).
- `elevation.hotspots` are the clickable door and windows on the façade.

Chapter numbers recompute automatically whenever rooms change.

### Constraints: `src/content/perec.json`

Five lists of five items (Source, Time, and the hidden Object, Quoted
document and Autobiographical sign) are dealt over the 5 × 5 grid by mutually
orthogonal Latin squares of order 5: `L_k(column, row) = (k·column + row) mod 5`,
plus the plain row for Source. Every room receives the items of the square where
the knight entered it, and shows them in a constraint table (hidden constraints
in red). Each item has `match` words. If one appears in the room's own content,
the constraint is *fulfilled*. If it appears next door, it's *echoing*;
elsewhere in the house, *semi-fulfilled*; nowhere, *not fulfilled*. The
*clinamen* rule breaks one constraint per floor on purpose.

Edit the items freely (keep five per list). Statuses update on the next build,
so writing new content into a room can fulfil its constraints. The same file
holds the **Chronology**.

Appendices (after the last chapter): `/house/appendix/index`, `chronology`,
`checklist`, `rules`.

### Drawers: `src/content/drawers.json` and `src/content/writings/`

Private writings are kept as objects in drawers (a folded letter, a printed
page, a notebook). The study and bedrooms have furniture drawn in plan (positions
in mm inside the room). Click a drawer to open it, then an object to read it on
a sheet of paper.

- **Placement is by rule** (`src/lib/house.ts`), oldest piece first: each piece
  goes to the room whose *dealt* list items it mentions most, ties go to the
  earlier chapter, and there's one piece per drawer. A piece in a drawer also
  fulfils its room's constraints.
- **References are controlled.** Add `references` to a piece
  (`{ "project": "<slug>" }`, `{ "room": "f2/study" }` or `{ "piece": "<id>" }`).
  A reference that doesn't exist stops the build. The sheet also lists, by rule,
  the list items it shares with the rest of the house.
- **Unlisted, not secret.** Each piece lives at `/house/drawer/<id>` with
  `noindex` (meta tag and `X-Robots-Tag` in `public/_headers`). Its text is
  fetched only when the drawer is opened, and it's left out of the sitemap,
  the Index, Find and the Projects folder. Anyone who opens the drawer can read it.

To add a piece, add `src/content/writings/<id>.json` (title, date, object,
objectLabel, html, references). The rules find it a drawer.

### Contact form

The form posts to `/v1/contact/kuschonink`, handled by the site's own Worker
(`worker/contact.ts`). It checks the origin, validates the fields, rate-limits
(5 messages a minute per visitor), checks Turnstile, and emails the message
through the `EMAIL` binding. That binding can only send to the inbox set as
`destination_address` in `wrangler.jsonc`, and the address must be verified
in Email Routing. The sender is `noreply@kuschonink.com`. Replying to the
email goes to the visitor.

- **Secret:** `TURNSTILE_SECRET` is set in the dashboard (Workers & Pages →
  kuschonink → Settings → Variables and Secrets), never in the repo. It must
  belong to the same Turnstile widget as `contact.form.turnstileSiteKey` in
  `src/content/site.json`.
- **Errors:** if sending fails, the form shows the error code (for example
  `delivery_failed: E_SENDER_NOT_VERIFIED`), and the Worker logs it under
  Observability.
- **Tests:** `npm test` runs the handler against stand-in services.

The old `kuschonink-contact` Worker is no longer used by the site.

### Analytics

Cloudflare Web Analytics is enabled for the kuschonink.com zone with automatic
setup: Cloudflare injects the beacon into every page as it passes through.
There's no code in this repo and no cookie banner is needed.

## How the project is organised

| Path | What it is |
| --- | --- |
| `src/content/house.json` | The house: floors, rooms, what's in each room |
| `src/content/site.json` | Site name, Instagram link, email, phone, contact form fields |
| `src/content/home.json` | Order of projects and site description |
| `src/content/help.json` | The Help topics (`/help`) |
| `src/content/about.json`, `contact.json` | About and Contact |
| `src/content/projects/*.json` | One file per project |
| `src/assets/images/` | All photos, grouped by page |
| `src/assets/house/` | The floorplans and elevation drawings |
| `src/lib/house.ts` | Knight's tour, chapter order, inventories |
| `src/scripts/map.ts` | Map interaction (pan, zoom, floors, search) |
| `src/components/house/` | Floorplan map and room panel |
| `src/layouts/Desktop.astro` | Every page: the kuschonink 98 desktop with the page in a window |
| `src/components/desktop/` | Window, taskbar, Start menu, desktop icons, start-up screens |
| `src/scripts/desktop/` | The desktop shell: windows, menus, sounds, Control Panel… (see [`docs/DESKTOP.md`](docs/DESKTOP.md)) |
| `src/styles/` | `desktop.css`, `system.css`, `schemes.css` (the computer), `doc.css`, `blocks.css`, `house.css`, `explorer.css`, `apps.css` (what's in the windows); 98.css is vendored in `src/styles/vendor/` |
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
  existing one), put its photos in `src/assets/images/projects/my-project/`, add
  `"my-project"` to `projects` in `src/content/home.json`, and give it a room in
  `src/content/house.json` (`"contents": { "project": "my-project" }`).
- **Reorder projects:** change the `projects` list in `src/content/home.json`.
- **Swap in a higher-resolution photo:** replace the file in
  `src/assets/images/...` with the new one, keeping the same file name. Astro
  generates all the web sizes (up to 2500 px wide, WebP) at build time.
- **Restyle the house:** the colours are at the top of `src/styles/house.css`.

## Deploying to Cloudflare Workers

The site is deployed as a Worker serving static assets (`dist/`).

**Option A: Cloudflare Git integration (recommended).** In the Cloudflare
dashboard go to *Workers & Pages → Create → Import a repository*, choose
`itom123/kuschonink.com`, and set:

- Project name: `kuschonink` (must match `name` in `wrangler.jsonc`)
- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Non-production branch deploy command: `npx wrangler versions upload`
  (this gives every pull request a preview link)

Every push to `main` then deploys automatically.

**Option B: from your computer.** Run `npx wrangler login` once, then
`npm run deploy`.

**Custom domain.** Once `kuschonink.com` is on Cloudflare, add it under the
Worker's *Settings → Domains & Routes*. Until then the site is available at
`kuschonink.<your-subdomain>.workers.dev`.

### Adding server features later

`worker/index.ts` runs only for the paths listed in `assets.run_worker_first`
(currently `/v1/contact/*`). Everything else is served as static files. Add a
path there and handle it in the Worker to add an API route.

## Migration notes

See [`docs/MIGRATION.md`](docs/MIGRATION.md) for what was moved from Squarespace
and what was intentionally left out.
