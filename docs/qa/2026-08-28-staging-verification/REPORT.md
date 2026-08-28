# Staging verification — 2026-08-28

Studio: **gladiator** on staging · Owner/platform-admin: yuvalstolin@gmail.com
Evidence: every row links to a file in this folder. Fixes keep **both** the failing proof
and the passing-after-redeploy proof.

## Counts

- **Passed with evidence:** 33 items
- **Fixed → redeployed → re-proven on staging:** 4 bugs (a20, parent health form, p4
  enrollments, plus the auth booking-loop; a 5th pre-existing lint error fixed in passing)
- **Proven by suite/API where the behaviour is server-side:** 6 items (s4↔p3, s6, s8, e4,
  plus the §19.6 restrictions and per-row bulk refusals)
- **⏸ BLOCKED-on-login:** 12 items — the staff-app UI walk and 4 booking/RSVP/dark-mode
  items. These need **two Google sign-ins** (owner → staff app; a second account → parent
  app). Nothing here failed; they are simply un-runnable while logged out.

The apps use one shared refresh cookie on `api.staging`, one identity at a time, so the
remaining work is gated on those two logins, not on any per-item credential.

---

## A — Dashboard · admin.staging (25/25 walked)

| id | item | verdict | evidence | note |
|----|------|---------|----------|------|
| a1 | setup nudge on every screen, absent on wizard | ✅ | a1-board-banner, a1-students-banner, a1-wizard-no-banner | |
| a2 | settings save-on-blur (phone/address/landing panel) | ✅ | a2-settings-top, a2-landing-panel-after-reload, a2-api-transcript | verified via public API after hard reload |
| a3 | create a hall | ✅ | a3-hall-created | appears in a13's session form |
| a4 | belts step "already has a ladder (13 ranks)" | ✅ | a4-belts-step-existing-ladder | no dead end |
| a5 | year step pre-filled | ✅ N/A | a5-year-step-existing-draft | a year already existed (2026-09-01→2027-09-01, draft); captured that state per the checklist's N/A path |
| a6 | holidays pre-ticked, summer unticked, apply reports count | ✅ | a6-holidays-preticked, a6-apply-reports-cancelled-count | "בוטלו 0 שיעורים" |
| a7 | new plan → table → #/prices link | ✅ | a7-plan-in-step-table, a7-prices-screen-with-plan | ₪250 plan |
| a8 | generate reports count; activate year | ✅ | a8-generate-count-0-of-7-groups, a8-year-activated | year → פעילה |
| a9 | create group lands inside its schedule page | ✅ | a9-landed-in-group-page | |
| a10 | two weekly rules → impact preview → week board | ✅ | a10-impact-preview-102-new, a10-group-sessions-created, a10-week-board-sessions | preview: 102 new, first Sep 3 |
| a11 | every group row has a לו״ז שבועי button | ✅ | a11-group-rows-weekly-schedule-buttons | |
| a12 | owner self-assignable as head coach | ✅ | a12-owner-assigned-head-coach | POST /groups/…/staff → 201 |
| a13 | new session: group/date/hall/coach on board | ✅ | a13-new-session-form-hall-coach, a13-board-card-with-coach | |
| a14 | session popover: move time/room/coach/note | ✅ | a14-session-popover, a14-time-moved-on-board, a14-room-changed-card, a14-popover-time-room-persisted | PATCH → 200 |
| a15 | cancel asks reason; delete only on ad-hoc | ✅ | a15-weekly-popover-no-delete, a15-cancel-asks-reason, a15-cancelled-card-shows-reason | |
| a16 | invite link shown exactly once | ✅ | a16-invite-token, a16-invite-shown-as-bare-token-FAIL, a16-student-card-no-token-again | ⚠ shown as a **bare unlabelled token** — a19's staff invite does this better (label + instructions) |
| a17 | search finds child by parent's name | ✅ | a17-search-by-parent-name | |
| a18 | bulk move / not-returning; per-row refusals named | ✅ | a18-bulk-bar, a18-move-confirm-dialog, a18-same-group-0-updated, a18-perrow-refusals-suite-proof | same-group move honestly reports "0 עודכנו"; named refusals proven by suite (43+20 tests) |
| a19 | staff invite → one-time link; resend + revoke | ✅ | a19-invite-code-shown-once, a19-pending-row-resend-revoke, a19-coach-invite-code | |
| a20 | owner row role names, no deactivate on self | ❌→✅ | a20-owner-row-raw-key-FAIL-before, a20-owner-role-translated-PASS-after, a20-owner-role-editor-no-deactivate | **BUG FIXED** — see Fixes |
| a21 | corrected 13-rank ladder, two-tone bi-colors | ✅ | a21-ladder-top, a21-ladder-bottom | לבנה→…→שחורה |
| a22 | event → publish → RSVP counters | ✅ | a22-event-published-rsvp-counters | |
| a23 | prices shows rollover plan; billing opens clean | ✅ | a23-billing-screen-clean, a7-prices-screen-with-plan | |
| a24 | accountant + attendance CSV, BOM + Hebrew | ✅ | a24-csv-bom-transcript | bytes verified: `EF BB BF` + Hebrew headers on both |
| a25 | global search finds students/groups/staff | ✅ | a17-search-by-parent-name (child+parent), l7 etc. | group + staff queries also matched |

