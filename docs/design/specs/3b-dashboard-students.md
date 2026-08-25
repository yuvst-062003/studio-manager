# `3b` — חניכים · the students table

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W2 · **M3 People & funnel** |
| **i18n namespace** | `people`, reading `health` and `billing` for two columns |
| **Slot** | none |

The manager's index of every student. Compare with [`4b`](4b-dashboard-groups.md), which has none of
this table's filtering.

## Regions

1. **DashNav** — imported, `active="members"`. See [`3a`](3a-dashboard-week.md#dashnav--the-shared-shell).
2. **Header bar** — title + subtitle (active · frozen) · spacer · search · export · add.
3. **Filter toolbar** — three dropdown pills (group · belt · coach) · a divider · two **alert filter
   chips** carrying counts (in debt · missing document) · spacer · a result count.
4. **Table header** — a select-all checkbox and seven column labels.
5. **Table body** — eight rows.
6. **Footer / bulk bar** — helper text · spacer · pagination.

## The table

| # | Column | Cell renders |
|---|---|---|
| 1 | `חניך` | a `BeltBar` swatch + the name |
| 2 | `קבוצה` | text |
| 3 | `מאמן` | text |
| 4 | `נוכחות 30 יום` | a threshold-coloured percentage — **not a chip** |
| 5 | `הצהרת בריאות` | a chip: valid · missing · expiring soon |
| 6 | `תשלום` | a chip: debt · paid · pending · standing order |
| 7 | `יתרה` | **money, an em dash, or the words `הוראת קבע`** |

Column 7 is the one that will break a naive implementation: it is not always a number.
`MoneyDisplay` takes `agorot: number`, so the cell needs a variant that renders text.

## States

| State | What renders |
|---|---|
| **Checkbox — checked / indeterminate** | **Not drawn**, on the header or any row. |
| **Filters — open** | **Not drawn.** Only the closed pills with a chevron. |
| **Alert chips** | Drawn permanently tinted. **Whether that is their active state or their only state is ambiguous** — there is no untinted counterpart to compare against. |
| **Search — typed / focused** | **Not drawn.** |
| **Sort** | **No sort affordance exists** — no caret on any header. |
| **Pagination** | Page 1 active, 2 and 3 outlined. **Neither chevron is disabled** even though page 1 is current. |
| **Empty / filtered to zero** | **Not drawn**, and `people.student.empty` and `student.emptyFiltered` both exist. |
| **Loading / error** | **Not drawn.** |
| **Bulk selection** | The footer's helper text is the "nothing selected" state, written as a static string. The selected state is not drawn. |

Every row is a click target **and** carries a checkbox, with no visual distinction between the two
hit areas. That needs resolving before build.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | header, toolbar, rows, footer |
| Ink | `--fg` | title, the primary button, the active page number |
| Secondary text | `--text-secondary` | group and coach cells, chevrons |
| Muted text | `--text-muted` | subtitle, placeholder, result count |
| Semantic — debt / missing | `--debt` / `--danger` | the debt chip and filter, the missing-document chip, low attendance |
| Semantic — pending | `--pending` | the pending chip, the expiring-soon chip, the missing-document filter, mid attendance |
| Semantic — paid / valid | `--paid` | the paid chip **and the valid-declaration chip** |
| Border | `--border` / `--border-strong` | hairlines, chip and control outlines |
| Belt | `belt_rank.color_hex` via `BeltBar` | column 1 |

No D8-retired grey on this artboard.

> **One token role is being asked to mean two things.** `--paid` renders both "this charge is paid"
> and "this declaration is valid". They are the same green and different concepts; a manager scanning
> the row reads one glyph twice. `tokens.roles.ts` classifies `--paid` as **semantic · status** with
> a specific note about the שולם chip. A health-validity role is not in D2's list. Either the token
> layer grows one, or the health column deliberately borrows `--paid` and that borrowing is written
> down. Do not decide it silently in a component.

> **▲ D7 — the export's belt helper rings only white.** `BeltBar` rings unconditionally, and its own
> header cites this artboard's failure modes. Use the primitive, not the helper.

## RTL

- The nav is on the right. Row layout is flex + `dir` with fixed cell widths — **no physical property
  appears inside `3b`'s own range.** The dashboard export's fourteen physical declarations live in
  sibling artboards (`3c`, `1e`, `3a`, the day-strip cards); `3b` is clean.
- **The first meaningful column is on the right**: the select-all checkbox is rightmost, `חניך` next,
  and `יתרה` — the flex-filled column — is leftmost.
- Each **filter pill** is label then chevron in DOM order, so the label sits at the reading start.
- **Must not mirror:** the percentages, the balances, the counts, the page numbers.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Belt swatch | `BeltBar` | With `secondaryColorHex` for bi-colour ranks. |
| Both chip columns | `StatusChip` | `ChipStatus` is `debt \| paid \| pending \| cancelled \| unmarked \| planned`. **`הוראת קבע` and the three document states map to none of them.** Either the enum grows or the table uses a second one. Finding. |
| Checkboxes | `Checkbox` | Header and row. Needs a checked and an indeterminate state. |
| Export / add | `Button` | `secondary` and `primary`. |
| Search | `TextField` | Needs a leading-icon slot — same gap as [`9h`](9h-staff-students-search.md). |
| Balance cell | `MoneyDisplay` | `agorot`, `tone`, `label`. **Must tolerate a non-numeric cell.** |
| Name cell | `StudentRow` | Its own docstring names `3b` as an intended consumer. It carries **one** status slot; this table needs two chips in separate columns plus four more cells. **`StudentRow` fits the name cell, not the row.** |
| Filter toolbar | *feature-specific* | No dropdown/select primitive and no count-badge chip among the 18. |
| Pagination | *gap* | **No pagination primitive.** |
| Attendance % cell | *feature-specific* | Threshold logic in `core`, not inline. |
| Table shell | *feature-specific* | |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `חניכים` | `people.student.plural` | exact |
| `214 פעילים · 6 מוקפאים` | `people.status.active` / `status.frozen` | The **composed subtitle has no key**; both counts need plurals. |
| `חיפוש לפי שם או הורה` | `people.student.search` (`חיפוש חניך`) | Too narrow — same as [`9h`](9h-staff-students-search.md). |
| `ייצוא` | `attendance.report.export` (`ייצוא`) / `reports.export` | **Two namespaces already carry it.** A generic export belongs in `common`. |
| `הוספת חניך` | `people.student.add` | exact |
| `קבוצה: הכל` / `חגורה: הכל` / `מאמן: הכל` | `people.student.group` · `events.belt.rank` · `schedule.session.coach` | The labels exist across three namespaces; **there is no "all" key** — `schedule.today.allCoaches` is the only one, and only for coaches. Finding. |
| `בחוב` | `billing.debt.title` (`תשלומים וגבייה`) / `charge.status.open` | **Cross-namespace (M6)**; no short "in debt" filter label. |
| `מסמך חסר` | `health.documents.missing` (`חסרות`) | **Cross-namespace (M4)**, wording differs. |
| `מציג 8 מתוך 214` | — | **No key.** Two interpolated counts. |
| `חניך` / `קבוצה` / `מאמן` | `people.student.one` · `student.group` · `schedule.session.coach` | exact |
| `נוכחות 30 יום` | `attendance.report.attendanceRate` (`אחוז נוכחות`) | **Cross-namespace (M5)**; the 30-day window has no key. |
| `הצהרת בריאות` | `health.declaration.title` | exact |
| `תשלום` / `יתרה` | `billing.charge.amount` (`סכום`) | **`יתרה` — a balance — has no key.** Finding. |
| `בתוקף` / `חסרה` / `פג בקרוב` | `health.badge.signed` (`הצהרה תקינה`) / `health.documents.missing` / — | **`פג בקרוב` has no key at all**, and it presumes an expiry — the same contradiction with `health.declaration.noExpiry` seen on `12j`, `2c` and `9c`. **Fourth artboard.** |
| `חוב` / `שולם` / `ממתין` / `הוראת קבע` | `billing.charge.status.open` (`פתוח`) / `charge.status.settled` (`שולם`) / `order.status.pending` / `method.standingOrder` | Three of four exist across two families; `חוב` maps to no exact key. |
| `בחרו שורות לפעולה קבוצתית — תזכורת תשלום, שיוך לקבוצה, בקשת מסמך` | — | **No key**, and it names three bulk actions none of which is drawn. |

## Findings for the lane

1. **▲ `פג בקרוב` is the fourth artboard to assume declarations expire**, against
   `health.declaration.noExpiry`. This is now a pattern, not a slip.
2. **`ChipStatus` does not cover this table.** Standing-order and the three document states have no
   member. `4b` needs danger; `11b` needs trial. **Settle the enum in the W2 contract commit** —
   it is a shared primitive and no lane may widen it alone.
3. **`--paid` is doing double duty** as "settled" and "valid declaration".
4. **The balance column is not always money.**
5. **No sort, no filter-open state, no checked checkbox, no empty state, no pagination primitive.**
6. **Row click and row checkbox share one hit area** with no visual distinction.
7. **"All" has no key** for group or belt filters, only for coaches.
8. **`ייצוא` lives in two namespaces**; it belongs in `common`.
