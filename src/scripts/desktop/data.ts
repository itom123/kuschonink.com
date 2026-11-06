// The desktop's facts (/desktop.json), loaded once when first needed.

// Chinese fields (…Zh) are empty when the content has no Chinese yet.
export interface ProjectInfo {
  slug: string;
  title: string;
  titleZh: string;
  url: string;
  description: string;
  descriptionZh: string;
  thumb: string;
  cover: string;
  images: number;
  texts: number;
  videos: number;
  room: { slug: string; title: string; titleZh: string; en: string; zh: string; floor: string; floorZh: string; chapter: number } | null;
}
export interface RoomInfo { slug: string; url: string; title: string; titleZh: string; en: string; zh: string; floor: string; floorZh: string; chapter: number; locked: boolean; size: string }
export interface PageInfo { url: string; title: string; titleZh: string; icon: string; type: string; typeZh: string }
export interface DesktopData {
  site: { name: string; email: string; instagram: string };
  projects: ProjectInfo[];
  rooms: RoomInfo[];
  floors: { id: string; name: string; zh: string; rooms: number }[];
  pages: PageInfo[];
  help: { url: string; title: string; titleZh: string; keywords: string[]; keywordsZh: string[] }[];
  wallpapers: { name: string; nameZh?: string; src: string; mode?: string }[];
  slideshow: { title: string; titleZh: string; src: string; url: string }[];
}

let loading: Promise<DesktopData> | null = null;

export function desktopData(): Promise<DesktopData> {
  loading ??= fetch('/desktop.json')
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<DesktopData>;
    })
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}
