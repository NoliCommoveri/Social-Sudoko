# Slice 3 — Reduced logical solver and difficulty tiers

Corresponds to `sudoku-design.md` §6 step 3, implementing §4.3 and §4.4.

**Estimated cost:** Large (60–120k). Four techniques, a tier-construction search
on top of them, and a generation-time budget that could force a redesign. This
is the slice that justifies the whole slice order — get it wrong and R3 does not
work.

**Blocked on:** nothing.

**Assumes:** Q4 resolves as "pencil marks land here" — the naked-pair technique
is unteachable and nearly unusable without them.

---

## 1. What exists at the end

Puzzles are dealt at a chosen difficulty. Every tier of a given deal shares one
solution grid, so the same deal can be played by two people at two difficulties
— which is the mechanism R3 depends on, even though nothing multiplayer exists
until slice 6. Pencil marks exist. Hints exist.

---

## 2. Solver state

```js
State = { values: Uint16Array?, cands: Uint16Array }   // cands: bitmask per cell
```

Built from a clue set by `initState(geom, clues)`: every filled cell's value is
its only candidate, every empty cell starts at `geom.ALL`, then each clue
eliminates itself from its peers.

The solver never guesses and never branches. It is a confluent elimination
process: applying an available technique never removes a deduction that another
technique would have found. That property is what makes §5's tier search valid,
so nothing may be added to this module that breaks it.

## 3. Techniques

Four, per §4.4. Each is a pure function with the same shape:

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
serve the difficulty rater, the hint button, and the §7.3 technique bridge
without a second implementation. `applyStep(state, step)` mutates; the technique
functions never do.

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

## 4. Rating a clue set

```js
rate(geom, clues) -> 1 | 2 | 3 | null
```

Run `solveLogically` with tier-1 techniques only; if it solves, the set is tier
1. Otherwise retry with tiers 1–2, then 1–3. If none solve it, return `null` —
the set needs guessing and is harder than anything this project deals.

Cost: up to three solver runs, each linear-ish in cell count. This is called
many times in §5, which is where the budget goes.

## 5. Tier construction

The part that makes R3 work. Read §4.3 first; this is its algorithm.

```
1. solution = fillComplete(geom, rng)
2. base     = carve(geom, solution, rng)         // slice 1, uniquely solvable
3. order    = shuffled(rng, cells empty in base)  // one fixed add-back order
4. for target in [3, 2, 1]:
     k[target] = smallest k such that rate(base + order[0..k]) <= target
     tiers[target] = base + order[0..k[target]]
5. return { solution, tiers }
```

**Why the tiers are supersets of each other.** All three are prefixes of the
*same* add-back order applied to the *same* base, and `k[3] ≤ k[2] ≤ k[1]`. So
tier 1 ⊇ tier 2 ⊇ tier 3, every clue in every tier agrees with `solution`, and
all three are uniquely solvable because `base` already was. That is §4.3's
guarantee, and it holds by construction rather than by check.

**Why binary search is valid for step 4.** Adding a correct given can only help
a non-branching eliminator: any deduction available before is still available
after. So `rate` is monotone non-increasing along a fixed add-back order, and
each `k[target]` can be found by binary search — about 7 `rate` calls at 9×9
instead of up to 81. There is a test for the monotonicity assumption because the
whole search rests on it.

**Cost.** Three binary searches, ~7 `rate` calls each, up to 3 solver runs per
`rate` — order of 60 solver runs per deal. This is the number that decides
whether §7's budget holds, and the reason this slice is Large.

### Tier collapse

`k[3]` and `k[1]` can come out equal — the base was already easy, so all three
tiers are the same clue set. Expected at 4×4 (§4.3 says so) and occasional at
6×6.

Handling: re-carve and retry, up to 5 attempts, keeping the attempt with the
widest spread. If no attempt separates them, return the tiers that exist and let
the UI reflect it rather than looping.

### Unreachable tiers in the UI

At 4×4 tiers 2 and 3 essentially never exist. Two options: deal tier 1 while
displaying "Tricky", or do not offer the tier.

**Rec: do not offer it.** Probe each size once at startup — generate a handful of
deals, see which tiers separate, cache the answer — and show only the tiers that
size actually produces. A "Tricky" button that deals an easy puzzle teaches a
child that the labels are meaningless.

## 6. UI additions

- **Difficulty picker**, showing only reachable tiers per §5. Each button
  carries both the difficulty and the technique it requires — "Medium / needs
  naked pairs" — so the picker doubles as a table of contents for the technique
  library. The players are 11, 12, and adult, all fluent readers, so the real
  technique names go on the buttons rather than a simplified paraphrase beside
  them; those names are what §4.7 makes searchable, and a child who reads
  "pointing pair" on the button and then in the library has followed the link
  themselves.
- **Pencil marks** (Q4). Manual entry, plus a "fill all candidates" action.
  Auto-maintained marks — where entering a value clears it from peers — is an
  assist that hides the very deduction naked-pair teaches; the manual mode is
  the default and the auto mode is a setting, off. Slice 4 counts it as an
  assist.
- **Hint button.** Runs the solver on the live board, shows the technique name
  and highlights `step.cells`, and places the value only on a second press.
  Name-and-highlight first is the teaching move; handing over the digit is not.
  Hints increment `assists` on the session player (§4.5).
- Hint on a board with a wrong entry: the solver will find nothing or find a
  contradiction. Say "there is a mistake on the board" and stop. Do not silently
  fall back to comparing against the solution — that would leak the answer
  through a button labelled "hint".

## 7. Acceptance criteria

1. Each technique has a hand-built fixture where it is the *only* technique that
   fires, and a fixture where it must not fire. These double as slice 5's
   technique-library entries — build them as `{ id, name, gridSize, cells,
   highlight, caption }` from the start (§4.7) and slice 5 gets its content free.
2. Monotonicity test: over 50 random bases, adding clues one at a time along a
   fixed order never increases `rate`.
3. Superset test: over 100 deals per size, tier1 ⊇ tier2 ⊇ tier3, every clue
   agrees with `solution`, and every tier is uniquely solvable.
4. Solver soundness: over 200 deals, every placement the solver makes agrees
   with the known solution. A logical solver that places a wrong digit is worse
   than no solver.
5. Tier separation: at 9×9, ≥90% of deals produce three distinct clue counts.
   Below that, the tier search needs rework before this slice is done.
6. Generation budget: a full three-tier 9×9 deal in **under 500ms** p95 on the
   Android phone. Hard fail above 2s.
7. `rate` never returns a tier for a set the restricted solver did not actually
   finish.

### If criterion 6 fails

In preference order: memoize `rate` across the binary search (the same prefix
gets re-rated); stop re-carving on collapse; generate tier 3 synchronously and
the easier tiers lazily on demand; move generation into a Web Worker. Web Worker
last — it is the largest change and the only one that touches the UI's
assumptions about generation being synchronous.

## 8. Explicitly not in this slice

Timing, stats, best times, the §7.3 "what applies here?" bridge (it needs the
technique library from slice 5), the §7.2 no-guess lock, and anything
server-side. Naked triples and X-wing are not in this slice and not in this
project.
