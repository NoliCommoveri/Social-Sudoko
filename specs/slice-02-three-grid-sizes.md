# Slice 2 — All three grid sizes

Corresponds to `sudoku-design.md` §6 step 2.

**Estimated cost:** Small (< 20k), *if* slice 1 held the §4.1 rule. If it did
not, this slice is where that bill arrives and it becomes Medium.

**Blocked on:** nothing.

---

## 1. What exists at the end

The same solo play as slice 1, with a size picker offering 4×4, 6×6, and 9×9.

## 2. What actually changes

If slice 1 was written correctly, the core is already done — `SIZES` has all
three entries and `no-hardcoded-sizes.test.js` has been guarding the rule since
day one. This slice is layout, input, and one piece of real work.

### The real work: 6×6 box geometry

4×4 and 9×9 have square boxes; 6×6 does not. Its boxes are 3 wide and 2 tall, so
the grid is 2 boxes across and 3 boxes down. Every place that assumed
`boxW === boxH` — box border rendering, any `Math.sqrt(n)` that slipped in —
breaks here, which is why 6×6 is the size worth testing hardest.

Border rule, stated once: a cell gets a heavy right border when
`(col + 1) % boxW === 0` and it is not the last column; a heavy bottom border
when `(row + 1) % boxH === 0` and it is not the last row. At 6×6 that is column
2, and rows 1 and 3.

### Layout

Board sizing switches to a container-relative unit so one set of CSS rules
serves a 4-wide and a 9-wide grid. Cell font size scales with cell size. The
number pad shows `1..n` buttons — 4 for 4×4, not 9 with 5 greyed out.

4×4 and 6×6 are comfortable on the phone at any cell size; the container query
from slice 1 already handles them. This slice adds no new layout risk, only new
layout cases.

### Persistence

`store/local.js` keys the saved game by size, so switching to 6×6 and back does
not destroy an in-progress 9×9. The key becomes `sudoku.v1.game.<sizeKey>`.

### Size picker

Three buttons, last choice persisted as a preference. No labels beyond the
dimensions — size is not difficulty, and difficulty arrives in slice 3.

## 3. What 4×4 is for

Not for a younger player — everyone here is well past it. Its jobs are:

- **Technique-library fixtures.** A 4×4 board is where a naked single is legible
  at a glance, and slice 4 renders its examples through this same component.
- **The uniqueness check's hardest test.** 4×4 has only 288 valid grids, which
  makes a subtly wrong solution counter show up as a puzzle with two solutions
  rather than as nothing at all.
- **A two-minute game**, which is sometimes the game you want.

R2 requires it regardless. This section exists so nobody spends effort making
4×4 *appealing*; it needs to be correct, not attractive.

## 4. Tests

- Every `grid.test.js` and `generator.test.js` case already runs across all three
  sizes. That is the point of having written them that way.
- Border-class assignment for 6×6: assert by cell index the exact set carrying a
  heavy right border and a heavy bottom border. The off-by-one here is easy and
  invisible, which is the reason to write it out.
- `carve` at 4×4 produces a uniquely-solvable set over 100 seeds.

## 5. Acceptance criteria

1. All three sizes deal, play, check, and complete.
2. 6×6 box borders correct at every one of the 36 cells, verified by test and by
   eye on `dev.html`.
3. Switching size mid-game preserves the other size's board.
4. `no-hardcoded-sizes.test.js` still passes.

## 6. Explicitly not in this slice

Difficulty, tiering, the solver, timing, stats. A 4×4 is easier than a 9×9, but
that is not what R3 means and this slice must not pretend it is.
