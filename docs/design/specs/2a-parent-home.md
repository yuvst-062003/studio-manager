# `2a` — בית · the parent's home, with a day strip

| | |
|---|---|
| **Surface** | Parent app · 390×844 · light only |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W3 · **M5 Attendance** (the agenda is M2's data) |
| **i18n namespace** | `attendance`, plus `schedule` and `billing` |
| **Slot** | none |

The parent's landing screen: read forward and back through a week, one row per lesson per child.

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — a back-to-today control at the reading start, the page title at the end.
3. **Day strip** — a rounded `Card` holding **seven** day cells in a flex row.
4. **Strip meta line** — the selected day's title, and a lesson/child count.
5. **Debt + health banner** — **conditional: rendered only when the selected day is today.**
6. **Agenda region**
   - **Empty-day state** — conditional, and **actually drawn**: icon · title · a next-lesson line.
   - **Agenda rows** — a time gutter, then a card with a belt swatch, a child name, a group, and a
     trailing status chip. **Rows sharing a time hide the repeated time label**, so concurrent
     lessons read as one merged block.
7. **Tab bar** — four tabs, with an unread badge on messages.

## States

The **day strip has exactly two cell states — selected and unselected. Past and future look
identical.** Whether a day already happened is communicated only downstream, by the agenda row's chip:

| Row chip | Meaning |
|---|---|
| in progress | today, now |
| planned | future |
| attended | past |
| did not attend | past |
| notified in advance | past, pre-reported by the parent — **dashed border**, no fill |

| Screen state | What renders |
|---|---|
| **Empty day** | **Drawn** — the only artboard in W2/W3 that draws one. Icon, title, and a "next lesson is…" line. |
| **Loading** | **Not drawn.** |
| **Error** | **Not drawn.** |
| **Offline** | **Not drawn**, though `attendance.network.*` models four states. |
| **Today control** | Two states: muted when already on today, emphasised when viewing another day. Good — it tells you *why* it is there. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | the strip container, agenda cards, the banner, the empty state, the tab bar |
| Ink | `--fg` | headings, the selected day's fill, ink-filled buttons, the active tab |
| On-ink | `--on-fg` | the selected day's numeral |
| Secondary text | `--text-secondary` | the empty state's next-lesson line |
| Muted text | `--text-muted` | day letters, the meta line, the muted today control, inactive tabs — **at D8's floor** |
| Semantic — debt / absent | `--danger` (+ `--danger-tint`) | the banner's icon, text and border; the "did not attend" chip |
| Semantic — in progress / notified | `--pending` | the in-progress chip; the dashed notified chip |
| Semantic — attended | `--paid` | the attended chip |
| Semantic — planned | `--cancelled` / `--border` | the neutral outline chip |
| Belt | `belt_rank.color_hex` via `BeltBar` | the agenda row's swatch |

No D8-retired grey.

> **▲ D7 — the row's belt swatch is fill-only.** The export's helper rings only white. `BeltBar`
> rings unconditionally. Use the primitive.

## The debt banner — D2's most important alert

> `חוב 320₪ · הצהרת בריאות לנועה חסרה` · action: `טיפול`

Two things to fix before this ships:

1. **It conflates two concerns behind one action.** A debt (M6) and a missing health declaration
   (M4) are different problems with different fixes, and the button says only "handle it". The CTA
   has **no wired destination** in the export. §5.5's declaration gate and §5.10's payment flow are
   different screens.
2. **It is rendered only when the selected day is today.** Page to tomorrow and the club's most
   important alert disappears. D2 exists because branding must never swallow the debt banner; a
   date filter swallows it just as effectively. **The banner should not depend on the strip.**

It also does not name whose debt it is, where the sibling artboard `1b` does.

## RTL

- **The day strip runs past→future right-to-left**, which is the natural RTL reading direction. The
  array is chronological and the flex row is plain — **do not reverse it or force LTR.**
- **The unread badge on the messages tab is positioned with a physical `left` offset.** In a mirrored
  locale it lands on the wrong side of the icon. → `inset-inline-start`. D10's case.
- No prev/next chevrons exist anywhere — "reading forward and back" means tapping one of the seven
  visible cells. There is no paging control and no horizontal scroll affordance.
- **Must not mirror:** the money amount, the times, the day numerals, the badge count.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Debt banner | `Alert` | `tone="danger"`, with `iconLabel`. Its action is a `Button`. |
| Row status chips | `StatusChip` | Five states. `paid` / `danger`… **`ChipStatus` has no danger member** — see the README's cross-cutting finding 3. |
| Belt swatch | `BeltBar` | |
| Agenda row | `StudentRow` | Belt + name + group subline + a trailing status. **Near-exact fit** — this is the closest `StudentRow` gets to its intended shape anywhere in W2/W3. |
| Empty day | `EmptyState` | `title`, `description`. The next-lesson line is the description. |
| Today control, the banner's action | `Button` | |
| Cards | `Card` | |
| The debt amount | `MoneyDisplay` | **Inline, mid-sentence** — same requirement as [`12g`](12g-parent-add-sibling.md). |
| Day strip | *feature-specific* | Two-line cells (number over letter), single-select. `SegmentedControl`'s `options` carry one label each. Build `DayStrip`. |
| Header, strip meta, tab bar | *app shell / feature* | |

**`AttendanceMark` is deliberately not used here.** The parent's home renders past attendance as
**text chips**, where the staff screens (`1c`, `9f`, `11a`) use the glyph. That is a real difference
between surfaces and is worth keeping — a parent reads a word, a coach scans a shape.

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `חזרה להיום` | `schedule.week.today` / `datePicker.jumpToToday` | Wording differs. |
| `הילדים שלי` | — | **No key.** Same gap as [`12i`](12i-parent-profile-leave.md) finding 9 — the parent's word for their own children is not `חניכים`. |
| day letters | `schedule.weekday.0`…`.6` | exact |
| `היום, יום א' · 23 באוגוסט` / `מחר, יום ב' · …` | — | **No key.** The `היום,` and `מחר,` prefixes are **special-cased relative-date labels** and need a formatter in `web/packages/core/src/datetime.ts`, not a template. Finding. |
| `{n} שיעורים · {m} ילדים` | — | **No key**, two plurals. |
| `אין שיעורים` | `schedule.today.empty` (`אין שיעורים היום`) | Near — but this is "no lessons **on this day**", not "today". |
| `אין שיעורים ביום זה` | `schedule.today.empty` | Wording differs; this is the more general form. |
| `השיעור הקרוב: שבת 09:00 · דנה` | — | **No key.** |
| `חוב 320₪ · הצהרת בריאות לנועה חסרה` | `billing.openDebts.total` + `health.badge.missing` | **Two namespaces, one sentence, no key.** And see above — it should probably be two banners. |
| `טיפול` | — | **No key**, and no destination. |
| `מתקיים כעת` | — | **No key, no status.** Same gap as [`9a`](9a-staff-today.md) finding 1 — "in progress" is a fourth session status. |
| `מתוכנן` | `schedule.session.status.scheduled` | exact |
| `נכח` / `לא נכח` | `attendance.roster.present` / `.absent` (`נוכח` / `נעדר`) | Wording differs; and see the gender note below. |
| `הודעתם מראש` | `attendance.source.preReported` (`הודיעו מראש`) | **Second person vs third.** Same finding as [`12b`](12b-parent-child-month.md) finding 4. |
| Tab labels | — | **No keys.** README finding 6. |

## Findings for the lane

1. **The debt banner is hidden on any day but today.** D2's most important alert must not depend on
   a date selection.
2. **The banner conflates a debt and a missing declaration behind one unwired button.**
3. **Relative-date labels (`היום,`/`מחר,`) need a `core/datetime` formatter.**
4. **The day strip does not distinguish past from future.** Only the agenda rows do. That may be
   fine; it should be deliberate.
5. **A physical `left` on the unread badge.**
6. **The parent surface uses chips where the staff surface uses `AttendanceMark`.** Keep it, and
   note it in the attendance contract so nobody "unifies" them.
7. **`הילדים שלי` has no key.**
