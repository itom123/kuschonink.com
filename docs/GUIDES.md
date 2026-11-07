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

---

## 1. 导览是什么 What Field Guide is

**导览（Field Guide）** 是 Xiangyin 98 桌面上的一个程序，用来放有密码保护的城市导览：
一张地图、推荐地点（分 A、B、C 三级）、路线、日程和说明文字。地址是
`kuschonink.com/guides/<名字>`，第一份是 `paris-photo-days-2026`。

- 没有密码时，只能看到程序名“导览”和每份导览的中性标题，看不到任何地点或日程。
- 输入密码后，服务器（Cloudflare Worker）决定你属于哪一类读者（audience），给你那一类读者的版本。
  “访客”（visitor）看到公开内容；“学员”（fotofilmic）看到访客的全部内容，另加只给学员的内容。
- 导览页面不进搜索引擎（`noindex`，不在 sitemap 里）。
- 内容全部是仓库里的 JSON 文件。改了 `main` 上的文件，大约一分钟后网站就更新。
  数据有错时构建会失败，网站保持原样，不会坏掉。

**Field Guide (导览)** is a program on the Xiangyin 98 desktop for city guides
behind a password: a map, recommended places in three tiers (A, B, C), routes,
dates and texts. A guide lives at `kuschonink.com/guides/<slug>`; the first is
`paris-photo-days-2026`.

- Without a password, people see only the program's name and each guide's
  neutral public title. No places, no dates.
- With a password, the server (the Cloudflare Worker) works out which
  **audience** the visitor belongs to and serves that audience's version.
  Visitors (`visitor`) see the public content. Participants (`fotofilmic`) see
  everything visitors see, plus what is marked for them.
- Guide pages are `noindex` and left out of the sitemap.
- Everything is JSON in this repo. A change on `main` is live in about a
  minute. If the data has a mistake, the build fails and the site stays as it
  was.

---

## 2. 文件在哪里 Where things are

