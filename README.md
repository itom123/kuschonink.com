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

## Two ways in

**The house** (`/house/facade`, `/house`, `/house/<room>`): the site is the family house, drawn from
the 2008 renovation plans. The façade (`/house/facade`) is the south elevation: the door and
windows lead inside. The floorplan works like an indoor map: drag to move, scroll
or pinch to zoom, switch floors with **R / A / 2 / 1** (buttons or keys) or
PageUp / PageDown, search with *Search this house*, and tick **Blueprint** to see
the original drawings. Rooms hold projects, About and Contact. Everything is set
in Times New Roman.

You can also walk through the house:

- **Stairs.** The stairs are drawn on every floor: click *▲ Up* at the top of the
  stairs or *▼ Down* at the bottom to arrive on the stairs of the next floor. The
  roof has a hatch down to the attic.
- **Next door.** Every room's panel lists the rooms beside it, by direction
  (north is the top of the plan), plus the way up or down if you're on the stairs.
- **How the floors stack.** All floors share one camera, so changing floors keeps
  the same spot in view. Going up, the old floor sinks away; going down, it rises.
  The floor below shows as dashed lines, and through open-air rooms (terraces,
  balconies, the roof). The little section beside the floor buttons shows which
  storey you're on.

**The house in 3D (test)** (`/house/3d`, `/house/3d?room=<room>`): a rough model
of the same rooms, in the house's own colours (`src/scripts/house3d.ts`), as a guide.
Drag to turn it, scroll or pinch to zoom, use **R / A / 2 / 1** to cut the house away
down to a floor, tick **Lift floors** to pull the storeys apart, and tick
**Blueprint** to lay the original drawing on each floor and check the model against
it. Click a room for its chapter. Rooms and levels come from `house.json`; the rest is
traced from the drawings into `src/content/house3d.json`: doors and openings, glazing
(the living room's picture window and glass door onto the porch, the attic's sliding
doors), walls the rooms don't draw (the stair core), floor they leave out (the attic
corridor), the stairs (a wooden U round the core from the ground floor to the first
floor, then a straight flight to the attic; none to the roof), the stairwells, and the
garage as a cellar a few steps down from the hall with a small stair up to a narrow
loft. Edit that file to correct a door or a stair. The roof, columns, balustrades and
corner stones are approximations from the south elevation and photos of the house.
three.js is loaded only on this page. The page is `noindex` and is not in the sitemap.

**The simple view** (`/`, `/image`, `/image/<slug>`, `/image/all`, `/about`, `/contact`):
the default view visitors land on at `/`. A Windows 98 desktop for anyone who wants to see the work quickly. Every gallery
is laid flat, so a project is one page. `/image/all` puts every project on one page.
On a computer with a mouse and a wide screen, the desktop works like Windows 98
(`src/scripts/win98-wm.ts`): drag windows by the title bar, resize from the corner,
minimise, maximise and close them, and open several at once. Double-click a desktop
icon (or use Start) to open a window; links load inside their window, and
Shift-click opens a link in a new one. The taskbar lists open windows. Phones and
narrow screens get plain pages.

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
- `stairs: "<floor id>"` marks the stairs room and where it leads up to. It draws
  the *Up* link there and the *Down* link on that floor. "Next door" comes from
  rooms that share a wall (locked rooms are left out).
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
  the Index and the simple view. Anyone who opens the drawer can read it.

To add a piece, add `src/content/writings/<id>.json` (title, date, object,
objectLabel, html, references). The rules find it a drawer.

### Two languages: the 中/EN toggle

Every page can be read in English or Chinese, one at a time. The **中 / EN**
switch sits top right (in the house header, and in the simple view's menu bar).
The choice is remembered in the browser; first-time visitors get Chinese if
their browser is set to Chinese, English otherwise.

How it works: each page carries both languages. Elements marked `data-l="en"` /
`data-l="zh"` show only when that language is on (`src/styles/lang.css`), and
`src/scripts/lang.ts` swaps attributes like `aria-label` and the page title.

Where the words live:

- **Interface words** (buttons, headings, table labels, messages):
  `src/lib/i18n.ts`, each as `{ en, zh }`. `src/components/Bi.astro` prints one.
- **Content** keeps its Chinese next to the English:
  - pages: `titleZh`, `seo.titleZh`, `seo.descriptionZh`;
  - text blocks: `htmlZh`; images: `captionZh`, `altZh`; marquees: `itemsZh`;
  - rooms and furniture: `zh` / `en`; list items, list names, façade hotspots: `zh`;
    chronology: `whenZh` / `whatZh`; contact form: `labelZh`, `submitTextZh`;
  - writings: `titleZh`, `excerptZh`, `htmlZh` (in Traditional Chinese, as the
    artist writes them).
- Anything without a Chinese version shows its English in both modes, so a new
  project still works before it's translated. Fill in both when you can.

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
| `src/content/home.json` | Order of projects (simple view) and site description |
| `src/content/about.json`, `contact.json` | About and Contact |
| `src/content/projects/*.json` | One file per project |
| `src/assets/images/` | All photos, grouped by page |
| `src/assets/house/` | The floorplans and elevation drawings |
| `src/lib/house.ts` | Knight's tour, chapter order, inventories |
| `src/scripts/map.ts` | Map interaction (pan, zoom, floors, search) |
| `src/components/house/` | Floorplan map and room panel |
| `src/layouts/House.astro`, `Win98.astro` | The two views |
| `src/styles/house.css`, `win98.css`, `blocks.css` | Styling (98.css is vendored in `src/styles/vendor/`) |
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
