# `MH` — לוח הבית של המנהל · the manager home screen **(proposal)**

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 · Hebrew RTL |
| **Canvas** | **none.** This screen has no artboard and must not gain one — `tests/contracts/test_canvas_matches_spec.py` asserts the canvas holds exactly 61, and a 62nd fails the build. This file is the design. |
| **Route** | `#/` — today `resolveRoute` falls through to `'schedule'` ([`App.tsx:218`](../../../web/apps/dashboard/src/App.tsx)) |
| **i18n namespace** | `common`, plus `billing`, `health`, `schedule`, `events` for their own strings |
| **Slot** | none |

> **Status: proposal.** Not yet a shipped spec. Merged 2026-08-29 from four sources — see
> *Provenance* below. Nothing here has been built.

## Why this screen exists

A manager opening the dashboard today lands on the weekly calendar, because `resolveRoute`
has no `'home'` branch. The calendar answers *"what is scheduled?"* — which is not the
question a manager has at 07:00. Their question is **"what needs me today?"**, and answering
it currently requires visiting `#/billing`, `#/alerts`, `#/documents` and `#/schedule` in
turn, and knowing to do so.

This screen is a **read-out, not a workspace**. It owns no data and no mutations. Every
number is a link to the screen that already explains it. If a region would need a control
more complex than a link or a single-verb button, it belongs on its own screen instead.

## Provenance

| Source | What it contributed | What was rejected |
|---|---|---|
| Google Stitch (Gemini 3.1 Pro, `projects/6650712549032240262`) | The landing composition: a money band across the top, then a two-column grid of single-question cards. The section-header-with-trailing-action pattern. Today's classes as a table with an enrolment chip. | Its five-item nav; its two-bullet "Action Required"; `$`; reversed time ranges |
| [`3a`](../specs/3a-dashboard-week.md) / [`1e`](../specs/1e-dashboard-week-quickview.md) | `DashNav` unchanged — eighteen items, three labelled sections, **three distinct badge kinds**. The "what's missing this week" counters as a concept. | — |
| [`6c`](../specs/6c-dashboard-alert-centre.md) | The alert model: a kind has a severity, a bucket (today / this week), and its own actions, owned by its own lane. | Its full seven-kind list — the home screen shows a **summary**, `#/alerts` keeps the list |
| [`a10-week-board-sessions.jpg`](../../qa/2026-08-28-staging-verification/a10-week-board-sessions.jpg) | Ground truth for what ships today | The full-width primary button; four stacked header rows |

**Precedence rule used for the merge, in order:** tokens, RTL and accessibility are
non-negotiable · the existing artboards win on domain correctness · Stitch wins on
composition and hierarchy only · anything requiring data that does not exist is cut.

## Regions

Right-to-left. `DashNav` on the inline-start edge (visually right), 236px, **unchanged**.

### 1. Page header — one row, not four

The shipped `#/schedule` stacks search, title, primary action and week navigation as four
separate rows. This screen fixes the pattern that the rest of the dashboard should adopt:

```
┌──────────────────────────────────────────────────────────────────┐
│  [ search ]  [ + שיעור חדש ]                    לוח הבית          │
│                                                 מועדון גלדיאטור   │
└──────────────────────────────────────────────────────────────────┘
```

Title and studio name on the inline-start edge; search and **one** primary action on the
inline-end edge; a single row. The primary button is **content-width**, never full-width —
a button stretched across 1130px reads as a banner, which is the loudest defect on the
current screen. The studio name appears **once** — the top bar's duplicate is removed.

New primitive: **`PageHeader`**.

### 2. Money band — three stat tiles

The one region with no precedent anywhere in the product, and the reason this screen is
worth building.

| Tile | Value | Sub-line | Links to |
|---|---|---|---|
| חוב פתוח | sum of `pending` + `overdue` charges | `N משפחות` | `#/billing` |
| נגבה החודש | sum of `paid` charges this month | month name | `#/billing` |
| משפחות בפיגור | count of households with an overdue charge | `דורש טיפול` | `#/billing?filter=overdue` |

**Debt is per household, not per student** — one guardian, several children, one balance.
That is the product's sharpest structural difference and this band must show it.

Money is agorot, rendered by `MoneyDisplay`. **`₪`, never `$`.** Amounts are never
interpolated into a string — Stitch's output produced `$14,250-` and reversed every time
range, both bidi artifacts of exactly that mistake.

New primitive: **`StatTile`**.

### 3. Needs attention — a summary of `6c`, not a copy of it

One card. Each row is an alert **kind** with its count, severity word, and a link into the
screen that handles it. The row carries a **word** beside the colour, never colour alone
(SC 1.4.1).

| Kind | Severity | Links to | Data |
|---|---|---|---|
| הצהרות בריאות חסרות | pending | `#/documents` | `GET /health-declarations/summary` ✅ |
| שיעורים ללא מאמן | danger | `#/schedule` | **no endpoint — deferred, see Gaps** |
| מפגשים ללא סימון נוכחות | pending | `#/attendance` | **no endpoint — deferred** |
| בקשות הצטרפות ממתינות | pending | `#/students` | enrollments router ✅ |

