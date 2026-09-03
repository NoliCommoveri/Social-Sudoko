# Slice 3 — Reduced logical solver and difficulty rating

Corresponds to `sudoku-design.md` §6 step 3, implementing §4.4. Core only: four
technique functions, the loop that drives them, and the rating function built on
top. No UI, no tiers, no pencil marks, no hints, nothing that touches the DOM.

**Estimated cost:** Medium (20–60k).

**Blocked on:** nothing.

**Hands to slice 4:** a `rate` function proven sound and proven monotone. Those
two properties are what slice 4's binary search rests on, and they are the whole
reason this is a slice on its own.

---

## 1. Why this is separate from the tiers

Steps 3 and 4 were one slice, and one slice that size does not fit a session.
The split is at the one boundary that costs nothing to cut:

- Everything here is a pure function of a clue set, testable against hand-built
  fixtures. It does not depend on the generator's output distribution, on a
  timing budget, or on anything a browser does.
- Everything in slice 4 is a search that calls `rate` a few dozen times per
  deal, wrapped in a retry loop, measured per size, exposed through a picker.

Cut anywhere else and the two halves interleave. Cut here and slice 3 ends at a
clean stopping point: `rate` behaves, with tests that say so, and slice 4 opens
against a committed tree.

There is a second reason, and it is the one that actually matters. Slice 4's
search is monotone-binary and retry-bounded — a wrong `rate` does not surface as
a wrong answer there, it surfaces as tier collapse, mislabelled puzzles, or a
budget overrun, all of which look like problems with the search. Debugging a
rating function through a retry loop is the expensive way to do it. Prove `rate`
first, in isolation, where a wrong answer is a failing assertion on a
seven-cell fixture.

---

## 2. Files

```
public/src/core/
  solver.js        initState, applyStep, solveLogically
  techniques.js    the four technique functions
  rate.js          rate()
  fixtures.js      hand-built technique examples (see §6)
test/
  techniques.test.js
  solver.test.js
  rate.test.js
```

`fixtures.js` lives in `core/` rather than `test/` because slice 5 serves it to
the browser as the technique library's content. It is data, it is imported by
both the test runner and the page, and it obeys every `core/` rule including the
`no-hardcoded-sizes` grep.

## 3. Solver state

```js
State = { values: Uint16Array?, cands: Uint16Array }   // cands: bitmask per cell
```

Built from a clue set by `initState(geom, clues)`: every filled cell's value is
its only candidate, every empty cell starts at `geom.ALL`, then each clue
eliminates itself from its peers.

The solver never guesses and never branches. It is a confluent elimination
process: applying an available technique never removes a deduction that another
technique would have found. That property is what makes slice 4's tier search
valid, so nothing may be added to this module that breaks it.

## 4. Techniques

Four, per `sudoku-design.md` §4.4. Each is a pure function with the same shape:

```js
technique(geom, state) -> Step | null

Step = {
  technique: 'naked-single' | 'hidden-single' | 'naked-pair' | 'pointing-pair',
  cells: number[],          // the cells that justify the deduction
  unit: number | null,      // the unit it was found in, for highlighting
  placements: [{ cell, value }],
  eliminations: [{ cell, value }],
}
```

Returning a `Step` rather than mutating is what lets the same four functions
serve slice 4's difficulty rater, slice 5's hint button, and the §7.3 technique
bridge without a second implementation. `applyStep(state, step)` mutates; the
technique functions never do.

| Technique | Rule | Tier it unlocks |
|---|---|---|
| Naked single | A cell with one candidate | 1 |
| Hidden single | A value with one possible cell in a unit | 1 |
| Naked pair | Two cells in a unit sharing the same two candidates; eliminate those two values from the unit's other cells | 2 |
| Pointing pair | A value confined within a box to one row or column; eliminate it from the rest of that row or column | 3 |

Deliberately absent: box-line reduction's converse (line-box), naked/hidden
triples, X-wing and beyond. §4.4 draws the line and this slice does not move it.

`solveLogically(geom, clues, allowed) -> { solved, steps, state }` loops the
allowed techniques in tier order — cheapest first — applying the first that
fires, until the board is solved or nothing fires.

The tier numbers `1 | 2 | 3` and the tier count are constants in this module.
`MAX_TIER = 3` is exported from `rate.js` and is the second entry in
`no-hardcoded-sizes.test.js`'s exemption list (slice 1 §6) — a tier count is not
a grid dimension, and like `UNIT_KINDS` it earns a name rather than an inline
literal.

