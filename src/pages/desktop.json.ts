// /desktop.json: facts the desktop shows without loading every page
// (Properties, Find, Run, wallpapers, the screen saver). Never lists the
// unlisted pieces kept in drawers.
import type { APIRoute } from 'astro';
import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import { projects, imagesOf, site } from '../lib/content';
import { img } from '../lib/images';
import { rooms, floors, roomForProject } from '../lib/house';
import helpJson from '../content/help.json';
import type { Block } from '../lib/types';

const count = (blocks: Block[], ...types: Block['type'][]) => blocks.filter((b) => types.includes(b.type)).length;
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
        url: `/image/${p.slug}`,
        description: p.seo.description ?? '',
        thumb,
        cover: await large(img(all[0])),
        images: all.length,
        texts: count(blocks, 'text', 'marquee'),
        videos: count(blocks, 'video'),
        room: room ? { slug: room.slug, title: room.title, en: room.en, zh: room.zh, floor: room.floor.name, chapter: room.chapter } : null,
      };
    }),
  );

  const drawings = import.meta.glob<ImageMetadata>('../assets/house/*.png', { eager: true, import: 'default' });
  const wallpapers = [
    { name: 'Archive', src: await large(img('home/250304-archive-of-xiang-s-p-36.jpg')) },
    ...(await Promise.all(
      ['failure-of-memory', 'hanabi', 'into-the-woods', 'gestalt-lost-in-time', 'fragmented-ocean', 'farewell-and-resurrection']
        .map((slug) => projectData.find((p) => p.slug === slug))
        .filter((p) => !!p)
        .map(async (p) => ({ name: p!.title, src: p!.cover })),
    )),
    { name: 'South façade', src: (await getImage({ src: drawings['../assets/house/elevation-south.png'], width: 1600, format: 'webp' })).src, mode: 'center' },
  ];

  const body = {
    site: { name: site.name, email: site.contact.email, instagram: site.social[0].href },
    projects: projectData,
    rooms: rooms.map((r) => ({
      slug: r.slug,
      url: `/house/${r.slug}`,
      title: r.title,
      en: r.en,
      zh: r.zh,
      floor: r.floor.name,
      chapter: r.chapter,
      locked: !!r.locked,
      size: `${r.rect[2]} × ${r.rect[3]} mm`,
    })),
    floors: floors.map((f) => ({ id: f.id, name: f.name, zh: f.zh, rooms: rooms.filter((r) => r.floor.id === f.id).length })),
    pages: [
      { url: '/', title: 'Welcome', icon: 'welcome', type: 'Program' },
      { url: '/image', title: 'Projects', icon: 'folder', type: 'File Folder' },
      { url: '/image/all', title: 'All projects', icon: 'documents', type: 'Web page' },
      { url: '/house/facade', title: 'The House', icon: 'house', type: 'Program' },
      { url: '/house', title: 'Floorplan', icon: 'plan', type: 'Web page' },
      { url: '/house/appendix/index', title: 'Index of the house', icon: 'topic', type: 'Web page' },
      { url: '/house/appendix/chronology', title: 'Chronology', icon: 'topic', type: 'Web page' },
      { url: '/house/appendix/checklist', title: 'Checklist of the chapters', icon: 'topic', type: 'Web page' },
      { url: '/house/appendix/rules', title: 'Rules of the house', icon: 'topic', type: 'Web page' },
      { url: '/about', title: 'About.doc', icon: 'document', type: 'Document' },
      { url: '/contact', title: 'Contact', icon: 'mail', type: 'Program' },
      { url: '/help', title: 'Help', icon: 'help', type: 'Help file' },
    ],
    help: (helpJson as { topics: { id: string; title: string; keywords: string[] }[] }).topics.map((t) => ({ url: `/help#${t.id}`, title: t.title, keywords: t.keywords })),
    wallpapers,
    slideshow: projectData.map((p) => ({ title: p.title, src: p.cover, url: p.url })),
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
