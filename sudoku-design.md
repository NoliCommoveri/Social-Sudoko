# Family Sudoku — High-Level Design

Status: design sketch. Everything below marked **Rec** is a recommendation with alternatives, not a settled decision. Revisit triggers are noted where they exist.

---

## 1. Requirements

| # | Requirement | Notes |
|---|---|---|
| R1 | Race mode (multiplayer) | Same puzzle, independent boards, first to finish |
| R2 | 4×4, 6×6, 9×9 grids | Box shapes 2×2, 3w×2h, 3×3 |
| R3 | Per-player difficulty on the same puzzle | Via clue-superset layering (§4.3) |
| R4 | Win tracking | Per player, per mode, per grid size |
| R5 | Solo timer mode with best times | Keyed by grid size × difficulty tier |
| R6 | Technique teaching | Static curated examples, not live trace (§4.7) |

---

## 2. Architecture

One deployment: a Worker that serves the static app from its assets directory and routes WebSocket upgrades to the Durable Object.

Deployment is Cloudflare's GitHub integration. A push to `main` starts a Cloudflare build container which runs `wrangler deploy` and publishes to `social-sudoko.<subdomain>.workers.dev`. Nobody types that command — the build machine does, which is what keeps this inside the no-CLI rule. There is no build step: the app is plain ES modules served as-is. Configuration is `wrangler.jsonc` in the repo root.

```
Browser (SPA)
  │  HTTP (static assets, puzzle gen is client-side)
  │  WebSocket (game session)
  ▼
Worker  ──routes──►  FamilyRoom Durable Object  (one per family code)
                       ├── live session state (in memory + SQLite)
                       └── stats history (SQLite)
```

**Rec: one DO per family code, not per game.** The family DO owns both the active session and the historical stats. Keeps everything in one consistency domain and avoids a separate database.

*Alternative:* DO per game session + D1 for stats. *Would revisit if:* you ever want cross-family leaderboards, or stats queries that span families.

**Rec: puzzle generation runs client-side**, and the generated puzzle is uploaded to the DO when a session starts. Keeps DO CPU near zero.

*Alternative:* generate in the Worker. *Would revisit if:* you want server-authoritative anti-cheat, which for a family game is probably not worth it.

### 2.1 DO constraints that shape the code

- Use the **WebSocket Hibernation API** (`ctx.acceptWebSocket`, `webSocketMessage`/`webSocketClose` handlers). Not `ws.accept()`.
- Hibernation re-runs the constructor. In-memory state does not survive. Per-socket identity must go through `serializeAttachment` / `deserializeAttachment`, and the socket list is recovered via `ctx.getWebSockets()`.
- No `setTimeout` / `setInterval` — they block hibernation. Use the Alarms API if you need scheduled work.
- Free plan is SQLite-backed DOs only. That's the recommended backend anyway.

---

## 3. Module dependency order

```
grid-model ──► generator ──► solver ──► difficulty-tiers
                  │            │             │
                  │            ├──► hints    │
                  │            └──► rating   │
                  ▼                          ▼
             session-model ◄─────────────────┘
                  │
                  ├──► sync-layer (DO)
                  ├──► stats-store
                  └──► ui
                          └──► technique-library (independent, can be built anytime)
```

`technique-library` has no dependencies on anything but the board renderer — good candidate for an early standalone slice if you want a visible win.

---

## 4. Core modules

### 4.1 Grid model

Size-parameterized from the start: `{ n, boxW, boxH }` for 4/6/9. Peers (row, column, box) computed from those three numbers. Nothing else in the codebase should hardcode 9.

### 4.2 Generator

Backtracking fill for a complete valid grid, then remove clues while a **solution counter** confirms uniqueness (count solutions, stop at 2). Then add clues back until the board meets its size's openness floor (§4.3). Fast enough at 9×9 to be imperceptible — around 6ms a deal.

The add-back is not optional polish. Removal stops at a *minimal* clue set, which is the hardest puzzle a solution grid can make: about 24 givens at 9×9, over half of them not solvable by singles at all. Uniqueness constrains the solution, not the path to it.

