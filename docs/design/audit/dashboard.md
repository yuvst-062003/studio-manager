# Manager dashboard — canvas-to-code gap spec

**Written:** 2026-08-27
**Surface:** `web/apps/dashboard/` · 1440×900 · Hebrew RTL
**Reference pages:** [`docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html`](../canvas/03-manager-dashboard/Manager%20Dashboard.dc.html) — open in a browser and jump to an artboard with its anchor, e.g. `Manager Dashboard.dc.html#3a`. Nav component: [`DashNav.dc.html`](../canvas/03-manager-dashboard/DashNav.dc.html).

> **This is a gap audit, not a design spec.** The per-artboard design specs already exist in
> [`docs/design/specs/`](../specs/README.md) — one file per artboard, with regions, states, token
> roles, primitives and i18n keys. Read those to know *what a screen should be*. Read this to know
> *what shipped, what is missing, and where the code is*.

## How this was measured

All 27 dashboard artboards were rendered in headless Chromium at their drawn size and
compared against the shipped app at the same 1440×900 viewport, signed in as the `owner`
persona with a seeded studio (5 students, 43 sessions, 3 charges, one active training year).

For each screen we counted: lines of rendered text, interactive controls (`<button>` or
`cursor:pointer`), distinct non-grey accent colours, and coloured bars (a filled block wider
than 2.5:1 and ≤26px tall — belt bars, progress bars, chart columns).

`docs/design/canvas-review.md` audited this canvas as **markup only** and said so:
*"the artboards were not rendered or viewed visually … this catches scope and token problems,
not visual-quality ones."* This spec closes that gap.

## Summary

| Metric | Artboards | Shipped |
|---|---|---|
| Median lines of content | ~75 | ~15 |
| Median interactive controls | ~88 | ~3 |
| Distinct accent colours | 2–9 | 0–2 |
| Coloured bars | 15 across these screens | **0** |

Two findings dominate:

1. **No coloured bar renders anywhere on the dashboard.** Belt bars, progress bars and the
   revenue chart have no implementation. Decision **D7** (every belt bar carries a 1px ring
   in the current foreground colour) currently has nothing to apply to.
2. **`QuickViewRoster` is built, tested, and unreachable** — see *Unreachable code* below.

---

## Screen-by-screen

Legend — **Status:** `OK` close to spec · `PARTIAL` present but thin · `SHELL` heading and
empty state only · `MISSING` no implementation.

### `#/schedule` — weekly calendar
- **Reference:** `Manager Dashboard.dc.html#3a` (week board) and `#1e` (Quick View variant)
- **Source:** [`web/apps/dashboard/src/features/schedule/ScheduleSection.tsx`](../../../web/apps/dashboard/src/features/schedule/ScheduleSection.tsx), [`WeekBoard.tsx`](../../../web/apps/dashboard/src/features/schedule/WeekBoard.tsx)
- **Measured:** 97 → 19 lines · 232 → 3 controls · 3 → 0 accents
- **Status:** PARTIAL

Build:
1. **Day / week / month switcher.** D5: *"Three views only — day, week, month. Week is the
   default."* Shipped has previous/today/next instead and no view concept at all.
2. **Time axis and grid.** Rows at 16:00 / 17:00 / 18:30 / 20:00 with ruled cells. Sessions
   currently float in unruled columns.
3. **Dates in day headers** — `א׳ 23`, not bare `ראשון`.
4. **Coverage strip `מה חסר השבוע`** — `2 שיעורים ללא מאמן` · `4 מפגשים ללא סימון נוכחות` ·
   `1 בוטל`. This is D5's *"a session block surfaces coverage and completion"*.
5. **Session-card state colours** — uncovered = red border; unmarked = amber dashed;
   cancelled = grey fill; selected = 2px ink border. Every card currently renders identically.
6. **Search** (`חיפוש חניך, קבוצה או מאמן`) and **`שיעור חדש`**.
7. **Filters** (`מאמן` / `קבוצה` / `אולם`) and the completed counter (`18 מפגשים הושלמו`) — `1e`.
8. **Mount `QuickViewRoster`** — see *Unreachable code*.

### `#/groups` — groups and cycles
- **Reference:** `#4b` · **Source:** [`features/schedule/GroupsAndCycles.tsx`](../../../web/apps/dashboard/src/features/schedule/GroupsAndCycles.tsx)
- **Measured:** 64 → 10 lines · 164 → 1 control · 2 → 0 bars · **Status:** SHELL

