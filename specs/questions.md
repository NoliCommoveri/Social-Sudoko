# Open items

Two kinds, with different urgency.

- **`D`* — Due out.** I cannot answer this. It needs a fact about your world, an
  account, or a decision only you can make. Where a due out blocks a slice, that
  slice does not start.
- **`Q`* — Open question.** I have a recommendation. Silence means I build the
  recommendation. Say so if you want otherwise; these are cheap to redirect
  before the code exists and expensive after.

Answered items are deleted from this file and folded into the spec they
affected. This file is the current unknowns, not a log of resolved ones.

---

## Due outs

### D1 — Where does this deploy from, and to what?

**Blocks:** anything anyone can actually play. Not slices 1–3 as code, but the
first time a kid opens it on a device.

`sudoku-design.md` §2 says "one `wrangler deploy`". There is no CLI, so that
line is wrong and I have not replaced it because I do not know the answer.

The two candidates:

- **Cloudflare Pages / Workers, GitHub integration.** You connect the repo once
  in the Cloudflare dashboard; every push to `main` builds and deploys. No CLI
  ever. This is the one that fits the constraints, and it is also the path that
  carries forward to slice 6, where a Durable Object needs a Worker to route to
  it.
- **GitHub Pages.** Simpler, free, zero Cloudflare account needed — but it
  serves static files only. It carries slices 1–5 and then dies: there is no
  Worker, so no DO, so no race mode.

What I need from you: whether a Cloudflare account exists, and whether you are
willing to connect it to this repo in the dashboard. If yes, take the first. If
you would rather not touch Cloudflare yet, GitHub Pages gets the kids playing
sooner and I will note the migration as a known cost.

Either way I will rewrite §2's deploy line once you answer, and not before.

### D2 — Ages of the players

**Blocks:** the 4×4 design in slice 2, tier naming in slice 3, and the whole
tone of the technique library in slice 5.

Specifically:

- Under ~6, 4×4 wants shapes or colors, not digits. That is a different board
  renderer path, and I would rather know now than retrofit it.
- "Naked single" and "pointing pair" are the searchable standard names, which is
  why §4.7 chose them. Whether the *child-facing* label is the same string or a
  plain-language one next to it depends on who is reading it.

I need rough ages, and whether all players read fluently.

### D3 — Target devices

**Blocks:** slice 1 touch layout and the browser baseline.

A 9×9 grid with a comfortable touch target needs roughly 360px of width for the
board alone. On a phone that is the entire screen; on an iPad it is not. I need
to know what the kids actually use — phone, tablet, laptop, some mix — because
it decides whether the number pad sits beside the board or under it, and whether
9×9 on the smallest device is usable at all.

Also: any device old enough to matter for browser support? I am otherwise
assuming a browser from the last three years and using ES modules, CSS grid, and
CSS nesting without fallbacks.

---

## Open questions

### Q1 — Which grid size does slice 1 build?

§6 says "one grid size" without saying which.

**Rec: 9×9.** 4×4 is easier to eyeball but hides every problem worth finding
early — generation time, uniqueness-check cost, touch layout pressure, and
whether the peer precomputation is actually fast. Slice 2 then adds 4×4 and 6×6,
which at that point is mostly geometry and layout, not new risk.

*Would revisit if:* D3 comes back saying the only device is a small phone, in
which case the layout question gets big enough to want a smaller board first.

### Q2 — How do tests run, given no CLI?

**Rec: two mechanisms, different jobs.**

- **Unit tests in CI.** `test/*.test.js` using node's built-in `node:test` and
  `node:assert`, run by a GitHub Actions workflow on every push. No npm install
  — there are no dependencies. You see a green or red check on the commit in the
  GitHub web UI, which is the only place you can see anything without a CLI.
- **A `/dev` page in the browser.** Not unit tests. Generator timing on the
  actual device, and a visual dump of generated puzzles for spot-checking. Some
  things (is 9×9 fast enough on the iPad, does the 6×6 box border read right)
  cannot be answered by an assertion.

The cost of being wrong here is low; I raise it because it decides whether core
modules may use `node:` imports (they may not — the `/dev` page loads them too).

### Q3 — Wrong-entry feedback

Three options, and this one interacts with §7.2's no-guess lock, so it is worth
a deliberate answer rather than a default.

- **Immediate.** Cell turns red the moment a wrong digit lands.
- **On demand.** A "check" button marks current mistakes.
- **On completion only.** Silence until the board is full.

**Rec: on demand, plus automatic detection at completion.** Immediate feedback
turns the puzzle into a guessing game — you can brute-force any cell in nine
taps — which is exactly the failure §7.2 is worried about. On-completion-only is
punishing for a beginner who went wrong forty moves back. The check button puts
the cost of guessing on the player's own decision to press it.

Slice 4 should probably count check presses as an assist and keep them out of
best times, but that is slice 4's problem and I will spec it there.

### Q4 — Pencil marks in slice 1?

**Rec: no, defer.** They are needed for the teaching goal — naked pairs are
invisible without them — but nothing in slices 1–2 teaches. Slice 3 introduces
the solver and is where they earn their place. Building them in slice 1 means
designing the input model twice.

*Cost of the deferral:* the board component's cell rendering and input handling
both change in slice 3. Small, and I would rather pay it there than guess now.

### Q5 — Kid-facing tier names

**Rec:** internal `tier: 1|2|3`, child-facing "Easy / Medium / Tricky". Not
"Hard" — a tier-3 6×6 is not hard, and a label that overstates it discourages
picking it. Depends on D2 for whether the words land.

### Q6 — Symmetric clue removal

Classic sudoku puzzles remove clues in rotationally symmetric pairs, purely for
looks.

**Rec: no.** Symmetry constrains which clue sets are reachable, which fights
§4.3's superset construction (an added clue would have to come with its mirror,
and its mirror might overshoot the target tier). Aesthetics are not worth
narrowing the tier search.

### Q7 — What persists locally before slice 4 exists?

Slices 1–3 have no server. Something still needs to survive a closed tab.

**Rec:** `localStorage` holds the in-progress board and UI preferences only.
Explicitly **not** best times or win counts, even though slice 1 could trivially
write them. Those are `results` / `bests` rows in DO SQLite (§4.6), and writing
them to `localStorage` first means slice 4 opens with a data migration and a
"which copy is authoritative" question for no gain. Timing does not exist until
slice 4.
