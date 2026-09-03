# Slice 1 — Grid model, generator, solo play

Corresponds to `sudoku-design.md` §6 step 1. One grid size, no timer, no server,
no difficulty selection.

**Estimated cost:** Medium (20–60k). The generator is the only part with real
uncertainty; everything else is mechanical.

**Blocked on:** nothing. This slice can start before D1 is answered — it runs
from a local file or any static host.

**Assumes, per `questions.md`:** Q1 (9×9 only), Q2 (node `--test` in CI plus a
`/dev` page), Q3 (check button), Q4 (no pencil marks yet), Q7 (`localStorage`
for in-progress board only).

---

## 1. What exists at the end

A page you open, that deals a 9×9 puzzle you can solve with keyboard or touch,
that tells you when you have solved it, and that is still there when you come
back to the tab. No accounts, no timing, no server, no difficulty picker.

---

## 2. Files

```
index.html            entry, <script type="module" src="src/ui/app.js">
dev.html              generator timing + visual spot-check page
src/
  core/
    sizes.js          the only place grid dimensions are written down
    grid.js           geometry: indices, units, peers
    rng.js            seeded PRNG
    generator.js      fill, count solutions, carve
  ui/
    board.js          render + input for one board
    app.js            wiring, new-game, completion
  store/
    local.js          localStorage read/write, versioned key
test/
  grid.test.js
  generator.test.js
  no-hardcoded-sizes.test.js
.github/workflows/test.yml
```

## 3. Representation

Decided here because everything downstream inherits it.

- **Cells are a single index**, `0 .. n²-1`, row-major. Not `[row][col]`. One
  index means peer sets are flat integer arrays and there is no row/col
  transposition bug to make.
- **Values are `Uint8Array(n*n)`**, `0` = empty, `1..n` = a digit.
- **Candidates are `Uint16Array(n*n)`** of bitmasks, bit `v-1` set means `v` is
  possible. `n ≤ 9` so a 16-bit lane is enough with room spare. Slice 3's solver
  is built entirely on these; slice 1 uses them inside the generator only.
- **Geometry is a value, not a global.** Every core function takes `geom` as its
  first argument.

### `sizes.js`

```js
export const SIZES = {
  4: { n: 4, boxW: 2, boxH: 2 },
  6: { n: 6, boxW: 3, boxH: 2 },
  9: { n: 9, boxW: 3, boxH: 3 },
};
```

Slice 1 ships all three entries and uses only `9`. Slice 2 is then a UI change,
not a model change.

### `grid.js`

```js
makeGeometry({ n, boxW, boxH }) -> {
  n, boxW, boxH, cellCount,
  rowOf:  Uint8Array,       // cell -> row
  colOf:  Uint8Array,
  boxOf:  Uint8Array,
  units:  Uint8Array[],     // 3n arrays of n cell indices (rows, cols, boxes)
  unitsOf: Uint8Array[][],  // cell -> its 3 units
  peersOf: Uint8Array[],    // cell -> the 20 (at 9x9) distinct peer cells
  ALL: number,              // (1<<n)-1
}
```

Built once per size and memoized on `${n}:${boxW}:${boxH}`. Building it is
cheap; the memo is so that the solver in slice 3 can call `makeGeometry` freely
without thinking about it.

`boxW * boxH === n` is asserted. `boxW` is the box's width in columns, `boxH`
its height in rows — a 6×6 box is 3 wide and 2 tall, so there are 2 box-columns
and 3 box-rows.

### `rng.js`

`mulberry32(seed)` returning a `() => float in [0,1)`, plus `shuffled(rng, arr)`.
Seeded and injected, never `Math.random()` inside core. Two reasons: tests need
determinism, and a bad puzzle can be reproduced from its seed when someone
reports one.

## 4. Generator

Three functions, each independently testable.

### `fillComplete(geom, rng) -> Uint8Array`

Randomized backtracking with MRV cell ordering (always fill the cell with the
fewest candidates next) and shuffled value order. Maintains the candidate masks
incrementally rather than recomputing.

At 9×9 with MRV this effectively never deep-backtracks. No timeout needed.

### `countSolutions(geom, values, cap = 2) -> number`

Same search, counting rather than returning, stopping the moment the count
reaches `cap`. Every uniqueness check in this project uses `cap = 2` — nobody
needs the real count, only "is it more than one".

### `carve(geom, solution, rng) -> Uint8Array`

Walk cells in shuffled order. Remove one. If `countSolutions(..., 2) === 1`,
keep it removed; otherwise put it back. One pass.

