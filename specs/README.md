# Slice specs

Implementation specs for the slice order in `sudoku-design.md` §6. One file per
slice. A slice is spec'd only when it is next or nearly next; unspec'd slices
live only as the one-line entry in §6.

| Slice | Spec | Cost | State |
|---|---|---|---|
| 1 | [`slice-01-grid-generator-solo.md`](slice-01-grid-generator-solo.md) | Medium | Spec'd, not started |
| 2 | [`slice-02-three-grid-sizes.md`](slice-02-three-grid-sizes.md) | Small | Spec'd, not started |
| 3 | [`slice-03-solver-and-rating.md`](slice-03-solver-and-rating.md) | Medium | Spec'd, not started |
| 4 | [`slice-04-difficulty-tiers.md`](slice-04-difficulty-tiers.md) | Medium | Spec'd, not started |
| 5 | [`slice-05-technique-library-hints.md`](slice-05-technique-library-hints.md) | Medium | Spec'd, not started |
| 6 | [`slice-06-storage-foundation.md`](slice-06-storage-foundation.md) | Medium | Spec'd, not started |
| 7 | [`slice-07-erase-export-import.md`](slice-07-erase-export-import.md) | Medium | Spec'd, not started |
| 8 | [`slice-08-timer-stats-best-times.md`](slice-08-timer-stats-best-times.md) | Medium | Spec'd, not started |
| 9 | WebSocket sync + race mode | — | Not spec'd |
| 10 | PWA | — | Not spec'd |

No slice is estimated above Medium. `CLAUDE.md` caps a session at ~120k tokens
and says a Large slice should be split rather than started; a spec that comes out
Large is a spec that has not been cut yet. Two slices in this table are halves of
one that was: slices 3 and 4, cut as described in
`slice-03-solver-and-rating.md` §1, and slices 6 and 7, cut as described in
`slice-06-storage-foundation.md` §1.

Slice 6 is the first slice with a server in it and the first that writes a row.
Everything `CLAUDE.md` says about migrations, seeds, the admin page, drift,
erase, and JSON export belongs to slices 6 and 7 together, and slice 8 is the
first slice that depends on either. Nothing before slice 6 stores anything a
player would miss (`questions.md` Q7).

**Slice 8 is where the schema stops being free.** Slices 6 and 7 may edit
`001_schema.sql` in place at no cost — slice 6 because an unused family code is
a database with no tables, slice 7 because no `results` row exists yet. Both do,
and both say what they changed and why they changed it there. From slice 8 on,
the same edit is still the sanctioned path but costs an export and an import,
and a new `NOT NULL` column with no default stops being a schema edit and
becomes data loss (slice 7 §5, slice 8 §3).

All open items live in [`questions.md`](questions.md): `S`* (a setup task only
you can do, in a browser), `D`* (a due out — needs information I do not have),
and `Q`* (an open question where I have a recommendation and will build it
unless you say otherwise). Slice files reference those IDs rather than restating
them. One due out is open: `D1`, the family code and the players' names, which
slice 6 seeds. It does not block that slice.

**Anything a slice cannot verify on its own is an `S`* item, not a line in that
slice's acceptance criteria.** Timing on the phone, a touch layout, a
keyboard-only run, a deployed URL — none of those can be closed by CI or by me,
and a criterion nobody owns is a criterion that gets assumed. S1 connects the
repo to Cloudflare; S2 is slice 1's four device checks. Slice 4's generation
budget, slice 5's library legibility on the phone, slice 6's six deployment
checks, slice 7's eight round-trip checks, and slice 8's finish-on-a-real-phone
checks each need the same treatment when that slice starts.

## Conventions these specs assume

Every spec below is written against these. They follow from `CLAUDE.md`, not
from taste, so changing one is a project-level decision, not a slice-level one.

- **No build step.** Source is plain ES modules loaded directly by the browser.
  No bundler, no transpile, no TypeScript, no npm dependency at runtime. This is
  a consequence of "no CLI": anything requiring `npm run build` before the site
  works cannot be driven from the GitHub web editor. It is a rule about
  `public/`. The Worker script added in slice 6 is bundled by `wrangler` on
  Cloudflare's build machine, is never served, and does not relax this for a
  single client file — `slice-06-storage-foundation.md` §2 draws the line.
- **No runtime dependencies.** Zero. Everything in `public/src/` is written here.
- **Pure core.** `public/src/core/` never touches the DOM, `window`, or storage. It is
  importable by both the browser and the CI test runner, which is what lets the
  same tests cover both.
- **Size-parameterized from line one.** No module outside `sizes.js` may contain
  a literal `4`, `6`, `9`, `16`, `36`, or `81`. Enforced by a test that greps the
  core sources. `3` is banned too, but with a short exemption list for the
  structural constants that genuinely equal three and are not dimensions —
  `UNIT_KINDS`, `MAX_TIER`. The list lives in the test and grows only by a
  deliberate edit. `2` is not banned; it is unusable as a signal.
  `slice-01-grid-generator-solo.md` §6 has the rule in full.
- **Everything served lives under `public/`.** That directory is the Worker's
  assets directory; the repo's docs and tests are not published.
- **Chrome only, current.** The players are on Android phones and a Chromebook.
  ES modules, CSS grid, container queries, `:has()`, and CSS nesting are used
  without fallbacks. The 360px-wide phone in portrait is the binding layout
  constraint.
