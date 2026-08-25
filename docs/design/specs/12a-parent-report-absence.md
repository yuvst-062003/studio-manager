# `12a` — דיווח היעדרות · reporting an absence in advance

| | |
|---|---|
| **Surface** | Parent app · 390×844 |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W3 · **M5 Attendance** |
| **i18n namespace** | `attendance` |
| **Slot** | none |

§10.2's flow: a pre-report **requires a connection on purpose**, and the app must say so rather than
queueing into the void.

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — a back affordance · title · **subtitle carrying the deadline**.
3. **Scroll body**
   1. `מי מהילדים` — three equal-width child chips.
   2. `איזה שיעור` — a stacked session picker, **three rows** (see below).
   3. A reason header: the label and an inline "optional" annotation on one line.
   4. Four reason chips, wrapping.
   5. A free-text note field, placeholder only.
4. **Footer bar** — a two-sentence disclaimer, then a full-width primary button.

## The session picker

Not a dropdown. A vertical stack of **radio cards**, plus a structurally different third row:

1. **Today's lesson** — selected: filled radio, a heavier card border. Carries a **countdown**
   (`בעוד 9 שעות`) at the trailing edge.
2. **The next occurrence** — unselected: hollow radio, hairline border.
3. **A date-range escape hatch** — dashed border, a calendar icon **instead of a radio**. It is not
   a third lesson; it switches the whole flow to reporting a multi-session absence (a holiday, a long
   illness) via a date range.

So: single-select radio cards for one lesson, **or** switch to a range. `DateRangePicker` is the
range mode's implementation.

## States

| State | What renders |
|---|---|
| **Child chips** | One selected (filled), two unselected. |
| **Session rows** | Selected and unselected both drawn. |
| **Reason chips** | **All four drawn unselected.** No selected styling exists anywhere, so the chosen-chip visual and the selection cardinality are both undecided. |
| **Note field** | Placeholder only. No filled, no focus, no error, no character count. |
| **Submit** | Default only. **No disabled, no in-flight, no success.** |
| **Deadline passed** | **Not drawn**, and `attendance.absence.tooLate` exists for it. This is the state the whole screen is timed against. |
| **Already reported** | **Not drawn**, and `attendance.absence.alreadyReported` exists. |
| **Offline** | **Not drawn — and this is the important one.** `attendance.absence.requiresConnection` and `requiresConnectionHint` exist precisely because §10.2 makes this flow refuse to queue. The one screen that must show an offline state does not draw it. |
| **Empty / loading / error** | **Not drawn.** |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | cards, the footer bar |
| Ink | `--fg` | title, icons, the submit fill, the selected chip's fill, the selected card's border, the filled radio |
| On-ink | `--on-fg` | the selected chip's and submit's labels |
| Secondary text | `--text-secondary` | the deadline subtitle, session sublines, the countdown, chip text, the disclaimer, the placeholder |
| Muted text | `--text-muted` | the three section labels |
| Border | `--border` / `--border-strong` | hairlines; the dashed range row |
| Semantic | — | **none.** The artboard uses no status colour at all. |
| Belt | *see below* | the child chips' accent bars |

No D8-retired grey. **That the screen has no semantic colour is notable**: the deadline, which is
the whole constraint, is plain secondary text. When the deadline is close or passed, it needs one.

**The child chips' accent bars are per-child identity colours, not belts** — the same values attach
to the same children on `12i` and `12j`. See [`12j`](12j-parent-first-registration.md) finding 3:
they have no column in §4.3. If they *are* belts, D7's ring applies and the canvas is fill-only.

## RTL

- The **back chevron** points right, correct for RTL.
- The **countdown sits at the trailing edge** of the selected card, opposite the radio and title —
  a flex row relying on `dir`, with no physical offset. Clean.
- Chips flow right-to-left; the selected child sits at the reading start.
- **Must not mirror:** the times, the date, the countdown's digits.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Submit | `Button` | `variant="primary"`, full width. |
| Session rows | `Radio` inside `Card` | The row chrome is the card; the control is the radio. |
| Range escape hatch | `DateRangePicker` | Its trigger. The picker surface is not drawn open. |
| Note field | `TextField` | Multi-line. |
| Child chips | *feature-specific* | Accent + name + selected state. `SegmentedControl` is a fixed track with `{value,label}` options — no room for the accent bar. |
| Reason chips | *gap* | Wrapping, optional, cardinality undecided. Third artboard wanting a chip-select. See README finding 5. |
| Header, footer bar | *app shell* | |
| Disclaimer | — | Plain secondary text. **Not** an `Alert` — no icon, no tint, no border. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `לא נגיע לשיעור` | `attendance.absence.title` (`דיווח היעדרות`) | **Wording differs, and the artboard's is better** — first person, a parent's voice. The key is the administrative name. Decide. |
| `אפשר לעדכן עד תחילת השיעור` | `attendance.absence.subtitle` (`עד תחילת השיעור`) | Near-exact — the key is the fragment, the artboard the sentence. |
| `מי מהילדים` | — | **No key.** Child selection has no label anywhere. |
| `איזה שיעור` | `attendance.absence.chooseSession` (`בחירת שיעור`) | Wording differs. |
| `בעוד 9 שעות` | — | **No key.** A relative countdown, needing a `core/datetime` formatter and plural forms. Finding. |
| `טווח תאריכים — חופשה או מחלה ארוכה` | `schedule.datePicker.range` (`טווח תאריכים`) | **Cross-namespace (M2)**; the explanatory half has no key. |
| `סיבה` | `attendance.absence.reason` | exact |
| `לא חובה` | `attendance.absence.reasonOptional` (`סיבה — לא חובה`) | **The key bundles both words into one string; the artboard puts them on one line as two elements.** One of the two has to change. |
| `מחלה` / `אירוע משפחתי` / `חופשה` / `אחר` | — | **No keys.** These are an **absence-reason enum**, and `absence_report` has a reason column. As free text they cannot be counted; as an enum they need members. Finding. |
| `אפשר להוסיף מילה למאמן…` | — | **No key.** |
| `המאמן יראה ״הודיעו מראש״ ברשימת הנוכחות. אין החזר על שיעור שהוחמץ.` | `attendance.source.preReported` covers the quoted half | **The sentence has no key**, and the second half — **no refund for a missed lesson** — is a **billing policy stated on an attendance screen** with no `billing` key and no §5.10 line. Finding. |
| `שליחת ההודעה` | `attendance.absence.submit` (`שליחת הדיווח`) | Wording differs. |

## Findings for the lane

1. **The offline state is missing from the one screen that needs it.** §10.2 makes this flow refuse
   to queue, and `attendance.absence.requiresConnection` / `requiresConnectionHint` are written for
   exactly this. Draw it.
2. **Neither `tooLate` nor `alreadyReported` is drawn**, and both have keys. The deadline is the
   screen's whole premise.
3. **"No refund for a missed lesson" is a billing policy** on an attendance screen, with no key and
   no spec line.
4. **The reason chips are an enum with no members**, no selected state and no declared cardinality.
5. **The countdown needs a relative-time formatter** in `core`, with plurals.
6. **`absence.reasonOptional` bundles two strings** the artboard renders as two elements.
7. **No semantic colour anywhere**, including on the deadline.
8. **The title is first-person on screen and administrative in the key.**
