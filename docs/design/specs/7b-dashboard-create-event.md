# `7b` — יצירת אירוע · type, external location, consent and payment

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W4 · **M7 Events & belts** |
| **i18n namespace** | `events` |
| **Slot** | none |

## Regions

1. **DashNav** — imported, `active="events"`.
2. **Header bar** — a back affordance · title · spacer · an **autosave status line**.
3. **Body row**
   - **Form column** (at the reading start)
     1. `סוג האירוע` and a row of **five type cards**.
     2. **Event basics** — a three-column grid (name · date · hours) then a row: a location block and a
        responsible-plus-transport block.
     3. **`מי מוזמן`** — an audience chip row, then three fields (max participants · registration
        closes · minimum age).
     4. Two toggle rows: the consent requirement, and the event charge.
   - **Sidebar** (fixed width, far side) — `פרטים להורים` with two free-text fields, then a
     **parent-app preview**, then an info banner, then draft + publish.

## The controls the title names

**Event type** — five cards, each a title plus a one-line description, single-select, distinguished
**by border weight alone**: no icons, no counts, no colour. Restrained, and consistent with `7a`'s
neutral type chips.

**External location** — a two-option toggle (the club hall · an external location) directly above a
**free-text address field**. **Not a picklist against the studio's own locations.** That is exactly
§5.8's framing — a competition in another city is not one of the studio's halls — and
`events.form.locationExternalHint` says so. Good.

**Audience** — a chip row: one selected group-scope chip, a dashed *add a specific group* affordance,
and two unselected refinements (by belt, by age). The `+`-prefixed chip behaves as *add a filter*
rather than an alternative, which implies audiences **combine** — and `events.target.composeHint`
(`אפשר לצרף כמה קהלים יחד`) confirms it. **But no combined state is drawn**, so the AND/OR semantics
are asserted by a key and not by the design.

**Consent** — one `Switch`, on, with a helper describing the outing form. **There is no text field for
authoring the consent wording.** `events.consent.text` (`נוסח האישור`) and `consent.textRequired`
(`אירוע הדורש אישור חייב לכלול נוסח`) both exist — **and the artboard offers nowhere to write it.**
A required field with no input. Finding.

**Fee** — a small field beside a charge toggle, whose helper says the amount is added to the parent's
account as a separate line item. **It never says that *confirming participation* is what creates the
charge** — `events.fee.chargeOnConfirm` exists and is not drawn. Same gap as
[`7d`](7d-parent-event-invite.md), from the other side.

**Draft vs publish** — three affordances, two of them overlapping: an **ambient autosave note** in the
header, an explicit **draft** button, and **publish-and-send** as one action. The info banner above the
buttons states the recipient count and that registration closes automatically. Publishing and sending
being one button is a decision — [`9i`](9i-staff-events.md) and [`9d`](9d-staff-belt-exam.md) both
show a state where an event is published and its invitations are not yet sent, which this button
cannot produce. **Reconcile.**

## States

| State | What renders |
|---|---|
| Type cards | Selected (2px) and unselected. |
| Location toggle | Selected and unselected. |
| Audience chips | Selected · dashed-add · two unselected. **No combined state.** |
| **All three switches** | **On only.** |
| **Every field** | Pre-filled. **Nothing is marked required**, and the only occurrence of the word *mandatory* on the artboard attaches to the *parent's* form, not to a manager field. |
| **Validation error** | **Not drawn**, anywhere — on a form with a required consent wording that has no input. |
| **Loading / error / publishing** | **Not drawn.** |
| **Empty** | Not applicable — this is a creation form, drawn mid-edit rather than blank. **The blank state is not drawn either**, and it is the one a manager actually starts from. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | the header bar, all cards, the sidebar |
| Ink | `--fg` | headings, selected fills, the primary button, the emphasised field's border |
| On-ink | `--on-fg` | the selected chip's and primary button's labels |
| Secondary text | `--text-secondary` | helper and description copy |
| Muted text | `--text-muted` | field and section labels, the autosave note — **at D8's floor** |
| Semantic — on | `--paid` | all three state labels and switch tracks |
| Border | `--border` / `--border-strong` | hairlines, control outlines, the dashed add-chip |
| Belt | — none. |

**No danger and no pending token appears anywhere** — on a form. That is the absence to note: a form
with no error colour has no error states, and this one has a required field with no input.

No D8-retired grey.

## RTL

- Nav on the right; the form column at the reading start, the sidebar at the far side, both by `dir`
  plus DOM order — the correct pattern.
- Switch thumbs use `justify-content: flex-end` — **logical, and correct.**
- **▲ The sidebar's divider is a physical `border-right`.** → `border-inline-start`.
- The **back icon** is a fixed non-mirrored path. Correct here; it will not flip for `en`/`ru`.
- **Must not mirror:** the date, the hours range, the max-participants figure, the closing date, the
  fee, the recipient count.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| All cards | `Card` | Three in the form, one sidebar panel. |
