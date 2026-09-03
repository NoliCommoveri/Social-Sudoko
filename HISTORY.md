# HISTORY

Removed features, parked decisions, and superseded designs. **Not read at
session start.** Consult only when troubleshooting an unexplained behavior or
when reopening one of the parked decisions below.

Nothing here describes current state. `sudoku-design.md` does.

---

## Coop mode — removed 2026-09-03

Cut from the design as out of scope. Head-to-head and solo were judged far more
important. Removed the requirement, the mode section, the final slice, and the
unresolved shape decision; remaining requirements renumbered R1–R6.

The analysis below is what was parked. It is the reason not to reopen this
without deciding the tier question first.

### The problem

Per-player difficulty (now R3) is delivered by clue-superset layering: every
player solves the same solution grid, and easier tiers get *more* givens. That
works because each player has their own board. Coop breaks it, because a shared
board shows everyone the same cells the moment it renders — there is nowhere to
put the extra givens.

### The two shapes considered

**Option A — separate boards, synced progress.** Each player keeps their own
board and tier; a cell correctly filled by one player fills for both. Preserves
per-tier givens and reuses the race-mode session model unchanged.

**Option B — one shared board.** Differentiation moves off the grid and onto
assist level: pencil marks, auto-check, hint budget.

### Why A was the initial lean, and why that was wrong

A was preferred because it kept R3 intact across both multiplayer modes and
required no new session model.

The objection that changed the answer: A and R3 actively fight each other. A
lower-tier player has strictly more givens and needs strictly fewer deductions,
so they finish meaningfully faster — and under A every cell they fill lands on
the higher-tier player's board. The younger child ends up solving the older
child's puzzle for them. That inverts the point of a cooperative mode rather
than scaffolding it.

Option B has no such failure, and it is also the more genuinely collaborative
shape — the kids look at one board together, which was the original appeal. Its
cost is that R3 stops being one mechanism across all modes and becomes
"per-player *difficulty* in race and solo, per-player *support* in coop."

### If this is reopened

Start from B, not A. Prototype it once the race-mode sync layer exists; it needs
no board-propagation sync at all, which is the expensive part of A. Test with
the kids before committing either way.
