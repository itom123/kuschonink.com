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

## Xiangyin 98

The whole site works like a computer from 1998, called **Xiangyin 98**. The
first page of a visit starts up (a short BIOS screen and a splash) and asks the
visitor to log on: everyone is Guest, and there's no password. Then the desktop
appears with the page they asked for open in a window. The site's owner has a
separate, hidden log-on for admin mode, checked on the server
([`docs/ADMIN.md`](docs/ADMIN.md)).

- **The desktop**: icons for My Computer, Projects, The House, About.doc,
  Contact, Help, Instagram and the Recycle Bin. Double-click to open; drag to
  arrange; right-click almost anything for a menu (press and hold on a phone).
- **Windows** move, resize, minimise and maximise, and each has a button on the
  taskbar. The **Start menu** reaches every page, plus Find, Run, Help, the
  Control Panel, Log Off and Shut Down.
- **Programs**: Welcome (`/`), Projects (`/image`, a folder with thumbnails,
  list and details views, and a Web View pane), each project (`/image/<slug>`,
  with an Image Viewer for the photographs), About.doc (`/about`, a document),
  Contact (`/contact`, a New Message window), Paint (`/paint`, for drawing
  something and sending it to the artist), The House (`/house/…`, a browser
  window), Field Guide (`/guides`, behind passwords) and Help (`/help`).
