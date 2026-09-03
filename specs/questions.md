# Open items

Three kinds.

- **Setup tasks.** Things only you can do, in a browser. Listed so they are not
  discovered halfway through a slice.
- **`D`* — Due out.** Needs a fact about your world or a decision only you can
  make. Where a due out blocks a slice, that slice does not start.
- **`Q`* — Open question.** I have a recommendation. Silence means I build the
  recommendation. Cheap to redirect before the code exists, expensive after.

Answered items are deleted from here and folded into the spec they affected.
This file is the current unknowns, not a log of resolved ones.

---

## Setup tasks

### S1 — Connect this repo to Cloudflare Workers

One-time, in the Cloudflare dashboard: **Workers & Pages → Create → Import a
repository**, pick `NoliCommoveri/Social-Sudoko`, branch `main`.

Two fields matter and neither is the default:

- **Build command:** leave empty. There is no build step and never will be.
- **Deploy command:** the default (`npx wrangler deploy`) is correct. That runs
  on Cloudflare's build machines, not on yours, which is why it does not violate
  the no-CLI rule.

Everything else comes from `wrangler.jsonc`, which is committed in slice 1.

**Do this after slice 1 lands**, not before — there is nothing to serve until
then. If the worker name `social-sudoko` collides with one of your existing
workers, tell me and I will change it in `wrangler.jsonc`.

### S2 — Nothing else

No secrets, no environment variables, no D1 database, no KV namespace. Slice 6
adds a Durable Object, which is declared in `wrangler.jsonc` and needs no
dashboard action.

---

## Due outs

None open.

---

## Open questions

### Q2 — How do tests run, given no CLI?

**Rec: two mechanisms, different jobs.**

- **Unit tests in CI.** `test/*.test.js` using node's built-in `node:test` and
  `node:assert`, run by a GitHub Actions workflow on every push. No npm install
  — there are no dependencies. You see a green or red check on the commit in the
  GitHub web UI, which is the only place you can see anything without a CLI.
- **A `/dev` page in the browser.** Not unit tests. Generator timing on the
  actual phone, and a visual dump of generated puzzles for spot-checking. Some
  things — is 9×9 fast enough on the Android, does the 6×6 box border read right
  — cannot be answered by an assertion.

The cost of being wrong here is low; I raise it because it decides whether core
modules may use `node:` imports (they may not — the `/dev` page loads them too).

### Q3 — Wrong-entry feedback

Interacts with §7.2's no-guess lock, so worth a deliberate answer rather than a
default.

- **Immediate.** Cell turns red the moment a wrong digit lands.
- **On demand.** A "check" button marks current mistakes.
- **On completion only.** Silence until the board is full.

**Rec: on demand, plus automatic detection at completion.** Immediate feedback
turns the puzzle into a guessing game — nine taps brute-forces any cell — which
is exactly the failure §7.2 is worried about. On-completion-only is punishing
for a beginner who went wrong forty moves back. The check button puts the cost
of guessing on the player's own decision to press it.

Slice 4 should count check presses as an assist and keep them out of best times,
but that is slice 4's problem and I will spec it there.

### Q4 — Pencil marks in slice 1?

**Rec: no, defer to slice 3.** They are needed for the teaching goal — naked
pairs are invisible without them — but nothing in slices 1–2 teaches, and slice
3 is where they earn their place.

*Cost of the deferral:* the board component's cell rendering and input handling
both change in slice 3. Small, and better paid there than guessed at now.

### Q6 — Symmetric clue removal

Classic sudoku puzzles remove clues in rotationally symmetric pairs, purely for
looks.

**Rec: no.** Symmetry constrains which clue sets are reachable, which fights
§4.3's superset construction — an added clue would have to come with its mirror,
and the mirror might overshoot the target tier. Aesthetics are not worth
narrowing the tier search.

### Q7 — What persists locally before slice 4 exists?

Slices 1–3 have no server. Something still needs to survive a closed tab.

**Rec:** `localStorage` holds the in-progress board and UI preferences only.
Explicitly **not** best times or win counts, even though slice 1 could trivially
write them. Those are `results` / `bests` rows in DO SQLite (§4.6), and writing
them to `localStorage` first means slice 4 opens with a data migration and a
"which copy is authoritative" question for no gain. Timing does not exist until
slice 4.

### Q8 — Custom domain?

**Rec: `social-sudoko.<your-subdomain>.workers.dev`, no custom domain.** Free,
instant, HTTPS, and it satisfies the PWA install requirement in slice 7. Adding
a domain later is a dashboard action with no code impact, so this decision costs
nothing to defer.

### Q9 — PWA icons

Slice 7 needs real icon files at 192px and 512px, plus a maskable variant.

**Rec:** I generate a plain glyph — a 3×3 box with a few filled cells — and
commit the PNGs. Replace them whenever; they are two files and one manifest
entry. Say so if one of the kids would rather draw it, which is a better answer
than mine.