```
src/content/guides/
  access.json                    谁能打开哪份导览 who may open which guide
  paris-photo-days-2026/         一份导览一个文件夹 one folder per guide
    guide.json                   标题、日期、假日、分级、主题、片区、说明文字 title, dates, holidays, tiers, themes, zones, texts
    items.json                   推荐地点 the recommended places
    places.json                  参考点（字母牌）reference points (letter plates)
    events.json                  日程和每日安排 events and day plans
    routes.json                  路线 routes
    listings.json                官方来源的次要条目 secondary records from an official source
    map.json                     底图 base maps
    README.md                    速查表 a cheat-sheet
public/guides/paris-photo-days-2026/
  img/                           图片 pictures
  map/                           底图图片 base-map images
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
| `guide.json` | <https://github.com/itom123/kuschonink.com/edit/main/src/content/guides/paris-photo-days-2026/guide.json> |
| `items.json` | <https://github.com/itom123/kuschonink.com/edit/main/src/content/guides/paris-photo-days-2026/items.json> |
| `places.json` | <https://github.com/itom123/kuschonink.com/edit/main/src/content/guides/paris-photo-days-2026/places.json> |
| `events.json` | <https://github.com/itom123/kuschonink.com/edit/main/src/content/guides/paris-photo-days-2026/events.json> |
| `routes.json` | <https://github.com/itom123/kuschonink.com/edit/main/src/content/guides/paris-photo-days-2026/routes.json> |
| `listings.json` | <https://github.com/itom123/kuschonink.com/edit/main/src/content/guides/paris-photo-days-2026/listings.json> |
| `map.json` | <https://github.com/itom123/kuschonink.com/edit/main/src/content/guides/paris-photo-days-2026/map.json> |
| 上传图片 Upload pictures | <https://github.com/itom123/kuschonink.com/upload/main/public/guides/paris-photo-days-2026/img> |

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

- JPEG, at most 640 px wide and **no more than 1 MB**.
- **Strip the phone's location data first**: on Windows, right-click the file
  → Properties → Details → *Remove Properties and Personal Information*; on an
  iPhone, tap *Options* when sharing and turn *Location* off.
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

1. 复制整个文件夹 `src/content/guides/paris-photo-days-2026/`，改名，比如 `lisbon-2027`（小写，连字符）。
2. 改 `guide.json`：标题、`public`（中性的公开标题，不写人名、地点或团体名）、`listed`（是否在首页列出）、
   `city`、`timezone`（如 `"Europe/Lisbon"`）、`checked`、日期、分级、主题、片区、`texts`、`sensitive`。
3. 清空 `items.json`、`places.json`、`events.json`、`routes.json`、`listings.json` 里的旧内容，再填新的。
   每个文件都要留着，列表可以是空的。没有日期的导览（比如咖啡馆）不写 `window`，就没有日期筛选。
4. 在 `access.json` 的 `guides` 里加一行：`"lisbon-2027": ["visitor"]`。
5. 建 `public/guides/lisbon-2027/img/` 和 `map/`。
6. **底图**：目前还没有自动生成底图的工具。请让 Claude 做（说明城市和范围），它会生成底图图片和 `map.json`。
   底图的中心不要正对任何只给部分读者看的地点（比如工作地点）：访客也拿得到底图，看得出它的中心。构建会检查这一点（`is too close to the centre of map view`）；要偏开，就裁掉一边，再在 `map.json` 里改 `originX`/`originY` 和 `width`/`height`。

1. Copy the whole folder `src/content/guides/paris-photo-days-2026/` and
   rename it, for example `lisbon-2027` (lower case, with hyphens).
2. Edit `guide.json`: the title, `public` (a neutral public title: no people,
   venues or group names), `listed` (shown on the home list or not), `city`,
   `timezone` (e.g. `"Europe/Lisbon"`), `checked`, the dates, tiers, themes,
   zones, `texts` and `sensitive`.
3. Empty `items.json`, `places.json`, `events.json`, `routes.json` and
   `listings.json`, then fill them. Keep every file, even with an empty list.
   A guide without dates (cafés, say) has no `window`, so no day filter.
4. Add a line to `guides` in `access.json`: `"lisbon-2027": ["visitor"]`.
5. Create `public/guides/lisbon-2027/img/` and `map/`.
6. **Base maps**: there's no base-map tool yet. Ask Claude (name the city and
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
2. 在 `guides` 里把它加到能打开的导览后面：`"paris-photo-days-2026": ["visitor", "fotofilmic", "friends"]`。
3. 在 Cloudflare 加一个同名的 secret（见第 7 节）。
4. 给只给他们看的内容加 `"audience": "friends"`。

1. Add an entry to `audiences` in `access.json`, least privileged first (see
   the example above). `includes` lists the audiences whose content they also
   see.
2. Add it to each guide it may open in `guides`:
   `"paris-photo-days-2026": ["visitor", "fotofilmic", "friends"]`.
3. Add a Cloudflare secret with the same name (section 7).
4. Mark their own content with `"audience": "friends"`.

---

## 7. 密码 Passwords

密码和密钥**从不**写进仓库。它们都是 Cloudflare 里的 secret：

- `GUIDES_PASSWORD`：访客的密码；
- `GUIDES_PASSWORD_FOTOFILMIC`：学员的密码；
- `GUIDES_COOKIE_SECRET`（建议设置）：给登录 cookie 签名的密钥，这样别人伪造不了登录状态。
  用 32 个以上的随机字符，比如让密码管理器生成一个；不用记住它，也不要告诉别人。
  没设的话，Worker 用已有的 `TURNSTILE_SECRET` 签名。

每类读者的密码叫什么名字，写在 `access.json` 里。

设置或修改：dash.cloudflare.com → **Workers & Pages** → **kuschonink** → **Settings** →
**Variables and Secrets** → **Add**（修改则点已有那项的编辑）→ Type 选 **Secret** → 名字 → 值 → **Deploy**。
不要加在 **Settings → Build** 下面：那里的变量只有构建时看得到，Worker 读不到。

- 每个密码至少 6 个字符，两类读者的密码必须不一样。不分大小写，多余的空格和全角字符都不算。
  （如果两类读者用了同一个密码，进去的是权限低的那一类。）
- 改了某类读者的密码，这一类读者都要重新输入；其他读者不受影响。
- 改了签名用的密钥（`GUIDES_COOKIE_SECRET`，没设它时是 `TURNSTILE_SECRET`），所有人都要重新输入密码。
  第一次设置 `GUIDES_COOKIE_SECRET` 也一样。
- **只在没有比正式版更新的 PR 预览时修改 secret。** 在控制台改 secret，会把“最新上传的版本”部署上线；
  如果最新的是某个 PR 的预览，那个预览就成了正式网站。先合并或关闭打开的 PR，等 `main` 部署完再改。
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
  `TURNSTILE_SECRET`.

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
  while that isn't set) logs everyone out. So does setting
  `GUIDES_COOKIE_SECRET` for the first time.
- **Change secrets only when no PR preview is newer than production.** A
  secret edit in the dashboard deploys the *latest uploaded* version; if
  that's a PR preview, the preview becomes the live site. Merge or close open
  PRs first, and wait for `main` to deploy.
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
   `guides/paris-photo-days-2026/items.json › B3 › end: "2026-11-31" is not a real date.`
   防泄漏检查的问题以 **`Field Guide guard:`** 开头，后面是文件和原因。
3. 按提示改那个文件，再提交一次。

The site doesn't break: when a build fails, the live site stays as it was.

1. On GitHub, the commit or PR shows a red ✗ **Workers Builds: kuschonink**.
   Click **Details**.
2. In the log, find the line starting **`Field Guide:`**, which says how many
   problems there are. They're listed under it, one per line, each starting
   `guides/<slug>/<file>.json › id › field:`, e.g.
   `guides/paris-photo-days-2026/items.json › B3 › end: "2026-11-31" is not a real date.`
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
| `there is no folder`, `not in access.json` | `access.json` 和文件夹对不上 `access.json` and the folders disagree | 两边一起改 Change both |

---

## 9. 让云端 Claude Code 来改 Asking cloud Claude Code

在 claude.ai 的 Claude Code 里选这个仓库，可以这样说：

In Claude Code on claude.ai, pick this repo and say something like:

```text
请先读 docs/GUIDES.md。然后在 src/content/guides/paris-photo-days-2026/ 里：
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

