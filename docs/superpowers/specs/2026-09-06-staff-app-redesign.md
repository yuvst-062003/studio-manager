# The staff app redesign

**Written:** 2026-09-06 · **Source:** the AI Studio prototype at `~/Downloads/staff-app`, read
directly · **Status:** approved; checkpoint 1 in progress on `feat/staff-app-redesign`.

Decisions 21–23 and §2's third bug were found *during* checkpoint 1 rather than before it, and
are recorded here rather than in a commit message so this file stays the one place to read.

The coach-facing app becomes five tabs — `schedule · students · timer · tasks · account` —
against the real API. This document says what every screen is, which endpoints it needs, which
of those already exist, what is genuinely new, and what is deliberately left out.

Twenty-three decisions were taken with the owner on 2026-09-06 and are listed in §1. Where a decision
overruled a recommendation of mine, the recommendation is not restated — the decision is the
spec.

---

## 1. Decisions

| # | Question | Answer |
|---|---|---|
| 1 | Where does the Tasks list come from? | The app works it out. No task table. Plus a tick box for the one type it can't observe. |
| 2 | Are timer presets private or shared? | Private to the coach's phone. No backend. |
| 3 | Which palette does the staff app wear? | The prototype's cool blue-grey. Amends D14 — §8. |
| 4 | Where do events go? | Inline in the session list, like any other session. Tapping one opens the attendance screen. |
| 5 | A dedicated belt-exam screen? | The owner's own later work. The existing one stays reachable. |
| 6 | Is the coach-unavailability loop in this release? | All of it. |
| 7 | Does the phone get a month calendar? | **Yes** — it shows staff their future sessions and events. |
| 8 | Who can edit from that calendar? | Managers and senior coaches. Assistant coaches cannot. |
| 9 | What can they edit? | Change the coach, cancel, and move. |
| 10 | What can a manager do about a filed constraint? | Approve or refuse. |
| 11 | How does the dashboard present one? | An alert, opening a popup offering replacements and actions — cancel the session, move it. |
| 12 | How are replacements suggested? | Just who's free. No ranking. |
| 13 | Do parents get told when a coach changes? | **No. Remove the switch entirely, from parents and staff.** |
| 14 | Does event attendance work offline? | Yes. |
| 15 | Whose tasks does a person see? | Their own — by what they actually do, not by job title. |
| 16 | Session notes | A **briefing written for the session**, by a senior coach or manager, for whoever is on the mat. Distinct from the existing after-the-lesson wrap-up. |
| 17 | Release shape | All in one. The offline work goes last, alone. |
| 18 | How does a coach chase families who haven't confirmed? | The way the app already does it — copy the numbers, open WhatsApp with the message ready. No integration. |
| 19 | Does a coach's belt grade appear on their profile? | No. Dropped — it is not modelled and would be an unverified claim shown as fact. |
| 20 | What does the automatic theme follow? | The phone's own schedule, as **D4 already decided**. Not an in-app clock. |
| 21 | Where does the floating accessibility button go? | Signed-out screens only; a row in the account tab when signed in. **D16** — it sat on top of the first tab. |
| 22 | The account screen's four statistics | Only the coached-classes count is real. The other three are not built — §9. |
| 23 | Is the account screen's look part of checkpoint 1? | **Yes.** The plan says the prototype's grouping is kept and only its contents replaced; a half-styled screen sitting across checkpoints is how it gets forgotten. |

Decisions I took myself, because they do not change what gets built:

- **Build order** is §10.
- **A student's school is not shown**, because it is not stored. The prototype's card has a
  `school` field and the real `Student` has none.
  **Corrected during C4:** an earlier version of this line said the card would show `grade`
  instead — the school *class* ("ד'2"). It cannot. `Student.grade` exists on the model but is
  on no staff-reachable response: `StudentDetailOut` has no such field, and the column is read
  only by the registration form that writes it and the health-declaration PDF. Showing it would
  need a backend schema change, which is not part of a screen checkpoint. **Neither a school nor
  a grade is rendered.** Left here rather than deleted, because a claim in a spec that turns out
  to be false is worth more as a correction than as a silent edit.
- **A coach's own role is displayed, not edited.** It is a role assignment a manager controls,
  and a self-service role change is a permission escalation wearing a profile form.
- **The existing belt-exam results screen stays reachable** from an event's attendance screen.
  Decision 5 defers a *new* screen; it does not ask to delete a working one, and deleting it
  would drop the only way to record a grading.
- **"Managers and senior coaches"** (decision 8) means `owner`, `manager` and `lead_coach`, and
  excludes `assistant_coach`. That is not a new rule — it is exactly who `PATCH /sessions`
  already admits. Inventing a second rule beside an identical existing one is how the two drift.
- **Briefings are one column on the existing notes table**, not a new table — §6.2.

---

## 2. Seven bugs found on the way, all pre-existing

None was known when this port was proposed. All three sit directly under it.

**2.1 — The at-risk alert never reaches a coach.** `app/services/comms/kinds.py` and
`app/services/comms/__init__.py` both state the alert "fires a notification to the group's
coaches and to managers". The worker that raises it, `app/workers/at_risk.py:206-220`, enqueues
exactly one notification, addressed to the guardian. So `AtRiskAlert.tsx` in the staff app —
built, tested and mounted — has rendered nothing since it shipped.

"Call the parent" is one of the three task types and the only one the app cannot derive on its
own, so **fixing the worker's recipients is part of this work.** A failing test comes first, and
it asserts *who* receives it — a count assertion would have passed throughout the bug.

**2.2 — The staff app's `announcements` menu entry is a dead link.** `NAV` points it at the path
`/announcements` and nothing routes it. Every sibling was corrected from a path to a hash for
exactly this reason; this one was missed. It falls through the service worker to `index.html`
and silently returns the coach home.

