# `12j` — הרשמה ראשונה · two entry paths into first registration

| | |
|---|---|
| **Surface** | Parent app · 390×844 · **two frames** |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W2 · **M3 People & funnel** |
| **i18n namespace** | `people`, plus `health` for the third step |
| **Slot** | none |

## The two frames

The title names two entry paths and the frames match them, though **the markup labels neither** —
this reading comes from the content, not from a label, and should be confirmed:

- **Frame 1 — the club link.** A welcome screen for a parent who followed a link the club sent.
  Nothing is filled in yet; the copy says the club already added the children.
- **Frame 2 — continuing from a trial lesson.** Lands directly on **step 3 of 3**, the health
  declaration, with the progress bar full — the parent already gave contact details at the trial,
  so only the declaration remains.

## Regions

**Frame 1** — device chrome · a vertically centred column: app mark · two-line heading · subheading ·
a card listing the children (accent bar · name · group/schedule per row) · a two-line steps summary ·
then a bottom area: primary button + a text link beneath it.

**Frame 2** — device chrome · step header (back chevron + step counter) · progress bar · scroll region
(heading · subheading · a card of two child rows, each with a check glyph, a name and a health summary ·
a `חתימה` micro-label · the signature pad with its placeholder · an info row) · a bottom bar with one button.

## States

| State | What renders |
|---|---|
| **Signature — empty** | Drawn: placeholder copy, no ink. |
| **Signature — signed** | **Not drawn.** |
| **Signature — required error** | **Not drawn.** `health.declaration.signatureRequired` exists. |
| **Submit — in flight** | **Not drawn.** `health.declaration.submitting` exists. |
| **Wrong recipient** | Only the `זה לא אני` link. What it opens is not drawn. |
| **Loading / error** | **Not drawn** on either frame. |
| **Child rows** | Frame 1's rows carry no pointer affordance and no chevron — **static preview data**, not tappable. Frame 2's check glyphs are read-only "already confirmed" markers, not live toggles. |

Neither frame draws a disabled primary button, so it is undecided whether frame 2's submit is gated
on the signature being present.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | both frames |
| Surface | `--surface` | the cards, frame 2's bottom bar |
| Ink | `--fg` | headings, primary buttons, icon strokes |
| On-ink | `--on-fg` | the primary buttons' labels |
| Secondary text | `--text-secondary` | body copy, meta lines |
| Muted text | `--text-muted` | micro-labels: the step counter, `חתימה`, the steps summary |
| Border | `--border` | card edges, row dividers, the signature pad's baseline |
| Semantic | — | **none.** Neither frame uses a status colour. |

No D8-retired grey. **The canvas uses two distinct secondary greys** — one for body copy and one
for micro-labels. Both pass. Map them to `--text-secondary` and `--text-muted` respectively rather
than collapsing them; the distinction is doing real work here.

## The accent bars are not belts

Each child carries a coloured bar — one green, one blue. **These are per-child identity colours, not
`belt_rank.color_hex`.** The same two colours attach to the same two children on `12i` and `12a`,
before any belt would plausibly be assigned, and this is the first-registration flow.

That means **D7 does not apply to them** — and it also means they are a UI concept with no data
model behind them. §4.3 carries no per-child colour. See findings.

## RTL

- Both frames are `dir="rtl"`.
- Frame 2's **back chevron points right**, which is correct for RTL. It is a hand-drawn path; feed
  the icon component a logical direction so it does not double-flip in an LTR locale.
- **Must not mirror:** the times in the schedule lines, the step counter's digits, the progress bar's
  fill direction is `dir`-relative and should be left to the primitive.
