# Canvas-to-code gap audit

**Run:** 2026-08-27

What actually shipped, measured against the canvas, screen by screen.

> **Not a design spec.** The per-artboard design specs live in
> [`docs/design/specs/`](../specs/README.md) — 53 files, one per artboard, with regions,
> states, token roles, primitives and i18n keys. Those say *what a screen should be*.
> These three say *what shipped, what is missing, and which file to open*.

| Audit | Surface | Reference page | Artboards |
|---|---|---|---|
| [dashboard.md](dashboard.md) | `web/apps/dashboard/` · 1440×900 | [`Manager Dashboard.dc.html`](../canvas/03-manager-dashboard/Manager%20Dashboard.dc.html) · [`DashNav.dc.html`](../canvas/03-manager-dashboard/DashNav.dc.html) | 27 |
| [parent.md](parent.md) | `web/apps/parent/` · 390×844 | [`Parent App.dc.html`](../canvas/01-parent-app/Parent%20App.dc.html) | 20 (24 variants) |
| [staff.md](staff.md) | `web/apps/staff/` · 390×844 | [`Staff App.dc.html`](../canvas/02-staff-app/Staff%20App.dc.html) | 14 (22 variants) |

Open a reference page in a browser and jump with an anchor — `Manager Dashboard.dc.html#4c`.

## Method

Every artboard was **rendered** in headless Chromium at its drawn size and compared with the
shipped app at the same viewport, signed in through the §19.4 dev routes against a seeded
demo studio. Per screen: lines of rendered text, interactive controls (`<button>` or
`cursor:pointer`), distinct non-grey accent colours, and coloured bars.

This is the pass [`../canvas-review.md`](../canvas-review.md) explicitly did not do — it
audited the canvas as markup and said so: *"the artboards were not rendered or viewed
visually … this catches scope and token problems, not visual-quality ones."*

Three traps, for whoever re-runs this:

- **Seed and capture in one run.** The dev database is shared and gets truncated by other
  processes (`pytest` reads `settings.DATABASE_URL` directly). Data seeded in one run can be
  gone by the next — it happened three times during this audit.
- **Build one scenario, not two.** A second `buildScenario` activates a second training year,
  which closes the first (`uq_training_year_one_active`), after which student screens go empty.
- **Suppress the staff tour** via `localStorage['studio.staff.tour-seen']`, or four staff
  routes measure as two lines of text.

## Findings all three share

**No coloured bar renders anywhere in the product.** The artboards use 31 across the three
surfaces — belt bars, attendance strips, progress bars, the revenue chart, the landing belt
ladder. The shipped apps render **zero**.

This confirms cross-cutting finding 1 in [`../specs/README.md`](../specs/README.md) from the
other direction: that note says the canvas draws belt bars fill-only while the `BeltBar`
primitive applies the D7 ring unconditionally. Measured at runtime, the answer is that
**neither reaches a screen** — `BeltBar` is not used on any screen we captured.

**Accent colours collapse.** Artboards use 1–9 distinct non-grey colours per screen; shipped
screens use 0–3. That is the measurable form of "the design looks pale".

**14 built screens are unreachable** — referenced only by a barrel `index.ts` and rendered by
nothing. This is the cheapest work in the audit.

| Component | Artboard | Design spec | Surface |
|---|---|---|---|
| `QuickViewRoster` | `1e` | [`1e`](../specs/1e-dashboard-week-quickview.md) | dashboard |
| `AbsenceScreen` | `12a` | [`12a`](../specs/12a-parent-report-absence.md) | parent |
| `FirstRegistration` | `12j` | [`12j`](../specs/12j-parent-first-registration.md) | parent |
| `PaymentHistoryScreen` | `12f` | [`12f`](../specs/12f-parent-payments-history.md) | parent |
| `PaymentCompleteScreen` · `PaymentStrip` | — | — | parent |
| `CalendarSync` · `EventCalendarButtons` | `13b` | [`13b`](../specs/13b-parent-trial-confirmed.md) | parent |
| `SessionSummary` | `9g` | [`9g`](../specs/9g-staff-session-summary.md) | staff |
| `StudentCardScreen` | `9c` | [`9c`](../specs/9c-staff-student-card-transfer.md) | staff |
| `StaffStudentCard` | `2d` | [`2d`](../specs/2d-staff-student-card.md) | staff |
| `TrialInClass` | `11b` | [`11b`](../specs/11b-staff-trial-intake.md) | staff |
| `HandOverSheet` | `11a` | [`11a`](../specs/11a-staff-hand-over.md) | staff |
| `ConflictSection` · `CoachCalendarFeed` | — | — | staff |

`AbsenceScreen` and the staff roster are a matched pair: §5.14 makes "notified in advance" a
state distinct from absence, the roster and the dashboard both consume it, and **nothing in
the parent app can produce it**.

`QuickViewRoster` is D5's *"clicking a session opens a popover with the roster and inline
attendance marking — never leave the calendar to take a register"*. It is built and mounted
nowhere.

**The dashboard has no layout layer.** No content container, no grid, no table primitive —
`main` is 1204px wide and content anchors to one side, leaving large empty regions
(`#/reports` fills the top third of a 900px canvas). The phone apps never needed one because a
390px single column *is* the layout; the dashboard never got one.

## Bugs found while measuring

| Bug | Surface |
|---|---|
| `GET /api/v1/me/standing-order-links` · `/me/payment-promises` · `/me/prepay-terms` all **404** | parent |
| Anonymous public landing calls `/api/v1/auth/refresh` and takes a **401** | parent |
| `sync/bootstrap` fires 4× before `/auth/refresh` returns — four 401s per launch | staff |
| `GET /api/v1/setup` returns **403** for a coach on every screen | staff |
| First-run tour renders over four empty screens | staff |
| Bare `#/attendance` has no branch — falls through to the date picker | staff |
| `#/belts/<studentId>` silently falls through to home — the route needs **two** segments | parent |

The three parent 404s are the features on branch `feat/plans-payment-routes-prepayment`.

## What this audit does not cover

- **`#/events` on all three surfaces and the landing group list** measured empty because no
  events and no published groups existed — not necessarily because they are unbuilt.
- **Exam results** (`9d` variant 2) — no exam existed to open.
- **Dark mode** was captured but not compared screen by screen; the earlier contrast audit in
  [`../canvas-review.md`](../canvas-review.md) found the dark palette better tuned than light.
