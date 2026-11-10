# Field Guide (导览): the owner's manual

每一节先写中文，再写英文。Every section is in Chinese first, then English.

链接直接打开 `main` 分支上的编辑页面。The links open the edit page on `main`
directly.

- [1. 导览是什么 What Field Guide is](#1-导览是什么-what-field-guide-is)
- [2. 文件在哪里 Where things are](#2-文件在哪里-where-things-are)
- [3. 最快的改法 The quickest edit](#3-最快的改法-the-quickest-edit)
- [4. 常见修改 Recipes](#4-常见修改-recipes)
- [5. 新建一份导览 Adding a new guide](#5-新建一份导览-adding-a-new-guide)
- [6. 新增一类读者 Adding an audience](#6-新增一类读者-adding-an-audience)
- [7. 密码 Passwords](#7-密码-passwords)
- [8. 构建失败时 When the build fails](#8-构建失败时-when-the-build-fails)
- [9. 让云端 Claude Code 来改 Asking cloud Claude Code](#9-让云端-claude-code-来改-asking-cloud-claude-code)
- [10. 字段说明 Field reference](#10-字段说明-field-reference)
- [11. 读者推荐 Suggestions](#11-读者推荐-suggestions)
- [12. 地址与存档 Addresses and the archive](#12-地址与存档-addresses-and-the-archive)
- [13. 吃饭、看展、看摄影：餐厅导览 Eating, exhibitions, photography: the restaurant guide](#13-吃饭看展看摄影餐厅导览-eating-exhibitions-photography-the-restaurant-guide)

---

## 1. 导览是什么 What Field Guide is

**导览（Field Guide）** 是 Xiangyin 98 桌面上的一个程序，用来放有密码保护的城市导览：
一张地图、推荐地点（分 A、B、C 三级）、路线、日程和说明文字。地址是
`kuschonink.com/guides/<名字>`，名字写作 `<城市>-<年>-<月>`，第一份是 `paris-2026-11`。
`kuschonink.com/guides/paris` 总是打开最新列出的巴黎导览；过去的导览留在原来的地址（第 12 节）。

- 没有密码时，只能看到程序名“导览”和每份导览的中性标题，看不到任何地点或日程。
- 没有选导览的中间页。从桌面图标、“开始 ▸ 程序 ▸ 导览”、“运行”或“查找”打开“导览”，
  或者直接输入 `kuschonink.com/guides`（有没有 JavaScript 都一样），都会直接进入第一份列出的导览
  （`guide.json` 里 `"listed": true`，按 `access.json` 里的顺序）：没登录时是密码对话框，已登录就是导览本身。
  有不止一份导览时，在密码对话框里选择要看哪一份：上方的选项卡先选“吃饭的地方”“看展览”还是“看摄影”（第 13 节），再在“导览”框里选。一份都没列出时，`/guides` 只显示“这里还没有导览”。
- 输入密码后，服务器（Cloudflare Worker）决定你属于哪一类读者（audience），给你那一类读者的版本。
  “访客”（visitor）看到公开内容；“学员”（fotofilmic）看到访客的全部内容，另加只给学员的内容。
- 导览页面不进搜索引擎（`noindex`，不在 sitemap 里）。
- 内容全部是仓库里的 JSON 文件。改了 `main` 上的文件，大约一分钟后网站就更新。
  数据有错时构建会失败，网站保持原样，不会坏掉。
- **地点的排序**：地点列表上方的“排序方式”默认是“推荐”（A、B、C 级依次排，同级按编号）。另外还有“名称”、“区域”（按导览里片区的顺序）、“当天开放的优先”（先在“日期”框里选定一天）和“离我最近”（先按“我在哪里？”）。选了别的排序后会出现“默认”按钮，单击即可恢复推荐顺序。“查看 ▸ 排序方式”菜单里是同样几种排序。排序只调整每一组之内的次序（参考点、当天闭馆的地点和官方条目各自是一组）。选择会记在这台设备上，“离我最近”除外。
- **我在哪里？**：只有按下按钮时，浏览器才会询问位置。之后地图上会出现一个红色的圆点，并显示“实时位置”标签，旁边有“停止”按钮。再按一次按钮、单击“停止”，或者刷新页面、注销、关闭窗口，都会关掉它；刷新之后它是关着的。最小化导览时，红点和它的“心跳”一起隐藏，还原后接着显示。位置只留在设备上，从不发送出去。浏览器不允许时，导览会说明怎样开启。
- **街道地图**：底图被放大到超过原图大小的地方（城区底图周围的大区底图会最先被放大），街道级的地图瓦片由 Worker 从 IGN（Plan IGN）代为取得，地址是 `/guides/<名字>/tiles/{z}/{x}/{y}.png`，缩放级别 12 至 19，只给已登录的读者。城区底图放不满窗口时（比如竖着拿的平板），四周会补上大区底图和它的瓦片，不会露出灰色。范围由 `access.json` 的 `tiles` 决定（见第 10 节）。IGN 只看到 Worker，看不到访客。每位访客每分钟从 IGN 取图最多 600 块（已在缓存里的不算），超出的瓦片返回 429。
- **地图手势**：在手机和平板上，地图的手势和地图应用（Google 地图、苹果地图）一样：一根手指拖动移动地图，快速一划地图会继续滑行；两根手指捏合缩放；轻点两下放大；轻点两下后按住，向下滑动放大、向上滑动缩小；两根手指同时轻点一下缩小。地图上的文字不会被选中，长按也不会弹出菜单。用鼠标时，双击放大，按住 Shift 键双击缩小，滚轮缩放。代码在 `src/scripts/guide/gestures.ts`。
- **横屏**：手机横过来时，导览铺满整个屏幕（像 Internet Explorer 的“全屏”）：任务栏让开（最小化导览就会回来），标题栏的按钮移到菜单栏右端，旁边是中文/EN 切换和“今天”提示（轻点提示打开日期）；工具栏立在左边，状态栏只留给读屏软件。地图因此有原来两倍多的高度。密码对话框也一样，只是保留任务栏，标题和密码框左右并排。CSS 在 `src/styles/guide.css` 最后。

**Field Guide (导览)** is a program on the Xiangyin 98 desktop for city guides
behind a password: a map, recommended places in three tiers (A, B, C), routes,
dates and texts. A guide lives at `kuschonink.com/guides/<slug>`, where the
slug is `<city>-<yyyy>-<mm>`; the first is `paris-2026-11`.
`kuschonink.com/guides/paris` always opens the newest listed Paris guide, and
past guides stay at their own addresses (section 12).

- Without a password, people see only the program's name and each guide's
  neutral public title. No places, no dates.
- There is no page for choosing a guide. The desktop icon, Start ▸ Programs ▸
  Field Guide, Run, Find and typing `kuschonink.com/guides` (with or
  without JavaScript) all go straight to the first listed guide
  (`"listed": true` in `guide.json`, in `access.json` order): its password box,
  or the guide itself once logged on. With more than one guide, people choose
  theirs in the password box: its tabs first ask what they want to see (Places
  to eat, Exhibitions, Photography: section 13), then the Guide box. With none
  listed, `/guides` only says there are no guides yet.
- With a password, the server (the Cloudflare Worker) works out which
  **audience** the visitor belongs to and serves that audience's version.
  Visitors (`visitor`) see the public content. Participants (`fotofilmic`) see
  everything visitors see, plus what is marked for them.
- Guide pages are `noindex` and left out of the sitemap.
- Everything is JSON in this repo. A change on `main` is live in about a
  minute. If the data has a mistake, the build fails and the site stays as it
  was.
- **Sorting the places.** The Places list has a **Sort by** box above it.
  **Recommended** (the default) lists the A places, then B and C, each in number
  order; **Name** sorts by name; **Area** follows the guide's own order of areas;
  **Open that day first** needs a day chosen in the **When** box; **Nearest
  first** needs **Where am I?**. Once another order is in use, a **Default**
  button goes back to Recommended. **View ▸ Sort By** has the same orders.
  Sorting only changes the order inside each group (reference points, places
  closed that day and official entries each stay together), and the choice is
  remembered on this device, except Nearest first.
- **Where am I?** The browser asks for your position only when you press the
  button. A red dot then follows you on the map, with a **Live location** chip
  that has a **Stop** button. Pressing the button again, pressing **Stop**, or a
  refresh, log off or closed window turns it off, and it stays off after a
  refresh. While the guide is minimised, the dot and its heartbeat are hidden
  with it; restoring the guide brings them back. Your position stays on your
  device and is never sent anywhere. If the browser refuses, the guide says how
  to allow it.
- **Street-level tiles.** Wherever a base picture is magnified past 1:1 (the
  region round the city plan first), street tiles from Plan IGN take over.
  Where the city plan doesn't fill the window (a tablet held upright, say),
  the region and its tiles fill the rest, so no grey shows. The Worker fetches
  them at `/guides/<slug>/tiles/{z}/{x}/{y}.png` for zooms 12 to 19, only for logged-on
  viewers and only inside the box that `access.json` gives under `tiles`
  (section 10). IGN sees the Worker, never the visitor. Each visitor may fetch at
  most 600 tiles from IGN a minute (cached tiles don't count); beyond that a tile
  answers 429.
- **Map gestures.** On a phone or tablet the map answers the gestures of a maps
  app (Google Maps, Apple Maps): drag with one finger to move it, and a flick
  sends it gliding on; pinch to zoom; double-tap to zoom in; double-tap and hold,
  then slide down to zoom in or up to zoom out; tap with two fingers to zoom out.
  Nothing on the map selects as text, and pressing and holding opens no menu.
  With a mouse, double-click zooms in, Shift and double-click zooms out, and the
  wheel zooms. The code is `src/scripts/guide/gestures.ts`.
- **A phone held sideways.** The guide fills the whole screen, as Internet
  Explorer's Full Screen did: the taskbar steps aside (minimise the guide to
  get it back), the title bar's buttons end the menu bar beside a 中/EN switch
  and the Today note (tap it for Days), the toolbar stands on the left and the
  status bar is left to screen readers. The map gets more than twice the height
  it had. The password box gets the same frame but keeps the taskbar, with its
  title beside the form. The CSS ends `src/styles/guide.css`.

---

## 2. 文件在哪里 Where things are

```
src/content/guides/
  access.json                    谁能打开哪份导览 who may open which guide
  paris-2026-11/         一份导览一个文件夹 one folder per guide
    guide.json                   标题、日期、假日、分级、主题、片区、说明文字 title, dates, holidays, tiers, themes, zones, texts
    items.json                   推荐地点 the recommended places
    places.json                  参考点（字母牌）reference points (letter plates)
    events.json                  日程和每日安排 events and day plans
    routes.json                  路线 routes
    listings.json                官方来源的次要条目 secondary records from an official source
    map.json                     底图 base maps
    README.md                    速查表 a cheat-sheet
  paris-restaurants/             餐厅导览（长期，没有日期；第 13 节）the restaurant guide (long-term, no dates; section 13)
public/guides/paris-2026-11/
  img/                           图片 pictures
  map/                           底图图片 base-map images
scripts/google-list.mjs          从共享的 Google 地图列表读出草稿（第 13 节）a draft from a shared Google Maps list (section 13)
```

- 文件夹名就是网址里的名字（小写，用连字符）。
- `public/guides/` 里的文件只有输入密码后才能打开（Worker 把守）。但仓库是公开的，GitHub 上谁都能看到这些文件。
- 代码：`src/lib/guides/`（类型、规则、检查）、`src/scripts/guide/`（浏览器里的程序）、`worker/guides.ts`（密码门）。

- The folder name is the guide's slug in the address (lower case, with hyphens).
- Files in `public/guides/` open only after the password (the Worker guards
  them). The repo is public, though, so anyone can read them on GitHub.
- Code: `src/lib/guides/` (types, rules, checks), `src/scripts/guide/` (the
  program in the browser), `worker/guides.ts` (the password gate).

编辑链接 Edit links:

| 文件 File | 链接 Link |
| --- | --- |
| `access.json` | <https://github.com/itom123/kuschonink.com/edit/main/src/content/guides/access.json> |
| `guide.json` | <https://github.com/itom123/kuschonink.com/edit/main/src/content/guides/paris-2026-11/guide.json> |
| `items.json` | <https://github.com/itom123/kuschonink.com/edit/main/src/content/guides/paris-2026-11/items.json> |
| `places.json` | <https://github.com/itom123/kuschonink.com/edit/main/src/content/guides/paris-2026-11/places.json> |
| `events.json` | <https://github.com/itom123/kuschonink.com/edit/main/src/content/guides/paris-2026-11/events.json> |
| `routes.json` | <https://github.com/itom123/kuschonink.com/edit/main/src/content/guides/paris-2026-11/routes.json> |
| `listings.json` | <https://github.com/itom123/kuschonink.com/edit/main/src/content/guides/paris-2026-11/listings.json> |
| `map.json` | <https://github.com/itom123/kuschonink.com/edit/main/src/content/guides/paris-2026-11/map.json> |
| 上传图片 Upload pictures | <https://github.com/itom123/kuschonink.com/upload/main/public/guides/paris-2026-11/img> |

---

## 3. 最快的改法 The quickest edit

1. 打开上面的编辑链接（例如 `items.json`）。
2. 按 **Ctrl+F**，搜索地点的编号，比如 `"A3"`。
3. 改文字。保留引号和逗号。
4. 点 **Commit changes…**，选 **Commit directly to the `main` branch**，再点 **Commit changes**。
   大约一分钟后网站更新。想先预览的话，选 **Create a new branch and start a pull request**：
   PR 里会出现一个预览链接，看过再合并。

另一种方法：在仓库页面按 **`.`**（句号键），会打开网页版 VS Code（github.dev）。
确认左下角的分支是 `main`（网站就是从它构建的）。改完后在左边的
“源代码管理”里写一句说明，点 **Commit & Push**。

小心：

- 每个 `"字段": 值` 之间要有逗号，最后一个后面不要逗号。
- 文字里的英文双引号要写成 `\"`，或者用中文引号“”。
- 不能写 HTML（`<b>` 之类）。
- 日期写成 `2026-11-12`，时间写成 `14:00`。

1. Open an edit link above (for example `items.json`).
2. Press **Ctrl+F** and search for the place's id, such as `"A3"`.
3. Change the text. Keep the quotes and commas.
4. Click **Commit changes…**, choose **Commit directly to the `main` branch**,
   then **Commit changes**. The site updates in about a minute. To see it
   first, choose **Create a new branch and start a pull request** instead: the
   PR gets a preview link, and you merge once it looks right.

Or press **`.`** (full stop) on the repo page to open github.dev, VS Code in
the browser. Check that the branch (bottom left) is `main`, the one the site
is built from. When you're done, write a line in Source Control on the left
and click **Commit & Push**.

Watch out for:

- a comma between each `"field": value`, and none after the last one;
- straight double quotes inside a text, which must be written `\"` (or use
  curly quotes “ ”);
- HTML (`<b>` and so on), which isn't allowed;
- dates as `2026-11-12` and times as `14:00`.

---

## 4. 常见修改 Recipes

每个可以翻译的文字字段 `x` 都有一个中文双胞胎 `xZh`（如 `hours` 和 `hoursZh`）。没有中文时显示英文。
地名、地址、作品名、人名和图片署名只写原文，没有 `Zh`。

Every text field `x` that can be translated has a Chinese twin `xZh` (such as
`hours` and `hoursZh`). A missing twin shows the English. Names, addresses,
titles, people and picture credits stay in the original and have no twin.

### 4.1 开放时间和日期 Hours and dates

在 `items.json` 里找到地点：

- `hours` / `hoursZh`：给人看的开放时间，例如 `"Tue–Sat 11:00–19:00"` / `"周二至周六 11:00–19:00"`。
  中文里的时间必须和英文一样，否则构建失败。
- `open`：哪几天开门，决定“这天能不能去”：`["tue", "wed", "thu", "fri", "sat"]`。不知道就删掉这一行。
- `start` / `end`：展览的第一天和最后一天，`"2026-11-08"`。

In `items.json`, find the place:

- `hours` / `hoursZh`: the opening hours as people read them, e.g.
  `"Tue–Sat 11:00–19:00"` / `"周二至周六 11:00–19:00"`. Times in the Chinese
  must match the English, or the build fails.
- `open`: the weekdays it opens, which decide whether a day is worth going:
  `["tue", "wed", "thu", "fri", "sat"]`. If you don't know, leave it out.
- `start` / `end`: the first and last day, `"2026-11-08"`.

### 4.2 某一天闭馆或要预约 A one-day closure or appointment

在地点里加 `exceptions`（例外）。`status` 可以是 `open`、`closed`、`appointment`（预约）或 `confirm`（请先确认）：

Add `exceptions` to the place. `status` is `open`, `closed`, `appointment` or
`confirm`:

```json
"exceptions": [
  { "date": "2026-11-12", "status": "closed", "note": "Private event", "noteZh": "私人活动" }
]
```

例外优先于其他规则。整个展期都要预约的话，用 `"access": "appointment"`。

An exception wins over every other rule. If a place is by appointment for the
whole run, use `"access": "appointment"` instead.

### 4.3 公共假日 Holidays

假日写在 `guide.json` 的 `holidays` 里，每个地点在 `items.json` 里用 `holiday` 说明那天怎么样：
`open`（照常）、`closed`（闭馆）、`confirm`（请先确认，默认）。

Holidays are listed in `guide.json` under `holidays`. Each place says in
`items.json`, with `holiday`, what it does that day: `open`, `closed`, or
`confirm` (check first; the default).

```json
"holidays": [
  { "date": "2026-11-11", "name": "Armistice Day", "nameZh": "停战纪念日",
    "notice": "Many places close or change hours.", "noticeZh": "许多地方闭馆或调整时间。" }
]
```

### 4.4 文字 Texts

说明页的文字在 `guide.json` 的 `texts` 里，按显示顺序排列。每一节有 `heading`（标题）、
`paras`（段落，每段 `text`）和 `items`（列表，每条 `lead` 加 `text`）。地点的介绍是
`items.json` 里的 `why`，提醒是 `note`。

The Info texts are in `guide.json` under `texts`, in display order. Each
section has a `heading`, `paras` (paragraphs, each a `text`) and `items` (a
list, each a `lead` and a `text`). A place's description is `why` in
`items.json`, and a caution is `note`.

### 4.5 增加或删除地点 Adding or removing an item

增加：复制 `items.json` 里一个地点（从 `{` 到 `},`），粘贴后修改（例子在本节最后）。

- `id` 以它的级别字母开头，不能重复：B 级的新地点叫 `B16`。
- `zone`（片区）和 `themes`（主题）用 `guide.json` 里已有的 `id`。
- `coordinates` 写成 **[经度, 纬度]**。Google 地图右键一个点，显示的是 **纬度在前**（如 `48.8606, 2.3376`），
  所以要倒过来写：`[2.3376, 48.8606]`。写反了，构建会提示。

删除：删掉整个 `{ … },`，再搜索这个 `id`，把 `routes.json` 的 `stops` 和 `events.json` 的 `place`
里的它也删掉。漏掉的话构建会告诉你在哪里。

To add one, copy a place in `items.json` (from `{` to `},`), paste it and
change it (an example ends this section; its zone and theme are made up).

- The `id` starts with its tier letter and must be new: a new B-tier place is
  `B16`.
- `zone` and `themes` use ids already in `guide.json`.
- `coordinates` are **[longitude, latitude]**. Right-click a spot in Google
  Maps and it shows **latitude first** (`48.8606, 2.3376`), so write it the
  other way round: `[2.3376, 48.8606]`. If they're swapped, the build says so.

To remove one, delete its whole `{ … },`, then search for its id and take it
out of `stops` in `routes.json` and `place` in `events.json`. If you miss one,
the build tells you where.

```json
{
  "id": "B16", "tier": "B", "name": "Galerie Exemple",
  "zone": "marais", "themes": ["documentary"],
  "why": "One line on why it's worth the trip.", "whyZh": "一句话说明为什么值得去。",
  "address": "1 rue Exemple, 75003 Paris",
  "hours": "Tue–Sat 11:00–19:00", "hoursZh": "周二至周六 11:00–19:00",
  "open": ["tue", "wed", "thu", "fri", "sat"],
  "start": "2026-10-01", "end": "2026-11-21",
  "coordinates": [2.3601, 48.8619]
}
```

### 4.6 路线 Routes

`routes.json` 里每条路线有 `id`（小写加连字符）、`name`、`stops`（按顺序的地点或参考点 `id`）和
`mode`：`walking`（步行，一个 Google 地图链接）或 `transit`（公交，每一段一个链接）。路线里某个点对
某类读者隐藏时，那一站对他们省略；少于两站的路线不显示。

Each route in `routes.json` has an `id` (lower case with hyphens), a `name`,
`stops` (item and place ids, in order) and a `mode`: `walking` (one Google
Maps link) or `transit` (one link per leg). A stop hidden from an audience is
dropped for them, and a route left with fewer than two stops isn't shown.

### 4.7 日程 Events

`events.json` 的 `events` 里每项有 `id`、`date`、可选的 `until`（多天活动的最后一天）、`start` /
`end`（`"18:00"`）、`place`（地点或参考点的 `id`）、`title` 和 `note`。`optional: true` 表示可去可不去。
`days` 是每天的安排（`date` 加 `plan`）。

Each entry in `events` in `events.json` has an `id`, a `date`, an optional
`until` (the last day, for events over several days), `start` / `end`
(`"18:00"`), a `place` (an item or place id), a `title` and a `note`.
`optional: true` marks it as optional. `days` holds a plan for each day
(`date` and `plan`).

### 4.8 图片 Pictures

- JPEG，宽不超过 640 像素，**不超过 1 MB**。
- **先去掉手机拍照的位置信息**：Windows 上右键图片 → 属性 → 详细信息 →“删除属性和个人信息”；
  iPhone 上分享时点“选项”，关掉“位置”。
- 用上面的“上传图片”链接上传到 `public/guides/<名字>/img/`，然后在地点里加 `image`（见下面的例子）。
- 图片说明后面会自动加上 `guide.json` 里 `credits.image` 写的发布者（巴黎导览是“由 Photo Days 发布”）。图片来自别处（比如场馆自己的网页）时，加 `"source": "Published by …"` 和 `"sourceZh": "由……发布"`，就会显示它。
- `listings.json` 的条目也可以有同样的 `image`。

- JPEG, at most 640 px wide and **no more than 1 MB**.
- **Strip the phone's location data first**: on Windows, right-click the file
  → Properties → Details → *Remove Properties and Personal Information*; on an
  iPhone, tap *Options* when sharing and turn *Location* off.
- The caption ends with who published the picture: `credits.image` in
  `guide.json` (for Paris, "Published by Photo Days"). For a picture from
  somewhere else, such as the venue's own page, add `"source": "Published by …"`
  and `"sourceZh"`, and that shows instead.
- A record in `listings.json` may have an `image` too, written the same way.
- Upload it to `public/guides/<slug>/img/` with the upload link above, then
  add to the place:

```json
"image": { "file": "B16.jpg", "credit": "Photo: name of the photographer", "alt": "What the picture shows", "altZh": "图片内容" }
```

### 4.9 只给某类读者看 Participants-only

任何地点、参考点、日程、每日安排、路线、说明的一节、一段或一条，都可以加 `"audience": "fotofilmic"`
（或一组 `["fotofilmic", "…"]`）。这样它只出现在学员版里，访客版的网页和数据里都没有它。

如果新写的学员内容里有新的专有名字（地点名、街道名），也把它加进 `guide.json` 的
`sensitive.fotofilmic`；绝不能在公开页面出现的词放进 `sensitive.public`。构建时的防泄漏检查会核对。

Any item, place, event, day plan, route, text section, paragraph or list item
can carry `"audience": "fotofilmic"` (or a list, `["fotofilmic", "…"]`). It
then appears only in the participants' version; the visitors' pages and data
don't contain it at all.

If new participants-only content brings a new proper name (a venue, a
street), add it to `sensitive.fotofilmic` in `guide.json` too. Words that must
never appear on a public page go in `sensitive.public`. The leak guard checks
both when the site is built.

---

## 5. 新建一份导览 Adding a new guide

1. 复制整个文件夹 `src/content/guides/paris-2026-11/`，改名为 `<城市>-<年>-<月>`，比如 `lisbon-2027-06`（小写，连字符；没有日期的导览写 `<城市>-<主题>`，如 `paris-cafes`）。名字就是导览以后永久的地址，写法见第 12 节。
2. 改 `guide.json`：标题、`public`（中性的公开标题，不写人名、地点或团体名）、`listed`（是否在密码对话框里供人选择）、
   `city`、`timezone`（如 `"Europe/Lisbon"`）、`checked`、日期、分级、主题、片区、`texts`、`sensitive`。
3. 清空 `items.json`、`places.json`、`events.json`、`routes.json`、`listings.json` 里的旧内容，再填新的。
   每个文件都要留着，列表可以是空的。没有日期的导览（比如咖啡馆）不写 `window`，就没有日期筛选。
4. 在 `access.json` 的 `guides` 里加一行：`"lisbon-2027-06": ["visitor"]`。顺序有用：打开“导览”时进入的是排在最前面的那份列出的导览，`/guides/<城市>` 进入的是这个城市排在最前面的那份。新的一份放在最前面。要街道级地图的话，再在 `tiles` 里加一行，范围要包住每一张底图（第 10 节）。
5. 建 `public/guides/lisbon-2027-06/img/` 和 `map/`。
6. 同一城市的旧导览要存档的话，把它的 `"listed"` 改成 `false`（第 12 节）。
7. **底图**：目前还没有自动生成底图的工具。请让 Claude 做（说明城市和范围），它会生成底图图片和 `map.json`。
   底图的中心不要正对任何只给部分读者看的地点（比如工作地点）：访客也拿得到底图，看得出它的中心。构建会检查这一点（`is too close to the centre of map view`）；要偏开，就裁掉一边，再在 `map.json` 里改 `originX`/`originY` 和 `width`/`height`。

1. Copy the whole folder `src/content/guides/paris-2026-11/` and
   rename it `<city>-<yyyy>-<mm>`, for example `lisbon-2027-06` (lower case,
   with hyphens; a guide without dates is `<city>-<topic>`, such as
   `paris-cafes`). The name is the guide's address for good: see section 12.
2. Edit `guide.json`: the title, `public` (a neutral public title: no people,
   venues or group names), `listed` (offered in the password box or not), `city`,
   `timezone` (e.g. `"Europe/Lisbon"`), `checked`, the dates, tiers, themes,
   zones, `texts` and `sensitive`.
3. Empty `items.json`, `places.json`, `events.json`, `routes.json` and
   `listings.json`, then fill them. Keep every file, even with an empty list.
   A guide without dates (cafés, say) has no `window`, so no day filter.
4. Add a line to `guides` in `access.json`: `"lisbon-2027-06": ["visitor"]`.
   Its place matters: Field Guide opens the first listed guide in that list,
   and `/guides/<city>` the first listed one of that city, so put a new guide
   first. For street-level tiles, add a line to `tiles` as well, with a box that
   holds every base map (section 10).
5. Create `public/guides/lisbon-2027-06/img/` and `map/`.
6. To archive an older guide of the same city, set its `"listed"` to `false`
   (section 12).
7. **Base maps**: there's no base-map tool yet. Ask Claude (name the city and
   the area); it makes the images and `map.json`.
   Don't centre a base map on a place only some readers may see: visitors get
   the base maps too and can tell where the centre is. The build checks this
   (`is too close to the centre of map view`). To move the centre, crop one
   side and change `originX`/`originY` and `width`/`height` in `map.json` to
   match.

---

## 6. 新增一类读者 Adding an audience

1. 在 `access.json` 的 `audiences` 里加一项，按权限从低到高排列：

   ```json
   { "id": "friends", "label": "Friend", "labelZh": "朋友", "secret": "GUIDES_PASSWORD_FRIENDS", "includes": ["visitor"] }
   ```

   `includes` 表示他们也看到哪些读者的内容。
2. 在 `guides` 里把它加到能打开的导览后面：`"paris-2026-11": ["visitor", "fotofilmic", "friends"]`。
3. 在 Cloudflare 加一个同名的 secret（见第 7 节）。
4. 给只给他们看的内容加 `"audience": "friends"`。

1. Add an entry to `audiences` in `access.json`, least privileged first (see
   the example above). `includes` lists the audiences whose content they also
   see.
2. Add it to each guide it may open in `guides`:
   `"paris-2026-11": ["visitor", "fotofilmic", "friends"]`.
3. Add a Cloudflare secret with the same name (section 7).
4. Mark their own content with `"audience": "friends"`.

---

## 7. 密码 Passwords

密码和密钥**从不**写进仓库。它们都是 Cloudflare 里的 secret：

- `GUIDES_PASSWORD`：访客的密码；
- `GUIDES_PASSWORD_FOTOFILMIC`：学员的密码；
- `GUIDES_COOKIE_SECRET`（建议设置）：给登录 cookie 签名的密钥，这样别人伪造不了登录状态。
  用 32 个以上的随机字符，比如让密码管理器生成一个；不用记住它，也不要告诉别人。
  没设的话，Worker 用已有的 `TURNSTILE_SECRET` 签名；少于 24 个字符时，两个一起签名。
  （苹果和 Chrome 自动生成的密码往往不够长。）

每类读者的密码叫什么名字，写在 `access.json` 里。

设置或修改：dash.cloudflare.com → **Workers & Pages** → **kuschonink** → **Settings** →
**Variables and Secrets** → **Add**（修改则点已有那项的编辑）→ Type 选 **Secret** → 名字 → 值 → **Deploy**。
不要加在 **Settings → Build** 下面：那里的变量只有构建时看得到，Worker 读不到。

- 每个密码至少 6 个字符，两类读者的密码必须不一样。不分大小写，多余的空格和全角字符都不算。
  （如果两类读者用了同一个密码，进去的是权限低的那一类。）
- 改了某类读者的密码，这一类读者都要重新输入；其他读者不受影响。
- 改了签名用的密钥（`GUIDES_COOKIE_SECRET`，没设它时是 `TURNSTILE_SECRET`；它少于 24 个字符时两个都算），所有人都要重新输入密码。
  第一次设置 `GUIDES_COOKIE_SECRET` 也一样。
- **PR 预览有自己的 secret，不用正式网站的。** 每个分支的预览（Worker Previews）只用 `wrangler.jsonc`
  里 `previews` 部分的设置，加上预览自己的 secret，所以**预览里的导览密码和正式网站的不一样**。
  预览里是那个分支真实的导览，而预览链接是公开的，所以这些密码要和正式网站的一样强，不要用简单的测试密码；
  但一定要和正式网站的**不同**（`GUIDES_COOKIE_SECRET` 也是）：推到仓库的每个分支都会有预览、拿到这些 secret，
  包括云端会话推的 `claude/…` 分支（见 11.6），分支里的代码读得到它们。
  在自己电脑上设置一次，以后新建的预览都会用：
  `npx wrangler preview base-config secret put GUIDES_PASSWORD`（`GUIDES_PASSWORD_FOTOFILMIC`、
  `GUIDES_COOKIE_SECRET`、`TURNSTILE_SECRET` 同理；也可以在控制台的 Previews Base 里设置）。
  已经存在的预览要单独改：`npx wrangler preview secret put 名字 --name <分支名>`。密码永远不写进仓库。
- 在控制台改正式网站的 secret，不会再把哪个预览部署上线。（如果 **Settings → Builds** 里还显示
  “Set up Worker Previews”，说明还没切换，旧规则仍然有效：只在没有比正式版更新的 PR 预览时修改 secret。）
- 没设密码时，导览显示“尚未开放”，不会泄漏内容。
- 微信内置浏览器有自己的 cookie，在微信里打开时会再问一次密码。
- “记住此密码”保留 30 天；不勾的话，关掉浏览器就要重新输入（最长 12 小时）。

Passwords and keys **never** go in the repo. They are all Cloudflare secrets:

- `GUIDES_PASSWORD`: the visitors' password;
- `GUIDES_PASSWORD_FOTOFILMIC`: the participants' password;
- `GUIDES_COOKIE_SECRET` (recommended): the key that signs the log-on
  cookies, so nobody can forge one. Use 32 or more random characters, for
  example from a password manager; you never need to remember it, and nobody
  else needs it. Without it, the Worker signs with the existing
  `TURNSTILE_SECRET`; under 24 characters, it signs together with
  `TURNSTILE_SECRET`. (Apple's and Chrome's generated passwords are
  usually too short.)

`access.json` names each audience's password secret.

To set or change one: dash.cloudflare.com → **Workers & Pages** →
**kuschonink** → **Settings** → **Variables and Secrets** → **Add** (or edit
the existing one) → Type **Secret** → the name → the value → **Deploy**.
Don't add them under **Settings → Build**: only the build can see those
variables, not the Worker.

- Each password needs at least 6 characters, and the two must differ. Case,
  extra spaces and full-width characters don't matter. (If two audiences
  shared a password, it would open the less privileged one.)
- Changing an audience's password logs that audience out; the others stay
  logged on.
- Changing the signing key (`GUIDES_COOKIE_SECRET`, or `TURNSTILE_SECRET`
  while that isn't set; both, while it is under 24 characters) logs everyone
  out. So does setting
  `GUIDES_COOKIE_SECRET` for the first time.
- **PR previews have their own secrets, never production's.** Each branch's
  preview (Worker Previews) gets only the settings in the `previews` block of
  `wrangler.jsonc`, plus the previews' own secrets. So **a preview's guide
  passwords are not the live site's**. A preview serves that branch's real
  guides at a public link, so make them as strong as the live site's, never
  short test words, but always **different** from the live site's
  (`GUIDES_COOKIE_SECRET` too): every branch pushed to the repository gets a
  preview with these secrets, a cloud session's `claude/…` branch included
  (section 11.6), and that branch's code can read them. Set them once on your
  own computer, for every new preview:
  `npx wrangler preview base-config secret put GUIDES_PASSWORD` (likewise
  `GUIDES_PASSWORD_FOTOFILMIC`, `GUIDES_COOKIE_SECRET`, `TURNSTILE_SECRET`;
  or in the dashboard's Previews Base). To change a preview that already
  exists: `npx wrangler preview secret put NAME --name <branch>`. Passwords
  never go in the repo.
- Changing a production secret in the dashboard no longer puts a preview
  live. (If **Settings → Builds** still shows "Set up Worker Previews", the
  switch hasn't been made and the old rule holds: change secrets only when
  no PR preview is newer than production.)
- With no password set, the guide says it isn't open yet. Nothing leaks.
- WeChat's built-in browser keeps its own cookies, so it asks again.
- *Save this password* keeps you logged on for 30 days; without it, until the
  browser closes (12 hours at most).

---

## 8. 构建失败时 When the build fails

网站不会坏：构建失败时，正式网站保持上一个版本。

1. 在 GitHub 上，提交或 PR 旁边会有红色的 ✗ **Workers Builds: kuschonink**。点 **Details**。
2. 在日志里找以 **`Field Guide:`** 开头的那一行，它说有几个问题。问题列在它下面，一行一个，
   每行以 `guides/<导览>/<文件>.json › 编号 › 字段:` 开头，例如
   `guides/paris-2026-11/items.json › B3 › end: "2026-11-31" is not a real date.`
   防泄漏检查的问题以 **`Field Guide guard:`** 开头，后面是文件和原因。
3. 按提示改那个文件，再提交一次。

The site doesn't break: when a build fails, the live site stays as it was.

1. On GitHub, the commit or PR shows a red ✗ **Workers Builds: kuschonink**.
   Click **Details**.
2. In the log, find the line starting **`Field Guide:`**, which says how many
   problems there are. They're listed under it, one per line, each starting
   `guides/<slug>/<file>.json › id › field:`, e.g.
   `guides/paris-2026-11/items.json › B3 › end: "2026-11-31" is not a real date.`
   Leak-guard problems start with **`Field Guide guard:`**, then the file and
   the reason.
3. Fix that file as it says and commit again.

在日志里搜索第一列的字句，就能找到那一行。Search the log for the words in the first column.

| 日志里的字句 Words in the log | 原因 Cause | 怎么改 Fix |
| --- | --- | --- |
| `is not a real date` | 日期不存在或格式不对 A date that doesn't exist, or the wrong format | 写成 `YYYY-MM-DD` Write `YYYY-MM-DD` |
| `is before the start`, `is not after the start` | 结束早于开始 The end comes before the start | 检查两个日期或时间 Check both dates or times |
| `is outside the guide's days`, `never open during the guide's days`, `Check the year` | 日期不在导览的日子里，多半是年份写错；例外、假日、日程和每日安排的日期都会检查 A date outside the guide's days, usually the wrong year; exception, holiday, event and day-plan dates are all checked | 改正年份，或删掉这一条 Fix the year, or remove the entry |
| `is not an item or place`, `is not a record in listings.json`, `is not a zone in guide.json` | 路线、日程或地点指向不存在的编号（主题、分类也一样） A route, event or item points at an id that doesn't exist (themes and categories likewise) | 改正编号，或删掉引用 Fix the id or remove the reference |
| `is outside the map`, `looks like [latitude, longitude]` | 坐标不在地图里，多半是经纬度写反 Coordinates off the map, usually latitude and longitude swapped | 写成 `[经度, 纬度]` Write `[longitude, latitude]` |
| `is too close to the centre of map view` | 只给学员的地点离某张底图的中心太近。访客也看得到底图，正对着它的底图会暴露它在哪 A participants-only place sits near a base map's centre. Visitors see the base maps too, so a map centred on it gives it away | 请 Claude 重新裁那张底图，让中心偏开 Ask Claude to crop that map off-centre |
| `unknown field; did you mean` | 字段名拼错 A misspelt field name | 按提示改名 Rename it as suggested |
| `differ from the English` | 中文里的时间和英文不一致 The times in the Chinese differ from the English | 让两边的时间一样 Make the times match |
| `looks like HTML` | 文字里有 `<b>` 等标签 A tag such as `<b>` in a text | 删掉标签 Remove it |
| `is not an audience` | `audience` 写了 `access.json` 里没有的读者 An audience that isn't in `access.json` | 改正拼写 Fix the spelling |
| `must be listed before`, `(least privileged first)` | `access.json` 的 `audiences` 顺序不对：权限低的要排在前面 The audiences in `access.json` are out of order: least privileged first | 按提示挪动那一项 Move the entry as it says |
| `unknown placeholder` | 说明文字、标题或副标题里有不认识的 `{…}`；能用的只有 `{items}`、`{listings}`、`{routes}` An unknown `{…}` in a text, the title or the subtitle; only `{items}`, `{listings}` and `{routes}` work | 改正或删掉 Fix it or remove it |
| `Unexpected token`, `Expected ','` | JSON 格式错：少了逗号、引号或括号 Broken JSON: a missing comma, quote or bracket | 看日志给的行号 Look at the line number given |
| `contains guide text`, `contains sensitive.public words`, `doesn't include` | 不该公开的文字或词出现在公开页面，或别的读者的版本里 Private text or a private word reached a public page or another audience's view | 加 `audience`，或从公开标题里拿掉 Add `audience`, or take it out of the public title |
| `missing, or its case differs`, `is over 1 MB`, `should be a file name` | 图片不存在、大小写不对、太大，或文件名不对 A picture missing, in the wrong case, too big, or badly named | 检查文件名，压缩图片 Check the file name; shrink it |
| `is not a guide in "guides"` | `access.json` 的 `tiles` 里写了一个不在 `guides` 里的导览名 A guide named in `tiles` that isn't in `guides` | 改正导览名，或删掉这一行 Fix the name, or remove the line |
| `should be [west, south, east, north] in degrees` | 瓦片范围不是四个数字 A tile box that isn't four numbers | 写成 `[西, 南, 东, 北]`，单位是度 Write `[west, south, east, north]`, in degrees |
| `must be between -180 and 180`, `must be between -85.06 and 85.06` | 经度或纬度超出范围，多半是位数写错，或经纬度写反 A longitude or latitude out of range, often a slip or swapped numbers | 检查数字，经度在前 Check the numbers: longitude first |
| `should be less than east`, `should be less than north` | 西边的数字比东边大，或南边比北边大 West and east, or south and north, are the wrong way round | 按 `[西, 南, 东, 北]` 的顺序改 Put them in the order `[west, south, east, north]` |
| `spans more than 3°` | 瓦片范围东西或南北超过 3°：瓦片只为一个地区而设 A tile box more than 3° each way: tiles are for one region | 只框住大区底图的范围 Cover the region view's area, no more |
| `reaches outside the tile bounds` | 某张底图伸到瓦片范围之外，放大后瓦片会在它的边缘停下 A base map reaches outside the tile box, so zoomed-in tiles stop at its edge | 扩大 `tiles` 里的范围，或裁小这张底图 Widen the box in `tiles`, or crop the base map |
| `is next to`, `which not every reader sees` | 用 `[经度, 纬度]` 写的地图中心，离一个只给部分读者看的地点太近。写成地点的编号，每类读者就有各自的中心 A map centre written as a point lies near a place only some readers see | 把 `centre` 写成那个地点的编号，如 `"W"` Write `centre` as that place's id, e.g. `"W"` |
| `placeholders such as {items} work only in the title` | 占位符只能用在标题、副标题和说明文字里，别处会原样显示 Placeholders work only in the title, subtitle and texts; elsewhere they show as written | 直接写出数字 Write the number out |
| `write {items} without spaces` | 占位符的花括号里有空格，如 `{ items }` A placeholder with spaces inside its braces | 写成 `{items}` Write it without spaces |
| `px but` (the guard) | 底图图片的像素大小和 `map.json` 里的 `width`、`height` 不一样，图钉会跑位 A base map's pixel size differs from `width` and `height` in `map.json`, so its pins would move | 改 `map.json` 的 `width`、`height`（和 `originX`、`originY`），或重新裁图 Fix `width`, `height` (and `originX`, `originY`) in `map.json`, or crop the picture to match |
| `its size in pixels can't be read` (the guard) | 读不出底图的像素大小，文件可能坏了，或不是图片 The pixel size of a base map can't be read: the file may be damaged or not a picture | 重新导出为 JPEG、PNG 或 WebP Export it again as JPEG, PNG or WebP |
| `is not a kind in access.json`, `A listed guide names its kind` | 导览的 `kinds` 写了 `access.json` 里没有的类型，或者列出的导览没写 `kinds` A guide's `kinds` names a kind `access.json` doesn't have, or a listed guide has no `kinds` | 改正拼写，或给导览加上 `"kinds": ["food"]` 之类 Fix the spelling, or give the guide `"kinds"` such as `["food"]` |
| `is not a price level`, `is not a distinction` | 地点的 `cost` 或 `award` 不在 `guide.json` 的 `costs` 或 `awards` 里 An item's `cost` or `award` isn't in `costs` or `awards` in `guide.json` | 用已有的编号，如 `"€€"`、`"1-star"` Use an id that exists, such as `"€€"` or `"1-star"` |
| `not a Field Guide file` | 导览文件夹里有一个不认识的 `.json` 文件 A `.json` file in a guide's folder that the Field Guide doesn't use | 删掉它，或改成已知的文件名 Delete it, or rename it to a known file name |
| `there is no folder`, `not in access.json` | `access.json` 和文件夹对不上 `access.json` and the folders disagree | 两边一起改 Change both |
| `should start with its city` | 导览的名字（文件夹名、地址）没有以城市开头 A guide's name (its folder and address) doesn't start with its city | 按提示改名，或改 `city`；已经分享过的地址要加进 `moved`（第 12 节） Rename it as suggested, or fix `city`; add a shared address to `moved` (section 12) |
| `is still a guide in "guides"`, `Send "…" to the guide's address now` | `moved` 里的旧地址还是一份导览，或者它指向的导览不存在 An old address in `moved` is still a guide, or points at no guide | 只写已经不用的旧地址，指向导览现在的名字 List only addresses no longer in use, each sent to a guide's name now |

---

## 9. 让云端 Claude Code 来改 Asking cloud Claude Code

在 claude.ai 的 Claude Code 里选这个仓库，可以这样说：

In Claude Code on claude.ai, pick this repo and say something like:

```text
请先读 docs/GUIDES.md。然后在 src/content/guides/paris-2026-11/ 里：
把 B3 的结束日期改成 2026-11-20；给 A5 加一条 2026-11-12 闭馆的例外（原因：私人活动）。
改完运行 npm test 和 npm run build，都通过后开一个 PR：gh pr create --base main。
PR 说明用中文写清楚改了什么。只改需要改的文件，不要把任何密码写进仓库。
```

PR 会有一个预览链接，看过再合并。

The PR gets a preview link; check it, then merge.

---

## 10. 字段说明 Field reference

字段名和 `src/lib/guides/types.ts` 完全一致。带 `?` 的可以不写。每个文字字段 `x` 旁边可以有 `xZh`（表里写作 `x`/`xZh`）。
任何对象都可以写 `_comment`（备注，不显示）。

Field names match `src/lib/guides/types.ts` exactly. A `?` marks an optional
field. A text field `x` may have a Chinese twin `xZh` (written `x`/`xZh`
below). Any file may have a `_comment`, which is never shown.

### `access.json`

| 字段 Field | 说明 | Meaning |
| --- | --- | --- |
| `audiences[]` | 读者，按权限从低到高 | Audiences, least privileged first |
| `audiences[].id` | 编号，用在 `audience` 里 | The id used in `audience` |
| `audiences[].label`/`labelZh?` | 状态栏显示的名称 | The name in the status bar |
| `audiences[].secret` | Cloudflare secret 的名字（不是密码） | The Cloudflare secret's name (never the password) |
| `audiences[].includes?` | 也能看到哪些读者的内容 | Audiences whose content this one also sees |
| `guides` | 导览名 → 能打开它的读者 | Guide slug → the audiences that may open it |
| `moved?` | 旧地址 → 导览现在的名字，如 `{"paris-photo-days-2026": "paris-2026-11"}`。旧地址永久转到新地址，用旧名发来的推荐照样送到这份导览（第 12 节） | Old address → the guide's slug now. The old address redirects for good, and suggestions sent under the old name still reach the guide (section 12) |
| `kinds?[]` | `{ id, label, labelZh? }`：读者可以选择看什么（密码对话框的选项卡和“打开导览”的分组），按这里的顺序。名称在输入密码前就显示，保持中性 | What readers can choose to see (the password box's tabs, File ▸ Open Guide's groups), in this order. The labels show before the password: keep them neutral |
| `tiles?` | 导览名 → 街道级地图瓦片的范围 `[西, 南, 东, 北]`（度），一般就是大区底图的范围；写了才有瓦片。只写数字，不写地点。东西、南北各跨不超过 3°，并且要包住这份导览的每一张底图 | Guide slug → the area of its street-level tiles, `[west, south, east, north]` in degrees (usually the region view's area); without it the guide has no tiles. Numbers only, never a place. Each side spans at most 3°, and the box must hold every base map |

### `guide.json`

| 字段 Field | 说明 | Meaning |
| --- | --- | --- |
| `title`/`titleZh?`, `subtitle?`/`subtitleZh?` | 打开后显示的完整标题 | The full title, once open |
| `public` | `{ title, titleZh?, subtitle?, subtitleZh? }`：输入密码前显示的中性标题 | The neutral title shown before the password |
| `kinds?` | 这份导览属于哪几类（`access.json` 的 `kinds`），主要的放在最前面：密码对话框打开在那一张选项卡上。列出的导览必须写 | The kinds this guide is (`access.json` "kinds"), its main one first: the password box opens on that tab. A listed guide needs one |
| `listed` | 是否在密码对话框里供人选择；排在最前面（按 `access.json` 的顺序）的那份，就是打开“导览”时进入的导览，也是 `/guides/<城市>` 进入的导览。`false` 就是存档：地址照样能用（第 12 节） | Offered in the password box's choice of guides; the first listed one (in `access.json` order) is where Field Guide and `/guides/<city>` open. `false` archives it: its address still works (section 12) |
| `city`/`cityZh?` | 城市；导览的名字以它开头（`Paris` → `paris-…`） | The city; the guide's slug starts with it (`Paris` → `paris-…`) |
| `timezone` | 时区（IANA），如 `Europe/Paris`；“今天”按它算 | IANA time zone; "today" follows it |
| `timezoneLabel?`/`timezoneLabelZh?` | 给人看的时区说明 | The time zone as people read it |
| `checked` | 信息最后核对的日期 | When the facts were last checked |
| `window?` | `{ start, end }`：导览覆盖的日期 | The days the guide covers |
| `event?` | `{ name, nameZh?, start, end, url? }`：节日或活动 | The festival or occasion |
| `holidays?[]` | `{ date, name, nameZh?, notice?, noticeZh? }` | Public holidays |
| `tiers[]` | `{ id: "A"/"B"/"C", name, nameZh?, text?, textZh?, weight }`；`weight` 决定热力图 | Tiers; `weight` drives the heat map |
| `themes[]`, `zones[]` | `{ id, name, nameZh? }`：主题、片区 | Themes and zones |
| `categories?[]` | `{ id, source?, name, nameZh? }`：`listings.json` 的分类 | Categories of listings |
| `costs?[]` | `{ id, name?, nameZh?, text?, textZh? }`：价位，从便宜到贵（如 `"€"` 到 `"€€€€"`；`text` 说明含义）。有它就有“价位”筛选、按价格排序和每个地点的价位标记 | Price levels, cheapest first (e.g. `"€"` to `"€€€€"`; `text` says what each means). They bring a Price filter, a Price order and a price mark on each place |
| `awards?[]` | `{ id, name, nameZh?, short?, shortZh? }`：评级，从高到低（米其林星级等）；`short` 是列表里的标记，如 `★★` | Distinctions, highest first (Michelin stars…); `short` is the mark in the list, e.g. `★★` |
| `labels` | 界面用的名词：`item`, `items`, `subtitle?`, `by?`, `listing?`, `listings?`，以及 `tier?`（写了就有按分级筛选的“类别”框）、`theme?`（主题框的名字，如“菜系”）、`cost?`、`award?`（各有 `Zh`） | The interface's nouns (each with `Zh`), and `tier?` (with it, a Category box filters by tier), `theme?` (the theme box's name, e.g. Cuisine), `cost?`, `award?` |
| `texts` | 说明页各节，`id → { heading, headingZh?, paras?[], items?[], audience? }`；`paras[]` 是 `{ text, textZh?, audience? }`，`items[]` 是 `{ lead?, leadZh?, text, textZh?, audience? }` | Info sections, in order |
| `links?[]` | `{ label, labelZh?, url, audience? }` | Links |
| `credits` | `{ points?, pointsZh?, image?, imageZh? }`：资料和图片来源 | Credits for the points and pictures |
| `map` | `{ centre, heatRadius }`：`centre` 是参考点 `id` 或 `[经度, 纬度]`；`heatRadius` 单位米 | Map centre (a place id or `[lon, lat]`) and heat radius in metres |
| `sensitive` | `{ public: [...], <读者 id>: [...] }`：防泄漏检查用的词 | Words for the leak guard |
| `defaults?` | `{ price?, priceZh?, listingNote?, listingNoteZh? }` | Default price and listing note |
| `suggestions?` | `false`：这份导览不收读者推荐（没有“推荐”按钮和菜单项）。默认 `true` | `false`: no Suggest button or menu item in this guide. Default `true` |

### `items.json` (`items[]`)

| 字段 Field | 说明 | Meaning |
| --- | --- | --- |
| `id` | 以级别字母开头：`A1`, `B3`, `C2` | Starts with its tier letter |
| `tier` | `A`, `B` 或 `C` | `A`, `B` or `C` |
| `name` | 原名 | The original name |
| `short?` | 地图标签，不超过 14 个字符 | Map label, ≤14 characters |
| `subtitle?`/`subtitleZh?`, `by?` | 副标题（巴黎：展览名；餐厅：菜式，可以有中文）、作者（巴黎：艺术家；餐厅：主厨） | Subtitle (Paris: exhibition title; restaurants: the cuisine, which may have Chinese), by (Paris: artist; restaurants: chef) |
| `zone`, `themes[]` | `guide.json` 里的片区和主题 `id` | Zone and theme ids from `guide.json` |
| `why`/`whyZh?` | 推荐理由 | Why it's worth it |
| `address` | 地址（原文） | Address (original) |
| `hours?`/`hoursZh?` | 开放时间文字 | Opening hours as text |
| `start?`, `end?` | 第一天、最后一天 | First and last day |
| `open?` | 开门的星期：`mon` `tue` `wed` `thu` `fri` `sat` `sun` | Weekdays it opens |
| `holiday?` | 假日：`open`, `closed`, `confirm`（默认） | On holidays (default `confirm`) |
| `access?` | `walk-in`（默认）或 `appointment` | Walk in (default) or by appointment |
| `exceptions?[]` | `{ date, status, note?, noteZh? }`；`status`：`open`, `closed`, `appointment`, `confirm` | One-day exceptions |
| `minutes?` | 建议停留分钟数 | Minutes to allow |
| `price?`/`priceZh?`, `note?`/`noteZh?` | 价格、提醒 | Price, caution |
| `cost?`, `award?` | 价位、评级：`guide.json` 的 `costs`、`awards` 里的编号 | Price level and distinction: ids from `costs` and `awards` in `guide.json` |
| `sourceUrl?`, `links?[]` | 信息来源页、其他链接 | Source page, other links |
| `listing?` | `listings.json` 里对应条目的 `id` | Its record in `listings.json` |
| `coordinates` | `[经度, 纬度]` | `[longitude, latitude]` |
| `image?` | `{ file, credit, caption?, alt?, altZh?, source?, sourceZh? }`；文件在 `img/`；`source` 是发布者（不写就用 `credits.image`） | Picture; the file is in `img/`; `source` says who published it (default: `credits.image`) |
| `label?` | 开场缩放时显示标签（默认 A 级显示） | Label at the opening zoom (default: tier A) |
| `audience?` | 只给某些读者 | Only for some audiences |
| `suggested?` | `{ on, by?, own?, ref }`：读者推荐，由发布器加入（第 11 节）；`ref` 是 Notion 页面编号，不会出现在网页里 | A reader's suggestion, added by the publisher (section 11); `ref` is the Notion page and never reaches browsers |

### `places.json` (`places[]`)

| 字段 Field | 说明 | Meaning |
| --- | --- | --- |
| `id` | 一个大写字母，画在地图牌上 | One capital letter, drawn on the map plate |
| `label`/`labelZh?` | 它是什么：画廊、集合点 | What it is: a gallery, a meeting point |
| `name`, `address`, `coordinates` | 名字、地址、`[经度, 纬度]` | Name, address, `[lon, lat]` |
| `hours?`/`hoursZh?`, `note?`/`noteZh?`, `links?[]` | 时间、提醒、链接 | Hours, note, links |
| `audience?` | 只给某些读者 | Only for some audiences |

### `events.json`

| 字段 Field | 说明 | Meaning |
| --- | --- | --- |
| `events[]` | `{ id, date, until?, start?, end?, place?, title, titleZh?, note?, noteZh?, optional?, audience? }` | Dated events; `place` is an item or place id |
| `days?[]` | `{ date, plan, planZh?, audience? }` | A plan for each day |

### `routes.json` (`routes[]`)

| 字段 Field | 说明 | Meaning |
| --- | --- | --- |
| `id` | 小写加连字符 | Lower case with hyphens |
| `name`/`nameZh?` | 路线名 | Name |
| `length?`/`lengthZh?`, `duration?`/`durationZh?`, `when?`/`whenZh?`, `note?`/`noteZh?` | 长短、用时、适合什么时候、提醒 | Length, duration, when, note |
| `stops[]` | 按顺序的地点或参考点 `id` | Item and place ids, in order |
| `mode` | `walking` 或 `transit` | `walking` or `transit` |
| `audience?` | 只给某些读者 | Only for some audiences |

### `listings.json`

| 字段 Field | 说明 | Meaning |
| --- | --- | --- |
| `source` | `{ name, url?, checked, lang, credit? }`：官方来源 | The official source |
| `records[]` | `{ id, name, category, coordinates, details, url?, start?, end?, image? }`；`details` 是来源原文，用 `\n` 分行；`image` 和地点的一样 | Records in the source's own words, lines split by `\n`; `image` as for an item |

### `map.json`

| 字段 Field | 说明 | Meaning |
| --- | --- | --- |
| `views[]` | `{ id, name, nameZh?, file, z, originX, originY, width, height }`：底图图片（在 `map/`）和它在 Web-Mercator 里的位置 | Base-map images (in `map/`) and their Web-Mercator position |
| `attribution` | 底图署名 | Base-map credit |

一般不用手改 `map.json`；底图让 Claude 做。You rarely edit `map.json` by
hand; ask Claude for base maps.

---

## 11. 读者推荐 Suggestions

已经登录某份导览的人（访客和学员都可以），可以用 **文件 ▸ 推荐地点…** 或工具栏的 **推荐**，推荐一个地点或展览，也可以是自己的展览。推荐不会直接出现在导览里：先进入 Notion，由你决定。

People logged on to a guide (visitors and participants alike) can suggest a
place or a show, their own included, with **File ▸ Suggest a Place…** or the
toolbar's **Suggest**. Nothing goes into the guide by itself: it lands in
Notion and you decide.

### 11.1 流程 How it goes

1. 推荐者填写向导：是什么、时间地点、链接和图片、关于自己（可不填）、确认发送。服务器（`worker/suggest.ts`）核对来源、登录、内容、频率和反垃圾验证，清除图片里的位置等信息，然后在 Notion 的 **Suggestions** 里新建一条（状态 `NEW`），并给你发一封通知邮件。Notion 出问题时，整条推荐改用邮件发给你，不会丢失。
2. 你在 Notion 里（或网站的管理界面里）把状态改成 **APPROVED**（收录）或 **REFUSED**（不收录）。收录前可以设 **Tier**（A/B/C，默认 C）、**Show to**（`Everyone`，或某一类读者，如 `fotofilmic`）和 **Owner notes**（给云端例程的说明）。
3. 云端例程（Claude Code 的定时任务，每天巴黎时间 08:00 一次，你在网站上批准时也会立即运行一次）按 [`scripts/suggestions/ROUTINE.md`](../scripts/suggestions/ROUTINE.md) 处理每条 `APPROVED`：核对官网、补全链接和开放时间、定位、查重，写好条目，把状态改成 `READY`（或 `DUPLICATE`、`NEEDS CHECK`、`ERROR`）。**例程不能改仓库**（它的任务只挂工具的副本，从来不挂这个仓库，见 11.6）：它读的是陌生人写的文字和外部网页，可能被误导。
4. 网站自己的代码（发布器，`worker/publish.ts`，每 10 分钟一次）把 `READY` 的条目再检查一遍（只能用已知字段、通过构建时的同一套检查、不能含某类读者不该看到的词），然后提交到 `main`：只改这份导览的 `items.json` 和 `img/` 里的图片。状态变成 `PUBLISHING`；网站换上这次提交的构建后（通常一两分钟）变成 `PUBLISHED`。构建失败，或者 45 分钟后网站还没换上，发布器会自动撤回这次提交，状态变成 `ERROR`。

1. The sender goes through the wizard: what it is, when and where, links and
   a picture, about them (optional), check and send. The server
   (`worker/suggest.ts`) checks where it came from, the log-on, the fields,
   how often, and the anti-spam check, strips location data from the picture,
   and adds a page to **Suggestions** in Notion (status `NEW`), then emails
   you. If Notion fails, the whole suggestion is emailed to you instead.
2. In Notion (or the site's admin queue), set the status to **APPROVED** or
   **REFUSED**. Before approving you can set **Tier** (A, B or C; C by
   default), **Show to** (`Everyone`, or one audience such as `fotofilmic`)
   and **Owner notes** (instructions for the routine).
3. The cloud routine (a Claude Code scheduled task, daily at 08:00 Paris,
   and at once when you approve on the site) follows
   [`scripts/suggestions/ROUTINE.md`](../scripts/suggestions/ROUTINE.md) for
   each `APPROVED` page: it checks the venue's own pages, fills in links and
   hours, finds the place on the map, looks for duplicates, writes the entry,
   and sets `READY` (or `DUPLICATE`, `NEEDS CHECK`, `ERROR`). **The routine
   can't change the repository** (its task has only the tool's copy
   attached, never this repository: see 11.6): it
   reads strangers' text and other sites, so it could be misled.
4. The site's own code (the publisher, `worker/publish.ts`, every ten minutes)
   checks each `READY` entry again (known fields only, the build's own checks,
   no word an audience mustn't see) and commits it to `main`, touching only
   the guide's `items.json` and its `img/`. The status becomes `PUBLISHING`,
   then `PUBLISHED` once the site runs that commit's build (usually within a
   couple of minutes). If the build fails, or the site still hasn't taken it
   45 minutes later, the publisher takes the commit back and sets `ERROR`.

### 11.2 状态 The statuses

| 状态 Status | 谁设 Set by | 意思 Meaning |
| --- | --- | --- |
| `NEW` | 服务器 the Worker | 刚收到 Just in |
| `ASKED` | 你 you | 已发邮件问推荐者 You emailed the sender |
| `APPROVED` / `REFUSED` | 你 you | 收录 / 不收录 Take it / don't |
| `PROCESSING` | 例程 the routine | 正在处理（两小时没完成就重新排队）Being worked on (free again after two hours) |
| `READY` | 例程 the routine | 条目已写好，等发布器 Entry written, waiting for the publisher |
| `PUBLISHING` / `PUBLISHED` | 发布器 the publisher | 已提交 / 已上线 Committed / live |
| `DUPLICATE` | 例程 the routine | 导览里已有，或别人推荐过（见 Result）Already in the guide, or sent before (see Result) |
| `NEEDS CHECK` | 例程、发布器 routine, publisher | 需要你决定（见 Result），改好后再设 `APPROVED` Needs your decision (see Result); set `APPROVED` again after |
| `ERROR` | 例程、发布器 routine, publisher | 出错（见 Result）Something failed (see Result) |
| `SPAM` | 你 you | 垃圾信息，忽略 Spam, ignored |

查重：同一个网址、50 米以内名字相近、同一场馆且日期重叠并有相同艺术家或相近的展名，都算重复。每条导览条目都带着它在 Notion 里的编号（`suggested.ref`），所以重复运行也不会加两次。条目编号（如 C3）从不重复使用；改级别（如 C 改 B）会换一个新编号，路线和日程里的引用一起改。

Duplicates: the same web address; within 50 m with a similar name; or the same
venue with overlapping dates and a shared artist or a similar show title. Each
entry carries its Notion page (`suggested.ref`), so running twice never adds
anything twice. Ids (such as C3) are never reused; a new tier (C to B) gives a
new id, and routes and events follow it.

保持一致：

- 导览的检查（构建、发布器和管理模式的编辑都用它）不许同一个推荐（同一个 `suggested.ref`）出现两次，也不许两个条目看起来是同一个展
  （同一场馆、日期不冲突、相同的艺术家或相近的展名）。发布器遇到这样的 `READY` 条目，就设成 `NEEDS CHECK`，不发布。
- 除了 `main`，每个分支的构建（`scripts/guides-main.mjs`）都把它的导览和 `main` 的比一比：`main` 上有发布器加的条目（带 `suggested`），
  这个分支却没有，构建就失败，并说把 `main` 合并进这个分支（GitHub 上的 **Update branch**）。所以分支的预览总带着已经发布的条目，
  合并时也丢不了。读不到 GitHub 时只提醒，不挡构建。
- 发布器每次运行都核对：Notion 里 `PUBLISHED` 的推荐，它的条目还在不在 `main` 上。不在了（后来的提交把它删了），就设成
  `NEEDS CHECK`，并在处理日志里记一条。要特意删掉一个已发布的条目，就把它的推荐也改成 `REFUSED`。

Keeping in step:

- The guide's check (the build, the publisher and admin edits all use it)
  refuses the same suggestion twice (one `suggested.ref` on two items), and
  two items that look like the same show (the same venue, dates that don't
  clash, a shared artist or a similar title). The publisher sets such a
  `READY` entry to `NEEDS CHECK` instead of publishing it.
- On every branch but `main`, the build (`scripts/guides-main.mjs`) compares
  the branch's guides with `main`'s: when `main` has an entry the publisher
  added (one with `suggested`) that the branch doesn't, the build fails and
  says to merge `main` into the branch (GitHub's **Update branch**). So a
  branch's preview always has the published entries, and a merge can't drop
  them. When GitHub can't be reached, it only warns.
- Every run, the publisher checks that each `PUBLISHED` suggestion's entry is
  still on `main`. When one isn't (a later commit took it out), it becomes
  `NEEDS CHECK`, with a line in the Processing log. To take a published
  entry out on purpose, set its suggestion to `REFUSED` too.

### 11.3 隐私 Privacy

- 推荐者的名字和电子邮箱只存在 **Contacts** 里（例程读不到），导览结束 90 天后自动删除（没有日期的导览：一年后），用导览旧地址
  （`access.json` 的 `moved`）发来的也一样。
- 只有推荐者在“署名”里填了名字，导览里才会写“由 … 推荐”。导览的文件在 GitHub 上公开，所以署名会留在历史记录里（向导里写明了）。
- 网络地址只用来限制频率，不保存。

- The sender's name and email are kept only in **Contacts** (the routine can't
  read it) and deleted 90 days after the guide ends (a year after sending for a
  guide without dates), those sent under one of the guide's old addresses
  (`access.json` "moved") too.
- The guide says who suggested an entry only with the name they gave under
  *Credit me*. The guide's files are public on GitHub, so that name stays in
  their history; the wizard says so.
- Internet addresses are used for rate limits only and aren't kept.

### 11.4 设置 Settings

只需设一次。Cloudflare 的 secret（不写进仓库）：

Once only. Cloudflare secrets (never in the repo):

| Secret | 用途 For |
| --- | --- |
| `NOTION_TOKEN` | 网站的 Notion 集成 The site's Notion integration (Suggestions, Contacts, log) |
| `TURNSTILE_SECRET_SUGGEST` | 推荐向导自己的 Turnstile The wizard's own Turnstile widget |
| `GITHUB_TOKEN` | 只限本仓库、Contents 读写的细粒度令牌（发布器）A fine-grained token, this repo only, Contents read/write (the publisher) |

- `wrangler.jsonc` 的 `vars`：三个 Notion 数据源的编号（`NOTION_SUGGESTIONS`、`NOTION_CONTACTS`、`NOTION_LOG`）。为空时推荐改用邮件。
- `src/content/guides/suggest.json`：Turnstile 的公开站点密钥（不是 secret）。为空时正式网站上不能推荐；本机和预览用 Cloudflare 的测试密钥。
- 云端例程：见 [11.6](#116-云端例程-the-routine-in-claudes-cloud)。

- `vars` in `wrangler.jsonc`: the three Notion data-source ids
  (`NOTION_SUGGESTIONS`, `NOTION_CONTACTS`, `NOTION_LOG`). Empty: suggestions
  are emailed instead.
- `src/content/guides/suggest.json`: the Turnstile widget's public site key
  (not a secret). Empty: no suggestions on the live site; `wrangler dev` and
  previews use Cloudflare's test key.
- The cloud routine: see [11.6](#116-云端例程-the-routine-in-claudes-cloud).

怎么建：

- **Turnstile**：在 Cloudflare 的 Turnstile 里给推荐向导单独建一个小组件，主机名只填 `kuschonink.com`（`www` 没有 DNS 记录）。它的站点密钥写进 `suggest.json`，密钥存成 `TURNSTILE_SECRET_SUGGEST`：两个必须来自同一个小组件。
- **Notion**：新建内部集成（Notion ▸ Settings ▸ Connections ▸ Develop or manage integrations），权限只要 Read content、Update content 和 Insert content，不要评论权限，用户信息选 No user information。正式网站的集成连接到“Field Guide suggestions (kuschonink)”页面（页面的 ••• ▸ Connections），测试集成连接到“… · test copies”页面。如果第一条推荐没有出现在 Notion 里，再把三个数据库分别连接给正式网站的集成。
- **GitHub 令牌**：细粒度令牌（fine-grained），只限本仓库，只要 Contents 读写。到期日选在 2027 年 2 月中旬以后：巴黎这份导览 11 月 15 日结束，联系人在 90 天后（2027 年 2 月 14 日）删除；以后只要还有导览收推荐，就要续。在日历里提前一周提醒自己：令牌过期后，发布器、管理模式的编辑和每天的联系人删除会悄悄停下，联系人就会留过期限；换上新令牌后接着做。
- **GitHub 规则集**（仓库的 Settings ▸ Rules ▸ Rulesets，针对 `main`）：只开 **Restrict deletions** 和 **Block force pushes**。不要开 Require a pull request、Require status checks 或 Restrict updates：发布器和管理模式的编辑都直接提交到 `main`（只往前，从不强推），这些规则会把它们挡住。

How to make them:

- **Turnstile**: a widget of its own for the wizard, with one hostname,
  `kuschonink.com` (`www` has no DNS record). Its site key goes in
  `suggest.json` and its secret in `TURNSTILE_SECRET_SUGGEST`: both from the
  same widget.
- **Notion**: an internal integration (Notion ▸ Settings ▸ Connections ▸
  Develop or manage integrations) with Read, Update and Insert content only:
  no comment capabilities, and No user information. Connect the site's
  integration to the page "Field Guide suggestions (kuschonink)" (the page's
  ••• ▸ Connections) and the test one to "… · test copies". If a first
  suggestion doesn't show up in Notion, connect the three databases to the
  site's integration one by one as well.
- **GitHub token**: fine-grained, this repository only, Contents read and
  write and nothing else. Make it expire after mid-February 2027: the Paris
  guide ends on 15 November and its contacts are deleted 90 days later, on
  14 February 2027; renew it for as long as guides take suggestions. Put a
  reminder in your calendar a week before: once it runs out, the publisher,
  admin mode's editing and the daily contact clean-up stop without a word,
  so contacts would be kept past their date. With a new token they carry on.
- **GitHub ruleset** (the repository's Settings ▸ Rules ▸ Rulesets, on
  `main`): only **Restrict deletions** and **Block force pushes**. Never
  Require a pull request, Require status checks or Restrict updates: the
  publisher and admin mode's edits commit straight to `main` (forward only,
  never forced), and those would stop them.

PR previews (Worker Previews, section 7) never get the real ones. The
`previews` block in `wrangler.jsonc` already gives them the test copies of the
databases (below) and accepts Turnstile's test keys
(`TURNSTILE_HOSTNAMES=example.com`). Their two secrets, set once on your own
computer with `npx wrangler preview base-config secret put NAME`:
`NOTION_TOKEN`, from a test Notion integration shared only with the page
"Field Guide suggestions (kuschonink) · test copies", and
`TURNSTILE_SECRET_SUGGEST` set to Cloudflare's test secret
`1x0000000000000000000000000000000AA`. Never a `GITHUB_TOKEN`: a preview names
no repository, so it never publishes.

PR 预览（Worker Previews，见第 7 节）从不用正式的值。`wrangler.jsonc` 的 `previews` 部分已经让它们用下面的测试数据库，
并接受 Turnstile 的测试密钥（`TURNSTILE_HOSTNAMES=example.com`）。它们的两个 secret 在自己电脑上用
`npx wrangler preview base-config secret put 名字` 设置一次：`NOTION_TOKEN`（一个只共享给
“Field Guide suggestions (kuschonink) · test copies”页面的测试 Notion 集成），以及
`TURNSTILE_SECRET_SUGGEST`，设成 Cloudflare 的测试密钥 `1x0000000000000000000000000000000AA`。
永远不给预览 `GITHUB_TOKEN`：预览没有仓库名，不会发布。

| Var | Test data source |
| --- | --- |
| `NOTION_SUGGESTIONS` | `d2a5fe18-8031-425e-a123-3969fb32fbe7` |
| `NOTION_CONTACTS` | `26a774fe-1de2-4760-a1c7-8700b1b62de5` |
| `NOTION_LOG` | `652c23d0-b96b-4cee-a9a3-d4708c1207b8` |

### 11.5 本机测试 Trying it locally

```bash
node scripts/dev/notion-standin.mjs 8798
```

`.dev.vars`（不进仓库 gitignored）里加：

Add to `.dev.vars` (gitignored):

```ini
NOTION_TOKEN=dev
NOTION_API=http://127.0.0.1:8798
NOTION_SUGGESTIONS=ds-suggestions
NOTION_CONTACTS=ds-contacts
NOTION_LOG=ds-log
TURNSTILE_SECRET_SUGGEST=1x0000000000000000000000000000000AA
TURNSTILE_HOSTNAMES=example.com,localhost
```

然后 `npm run build` 和 `npm run preview`，登录一份导览，用 **文件 ▸ 推荐地点…**。`http://127.0.0.1:8798/_dump` 显示存下了什么。

Then `npm run build` and `npm run preview`, log on to a guide and use **File ▸
Suggest a Place…**. `http://127.0.0.1:8798/_dump` shows what was kept.

### 11.6 云端例程 The routine in Claude's cloud

推荐流程**不需要你的电脑开着**：收推荐、批准和拒绝、发布（每 10 分钟）和到期删除联系方式（每天）都在 Cloudflare
的 Worker 里；核对和补全由 Claude Code 的云端定时任务（scheduled task，以前叫 routine，下面称“例程”）在 Anthropic
的服务器上完成。这个任务**只挂一个仓库：工具的副本 `itom123/kuschonink-routine`**，从来不挂这个仓库；副本由它自己的
GitHub Action 每 10 分钟从这个仓库更新。所以例程推不了这个仓库，只能写 Notion（见下面的“安全”）。

设置一次：

1. **Notion**：新建一个内部集成“Field Guide routine”，权限和上面一样（Read、Update、Insert content，不要评论权限，
   No user information）。在 **Suggestions** 和 **处理日志** 两个数据库各自的 ••• ▸ Connections 里分别连接它；
   **不要**连接它们所在的页面（那个页面里还有 Contacts）。复制它的令牌。
2. **工具的副本**：公开仓库 `itom123/kuschonink-routine`。里面只有 `scripts/suggestions/download.mjs` 取的文件（工具、工具
   引用的模块、各份导览的文件、`package.json` 和 ROUTINE.md），都来自网站当前运行的那个提交；`.download.json` 写着是哪个提交。
   它的工作流每 10 分钟运行一次，有变化才提交，副本自己的四样东西（`README.md`、`.gitignore`、`.claude/settings.json`、`.github/workflows/sync.yml`）
   也从这个仓库的 `scripts/suggestions/routine-repo/` 取。它用副本的部署密钥（deploy key，Actions secret `SYNC_DEPLOY_KEY`）
   推送，提交记在你（itom123）名下：GitHub 按最后改过定时那一行的账号来跑定时任务。一条规则（ruleset）只让部署密钥新建、
   更新、删除分支，你自己的推送和例程的推送都会被拒。所以不要手改副本：改这个仓库
   里的那四样东西，下一次同步就会带过去。副本的 `.claude/settings.json` 让例程照写的 `./tool …` 和 `npm ci --no-audit --no-fund`
   直接运行，拒绝 `git push`、`git commit`、`git remote` 和 `gh`；每次同步还写一份 `package-lock.json`，让例程的 `npm ci` 装的
   正是锁定的 sharp。`.synced` 每月变一次，让副本不会 60 天没有提交（那样 GitHub 会关掉公开仓库的定时
   工作流）；要是还是关了，在 Actions ▸ Sync ▸ **Enable workflow** 重新打开。要是工作流开着，定时却从来不跑（Actions 里
   只有手动运行的记录），那是最后改定时那一行的提交出自没有副本权限的账号，关掉再打开也没用：在这个仓库里改一下那一行的值，
   等网站运行了那个提交，再手动运行一次工作流（Actions ▸ Sync ▸ **Run workflow**）；同步会用你的账号提交这个改动，之后定时就照常运行。
   要重建的话：新建这个公开仓库，放进那四样东西（用你自己的 GitHub 账号提交：GitHub 按最后改过定时那一行的账号来跑定时任务，
   没有这个仓库权限的账号改的，定时可能永远不跑）；
   生成一对 SSH 密钥，公钥加成可写的部署密钥（Settings ▸ Deploy keys，勾选 Allow write access），私钥存成 Actions secret
   `SYNC_DEPLOY_KEY`，不在别处留副本；加上规则（所有分支：Restrict creations、Restrict updates、Restrict deletions、Block
   force pushes；Bypass list 只有 Deploy keys）；然后在 Actions ▸ Sync ▸ **Run workflow** 运行一次。
3. **环境**：在 claude.ai/code 输入框下面的环境菜单里，点一个环境的齿轮 ▸ **Edit cloud environment**（或新建一个）：
   - **Network access** 选 **Full**（要打开画廊网站和地理编码服务，还要从 kuschonink.com 读网站当前的版本号、从 npm 装 sharp）；
   - **Network secrets** ▸ **Add secret**：Secret type 用 **Bearer**，主机 `api.notion.com`，Header name `Authorization`、
     Prefix `Bearer`（默认就是），Value 填第 1 步的令牌 ▸ **Add**；最后 **Save changes**。会话本身看不到这个令牌。
     网络 secret 要 Pro、Max、Ultra、Team 或 Enterprise 套餐，而且是 Anthropic 托管的环境。
   - **Setup script** 留空。不需要环境变量（数据库编号在副本的 `wrangler.jsonc` 里），**也绝不要放 GitHub 令牌**
     （`GH_TOKEN`、`GITHUB_TOKEN`）。
4. **定时任务**：[claude.ai/code/routines](https://claude.ai/code/routines) ▸ **New task**（有的账号显示 Routines 和
   **New routine**，或者打开一整页的表单）：
   - 名字，比如 `Field Guide suggestions`；提示词照抄：

     ```text
     Process the approved suggestions for my Field Guide (kuschonink.com). The repository attached to this task, itom123/kuschonink-routine, is my own copy of my suggestions tool and my guides' files, which its GitHub Action takes from my site's repository, itom123/kuschonink.com. Read scripts/suggestions/ROUTINE.md in it and follow it: it has you run npm ci --no-audit --no-fund (for sharp) and the tool, ./tool, whose commands (list, claim, show, match, geocode, check, picture, web-picture, ready, mark, log) read and update the suggestions in my Notion, and check once with curl that api.github.com refuses itom123/kuschonink.com. Never commit, push, open pull requests or attach another repository.

     If this run was started with a text, it says why (approved: …, or manual: …).
     ```

     为什么要副本：Claude Code 的自动模式（auto mode）会检查例程要执行的每条命令。它信任会话自己的仓库里的代码，却拒绝运行下载来的
     代码，提示词写明了那条命令也一样（2026 年 11 月 7 日，不挂仓库、自己下载工具的几次运行都被拒：“Code from External”）。
     副本让例程把工具当成自己的仓库，又不用挂这个仓库。

   - **Trigger**：**API** 和 **Schedule** 都要（选每天，下面再定时间）。管理模式的“收录”和“立即运行”用 API 触发器。
   - **仓库：只选 `itom123/kuschonink-routine`**，**永远不要**选 `itom123/kuschonink.com`。
   - **Cloud environment**：第 3 步的环境。
   - **Connectors**：全部去掉。
   - **Create**。弹出的 **API token** 只显示这一次：复制下来，第 5 步用。

   时间：建好后在任务名旁边的菜单 ▸ **Edit** 里选 **Custom**，填 `CRON_TZ=Europe/Paris 0 8 * * *`（每天巴黎时间 8:00；调度器
   通常晚几分钟才开始）。框里原来有别的 `CRON_TZ=` 就改成 `Europe/Paris`；不接受这个前缀的话写 UTC 时间：冬令时 `0 7 * * *`，
   夏令时 `0 6 * * *`。推荐不多，一天一次就够：你在管理模式里收录一条推荐时，例程会立刻运行，每天这一次只是兜底。没事可做的
   运行会立刻结束，不记日志。
5. **API 触发器**：任务菜单 ▸ **Edit** ▸ **Trigger** 那一行的 API 面板 ▸ 复制 **Fire URL**（建任务时没复制令牌的话，在这里
   **Generate token**，同样只显示一次；以后换令牌用 **Regenerate**，不要删：删掉令牌就删掉了 API 触发器）。把两者存成
   Cloudflare secret `ROUTINE_FIRE_URL` 和 `ROUTINE_TOKEN`，只给正式网站、不给预览（在切换到 Worker Previews 之后再存，
   见第 7 节）。管理模式的“收录”和“立即运行”用它。**Run now** 和 API 触发合计每个任务每小时最多 30 次。
6. 试一次：在任务里 **Run now**，看它的会话记录。应该看到：只克隆了 `kuschonink-routine`；`.download.json` 的 `commit`
   是网站当前运行的提交（刚部署完的十分钟里可能还是上一个）；GitHub 对 `itom123/kuschonink.com` 的检查得到 403
   （“… is not enabled for this session”）；然后列出待处理的推荐。带文字触发的运行（管理模式的“收录”和“立即运行”）会在
   第二条消息里收到那段文字，于是再查一遍队列。要是有命令被权限检查拒绝（“denied by the Claude Code auto mode classifier”），
   会话记录里写着是哪一条。Notion 的处理日志只在真的处理了推荐，或者例程因为能读到这个仓库而停下时，才有新的一行。

安全：

- 触发时带的文字（`approved: …`、`manual: …`）会被包在 `<routine-fire-payload>` 里、标成不可信的数据；提示词只把它
  当作说明，所以没关系。
- **这个仓库从来不挂，就推不了它**：会话里所有发往 GitHub 的请求都经过 Anthropic 的 GitHub 代理，它只为任务挂着的仓库
  （这里只有副本）办事。对别的仓库，公开的也一样，API 请求和源码压缩包都回 403（“… is not enabled for this session”）。
  （网络 secret 也从来不会加到发往 GitHub 的请求上。）每次运行在处理之前都先检查这个仓库的 403；如果 GitHub 反而回了内容，
  它什么都不处理，在处理日志里记一条 `Failed`：把这个仓库从任务上去掉。永远不要给任务挂这个仓库，也不要给它的环境 GitHub
  令牌。代理的 403 里提到会话可以申请挂仓库（`add_repo`）；文档没说定时任务能不能不经你同意这样做，ROUTINE.md 不许例程这样做。
- **副本也改不了**：副本的规则只让它的部署密钥（只有它的工作流拿得到）更新分支，每次同步又从这个仓库重写一遍。云端会话结束时，
  内置的 Stop hook 会要求提交没跟踪的文件；副本的 `.gitignore` 让例程留下的文件不算在内，ROUTINE.md 也不许例程提交。
  例程连 GitHub 用的是你在 claude.ai 连的权限：用 Claude GitHub App 的话，例程改不了副本的规则；用 `/web-setup` 的令牌的话
  （它有管理员权限），被误导的例程理论上能先删规则再推送，挡住它的只有副本的 `.claude/settings.json` 和自动模式的检查。
- **GitHub 连接失效时**：例程最多跳过 72 小时，然后任务会自己关掉。重新连接 GitHub，再在任务里把它打开。
- **它读什么**：副本，也就是 download.mjs 从 raw.githubusercontent.com 取的文件，全部来自同一个提交：网站当前运行的那个
  （页面里的版本号，发布器也认它；网站没给就用 `main`），最多晚 10 分钟。所以例程的检查就是发布器的检查，说明也和工具是
  同一个版本。
- **被误导的例程还能做什么**：只能写例程的集成连接的两个数据库（Suggestions 和处理日志，读不到 Contacts）。`READY` 的条目
  还要通过发布器的检查才会进导览，而且只改那份导览的 `items.json` 和 `img/`。

Nothing here needs your computer to be on: taking suggestions, approving and
refusing, publishing (every 10 minutes) and deleting contact details when due
(daily) all happen in the Cloudflare Worker; checking and completing them is
a Claude Code scheduled task (formerly a routine; "the routine" below) on
Anthropic's servers. The task has **one repository attached: the tool's copy,
`itom123/kuschonink-routine`**, never this repository. The copy's own GitHub
Action refreshes it from this repository every 10 minutes. So the routine has
no way to push to this repository; it only writes to Notion (see Safety below).

Set it up once:

1. **Notion**: a new internal integration, "Field Guide routine", with the
   same capabilities (Read, Update and Insert content; no comments, No user
   information). Connect it to the **Suggestions** database and to the
   **Processing log**, each on its own (••• ▸ Connections on each), **never**
   to the page that holds them: that page also holds Contacts. Copy its token.
2. **The tool's copy**: the public repository `itom123/kuschonink-routine`. It
   holds only what `scripts/suggestions/download.mjs` takes (the tool, the
   modules it imports, the guides' files, `package.json` and ROUTINE.md), all
   from the commit the live site runs; `.download.json` says which. Its
   workflow runs every 10 minutes and commits when something changed; the
   copy's own four files (`README.md`, `.gitignore`, `.claude/settings.json`,
   `.github/workflows/sync.yml`) come from this repository's
   `scripts/suggestions/routine-repo/` too. It pushes with the copy's deploy
   key (the Actions secret `SYNC_DEPLOY_KEY`), with its commits credited to
   you (itom123), since GitHub runs a schedule for the account that last
   changed its cron line. A ruleset lets only deploy
   keys create, update or delete a branch, so your own pushes and a run's are
   refused. So don't edit the copy: change those four files here, and the
   next sync takes them there. The copy's `.claude/settings.json` lets a
   run's `./tool …` and `npm ci --no-audit --no-fund` run as written, and
   refuses `git push`, `git commit`, `git remote` and `gh`; each sync also
   writes `package-lock.json`, so that the run's `npm ci` installs exactly
   the sharp locked there. `.synced` changes once a month, so that the
   copy never goes 60 days without a commit (GitHub then turns a public
   repository's scheduled workflows off); if it was turned off anyway, turn
   it back on in Actions ▸ Sync ▸ **Enable workflow**. If the workflow is on
   but its schedule never runs (Actions lists only runs started by hand), the
   last change to its cron line was committed by an account without access
   to the copy, and turning it off and on doesn't help: change that line's
   value here and, once the site runs that commit, run the workflow once by
   hand (Actions ▸ Sync ▸ **Run workflow**); the sync commits the change as
   you, and the schedule runs from then on. To make it again:
   create that public repository with the four files, committed as your own
   GitHub account (GitHub runs a schedule for the account that last changed
   its cron line, and one changed by an account without access to the
   repository may never run); make an SSH key pair,
   add the public key as a deploy key with write access (Settings ▸ Deploy
   keys, Allow write access) and keep the private key only as the Actions
   secret `SYNC_DEPLOY_KEY`; add the ruleset (all branches: Restrict
   creations, Restrict updates, Restrict deletions, Block force pushes; only
   Deploy keys in the bypass list); then run the workflow once (Actions ▸
   Sync ▸ **Run workflow**).
3. **Environment**: in the environment menu under the message box at
   claude.ai/code, the gear on an environment ▸ **Edit cloud environment**
   (or add a new one):
   - **Network access**: **Full** (for gallery sites and the geocoders, and
     to read the live site's build id from kuschonink.com and install sharp
     from npm);
   - **Network secrets** ▸ **Add secret**: Secret type **Bearer**, host
     `api.notion.com`, Header name `Authorization` and Prefix `Bearer` (the
     defaults), Value the token from step 1 ▸ **Add**; then **Save changes**.
     The session never sees the token. Network secrets need a Pro, Max,
     Ultra, Team or Enterprise plan and an Anthropic-hosted environment.
   - **Setup script**: leave it empty. No environment variables (the
     database ids come with the copy's `wrangler.jsonc`), and **never a
     GitHub token** (`GH_TOKEN`, `GITHUB_TOKEN`).
4. **Scheduled task**: [claude.ai/code/routines](https://claude.ai/code/routines)
   ▸ **New task** (some accounts say Routines and **New routine**, or open a
   full-page form):
   - A name, such as `Field Guide suggestions`, and this prompt, as it is:

     ```text
     Process the approved suggestions for my Field Guide (kuschonink.com). The repository attached to this task, itom123/kuschonink-routine, is my own copy of my suggestions tool and my guides' files, which its GitHub Action takes from my site's repository, itom123/kuschonink.com. Read scripts/suggestions/ROUTINE.md in it and follow it: it has you run npm ci --no-audit --no-fund (for sharp) and the tool, ./tool, whose commands (list, claim, show, match, geocode, check, picture, web-picture, ready, mark, log) read and update the suggestions in my Notion, and check once with curl that api.github.com refuses itom123/kuschonink.com. Never commit, push, open pull requests or attach another repository.

     If this run was started with a text, it says why (approved: …, or manual: …).
     ```

     Why a copy: Claude Code's auto mode checks each command a run makes.
     It trusts code in the session's own repository, but it refuses to run
     code the run downloaded, even when the prompt names the exact command
     (on 7 Nov 2026, every run that downloaded the tool itself, with no
     repository attached, was refused: "Code from External"). The copy gives
     the routine the tool as its own repository without attaching this one.

   - **Trigger**: both **API** and **Schedule** (daily, its time set
     below). Admin mode's Approve and Run Now use the API trigger.
   - **Repository: `itom123/kuschonink-routine` only.** Never
     `itom123/kuschonink.com`.
   - **Cloud environment**: the one from step 3.
   - **Connectors**: remove them all.
   - **Create**. The **API token** it then shows is shown only once: copy it
     for step 5.

   Schedule: once it exists, open the menu next to its name ▸ **Edit**,
   pick **Custom** and enter `CRON_TZ=Europe/Paris 0 8 * * *` (every day at
   8:00, Paris time; the scheduler usually starts a few minutes later). If
   the field already starts with another `CRON_TZ=`, change it to
   `Europe/Paris`; if it won't take the prefix, write the hour in UTC:
   `0 7 * * *` in winter, `0 6 * * *` in summer. Once a day is enough for
   the few suggestions there are: approving one in admin mode starts a run
   at once, and the daily run only catches what is left. A run with nothing
   to do stops at once and logs nothing.
5. **API trigger**: the task's menu ▸ **Edit** ▸ the API panel in the
   **Trigger** row ▸ copy the **Fire URL** (and **Generate token** there if
   you didn't copy one at **Create**; it too is shown once. To change the
   token later, use **Regenerate**: deleting it deletes the API trigger).
   Save them as the Cloudflare secrets `ROUTINE_FIRE_URL` and
   `ROUTINE_TOKEN`, for the live site only, never for previews (after the
   switch to Worker Previews, see section 7). Admin mode's Approve and Run
   Now use it. **Run now** and API fires share 30 an hour per task.
6. Try it: **Run now** on the task, and read its session. It should clone
   only `kuschonink-routine`, find in `.download.json` the commit the live
   site runs (or the one before, in the 10 minutes after a deploy), get a 403
   from GitHub for `itom123/kuschonink.com` ("… is not enabled for this
   session"), then list the queue. A run started with a text (admin mode's
   Approve and Run Now) gets the text as a second message and goes through
   the queue again. If the permission check refused a command ("denied by
   the Claude Code auto mode classifier"), the session says which. The
   Processing log only gets a line when a suggestion was handled, or when a
   run stopped because it could reach this repository.

Safety:

- The text a run is started with (`approved: …`, `manual: …`) arrives wrapped
  in a `<routine-fire-payload>` block marked as untrusted data. The prompt
  only takes it as information, so that's fine.
- **This repository is never attached, so no pushes to it.** Every GitHub
  request from the session goes through Anthropic's GitHub proxy, which only
  serves the repositories attached to the task: here, only the copy. For any
  other, even a public one, API requests and source archives get a 403 ("…
  is not enabled for this session"). (Network secrets are never added to
  GitHub requests either.) Every run checks for this repository's 403 before
  it looks at the queue; if GitHub answers instead, it processes nothing and
  logs `Failed`: take this repository off the task. Never attach it to the
  task, and never give the task's environment a GitHub token. The proxy's 403
  says a session can ask for a repository to be attached (`add_repo`); the
  docs don't say whether a scheduled task can do that without you, and
  ROUTINE.md forbids it.
- **The copy can't be changed by a run either**: its ruleset lets only its
  deploy key (which only its workflow has) update a branch, and every sync
  rewrites it from this repository. When a cloud session ends, its built-in
  Stop hook asks to commit untracked files; the copy's `.gitignore` leaves
  out what a run makes, and ROUTINE.md forbids commits. A run reaches GitHub
  with the access you connected on claude.ai: through the Claude GitHub App
  it can't change the copy's ruleset; through a `/web-setup` token (which is
  an admin's) a misled run could in principle delete the ruleset and then
  push, and only the copy's `.claude/settings.json` and the auto mode check
  stand in its way.
- **If claude.ai's GitHub connection lapses**, runs are skipped for up to
  72 hours and then the task turns itself off: reconnect GitHub, then turn
  the task back on.
- **What a run reads**: the copy, that is, the files download.mjs takes from
  raw.githubusercontent.com, all from one commit: the one the live site runs
  (the build id in its pages, which the publisher also goes by), or `main` if
  the site gives none, at most 10 minutes behind. So the routine's checks are
  the publisher's own, and its instructions go with its tool.
- **What a misled run could still do**: write to the two databases the
  routine's integration is connected to (Suggestions and the Processing log;
  never Contacts). A `READY` entry still has to pass the publisher's checks
  to reach the guide, and touches only that guide's `items.json` and `img/`.

---

## 12. 地址与存档 Addresses and the archive

每份导览都有一个永久的地址，过去的导览留在原处，新的导览按城市和年月往上加。

- **写法**：`/guides/<城市>-<年>-<月>`，如 `paris-2026-11`（2026年11月的巴黎导览）、`lisbon-2027-06`。没有日期的导览写 `<城市>-<主题>`，如 `paris-cafes`。全部小写，用连字符，不带重音（`São Paulo` 写成 `sao-paulo`）。城市部分来自 `guide.json` 的 `city`，构建会检查名字是否以它开头。
- **地址一经分享就不再改**。导览结束后也留在原来的地址：那是它的存档。
- **`/guides`** 进入排在最前面的那份列出的导览（`"listed": true`，按 `access.json` 的顺序）。
- **`/guides/<城市>`**，如 `kuschonink.com/guides/paris`，进入这个城市排在最前面的那份列出的导览。想分享“当前的巴黎导览”，就发这个链接：明年的巴黎导览列出、排到前面以后，它自己就会跟过去。
- **新的一年**：复制文件夹，命名为 `paris-2027-11`，在 `access.json` 里把它放在最前面，`"listed": true`。
- **存档**：把旧导览的 `"listed"` 改成 `false`。它不再出现在密码对话框的选择里，`/guides` 和 `/guides/paris` 也不再进入它；但原来的地址照样能用，凭密码照样能打开。
- **完全下线**：删掉它的两个文件夹（`src/content/guides/<名字>/` 和 `public/guides/<名字>/`）以及 `access.json` 里它的几行。之后这个地址显示“网页不存在”。不要把旧地址再用在另一份导览上。
- **不得不改名时**（很少）：把两个文件夹改名，改 `access.json` 里 `guides` 和 `tiles` 的名字，再在 `moved` 里加一行 `"<旧名>": "<新名>"`。旧地址（包括后面的图片、瓦片、登录）会永久转到新地址；用旧名发来、还在 Notion 里的推荐照样能发布。例如，这份巴黎导览原来叫 `paris-photo-days-2026`。

Every guide has an address for good: past guides stay where they are, and new
ones are added by city and month.

- **The pattern**: `/guides/<city>-<yyyy>-<mm>`, such as `paris-2026-11` (the
  Paris guide for November 2026) or `lisbon-2027-06`. A guide without dates is
  `<city>-<topic>`, such as `paris-cafes`. All lower case, with hyphens and no
  accents (`São Paulo` is `sao-paulo`). The city part comes from `city` in
  `guide.json`, and the build checks that the slug starts with it.
- **An address never changes once shared.** When a guide is over, it stays at
  its address: that is its archive.
- **`/guides`** opens the first listed guide (`"listed": true`, in
  `access.json` order).
- **`/guides/<city>`**, such as `kuschonink.com/guides/paris`, opens that
  city's first listed guide. Share it for "the current Paris guide": once next
  year's Paris guide is listed and first, the link follows by itself.
- **A new year**: copy the folder as `paris-2027-11`, put it first in
  `access.json`, with `"listed": true`.
- **Archiving**: set the old guide's `"listed"` to `false`. It leaves the
  password box's choice, and `/guides` and `/guides/paris` stop going there,
  but its address still works and its password still opens it.
- **Taking one offline**: delete its two folders (`src/content/guides/<slug>/`
  and `public/guides/<slug>/`) and its lines in `access.json`. The address then
  shows "page not found". Never reuse an old address for another guide.
- **If a name must change** (rarely): rename both folders, change the name under
  `guides` and `tiles` in `access.json`, and add `"<old>": "<new>"` under
  `moved`. The old address, and everything under it (pictures, tiles, log-on),
  redirects there for good, and suggestions still in Notion under the old name
  still publish. This Paris guide, for example, was `paris-photo-days-2026`.

---

## 13. 吃饭、看展、看摄影：餐厅导览 Eating, exhibitions, photography: the restaurant guide

### 13.1 读者先选看什么 Readers choose what to see

密码对话框上方有选项卡：**吃饭的地方**、**看展览**、**看摄影**。选项卡来自 `access.json` 的 `kinds`（顺序也在那里），每份导览在自己的 `guide.json` 里用 `"kinds"` 写明属于哪几类，主要的放在最前面：

- `paris-restaurants`：`["food"]`；
- `paris-2026-11`：`["photography", "exhibitions"]`（它是摄影展导览，所以两张选项卡都有它）。

单击另一张选项卡，会打开那一类第一份导览的密码对话框；如果当前这份导览也属于那一类，就只换选项卡。一类里有不止一份导览时，“导览”框里列出这一类的导览。没有 JavaScript 时，选项卡就是链接。导览里的 **文件 ▸ 打开导览…** 也按这几类分组。至少有两类导览列出时才显示选项卡。

以后有了真正的“看展览”导览，就把 `"exhibitions"` 从 `paris-2026-11` 里去掉，只写在新导览里。

The password box has tabs on top: **Places to eat**, **Exhibitions**,
**Photography**. They come from `kinds` in `access.json` (in that order), and
each guide says which it is in its own `guide.json` `"kinds"`, its main one
first: `paris-restaurants` is `["food"]`; `paris-2026-11` is
`["photography", "exhibitions"]` (a guide to photography shows, so under both).
Another tab opens the box of that kind's first guide, or, if this guide is of
that kind too, only changes the tab. With several guides of one kind, the Guide
box lists that kind's. Without JavaScript the tabs are links. **File ▸ Open
Guide…** in a guide groups the guides the same way. The tabs show once two kinds
have a listed guide. When there is a real exhibitions guide, take
`"exhibitions"` out of `paris-2026-11`.

### 13.2 密码 The password

餐厅导览用访客的密码（`access.json`：`"paris-restaurants": ["visitor"]`），学员的密码也能打开。读者已经登录摄影导览的话，打开餐厅导览不用再输密码。

如果想让餐厅导览用自己的密码：登录 cookie 一次只记一类读者，换一类读者登录会把另一类注销。所以要先改 Worker 的 cookie（每类读者一个），再加一类读者（第 6 节）。请让 Claude 一起做。

The restaurant guide opens with the visitors' password (`"paris-restaurants":
["visitor"]` in `access.json`); the participants' password opens it too, and
someone logged on to the photography guide needs no password again. For a
password of its own: the log-on cookie holds one audience at a time, so logging
on as another audience logs the first one out. That needs a change to the
Worker's cookie (one per audience) before adding an audience (section 6): ask
Claude for both together.

### 13.3 类别和价位 Categories and prices

- **类别就是分级**：A“米其林与餐厅周”（米其林指南的星级、必比登推介和其他入选餐厅，加上巴黎餐厅周 restaurantweek.fr 的餐厅：这就是“米其林”那份名单），B“日常餐厅”，C“咖啡与甜点”（含几家酒吧）。每家是否真有米其林评级，看它的 ★、Bib 或“指南”标记。`labels.tier` 写了“类别”，所以导览上方有“类别”框。
- **巴黎餐厅周（2026 年 11 月 1–15 日）**：参加的餐厅带主题 `restaurant-week`（“菜系”框里的第一项），`price` 先写餐厅周的套餐和价格，再写平时的价格，`links` 第一个是 restaurantweek.fr 上的预订页。活动结束后，把主题和餐厅周的价格删掉，或换成下一届的。
- **价位**：`costs` 定义四档，`"€"` 人均 €25 以下、`"€€"` €25–50、`"€€€"` €50–100、`"€€€€"` €100 以上（一个人的餐费，不含酒水）。每家在 `items.json` 里写 `"cost": "€€"`，`price` / `priceZh` 写具体价格。
- **米其林**：`"award": "1-star"`（`3-stars`、`2-stars`、`1-star`、`bib`、`selected`），列表和详情里显示 ★、Bib 或“指南”。以 2026 年米其林指南（法国）为准；每年三月新指南出来后，请 Claude 核对一次。
- **菜系**：`themes`（法餐、日料、韩餐、中餐及其他亚洲菜、烤肉、拉面……），导览上方的“菜系”框。
- 有类别或价位框的导览，三个框各自写着名字（“价位：不限”），在手机上并排一行。

- **Categories are the tiers**: A Michelin & Restaurant Week (the Michelin
  Guide's stars, Bib Gourmand and other picks, and the restaurants of Paris
  Restaurant Week, restaurantweek.fr: the "Michelin" list), B Everyday tables,
  C Cafés and sweets (and a few bars). Whether a place really has a Michelin
  distinction shows in its ★, Bib or Guide mark. `labels.tier` is "Category",
  so the guide has a Category box.
- **Paris Restaurant Week (1–15 November 2026)**: its restaurants carry the
  theme `restaurant-week` (first in the Cuisine box); `price` gives the event's
  menus and prices first, then the usual ones; the first of `links` is the
  booking page on restaurantweek.fr. After the event, take the theme and the
  event prices out, or update them for the next one.
- **Price levels**: `costs` defines four, `"€"` under €25 a head, `"€€"`
  €25–50, `"€€€"` €50–100, `"€€€€"` over €100 (food for one, without drinks).
  Each place has `"cost": "€€"`, and its menu prices in `price` / `priceZh`.
- **Michelin**: `"award": "1-star"` (`3-stars`, `2-stars`, `1-star`, `bib`,
  `selected`), shown as ★, Bib or Guide. From the MICHELIN Guide France 2026;
  ask Claude to check them each March, when the new guide comes out.
- **Cuisine**: `themes` (French, Japanese, Korean, Chinese and other Asian,
  grills, noodles…), the Cuisine box.
- With a Category or Price box, the three boxes name themselves ("Price: any")
  and share one row on a phone.

一家新餐厅的例子 An example:

```json
{
  "id": "B82", "tier": "B", "name": "Chez Exemple",
  "subtitle": "Neo-bistro", "subtitleZh": "新派小酒馆", "by": "Name of the chef",
  "zone": "bastille", "themes": ["french"],
  "why": "One or two plain sentences: what you eat and why go.", "whyZh": "一两句话：吃什么，为什么值得去。",
  "address": "1 Rue Exemple, 75011 Paris",
  "cost": "€€", "price": "Lunch €24; dinner about €45", "priceZh": "午餐 €24；晚餐人均约 €45",
  "note": "Book a few days ahead.", "noteZh": "建议提前几天预订。",
  "links": ["https://example.org", "https://maps.google.com/?cid=1234567890"],
  "coordinates": [2.3801, 48.8536]
}
```

### 13.4 从 Google 列表加餐厅（小心机器人检测）Adding places from a Google list, gently

Google 会识别机器人：短时间里请求太多，就会弹验证码或者拒绝。所以：

1. 把列表在 Google 地图里设成“任何知道链接的人都能查看”，把链接发给 Claude（链接不要写进仓库：仓库是公开的）。
2. Claude 运行 `node scripts/google-list.mjs <链接> --guide paris-restaurants`。它只向 Google 请求一次（和 Google 地图网页自己的请求一样），一小时内再运行就读本机保存的结果；只保存地点，不保存列表主人的名字或头像。Google 回的不是列表时（验证码页、同意页、429……）它立刻停下，不会重试。
3. 草稿在 `.google-lists/` 里（不进仓库）：新的地点、导览里已有的（按 `links` 里的 Google 地图页面或名字和距离对上）、列表里已经没有的。
4. 每家新店的类别、价位、米其林评级和文字，从餐厅官网、米其林指南和媒体查，**不从 Google 一家一家地抓**。查清了再写进 `items.json`。查不到的先记在 `src/content/guides/paris-restaurants/README.md` 的“待核实”里。
5. 万一 Google 不给：等一个小时以上再试一次；或者在 takeout.google.com 导出“已保存”的列表（CSV）发给 Claude。

Google watches for robots: too many requests and it shows a CAPTCHA or says
no. So:

1. Share the list in Google Maps ("Anyone with the link") and send the link to
   Claude. Keep the link out of the repository: it is public.
2. Claude runs `node scripts/google-list.mjs <link> --guide paris-restaurants`.
   It asks Google once (the same request the Maps page makes); within the hour
   it reads its saved copy instead. It keeps the places only, never the list
   owner's name or picture. If Google answers with anything but the list (a
   CAPTCHA, a consent page, 429…), it stops at once and never retries.
3. The draft is in `.google-lists/` (never committed): new places, those the
   guide has (matched by the Google Maps page in `links`, or by name and
   distance), and those the list no longer has.
4. Each new place's category, price, Michelin distinction and words come from
   its own pages, the MICHELIN Guide and the press, **never from Google one
   place at a time**. Then it goes into `items.json`. What can't be checked
   waits under "Waiting for a check" in
   `src/content/guides/paris-restaurants/README.md`.
5. If Google says no: wait an hour or more and try once more, or export the
   list from takeout.google.com (Saved, as CSV) and send that to Claude.

导览本身照样有密码、不进搜索引擎（第 1 节），所以别人的机器人也读不到这份名单。The guide itself stays behind the password and out of search engines (section 1), so other people's robots can't read the list either.

