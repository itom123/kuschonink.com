# paris-photo-days-2026 · 速查 Cheat-sheet

完整说明 Full manual: [`docs/GUIDES.md`](../../../../docs/GUIDES.md). 改完提交到 `main`，约一分钟上线；有错时构建失败，网站不变。Commit to `main` and it's live in about a minute; a mistake fails the build and the site stays as it was.

| 文件 File | 内容 What's in it |
| --- | --- |
| `guide.json` | 标题、日期、假日、分级、主题、说明文字 Title, dates, holidays, tiers, themes, texts |
| `items.json` | 推荐地点（`id` 以 A/B/C 开头）Recommended places (ids start with A/B/C) |
| `places.json` · `events.json` · `routes.json` | 参考点、日程、路线 Reference points, events, routes |
| `listings.json` · `map.json` | 官方条目、底图 Official listings, base maps |

- 坐标是 `[经度, 纬度]`；Google 地图显示纬度在前。Coordinates are `[longitude, latitude]`; Google Maps shows latitude first.
- 日期 `2026-11-12`，时间 `14:00`；中文里的时间要和英文一样。Dates `2026-11-12`, times `14:00`; times in `…Zh` must match the English.
- 只给学员：加 `"audience": "fotofilmic"`。Participants only: add `"audience": "fotofilmic"`.
- 图片放 `public/guides/paris-photo-days-2026/img/`，JPEG ≤1 MB，先去掉位置信息。Pictures: JPEG ≤1 MB, location data stripped.
- 密码不写在这里，在 Cloudflare 里。Passwords are never here; they're Cloudflare secrets.
