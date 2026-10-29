import type { Home, Page, Project, Site } from './types';
import siteJson from '../content/site.json';
import homeJson from '../content/home.json';
import aboutJson from '../content/about.json';
import contactJson from '../content/contact.json';

export const site = siteJson as Site;
export const home = homeJson as Home;
export const about = aboutJson as Page;
export const contact = contactJson as Page;

const projectFiles = import.meta.glob<Project>('../content/projects/*.json', { eager: true, import: 'default' });

/** All projects, in the order listed in home.json. */
export const projects: (Project & { slug: string })[] = Object.entries(projectFiles)
  .map(([path, data]) => ({ ...data, slug: path.split('/').pop()!.replace(/\.json$/, '') }))
  .sort((a, b) => {
    const ia = home.projects.indexOf(a.slug);
    const ib = home.projects.indexOf(b.slug);
    return (ia === -1 ? 999 + a.order : ia) - (ib === -1 ? 999 + b.order : ib);
  });