The parent app has `routes.reachable.test.ts`, which asserts every route `App.tsx` handles is
linked from somewhere else in the app. The staff app has no equivalent, which is why this
survived. The entry gets a real destination (§3) and **the staff app gets the missing test.**

**2.3 — "Coach substituted" is a dead switch.** Parents and staff both see a notification switch
called `coach_substituted`. Nothing in the system has ever produced a notification of that kind.
The dashboard's week calendar can already change a session's coach — `PATCH /sessions/{id}` with
`is_substitute: true` — and `_set_staff` in `app/services/schedule/service.py:892` notifies
nobody.

Decision 13 resolves this by **removing the switch**, not by filling it. §6.4 has the mechanics,
which are more delicate than they sound.


### Three more, found while building rather than before it

**2.4 — `StaffStudentCard` was mounted nowhere**, and it is the only implementation of moving
a student between groups — while the account screen told a lead coach that permission was *not*
locked for them. The app promised a capability with no screen behind it. Mounted at C4.

**2.5 — the reachability guard counted a mention in a comment as proof of use.**
`unreachable-screens.test.ts` blanked module paths and re-export lines before searching, but not
comments, so a component named only in prose passed. Fixed at C4, and it immediately found a
second orphan — `PaymentStrip` in the parent app, left behind when its replacement shipped.

**2.6 — the i18n parity script does not detect duplicate keys.** Two agents wrote
`he/schedule.ts` at once and produced twelve duplicated keys; `scripts/i18n-parity.mjs` reported
the file **clean**. Only TypeScript caught it, because a duplicate in an object literal is a
compile error. In a file the compiler is more forgiving about, a translation could be silently
shadowed — the last value wins and the first is discarded — with parity still green. **Not yet
fixed**; recorded here because the check exists precisely to catch this class of thing.

The collision itself was a scheduling error of mine: §10 says the i18n registries serialise, and I
ran two checkpoints that both needed that file in parallel.

**2.7 — seven backend tests were time bombs.** `tests/people/test_public.py`,
`test_registrations.py` and `test_students_router.py` hardcode `2026-09-06` as a Sunday, while the
code they exercise observes the calendar *forward from today*. They passed for as long as the real
date sat before that, and failed the moment it passed — during this session. None of the three used
`X-Dev-Now`, the seam §19.5 built so tests can pin time. Fixed by pinning the clock; no assertion
was changed, and the fix was proved by freezing the clock to 2050 and watching the pre-fix code
fail there.

---

## 3. The shell

Five tabs, no drawer. The account tab is where the drawer's contents go.

```
StaffShell                     apps/staff/src/features/shell/StaffShell.tsx
├── DevBar                     unchanged — §19.4 draws it above everything
├── NetworkStatus              unchanged — offline/queue state, mounted once
├── StaffAlerts                unchanged — the registerSlot container
└── #app-wrapper (max-w-md)    the prototype's phone column
    ├── <main>                 the active screen; bottom padding for the bar lives here
    └── StaffTabBar            five tabs, ported from the prototype's BottomNav
```

`@studio/ui`'s `AppShell` is no longer mounted by this app. **The dashboard keeps it.** Same move
the parent app made, same justification: the design has no drawer and no app-level header, and
every screen draws its own chrome.

| Tab | Hash | Was |
|---|---|---|
| לוח זמנים | `#/schedule` | the `schedule` tab and the `today` home route, merged |
| תלמידים | `#/students` | `students` tab — unchanged |
| טיימר | `#/timer` | **new** |
| משימות | `#/tasks` | **new** — carries the only badge |
| חשבון | `#/account` | **new** — absorbs the whole drawer |

The tasks badge counts open tasks and caps at 99+, matching the convention `@studio/ui`'s
`TabBar` set and the parent app already ported. The prototype caps nothing.

Two details of the bar that are easy to lose and must not be. **It clears the iPhone home
indicator** — `env(safe-area-inset-bottom)`, which the prototype handles and which both
`AppShell` and `ParentShell` already handle with the reasoning written down beside them; this is
an installable PWA and the bottom row of a bar sitting under the home bar is unreachable. And
**the bar turns dark when the timer tab is open**, following that screen's inversion. It is the
only tab whose selection changes chrome outside its own view.

### Where every current destination goes

Nothing is dropped. This table is the contract; checkpoint 1 is not done until every row is true
and `routes.reachable.test.ts` says so.

| Today | Goes to | Note |
|---|---|---|
| `/` (today) | **schedule tab** | The schedule tab *is* today; the tab was already active on the empty hash |
| `#/schedule`, `#/schedule/date` | **schedule tab** | Unchanged |
| `#/students`, `#/students/<id>` | **students tab** | Unchanged |
| `#/attendance/<id>` + `/summary`, `/handover`, `/trial` | **opened from a session** | Unchanged; already deep-link only |
| `#/events` | **gone as a screen** — events appear inline in the schedule list | Decision 4 |
| `#/events/<id>` (exam results) | **reachable from an event's attendance screen** | Kept until the owner writes their own |
| `#/events/<id>/roster` | **is** the event's attendance screen | Restyled to match the session one |
| `/announcements` | **account tab**, as a real screen | Fixes bug 2.2 |
| `#/cash`, `#/join-link`, `#/privacy`, `#/setup` (manager) | **account tab** | Manager-gated, unchanged. `#/privacy` was a hand-written link outside the nav mechanism; it becomes a proper row |
| `#/install` | **account tab**, plus the existing install nudge | Unchanged |
| Terms / privacy policy | **account tab**, and still pre-login from sign-in | Unchanged |
| Drawer: identity, coached classes | **account tab** — the profile card | The prototype draws this card |
| Drawer: notification preferences | **account tab** — the notifications group | Seven switches now, not eight — §6.4 |
| Drawer: calendar feed subscribe | **account tab** — the system group | |
| Drawer: permission boundaries | **account tab**, under the profile card | Non-managers only, as today |
| Drawer: **language** (עברית · English · Русский) | **account tab** — the system group | `AccountDrawerFooter` carries it today. **This row was missing from the first two drafts of this table** |
| Drawer: **theme** (בהיר · כהה · אוטומטי) | **account tab** — the system group | Same component. Also previously missing |
| Drawer: sign out, studio switcher | **account tab** footer | The prototype refuses to sign out; ours signs out |

