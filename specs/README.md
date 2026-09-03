# Slice specs

Implementation specs for the slice order in `sudoku-design.md` §6. One file per
slice. A slice is spec'd only when it is next or nearly next; unspec'd slices
live only as the one-line entry in §6.

| Slice | Spec | State |
|---|---|---|
| 1 | [`slice-01-grid-generator-solo.md`](slice-01-grid-generator-solo.md) | Spec'd, not started |
| 2 | [`slice-02-three-grid-sizes.md`](slice-02-three-grid-sizes.md) | Spec'd, not started |
| 3 | [`slice-03-solver-and-tiering.md`](slice-03-solver-and-tiering.md) | Spec'd, not started |
| 4 | Timer + stats + best times | Not spec'd — blocked on D1, D2 |
| 5 | Technique library | Not spec'd |
| 6 | DO + WebSocket sync, race mode | Not spec'd — blocked on D1 |

All open items live in [`questions.md`](questions.md), numbered `D`* (due out —
needs you) and `Q`* (open question — I have a recommendation and will build it
unless you say otherwise). Slice files reference those IDs rather than restating
them.

## Conventions these specs assume

Every spec below is written against these. They follow from `CLAUDE.md`, not
from taste, so changing one is a project-level decision, not a slice-level one.

- **No build step.** Source is plain ES modules loaded directly by the browser.
  No bundler, no transpile, no TypeScript, no npm dependency at runtime. This is
  a consequence of "no CLI": anything requiring `npm run build` before the site
  works cannot be driven from the GitHub web editor.
- **No runtime dependencies.** Zero. Everything in `src/` is written here.
- **Pure core.** `src/core/` never touches the DOM, `window`, or storage. It is
  importable by both the browser and the CI test runner, which is what lets the
  same tests cover both.
- **Size-parameterized from line one.** No module outside `SIZES` may contain a
  literal `9`, `3`, or `81`. Enforced by a test that greps the core sources.
