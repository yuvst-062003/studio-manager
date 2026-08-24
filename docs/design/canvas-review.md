# Design canvas review — v1 artboards vs. spec

**Reviewed:** 2026-08-24
**Source:** `docs/design/canvas/` — 3 Claude Design exports, 13 iterations, ~62 artboards
**Reviewed against:** [SPEC.md](../../SPEC.md), [decisions.md](decisions.md), [ui-rtl-a11y.md](../../.claude/rules/ui-rtl-a11y.md)

**Method.** Static audit of the exported `.dc.html`: palette extraction, font declarations,
`dir` attributes, emoji scan, and text extraction from individual artboards compared against
the scope sections of SPEC.md. The artboards were **not rendered or viewed visually** — every
finding below is derived from markup and extracted text, so this catches scope and token
problems, not visual-quality ones.

---

## Verdict

The design language held across all 13 iterations and all three surfaces. Every foundational
decision from [decisions.md](decisions.md) survived contact with 62 screens, which is the
main thing this review was looking for. Four scope issues found, one of which is a spec bug
rather than a design bug.

## What holds up

| Decision | Evidence |
|---|---|
| **Rubik, all three scripts** (D-typeface) | `font-family:Rubik,system-ui,sans-serif` in all four files, single declaration each. Loaded with `wght@300;400;500;600;700`. |
| **RTL** | `dir="rtl"` — 27 / 24 / 22 / 1 instances across the four files. Not a mirrored LTR layout. |
| **Monochrome; colour only where it carries meaning** (D3) | Top palette is entirely warm neutrals: `#17150f` ink (606×), `#55524a` (633×), `#6f6b62` (356×), `#fffefb` (379×), `#f7f5f1` ground (236×). |
| **No decorative accent** | The only saturated blue, `#2f6fa8`, appears exclusively as a `5px` vertical bar beside a student name or as a segment in a progression bar — it is the **blue belt**. Data, not decoration. |
| **Semantics reserved** | `#b3261e` red, `#1f6b3f` green, `#8a5a00` amber. Belt colours (`#d9a800`, `#c76a1e`, `#6f4a2f`, `#e5b44f`) are distinct from all three. |
| **No emoji as iconography** | Zero pictographic emoji (U+1F300–1FAFF) across all four files. |
| **Light + dark** (D4) | `בהיר + כהה` variants on 1a, 1c, 9a. Dark grounds `#1e1d1a` / `#141311` — correctly not pure `#000`. |
| **Every toggle carries a state label** | Explicit in 2e (`לכל מתג יש תווית מצב`) and 3f (`הגדרות — לכל מתג תווית מצב`). This came from the Arbox reviewer complaint in [research/02](research/02-arbox-dashboard.md). |
| **Quick View, inline attendance** (D5) | 1e — `Quick View עם סימון נוכחות בתוך הלוח`. |
| **Monochrome survived dataviz** | 4g — `דוחות … ללא גרפים צבעוניים`. The reports page has no coloured charts. |
| **Household billing, not per-child** | 3e — `חוב לפי משק בית, לא לפי ילד`. The multi-guardian model from §6.3 applied correctly to collections. |
| **Component library exists** | 4h — `ספריית רכיבים — הבסיס לכל המסכים`, 1200×868. This is the highest-value artboard for the code port. |

Two details the design got right that were never briefed: **bi-colour belts** (5b,
`כולל חגורות דו-צבעיות`) — correct for children's judo grades — and the setup wizard
noting `התקדמות מימין לשמאל`, RTL progress direction.

---

## Findings

### 1 — In-app two-way chat. Explicitly out of scope. 🔴

**Artboard:** Parent App `2b` — *"הודעות: עדכוני מועדון + **שיחה עם המשרד** (במקום ערוץ ווטסאפ)"*

§2.3 lists **"in-app two-way chat"** among features explicitly out of scope.

