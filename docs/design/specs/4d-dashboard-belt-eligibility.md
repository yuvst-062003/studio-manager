# `4d` — מבחן חגורה · eligibility and group promotion

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W4 · **M7 Events & belts** |
| **i18n namespace** | `events` |
| **Slot** | none |

## Regions

1. **DashNav** — imported, `active="belts"`.
2. **Header bar** — title (exam name · date) · subtitle (venue · examiner · candidate count) ·
   spacer · a parent-invitations button · **a primary confirming promotion for the selected**.
3. **Stat strip** — four cards: eligible · missing attendance · blocked · **the threshold rule itself**.
4. **Table header** — a master checkbox and six columns.
5. **Table body** — five candidate rows.

## How eligibility is computed and shown

The threshold card states the rule in plain text: **80% attendance and four months at the current
rank.** Per row, the evidence is broader than that:

| Column | Shows |
|---|---|
| current → next | **swatches only — no rank name anywhere on the artboard** |
| attendance | a percentage, in `--danger` below the threshold |
| tenure at rank | months, plain text — **§5.9's actual criterion** |
| blockers | **free text**: a missing-attendance count, a debt plus a missing declaration, or a note that a federation approval is needed |
| readiness | a derived chip: ready · does not meet the conditions · **blocked** |

> **▲ So promotion is gated on four things and §5.9 names one.**
> `events.exam.eligibleHint` reads *eligibility is computed from the current rank and time held*.
> This screen also gates on **attendance** (fifth artboard — `5d`, `5b`, `12d`, `2d`, here), on
> **outstanding debt**, and on **a missing health declaration**.
>
> Debt and health as promotion blockers are new and are **cross-lane**: M6's balance and M4's
> declaration deciding an M7 outcome. `6b` makes it a configurable switch. Neither has a model, a key
> or a §-line. **Settle §5.9 before M7 builds any of the three.**

Note also the fifth row: a **non-blocking** note — a federation approval is needed — on a row still
marked ready and still checked. So blockers have two severities and the column does not distinguish them.

## Group promotion

Row checkboxes plus a master checkbox; the primary button promotes **everyone currently selected**, its
label carrying the count. By default the eligible rows are pre-checked and the ineligible ones are not.

**There is no confirmation.** The button's label does the rhetorical work — *confirm promotion for N
selected* — but there is no second step, no summary, and no success feedback.
`events.belt.groupPromote` and `groupPromoteHint` (`קידום כל המועמדים שעברו, בפעולה אחת`) both exist.

Two details to fix rather than copy:

- **The master checkbox is drawn filled but without a check** — that reads as an indeterminate state
  and is more likely a mock gap. `Checkbox` needs a real indeterminate.
- **A blocked row's checkbox looks identical to a merely-ineligible row's.** A student blocked by debt
  or a missing declaration is selectable. **Should a blocked row be selectable at all?**

## ▲ Pass and fail are not on this screen, and the screen promotes anyway

There is **no pass/fail control** here — that is [`9d`](9d-staff-belt-exam.md), the coach's side.

But the model this artboard implies is: *eligible* pre-selects candidates, and one button **confirms
and executes promotion** to the rank in the "next" column, for whoever is checked at that moment.
**It conflates eligibility with the promotion decision**, and there is no visible step where an actual
exam result is recorded or read.

§5.9 makes a pass write the result, the belt row and the cache in one transaction. **Where does the
result enter, and does this screen read it or bypass it?** Nothing on the artboard says. That is the
question to settle, and it is a model question, not a UI one.

## States

| State | What renders |
|---|---|
| Row checkbox | Checked on three, unchecked on two. **No disabled state**, including on the blocked row. |
| Master checkbox | A filled box with no check — see above. |
| Readiness chip | Three: ready · not meeting the conditions · blocked. |
| **Empty** | **Not drawn.** An exam with no eligible candidates is exactly what a manager checks for. |
| **Loading / error** | **Not drawn**, on a screen that writes belt rows in bulk. |
| **After promotion** | **Not drawn.** No success, no summary, no undo. |

The header claims seventeen candidates; the tiles sum to seventeen; **five rows are drawn**, in a body
with no scroll affordance. The real component needs paging or scrolling for the other twelve.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | header, stat cards, rows |
| Ink | `--fg` | primary text, the primary button's fill, the checked box |
| Secondary text | `--text-secondary` | stat labels, tenure |
| Muted text | `--text-muted` | the subtitle, column headers, the non-blocking note — **at D8's floor** |
| Semantic — eligible | `--paid` | the tile and the ready chip |
| Semantic — missing attendance | `--pending` (**dashed**) | the tile and chip |
| Semantic — blocked | `--danger` (+ tint) | the tile, the chip, and every sub-threshold percentage |
| Border | `--border` / `--border-strong` | hairlines |
| Belt | `belt_rank.color_hex` via `BeltBar` | two per row — **data** |

No D8-retired grey. **No bi-colour belt appears here**, unlike `5b`, `5d`, `9d` and `12d`.

