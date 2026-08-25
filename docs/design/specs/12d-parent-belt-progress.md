# `12d` — התקדמות חגורה ומבחנים · the parent's belt view

| | |
|---|---|
| **Surface** | Parent app · 390×844 |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W4 · **M7 Events & belts** |
| **i18n namespace** | `events` (`belt.*`, `exam.*`) |
| **Slot** | none |

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — a back affordance · a belt accent bar · title + subtitle (current rank · since when).
3. **Scroll body**
   1. **Belt-progress card** — a **nine-segment** bar and one caption line.
   2. **Upcoming-exam card**, visually emphasised — a category chip + date · title · a detail line
      (time · hall · fee) · an **eligibility banner** · two buttons.
   3. `מבחנים קודמים` label, then a card of two history rows — date · `from → to` · a **pair of small
      belt bars**.
4. **Footer** — one informational line about what happens after a promotion.

No tab bar: a pushed sub-screen.

## The belt progression — the artboard's whole point

**Nine segments, in rank order, running right-to-left** — rank 1 at the reading start, rank 9 at the
end. Three treatments:

| Segment | Treatment |
|---|---|
| **Earned** | Solid fill, short. |
| **Current** | Solid fill, **taller with a larger radius — distinguished by height alone.** No ring, no marker, no label. |
| **Future** | **The same hue at reduced alpha**, short. |

**Bi-colour belts appear** at ranks 2 and 4 — a hard 50/50 split, as on [`5b`](5b-dashboard-belt-system.md).

> **▲ D7 — two of nine segments are ringed, and the current one is not.**
> Only the white segment and the white half of a bi-colour segment carry a border, and it is a
> **translucent tint** rather than D7's solid foreground. Yellow — the belt the audit names as failing
> even 3:1 — is bare, and so is the **current green**, the one segment the whole screen exists to show.
>
> The header's belt accent and all four history bars are **also bare**. **Eleven belt fills on this
> artboard; two carry any ring at all.** `BeltBar` rings unconditionally.
>
> **And the ring interacts with "current".** If height is the only thing marking the current rank, a
> ring on every segment does not break it — but a ring should not dim on the faded future segments
> either, because it is a contrast obligation (SC 1.4.11), not decoration. `BeltBar` must decide:
> the ring stays at full strength, the fill fades.

## Eligibility — shown to the parent, in these terms

A success-toned banner: *the child meets the conditions — 92% attendance, 4 months at this rank.*

**Two criteria are disclosed and one of them is not in §5.9.** `events.exam.eligibleHint` reads
*eligibility is computed from the current rank and time held*. **Attendance is the fifth artboard to
add it** — after `5d` (seeded as a default), `5b` (a per-rank column), `6b` and `4d` (editable
conditions), and `2d` (shown to a coach). Here it is stated **to a parent, as a fact about their
child.** Settle §5.9.

No threshold and no ineligible variant is drawn — only the positive case.

## States

| State | What renders |
|---|---|
| **Eligibility banner** | The positive case only. **Not eligible is not drawn**, and `events.exam.notEligible` (`טרם זכאי`) exists. That is the state a parent is more often in. |
| **RSVP** | Two buttons. **No answered state** — no "you confirmed" chip, no way to change an answer, though `events.rsvp.change` exists. |
| **History rows** | Read-only — **no pointer**, unlike the payment rows on `12f`. |
| **No belt yet** | **Not drawn**, and `events.belt.none` (`טרם הוענקה דרגה`) exists. A new white-belt child is the common case, and this screen would be nearly empty. |
| **No exam scheduled** | **Not drawn**, and `events.exam.empty` exists. |
| **Loading / error** | **Not drawn.** |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | the three cards, the footer |
| Ink | `--fg` | the title, the primary button's fill, the emphasised card's border |
| On-ink | `--on-fg` | the primary button's label |
| Secondary text | `--text-secondary` | the caption, the exam detail line, history dates |
| Muted text | `--text-muted` | the subtitle, the section label — **at D8's floor** |
| Semantic — eligible | `--paid` (+ tint and border) | the eligibility banner |
| Border | `--border` / `--border-strong` | hairlines; the emphasised card's edge |
| Belt | `belt_rank.color_hex` via `BeltBar` | eleven fills — **data, never a token** |

No D8-retired grey.

> **The eligibility banner's green is not a belt green**, and both appear on this screen. D3 requires
> that separation and D12 enforced it by moving dark `--paid` off `4h`'s green-belt hex. **Never wire
> one to the other.**
>
> **D2's semantic tier does not list a "positive / eligible" role** — it names debt · paid · pending ·
> cancelled · danger · focus ring. This banner borrows `--paid`. Either that borrowing is deliberate
> and written down, or the tier grows a member. Same question as [`3b`](3b-dashboard-students.md)'s
> valid-declaration chip and [`4e`](4e-dashboard-documents.md)'s. **Three artboards.**

