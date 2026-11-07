// Field Guide (导览): the program's own words, in English and Chinese. Neutral
// only: browser scripts and public pages import this file, so it never names a
// guide, a group, a place or an event. The nouns a guide uses ("Exhibitions",
// "Artist") come from its data (GuideView.labels / the server-rendered page).
import type { Bi } from './types';

const b = (en: string, zh: string): Bi => ({ en, zh });

export const W = {
  program: b('Field Guide', '导览'),
  home: b('Field Guide', '导览'),
  // Toolbar (labels in the pixel font: no "·", "×", "→", "…", "€").
  map: b('Map', '地图'),
  places: b('Places', '地点'),
  routes: b('Routes', '路线'),
  days: b('Days', '日期'),
  info: b('Info', '说明'),
  print: b('Print', '打印'),
  mapTip: b('Show the map', '显示地图'),
  placesTip: b('The places in this guide', '本导览中的地点'),
  routesTip: b('Suggested routes', '建议路线'),
  daysTip: b('Day by day', '按日期查看'),
  infoTip: b('How to use this guide, and its sources', '使用说明与资料来源'),
  printTip: b('Print the guide (Ctrl+P)', '打印导览（Ctrl+P）'),
  // Filter band.
  when: b('When:', '日期：'),
  anyDay: b('Any day', '任意一天'),
  today: b('today', '今天'),
  theme: b('Looking for:', '主题：'),
  allThemes: b('Everything', '全部'),
  find: b('Find:', '查找：'),
  findPh: b('Name, street or keyword', '名称、街道或关键词'),
  findBtn: b('Find', '查找'),
  clear: b('Clear', '清除'),
  showListings: b('Show', '显示'),
  // Panes.
  close: b('Close', '关闭'),
  ref: b('Ref', '编号'),
  day: b('Day', '日期'),
  area: b('Area', '区域'),
  status: b('Status', '状态'),
  // Places: "Sort by:" ("&" marks the access key, as in the menus).
  sortBy: b('&Sort by:', '排序方式(&S)：'),
  sortTier: b('Recommended (default)', '推荐（默认）'),
  sortName: b('Name', '名称'),
  sortZone: b('Area', '区域'),
  sortOpen: b('Open that day first', '当天开放的优先'),
  sortNear: b('Nearest first', '离我最近'),
  sortDefault: b('Default', '默认'),
  sortDefaultTip: b('Back to the default order', '恢复默认顺序'),
  ourPlaces: b('Reference points', '参考地点'),
  noRoute: b('No route', '无路线'),
  showOnMap: b('Show on map', '在地图上显示'),
  directions: b('Directions', '路线导航'),
  stops: b('Stops', '站点'),
  whenLabel: b('When', '时间'),
  noteLabel: b('Note', '提示'),
  duration: b('Time', '用时'),
  showDay: b('Show this day', '显示这一天'),
  todayTag: b('Today', '今天'),
  nothingThatDay: b('Nothing scheduled.', '没有安排。'),
  plan: b('Plan', '安排'),
  // Details.
  details: b('Details', '详细信息'),
  openMaps: b('Open in Google Maps', '在 Google 地图中打开'),
  copyAddress: b('Copy address', '复制地址'),
  address: b('Address', '地址'),
  hours: b('Opening hours', '开放时间'),
  dates: b('Dates', '日期'),
  price: b('Admission', '门票'),
  allow: b('Allow', '建议用时'),
  minutes: (n: number) => b(`${n} min (guide estimate)`, `${n} 分钟（本导览估计）`),
  themes: b('Keywords', '关键词'),
  links: b('Links', '链接'),
  source: b('Source', '来源'),
  sourcePage: b('Where this comes from', '信息来源'),
  website: b('Website', '网站'),
  notChecked: b('Not checked by this guide.', '本导览未核实。'),
  photoFailed: b('The picture could not be loaded.', '图片无法加载。'),
  publishedHours: b('Published hours, not live', '公布的开放时间，非实时'),
  chooseDay: b('Choose a day to check opening.', '选择日期以查看是否开放。'),
  half: b('Half', '半屏'),
  full: b('Full', '全屏'),
  here: (n: number) => b(`${n} places here`, `这里有 ${n} 个地点`),
  eventsHere: b('Here', '在这里'),
  // Info.
  checked: b('Checked', '核实于'),
  sources: b('Sources and credits', '资料来源与致谢'),
  unofficial: b('Unofficial guide: not a publication of any festival, venue or organiser.', '非官方导览：并非任何活动、场馆或主办方的出版物。'),
  noLocation: b('Where am I? asks your browser for your location only when you press it, then follows you until you stop it or leave the page. Your location stays on your device and is never sent anywhere.', '只有在你按下“我在哪里？”时，本导览才会向浏览器请求你的位置，并持续跟随，直到你将其停止或离开页面。你的位置只留在你的设备上，不会发送到任何地方。'),
  logOffTitle: b('Log off', '注销'),
  logOffText: b('Lock this guide again on this device, for example to use another password.', '在这台设备上重新锁定本导览，例如为了换用另一个密码。'),
  logOffBtn: b('Log Off', '注销'),
  loggedOnAs: (who: Bi) => b(`Logged on as ${who.en}`, `登录身份：${who.zh || who.en}`),
  noscriptMap: b('The interactive map needs JavaScript; everything else is below.', '交互式地图需要 JavaScript；其他内容都在下面。'),
  // Status bar.
  hint: b('Click a place on the map or in the list to see its details.', '单击地图或列表中的地点即可查看详情。'),
  hintTouch: b('Tap a place to see its details.', '轻点一个地点即可查看详情。'),
  copied: b('Address copied.', '地址已复制。'),
  linkCopied: b('Link copied.', '链接已复制。'),
  copyFailed: b('Could not copy. Select the text and copy it yourself.', '无法复制。请选中文字后自行复制。'),
  guides: (n: number) => b(`${n} guide(s)`, `${n} 份导览`),
  openOf: (open: number, total: number, items: Bi, day: Bi) =>
    b(`${open} of ${total} ${items.en.toLowerCase()} open - ${day.en}`, `${day.zh || day.en}：${total} 个${items.zh || items.en}中 ${open} 个开放`),
  countAll: (total: number, items: Bi) => b(`${total} ${items.en.toLowerCase()}`, `${total} 个${items.zh || items.en}`),
  matches: (n: number, q: string) => b(`${n} match "${q}"`, `${n} 个匹配“${q}”`),
  plusListings: (n: number, listings: Bi) => b(` + ${n} ${listings.en.toLowerCase()}`, ` + ${n} 个${listings.zh || listings.en}`),
  noMatch: b('Nothing matches. Try another day, or clear Find.', '没有匹配的地点。换一天试试，或清除查找。'),
  // Today note.
  before: (start: Bi, end: Bi, tz: Bi) => b(`This guide covers ${start.en} to ${end.en}. Days and opening times use ${tz.en || 'local time'}.`, `本导览涵盖 ${start.zh} 至 ${end.zh}。日期和开放时间均按${tz.zh || tz.en || '当地时间'}计算。`),
  next: b('Next:', '下一项：'),
  todayIs: b('Today:', '今天：'),
  nothingToday: b('Nothing scheduled today.', '今天没有安排。'),
  after: (start: Bi, end: Bi) => b(`This guide was for ${start.en} to ${end.en} and is no longer checked.`, `本导览适用于 ${start.zh} 至 ${end.zh}，现已不再核实。`),
  // Menus and dialogs.
  logOffAsk: b('Lock this guide on this device? You will need the password to open it again.', '要在这台设备上锁定本导览吗？再次打开需要输入密码。'),
  logOffFailed: b('Could not log off. Check your connection and try again.', '无法注销。请检查网络连接后重试。'),
  about: (title: Bi) => b(`${title.en}\nin the Field Guide for Xiangyin 98\n\nAn unofficial guide. Opening times are as published, not live; check before you go.`, `${title.zh || title.en}\nXiangyin 98 导览\n\n非官方导览。开放时间为公布信息，非实时；出发前请先确认。`),
  heat: b('Heat map', '热力图'),
  labels: b('Labels', '标签'),
  // Find's drop-down.
  findResults: b('Matches', '匹配结果'),
  findNone: b('Nothing found.', '没有找到。'),
  findShowAll: (n: number) => b(`Show all ${n} in the list`, `在列表中显示全部 ${n} 个`),
  findCount: (n: number) => b(`${n} found. Up and Down to choose, Enter to open.`, `找到 ${n} 个。用上下方向键选择，按回车打开。`),
  topics: (n: number, items: Bi) => b(`${n} ${items.en.toLowerCase()}`, `${n} 个${items.zh || items.en}`),
  stopsCount: (n: number) => b(`${n} stops`, `${n} 站`),
  // Where am I?
  whereAmI: b('Where am I?', '我在哪里？'),
  locating: b('Finding where you are...', '正在确定你的位置...'),
  youAreHere: b('You are here', '你在这里'),
  nearYou: b('Nearest to you', '离你最近'),
  nearNote: (day: Bi | null) => day
    ? b(`Open on ${day.en}, by straight-line distance. Walking times are rough.`, `${day.zh || day.en}开放，按直线距离排列。步行时间仅供参考。`)
    : b('By straight-line distance. Walking times are rough.', '按直线距离排列。步行时间仅供参考。'),
  nearNone: (day: Bi | null, filtered: boolean) => filtered
    ? b('Nothing on the map matches Find or the topic. Clear them to see the nearest places.', '地图上没有符合“查找”或主题的地点。清除它们即可看到最近的地点。')
    : day ? b(`Nothing on the map is open on ${day.en}.`, `${day.zh || day.en}地图上没有开放的地点。`)
    : b('Nothing is shown on the map.', '地图上没有显示任何地点。'),
  walk: (min: number) => b(`about ${min} min on foot`, `步行约 ${min} 分钟`),
  accuracy: (m: number) => b(`Accurate to about ${m} m`, `精度约 ${m} 米`),
  nearStatus: (n: number) => n === 0 ? b('You are on the map. Nothing near you is shown.', '你在地图上。附近没有显示的地点。')
    : n === 1 ? b('You are on the map. The nearest place is listed.', '你在地图上。已列出最近的地点。')
    : b(`You are on the map. The ${n} nearest are listed.`, `你在地图上。已列出最近的 ${n} 个。`),
  outside: (d: Bi) => b(`You are about ${d.en} from the area the map covers.`, `你距离地图覆盖的范围约 ${d.zh || d.en}。`),
  leftMap: (name: Bi) => b(`You have left this map. Showing ${name.en}.`, `你已离开这张地图。正在显示${name.zh || name.en}。`),
  locPrompt: b("Allow location in your browser's prompt...", '请在浏览器的提示中允许获取位置...'),
  live: b('Live location', '实时位置'),
  liveCentre: b('Live location: show me on the map', '实时位置：在地图上显示我'),
  liveStop: b('Stop', '停止'),
  liveOff: b('Live location is off.', '实时位置已关闭。'),
  meButton: b('Where am I? Follows you live on the map and lists the nearest places', '我在哪里？在地图上实时跟随你，并列出离你最近的地点'),
  meButtonOn: b('Live location is on. Press to stop', '实时位置已开启。按下即可停止'),
  locDenied: b('Your browser is not sharing your location with this site. To use Where am I?, allow location for this site, then press it again. In Chrome, click the icon at the left of the address bar. On an iPhone, also check Settings > Privacy & Security > Location Services.', '浏览器没有向本网站提供你的位置。如要使用“我在哪里？”，请允许本网站获取位置，然后再按一次。在 Chrome 中，点按地址栏左侧的图标。在 iPhone 上，还请检查“设置 > 隐私与安全性 > 定位服务”。'),
  locFailed: b('Your location could not be found. Try again in a moment, or outdoors.', '无法确定你的位置。请稍后再试，或到室外再试。'),
  locUnsupported: b('This browser cannot share your location.', '此浏览器无法提供你的位置。'),
  stopLocating: b('Stop showing my location', '不再显示我的位置'),
} as const;

