# kuschonink-routine

A copy of the Field Guide suggestions tool from
[itom123/kuschonink.com](https://github.com/itom123/kuschonink.com), for the
Claude Code scheduled task that checks the suggestions (that repository's
`docs/GUIDES.md`, section 11.6). The task has this repository attached, never
kuschonink.com itself, so it has no way to push there.

Every 10 minutes, the workflow in `.github/workflows/sync.yml` takes the files
of the commit the live site runs and commits them here when they changed: the
tool and the modules it imports, the guides' files, `package.json` and
`scripts/suggestions/ROUTINE.md` (the task's instructions), with
kuschonink.com's own `scripts/suggestions/download.mjs`, and this file,
`.gitignore`, `.claude/settings.json` and the workflow, from kuschonink.com's
`scripts/suggestions/routine-repo/`. It also writes `package-lock.json`, so
that the routine's `npm ci` installs sharp at exactly those versions.
`.download.json` says which commit.

`.claude/settings.json` lets a run use `./tool …` and
`npm ci --no-audit --no-fund` as written, and refuses `git push`,
`git commit`, `git remote` and `gh`.

Nothing here is changed by hand: the workflow pushes with this repository's
deploy key (the Actions secret `SYNC_DEPLOY_KEY`), with its commits credited to
the owner (itom123), since GitHub runs a schedule for the account that last
changed its cron line; a ruleset lets nothing else create, update or delete a
branch. To change these files, change them in
kuschonink.com; the next sync brings them here.

`.synced` changes once a month, so that the copy never goes 60 days without a
commit: GitHub turns a public repository's scheduled workflows off after that.
If the workflow was turned off anyway, turn it back on in Actions ▸ Sync ▸
Enable workflow (or `gh workflow enable sync.yml -R itom123/kuschonink-routine`).