`#/alerts` keeps the full seven-kind list. This card is a doorway to it, and ends with
`כל ההתראות ←`.

### 4. Today's classes — a table

Columns, inline-start to inline-end: `קבוצה` · `שעה` · `אולם` · `מאמן` · `רשומים`.
Enrolment renders as a `16/20` chip, not bare text. A class with no coach shows
`לא שובץ מאמן` in `--danger` **with** the danger word — the current board renders
uncovered sessions identically to covered ones, which spec `3a` already forbids.

Header carries the trailing action `לוח שבועי מלא ←`.

Uses the existing `Table` primitive.

### 5. Upcoming — exams and events

A short list. Each entry: name, date, place, and one count chip (`42 זכאים`,
`15 נרשמו`). Two entries maximum; the header's trailing action goes to `#/events`.

## States

| Screen state | What renders |
|---|---|
| **Loading** | Each region loads independently. A region that has not resolved shows a skeleton at its own height — the page never collapses and re-expands. |
| **Error, one region** | That region only shows `LoadFailed` with a retry. One failing endpoint must not blank the page. |
| **Error, all** | `LoadFailed` for the whole main column. `DashNav` still renders. |
| **Empty — no debt** | The money band still renders, with `0 ₪` and no danger colour. A studio with no debt is a **good** state, not an empty one. |
| **Empty — nothing needs attention** | Region 3 collapses to one line: `אין מה שדורש טיפול`. It is not hidden — its absence is information. |
| **Empty — no classes today** | `EmptyState` inside region 4, reading `אין שיעורים היום`. Saturdays are real. |
| **Dark mode** | Every token below has a dark value already. No new colour is introduced by this screen. |

## Tokens by role

| Role | Token |
|---|---|
| Page ground | `--ground` |
| Card surface | `--surface` |
| Stat tile value, debt | `--debt` |
| Stat tile value, collected | `--paid` |
| Alert row, danger severity | `--danger` on `--danger-tint` |
| Alert row, pending severity | `--pending` |
| Hairline between rows | `--border` |
| Section header trailing link | `--accent` |
| Card radius | `--radius-lg` |
| Gap between regions | `--space-6` |
| Gap inside a card | `--space-4` |

No hex is written in a component. No token is added by this screen.

## Primitives

**New — these belong in `packages/ui`, not in the dashboard app.** Each is the general
pattern, and the reason the rest of the product will stop looking assembled:

| Primitive | Why it is shared |
|---|---|
| `PageHeader` | Title + subtitle + actions in one row. Every dashboard screen needs it; today each one stacks its own. |
| `SectionHeader` | Bold title with an optional trailing link. Used five times on this screen alone. |
| `StatTile` | Label, value, sub-line, optional tone. The money band. |
| `ActionBar` | Buttons grouped with an alignment and a rank — start-aligned navigation, end-aligned primary. **This is the fix for `RolloverWizard.tsx:366`**, where a ghost and a secondary button sit 8px apart in an unaligned flex row with no `justify-content`. |

**Existing, reused unchanged:** `Card`, `Table`, `Button`, `StatusChip`, `MoneyDisplay`,
`EmptyState`, `LoadFailed`, `Icon`.

## i18n keys

All new keys land in `common.dash.home.*` in `he`, `en` and `ru`.
`web/packages/i18n/index.ts` is **not** touched — no new namespace.

Money and counts are **parameters**, never concatenated into a sentence. The shipped setup
banner already demonstrates the failure this avoids: it currently renders
`הקמת המועדוןעדיין לא הושלמההושלמו 1 מתוך 6 שלבים` — three strings joined with no
separator, visible on the first screen a manager sees.

## Gaps — what this screen cannot show yet

**Coverage needed no endpoint after all.** This section previously said it did. That was
wrong, and building the screen is what found it: `SessionRow` already carries `staff[]` and
`attendance_taken`, and `listSessions({from, to})` already pages a whole range. So both
counts `3a` asks for are derived from the week's sessions — `summariseSessions` in
`homeClient.ts` — with no new route, no new service and no migration. `GET
/api/v1/schedule/coverage` is not needed and should not be built.

Two rules that derivation has to keep, both held by tests:

- A **cancelled** session is not uncovered. A cancelled class needs no coach.
- A session that has **not ended yet** is not unmarked. A future class is not late.

**Enrolment count is the real gap.** `3a` and the Stitch draft both show `16/20` per class,
and `SessionRow` carries no roster size. The column is **absent** from region 4 rather than
faked; filling it means either a per-session roster read (one request per row, which this
screen will not do) or an enrolment count on the session payload.

## Open questions

1. Should `#/` become this screen, or should it live at `#/home` with `#/` still falling
   through to the calendar for a release? Changing the landing route changes muscle memory
   for every existing manager.
2. Region 5 overlaps `#/events`. If a manager never uses it, it is a candidate to cut —
   worth measuring before building the third and fourth regions.