This gives a set that is uniquely solvable and minimal *with respect to that
removal order* — not globally minimal, which nobody needs. Slice 3 builds tiers
by adding clues back to this set (§4.3), so "as few clues as this order allows"
is the right base.

**Q6: no symmetry.** See `questions.md`.

## 5. UI

### `board.js`

A CSS-grid board, one element per cell, no canvas — cells need to be individually
styled, focused, and later highlighted by the technique library (§4.7), which is
awkward on a canvas and free in the DOM.

- Box borders drawn from `boxW`/`boxH`, not hardcoded, so slice 2's 6×6 needs no
  change here.
- Givens are visually distinct from entered values and are not editable.
- One selected cell. Arrow keys and clicks/taps move it; digits `1..n` set it;
  `0`, backspace, delete clear it.
- An on-screen number pad, because D3 probably says touch. Cell-first: select a
  cell, then press a number. The alternative (pick a number, then paint cells)
  is faster for experts and confusing for beginners.
- Emits events; owns no game state. `app.js` owns state.

### `app.js`

- **New game** deals a fresh puzzle. Generation is synchronous and, per §7, must
  stay under the perf budget; if it does not, this becomes a worker and that is a
  slice 1 problem, not a later one.
- **Undo/redo** over a full move stack. Cheap, and kids will want it. `Ctrl+Z` /
  `Ctrl+Shift+Z` plus on-screen buttons.
- **Check** (Q3) marks currently-wrong cells against the solution. Marks clear on
  the next edit.
- **Completion** is detected on every edit: board full and equal to the solution.
  Says so. Does not record anything — there is nothing to record until slice 4.

### `store/local.js`

One key, `sudoku.v1.game`, holding `{ version, sizeKey, seed, givens, values,
moveStack }`. Written debounced on change, read at startup. A version mismatch
or a parse failure discards silently and deals a new game — this data is worth
nothing and must never block startup.

## 6. Tests

`node:test` + `node:assert`, no dependencies, run in CI (Q2).

**`grid.test.js`**
- For each of 4/6/9: every cell has exactly 3 units; every unit has `n` distinct
  cells; peer count is `2(n-1) + (boxW*boxH - 1) - (boxW-1) - (boxH-1)` — 20 at
  9×9, 12 at 6×6, 7 at 4×4.
- Peering is symmetric: `b ∈ peersOf[a] ⟺ a ∈ peersOf[b]`. No cell is its own
  peer.
- `makeGeometry` returns the identical object for repeated calls (memo).

**`generator.test.js`**
- `fillComplete` output is a valid complete grid: every unit is a permutation of
  `1..n`. 200 seeds, all three sizes.
- Same seed twice gives an identical grid. Different seeds give different grids.
- `countSolutions` on a complete grid is 1; on an empty 4×4 grid is 288 with
  `cap = Infinity` (a known constant, and a real check that the counter is not
  quietly wrong); on a grid with one cell emptied is 1.
- `carve` output is uniquely solvable — `countSolutions(carved, 2) === 1` — over
  100 seeds at 9×9.
- `carve` output is a subset of its solution: every non-zero clue matches.
- Removing any single further clue from a carved grid... is *not* tested. That is
  global minimality and `carve` does not promise it.

**`no-hardcoded-sizes.test.js`**
- Reads every file in `src/core/` except `sizes.js` and fails on a standalone
  `9`, `81`, or `3` literal. Crude, and it will occasionally need an inline
  exemption comment, but it is the only mechanical defense of the §4.1 rule and
  the rule is load-bearing for slice 2.

## 7. Acceptance criteria

Objective, checkable, and the slice is not done until each holds.

1. `node --test` passes; the Actions workflow is green on the branch.
2. Dealing a 9×9 puzzle completes in **under 250ms** at the 95th percentile over
   100 deals, measured on the slowest device from D3. Hard fail above 1s.
   Measured by `dev.html`, not asserted in CI, because CI runner speed says
   nothing about a tablet.
3. Every dealt puzzle has exactly one solution — enforced by construction and
   spot-verified on `dev.html`.
4. A full solve start to finish on a touch device with no keyboard.
5. Reload mid-puzzle restores the board, the givens, and the undo stack.
6. `src/core/` imports nothing. Not from `src/ui/`, not from `node:`, not from a
   URL.

## 8. Explicitly not in this slice

Named so they do not creep in: difficulty tiers, the logical solver, hints,
pencil marks, timing, stats, 4×4 and 6×6 in the UI, player names, anything
server-side.
