# `5c`–`5f` — §5.1's setup wizard, as one flow **(proposal)**

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 · Hebrew RTL |
| **Canvas** | [`Manager Dashboard.dc.html`](../canvas/03-manager-dashboard/Manager%20Dashboard.dc.html) — `#5c` `#5d` `#5e` `#5f` |
| **Specs** | [`5d`](../specs/5d-wizard-step2-belts.md) · [`5e`](../specs/5e-wizard-step4-prices.md) |
| **Container** | `packages/ui/src/setup-wizard/SetupWizard.tsx` |
| **Steps** | six, in a slot: `studio` · `belts` · `groups` · `prices` · `staff` · `students` |

> **Status: proposal.** Written 2026-08-29 from four inputs — the four artboards, the two
> specs, the shipped container, and a Stitch generation carrying our own tokens. Nothing
> here is built beyond step 1's fields.

## Why the whole wizard at once

Six steps share one container, and every defect worth fixing is in the container rather
than in any step: where the manager is, whether they can leave, and what happens if they
do. Fixing them a step at a time would mean six copies of the same decision.

## The one disagreement the artboards leave open, and how Stitch settles it

`5d` draws a six-node step list. `5e` and `5f` draw only a thin progress bar. [`5d`'s
spec](../specs/5d-wizard-step2-belts.md) already calls this out and rules that *"the step
list is the better design — make the chrome render it on every step."* It does not say
**where**, and inline under the header is why `5e` dropped it: there is no room once a
step has content.

**Stitch put the step list in a persistent side rail.** That is the structural answer the
artboards were missing — the list survives every step because it is not competing with the
step for the same band of the screen. The rail is Stitch's; everything in it is ours.

## Chrome

```
┌──────────────────────────────────────────────┬──────────────────┐
│  שלב 4 מתוך 6      [שמירה ויציאה]   ▪ Studio │  אשף הקמה        │
├──────────────────────────────────────────────┤                  │
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔░░░░░░░░░░░░░░░░░░░░░░░ │  אפשר לדלג על    │
│                                              │  כל שלב ולחזור   │
│   כמה עולה להתאמן אצלכם?                     │  אליו אחר כך.    │
│   מספיק מסלול אחד כדי להתחיל.                │  שום דבר לא      │
│                                              │  נשלח להורים עד  │
│   ┌────────────────────────────────────┐     │  שתאשרו בסוף.    │
│   │ the step's own content              │    │                  │
│   └────────────────────────────────────┘     │  ✓ פרטי מועדון   │
│                                              │  ✓ חגורות        │
├──────────────────────────────────────────────┤  ✓ קבוצות ולו״ז  │
│ [חזרה]   אקבע מחירים אחר כך   [המשך לצוות ←] │  ● מחירים        │
└──────────────────────────────────────────────┴  ○ צוות          ┘
                                                 ○ חניכים
```

### 1. Header bar
Brand mark and wordmark on the inline-start edge; step counter and **שמירה ויציאה** on the
inline-end. `5f` drops save-and-exit — on the last step there is nothing left to save for
later — so the container takes it as a prop rather than hard-coding it.

### 2. Step rail — persistent, not per-step
Six numbered nodes in three states, exactly as `5d` draws them: **done** a filled success
circle with a check, **current** a filled ink circle with a bold label, **upcoming** an
outlined circle. Labels are the wizard's own map: club details · belts · groups and
schedule · prices · staff · students.

**The reassurance line lives here**, not under the welcome heading. `5c` shows it once and
`5d`–`5f` never show it again — but an owner who is going to abandon the wizard does so on
step 3, not step 1, and that is precisely when they need to read that nothing is final.

The rail is **not** navigation in v1. A node is a state, not a link: letting a manager jump
to step 5 before step 2 means the belt system does not exist when prices reference it.

### 3. Progress bar
A thin determinate bar under the header, filled to the step's fraction. Both `5d` and `5e`
draw it; it stays.

### 4. Footer — one bar, three slots
`חזרה` on the inline-start; the primary on the inline-end; the defer link beside the
primary. **The primary names its destination** — `המשך לצוות`, not `המשך` — which `5e`
does and Stitch reduced to a generic *Continue*.

**Deferability is per-step and comes in as a prop**, which is [`5d`'s
spec](../specs/5d-wizard-step2-belts.md)'s own resolution: belts is required and has no
defer link, prices is not and has one. Each step's defer link uses its own words
(`אקבע מחירים אחר כך`), because "skip this step" tells an owner nothing about what they
are postponing.

## What each step needs, beyond the chrome

| Step | Artboard | What is missing today |
|---|---|---|
| 1 `studio` | `5c` | ענף is a text field; `5c` makes it a **segmented control** — ג׳ודו · קראטה · אחר. Done: required/optional marks, placeholders, the logo picker. |
| 2 `belts` | `5d` | Radio **cards** carrying the actual belt swatches, a `מומלץ` chip on the recommended one, and a live preview of the ladder that would be created — the `BeltBar` primitive the audit found mounted nowhere. |
| 3 `groups` | — | No artboard. Out of scope here. |
| 4 `prices` | `5e` | A plan card with price and billing day, the sibling-discount **switch**, and a checkbox grid of one-off items with editable prices. |
| 5 `staff` | — | No artboard. Out of scope here. |
| 6 `students` | `5f` | Three ways in — CSV import, a parent registration link, manual — as icon cards, plus a **summary panel** of everything set up so far with tick/untick states. |

## What was rejected

| From | Rejected | Why |
|---|---|---|
| Stitch | Its header order — brand on the left, save on the right | LTR ordering. It also put full stops at the wrong end of every sentence. |
| Stitch | Generic `Continue` / `Skip this step` | `5e` names the destination and the thing being deferred. Better. |
| Stitch | Prices as a flat table with a ⋮ menu per row | `5e`'s plan card carries the billing day and the sibling switch, which a three-column table cannot. |
| `5c` | The parent-languages chooser | Owner decision, 2026-08-29: not a choice. All three ship. Already removed; the server now defaults to all three. |
| `5e`/`5f` | Dropping the step list | `5d`'s spec already ruled against it; the rail is where it fits. |

## Open questions

1. The rail on a narrow screen. §6.4 says a manager on a phone is a normal case, and a
   240px rail is not. Collapse to the counter and progress bar alone, or move it above the
   content?
2. Steps 3 and 5 have no artboard. Build them to the chrome and leave their content, or
   draw them first?
