# `7d` — הזמנה לאירוע ואישור השתתפות

| | |
|---|---|
| **Surface** | Parent app · 390×844 |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W4 · **M7 Events & belts** |
| **i18n namespace** | `events` |
| **Slot** | none |

The event detail a parent lands on from [`12h`](12h-parent-events.md). §5.8 ties three things
together here — the RSVP, a **signed consent**, and a **fee that becomes a charge** — and the artboard
draws all three without connecting them.

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — a back affordance and the title `אירוע`.
3. **Content**
   1. A meta row: a category chip and a coach/group label.
   2. The event title.
   3. A date · time · meeting-point block.
   4. A **logistics card** of three divided rows: what to bring · transport, **with a trailing price** ·
      the responsible adult and a phone number.
   5. A **consent alert card**, separate and danger-bordered: a title, a subtitle, and its own
      sign button.
   6. A deadline and capacity line.
4. **Footer bar** — decline (fixed width) and **confirm, with the fee in its own label**.

## ▲ The consent does not gate the RSVP, and §5.8 says it must

§5.8: **an RSVP does not count as confirmed until the parent's consent is signed.**
`events.consent.blocksConfirmation` ships the sentence:
`ההשתתפות תיחשב מאושרת רק לאחר חתימת ההורה`.

On the artboard the two are **independent, simultaneously usable controls**: the confirm button is
drawn in the ordinary enabled primary style — no disabled state, no lock, no inline copy — and the
consent card sits above it as a separate alert with its own button. **Nothing visual or textual ties
them.** A parent can press confirm without signing.

The gating must be built. The key exists; the design does not express it.

## The fee

The same amount appears twice: as a trailing price on the **transport** row, and **inside the confirm
button's own label**. Nothing states that confirming *creates a charge* — `events.fee.chargeOnConfirm`
(`אישור השתתפות יוצר חיוב להורה המשלם`) exists and is not drawn.

And nothing says whether the fee is *for the transport* or *for the event*. The inference — that it is
transport, because the price sits only on that row — is exactly the sort of thing a parent will read
differently from a manager.

## States

| State | What renders |
|---|---|
| **RSVP** | **One state only: not yet answered.** Two neutral buttons, neither marked selected. §4.3 makes *pending* a real state and this screen is it. |
| **RSVP — confirmed / declined** | **Neither is drawn.** `events.rsvp.answered` and `rsvp.change` both exist — a parent who confirms has no way back. |
| **Consent — signed** | **Not drawn**, and `events.consent.signed` exists. |
| **Deadline passed** | **Not drawn**, and `events.rsvp.deadlinePassed` exists — on the screen whose whole footer is a deadline. |
| **At capacity** | **Not drawn**, though the capacity is shown. |
| **Loading / error** | **Not drawn.** |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | the logistics card, the consent card |
| Ink | `--fg` | primary text, icons, the confirm button's fill, the decline button's outline |
| On-ink | `--on-fg` | the confirm button's label |
| Secondary text | `--text-secondary` | the chip meta, logistics copy, the deadline line |
| Semantic — consent required | `--danger` (+ tint and border) | the consent card's icon, title and edge |
| Border | `--border` / `--border-strong` | dividers, the decline button's outline |
| Belt | — none. |

No D8-retired grey. **No positive semantic appears at all** — there is no signed state to colour.

## RTL

- The **back chevron** points right — correct for RTL, hard-coded.
- **Must not mirror:** the fee (twice, once inside a button label), the date, the time range, the
  departure and return times, the phone number, the deadline, the capacity fraction.
- **The fee inside the confirm button is the risky one.** A `{digits}₪` pair inside an RTL button
  label must go through `MoneyDisplay`, not string interpolation — the primitive owns the bidi
  isolation, and hand-built markup is where it flips.
- **The signature pad is not on this artboard** — `לחתימה` navigates away. Flag it for whoever builds
  the destination: [`12c`](12c-parent-health-declaration.md)'s rule applies, a pad must never mirror.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Three buttons | `Button` | Sign (`secondary`, inside the alert), decline (`secondary`), confirm (`primary`). |
| Consent card | `Alert` | `tone="danger"` with the sign button as its action — **and `Alert` has neither a title prop nor an action slot.** The events lane composes both around it. Fourth artboard with this gap. |
| Logistics card | `Card` | Three rows, divided. |
| Category chip | `StatusChip`? | Categorical, not a status. Same question as [`12h`](12h-parent-events.md). |
| Both fee renderings | `MoneyDisplay` | Including **inside a button label**. |
| Logistics rows | *feature-specific* | Icon + text, with a trailing `MoneyDisplay` on one. Another `ActionRow`-shaped thing — see the README's gap list. |
| Header, footer bar | *app shell* | |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `אירוע` | `events.title` (`אירועים ותחרויות`) | The bare singular has no key. |
| `אימון מיוחד` | — | **Not one of `events.type.*`'s six members.** Fourth artboard (see `12h`, `9i`, `7a`). |
| `יוסי · נבחרת` | `people.student.group` | Data, cross-namespace. |
| title, date, time, meeting point | `events.form.name`, `form.startsAt`, `form.location` | Labels exist; the composed lines are data. |
| the what-to-bring text | — | **No key**, and it is **per-event content** the manager writes on [`7b`](7b-dashboard-create-event.md) — data, not copy. |
| the transport line | `events.form.locationExternal` is the nearest | **No key.** And a **transport arrangement with departure and return times** has no field in §5.8's event model. Finding. |
| `אחראי: אלון מזרחי · 054-221-8890` | `schedule.session.coach` | **No key**, and it publishes a **staff member's personal phone number to every parent**. That is a real privacy decision — §11's kit governs personal data, and a coach's mobile is personal data. Finding. |
| `נדרש אישור יציאה חתום` | `events.consent.required` (`דרוש אישור הורה`) | Wording differs — *a signed outing permission*, which is more specific and more legally loaded. |
| `חתימה דיגיטלית · דקה אחת` | — | **No key.** |
| `לחתימה` | `events.consent.sign` (`אישור וחתימה`) | Wording differs. |
| `ההרשמה נסגרת ב־15.09 · 42 מתוך 54 מקומות תפוסים` | `events.form.rsvpDeadline` (`הרשמה עד`) | The deadline half has a key; **the capacity half has none** — and §5.4 says capacity and waitlists are near-irrelevant because children enrol rather than book. **An event is the one place capacity genuinely binds**, so it needs a model and a key rather than borrowing the enrolment framing. Finding. |
| `לא נגיע` | `events.rsvp.no` (`לא מגיע`) | Person differs. |
| `אישור השתתפות · 45₪` | `events.rsvp.title` + `events.fee.label` | The label exists; **the composed button with a fee in it does not** — and `events.fee.chargeOnConfirm` says what pressing it does and is not shown. |

## Findings for the lane

1. **▲ Consent does not gate the RSVP**, and §5.8 requires it. `events.consent.blocksConfirmation`
   ships the sentence. Build the gate.
2. **Nothing says confirming creates a charge**, and `events.fee.chargeOnConfirm` exists.
3. **No answered state and no way to change an answer**, though `rsvp.change` exists.
4. **A coach's personal phone number is published to every parent.** §11 governs personal data.
5. **Event capacity has no model and no key**, and this is the one place capacity binds.
6. **Transport — a pickup with departure and return times — has no field** in §5.8's event.
7. **The deadline-passed state is not drawn**, on the screen built around a deadline.
8. **`Alert` needs a title and an action slot.** Fourth artboard.
9. **The fee sits inside a button label** — `MoneyDisplay`, not interpolation.
