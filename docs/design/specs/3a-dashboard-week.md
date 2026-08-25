# `3a` — לוח שבועי · the dashboard week grid

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` + `DashNav.dc.html` |
| **Wave · lane** | W2 · **M2 Schedule** |
| **i18n namespace** | `schedule` |
| **Slot** | none — but see **DashNav** below, which is shared shell |

D5's calendar, in its default view. Three views only — day, week, month — with week the default.

## Regions

1. **DashNav** — imported, not inlined: `<dc-import name="DashNav" active="calendar">`, 236×900.
   It lives in its own file and **every dashboard artboard imports the same one**. Build it once.
2. **Main column**
   1. **Top bar** — title · view switcher · "today" · date-range label · search · primary CTA.
   2. **"What's missing this week" strip** — three status indicators.
   3. **Week header** — a time-gutter corner cell, then six day-header cells.
   4. **Week grid** — time gutter column + six day columns × four hour rows; each cell holds 0–1 blocks.

### DashNav — the shared shell

Eleven items in three labelled sections plus a standalone one, a studio switcher above and a user
row below. `active` is a single enum: `calendar | attendance | messages | members | groups | belts
| staff | payments | documents | reports | settings`.

**Badges come in three kinds and the distinction must survive the port:** a dashed pending pill
(attendance, documents), a solid danger pill (payments), and a plain muted number with no pill
(members, events). Collapsing them into one badge loses the severity the manager reads at a glance.

Section labels: `יומיום` · `מועדון` · `כספים ומסמכים`. Items, in order:
`לוח שבועי` · `נוכחות` · `הודעות` — `חניכים` · `קבוצות ומחזורים` · `אירועים ותחרויות` ·
`חגורות ומבחנים` · `צוות` — `תשלומים וגבייה` · `מסמכים והצהרות` · `דוחות` — `הגדרות`.

## States

Session block, five drawn:

| Block state | Treatment |
|---|---|
| **Completed** | Plain card, hairline border, success dot. |
| **Current / open** | Bold ink border plus a soft ink ring. |
| **Unmarked** | Dashed pending border, pending dot, pending coach text. |
| **Uncovered** | Solid danger border, danger dot, coach text reads "no coach". |
| **Cancelled** | Ink-tinted fill, struck-through title, cancelled dot. |

| Screen state | What renders |
|---|---|
| **Empty week** | **Not drawn.** A week with no sessions is real — a closure week, a new studio. Use `EmptyState`. |
| **Loading** | **Not drawn.** |
| **Error** | **Not drawn.** |
| **Empty grid cell** | Drawn as a bare bordered cell with **no "add a session here" affordance**. The only way to create a session is the top-bar CTA. That is a decision, not an omission to fix silently.|

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page; also, deliberately, the search field's recessed fill |
| Surface | `--surface` | top bar, missing-strip, week header, gutter, default block |
| Ink | `--fg` | title, selected segment fill, active nav item fill, primary CTA fill |
| On-ink | `--on-fg` | the selected segment's and active nav item's label |
| Secondary text | `--text-secondary` | unselected segments, block time line, coach label |
| Muted text | `--text-muted` | the missing-strip label, search placeholder, day numbers, hour labels, plain nav badges |
| Semantic — uncovered | `--danger` | the no-coach indicator, block and nav badge |
| Semantic — unmarked | `--pending` | the unmarked indicator, block and nav badges |
| Semantic — completed | `--paid` | the default block dot |
| Semantic — cancelled | `--cancelled` | the cancelled indicator and the cancelled block's dot |
| Border | `--border` / `--border-strong` | dividers, outlines, the segmented track |
| Belt | — none. The grid shows group, time and coach, never a student. |

> **▲ D8/D12 — the retired grey is on this artboard too.**
> `3a` draws the cancelled indicator and the cancelled block's dot in `#7a766d`, the grey D8
> retired outright. D12 records that correction **only for `4h`**; it is not a `4h` quirk.
> `--cancelled` supersedes it here exactly as it does there. (`4b` carries a third instance —
> see that spec.) The token layer already holds the right value; nothing needs re-deciding,
> but nobody should port a hex from this artboard.

## RTL

- **The nav is on the right.** It is the first flex child of a `dir="rtl"` row; no `row-reverse`.
- **The week runs right-to-left**: Sunday is the rightmost column, Friday the leftmost. Today's
  column carries a faint tint.