Build: the table itself — columns `קבוצה` / `מאמן` / `לו״ז שבועי` / `טווח חגורות` / `תפוסה` /
`מצב`; capacity as `14/20` with a `מלאה` state at capacity; **belt-range bars** (the 2 bars);
`שכפול מחזור` and `קבוצה חדשה`; the header count `9 קבוצות פעילות · מחזור 2026/27`.

### `#/students` — student table
- **Reference:** `#3b` · **Source:** [`features/people/StudentsScreen.tsx`](../../../web/apps/dashboard/src/features/people/StudentsScreen.tsx)
- **Measured:** 104 → 26 lines · 263 → 8 controls · 8 → 1 accent · **Status:** PARTIAL

Build:
1. **Column widths.** The header currently collapses into one run-on string
   (`סטטוס הצהרה מלאה מצב תשלום יתווסף עם מודול הגבייה`) because no widths are assigned.
2. Missing columns: `מאמן`, `נוכחות 30 יום` (as a percentage), `תשלום`, `יתרה`.
3. Filter chips: `קבוצה` / `חגורה` / `מאמן` / `בחוב` / `מסמך חסר`.
4. Counts: `214 פעילים · 6 מוקפאים` and `מציג 8 מתוך 214`.
5. `ייצוא` and `הוספת חניך` actions.

### `#/alerts` — alert centre
- **Reference:** `#6c` · **Source:** [`features/people/AlertCentre.tsx`](../../../web/apps/dashboard/src/features/people/AlertCentre.tsx)
- **Measured:** 67 → 10 lines · 92 → 1 control · **Status:** SHELL

Build: category chips (`הכל 9` / `דורש פעולה 4` / `כספים 3` / `נוכחות 2` / `צוות 1`);
timestamped alert cards; per-alert inline actions — `שליחת בקשת עדכון`, `פתיחת הגבייה`,
`ביטול השיעור`, `שיבוץ מאמן`, `תזכורת למאמנים`; `סימון הכל כנקרא`; `הגדרות התראות`.

### `#/billing` — collections
- **Reference:** `#3e` · **Source:** [`features/billing/BillingSection.tsx`](../../../web/apps/dashboard/src/features/billing/BillingSection.tsx), [`CollectionsScreen.tsx`](../../../web/apps/dashboard/src/features/billing/CollectionsScreen.tsx)
- **Measured:** 83 → 23 lines · 90 → 6 controls · **Status:** PARTIAL

Build: four KPI tiles (`חוב פתוח` with `12 משקי בית` and `79% מהצפוי`, `הוראות קבע פעילות`,
`חיובים שנכשלו`); the **household** table — `משק בית` / `חודשים בחוב` / `ותק החוב` / `יתרה`,
which is D-note *"חוב לפי משק בית, לא לפי ילד"* (§6.3); per-row `תזכורת`; sort by debt age;
`ייצוא לרו"ח`; `הפקת חיובים לחודש`.

### `#/prices` — price list
- **Reference:** `#5a` · **Source:** [`features/billing/PricesSection.tsx`](../../../web/apps/dashboard/src/features/billing/PricesSection.tsx), [`PricePlansScreen.tsx`](../../../web/apps/dashboard/src/features/billing/PricePlansScreen.tsx)
- **Measured:** 93 → 11 lines · 111 → 1 control · **Status:** SHELL

Build: three tabs (`מסלולי מנוי` / `פריטים חד-פעמיים` / `הנחות`); the plans table
(`מסלול` / `תדירות חיוב` / `מחיר` / `קבוצות` / `מצב`); `היסטוריית שינויים`; `פריט חדש`;
the VAT note `כל המחירים כוללים מע״מ`.

### `#/attendance` — attendance overview
- **Reference:** `#4c` · **Source:** [`features/attendance/AttendanceSection.tsx`](../../../web/apps/dashboard/src/features/attendance/AttendanceSection.tsx), [`AttendanceReport.tsx`](../../../web/apps/dashboard/src/features/attendance/AttendanceReport.tsx)
- **Measured:** 69 → 7 lines · 83 → 1 control · 2 → 0 bars · **Status:** SHELL

Build:
1. **`ממתין לסימון` queue** — one card per unmarked session with elapsed time
   (`לא סומן · 26 שעות`) and two actions: `תזכורת למאמן`, `סימון עכשיו`.