Two screens have no predecessor: the **calendar** (`#/calendar`) and the **unavailability**
screen (`#/constraints`). Both are reachable from the schedule tab and the account tab.

---

## 4. The screens

### 4.1 Schedule tab — `#/schedule`

The coach's day: a header with the date and a calendar button, a seven-day strip, and a vertical
timeline of what is on.

**Much of this already exists.** `TodayScreen` already draws the seven-day strip (three days
either side), already filters to the signed-in coach by default while showing a manager the whole
club, and already handles cancelled sessions and the no-training-year case. **This checkpoint is
a restyle and an extension, not a rebuild** — a distinction worth stating, because it is a
smaller job than the prototype's 515 lines suggest.

**A correction worth stating.** The prototype's `ScheduleView` does not read the schedule it is
passed: all four cards are hardcoded Hebrew and the day strip changes nothing when tapped. It is
the visual reference, not the behavioural one.

The three states it draws map onto facts we already have:

| Prototype state | Ours, computed from |
|---|---|
| `pending_close` | the session has ended and `attendance_taken` is false |
| `active_now` | `starts_at <= now < ends_at` |
| `upcoming` | `starts_at > now` |

**The timeline dots, and a rule the prototype does not have.** A grey line runs down the day and
each session carries a dot pinned to its own card with its start time beneath. The dot does *not*
track the clock — there is no "now" line sliding down the page; each dot is coloured by its own
session's state. The prototype draws **four** colours for **three** states: red (ended, not
closed), green and pulsing (on now), then blue for one upcoming session and grey for another,
with nothing in the data distinguishing them. That is an artefact of hardcoded cards, not a
design. Ours makes it a rule: **blue is the next session up, grey is every one after it.** Four
colours, four meanings, and the coach's next class is findable at a glance.

**Events appear in this same list**, merged by start time and visually marked as events
(decision 4). **A session carrying a briefing shows that it has one** (§6.2).

**The card also carries who has answered.** The prototype's `15/18 אושרו` and `3 טרם אישרו` are
not invented — every roster row already carries `has_confirmation` (the parent said the child
*will* be there) and `has_absence_report` (the parent said they will not), and both are already
in the offline cache. So the counts cost nothing, and the card can say *three families have not
answered* on a screen a coach is already looking at. Chasing them is §4.9.

| Needs | Exists? |
|---|---|
| `GET /api/v1/sessions` | yes — already used here |
| `GET /api/v1/events` | yes |
| `GET /api/v1/training-years` | yes — separates "nothing today" from "no year set up" |
| `has_confirmation` / `has_absence_report` on a roster row | yes — already cached |

No new endpoints. The merge is client-side.

### 4.2 Students tab — `#/students`

Search, category chips, and a grouped list — alphabetical, or by attendance when the sort is
flipped. Tapping a student opens the detail sheet. Again largely a restyle: `StudentsSearch` and
`StudentCardScreen` exist.

| Needs | Exists? |
|---|---|
| `GET /api/v1/students?q=`, `/students/{id}`, `/students/{id}/attendance`, `/groups` | all yes |

The detail sheet shows belt, age, date of birth, medical notes, who may collect the child, recent
sessions, and the contact actions of §4.9 — all of which exist. **It does not show the school**:
the prototype has a `school` field, and the real `Student` has `grade`, which is the school
*class* rather than the school. The card shows the grade.

The prototype's attendance trend chart and its "add student" form are **not built** — §9.

### 4.3 Attendance screen — opened from a session or an event

Not a tab. The existing roster screen, restyled. This is the offline-critical screen.

Two write paths behind one look, because sessions and events are genuinely different records:

| Opened from | Reads | Writes |
|---|---|---|
| a session | `GET /sessions/{id}/attendance` (cache-first) | queued `attendance.mark` / `attendance.bulk` → `POST /attendance/batch` |
| an event | `GET /events/{id}/registrations` (cache-first) | queued `event.attendance` → `POST /events/{id}/attendance` |

**Event attendance works offline** (decision 14). The mechanics are §6.5, and they are the
riskiest change in this project, which is why they go last and alone.

The session's **briefing**, if it has one, is shown at the top of this screen — that is the
moment an assistant actually needs it.

From an event's attendance screen, a link to the existing exam-results screen, so recording a
grading survives.

### 4.4 Tasks tab — `#/tasks`

What needs dealing with. **Nothing is stored.** The list is rebuilt each time the tab opens.

Decision 15: **the list is personal, by what a person actually does, not by job title.** An owner
who teaches on Tuesdays sees the coach rows for their own sessions *and* the manager rows. An
owner who never teaches sees only the manager rows.

**Coach rows — for sessions this person is on:**

| Task | Source | Backend work |
|---|---|---|
| Close an open session | sessions that ended with `attendance_taken` false | none — already in the response |
| Missing or expired health form | health flags already on today's cached rosters | none — already cached, already a badge on a roster row |
| Call a parent (three absences) | `GET /notifications?kind=attendance.at_risk` | **the worker fix, bug 2.1** |

**Manager rows — for people who hold that responsibility:**

| Task | Source | Backend work |
|---|---|---|
| Cash waiting to be confirmed | `GET /payment-promises?status=pending` | none — exists, manager-only, already notifies managers |
| Health review pending | the `health.review_pending` / `health.trial_flagged` notifications | none — exist, already sent to managers |
| Coach unavailability needing cover | `GET /coach-constraints?status=pending` | new with §6.1 |

