# `4e` — מסמכים והצהרות · what is missing, from whom

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W3 · **M4 Health** |
| **i18n namespace** | `health` |
| **Slot** | none |

The manager's compliance view. **No medical content appears on it** — only whether a document exists,
who owes it, and how to ask.

## Regions

1. **DashNav** — imported, `active="documents"`.
2. **Header bar** — title · a summary line (total · missing · expiring this month) · spacer ·
   a template-editor button · a **group-request** primary button carrying a count.
3. **Filter toolbar** — four count-bearing chips (all · missing · expiring soon · awaiting a parent's
   signature) · spacer · a search field.
4. **Table header** — a select-all checkbox and five columns: student · group · document type ·
   validity · responsible guardian, plus an unlabelled trailing actions column.
5. **Table body** — five rows.

## The missing/filed split

**There is no spatial split** — no two panels, no tabs. One flat table, separated two ways at once:

1. **The filter chips** narrow by status. Only the "all" chip carries the selected treatment.
2. **Per row, a status chip plus a contextual action**, and the action changes with the status:

| Status | Treatment | Action(s) |
|---|---|---|
| missing / expired | danger chip | send a request · upload manually |
| expiring soon | **dashed** pending chip | remind |
| valid | success chip | **view** |
| awaiting a signature | neutral chip | remind |

**An arithmetic detail worth confirming:** missing (3) plus expiring-soon (9) equals exactly the 12 in
the group-request button. The fourth chip — awaiting a parent's signature (4) — is **not** in that 12.
So the bulk request targets missing-and-expiring only, not everyone who owes an action. That is a
business rule the button's label does not state.

## The group request

One control: a filled primary button in the header, labelled with its recipient count. On this artboard:

- **no audience editor, no dropdown, no confirmation** is drawn;
- **the count is pre-computed**, and does not visibly react to the row checkboxes;
- **the row checkboxes exist and their relationship to the button is undefined.** Does the button
  target "everyone who needs to act", or "the checked rows"? The artboard does not say, and the two
  are different features.

## Reading a full declaration, and the audit trail

The only affordance suggesting a full declaration opens is **`צפייה` on the one valid row.** No modal,
no drawer, no detail view is drawn.

> **▲ And no audit warning appears anywhere.**
> §11.2 makes every read of a full declaration audit-logged, and
> `health.documents.viewFullNotice` (`הצפייה בהצהרה נרשמת ביומן הביקורת`) exists to tell the manager so.
> **The canvas does not draw it.** Its absence from the design is not evidence it is not needed — it
> lives in whatever `צפייה` opens, which is not this artboard. Build the warning; do not read the
> silence as a decision.

## States

| State | What renders |
|---|---|
| **Checkboxes** | Unchecked only — no checked, no indeterminate. |
| **Filters** | Only "all" carries the selected treatment. The other three are tinted by severity, so **selected-vs-severity is ambiguous** on them. |
| **Search** | Empty only. No typed, no focused, no clear. |
| **All actions** | Default only. No hover, focus, disabled or in-flight. |
| **Empty — everything filed** | **Not drawn**, and it is the goal state. `health.documents.empty` (`כל ההצהרות הוגשו`) exists. Use `EmptyState`. |
| **Filtered to zero** | **Not drawn.** |
| **Loading / error** | **Not drawn.** |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | header, toolbar, rows |
| Ink | `--fg` | title, the primary button's fill |
| Secondary text | `--text-secondary` | group and guardian columns |
| Muted text | `--text-muted` | the summary line, column headers |
| Semantic — missing / expired | `--danger` (+ tint) | the chips and the missing filter |
| Semantic — expiring soon | `--pending` | the chip and filter, **always paired with a dashed border** |
| Semantic — valid | `--paid` | the valid chip |
| Semantic — awaiting | `--cancelled` / neutral | the awaiting chip |
| Border | `--border` / `--border-strong` | drawn as ink alpha in the export; use the tokens |
| Belt | `belt_rank.color_hex` via `BeltBar` | one swatch per row |

No D8-retired grey.

> **One token role is overloaded.** `--paid` renders "this charge is settled" and "this declaration is
> valid" — the same green for two concepts, and `tokens.roles.ts` classifies `--paid` as semantic ·
> status with a note about the *שולם* chip specifically. A document-validity role is not in D2's list.
> Same finding as [`3b`](3b-dashboard-students.md); it is now on two artboards and needs deciding in
> the token layer, not in a component.
>
> Also: one belt swatch's hex happens to equal `--focus-ring`'s value. **That is a coincidence of a
> studio's belt data, not a semantic reuse.** Never hard-code it.

> **▲ D7 — only the near-white swatch is ringed.** The rest are bare fills. That is **not** "D7 applied
> where it is needed" — D7 is unconditional, and D12 adds that five belts fail across the two modes.
> `BeltBar` rings every belt with no opt-out.

## RTL

- Nav on the right; rows are flex + `gap` with fixed cell widths. **No physical property appears in
  `4e`'s own range** — one of the cleaner dashboard artboards.
- The unlabelled **actions cell is the trailing flex item**, so it sits at the reading end. Keep it as
  a flex order, never a fixed offset.