- **There is no next/previous-week control drawn.** Where paging chevrons would sit there is only a
  static date-range label and the "today" button. The lane has to add paging and decide its direction.
- **Four physical CSS declarations do directional work here**, and every one must become logical:
  the gutter's corner-cell border and body-column border, the per-day-column border on the first
  five of six, the day-number's spacing from the day-letter, and DashNav's own outer border.
  All are `border-left` / `margin-right` today; all are `border-inline-end` / `margin-inline-start`.
  They render correctly *only* because the canvas is RTL-only. This is D10's exact case.
- **Must not mirror:** hour labels, day numbers, block time ranges, badge counts.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| View switcher | `SegmentedControl` | Three options. D5 caps it at three; do not add Arbox's other two. |
| "today", primary CTA | `Button` | `secondary` and `primary`. |
| Search | `TextField` | Needs a leading-icon slot. |
| Session block | `Card` + a status variant | Five variants is beyond a plain `Card`. Build `ScheduleBlock` in the schedule vertical, on top of `Card`. |
| Nav badges | `StatusChip` | The dashed-pending and solid-danger pills map to `pending` and… **`ChipStatus` has no danger member.** Same gap as `9a` finding 2. The plain muted numbers are not chips at all. |
| Week grid | *feature-specific* | `WeeklyScheduleGrid`. No primitive is a scheduling matrix. |
| Missing-this-week strip | *feature-specific* | Three dot+label indicators, **not clickable** in the export — status, not filters. |
| DashNav | *app shell* | Built once, `active` as a prop. Imported by every dashboard artboard. |
| Dashboard top bar | *app shell* | The same shape recurs on `3b` and `3c`. Build once. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `לוח שבועי` | `schedule.week.title` | exact — and it is also the nav item's label |
| `יום` / `שבוע` / `חודש` | `schedule.view.day` / `.week` / `.month` | exact |
| `היום` | `schedule.week.today` | exact |
| `23–29 באוגוסט 2026` | — | Data. Format via `core/datetime`. |
| `חיפוש חניך, קבוצה או מאמן` | — | **No key.** `people.student.search` is `חיפוש חניך` — narrower than this three-way search. Finding. |
| `שיעור חדש` | `schedule.session.addAdHoc` (`הוספת שיעור חד־פעמי`) | **Wording differs and the meaning may too** — is the CTA an ad-hoc session, or a new recurring rule? `schedule.rules.add` is the other candidate. Decide. |
| `מה חסר השבוע` | — | **No key.** Finding. |
| `2 שיעורים ללא מאמן` | `schedule.session.noCoach` | The label exists; the **count wrapper does not**. |
| `4 מפגשים ללא סימון נוכחות` | `attendance.roster.unmarkedCount` (`לא סומנו {{count}} חניכים`) | **Unit mismatch** — the key counts students, the strip counts sessions. `attendance.report.unmarkedSessions` (`שיעורים שלא סומנו`) is the right concept but carries no count. |
| `1 בוטל` | `schedule.session.status.cancelled` | The label exists; the count wrapper does not. |
| `ללא מאמן` (inside a block) | `schedule.session.noCoach` | Wording differs. |
| Nav labels | *see DashNav above* | `schedule.week.title` · `attendance.roster.title` · `comms.announcement.title` · `people.student.plural` · `events.title` · `events.belt.title` · `billing.debt.title` · `health.documents.title` · `reports.title` all exist and cover nine of eleven. **`קבוצות ומחזורים` and `צוות` and `הגדרות` have no key** — groups/cycles, staff and settings are M1's and M2's, and none of the nine namespaces carries them. Finding. |
| Group names, coach names, times | — | Data. |

## Findings for the lane

1. **The retired grey `#7a766d` is on this artboard, twice.** D12 records the correction only for
   `4h`. Widen the note or people will assume `4h` was the only case.
2. **There is no week-paging control.** Design it and decide its RTL direction.
3. **Four physical CSS declarations** do directional work. Named above.
4. **`שיעור חדש` is ambiguous** between an ad-hoc session and a schedule rule.
5. **Three nav labels have no key**: groups/cycles, staff, settings.
6. **The unmarked count's unit disagrees** with the only key that counts.
7. **DashNav is shared shell.** If each dashboard page is ported independently it will be built
   eleven times. Build it once, before any dashboard lane starts.
