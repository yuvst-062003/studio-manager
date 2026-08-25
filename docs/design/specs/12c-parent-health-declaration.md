# `12c` — הצהרת בריאות · filling it in and signing

| | |
|---|---|
| **Surface** | Parent app · 390×844 |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W3 · **M4 Health** |
| **i18n namespace** | `health` |
| **Slot** | none |

D11's flow: a **structured question set**, seeded by migration and editable by the manager, answered
and signed by the parent. Not a PDF with a signature over it — §5.5 needs structured answers because
`derived_flags` is what a coach's ⚠ badge comes from.

> **G7 applies to every part of this screen.** Health declarations are personal data about minors.
> **Never log their contents**, never put them in an audit `diff`, and never render a free-text answer
> anywhere a coach can see it. This spec quotes the **question wording** — which is seeded design copy —
> and deliberately does not quote the sample answer.

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — a back affordance · title · subtitle naming the child and the validity.
3. **Scroll region**
   1. **Declaration statement card** — one paragraph of consent copy.
   2. **Questions card** — a divided list. Each row: the question, a yes/no answer label, and a
      `Switch`. A **conditional detail row** — a bordered free-text box — follows a row answered yes.
   3. **Signature block** — a section label · the pad (bordered, with a baseline guide and a
      placeholder) · a controls row: a clear affordance, a spacer, and a name-and-date attestation.
4. **Footer bar** — one full-width primary button.

## The seeded question set

Two questions are drawn, verbatim:

1. `יש מגבלה רפואית או תרופה קבועה` — answered **no**, switch off.
2. `אלרגיה ידועה` — answered **yes**, switch on, and a **free-text detail box** appears beneath it,
   pre-filled with a short single-line sample. **The sample names an allergen and appends a brief
   safety note. It is not quoted here and must not be treated as copy.**

That is the whole set on the artboard. D11 seeds a *standard Israeli sports health declaration*, which
is longer than two questions, and `health.flag.*` already enumerates **eight** derived flags — asthma,
allergy, medication, epilepsy, heart, diabetes, injury and other. **Two questions cannot produce eight
flags.** See findings.

**Progressive disclosure is the mechanism**: a yes reveals a detail field; a no does not. That is what
makes structured answers work — the flag comes from the boolean, the detail from the text, and only
the boolean ever reaches a coach.

## States

| State | What renders |
|---|---|
| **Question — no** | Switch off, its state label `לא`. |
| **Question — yes** | Switch on (semantic accent), state label `כן`, and the detail row revealed. |
| **Question — unanswered** | **Not drawn.** Both questions arrive pre-answered, so there is **no neutral third state** — and a two-position switch cannot express one. See findings. |
| **Detail — required but empty** | **Not drawn**, and `health.declaration.detailsRequired` exists. |
| **Signature — empty** | **Drawn**: baseline guide plus a placeholder, no ink. |
| **Signature — signed** | **Not drawn.** |
| **Signature — required error** | **Not drawn**, and `health.declaration.signatureRequired` exists. |
| **Submitting** | **Not drawn**, and `health.declaration.submitting` exists. |
| **Submitted** | **Not drawn**, and `health.declaration.submitted` exists. |
| **Loading / error** | **Not drawn.** |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | both cards, the pad, the header and footer bars |
| Ink | `--fg` | body text, icons, the submit fill, the off switch's knob, **the signature pad's border** — the one emphasised boundary on the screen |
| On-ink | `--on-fg` | the submit button's label |
| Secondary text | `--text-secondary` | the declaration paragraph, the detail answer, the clear affordance, the attestation |
| Muted text | `--text-muted` | the subtitle, the `לא` answer label, the section label, the pad's placeholder |
| Semantic — yes / on | `--accent` (= `--paid` in light) | the `כן` label and the on switch's track |
| Border | `--border` / `--border-strong` | card edges, dividers, the off switch's ring, the baseline guide |
| Belt | — none. |

No D8-retired grey. **Borders in the export are translucent ink, not `--border`/`--border-strong`** —
use the tokens; D12 gave `--border-strong` a 3:1 obligation and the pad's edge is a control boundary.

> **▲ Bind the `כן` state to `--accent`, not `--paid`.** They hold the same light-mode value and
> different meanings, and D12 moved `--paid` in dark mode deliberately. A health answer is not a
> payment. Same trap as [`2d`](2d-staff-student-card.md).

## RTL

- **The signature pad must not mirror, and this is the one thing on the screen that could go badly
  wrong.** The pad sits inside a `dir="rtl"` ancestor. Whatever captures the pointer path **must
  render in true screen coordinates**, independent of document direction. A stroke is a person's
  handwriting; a transform derived from `dir` would flip it. Isolate the canvas coordinate space.
- The baseline guide is symmetrically inset today. Keep it logical (`inset-inline`) so it stays right
  if the inset ever becomes asymmetric.
