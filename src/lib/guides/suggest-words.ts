// Field Guide (导览): the words of the Suggest a Place wizard
// (src/scripts/guide/suggest.ts). Both languages; the Chinese follows the
// Chinese edition of Windows 98 (向导, 上一步, 下一步, 完成). No guide content and
// nothing that names a group or a venue: these words are in a public script.
import type { Bi } from './types';

export const SW = {
  title: { en: 'Suggest a Place', zh: '推荐地点' },
  menu: { en: '&Suggest a Place...', zh: '推荐地点(&S)...' },
  tool: { en: 'Suggest', zh: '推荐' },
  toolTip: { en: 'Suggest a place or a show for this guide', zh: '为这份导览推荐一个地点或展览' },
  back: { en: '< Back', zh: '< 上一步(B)' },
  next: { en: 'Next >', zh: '下一步(N) >' },
  send: { en: 'Send', zh: '发送' },
  cancel: { en: 'Cancel', zh: '取消' },
  close: { en: 'Close', zh: '关闭' },
  optional: { en: '(optional)', zh: '（可不填）' },
  step: (n: number, of: number): Bi => ({ en: `Step ${n} of ${of}`, zh: `第 ${n} 步，共 ${of} 步` }),

  // 1. What
  whatTitle: { en: 'What would you like to suggest?', zh: '你想推荐什么？' },
  whatLead: { en: 'A place or a show you think belongs in this guide, your own included. The more you tell us, the sooner it can go in.', zh: '一个你认为应该放进这份导览的地点或展览，你自己的也可以。写得越详细，就能越快收录。' },
  kind: { en: 'It is', zh: '类型' },
  kinds: {
    exhibition: { en: 'An exhibition', zh: '一个展览' },
    event: { en: 'An event', zh: '一项活动' },
    place: { en: 'A place to visit', zh: '一个值得去的地方' },
  },
  name: { en: '&Place or venue:', zh: '地点或场馆(&P)：' },
  namePh: { en: 'Galerie …, Musée …', zh: '画廊、美术馆……' },
  show: { en: 'Show &title:', zh: '展览名称(&T)：' },
  artists: { en: '&Artists:', zh: '艺术家(&A)：' },
  artistsPh: { en: 'One or more names', zh: '一位或多位' },
  own: { en: 'This is my own show (or my own place)', zh: '这是我自己的展览（或我自己的场所）' },

  // 2. When and where
  whenTitle: { en: 'When and where', zh: '时间和地点' },
  whenLead: { en: 'Dates and hours as the venue gives them. Leave out what you don’t know.', zh: '日期和开放时间以场馆公布的为准。不知道的可以不填。' },
  start: { en: '&First day:', zh: '第一天(&F)：' },
  end: { en: '&Last day:', zh: '最后一天(&L)：' },
  hours: { en: 'Opening &hours:', zh: '开放时间(&H)：' },
  hoursPh: { en: 'Tue–Sat 11:00–19:00', zh: '周二至周六 11:00–19:00' },
  address: { en: 'A&ddress:', zh: '地址(&D)：' },
  addressPh: { en: 'Street, number, postcode', zh: '街道、门牌号、邮编' },

  // 3. More
  moreTitle: { en: 'Links, a few words, a picture', zh: '链接、简介和图片' },
  moreLead: { en: 'A link to the show’s page helps most. A picture is welcome if it’s yours to share.', zh: '最有用的是展览网页的链接。如果你有权分享，也欢迎附一张图片。' },
  website: { en: '&Website:', zh: '网站(&W)：' },
  links: { en: '&Other links:', zh: '其他链接(&O)：' },
  linksPh: { en: 'One per line (up to 5)', zh: '每行一个（最多 5 个）' },
  description: { en: '&Why it’s worth seeing:', zh: '推荐理由(&Y)：' },
  picture: { en: 'P&icture:', zh: '图片(&I)：' },
  pictureNone: { en: 'No picture', zh: '没有图片' },
  pictureChoose: { en: 'Choose...', zh: '选择...' },
  pictureRemove: { en: 'Remove', zh: '删除' },
  pictureReading: { en: 'Preparing the picture…', zh: '正在准备图片……' },
  pictureBad: { en: 'This picture can’t be read here. Try a JPEG or PNG.', zh: '这里无法读取这张图片。请换成 JPEG 或 PNG。' },
  pictureNote: { en: 'Made smaller and stripped of its location data before it is sent.', zh: '发送前会缩小，并删除其中的位置等信息。' },
  credit: { en: 'Picture &credit:', zh: '图片署名(&C)：' },
  creditPh: { en: 'Photo: name of the photographer', zh: '摄影：摄影师姓名' },
  rights: { en: 'I took this picture, or I may share it', zh: '这张图片是我拍的，或者我有权分享' },

  // 4. About you
  youTitle: { en: 'About you (optional)', zh: '关于你（可不填）' },
  youLead: { en: 'Only if you’d like us to write back, or to see your name in the guide.', zh: '只有当你希望我们回复你，或希望在导览里署上你的名字时才需要填写。' },
  submitter: { en: 'Your &name:', zh: '你的名字(&N)：' },
  email: { en: '&Email:', zh: '电子邮箱(&E)：' },
  mayContact: { en: 'You may email me about this suggestion', zh: '可以就这条推荐给我发电子邮件' },
  creditAs: { en: 'Credit &me as:', zh: '署名为(&M)：' },
  creditAsPh: { en: 'Leave empty to stay anonymous', zh: '留空则不署名' },
  privacy: {
    en: 'Your name and email go only to the guide’s author, in a private list, to check this suggestion and to write to you if you allow it. They are deleted 90 days after the guide ends. A name you give under “Credit me” is printed in the guide, and the guide’s files are public on GitHub, so it stays in their history. Your internet address is used only to stop spam and is not kept.',
    zh: '你的名字和电子邮箱只会交给导览的作者，存放在一份不公开的名单里，用来核对这条推荐，并在你同意时与你联系。导览结束 90 天后会删除。你在“署名”里填写的名字会印在导览上；导览的文件在 GitHub 上是公开的，所以它会留在历史记录里。你的网络地址只用于防止垃圾信息，不会保存。',
  },

  // 5. Check and send
  checkTitle: { en: 'Check and send', zh: '确认并发送' },
  checkLead: { en: 'This is what will be sent. The guide’s author reads every suggestion before anything is added.', zh: '以下是要发送的内容。导览的作者会先看过每一条推荐，再决定是否收录。' },
  verifying: { en: 'Loading the anti-spam check…', zh: '正在加载反垃圾验证……' },
  sending: { en: 'Sending…', zh: '正在发送……' },
  nothing: { en: '(none)', zh: '（无）' },
  yes: { en: 'Yes', zh: '是' },
  no: { en: 'No', zh: '否' },

  // Done
  doneTitle: { en: 'Thank you!', zh: '谢谢你！' },
  done: (ref: string): Bi => ({ en: `Your suggestion is in, as ${ref}. If it’s added to the guide, it will appear here after a check.`, zh: `你的推荐已经收到，编号 ${ref}。如果被收录，经过核对后会出现在这里。` }),
  doneAgain: (ref: string): Bi => ({ en: `This suggestion was already sent, as ${ref}. Nothing more to do.`, zh: `这条推荐已经发送过了，编号 ${ref}。不用再发送。` }),
  doneMail: { en: 'Quote the number if you write to the guide’s author about it.', zh: '如果就此联系导览的作者，请注明这个编号。' },

  // In an entry's details (Details.astro)
  suggested: { en: 'Suggested', zh: '推荐人' },
  suggestedBy: (by: string, own: boolean): Bi =>
    by ? { en: `${by}${own ? ' (their own)' : ''}`, zh: `${by}${own ? '（本人作品）' : ''}` }
      : own ? { en: 'The artist or the venue', zh: '艺术家或场馆' } : { en: 'A reader of this guide', zh: '本导览的读者' },

  // Problems
  required: { en: 'Please fill this in.', zh: '请填写这一项。' },
  badUrl: { en: 'This doesn’t look like a web address (https://…).', zh: '这不像是网址（https://……）。' },
  badDate: { en: 'Please give a real date.', zh: '请填写一个有效的日期。' },
  beforeStart: { en: 'The last day is before the first.', zh: '最后一天早于第一天。' },
  badEmail: { en: 'Please check this email address, or leave it empty.', zh: '请检查电子邮箱地址，或者留空。' },
  tooManyLinks: { en: 'Five links at most, please.', zh: '最多 5 个链接。' },
  noHtml: { en: 'Please write plain text (no HTML).', zh: '请写纯文本（不要用 HTML）。' },
  needRights: { en: 'Tick this to send the picture, or remove it.', zh: '要发送图片请勾选此项，否则请删除图片。' },
  needCredit: { en: 'Who made the picture?', zh: '这张图片的作者是谁？' },
  notOpen: { en: 'Suggestions aren’t open yet.', zh: '目前还不能推荐。' },
  errors: {
    rate_limited: { en: 'Too many suggestions from here just now. Please wait a little, then send again.', zh: '刚才这里发送的推荐太多了。请稍等片刻再发送。' },
    busy: { en: 'Many suggestions are arriving just now. Please try again in an hour.', zh: '现在收到的推荐很多。请一小时后再试。' },
    verification_failed: { en: 'The anti-spam check failed. Please try again.', zh: '反垃圾验证没有通过。请重试。' },
    verification_unavailable: { en: 'The anti-spam check could not be reached. Please try again in a moment.', zh: '暂时无法连接反垃圾验证。请稍后再试。' },
    log_on_first: { en: 'Your log-on to this guide has run out. Log on again, then send.', zh: '你登录这份导览的时间已过。请重新登录后再发送。' },
    in_progress: { en: 'This suggestion is still being sent. Please wait a moment.', zh: '这条推荐还在发送中。请稍候。' },
    picture_too_large: { en: 'The picture is too large. Please choose a smaller one.', zh: '图片太大了。请换一张小一些的。' },
    bad_picture: { en: 'The picture could not be read. Please choose another, or send without it.', zh: '无法读取这张图片。请换一张，或者不附图片发送。' },
    not_configured: { en: 'Suggestions aren’t open yet.', zh: '目前还不能推荐。' },
    delivery_failed: { en: 'The suggestion could not be saved just now. Please try again later.', zh: '这条推荐暂时无法保存。请稍后再试。' },
    offline: { en: 'The suggestion could not be sent: check your connection, then try again.', zh: '推荐未能发送：请检查网络连接，然后再试一次。' },
  } as Record<string, Bi>,
} as const;
