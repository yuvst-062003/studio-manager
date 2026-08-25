# `12i` — פרופיל · עזיבת המועדון

| | |
|---|---|
| **Surface** | Parent app · 390×844 · **two frames** |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W2 · **M3 People & funnel** |
| **i18n namespace** | `people`, plus `billing` for the debt notice and `common` for the theme control |
| **Slot** | none |

Frame 1 is the parent's profile. Frame 2 is the leave bottom sheet it opens.

## Regions

**Frame 1** — device chrome · identity header (avatar · name · phone + email · an edit pill) ·
scroll body: `הילדים שלי` label and a card of three rows (two children with an accent bar, a name,
a group; then an add-child row) · `חשבון` label and a card of three rows (payment method · notifications ·
dark mode with a state label and a switch) · a **bare destructive row** outside any card ·
footer: club identity and phone.

**Frame 2** — a blurred, dimmed rendering of frame 1 · a scrim · a bottom sheet: drag handle ·
title · subtitle · `מי עוזב` label and a three-way selector · `סיבה · לא חובה` label and four reason
chips · a **warning box carrying the debt notice** · an action row of two buttons.

The sheet has **no explicit close control** — only the drag handle and a tappable scrim, neither of
which the markup declares. That needs deciding.

## States

| State | What renders |
|---|---|
| **Dark-mode switch** | **Off only.** The on state is not drawn. |
| **`מי עוזב` selector** | Both drawn — one selected (filled), two unselected (outlined). The two child options carry their identity colour; "both" carries none. |
| **Reason chips** | **All four drawn identically, unselected.** No selected styling exists anywhere in the markup, so **whether selection is single or multiple is undecided**, and so is what a chosen chip looks like. |
| **Loading / error / empty** | **Not drawn** on either frame. |
| **Leave — in flight** | **Not drawn.** |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | both frames |
| Surface | `--surface` | cards, the sheet |
| Ink | `--fg` | primary text, primary button fill, the switch's knob |
| Secondary text | `--text-secondary` | child sublines, sheet subtitle, footer, chip text |
| Muted text | `--text-muted` | section labels, the contact line, the switch's state label — **at D8's floor** |
| Semantic — destructive | `--danger` | the leave row's icon and label, the warning box's icon and border |
| Semantic — destructive, on tint | `--danger` on `--danger-tint` | **the debt notice's own text is a darker red than the icon** — that is the on-tint variant D12 added the audit for. Use the token pair; do not pick a second hex. |
| Scrim | *no token* | The sheet's dim layer has no token. Finding. |
| Border | `--border` / `--border-strong` | hairlines, the edit pill's outline |

No D8-retired grey.

## The debt notice — the string that matters

> `החיוב של החודש הנוכחי נשאר בתוקף. אם הקמתם הוראת קבע בבנק — הביטול שלה באחריותכם.`

Two claims: this month's charge stands, and cancelling a standing order at the bank is the parent's
job. The second is exactly the constraint CLAUDE.md records — **הוראת קבע cannot be created or
cancelled programmatically by our provider** — surfaced to the parent at the one moment it matters.
It must not be softened. `people.leave.debtNotice` carries the first half only.

**The confirm button is styled as a neutral primary, not as destructive**, even though the trigger
row and the warning box on the very same artboard are both drawn in `--danger`. `ButtonVariant`
includes `destructive`. That inconsistency should be resolved deliberately rather than ported.

## The accent bars are not belts

The 5px bars beside the children's names, and the 4px bars in the `מי עוזב` selector, look like belt
bars but are **per-child identity colours** — the same two colours attach to the same two children
on `12j`, the first-registration flow, before a belt would exist. **D7's ring likely does not apply.**
Confirm against the data before choosing `BeltBar`, and see [`12j`](12j-parent-first-registration.md)
finding 3: these colours have no column in §4.3.

## RTL

- Both frames are `dir="rtl"`.
- The child rows' **chevron** points toward the reading direction — correct, and directional.
- **The leave row's icon is a standard exit glyph whose arrow points right — the same direction it
  would point in LTR.** That is a probable mirroring miss. Check it against the icon layer's rule.
- The switch's off knob rests at flex-start, which resolves to the right in RTL. That is the
  primitive's job; `Switch` must derive it from `dir`, not from a hard-coded side.
- **Must not mirror:** the phone number in the header and the one in the footer, the masked card
  digits, the notification count.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| The two cards, the sheet's container | `Card` | |