- The switch's on knob travels to the flex end, which resolves left in RTL. `Switch` must derive that
  from `dir`, never from a hard-coded side.
- **Must not mirror:** the attestation date, the validity date in the subtitle.
- The date is **not** set in tabular figures here, unlike sibling artboards. Normalise it.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Question rows | `Switch` | `label`, `checked`, `onCheckedChange`, **`stateLabels: {on, off}`** — the visible `כן`/`לא` is the primitive's own contract and D5's rule. Direct fit. |
| Both cards | `Card` | |
| Detail field | `TextField` | Multi-line. Drawn filled and read-only-looking; the real one is editable. |
| Submit | `Button` | `variant="primary"`. The clear affordance wants a `ghost` variant if it exists. |
| **Signature pad** | *gap — no primitive* | **Shared with [`12j`](12j-parent-first-registration.md)**, whose frame 2 draws the same pad. **Build one `SignaturePad`**, with the RTL isolation above baked in, its own clear affordance, and the attestation caption. |
| Question-row molecule | *feature-specific* | Question + `Switch` + a conditionally-revealed `TextField`. Health's own. |
| Header, footer bar | *app shell* | Recurring across every `12*` screen. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `הצהרת בריאות` | `health.declaration.title` | exact |
| `נועה לוי · תקפה לשנה` | `health.declaration.forChild` (`עבור`) | **▲ The child's name is data; the validity is wrong.** `health.declaration.noExpiry` reads `ההצהרה תקפה ללא הגבלת זמן` — §5.5 says declarations do not expire. **This subtitle says one year.** The **seventh** artboard to contradict it, after `12j`, `2c`, `9c`, `3b`, `4a` and `2d`. |
| the declaration paragraph | `health.declaration.intro` (`ענו על השאלות וחתמו בתחתית הטופס`) | **Wording differs, and so does the job.** The key instructs; the artboard's paragraph is the **attestation the parent is signing** — a legal statement about the child's fitness to train, including contact. **That text has no key**, and D11's caveat says the bundled template is a starting point and **the app must say so where the manager edits it**. `health.template.disclaimer` carries that caveat and **appears nowhere on this screen**. Finding. |
| `יש מגבלה רפואית או תרופה קבועה` | `health.flag.medication` (`תרופות קבועות`) is the flag it derives | **The question wording has no key.** Questions are **seeded data** (`health_form_template`), editable by the manager — so arguably they are content, not UI copy. **Decide, and write it down**: if they are data, they are not translated and a Russian-speaking parent reads Hebrew. §6.1 expects Russian-speaking parents. Finding. |
| `אלרגיה ידועה` | `health.flag.allergy` (`אלרגיה`) | Same. |
| `כן` / `לא` | `health.declaration.yes` / `.no` | exact |
| the detail answer | `health.declaration.details` (`פירוט`) labels the field | The **answer is data about a minor** — G7. |
| `חתימת הורה` | `health.declaration.signature` (`חתימה`) | Near-exact. |
| `חתמו כאן באצבע` | `health.declaration.signatureHint` (`חתמו באצבע במסגרת`) | Wording differs. |
| `ניקוי` | `health.declaration.signatureClear` (`ניקוי החתימה`) | Near-exact. |
| `מיכל כהן · 23.08.2026` | `health.declaration.signedBy` + `.signedOn` | Both exist; the composed attestation has none. |
| `שליחה וחתימה` | `health.declaration.submit` (`שליחת ההצהרה`) | Wording differs. |

## Findings for the lane

1. **▲ The subtitle says the declaration is valid for a year.** `health.declaration.noExpiry` and §5.5
   say it never expires. **Seventh artboard.** Escalate §5.5 rather than patch a seventh spec.
2. **Two questions cannot produce eight derived flags.** `health.flag.*` enumerates asthma, allergy,
   medication, epilepsy, heart, diabetes, injury and other. The seeded set needs to cover them, or the
   flag list needs to shrink. D11 makes this the migration's job — settle it in the W3 contract.
3. **D11's caveat is missing.** `health.template.disclaimer` exists and says the bundled template is a
   starting point and not a compliance artefact. D11 requires it **where the manager edits the
   questions** — that is `4e`'s editor, not this screen — but a parent signing a medical attestation
   should probably see it too. Confirm.
4. **Are the questions translated or are they data?** They are manager-editable, which argues data.
   §6.1 expects Russian-speaking parents, which argues copy. It cannot be both.
5. **There is no unanswered state**, and a two-position `Switch` cannot express one. A declaration
   that defaults every question to "no" and gets signed is a health record nobody actually answered.
   This is the most consequential gap on the artboard.
6. **No submit, submitted, or error state**, though all three have keys.
7. **The signature pad is shared with `12j`.** Build one, and isolate its coordinate space from `dir`.
8. **Bind `כן` to `--accent`, not `--paid`.**