2. **Per-group attendance bars** with colour thresholds — ink ≥85%, amber 70–84%, red <70%
   (mockup shows 94/88/91 ink, 76 amber, 61 red).
3. **`חניכים בסיכון` column** — at-risk cards with a 6-square streak strip (present/absent/
   unmarked) and `יצירת קשר עם ההורה`.
4. Week range in the header and `ייצוא דוח נוכחות`.

### `#/comms` — announcement composer
- **Reference:** `#4f` · **Source:** [`features/comms/CommsSection.tsx`](../../../web/apps/dashboard/src/features/comms/CommsSection.tsx), [`AnnouncementsScreen.tsx`](../../../web/apps/dashboard/src/features/comms/AnnouncementsScreen.tsx)
- **Measured:** 59 → 21 lines · 86 → 7 controls · **Status:** PARTIAL

Build: audience targeting (group chips, `+ קבוצה`, `רק משקי בית בחוב`, `רק מסמך חסר`) with the
reach counter `128 הורים · 143 חניכים · הודעה אחת למשק בית`; translation affordances
(`+ תרגום לרוסית`, `+ תרגום לאנגלית`); the `סימון כ״דורש פעולה״` toggle; send scheduling with
the quiet-hours note (`לא נשלחות הודעות אחרי 21:00`); parent-app preview; `שמירה כתבנית`.

### `#/documents` — health documents
- **Reference:** `#4e` · **Source:** [`features/health/DocumentsSection.tsx`](../../../web/apps/dashboard/src/features/health/DocumentsSection.tsx), [`DocumentsScreen.tsx`](../../../web/apps/dashboard/src/features/health/DocumentsScreen.tsx)
- **Measured:** 70 → 28 lines · 87 → 11 controls · **Status:** PARTIAL

Build: status chips (`הכל 214` / `חסר 3` / `פג בקרוב 9` / `ממתין לחתימת הורה 4`); table columns
`סוג מסמך` / `תוקף` / `אחראי`; per-row `שליחת בקשה` and `העלאה ידנית`; `בקשה קבוצתית ל־12`;
`עריכת תבנית הצהרה`. **Never render declaration contents here** — §11.1 and the
health-data rule in `CLAUDE.md`.

### `#/reports` — reports
- **Reference:** `#4g` · **Source:** [`features/reports/ReportsSection.tsx`](../../../web/apps/dashboard/src/features/reports/ReportsSection.tsx)
- **Measured:** 75 → 15 lines · 78 → 3 controls · 8 → **0** bars · 8 → 0 accents · **Status:** PARTIAL

The inventory describes `4g` as *"דוחות — שימור, הכנסות ונוכחות"*. Only revenue exists.

Build:
1. Period switcher `חודש / עונה / שנה` and `ייצוא CSV`.
2. Three missing KPI tiles — `חניכים פעילים` (with `+18 מתחילת העונה`), `נשירה חודשית`
   (with `מעל היעד (2.5%)`), `נוכחות ממוצעת` — each with a delta line.
3. **The 12-month revenue-vs-debt chart** (all 8 bars). D3 forbids coloured charts
   (`4g`: *"ללא גרפים צבעוניים"*) — draw it in ink and the debt token only.

### `#/events` — events
- **Reference:** `#7a` (index), `#7b` (create), `#7c` (event page)
- **Source:** [`features/events/EventsScreen.tsx`](../../../web/apps/dashboard/src/features/events/EventsScreen.tsx), [`EventForm.tsx`](../../../web/apps/dashboard/src/features/events/EventForm.tsx), [`EventPage.tsx`](../../../web/apps/dashboard/src/features/events/EventPage.tsx)
- **Measured:** 88 → 11 lines · 87 → 8 controls · **Status:** SHELL (no events existed when measured)

Build: type filter chips (`הכל 6` / `תחרויות 2` / `אימונים מיוחדים 2` / `מבחנים 1` / `מחנות 1`);
event cards with a date block (`06 ספט׳`), venue/time/groups line, RSVP count `14/27`,
consent warning `6 ללא אישור הורה`, closing date; the attention counter
`4 אירועים דורשים תשומת לב`; `לוח שנת אירועים`.
**`7c` must not regain the `משקל / קטגוריה` column** — cut by D9.2 and asserted by
`tests/contracts/test_canvas_matches_spec.py`.

