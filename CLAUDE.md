# CLAUDE.md

Project directives. Read every session.

## Communication

No sycophancy. Do not open with an assessment of the request ("this is unusually
well specified," "great question," "good catch"). Do not praise the design, the
doc, or the decision before answering. Every sentence carries information or is
cut.

Disagreement is expected and stated plainly, once, with the reason. If a
direction is reaffirmed, build it and stop arguing.

## Documents reflect current state

Design docs, READMEs, and this file describe how things are *now*. They are not
changelogs.

- No "previously we did X, now we do Y" passages.
- No dated entries, no "updated 2026-09-03," no strikethrough of superseded
  decisions.
- When a decision changes, rewrite the affected section as if it had always
  read that way. Delete what it replaced.

Rationale stays only where it prevents someone re-litigating a settled choice
(the `Rec` / *Alternative* / *Would revisit if* pattern in `sudoku-design.md` is
current-state, not history — keep it).

Revision history, if wanted, lives in `HISTORY.md`, which is **read only when
troubleshooting** — an unexplained behavior, a regression, a "why is this like
this." Do not read it at session start. Do not consult it for routine feature
work.

## Session effort budgeting

Before starting implementation work, state an estimated token cost and get
agreement if it exceeds the session budget.

Bands:

| Band | Approx. tokens | Shape |
|---|---|---|
| Small | < 20k | One module, one file, tests for it |
| Medium | 20–60k | A vertical slice from `sudoku-design.md` §6 |
| Large | 60–120k | A slice with real debugging, or two coupled modules |
| Too large | > 120k | Split it. Do not start. |

Hard cap: **~120k tokens of work per session.** Context degrades before the
window fills; a fresh session with a clean read of the current code beats a
long one carrying stale intermediate state.

At natural stopping points — a slice complete and committed, tests green, a
module boundary reached — say so and recommend a new session rather than
continuing into the next unit of work. A natural stopping point is one where the
next session can start from the committed tree plus this file, with nothing held
only in conversation.

If a session is going to overrun, stop at the last clean boundary, commit, and
write down what is unfinished. Do not leave a half-migrated schema or a
half-refactored module across a session break.

## No CLI

There is no local command line on the dev machine. No `wrangler`, no `npm`, no
`git` on the user's side.

**All schema migrations run in the browser.** Consequences:

- Migrations are application code, not `.sql` files run by a tool. They ship
  with the app and execute against the Durable Object's SQLite from a request
  path.
- Keep a `schema_version` row in DO storage. On the first request after a
  deploy, compare it to the code's target version and apply each pending
  migration in order inside one transaction, then update the version.
- Migrations are forward-only and idempotent. `CREATE TABLE IF NOT EXISTS`,
  `ALTER TABLE ... ADD COLUMN` guarded by a version check. No down-migrations —
  there is no way to run one.
- Never write a step that requires a human to run a command to complete or
  recover. If a migration can fail halfway, it is wrong; make it a single
  transaction or split it into two deploys.
- Provide a browser-reachable way to read schema state and stats (an admin route
  or a debug panel). Inspecting the database is otherwise impossible.
- The JSON export in `sudoku-design.md` §4.6 is the only backup mechanism. Treat
  it as load-bearing, not a nice-to-have, and export before any migration that
  drops or rewrites data.

Deployment is likewise not a CLI step. `sudoku-design.md` §2 says "one
`wrangler deploy`" — that line needs replacing with whatever the actual path is
(Cloudflare dashboard, or the GitHub integration building from this repo).
Confirm which before writing anything that assumes a deploy step.