### `guide.json`

| 字段 Field | 说明 | Meaning |
| --- | --- | --- |
| `title`/`titleZh?`, `subtitle?`/`subtitleZh?` | 打开后显示的完整标题 | The full title, once open |
| `public` | `{ title, titleZh?, subtitle?, subtitleZh? }`：输入密码前显示的中性标题 | The neutral title shown before the password |
| `listed` | 是否在导览首页列出 | Shown on the Field Guide's home list |
| `city`/`cityZh?` | 城市 | The city |
| `timezone` | 时区（IANA），如 `Europe/Paris`；“今天”按它算 | IANA time zone; "today" follows it |
| `timezoneLabel?`/`timezoneLabelZh?` | 给人看的时区说明 | The time zone as people read it |
| `checked` | 信息最后核对的日期 | When the facts were last checked |
| `window?` | `{ start, end }`：导览覆盖的日期 | The days the guide covers |
| `event?` | `{ name, nameZh?, start, end, url? }`：节日或活动 | The festival or occasion |
| `holidays?[]` | `{ date, name, nameZh?, notice?, noticeZh? }` | Public holidays |
| `tiers[]` | `{ id: "A"/"B"/"C", name, nameZh?, text?, textZh?, weight }`；`weight` 决定热力图 | Tiers; `weight` drives the heat map |
| `themes[]`, `zones[]` | `{ id, name, nameZh? }`：主题、片区 | Themes and zones |
| `categories?[]` | `{ id, source?, name, nameZh? }`：`listings.json` 的分类 | Categories of listings |
| `labels` | 界面用的名词：`item`, `items`, `subtitle?`, `by?`, `listing?`, `listings?`（各有 `Zh`） | The interface's nouns (each with `Zh`) |
| `texts` | 说明页各节，`id → { heading, headingZh?, paras?[], items?[], audience? }`；`paras[]` 是 `{ text, textZh?, audience? }`，`items[]` 是 `{ lead?, leadZh?, text, textZh?, audience? }` | Info sections, in order |
| `links?[]` | `{ label, labelZh?, url, audience? }` | Links |
| `credits` | `{ points?, pointsZh?, image?, imageZh? }`：资料和图片来源 | Credits for the points and pictures |
| `map` | `{ centre, heatRadius }`：`centre` 是参考点 `id` 或 `[经度, 纬度]`；`heatRadius` 单位米 | Map centre (a place id or `[lon, lat]`) and heat radius in metres |
| `sensitive` | `{ public: [...], <读者 id>: [...] }`：防泄漏检查用的词 | Words for the leak guard |
| `defaults?` | `{ price?, priceZh?, listingNote?, listingNoteZh? }` | Default price and listing note |