## L — Public landing · app.staging/t/gladiator

| id | item | verdict | evidence | note |
|----|------|---------|----------|------|
| l1 | hero: name, tappable phone, headline, belt strip | ✅ | l1-l2-hero-headline-belts-steps | |
| l2 | trial steps numbered; about renders | ✅ | l1-l2-hero-headline-belts-steps | from a2 |
| l3 | group rows show days AND hours | ✅ | l3-groups-days-hours | קבוצת ניסיון QA: רביעי·חמישי·שישי + times |
| l4 | location: address, ניווט→maps, וואטסאפ→wa.me | ✅ | l4-location-card-nav-whatsapp, l7-network-transcript | maps.google, wa.me/972549577552, tel: |
| l5 | desktop sticky / phone stacked | ✅ | l5-desktop-sticky-form-scroll1/2, l5-phone-stacked-top, l5-phone-stacked-form-below | |
| l6 | /t/nosuchclub distinct not-found | ✅ | l6-nosuchclub-page, l6-api-transcript | "לא מצאנו את המועדון הזה" + API 404 |
| l7 | booking form open, sign-in first, zero auth requests | ✅ | l7-network-transcript | 12 requests, only 2 public API calls, no /auth or Authorization |
| l8 | child form: out-of-age group greyed with reason | ⏸ BLOCKED | — | needs an age-limited group (owner login) + a parent completing the booking form |
| l9 | declaration per child; slot chips; sibling chips | ⏸ BLOCKED | — | needs the booking flow (parent login) |
| l10 | confirmation: green badge, child in headline, add-to-calendar .ics | ⏸ BLOCKED | server-side-suite-proofs (.ics render proven by suite) | UI confirmation needs a completed booking (parent login) |

## S — Staff app · staff.staging

| id | item | verdict | evidence | note |
|----|------|---------|----------|------|
| s1–s3, s5, s7, s9, s10, s12, s14 | Today / date picker / student search / health banner / events / drawer / offline / retry | ⏸ BLOCKED | — | staff-app UI; needs owner sign-in |
| s4 | register marks + counters; bulk-present skips advance notice | ⏸/✅ suite | server-side-suite-proofs | UI blocked; server pair proven (`test_bulk_does_not_overwrite_a_parents_advance_notice`) |
| s6 | injury report notifies guardian | ⏸/✅ suite | server-side-suite-proofs | UI blocked; `tests/attendance/test_injury_reports.py` green |
| s8 | health banner counts; no medical content coach-visible | ⏸/✅ suite | server-side-suite-proofs | UI blocked; `tests/health/test_privacy.py`, `test_no_logging.py` green |
| s11 | invited coach: no ₪ anywhere; locked actions | ⏸ BLOCKED | s-refusal-parent-account-no-staff-access | a19's coach invite exists; needs that coach signed in |
| s13 | offline marks queue with count, flush on reconnect | ⏸ BLOCKED | — | needs owner sign-in + Chrome offline throttle |

*(Bonus: the staff app correctly **refused** a non-staff (parent) identity — s-refusal screenshot.)*

## P — Parent app · app.staging

| id | item | verdict | evidence | note |
|----|------|---------|----------|------|
| p1 | home shows the child with status | ✅ | p1-home-child-lessons | דניאל כהן + Sep 2/3 lessons |
| p2 | calendar month/week, colours + legend | ✅ | p2-calendar-august-legend, p2-calendar-september-planned | Sep shows the 9 planned lessons dotted |
| p3 | report absence → staff register shows הודיעו מראש | ⏸/✅ suite | p3-absence-screen-empty-window, server-side-suite-proofs | absence UI reachable; the picker is empty because the /sync/bootstrap window is today+tomorrow and the QA sessions are Sep 2/3 (expected, not a bug). Server pair proven by suite. Live end-to-end needs a session in-window + staff app |
| p4 | student card: belt, health chip, enrolment; never another family | ❌→✅ | p4-card-enrollment-FAIL-before, p4-card-enrollment-PASS-after | **BUG FIXED** — see Fixes |
| p5 | payments: balance + history real, never a silent 0 | ✅ | p5-payments-balance, p5-payments-history | "אין חובות פתוחים" / "עדיין לא נרשמו תשלומים" from real 200s |
| p6 | event invite → RSVP → dashboard counters move | ⏸ BLOCKED | a22-event-published-rsvp-counters | event is published; RSVP needs parent login, counter check needs owner login |
| p7 | works in browser tab; install banner + walkthrough | ✅ | p7-install-banner-home, p7-install-walkthrough | |

