# `7c` — עמוד אירוע · participants, consents and payment

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W4 · **M7 Events & belts** |
| **i18n namespace** | `events` |
| **Slot** | none |

> ## ▲ D9.2 — applied, and verified
>
> D9.2 **cuts the `משקל / קטגוריה` column**: §2.2 defers weight categories to v2, and they imply
> `student` fields §4.3 does not carry. Applied to the canvas and owner-approved on 2026-08-24.
>
> **Verified.** The participants table has exactly six columns — a select-all checkbox, `חניך`,
> `קבוצה`, `אישור השתתפות`, `אישור הורה חתום`, `תשלום 80₪`, and an unlabelled actions slot.
> **No weight or category column appears in the header or in any of the five rows.** The cut is clean.
>
> **What ships:** no weight, no category, no weigh-in class — not here and not in `events.*`. The
> namespace deliberately carries **no** weight or category key, and adding one is how the cut quietly
> comes back. The rest of the artboard — RSVP counts, parent consent, payment status — matches §5.8
> and stands.
>
> (Note the event's own meta line still names a **weigh-in time**. That is a *schedule* fact about a
> competition, not a per-student weight field, and it is not what D9.2 cut. Keep it; it needs a key.)

## Regions

1. **DashNav** — imported, `active="events"`.
2. **Header bar** — a back affordance · a breadcrumb · title + meta (date · venue · weigh-in · contact) ·
   spacer · export · edit · **a bulk reminder carrying a count**.
3. **KPI strip** — five stat cards: confirmed · declined · not answered · missing a parent's consent ·
   **collected of the total due**.
4. **Table header** — a select-all checkbox and five labelled columns plus a trailing actions slot.
5. **Table body** — five participant rows.

## The columns, and what each cell renders

| Column | Cell |
|---|---|
| `חניך` | a **belt swatch** and the name |
| `קבוצה` | text |
| `אישור השתתפות` | a **chip**: confirmed · not answered (**dashed**) · declined (tinted) |
| `אישור הורה חתום` | a **chip**: signed with a date · missing (tinted) · **an em dash** where RSVP is pending or declined |
| `תשלום 80₪` | a **chip**: paid · awaiting · an em dash. **The fee sits in the column header**, not per row. |
| *(unlabelled)* | a contextual action — send the form · remind · **or a free-text decline reason** · or nothing |

Two things worth keeping. The **em dash for not-applicable** — a consent or a payment is meaningless
until someone has said yes — is the right model, and it needs an accessible label, not a bare glyph.
And **row five's trailing cell is a quoted decline reason with a date**, not a control: the table's
action slot doubles as an information slot. That is fine, and it must be modelled as a slot with two
shapes rather than "a button that is sometimes text".

## A count that does not add up

The header's bulk reminder names **13** who have not answered; the KPI card names **10**. One of them
is wrong, or they count different things (perhaps the button includes those missing a consent). The
artboard does not say. **Reconcile before building** — a button that names a number a manager can see
is wrong beside it is worse than one that names none.

## States

| State | What renders |
|---|---|
| **Checkboxes** | Unchecked only — header and rows. No checked, no indeterminate. |
| **All actions** | Default only. No hover, focus, disabled or in-flight. |
| **Empty** | **Not drawn**, and `events.roster.empty` (`אף חניך לא שויך לאירוע`) exists. A newly created event is exactly this. |
| **Loading / error** | **Not drawn.** |
| **After a reminder** | **Not drawn**, and `events.reminderSent` exists. |

The five rows are **hardcoded markup** with no data binding and no placeholder count — so unlike most
list artboards there is not even a loading hint here.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | the header bar, the KPI cards, the rows |
| Ink | `--fg` | the title, the bulk button's fill |
| Secondary text | `--text-secondary` | the KPI captions, the group column, the decline note, **the em-dash placeholder** |
| Muted text | `--text-muted` | the breadcrumb, the meta line, column headers — **at D8's floor** |
| Semantic — confirmed / signed / paid | `--paid` | three different chip meanings, one token |
| Semantic — declined / missing | `--danger` (+ tint) | two chip meanings |
| Semantic — not answered | `--pending` (**dashed**) | the chip and its KPI card |
| Semantic — awaiting payment | `--pending` (**solid**) | the payment chip |
| Border | `--border` / `--border-strong` | hairlines |
| Belt | `belt_rank.color_hex` via `BeltBar` | one per row — **data** |

No D8-retired grey. **The dashed-versus-solid distinction inside `--pending` is load-bearing here** —
*not answered* is dashed, *awaiting payment* is solid — and it is the same distinction
[`1c`](1c-staff-roster.md) uses for notified versus unmarked. Keep it, and give `StatusChip` a
dashed variant rather than two ambers.

> **▲ D7 — every belt swatch is bare.** Five rows, no border on any. **One is yellow** — the belt
> D7's audit names as failing even 3:1 on this ground. `BeltBar` rings unconditionally.

## RTL

- Nav on the right; the split is DOM order plus flex under `dir`, with **no physical property inside
  `7c`'s own range.**
- The **back chevron** is a raw path pointing the correct way for RTL — coordinate-baked, not
  direction-aware. Feed the icon layer a logical direction.
- **Must not mirror:** the date, the weigh-in time, both money figures, every count, every date inside
  a consent chip, the decline reason's date.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Checkboxes | `Checkbox` | Needs checked and indeterminate. |