## 5. Rating a clue set

```js
rate(geom, clues) -> 1 | 2 | 3 | Infinity
```

Run `solveLogically` with tier-1 techniques only; if it solves, the set is tier
1. Otherwise retry with tiers 1–2, then 1–3. If none solve it, return `Infinity`
— the set needs guessing and is harder than anything this project deals.

**`Infinity`, not `null`, and this is not a style preference.** Every caller in
slice 4 asks `rate(...) <= target`. In JavaScript `null <= 3` is `true`, and so
is `null <= 1`, because `null` coerces to `0` through relational comparison. A
`null` return would therefore make an unsolvable-by-logic clue set satisfy every
target, slice 4's binary searches would all return `k = 0`, and a deal would come
back as the bare `base` — a puzzle no listed technique can finish, labelled
whatever the player asked for. It would then present as tier collapse and burn
the retry budget, hiding its own cause. `Infinity` makes the comparison correct
by construction: `Infinity <= 3` is `false`, which is the answer the search
needs. Nothing downstream may reintroduce a nullable rating.

Cost: up to three solver runs, each linear-ish in cell count. Slice 4 calls this
repeatedly and that is where its budget goes; nothing here is optimized for it
yet. The two optimizations slice 4 may need — memoizing `rate` by prefix length,
and building each probe's state incrementally rather than from `initState` — are
slice 4's to make, and both are additions rather than changes to this interface.

### Monotonicity

Adding a correct given can only help a non-branching eliminator: any deduction
available before is still available after. So `rate` is monotone non-increasing
along a fixed add-back order.

This is stated here, and tested here, because it is a property of `rate` and
because slice 4's binary search is invalid without it. Slice 4 must not be the
place this assumption is first exercised.

## 6. Fixtures

Each technique gets a hand-built clue set where it is the *only* technique that
fires, and one where it must not fire. Written in the technique-library shape
from the start (`sudoku-design.md` §4.7):

```js
{ id, name, gridSize, cells, highlight, caption }
```

Slice 5 renders these through `board.js` and gets its content for free. Building
them in this shape costs nothing now — they have to be written down either way —
and retrofitting the shape later means rewriting every one of them. Prefer 4×4
and 6×6 boards where the technique is legible at a glance; a naked single needs
no 81 cells to demonstrate.

## 7. Tests

1. **Technique isolation.** For each of the four: a fixture where it is the only
   technique that fires, and a fixture where it must not fire. The negative case
   is the one that catches an over-eager implementation, which is the failure
   mode that corrupts a rating rather than crashing it.
2. **Step shape.** Every returned `Step` names cells that actually justify it:
   the eliminations follow from the cells, and the cells are all in `unit` where
   `unit` is not null.
3. **Purity.** Calling a technique function twice on the same state returns the
   same `Step` and leaves the state byte-identical. `applyStep` is the only thing
   that mutates.
4. **Solver soundness.** Over 200 generated deals, every placement
   `solveLogically` makes agrees with the known solution. A logical solver that
   places a wrong digit is worse than no solver.
5. **Rating soundness.** `rate` returns `Infinity`, never a number, for every set
   the restricted solver did not finish. Includes at least one hand-built set
   that genuinely requires guessing.
6. **Monotonicity.** Over 50 random bases, adding clues one at a time along a
   fixed order never increases `rate`.

## 8. Acceptance criteria

1. `node --test` passes; the workflow is green.
2. All six test groups above exist and pass.
3. `rate` is called by nothing outside `rate.js`'s own tests — there is no
   caller yet, and that is correct.
4. `public/src/core/` still imports nothing outside itself, and
   `no-hardcoded-sizes.test.js` passes with exactly two exemptions
   (`UNIT_KINDS`, `MAX_TIER`).
5. Nothing in `public/src/ui/` changed.

Criterion 5 is the one that keeps this slice the size it is. If a UI file needed
touching, the split was drawn wrong and it is worth saying so before continuing.

## 9. Explicitly not in this slice

Tier construction, the difficulty picker, pencil marks, the hint button, the
technique library page, `SIZES.tiers`, the generation budget, timing, stats,
anything server-side. Naked triples and X-wing are not in this slice and not in
this project.

Deal still takes no difficulty argument at the end of this slice, and the app
still looks exactly like it did at the end of slice 2.