## RTL

- **The progression runs right-to-left by `dir`**, first rank at the reading start. The gradient's
  stops follow. **Do not reverse the array and do not hard-code a gradient direction** (D10).
- History rows render date · text · the belt pair, in reading order. The `→` in `from → to` is a
  bidi-mirrored arrow and reads correctly; keep it as a character, not an icon.
- **Must not mirror:** the dates, the fee, the attendance percentage, the month count.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| The nine segments, the header accent, the four history bars | `BeltBar` | **Two modes**: a full progression with earned/current/future, and a compact swatch. Both need the ring. |
| The three cards | `Card` | |
| Both exam buttons | `Button` | |
| Eligibility banner | `Alert` | `tone="paid"` — the one `AlertTone` member that fits. |
| The fee | `MoneyDisplay` | It sits **inline in a sentence**; same requirement as `12g` and `2a`. |
| Category chip | `StatusChip` | **If `ChipStatus` is not scoped strictly to payment-shaped statuses.** `events.type.*` has six members and `ChipStatus` has none of them. See the README's finding 3. |
| Empty states | `EmptyState` | Two needed; neither drawn. |
| Header, the exam card's composition, a history row | *feature-specific* | |

**Explicitly not `ProgressBar`.** A belt ladder is a discrete ranked sequence, not a continuous fill.
Using `ProgressBar` here would be a semantic collision, and `12d` is where someone would reach for it.

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `החגורה של דנה` | `events.belt.progress` (`התקדמות חגורה`) | **Wording differs and the key does not interpolate a name.** A parent's per-child title. Finding. |
| `ירוקה · מ־04.2026` | `events.belt.awardedOn` (`הוענקה בתאריך`) | The rank name is data; the composed subtitle has no key. |
| `דנה בחגורה ירוקה — הדרגה השישית מתוך תשע במועדון.` | — | **No key**, and it spells **both ordinals as Hebrew words** — *the sixth of nine*. No interpolation produces that; it needs a Hebrew ordinal formatter in `core`, or a rewrite. Finding. |
| `מבחן שנתי` | `events.type.belt_exam` (`מבחן חגורה`) | **Different value** — *annual exam* is not one of `events.type.*`'s six members. Either the enum grows or the chip is showing something else. |
| `מבחן סתיו · ג׳ודו` | `events.form.name` labels it | Data. |
| `17:00 · אולם א׳ · דמי מבחן 90₪` | `events.fee.label` (`עלות`) + `events.fee.perStudent` | The composed line has no key; the fee has one. |
| `דנה עומדת בתנאים — 92% נוכחות, 4 חודשים בחגורה` | `events.exam.eligibility` / `eligibleHint` | **▲ No key**, and see above — attendance is not in §5.9's criteria. |
| `אישור השתתפות` | `events.rsvp.title` (`אישור השתתפות`) | exact |
| `לא נגיע` | `events.rsvp.no` (`לא מגיע`) | Wording differs — first-person plural on the parent's screen. |
| `מבחנים קודמים` | `events.belt.history` (`היסטוריית דרגות`) | Wording differs — *previous exams* vs *rank history*. **They are different lists**: a promotion can happen outside an exam (`events.belt.awardOutsideExam` exists). Finding. |
| `כתומה → ירוקה` | `events.belt.current` / `belt.next` | The rank names are data; the transition has no key. |
| `אחרי קידום — החגורה החדשה תופיע כאן ותיכנס לתור המסירה במועדון.` | — | **▲ No key**, and it makes a **cross-lane promise**: a promotion enqueues a physical belt for hand-over. That is M7 → M6, it matches [`12e`](12e-parent-order-items.md)'s promotion prompt and [`11a`](11a-staff-hand-over.md)'s queue, and **none of the three has a model or a notification kind.** Finding. |

## Findings for the lane

1. **▲ A promotion enqueues a belt for delivery** — claimed here, prompted on `12e`, queued on `11a`.
   Three artboards describing one cross-lane flow that has no model, no key and no notification kind.
2. **▲ Attendance as an eligibility criterion — fifth artboard**, and the first stated to a parent.
3. **Eleven belt fills, two rings, and neither on the current rank.**
4. **`BeltBar` must decide how the ring behaves on a faded future segment.** It is a contrast
   obligation; the fill fades, the ring does not.
5. **Previous *exams* and rank *history* are different lists**, and `belt.awardOutsideExam` proves it.
6. **`מבחן שנתי` is not in `events.type.*`.**
7. **A Hebrew ordinal sentence** needs a formatter or a rewrite.
8. **Neither empty state is drawn**, and a new white-belt child hits both.
9. **No answered RSVP state**, though `rsvp.change` exists.
10. **D2 has no "positive/eligible" semantic role**, and three artboards borrow `--paid` for one.