### `items.json` (`items[]`)

| 字段 Field | 说明 | Meaning |
| --- | --- | --- |
| `id` | 以级别字母开头：`A1`, `B3`, `C2` | Starts with its tier letter |
| `tier` | `A`, `B` 或 `C` | `A`, `B` or `C` |
| `name` | 原名 | The original name |
| `short?` | 地图标签，不超过 14 个字符 | Map label, ≤14 characters |
| `subtitle?`, `by?` | 副标题（巴黎：展览名）、作者（巴黎：艺术家） | Subtitle (Paris: exhibition title), by (Paris: artist) |
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
| `sourceUrl?`, `links?[]` | 信息来源页、其他链接 | Source page, other links |
| `listing?` | `listings.json` 里对应条目的 `id` | Its record in `listings.json` |
| `coordinates` | `[经度, 纬度]` | `[longitude, latitude]` |
| `image?` | `{ file, credit, caption?, alt?, altZh? }`；文件在 `img/` | Picture; the file is in `img/` |
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
| `records[]` | `{ id, name, category, coordinates, details, url?, start?, end? }`；`details` 是来源原文，用 `\n` 分行 | Records in the source's own words, lines split by `\n` |

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
3. 云端例程（Claude Code 的定时任务，每天 08:00–22:00 巴黎时间每小时一次，你在网站上批准时也会立即运行一次）按 [`scripts/suggestions/ROUTINE.md`](../scripts/suggestions/ROUTINE.md) 处理每条 `APPROVED`：核对官网、补全链接和开放时间、定位、查重，写好条目，把状态改成 `READY`（或 `DUPLICATE`、`NEEDS CHECK`、`ERROR`）。**例程不能改仓库**：它读的是陌生人写的文字和外部网页，可能被误导。
4. 网站自己的代码（发布器，`worker/publish.ts`，每 10 分钟一次）把 `READY` 的条目再检查一遍（只能用已知字段、通过构建时的同一套检查、不能含某类读者不该看到的词），然后提交到 `main`：只改这份导览的 `items.json` 和 `img/` 里的图片。状态变成 `PUBLISHING`；构建通过后变成 `PUBLISHED`。构建失败的话，发布器会自动撤回这次提交，状态变成 `ERROR`。

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
3. The cloud routine (a Claude Code scheduled task, hourly 08:00–22:00 Paris,
   and at once when you approve on the site) follows
   [`scripts/suggestions/ROUTINE.md`](../scripts/suggestions/ROUTINE.md) for
   each `APPROVED` page: it checks the venue's own pages, fills in links and
   hours, finds the place on the map, looks for duplicates, writes the entry,
   and sets `READY` (or `DUPLICATE`, `NEEDS CHECK`, `ERROR`). **The routine
   can't change the repository**: it reads strangers' text and other sites,
   so it could be misled.
