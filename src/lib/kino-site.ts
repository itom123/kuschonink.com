// The Kino's films for the pages (Astro only): src/content/kino.json, checked
// at build time against the projects. The rules are in ./kino (shared with the
// browser and the Worker). A mistake stops the build with every problem listed.
import kinoJson from '../content/kino.json';
import { imagesOf, projects } from './content';
import { img } from './images';
import { loadKino, type KinoFile, type KinoFilm } from './kino';

export const films: KinoFilm[] = loadKino(kinoJson as KinoFile, projects.map((p) => p.slug));

/** The films Now Showing lists (and the garage, and Previous/Next): all but those with "listed": false. */
export const showing: KinoFilm[] = films.filter((f) => f.listed !== false);

/** A film by id; an unknown id stops the build (a project's video block naming a film that isn't in kino.json). */
export function kinoFilm(id: string, where = 'a video block'): KinoFilm {
  const f = films.find((x) => x.id === id);
  if (!f) throw new Error(`Kino: ${where} names the film "${id}", which isn't in src/content/kino.json`);
  return f;
}

/** The films of a project, in showing order. */
export const filmsOf = (project: string) => films.filter((f) => f.project === project);

/**
 * A film's picture, as a path under src/assets/images: its own `poster`, or
 * else its project's first picture (the one the Projects folder shows), or
 * null. A poster that isn't there stops the build.
 */
export function posterOf(f: KinoFilm): string | null {
  if (f.poster) {
    img(f.poster); // throws when the file is missing
    return f.poster;
  }
  const p = f.project ? projects.find((x) => x.slug === f.project) : undefined;
  return p ? imagesOf(p.sections)[0] ?? null : null;
}

// Every poster is checked once, at build time.
for (const f of films) posterOf(f);