The first two coach rows and all three manager rows disappear on their own when the underlying
thing is done. That is the whole value of deriving them.

"Call a parent" cannot — the app has no way to know whether the coach phoned. That card carries
the tick box, which marks the underlying notification read via `POST /notifications/{id}/read`
(exists). An unticked alert stays until the student turns up and the worker stops raising it.

Filter chips work as drawn. **The birthday section does not ship** — §9.

### 4.5 Timer tab — `#/timer`

Preparation, work, rest, rounds, sets, a break between sets. A dark screen — the one place the
design deliberately inverts, and the tab bar follows it dark. Built-in presets ship in the
bundle; a coach's own are saved on their phone.

**The six built-in presets are domain content and are ported as they stand**, because they are
the part of this screen that took a judo coach to write rather than a designer: טאבטה קלאסי
(20/10), רנדורי (4 min / 1 min), שגרת חימום, סשן רנדורי, כוח מתפרץ (45/15), and אוצ'יקומי
(30/30). Their Hebrew names go into the i18n bundles like every other string.

**No backend, no model, no migration, no dashboard screen** (decision 2).

Storage is IndexedDB, not `localStorage`, so it sits with the offline machinery already here.
That is the one deliberate departure from the prototype's implementation.

**One thing the prototype does not have that we add: a screen wake lock.** A timer whose screen
sleeps mid-round is not a timer. `navigator.wakeLock` while running, released on pause and
unmount, silent fallback where unsupported.

The music player, the settings button and the account tab's duplicate sound toggle are **not
built** — §9.

### 4.6 Account tab — `#/account`

Everything that is not one of the four daily things: a profile card, grouped rows, sign out. The
prototype's grouping is kept because it is good; its contents are replaced with the real
destinations from §3.

The prototype has eight rows and five toggles that only raise a toast, and a sign-out button that
explicitly refuses to sign out. **Every row we draw goes somewhere real or is not drawn.**
`inert-buttons.test.ts` enforces exactly this. Its toggles do not map one-to-one onto the real
switches — one of them is the timer's own sound setting and another is a calendar-feed
subscription — so the group is rebuilt from what actually exists rather than matched row for row.

**The profile card is editable, in part.** `PATCH /me/profile` already exists and carries **no
role dependency** — it writes the caller's own person — so a coach can correct their own name,
phone and email through an endpoint built for guardians, with nothing added. Their **role** is
displayed read-only, and their **belt grade is not shown at all** (decision 19).

#### Language and theme

Both already exist, both are already mounted in this app, and **both were missing from the first
two drafts of §3's table** — which is exactly the kind of omission that leaves a setting stranded
when a drawer is deleted. They live in `AccountDrawerFooter` in `@studio/ui`, which the staff
drawer renders today and which carries three things: language, theme, and sign out.

**Language** — עברית · English · Русский, the three locales the i18n package defines, drawn as
native radios labelled in their own language (`ENDONYM`), with arrow-key navigation and a roving
tab stop. Choosing one calls `setLocale`, and `useDocumentLocale` updates the document so the
page's `lang` follows. The staff app already threads `locale` through every screen, so nothing
changes but where the control sits.

**Theme** — בהיר · כהה · אוטומטי, via the existing `ThemeControl` primitive.
`ThemePreference = 'light' | 'dark' | 'system'`, stored under `studio.theme`, resolved by
`resolveTheme`. **Every switch carries a visible state label** — artboard `2e`'s rule, and the
Arbox teardown's specific complaint that a reviewer could not tell whether a toggle was on.

**"Automatic" means the phone's own schedule** (decision 20, and D4 before it). iOS and Android
both already switch at sunset and sunrise, or at hours their owner chose, so following the phone
*is* the time-based behaviour — without duplicating a scheduler someone has already configured,
and without overriding a coach who deliberately runs their phone dark all day. An in-app clock
would fight that person every morning.

Neither control needs a network, so both work on a mat with no signal.

The notification toggles map onto the real switches — `GET`/`PATCH /notification-preferences` —
of which there are now **seven**, not eight (§6.4).

### 4.7 Calendar — `#/calendar`

Decision 7: built, because it shows staff their **future** sessions and events — which is the one
thing neither the day strip nor the offline cache can do.

A month grid: a count on days carrying sessions or events, a marker on days a coach is
unavailable, and the selected day's agenda underneath. Reachable from the schedule tab's header
and from the account tab.

**The filter chips become a group filter.** The prototype draws five — all, today, this week,
weekends, squads — and only two do anything: `today` and `squads`, the latter by a hardcoded
`isTeam` flag. `week` and `weekend` are dead chips that highlight and filter nothing. The real
distinction underneath is *which group is training*, which the system knows, so the row becomes a
group filter with an "all" chip. That keeps the one chip that carried meaning — a coach wanting
just the competition squad — and drops the two that never worked.

**Honest about offline.** The cache holds today and tomorrow, and the server clamps the bootstrap
window to the same two days. A month view is therefore a **network screen**, and it says so when
there is no signal rather than rendering an empty month that looks like an empty schedule. That
is the correct trade: looking ahead is inherently an online act.

**Editing** (decisions 8, 9): tapping a session opens a sheet offering **change the coach, cancel
it, move it**. Available to `owner`, `manager` and `lead_coach`; an `assistant_coach` gets the
same sheet read-only. Every one of those three actions is an existing call —
`PATCH /sessions/{id}` for coach and move, `POST /sessions/{id}/cancel` for cancel — and the
dashboard's `SessionPopover` already performs all three. **We are adding a phone surface for
existing behaviour, not new behaviour.**

Moving a session on a phone is the awkward one. It is a date-and-time form in the sheet, not a
drag: HTML5 drag-and-drop does not fire on touch and is unusable with a screen reader, which is
the same reasoning D13 recorded for the dashboard.