### 4.3 Two difficulty axes

Difficulty has a ceiling and a floor. They are independent, and a puzzle needs both set to be pleasant.

**Ceiling — the hardest technique required.** Tiering by that, not by blank count:

| Tier | Solvable with |
|---|---|
| 1 | Naked + hidden singles only |
| 2 | + naked pairs |
| 3 | + pointing pairs / box-line |

*Note:* 4×4 realistically only reaches tier 1. 6×6 reaches tier 2 and sometimes 3. This is a property of the grids, not a gap to close.

**Floor — openness.** A *round* is one sweep of the board: every cell findable right now by a naked or hidden single. A puzzle's **openness floor** is the fewest cells any round offers. Rounds that finish the board are excluded — their count is low because the puzzle is ending, not because it is tight, and counting them would fail every puzzle ever made.

The ceiling says nothing about the floor. A tier-1 puzzle can still be a single-file corridor — one findable cell, fifty turns running — and a minimal carve usually is. That is a miserable way to learn and the players are children, so the floor is enforced on every deal, at every size, whatever tier is asked for. `SIZES[<size>].openness` holds it; a floor of 6 lands 9×9 at around 30 givens.

**Both axes move the same lever: adding clues from the solution to a uniquely-solvable set.** Any superset of a uniquely-solvable set is still uniquely solvable — so all players share one solution grid, guaranteed, whatever tier they're on. Generate the hardest tier first as a uniquely-solvable clue set; build easier tiers, and the openness floor, by *adding* clues to that same set.

### 4.4 Reduced logical solver

Four techniques: naked single, hidden single, naked pair, pointing pair. Each returns `{ technique, cells, eliminations }` or null.

Deliberately excludes X-wing and everything past it. *Would revisit if:* the kids outgrow tier 3, which would be a good problem to have.

Serves: difficulty rating, hints, and the optional "what applies here?" bridge (§7.3).

### 4.5 Session model

```
Session {
  familyCode, mode: race|solo,
  gridSize, solutionGrid,
  players: [{ id, name, tier, board, assists, startedAt, finishedAt }]
}
```

Per-player board state is separate, which is what lets players race the same puzzle at different tiers.

### 4.6 Stats store

DO SQLite. Two tables is enough:

- `results(player, mode, gridSize, tier, won, durationMs, completedAt)`
- `bests(player, gridSize, tier, durationMs)` — derived, or just query `results`

R4 and R5 are both reads off this. Include JSON export from day one.

### 4.7 Technique library

Static data, not screenshots. Each entry:

```
{ id, name, gridSize, cells[], highlight[], caption }
```

Rendered through the same board component as live play. Standard technique names (naked single, hidden single, pointing pair) so the terms are searchable later.

---

## 5. Modes

**Solo + timer (R5).** Pure client apart from the stats write, which goes to the DO like every other stat (§4.6). Play itself needs no server; recording a best time does.

**Race (R1).** Shared puzzle, per-player tier, independent boards. DO broadcasts progress (cells-filled count, not contents) and finish events.

---

## 6. Suggested slice order

1. Grid model + generator + solo play, one grid size — no timer, no server
2. All three grid sizes
2.5. The openness floor — core only, no UI
3. Reduced logical solver + difficulty rating — core only, no UI
4. Difficulty tiers, the picker, pencil marks (R3)
5. Technique library (R6) + the hint button
6. Storage foundation — the DO, the schema, migrations, the admin page
7. Erase, JSON export, and re-import — completing the admin surface
8. Timer + stats + best times (R5, R4) — first fully useful thing
9. WebSocket sync + race mode (R1, R3)
10. PWA — manifest, service worker, install to homescreen

Slices 1–5 have no server dependency, and they ship R2 and R6 in full plus the tiering mechanism R3 rests on. R1, R4, and R5 all need the DO, because every stat this project keeps lives in DO SQLite (§4.6) and none of it is mirrored client-side. If Cloudflare setup stalls, what still ships is solo play at three sizes and three difficulties with the technique library — not four of six requirements.