The design's reasoning is visible in its own label — *"instead of a WhatsApp channel"* — and
it is not unreasonable: §5.11 rules out WhatsApp, email and SMS, and §12 explains that
WhatsApp groups cannot be automated. A designer reasoning from those constraints concludes
parents need some way to reach the office. But §2.3 already considered that path and closed it.

§5.11 permits exactly two levels: push notification, and a one-way in-app inbox. A
conversation thread with the office is a third thing.

**Recommended:** cut the conversation half of `2b`, keep the `עדכוני מועדון` inbox. If
reaching the office is a genuine gap, that is a spec change to argue on its merits — not
something to absorb silently through a mockup.

→ **Settled as [D9.1](decisions.md).** Not yet applied to the artboard.

### 2 — Weight categories on the event page. Deferred to v2. 🟠

**Artboard:** Manager Dashboard `7c` — a `משקל / קטגוריה` column showing `42 ק״ג · U13`,
`38 ק״ג · U13`, `34 ק״ג · U11`, `57 ק״ג · U18`.

§2.2 defers **"competition results tracking (brackets, **weight categories**, medals)"** to v2.

Events themselves are firmly in v1 (§2.1, §5.8) and the rest of `7c` is correct — RSVP
counts, parent-consent status, payment status all match §5.8. No brackets or medals appear.
It is specifically the weight-category column that crosses into v2, and it implies student
fields (weight, age category) that the §4.3 schema does not carry.

**Recommended:** drop the column for v1. The rest of the artboard stands.

→ **Settled as [D9.2](decisions.md).** Not yet applied to the artboard.

### 3 — "קבלות" overclaims for non-card payments. 🟡

**Artboard:** Parent App `12f` — titled `קבלות ותשלומים`, with the line
*"כל הקבלות נשמרות כאן — אפשר לשלוח למייל"* (all receipts are saved here, can be emailed).

§5.10 is careful here: uPay issues a real חשבונית/קבלה for **card** payments only. The system
*"does not issue tax documents for cash, bank transfer or הוראת קבע — the studio's bookkeeper
handles those."*

Every visible row in the artboard is a card payment, so nothing shown is wrong. The risk is
the framing: a parent who pays cash, or by הוראת קבע — which §5.10 expects to be common —
lands on a screen promising that *all* receipts live there and finds no tax document. That is
a support call, and potentially a bookkeeping misunderstanding.

**Recommended:** retitle to `תשלומים` and scope the email affordance to card rows only.
A non-card row should show the payment as recorded without implying a tax document exists.

→ **Settled as [D9.3](decisions.md).** Not yet applied to the artboard.

### 4 — SPEC.md contradicts itself on trial-lesson booking. ✅ *FIXED 2026-08-24*

- §2.1 (in v1): *"**public trial-lesson booking and the lead funnel**"*
- §2.2 (deferred to v2): *"**trial-lesson booking**"*

The design built it — Parent App `13a`/`13b`/`13c` (public landing page, submission
confirmation, desktop) and Staff App `11b` (adding a trial student mid-class).

The weight of evidence says v1: §2.1 lists it, and §5.4a specs the lead funnel across ~130
lines including the two-children worked example. §2.2's line is almost certainly stale.

**Resolved 2026-08-24.** `trial-lesson booking` removed from the §2.2 deferred list. §2.1
and §5.4a were already correct and are unchanged. The design is right; the spec was stale.

### 5 — Physical CSS properties in the dashboard export. 🟡 *(port-time, not design-time)*

`Manager Dashboard.dc.html` contains 14 `margin-left` / `margin-right` /
`padding-left` / `padding-right` declarations and **zero** logical properties. The other
three files are clean.

This does not affect the mockup, which sets `dir="rtl"` and renders correctly. It matters
when the artboards are ported: [ui-rtl-a11y.md](../../.claude/rules/ui-rtl-a11y.md) requires
`margin-inline-start` over `margin-left` throughout `web/src/**`.

**Recommended:** treat the exported CSS as a visual reference, never copy-paste it. Worth
an ESLint rule banning physical properties before the first component is written — RTL bugs
of this kind are nearly invisible to an LTR reader.