| Needs | Exists? |
|---|---|
| `GET /sessions?from&to`, `GET /events` | yes |
| `PATCH /sessions/{id}`, `POST /sessions/{id}/cancel` | yes |
| `GET /coach-constraints?mine=true` | **new — §6.1** |

### 4.8 Unavailability — `#/constraints`

A coach files dates they cannot work: single day or range; all day or a time window; a reason from
seven, with a note; and a suggested substitute. Below, their own history, each withdrawable.

Specified in §6.1.

### 4.9 Contacting a family

**This was missing from the first draft of this document.** It is not one screen — it is a
pattern the prototype uses in three places, and reading the components rather than a summary of
them is what surfaced it.

| Where | What the prototype offers |
|---|---|
| A session card | "3 haven't confirmed" → a drawer listing them, with one button to message all and one per family |
| The student card | Call or WhatsApp the student; call or WhatsApp each parent; two ready-written messages |
| A task card | Call the parent; WhatsApp them; SMS a health-form reminder |

**This is already the product's settled position, not a new idea.** §5.11 chose it deliberately:
`app/services/comms/notifications.py` says in as many words that the spec "permits no email, no
SMS and no WhatsApp", and that **the names and numbers are the feature** — the club has a
WhatsApp group already, so the app hands over the numbers and a pre-composed message instead of
buying an integration. "Same outcome as automation, half a day of work, zero risk."

Two helpers already exist in the dashboard and are reused rather than rewritten:
`whatsappShareUrl(title, body)` and `phoneList(...)`, the latter being §5.11's `העתק מספרים`,
newline-separated, **dropping families with no number rather than pasting a blank line**. They
move to a shared package so staff and dashboard cannot drift.

Three rules this carries, each already established here:

1. **A missing number gets a sentence, not a dead link.** `AtRiskAlert` set this — "a link that
   does nothing is worse than a sentence explaining why."
2. **Nothing claims delivery.** Opening WhatsApp is not proof a message was sent; the coach may
   never press send. The prototype shows "reminder sent to everyone!" the instant the link opens,
   which is untrue. Ours says the message is *ready*, and records nothing, because nothing is
   known.
3. **No new exposure.** Every number involved is already on the roster the coach downloaded.
   Nothing here reveals a contact detail a coach could not already read.

**Decision 18** settles the session-card reminder as this same mechanism rather than an in-app
notification: it works for an assistant coach, who is not permitted to publish to families, and
it reaches a family who never installed the app.

---

## 5. What the dashboard gains

Decision 11. This is not a staff-app screen, and it is why the last checkpoints are dashboard
work.

**An alert** in the existing alert centre when a constraint is filed. The dashboard already has
that container and the mechanism for filling it.

**A resolution popup** opened from the alert, carrying the constraint (who, when, why, their
note) and, for each session it affects, three ways out:

1. **Replace the coach** — a picker of **who is free**: staff not already teaching at that hour
   and without unavailability of their own covering it (decision 12). No ranking, no preferring
   the group's usual coach; the full staff list stays reachable underneath, because sometimes you
   ask the busy person anyway.
2. **Cancel the session** — the existing cancel, which already notifies guardians.
3. **Move the session** — the existing patch.

Then **approve or refuse** the constraint as a whole (decision 10), with the coach told either
way.

**Refuse rather than half-do.** If a chosen substitute is unavailable in that window or is not
staff at this studio, the action is refused with a 422 naming the problem. Session changes are
applied one at a time and each is already atomic; the constraint's own status changes once, at
the end.

---

## 6. New backend

### 6.1 Coach unavailability

`app/models/schedule.py` — `CoachConstraint`, inheriting `TenantMixin`.

| Column | Type | Note |
|---|---|---|
| `id`, `studio_id` | uuid | `UUIDPrimaryKey`, `TenantMixin` |
| `person_id` | uuid FK person | the coach |
| `starts_at`, `ends_at` | timestamptz | UTC. All-day is midnight to midnight in the studio's zone |
| `all_day` | bool | kept explicitly, so a genuine 00:00–23:59 window stays distinguishable |
| `reason` | str(20) | `reserve_duty · competition · studies · illness · vacation · family · other` |
| `note` | text, nullable | required by the form when the reason is `other` |
| `status` | str(10) | `pending · approved · refused · withdrawn` |
| `substitute_person_id` | uuid FK person, nullable | who covers |
| `decided_by_person_id`, `decided_at` | uuid FK person / timestamptz, nullable | who resolved it, and when |

Times, not dates, because the form supports a window and the schedule is in times. The reason is
a code; the client renders the label, the same rule the inbox actions already follow. The emoji
the prototype stores is a client concern and is not persisted.

| Method | Path | Who | What |
|---|---|---|---|
| `GET` | `/coach-constraints?mine=true` | any staff | a coach's own |
| `GET` | `/coach-constraints?status=pending` | manager, owner | the queue behind the alert |
| `POST` | `/coach-constraints` | any staff | file one; lands `pending` |
| `DELETE` | `/coach-constraints/{id}` | the filer | withdraw own → `withdrawn`, not a row deletion |
| `POST` | `/coach-constraints/{id}/approve` | manager, owner | optionally carries `substitute_person_id` |
| `POST` | `/coach-constraints/{id}/refuse` | manager, owner | carries a reason |
| `GET` | `/staff/available?from&to` | manager, owner | who is free in a window — decision 12 |

A coach sees only their own. No screen in the design shows a colleague's, and the narrow rule is
easy to widen later.

The coach is notified of the outcome. That notification's kind gets a **prefix of its own**, not
`coach.` — because §6.4 removes the group that prefix mapped to. Under the existing rules an
unmapped prefix is *ungoverned*, which means it always sends. For "your leave request was
answered" that is the right behaviour and it needs no new switch.