4. The site's own code (the publisher, `worker/publish.ts`, every ten minutes)
   checks each `READY` entry again (known fields only, the build's own checks,
   no word an audience mustn't see) and commits it to `main`, touching only
   the guide's `items.json` and its `img/`. The status becomes `PUBLISHING`,
   then `PUBLISHED` once the build passes. If the build fails, the publisher
   takes the commit back and sets `ERROR`.

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

### 11.3 隐私 Privacy

- 推荐者的名字和电子邮箱只存在 **Contacts** 里（例程读不到），导览结束 90 天后自动删除（没有日期的导览：一年后）。
- 只有推荐者在“署名”里填了名字，导览里才会写“由 … 推荐”。导览的文件在 GitHub 上公开，所以署名会留在历史记录里（向导里写明了）。
- 网络地址只用来限制频率，不保存。

- The sender's name and email are kept only in **Contacts** (the routine can't
  read it) and deleted 90 days after the guide ends (a year after sending for a
  guide without dates).
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
- 云端例程的环境：完全联网（要打开画廊网站）；例程自己的 Notion 集成（只共享 Suggestions 和日志，不共享 Contacts），作为 `api.notion.com` 的网络 secret；不要连接器。

- `vars` in `wrangler.jsonc`: the three Notion data-source ids
  (`NOTION_SUGGESTIONS`, `NOTION_CONTACTS`, `NOTION_LOG`). Empty: suggestions
  are emailed instead.
- `src/content/guides/suggest.json`: the Turnstile widget's public site key
  (not a secret). Empty: no suggestions on the live site; `wrangler dev` and
  previews use Cloudflare's test key.
- The routine's environment: full network access (for gallery sites); the
  routine's own Notion integration (shared with Suggestions and the log only,
  never Contacts) as a network secret for `api.notion.com`; no connectors.

Worker Previews (PR previews) get test values, never the real ones, in the
dashboard's Preview settings: made-up guide passwords and cookie secret,
`TURNSTILE_SECRET_SUGGEST=1x0000000000000000000000000000000AA` with
`TURNSTILE_HOSTNAMES=example.com`, no `GITHUB_TOKEN`, and a test Notion
integration shared only with the page "Field Guide suggestions (kuschonink) ·
test copies", whose databases are:

预览（PR 预览）只用测试值：在控制台的 Preview 设置里，用编出来的导览密码和 cookie
密钥、Turnstile 测试密钥、不设 `GITHUB_TOKEN`，以及一个只共享给“test copies”页面的测试
Notion 集成：

| Var | Test data source |
| --- | --- |
| `NOTION_SUGGESTIONS` | `d2a5fe18-8031-425e-a123-3969fb32fbe7` |
| `NOTION_CONTACTS` | `26a774fe-1de2-4760-a1c7-8700b1b62de5` |
| `NOTION_LOG` | `652c23d0-b96b-4cee-a9a3-d4708c1207b8` |

### 11.5 本机测试 Trying it locally

```bash
node scripts/dev/notion-standin.mjs 8790
```

`.dev.vars`（不进仓库 gitignored）里加：

Add to `.dev.vars` (gitignored):

```ini
NOTION_TOKEN=dev
NOTION_API=http://localhost:8790
NOTION_SUGGESTIONS=ds-suggestions
NOTION_CONTACTS=ds-contacts
NOTION_LOG=ds-log
TURNSTILE_SECRET_SUGGEST=1x0000000000000000000000000000000AA
TURNSTILE_HOSTNAMES=example.com,localhost
```

然后 `npm run build` 和 `npm run preview`，登录一份导览，用 **文件 ▸ 推荐地点…**。`http://localhost:8790/_dump` 显示存下了什么。

Then `npm run build` and `npm run preview`, log on to a guide and use **File ▸
Suggest a Place…**. `http://localhost:8790/_dump` shows what was kept.
