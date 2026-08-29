# `PA` — the parent app's shell and the screens behind it **(proposal)**

| | |
|---|---|
| **Surface** | Parent app · 390×844 · Hebrew RTL · mobile-first |
| **Canvas** | [`Parent App.dc.html`](../canvas/01-parent-app/Parent%20App.dc.html) — `#2a` `#2b` `#2c` `#12a`–`#12j` `#13a`–`#13c` `#7d`. **No artboard is added by this file** — `tests/contracts/test_canvas_matches_spec.py` asserts the canvas holds exactly 61. |
| **Specs** | [`2a`](../specs/2a-parent-home.md) · [`2b`](../specs/2b-parent-inbox.md) · [`2c`](../specs/2c-parent-student-card.md) · [`12f`](../specs/12f-parent-payments-history.md) · [`12h`](../specs/12h-parent-events.md) |
| **Container** | `web/apps/parent/src/App.tsx` — `AppShell` + `TabBar` + `HealthGate` |
| **Routes** | four tabs (`#/` · `#/payments` · `#/announcements` · `#/profile`), thirteen more behind hashes — seventeen destinations in all |
| **i18n namespace** | `common`, plus each feature's own |
| **Slot** | `student-card` (five sections, one per milestone) |

> **Status: proposal, and one input is missing.** Written 2026-08-29 from three of this
> pipeline's four inputs — the artboards and their specs, the shipped container, and a
> measured walk of the running app as all four §19.3 personas. **The Stitch generation has
> not been run**; its row in *Provenance* is empty on purpose and must not be filled from
> imagination. The composition questions this file leaves open are precisely the ones the
> two previous passes used Stitch to settle. Appendix A is the prompt to run.

## Why the shell and not one screen

Both previous passes picked their unit by where the defects were. `MH` was one screen
because the screen did not exist; the wizard was six steps because *"every defect worth
fixing is in the container rather than in any step."*

The parent app is the second case. Walking it as `parent3` found seventeen routed destinations whose
individual layouts are mostly fine and whose **shared** decisions are not: what a section
header looks like, whether a row's secondary fact is separated from its primary one,
whether a tap target is a control or a footnote, and — four times — whether a screen has
any way in at all. Fixing those a screen at a time means making the same decision seventeen
times, which is how the app arrived at seventeen answers.

## Provenance

| Source | What it contributed | What was rejected |
|---|---|---|
| **Google Stitch** | **NOT RUN.** See Appendix A. | — |
| [`2a`](../specs/2a-parent-home.md) | The day strip's two-state rule. The agenda row's shape: time gutter · belt swatch · child · group · trailing status chip. The tab bar's **unread badge on messages**. The debt banner as a *conditional* on the selected day being today. | — |
| [`2b`](../specs/2b-parent-inbox.md) | The one-way inbox, and its own finding that read/unread is drawn nowhere while four i18n keys exist for it | Its `ללא הצהרה חתומה לא ניתן להשתתף באימון` line — §5.5 blocks nothing on the mat, and `2b`'s spec already flags this as the third artboard to make the claim |
| [`2c`](../specs/2c-parent-student-card.md) | The card as a container of milestone-owned sections | — |
| Measured walk, 2026-08-29 (this session) | Every delta in *What ships today and should not* below — each one read off the DOM at 390×844, not off a screenshot | — |
| `ff134f8` | The eight functional defects already fixed, so this file does not re-litigate them | — |

**Precedence rule, unchanged from `MH`:** tokens, RTL and accessibility are
non-negotiable · the existing artboards win on domain correctness · Stitch wins on
composition and hierarchy only · anything requiring data that does not exist is cut.

## What ships today and should not

Measured at 390×844 as `parent3`. Each row is a delta between a spec that exists and the
code that shipped — not a preference.