### 6.2 Session briefings

Decision 16. `session_note` gains one column:

| Column | Type | Note |
|---|---|---|
| `kind` | str(10), not null, default `summary` | `plan` \| `summary` |

Existing rows are summaries, which is what they are. One column, one backfill, no new table.

- **Writing a `plan`** is `owner`, `manager`, `lead_coach` — decision 16 says a senior coach or
  manager writes it. Writing a `summary` stays any staff, as today.
- **Reading** stays any staff, as today. That is what makes leaving one for your assistant work.
- Plans and summaries are **shown separately** — the plan at the top of the attendance screen
  before the lesson, the summary in the existing wrap-up. Mixing them would put "work on grips
  today" next to "Daniel hurt his shoulder" with nothing distinguishing intent from event.
- The plan **comes down in the bootstrap with its session**, so an assistant reads it on the mat
  with no signal. One nullable string on the cached session.

### 6.3 The at-risk worker

Bug 2.1. `app/workers/at_risk.py` must notify the group's coaches and the studio's managers, as
its own documentation and §5.14 both say it does. The guardian notification stays. Failing test
first, asserting recipients.

### 6.4 Removing the coach-substituted switch

Decision 13, and the most delicate small change in this document — because the switch is not just
a line of UI.

1. `PREFERENCE_GROUPS` in `app/models/comms.py` loses `coach_substituted`: eight groups become
   seven.
2. `_GROUP_BY_PREFIX` in `app/services/comms/kinds.py` loses `"coach": "coach_substituted"`.
3. **A database rule names the eight groups explicitly** — a `CheckConstraint` on
   `notification_preference.kind_group`. It must be dropped and recreated with seven.
4. **Rows exist.** Nothing ever *sent* this kind, but the settings screen has always *rendered*
   the switch, and toggling it writes a row. Those rows violate the new rule, so the migration
   **deletes them before recreating the constraint**. A migration that recreates the constraint
   first fails on live data.
5. The Hebrew, English and Russian strings go from all three `comms.ts` bundles.
6. Both settings screens — parent and staff — render seven switches. Any test asserting eight is
   updated in the same commit.

No notification is added anywhere. Changing a session's coach continues to tell nobody, which is
now a decision rather than an oversight.

### 6.5 Event attendance offline

Decision 14, and the piece with the least room for error: a mistake here loses attendance rather
than merely showing something wrong.

**The cheap way in, and the reason for it.** An event already has everything a cached session has
— a start, an end, a title, a location and a list of children. So events ride in the **existing**
`sessions` and `rosters` tables with a discriminator, rather than getting tables of their own.
That keeps the eviction rule, the two-day window, the storage port and the `pending_ops` exemption
exactly as they are — and `evict()` "can only touch what it explicitly names", which is precisely
the property that new table names would put at risk.

1. `CachedSession` gains `kind: 'session' | 'event'` and the nullable `plan` from §6.2.
2. `GET /sync/bootstrap` returns events and their registrations alongside sessions, in the same
   two-day window and the same shapes.
3. `PendingOpKind` gains `event.attendance`. The flusher groups by session as it does now and
   routes an event group to `POST /events/{id}/attendance`.
4. Idempotency is `client_mark_id`, unchanged.
5. Conflicts — a cancelled event, a child no longer registered — surface as the existing conflict
   cards. No new card shape.

`note.student` is a declared queue kind with zero call sites anywhere in the repo. It is **not**
removed as part of this work; noted here only so the next reader does not mistake it for
something this change added.

---

## 7. The offline picture, stated plainly

Worth one table, because "the staff app is the offline one" is doing a lot of work in this
document and it is not true of every screen.

| Screen | Without signal |
|---|---|
| Schedule tab, today and tomorrow | **Does NOT work — corrected 2026-09-06, see below** |
| Attendance, session — today and tomorrow | **Works.** The whole point |
| Attendance, event — today and tomorrow | **Works**, after §6.5 |
| Session briefing | **Works** — rides with its session |
| Tasks: unclosed sessions | **Does not** — it derives from the session list, which is a live fetch |
| Tasks: health forms | Derives from cached rosters, but needs the session list to know which rosters |
| Tasks: call a parent | Needs signal — it reads the notification inbox |
| Timer | **Works.** Entirely local |
| Language and theme | **Work.** Neither touches the network |
| Students search, student card | Needs signal |
| Schedule tab, beyond tomorrow | Needs signal |
| Calendar | Needs signal, and says so |
| Filing unavailability | Needs signal |


### A correction, and the defect underneath it

The two rows above said "works" in the first three drafts of this document. **They were wrong,
and the reason is worth more than the correction.**

`TodayScreen` calls `client.listSessions()` — a live network fetch. Only the *rosters* are read
from IndexedDB. The service worker precaches the app shell and the fonts and does not cache
`/api` routes, which is correct; API responses are what the offline store is for.

But the offline store **already holds the sessions.** `GET /sync/bootstrap` writes today's and
tomorrow's into it on first launch and again on every `visibilitychange`, and
`packages/core/src/offline/cache.ts` exports `cachedSessions()` to read them back.

**Nothing calls `cachedSessions`.** Not one screen in any of the three apps. `readSession` uses
it internally for a single session, which is how the roster screen works on a mat; the *list* has
no reader.

So a coach who opens this app with no signal sees a load failure on the one screen the whole
offline apparatus exists to serve, while the data sits in IndexedDB a function call away. Marking
a register still works — `RosterScreen` reads the cache and the queue flushes on reconnect — but
only for a session already open. You cannot find your day.

This is the same family as §2's three bugs: something built, tested, exported and connected to
nothing. It is not a regression from this redesign; it predates it. It is fixed as part of C2,
because C2 owns that screen and because a spec that asserted this worked is worse than one that
never mentioned it.

---