- Per D10, nothing here takes a physical margin.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Primary buttons | `Button` | `variant="primary"`. `זה לא אני` should be `variant="ghost"`, not a bespoke link. |
| The two cards | `Card` | |
| Child rows | `StudentRow` | Takes `name`, `groupLabel`, `belt`, optional `status`, `onSelect`. **The belt prop is required** and these bars are not belts — so either `StudentRow` is the wrong fit, or the identity-colour question below is settled first. Frame 2's leading check glyph has no slot either. |
| Progress bar | `ProgressBar` | `label`, `value`, `max`. Exact fit. |
| Info row (frame 2) | `Alert` | `tone="pending"` is the closest; the row is neutral, so a plain `Card` may be truer. `Alert` requires a tone and an `iconLabel`. |
| Step header (chevron + counter + `ProgressBar`) | *feature-specific, shared* | **The setup wizard `5c`–`5f` has the same shape.** `slots.ts` registers a `setup-wizard` slot. Build `WizardStepHeader` once. |
| Signature pad | *gap — no primitive* | Shared with [`12c`](12c-parent-health-declaration.md). Build **one** `SignaturePad`; check `12c` before building. |
| Onboarding hero (frame 1) | *feature-specific* | |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `שלום מיכל,<br>מכבי ג׳ודו רעננה מחכים לכם` | — | **No key.** A greeting interpolating a parent name and a studio name, split across two lines by markup. |
| `המועדון כבר הוסיף את דנה ואת יוסי…` | — | **No key.** It interpolates a **variable-length list of child names with Hebrew conjunction** (`את X ואת Y`). Two children joins with `ואת`; three needs commas. This is the hardest interpolation in the parent app. Finding. |
| child name · group/schedule | `people.student.group` labels it | The composed line is data. |
| `3 שלבים · שתי דקות` | — | **No key**, and it spells one number as a digit and one as a word. |
| `אימות טלפון · פרטי קשר · הצהרת בריאות` | `people.student.phone` · — · `health.declaration.title` | The **middle step has no key** and the composed line has none. |
| `בואו נתחיל` | — | **No key.** |
| `זה לא אני` | — | **No key**, and no flow behind it. §5.4 matches on *verified* email or phone (`people.request.matchedHint`), so a wrong-recipient path matters. Finding. |
| `שלב 3 מתוך 3` | — | **No key** for a step counter with two interpolated numbers. Shared with the setup wizard. |
| `הצהרת בריאות` | `health.declaration.title` | exact (M4) |
| `חובה לפני האימון הראשון. אפשר לחתום לשני הילדים יחד.` | `health.declaration.subtitle` (`נדרשת לפני תחילת האימונים`) | **First half matches in intent; the second half — signing for several children at once — has no key and is a real feature claim.** Finding. |
| the per-child health summary lines | `health.flag.*` | **These are derived flags, and the artboard renders them as prose.** §5.5 and G7 are explicit: coaches see `derived_flags` booleans, never free text. This is the parent's own screen so the parent may see more — but the *shape* must be fixed labels from `health.flag.*`, not an interpolated sentence, or the same component will leak medical prose into a coach's view. Finding. |
| `חתימה` | `health.declaration.signature` | exact |
| `חתמו כאן באצבע` | `health.declaration.signatureHint` (`חתמו באצבע במסגרת`) | Wording differs. |
| `ההצהרה תקפה לשנה. נזכיר לכם לחדש.` | `health.declaration.noExpiry` (`ההצהרה תקפה ללא הגבלת זמן`) | **▲ Direct contradiction.** The canvas says the declaration expires in a year and a reminder will come; the key says it never expires. §5.5 is the key's source. **The canvas copy is wrong and must not ship.** Finding. |
| `חתימה וסיום` | `health.declaration.submit` (`שליחת ההצהרה`) | Wording differs. |

## Findings for the lane

1. **▲ The one-year-validity line contradicts §5.5.** `health.declaration.noExpiry` says declarations
   do not expire. The artboard promises an annual renewal reminder. Ship the key.
2. **Health summaries are rendered as prose.** They must come from `health.flag.*` fixed labels.
   The same row component may end up in a coach's view; G7 has no exceptions.
3. **Per-child identity colours have no data model.** §4.3 carries no such column, and they appear on
   `12i`, `12a` and here. Either add one, derive from something stable, or drop them.
4. **A variable-length Hebrew name list** needs a formatter in `web/packages/core`, not a template.
5. **The wizard step header is shared with `5c`–`5f`.** Build once.
6. **The signature pad is shared with `12c`.** Build once.
7. **`זה לא אני` has no flow.** §5.4's matching is on verified contact details; getting the wrong
   family's link is exactly the case that needs an exit.
8. **Signing for several children at once** is claimed in copy and has no key and no spec line.
