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

There is no local command line. No `wrangler`, no `npm`, no `git` on the user's
side. Nothing in setup, migration, seeding, or deploy may require a CLI command.
If a solution needs `wrangler d1 execute` or its DO equivalent, it is not a
solution.

Follow the Globetrotters pattern (`NoliCommoveri/Globetrotters`,
`src/lib/migrations.js` + `src/migrations/index.js`), not the Heritage-Hooves
append-only one. Heritage-Hooves carries 140+ forward-only files because its
data cannot be regenerated; this project's can be, with the one exception noted
below.

**Two lists, opposite rules.** One module is the only place `.sql` is imported,
and it exports both:

- `MIGRATIONS` — schema. Checksummed, applied once by **Apply pending**. An edit
  after it has run shows as *drift* on the admin page and is never silently
  reapplied.
- `SEEDS` — data. Every insert is `ON CONFLICT DO NOTHING`, and **Run seed**
  re-executes the whole list on every press. Seeds are never checksummed; that
  is what lets a puzzle bank or technique-library file grow by editing it in the
  GitHub web editor.

**Clear/delete is the schema-change path.** Do not write an `ALTER` chain.
Editing `001_schema.sql` in place and pressing **Erase everything** → **Apply
pending** → **Run seed** is the normal way to change the schema. Erase drops
every table including the migration ledger, so the edited file is pending again
and the database rebuilds from the files as they now read. Discover drop order
by retrying until a pass drops nothing new — do not hardcode it.

**Admin surface.** Three buttons plus a status table (applied / pending /
drifted), reachable in a browser, rendering before login and before any table
exists — a fresh database has neither. Show the failing statement and its error
on the page; there is no other way to see it. Model it on Globetrotters'
`/admin` and Heritage-Hooves' `src/render/migrations.ts`, which handles the
no-tables-yet case.

**Where this project differs from both references.** Globetrotters can erase
freely because it holds no data that cannot be got back. This one does: win
history and best times (design §4.6) are exactly that. So the JSON export is
the precondition for Erase everything, not a nice-to-have — export must be
implemented before the first erase, and re-import must exist alongside it. Wire
the export into the erase confirmation itself rather than trusting anyone to
remember.

**DO SQLite is not D1.** `ctx.storage.transactionSync()` gives real atomic
transactions, so the D1 trap the reference repos work around — no transaction
spanning batches, a half-applied migration fixable only by a new file — does not
apply. Run each migration in one transaction and it either lands or does not.
Keep the chunking and the quote-aware statement splitter; drop the
partial-failure ceremony.

Erase is per Durable Object, and there is one DO per family code (design §2).
The admin page acts on the room it is opened against — if more than one family
code ever exists, it must say which room it is about to erase.

Deployment is likewise not a CLI step. `sudoku-design.md` §2 says "one
`wrangler deploy`" — that line needs replacing with whatever the actual path is
(Cloudflare dashboard, or the GitHub integration building from this repo).
Confirm which before writing anything that assumes a deploy step.