## 8. The look

Decision 3: the staff app takes the prototype's cool blue-grey palette.

**This amends D14**, which says inward tools wear the neutral working palette on the grounds that
a tool used for hours should recede. Recorded as an amendment in `docs/design/decisions.md`, not
silently overwritten, because D14 gives reasons and a later reader deserves to see they were
overruled rather than forgotten.

Two things the amendment does not touch:

- **The semantic band stays.** D2 makes `debt · paid · pending · cancelled · danger · focus`
  non-overridable and `tokens.audit.test.ts` fails if a surface block re-values one. Red still
  means a family owes money.
- **The dashboard is unmoved.** D14 still governs it. The staff app and the dashboard will look
  different from each other; that is the consequence of this decision and it is deliberate.

**The staff app needs a surface of its own, and this is the part decision 3 quietly costs.**
Today there are two: `outward` (the landing page and the parent app) and the default `inward`,
worn by the staff app *and* the dashboard together. Giving staff a cool palette while the
dashboard stays warm means one name can no longer serve both — so a third surface is added and
the staff app's `index.html` carries it, exactly as the parent app's carries `outward`. The
dashboard, carrying nothing, is untouched.

That has one consequence beyond colour. `GROUND_COLOR` in `theme.ts` records the `--ground` value
per surface per theme, and it is what the **PWA manifest and the status bar of the installed app**
read — so a third surface means two more entries there, or an installed staff app whose splash
screen and status bar stay the old warm colour while the app inside it is blue. `tokens.audit.
test.ts` asserts those values against the stylesheet's own declarations, which is what stops them
drifting; it goes from auditing four palettes to six.

**The dark palette has to be authored, because the prototype does not have one.** Its only dark
surface is the timer screen — `#090d16` for the ground, `#111827` for cards, `#182232` for the
raised tiles. That is a near-black navy, it sits with the cool light palette, and the owner has
already seen it on screen. **The staff dark palette is derived from those values** rather than
invented, so the two dark surfaces in the app agree with each other.

`tokens.audit.test.ts` gains the new palette, light and dark. The prototype's greys are
unmeasured. **Any value failing 4.5:1 is corrected, not shipped** — exactly as D8 and D12 did for
the original audit. That is not taste; there is a WCAG target and a lint rule behind it.

**Tailwind.** The staff app has none today; the prototype is Tailwind v4 throughout. The parent
app already solved this and its solution is copied rather than reinvented: Tailwind as `theme`
and `utilities` layers only — never the wholesale import, whose preflight resets would silently
restyle every screen still drawn by `@studio/ui` primitives — with preflight replicated under a
`.tw-scope` wrapper and an isolation test in both directions. That test is not optional: an
unlayered rule crossing this boundary reached production once on the parent app and repainted a
whole tab bar, and no layer ordering can fix that.

**Icons** are `lucide-react`, which the parent app already depends on. No new dependency.

**RTL.** The prototype sets `dir="rtl"` once and then uses physical Tailwind classes with a
handful of hand-placed `text-left`/`text-right`. We do not port that. D10 bans physical
properties and two separate mechanisms enforce it. Logical properties only — the same layout,
expressed in a way that does not break.

---

## 9. Deliberately not built

| Not built | Why |
|---|---|
| **The attendance trend chart** | Seven months of invented numbers. Nothing computes a club-wide monthly trend, and the endpoint that would is reports work, not a staff screen |
| **The birthday section** | Hand-authored and disconnected from any real date of birth — one entry has a name and an id belonging to two different children |
| **The music player** | Entirely simulated: no integration, no authorisation, no audio. Building it means a Spotify or Apple partnership |
| **The "add student" form** | Invents nine fields it never asks for, including a fake date of birth. A coach cannot create a student; a manager can, on a screen that validates |
| **The bout-board button** | An `alert()`. No underlying concept exists |
| **The timer's settings button** | An `alert()`. Everything it would hold is already on screen |
| **A coach seeing another coach's unavailability** | No screen shows it. Narrow is the safe default and is easy to widen |
| **Studio-wide timer presets** | Decision 2. Recorded so the door stays open |
| **A new belt-exam screen** | Decision 5 — the owner is writing it. The existing one stays reachable |
| **Ranking suggested substitutes** | Decision 12 — who's free, unranked |
| **Any notification when a coach changes** | Decision 13. Now a decision, not an oversight |
| **The coach's belt grade on the profile card** | Decision 19. Not modelled, and an unverified claim shown as fact |
| **A student's school** | Not stored. The card shows `grade` — the school class — which is the fact that exists |
| **The club insurance row** | The account tab draws a row for personal-accident insurance. No such concept exists anywhere in the system |
| **Three of the account screen's four statistics** | Average attendance is a report nothing computes; mats are not a concept anywhere in the system; active-students is a club-wide count a coach is not scoped to. The classes-coached tile is real and is kept |
| **The coach's rank badge on the profile card** | Decision 19, again — the amber badge in the design is the belt grade |
| **A toast claiming a WhatsApp message was sent** | §4.9. Opening WhatsApp is not sending. The prototype says "sent to everyone!" the instant the link opens |

---

## 10. How this gets built, and in what order

### Who does what

**Opus 5 manages. Sonnet 5 writes the code.** This was the brief's instruction and it is recorded
here because it shapes the checkpoints rather than merely describing them.

The manager investigates, decides, puts questions to the owner, reviews every diff, and **owns
every claim made to the owner**. It does not write feature code. Sonnet 5 is dispatched one agent
per bounded unit of work, and each dispatch carries four things: the files to read, the exact
acceptance criteria, the commands to run, and **what not to touch** — an agent that discovers
scope is an agent that widens it.

Four rules, each of which exists because its opposite is slower:

- **A subagent gets a spec, not a question.** If one comes back asking what something should do,
  that is the manager's failure: answer it and re-dispatch. Decisions are never delegated — which
  is why the twenty in §1 were settled with the owner before any of this was written.
