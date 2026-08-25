# `12h` — אירועים ותחרויות · the parent's event list

| | |
|---|---|
| **Surface** | Parent app · 390×844 |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W4 · **M7 Events & belts** |
| **i18n namespace** | `events` |
| **Slot** | none |

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — title · a subtitle counting what awaits an answer.
3. **Content list** — three upcoming event cards, then a `היה` section label, then one past-event row.
4. **Tab bar** — four tabs, events active.

The content column is clipped rather than scrollable in the export — a static-export artefact, but
four cards plus a past section will not fit 844px. Confirm scrolling.

## ▲ The three cards render RSVP, consent and payment three different ways

This is the finding, and it has to be settled before one `EventCard` is built.

| | Card 1 — unanswered | Card 2 — answered | Card 3 — unanswered |
|---|---|---|---|
| **RSVP** | **two buttons** | **a chip** naming which children are confirmed | **plain trailing text** at the end of the detail line |
| **Consent** | a **dedicated alert banner** with a deadline | none — implied by the chip | **none, though the card is also unanswered** |
| **Payment** | the price, **inline in the detail line** | same | same |
| **Card treatment** | a solid danger border | neutral | a **dashed** border with no copy explaining it |

So "awaiting your answer" is a pair of filled buttons on one card and unstyled trailing text on
another; consent is a banner on one unanswered card and absent from the other; and **payment never
gets a status treatment at all** — the price is always folded into a sentence.

**Decide one canonical rendering per state.** Porting three treatments as three variants encodes the
inconsistency.

## States

| State | What renders |
|---|---|
| **RSVP — unanswered** | Two different treatments, above. `events.rsvp.pending` (`טרם ענו`) exists — and §4.3 makes *pending* a real state, not the absence of one. |
| **RSVP — confirmed** | A chip naming the children. |
| **RSVP — declined** | **Not drawn**, and `events.rsvp.no` exists. |
| **Consent — required** | A banner on one card. |
| **Consent — signed** | **Not drawn**, and `events.consent.signed` exists. |
| **Deadline passed** | **Not drawn**, and `events.rsvp.deadlinePassed` exists. |
| **Draft** | **Correctly absent.** §4.3 makes a draft invisible to guardians, and every card here is fully populated. Good. |
| **Empty / loading / error** | **Not drawn.** `events.list.empty` exists. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | all four cards, the tab bar |
| Ink | `--fg` | titles, type chips, the primary button's fill |
| Secondary text | `--text-secondary` | meta rows, detail lines |
| Muted text | `--text-muted` | the subtitle, the `היה` label, inactive tabs — **at D8's floor** |
| Semantic — consent required | `--danger` (+ an on-tint text variant) | the banner and card 1's border |
| Semantic — confirmed | `--paid` | the confirmed chip **and the past event's medal line** |
| Semantic — ? | `--pending` | **card 3's dashed border only, with no matching text anywhere.** Its meaning is undeclared. Finding. |
| Border | `--border` / `--border-strong` | hairlines; the decline button's outline |
| Belt | — none. This is a list, not a roster. |

No D8-retired grey.

> **Two token-role questions.** `--paid` renders both "you confirmed" and "won a medal" — neither is a
> payment, and D2's semantic tier lists `paid` as a payment status. **Third artboard borrowing it for
> a positive non-payment state** (see `12d`, `3b`, `4e`). And card 3's dashed `--pending` border has
> no text explaining it, so a parent sees a treatment with no meaning.
>
> The decline button's outline is drawn as translucent ink; D12 gives `--border-strong` a 3:1
> obligation because a ghost button's outline is the only thing identifying it as a control. **Use
> the token.**

## RTL

