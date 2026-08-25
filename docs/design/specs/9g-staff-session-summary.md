# `9g` — סיכום מפגש · what to do after the register

| | |
|---|---|
| **Surface** | Staff app · 390×844 |
| **Canvas** | `docs/design/canvas/02-staff-app/Staff App.dc.html` |
| **Wave · lane** | W3 · **M5 Attendance** |
| **i18n namespace** | `schedule` (the note) and `attendance` (the counts) |
| **Slot** | none |

Reached from the register. Its title says explicitly *"without an exam recommendation"*, and that is
the point: **no exam or belt affordance appears anywhere on this artboard.** No "recommend for a
test" CTA, no belt progress, no eligibility banner, no belt colour at all. Confirmed absent, and it
should stay absent — §5.9 makes eligibility a manager's calculation, not a coach's impression.

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — title, then a subtitle: `group · weekday time · hall`.
3. **Scroll region**
   1. **Three stat tiles** in a row: present · absent · notified in advance. Read-only.
   2. A section prompt: `מה תרצה לעשות עכשיו?`
   3. **Four action cards**, stacked:
      - a session note, with an inline text field;
      - an injury report — **danger-accented, with a chevron**;
      - a message to the absentees' parents — with a `Switch` and a visible state label;
      - back to the register — with a chevron.
4. **Footer bar** — a persistent "saved locally, will sync" caption, and a finish button.

No tab bar. This is a pushed screen, not a tab destination.

## The note composer

- **Free text only.** No template, no canned phrases, no quick-insert.
- **No character limit** — no counter, no truncation indicator.
- **No audience statement.** And that is a gap worth naming, because the two neighbouring cards
  *do* state their audience: the injury report says it goes to the manager and the parent
  immediately, and the message card names the two recipient parents. **The note card says nothing
  about who can read it.** §5.5's principle — a coach sees only what they need — cuts both ways;
  a coach writing a note should know who reads it.
- The note text renders in the muted role, the same tone used for placeholders elsewhere, so
  **whether the card shows saved content or example text is ambiguous from the styling alone.**
- The card carries no chevron and no pointer, unlike the two navigation cards — so the field itself
  is the tap target.

## States

| State | What renders |
|---|---|
| **Note field** | One state. **No empty, no focused, no error.** |
| **Injury card** | Default only. |
| **Message switch** | **Off only**, with its state label. The on state is not drawn. |
| **Finish button** | Default only. No in-flight, no disabled, no success. |
| **Empty** | **Not drawn** — a session with no notes yet. `schedule.note.empty` exists. |
| **Loading** | **Not drawn.** |
| **Error** | **Not drawn**, including a failed sync — despite the footer caption announcing a sync process, and despite an injury report that "goes immediately". |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | the tiles, all four cards, the footer bar |
| Ink | `--fg` | title, icons, the finish button's fill, the switch's knob, the notified count |
| On-ink | `--on-fg` | the finish button's label |
| Secondary text | `--text-secondary` | subtitle, all card sublines, tile labels |
| Muted text | `--text-muted` | the section prompt, the note text, chevrons, the footer caption |
| Semantic — present | `--paid` | the present count and its tile border |
| Semantic — absent / injury | `--danger` | the absent count and tile border; the injury card's icon, title and border |
| Border | `--border` | hairlines |
| Belt | — **none, deliberately.** |

No D8-retired grey. **The notified-in-advance tile has no semantic colour at all** — it renders in
ink, where the other two carry `--paid` and `--danger`. On `1c` and `9f` that same state is
`--pending`. Third rendering of one state; pick one.

**Every border in the export is drawn as translucent ink, not `--border` / `--border-strong`.**
Use the tokens; D12 gave `--border-strong` a specific 3:1 obligation.

## RTL

- Icon-before-label in each card resolves to icon-at-the-reading-start under `dir` — correct, and
  achieved with flex `gap`, not a margin.
- The card **chevrons** use a single path and no transform; under `dir="rtl"` they read correctly as
  "forward". Confirm the icon layer derives that from direction rather than shipping one path.
- The **switch knob** has no `justify-content`, so it defaults to flex-start — the right, in RTL.
  If `Switch` ever hard-codes a side instead of using start/end, this flips wrongly in LTR.
