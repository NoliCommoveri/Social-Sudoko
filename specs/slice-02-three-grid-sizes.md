# Slice 2 — All three grid sizes

Corresponds to `sudoku-design.md` §6 step 2.

**Estimated cost:** Small (< 20k), *if* slice 1 held the §4.1 rule. If it did
not, this slice is where that bill arrives and it becomes Medium.

**Blocked on:** D2 (ages — decides whether 4×4 needs symbols instead of digits).
Not blocked on D1 or D3.

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
breaks here, which is precisely why 6×6 is the size worth testing hardest.

Border rule, stated once: a cell gets a heavy right border when
`(col + 1) % boxW === 0` and it is not the last column; a heavy bottom border
when `(row + 1) % boxH === 0` and it is not the last row.

### Layout

Board sizing switches to a container-relative unit so the same CSS serves a
4-wide and a 9-wide grid without three sets of rules. Cell font size scales with
cell size. The number pad shows `1..n` buttons — 4 buttons for 4×4, not 9 greyed
ones.

Whether the pad sits beside or below the board is the D3 answer.

### Persistence

`store/local.js` keys the saved game by size, so switching to 6×6 and back does
not destroy an in-progress 9×9. Key becomes `sudoku.v1.game.<sizeKey>`.

### Size picker

Three buttons. The last-chosen size persists as a preference. No labels beyond
the dimensions themselves — "4×4" is clearer to a child than "Beginner", and
size is not difficulty (that is slice 3).

## 3. The 4×4 question

**Depends on D2.** If a player is pre-literate or barely numerate, 4×4 with
digits is the wrong game — four colors or four shapes is the same puzzle and a
better teaching object, since the logic is identical and the symbol set is not a
reading test.

This is a `board.js` rendering change only. The core never learns about it;
values stay `1..4` and a display map turns them into glyphs. If D2 says it is
needed I will spec it properly; if not, this section is deleted.

## 4. Tests

- Every existing `grid.test.js` and `generator.test.js` case already runs across
  all three sizes. That is the point of having written them that way.
- Border-class assignment for 6×6: assert the exact set of cells carrying a heavy
  right border (columns 2 only) and a heavy bottom border (rows 1 and 3), by
  index. This test is the reason to write it out — the off-by-one here is easy
  and invisible.
- `carve` at 4×4 produces a uniquely-solvable set over 100 seeds. 4×4 has only
  288 grids and is where a subtly wrong uniqueness check shows up as a puzzle
  with two solutions.

## 5. Acceptance criteria

1. All three sizes deal, play, check, and complete.
2. 6×6 box borders correct at every one of the 36 cells, verified by test and by
   eye on `dev.html`.
3. A 9×9 board is fully usable on the smallest device from D3 without a
   horizontal scroll.
4. Switching size mid-game preserves the other size's board.
5. `no-hardcoded-sizes.test.js` still passes.

## 6. Explicitly not in this slice

Difficulty, tiering, the solver, timing, stats. A 4×4 is easier than a 9×9, but
that is not what R3 means and this slice must not pretend it is.