| Every text field | `TextField` | Ten of them — **and one is a multi-line what-to-bring field.** Confirm `TextField` has a multiline mode; `12c` and `9g` need one too. |
| Location toggle | `SegmentedControl` | Two options. Exact fit. |
| All three switches | `Switch` | `stateLabels: {on, off}`. |
| Buttons | `Button` | Draft `secondary`, publish `primary`, plus an icon-only back. |
| The fee | `MoneyDisplay` for display; a `TextField` for input | **The fee is editable here**, so it is a money *input*. Same distinction as [`5e`](5e-wizard-step4-prices.md). |
| **Type cards** | `Radio` inside `Card` | Title + description; `SegmentedControl` cannot carry the description. |
| **Audience chips** | *gap* | Removable, addable, with refinements. **Tenth artboard** wanting a chip-select. |
| **Date / closing-date fields** | *gap* | Single dates, not a range. Fifth artboard. |
| **Parent-app preview** | *feature-specific* | A device frame rendering the live title and body. **Its two RSVP buttons are decorative** — do not wire them. |
| Info banner | `Alert` | Neutral, and `AlertTone` has no neutral member. Fifth artboard. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `אירוע חדש` | `events.create` (`אירוע חדש`) | exact — though `events.form.title` (`יצירת אירוע`) is the form's own key. |
| `טיוטה נשמרת אוטומטית` | — | **No key**, and it is a **persistent** indicator, not a `Toast`. Second artboard (see [`3c`](3c-dashboard-add-student.md) finding 8). |
| `סוג האירוע` | `events.form.type` | exact |
| `תחרות` / `אימון מיוחד` / `מחנה` / `מבחן חגורה` / `אירוע מועדון` | `events.type.competition` · — · — · `type.belt_exam` · — | **▲ Three of the five types are not in the enum**: *special training*, *camp*, *club event*. And three enum members — seminar, joint training, trip — **have no card.** The creation form and the model disagree about what an event can be. Finding. |
| the five type descriptions | — | **No keys.** |
| `שם האירוע` | `events.form.name` | exact |
| `תאריך` / `שעות` | `events.form.startsAt` / `form.endsAt` | The key models a start and an end **instant**; the artboard has a date plus an hours *range*. Reconcile. |
| `מיקום` / `אולם המועדון` / `מיקום חיצוני` | `events.form.location` / — / `form.locationExternal` | Two of three; the club-hall option has no key. |
| the address value | `events.form.locationExternalHint` | Data — and the hint that explains the option **is not drawn.** |
| `אחראי` | `schedule.session.coach` | **Cross-namespace (M2)**, and *responsible* is a fourth word for a staff role. |
| `הסעה מאורגנת` | — | **No key, no model.** Transport, on its **third artboard** (`7d`, `7a`, here). §5.8's event has no transport field. Finding. |
| `מי מוזמן` | `events.target.title` (`קהל יעד`) | Wording differs. |
| `כל הקבוצות` / `+ קבוצה מסוימת` / `לפי חגורה` / `לפי גיל` | `events.target.studio` (`כל המועדון`) · `target.group` · — · — | **Belt-based and age-based targeting have no key and no member.** `events.target.*` has studio, class, group, student. Finding. |
| `מקסימום משתתפים` / `54` | — | **No key**, and **no model** — same gap as [`7d`](7d-parent-event-invite.md) finding 5. Capacity binds on events and nowhere else. |
| `סגירת הרשמה` | `events.form.rsvpDeadline` (`הרשמה עד`) | Wording differs. |
| `גיל מינימלי` / `ללא הגבלה` | `people.landing.ageRange` | **Cross-namespace (M3)**; no key, no model. |
| `נדרש אישור הורה חתום` | `events.consent.required` | Wording differs — *signed*. |
| `טופס יציאה למיקום חיצוני — חובה לפני ההשתתפות` | `events.consent.blocksConfirmation` | **The key says it better** — *participation counts as confirmed only after the parent signs*. **Ship the key**, and see [`7d`](7d-parent-event-invite.md) finding 1: the parent's side does not enforce it. |
| `חיוב על האירוע` / `נוסף לחשבון ההורה כפריט נפרד — 45₪ הסעה` | `events.fee.label` / `fee.chargeOnConfirm` | **The key names the trigger and the artboard does not.** |
| `מופעל` (×3) | `comms.preferences.on` | **Cross-namespace (M8)**, three times. Belongs in `common`. |
| `פרטים להורים` / `מה להביא` / `איסוף וסיום` | — | **No keys** — and their **contents are per-event data** the manager writes, so the labels are copy and the values are not. |
| `תצוגה מקדימה — אפליקציית ההורים` | `comms.preview.title` + `preview.asParent` | **Cross-namespace (M8)** — the same preview idea as [`4f`](4f-dashboard-announcements.md). Two lanes, one component. Finding. |
| the preview's inner strings | *see* [`12h`](12h-parent-events.md) | They must come from the **parent app's** keys, not be re-authored here. |
| `יישלח ל־128 משקי בית · ההרשמה תיסגר אוטומטית ב־15.09.` | `comms.audience.recipients` (`יגיע ל-{{count}} משפחות`) | **Cross-namespace (M8)** — and `households` vs `families` is a third word for the same thing. |
| `טיוטה` / `פרסום ושליחה` | `events.form.saveDraft` / `events.publish` (`פרסום האירוע`) | The first is near; **the second is publish-only and the button also sends.** |

## Findings for the lane

1. **▲ The type enum and the creation form disagree**: three drawn types are not members, three
   members have no card.
2. **▲ Consent wording is required and has no input.** `events.consent.text` and `consent.textRequired`
   both exist; the form offers nowhere to write it.
3. **Publish and send are one button**, and two other artboards show them as separate states.
4. **Belt-based and age-based targeting have no key and no member.**
5. **Capacity and minimum age have no model**, and capacity binds only on events.
6. **Transport has no field.** Third artboard.
7. **The parent-app preview is the same component `4f` needs.** Build once; feed it the parent's keys.
8. **Nothing is required, nothing errors** — including the field that does not exist.
9. **A physical `border-right`.**
10. **`events.fee.chargeOnConfirm` and `consent.blocksConfirmation` both exist and neither is drawn**,
    on the screen that configures both.
