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
until slice 7. Pencil marks exist. Hints exist.

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
rate(geom, clues) -> 1 | 2 | 3 | Infinity
```

Run `solveLogically` with tier-1 techniques only; if it solves, the set is tier
1. Otherwise retry with tiers 1–2, then 1–3. If none solve it, return `Infinity`
— the set needs guessing and is harder than anything this project deals.

**`Infinity`, not `null`, and this is not a style preference.** Every caller in
§5 asks `rate(...) <= target`. In JavaScript `null <= 3` is `true`, and so is
`null <= 1`, because `null` coerces to `0` through relational comparison. A
`null` return would therefore make an unsolvable-by-logic clue set satisfy every
target, the binary searches below would all return `k = 0`, and a deal would
come back as the bare `base` — a puzzle no listed technique can finish, labelled
whatever the player asked for. It would then present as tier collapse and burn
the retry budget, hiding its own cause. `Infinity` makes the comparison
correct by construction: `Infinity <= 3` is `false`, which is the answer the
search needs. Nothing downstream may reintroduce a nullable rating.

Cost: up to three solver runs, each linear-ish in cell count. This is called
repeatedly in §5, which is where the budget goes.

## 5. Tier construction

The part that makes R3 work. Read §4.3 first; this is its algorithm.

```
1. solution = fillComplete(geom, rng)
2. base     = carve(geom, solution, rng)         // slice 1, uniquely solvable
3. order    = shuffled(rng, cells empty in base)  // one fixed add-back order
4. k[t]     = smallest k such that rate(base + order[0..k]) <= t
5. tier[t]  = base + order[0..k[t]]
```

`rng` is seeded from the deal's seed, so `solution`, `base`, and `order` are all
functions of that seed alone. A tier is a prefix length over a chain the seed
fixes.

### One tier per deal

`deal(geom, seed, target) -> { solution, clues, tier }` computes `k[target]`
only. Interactive play needs the one difficulty the player picked; computing the
other two costs two more binary searches and throws both away.

Because the seed fixes the chain, any other tier of the same deal is reproducible
later — recompute `solution`, `base`, and `order` from the seed and run the
search for the tier you now want. Nothing has to be stored to make the guarantee
below hold across tiers computed at different times. Race mode (slice 7) needs
several tiers of one deal at once and pays for those searches when a session
starts, once, off the interactive path.

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
whole search rests on it, and a test that `rate` returns `Infinity` rather than a
number for a set the restricted solver did not finish, because the search rests
on that too.

**Cost.** One binary search, ~7 `rate` calls, up to 3 solver runs per `rate` —
order of 20 solver runs per deal on top of `carve`.

### Honouring the label

`k[t]` is the smallest prefix rating *at most* `t`, so `rate(tier[t])` can come
out below `t`: an easy base makes tier 3's clue set solvable by singles alone.
Dealing that under a "Tricky" button teaches a child that the labels are
meaningless, which is worse than offering fewer buttons.

The binary search already evaluates `rate` at `k[target]`, so the check is free:
if it comes back below `target`, the base was too easy for the label. Re-carve
and retry — a new `base` and a new `order` from the next seed in the sequence.

Retries are bounded twice: at most 5 attempts, and no new attempt once the deal
has spent more than half its §7 budget. On exhaustion, deal the attempt whose
rating is closest to the target and label it with the tier it **actually** rates,
never with the tier that was asked for.

A tier-1 request never retries — `rate` is at least 1, so `rate <= 1` means
`rate === 1` exactly. The cheapest path is also the one the youngest player uses
most.

### Which tiers each size offers

At 4×4 tiers 2 and 3 essentially never survive the check above, and at 6×6 tier 3
is intermittent. The UI must offer only the tiers a size actually produces.

Reachable tiers are a property of the geometry, not of the session, so they are
**measured once in CI and committed as a constant**, not probed at startup. A
startup probe would put several full deals in front of the first paint to
recompute a number that never changes.

`SIZES` gains a `tiers` field — it is the only sanctioned home for per-size
constants, and putting the list anywhere else in `core/` would trip
`no-hardcoded-sizes.test.js` on the size keys:

```js
export const SIZES = {
  4: { n: 4, boxW: 2, boxH: 2, tiers: [1] },
  6: { n: 6, boxW: 3, boxH: 2, tiers: [1, 2] },
  9: { n: 9, boxW: 3, boxH: 3, tiers: [1, 2, 3] },
};
```

Those lists are placeholders until measured. The workflow is: run the separation
test (criterion 7), read the per-tier honour rates from its output, commit the
lists, and the same test then asserts against them on every push. A tier whose
honour rate later falls below the threshold fails CI rather than quietly dealing
mislabelled puzzles.

## 6. UI additions

- **Difficulty picker**, showing `SIZES[<size>].tiers` and nothing else (§5). It
  reads a committed constant, so it renders on first paint with no generation
  behind it. Each button carries both the difficulty and the technique it
  requires — "Medium / needs naked pairs" — so the picker doubles as a table of
  contents for the technique library. The players are 11, 12, and adult, all fluent readers, so the real
  technique names go on the buttons rather than a simplified paraphrase beside
  them; those names are what §4.7 makes searchable, and a child who reads
  "pointing pair" on the button and then in the library has followed the link
  themselves.
- **Pencil marks** (Q4). Manual entry, plus a "fill all candidates" action.
  Auto-maintained marks — where entering a value clears it from peers — is an
  assist that hides the very deduction naked-pair teaches; the manual mode is
  the default and the auto mode is a setting, off. Slice 6 counts it as an
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
   fires, and a fixture where it must not fire. These double as slice 4's
   technique-library entries — build them as `{ id, name, gridSize, cells,
   highlight, caption }` from the start (§4.7) and slice 4 gets its content free.
2. Monotonicity test: over 50 random bases, adding clues one at a time along a
   fixed order never increases `rate`.
3. Superset test: over 100 deals per size, tier1 ⊇ tier2 ⊇ tier3, every clue
   agrees with `solution`, and every tier is uniquely solvable. The test computes
   all three tiers even though a deal computes one; the guarantee is about the
   chain, not about what a given deal happened to ask for.
4. Reproducibility test: computing tier `t` from a seed on its own gives the
   identical clue set as computing all three tiers from that seed and taking
   `t`. This is what lets slice 7 recover the other tiers of a deal.
5. Solver soundness: over 200 deals, every placement the solver makes agrees
   with the known solution. A logical solver that places a wrong digit is worse
   than no solver.
6. Rating soundness: `rate` returns `Infinity`, never a number, for every set the
   restricted solver did not finish, and `rate(tier[t]) <= t` holds for every
   tier the search returns.
7. Tier separation, per size, over 200 deal requests per (size, tier): every
   tier listed in `SIZES[<size>].tiers` is honoured — the dealt puzzle rates at
   the tier requested — in ≥90% of requests, within the retry budget. This is
   the test whose output sets those lists in the first place. A tier that cannot
   reach 90% is not offered for that size; a listed tier that drops below it
   fails CI.
8. Generation budget: a single-tier 9×9 deal in **under 400ms** p95 on the
   Android phone, retries included. Hard fail above 1.5s. Measured by
   `dev.html`, not asserted in CI.

Criteria 7 and 8 are independent by construction and must stay that way. A deal
computes one tier (§5), so the interactive budget does not scale with the number
of tiers; separation is a property of the retry loop, measured in CI on a machine
with no budget. The three-tier bulk computation that race mode needs is slice 7's
cost, paid once at session start behind a visible waiting state, not per deal.

### If criterion 8 fails

In preference order. Nothing on this list trades separation for speed — that
trade is what decoupling the two criteria exists to prevent, and it is not an
option here.

1. Memoize `rate` within a deal. The binary search re-rates overlapping prefixes,
   and a prefix is keyed by its length.
2. Build each probe's state incrementally from the previous prefix rather than
   calling `initState` from scratch at every probe.
3. Seed the binary search's upper bound from the previous attempt's `k` rather
   than from the cell count.
4. Move generation into a Web Worker. Last — it is the largest change and the
   only one that touches the UI's assumption that generation is synchronous.

## 8. Explicitly not in this slice

Timing, stats, best times, the §7.3 "what applies here?" bridge (it needs the
technique library from slice 4), the §7.2 no-guess lock, and anything
server-side. Naked triples and X-wing are not in this slice and not in this
project.
