# `12g` — הוספת ילד · adding a sibling to the same account

| | |
|---|---|
| **Surface** | Parent app · 390×844 |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W2 · **M3 People & funnel** |
| **i18n namespace** | `people`, plus `billing` for the discount banner |
| **Slot** | none |

Reached from `12i`'s profile list. §5.4's rule governs the copy: **enrolment is always a manager
decision**, so nothing here promises a place.

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — back affordance · title · subtitle naming which account the child joins.
3. **Scroll body**
   1. First name + date of birth, side by side.
   2. `קבוצה מבוקשת` — a label and two selectable group cards.
   3. A sibling-discount banner.
   4. A "what happens after you send this" card with three numbered steps.
4. **Footer bar** — cancel (secondary) + submit (primary, fills the row).

No tab bar. This reads as a pushed screen over the profile.

## States

| State | What renders |
|---|---|
| **Group card — selected** | Filled radio, 2px ring on the card. |
| **Group card — available** | Unselected radio, hairline ring, capacity shown. |
| **Group card — full** | Unselected, with status text offering a waitlist. **Plain coloured text, not a chip.** |
| **Fields** | Both drawn pre-filled and valid. The name field carries the emphasised border, the date field the default one. |
| **Required** | **Nothing is marked required** — no asterisk, no `חובה`. |
| **Validation error** | **Not drawn** on any field. |
| **Submit — in flight / disabled** | **Not drawn**, though the form has fields that plainly must be filled. |
| **Empty / loading** | **Not drawn.** A studio with no groups the child is eligible for has no state here. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | the cards, the footer bar, the selected option's fill |
| Ink | `--fg` | primary text, the submit fill, the selected radio, the focused field's border |
| Secondary text | `--text-secondary` | schedule lines, the info card's body |
| Muted text | `--text-muted` | field labels, the subtitle — **exactly D8's floor** |
| Semantic — full | `--pending` | the group-2 status text |
| Semantic — discount | `--paid` (+ a tinted border) | the sibling-discount banner |
| Border | `--border` / `--border-strong` | hairlines; the selected card's 2px ring |
| Belt | — none on this artboard. |

No D8-retired grey.

## RTL

- **The back icon points right**, correct for RTL. It is a fixed path and **must be pinned, not
  auto-mirrored** — a generic `dir`-flip rule would turn it into a forward arrow.
- **Must not mirror:** the date of birth (`DD.MM.YYYY`, tabular), the schedule times, the capacity
  ratio, and — most carefully — **the two prices in the discount sentence**. Bidi reordering must not
  separate a number from `₪` or swap which reads as the new price and which as the old.
- No phone number on this artboard, unlike `12i`.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Footer buttons | `Button` | `secondary` then `primary`. |
| First name | `TextField` | |
| Date of birth | **gap** | `DateRangePicker` is for ranges. **No single-date primitive exists among the 18.** Either add `DateField` or document a masked `TextField`. Finding. |
| Group card's control | `Radio` | |
| The four containers | `Card` | |
| Discount banner | `Alert` | `tone="paid"` — `AlertTone` is `danger \| pending \| paid`, so this one fits exactly. |
| The two prices | `MoneyDisplay` | Takes `agorot`, `tone`, `label`. **It must render inline inside a sentence**, not as a block. Check that before assuming. |
| Group option card | *feature-specific* | `Card` + `Radio` + a status variant (available / full-with-waitlist). |
| Header, footer bar | *app shell* | |
| Numbered info card | `Card` | Inline `1 · 2 · 3` prose, not a stepper. |

The `מלאה` status is **not** a `StatusChip` — it is plain coloured text with no pill. Do not force it.

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `הוספת ילד` | `people.sibling.title` (`הוספת ילד נוסף`) | Near-exact. |
| `יתווסף לחשבון של מיכל כהן` | `people.sibling.subtitle` (`הילד יתווסף לאותו חשבון`) | **Wording differs and so does the content** — the artboard names the account holder. The key does not interpolate. Decide. |
| `שם פרטי` | `people.student.firstName` | exact |
| `תאריך לידה` | `people.student.birthdate` | exact |
| `קבוצה מבוקשת` | `people.student.group` (`קבוצה`) | Wording differs — "requested group" carries the §5.4 nuance that it is a request. Worth its own key. |
| group name · schedule · age range | `people.landing.ageRange`, `landing.weeklySchedule` | Labels exist; the composed lines are data. |
| `14/20` | — | **No key** for a capacity ratio. |
| `מלאה — אפשר להצטרף לרשימת המתנה` | — | **No waitlist key anywhere**, same gap as `13a`. Finding. |
| `הנחת אח/ות 10% תחול אוטומטית — 288₪ לחודש במקום 320₪` | — | **No key.** `billing.plan.*` has no sibling-discount member and §5.10's plan model does not mention one. **This is a pricing rule stated in a mockup and nowhere else.** Finding. |
| `מה קורה אחרי השליחה` | — | **No key.** |
| `1 · המועדון מאשר את השיבוץ` | `people.sibling.pendingHint` (`הבקשה תיבדק במשרד המועדון`) | Same intent, different wording. |
| `2 · תישלח הצהרת בריאות לחתימה` | `health.declaration.title` + a send verb | **Cross-namespace (M4)**, no composed key. |
| `3 · החיוב יתחיל מהחודש שבו איתן מתחיל` | — | **No key**, and it **hardcodes the child's first name mid-sentence**. The real string needs `{{name}}`. Finding. |
| `ביטול` | `schedule.impact.cancel` (`ביטול`) | **Cross-namespace.** A bare cancel belongs in `common`. |
| `שליחה למועדון` | `people.sibling.submit` (`שליחת בקשה`) | Wording differs. |

## Findings for the lane

1. **The sibling discount exists only here.** No key, no `billing.plan.*` member, no §5.10 line.
   Ten percent off, applied automatically, is a pricing rule — it needs a home in the model or it
   needs to come off the screen.
2. **No single-date primitive.** Date of birth needs one, and so does `3c`, and so does `12i`.
3. **Step 3 hardcodes a child's name** into the sentence.
4. **No waitlist key**, and the waitlist appears on `13a`, `13c` and here.
5. **Nothing is marked required** and no field draws an error.
6. **`MoneyDisplay` must work inline**, mid-sentence, with two amounts in one line.
7. **A bare `ביטול` lives in `schedule`.** It belongs in `common`.
