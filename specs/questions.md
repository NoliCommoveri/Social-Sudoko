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

**Do this once slice 1's code is merged**, not before — there is nothing to
serve until then, and nothing in S2 can be checked until the phone has a URL to
open. If the worker name `social-sudoko` collides with one of your existing
workers, tell me and I will change it in `wrangler.jsonc`.

### S2 — Verify slice 1 on the phone and the Chromebook

Slice 1 has four acceptance criteria that no test and no agent can reach: they
need a real Android phone, a real Chromebook, and a deployed URL. They are
listed here rather than left inside the slice file so they are not discovered at
the point of trying to call slice 1 done.

Order matters — each step needs the one above it.

1. **S1 is done** and `social-sudoko.<subdomain>.workers.dev` loads. *(criterion
   2)*
2. **On the Android phone, open `/dev.html` and press "time 100 deals".** Report
   the p95 it prints. Under 250ms passes; over 1s is a hard fail and sends
   generation into a Web Worker. *(criterion 3)*
3. **On the Android phone, in portrait, solve a full 9×9** with no keyboard.
   Watch for horizontal scroll, a need to pinch-zoom, and mis-taps. *(criterion
   5)*
4. **On the Chromebook, solve a full 9×9 using only the keyboard** — no mouse,
   no trackpad, including new-game, undo, and check. *(criterion 6)*

Steps 3 and 4 are the ones that decide whether the layout survives. Do them
before slice 2 starts; slice 2 adds two more sizes to whatever `board.js`
already is, and a layout fault found there costs three times what it costs here.

A "no" on any step is not a slice-2 blocker to work around — it is slice 1
reopening. Say what went wrong in as much detail as you can stand; "the board
felt cramped" is usable, "it did not work" is not.

### S3 — Nothing else

No secrets, no environment variables, no D1 database, no KV namespace. Slice 6
adds a Durable Object, which is declared in `wrangler.jsonc` and needs no
dashboard action.

---

## Due outs

### D1 — The family code, and the players' names

Slice 6 seeds a `players` table and its admin page is opened at
`/r/<code>/admin`. Both need values I do not have.

- **The family code.** Lowercase, `[a-z0-9-]`, 3–32 characters. Anyone holding
  it is in and, from slice 7, can erase the room (§7.1). So not `sudoku`, and
  not your surname on its own.
- **The names**, spelled as they should appear on a leaderboard. One row per
  name is the whole of identity in this project — two people cannot both be
  "mum", because the second one inherits the first one's best times.

**This does not block slice 6.** It commits placeholder names, and your answer
is delivered by editing `src/db/sql/seed_players.sql` in the GitHub web editor
and pressing **Run seed** — which is the exact workflow seeds exist for, so
answering this late is a demonstration rather than a cost. The only residue is a
placeholder row per unused name, cleared by slice 7's erase.

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

Slice 8 should count check presses as an assist and keep them out of best times,
but that is slice 8's problem and I will spec it there.

### Q4 — Pencil marks in slice 1?

**Rec: no, defer to slice 4.** They are needed for the teaching goal — naked
pairs are invisible without them — but nothing before slice 4 deals a puzzle
that requires a naked pair, so nothing before slice 4 needs them.

*Cost of the deferral:* the board component's cell rendering and input handling
both change in slice 4. Small, and better paid there than guessed at now.

### Q6 — Symmetric clue removal

Classic sudoku puzzles remove clues in rotationally symmetric pairs, purely for
looks.

**Rec: no.** Symmetry constrains which clue sets are reachable, which fights
§4.3's superset construction — an added clue would have to come with its mirror,
and the mirror might overshoot the target tier. Aesthetics are not worth
narrowing the tier search.

### Q7 — What persists locally before the DO exists?

Slices 1–5 have no server. Something still needs to survive a closed tab.

**Rec:** `localStorage` holds the in-progress board and UI preferences only.
Explicitly **not** best times or win counts, even though slice 1 could trivially
write them. Those are `results` / `bests` rows in DO SQLite (§4.6), and writing
them to `localStorage` first means slice 8 opens with a data migration and a
"which copy is authoritative" question for no gain. Timing does not exist until
slice 8.

*Consequence, and the reason this is the recommendation rather than the obvious
choice:* it makes R4 and R5 depend on the DO, so the timer slice sits after the
storage foundation in §6 rather than before it. That ordering is the price of
having exactly one authoritative copy of the only data in this project that
cannot be regenerated. Reversing this answer moves the timer earlier and buys a
migration.

### Q8 — Custom domain?

**Rec: `social-sudoko.<your-subdomain>.workers.dev`, no custom domain.** Free,
instant, HTTPS, and it satisfies the PWA install requirement in slice 10. Adding
a domain later is a dashboard action with no code impact, so this decision costs
nothing to defer.

### Q9 — PWA icons

Slice 10 needs real icon files at 192px and 512px, plus a maskable variant.

**Rec:** I generate a plain glyph — a 3×3 box with a few filled cells — and
commit the PNGs. Replace them whenever; they are two files and one manifest
entry. Say so if one of the kids would rather draw it, which is a better answer
than mine.
