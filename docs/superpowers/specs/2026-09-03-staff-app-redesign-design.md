# Staff app redesign — a smaller app for three jobs, plus one new one

**Status:** agreed, not started. No code has been written against this document.
**Date:** 2026-09-03

---

## 1. Why this exists

The staff app (`web/apps/staff/`) grew to carry a 7-step club setup wizard, seven
notification toggles, a calendar-subscription link, a privacy-request queue, a full
locked-capabilities readout, item hand-over, a month calendar picker, and a "עוד" drawer
with nine entries — on top of the three things it is actually opened for: **marking
attendance, adding a student mid-class, and telling a family what they owe.** Most of the
rest is desk work that already has a home on the dashboard, or duplicates something the
app shell already shows once (offline status, the "you can't do this" list).

This redesign cuts the app down to what a manager and their coaches use standing on a mat,
adds one screen the app never had (a coach flagging a day they can't be there, so the
manager finds out from the dashboard instead of a phone call), and fixes one rendering
defect found while reviewing the current build (§7).

## 2. Who this is for

Manager and coaches both use this app; the manager is the primary audience and every
screen is designed manager-first, with coach-safe restrictions layered on top rather than
built as a separate coach app. Three roles matter here:

- **owner / manager** — sees everything, including money.
- **lead coach** — sees money (a club's senior coach is trusted with it; only §13's
  invariant about *coach-scoped* endpoints in general does not distinguish lead from
  assistant today, and this redesign is what makes it distinguish them).
- **assistant coach** — never sees money, structurally: the field does not reach their
  client, not merely hidden by role in the UI.

## 3. Decisions taken (2026-09-03)

### First launch

