# Notes for Claude Code

- **Pull requests go to `main`**, the default branch; production builds from
  `main`. Branch from `origin/main` and open PRs with
  `gh pr create --base main`.
- **Before a PR**, run all three and fix what fails:
  `npm test`, `npx astro check`, `npm run build` (the build also runs the
  Field Guide leak guard and the Worker's tests).
- **Field Guide (`/guides`)**: read [`docs/GUIDES.md`](docs/GUIDES.md) first.
  Guide data is JSON in `src/content/guides/`; field names are in
  `src/lib/guides/types.ts`.
- **Kino (`/kino`)**: read [`docs/KINO.md`](docs/KINO.md) first. Films are in
  `src/content/kino.json` (fields in `src/lib/kino.ts`); the files themselves
  live only in the private R2 bucket `kuschonink-kino`, never in the repo.
- **Never put a password or key in the repo** (files, commits, PR text). The
  Field Guide's passwords are Cloudflare secrets named in
  `src/content/guides/access.json` (`GUIDES_PASSWORD`,
  `GUIDES_PASSWORD_FOTOFILMIC`, `GUIDES_PASSWORD_FOOD`); `GUIDES_COOKIE_SECRET` signs its log-on
  cookies (`TURNSTILE_SECRET` stands in when it isn't set; a secret under 24
  characters signs together with `TURNSTILE_SECRET`). `KINO_SECRET` signs the
  Kino's tickets; `KINO_PASSWORD` is the password for its films marked
  `"password": true`. `IPQS_KEY` is the IPQualityScore API key behind the
  start-up screen's fraud score (`worker/ipqs.ts`). For local testing use made-up values in the gitignored
  `.dev.vars`.
- **Writing**: British English, short plain sentences, written from the
  visitor's side. The interface is bilingual (`{ en, zh }`, Simplified Chinese
  in the terms of the Chinese edition of Windows 98), as described in
  [`docs/DESKTOP.md`](docs/DESKTOP.md).
- How the desktop and its programs work: `docs/DESKTOP.md`. The site overall:
  `README.md`.