### `#/belts` — belt system
- **Reference:** `#5b` · **Source:** [`features/belts/BeltsIndex.tsx`](../../../web/apps/dashboard/src/features/belts/BeltsIndex.tsx), [`BeltSystemScreen.tsx`](../../../web/apps/dashboard/src/features/belts/BeltSystemScreen.tsx)
- **Measured:** 74 → 3 lines · 110 → 4 controls · 9 → 0 accents · 2 → 0 bars · **Status:** SHELL

`#/belts` is a class picker; the editor lives at `#/belts/<classId>`. Build there:
1. **The grade table** — `חגורה` (bar swatch) / `שם` / `ותק מינימלי` / `נוכחות מינימלית` /
   `חניכים`, with drag-to-reorder, per-row edit and delete.
2. **The edit panel** — name, **bi-colour toggle with a visible state label** (`מופעל`),
   two 8-swatch colour pickers (`צבע ראשון` / `צבע שני`), live preview, minimum tenure and
   minimum attendance, `ביטול` / `שמירת דרגה`.
3. **Bi-colour belt bars** — `לבנה–צהובה`, `צהובה–כתומה`, `ירוקה–חומה` render as split fills.
4. **Every bar carries a 1px ring in the current foreground colour (D7).** Without it the
   white belt is 1.08:1 on the light ground and the black belt 1.02:1 on dark.
5. `טעינת ערכה מוכנה` and `הוספת דרגה`.

### `#/exams` — belt exams
- **Reference:** `#6b` (index), `#4d` (eligibility)
- **Source:** [`features/events/ExamsScreen.tsx`](../../../web/apps/dashboard/src/features/events/ExamsScreen.tsx), [`ExamEligibilityScreen.tsx`](../../../web/apps/dashboard/src/features/events/ExamEligibilityScreen.tsx)
- **Measured:** 90 → 4 lines · 88 → 1 control · **Status:** SHELL

Build: upcoming and past exam lists; per-exam eligibility breakdown
(`עומדים בתנאים` / `חסרה נוכחות` / `חסומים`) and `ניהול זכאות`; invitation state
(`הזמנות טרם נשלחו`); exam fee (`חיוב 90₪ לחניך`); draft state (`טיוטה — טרם נקבעו תנאים`).

### `#/staff` — staff
- **Reference:** `#3d` · **Source:** [`features/staff/StaffScreen.tsx`](../../../web/apps/dashboard/src/features/staff/StaffScreen.tsx)
- **Measured:** 72 → 38 lines · 172 → **0** controls · **Status:** PARTIAL

The only dashboard screen with a real `<table>`, and it has **zero interactive controls**.

Build: the uncovered-lessons banner (`2 שיעורים השבוע ללא מאמן` + `שיבוץ מאמן`); columns
`שעות שבוע` and `הרשאות`; `דוח שעות`; `הוספת איש צוות`; header summary
`5 אנשי צוות · 50 שעות שבועיות`.

### `#/settings` — settings
- **Reference:** `#3f` · **Source:** [`features/settings/SettingsScreen.tsx`](../../../web/apps/dashboard/src/features/settings/SettingsScreen.tsx)
- **Measured:** 56 → 23 lines · 87 → 15 controls · **Status:** OK (closest to spec)

Build: the three tabs (`מחירים ומסלולים` / `התראות ותבניות` / `משתמשים והרשאות`); logo upload
(512×512) — roadmap item 7; club contact details.
**`3f` must not regain the health-declaration attendance-block toggle** — removed by C10
(2026-08-26) and asserted by `tests/contracts/test_canvas_matches_spec.py`.

### Setup wizard
- **Reference:** `#5c` (step 1) `#5d` (step 2) `#5e` (step 4) `#5f` (step 6)
- **Source:** [`web/packages/ui/src/setup-wizard/`](../../../web/packages/ui/src/setup-wizard/) — shared with the staff app
- **Status:** PARTIAL (31 lines, 13 controls). `5d` carries **19 belt bars** and none render.

### Component library
- **Reference:** `#4h` — `ספריית רכיבים`, 1200×868, 9 accent colours
- **Source:** [`web/packages/ui/src/primitives/`](../../../web/packages/ui/src/primitives/)
- No route. This is the intended source of truth for the token and component layer.

---

## Chrome (every screen)