/** The tier kicker: "A3 - Priority A". */
export const kicker = (id: string, tier: Bi): Bi => b(`${id} - ${tier.en}`, `${id} - ${tier.zh || tier.en}`);

/** "Tue-Sun", "Wed, Fri" for a weekly opening (any day chosen). */
export function weekPattern(open: string[] | undefined): Bi {
  if (!open || !open.length) return b('-', '-');
  const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const ZH = ['一', '二', '三', '四', '五', '六', '日'];
  const idx = ORDER.map((d, i) => (open.includes(d) ? i : -1)).filter((i) => i >= 0);
  if (idx.length === 7) return b('Daily', '每天');
  const runs: number[][] = [];
  for (const i of idx) {
    const r = runs[runs.length - 1];
    if (r && r[r.length - 1] === i - 1) r.push(i);
    else runs.push([i]);
  }
  const en = runs.map((r) => (r.length > 2 ? `${EN[r[0]]}-${EN[r[r.length - 1]]}` : r.map((i) => EN[i]).join(', '))).join(', ');
  const zh = runs.map((r) => (r.length > 2 ? `周${ZH[r[0]]}至周${ZH[r[r.length - 1]]}` : r.map((i) => `周${ZH[i]}`).join('、'))).join('、');
  return b(en, zh);
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "21 Oct 2026" / "2026年10月21日" for an ISO date. */
export function fullDate(d: string): Bi {
  const [y, m, day] = d.split('-').map(Number);
  return b(`${day} ${MONTHS_EN[m - 1]} ${y}`, `${y}年${m}月${day}日`);
}
/** "21 Oct 2026 - 7 Mar 2027". */
export function dateRange(a?: string, z?: string): Bi | null {
  if (!a && !z) return null;
  const A = a ? fullDate(a) : null, Z = z ? fullDate(z) : null;
  if (A && Z) return b(`${A.en} - ${Z.en}`, `${A.zh} - ${Z.zh}`);
  if (A) return b(`From ${A.en}`, `${A.zh}起`);
  return b(`Until ${Z!.en}`, `至${Z!.zh}`);
}

/** An event's time: "17:00-18:00", "17:00", or "". */
export const timeSpan = (start?: string, end?: string) => (start ? (end ? `${start}-${end}` : start) : '');
