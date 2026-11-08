# Xiangyin 98: how the desktop works

The whole site runs as **Xiangyin 98**, a Windows 98-style computer: a desktop,
windows, a taskbar and Start menu, right-click menus, a log-on screen, sounds,
Win98 pointers and the Control Panel. This file is for whoever changes the code.
For visitors, the same things are explained in `/help` (`src/content/help.json`).

Ground rules:

- **Every URL is a real page.** Each page is rendered on the server with its
  content in the HTML, inside one window. Search engines, link previews and
  visitors without JavaScript get the page as a plain document; the shell adds
  the desktop behaviour on top.
- **No Microsoft assets.** No Windows logo or wordmark, no Microsoft sounds or
  bitmaps. Icons and pointers are drawn pixel by pixel in `src/lib/iconset.ts`
  and `src/lib/cursors.ts`, the sounds are synthesised in
  `src/scripts/desktop/sound.ts`, and the system is called "Xiangyin 98".
  [98.css](https://github.com/jdan/98.css) (MIT, vendored in `src/styles/vendor/`)
  draws the basic controls.
- **Everything works with a keyboard, a screen reader, a touch screen and
  "reduce motion".** On a touch screen a double-tap is two taps, never a zoom
  (`touch-action: manipulation` on every element, in `desktop.css`; whatever
  handles touches itself sets its own), and on an iPhone or iPad typing in a
  text box doesn't zoom the page (`textzoom.ts`). Pinching still zooms. A tap
  opens an icon, and a double-tap opens it once: its second tap is dropped,
  even if the window has already opened under the finger (`icons.ts`).

## The pieces

| Path | What it is |
| --- | --- |
| `src/layouts/Desktop.astro` | Every page: desktop icons, the windows layer, taskbar, start-up screens, and the small script that runs before the first paint |
| `src/components/desktop/Window.astro` | One program window (title bar, menus, toolbar, address bar, body, status bar) |
| `src/components/desktop/` | Taskbar, Start menu, desktop icons, start-up and log-on screens |
| `src/lib/apps.ts` | Which program shows which URL, window sizes, what the address bar says |
| `src/lib/desktop.ts` | The desktop icons |
| `src/lib/chrome.ts` | Toolbar buttons and Links bars |
| `src/lib/iconset.ts`, `src/lib/cursors.ts`, `src/lib/pixels.ts` | Icons and pointers, drawn as pixel art (served as `/system/icons.css` and `/system/cursors.css`) |
| `src/pages/desktop.json.ts` | Facts the desktop needs without loading every page: projects, rooms, pages, Help topics, wallpapers, screen saver pictures |
| `src/scripts/desktop/` | The shell (below) |
| `src/styles/desktop.css` | Desktop, windows, taskbar, menus, tooltips |
| `src/styles/doc.css` | Resets 98.css for page content inside windows (`.doc`) |
| `src/styles/system.css` | Start-up, log-on, shut-down, trails, Control Panel, screen savers, Run, Find, Recycle Bin |
| `src/styles/schemes.css` | Colour schemes (Standard, High Contrast White, Slate) |
| `src/lib/guides/` | Field Guide: the shapes of a guide (`types.ts`), day rules, dates and map maths safe for the browser (`core.ts`), the interface's words, the checks, and the server-only loader that builds each audience's view and its browser data |
| `src/scripts/guide/` | Field Guide in the browser: the window, panes, details sheet, menus, the map engine (camera, pins, labels, routes, heat) and the log-on box. It imports only `types.ts`, `core.ts` and `words.ts`, never guide content |
| `worker/guides.ts` | The Field Guide's password gate: the log-on and log-off, the signed cookie, and which audience's page (and pictures) a request gets. It also sends `/guides` to the first listed guide, whose log-on box has the Guide list. It proxies the street-level tiles at `/guides/<slug>/tiles/{z}/{x}/{y}.png` (zooms 12–19, logged-on viewers only, inside the `tiles` box in `access.json`), fetching them from IGN so that IGN never sees the visitor |
| `worker/admin.ts`, `worker/admin-files.ts`, `src/pages/admin/`, `src/scripts/admin/` | Admin mode: the hidden log-on at `/admin` (password and authenticator code, checked on the server), the suggestions queue, editing the site (Notepad, Changes, Upload Picture, New Project; Start ▸ Edit This Page...), admin on the desktop ([`docs/ADMIN.md`](ADMIN.md)) |

### The shell: `src/scripts/desktop/`

| File | Does |
| --- | --- |
| `index.ts` | Starts everything; registers commands; loads the larger programs on first use |
| `wm.ts` | Window manager: focus, stacking, move (outline or full), resize, minimise, maximise, modal dialogs |
| `router.ts` | Opens pages in windows: fetches the page, swaps the window, keeps the browser's address and history in step. A page asked for twice is fetched once; a navigation that's overtaken stops waiting but doesn't cancel the request the newer one waits for |
| `taskbar.ts`, `startmenu.ts`, `tray.ts` | Taskbar buttons, clock, Start menu (Documents ▸ remembers recent pages), volume |
| `menu.ts`, `menubar.ts`, `winmenus.ts`, `contextmenu.ts` | One menu engine for the Start menu, menu bars and right-click menus (press and hold on touch, Shift+F10) |
| `nosave.ts` | The site's pictures can't be saved: no browser menu on a picture, no dragging one out, and Save Picture As... says why (see [Pictures can't be saved](#pictures-cant-be-saved)) |
| `icons.ts` | Icons on the desktop and in folders: select, double-click, drag, rubber band, arrow keys |
| `dialogs.ts`, `properties.ts`, `aboutbox.ts` | Message boxes, dialog windows, Properties sheets |
| `boot.ts`, `session.ts` | Start-up, log-on (everyone is Guest; the name can't be changed), log off, shut down, stand by |
| `sound.ts`, `trails.ts`, `tooltips.ts` | Sounds, pointer trails, yellow tooltips |
| `textzoom.ts` | iPhone and iPad: a text box in use doesn't zoom the page (the desktop's text is under the 16px that sets iOS zooming) |
| `screensaver.ts`, `whatsthis.ts` | Idle timer for the screen saver; What's This? notes |
| `settings.ts` | Visitor settings (Control Panel) |
| `memory.ts` | What the desktop remembers between page loads: each program's window as it was left, the whole desktop for a refresh, and whether the home page opens Welcome |
| `consent.ts`, `cookies.ts` | The visitor's choice about cookies and storage, which every write asks first; the Cookies dialog and the Information Bar that ask for it (see [Cookies](#cookies-the-visitors-choice)) |
| `api.ts` | `window.kus98`, what page content may ask of the desktop |
| `apps/` | Programs without a page of their own: Control Panel (Mouse, Sounds), Display Properties and Folder Options, My Computer, Recycle Bin, Run, Find, Image Viewer, screen savers |

Paint (`/paint`) is a program with a page, but its code lives apart, in
`src/scripts/paint/`: it is page content (see below) and only talks to the
shell through `window.kus98`. The Field Guide (`/guides`) works the same way,
from `src/scripts/guide/`.

## The window contract

`Window.astro` renders the markup the shell relies on:

- `section[data-window][data-app][data-url][data-state]`: the window. `data-app`
  is one of the programs in `src/lib/apps.ts`; there is one window per program.
- `[data-window-inner]`: everything under the title bar. When a window opens
  another page, this part is replaced with the new page's.
- `[data-window-body]`: the scrolling content area.
- `[data-keep="name"]`: a node carried over when the window changes page, so it
  isn't rebuilt (the house map).
- `[data-cmd="…"]` buttons: `minimize`, `maximize`, `close`, `back`, `forward`,
  `up`, `home`, `refresh`, `stop`, plus any registered command.
- `[data-fit="dialog"]` (`Window`'s `fit="dialog"`): the page is a dialog box
  in its program's window, the Field Guide's log-on box. On a computer the
  window opens in the middle, `w` wide and as tall as what it holds, whatever
  the program's remembered place or "Always maximize windows" say. It can't be
  sized or maximised (`no-resize`, Maximize greyed out) and nothing remembers
  its place. When the window moves on to a page without it (logging on), it
  takes the program's remembered place, or else opens as that page does
  (maximised, for the Field Guide); back to one with it (Log Off), it is the
  small box in the middle again (`wm.swap`). On a phone it fills the screen like
  every window. Its CSS is in `guide-logon.css`.
- **Full Screen (the Field Guide, a phone held sideways).** On a landscape
  phone (`pointer: coarse`, at most 480px tall) the Field Guide's window drops
  its title bar: its buttons end the menu bar, as a maximised document's do,
  the toolbar becomes a column on the left and the status bar is for screen
  readers only. While the guide (not its log-on box) is the active window, the
  taskbar gives way (`--taskbar-h: 0`), as Internet Explorer's Full Screen did;
  minimising the guide, or another window in front, brings it back. The CSS is
  at the end of `guide.css`; `app.ts` adds a 中/EN switch and the Today note to
  the window's frame for it.

Without JavaScript, the window is an ordinary page: the close button links to
`/`, and minimise and maximise are hidden.

## Rules for page content scripts

Page scripts (the house map, galleries, the contact form, the Projects folder)
may run more than once, and their page may sit in a window next to others:

1. **Initialise idempotently.** Mark what's done with `data-ready`, and call the
   init at the top level and on `astro:page-load` (fired after each page opens
   in a window).
2. **Stay inside your window.** Find elements from your root
   (`root.closest('[data-window]')`), never with page-wide IDs that another
   window could also have.
3. **Clean up.** Listeners on `document` or `window` are removed on the
   window's `desktop:close` event (an `AbortController` is easiest).
4. **Size from the container**, not `window.innerWidth`: windows can be any
   size. Use a `ResizeObserver` or container queries (`house.css` does).
5. **Ask the desktop through `window.kus98`**, and check it exists, so the page
   still works on its own.
6. **Using the right button yourself?** Call `preventDefault()` on the
   `contextmenu` event (Paint paints with the right button); the desktop's
   right-click menu then leaves it alone.
7. **Showing a picture the visitor may keep** (their own drawing or upload)?
   Put it inside `[data-savable]`, as Paint does. Every other picture can't
   be saved (see [Pictures can't be saved](#pictures-cant-be-saved)).

### `window.kus98`

| Call | Does |
| --- | --- |
| `alert({ title, text, icon, buttons, owner })` | A message box; resolves with the button pressed |
| `dialog({ title, body, owner, … })` | A dialog window; returns `{ el, close }` |
| `open(url, { reload? })` | Open a site page in its window. With `reload: true` it fetches the page afresh into the same window and replaces the history entry (the Field Guide's log-on and log-off use it) |
| `close(el)` | Close the window holding `el` |
| `replaceUrl(el, url)` | Keep the window's address in step (map pans) |
| `play(name)` | A system sound (`ding`, `chord`, `exclamation`…) |
| `settings` | `get()`, `set(patch)`, `on(listener)` |
| `bindIcons(list)` | Give a list of `.icon` elements folder behaviour |
| `menus(el, provider)` | The window's own menu bar: `provider(name)` gets `"file"`, `"edit"`… each time a menu opens and returns its items (`MenuSpec[]`), or null for the standard ones. Paint uses it for File, Edit, View, Image, Colors and Help |
| `consent` | The visitor's choice about cookies and storage: `level()` (`'all'`, `'necessary'`, `'none'`, or null before any choice), `allows(kind)` before writing (`'cookie'`, `'tab'` for sessionStorage, `'lasting'` for localStorage and IndexedDB), `ask(feature)` before something that must have a cookie (resolves true once it may go ahead), `show()` for the Cookies dialog |

### Events

| Event | On | When |
| --- | --- | --- |
| `desktop:content` | the window | Its page is ready (`detail.initial` on first load, `detail.same` when only the query changed) |
| `desktop:close` | the window | It's closing |
| `desktop:resize` | the window | Minimised, maximised or restored |
| `desktop:navigate` | `document` | A window opened a page (`detail`: url, app, title, icon) |
| `desktop:login` | `document` | Someone logged on |
| `consent:change` | `document` | The choice about cookies changed, here or in another tab (`detail.level`; `detail.again`: what the page shows is to be kept again, `keepAgain()` in `consent.ts`) |
| `astro:page-load` | `document` | After each page opens (so existing component inits run) |
| `wm:change`, `start:open`, `icons:select`, `bin:change` | | Window, Start menu, selection and Recycle Bin changes |

## Pictures can't be saved

The photographs and drawings are the artist's, protected by copyright:
visitors can look at them but not keep them. `src/scripts/desktop/nosave.ts`
and one rule in `desktop.css` see to it, on every page.

- **No browser menu on a picture** (`img`, `canvas`, SVG `image`). A
  right-click still gets the desktop's own menu. Shift+right-click, and
  pressing and holding on a phone, get nothing: `nosave.ts` listens last (on
  `window`, after the desktop and page scripts) and turns down the browser's
  menu. On an iPhone or iPad the CSS stops the press-and-hold callout.
- **No dragging a picture out**, nor a link holding one (`dragstart`, and
  `-webkit-user-drag` in the CSS). Selecting a page leaves the pictures out.
- **Save Picture As...** in a photograph's menu and **Save** in the Image
  Viewer stay, but say "This picture is protected by copyright and can't be
  saved." (`savePicture()`). Copy Shortcut, which copied the file's address,
  is gone from the photograph's menu.
- **Left alone:** admin mode (`html[data-admin]`: everything as before, Copy
  Shortcut included), and anything inside `[data-savable]`, the visitor's own
  pictures: Paint (File ▸ Save, Copy, painting with the right button), its
  Send preview, and the picture in Suggest a Place.
- **What it can't stop:** Firefox always opens its own menu on
  Shift+right-click. Without JavaScript only the CSS works. Screenshots,
  printing, the page source and the browser's developer tools still reach
  the pictures, which are public files under `/_astro/`.

## Two languages (the 中/EN switch)

The site carries English and Chinese side by side; `<html data-lang>` picks
which one shows (`src/styles/lang.css`, `src/scripts/lang.ts`, words in
`src/lib/i18n.ts`). The switch is in the taskbar tray (and, while the Field
Guide is Full Screen on a landscape phone, in its window: any `[data-lang-toggle]`
button works). The desktop follows it:

- **In Astro**, wrap text in `<Bi t={{ en, zh }} />`, and translatable
  attributes in `attr('title' | 'aria-label' | …, { en, zh })`. `Window.astro`
  takes `title` and `status` as `{ en, zh }`; toolbar buttons and Links (`Tool`,
  `QuickLink`), Start menu items (`MenuItem.zh`, e.g. `'程序(&P)'`) and desktop
  icons (`DeskIcon.zh`, `tipZh`) have a `zh` field.
- **In the shell**, text is a `Text`: a string, or `{ en, zh }` (`util.ts`).
  `h()` takes it anywhere a string goes and keeps both languages, so whatever
  is open changes the moment the switch is pressed:
  - as a child, it becomes two `data-l` spans (inside `<option>` and
    `<textarea>`, the language showing plus `data-text-en` / `-zh`);
  - as `title`, `aria-label`, `placeholder`, `alt` or `value`, the language
    showing plus `data-<attr>-en` / `-zh`, swapped by `lang.ts` (and by
    `util.ts` for `value`);
  - as `data-tip`, `data-help` or `data-type`, English plus `data-tip-zh` etc.,
    read when the tooltip, What's This? note or Properties sheet opens.
  `setText(el, text)` replaces what an element says. `tr(text)` picks one
  language now (for things that are gone in a moment, like a tooltip), and
  `shownText(el)` reads an element in the language showing.
- Shared words (OK 确定, Cancel 取消, Yes 是…) and counts (`objects(n)`,
  `images(n)`, `filesFound(n)`…) are in `words.ts`. Menus built in the browser
  take `zh` beside `label`, with the English access key: `{ label: 'P&roperties',
  zh: '属性(&R)' }`. `msgbox()` shows its buttons translated but still answers
  with the English name (`'Yes'`, `'Retry'`…), and buttons carry `data-btn`.
- `/desktop.json` has the Chinese names the programs need (`titleZh`,
  `floorZh`, `typeZh`, `keywordsZh`…). Run and Find match names in either
  language; Find shows its results in the language showing.
- Window titles keep both languages (the taskbar and Start ▸ Documents copy
  them), and the browser tab's title comes from each page's `title-en` /
  `title-zh` metas.
- Help topics (`src/content/help.json`) have `titleZh`, `keywordsZh` and
  `htmlZh`; the Index is listed once per language, and Search finds words in
  either.
- What stays English: the BIOS lines at start-up (as on a real machine), the
  name Guest, and content that has no Chinese yet.

## State

Kept in this browser only, and only as far as the visitor allows (see
[Cookies](#cookies-the-visitors-choice) below). Each key is of one kind:
**needed** (a cookie that a feature the visitor asks for can't work without),
**this tab** (`sessionStorage`, gone when the tab closes), **lasting**
(`localStorage` and IndexedDB), or **the choice** itself.

| Where | Key | Kind | Holds |
| --- | --- | --- | --- |
| Cookie (30 min, renewed) | `kus98_session` | Needed | Logged on (so new tabs and refreshes skip the start-up). Every open page renews it each minute and as it goes; 30 minutes (`AWAY_MINUTES` in `session.ts`) after the last page of the site was open it runs out, and the next visit starts up again, BIOS and log-on included. A visit that starts at `/guides/…` sets it too. Always `Guest` |
| Cookie (`HttpOnly`, `Secure`) | `__Host-kus98_admin` | Needed | Admin mode: a random session id; the session is on the server (the Guard). 12 hours. Set and read only by `worker/admin.ts` |
| Cookie | `kus98_admin_ui` | Needed | Admin mode is on: tells the desktop to load the admin scripts (`html[data-admin]`). Grants nothing; the server checks every admin call |
| Cookie (`HttpOnly`, `Path=/guides`) | `kus98_guides` | Needed | Field Guide: logged on with a guide password, and as which audience. Set and read only by the Worker (`worker/guides.ts`), signed with `GUIDES_COOKIE_SECRET` (or `TURNSTILE_SECRET` when that isn't set; a secret under 24 characters signs together with `TURNSTILE_SECRET`): 30 days with *Save this password*, otherwise until the browser closes (12 hours at most). File ▸ Log Off clears it |
| `localStorage` | `kus98:consent` | The choice | The visitor's choice about cookies (`consent.ts`): `{v: 1, level, at}`, with `level` `all`, `necessary` or `none` and `at` when it was made. Always written |
|  | `kus98:settings` | Lasting | Settings that differ from the defaults (see `settings.ts`) |
|  | `kus98:icons` | Lasting | Where desktop icons were dragged |
|  | `kus98:bin` | Lasting | Icons in the Recycle Bin (`gone` once emptied) |
|  | `kus98:recent` | Lasting | Start ▸ Documents |
|  | `kus98:run` | Lasting | What was typed in Run |
|  | `kus98:paint` | Lasting | Paint: the tool in hand, colours, custom colours, tool options |
|  | `kus98:windows` | Lasting | Each program's window as it was last left: place and size, maximised, the bars hidden with View ▸ Toolbars and Status Bar. Not written while the window shows a dialog-sized page (`data-fit="dialog"`) |
|  | `kus98:guide` | Lasting | Field Guide: heat map and labels on or off, how the Places table is sorted (`{heat, labels, sort}`). Log Off clears it |
|  | `lang` | Lasting | The language chosen with the 中/EN switch |
| IndexedDB | `kus98-paint` | Lasting | Paint: the picture being drawn (a PNG), until File ▸ New |
| `sessionStorage` | `kus98:begun` | This tab | The "Click here to begin" hint was used |
|  | `kus98:desk` | This tab | For a refresh: the pages open in windows, front to back, minimised or not, how far each was scrolled, each one's Back and Forward |
|  | `kus98:draft` | This tab | Contact: a message not sent yet (cleared once it's sent) |
|  | `kus98:guide:view` | This tab | Field Guide: for a refresh, which guide was open, the map's camera and area, and how far the pane was scrolled (`{guide, cam, area, scroll}`). Log Off clears it |
|  | `kus98:guide:suggest:<slug>` | This tab | Field Guide: a suggestion being written in Suggest a Place (what was typed, not the picture), so a refresh doesn't lose it; cleared once it's sent |
|  | `kus98:admin:draft:<path>` | This tab | Admin mode's Notepad: the text of a content file, not saved yet. Cleared once it is saved |

**What a refresh keeps.** Reloading the page (or a phone reloading a tab it put
to sleep) brings the desktop back as it was: `memory.ts` writes `kus98:desk`
whenever windows change and when the page is hidden or left, and after the next
load reopens those pages in their windows (quietly: no caption animation, no
sound, no error box if a page has gone, and Start ▸ Documents is left as it
was). Only a reload or Back/Forward does this: typing the address again, a
link from elsewhere, a new tab, or start-up and log-on in a new browser session
starts afresh with the page asked for.
A program's window opens where it was last left (`kus98:windows`), as Windows 98
does for folders; dialog boxes, and dialog-sized pages such as the Field
Guide's log-on box, always open in the middle, and on a phone every window
fills the screen anyway. A refresh keeps no place for a dialog-sized page
either: it comes back in the middle, or, if the page is the guide by then
(logged on in another tab), where the Field Guide was last left.

**Welcome.** "Show this screen each time Xiangyin 98 starts" decides at
log-on (`boot.ts`) and at every load of the home page: unticked, `/` shows the
desktop without Welcome; ticked, a refresh shows Welcome only if it was open
before (closing every window and reloading leaves the desktop empty).

The script at the top of `Desktop.astro` reads settings, icon places, window
places (a style, `#k98-early-windows`, that `memory.ts` removes once the window
is placed) and the Recycle Bin before the first paint and sets these on `<html>`, so nothing
jumps: `class="js"`, `data-scheme`, `data-pointers`, `data-click`,
`data-maxall`, `data-boot` (start-up screens), `data-nowelcome` (the home page
without Welcome; `memory.ts` closes it and removes the attribute), `--wallpaper`. While the shell
runs it also sets `data-busy` (hourglass), `data-dragging`, `data-help-mode`
and `data-saver`.

Start-up and log-on never show to search engines or link previews
(`navigator.webdriver` and bot user agents; the head script marks them with
`data-robot` on `<html>`), or on a visit that starts at `/guides/…` (with the
visitor's leave for cookies it sets `kus98_session` to Guest, so the rest of
the session skips them too). Away from the site for more
than 30 minutes (every tab of it closed), the computer counts as switched off:
the next visit starts up and logs on again. A safety net removes the start-up
screen after 10 seconds if the shell fails to load.

### Cookies: the visitor's choice

Nothing in the table above is written without the visitor's leave, except the
choice itself. `consent.ts` keeps it; `cookies.ts` asks for it.

| Choice | Cookies | This tab | Lasting |
| --- | --- | --- | --- |
| **Allow All** (`all`) | Yes | Yes | Yes |
| **Necessary Only** (`necessary`) | Yes | Yes | No |
| **None** (`none`) | No | No | No |
| Not chosen yet | No | No | No |

**Asking.** The Cookies dialog (*Cookies on Xiangyin 98*, a message box with
Allow All, Necessary Only and None) opens once a page until a choice is made:
when the desktop is ready after start-up and log-on (`desktop:login`), or at
once when they don't show (a guide's link). It lists what needs a cookie and
what can do without, and what happens without each. Esc or the close box
decides nothing, so it opens again on the next page load; until then the
start-up comes back on every load, as it says. Start ▸ Settings ▸ Cookies...
opens it again to change the choice, with the current choice as the default
button. Bots and link previews (`data-robot`) never see it, and nor does a
browser that blocks site data (`consent.lasts()` is false: no answer could be
kept, so it would ask on every page).

**Asking again.** After that first time, something that must have a cookie
asks with the **Information Bar**, pale yellow across the top of the screen as
in Internet Explorer, announced through `#k98-announcer`. The desktop and the
windows move down below it while it shows (`--infobar-h`), so it hides nothing,
not even a full-size window's title bar on a phone. Page content calls
`window.kus98.consent.ask(feature)`, which resolves true once it may go ahead:
the Field Guide's log-on box (`logon.ts`) does so before it posts the password,
and the post waits; after **Allow** (which chooses Necessary Only, or keeps
Allow All) it goes ahead with the password still in the box, and after × or
Esc it doesn't. The hidden admin log-on (`src/scripts/admin/home.ts`) asks the
same way with `ask('admin')`, which shows the bar's general wording, so nothing
public names admin mode. Only a feature being used asks again: a start-up under None
doesn't show the bar on its own. For bots `ask()` answers true at once, as
without JavaScript.

**Writing.** Every write asks `consent.allows('cookie' | 'tab' | 'lasting')`
first: `stored()` in `util.ts` (a value set without leave stays in memory for
the page and is written once Allow All is chosen), `session.ts`, `memory.ts`,
`boot.ts` and the head script in `Desktop.astro` (which reads `kus98:consent`
itself). Page content asks through `window.kus98.consent` and writes when
there's no desktop: Field Guide's `writeStore()`, the Contact draft, Paint's
`store.ts` and tools, `lang.ts`, and admin mode's Notepad draft (`keepDraft()`
in `src/scripts/admin/editor.ts`, This tab). When Allow All is chosen in a page after
Necessary Only or None (`keepAgain()` in `consent.ts`), `stored()`, the
language and Paint's tools are written again as the page
shows them, since that choice removed them; another tab writes only what was
set there meanwhile. Paint's picture is kept at the next change or when the
page is left; Field Guide's preferences at their next change.

**Clearing.** Choosing removes at once what the choice doesn't allow, and only
the site's own: `kus98:…` (except `kus98:consent`) and `lang` in `localStorage`,
the `kus98-paint` database, and with None the `kus98:…` keys in
`sessionStorage` and the `kus98_session` cookie. Other keys on the origin are
never touched (on `localhost` other projects share it). At load, leftovers the
choice doesn't allow go too, and a choice made in another tab is followed
there (the `storage` event). `kus98_guides` is `HttpOnly`: only the guide's
File ▸ Log Off removes it, so None doesn't log anyone out of a guide. Nor out of
admin mode: its two cookies (`__Host-kus98_admin`, `HttpOnly`, and
`kus98_admin_ui`) stay until Start ▸ Log Off or Log Off at `/admin`, or until
the 12 hours run out.

**Without JavaScript** nothing is asked: posting the log-on form is itself the
request for the guide's cookie.

**Not covered:** Cloudflare's own pieces, the anti-spam check on Contact,
Paint's Send to Xiangyin and the Field Guide's Suggest a Place (Turnstile, in
its own frame) and the analytics beacon (README, *Analytics*).

**Keeping something new.** Decide its kind, ask `consent.allows()` (or use
`stored()`), start its key with `kus98:` so a stricter choice removes it, write
a lasting value again on `consent:change` with `detail.again` (`stored()` does
this itself), and add it to the table above and to the dialog's lists in
`cookies.ts`.

**Trying it.** Remove `kus98:consent` from `localStorage` and reload to be
asked again. Automated browsers count as bots (`navigator.webdriver`): there
Start ▸ Settings ▸ Cookies... still opens the dialog, but nothing asks by itself.

## How to…

**Add a program with a page.** Add its id to `AppId` and `APPS` in
`src/lib/apps.ts` and teach `appFor()` its URLs. Write the page as
`<Desktop seo={…}><Window app="…" title="…">…</Window></Desktop>`.

A program can bring its own menu bar: list the menus in `Window`'s `menus`
prop (`['&File', '&Edit', '&Image']`, with Chinese names in `MENU_ZH` in
`src/lib/menus.ts`) and fill them with `window.kus98.menus(el, provider)`.
Toolbar buttons with `data-cmd="<name>-…"` that no shell command handles are
the page's own: listen for clicks on its window (Paint and Help do).

**Add a program without a page** (like the Recycle Bin). Write it in
`src/scripts/desktop/apps/`, using `appWindow()` (`appwindow.ts`) for a window
or `openDialog()` (`dialogs.ts`) for a dialog, and register a command for it in
`index.ts`. Large programs are loaded with `import()` the first time they open.

**Add a desktop icon.** Add it to `DESK_ICONS` in `src/lib/desktop.ts`: `href`
for a page, or `open` with a command name. `fixed: true` stops it being deleted.

**Add an icon picture.** Draw it in `src/lib/iconset.ts` (16 or 32 px, using
the `PALETTE` letters). It becomes the class `ico-<name>`.

**Add a Start menu item.** Edit `items` in
`src/components/desktop/StartMenu.astro`. Prefer `href` (it works without
JavaScript); items with `cmd` need `jsOnly: true`. `&` marks the access key.

**Add a setting.** Add it to `Settings` and `DEFAULTS` in `settings.ts`. If CSS
needs it, reflect it on `<html>` in `apply()` and in the script in
`Desktop.astro`. Add the control to a property sheet with the helpers in
`apps/propsheet.ts`, and give it a `help` text for What's This?.

**Put a program behind a password** (as the Field Guide does). The public URL
stays one page, and the Worker decides what it holds. Add the path to
`assets.run_worker_first` in `wrangler.jsonc` and route it in `worker/index.ts`
to a handler with injected services, like `worker/guides.ts`. Build every
locked version as its own page under a path the Worker serves only internally
(`views/<audience>`), plus a neutral log-on page; both use the same `Window`
props (app, variant, url, title, icon), so unlocking swaps the window in place.
Give the log-on page `fit="dialog"` and the box's width (`w`): until the
password is accepted it is a small window in the middle, the locked page then
fills the window as the program's own pages do, and Log Off brings the box back.
Send both with `Cache-Control: private, no-store` and `Vary: Cookie`: the
router never caches such a page, so a log-on or log-off is never hidden by a
copy it fetched before. The log-on form posts without JavaScript (a 303 back to
the page) and with it (`fetch`, then `kus98.open(url, { reload: true })`).
Keep the passwords, and the key that signs the cookie, Cloudflare secrets;
keep anything private out of browser scripts and public pages, and let a
build-time check (like
`scripts/guides-guard.mjs`) read `dist/` and fail the build on a leak.

**Add a Help topic.** Add it to `src/content/help.json` (id, title, icon,
keywords, html). It appears in Contents, Index and Search, and in Find.

**Add a sound.** Write a recipe in `RECIPES` in `sound.ts` (Web Audio, no
recordings) and add it to the Sounds list in `apps/controlpanel.ts`.

## Checking a change

```bash
npm run build
npx astro check
npm test
```

Then try it in the browser (`npm run preview`), including at phone width, with
the keyboard only, and with JavaScript turned off.

`npm run preview` runs the built site on the local Workers runtime, so the
Field Guide's gate works there too. Give it made-up passwords in `.dev.vars`
at the top of the repo (it's gitignored; never put real ones there):

```ini
GUIDES_PASSWORD=made-up-visitor-pass
GUIDES_PASSWORD_FOTOFILMIC=made-up-participant-pass
GUIDES_COOKIE_SECRET=made-up-key-of-32-or-more-characters
```

Then open `/guides/<slug>` and log on with each, to see both views. Without
`.dev.vars` the guides say they aren't open yet.
