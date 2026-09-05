# Slice 2.5 — The openness floor

Corresponds to `sudoku-design.md` §6 step 2.5, implementing the floor half of
§4.3. Core only: no picker, no tiers, no UI change of any kind.

**Estimated cost:** Small (< 20k).

**Blocked on:** nothing. It needs singles, not the rating, so it does not wait on
slice 3.

---

## 1. Why this is not part of slice 4

Slices 1 and 2 shipped `deal` returning a minimal carve, and a minimal carve is
the hardest puzzle its solution grid can make. Measured on that generator at
9×9, over 30 seeds: 24 givens on average, **17 of 30 not solvable by naked and
hidden singles at all**, and a first round offering as few as one findable cell.
There is no difficulty picker until slice 4, so that was every deal at every
size — expert puzzles dealt to an 11-year-old with no hint button and no way to
ask for anything easier.

That is a defect in what slices 1 and 2 shipped, not a missing feature of slice
4, and it is fixed at a fraction of slice 4's cost because the floor needs
singles and nothing else. Slice 4 inherits the add-back machinery and layers the
technique ceiling on top.

## 2. The two axes

`sudoku-design.md` §4.3 has this in full; the short version is that the tier
system tiers by **hardest technique required** — a ceiling — and says nothing
about **how many deductions are available at once**. A tier-1 puzzle can be
singles-only and still be a single-file corridor. Openness is the floor on that,
and it is enforced on every deal regardless of tier.

## 3. What exists at the end

`SIZES[<size>].openness` — the floor, per size. Carried onto the geometry by
`makeGeometry`, because every caller that holds a geometry needs it and none of
them get to choose it. That is the difference from slice 4's tier, which is a
per-deal argument: the player picks a tier, nobody picks a floor.

`core/openness.js`:

- `measureOpenness(geom, givens) -> { solved, floor }`. Solves by singles one
  round at a time. `solved` is false and `floor` is 0 for a board any round
  stalls on — no partial credit, because a puzzle that stalls is one the players
  cannot finish. `floor` is `Infinity` when no round ever constrained it.
- `ease(geom, solution, base, rng, floor) -> givens`. Adds clues from `solution`
  in one shuffled order until `measureOpenness` is satisfied.

`core/candidates.js` — `popcount`, `valuesIn`, `lowestValue`, `seedCandidates`,
lifted out of `generator.js` so the search and the openness measure share one
copy rather than two. Extracting them is also what keeps the import graph
acyclic: `generator` imports `openness` imports `candidates`.

`deal(geom, seed)` runs `fillComplete` → `carve` → `ease`. The signature does
not change and neither does any UI file. Saved games self-invalidate: `restore`
already re-deals from the seed and drops a save whose givens no longer match
(slice 1 §5), which is exactly the case a generator change produces.

## 4. Where the floor is set

6 at every size. Measured over 60 deals per size at each candidate floor:

| Floor | 9×9 givens | 6×6 givens | 4×4 givens | 9×9 cost |
|---|---|---|---|---|
| 4 | 27.4 | 10.6 | 4.3 | 5.6ms |
| 5 | 28.6 | 11.6 | 5.0 | 5.7ms |
| **6** | **30.5** | **12.7** | **5.0** | **5.9ms** |
| 7 | 32.3 | 13.5 | 5.3 | 6.0ms |

30 givens at 9×9 is an ordinary easy-newspaper clue count, and the curve is flat
enough either side that the exact number is not load-bearing. Raise it if the
kids still stall; it is one edit in `sizes.js` and the tests re-assert against
whatever it says.

The measurement is a dev-machine number and is not asserted in CI. Slice 4's
criterion 6 owns the phone budget; 6ms against its 400ms leaves the retry loop
the whole envelope.

## 5. Tests

`test/openness.test.js`, 60 seeds per size:

1. **Complete grid** — solved, floor `Infinity`.
2. **Contradictory board** — not solved, floor 0.
3. **Endgame exclusion** — two holes in different rows, columns and boxes are
   both forced by their row alone, so the one round that fills the board does
   not constrain the floor. Without the exclusion nothing would ever pass.
4. **Carve alone stalls** — at least one 9×9 base in 60 is not singles-solvable.
   This is the test that fails if `carve` ever changes such that `ease` has
   nothing to do, and the reason the slice exists.
5. **`ease` is a superset** of its base and agrees with the solution, and mutates
   neither input.
6. **Every dealt puzzle** at every size solves by singles, has no round below
   `geom.openness`, is uniquely solvable, agrees with its solution, and still has
   empty cells.
7. **Monotonic in the floor** — a higher floor never yields fewer clues.
8. **`makeGeometry` rejects a size with no openness floor**, because the way that
   fails downstream is `ease` filling the entire grid in silence.

## 6. Acceptance criteria

1. `node --test 'test/*.test.js'` passes; the workflow is green.
2. Every dealt puzzle at every size is solvable with singles alone and offers at
   least `SIZES[<size>].openness` cells in every non-finishing round.
3. No file under `public/src/ui/` changes.

## 7. Explicitly not in this slice

The difficulty picker, tiers, the rating function, pencil marks, hints, and any
per-player difficulty. Openness is a floor under all of those, not a substitute
for them — slice 4 still owns the ceiling.

**One thing for slice 4 to decide.** Its binary search assumes `rate` is monotone
along a fixed add-back order. Openness is *mostly* monotone the same way but not
provably so: adding a clue can consume the very deduction that clue enabled. It
does not matter here, because `ease` walks the order one clue at a time and
re-measures rather than binary searching. It would matter if slice 4 tried to
fold the floor into the tier search. Measure before assuming it can.
