# 管理模式 Admin mode

每一节先写中文，再写英文。Every section is in Chinese first, then English.

## 1. 是什么 What it is

普通访客都以 **Guest** 身份登录，名字不能改，也没有密码。只有你能通过一个隐藏的登录页进入**管理模式**：
`kuschonink.com/admin`（网站上没有任何链接指向它，也不在 sitemap 里）。密码和验证码都在服务器上检查
（`worker/admin.ts`），浏览器里从不检查。

Everyone else logs on as **Guest**: the name can't be changed and there's no
password. Only you can enter **admin mode**, through a hidden log-on page:
`kuschonink.com/admin` (nothing on the site links to it, and it isn't in the
sitemap). The password and the code are checked on the server
(`worker/admin.ts`), never in the browser.

管理模式下：

- 任务栏右下角出现一把钥匙，开始菜单里有 **管理**，名字显示 **Administrator**。
- **管理 ▸ 推荐**：导览推荐的队列（像 Outlook Express）：收录、拒绝、编辑、给推荐者发邮件、立即运行例程、立即发布、处理日志。
  在 Notion 里改状态也一样，两边总是一致（Notion 是唯一的数据来源）。
- 导览里：不用导览密码就能看到最完整的版本；**文件 ▸ 推荐队列…**；每个条目的详情里有 **编辑…**，直接保存进导览（提交到 `main`，构建时检查）。
- **注销 Administrator…** 结束管理模式；**在所有地方注销** 让所有浏览器都退出。

In admin mode:

- A key appears in the taskbar tray, the Start menu has **Administration**,
  and the name shows as **Administrator**.
- **Administration ▸ Suggestions**: the Field Guide's suggestion queue (like
  Outlook Express): approve, refuse, edit, email the sender, run the routine
  now, publish now, and the processing log. Changing a status in Notion does
  the same: the two always agree (Notion is the one source of truth).
- In a guide: the fullest view without the guide's password; **File ▸
  Suggestions Queue…**; and **Edit…** in each entry's details, which saves
  straight into the guide (a commit to `main`, checked by the build).
- **Log Off Administrator…** ends admin mode; **Log Off Everywhere** ends it
  in every browser.

## 2. 第一次设置 Setting it up

在 Cloudflare（Workers & Pages ▸ kuschonink ▸ Settings ▸ Variables and Secrets）加这些 **Secret**：

In Cloudflare (Workers & Pages ▸ kuschonink ▸ Settings ▸ Variables and
Secrets), add these as **Secrets**:

| Secret | 是什么 What |
| --- | --- |
| `ADMIN_PASSWORD` | 管理员密码，至少 16 个字符（建议用密码管理器生成）An admin password of 16+ characters (let a password manager make one) |
| `ADMIN_TOTP_SECRET` | 身份验证器的密钥。在自己的电脑上运行 `node scripts/admin/totp.mjs`，把显示的密钥加进身份验证器应用，再把同一个密钥存成这个 secret。The authenticator key: run `node scripts/admin/totp.mjs` on your own computer, add the key it shows to your authenticator app, then save the same key as this secret |
| `ROUTINE_FIRE_URL`, `ROUTINE_TOKEN` | 云端例程的 API 触发器（地址和令牌），用于“批准后立即运行”和“立即运行”。The cloud routine's API trigger (address and token), for "run when approved" and Run Now |

两个都设了（密码够长、密钥正确）管理模式才会打开；否则 `/admin` 会说“尚未设置”。

Admin mode opens only when both of the first two are set (a long enough
password, a real key); otherwise `/admin` says it isn't set up.

预览（Worker Previews）里的管理模式能看到那个分支导览的完整内容，而预览链接是公开的：预览不要设
`ADMIN_PASSWORD` 和 `ADMIN_TOTP_SECRET`（这样预览里就没有管理模式），要设就用和正式网站一样强的值。
预览不发邮件，也不会启动云端例程。

In a preview (Worker Previews), admin mode shows the fullest view of that
branch's guides, and preview links are public: leave `ADMIN_PASSWORD` and
`ADMIN_TOTP_SECRET` unset for previews (admin is then off there), or give them
values as strong as production's. Previews send no emails and never start the
routine.

