# `7a` — אירועים ותחרויות · the manager's roundup

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W4 · **M7 Events & belts** |
| **i18n namespace** | `events` |
| **Slot** | none |

## Regions

1. **DashNav** — imported, `active="events"`.
2. **Header bar** — title · subtitle (*one-off events — not part of the weekly schedule*) · spacer ·
   a year-calendar button · a new-event primary.
3. **Filter bar** — five count-bearing chips (all · competitions · special trainings · exams · camps) ·
   spacer · a helper line counting what needs attention.
4. **Content pane**
   - `קרובים` — four **upcoming cards**: a date block → a type chip → title and meta → a progress-or-stat
     block → a status block → an action button.
   - `הסתיימו` — a bordered card of two **completed rows**: date · a quiet type chip · title ·
     participants · medals · a summary link.

## Type, status and RSVP — how each renders

**Type** is a **single neutral pill**, identical for all four types. Type is carried by its **text
alone**, never by colour. That is the right restraint (D3) and worth keeping.

**Status has no chip at all.** Each card's status is a **two-line plain-text pair** — a coloured line
over a grey caption — whose colour is chosen per situation: danger for missing consents, success for
all-signed, pending for invitations-not-sent, and — for **draft** — **plain secondary grey, the same
tone as ordinary metadata**.

**RSVP progress** is a thin track with an **ink** fill (not a semantic colour) plus a fraction and a
caption — on three of four cards. The **belt-exam card has no bar at all**; it substitutes a two-line
eligibility stat. So the pattern is not uniform across types, which is defensible — but the fourth
card's caption reads `נרשמו` (*registered*) where the others read `אישרו השתתפות` (*confirmed*).
Two different measures under one bar shape. Decide.

## ▲ A draft is barely distinguished, and §4.3 makes drafts invisible to guardians

The only signal that the camp is a draft is the **text** `טיוטה — לא פורסם`, rendered in the same
secondary grey as prices and deadlines. No badge, no icon, no dashed outline, no reduced opacity —
and it carries **the plainest border of the four**, the same neutral treatment as a card with no
special state. Meanwhile the invitations-not-sent card gets a dashed pending border.

A manager scanning by shape and colour has **no cue that the camp is invisible to parents.**
`events.status.draftHint` (`אירוע בטיוטה אינו מוצג להורים`) exists and is not drawn. Draft is the one
status with a consequence outside the club, and it is the one status with no treatment.

## States

| State | What renders |
|---|---|
| Card treatments | solid danger · emphasised ink · **dashed pending** · plain neutral (the draft). |
| Filter chips | One active (bold border), four inactive. |
| **Empty** | **Not drawn**, and `events.list.empty` exists. A studio between seasons has no events. |
| **Loading / error** | **Not drawn.** |
| **Hover / focus / disabled** | Not drawn anywhere. |
| **Whole-card click** | The container carries no pointer — only its action button and icons do. If a row click is intended, that is an addition. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | the header bar and every card |
| Ink | `--fg` | titles, the primary button's fill, **the progress fill**, the active chip's border |
| Secondary text | `--text-secondary` | meta lines, captions, dates, price subtexts — **and the draft status** |
| Muted text | `--text-muted` | the subtitle, section headings, the helper line — **at D8's floor** |
| Semantic — missing consents | `--danger` (+ border tint) | one card's status and border |
| Semantic — all signed | `--paid` | one card's status; **and the medal count on a completed row** |
| Semantic — not sent | `--pending` (+ a dashed border) | one card's status and border |
| Semantic — draft | **none — it borrows `--text-secondary`** | see above |
| Border | `--border` / `--border-strong` | hairlines |
| Belt | — none on this artboard. |

No D8-retired grey inside `7a`'s range.

**`--paid` renders a medal again** — fourth artboard borrowing the payment token for a positive
non-payment state (see `12h`, `12d`, `3b`, `4e`). D2's semantic tier has no such role.

## RTL

- Nav on the right.
- **▲ Each of the four upcoming cards repeats the same physical divider**: a left border and left
  padding separating the date block from the rest of the row. It lands correctly only because the
  date block happens to be the first flex child. → `border-inline-end` / `padding-inline-end`.
  **Four instances of one pattern**, and the only physical work in `7a`'s range.
