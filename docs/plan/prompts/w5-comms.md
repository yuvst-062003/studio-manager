# W5 · session 2 — lane COMMS (M8)

Companion to [lanes.md](../lanes.md). One paste, into a fresh session started in
`~/Desktop/studio-manager`. The setup commands are inside the prompt — do not run them
yourself first.

The lane brief itself is not duplicated here: the prompt below points the session at
[lanes.md § Lane COMMS](../lanes.md), which is authored once and stays the single copy.
What this file adds is the setup and the two things that are true only because
[session 1](w5-e2e-harness.md) is running at the same time.

```
SETUP — do this before anything else, and show me the output of each command.

  git worktree add ../sm-comms -b feat/m8-comms main
  cd ../sm-comms
  python3.14 -m venv .venv
  .venv/bin/pip install -e ".[dev]"
  npm ci --prefix web

Then move into ../sm-comms — EnterWorktree if you have it, otherwise tell me and I
will relaunch you there. Every command from that point runs from inside ../sm-comms,
never from the main checkout. Confirm your working directory before your first
commit. Then: /rename comms

Read, in this order:
  @docs/plan/lanes.md — the section titled "Lane COMMS — M8". THAT IS YOUR BRIEF,
    IN FULL: what you own, what you must not touch, what you build, the artboards
    you deliver, and the invariants. Read it before you read anything else, and
    treat it as if it were pasted here.
  @docs/plan/milestone-plan.md — Global Constraints, and W5 · Lane COMMS
  @SPEC.md §5.11, §5.12, §12, §7 (/announcements through /calendar-feeds)
  @CLAUDE.md
DO NOT open docs/design/canvas/*.dc.html — browser only.

THIS WAVE ONLY — a second lane is live, and two things it owns affect you.

1. THE APP SHELLS. The E2E harness lane in ../sm-e2e owns
   web/apps/{staff,parent,dashboard}/src/App.tsx this wave, because it is wiring in
   several waves' worth of screens that were built and never mounted. So when you
   reach the point of mounting your announcements screen (2b): STOP AND TELL ME. Do
   not edit it. That is the standard clause, and these three files are where it will
   actually bite.

   Build everything else first. The mount is the last thing you need, not the first
   — your screens are testable through their own unit tests long before they are
   reachable in a shell. Expect to rebase onto a main that already carries the
   harness lane's mounting fix, and mount yours on top of it.

2. THE RUNNING STACK. There is one, not two: Vite runs with --strictPort and the
   API binds 127.0.0.1:8000 against the shared studio_manager database. Before you
   start a dev server, run the E2E suite, or reset the database, TELL ME so I can
   check with the other lane. Their fixture calls /dev/demo/reset, which wipes
   whatever you have seeded. A port collision will fail loudly rather than silently
   — that part is safe — but the database will not.

TWO THINGS W5's CONTRACT COMMIT SETTLED, so you do not re-open them:

  - Your check reaches the whole lane now. scripts/lane-check.sh gained an explicit
    comms) branch. It previously fell through to the default and skipped
    app/routers/calendar.py and app/workers/notify.py — your ICS feed and your
    notification worker. A green check would have meant nothing for half your
    milestone.
  - There is no privacy i18n namespace and there will not be one. types.ts lists
    nine namespaces and index.ts is authored once on main. That is lane REPORTS'
    concern, not yours, but it is the reason you will not find one.

You are the CALLEE this wave. Lane REPORTS (M9) opens after you merge, and its
retention and at-risk jobs call NotificationService.enqueue(person_id, kind, title,
body, payload) -> Notification. The contract commit landed that signature. Do not
change it.

Plan first with superpowers:writing-plans. Then per task: failing test, confirm it
fails, minimal implementation, green, commit.

Your check is:  ./scripts/lane-check.sh comms
Do not claim done until it is green. Show me the output.
```
