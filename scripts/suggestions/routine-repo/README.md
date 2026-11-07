# kuschonink-routine

A copy of the Field Guide suggestions tool from
[itom123/kuschonink.com](https://github.com/itom123/kuschonink.com), for the
Claude Code scheduled task that checks the suggestions (that repository's
`docs/GUIDES.md`, section 11.6). The task has this repository attached, never
kuschonink.com itself, so it has no way to push there.

Every 10 minutes, the workflow in `.github/workflows/sync.yml` takes the files
of the commit the live site runs, with kuschonink.com's own
`scripts/suggestions/download.mjs`, and commits them here when they changed:
the tool and the modules it imports, the guides' files, `package.json` and
`scripts/suggestions/ROUTINE.md`, the task's instructions. `.download.json`
says which commit.

Don't change anything here: each sync replaces everything but this file,
`.gitignore` and `.github/`, and a ruleset lets only that workflow push. These
three files come from kuschonink.com's `scripts/suggestions/routine-repo/`:
change them there first.
