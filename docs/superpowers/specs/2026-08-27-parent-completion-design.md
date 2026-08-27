# Parent app — functional completion spec

**Written:** 2026-08-27
**Surface:** `web/apps/parent/` · 390×844 · Hebrew RTL · installable PWA (§6.5)

## The documents around this one

| Document | Says |
|---|---|
| [`docs/design/specs/`](../../design/specs/README.md) — 54 files, one per artboard | **What a screen should be.** Regions, states (*including empty, loading and error*), token roles, which of the 18 primitives each part is, and the real i18n key for every string. Open the artboard's file before building that screen. |
| [`docs/design/audit/parent.md`](../../design/audit/parent.md) | **What shipped on this surface**, screen by screen, measured in headless Chromium at 390×844. |
| [`docs/design/audit/README.md`](../../design/audit/README.md) | The cross-surface summary, and **three traps for whoever re-runs the capture**. Read those traps — they explain several of this spec's corrections. |
| [`docs/design/decisions.md`](../../design/decisions.md) | The **D-numbered design decisions** — D2's status tokens, D6's Cyrillic, D7's belt ring, D9's reductions, D10's logical CSS, D11's declaration form. |
| [`docs/superpowers/specs/2026-08-27-dashboard-completion-design.md`](2026-08-27-dashboard-completion-design.md) | The dashboard's functional spec. **P8 shares a primitive with its F1a** — build it once. |
| [`2026-08-27-landing-completion-design.md`](2026-08-27-landing-completion-design.md) | The public landing page at `/t/<slug>`. **It owns everything about that page's appearance** — P4 keeps only the shell-level 401 fix and the `13b` wiring. |

**Numbering.** Workstreams here are `P0`–`P12` — **P for parent**. The dashboard spec uses
`F0`–`F13`. A bare `D2`, `D7`, `D9.1`, `D10` or `D11` below is the repo's own design
decision, never a workstream. The schemes are unrelated and would otherwise collide.

## What this document is

The parent app is **the healthiest surface in the product** and this spec should not be read
as a rebuke of it. Home, payments and the account drawer meet or exceed their mockups, and
there is **not one inert control in the entire app** — the dashboard has ten.

What it has instead is work that was finished and never connected. Seven screens are built,
tested, and rendered by nothing. A container waits for four sections that four different
lanes each left for someone else. A calendar tells a parent their child's attendance is
coming later, while the endpoint that would fill it has been shipping for a wave. The gap
here is not craft; it is the last inch of wiring.

Every claim below was verified against the working tree on 2026-08-27 and carries a
`file:line`. **Verify before you build** — see P0.

## How to verify your work

Python tooling lives in `.venv` (Python 3.14). Always use the `.venv/bin/` prefix; a bare
`python3` or `pytest` resolves to an old 3.8 interpreter earlier on PATH.

```
./scripts/dev-db.sh up             # database tests FAIL rather than skip without this
.venv/bin/pytest -q                # backend
cd web && npx vitest run <file> --reporter=dot   # one frontend file
npm run typecheck && .venv/bin/mypy app
.venv/bin/ruff check --fix app && .venv/bin/ruff format app && npm run lint
./scripts/lane-check.sh <vertical>
```

Verticals: `attendance` `belts` `billing` `comms` `core` `events` `health` `people`
`privacy` `reports` `schedule` `structure`.

## Ground rules that bite

Read `CLAUDE.md` first. The ones that matter most on *this* surface:

1. **Health declarations are personal data about minors. Never log their contents, and never
   render them anywhere a coach or manager could read them.** Per **D11** the form is a
   structured question set with a finger signature — not a signed PDF — and the screen must
   say the bundled template is a starting point, **not a compliance artefact**.