→ **Settled as [D10](decisions.md).** Rule not yet written — `web/src/` does not exist.

---

## Not verified by this review

- **Visual quality.** Nothing was rendered. Spacing rhythm, weight contrast and whether the
  monochrome direction reads as disciplined rather than unfinished all need human eyes.
- ~~**Contrast ratios.**~~ Computed — see the contrast audit below.
- **The `→` character** appears 2× / 5× / 1×. In RTL a forward affordance should point left;
  worth checking those eight instances point the right way.
- ~~**Dark-mode belt chips**~~ — answered in the contrast audit below.

---

## Contrast audit (added 2026-08-24)

Computed WCAG 2.x relative-luminance ratios for every token pair extracted from the canvas.
Thresholds: **4.5:1** normal text (AA, SC 1.4.3), **3:1** non-text graphical objects such as
belt bars (SC 1.4.11).

### Light mode — text on ground `#f7f5f1`

| Token | Uses | Ratio | |
|---|--:|--:|---|
| `#17150f` ink | 606 | 16.76 | PASS (AAA) |
| `#55524a` secondary | 633 | 7.16 | PASS (AAA) |
| `#6f6b62` tertiary | 356 | 4.88 | PASS |
| `#7a766d` grey | 9 | **4.16** | **FAIL** |
| `#8f8b82` muted | 19 | **3.12** | **FAIL** |
| `#a8a49a` disabled/hint | 33 | **2.28** | **FAIL** |
| `#b3261e` debt red | 164 | 6.00 | PASS |
| `#1f6b3f` paid green | 150 | 5.97 | PASS |
| `#8a5a00` pending amber | 147 | 5.44 | PASS |

On the lighter card ground `#fffefb`, `#a8a49a` is 2.47 — still failing.

**The three failing greys are the whole light-mode problem.** The semantic colours are all
comfortably clear, and the two heavily-used text tokens are AAA. `#a8a49a` at 33 uses is the
one to fix first: at 2.28:1 it is unreadable for anyone with reduced contrast sensitivity,
which in a parents' app is a meaningful share of users.

Lightening the ground will not fix these — they need to darken. `#6f6b62` (4.88) is the
lowest grey that passes and is the natural floor for any text token.

→ **Settled as [D8](decisions.md).**

### Dark mode — clean

Every dark-mode pair passes, most at AAA: primary `#fffefb` on `#141311` is 18.41, secondary
`#a8a49a` is 7.46, muted `#8f8b82` is 5.47. Semantics are 8–10:1. **The dark palette is
better tuned than the light one** — which is unusual, and worth noting because the instinct
would be to assume the reverse.

### Belt bars as graphical objects (3:1)

| Belt | On light `#f7f5f1` | Verdict |
|---|--:|---|
| `#6f4a2f` brown | 7.15 | PASS |
| `#2f6fa8` blue | 4.87 | PASS |
| `#c76a1e` orange | 3.50 | PASS (marginal) |
| `#d9a800` yellow | **2.02** | **FAIL** |

**The yellow belt bar is effectively invisible against the light ground** — and yellow is one
of the most common children's grades, so this will show up on real rosters constantly.

### Q2 answered — white and black belt chips

| | Ratio | |
|---|--:|---|
| White belt `#fffefb` on light ground `#f7f5f1` | **1.08** | **invisible** |
| Black belt `#17150f` on dark ground `#141311` | **1.02** | **invisible** |
| White belt on dark ground | 18.41 | fine |
| Black belt on light ground | 16.76 | fine |

Both edge cases from D4 are confirmed real. Each mode makes exactly one belt disappear.

**Recommended fix — one change solves all three belt problems** *(settled as
[D7](decisions.md))***:** give every belt bar a **1px
ring** in the current foreground colour rather than relying on fill alone. On light grounds
the ring is `#17150f`; on dark it is `#fffefb`. This rescues white-on-light, black-on-dark,
and yellow-on-light simultaneously, and it costs one border declaration on a single
component. It is also truer to the object — a real judo belt has an edge.