| `עריכה`, the sheet's two buttons | `Button` | The confirm should probably be `variant="destructive"`. |
| `מי עוזב` selector | `SegmentedControl` | Fits the three-way single-select, **but each segment needs a leading colour swatch** and `options` is `{value, label}` only. Either the label carries it or this is a feature composition. |
| Child rows | `StudentRow` | Name + subline + accent + tap. The `belt` prop is required and these are not belts — see above. |
| Dark-mode row | `ThemeControl` | Takes `legend`, `labels`, `stateLabels`. **This is the primitive for exactly this row**, and D4's three options (light/dark/system) mean it is a three-way control, not the two-state switch the canvas draws. **The canvas is a switch; D4 says three options.** Finding. |
| The debt warning box | `Alert` | `tone="danger"`, with `iconLabel`. |
| Reason chips | *gap* | **No chip/tag-select primitive exists among the 18**, and no selected state is drawn. Same gap as `13a`'s slot chips and `11b`'s referral chips — **three artboards, one missing primitive.** |
| Profile header, settings rows, the bare destructive row, the sheet chrome | *feature-specific* | No avatar primitive exists either. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| name, phone · email | `people.student.phone`, `.email` label them | The composed contact line is data. |
| `עריכה` | — | **No generic edit key** in `common`. |
| `הילדים שלי` | — | **No key.** `people.student.plural` is `חניכים`, the club's word, not a parent's "my children". Finding. |
| `הוספת ילד` | `people.sibling.title` (`הוספת ילד נוסף`) | Near-exact. |
| `חשבון` | — | **No key.** |
| `אמצעי תשלום` | `billing.method.card` etc. are the methods | **No key for the settings row's label.** |
| `****4471` | — | Data. Must not be logged. |
| `התראות` / `7 מופעלות` | `comms.preferences.title` (`הגדרות התראות`) | **Cross-namespace (M8)**; the count has no key. |
| `מצב כהה` / `כבוי` | `common.theme.dark` / `comms.preferences.off` | **The theme labels are in `common` and the on/off pair is in `comms`.** `common.theme.state.light` / `state.dark` exist and are what `ThemeControl` wants. Use `common`. |
| `עזיבת המועדון` | `people.leave.title` | exact |
| club identity · phone | — | **No key**; studio data. |
| `נעדכן את המועדון. מומלץ לדבר גם עם המאמן.` | — | **No key.** |
| `מי עוזב` | — | **No key.** §5.3 makes all guardians equal but says nothing about leaving per-child; the model needs to allow one child, another, or both. |
| `סיבה · לא חובה` | `people.leave.reason` (`סיבה`) | The optional marker has no key. |
| the four reason chips | — | **No keys.** `people.funnel.lost` is an outcome, not a reason. §5.14's funnel would benefit from these being an enum rather than free text. Finding. |
| the debt notice | `people.leave.debtNotice` (`החיוב החודשי נשאר באחריות ההורה`) | **The key carries half the string.** The standing-order sentence — the operationally important half — has no key. Finding. |
| `דברו איתי קודם` | — | **No key.** |
| `שליחת הודעת עזיבה` | `people.leave.submit` (`אישור עזיבה`) | Wording differs. |
| `לעזוב את המועדון?` | `people.leave.confirm` | **The key exists and the artboard does not draw a second confirmation** — the sheet is the confirmation. Check whether the key is dead. |
| `תאריך עזיבה` | `people.leave.date` | **The key exists and the artboard has no date field.** §4.3 needs a leave date. Finding. |

## Findings for the lane

1. **The debt notice's second sentence has no key** and it is the one that tells a parent they must
   cancel their own standing order. CLAUDE.md's gotcha, surfaced to a user. It must ship.
2. **D4 says light / dark / system; the canvas draws a two-state switch.** `ThemeControl` already
   models three. The artboard is the odd one out.
3. **`people.leave.date` has a key and no field.** A leave with no date cannot compute a final charge.
4. **The reason chips have no keys, no selected state, and no declared cardinality.** As free text
   they are useless to `reports.funnel.bySource`; as an enum they need members.
5. **No chip-select primitive**, and it is now wanted on `12i`, `13a`/`13c`, `12a` and `11b`.
6. **The confirm button is not styled destructive** though everything around it is.
7. **The leave row's exit icon may not be mirroring.**
8. **The scrim has no token.**
9. **`הילדים שלי` has no key** — the parent's word for their own children is not `חניכים`.