| # | Spec says | Shipped does | Evidence |
|---|---|---|---|
| 1 | `2a` §7 — four tabs, **with an unread badge on messages** | ~~`TabBarItem` had no badge field at all, so a parent with four unread announcements got no signal.~~ **Built.** `TabBarItem.badge`; the shell fetches the count, `0` renders nothing, `>99` renders `99+`, and the number goes in the accessible name. | `packages/ui/src/shell/TabBar.tsx` |
| 2 | `2a` §6 — the agenda row carries **a belt swatch** and **a trailing status chip** | Row is child name · group · time. Neither swatch nor chip. | `ParentHome.tsx` lesson row |
| 3 | `2a` §6 — **rows sharing a time hide the repeated time label**, so concurrent lessons read as one block | ~~Every row prints its own time.~~ **Built.** Hidden with `visibility`, not removed — the second lesson really is at that hour, so the fact stays in the tree for anyone who cannot see the alignment. | same |
| 4 | `2a` §5 — the debt banner is **conditional on the selected day being today** | ~~Rendered on every day of the strip, so stepping back to last Tuesday asked the parent to pay for it.~~ **Built.** | `ParentHome.tsx` |
| 5 | `2b` — four read/unread keys exist and **none of the four is expressed on the artboard** | Two of the four ship (`inbox.markAllRead`, `inbox.new`); `inbox.unread` and `inbox.markRead` are defined and rendered nowhere. So the artboard and the code disagree with each other *and* with the key set. | `2b` spec §"Read and unread"; `grep comms.inbox.* apps/parent/src` |
| 6 | — | The profile tab is titled **חניכים** and its only per-child affordance is the destructive **עזיבת המועדון** | `#/profile`, measured |
| 7 | — | The calendar's control row wraps prev/next, month/week and the absence link into one band; the month cells are `role=cell` with no button | `ChildCalendar.tsx` |

**1, 3 and 4 are built** — they are spec compliance, not composition, so they needed no
adjudication. **2, 5, 6 and 7 are not**, and should not be until Stitch has run: each one
is a question about arrangement or about which of two models is right, which is precisely
what the precedence rule reserves for it.

## Regions — the shell

Right-to-left. Fixed `TabBar` on the block-end edge, 55px, four items.

```
┌──────────────────────────────────────────────┐
│  ☰                        מועדון גלדיאטור    │   AppShell header
├──────────────────────────────────────────────┤
│                                              │
│   הילדים שלי                    הגדרות ⚙     │   ← PageHeader
│   ──────────────────────────────────────     │
│   ⚠  חוב פתוח            1,250₪  [לתשלום]   │   ← conditional on today
│                                              │
│   השיעורים הקרובים        דיווח היעדרות      │   ← SectionHeader
│   ▸ day strip                                │
│   ▸ agenda, grouped by day                   │
│                                              │
│   [ הכל ] [ נועה ] [ איתי ] [ מאיה ]         │   ← family layer, >1 child only
│                                              │
├──────────────────────────────────────────────┤
│   בית      תשלומים    הודעות(4)   פרופיל     │   ← badge is delta #1
└──────────────────────────────────────────────┘
```

### 1. Header — `PageHeader`, not a hand-rolled row

Every parent screen builds its own title row today, and four of them build none at all —
the payments history screen shipped with no heading and no way back until `ff134f8`.
`PageHeader` exists in `packages/ui` and was written for exactly this during the `MH` pass.
Seventeen destinations, one row shape.

### 2. Section headers — `SectionHeader`, and the trailing action is a control

`SectionHeader` (title + optional trailing link) also already exists. The parent app's two
trailing actions — **הגדרות** and **דיווח היעדרות** — rendered as 19px-tall bare text
links until `ff134f8`. The rule this shell adopts: **a trailing action in a header is a
control, sized like one**, minimum 44px in the block axis.

### 3. Rows — a primary fact, a secondary fact, and a separator that is layout

