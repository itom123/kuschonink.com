// Content model. Every page is a list of sections; each section holds blocks.
// Content lives in src/content/*.json and is independent of styling.

export interface ImageRef {
  /** Path under src/assets/images, e.g. "projects/hanabi/flux.jpg" */
  src: string;
  alt?: string;
  caption?: string;
  link?: string;
  /** Focal point [x, y] from 0 to 1, used when the image is cropped. */
  focal?: [number, number];
}

export interface Background extends Omit<ImageRef, 'alt'> {
  /** Dark overlay opacity from 0 to 1. */
  overlay?: number;
}

export type Block =
  | { type: 'text'; html: string }
  | ({ type: 'image' } & ImageRef)
  | { type: 'gallery'; style: 'slideshow' | 'reel' | 'fullscreen' | 'masonry' | 'strips' | 'grid'; images: ImageRef[] }
  | { type: 'video'; provider: string; url: string; youtubeId?: string; vimeoId?: string; caption?: string }
  | { type: 'marquee'; items: string[] }
  | { type: 'banner'; images: ImageRef[] }
  | { type: 'contactForm' };

export interface Section {
  theme: 'light' | 'dark';
  background?: Background;
  blocks: Block[];
}

export interface Seo {
  title: string;
  description?: string;
}

export interface Page {
  title: string;
  seo: Seo;
  sections: Section[];
}

export interface Project extends Page {
  order: number;
}

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'textarea';
  required: boolean;
}

export interface Site {
  name: string;
  tagline: string;
  url: string;
  description: string;
  defaultImage: string;
  nav: { label: string; href: string }[];
  social: { label: string; href: string; icon: string }[];
  contact: {
    email: string;
    phone: string;
    form: { fields: FormField[]; submitText: string; successMessage: string; endpoint?: string; turnstileSiteKey?: string };
  };
}

export interface Home {
  seo: Seo;
  background: Background;
  projects: string[];
}