**Source:** [`web/packages/ui/src/shell/SideNav.tsx`](../../../web/packages/ui/src/shell/SideNav.tsx), [`AppShell.tsx`](../../../web/packages/ui/src/shell/AppShell.tsx), [`StudioSwitcher.tsx`](../../../web/packages/ui/src/shell/StudioSwitcher.tsx)

| Element | Reference (`DashNav.dc.html`) | Shipped |
|---|---|---|
| Nav item counts | `חניכים 214`, `תשלומים 12`, `נוכחות 4`, `מסמכים 3` | one badge only |
| Header | studio name + `2 סניפים` + chevron (switcher) | name + product name, no switcher |
| Footer | person + role (`מנהלת מועדון`) + chevron | name only |
| Extra items | — | ships `גלגול שנה` and `מחירים ומסלולים`, never drawn |

---

## Unreachable code

`QuickViewRoster` is referenced **only** by its own barrel export and is rendered nowhere:

- [`web/apps/dashboard/src/features/attendance/QuickViewRoster.tsx`](../../../web/apps/dashboard/src/features/attendance/QuickViewRoster.tsx)
- exported by `features/attendance/index.ts:9`, imported by nothing

This is D5's *"clicking a session opens a popover with the roster and inline attendance
marking — never leave the calendar to take a register (§5.7)"*. Mounting it into `WeekBoard`
is the single cheapest item in this spec.

(`BeltsWizardStep` looks unreferenced by the same test but is registered at
`App.tsx:96` via `registerBeltsWizardStep` — it is fine.)

---

## Cross-cutting work

1. **Layout layer.** There is no content container, grid, or table primitive. `main` is
   1204px wide and content anchors to one side, leaving large empty regions
   (`#/reports` uses the top third of a 900px canvas). Add a max-width container, a column
   grid, and a `Table` primitive with explicit column widths to `web/packages/ui/src/`.
2. **Bars.** Add `BeltBar` (with the D7 ring) and reuse [`ProgressBar.tsx`](../../../web/packages/ui/src/primitives/ProgressBar.tsx). Nothing renders bars today.
3. **Logical CSS only.** D10 bans `margin-left` / `padding-right` / `left` / `right` in
   favour of `-inline-start` / `-inline-end`. The exported canvas CSS carries 14 physical
   declarations — treat it as a **visual reference only, never copy-paste** (D10 corollary).
4. **Tokens.** Never hardcode hex. Use the named tokens in
   [`web/packages/ui/src/tokens.css`](../../../web/packages/ui/src/tokens.css); roles and contrast
   obligations live in [`tokens.roles.ts`](../../../web/packages/ui/src/tokens.roles.ts) and are
   re-computed by `tokens.audit.test.ts` on every run.
5. **i18n.** Every string goes in `web/packages/i18n/he/<namespace>.ts` and is mirrored in
   `en/` and `ru/`. Never inline a string; never edit `i18n/index.ts` from a lane.


## Log

### 2026-08-27 · F1 adoption + F11 — recovery everywhere, tables from one primitive

**Stale claims, first.** The spec's counts — "43 screens catch an API error, 40 render a
dead end", "zero @media queries", "no table primitive" — described the tree before the
same-day design pass restructured most screens. Measured now: ~21 dashboard files carry a
failure state, and most already either recovered or rendered honestly. What actually
survived were two classes: **6 dead-end failure renders** (StaffScreen, TemplateEditor,
EventsScreen, ReportsSection, RolloverWizard, SetupWizard — the last shared by both apps)
and **6 fail-as-loaded catches** (`.catch(() => setLoaded(true))`) that made a failed
load wear the EMPTY state — "no events", "no messages", an empty belt ladder — a lie
about the club told by the network (BeltSystemScreen, AnnouncementsScreen, ExamsScreen,
EventPage, staff ExamResultsScreen, staff StaffEventsScreen). ReportsSection was the
worst: a failed read rendered as "no revenue this month".

**Built.** All twelve now render `LoadFailed` with a real re-fetch (an `attempt` counter
re-arms the effect — never `location.reload()`, which the service worker can answer from
cache). The parent sweep (P8) fixed the same classes there: PaymentsSection now fails the
whole money screen rather than zeroing prepay terms and credit, and BeltProgress, Inbox,
Events, EventInvite, Shop, TrainingPlan, Directions and DeclarationForm all retry.
Guard: `tools/__tests__/load-failed-recovery.test.ts` — a `*.loadFailed` string may only
render through the primitive, and `.catch(…setLoaded(true))` fails the build.

