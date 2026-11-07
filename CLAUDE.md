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
- **Never put a password or key in the repo** (files, commits, PR text). The
  Field Guide's passwords are Cloudflare secrets named in
  `src/content/guides/access.json` (`GUIDES_PASSWORD`,
  `GUIDES_PASSWORD_FOTOFILMIC`); `GUIDES_COOKIE_SECRET` signs its log-on
  cookies (`TURNSTILE_SECRET` stands in when it isn't set; a secret under 24
  characters signs together with `TURNSTILE_SECRET`). For local testing
  use made-up values in the gitignored `.dev.vars`.
- **Writing**: British English, short plain sentences, written from the
  visitor's side. The interface is bilingual (`{ en, zh }`, Simplified Chinese
  in the terms of the Chinese edition of Windows 98), as described in
  [`docs/DESKTOP.md`](docs/DESKTOP.md).
- How the desktop and its programs work: `docs/DESKTOP.md`. The site overall:
  `README.md`.
