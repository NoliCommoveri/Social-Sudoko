# Slice specs

Implementation specs for the slice order in `sudoku-design.md` §6. One file per
slice. A slice is spec'd only when it is next or nearly next; unspec'd slices
live only as the one-line entry in §6.

| Slice | Spec | State |
|---|---|---|
| 1 | [`slice-01-grid-generator-solo.md`](slice-01-grid-generator-solo.md) | Spec'd, not started |
| 2 | [`slice-02-three-grid-sizes.md`](slice-02-three-grid-sizes.md) | Spec'd, not started |
| 3 | [`slice-03-solver-and-tiering.md`](slice-03-solver-and-tiering.md) | Spec'd, not started |
| 4 | Technique library | Not spec'd |
| 5 | Storage foundation — DO, migrations, admin page, export/import | Not spec'd |
| 6 | Timer + stats + best times | Not spec'd |
| 7 | WebSocket sync + race mode | Not spec'd |
| 8 | PWA | Not spec'd |

Slice 5 is the first slice that writes a row, and everything `CLAUDE.md` says
about migrations, seeds, the admin page, drift, erase, and JSON export belongs to
it. Slice 6 is the first slice that depends on it. Nothing before slice 5 stores
anything a player would miss (`questions.md` Q7).

All open items live in [`questions.md`](questions.md): `S`* (a setup task only
you can do, in a browser), `D`* (a due out — needs information I do not have),
and `Q`* (an open question where I have a recommendation and will build it
unless you say otherwise). Slice files reference those IDs rather than restating
them. No due outs are currently open; S1 — connecting the repo to Cloudflare —
is waiting on slice 1 to produce something worth serving.

## Conventions these specs assume

Every spec below is written against these. They follow from `CLAUDE.md`, not
from taste, so changing one is a project-level decision, not a slice-level one.

- **No build step.** Source is plain ES modules loaded directly by the browser.
  No bundler, no transpile, no TypeScript, no npm dependency at runtime. This is
  a consequence of "no CLI": anything requiring `npm run build` before the site
  works cannot be driven from the GitHub web editor.
- **No runtime dependencies.** Zero. Everything in `public/src/` is written here.
- **Pure core.** `public/src/core/` never touches the DOM, `window`, or storage. It is
  importable by both the browser and the CI test runner, which is what lets the
  same tests cover both.
- **Size-parameterized from line one.** No module outside `SIZES` may contain a
  literal `9`, `3`, or `81`. Enforced by a test that greps the core sources.
- **Everything served lives under `public/`.** That directory is the Worker's
  assets directory; the repo's docs and tests are not published.
- **Chrome only, current.** The players are on Android phones and a Chromebook.
  ES modules, CSS grid, container queries, `:has()`, and CSS nesting are used
  without fallbacks. The 360px-wide phone in portrait is the binding layout
  constraint.