- **Must not mirror:** the three counts, the session time.
- **No physical property appears in `9g`'s own range** — it is one of the cleaner staff artboards.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Finish | `Button` | `variant="primary"`. |
| Message switch | `Switch` | `stateLabels: {on, off}` — the visible label is the primitive's contract and D5's rule. |
| Note field | `TextField` | Multi-line. |
| Cards, tiles | `Card` | |
| **Injury card** | **not `Alert`** | It borrows danger styling but it is a **navigable row with a chevron**, not a passive message. Build it as a `Card` with a danger variant. Forcing it into `Alert` misrepresents it. |
| Stat tiles | *feature-specific* | Number-forward. Not a chip, not a progress bar. The same shape recurs on `1c`, `9f`, `4a`, `6a`, `3e`. **Worth extracting once, across the product.** |
| **Action row** — icon + title + optional subline + chevron | *gap* | This exact shape recurs on `9g` (three times), `9i`, `9h`, `12i`, `9c`. **Six artboards, one missing primitive.** Add `ActionRow` to the README's gap list. |
| Footer caption | — | Plain muted text. **Not `Toast`** — it is persistent, not transient. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `סיכום מפגש` | `schedule.note.title` (`סיכום מפגש`) | exact |
| `ג׳ודו / מתחילים · א׳ 17:00 · אולם א׳` | composed | Data. |
| `נוכחים` / `נעדרו` / `הודיעו מראש` | `attendance.roster.present` / `.absent` / `source.preReported` | **All three exist**, but the artboard uses **plural past-tense forms** where the keys are singular labels. Fourth artboard hitting Hebrew number/tense agreement. |
| `מה תרצה לעשות עכשיו?` | — | **No key**, and it is **second-person masculine**. Same problem as [`9c`](9c-staff-student-card-transfer.md). |
| `הערת שיעור` | `schedule.note.title` (`סיכום מפגש`) / `note.add` (`הוספת סיכום`) | Wording differs — *lesson note* vs *session summary*. And see the audience gap above. |
| the note's body | `schedule.note.placeholder` (`מה קרה בשיעור?`) | If it is a placeholder, this key covers it. If it is saved content, it is data. **The artboard does not say which.** |
| `דיווח פציעה` | — | **No key**, no model, no §-reference. **An injury report that goes to a manager and a parent immediately is a real feature with a real record**, and nothing in §4.3, §5.7 or §5.11 carries it. Finding. |
| `יישלח למנהל ולהורה מיד` | — | **No key.** And it is a delivery promise with no `comms.preferences.kind.*` member. |
| `הודעה להורי 2 הנעדרים` | `comms.announcement.create` | **Cross-namespace (M8)**, and it is a **directed message to specific parents** — which §5.11's one-way inbox does not obviously model. Same finding as [`4a`](4a-dashboard-student-card.md) finding 7. |
| the two absentees' names | — | Data. |
| `כבוי` | `comms.preferences.off` (`כבוי`) | **Cross-namespace (M8).** Belongs in `common`. |
| `חזרה לרשימת הנוכחות` | `attendance.roster.title` (`נוכחות`) | The navigation label has no key. |
| `תיקון אפשרי בכל זמן` | `attendance.roster.editAnytime` (`אפשר לערוך את הנוכחות בכל זמן`) | Same intent, shorter. |
| `נשמר מקומית · יסונכרן בחיבור` | `attendance.network.offlineHint` | Same intent, shorter. |
| `סיום ושמירה` | — | **No key.** |

## Findings for the lane

1. **An injury report has no model, no key and no spec line**, and the artboard promises it reaches
   a manager and a parent **immediately**. That is a notification kind, an audit-relevant record and
   probably health-adjacent data about a minor (G7). It cannot be built from this card alone.
2. **The note card states no audience**, on a screen where both neighbours do.
3. **"Notified in advance" has no semantic colour here** and `--pending` on `1c` and `9f`.
4. **A directed message to specific parents** — §5.11 models push and a one-way inbox.
5. **No `ActionRow` primitive**, and six artboards want one.
6. **No error state**, including for a report that claims to send immediately.
7. **The section prompt is second-person masculine.**
8. **The exam affordance is absent by design.** Keep it that way; record why.
