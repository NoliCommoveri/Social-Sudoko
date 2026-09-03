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

Three deployable pieces, one `wrangler deploy`.

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

Backtracking fill for a complete valid grid, then remove clues while a **solution counter** confirms uniqueness (count solutions, stop at 2). Fast enough at 9×9 to be imperceptible.

### 4.3 Difficulty tiers via clue supersets

Generate the hardest tier first as a uniquely-solvable clue set. Build easier tiers by *adding* clues to that same set. Any superset of a uniquely-solvable set is still uniquely solvable — so all players share one solution grid, guaranteed, whatever tier they're on.

Tiering by **hardest technique required**, not blank count:

| Tier | Solvable with |
|---|---|
| 1 | Naked + hidden singles only |
| 2 | + naked pairs |
| 3 | + pointing pairs / box-line |

*Note:* 4×4 realistically only reaches tier 1. 6×6 reaches tier 2 and sometimes 3. This is a property of the grids, not a gap to close.

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

**Solo + timer (R5).** Simplest slice, no DO required at all — pure client plus a stats write. Reasonable first vertical slice.

**Race (R1).** Shared puzzle, per-player tier, independent boards. DO broadcasts progress (cells-filled count, not contents) and finish events.

---

## 6. Suggested slice order

1. Grid model + generator + solo play, one grid size — no timer, no server
2. All three grid sizes
3. Solver + tiering
4. Timer + stats + best times (R5, R4 partial) — first fully useful thing
5. Technique library (R6) — independent, parallelizable
6. DO + WebSocket sync, race mode (R1, R3)

Slices 1–5 have no server dependency. If Cloudflare setup stalls, four of six requirements still ship.

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
