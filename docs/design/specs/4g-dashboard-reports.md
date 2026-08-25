# `4g` — דוחות · retention, revenue and attendance, without colourful charts

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W5 · **M9 Reports & privacy** |
| **i18n namespace** | `reports` |
| **Slot** | none |

## Regions

1. **DashNav** — imported, `active="reports"`.
2. **Header bar** — title · a three-way period switcher · spacer · a CSV export button.
3. **KPI strip** — four cards: active students · monthly churn · average monthly revenue ·
   average attendance. Each is a **bare number plus a delta line**.
4. **Report body**
   - **Left panel** — `הכנסות מול חוב`: a twelve-month **stacked bar chart** with a legend.
   - **Right column** — two cards: `שימור לפי ותק` (four horizontal bar rows and a footnote), and
     `קידומי חגורה בעונה` (a seven-bar belt chart).

## "Without colourful charts" — the constraint holds, with one deliberate exception

D3's restraint applied to data display, and it survives almost everywhere:

| Figure | Rendered as | Colour |
|---|---|---|
| Active students | a bare number + delta | `--paid` on the delta only |
| Monthly churn | a bare number + delta | `--danger` on the delta only — it is over target |
| Average monthly revenue | a bare number + delta | **none** — plain secondary |
| Average attendance | a bare number + delta | **none** |
| Revenue vs debt | a **twelve-segment stacked bar chart** | **ink and one accent** — collected in `--fg`, debt in `--danger`. No y-axis, no per-bar labels, no tooltip. |
| Retention by tenure | four **horizontal bar rows** with printed percentages | three ink, one `--danger` — the weakest bucket |
| Belt promotions | a **seven-bar vertical chart** | **each bar in its belt's own colour** |

**No sparklines. No data table.** Colour is semantic everywhere except the last chart — and that
exception is defensible: **belt colours are data (D3, §5.9), not decoration**, and a promotions chart
whose bars are not belt-coloured would be harder to read, not more restrained.

**But flag it loudly for whoever ports it**, because it is the one place the monochrome-plus-one-accent
rule is knowingly broken — and because **the belt chart carries no value labels at all.** A manager
can compare bar heights and cannot read a promotion count off it. Add the numbers.

## §5.14's unmarked-is-not-absent rule — not stated, and not visible either

Attendance appears as **one aggregate KPI** — a percentage with a no-change delta. There is no
breakdown by status, no legend separating unmarked from absent, and no copy asserting the rule.

`reports.attendance.unmarkedExcluded` (`שיעורים שלא סומנו אינם נספרים כהיעדרות`) exists **and nothing
uses it.** [`4c`](4c-dashboard-attendance.md) at least *encodes* the rule in its attendance strip
while never stating it; `4g` neither states nor shows it, and it is the screen that publishes the
number. **Whatever guarantees §5.14 has to live in the metric's definition**, and the screen should
say so beside the figure.

`reports.operational.sessionsHeld` (`שיעורים שהתקיימו מול מתוכננים`) exists for the same purpose and
is also unused.

## ▲ §11's privacy kit has one CSV button and no artboard

W5 gives a data-export request five states — pending, running, completed, **expired**, failed — and
`expired` is distinct from `failed` on purpose: §11.3 promises a **time-limited link**, and an expired
export is not a failed one; the remedy is asking again, not an investigation.

**The artboard draws a single `ייצוא CSV` button with one visual state.** No request, no processing,
no ready-to-download, no expiry note, no download history. Nothing resembling the five-state model.

And `reports` carries **the entire `privacy.*` family** — twenty-nine keys across four §11 sections:

- **§11.3 export** — `privacy.export.title`, `.description`, `.request`, `.requested`, the five
  `status.*` values, `.download`, **`.linkExpires`**, `.requestAgain`, `.preparingHint`;
- **§11.4 anonymization** — `.title`, `.action`, `.confirm`, `.done`, **`.whatHappens`**,
  **`.whatRemains`** (*billing and payment records are kept as the law requires, without a name*),
  **`.irreversible`**;
- **§11.5 retention** — `.title`, `.setting`, `.months`, `.preview`, `.previewCount`, `.exempt`,
  `.exempted`, `.empty`;
- **§11.6 consent** — `.title`, `.version`, `.givenAt`, `.revoke`, `.revokedRecorded`, five
  `type.*` values, and the three `photo.*` values.