- The consent banner's icon sits at the reading start by DOM order — correct, no physical offset.
- The action row puts the **primary first**, so it takes the reading start. Deliberate priority.
- **Must not mirror:** every date, every time range, every price.
- Per D10, none of the export's spacing shorthand ports; use logical properties.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Both RSVP buttons | `Button` | `primary` and `secondary`. |
| Every card | `Card` | With a **tone variant** — neutral, danger, and whatever card 3's dashed treatment means. |
| Consent banner | `Alert` | `tone="danger"`, with `iconLabel`. |
| Confirmed chip | `StatusChip` | **`ChipStatus` has no member for an RSVP state.** `events.rsvp.*` has yes / no / pending. See the README's finding 3. |
| Type chips | `StatusChip`? | They are **categorical labels**, not statuses — `events.type.*` has six members. Either `StatusChip` gains a neutral tag mode, or tags are a separate thing. Decide once; `7a`, `9i`, `12d` and `7c` all draw them. |
| Every price | `MoneyDisplay` | Currently plain text inside a sentence. **Inline** again. |
| Empty state | `EmptyState` | Required; not drawn. |
| **Event card** | *feature-specific* | Type chip · child or audience · date · title · detail · a status/action row. Compose the above. |
| Past-event row | *feature-specific* | A distinct shape — date column, title, result. |
| Tab bar | *app shell* | |

**Cards are not tappable as whole units** — only the buttons and the details link carry a pointer.
If a whole-card tap is intended, that is an addition.

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `אירועים` | `events.title` (`אירועים ותחרויות`) | The screen and the tab both want the short form; the key is the long one. |
| `2 ממתינים לתשובה שלכם` | `events.rsvp.pending` (`טרם ענו`) | **Different person and no count wrapper** — the key is third-person ("they haven't answered"), the screen second ("awaiting *your* answer"). **Same person mismatch as `attendance.source.preReported`.** Finding. |
| `תחרות` / `אימון מיוחד` / `מבחן חגורה` | `events.type.competition` / `type.joint_training`? / `type.belt_exam` | Two exact; **`אימון מיוחד` — *special training* — is not one of the six members** (competition, belt_exam, seminar, joint_training, trip, other). Finding. |
| `כל הילדים` | `events.target.studio` (`כל המועדון`) | Different scope — *all my children* vs *the whole club*. **The parent-facing audience label has no key.** |
| event titles, dates, venues | — | Data. |
| `אישור השתתפות` | `events.rsvp.title` | exact |
| `לא נגיע` | `events.rsvp.no` (`לא מגיע`) | Person differs — plural on the parent's screen. |
| `נדרש אישור הורה · ההרשמה נסגרת ב־30.08` | `events.consent.required` (`דרוש אישור הורה`) + `events.form.rsvpDeadline` | Both halves exist; the composed banner does not. **And `events.consent.blocksConfirmation` — *the RSVP does not count as confirmed until the parent signs* — exists and is not drawn.** See [`7d`](7d-parent-event-invite.md). |
| `אישרתם · דנה, יוסי` | `events.rsvp.answered` (`התשובה נשמרה`) | Different statement, and it **interpolates a children list** — third artboard needing that formatter. |
| `פרטים` | — | **No key.** |
| `ממתין לתשובתכם` | `events.rsvp.pending` | Person again. |
| `היה` | `events.list.past` (`שהיו`) | Near-exact. |
| `יוסי — מדליית ארד` | `events.exam.result.pass` is the nearest | **▲ No key, and no model.** A **competition result — a medal** — is not `exam.result.*`, which is pass/fail. §5.8 models an event and an RSVP; **a placing or a medal has no column.** Finding. |
| Tab labels | — | **No keys.** |

## Findings for the lane

1. **▲ Three cards, three renderings of the same three states.** Settle one before building `EventCard`.
2. **▲ A competition result — a medal — has no model.** It appears here and on [`9i`](9i-staff-events.md)
   and [`7a`](7a-dashboard-events.md). §5.8 models RSVP and consent, not placings.
3. **`אימון מיוחד` is not in `events.type.*`**, and it appears on four artboards.
4. **Card 3's dashed border has no explanation** — a treatment with no meaning.
5. **Payment never gets a status treatment**, only a price inside a sentence.
6. **`events.consent.blocksConfirmation` exists and is not drawn**, here or on `7d`.
7. **Person mismatch on every RSVP string** — the parent's screen is second-person, the keys third.
8. **A children-list formatter** is needed in `core`. Third artboard.
9. **`--paid` for a medal.** Third artboard borrowing the payment token for a positive state.