- **Must not mirror:** every date, every time range, every fraction, every price, every chip count.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| All buttons | `Button` | `primary` (new event, participants), `secondary` (calendar, manage eligibility, continue editing), and a **text-link** variant for the summary link — `ghost`. |
| Every card | `Card` | With a **tone variant**. |
| RSVP fill | `ProgressBar` | `label`, `value`, `max`, `readout` — the readout is the fraction. |
| Type chips | `StatusChip` **or a tag** | Categorical, not a status. **Fifth artboard** asking the same question (`12h`, `9i`, `7c`, `12d`). Decide once. |
| **Status** | `StatusChip` | It is currently **not** a chip — a coloured text pair. Routing it through `StatusChip` is the fix, and the fix is what surfaces the draft problem: **there is no draft member in `ChipStatus`**, nor a danger one. |
| Every price | `MoneyDisplay` | Currently plain text inside a sentence. |
| Empty state | `EmptyState` | Required; not drawn. |
| **Event date badge** | *feature-specific* | A day-over-month block. Also on `9i` and `6b`. |
| Event card, completed row, the filter bar | *feature-specific* | |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `אירועים ותחרויות` | `events.title` | exact |
| `אירועים חד-פעמיים — לא חלק מהלו״ז השבועי` | — | **No key**, and it is the sentence that separates an event from a session. Worth having. |
| `לוח שנת אירועים` | — | **No key.** A yearly calendar view has no artboard either. |
| `אירוע חדש` | `events.create` | exact |
| `הכל 6` | — | **No "all" key.** Sixth artboard. |
| `תחרויות 2` / `אימונים מיוחדים 2` / `מבחנים 1` / `מחנות 1` | `events.type.competition` · — · `type.belt_exam` · — | **Two of four filters are not in `events.type.*`**: *special training* and *camp*. The enum has competition, belt_exam, seminar, joint_training, trip, other — so `סמינר`, `אימון משותף` and `טיול` have no filter, and two filters have no member. **The enum and the taxonomy do not match.** Finding. |
| `4 אירועים דורשים תשומת לב` | — | **No key.** |
| `קרובים` / `הסתיימו` | `events.list.upcoming` / `status.completed` | Near-exact. |
| titles, venues, dates, group lists | — | Data. |
| `14/27` / `אישרו השתתפות` | `events.counts.registered` (`נרשמו`) | **The caption and the key disagree** — *confirmed participation* vs *registered* — and the fourth card uses the key's word for a different measure. |
| `6 ללא אישור הורה` / `סגירה: 30.08` | `events.consent.pending` + `events.form.rsvpDeadline` | Both exist; neither composed line does. |
| `כל האישורים נחתמו` | `events.consent.signed` | Singular key, aggregate on screen. |
| `45₪ להסעה` / `90₪ דמי מבחן` / `890₪` | `events.fee.label` / `fee.perStudent` | The label exists; **the qualified amounts have no key**, and transport recurs — see [`7d`](7d-parent-event-invite.md) finding 6. |
| `9 זכאים` / `מתוך 17 מועמדים` | `events.exam.eligibility` + `exam.candidates` | Composed; no key. |
| `הזמנות טרם נשלחו` | — | **No key.** Third artboard (see `9i`, `9d`). |
| `ניהול זכאות` | `events.exam.eligibility` | The action has no key. |
| `טיוטה — לא פורסם` | `events.status.draft` (`טיוטה`) + `status.draftHint` (`אירוע בטיוטה אינו מוצג להורים`) | **▲ `draftHint` is the missing half** — it names the consequence, and it is not drawn. |
| `8/36` / `נרשמו` | `events.counts.registered` | See above. |
| `המשך עריכה` | `events.form.saveDraft` | The *resume editing* action has no key. |
| `11 משתתפים` / `3 מדליות` / `—` | `events.counts.registered` | **▲ The medal count has no key and no model.** **Third artboard** — `12h`, `9i`, here. And the em-dash placeholder needs an accessible label. |
| `סיכום` | — | **No key**, and a post-event summary has no artboard. |

## Findings for the lane

1. **▲ Draft has no visual treatment**, and it is the one status whose consequence reaches parents.
   `events.status.draftHint` exists and is not drawn.
2. **▲ The filter taxonomy and `events.type.*` do not match** — two filters have no enum member, three
   enum members have no filter.
3. **▲ A medal count has no model.** Third artboard.
4. **`נרשמו` and `אישרו השתתפות` measure different things under one bar shape.**
5. **Status is drawn as coloured text, not a chip** — and routing it through `StatusChip` reveals that
   `ChipStatus` has neither a draft nor a danger member.
6. **Four physical dividers**, one per card.
7. **A yearly calendar and a post-event summary are referenced and have no artboard.**
8. **Type chips: categorical or status?** Fifth artboard asking.
9. **`--paid` for a medal.** Fourth artboard.