**Why the openness floor comes before the solver.** Step 2.5 is out of numerical order because it is a bug fix, not a feature: until it existed the app dealt minimal carves, which is expert difficulty at 9×9 with no picker to escape it. It needs singles but not the rating, so it costs a fraction of step 3 and does not wait on it. Step 4 inherits its add-back machinery.

**Why the solver is split from the tiering.** Steps 3 and 4 were one slice, and one slice that size does not fit a session (`CLAUDE.md`'s 120k cap). The split is at the only boundary that is free: step 3 is four pure functions plus a rating function, testable against hand-built fixtures with no UI at all and no dependency on the generator's output distribution; step 4 is a search built on top of them, a per-size measurement, and the UI that exposes both. Step 3 ends with `rate` proven sound — which is the precondition step 4's binary search rests on, and the thing you want settled before a search starts hiding its bugs behind a retry budget.

**Why hints are in step 5 rather than step 4.** A hint's teaching payoff is the link from a live board to the static example (§4.7), so the hint button and the library it links into are one piece of work. Step 5 is the only place in this order where the technique-library slice is no longer independent of the solver — by then the solver exists, which is why the dependency costs nothing.

**Why the storage foundation is two slices, and why both come before the timer.** Step 6 is the first slice that writes a row, and `CLAUDE.md` specifies a surface around that write which is larger than it looks: two lists with opposite rules (`MIGRATIONS` checksummed and applied once, `SEEDS` re-run on every press), an admin page that renders before login and before any table exists, drift reporting, a quote-aware statement splitter, per-DO erase, and JSON export with re-import. That is more than one session, so it is cut — but not between erase and export, which `CLAUDE.md` binds together: erase is the schema-change path, so export must exist before the first erase and re-import alongside it, wired into the erase confirmation itself. The available cut is in front of all three. Step 6 stands up the DO, the schema, and apply/seed/status; step 7 adds erase, export, and import.

What makes that cut safe is that there is one DO per family code: before erase exists, a schema change is a file edit plus an unused code, which is a database with no tables. That escape hatch expires the moment there is data worth keeping, which is why step 7 sits before the timer rather than after it. Bundling any of this behind WebSocket hibernation work would mean debugging two hard things at once.

Slice 10 is last by choice, not by dependency — solo play is entirely client-side, so it is offline-capable from slice 1 onward and the PWA slice only has to declare that. Two rules keep it cheap: every URL stays relative, and the served file set stays enumerable. Both are recorded in `specs/slice-01-grid-generator-solo.md` §2.

Implementation specs for the spec'd slices are in `specs/`; open decisions and
things needed from outside the code are in `specs/questions.md`.

---

## 7. Open decisions

### 7.1 Identity

Family code + player name, no passwords, is probably right for a household. Tradeoff: anyone with the code is in, and name collisions overwrite stats. *Would revisit if:* the link ever leaves the family.

### 7.2 No-guess lock

Timed play rewards brute-force guess-and-undo, which cuts against the teaching goal. Options: a setting that rejects logically-undetermined entries, separate leaderboards for timed vs learning play, or accept it.

*No recommendation yet* — depends on whether the kids actually do it. Cheap to add later.

### 7.3 Live technique bridge

Optional later addition: a "what technique applies here?" button running the §4.4 solver, outputting technique name + highlighted cells, linked to the static example. No prose generation. Small, given the solver already exists.

---

## 8. Risks

- **Hibernation state loss** — the classic "works ~10 seconds then messages stop" bug. Mitigated by getting `serializeAttachment` right early. Build a two-tab reconnection test before building on top of the sync layer.
- **Best-time noise** — puzzle-to-puzzle variance within a tier is large. Technique-based tiering (§4.3) reduces but does not eliminate it.
- **Transfer gap** — static examples teach vocabulary, not recognition. Expected, not a defect. §7.3 is the mitigation if it matters.
- **Scope** — six requirements, three of them (solver, sync, teaching) independently non-trivial. The slice order in §6 is designed so you can stop after step 5 and still have something the kids use.
