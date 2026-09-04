# Slice 8 — Timer, stats, best times

Corresponds to `sudoku-design.md` §6 step 8, delivering R4 and R5. The first
slice where the game itself talks to the Durable Object, and the first that
writes a row anyone would miss.

**Estimated cost:** Medium (20–60k). The timer and the queries are small; the
cost is in identity, the offline path, and being careful about what a best time
means.

**Blocked on:** slice 7. Not for a feature — for the recovery path. This is the
slice after which a schema edit costs an export and an import instead of
nothing, and `CLAUDE.md` requires the export to exist before the first erase.

**Assumes, per `questions.md`:** `Q10` (which assists disqualify a best time),
`Q11` (unknown player names are refused, not created). Both are recommendations
this slice builds unless redirected. `D1` stops being a placeholder here — a
name is now on a leaderboard.

---

## 1. What exists at the end

Solo play is timed. Finishing a puzzle writes a `results` row to the family
room, and a stats page shows best times per size and tier and win counts per
player. The player picks a name once and the app remembers it. A finish with no
connection is recorded when the connection comes back, not lost.

Race mode does not exist. `mode` is `'solo'` on every row this slice writes.

## 2. Identity

`sudoku-design.md` §7.1: family code plus player name, no passwords. This is
where the client first learns both.

- `prefs` (slice 1 §5) gains `familyCode` and `playerName`. One device, one
  player — a shared Chromebook switches names through the same picker that set
  it, which is two taps and no accounts.
- The picker's options come from `GET /r/<code>/players`, which returns the
  seeded names. **A name not in that list is refused** (`Q11`). Auto-creating on
  first use turns a typo into a permanent leaderboard entry with somebody's best
  times behind it, and `D1` already says one row per name is the whole of
  identity here. The refusal names the fix: add the name to
  `src/db/sql/seed_players.sql` and press **Run seed**, which is the workflow
  seeds exist for.
- A bad code is a room with no players, which renders as "no players in this
  room — check the code". Not an error page; a typo in a family code is the most
  likely reason anyone sees this screen.

**Identity never blocks play.** The board deals, times, and completes with no
code and no name set. The prompt appears at completion, with the result already
in the outbox (§5). A child who wants to play should not meet a form first, and
a form that stands between the app and a puzzle is a form that gets a fake name
typed into it.

## 3. Schema

One column, added by editing `001_schema.sql` and then pressing **Erase
everything** → **Apply pending** → **Run seed**. No `results` row exists yet, so
there is nothing to export first and nothing to import back. This is the last
edit that is free:

```sql
  auto_marks    INTEGER NOT NULL DEFAULT 0,
```

Slice 4's auto-maintained pencil marks are an assist (slice 4 §3 says so) and
`Q10` disqualifies a time set with them on. A run that is disqualified by a
setting nobody recorded is a best time nobody can explain, so the column is
written by the same POST that writes the rest.

The other assist columns — `hints`, `hints_applied`, `checks` — were declared in
slice 6 §6 against exactly this slice. Nothing else changes.

**From here on, a schema change costs a round trip.** Editing `001_schema.sql`
still works and is still the sanctioned path, but it now means export → erase →
apply → seed → import, and it is only safe because slice 7 §5's column rule
fills a new column from its default. Adding a `NOT NULL` column with no default
after this point is not a schema edit, it is data loss.

## 4. The timer

### What it measures

- **Starts on the first entry**, not on the deal. The time spent reading the
  difficulty picker is not solving time, and a deal that is looked at and
  abandoned should not appear as a slow game.
- **Pause is explicit and hides the board.** A pause that leaves the grid
  visible is a free thinking window, which makes every timed comparison
  meaningless. Pausing does not disqualify anything.
- **A hidden tab is a pause.** `visibilitychange` pauses; returning does not
  auto-resume, it lands on the paused screen with the board hidden and a resume
  button. Auto-resume would start the clock before the player's eyes are back.
- **Stops on completion**, detected the same way slice 1 detects it.

### How it is computed

Elapsed time is derived from timestamps, never accumulated by a tick. A
`setInterval` that repaints the clock is a display detail and may drift; the
recorded duration must not.

```js
elapsedMs(events, now) -> number      // events: [{ at, kind }], kind: start|pause|resume|finish
```

Pure, in `core/`, and the only place the arithmetic lives.

