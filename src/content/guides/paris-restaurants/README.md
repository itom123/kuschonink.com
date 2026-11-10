# paris-restaurants · 速查 Cheat-sheet

完整说明 Full manual: [`docs/GUIDES.md`](../../../../docs/GUIDES.md)（第 13 节是餐厅导览 section 13 is this guide）. 改完提交到 `main`，约一分钟上线；有错时构建失败，网站不变。Commit to `main` and it's live in about a minute; a mistake fails the build and the site stays as it was.

长期导览，没有日期。A long-term guide, no dates.

| 文件 File | 内容 What's in it |
| --- | --- |
| `guide.json` | 标题、类别（分级）、价位、米其林评级、菜系、片区、说明 Title, categories (tiers), price levels, Michelin distinctions, cuisines, areas, texts |
| `items.json` | 餐厅（`id` 以 A/B/C 开头）Places to eat (ids start with A/B/C) |
| `places.json` · `events.json` · `routes.json` | 暂时是空的 Empty for now |
| `map.json` | 底图（和 paris-2026-11 相同）Base maps (the same as paris-2026-11) |

- **类别就是分级 Categories are the tiers**：A 米其林与餐厅周（米其林星级、必比登、其他入选，加上巴黎餐厅周的餐厅），B 日常餐厅，C 咖啡与甜点（含几家酒吧）。A Michelin & Restaurant Week (stars, Bib Gourmand, other picks, and the restaurants of Paris Restaurant Week), B everyday tables, C cafés and sweets (and a few bars).
- **巴黎餐厅周 Paris Restaurant Week（restaurantweek.fr，2026 年 11 月 1–15 日）**：主题 `restaurant-week`；`price` 先写餐厅周套餐。**11 月 15 日以后**删掉这个主题和餐厅周的价格（或换成下一届的）。Theme `restaurant-week`; `price` starts with the event's menus. **After 15 November**, take the theme and the event prices out (or update them for the next edition).
- **价位 `cost`**：`"€"` 人均 €25 以下，`"€€"` €25–50，`"€€€"` €50–100，`"€€€€"` €100 以上（一个人的餐费，不含酒水）。Per person, food only, without drinks.
- **米其林 `award`**：`"3-stars"`、`"2-stars"`、`"1-star"`、`"bib"`、`"selected"`。以 2026 年米其林指南（法国）为准；每年三月新指南出来后核对一次。From the MICHELIN Guide France 2026; check again each March when the new guide comes out.
- **菜系 `themes`**：`guide.json` 的 `themes` 里的编号，一到三个。One to three ids from `themes` in `guide.json`.
- **`links`**：官网，以及 `https://maps.google.com/?cid=…`（Google 地图上这家店的页面，“在 Google 地图中打开”直接去那里）。The website, and the place's own Google Maps page, which Open in Google Maps goes to.
- 坐标是 `[经度, 纬度]`。Coordinates are `[longitude, latitude]`.
- 中文里的时间要和英文一样。Times in `…Zh` must match the English.
- 这份导览不收读者推荐（`"suggestions": false`）。This guide takes no suggestions from readers.

## 从 Google 列表加新餐厅 Adding places from the Google list

`node scripts/google-list.mjs <列表链接> --guide paris-restaurants`：只向 Google 请求一次，写出一份草稿（`.google-lists/`，不进仓库），列出新的、已有的和列表里已经没有的。每家新店还要查清类别、价位和文字再加进 `items.json`（docs/GUIDES.md 第 13 节）。

`node scripts/google-list.mjs <list link> --guide paris-restaurants` asks Google once and writes a draft (in `.google-lists/`, never committed): the new places, those already here, and those the list no longer has. Each new place still needs its category, price and words before it goes into `items.json` (docs/GUIDES.md, section 13).

## 待核实 Waiting for a check

这些在 Google 列表里，但 2026 年 11 月 10 日还查不到足够的信息，所以暂时没有放进导览。These are on the Google list but couldn't be checked well enough on 10 November 2026, so they aren't in the guide yet:

- Chez Elisa, 57 Rue Montcalm, 75018 Paris（2026 年 1 月新开，网上还没有信息 new in January 2026, nothing online yet）
- Pavillon Lan, 9 Rue Monsieur le Prince, 75006 Paris（查不到 not found）
- Kaï, 85 Rue du Faubourg Saint-Denis, 75010 Paris（地图上有一家 Kaï Kaï bistrot，未能确认 a "Kaï Kaï bistrot" on the map, not confirmed）

不放进来的 Left out: Pink Koï（已永久停业 closed for good）、Tracé（2026 年停业 closed in 2026）；Le Chambard（阿尔萨斯 Alsace）、Dr & Dr（柏林 Berlin）和 BattleKart（卡丁车 go-karts），都不在巴黎 not in Paris, or not a place to eat。

## 第二份名单：巴黎餐厅周 The second list: Paris Restaurant Week

32 家来自 restaurantweek.fr（2026 年 11 月 10 日读取：每家一页，间隔几秒，没有被拦）。地址用法国国家地址库（BAN）定位。其中 4 家（Nhome、Magma、Chenapan、Maison Avoise）也在 Google 列表里。32 restaurants from restaurantweek.fr (read on 10 November 2026, one page per restaurant, a few seconds apart, never refused), placed with the Base Adresse Nationale. Four (Nhome, Magma, Chenapan, Maison Avoise) are on the Google list too.