1. **A small first-run gate, not the club setup wizard.** Welcome → sign the terms of use
   and privacy policy → the existing 3-screen tour (`StaffTour.tsx`, unchanged: "today's
   lessons" · "tap to mark attendance" · "works offline too"). This is new: today a coach
   can *read* the terms from the sign-in footer, but nothing records that they agreed.
   Every staff member without a current-version signature is gated on next launch, the
   same version-bump-reasks-everyone rule the parent side already uses for `CLUB_TERMS_
   VERSION` / `POLICY_VERSION`.
2. **The 7-step club setup wizard (`studio → groups → belts → prices → items → staff →
   students`) is removed from the staff app entirely** — `#/setup`, the route, the
   incomplete-setup banner, `Resolve`'s wizard arm. It stays exactly as it is on the
   dashboard, which is where an owner configuring a club sits down to do it. Staff `Resolve`
   simplifies to: signed-in and gated on the tour → Today. No owner-vs-coach branch left to
   maintain here.

### The bottom menu

3. **Four tabs: היום (Today) · נוכחות (Attendance) · תלמידים (Students) · עוד (More).**
   נוכחות stops being a redirect to `#/schedule` (today it exists only to bounce, see
   `App.tsx`'s `useEffect` on `hash === '#/attendance'`) and becomes a real tab: today's
   session if there's exactly one live, otherwise the day's list to pick from. Attendance
   sits next to Today rather than after Students — it is the one screen opened during
   literally every class, and earns the closer thumb position over Students, which is
   opened less often per session.

### Today and the calendar

4. **The full month calendar (`DatePickerScreen.tsx` / artboard `9b`) is kept, not cut.**
   An earlier pass through this design called it redundant with the 7-day strip and
   proposed removing it. It survives, repurposed: it already renders a Sunday-first month
   grid marking which days have lessons, which is exactly the surface decision 8 below
   needs. Reached from Today, same as it is reached today.

### Attendance — the register itself

5. **Opens with every expected student already marked present.** A coach taps only the
   ones who did not come. This replaces today's `unmarked → present → absent_unexcused
   → unmarked` cold-open plus a separate "mark all present" button — the default state
   *is* the common case, so there is nothing to tap for a normal class. A tap on a present
   row still cycles it to absent and back, so an ordinary tap remains how you correct a
   mistake. Pre-reported absences (`has_absence_report`) are unaffected — they are not
   flipped to present by this new default, exactly as the bulk button today must not
   overwrite them (§10.5).
6. **A search field above the roster**, filtering the visible list by name — for a class
   large enough that scrolling to find one child is slower than typing three letters.
7. **The run-together footer links are a bug, not a design change — fixed regardless of
   anything else in this document.** `RosterScreen.tsx`'s footer nav renders
   `סיכום מפגש`, `מסירת פריט`, and `הוספת חניך לשיעור` with no visible separator between
   them (confirmed in the current build's own screenshot: `סיכום מפגשמסירת פריטהוספת
   חניך לשיעור` reads as one word). Needs a visible separator (`·`, matching the header's
   own convention two lines up) or block-level spacing.
8. **Money on the row, gated at the source.** A second, role-gated read (`owner`,
   `manager`, `lead_coach` — not `assistant_coach`) supplies the amount owed per student
   for the session; the screen merges it into the row only when that read succeeds. An
   assistant coach's client never makes the call and the base roster stays exactly as
   money-free as `tests/invariants/test_03_coach_endpoints_expose_no_money.py` requires
   today — that test's `COACH_TAG` gate does not need to change, because the money-bearing
   read is not tagged `coach`. `AuthContext.LeadCoachOrAbove = require_roles("owner",
   "manager", "lead_coach")` is the one new dependency this needs; the pattern
   (`require_roles(...)`, `ManagerOrOwner` in `auth_context.py:116`) already exists.
9. **Add-a-student-mid-class becomes one form with a fork**, replacing the standalone
   `TrialInClass` screen. Contact fields up front, then **נסיון או הרשמה?**
   - נסיון → today's `TrialInClass` behaviour unchanged: 4 fields, enrols nobody, no
     health form, no price.
   - הרשמה → decision 20's shape from the onboarding-doors spec (full name · 18+? ·
     guardian email), sending the same invitation link `AddStudentScreen` sends today —
     new wiring for the staff app, which does not call that endpoint today.
10. **Belt-exam result recording is kept, reachable from a session, not from its own tab**
    — see decision 14.

### Students

11. **Unchanged**, except reached one tab position later than today: search, student
    card, one-tap call, group transfer for lead coach and above.

### More

12. **Account** (sign out, language, theme) — unchanged, this is what remains of today's
    drawer footer.
13. **"הימים שסימנתי כלא זמין"** — a coach's own list of the days they have flagged
    unavailable (decision 15), so they can review or undo one without re-finding it on the
    calendar.
14. **Events & belt exams**, kept in full — the events list, the RSVP roster, and exam
    results — moved here from its own tab. The owner's reasoning: the manager runs these
    live, during the occasion, the same way attendance is run live during a class; it is
    real in-person work, not desk work, and stays. It loses the dedicated tab slot because
    it is used far less often than the three daily jobs — a link in עוד costs one extra
    tap a few times a year, where a fourth daily-use screen taking the tab slot Attendance
    now holds would cost every coach a tap on every single class.
15. **The install nudge** — kept, deliberately, despite reading as "not one of the three
    jobs." §6.5's own reasoning is real: only an installed PWA escapes Safari's 7-day
    script-storage eviction, and that eviction is what would silently empty
    `pending_ops` — a coach's queued, unsynced attendance marks — if the app is never
    installed. Cutting the nudge risks losing exactly the data this whole app exists to
    collect.

### Coach unavailability → dashboard conflicts (new, cross-app)

16. **A coach marks a whole day unavailable, one tap, with a reason.** From the month
    calendar (decision 4), tapping a date — not a specific session — opens a small form:
    a reason (free text, e.g. "טיסה"), confirm. It marks every session that coach is
    assigned to that day, not one at a time; the common case is a coach not showing up to
    any of their sessions that day, and per-session granularity was considered and
    dropped in favour of the faster common path.
17. **This is a new record, not an extension of an existing one.** Nothing in
    `app/models/schedule.py` represents a person's unavailability today — `StudioClosure`
    is studio-wide (holidays), `SessionStaff` is who actually staffed a session after the
    fact. A new tenant-scoped table (`person_id`, `date`, `reason`, `created_at`) is the
    smallest thing that answers "is this coach out on this day," and both new behaviours
    below read from it.
18. **The dashboard's schedule views flag any session whose coach has an unavailability
    row for that date** — the week board, the group schedule page — as a conflict, the
    same way an already-existing "sessions without a coach" report (referenced in
    `SessionStaff`'s own docstring) already surfaces a related gap.
19. **Creating or editing a session/event and assigning a coach checks that coach's
    unavailability for the date and warns inline before save** — "Yuval isn't available
    on the 14th — טיסה" — rather than only surfacing the conflict after the fact on the
    week board.
20. **The conflict resolves inside the dashboard**, not by phone call: the flagged row
    gets an "assign a substitute" action that reassigns `SessionStaff` for that occurrence
    to a different coach — reusing the existing "who actually staffed this session, as
    distinct from who normally does" model rather than inventing new machinery. Once
    reassigned, the conflict clears from the flagged view.

### Cut entirely

21. The 7-step club setup wizard (decision 2).
22. The seven notification-preference toggles and the coach calendar (ICS) subscription
    link, both currently in the drawer — one-time configuration, a dashboard job.
23. The privacy-request queue (`PrivacyOperatorScreen`) — rare, legal-paper-trail work,
    a dashboard job.
24. The locked-capabilities list (`PermissionBoundaries`) — an assistant coach is simply
    not shown a control they cannot use, rather than being shown a list of what they
    cannot use.
25. Item hand-over during class (`HandOverSection`, `#/attendance/<id>/handover`) — a
    money surface that does not match any of the three core jobs.

### Out of scope for this document

26. The four-doors onboarding wizard (`docs/superpowers/specs/2026-09-03-onboarding-
    doors-and-wizard.md`) is parent-facing end to end — `/t/<slug>`, `/join/<token>`,
    `/?invite=<token>`, `#/add-child` all live in the parent app. Nothing in it touches
    the staff app except its decision 20 (`AddStudentScreen` becoming student-first),
    which lives in the dashboard and is already agreed there, independent of this
    document. Reviewing that spec's own design is a separate piece of work.

## 4. Testing notes

- `test_03_coach_endpoints_expose_no_money.py` must keep passing unchanged — the new
  money-bearing read is a new, separately-tagged endpoint, not a change to the existing
  `coach`-tagged roster read. A test proving an `assistant_coach` role gets a 403 (or a
  money-free response) from the new read is the natural companion to that invariant.
- The all-present default (decision 5) needs a test that a pre-reported absence survives
  the initial render unmarked-to-present, the same guarantee §10.5 already requires of the
  bulk-present button.
- The footer-separator fix (decision 7) is a one-line rendering fix; a snapshot or text
  assertion on the footer nav's accessible text is enough to keep it from regressing.