- **Pictures can't be saved.** The photographs and drawings are protected by
  copyright: no right-click, press-and-hold or drag will save one, and
  *Save Picture As...* (and *Save* in the Image Viewer) says why. What a
  visitor draws in Paint is theirs to keep, and admin mode is left alone. See
  [`docs/DESKTOP.md`](docs/DESKTOP.md#pictures-cant-be-saved).
- **The Control Panel**: Display (wallpaper, screen saver, colour schemes
  including High Contrast, window effects), Mouse (faint pointer trails, off to
  begin with; larger pointers; double-click speed), Sounds, and Folder Options
  (single or double click). Settings stay in the visitor's browser.
- **It remembers**, in the visitor's browser only. A reload brings the desktop
  back as it was: the same windows, front to back, minimised or not, scrolled
  to the same place. Each program opens where it was last left (place, size,
  maximised, toolbars), "Show this screen each time Xiangyin 98 starts" holds
  on every load of the home page, and an unsent Contact message survives a
  reload until it's sent or the tab is closed.
- **Cookies are asked about first.** After start-up and log-on, a message box,
  *Cookies on Xiangyin 98*, lists what needs a cookie (a guide's password,
  staying logged on) and what can do without (this tab's memory, lasting
  preferences), and what happens without each, then offers **Allow All**,
  **Necessary Only** or **None**. Nothing is written until the visitor
  chooses, and a stricter choice removes what it no longer allows. Under None,
  or after closing the box unanswered, logging on to a guide asks again with a
  pale yellow Information Bar across the top of the screen. Start ▸ Settings ▸
  Cookies... changes the choice; bots and link previews never see either. See
  "Cookies" in [`docs/DESKTOP.md`](docs/DESKTOP.md#cookies-the-visitors-choice).
- Sounds, pointers, icons and screens are made for the site: nothing is taken
  from Windows. No visible text says "kuschonink"; addresses read `C:\xiangyin\…`.

Every URL is still a real page with its content in the HTML, so search engines,
link previews and visitors without JavaScript see ordinary pages. How it's
built, and how to add a program, an icon or a setting:
[`docs/DESKTOP.md`](docs/DESKTOP.md).

### The House

**The house** (`/house/facade`, `/house`, `/house/<room>`) opens as a program in a
browser-style window. The site is the family house, drawn from the 2008 renovation
plans. The façade (`/house/facade`) is the south elevation: the door and windows lead
inside. The floorplan works like an indoor map: drag to move, scroll or pinch to zoom,
switch floors with **R / A / 2 / 1** (buttons or keys) or PageUp / PageDown, search
with *Search this house*, and tick **Blueprint** to see the original drawings. Rooms
hold projects, About and Contact. Inside its window, the House is set in Times New
Roman.

You can also walk through the house:

- **Stairs.** The stairs are drawn on every floor: click *▲ Up* at the top of the
  stairs or *▼ Down* at the bottom to arrive on the stairs of the next floor. The
  roof has a hatch down to the attic.
- **Doors.** The plan draws every door as the drawings do: a gap in the wall, the
  leaf and the quarter circle it swings through (sliding and glass doors as panes,
  openings as a plain gap). The same doors show in a room's furniture plan and in 3D.
- **Next door.** Every room's panel lists the rooms its doors lead to, by the wall the
  door is in (north is the top of the plan), plus the way up or down if you're on the
  stairs. A door onto a corridor or a lobby leads to every room off it.
- **How the floors stack.** All floors share one camera, so changing floors keeps
  the same spot in view. Going up, the old floor sinks away; going down, it rises.
  The floor below shows as dashed lines, and through open-air rooms (terraces,
  balconies, the roof).
- **Where you are.** A small model of the whole house turns slowly beside the floor
  buttons (`src/scripts/house-mini.ts`, plain canvas, no three.js): the floors below
  yours stand whole with their doors, glass and windows, yours is cut open at waist
  height, the floors above are faint. The room you're in is yellow, the part of the
  plan on screen is outlined in blue, and the dot is where you are. Drag it to turn
  it, double-click to face the front; it stands still with reduced motion. Its roof
  and eaves come from `src/lib/house-shell.ts`, shared with the 3D house.

**The house in 3D (test)** (`/house/3d`, `/house/3d?room=<room>`): a rough model
of the same rooms, in the house's own colours (`src/scripts/house3d.ts`), as a guide.
Drag to turn it, scroll or pinch to zoom, use **R / A / 2 / 1** to cut the house away
down to a floor, tick **Lift floors** to pull the storeys apart, and tick
**Blueprint** to lay the original drawing on each floor and check the model against
it. Click a room for its chapter. Rooms, levels, doors, passages and the stair core's
walls come from `house.json`, shared with the plan. Doors have frames and leaves standing
open the way they swing, with the swing marked on the floor; the garage has its car door;
glass and sliding doors are glazed. Each wall is built once, brick outside and white
inside. The rest is traced from the drawings into `src/content/house3d.json`: the living
room's picture window, the stairs (a wooden U round the core from the ground floor to the
first floor, then a straight flight to the attic; none to the roof), the stairwells, and
the garage as a cellar a few steps down from the hall with a small stair up to a narrow
loft. Edit that file to correct a stair. The roof, columns, balustrades and
corner stones are approximations from the south elevation and photos of the house.
Both 3D views (this page and the small turning house on the floorplan) redraw when
Chrome drops and restores their graphics context (a GPU process restart, a driver reset,
sleep, GPU memory running short) and when the device pixel ratio changes (another monitor,
browser zoom). If WebGL doesn't come back, the page says so and offers to draw it again.
To see what a browser reports about its graphics (WebGL / WebGL2, the GPU and ANGLE
backend, limits, canvas sizes, context losses), add `?debug=3d` to `/house/3d` or `/house`.
three.js is loaded only on this page. The page is `noindex` and is not in the sitemap.

### The rules of the house (after Perec)

Like Georges Perec's *Life A User's Manual*, the order is set by a constraint, not
by hand. Every floor sits on the same 5 × 5 structural grid (columns 3600 · 3600 ·
3600 · 3200 · 2000 mm, rows 2800 · 2800 · 3000 · 4800 · 1400 mm). A knight's tour of
that grid, repeated on each floor from the ground up, numbers the rooms: chapter 1
is the first room the knight lands in, and so on (37 chapters). Each room lists an
inventory built only from facts: name, size, floor level, window and door codes,
and what's inside. One room, drawn in the attic with no door, can't be entered.
It's the missing chapter.

**The sequence.** On every floor the knight starts again at A1 and makes the same
25 moves, ending at A3. A move numbers each room it lands in that has no number yet;
when one move lands in several new rooms, they're numbered in the order `house.json`
lists them. Moves that land only in numbered rooms (or outside the floor) add nothing,
and a room the knight never reaches would go last on its floor. As the house is drawn,
the same squares open rooms on each floor: B3 (move 2) the middle of the house, D3
(move 6) the east side, C2 (move 8) the stairs, A3 (move 25) the west bathroom. The *Rules
of the house* page draws this (`src/components/house/KnightSequence.astro`): the tour
on the grid, each floor with its chapter numbers, the reading path and the squares
where the knight first lands, and a table of what every move opens. It's drawn from
`house.json` and the tour at build time, so it follows any change to the rooms. Each
room also keeps the move that entered it (`move` in `src/lib/house.ts`).

### Editing the house: `src/content/house.json`

- Each floor has `rooms`. A room is a rectangle in millimetres `[x, y, width, height]`
  (or a `poly` for L-shaped rooms), traced from the drawings.
- **What's in a room** is its `contents`: `{ "project": "<slug>" }`, or
  `{ "page": "about" | "contact" | "writings" | "colophon" }`. To move a project,
  move its `contents` to another room. Rooms without `contents` are only described.
- `stairs: "<floor id>"` marks the stairs room and where it leads up to. It draws
  the *Up* link there and the *Down* link on that floor.
- `doors` on each floor, traced from the drawings: `at` is `[x0, y0, x1, y1]` along a
  wall; `kind` is `door`, `double`, `opening`, `glass`, `sliding` or `garage`; `code` is
  the label on the drawing (M0922 is 900 mm wide and 2200 mm high, which sets the height
  in 3D); a `door` has a `hinge` (`start` or `end` of `at`) and says which room or passage
  it swings `into`. Door codes and counts in the inventory, "Next door", the plan and the
  3D model all come from this list. The build stops if a door isn't on a wall, opens
  into a locked room, or if a room on a floor can't be reached from its stairs.
- `passages` are floor that is no room (the first floor's lobby, the attic corridor),
  as polygons; `walls` are walls the rooms don't draw (the stair core).
  "Echoing" constraints still count rooms that share a wall.
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

### Two languages: the 中/EN toggle

Every page can be read in English or Chinese, one at a time. The language is
picked automatically: first-time visitors get the first of their browser's
preferred languages that the site has (so a browser set to French, then Chinese,
gets Chinese), and English if neither is listed. The **中 / EN** switch changes it
at any time: two buttons in the taskbar tray next to the clock (always visible,
on phones too).
Once someone uses the switch, their choice is remembered in the browser.

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
- **The computer's own words** are bilingual, in the terms of the Chinese
  edition of Windows 98: window titles, toolbars, the Start menu, desktop icons,
  the log-on screen, Welcome, right-click menus and menu bars, message boxes,
  Properties, the Control Panel, Run, Find, the Image Viewer and Help. Whatever
  is open changes as soon as the switch is pressed. How to add words:
  `docs/DESKTOP.md`, "Two languages".

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

### Paint (画图): drawings sent to the artist

**Paint** (`/paint`, on the desktop and in Start ▸ Programs ▸ Accessories) is a
1998-style paint program for drawing something and sending it to the artist.
It works with a mouse, a finger or a pen: the brush follows a pen's pressure,
the far end of a pen rubs out, a resting palm is ignored, and on a touch screen
two fingers pinch to zoom and drag to scroll. Twelve tools (select, eraser,
fill, pick colour, magnifier, pencil, brush, airbrush, text, line, rectangle,
ellipse), the Windows 98 colour box and Edit Colors dialog, Undo and Redo,
copy and paste, opening a picture to draw on, and flip, rotate, invert and
resize. The window says, in a yellow note that is always in view, where the
picture goes, and *How Sending Works* explains it step by step.

**Sending.** *Send to Xiangyin* shows the picture and asks, all optional, for a
name, an email address (so he can reply) and a note. It posts them to
`/v1/contact/drawing`, handled by `worker/drawing.ts`: the same checks as the
contact form (origin, a per-visitor rate limit kept apart from messages, and
Turnstile with its own action, `kuschonink-drawing`), plus the picture itself,
which must be a complete PNG of at most 2 MB and 2400 pixels a side (Paint
shrinks busier pictures to fit). The email goes to the same inbox through the
`EMAIL` binding, with the drawing shown in the message and attached as a file
(`drawing-<date>-<time>-<name>.png`); replying goes to the visitor when they gave
an address. Nothing is stored on the server. The binding takes the picture as
bytes: given a string it sends text, so a base64 string would arrive as text
instead of a picture (`forBinding()` in `worker/mime.ts`). Local `wrangler dev`
can't simulate binary attachments, so try sending on the live site.

**In the visitor's browser.** The picture being drawn is kept in IndexedDB
(`kus98-paint`), so closing Paint doesn't lose it; File ▸ New clears it. Tool
choices and custom colours are in `localStorage` (`kus98:paint`).

- **Code:** the page is `src/pages/paint.astro`; the program is in
  `src/scripts/paint/` (`app.ts` the window, `doc.ts` the picture and Undo,
  `tools.ts`, `select.ts`, `text.ts`, `fill.ts`, `colors.ts`, `send.ts`,
  `store.ts`); tool and colour lists are in `src/lib/paint.ts`; styles in
  `src/styles/paint.css`. Icons and pointers are drawn in `src/lib/iconset.ts`
  and `src/lib/cursors.ts`.
- **Tests:** `npm test` also runs the drawing handler (`worker/drawing.test.mts`,
  with real PNGs) and the fill (`src/scripts/paint/fill.test.mts`).

### Field Guide (password)

**Field Guide** (导览, `/guides`, on the desktop and in Start ▸ Programs) holds
city guides for friends and groups: a map of recommended places in three tiers,
with a heat map, routes, the days of an event and practical notes. Each guide is
a document inside the program, at `/guides/<slug>` (`\\XIANGYIN\GUIDES\<SLUG>`
in the log-on box). A slug is `<city>-<yyyy>-<mm>` and never changes; the first
is `paris-2026-11`. `/guides/<city>` opens that city's newest listed guide, past
guides stay at their addresses (unlisted), and old addresses named under `moved`
in `access.json` redirect for good (docs/GUIDES.md, section 12). On a computer the window
shows a list, the map and the details side by side; on a phone it shows one at a
time, and tapping a pin raises a details sheet. It works without JavaScript as
one readable page. Wherever a base picture is magnified past 1:1 (the region
round the city plan long before the plan itself), the map shows street-level
tiles from IGN's Plan IGN. The Worker fetches them at
`/guides/<slug>/tiles/{z}/{x}/{y}.png` (zooms 12 to 19), for logged-on viewers
only and only inside the box `access.json` gives under `tiles` (in degrees, at
most 3° each way, containing every base map), so IGN sees the Worker and never
the visitor. Each visitor may fetch at most 600 tiles from IGN a minute.

**Passwords and audiences.** Before the password, a visitor sees only neutral
public titles, in an *Enter Network Password* box: `/guides` goes to the first
listed guide's box, and when more than one guide is listed, its **Guide** list
opens another guide's box in the same window (without JavaScript, links do), so
the password goes to the guide chosen. On a computer the box is a small window
in the middle of the screen; once the password is accepted the same window
shows the guide, maximised (or as the Field Guide was last left), and Log Off
turns it back into the small box. The Worker (`worker/guides.ts`, on `/guides`
and `/guides/*`) checks the password and decides which **audience** it belongs
to. Audiences, and which
guides each may open, are in `src/content/guides/access.json`; each audience's
password is a Cloudflare secret named there (`GUIDES_PASSWORD` for visitors,
`GUIDES_PASSWORD_FOTOFILMIC` for participants), never in the repo. Each needs
6 or more characters and must differ from the other; case, extra spaces and
full-width characters don't matter. Every
guide is built once per audience, and the Worker serves the page for the
visitor's audience, so a visitor's HTML and data never hold what's marked for
someone else. The log-on is a signed `HttpOnly` cookie, `kus98_guides`; pictures
and base maps are served only with it. A server-only key signs it, so nobody
can forge one: the secret `GUIDES_COOKIE_SECRET` (recommended: 32 or more
random characters), or `TURNSTILE_SECRET` when that isn't set (one under 24
characters signs together with `TURNSTILE_SECRET`). Changing
`GUIDES_COOKIE_SECRET` logs everyone out; so does changing `TURNSTILE_SECRET`
unless `GUIDES_COOKIE_SECRET` has 24 or more characters. Generate one with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`;
built-in password generators often give fewer than 24 characters. All these
secrets go under Workers & Pages →
kuschonink → Settings → Variables and Secrets, type Secret, not under
Settings → Build (only the build can see those variables). Without a password set, a guide says it
isn't open yet. Guide pages are `noindex` and not in the sitemap.

**The data.** Each guide is a folder of JSON in `src/content/guides/<slug>/`
(`guide.json`, `items.json`, `places.json`, `events.json`, `routes.json`,
`listings.json`, `map.json`), with its pictures and base maps in
`public/guides/<slug>/img/` and `map/`. Any entry can carry `"audience"` to show
it only to some audiences. The build checks everything (real dates, known ids,
coordinates inside the map, matching times in the Chinese, no unknown fields)
and stops with a list of `file › id › field` problems, so a mistake never
reaches the live site.

**The leak guard.** After the build, `scripts/guides-guard.mjs` reads `dist/`.
Public files (the home, the log-on pages, scripts, `desktop.json`, the sitemap)
must contain nothing from inside a guide, and each audience's view nothing kept
for another; each guide's `sensitive` words in `guide.json` are checked too. A
leak fails the build, and the old version stays live.

How to edit a guide, add one, add an audience or change a password, in Chinese
and English: [`docs/GUIDES.md`](docs/GUIDES.md).

- **Code:** pages in `src/pages/guides/` (`index.astro` is no list: it only names
  the first listed guide for the Worker's redirect, and says there are no guides
  yet when none is listed; `[slug]/locked.astro` for the log-on box and its Guide
  list; `[slug]/views/[audience].astro` for each view); types, rules, checks and
  loading in `src/lib/guides/`; the program and its map in `src/scripts/guide/`
  and `src/components/guide/`; styles in `src/styles/guide*.css`; the gate in
  `worker/guides.ts`.
- **Tests:** `npm test` runs all eleven `*.test.mts` suites, in the order
  `package.json` lists them. The Field Guide's are `src/lib/guides/guides.test.mts`
  (day rules, time zones, audience filtering, the real data, broken copies),
  `worker/guides.test.mts` (the gate: views, cookies, log-on, log-off, tiles) and,
  in `src/scripts/guide/`, `camera.test.mts` (the map's pan and zoom),
  `find.test.mts` (Find, and the distances of Where am I?), `heat.test.mts`,
  `order.test.mts` (Sort by), `pins.test.mts` (how many pins show at each zoom)
  and `tiles.test.mts` (the street-level tiles). The build runs the guard and
  the Worker's tests as well.

### Analytics

Cloudflare Web Analytics is enabled for the kuschonink.com zone with automatic
setup: Cloudflare injects the beacon into every page as it passes through.
There's no code in this repo, and the beacon sets no cookies, so it isn't part
of the Cookies dialog (which covers what the site itself keeps).

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
| `src/pages/paint.astro`, `src/scripts/paint/` | Paint, and sending a drawing to the artist |
| `src/content/guides/` | Field Guide: `access.json` (audiences) and one folder per guide |
| `src/lib/guides/`, `src/scripts/guide/` | Field Guide: data rules and checks; the program in the browser |
| `worker/` | The Worker: the contact form (`contact.ts`), Paint's drawings (`drawing.ts`) and the Field Guide's password gate (`guides.ts`) |
| `src/layouts/Desktop.astro` | Every page: the Xiangyin 98 desktop with the page in a window |
| `src/components/desktop/` | Window, taskbar, Start menu, desktop icons, start-up screens |
| `src/scripts/desktop/` | The desktop shell: windows, menus, sounds, Control Panel… (see [`docs/DESKTOP.md`](docs/DESKTOP.md)) |
| `src/styles/` | `desktop.css`, `system.css`, `schemes.css` (the computer), `doc.css`, `blocks.css`, `house.css`, `explorer.css`, `apps.css`, `paint.css`, `lang.css` (what's in the windows); 98.css is vendored in `src/styles/vendor/` |
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
- **Update a Field Guide** (hours, dates, a closure, a new place): edit its JSON
  in `src/content/guides/<slug>/` on GitHub and commit to `main`. Recipes and
  direct edit links: [`docs/GUIDES.md`](docs/GUIDES.md).

## Deploying to Cloudflare Workers

The site is deployed as a Worker serving static assets (`dist/`).

**Option A: Cloudflare Git integration (recommended).** In the Cloudflare
dashboard go to *Workers & Pages → Create → Import a repository*, choose
`itom123/kuschonink.com`, and set:

- Project name: `kuschonink` (must match `name` in `wrangler.jsonc`)
- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Previews: Worker Previews (*Settings → Builds*), Preview command
  `npx wrangler preview`. Every branch gets its own preview link, with the
  settings in the `previews` block of `wrangler.jsonc` and its own secrets,
  never production's ([`docs/GUIDES.md`](docs/GUIDES.md) section 7).

Every push to `main` then deploys automatically.

**Option B: from your computer.** Run `npx wrangler login` once, then
`npm run deploy`.

**Custom domain.** Once `kuschonink.com` is on Cloudflare, add it under the
Worker's *Settings → Domains & Routes*. Until then the site is available at
`kuschonink.<your-subdomain>.workers.dev`.

### Adding server features later

`worker/index.ts` runs only for the paths listed in `assets.run_worker_first`
(currently `/v1/contact/*`, the contact form and Paint's drawings, and
`/guides` and `/guides/*`, the Field Guide's gate, which also sends `/guides` to
the first listed guide). Everything else is served as static files.
Add a path there and handle it in the Worker to add an API route.

## Migration notes

See [`docs/MIGRATION.md`](docs/MIGRATION.md) for what was moved from Squarespace
and what was intentionally left out.
