# `13c` — דף נחיתה בדסקטופ · sticky form beside the pitch

| | |
|---|---|
| **Surface** | Parent app, public · 1440×1000 |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W2 · **M3 People & funnel** |
| **i18n namespace** | `people` |
| **Slot** | none |

The desktop rendering of [`13a`](13a-parent-landing-mobile.md). **Read that spec first** — everything
about states, tokens, primitives and the twenty missing keys carries over. This spec records only
what the reflow changes.

## The one fact that matters

**The sticky form panel sits on the LEFT.**

The body is a flex row with two children in DOM order: main content, then the form panel. The root
is `dir="rtl"` with no `row-reverse`, so the first child takes the reading start (the right) and the
form lands on the left.

That is the opposite of what "RTL start = right = the important thing" would suggest. **Port it
literally.** Do not move the form to the right on the theory that it is more RTL-natural; that is
not what was drawn and not what was approved.

> **▲ D10 — the panel's divider is a physical `border-right`.** It faces the content column here
> only because of where the panel happens to fall. Mirror the layout to LTR with the same DOM order
> and the seam moves to the panel's outer edge. It must be a logical inline border.

## Regions

1. **Top bar** — inverted band, full width: brand mark · club name · spacer · address · phone.
   The address in the top bar is **desktop-only**; mobile has no address until its location card.
2. **Body row**
   - **Main content** (flexible, on the right): headline · subheadline · belt strip + caption ·
     "when you can come" heading · **three schedule cards side by side** ·
     **three benefit columns**.
   - **Form panel** (fixed width, on the left, on `--surface`): heading + subtext · child's name ·
     age + parent's name (2-up) · phone · slot chips · submit · disclaimer · spacer ·
     a WhatsApp contact row pinned to the bottom.

## What reflows

| Mobile (`13a`) | Desktop (`13c`) |
|---|---|
| Schedule rows, stacked, inside one card | Three separate cards, side by side |
| Numbered 1/2/3 steps under a heading | Three unheaded benefit columns — **the heading is dropped entirely** |
| Form inline in the scroll | A fixed-width sticky panel |
| A location card with a map and two buttons, then a dark footer | **Neither appears** within the artboard's bounds |

The artboard is a fixed 1000px canvas with `overflow: hidden` at three levels, so the missing
location card and footer may be below the fold on a genuinely scrolling page — the title *"sticky
form beside"* implies exactly that. **The export cannot tell us.** Confirm rather than assume they
were dropped for desktop.

## Copy that differs from mobile

Nine strings are **reworded**, not merely reflowed: the subheadline (desktop adds the city and
"a full lesson"), the belt caption (desktop drops "from white to black"), all three benefit bodies,
two benefit titles, and the headline's line break falls at a
different word. Two strings are **desktop-only**: the top-bar address and the WhatsApp contact row.
One is **dropped**: the `איך נראה שיעור ניסיון` section heading.

**This is the finding.** Nine reworded strings across two breakpoints means either two key sets or
one — and one key set means the copy must be reconciled to a single wording before either page is
built. G4 forbids inlining, so the choice cannot be deferred to the component.

## States

Same as `13a`, with the same gaps: no loading, no field validation, no submit-in-flight, no error,
no "no slots" state. The chip group draws selected · unselected — **no waitlist**, and the schedule
cards carry **no availability line at all**. See `13a`'s capacity decision.

The **WhatsApp contact row carries no pointer affordance** in the markup, unlike mobile's WhatsApp
button. Whether it is clickable here is undecided.

## Tokens by role

Identical to `13a`'s table. The one addition is the top bar, which uses `--fg` as an inverted
ground with `--on-fg` text, exactly as the hero band does on mobile. **No D8-retired grey.**
Muted text again sits at D8's floor with no headroom.

> **▲ D7 — only the white segment of the belt strip is ringed**, same as mobile. Yellow, orange,
> green, blue and brown carry none. `BeltBar` rings unconditionally.

## RTL

- The form panel is on the left. See above.
- The top bar's `flex: 1` spacer is direction-agnostic and safe.
- The one physical property is the panel's divider. Named above.
- **Must not mirror:** the phone in the top bar, the phone field, all times.
- Only the phone field carries tabular numerals. Carry that into `TextField`'s phone variant rather
  than leaving digit alignment to chance.

## Primitives

Same mapping as `13a`. Two notes specific to desktop:

- The **schedule cards** become three `Card`s rather than rows in one card. Their availability text
  should become a `StatusChip` rather than the raw coloured text the canvas draws — the same signal
  already renders as a chip elsewhere on this surface.
- The **top bar** is public marketing chrome, not the in-app parent shell. Do not reuse the shell.

## Strings → keys

See [`13a`](13a-parent-landing-mobile.md#strings--keys). Every gap there applies here, plus:

| Desktop-only | Key | Status |
|---|---|---|
| top-bar address | — | **No key**, and it is studio data. |
| `מעדיפים לדבר? כתבו לנו בוואטסאפ` | — | **No key.** `comms.delivery.shareToWhatsapp` is a manager action, not this. |

## Findings for the lane

1. **The form is on the left. Do not "correct" it.**
2. **Nine strings are reworded between breakpoints.** Reconcile to one wording, or decide
   deliberately that the two pages carry different copy — and record which.
3. **The location card and footer are absent from the artboard** and may be below the fold. Confirm.
4. **A physical `border-right`** does the divider's work.
5. **The WhatsApp row's interactivity is undeclared.**
6. **Capacity: settled — there is no limit.** Same as [`13a`](13a-parent-landing-mobile.md) finding 5.
   The three schedule cards lost their availability lines and the amber "full" card treatment.