- **Must not mirror:** the counts in the chips and the summary, every validity date, the relative
  "expires in N days".

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Both checkboxes | `Checkbox` | Needs checked and indeterminate. |
| Row status chips | `StatusChip` | **`ChipStatus` has no member for valid / missing / expiring / awaiting-signature.** Four document states, zero coverage. Same gap as [`3b`](3b-dashboard-students.md) finding 2 and [`4a`](4a-dashboard-student-card.md). |
| Filter chips | `StatusChip` **or** a gap | They are **selectable** and carry counts. `StatusChip` is a display indicator. Eighth artboard wanting a `FilterChip`. |
| All buttons | `Button` | `primary` for the group request; `secondary` for the template editor and every row action. |
| Search | `TextField` | Needs a leading-icon slot — same gap as `9h` and `3b`. |
| Belt swatch | `BeltBar` | |
| Empty state | `EmptyState` | Required; not drawn. |
| Page header, toolbar | *feature-specific* | |
| Document row | *feature-specific* | `Checkbox` + `BeltBar` + `StatusChip` + `Button`. **`StudentRow` covers the name cell only** — this row carries four more columns and a contextual action slot. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `מסמכים והצהרות` | `health.documents.title` | exact |
| `214 חניכים · 3 מסמכים חסרים · 9 פגים החודש` | `health.documents.missing` (`חסרות`) | **The composed summary has no key**, and it needs three plurals. |
| `עריכת תבנית הצהרה` | `health.template.edit` (`עריכת השאלון`) | Wording differs — *template* vs *questionnaire*. And **this is the button D11 requires the disclaimer to sit behind.** |
| `בקשה קבוצתית ל־12` | `health.documents.requestGroup` (`בקשה קבוצתית`) | The label exists; **the count wrapper does not.** |
| `הכל 214` | — | **No "all" key.** Fourth artboard. |
| `חסר 3` | `health.documents.missing` | Gendered differently — the key is feminine plural (agreeing with *declarations*), the chip masculine singular (agreeing with *document*). Hebrew agreement again. |
| `פג בקרוב 9` | — | **▲ No key, and it presumes an expiry.** `health.declaration.noExpiry` says declarations do not expire. **The eighth artboard** to assume otherwise. |
| `ממתין לחתימת הורה 4` | `health.consent.granted` is the nearest | **No key.** A declaration filled in but not yet signed is a **fourth state** the model may not have — §4.3 gives `health_declaration` no such column that this spec can see. Finding. |
| `חיפוש חניך` | `people.student.search` (`חיפוש חניך`) | exact, **cross-namespace (M3)**. |
| `חניך` / `קבוצה` / `סוג מסמך` / `תוקף` / `אחראי` | `people.student.one` · `student.group` · — · — · `people.guardian.one` | **`סוג מסמך` and `תוקף` have no key**, and `אחראי` — *responsible* — is a third word for a guardian, after `הורה` and `אפוטרופוס`. See [`3c`](3c-dashboard-add-student.md) finding 3. |
| `הצהרת בריאות` | `health.declaration.title` | exact |
| `אישור ביטוח` | — | **No key, no model, no lane.** Second artboard to show an insurance certificate — see [`4a`](4a-dashboard-student-card.md) finding 2. §5.5 and §11 cover declarations and nothing covers insurance. |
| `ויתור צילום` | `reports.privacy.consent.type.photo` (`פרסום תמונות`) | **Cross-namespace (M9)** — §11.6 models photo consent under privacy. **A photo waiver is a consent, not a document**, and it appears here in a documents table. Which model owns it? Finding. |
| `חסר` | `health.documents.missing` | Gender again. |
| `פג 01.08` / `פג בעוד 12 יום` | — | **No keys**, and the second needs a relative-time formatter. Fourth artboard. |
| `בתוקף 09.2026` | `health.declaration.noExpiry` contradicts it | See above. |
| `ממתין לחתימה` | — | **No key.** |
| `שליחת בקשה` | `health.reminder.send` (`שלח תזכורת להורה`) | Different action — a first request, not a reminder. |
| `העלאה ידנית` | `health.template.uploadPdf` (`העלאת טופס המועדון`) | **Different thing entirely** — that key uploads the studio's blank template; this uploads one child's completed document. **A manager uploading a signed declaration on a parent's behalf has no key and no §5.5 line**, and it produces a record with no `derived_flags`. Finding. |
| `תזכורת` | `health.reminder.send` | Near. |
| `צפייה` | `health.documents.viewFull` (`צפייה בהצהרה המלאה`) | Near-exact — **and `viewFullNotice` must accompany it.** |

## Findings for the lane

1. **▲ The audit-log notice is missing.** §11.2 logs every read; `health.documents.viewFullNotice`
   exists. Build it into whatever `צפייה` opens.
2. **▲ An eighth expiry contradiction**, in a filter chip and a status chip.
3. **Manual upload has no spec line and produces no flags.** A declaration uploaded by a manager
   cannot yield `derived_flags`, so the coach's ⚠ badge — the entire reason §5.5 rejects a signed PDF —
   silently does not appear. **This affordance reintroduces the design D11 explicitly rejected.**
4. **"Awaiting a parent's signature" may be a state the model does not have.**
5. **Three document types, one table, three owners.** A health declaration is M4's. An insurance
   certificate has no model at all. A photo waiver is §11.6's consent, M9's. Settle before building.
6. **The group request's relationship to the checkboxes is undefined**, and its 12 excludes the
   awaiting-signature 4.
7. **`ChipStatus` covers none of the four document states.**
8. **No empty state**, on the screen whose empty state is the goal.
9. **`אחראי` is a third word for a guardian.**