Three components rendered adjacent inline elements with nothing between them, producing
`ילדים א'כל הימים`, `שירה הורההורה ראשי` and `סה״כ חוב1,250₪`. All three are now flex rows
with a gap. The general rule, and the one worth holding in review: **a row's secondary fact
is separated by layout or by a chip, never by hoping for whitespace that no element
supplies.**

### 4. The family layer — present only when there is a family

`parent1` exists to walk *"the single-child path that skips the family layer"* and the
layer was not skipped. One child now gets no `הכל` chip. This generalises: **a control that
partitions a set does not render for a set of one.**

## States

| Screen state | What renders |
|---|---|
| **Loading** | Nothing gated renders until `/me/students` resolves — the children decide which lessons belong on the screen, so a list drawn before they arrive can show rows the family does not own. This is why `filtered` returns `null` rather than the unfiltered rows. |
| **Error, one region** | `LoadFailed` with a retry, in that region only. |
| **Gate held** | `HealthGate` renders *instead of* every branch, and the tab bar hides with it — §5.5's "no other screen is reachable" includes the bar that reaches them. |
| **Empty — no children** | `EmptyState`, with the reason: the manager links a child at registration. |
| **Empty — nothing owed** | The debt banner is absent. Its absence is the good state, not an empty one. |
| **Trial** | `TrialHome` — reachable since `ff134f8`. Still renders without a lesson time; see *Gaps*. |
| **Dark mode** | Every token below has a dark value. `2a` is drawn light-only; the shell is not. |

## Tokens by role

| Role | Token |
|---|---|
| Page ground | `--ground` (`#f7f5f1`) |
| Card surface | `--surface` (`#fffefb`) |
| Debt amount and its icon | `--debt` (`#b3261e`) |
| Settled / attended | `--paid` (`#1f6b3f`) |
| Awaiting an answer | `--pending` (`#8a5a00`) |
| Secondary fact in a row | `--text-secondary` (`#55524a`) |
| Day letters, meta lines | `--text-muted` (`#6f6b62`) — at D8's floor |
| Hairline between rows | `--border` (`#e6e1d6`) |
| Chip outline | `currentcolor` at 40% |
| Tap target, minimum block size | **44px** |
| Gap between regions | `--space-4` |

No hex in a component. No token added by this file.

## Primitives

**Already in `packages/ui` and now adopted by the parent app** — every one of these existed
before this session and was not being used here:

| Primitive | Where it lands |
|---|---|
| `SegmentedControl` (+ new `legendVisible`) | the payments screen's two stacked `[1][2][3]` pickers |
| `Checkbox` (+ new `ReactNode` label, `block`) | the shop, which hand-rolled a 13×13 native box |
| `SelectField` | the booking flow's raw `<select>` |
| `StatusChip` | the guardian row's primary badge |
| `PageHeader` · `SectionHeader` | **not yet adopted** — the title rows above |

**New, and small:**

| Primitive | Why it is shared |
|---|---|
| `formatMonthLabel(year, month, locale)` in `@studio/core` | The calendar printed `2026-08` as its heading. Every month picker in the product needs this and none had it. Shipped. |
| `TabBarItem.badge` | Delta #1, shipped. The staff app's tab bar can now use it too. |

## i18n

Keys land in each feature's own namespace; `packages/i18n/index.ts` is not touched. Three
were added this session — `billing.history.back`, `billing.history.filterLegend` and
`schedule.calendar.pastCount` — in `he`, `en` and `ru`.

**Counts and money are parameters, never concatenated.** The three glued strings above are
the same failure the `MH` pass recorded on the dashboard's setup banner.

## Gaps — what this shell cannot show yet

**`TrialHome` has no lesson time.** `Resolve` renders it with no `sessionStartsAt` because
`StudentSummary` carries none, so it falls back to `people.trialHome.waitingForClub` —
which reads *"the club will get back to you after the lesson"* for a family whose lesson is
not booked. Needs either a field on the students payload or a trial-booking read. The copy
is wrong for the fallback branch either way and is a decision, not a fix.

