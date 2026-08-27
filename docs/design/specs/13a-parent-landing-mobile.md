# `13a` — דף נחיתה · the public trial-lesson page, mobile

| | |
|---|---|
| **Surface** | Parent app, **public and unauthenticated** · 390×1935, full scroll |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W2 · **M3 People & funnel** |
| **i18n namespace** | `people` |
| **Slot** | none |

§5.4's public link. Its **only** job is a first lesson — nothing here promises a place, because
enrolment is always a manager decision. The desktop rendering is [`13c`](13c-parent-landing-desktop.md);
the confirmation is [`13b`](13b-parent-trial-confirmed.md).

This is not the logged-in app shell: no nav, no tab bar, no back control.

## Regions, in scroll order

1. **Hero band** — inverted ground. Brand row (mark · club name · phone) · two-line headline ·
   subheadline · a seven-segment belt strip with a caption.
2. ~~**Stats strip**~~ — **cut, 2026-08-27** (landing decision 2): no field carries the
   numbers, and computing them would publish a live headcount on an unauthenticated
   endpoint. Removed from the canvas; `tests/contracts/test_canvas_matches_spec.py` holds
   it removed. The region number is kept so cross-references stay stable.
3. **"How a trial lesson looks"** — heading + three numbered items.
4. **"When you can come"** — heading + subtext + a card of three **read-only** group rows.
5. **Reservation form card** — heading + subtext · child's name · age + parent's name (2-up) ·
   phone · a "when suits you" chip group · submit · disclaimer.
6. **Location card** — heading + address · a map placeholder · two buttons.
7. **Footer band** — inverted ground. Club identity + the one-free-trial disclaimer.

### The picker — amended 2026-08-27 (landing decision 3)

The "when you can come" card (region 4) is **informational only** — its rows carry no pointer
affordance and no selected state. The only picker is inside the form.

**The earlier rule here — "do not build a two-step group→slot flow" — was wrong, and the code
was right.** §5.4a asks group and slot **per child**, groups filter by each child's age, and a
flat chip list cannot express "Uri in the 18:30 group, Noa in the 16:00 one." The rule is now:
**one-step chips (`SlotChips`) when there is exactly one child — no fieldset naming anybody —
and the per-child flow the moment a sibling is added.** A test pins each half.

Chip states: selected (ink fill) · unselected (outline) · plus a "call me instead" escape hatch
styled as unselected. **There is no waitlist state** — see the capacity decision below.

## States

Recorded as BUILT (L7, 2026-08-27) — the artboard drew a happy path only; what ships is:

| State | What renders |
|---|---|
| **Page loading** | `landing-loading` — a single line while the payload arrives. |
| **404 / 503** | Told apart, deliberately: `not-found` ("no such club") vs `no-schedule` ("the schedule is still being built"). One message for both would send somebody to the wrong club looking for a typo. |
| **No slots in this group** | `people.landing.noSlots` renders in place of the chips; the booking may still be sent — the manager places the child by hand. |
| **Loading (slots)** | The chips arrive with the step; a failed fetch is a `schedule_unavailable` error inline. |
| **Submitting** | The submit button relabels to `people.landing.submitting` and disables. |
| **Validation** | Continue/submit are DISABLED until the step is complete, with the missing thing visible (empty field, unchecked declaration, unpicked slot). No red-text field errors: nothing can be submitted wrong, so there is nothing to scold. |
| **Submit failure** | Inline `Alert` naming the case — 409 already-used, 429 rate-limited, 503 schedule, generic — **without clearing the form**. The chosen slot stays chosen; `13b` has no sad-path twin, so the failure lives here. |
| **Group full** | **Does not exist.** A group has no cap — see the capacity decision below. |

**There is no sign-in affordance anywhere on this artboard.** No login, no "already registered".
That matters: `people.landing.signInFirst` and `landing.signInHint` exist, and §5.4 is explicit that
the flow is sign-in-first *so the parent can follow the lesson in the app*. **The canvas and the
spec disagree** — see findings.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Ground, inverted | `--fg` | the hero and footer bands |
| On-inverted | `--on-fg` (and reduced-opacity variants) | text on those bands |
| Surface | `--surface` | the three cards |
| Ink | `--fg` | headlines, submit fill, selected chip fill |
| Secondary text | `--text-secondary` | descriptions, subheadlines, disclaimers |
| Muted text | `--text-muted` | form labels and placeholders — **at D8's floor, with zero headroom** |
| Belt | `belt_rank.color_hex` via `BeltBar` | the hero strip; the group rows' accent bars |

**The hero band uses three different opacities of on-inverted text.** Pick one role per job rather
than three near-values. No D8-retired grey appears.