> **▲ D7 — only the near-white swatch is ringed.** Yellow appears **twice, bare**, in both a current
> and a next position. `BeltBar` rings unconditionally.

## RTL

- Nav on the right; column order falls out of `dir` plus flex, with no `row-reverse`.
- **No physical CSS property in `4d`'s own range** — spacing is symmetric or vertical only.
- **The transition chevron is a hard-coded path** pointing toward the reading direction. Correct here;
  it will not flip for `en`/`ru`. Feed the icon a logical direction.
- **Must not mirror:** every percentage, every month count, every stat figure, the debt amount.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Both header buttons | `Button` | `secondary` and `primary` with an interpolated count. |
| Checkboxes | `Checkbox` | **Needs a real indeterminate**, and a decision about disabling blocked rows. |
| Readiness chips | `StatusChip` | Three tones. **`ChipStatus` has no danger member**, and *blocked* is one. |
| Stat cards | `Card` + feature content | The seventh artboard with this tile shape. **Extract once.** |
| Belt swatches | `BeltBar` | Ringed. |
| The debt figure in a blocker | `MoneyDisplay` | Currently plain inline text. |
| **Belt transition** | *feature-specific → promote* | Two `BeltBar`s plus a directional chevron. **It also appears on [`9d`](9d-staff-belt-exam.md) and [`12d`](12d-parent-belt-progress.md).** Three artboards — build `BeltTransition` once. |
| Eligibility table | *feature-specific* | **`StudentRow` covers the name cell only** — this row carries five more columns. |
| Empty state | `EmptyState` | Required; not drawn. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `מבחן חגורה · 12.09.2026` | `events.exam.title` | The date is data. |
| `אולם א׳ · בוחן: אלון מזרחי · 17 מועמדים` | `events.form.location` + `events.exam.candidates` | Composed; **and `בוחן` is masculine** where `9d`'s sibling row says `בוחנת`. **The examiner's role label is gendered and has no key.** Finding. |
| `הזמנות להורים` | `events.publish` | **Publishing ≠ inviting.** Third artboard. |
| `אישור קידום ל־9 שנבחרו` | `events.belt.groupPromote` (`קידום קבוצתי`) | The label exists; **the count wrapper does not**, and `groupPromoteHint` — *promote everyone who passed, in one action* — **is not drawn.** Note the key says *who passed*; this screen selects on *eligibility*. Finding. |
| `עומדים בתנאים` / `9` | `events.exam.eligibility` (`זכאות`) | Wording differs; no count wrapper. |
| `חסרה נוכחות` / `5` | `attendance.report.attendanceRate` | **Cross-namespace (M5)**, no key. |
| `חסום — חוב או מסמך` / `3` | `billing.debt.title` + `health.documents.missing` | **▲ No key, and it spans three lanes in four words.** |
| `תנאי סף` / `80% נוכחות · 4 חודשי ותק` | `events.exam.eligibleHint` | **The key names rank and tenure; the value names attendance and tenure.** They do not agree. |
| `חניך` / `חגורה נוכחית → הבאה` / `נוכחות` / `ותק בחגורה` / `חסמים` / `מוכנות` | `people.student.one` · `events.belt.current` + `belt.next` · `attendance.roster.title` · — · — · — | **Three of six column headers have no key**: tenure, blockers, readiness. |
| `מוכנה` / `מוכן` | — | **▲ No key, and it is gendered per student.** Hebrew agreement, on a status. **Fifth artboard** with a gender problem, and the first where a *status value* inflects. Finding. |
| `לא עומד בתנאים` | `events.exam.notEligible` (`טרם זכאי`) | Wording differs. |
| `חסום` | — | **No key.** |
| `חסרות 6 נוכחויות` | — | **No key**; a count with Hebrew agreement. |
| `חוב 320₪ · הצהרה חסרה` | `billing.openDebts.total` + `health.badge.missing` | **Cross-namespace, twice, in one cell.** |
| `דורש אישור איגוד` | — | **▲ No key, no model.** A **federation approval** — an external body's sign-off on a promotion — appears nowhere in §5.9 or §4.3. Finding. |

## Findings for the lane

1. **▲ Promotion is gated on four things and §5.9 names one.** Rank and tenure are the spec's;
   attendance, **outstanding debt** and **a missing health declaration** are the artboard's. Debt and
   health are cross-lane gates with no model. Settle §5.9 before M7 builds any of them.
2. **▲ Eligibility and the promotion decision are conflated**, and no exam *result* enters anywhere on
   this screen. §5.9 makes a pass the thing that writes the belt row.
3. **▲ A federation approval has no model**, and it is drawn as a non-blocking blocker.
4. **Blockers have two severities** and one column.
5. **A blocked row is selectable**, and its checkbox is indistinguishable from an ineligible one.
6. **No confirmation and no result state** for a bulk write to belt rows.
7. **`מוכן`/`מוכנה` inflects per student** — the first gendered *status value* in the product.
8. **`BeltTransition` is wanted by three artboards.** Build it once.
9. **The stat-tile shape is on its seventh artboard.**
10. **Yellow is bare, twice.**