和推荐有关的设置（`NOTION_TOKEN`、`GITHUB_TOKEN`、发信）见 [GUIDES.md 第 11 节](GUIDES.md#11-读者推荐-suggestions)。
发给推荐者的邮件用 `MAIL_OUT`（只能从 `noreply@kuschonink.com` 发出，回复到 `hi@kuschonink.com`）。

Settings for suggestions (`NOTION_TOKEN`, `GITHUB_TOKEN`, email) are in
[GUIDES.md section 11](GUIDES.md#11-读者推荐-suggestions). Emails to people
who suggested something go through `MAIL_OUT` (only from
`noreply@kuschonink.com`, replies to `hi@kuschonink.com`).

`MAIL_OUT` 用的是 Cloudflare Email Sending（Workers 付费版的功能），kuschonink.com 要接入过（Email Service ▸
Email Sending ▸ Onboard Domain，它会在 `cf-bounce` 上加 MX、SPF 和 DKIM 记录，再加一条 `_dmarc`）。2026 年 11 月 7 日
查过，这些 DNS 记录都已经在了（`_dmarc` 也有，留着它），所以应该已经接入：在 Email Sending 里看一眼 kuschonink.com
是不是已接入就行。没接入时，**询问推荐者** 会说发不出去，什么都不会发出；接入以后再发一次。万一哪次部署因为
`MAIL_OUT` 失败，把 `wrangler.jsonc` 里 `MAIL_OUT` 那一项删掉：询问推荐者会说邮件尚未设置，别的都照常。

`MAIL_OUT` uses Cloudflare Email Sending (a Workers Paid feature), with
kuschonink.com onboarded (Email Service ▸ Email Sending ▸ Onboard Domain,
which adds MX, SPF and DKIM records on `cf-bounce` and a `_dmarc` record). On
7 November 2026 those DNS records were all there (`_dmarc` too: keep it), so
it should already be done: check that Email Sending lists kuschonink.com as
onboarded. Until it is, **Ask the Sender** says the email couldn't be sent,
and nothing goes out; send it again once it is. If a deploy ever fails on
`MAIL_OUT`, take the `MAIL_OUT` entry out of `wrangler.jsonc`: Ask the Sender
then says email isn't set up, and everything else works.

## 3. 安全 Safety

- **密码和验证码两样都要**；同一个验证码只能用一次。The password **and** the code; a code works once.
- 同一个地方错 10 次，锁一小时；各地加起来错太多次，所有人锁一小时（这时你也要等一小时）。
  Ten wrong tries from one place lock it for an hour; too many from everywhere at once lock everyone for an hour (you too).
- 登录保持 12 小时。cookie 只是一个随机编号（`HttpOnly`、`Secure`），服务器端（Guard）保存会话，所以 **注销** 和 **在所有地方注销** 立即生效。
  A log-on lasts 12 hours. The cookie is only a random id (`HttpOnly`, `Secure`); the session lives on the server (the Guard), so **Log Off** and **Log Off Everywhere** work at once.
- 管理模式的 cookie 需要访客同意使用 cookie（“全部允许”或“仅必要”）；还没同意时，按“确定”后顶部的信息栏会先问一次（用一般的措辞，公开的 Cookie 对话框里不提管理模式）。选“全部允许”或“仅必要”就会接着登录；关掉信息栏（×）就不登录，什么都不发出。
  Admin mode's cookies need the leave for cookies (Allow All or Necessary Only); without it, OK first asks once with the Information Bar (in its general wording: the public Cookies dialog never names admin mode). Allow All or Necessary Only goes on with the log-on; closing the bar (×) stops it, and nothing is sent.
- 每个管理请求都在服务器上检查：会话、来自本站（`Sec-Fetch-Site: same-origin`、`Origin`）、JSON。别的网站无法借你的浏览器操作。
  Every admin request is checked on the server: the session, that it comes from this site (`Sec-Fetch-Site: same-origin`, `Origin`), JSON. Another site can't act through your browser.
- 发邮件：浏览器只发“哪一条推荐”和正文；收件地址由服务器从 Notion（Contacts）里查，且只在对方同意时才发。同一封信不会发两次。
  Emails: the browser sends only which suggestion and the text; the server looks up the address in Notion (Contacts) and sends only with consent. The same email is never sent twice.
- 改条目：只改那份导览的 `items.json`（换级别时连带 `routes.json`、`events.json` 和图片），先过导览自己的检查；不能写某类读者不该看到的词。
  Editing an entry changes only that guide's `items.json` (and `routes.json`, `events.json` and the picture when the tier changes), after the guide's own check; no word an audience mustn't see.
- 怀疑密码泄露：在 Cloudflare 换掉 `ADMIN_PASSWORD`（或 `ADMIN_TOTP_SECRET`），然后在 `/admin` 用 **在所有地方注销**。
  If the password may have leaked: change `ADMIN_PASSWORD` (or `ADMIN_TOTP_SECRET`) in Cloudflare, then use **Log Off Everywhere** at `/admin`.

## 4. 本机测试 Trying it locally

`.dev.vars`（不进仓库）里放编出来的值（不要用真的）：

Made-up values in `.dev.vars` (gitignored; never the real ones):

```ini
ADMIN_PASSWORD=made-up admin password for local only
ADMIN_TOTP_SECRET=<a key from node scripts/admin/totp.mjs>
```

然后 `npm run build`、`npm run preview`，打开 `http://localhost:8787/admin`。

Then `npm run build`, `npm run preview`, and open
`http://localhost:8787/admin`.

## 5. 代码 The code

| 文件 File | 做什么 Does |
| --- | --- |
| `worker/admin.ts` | 登录、会话、队列、邮件、例程、日志、改条目 Log-on, sessions, the queue, email, the routine, the log, editing entries |
| `worker/guard.ts` | 会话、计数、锁（一个 Durable Object）Sessions, counters, locks (one Durable Object) |
| `worker/totp.ts` | 六位验证码（RFC 6238）Six-digit codes (RFC 6238) |
| `src/pages/admin/` | `/admin` 和 `/admin/suggestions`（空壳，数据都来自服务器）`/admin` and `/admin/suggestions` (empty shells; data comes from the server) |
| `src/scripts/admin/` | 登录、队列、桌面上的管理模式 The log-on, the queue, admin mode on the desktop |
| `src/scripts/guide/admin-edit.ts` | 导览里的“编辑…” Edit… in a guide |
| `src/styles/admin.css` | 样式 Styles |
