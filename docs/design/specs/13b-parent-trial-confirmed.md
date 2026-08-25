# `13b` — אחרי השליחה · אישור והמשך

| | |
|---|---|
| **Surface** | Parent app (public, pre-install) · 390×844 |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W2 · **M3 People & funnel** |
| **i18n namespace** | `people` (with borrowed keys — see Strings) |
| **Slot** | none — single-owner screen |

Terminal confirmation for the public trial-lesson funnel. It is the screen `13a`/`13c`
submit into. There is no back chevron and no nav: the flow ends here.

## Regions

1. **Device chrome** — mock status bar. Not an app element; do not port it.
2. **Content** — one vertically centred column, `flex: 1`.
   1. **Success hero** — 64×64 rounded tile, filled, with a checkmark glyph.
   2. **Heading** — one line, interpolates the child's name.
   3. **Subtext** — two lines: weekday + date + time, then class + venue.
   4. **`מה עכשיו` card** — a `Card` holding three icon+text rows.
   5. **Action row** — two equal-width buttons, side by side.
3. **Footer** — one centred line: how to reschedule, with a phone number.

Nesting matters in one place only: the action row is **inside** the centred content
column, below the card. The footer is a sibling of the content column, not part of it.

## States

| State | What renders |
|---|---|
| **Default (the only one the canvas draws)** | Everything above, populated. |
| **Loading** | **Not drawn.** The screen is reached after a completed POST, so it has no loading state of its own. If the lane arrives here by client-side route with the booking not yet confirmed, that is a new state and needs a decision. |
| **Empty** | Not applicable — there is no list. |
| **Error** | **Not drawn, and this is a real gap.** `13a`'s submit can fail; the canvas has no failure counterpart to this screen. The lane should keep the failure on `13a` (inline, next to the submit button) rather than invent a sad-path `13b`. |
| **Already booked** | Not drawn. `people.trial.override` / `people.trial.overrideHint` exist for a second free trial, but that decision is a manager's and does not surface here. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | the `מה עכשיו` card |
| Ink | `--fg` | heading, checklist text, primary button fill, secondary button outline |
| On-ink | `--on-fg` | the primary button's label |
| Secondary text | `--text-secondary` | the date/venue subtext, the footer line |
| Semantic — success | `--paid` | the success hero's fill |
| Border (hairline) | `--border` | the card's edge |
| Belt | — none. No belt is rendered on this screen. |

Two notes the lane must not skip:

- The success hero's fill is a **semantic** token, not a belt colour. The canvas draws it
  in a green one shade off the green-belt swatch used on `12d`; D3 requires belt colours
  and semantics stay distinct, and D12 already moved dark-mode `--paid` off the green-belt
  hex for exactly this collision. Use `--paid`; never reach for a belt value.
- No D8-retired grey appears on this artboard.

## RTL

The page is `dir="rtl"` end to end and the layout mirrors correctly as a whole.

**Must not mirror:**
- The **checkmark** in the success hero. A mirrored check reads as a scribble.
- `31.08` and `18:30` — the digit runs stay LTR inside the RTL sentence. Format through
  `web/packages/core/src/datetime.ts`, which renders Asia/Jerusalem regardless of locale (G3).
- The footer's phone number.

Everything else is symmetric. Per D10, the two-button action row is a flex row with a gap —
never a `margin-right` on the second button.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| `הוספה ליומן` | `Button` | `variant="secondary"` — the outline treatment. |
| `חתימה על ההצהרה` | `Button` | `variant="primary"` — the filled treatment, the heavier CTA. |
| `מה עכשיו` container | `Card` | Neutral, no tint. **Not** `Alert`: `Alert` carries a semantic tone and an `iconLabel`, and nothing here is a warning. |
| Success hero | *feature-specific* | Tile + glyph. Not one of the 18. Worth watching: if a second post-submit confirmation appears, promote it rather than copy it. |
| Checklist rows | *feature-specific* | Icon + one line of body text. Not `StudentRow`, which is a name/belt/status row. |
| Heading, subtext, footer | — | Plain type. `--text-display` / `--text-body` / `--text-caption`. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `נשמר מקום לאורי` | `people.submitted.title` | **Wording differs.** The key reads `נרשמתם לשיעור ניסיון`; the canvas names the child. Either the key wins, or it gains a `{{name}}` param. The lane picks one — it must not inline the canvas string. |
| `מה עכשיו` | `people.submitted.whatNext` | exact |
| `מגיעים 10 דקות לפני, בבגדים נוחים` | `people.submitted.bringHint` | Wording differs slightly (`הגיעו עשר דקות…`). The key wins. |
| `הוספה ליומן` | `comms.calendar.addSingleEvent` | **Cross-namespace.** The calendar affordance is M8's, on an M3 screen. Either M3 renders it behind M8's key, or the button waits for W5. Flag it in the W2 contract review rather than duplicating the key into `people`. |
| `חתימה על ההצהרה` | `health.gate.action` (`מילוי ההצהרה`) | **Cross-namespace and wording differs.** Health is M4/W3. In W2 this button has nothing to link to; the honest W2 build omits it. |
| `שלחנו לכם הודעת וואטסאפ עם הפרטים` | — | **No key exists.** A finding: `people` has no WhatsApp-confirmation string, and §5.11's WhatsApp affordance is `comms.delivery.shareToWhatsapp`, which is a manager action, not this. |
| `הצהרת בריאות קצרה — אפשר לחתום עכשיו או במקום` | — | **No key exists.** Closest is `health.declaration.subtitle`, which says the declaration is required before training — a different promise from "sign now or on the mat". |
| `צריך לשנות מועד? כתבו לנו בוואטסאפ 09-771-2233` | — | **No key exists**, and the number is studio data, not copy. Needs a key with the number interpolated. |
| weekday · date · time | — | Data, not copy. Format via `core/datetime`. |
| class name · venue | — | Data. |

**Keys that exist but this artboard does not draw:** `people.submitted.subtitle`,
`people.submitted.installApp`, `people.submitted.done`. `installApp` matters — this is the
pre-install public funnel and §6.5 wants the PWA installed. Its absence from the canvas is
a design gap, not a licence to drop the key.

## Findings for the lane

1. **No error counterpart.** Decide on `13a`, not here.
2. **Three strings have no key**, all in the "what happens next" card and footer. Two of
   them make promises (a WhatsApp message; signing on-site) that the lane must confirm the
   product actually keeps before shipping the copy.
3. **Two buttons belong to other waves.** Calendar is M8, health signature is M4. A W2 build
   of this screen ships the confirmation and the card, and adds the buttons when their lanes land.
4. **`installApp` is missing from the picture.** Raise it before the artboard is treated as final.
