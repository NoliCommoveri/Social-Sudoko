# Slice 4 — Difficulty tiers, the picker, pencil marks

Corresponds to `sudoku-design.md` §6 step 4, implementing §4.3. The tier
construction that R3 rests on, the UI that exposes it, and the pencil marks
without which a tier-2 puzzle is unplayable.

**Estimated cost:** Medium (20–60k), assuming slice 3 handed over a `rate` that
behaves. If it did not, this becomes Large and the right move is to stop and fix
slice 3 rather than debug a search around a broken rating.

**Blocked on:** slice 3.

---

## 1. What exists at the end

Puzzles are dealt at a chosen difficulty. Every tier of a given deal shares one
solution grid, so the same deal can be played by two people at two difficulties
— which is the mechanism R3 depends on, even though nothing multiplayer exists
until slice 8. Pencil marks exist.

Hints do not. They are slice 5, with the technique library they link into.

---

## 2. Tier construction

The part that makes R3 work. Read `sudoku-design.md` §4.3 first; this is its
algorithm.

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
below hold across tiers computed at different times. Race mode (slice 8) needs
several tiers of one deal at once and pays for those searches when a session
starts, once, off the interactive path.

**Why the tiers are supersets of each other.** All three are prefixes of the
*same* add-back order applied to the *same* base, and `k[3] ≤ k[2] ≤ k[1]`. So
tier 1 ⊇ tier 2 ⊇ tier 3, every clue in every tier agrees with `solution`, and
all three are uniquely solvable because `base` already was. That is §4.3's
guarantee, and it holds by construction rather than by check.

**Why binary search is valid for step 4.** Because `rate` is monotone
non-increasing along a fixed add-back order — proven in slice 3 §5, tested
there. Each `k[target]` is therefore found by binary search, about 7 `rate` calls
at 9×9 instead of up to 81. That proof is slice 3's deliverable precisely so this
slice can assume it rather than discover it.

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
has spent more than half its §5 budget. On exhaustion, deal the attempt whose
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
test (criterion 5), read the per-tier honour rates from its output, commit the
lists, and the same test then asserts against them on every push. A tier whose
honour rate later falls below the threshold fails CI rather than quietly dealing
mislabelled puzzles.

## 3. UI additions

- **Difficulty picker**, showing `SIZES[<size>].tiers` and nothing else (§2). It
  reads a committed constant, so it renders on first paint with no generation
  behind it. Each button carries both the difficulty and the technique it
  requires — "Medium / needs naked pairs". The players are 11, 12, and adult,
  all fluent readers, so the real technique names go on the buttons rather than a
  simplified paraphrase beside them; those names are what slice 5 makes
  searchable, and a child who reads "pointing pair" on the button and then in the
  library has followed the link themselves. Slice 5 turns the button text into
  that link; this slice only has to name the technique correctly.
- **Pencil marks.** Manual entry, plus a "fill all candidates" action.
  Auto-maintained marks — where entering a value clears it from peers — is an
  assist that hides the very deduction naked-pair teaches; the manual mode is the
  default and the auto mode is a setting, off. Slice 7 counts it as an assist.
- **Persistence.** Pencil marks join the saved game under
  `sudoku.v1.game.<sizeKey>`; the tier choice joins `prefs` alongside `sizeKey`
  (slice 1 §5, slice 2). Both keys already have the shape for it. The saved-game
  `version` increments, which discards in-progress boards on deploy — acceptable,
  and the reason that field exists.

**Why pencil marks are in this slice and not slice 5.** This is the slice that
first deals a puzzle requiring a naked pair. A naked pair is not visible without
marks, so shipping tier 2 without them ships a difficulty the players cannot
reasonably solve. The board component's cell rendering and input handling both
change here — that is the deferral cost `questions.md` Q4 named, paid where it
was always going to be paid.

## 4. Tests

1. **Superset.** Over 100 deals per size, tier1 ⊇ tier2 ⊇ tier3, every clue
   agrees with `solution`, and every tier is uniquely solvable. The test computes
   all three tiers even though a deal computes one; the guarantee is about the
   chain, not about what a given deal happened to ask for.
2. **Reproducibility.** Computing tier `t` from a seed on its own gives the
   identical clue set as computing all three tiers from that seed and taking `t`.
   This is what lets slice 8 recover the other tiers of a deal.
3. **Label honesty.** Every deal's returned `tier` equals `rate(clues)` — the
   label is what it rates, including on the retry-exhaustion path, where the
   returned tier is by definition not the one requested.
4. **Retry bound.** A deal never exceeds 5 attempts, and a tier-1 request never
   makes a second one.
5. **Tier separation**, per size, over 200 deal requests per (size, tier): every
   tier listed in `SIZES[<size>].tiers` is honoured — the dealt puzzle rates at
   the tier requested — in ≥90% of requests, within the retry budget. This is the
   test whose output sets those lists in the first place. A tier that cannot
   reach 90% is not offered for that size; a listed tier that drops below it
   fails CI.

## 5. Acceptance criteria

1. `node --test` passes; the workflow is green. Test groups 1–5 above exist.
2. `SIZES.tiers` holds measured lists, not the placeholders in §2, and the
   separation test asserts against them.
3. The picker offers exactly `SIZES[<size>].tiers` for the selected size, renders
   on first paint, and changes what is dealt.
4. Pencil marks can be entered, cleared, bulk-filled, and survive a reload.
5. A tier-2 9×9 is solvable start to finish using pencil marks and nothing else —
   no hint button exists yet, so this is the check that the slice shipped a
   playable difficulty rather than a labelled one.
6. **Generation budget:** a single-tier 9×9 deal in **under 400ms** p95 on the
   Android phone, retries included. Hard fail above 1.5s. Measured by `dev.html`
   on the phone, not asserted in CI. **This is a setup task — it needs the phone,
   like slice 1's criterion 3.** Add it to `questions.md` as an S-item when this
   slice starts; do not close this slice on a desktop measurement.

Criteria 5 and 6 are independent by construction and must stay that way. A deal
computes one tier (§2), so the interactive budget does not scale with the number
of tiers; separation is a property of the retry loop, measured in CI on a machine
with no budget. The three-tier bulk computation that race mode needs is slice 8's
cost, paid once at session start behind a visible waiting state, not per deal.

### If the budget fails

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

The first three are additions to slice 3's modules, not changes to their
interfaces. If one of them turns out to require changing what `rate` returns,
stop: that is a sign the split between the slices was drawn in the wrong place,
and it is worth saying so rather than working around it.

## 6. Explicitly not in this slice

The hint button, the technique library page, the §7.3 "what applies here?"
bridge, timing, stats, best times, the §7.2 no-guess lock, and anything
server-side.
