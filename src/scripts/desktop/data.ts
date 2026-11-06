// The desktop's facts (/desktop.json), loaded once when first needed.

export interface ProjectInfo {
  slug: string;
  title: string;
  url: string;
  description: string;
  thumb: string;
  cover: string;
  images: number;
  texts: number;
  videos: number;
  room: { slug: string; title: string; en: string; zh: string; floor: string; chapter: number } | null;
}
export interface RoomInfo { slug: string; url: string; title: string; en: string; zh: string; floor: string; chapter: number; locked: boolean; size: string }
export interface PageInfo { url: string; title: string; icon: string; type: string }
export interface DesktopData {
  site: { name: string; email: string; instagram: string };
  projects: ProjectInfo[];
  rooms: RoomInfo[];
  floors: { id: string; name: string; zh: string; rooms: number }[];
  pages: PageInfo[];
  help: { url: string; title: string; keywords: string[] }[];
  wallpapers: { name: string; src: string; mode?: string }[];
  slideshow: { title: string; src: string; url: string }[];
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