> **▲ D7 — the hero belt strip carries no ring on any segment**, white included, and the group rows
> ring only their first swatch. `BeltBar` rings unconditionally.
>
> **▲ Two belt palettes.** The hero strip and the group rows use *different hexes for the same
> belts*. The strip's colours are lighter throughout, and its final segment — captioned "black" —
> is drawn as a near-white cream. That last one is a design-file bug; the rest is palette drift.
> Belt colour is `belt_rank.color_hex`, per-studio **data** (D3, §5.9). Render both from the same
> source; do not transcribe either set.

## RTL

- **The hero belt strip's DOM order is already correct**: white first renders at the reading start
  under `dir="rtl"`, matching the caption "from white to black". **Do not reverse the array to
  "fix" apparent order** — that would break it.
- The numbered badges and the group rows' accent bars sit at the logical start. Use
  `margin-inline-start`, never `margin-left`.
- **Must not mirror:** both phone numbers, all times, the age ranges. Each is a
  numeral run inside a Hebrew sentence and needs bidi isolation so the digits do not reorder.
- No back or forward chevron exists here — this page has no in-app navigation.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| The three cards | `Card` | |
| Four form fields | `TextField` | `label`, `hint`, `error`. The phone field is drawn in an emphasised state — that is `TextField`'s focused or filled state, not a separate component. |
| Submit, navigate, WhatsApp | `Button` | `primary` and `secondary`. |
| Slot chip group | *feature-specific* | Single-select, **wrapping**, two states. `SegmentedControl` takes a flat `options` list and renders one track — it does not wrap and has no per-option variant. Build `SlotChips`. |
| Hero belt strip | `BeltBar` | If `BeltBar` can render a full ladder with no "current" marker. If not, that is a variant to add, **not** a reason to draw bare swatches. |
| Hero, steps, group rows, map, footer | *feature-specific* | Marketing composition. `StudentRow` does not fit the group rows — those are anonymous public schedule rows, not enrolled students. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| headline / subheadline | `people.landing.title` (`שיעור ניסיון חינם`) / `landing.subtitle` | **Wording differs** on both, and the artboard splits the headline across two lines with a `<br>`. A translated string cannot carry a line break; the layout must. |
| `מסלול החגורות במועדון — מלבנה עד שחורה` | `events.belt.title` (`מערכת חגורות`) | **Cross-namespace (M7)** and wording differs. |
| `איך נראה שיעור ניסיון` + three steps | — | **No keys.** Six strings. Finding. |
| `מתי אפשר להגיע` | `people.landing.chooseSlot` (`בחירת מועד`) | Wording differs; the concept matches. |
| `בחרו קבוצה לפי גיל — הזמנים קבועים כל שבוע.` | `people.landing.chooseGroup` | Wording differs. |
| `גילאי 5–7` | `people.landing.ageRange` (`גילאים`) | The label exists; the range is data. |
| `ראשון וחמישי · 16:00` | `people.landing.weeklySchedule` (`מתאמנים בימים`) | The label exists; the composed line does not. |
| `נשמור לכם מקום` | — | **No key** for the form heading. |
| `שם הילד` | `people.student.firstName` (`שם פרטי`) | Wording differs. |
| `גיל` | `people.student.age` | exact |
| `שם ההורה` | `people.guardian.one` (`הורה`) | Needs a name-of-parent key. |
| `טלפון` | `people.student.phone` | exact |
| `מתי נוח לכם` | `people.landing.chooseSlot` | Wording differs. |
| `שתדברו איתי` | — | **No key.** |
| `שריון מקום לשיעור ניסיון` | `people.landing.submit` (`שריון מקום לשיעור`) | Near-exact. |
| the disclaimer under submit | — | **No key**, and it makes two promises: we will contact you, and the health declaration is signed before training. The second is M4's. |
| `איפה אנחנו` / address / `מפה` / `ניווט` / `וואטסאפ` | — | **No keys.** Five strings. |
| the footer band | — | **No keys.** |

## Findings for the lane

1. **Sign-in is missing from the artboard and present in the keys.** §5.4 and `people.landing.signInFirst`
   both say sign-in-first. The canvas shows a bare lead-capture form. One of them is wrong, and it
   changes the whole flow. **Settle before building.**
2. **Roughly twenty strings have no key**, almost all of them marketing copy in the hero, steps,
   location and footer. `people` was written for the product, not the landing page. Either it grows
   a `landing.*` block or the public page gets a decision that its copy is studio-editable content
   rather than translated UI. That is a real question: club name, address and phone are per-studio
   *data*, and so, arguably, is the pitch.
3. **Two belt palettes and a black belt drawn near-white.** Render from `belt_rank.color_hex`.
4. **No error state and no submit-failure path**, on either this screen or `13b`.
5. **Capacity: settled — there is no limit.** A group has no cap, so the page shows no remaining
   places, no `מלאה` state and no waiting list. Removed from the canvas 2026-08-27; the API already
   refuses to carry it (`PublicGroupOut` — "no enrollment count"). Do not reintroduce any of the three.
6. **`landing.noSlots` / `noSlotsHint` / `submitting` have keys and no drawn state.**
