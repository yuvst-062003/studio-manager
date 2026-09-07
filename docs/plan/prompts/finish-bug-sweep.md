# Finish the owner's bug sweep, then promote to production

Written 2026-09-08 at the end of a session that had been compacted twice. The point of
this file is that the next session reads *the repo* rather than a lossy summary of a
summary. Everything below is either checked into git or verifiable with one command.

## What this is

The club owner walked the deployed staging apps and reported 33 defects, added
incrementally over one long session. 18 are fixed and on staging. 13 remain. 2 more are
deliberately held for last. Production has received **none** of it.

## Ground rules the owner set

These are the owner's own constraints, not preferences to re-litigate.

1. **#25 and #26 are last.** "this is last task and do it only after you finish the rest".
   Do not start them until 1–24 and 27–33 are green.
2. **Staging first, production at the end.** Fix, verify on staging, and promote
   everything in one go once the list is done.
3. **Checkpoint per fix.** "do as a checkpoint / each time check with vi the one you fix" —
   fix one, show the owner, move on. Do not batch fourteen fixes and then ask.
4. **Deploys are short.** An earlier attempt in this session invented a manual migration
   ritual and the owner stopped it: "i stoped you beacuse i think you overcomplicated /
   past deploy to production werent this much time". See §Deploying below — it is four
   commands.
5. **No family is registered in production yet.** The owner confirmed this, so a
   destructive-looking data fix is lower risk than it appears. It does not license
   skipping a backup.

## The final deliverable

A table of all 33 bugs with a green status, and the apps deployed to **both** staging and
production.

## Done — 18, all on `main` and on staging

#1 #2 #3 #4 #5 #6 #7 #8 #11 #12 #13 #14 #15 #19 #21 #22 #24 #33

The bug-fix run is `git log --oneline 52fa10c..414d552` — thirteen commits, each named
after the defect it closes. #14 needed no code (the club record genuinely has no email
address; it is a settings entry for the owner to fill). #33 fell out of the dark-theme
work in `5827f76`. The rest predate `52fa10c` and are in the commits above it.

Re-derive the per-bug commit mapping from `git log` before writing the owner's final
table — do not trust a hand-copied mapping, including this paragraph's.

## Remaining — 13

| # | What the owner reported | What is known |
|---|---|---|
| 9 | Wizard asks for parent + pickup details even for an adult; כיתה/מסגרת has no option after תיכון | Needs an age gate on the wizard's guardian parts, and an 18+ entry in the school-stage list |
| 10 | Belt picker should come from the club's belt settings | Currently a hardcoded list; the club already has configurable belts |
| 16 | No way to split a card payment into instalments | uPay side needs checking — instalments may be a field on the checkout request |
| 17 | Payments screen shows ₪375 but the CTA says ₪900 | **A brief already exists**: `docs/plan/prompts/build-payments-screen.md` and `rebuild-payments-screen.md` (committed in `5f1af26`). Read those first |
| 18 | Nothing tells a parent they owe money | Wants a notification that links to the payments screen |
| 20 | A day with no sessions gives no reason; a holiday should say so | See §The #20 research below — this one is half-solved |
| 23 | Calendar reminders carry no Waze / directions link | |
| 27 | The notification permission prompt reappears; should be remembered, and shaped like the manager app's alerts | "it should remeber each time i open it" |
| 28 | Phone number did not load | Reproduce first — the owner gave a screenshot, not a repro |
| 29 | Settings → סינכרון יומן opens the old calendar design | Wants: a popup asking for a date range, then three **icon** buttons — copy link, add to Google Calendar, add to iOS Calendar. Then **delete the old design** |
| 30 | Dashboard studio shop cannot upload item images | |
| 31 | Dashboard "create new studio" is broken | Reproduce first |
| 32 | The error page needs a redesign | Logo centred, an error message **or** a prompt for an invitation code, and a way back to sign-in. Explicitly **no redirect to the other app** |

## Held for last — 2

- **#25** Move the landing page to the apex domain: `gladiatorclub.co.il` and
  `www.gladiatorclub.co.il`, not under `app.`.
- **#26** The landing page has no dark mode. The owner asked an open question that is
  still unanswered and should be put back to them before any code:
  *"but shoud landing page havbe a night mode?"* — give them a recommendation, not a survey.

## The #20 research, so it is not repeated

Findings, all verified against the production database read-only:

- Production genuinely holds **6 closures**, so the data exists and #20 is not a
  data-entry problem: ראש השנה (2026-09-12→13), יום כיפור (09-21), סוכות (09-26→10-03),
  פסח (2027-04-22→28), יום העצמאות (2027-05-12), שבועות (2027-06-11).
- `materialize_sessions` skips closed dates (§5.6), so a closed day produces **no session
  row at all** — which is exactly why the screen can say nothing about it.
- `GET /closures` (`app/routers/schedule.py:110`) is gated on `AnyStaff`. **The parent app
  cannot read closures at all.** That is the blocker.
- The precedent for a guardian-readable route is `/me/studio` in `app/routers/studio.py`:
  no role dependency, a `person_id` check on `request.state`, and a docstring explaining
  why that is legitimate — the shape is "the club's shop window, not a settings read". A
  closures read has the same character: holiday names and dates, club-wide, nothing
  tenant-sensitive.
- `StudioClosure` (`app/models/schedule.py:120`) carries `training_year_id`, `date_from`,
  `date_to`, `reason` (String 200), `source` ('holiday_preset' | 'manual'). `ClosureOut`
  (`app/schemas/schedule.py:139`) already exposes all of it.

Plan: a parent-readable closures read on the `/me/studio` pattern, then the empty-state
copy in staff, parent **and** dashboard — the owner named all three.

## Deploying

**Read `docs/deploy/railway-runbook.md`. Do not infer the procedure from the Dockerfile** —
that mistake cost this session more than an hour and is now recorded in CLAUDE.md.

Railway runs `alembic upgrade head` itself, as a per-service pre-deploy step, against the
new image. So deploying is the whole procedure: four `railway up` calls, api first.

    railway up --service <service> --environment <env> --detach -y <path>

- The CLI is **directory-linked**. The repo root is linked to **production**;
  `.claude/worktrees/staging-deploy` is linked to **staging**. A bare `railway up` from
  the checkout hits production.
- `railway up` uploads **the linked path**, not your working directory — pass the path
  explicitly and then verify the served bundle, or you will silently ship the wrong tree.
- It honours `.railwayignore`, not `.dockerignore`.
- Backups: production has PITR disabled and zero backups, and `backup create` returns
  "You do not have access to this resource" even with PITR on. `pg_dump` over
  `railway ssh` works and is what was used —
  `pre-0025-20260907-223054.dump` (531 KB, 68 tables, verified restorable) sits on the
  production Postgres volume.

## Two gotchas that will bite

- **The verify-types hook misfires in a worktree** — it reports `sh: tsc: command not
  found` because the worktree has no `node_modules`. After every deploy, `cd` back to
  `/Users/yuvalstolin/Desktop/studio-manager/web` before typechecking.
- **Chain with `&&`, not `;`.** A commit went in this session with a failing typecheck
  because a `;` let it through.

## Repo state at handoff

- `main` = `414d552`, pushed. Working tree clean apart from untracked `.agents/`,
  `.codex/`, `AGENTS.md`, `docs/superpowers/` — none of which are this work's.
- Other branches are older parked work; nothing here depends on them.
- Staging deployed 2026-09-08 00:50 (parent `ce82844c`, staff `10f5bc0c`).
- **Production is still on the 22:58 build and has none of the 18 fixes.** Verify this
  before promoting rather than trusting the sentence you just read.
