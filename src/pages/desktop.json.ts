// /desktop.json: facts the desktop shows without loading every page
// (Properties, Find, Run, wallpapers, the screen saver). Never lists the
// unlisted pieces kept in drawers.
import type { APIRoute } from 'astro';
import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import { projects, imagesOf, site } from '../lib/content';
import { img } from '../lib/images';
import { rooms, floors, roomForProject } from '../lib/house';
import { floorZh } from '../lib/i18n';
import helpJson from '../content/help.json';
import type { Block } from '../lib/types';

const count = (blocks: Block[], ...types: Block['type'][]) => blocks.filter((b) => types.includes(b.type)).length;
// What kind of thing a page is, as Properties and Find say it.
const TYPES = {
  program: { type: 'Program', typeZh: '程序' },
  folder: { type: 'File Folder', typeZh: '文件夹' },
  page: { type: 'Web page', typeZh: '网页' },
  document: { type: 'Document', typeZh: '文档' },
  help: { type: 'Help file', typeZh: '帮助文件' },
};
const large = async (src: ImageMetadata) => (await getImage({ src, width: Math.min(1600, src.width), format: 'webp', quality: 82 })).src;

export const GET: APIRoute = async () => {
  const projectData = await Promise.all(
    projects.map(async (p) => {
      const all = imagesOf(p.sections);
      const blocks = p.sections.flatMap((s) => s.blocks);
      const room = roomForProject(p.slug);
      const thumb = (await getImage({ src: img(all[0]), width: 320, height: 240, fit: 'cover', format: 'webp', quality: 72 })).src;
      return {
        slug: p.slug,
        title: p.title,
        titleZh: p.titleZh ?? '',
        url: `/image/${p.slug}`,
        description: p.seo.description ?? '',
        descriptionZh: p.seo.descriptionZh ?? '',
        thumb,
        cover: await large(img(all[0])),
        images: all.length,
        texts: count(blocks, 'text', 'marquee'),
        videos: count(blocks, 'video'),
        room: room ? { slug: room.slug, title: room.title, titleZh: room.titleZh, en: room.en, zh: room.zh, floor: room.floor.name, floorZh: floorZh(room.floor.zh), chapter: room.chapter } : null,
      };
    }),
  );

  const drawings = import.meta.glob<ImageMetadata>('../assets/house/*.png', { eager: true, import: 'default' });
  const wallpapers = [
    { name: 'Archive', nameZh: '档案', src: await large(img('home/250304-archive-of-xiang-s-p-36.jpg')) },
    ...(await Promise.all(
      ['failure-of-memory', 'hanabi', 'into-the-woods', 'gestalt-lost-in-time', 'fragmented-ocean', 'farewell-and-resurrection']
        .map((slug) => projectData.find((p) => p.slug === slug))
        .filter((p) => !!p)
        .map(async (p) => ({ name: p!.title, nameZh: p!.titleZh, src: p!.cover })),
    )),
    { name: 'South façade', nameZh: '南立面', src: (await getImage({ src: drawings['../assets/house/elevation-south.png'], width: 1600, format: 'webp' })).src, mode: 'center' },
  ];

  const body = {
    site: { name: site.name, email: site.contact.email, instagram: site.social[0].href },
    projects: projectData,
    rooms: rooms.map((r) => ({
      slug: r.slug,
      url: `/house/${r.slug}`,
      title: r.title,
      titleZh: r.titleZh,
      en: r.en,
      zh: r.zh,
      floor: r.floor.name,
      floorZh: floorZh(r.floor.zh),
      chapter: r.chapter,
      locked: !!r.locked,
      size: `${r.rect[2]} × ${r.rect[3]} mm`,
    })),
    floors: floors.map((f) => ({ id: f.id, name: f.name, zh: f.zh, rooms: rooms.filter((r) => r.floor.id === f.id).length })),
    pages: [
      { url: '/', title: 'Welcome', titleZh: '欢迎', icon: 'welcome', ...TYPES.program },
      { url: '/image', title: 'Projects', titleZh: '作品', icon: 'folder', ...TYPES.folder },
      { url: '/image/all', title: 'All projects', titleZh: '全部作品', icon: 'documents', ...TYPES.page },
      { url: '/house/facade', title: 'The House', titleZh: '房子', icon: 'house', ...TYPES.program },
      { url: '/house', title: 'Floorplan', titleZh: '平面图', icon: 'plan', ...TYPES.page },
      { url: '/house/appendix/index', title: 'Index of the house', titleZh: '房子的索引', icon: 'topic', ...TYPES.page },
      { url: '/house/appendix/chronology', title: 'Chronology', titleZh: '年表', icon: 'topic', ...TYPES.page },
      { url: '/house/appendix/checklist', title: 'Checklist of the chapters', titleZh: '章节清单', icon: 'topic', ...TYPES.page },
      { url: '/house/appendix/rules', title: 'Rules of the house', titleZh: '房子的规则', icon: 'topic', ...TYPES.page },
      { url: '/about', title: 'About.doc', titleZh: '关于.doc', icon: 'document', ...TYPES.document },
      { url: '/contact', title: 'Contact', titleZh: '联系', icon: 'mail', ...TYPES.program },
      { url: '/paint', title: 'Paint', titleZh: '画图', icon: 'paint', ...TYPES.program },
      { url: '/guides', title: 'Field Guide', titleZh: '导览', icon: 'guide', ...TYPES.program },
      { url: '/help', title: 'Help', titleZh: '帮助', icon: 'help', ...TYPES.help },
    ],
    help: (helpJson as { topics: { id: string; title: string; titleZh?: string; keywords: string[]; keywordsZh?: string[] }[] }).topics.map((t) => ({
      url: `/help#${t.id}`,
      title: t.title,
      titleZh: t.titleZh ?? '',
      keywords: t.keywords,
      keywordsZh: t.keywordsZh ?? [],
    })),
    wallpapers,
    slideshow: projectData.map((p) => ({ title: p.title, titleZh: p.titleZh, src: p.cover, url: p.url })),
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