**Twenty-nine keys, no artboard.** §11's whole kit — export, anonymization, retention, consent — has
no design anywhere in the canvas. **Treat `ייצוא CSV` here as a simple synchronous action**, not the
W5 request object, and design the privacy screens from §11 and the model. This is the second-largest
design gap the specs surfaced, after [`4f`](4f-dashboard-announcements.md)'s delivery report.

## States

| State | What renders |
|---|---|
| **Period switcher** | One selected, two unselected. |
| **Export button** | One state. No in-flight, no ready, no error. |
| **Everything else** | **Read-only.** No KPI card, no chart, no retention row carries a pointer. |
| **Empty — no data for the period** | **Not drawn**, and `reports.empty` (`אין נתונים לתקופה שנבחרה`) exists. Selecting a season a studio did not operate in lands here. |
| **Loading / error** | **Not drawn.** |

The artboard is **fully static** — every number is hardcoded, with no data bindings and no placeholder
count, so not even a skeleton hint exists.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | all four KPI tiles and both report panels |
| Ink | `--fg` | primary text, **the collected segment of the revenue chart**, three retention fills, the selected segment's fill, the black belt's bar |
| On-ink | `--on-fg` | the selected segment's label |
| Secondary text | `--text-secondary` | row labels, the chart subtitle |
| Muted text | `--text-muted` | month-axis labels, legend text, neutral deltas — **at D8's floor** |
| Semantic — positive | `--paid` | one delta |
| Semantic — negative / debt | `--danger` | one delta, the debt segments, the weakest retention bar, the sub-threshold figures |
| Border | `--border` / `--border-strong` | card outlines, the progress track, the segmented track |
| Belt | `belt_rank.color_hex` via `BeltBar` | the seven promotion bars — **data** |

No D8-retired grey inside `4g`'s range.

> **▲ D7 — one of seven bars is ringed.** Only the near-white bar carries a border. **The black bar
> is bare** — and D7's own table names black-on-dark as invisible at 1.02:1, so in dark mode this
> chart loses a bar entirely. Brown and green fail there too (D12). `BeltBar` rings unconditionally.
>
> **And this chart is not a `BeltBar`.** It is a *distribution* — how many students reached each rank —
> not one student's identity strip. It must draw from the same palette and obey the same ring, in its
> own component. Same distinction as [`6b`](6b-dashboard-belt-exams.md)'s outcome strip.

## RTL

- Nav on the right. The header uses a `flex: 1` spacer, not a float — logical and correct.
- **The revenue chart runs right-to-left**: the earliest month at the reading start, the latest at the
  end, purely by inheritance. **The trend reads oldest-to-newest in reading order.** Do not reverse it.
- **The retention bars fill from the inline start** — the right — automatically, with no positioning.
- **The belt chart runs right-to-left too**: the lowest rank at the reading start, the highest at the
  end. Low-to-high in reading order.
- **No physical CSS property inside `4g`'s range** — every match in the export belongs to other
  artboards. This is one of the cleanest.