**The reload rule, which is the bug this design exists to prevent.** The saved
game (slice 1 §5) carries `{ gameId, events, lastSeenAt }`, `lastSeenAt` written
on every debounced save. On load, a game whose last event left the clock running
is treated as **paused at `lastSeenAt`** — the time between the last save and
the tab closing is not counted, and neither are the three days the tab was shut.
Resuming appends a `resume`. Without this rule a closed tab records a
personal-worst measured in days, and it would only ever happen to someone who
shut the laptop mid-puzzle, which is everyone.

### Persistence

`gameId` (a `crypto.randomUUID()` minted when the puzzle is dealt), the event
list, and the assist counters join the saved game under
`sudoku.v1.game.<sizeKey>`. `version` increments, discarding in-progress boards
on deploy — the same acceptable cost slices 4 and 5 paid.

## 5. Writing a result

### The request

`POST /r/<code>/results`, JSON, no auth (§7.1):

```json
{ "gameId": "…", "player": "…", "mode": "solo", "sizeKey": 9, "tier": 2,
  "durationMs": 412300, "hints": 1, "hintsApplied": 0, "checks": 0, "autoMarks": 0 }
```

Validated in the DO by a pure `validateResult(body, { players, sizes, maxTier })`
that lives in `src/db/` and is tested in CI:

- `player` is in `players`. Not a foreign key error — a message.
- `mode` is `'solo'` (slice 9 adds `'race'`), `sizeKey` is a key of `SIZES`,
  `tier` is `1..MAX_TIER`.
- `durationMs` is a positive integer under a day. A duration outside that is a
  bug in the client, and recording it would poison the only aggregate this
  project keeps.
- Assist counters are non-negative integers.
- `gameId` is a non-empty string, at most 64 characters.

`won` is written as `1` on every row. **Solo has no loss condition** — an
abandoned puzzle writes nothing at all — and stating that here is what stops
someone inventing one. The column exists for slice 9, where finishing second is
a real outcome.

`completed_at` is the **server's** clock, not the client's. A device with a
wrong clock would otherwise file results in 1970, and every later "this week"
question would be nonsense. The consequence, stated so it is not discovered: a
result queued offline is stamped with the time it was flushed, not the time it
was solved. Nothing reads `completed_at` in this slice except ordering, and
best times key off `duration_ms`.

### Idempotency

`game_id` is the primary key (slice 7 §2) and the insert is `ON CONFLICT DO
NOTHING`, so a POST retried after a dropped connection is one row. No token, no
dedupe window, no client-side "did that send?" state.

### The response

```json
{ "recorded": true, "isBest": true, "previousBestMs": 448200, "qualifies": true }
```

The DO already has the row and the index; computing whether this is a personal
best there costs one query and saves a round trip, and the client cannot get it
wrong from stale data. `qualifies: false` (an assisted run, per `Q10`) comes
back with `isBest: false` and the completion screen says which assist
disqualified it — the number, not a scold.

### Offline

The phone loses signal mid-game and the finish still has to survive.

- The payload goes into `sudoku.v1.pending`, an array, before the POST is
  attempted. On success it is removed. On failure it stays.
- The queue is flushed at startup and after any successful POST, oldest first.
- The completion screen says "recorded" or "will be recorded when you are back
  online", and claims no best time in the second case. A best-time claim that
  turns out to be wrong once the row lands is worse than a claim deferred.

**This does not contradict `Q7`.** The queue is an outbox — written, drained,
deleted — not a second copy of the stats. Nothing reads it to answer a question;
the DO remains the only place a best time is stored, which is the whole of what
`Q7` decided.

## 6. Reading: the stats page

`stats.html`, a third page reached by a relative link, on the same grounds as
`library.html` (slice 5 §2): no router, and slice 10's precache list stays
enumerable.

`GET /r/<code>/stats` returns JSON; the page renders it client-side. Two
queries, both against `results`:

**Best times (R5)** — keyed by grid size × difficulty tier, per player:

```sql
SELECT player, size_key, tier, MIN(duration_ms) AS best
FROM results
WHERE won = 1 AND hints_applied = 0 AND checks = 0 AND auto_marks = 0
GROUP BY player, size_key, tier
```

**Win counts (R4)** — per player, per mode, per grid size:

```sql
SELECT player, mode, size_key, COUNT(*) AS wins
FROM results WHERE won = 1
GROUP BY player, mode, size_key
```

The `results_best` index (slice 6 §6) covers the first well enough. **No new
indexes.** This table gains a few rows a day; an index added now is a guess
about a query pattern nobody has, and it would have to survive every erase.