2. **This app queues nothing.** §10.2 gives the parent app a **read-only** offline cache of
   upcoming lessons; only the staff app queues writes.
   [`main.tsx:6`](../../../web/apps/parent/src/main.tsx#L6) says so explicitly, and
   `AbsenceScreen` is *"the one screen in the product that refuses to work offline, on
   purpose."* Do not add an offline queue here.
3. **Money is agorot, integers, never floats.** Timestamps stored UTC, rendered Asia/Jerusalem.
4. **No inlined strings.** `web/packages/i18n/he/<namespace>.ts`, mirrored in `en/` and `ru/`.
   Namespaces used here: `billing` `comms` `common` `events` `health` `people` `schedule`.
   **Never edit `web/packages/i18n/index.ts`.** Per **D6**, Rubik covers base Cyrillic — do
   not add a font for Russian.
5. **Logical CSS only** (**D10**). This is the one screen a stranger sees first, in both
   directions.
6. **Never the brand colour in a status position** (**D2**). Use the semantic tokens —
   `debt` / `paid` / `pending` / `cancelled`.

---

## P0 — Re-verify before you build

**This is the first task and it is not optional.** Four of the audit's findings were already
overtaken by code when this spec was written. They are listed here not to discredit it — the
audit is the best map of this surface that exists — but because the same drift will have
continued, and a session that builds from a stale map builds the wrong thing.

**1. The three "404 endpoints" now exist.** The audit's cross-cutting item 3 says the app
takes a 404 on `/me/standing-order-links`, `/me/payment-promises` and `/me/prepay-terms`.
All three ship: [`billing.py:700`](../../../app/routers/billing.py#L700),
[`billing.py:752`](../../../app/routers/billing.py#L752),
[`payment_promises.py:100`](../../../app/routers/payment_promises.py#L100) — the W8 merge
landed them. `PaymentsSection.tsx` reads all three, at lines 162, 181 and 187. What remains
is narrower and is P8's silent-degradation item: `prepay-terms` *"zeroes when the read
fails"*, so a failed read renders as a real zero.

**2. Home does not drop the health warning — it delegates it.** The audit's home finding 1
asks for `1a`'s combined alert line back.
[`ParentHome.tsx:211`](../../../web/apps/parent/src/features/home/ParentHome.tsx#L211) says
why it is gone: *"The health card is the §6.1 gate's job now — a family who owes a
declaration never reaches this screen."* `HealthGate` was mounted on 2026-08-27 and blocks on
any status other than `signed`
([`HealthGate.tsx:47`](../../../web/apps/parent/src/features/health/HealthGate.tsx#L47)).
Restoring the warning as drawn would be building a line that cannot render. **The real
question is P11's**, and it is a different one.

**3. `#/directions` is built and routed.** `DirectionsScreen.tsx` exists and `App.tsx:182`
routes it. The old dead-link holdback is closed.

**4. §5.4b is implemented, and its own spec still says it is not.**
`docs/onboarding-link-spec.md` opens with *"Nothing here is implemented."* It is:
`app/routers/onboarding.py` carries five routes, and
[`JoinFlow.tsx`](../../../web/apps/parent/src/features/onboarding/JoinFlow.tsx) is 313 lines,
routed at `App.tsx:218`. **Fix that document's header as part of P0** — a spec that
mis-states its own status is worse than no spec.

**Also re-read the audit README's three capture traps.** They matter here: seeded data was
lost three times mid-run, and a second `buildScenario` closes the first training year and
empties the student screens. Several "SHELL" measurements on this surface are consistent with
a screen rendering its **empty state** rather than being unbuilt — P4 is the worked example.

**Done when:** every claim in this file and in the audit has been re-checked against the
working tree, `docs/onboarding-link-spec.md`'s header is corrected, and anything that no
longer holds — or that you could not reproduce — is recorded in P12's log.

---

## P1 — Seven screens that nothing renders

**Evidence.** Each is referenced **only** by its feature's barrel `index.ts` — verified
individually, one referencing file each, and that file is the barrel:

| File | Artboard | Where it belongs |
|---|---|---|
| [`features/absence/AbsenceScreen.tsx`](../../../web/apps/parent/src/features/absence/AbsenceScreen.tsx) | `12a` | A route, plus entry from `#/` and `#/calendar` |
| [`features/people/FirstRegistration.tsx`](../../../web/apps/parent/src/features/people/FirstRegistration.tsx) | `12j` | The invite / onboarding-link flow |
| [`features/billing/PaymentHistoryScreen.tsx`](../../../web/apps/parent/src/features/billing/PaymentHistoryScreen.tsx) | `12f` | Below `#/payments` |
| [`features/billing/PaymentCompleteScreen.tsx`](../../../web/apps/parent/src/features/billing/PaymentCompleteScreen.tsx) | — | The uPay return leg (§5.10) |
| [`features/billing/PaymentStrip.tsx`](../../../web/apps/parent/src/features/billing/PaymentStrip.tsx) | — | Payment summary strip |
| [`features/comms/CalendarSync.tsx`](../../../web/apps/parent/src/features/comms/CalendarSync.tsx) | — | Calendar subscription |
| [`features/comms/EventCalendarButtons.tsx`](../../../web/apps/parent/src/features/comms/EventCalendarButtons.tsx) | `13b` | `הוספה ליומן` |

**`AbsenceScreen` first, and it is not a close call.** §5.14's *"הודיעו מראש"* is a v1 rule.
The staff roster already consumes the state, the dashboard counts it, `POST /absence-reports`
and `DELETE /absence-reports/{session_id}/{student_id}` both ship
([`attendance.py:197`](../../../app/routers/attendance.py#L197) and
[`:231`](../../../app/routers/attendance.py#L231)), and the screen's client is **already
wired to both** (`features/absence/client.ts:85` and `:109`). Every layer of this feature
exists except a line of routing — and so **nothing in the product can produce an absence
report**, which is the state everything downstream is built to read.

It is also not a stub. Its header calls it *"the one screen in the product that refuses to
work offline, on purpose"*, it models all four of §10.1's network states, and it disables
rather than queues (*"a queued pre-report is a pre-report that syncs after the lesson"*).
Preserve that behaviour exactly when you mount it.

**Build.** Route each screen and give it a real entry point — a route with no way to reach it
is the same defect one level up. `PaymentCompleteScreen` belongs on the uPay return leg;
check how the return URL currently resolves before adding a second answer.

**Done when:** all seven render in the running app by navigation a parent could actually
perform; `AbsenceScreen` files a report end to end against a live session and still refuses
offline; and a **guard test fails when a component under `features/` is exported by a barrel
and imported by nothing else**. That guard is what stops an eighth appearing.

---

## P2 — The student card's four missing sections

**Evidence.** `2c` is the audit's richest parent artboard — 8 accent colours and 4 bars.
[`StudentCard.tsx:40`](../../../web/apps/parent/src/features/people/StudentCard.tsx#L40) is a
**container**: it renders `useSlot('student-card')` and knows no section by name. Only M3's
own three are registered — Details, Enrollments, Guardians, at
[`register.ts:18`](../../../web/apps/parent/src/features/people/register.ts#L18), `:23` and
`:28`. Line 57 then renders `people.card.sectionsComeLater` — *"belt, attendance, documents
and payment will be added later."*

**That line is honest, and that is what makes it worse than the dashboard's.** On the
dashboard, later lanes registered their alert-centre sections and only the stale sentence was
left behind (see the dashboard spec's F8). Here, **M4, M5, M6 and M7 each left the parent
student-card to someone else and none of them came back.** The slot design worked exactly as
intended — the container never needed reopening — but nobody used it.

**Build.** Four sections, each one file plus one `register.ts` line. Every backend exists:

| Section | Reads |
|---|---|
| Belt — current belt with date, next exam, past promotions | `GET /students/{id}/belts`, `GET /belt-ranks` (`features/belts/client.ts`) |
| Attendance — the **8-session strip** with counts (`נכח 5` / `לא נכח 1` / `הודעתם 1` / `לא סומן 1`) | `GET /me/attendance` ([`attendance.py:309`](../../../app/routers/attendance.py#L309)) |
| Documents — declaration status only | the student's `health_status`; **never the contents** |
| Payment — the child's debt in one place | `GET /me/charges`, `GET /me/balance` |

The belt section needs `BeltBar` **with its D7 ring**, and the attendance strip is a new
shared primitive — see P10. Read `docs/design/specs/2c-parent-student-card.md` for the
region order and the real i18n keys before writing any of it.

**Done when:** all four sections render on a real child, the `sectionsComeLater` line and its
`en`/`ru` mirrors are deleted, and no declaration content appears anywhere on the card.

---

## P3 — The calendar shows attendance

**Evidence.** `#/calendar` measured 81 lines and **2 controls** — and 81 of those lines are
the numbers 1 to 31. It is a bare month grid.
[`ChildCalendar.tsx:304`](../../../web/apps/parent/src/features/schedule/ChildCalendar.tsx#L304)
renders `schedule.calendar.attendanceComesLater`, with a header comment explaining that
M5's half *"ships as a stated sentence rather than a blank column"*.

M5 shipped. `GET /me/attendance` ([`attendance.py:309`](../../../app/routers/attendance.py#L309))
returns per-child, per-session statuses for a date window of up to 62 days, and its docstring
says it exists for *"2a's day strip: what actually happened, per child, per session."* The
calendar is the other screen that wants exactly that.

**Build.** Per-day state and its legend — `נכחה` / `לא נכחה` / `הודעתם מראש` / `מתוכנן` —
which the audit correctly calls *the entire purpose of the screen*. Then the per-child header
and switcher (`הלוח של דנה`), the week/month toggle, and the month summary
(`6 מפגשים שהיו · 3 מתוכננים · 67%`). Mind the endpoint's 62-day cap: a month view is well
inside it, a year view is not.

`הודעתם מראש` is the state P1's `AbsenceScreen` produces — build P1 first or you cannot see
this one work.

**Done when:** every day in the month carries its real state with a legend, the string and
its mirrors are gone, and a filed absence report shows up here as `הודעתם מראש`.

---

## P4 — The public landing, and the funnel above it

**Evidence, and a correction — the landing is not a shell.** The audit measures it at
*"10 lines, 157 characters — byte-identical at 390px and 1440px"* and marks it `SHELL`. The
file is **240 lines** and renders logo, club name, headline, about, address and group cards
(`PublicLanding.tsx:171-215`). What was captured was its `no-schedule` **empty state** at
[`PublicLanding.tsx:152`](../../../web/apps/parent/src/features/landing/PublicLanding.tsx#L152)
— and an empty state is byte-identical at both widths for the obvious reason.

The mechanism is traceable end to end. `PublicLanding.tsx:133` maps a **503** to that state,
and `public.py:107` raises exactly one: `schedule_unavailable`, *"the club's schedule has not
been built yet."* So the captured studio had no schedule — which is precisely the trap the
audit README warns about, where a second `buildScenario` closes the first training year. The
copy is correct for the condition and the two failures a stranger can hit are properly told
apart (404 = no such club, 503 = club exists, no schedule). **Nothing here needs fixing.**

Two consequences. First, the audit's item 7 — *"groups must be published to the landing"* —
describes a feature that neither exists nor is needed: `LandingService.public_groups`
([`landing.py:94`](../../../app/services/people/landing.py#L94)) filters on `Class.is_active`
and `Group.is_active` and nothing else, so every active group is public already. Second,
**seed a studio with an active training year before you measure this page again**, or you
will re-measure the empty state and re-file the same finding.

**The responsive layout is already built — do not rebuild it.** The file's header states the
design:

> **One component, two widths.** 13a and 13c are the same page: the difference is a CSS grid
> that collapses, not a second tree.

And it is implemented: `pageStyle:32` sets
`gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))'` and `offerStyle:49` sets
`position: 'sticky'`, so at 390px the grid is one column and `sticky` is inert, and at 1440px
the offer panel parks beside the club. `docs/design/landing-page-gap.md` calls this *"the one
structural decision the implementation got exactly right."* There are no `@media` queries
because this approach does not need any.

**What is genuinely missing is the page's appearance, not its layout or its behaviour** — the
hero band, the stats strip, the trial-steps section, the location card and the footer. That
work has its own spec: **[`2026-08-27-landing-completion-design.md`](2026-08-27-landing-completion-design.md)**,
which supersedes this section for everything above the fold. **P4 keeps only the shell-level
401 fix below and the `13b` wiring**; do not build landing regions from this file.

Also absent from the loaded state: the belt-ladder graphic (5 bars mobile, 7 desktop), the
three credibility stats (`214 חניכים פעילים`, `18 שנים ברעננה`, `4 מאמנים מוסמכים`), the
`איך נראה שיעור ניסיון` three-step explainer, and group times and phone.

**The 401, and where it actually lives.** The audit reports the anonymous landing issuing
`GET /api/v1/auth/refresh` and taking a 401. `PublicLanding.tsx` makes **no authenticated
call at all**. The cause is one level up: `App.tsx:98` calls `useSession()` unconditionally,
and the landing route is not resolved until line 228. Fix it in the shell — resolve the
public route first and mount the landing without ever touching the session. §5.4a's rule is
in the file header: *"the sign-in wall stands in front of booking, never in front of
reading."* An unauthenticated request on a page a stranger sees is that wall leaking.

**The rest of the funnel.** `BookingFlow` (390 lines) and `BookingConfirmed` (108 lines,
artboard `13b`) exist. `13b` wants `נשמר מקום לאורי` with date and venue, `הוספה ליומן`
— which is P1's unreachable `EventCalendarButtons` — `חתימה על ההצהרה`, and the WhatsApp
fallback line. `JoinFlow` (§5.4b, the WhatsApp onboarding link) is implemented and routed;
`FirstRegistration` (`12j`) is P1's and belongs in that flow.

**Done when:** no authenticated request is issued by an anonymous page (assert it in a test);
`13b` is complete including the calendar button `EventCalendarButtons` supplies; and you have
recorded in P12 that the original SHELL measurement was the 503 empty state rather than a gap.
The page's appearance is the landing spec's scope, not this one's.

---

## P5 — The inbox and the events list

**Evidence.** `#/announcements` measured 5 lines against `2b`'s 21, with 1 control.
`#/events` measured **2 lines and 0 controls** against `12h`'s 31. Both have working clients:
`commsClient.ts` covers `/notifications`, `/notifications/{id}/read`, `/notifications/read-all`
and `/notification-preferences`; `events/client.ts` covers `GET /me/events`,
`POST /events/{id}/rsvp` and `POST /events/{id}/consent`.

The events measurement was taken when **no events existed**, so treat `SHELL` there as
unproven until you seed one — the audit says as much.

**Build — inbox (`2b`).** The `דורש פעולה` card that pins to the top until acknowledged, with
`מילוי הצהרה` / `אחר כך`; dated announcements with body text; per-child attribution
(`דנה · ג׳ודו / מתחילים`); receipt entries. **This is also the second entry point to the
health declaration** the audit asks you to verify — see P11.

**Scope guard, enforced by a test.** `2b`'s second tab (`שיחה עם המשרד`) was cut by **D9.1**:
§2.3 puts in-app two-way chat out of scope and §5.11 permits exactly two levels — push, and a
one-way inbox. `tests/contracts/test_canvas_matches_spec.py` fails if it reappears. **Build
the inbox only.**

**Build — events (`12h`).** The `2 ממתינים לתשובה שלכם` counter; per-event cards typed
`תחרות` / `אימון מיוחד` / `מבחן חגורה` with child attribution, venue, weigh-in time and fee;
`אישור השתתפות` / `לא נגיע`; the consent requirement and closing date; and the
already-confirmed state (`אישרתם · דנה, יוסי`).

**Done when:** both screens render real data, RSVP and consent round-trip, the action-required
card pins and clears, and the chat tab has not reappeared.

---

## P6 — Adding a sibling

**Evidence.** `#/add-child` measured 8 lines and 1 control: four bare fields and an empty
group `<select>`. `12g` specifies something quite different.

**Build.** **Group cards, not a dropdown** — each with its schedule, age band and capacity
(`א׳ 16:00 · ה׳ 16:00 · גילאי 5–7`, `14/20`), and `מלאה — אפשר להצטרף לרשימת המתנה` at
capacity. The **sibling-discount line**: `הנחת אח/ות 10% תחול אוטומטית — 288₪ לחודש במקום 320₪`.
And the three-step explainer — approval, then health declaration, then billing starts — so a
parent knows nothing is charged yet.

The group data with schedules is already public: `LandingService.public_groups` returns name,
description, age range and `training_weekdays`, and §5.4a's landing shows the same list.
Capacity and the discount need checking against W4's pricing before you draw a number — do
not invent either.

**Done when:** group cards render with real schedules and capacity, a full group offers the
waitlist state, the discount line shows a computed figure or is absent, and the request
reaches the same approval queue a manager already works.

---

## P7 — A belt link that silently goes home

**Evidence.** [`App.tsx:194`](../../../web/apps/parent/src/App.tsx#L194) parses
`#/belts/<studentId>/<classId>` and requires **two** segments. A single-segment
`#/belts/<studentId>` matches nothing and **falls through to home** with no message.

A guardian following an older link, a shared link, or a link from a club with one class lands
on the home screen with no explanation of what happened. Silent fallback is the failure mode
W6's sweep spent its time on — a control that leads somewhere other than where it says.

**Build.** Decide and implement one of: resolve the single-segment form when the student has
exactly one class (the common case for a club with one class), or refuse it explicitly with a
message and a way forward. **Do not leave it falling through.** Whichever you choose, state
it in P12.

**Done when:** a single-segment belt hash either resolves or refuses visibly, with a test for
each shape, and `#/belts/` with no segments behaves the same way.

---

## P8 — Recovery on a phone network

**Evidence.** 19 parent screens catch an API error. **One** offers a way to recover —
`features/identity/Resolve.tsx`. This is a mobile PWA, used on phone networks, by people
standing in a dojo doorway.

**Build.**

1. **Reuse the dashboard's primitive.** The dashboard spec's F1a builds
   `LoadFailed` in `web/packages/ui/src/primitives/` with a **required** `onRetry`. Adopt the
   same one across all 19 screens — do not write a second. If F1a has not landed yet, build
   it here and the dashboard adopts it; whichever surface goes first owns the primitive.
   Each screen supplies a real re-fetch, never `location.reload()`.
2. **Network state on reads.** The app queues nothing by design (§10.2) but it also never
   tells a parent they are offline while reading. `AbsenceScreen` already models all four of
   §10.1's states correctly, including treating `slow` as an offline path — **copy its
   approach**, do not invent a second vocabulary.
3. **Silent degradation.** `PaymentsSection` zeroes prepay terms when the read fails, so a
   parent sees a real-looking `0` instead of "we could not load this". Sweep every screen for
   a failed read that renders as data. A wrong number about money is worse than an error.
4. **Push.** `usePushRegistration` models absent / denied / granted, `platformOf` splits
   iOS / Android / web, and `PushDisabledBanner` exists. Walk §6.5's whole ladder in a real
   browser — **including the iOS case where the app must be installed before a permission
   can even be requested** — and confirm each rung surfaces something truthful to the parent.

**Done when:** all 19 screens can retry; an offline read says so; no failed read renders as a
number; the push ladder is walked on a real iOS device and its states recorded in P12; and a
guard test fails on a screen that catches without offering recovery.

---

## P9 — A guardian with children in two clubs

**Evidence.** §6.3 covers a guardian whose children train at more than one studio, and `2e`
draws it: `מכבי ג׳ודו רעננה · דנה, יוסי` / `קראטה הוד השרון · נועה`, with a **`חוב` marker per
club**, plus the counts `הילדים שלי 3` and `מסמכים והצהרות 1 חסר`. The drawer measured 57
lines and 70 controls — it **exceeds** its mockup — so this is a narrow gap in an otherwise
strong component, not a rebuild.

`StudioSwitcher` exists in `web/packages/ui/src/shell/`. What needs proving is that switching
actually moves every `/me` read to the new studio, since those routes resolve the family from
the session rather than from a path parameter.

**Build.** Per-club debt markers and the two counts. Then verify the switch end to end with a
guardian who genuinely has children in two studios — home, payments, calendar and the student
card must all follow.

**Done when:** a two-club guardian switches and every screen follows, debt shows per club,
and a test covers the switch with a seeded two-studio family. Note the persona switcher moves
the active studio **without a reload** (§19.4) — anything caching a studio id at mount will
be wrong and must be found now.

---

## P10 — Bars, and three "coming later" lines

**Evidence — bars.** The audit counts 12 coloured bars across the parent artboards
(`13a` 5, `13c` 7, `2c` 4, `12e` 1) and **zero** rendered. `BeltBar` exists as a primitive
with its D7 ring and is exported from `@studio/ui`; no parent screen imports it. There is no
attendance-strip primitive at all.

Note the reconciliation the dashboard spec's F0 makes: the audit README's *"`BeltBar` is not
used on any screen we captured"* is a statement about **capture**, not about source — on the
dashboard, `BeltBar` is imported in four files. On the parent surface the stronger claim
holds: nothing imports it.

**Evidence — the three lines.** Their situations differ and the fix differs with them:

| Where | String | Situation |
|---|---|---|
| `ChildCalendar.tsx:304` | `schedule.calendar.attendanceComesLater` | **Stale.** `GET /me/attendance` ships. P3 fills it; then delete the key and its mirrors. |
| `StudentCard.tsx:57` | `people.card.sectionsComeLater` | **Honest.** The sections were never built. P2 builds them; then delete. |
| `PublicLanding.tsx:155` | `people.landing.scheduleComeLater` | **Correct as written.** It is the copy for a deliberate 503, `schedule_unavailable`, and P4 traced it end to end. **Keep it.** |
| `ParentHome.tsx:365` | `common.home.childrenComeLater` | **Verify first.** *"מנהל הסטודיו משייך ילד לחשבון בעת ההרשמה"* reads as correct guidance for a guardian with no children linked yet, not as a promise. If so, keep it and record that. |

**Build.** `BeltBar` into `2c` and `12d` with its ring. A new attendance-strip primitive in
`web/packages/ui/src/primitives/` — used by `2c`'s 8-session strip and reusable by the
dashboard. Then resolve each of the four strings per the table. Add the dashboard spec's
dead-key guard test if F8 has not already added it: **a `*ComesLater` key that no component
references is dead and must be deleted.**

**Done when:** bars render on both screens, the two stale keys are gone from all three
locales, the two kept strings are recorded in P12 with the reason they stay, and the guard
test passes.

---

## P11 — What happens when a declaration needs renewing

**This workstream is an investigation with a decision at the end, not a build.** It is here
because the answer could lock every guardian out of the app, and that is not a thing to
discover in production.

**Evidence.** `student.health_status` has exactly three values —
`missing | trial_signed | signed`, constrained in
[`app/models/people.py:122`](../../../app/models/people.py#L122). There is **no `expiring` or
`expired` value.** `HealthGate` blocks on anything other than `signed`
([`HealthGate.tsx:47`](../../../web/apps/parent/src/features/health/HealthGate.tsx#L47)) and
`App.tsx` wraps **every** routed branch in it, so a guardian with one unsigned child reaches
no screen at all.

M4.5 shipped *"the day 1/3/7 reminder ladder, and renewal only when the studio asked for
one."* The dashboard's documents screen has a `פג בקרוב` concept.

**The question:** when a renewal comes due, what does `health_status` become? If it returns to
`missing`, then a routine annual renewal — for a family who has trained for three years and
owes nothing — **blocks the entire parent app** until a form is signed. §5.5 calls the gate
hard, but it argues from a *first* declaration before a child steps on the mat. A renewal is
a different case, and the same rule may not fit it.

**Do.** Trace it: find what the renewal path sets, whether an expiry is stored anywhere other
than the declaration row, and what the gate does in that state. Then either confirm the
current behaviour is intended and record why, or propose the narrower rule — first
declaration blocks; renewal warns on home and in the inbox — and implement it after saying so.
That narrower rule is the one case where `1a`'s combined alert line has something real to
render, which is why P0 sends the audit's home finding here.

**Done when:** the renewal path is traced and written up in P12 with the decision and its
reasoning, and whichever behaviour is chosen has a test naming it.

---

## P12 — The record

**Evidence.** [`docs/design/audit/parent.md`](../../design/audit/parent.md) is the record and
it is good — 20 artboards rendered and compared screen by screen. What it lacks is a way to
**stay** true: P0 lists four findings already overtaken by code, and it has no place to write
that down.

**Build.**

1. Add a **`## Log`** section to `docs/design/audit/parent.md`, newest first. Every
   workstream appends when it lands: what was wrong, what was built, what was decided and why,
   and any claim that turned out stale.
2. Record the decisions this spec defers to you: P4's landing-measurement question, P7's
   single-segment belt route, P10's two kept strings, **P11's renewal rule**, and P8's push
   ladder as actually observed on a real iOS device.
3. Add the **functional dimension** to each screen entry — routes with no UI, states with no
   recovery, containers with unregistered sections — none of which a screenshot can see.
4. Fix `docs/onboarding-link-spec.md`'s *"Nothing here is implemented"* header (P0).
5. Keep **D9.1** honest: `2b`'s chat tab is cut and `tests/contracts/test_canvas_matches_spec.py`
   fails if it returns.

**Done when:** the log exists, every landed workstream has an entry, and each decision above
is written down with its reasoning rather than living only in a commit message.

---

## Order

P0 first. Then P1 — it is the cheapest work on this surface and P3 depends on
`AbsenceScreen` existing before `הודעתם מראש` can appear. P10's primitives come before P2,
which consumes them. P11 is an investigation and can run alongside anything.

```
P0 → P1 → P10 (primitives) → P2 → P3 → { P4 | P5 | P6 } → { P7 | P8 | P9 }
                                          P11 alongside · P12 throughout
```

## Not in scope

- The dashboard and the staff app. The dashboard has its own spec; the staff app is next.
- **In-app two-way chat.** Cut by D9.1, out of scope by §2.3, and pinned by a contract test.
- **An offline write queue in this app.** §10.2 gives the parent app a read-only cache;
  only staff queues writes. `AbsenceScreen` refusing offline is correct behaviour, not a bug.
- **Any landing-page appearance work.** It has its own spec. The collapsing grid already works
  and must not be rebuilt.
- **Automated recurring billing.** הוראת קבע cannot be created programmatically by our
  provider and is marked paid by hand. `1b`'s double-charge warning
  (`רשומה הוראת קבע פעילה — ודא שאינך משלם פעמיים`) is the guard against a parent paying
  twice, and it belongs on the payments screen — that warning is in scope; automating the
  charge is not.
- Schema migrations should be raised before they are written: `main` owns
  `alembic/versions/**` and lanes never run `alembic revision`. P11 is the only workstream
  here likely to want one.

## Ticking the work off

When a workstream lands, tick it in `docs/plan/state.yaml` **in the same commit as the work**.
Never write anything measurable there — no test results, no branch, no environment health.
Those are computed, and a declaration that contradicts a measurement is how a status board
stops being trusted.