~~**The unread badge needs a count the shell does not fetch.**~~ **Closed.** The shell
fetches it, because the alternative — `InboxScreen` lifting it — produces a badge that
only appears once the parent has already opened the inbox and read the thing it was
announcing. `InboxScreen` takes an `onReadChange` callback so the count clears without a
reload. This was listed as a composition question for Stitch; it turned out to have one
defensible answer, so it was not one.

**Enrolment-style counts on the agenda row.** `2a` draws a trailing status chip per lesson;
the chip's value for a *future* lesson is `planned`, which is derivable, but for a past one
it is the child's attendance, which the home screen already fetches. Buildable; not built.

## Open questions — the ones Stitch is for

1. **Where does the family layer go?** It is currently the last thing on a screen titled
   *my children*. Above the agenda, as a filter bar? Or is the agenda itself the wrong
   default and the children the landing content?
2. **Does the debt banner belong on home at all**, given a payments tab one tap away and a
   `PaymentStrip` on every student card? Three surfaces show the same number.
3. **The calendar's control row** — prev/next, month/week and the absence link in one band
   at 390px. `MH` solved the dashboard's four-row header by ranking the actions; the same
   question, less room.
4. **Read/unread.** `2b`'s own finding: either the model has a read flag the design does
   not show, or the design has a resolved/outstanding axis the model does not have. Two of
   the four keys now ship, which settles nothing — it just means the code picked a side
   without the artboard.

---

## Appendix A — the Stitch prompt for this surface

Neither previous pass recorded its prompt, so neither generation can be re-run or
compared. This one is recorded. Paste it into Stitch (Gemini 3.1 Pro), and file the result
into *Provenance* above with what it contributed and what was rejected.

> Design a mobile app home screen, 390×844, **Hebrew, right-to-left**, light and dark.
>
> The user is a parent at a children's judo club with three children enrolled. The screen
> answers one question: *what do my children have coming, and does anything need me?*
>
> Regions, in reading order: a header with the club name; an alert only when the family
> owes money; a horizontal seven-day strip; the coming lessons grouped by day, one row per
> lesson per child; and a fixed four-tab bar at the bottom — home, payments, messages,
> profile — where messages carries an unread count.
>
> Each lesson row shows: the child's name, their group, the time, a small coloured bar for
> the child's belt rank, and a status word. Two children training at the same hour should
> read as one block, not two rows repeating the hour.
>
> Use exactly these colours and nothing else:
> ground `#f7f5f1` · surface `#fffefb` · ink `#17150f` · on-ink `#f7f5f1` ·
> secondary text `#55524a` · muted text `#6f6b62` · hairline `#e6e1d6` ·
> debt/danger `#b3261e` · settled `#1f6b3f` · awaiting `#8a5a00` · accent `#1f6b3f`.
> Type scale: 12 / 13 / 14 / 15 / 24px. Spacing: 4 / 8 / 12 / 16 / 24px.
> Radius: small 8px, card 16px, pill 999px.
>
> Hard constraints — output that breaks any of these is rejected:
> * **Right-to-left.** Every row reads from the right edge. Sentence-final punctuation at
>   the left end.
> * **Currency is `₪`, never `$`**, and it is never glued to the digits by string
>   concatenation — an amount is its own element.
> * **A time range reads `16:30–17:30`**, low value first. Do not reverse it.
> * **Every tap target is at least 44×44.** No affordance is a bare caption-sized link.
> * **Never colour alone** — a status carries a word as well as a hue.
> * No icons-only controls without a visible or assistive label.
>
> Give me the composition and the hierarchy. The colours, the words and the domain rules
> are fixed; what I am asking you for is the arrangement.

**Why the constraint list is that specific:** the two previous Stitch generations both
produced `$14,250-` and reversed every time range, which is what `MoneyDisplay` and
`RangeText` exist to prevent (`RangeText.tsx:11`, `StatTile.tsx:16`). Stating the rule in
the prompt is cheaper than adjudicating it afterwards for a third time.