Shaping is pure and tested — `bestTimes(rows)` and `winCounts(rows)` take the
query output and return what the page renders — so the disqualification rule and
the formatting are covered in CI without a browser.

### What the page shows

- One best-times table per grid size: players down, tiers across, blank where
  nobody has a clean time yet.
- **The assisted best beside the clean one**, in a lighter style. A child who
  uses hints and sees a permanently empty table learns that the page is not
  about them. Both numbers are true; only one is the record.
- Win counts per player, per size, per mode.
- The player's own row highlighted.
- No trend lines and no averages. `sudoku-design.md` §8 says puzzle-to-puzzle
  variance within a tier is large, and an average over noisy samples presented
  as progress is a lie with a chart around it.

## 7. Tests

1. **Timer.** `elapsedMs` over: a plain start–finish; a pause and resume; two
   pauses in a row; a resume with no pause; an event list ending mid-run
   evaluated at `now`; the reload rule — a running clock plus a `lastSeenAt`
   counts to `lastSeenAt` and no further. Never negative, never decreasing as
   `now` advances.
2. **Result validation.** Every bullet in §5, each as its own case, plus the
   accepting case. An unknown player, an unknown size key, tier 0 and tier
   `MAX_TIER + 1`, a negative duration, a fractional duration, a duration over a
   day, a missing `gameId`.
3. **Best times.** `bestTimes` against fixture rows: picks the minimum per
   (player, size, tier); excludes rows disqualified by each of the three
   assists, one test each; keeps a row with `hints > 0` but no applied hint
   (`Q10`'s distinction, and the one most likely to be "fixed" by mistake);
   returns both the clean and the assisted best.
4. **Win counts.** Grouped per player, mode, and size; a player with no rows is
   absent rather than zero, and the page decides how to draw that.
5. **Outbox.** Queue, flush, and the partial case: three queued, the second
   POST fails, the first is gone and the last two remain in order.

No DOM tests, no DO tests (Q2, slice 6 §10). The completion screen, the picker,
and the stats layout are checked by eye.

## 8. Acceptance criteria

| # | Criterion | Closed by |
|---|---|---|
| 1 | `node --test` passes; the workflow is green. Test groups 1–5 exist. | CI |
| 2 | Finishing a 9×9 writes one row; the admin export shows it with the right duration, tier, and assists. | **S-item** |
| 3 | The same finish POSTed twice is one row. | **S-item** |
| 4 | Airplane mode: finish a puzzle, reconnect, reload — the row appears exactly once and the page said so honestly at the time. | **S-item** |
| 5 | Closing the tab mid-puzzle for a day and returning gives a clock at roughly where it was left, not a day. | local |
| 6 | Pause hides the board; the clock does not advance; a hidden tab pauses and does not auto-resume. | local |
| 7 | A name not in `players` is refused with the seed-file fix named; adding it to the seed and pressing **Run seed** makes it selectable. | **S-item** |
| 8 | Best times appear per size and tier, a clean run beats an assisted one, and an assisted run never takes the record. | local |
| 9 | Two names on two devices in one room both appear, and neither overwrites the other's times. | **S-item** |
| 10 | Every link between the game, the library, and the stats page is relative and works from all three (slice 1 §2; slice 10 depends on it). | CI, spot-checked local |

Criteria 4 and 5 are the two that decide whether this slice is trustworthy.
Everything else is visible the moment it breaks; a lost result and an inflated
clock both look like nothing at all until someone notices a record that cannot
be beaten.

Criterion 9 is also the last cheap check that per-room isolation still holds
(slice 6 criterion 8) before slice 9 starts assuming it under WebSockets.

**Add the S-marked criteria to `questions.md` as a setup task when this slice
starts.** Criterion 4 needs a phone with a radio to turn off; nothing in CI can
reach it.

## 9. Explicitly not in this slice

WebSockets, hibernation, `serializeAttachment`, race mode, broadcast progress —
all slice 9, and the DO still has no `webSocketMessage` handler at the end of
this one. The §7.2 no-guess lock: `Q10`'s check-press disqualification is the
cheap part of that question and does not answer it; the answer waits until
someone sees whether the kids brute-force. Streaks, averages, trends, or any
aggregate beyond §6's two queries. Per-player difficulty on a shared puzzle
(R3's multiplayer half) — the mechanism exists since slice 4, and the second
player arrives in slice 9.
