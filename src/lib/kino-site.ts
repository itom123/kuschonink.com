// The Kino's films for the pages (Astro only): src/content/kino.json, checked
// at build time against the projects. The rules are in ./kino (shared with the
// browser and the Worker). A mistake stops the build with every problem listed.
import kinoJson from '../content/kino.json';
import { projects } from './content';
import { loadKino, type KinoFile, type KinoFilm } from './kino';

export const films: KinoFilm[] = loadKino(kinoJson as KinoFile, projects.map((p) => p.slug));

/** A film by id; an unknown id stops the build (a project's video block naming a film that isn't in kino.json). */
export function kinoFilm(id: string, where = 'a video block'): KinoFilm {
  const f = films.find((x) => x.id === id);
  if (!f) throw new Error(`Kino: ${where} names the film "${id}", which isn't in src/content/kino.json`);
  return f;
}

/** The films of a project, in showing order. */
export const filmsOf = (project: string) => films.filter((f) => f.project === project);