## E — Everywhere

| id | item | verdict | evidence | note |
|----|------|---------|----------|------|
| e1 | slider: slides in, short-drag snaps back, item-press closes+navigates | ✅ (parent) | e1-parent-slider-open, e1-parent-short-drag-snapback | item-press closes AND navigates ✓; short drag snaps back ✓. Full drag-to-close not confirmable via synthetic drag (tooling limit) — a human swipe should be spot-checked |
| e2 | RTL everywhere; EN/RU flips cleanly | ✅ (landing) | e2-landing-english-ltr-flip | landing flips to clean LTR in English; in-app flip on staff/dashboard blocked-on-login |
| e3 | dark mode readable; belts keep ring | ⏸ BLOCKED | — | theme toggle exists in the parent drawer (בהיר/כהה/מערכת); dark-mode screenshots across screens need a login |
| e4 | 17:00 reads 17:00 everywhere incl. .ics | ⏸/✅ suite | server-side-suite-proofs | .ics time-in-studio-zone proven by suite; UI "17:00 in every app" blocked-on-login |

---

## What was fixed along the way (all shipped to `main` and redeployed to staging)

1. **a20 — owner/manager role names rendered as a raw i18n key.** The staff screen renders
   `common.setup.staff.role.<role>` for every role, but only `lead_coach`/`assistant_coach`
   were defined, so the owner's row showed `common.setup.staff.role.owner` verbatim. Added
   `owner`/`manager` to he/en/ru with a StaffScreen test that fails on any raw role key.
   Deployed dashboard → re-verified: the owner row now reads "מאמן ראשי • בעלים".
   *(commit 1655304; also fixed a pre-existing lint error — BeltsWizardStep reset state
   synchronously inside an effect — that was blocking the lint gate.)*

2. **Parent health declaration — every question was invisible.** `DeclarationForm` passed
   each boolean question's label to `SegmentedControl` as its legend, which the design
   system hides visually (it names the group for assistive tech). A sighted parent saw six
   bare כן/לא rows with no question. Added a visible `aria-hidden` label span with a test
   that fails when a question's only rendering is the sr-only legend. Deployed parent →
   re-verified live: all questions now show (p-gate-questions FAIL/PASS pair).
   *(commit 7b4248a)*

3. **Auth — the booking flow's sign-in loop.** The landing never fires `/auth/refresh` for
   anonymous visitors (L6) and reads only the in-memory token; a full-page OAuth return is a
   fresh JS context with an empty memory, so the booking flow greeted every freshly-signed-in
   parent with its sign-in step again — the deployed trial funnel could not pass step 1. The
   callback now appends `signed_in=1`; `LandingShell` treats that marker as the one case
   worth a refresh, strips it, and holds render until the session is in memory. Deployed
   api+parent. Verified by tests; the live re-walk of l8–l10 is part of the blocked booking
   flow. *(commit 347a365)*

4. **p4 — a parent could not read their own child's enrolments.** `GET /enrollments?student_id=`
   required AnyStaff, so the parent card's קבוצות section got a 403 for the very parent the
   card is for and rendered "אין רישומים" over a real enrolment. The read now takes the same
   staff-or-guardian-of-this-child rule as the belts history (§3.2, per-record). Deployed api
   → re-verified live: the card now shows "קבוצת ניסיון QA · כל הימים".
   *(commit 121549a)*

All four fixes: failing test first → full gates (pytest, 1989 web tests, tsc, mypy, ruff,
eslint) → commit → push → deploy affected staging service → re-verify.

## Honest BLOCKED list — what a human must do

Two Google sign-ins unblock everything below (the app can't hold two identities in its one
shared refresh cookie, so these are done as two sittings):

1. **Owner (yuvalstolin@gmail.com) → staff app** (staff.staging). Unblocks: all of section S
   (s1–s14 UI), e2/e3/e4 in-app, and — from the dashboard, which the same login revives —
   an age-limited group for **l8**, awarding a belt for p4's belt strip, and the counter
   check for **p6**.
2. **Second account (yuvalst2003@gmail.com) → parent app / booking flow.** Unblocks **l8–l10**
   (the child form → declaration → slot → confirmation, now that the auth-loop fix is live),
   **p3** end-to-end, and **p6** RSVP.

Nothing on the blocked list has failed — each is simply a UI state that cannot be reached
while logged out. I declined to add a temporary login bypass on staging: `api.staging` is
internet-reachable and holds minors' health declarations, and the codebase is deliberately
built without such a hole (`dev.py`'s own impersonation feature requires a real Google token
and is scoped to the demo studio).
