# Kino: the owner's manual

每一节先写中文，再写英文。Every section is in Chinese first, then English.

- [1. Kino 是什么 What the Kino is](#1-kino-是什么-what-the-kino-is)
- [2. 第一次：开通 R2 Once: turning on R2](#2-第一次开通-r2-once-turning-on-r2)
- [3. 上映一部影片 Showing a film at full quality](#3-上映一部影片-showing-a-film-at-full-quality)
- [4. 密码和隐藏 A password, or hidden](#4-密码和隐藏-a-password-or-hidden)
- [5. 换片、撤片 Replacing or removing a film](#5-换片撤片-replacing-or-removing-a-film)
- [6. 能挡住什么 What the protection stops, and what it can't](#6-能挡住什么-what-the-protection-stops-and-what-it-cant)
- [7. 费用 What it costs](#7-费用-what-it-costs)
- [8. 文件在哪里 Where things are](#8-文件在哪里-where-things-are)
- [9. 在本机试 Trying it on your computer](#9-在本机试-trying-it-on-your-computer)

---

## 1. Kino 是什么 What the Kino is

**Kino** 是 Xiangyin 98 上的影院，用来放映影像作品。入口有三个：桌面图标（以及“开始 ▸ 程序 ▸ Kino”、“运行”里键入 `kino`），房子一层的**车库**（第 7 章，原来放《破碎的海洋》，它搬到了旁边的东房间），以及每个作品页面里的“正在 Kino 放映”卡片。地址是 `/kino`（“正在放映”）和 `/kino/<影片>`。

- 每部影片有两种来源。上传到 Kino 自己的 R2 存储之后，它以**完整画质**播放（受保护的 HLS，1080p 母版就是 1080p，以后的 4K 母版就是 4K），并按观众的网速自动选择画质；还没上传的影片，暂时用它原来的 YouTube 视频播放。
- 网页里不写任何影片地址。观众第一次按“播放”时，Cloudflare Turnstile 在画面上悄悄做一次验证（通常什么也看不到；偶尔会请观众勾选一个方框），然后发给这个浏览器一张**入场券**：一个只有服务器能读的 Cookie，四小时有效，关闭浏览器即失效。只有拿着入场券，Worker 才告诉播放器影片在哪里。
- 有的影片需要**密码**才能放映（第 4 节）：按“播放”后，画面上先出现一个密码框。密码对了，这张入场券就记住它，直到关闭浏览器。
- Kino 的页面不进搜索引擎：`robots.txt` 禁止抓取 `/kino`，页面带 `noindex`，不在 sitemap 里。

**Kino** is the cinema of Xiangyin 98, for the moving-image works. It has
three ways in: the desktop icon (and Start ▸ Programs ▸ Kino, or `kino` in
Run), the **garage** on the ground floor of the house (chapter 7; *Fragmented
Ocean* moved next door to the east room), and the "Showing in the Kino" card
on each project page. Its addresses are `/kino` (Now Showing) and
`/kino/<film>`.

- Each film has two sources. Once it is uploaded to the Kino's own R2
  storage, it plays at **full quality** (protected HLS: a 1080p master plays
  at 1080p, a 4K master later at 4K), and the player picks the best size the
  visitor's connection carries. A film not uploaded yet plays from its
  YouTube video.
- No page holds a film's address. The first time a visitor presses Play, a
  Cloudflare Turnstile check runs quietly on the screen (usually nothing
  shows; now and then Cloudflare asks them to tick a box there), then gives
  this browser a **ticket**: a cookie only the server can
  read, for four hours, gone when the browser closes. Only with a ticket does
  the Worker tell the player where the film is.
- Some films need a **password** (section 4): after Play, a password box
  opens on the screen first. Once the password is right, the ticket keeps it
  until the browser closes.
- Search engines stay out: `robots.txt` disallows `/kino`, the pages are
  `noindex`, and they are not in the sitemap.

## 2. 第一次：开通 R2 Once: turning on R2

只做一次。之后每部影片按第 3 节上传。

1. Cloudflare 控制台 → **R2** → 开通（需要绑定付款方式；每月前 10 GB 免费）。
2. R2 → **Create bucket**，名字写 `kuschonink-kino`。不要打开 “Public access”，也不要连接自定义域名：这个存储桶只给 Worker 读。**这一步要在合并 Kino 的 PR 之前做**，否则部署会因为找不到存储桶而停下（网站保持原样，不会坏）。
3. （建议）Workers & Pages → kuschonink → Settings → Variables and Secrets，加一个 Secret：`KINO_SECRET`，32 个以上的随机字符，用来签发入场券。生成方法：
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`。
   不设也能用：那时用导览的 Cookie 密钥（`GUIDES_COOKIE_SECRET`，或 `TURNSTILE_SECRET`）签，但加上 Kino 自己的标签，互不通用。更换 `KINO_SECRET` 会让所有入场券失效，观众只需再领一张。
4. 入场验证用联系表单的 Turnstile（`site.json` 的 `turnstileSiteKey`，和 Secret `TURNSTILE_SECRET`），动作名是 `kuschonink-kino`。不用另设。
5. 有需要密码的影片时（第 4 节）：同一个地方再加一个 Secret `KINO_PASSWORD`，就是观众要输入的密码，至少 6 个字符。不分大小写，前后的空格不算。它只存在 Cloudflare 里，**不要写进仓库，也不要发在聊天里**。

Once only. After this, each film goes up as in section 3.

1. Cloudflare dashboard → **R2** → turn it on (it needs a payment method; the
   first 10 GB a month are free).
2. R2 → **Create bucket**, named `kuschonink-kino`. Don't turn on public
   access and don't connect a custom domain: only the Worker reads this
   bucket. **Do this before the Kino's pull request is merged**: a deploy
   whose bucket doesn't exist stops, and the old site stays live.
3. (Recommended) Workers & Pages → kuschonink → Settings → Variables and
   Secrets, add a secret `KINO_SECRET`: 32 or more random characters, which
   sign the tickets. Make one with
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
   Without it the Field Guide's cookie key signs (`GUIDES_COOKIE_SECRET`, or
   `TURNSTILE_SECRET`), under the Kino's own label, so neither counts for the
   other. Changing `KINO_SECRET` ends every ticket; visitors just get a new one.
4. The ticket's check uses the contact form's Turnstile widget (`turnstileSiteKey`
   in `site.json`, and the secret `TURNSTILE_SECRET`) with the action
   `kuschonink-kino`. Nothing else to set.
5. Once a film needs a password (section 4): in the same place, add a secret
   `KINO_PASSWORD`, the password visitors type, at least 6 characters. Case
   doesn't matter, nor do spaces round it. It lives only in Cloudflare:
   **never put it in the repository or in a chat**.

## 3. 上映一部影片 Showing a film at full quality

在你自己的电脑上做（Windows、Mac、Linux 都可以；需要 Node.js 和 [ffmpeg](https://ffmpeg.org)，Windows 的装法见下面），在仓库的根目录里：

1. **压制**：`node scripts/kino/encode.mjs "母版.mp4" <影片id>`
   - 影片 id 是 `kino.json` 里的 `id`，例如 `min-shi-e`。母版的路径放在引号里。
   - 它会做出母版本身的尺寸（不放大），以及更小的几档（1080p 母版：1080p、720p、480p、360p），H.264，每 6 秒一段，每段用随机密钥加密（AES-128），再从十分之一处取一帧做海报。结果在 `kino-out/`（不会进仓库）。
   - **字幕**：Kino 的播放器不显示字幕轨。母版里如果有文字字幕轨（MP4 的 mov_text、SRT、ASS、WebVTT），它会把字幕画进每一档画面里（先选英文，其次是默认的那一轨）；加 `--no-subs` 就不画。图片式字幕（DVD、蓝光的）只提示，不画。已经在画面里的字幕不受影响。
   - 一部 10 分钟的 1080p 影片，在普通电脑上大约要半小时到一小时。
   - 最后它会打印两行，第 3 步要用。
2. **上传**：`node scripts/kino/upload.mjs <影片id> <版本>`（版本就是第 1 步打印的 `v年月日字母`）。
   - **先删旧的**：为了省空间，它先删掉这部影片的旧版本：R2 里 `kino.json` 记着的那个版本，以及这台电脑 `kino-out/` 里的其他版本。删掉以后，到 `kino.json` 换成新版本之前，这部影片暂时不能放。加 `--keep-old` 就都留着。
   - 最简单：先 `npx wrangler login`，它一次传 6 个文件（10 分钟的影片大约 400 个文件，要几分钟）。
   - 更快：在 R2 → Manage API tokens 建一个只对 `kuschonink-kino` 有 “Object Read & Write” 权限的令牌，然后在终端里设 `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` 再运行。有了它，“先删旧的”会删掉这部影片在存储桶里的所有其他版本。**不要把这些写进仓库。**
   - 中途断了可以再运行，已经传好的会跳过（这台电脑在 `kino-out/` 里记着）。密钥最后上传。
3. **上映**：在 `src/content/kino.json` 里，把第 1 步打印的两行（`"seconds"` 和 `"stream"`）加到这部影片里，提交到 `main`。大约一分钟后，这部影片就用完整画质放映了。
4. 确认网站上能播之后，可以把 YouTube 上的那份设为“私享”（private），网上就只剩 Kino 这一份了。

新的影片：先在 `kino.json` 里加一条（`id`、`title`、`titleZh`，可选 `year`、`note`/`noteZh`、`project`、`poster`），再照上面做。没有 YouTube 视频的影片，第一次提交时就要带上 `stream`。要在作品页面里放一张卡片，在那个作品的内容里加一个 `{ "type": "video", "film": "<影片id>" }` 块。

**海报**：每部影片在“正在放映”、播放前的画面、作品页面的卡片和车库里都显示一张图。默认用它所属作品的第一张图（和“作品”文件夹里的缩略图相同）；要换一张，在影片里写 `"poster": "projects/<作品>/<文件>.jpg"`（`src/assets/images` 下的路径，和图片块的 `src` 一样）。文件不存在时构建会停下。

On your own computer (Windows, a Mac or Linux; you need Node.js and
[ffmpeg](https://ffmpeg.org), and Windows is just below), from the top of the
repository:

1. **Encode**: `node scripts/kino/encode.mjs "master.mp4" <film id>`
   - The film id is its `id` in `kino.json`, for example `min-shi-e`. Put the
     master's path in quotes.
   - It makes the master's own size (never larger) and each smaller one
     (1080p, 720p, 480p and 360p for a 1080p master): H.264 in six-second
     pieces, each encrypted with a random key (AES-128), plus a poster from a
     tenth of the way in. The result is in `kino-out/` (never committed).
   - **Subtitles**: the Kino's player shows no subtitle tracks. If the master
     has a text subtitle track (an MP4's mov_text, SRT, ASS, WebVTT), it is
     drawn into the picture at every size: English first, else the default
     track. `--no-subs` leaves it out. A picture-based track (from a DVD or a
     Blu-ray) is only reported. Subtitles already in the picture stay as they
     are.
   - A 10-minute 1080p film takes half an hour to an hour on an ordinary
     computer.
   - At the end it prints two lines for step 3.
2. **Upload**: `node scripts/kino/upload.mjs <film id> <version>` (the
   version, `v` + date + a letter, is printed by step 1).
   - **The old version goes first**, to save space: the version `kino.json`
     lists for the film is deleted from R2, and the film's other versions
     from `kino-out/` on this computer. The film is then off the Kino until
     `kino.json` lists the new version. `--keep-old` keeps them all.
   - Simplest: run `npx wrangler login` first, and it uploads six files at a
     time (a 10-minute film is about 400 files: a few minutes).
   - Faster: make a token in R2 → Manage API tokens with "Object Read &
     Write" on `kuschonink-kino` only, and set `R2_ACCOUNT_ID`,
     `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in your terminal. With it,
     every other version of the film in the bucket goes first. **Never put
     these in the repository.**
   - If it stops, run it again: what is there already is skipped (this
     computer keeps a note in `kino-out/`). The key goes up last.
3. **Show it**: in `src/content/kino.json`, add the two lines from step 1
   (`"seconds"` and `"stream"`) to the film and commit to `main`. About a
   minute later the film plays at full quality.
4. Once it plays on the site, you can make the YouTube copy private, so the
   Kino's is the only copy online.

A new film: add it to `kino.json` first (`id`, `title`, `titleZh`, and if you
like `year`, `note`/`noteZh`, `project`, `poster`), then do the above. A film
with no YouTube video needs its `stream` in its first commit. For a card on a
project page, add a block `{ "type": "video", "film": "<film id>" }` to that
project.

**Posters.** Each film shows a picture in Now Showing, on the screen before
it plays, on its project page's card and in the garage. By default it is its
project's first picture (the one the Projects folder shows). To choose
another, give the film `"poster": "projects/<project>/<file>.jpg"`: a path
under `src/assets/images`, as an image block's `src`. A file that isn't there
stops the build.

### 在 Windows 上 On Windows

在 **PowerShell** 里（开始菜单里搜 “PowerShell”）。第一次：

```powershell
winget install OpenJS.NodeJS.LTS
winget install Gyan.FFmpeg
winget install Git.Git
```

装完以后**关掉 PowerShell，再开一个新的**，然后：

```powershell
git clone https://github.com/itom123/kuschonink.com
cd kuschonink.com
npm.cmd ci
npx.cmd wrangler login
```

（GitHub 可能会请你登录。`npm.cmd`、`npx.cmd` 带着 `.cmd`，是因为 Windows 默认不许 PowerShell 运行 `npm`、`npx` 的脚本版。`wrangler login` 会打开浏览器，让你登录 Cloudflare。）

以后每部影片，在 `kuschonink.com` 文件夹里：

```powershell
node scripts/kino/encode.mjs "F:\路径\母版.mp4" <影片id>
node scripts/kino/upload.mjs <影片id> <版本>
```

再次使用前，先 `git pull` 拿到最新的脚本。

In **PowerShell** (search the Start menu for "PowerShell"). The first time,
run the three `winget` lines above; then **close PowerShell and open a new
one**, and run the four lines after them (`git clone` … `npx.cmd wrangler
login`). GitHub may ask you to sign in. `npm.cmd` and `npx.cmd` carry `.cmd`
because Windows doesn't let PowerShell run the script versions of `npm` and
`npx` by default. `wrangler login` opens your browser to sign in to
Cloudflare.

Then, for each film, in the `kuschonink.com` folder, run the two `node` lines
above with the master's path in quotes. Before using them again another time,
run `git pull` for the latest scripts.

## 4. 密码和隐藏 A password, or hidden

`kino.json` 里每部影片还可以有两个开关：

- `"password": true`：这部影片要密码才能放。按“播放”后，画面上出现一个密码框；密码就是 Cloudflare 里的 Secret `KINO_PASSWORD`（第 2 节第 5 步）。输错了会提示再输；每位访客每分钟最多试 10 次。输对了，入场券就记住它，关闭浏览器前不用再输，其他需要密码的影片也一样。没有设 `KINO_PASSWORD` 时，这些影片不放映（显示“Kino 暂时关闭”）。换一个密码，所有已经输过旧密码的入场券就不再能放这些影片。
- `"listed": false`：这部影片不出现在“正在放映”、车库、“播放”菜单和“上一部/下一部”里。它自己的页面和作品页面里的卡片照常能用。

“正在放映”里，需要密码的影片在介绍里写着“需要密码”。没有作品的影片在输入密码前只显示黑色画面和放映机图标；放映时，视频的海报是 R2 里那一帧。

Each film in `kino.json` can also have two switches:

- `"password": true`: the film needs a password. After Play, a password box
  opens on the screen; the password is the secret `KINO_PASSWORD` in
  Cloudflare (section 2, step 5). A wrong one says so and asks again; each
  visitor has 10 tries a minute. Once it is right, the ticket keeps it until
  the browser closes, for every film that needs it. While `KINO_PASSWORD`
  isn't set, these films don't play ("The Kino is closed just now"). A new
  password ends every ticket that had the old one, for these films.
- `"listed": false`: the film is left out of Now Showing, the garage, the
  Play menu and Previous/Next. Its own page and its project's card still
  work.

In Now Showing, a film that needs a password says so in its details. A film
with no project shows a black screen and the projector until the password is
given; once it plays, the video's poster is its frame from R2.

## 5. 换片、撤片 Replacing or removing a film

- **换一个版本**（重新调色、换母版）：再压制一次（会得到新的版本名），上传，然后在 `kino.json` 里改 `"version"`（`"seconds"` 变了也改）。上传时旧版本会先被删掉（第 3 节），所以到 `kino.json` 改好并部署之前，这部影片暂时不能放；想让旧版本一直放到新版本上线，就加 `--keep-old`，事后在 R2 控制台删掉 `films/<id>/<旧版本>/` 和 `keys/<id>/<旧版本>.key`。
- **撤片**：从 `kino.json` 里删掉这部影片，并删掉作品页面里指向它的 `"film"` 块（否则构建会停下并说明原因）。R2 里的文件可以再删。

- **A new version** (a regrade, a new master): encode again (it gets a new
  version name), upload, and change `"version"` in `kino.json` (and
  `"seconds"`, if it changed). The upload deletes the old version first
  (section 3), so the film is off until the new `kino.json` is live. To keep
  the old one playing until then, upload with `--keep-old`, and afterwards
  delete `films/<id>/<old version>/` and `keys/<id>/<old version>.key` in the
  R2 dashboard.
- **Taking a film off**: remove it from `kino.json`, and remove any project
  block whose `"film"` names it (the build stops and says so otherwise). Then
  delete its files from R2.

## 6. 能挡住什么 What the protection stops, and what it can't

挡得住的：

- **搜索引擎和爬虫**：不抓取、不收录，没有入场券就拿不到任何影片。机器人（以及 curl、无头浏览器）领不到入场券。
- **直接链接**：R2 存储桶没有公开地址。播放用的地址里带着一个签名，只对这部影片、这个版本、这张入场券有效，最多到入场券过期；把地址复制到别的浏览器、别的网站或新标签页里打开，都会被拒绝。
- **“另存为”**：影片按 6 秒一段加密传送，没有可以下载的文件；视频上没有浏览器菜单，播放器没有下载按钮。
- **大量抓取**：每位访客每分钟最多领 10 张入场券；每张入场券每分钟最多取 180 段（正常观看每分钟约 10 段）。
- **没有密码的人**：需要密码的影片，没有输过密码的入场券连影片在哪里都拿不到，也取不到它的任何一段。密码只在服务器上比对，不写进网页、Cookie 或日志；猜密码同样受每分钟 10 次的限制，而且每次都要先过 Turnstile。

挡不住的（只有付费的 DRM，例如 Widevine/FairPlay，才能挡住其中一部分）：

- 录屏或用相机对着屏幕拍。
- 懂行的人用浏览器的开发者工具，把自己浏览器已经拿到的片段和密钥拼回去。

YouTube 上的影片只受 YouTube 的保护：任何拿到视频 id 的人都能用免费工具下载。所以想保护的影片，上传到 R2 后把 YouTube 那份设为私享。

What it stops:

- **Search engines and crawlers**: no crawling, no indexing, and no film
  without a ticket. Bots (and curl, and headless browsers) get no ticket.
- **Direct links**: the R2 bucket has no public address. The addresses the
  player uses carry a signature good only for that film, that version and that
  ticket, and only until the ticket runs out. Pasted into another browser,
  another site or a new tab, they are refused.
- **Save As**: the film arrives encrypted in six-second pieces; there is no
  file to download, no browser menu on the video and no download button.
- **Mass fetching**: 10 tickets a minute per visitor; 180 pieces a minute per
  ticket (watching needs about 10).
- **Anyone without the password**: for a film that needs one, a ticket
  without it gets neither where the film is nor any of its pieces. The
  password is only compared on the server, never written into a page, a
  cookie or a log; guesses count against the same 10 a minute, and each needs
  the Turnstile check first.

What it can't stop (only paid DRM, such as Widevine or FairPlay, stops some of
this):

- Recording the screen, or filming it with a camera.
- An expert using the browser's developer tools to put back together the
  pieces and key their own browser was given.

A film still on YouTube has only YouTube's protection: anyone with its video
id can download it with free tools. So once a film is on R2, make its YouTube
copy private.

## 7. 费用 What it costs

- Workers 付费计划每月 5 美元，已包含每月 1000 万次请求，不收流量费。观众每看 1 分钟大约是 10 次请求；10 分钟的影片大约 110 次。
- R2：每月前 10 GB 免费，之后每 GB 每月 0.015 美元；读取每月前 1000 万次免费；**流量免费**，不管多少人看。
- 一部 10 分钟、1080p 母版的影片，所有尺寸加起来大约 1.2 GB。也就是说，免费的 10 GB 大约能放 80 分钟的影片；放 100 GB 每月大约 1.35 美元。

- The Workers Paid plan, $5 a month, includes 10 million requests a month and
  charges nothing for traffic. A minute of watching is about 10 requests; a
  10-minute film about 110.
- R2: the first 10 GB a month are free, then $0.015 per GB a month; the first
  10 million reads a month are free; **traffic is free**, however many people
  watch.
- A 10-minute film from a 1080p master is about 1.2 GB in all its sizes. So
  the free 10 GB hold about 80 minutes of film; 100 GB costs about $1.35 a
  month.

## 8. 文件在哪里 Where things are

| Path | What it is |
| --- | --- |
| `src/content/kino.json` | The films, in showing order (fields: `src/lib/kino.ts`) |
| `src/lib/kino.ts` | The films' shape, the checks and the rules both sides share (no imports: pages, browser and Worker) |
| `src/lib/kino-site.ts` | The films for the pages, checked against the projects at build time |
| `src/pages/kino/index.astro`, `src/pages/kino/[film].astro` | Now Showing, and one film in the player |
| `src/scripts/kino/` | The player (`player.ts`: hls.js, loaded only when a film plays; YouTube; controls, keys, menus; the password box), the ticket's check on the screen (`ticket.ts`) |
| `src/styles/kino.css` | The Kino, its card on project pages, its panel in the garage |
| `worker/kino.ts` | The door: pages, tickets (and the password), where a film plays from, its pieces and key from R2 |
| `worker/kino.test.mts`, `scripts/kino/encode.test.mts` | Tests (`npm test`) |
| `scripts/kino/encode.mjs`, `scripts/kino/upload.mjs`, `scripts/kino/ladder.mjs` | Encoding (subtitles drawn in) and uploading (old versions removed first), on your computer: Windows, macOS or Linux |
| `scripts/kino-guard.mjs` | The build's check: no film or YouTube id of a Kino film in public files, crawlers kept out, the door in `wrangler.jsonc` |

The bucket holds `films/<id>/<version>/master.m3u8`,
`films/<id>/<version>/<size>/index.m3u8` and `seg_NNNNN.ts`,
`films/<id>/<version>/poster.jpg`, and the key at
`keys/<id>/<version>.key`. The playlists use relative addresses (`1080p/index.m3u8`,
`seg_00000.ts`, the key at `../key`), so everything sits under the one
token path the Worker gives: `/kino/<film>/m/<token>/…`.

## 9. 在本机试 Trying it on your computer

1. 在仓库根目录建 `.dev.vars`（已被 git 忽略；只写编造的值）：

   ```ini
   KINO_SECRET=made-up-kino-secret-of-24-or-more-characters
   KINO_PASSWORD=made-up test password
   TURNSTILE_SECRET=1x0000000000000000000000000000000AA
   TURNSTILE_HOSTNAMES=example.com
   ```

   `1x00…AA` 是 Cloudflare 的测试密钥，总是通过；本机上 Turnstile 小框本身不会出现（网站的 Turnstile 只认 kuschonink.com），自动化测试里可以替换掉它的脚本。
2. `node scripts/kino/encode.mjs 母版 <影片id>`，再 `node scripts/kino/upload.mjs <影片id> <版本> --local`（传到本机的模拟存储桶）。
3. 在 `kino.json` 里给这部影片加上 `stream`（不要提交），`npm run build`，`npm run preview`，打开 `http://localhost:8787/kino`。

1. Make `.dev.vars` at the top of the repository (gitignored; made-up values
   only), as above. `1x00…AA` is Cloudflare's test secret, which always
   passes. Locally the Turnstile box itself won't appear (the site's widget
   only answers on kuschonink.com); an automated test can swap its script for
   a stand-in.
2. `node scripts/kino/encode.mjs master <film id>`, then
   `node scripts/kino/upload.mjs <film id> <version> --local` (into the
   bucket `npm run preview` keeps on your computer).
3. Give the film its `stream` in `kino.json` (don't commit it), then
   `npm run build`, `npm run preview`, and open `http://localhost:8787/kino`.