**F1b/F11.** Students, staff and groups — the three hand-built `<table>`s in the tree
(the audit's collections and exams tables had already shipped as card/flex layouts; drift,
not a gap) — now render through the `Table` primitive: explicit widths (the fix for the
run-on students header), required caption, its own scroll container, and one card
fallback below 768px defined once, tested at both layouts in the primitive. jsdom has no
layout engine, so the 390px behaviour is asserted where it is defined rather than
re-asserted per screen.


### 2026-08-27 · F2 + F7 — every dead control acts, and the guard that keeps it so

**What was wrong.** Ten controls rendered a `<Button>` with no handler — four whose
backend shipped waves ago (freeze, mark-lost, and both trial-decision buttons), and six
with no backend at all (two exports, four reminders).

**F2.** Freeze and mark-lost expand into their own small forms on the detail screen — the
second press is the confirmation step and the fields are the decision. The trials alert's
two buttons expand per row: convert wants the group (§5.4a step 5's three-in-one
decision), lost wants the reason. All four fire the routes that had been waiting since
M3/M4, with tests asserting the exact bodies. The guard
(`tools/__tests__/inert-buttons.test.ts`) fails the build on any `<Button>` in any app
with no onClick, no href, no submit type and no spread props.

**F7a.** `POST /reminders/debt` (one household or many — the bulk button is the same
route with more ids), `/reminders/sessions/{id}/coach`, `/reminders/events/{id}/non-responders`.
One service over the existing comms layer, three rules enforced: **quiet hours** (a 409
between 21:00 and 08:00 Jerusalem — implemented for the first time anywhere in the
product; the audit's `לא נשלחות הודעות אחרי 21:00` was a note about a composer that never
shipped it), **24h rate limit** per person per subject (read back from the notifications
table — "reminded 2 days ago" is a query, not a second table), and **one message per
household** (debt addresses the payer, per §6.3). Every call audits counts, never names.
The UI renders the outcome per row — sent, already-reminded, quiet-hours — because "we
did not send that" must never look like "we sent that".

**F7b.** `GET /exports/accountant?year&month` (payments received in the Jerusalem month,
reversals included and marked — the export must agree with the bank statement beside it)
and `GET /exports/attendance?from&to`. CSV, UTF-8 with a BOM, agorot→shekels by integer
arithmetic at the boundary only. Downloads go through an authenticated fetch→blob helper
(`downloadFile` in @studio/core) because a bare `<a href>` cannot carry the bearer header.


### 2026-08-27 · F3 — the calendar answers a click

**What was wrong.** `WeekBoard`'s session blocks were inert — the only handlers on the
screen were the three week-navigation buttons — and `QuickViewRoster`, D5's "never leave
the calendar to take a register", was built, tested, exported and imported by nothing.

**What was built.** A session block is now a real `<button>` opening a focus-trapped
popover (`useModalDialog`, like the dialogs W6 fixed) containing `1e`'s roster with inline
marking and bulk-present, and §5.6's per-session actions: move (starts_at/ends_at as one
pair — the schema 422s otherwise), cancel behind a confirm with the required reason, a
session note, and room/coach change. A new `studioWallTimeToUtc` in @studio/core inverts
the render-only zone helpers, because a manager TYPES a Jerusalem wall time and the API
takes UTC — no such inverse existed, which is also why F4's ad-hoc form was never built.

**Delete, decided as the spec decides it.** `DELETE /sessions/{id}` exists now and refuses
two ways, on the server rather than only in the UI that hides the button: 409 `generated`
for a rule-materialized session (the next expansion would recreate it; cancel is the
answer), and 409 `has_attendance` for an ad-hoc session with marks — no session is worth
more than the register that happened in it. The popover offers delete on `is_ad_hoc` only.

### 2026-08-27 · Cross-surface — the S1 slot-wiring guard's dashboard findings

The dashboard's `registerCommsAlerts` and `registerBillingDevTools` were exported and
called by nothing, so the at-risk card had **never rendered** on this surface — F8's table
says comms/register.ts registers it, which was true of the file and false of the running
app. Both are wired from App.tsx now; the dead `registerBillingAlerts` (superseded by
`BillingAlertSection`, whose props mismatch it could never survive) is deleted. The guard
in `web/tools/__tests__/slot-wiring.test.ts` holds the class closed, and
`unreachable-screens.test.ts` fails on any barrel-exported component nothing references.