- **One screen or one seam per agent.** Never "port the app", never "fix the tests".
- **Parallelise only what cannot collide.** Two agents editing the shell silently lose each
  other's work. Anything touching `StaffShell`, the route table, the i18n registries or
  `alembic/versions/**` runs alone.
- **The manager verifies; the agent reports.** "All tests pass" is a claim, not a result. Every
  command is re-run by the manager before its outcome is repeated to the owner. This is the rule
  the repo's own verification notes were written after breaking.

Backend work — models, migrations, endpoints — carries more risk than porting a screen, so it
gets a tighter spec and the manager reads the diff line by line. That covers checkpoints 5, 6, 7, 10,
12 and 13.

**This is already how the investigation ran.** Three Sonnet agents read the prototype, the current
staff app and the backend in parallel; the manager read the decisive files directly — the
prototype's types, its task and constraint data, the notification kinds, the session model, the
dashboard's existing coach picker — and merged, cross-checked and corrected their findings. Two
of the three bugs in §2 came out of that direct reading, not the summaries.

### What actually serialises

Worth being exact, because it is not the collision rules. **The approval loop is what makes the
thirteen checkpoints sequential** — each one stops for the owner's yes, so no two are ever in
flight. The collision rules govern parallelism *inside* one checkpoint: a screen, its tests and
its strings can be split across agents; the shell cannot.

Two consequences for the shared registries, settled now rather than discovered later:

- **Two new i18n namespaces** — `timer` and `tasks` — are genuinely new verticals and get their
  own files in all three locales. Coach unavailability is schedule-adjacent and goes in
  `schedule`; nothing else needs a new namespace. `packages/i18n/index.ts` and `types.ts` are the
  shared registries a lane never edits, so **both namespaces are added in checkpoint 1's commit**,
  which already serialises. One edit, once.
- **One Alembic revision**, in checkpoint 5, carrying the unavailability table,
  the briefing column and the removal of the coach-substituted switch. `main` owns
  `alembic/versions/**` and a wave gets one revision.

### The order

Thirteen checkpoints. Each is one screen or one seam. After each: the manager reviews the diff,
screenshots the result beside the prototype into `docs/screenshots/staff-checkpoints/<screen>/`,
and **stops and waits for a yes.** No batching — the value of the loop is that a misread is caught
on screen one.

| # | Checkpoint | Note |
|---|---|---|
| 1 | Shell, tab bar, Tailwind isolation, the third surface and its two palettes, account tab — language and theme included | The account tab is where the drawer goes, so nothing is unreachable at any point. Fixes bug 2.2, adds the missing reachability test. The palettes land here because every later checkpoint is drawn on them |
| 2 | Schedule tab: events merged in, who has confirmed, and the contact actions of §4.9 | Largely a restyle of `TodayScreen`. The contact component is built here because the session reminder is its first use, and checkpoints 4 and 8 then reuse it |
| 3 | Attendance screen restyled, session and event | Online only at this stage. The queue does not change yet |
| 4 | Students tab and student detail | Largely a restyle. Reuses §4.9's contact actions |
| 5 | **The schema contract — one Alembic revision** | The unavailability table (§6.1), the briefing column (§6.2), and the removal of the coach-substituted switch with its check constraint and its orphaned rows (§6.4). Nothing to screenshot; reported, not shown |
| 6 | Session briefings | Write rule and the two places it shows. Uses 5's column |
| 7 | At-risk worker fix (bug 2.1) | Failing test first, asserting recipients. Must precede tasks |
| 8 | Tasks tab, coach and manager rows | Depends on 7 |
| 9 | Timer tab | Self-contained. Can slip without blocking anything |
| 10 | Unavailability: endpoints and the coach's screen | Uses 5's table |
| 11 | Calendar, with change-coach / cancel / move | Needs 10's read endpoint |
| 12 | Dashboard: the alert, the resolution popup, approve and refuse | Dashboard work, not staff |
| 13 | **Event attendance offline** | Decision 17 — last, and alone |

**Why the schema lands at 5 rather than beside the screens that use it.** Two separate
checkpoints need a column and a table, and `main` owns `alembic/versions/**` with one revision per
wave — so either they share a revision or the rule breaks. They share it, landed early as this
repo's own contract-commit pattern already prescribes, and the screens are built on top of a
schema that is already in. An earlier draft of this document put the migration inside checkpoint 9
and would have needed a second revision for briefings; that is the sort of thing a build order is
supposed to catch before it happens rather than during.

Checkpoints 1, 5, 12 and 13 touch the i18n registries, `alembic/versions/**`, the dashboard, or
the sync protocol. Those serialise — nothing runs beside them.

---

## 11. The guards this port must not break

- **`unreachable-screens.test.ts`** — every barrel-exported component must be referenced. §3's
  table is what keeps this true.
- **`inert-buttons.test.ts`** — every button gets a real handler, href or submit type. The
  prototype's twelve toast-only rows are why this is called out.
- **`routes.reachable.test.ts`** — parent has it, staff does not, and that is why bug 2.2 shipped.
  **Added for staff in checkpoint 1.**
- **`tokens.audit.test.ts`** — gains the new palette, light and dark; still fails if the semantic
  band is re-valued.
- **`permissionBoundaries.test.tsx`** — one test per role per surface. The manager-only rows
  moving into the account tab must keep every one passing, and the calendar's edit sheet adds
  `assistant_coach` cases.
- **`tailwind.isolation.test.ts`** — new for staff, both directions, copied from parent.
- **The offline suite** — `offlineVisible.test.tsx`, `cache.test.ts` (which asserts the two-day
  window), and the queue tests. Checkpoints 3 and 13 must leave every one of them green.

Every claim of green in this port is one I run myself before repeating it.
