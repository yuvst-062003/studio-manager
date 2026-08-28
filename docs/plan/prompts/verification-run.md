# Verification run — prove every feature on staging

You are running a **verification session** for Studio Manager on staging. Your mission:
walk the entire feature checklist below, item by item, and for EVERY item produce
**proof** — a screenshot, an API transcript, a test run, a DB query — that it works or
that it fails. Your goal is to end with every item marked ✅ PASS. When an item fails,
you **fix it, redeploy, and re-verify** until it passes. An item is never abandoned; it
is either proven green, or reported to the owner as ❌ with proof and a named blocker.

## The three iron rules

1. **No verdict without evidence.** A claim of "works" with no artifact behind it is
   worthless. Every single checklist item gets at least one evidence file. Never mark an
   item PASS because the code "should" do it — prove it on the running staging system.
2. **Fix, then re-prove.** A failure is a work item, not a note. Reproduce → fix in code
   (failing test first when it is a code bug) → run the gates → commit → push → deploy
   the affected staging services → verify again ON STAGING → capture the passing proof.
   The report shows both the failing proof and the passing proof.
3. **Never fake a pass.** If an item genuinely cannot be verified from this session
   (needs a physical iPhone, needs a human's eyes on a real device), mark it ⏸ BLOCKED
   with the exact reason and what a human must do. A BLOCKED with honest reasoning is
   fine; a PASS without proof is the one unforgivable outcome.

## Where everything lives

- Staging: `admin.staging.gladiatorclub.co.il` (dashboard) ·
  `staff.staging.gladiatorclub.co.il` (staff) ·
  `app.staging.gladiatorclub.co.il` (parent; `/t/gladiator` is the public landing).
- The owner (yuvalstolin@gmail.com) is platform admin + owner of studio slug
  `gladiator` on staging.
- Deploys do NOT happen on git push. After merging a fix to `main`:
  `railway deployment up --service <api|dashboard|staff|parent> --environment staging --detach`,
  then poll `railway deployment list --service <s> --environment staging` for SUCCESS.
- DB access: `railway ssh --service api --environment staging` then Python with
  `DATABASE_URL` (read-mostly; write only to fix data with the owner's approval).
- Gates before any commit: `.venv/bin/pytest -q` · `cd web && npm run test` ·
  `npm run typecheck && .venv/bin/mypy app` ·
  `.venv/bin/ruff check --fix app && .venv/bin/ruff format app && npm run lint`.
  Always the `.venv/bin/` prefix — bare `python3`/`pytest` resolves to an old 3.8.
- Read `CLAUDE.md` before touching code. Tick nothing in `docs/plan/state.yaml` unless
  you shipped code.

## How to test

**Browser first.** Use the Claude-in-Chrome tools for everything a user sees:
screenshot every verified state (`save_to_disk: true`) — the screenshot IS the proof.
At session start, ask the owner to (a) connect the Chrome extension and (b) sign in to
the staging apps in that browser with their own Google account. **Never enter
credentials yourself** — when a sign-in screen appears, hand the browser to the owner
and wait. For the parent-app items they will need a second Google account signed in
(or an incognito profile they authenticate themselves).

**API second.** Anything provable over HTTP without auth (the public landing payload,
CORS preflights, health, openapi) — prove with `curl`, save the annotated transcript.
For authenticated API proof, drive the browser instead of minting tokens.

**Suite + DB third.** Where the behavior is server-side (e.g., "bulk never overwrites a
parent's pre-report"), a targeted test run on the current `main` plus, where useful, a
staging DB read via `railway ssh` count as proof — label them as such in the report.

**If the browser extension cannot connect**, say so immediately, verify everything
API/suite-provable, and mark the UI-only items ⏸ BLOCKED-on-browser rather than
guessing. Do not silently downgrade the mission.

## Evidence conventions

Create `docs/qa/2026-08-28-staging-verification/` (adjust the date to today):

- One image or transcript per item, named by item id: `a13-new-session.png`,
  `l4-whatsapp-link.md`, `s13-offline-flush-before.png` / `…-after.png`.
- `REPORT.md` in that folder: a table — item id · name · verdict (✅/❌→✅/⏸) ·
  evidence file(s) · one-line note. Failures keep BOTH proofs (fail + pass after fix).
- Commit the evidence folder to `main` and push, in batches per app section.
- After each app section, post the owner a short summary in chat: passed / fixed /
  blocked, with the interesting findings. Do not wait for a reply; continue.

## Fix workflow (when an item fails)

1. Capture the failing proof first (screenshot / response / console + network log).
2. Diagnose: browser console + network via the Chrome tools, `railway ssh` for server
   logs and DB state, the codebase for the defect.
3. Code bug → failing test first, then the fix. Data/config gap on staging (e.g., a
   studio setting never filled) → fix the data the product way if a screen exists for
   it (through the UI, which itself is a test), or via SSH with a note in the report.
4. Full gates → commit to `main` with a message naming the checklist item → push →
   deploy the affected services → wait for SUCCESS → re-verify in the browser →
   capture the passing proof.
5. If a fix needs a schema migration or a product decision, STOP on that item, mark it
   ❌ with a written proposal in the report, tell the owner, and move on.

## The checklist

Walk in order — earlier items create the data later ones need. Items marked (needs:
X) depend on X having passed.

### A — Dashboard · admin.staging

**Setup & settings**
- [ ] a1 · Setup nudge banner on every manager screen — "הקמת המועדון עדיין לא הושלמה"
      with step count; המשך בהקמה opens the wizard; absent on the wizard screen itself.
- [ ] a2 · Settings: fill club phone + address, and the דף הנחיתה panel (headline,
      about, trial steps one-per-line); each field saves on blur (verify via reload).
- [ ] a3 · Settings: create a hall (location); it later appears in session forms.
- [ ] a4 · Wizard belts step with an existing ladder: shows "already has a ladder
      (13 ranks)" + המשך לשלב הבא — no dead end.

**Year rollover**
- [ ] a5 · Year step arrives pre-filled (name 2026–2027, dates 1.9→31.8) — one click
      creates. (If a year already exists, prove the pre-fill by screenshot of the form
      in a fresh state or mark N/A with the existing year's proof.)
- [ ] a6 · Holiday step arrives with chagim pre-ticked, summer unticked; nothing is
      written until apply; applying reports cancelled-session count.
- [ ] a7 · Prices step: פתיחת מסלול חדש creates a plan (name, sessions/week, ₪);
      appears in the table; link to #/prices works.
- [ ] a8 · Generate sessions reports a count; activate the year; "no active year"
      refusals disappear.

**Groups & weekly schedule**
- [ ] a9 · Create group → you land inside its schedule page (not back at the table).
- [ ] a10 · Add two weekly rules (e.g., Thu 15:00–16:00 + Fri 14:00–15:00) → save →
      impact preview → sessions appear on the week board.
- [ ] a11 · Every group row shows a לו״ז שבועי button.
- [ ] a12 · Group coaches panel: the OWNER's own name is pickable; assign self as
      מאמן ראשי.

**Week board & sessions**
- [ ] a13 · שיעור חדש: group, date, hours, hall, coach (owner selectable) → session
      appears on the board with the coach's name.
- [ ] a14 · Session popover: move time, change room, change coach (owner in list),
      add note.
- [ ] a15 · Cancel asks a reason and shows it; delete offered ONLY on ad-hoc sessions.

**Students & staff**
- [ ] a16 · הוספת חניך button → create parent+child+group → invitation link shown
      exactly once (SAVE IT — needed for section P).
- [ ] a17 · Students search finds the child by the PARENT's name.
- [ ] a18 · Bulk select → move group / not returning; per-row refusals are named.
- [ ] a19 · Staff invite with a role → one-time link; resend + revoke on pending row.
- [ ] a20 · The owner's own row has edit-roles (grant self lead_coach) and NO
      deactivate button.

**Belts, events, money**
- [ ] a21 · Belts screen shows the corrected 13-rank ladder (…ירוקה → ירוקה-כחולה →
      כחולה → חומה → שחורה), bi-color belts render two-tone.
- [ ] a22 · Create an event → publish → RSVP counters appear.
- [ ] a23 · Prices screen shows the rollover-created plan; payments/collections
      screens open clean.
- [ ] a24 · Accountant CSV + attendance CSV download; Hebrew readable (BOM) — open
      the bytes and prove the ﻿BOM + headers.
- [ ] a25 · Global search on / finds students (child + parent name), groups, staff.

### L — Public landing · app.staging/t/gladiator (logged out / incognito)

- [ ] l1 · Hero: club name, tappable phone, headline, 13-belt ladder strip + caption.
- [ ] l2 · Trial steps (from a2) render as a numbered list; about renders.
- [ ] l3 · Group rows show days AND hours (from a10).
- [ ] l4 · Location card: address, ניווט → maps link, וואטסאפ → wa.me with the club
      number.
- [ ] l5 · Desktop: booking form sticky beside content; phone: stacked. (Resize the
      browser window for both screenshots.)
- [ ] l6 · /t/nosuchclub says "no such club" — distinct from the no-schedule state.
- [ ] l7 · Booking form OPEN on load; sign-in is its first step; zero authenticated
      requests fire on the public page (prove via the network log).
- [ ] l8 · (owner signs in a second account) Child form: out-of-age group greyed with
      reason, not hidden.
- [ ] l9 · Declaration per child; slot chips (cancelled slot greyed, never hidden);
      with a sibling each child gets their own chips.
- [ ] l10 · Confirmation: green badge, child's name IN THE HEADLINE, date·time·group·
      address line, add-to-calendar downloads a valid .ics (open it and show VEVENT
      per child).

### S — Staff app · staff.staging (owner's account)

- [ ] s1 · Setup nudge shows; המשך בהקמה opens #/setup wizard in-app.
- [ ] s2 · Today: cards with time, duration, group, hall, headcount; day-strip; header
      summary; חזרה להיום appears off-today.
- [ ] s3 · Date picker: month grid, legend, lesson-day rings, past-unmarked amber
      rings, four quick jumps.
- [ ] s4 · Register: header weekday·time·group·hall; tap-cycle marks; counters;
      bulk-present skips a parent's advance notice (pair with p3).
- [ ] s5 · After marking: Today card shows נוכחות נרשמה; dashboard board agrees.
- [ ] s6 · Post-lesson: summary, injury report (guardian gets notified — check in
      parent app), trial-in-class, handover.
- [ ] s7 · Student search: class tabs, belt/tenure/% meta, parent-name search, row
      opens the card.
- [ ] s8 · Health banner counts declarations; NO medical content anywhere coach-visible.
- [ ] s9 · Events: cards with date·venue·consents; future → participants list; past
      exam → results sheet with belt pairs.
- [ ] s10 · Drawer: name·role·הכיתות שלי, notification prefs, calendar feed.
- [ ] s11 · As an invited coach (a19's invite, owner signs it in): no ₪ anywhere;
      cash/join-link/setup answer לא זמין בהרשאה שלך; drawer lists locked actions.
- [ ] s12 · Airplane mode (or Chrome offline throttle): לא מקוון appears; roster still
      opens from cache.
- [ ] s13 · Marks taken offline queue with a visible count; on reconnect they flush to
      zero and reach the dashboard. Before/after screenshots.
- [ ] s14 · A failed screen load offers retry; offline failures say offline, not
      "failed".

### P — Parent app · app.staging (second account / invited parent from a16)

- [ ] p1 · Home shows the child with status (ניסיון for a trial).
- [ ] p2 · Calendar: month/week toggle, child switcher, attendance colors + legend.
- [ ] p3 · Report an absence → staff register shows הודיעו מראש (closes s4's pair).
- [ ] p4 · Student card: belt, last-8 strip, health chip, payment strip; never another
      family's data.
- [ ] p5 · Payments: balance + history load real numbers, or say they could not load —
      never a silent 0.
- [ ] p6 · Event invite → RSVP yes → consent sign → dashboard counters move.
- [ ] p7 · Works in the browser tab; install banner explains and opens the walkthrough
      on demand.

### E — Everywhere

- [ ] e1 · Slider menu on all three apps: slides in, drag-to-close (short drag snaps
      back), item press closes AND navigates.
- [ ] e2 · Hebrew RTL everywhere; switching to English/Russian flips layout cleanly.
- [ ] e3 · Dark mode: readable on every major screen; belts keep their ring.
- [ ] e4 · A 17:00 class reads 17:00 in every app and inside the .ics.

## Report and finish

When the walk is done: finalize `REPORT.md` (verdict table + a short "what was fixed
along the way" section + the honest BLOCKED list), commit + push, and give the owner a
manager-style summary in chat: counts (passed / fixed-then-passed / blocked), the
fixes shipped, and what needs a human. The proof folder is the deliverable; the
summary is its cover letter.
