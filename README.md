# Social-Sudoko

A sudoku the family plays together. Solo play at 4x4, 6x6 and 9x9, difficulty
tiers built from a shared solution grid, a technique library that teaches the
moves, and — later — timing, best times, and racing the same puzzle at different
tiers.

- `sudoku-design.md` — what is being built and why, including the slice order.
- `specs/` — an implementation spec per slice, plus `questions.md` for open
  decisions and anything needed from outside the code.
- `public/` — everything that is served. Plain ES modules, no build step, no
  runtime dependencies.
- `test/` — `node:test` suites, run by GitHub Actions on every push.

`public/dev.html` is a developer page: generator timing on the actual phone and
a visual spot-check of dealt puzzles. It is not a test suite.
