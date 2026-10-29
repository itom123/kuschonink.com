// The bilingual pack: every piece of interface text, in English and Chinese.
// Content (rooms, furniture, lists, projects) keeps its own `zh` fields in
// src/content; this file holds the words of the site itself.

export interface Bi { en: string; zh: string }

/** "English · 中文" as plain text, for titles, aria-labels and placeholders. */
export const both = (b: Bi, sep = ' · ') => (b.zh && b.zh !== b.en ? `${b.en}${sep}${b.zh}` : b.en);

/** Short floor name in Chinese: "二层平面图" → "二层". */
export const floorZh = (zh: string) => zh.replace(/平面图$/, '');

export const chapter = (n: number | undefined): Bi =>
  n === undefined ? { en: 'Chapter —', zh: '第—章' } : { en: `Chapter ${n}`, zh: `第${n}章` };

export const drawerN = (n: number): Bi => ({ en: `drawer ${n}`, zh: `第${n}格抽屉` });

export const t = {
  // House chrome
  theHouse: { en: 'The House', zh: '房子' },
  simpleView: { en: 'Simple view', zh: '简易视图' },
  searchHouse: { en: 'Search this house', zh: '搜索这座房子' },
  searchLabel: { en: 'Search rooms and projects', zh: '搜索房间和作品' },
  searchNone: { en: 'Nothing in this house by that name.', zh: '这座房子里没有这个名字。' },
  blueprint: { en: 'Blueprint', zh: '蓝图' },
  floors: { en: 'Floors', zh: '楼层' },
  zoom: { en: 'Zoom', zh: '缩放' },
  zoomIn: { en: 'Zoom in', zh: '放大' },
  zoomOut: { en: 'Zoom out', zh: '缩小' },
  mapHelp: { en: 'Floorplan. Drag to move, scroll to zoom, PageUp and PageDown change floors.', zh: '平面图。拖动以移动，滚动以缩放，PageUp 和 PageDown 切换楼层。' },
  locked: { en: 'locked', zh: '上锁' },
  noDoorToast: { en: 'This room has no door.', zh: '这个房间没有门。' },
  close: { en: 'Close and return to the floorplan', zh: '关闭并回到平面图' },

  // Room panel
  inventory: { en: 'Inventory', zh: '清单' },
  constraintsFor: { en: 'Constraints for', zh: '约束：' },
  list: { en: 'List', zh: '列表' },
  value: { en: 'Value', zh: '内容' },
  status: { en: 'Status', zh: '状态' },
  coordinates: { en: 'Room coordinates', zh: '房间坐标' },
  hiddenNote: { en: 'Hidden constraints in red.', zh: '隐藏的约束以红色显示。' },
  howDealt: { en: 'How the constraints are dealt', zh: '约束如何分配' },
  missing: { en: 'This chapter is missing.', zh: '这一章缺失了。' },
  writingsHere: { en: 'The writings will be kept here.', zh: '文字将存放在这里。' },
  appendicesIndex: { en: 'Appendices: Index', zh: '附录：索引' },
  chapters: { en: 'Chapters', zh: '章节' },

  // Furniture and drawers
  furnitureHere: { en: 'Furniture in this room', zh: '房间里的家具' },
  clickDrawer: { en: 'Click a drawer to open it.', zh: '点击抽屉打开它。' },
  empty: { en: 'Empty.', zh: '空的。' },
  putBack: { en: 'Put it back', zh: '放回去' },
  unfolding: { en: 'Unfolding…', zh: '正在展开……' },
  unreadable: { en: 'This sheet could not be read.', zh: '这张纸无法读取。' },
  openAlone: { en: 'Open it on its own', zh: '单独打开' },
  closeDrawer: { en: 'Close the drawer', zh: '关上抽屉' },
  seeAlso: { en: 'See also', zh: '另见' },
  sharesWith: { en: 'Shares with the house', zh: '与房子共有' },

  // Façade
  facadeHint: { en: 'This is a house. Knock on the door, or look through a window.', zh: '这是一座房子。敲敲门，或者从窗户望进去。' },
  elevation: { en: 'South elevation of the house', zh: '南立面图' },
  enterDoor: { en: 'Enter by the front door', zh: '从正门进入' },
  seePlans: { en: 'See the floorplans', zh: '查看平面图' },
  simpleAll: { en: 'Simple view (all projects at once)', zh: '简易视图（一次看全部作品）' },

  // Appendices
  appendix: { en: 'Appendix', zh: '附录' },
  index: { en: 'Index', zh: '索引' },
  chronology: { en: 'Chronology', zh: '年表' },
  checklist: { en: 'Checklist of the chapters', zh: '章节清单' },
  rules: { en: 'Rules of the house', zh: '房子的规则' },
  indexNote: {
    en: 'Numbers are chapters. Bold: the thing is really there. Plain: it was only dealt to the room.',
    zh: '数字是章节。粗体：东西真的在那里。常规：只是分配给了这个房间。',
  },
  theGrid: { en: 'The grid', zh: '网格' },
  anInventory: { en: 'an inventory', zh: '一份清单' },
  roomWithoutDoor: { en: 'the room without a door. This chapter is missing.', zh: '没有门的房间。这一章缺失了。' },

  // Simple view
  projects: { en: 'Projects', zh: '作品' },
  allProjects: { en: 'All projects', zh: '全部作品' },
  allOnOnePage: { en: 'All on one page', zh: '全部在一页' },
  allProjectsOnOnePage: { en: 'All projects on one page', zh: '全部作品在一页' },
  about: { en: 'About', zh: '关于' },
  contact: { en: 'Contact', zh: '联系' },
  writings: { en: 'Writings', zh: '文字' },
  colophon: { en: 'Colophon', zh: '版本记录' },
  address: { en: 'Address', zh: '地址' },
  start: { en: 'Start', zh: '开始' },
  desktop: { en: 'Desktop', zh: '桌面' },
  menu: { en: 'Menu', zh: '菜单' },
  view: { en: 'View', zh: '视图' },
  largeIcons: { en: 'Large icons', zh: '大图标' },
  details: { en: 'Details', zh: '详细信息' },
  name: { en: 'Name', zh: '名称' },
  room: { en: 'Room', zh: '房间' },
  floor: { en: 'Floor', zh: '楼层' },
  chapterCol: { en: 'Chapter', zh: '章节' },
  images: { en: 'Images', zh: '图片' },
  texts: { en: 'Texts', zh: '文字' },
  videos: { en: 'Videos', zh: '视频' },
  sourceDealt: { en: 'Source (dealt)', zh: '来源（分配）' },
  classify: { en: 'The house collects; this window classifies.', zh: '房子收藏；这个窗口分类。' },
  upToProjects: { en: '↑ Up to Projects', zh: '返回作品' },
  findInHouse: { en: 'Find it in the house', zh: '在房子里找到它' },
  moreProjects: { en: 'More projects', zh: '更多作品' },
  top: { en: '↑ Top', zh: '回到顶部' },
  openOnItsOwn: { en: 'Open on its own', zh: '单独打开' },
  notFoundTitle: { en: 'The page cannot be found', zh: '找不到该网页' },
  notFoundBody: {
    en: 'The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.',
    zh: '你要找的网页可能已被删除、改名，或暂时无法访问。',
  },
  frontDoor: { en: 'Go to the front door', zh: '去正门' },
  seeAllProjects: { en: 'See all projects', zh: '查看全部作品' },
  inTheHouse: { en: 'In the house', zh: '在房子里' },

  // Blocks
  prevImage: { en: 'Previous image', zh: '上一张' },
  nextImage: { en: 'Next image', zh: '下一张' },
  watchVideo: { en: 'Watch video', zh: '观看视频' },
  required: { en: 'required', zh: '必填' },
} satisfies Record<string, Bi>;

/** Constraint statuses. */
export const statusZh: Record<string, string> = {
  fulfilled: '已满足',
  echoing: '回响',
  'semi-fulfilled': '半满足',
  'not fulfilled': '未满足',
  clinamen: '偏移',
};

/** Contact form error messages, by the Worker's error code. */
export const formErrors: Record<string, Bi> = {
  verification_failed: { en: 'The anti-spam check failed. Please try again.', zh: '反垃圾验证失败，请重试。' },
  rate_limited: { en: 'Too many messages just now. Please try again later.', zh: '刚才的消息太多了，请稍后再试。' },
  missing_required_field: { en: 'Please fill in every field.', zh: '请填写所有栏目。' },
  field_too_long: { en: 'One of the fields is too long.', zh: '有一栏内容太长。' },
  invalid_submission: { en: 'Please check your email address.', zh: '请检查你的电子邮箱地址。' },
  delivery_in_progress: { en: 'Your message is already on its way. Please wait a moment.', zh: '你的消息正在发送，请稍候。' },
};