| All three chip columns | `StatusChip` | **Confirmed / declined / not answered / signed / missing / paid / awaiting — seven meanings across three columns**, and `ChipStatus` has six members none of which is an RSVP or a consent state. **Plus a dashed variant.** See the README's finding 3. |
| Every button | `Button` | Export and edit `secondary`, the bulk reminder `primary`, and two small row actions. |
| Both money figures | `MoneyDisplay` | The collected-of-total KPI, and **the fee in the column header.** |
| Belt swatch | `BeltBar` | Ringed. |
| KPI cards | `Card` + feature content | **The eighth artboard with this stat-tile shape.** Extract once. |
| Empty state | `EmptyState` | Required; not drawn. |
| **Participant row** | *feature-specific* | **`StudentRow` covers the name cell only** — it carries one status slot and this row needs three independent chips plus a two-shaped trailing slot. |
| Header, KPI strip | *feature-specific* | |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `אירועים` (breadcrumb) | `events.title` | The short form again. |
| `אליפות מחוז השרון · ג׳ודו` | `events.form.name` labels it | Data. |
| `06.09 · היכל הספורט נתניה · שקילה 08:30 · אלון מזרחי` | `events.form.location` + `schedule.session.coach` | Composed — **and `שקילה` (weigh-in) has no key.** It is a competition-schedule fact, not the weight field D9.2 cut. Give it a key. |
| `ייצוא רשימה` | `reports.export` / `attendance.report.export` | **Cross-namespace, twice over**; no roster-export key. |
| `עריכת האירוע` | `events.form.title` (`יצירת אירוע`) | The *edit* action has no key. |
| `תזכורת ל־13 שלא ענו` | `events.remindNonResponders` (`תזכורת למי שלא ענה`) | **The label exists**; the count wrapper does not — **and see the count discrepancy above.** |
| `אישרו` / `לא יגיעו` / `לא ענו` | `events.counts.registered` (`נרשמו`) / `counts.declined` (`לא מגיע`) / `counts.pending` (`טרם ענו`) | **All three exist and all three differ in wording or number.** The KPI needs plural aggregate forms where the keys are singular row labels. |
| `חסר אישור הורה` | `events.consent.pending` (`ממתין לאישור הורה`) | Wording differs. |
| `נגבה מתוך 1,120₪` / `640₪` | `reports.financial.collected` (`נגבה`) | **Cross-namespace (M9)** — the money KPI on M7's screen resolves to M9's key. Same pattern as [`3e`](3e-dashboard-collections.md) finding 6. |
| `חניך` / `קבוצה` | `people.student.one` / `student.group` | **Cross-namespace (M3)**, both exact. |
| `אישור השתתפות` | `events.rsvp.title` | exact |
| `אישור הורה חתום` | `events.consent.required` (`דרוש אישור הורה`) | Wording differs — the column is about the signed artefact. |
| `תשלום 80₪` | `events.fee.label` (`עלות`) + `events.fee.perStudent` | **The fee in a column header** is a composed string with no key. |
| `אישרו` / `לא ענו` / `לא יגיע` (row chips) | `events.rsvp.yes` (`מגיע`) / `rsvp.pending` / `rsvp.no` | **The keys are per-student and singular** (*attending*); the chips are aggregate-plural. Two forms of one enum. Finding. |
| `נחתם 21.08` / `חסר` | `events.consent.signed` (`האישור נחתם`) + `health.documents.missing` | The first near; **the second is M4's key on an M7 chip.** A parent's event consent is §5.8's, not §5.5's — `events.consent.*` is the right family and has no *missing* member. Finding. |
| `שולם` / `ממתין` | `billing.charge.status.settled` / `billing.order.status.pending` | **Cross-namespace (M6)**, both. An event's payment state is M6's data on M7's screen — the W4 contract has to say which lane owns the column. |
| `—` | — | Not copy; **needs an accessible label.** |
| `שליחת טופס` | `events.consent.sign` (`אישור וחתימה`) | Different action — sending a form to a parent, not signing. **No key.** |
| `תזכורת` | `events.remindNonResponders` | **A third reminder target** — this one chases a *consent*, the header's chases *non-responders*, and [`9i`](9i-staff-events.md)'s chases both. One key, three targets. |
| `״נסיעה משפחתית״ — 21.08` | — | **No key**, and it is a **quoted decline reason from a parent** — free text, rendered to a manager. `events.cancelReason` exists for cancelling an *event*; a parent's decline reason has no field. Finding. |

## Findings for the lane

1. **D9.2 is clean.** No weight or category column, and `events` carries no such key. Keep it that way.
2. **The two not-answered counts disagree** — 13 in the button, 10 in the KPI.
3. **A parent's decline reason has no field**, and it is quoted verbatim to the manager.
4. **`StatusChip` covers none of the seven meanings** in the three chip columns, and needs a dashed
   variant — the dashed/solid split inside `--pending` is doing real work.
5. **Three reminder targets, one key.** Third artboard.
6. **A missing *event* consent borrows M4's key.** `events.consent.*` needs a missing member.
7. **The payment column and the money KPI are M6's data on M7's screen.** W4 contract.
8. **`שקילה` — a weigh-in time — has no key**, and it is not what D9.2 cut.
9. **The RSVP enum has singular row forms and plural aggregate forms**, and one key set.
10. **No empty state**, and a new event is exactly it.