- **Must not mirror:** every KPI figure and delta, every percentage, every month label.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Period switcher | `SegmentedControl` | Three options. Exact fit. |
| Export | `Button` | `variant="secondary"`. |
| KPI tiles, both panels | `Card` | |
| The two money figures | `MoneyDisplay` | Agorot in (G2). |
| Retention rows | `ProgressBar` | `label`, `value`, `max`, `readout` — track, fill and printed percentage, exactly. |
| Empty state | `EmptyState` | Required; not drawn. |
| **Stat tile** | *feature-specific* | Label · a large figure · a coloured or neutral delta. **The tenth artboard with this shape.** See the README's finding 26. |
| **Stacked bar chart** | *feature-specific* | Twelve two-tone columns, axis labels, a legend. **No charting primitive exists**, and none should be generic — build it in `reports`. |
| **Belt-distribution chart** | *feature-specific* | Seven bars in belt colours, with the D7 ring, drawing from the same palette as `BeltBar`. **Not `BeltBar` itself.** |
| **Legend row** | *gap* | A swatch plus a label. Small, and shared by both charts. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `דוחות` | `reports.title` | exact |
| `חודש` / `עונה` / `שנה` | `reports.period.thisMonth` (`החודש`) / — / — | **▲ Only one of three has a key, and it does not match.** `reports.period.*` has `thisMonth`, `lastMonth`, `last12Months` and `custom` — **four values, none of which is *season* or *year*.** The switcher and the period enum are different taxonomies. And `period.custom` implies a range control this screen does not have. Finding. |
| `ייצוא CSV` | `reports.export.csv` (`ייצוא ל-CSV`) | Near-exact — **and `export.xlsx` and `export.ready` exist and are unused.** |
| `חניכים פעילים` / `214` / `+18 מתחילת העונה` | `reports.overview.activeStudents` | The label is exact; **the delta has no key**, and it references *the season* again. |
| `נשירה חודשית` / `3.2%` / `מעל היעד (2.5%)` | `reports.operational.dropouts` (`עזיבות`) | Wording differs — *churn* vs *departures* — and **a target has no key and no model.** A configurable churn target is a setting nobody has specified. Finding. |
| `הכנסה חודשית ממוצעת` / `64,800₪` / `303₪ לחניך` | `reports.financial.collected` (`נגבה`) | **Neither the label nor the per-student delta has a key.** *Average revenue* is not *collected*. |
| `נוכחות ממוצעת` / `84%` / `ללא שינוי` | `reports.operational.attendanceRate` (`אחוז נוכחות`) | Near — **and see the §5.14 section: this is the figure that needs `attendance.unmarkedExcluded` beside it.** `ללא שינוי` has no key. |
| `הכנסות מול חוב` | `reports.financial.collectedVsExpected` (`נגבה מול צפוי`) | **▲ Different comparison.** The key compares collected against **expected**; the chart compares collected against **debt remaining**. Those are not the same number, and `financial.debtByPayer` exists as a third. Finding. |
| `ספטמבר 2025 – אוגוסט 2026` | `reports.financial.trend12m` (`מגמה — 12 חודשים`) | The concept exists; the range is data. |
| the twelve month labels | — | Data, via `core/datetime`. |
| `נגבה` / `נותר בחוב` | `reports.financial.collected` / `billing.debt.total` | The first exact; **the second is M6's key on M9's chart legend.** |
| `שימור לפי ותק` | — | **▲ No key.** `reports` has a `funnel.*` family and an `atRisk.*` family and **nothing about retention** — which is one of the three things the artboard's own title names. Finding. |
| the four tenure buckets | — | **No keys**, and they are a **bucket enum** — `billing.debt.aging.*` models exactly this shape for debt and nothing does for tenure. |
| `רוב הנשירה מתרחשת בשלושת החודשים הראשונים — שם כדאי למקד מעקב.` | — | **No key**, and it is an **insight**, not a label — a sentence derived from the data. Whether insights are authored copy or generated text is a product decision. Finding. |
| `קידומי חגורה בעונה` | `events.belt.awarded` (`הדרגה הוענקה`) | **Cross-namespace (M7)**; no aggregate key. |
| the seven belt labels | `belt_rank` data | Not copy — [`5b`](5b-dashboard-belt-system.md) lets the manager rename them. |

**Fifteen `reports` keys are unused by this artboard** and describe screens that do not exist:
the whole `funnel.*` family (nine keys — §5.14's enrolment funnel), `atRisk.*` (six — which
[`4c`](4c-dashboard-attendance.md) renders on M5's screen instead), and most of `financial.*`.

## Findings for the lane

1. **▲ §11's privacy kit — twenty-nine keys across export, anonymization, retention and consent —
   has no artboard.** The five-state export request, the time-limited link, the *what is deleted and
   what the law makes us keep* pair: all specified, none designed. Design from §11.
2. **▲ The period switcher and `reports.period.*` are different taxonomies.** Month/season/year
   versus this-month/last-month/last-12-months/custom.
3. **▲ The revenue chart compares collected against *debt*, and the key compares against *expected*.**
   Two different numbers under one heading.
4. **Retention is in the title and has no key family**, and its buckets are an unmodelled enum.
5. **§5.14's unmarked-is-not-absent rule is neither stated nor visible**, on the screen that publishes
   the attendance number. Two keys exist for it.
6. **The belt chart has no value labels**, and its black bar is unringed — invisible in dark mode.
7. **A churn target is displayed and unmodelled.**
8. **The insight footnote is a derived sentence.** Authored or generated — decide.
9. **The funnel and at-risk families — fifteen keys — describe screens that do not exist**, and `4c`
   renders at-risk on M5's screen instead.
10. **No empty state**, and selecting an unworked period lands in it.
