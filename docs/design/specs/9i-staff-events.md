# `9i` — אירועים בצוות · mine, who confirmed, what is left

| | |
|---|---|
| **Surface** | Staff app · 390×844 · light only |
| **Canvas** | `docs/design/canvas/02-staff-app/Staff App.dc.html` |
| **Wave · lane** | W4 · **M7 Events & belts** |
| **i18n namespace** | `events` |
| **Slot** | none |

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — a new-event button at the reading start, a title + subtitle at the end.
3. **Content list** — three upcoming event cards, then a `הסתיים` label, then one finished-event row.
4. **Tab bar** — four tabs, events active: `שיעורים · חניכים · אירועים · עוד`.
   **This is `9a`'s tab set**, not `1d`'s. See [`1d`](1d-staff-today-simple.md).

## How "mine" is scoped

**A subtitle claim, with no filter control**: `הכיתות שלי · 3 קרובים` — *my classes*. The list is
implicitly pre-filtered; there is no mine-versus-all switcher.

Per-card, the role is reinforced **inline in the meta line** — *you are responsible*, *you are the
examiner* — rather than as a separate affordance. That is a good pattern: it tells a coach why the
event is on their list.

§3.2 scopes a lead coach to their own groups, and `comms.audience.limitedToOwnGroups` is the nearest
string in the product. Neither the scope label nor the role phrases have a key.

## The status-chip-plus-action pattern

Each card pairs **one status chip with one action**, and the pair is the whole message:

| Card | Chip | Action | Reads as |
|---|---|---|---|
| done | positive: all approvals signed | a plain **text link** to the participant list | nothing to do |
| not started | **dashed pending**: invitations not sent | a bordered **send** button | the to-do is to invite |
| action needed | **danger**: N without a parent's approval | a bordered **remind** button | the to-do is to chase |

This is the clearest expression of "what's left to do" in the canvas. Keep the pairing.

## RSVP counts — three renderings, by state

- **Sent and in progress** — a `ProgressBar` fill plus a raw `answered/invited` fraction.
- **Not yet sent** — **no count at all**, only a flat headcount in the meta line and a chip saying
  invitations have not gone out. Correct: there is nothing to count.
- **Sent, partly outstanding** — **no bar**; a negatively-framed chip giving the outstanding count.

Three renderings, but unlike [`12h`](12h-parent-events.md)'s three, **these are state-appropriate
rather than inconsistent.** Worth keeping and worth writing down, so nobody "unifies" them into one
bar that reads as 0% before invitations exist.

## States

| State | What renders |
|---|---|
| Card treatments | Emphasised ink border · **dashed pending** · **solid danger** · neutral (the finished row). |
| **Empty** | **Not drawn**, and `events.list.empty` (`אין אירועים מתוכננים`) exists. A coach with no events is common. |
| **Loading / error** | **Not drawn** — and unlike `1c`, `2d` and `9a`, this artboard is **fully static** with no data bindings at all, so not even a placeholder count exists. |
| **Hover / focus / disabled** | Not drawn. Note `1c` in the same file *does* define a hover; `9i` does not. |

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | the four cards |
| Ink | `--fg` | titles, type chips' text, the active tab |
| Secondary text | `--text-secondary` | meta lines under titles |
| Muted text | `--text-muted` | the subtitle, the `הסתיים` label, inactive tabs, the chevron — **at D8's floor** |
| Semantic — all signed | `--paid` | the positive chip |
| Semantic — not sent | `--pending` | the chip **and the card's dashed border** |
| Semantic — missing approvals | `--danger` (+ tint) | the chip and the card's border |
| Neutral tag | `--fg` on a faint ink tint | the three **type** chips — **a category, not a status** |
| Border | `--border` / `--border-strong` | hairlines |
| Belt | — none. |

No D8-retired grey. **The type chip and the status chip are visually the same shape and semantically
different** — one is a taxonomy label, the other a state. Same question as `12h`, `7a`, `7c`, `12d`.

## RTL

- **▲ The header's DOM order puts the new-event button at the reading start and the title at the end.**
  Under `dir="rtl"` that means the **page title sits away from the reading-start edge** — unusual, and
  the opposite of every other staff screen. **Confirm it is intended** before porting; it may be a
  DOM-order slip that happens to look deliberate.
- The finished row's chevron points toward the reading direction — directional, and it must flip.
- **Must not mirror:** every date, the RSVP fraction, the examinee count, the participant and medal counts.
- Numerals use tabular figures. Keep that as a convention, not a copied style.
- The export's spacing is physical shorthand; per D10, translate to logical.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Every card | `Card` | With a **border-emphasis variant** — four are drawn. |
| Status chips | `StatusChip` | Positive / **dashed** pending / danger. `ChipStatus` has `paid`, `pending`, and **no danger member.** README finding 3. |
| Type chips | `StatusChip` **or a tag** | Categorical. Decide once across `12h`, `7a`, `7c`, `9i`, `12d`. |
| RSVP fill | `ProgressBar` | Needs a paired label slot, or composition, for the fraction. |
| Buttons | `Button` | New event, send, remind — plus a **text-link** variant for the participant list. `ghost` is the candidate. |
| Empty state | `EmptyState` | Required; not drawn. |
| **Event card** | *feature-specific* | Type chip → title → meta with the role phrase → optional `ProgressBar` → the chip+action row. |
| **Finished-event row** | *feature-specific* | A compact row with a trailing chevron. Another `ActionRow`. |
| Tab bar | *app shell* | The `9a` set. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `אירוע חדש` | `events.create` (`אירוע חדש`) | exact |
| `אירועים` | `events.title` (`אירועים ותחרויות`) | The short form has no key. |
| `הכיתות שלי · 3 קרובים` | `events.list.mine` (`האירועים שלי`) + `list.upcoming` (`קרובים`) | **Both halves exist and the composed subtitle does not** — and `list.mine` says *my events* where the screen says *my classes*. Different scoping. Finding. |
| `אימון מיוחד` | — | **Not in `events.type.*`.** Fourth artboard. |
| `מבחן חגורה` / `תחרות` | `events.type.belt_exam` / `type.competition` | exact |
| titles, dates, venues, examinee counts | — | Data. |
| `אתה האחראי` / `אתה הבוחן` | — | **No keys**, and both are **second-person masculine**. Third artboard with that (see `9c`, `9g`). Finding. |
| `הסעה מהמועדון` | — | **No key.** Transport again — see [`7d`](7d-parent-event-invite.md) finding 6. |
| `42/54` | `events.counts.registered` (`נרשמו`) | The label exists; **the fraction has no key** and no accessible form. |
| `כל האישורים נחתמו` | `events.consent.signed` (`האישור נחתם`) | Singular in the key, plural-aggregate on screen. |
| `רשימת משתתפים` | `events.roster.empty` names the roster | **No key** for the link. |
| `הזמנות טרם נשלחו` | — | **No key.** `events.publish` / `published` are about publishing the event, not sending invitations. **Those are two different actions** — an event can be published and its invitations unsent, which is exactly what this card shows. Finding. |
| `שליחה` | — | **No key.** |
| `6 ללא אישור הורה` | `events.consent.pending` (`ממתין לאישור הורה`) | The label exists; the count wrapper does not. |
| `תזכורת` | `events.remindNonResponders` (`תזכורת למי שלא ענה`) | **Different target** — the key chases non-responders, this chases missing *consents*. Two different reminders. Finding. |
| `הסתיים` | `events.status.completed` (`הסתיים`) | exact |
| `11 משתתפים · 3 מדליות` | `events.counts.registered` | **▲ The medal count has no key and no model.** Second artboard (see [`12h`](12h-parent-events.md) finding 2). |
| Tab labels | — | **No keys.** |

## Findings for the lane

1. **Publishing an event and sending its invitations are different actions.** `events.publish` covers
   one; the other has no key, and this card's entire state is "published, not yet invited".
2. **Two different reminders** — chase non-responders, chase missing consents. One key.
3. **▲ A medal count with no model.** Second artboard.
4. **`events.list.mine` says *my events*; the screen says *my classes*.** Different scoping rules.
5. **The role phrases are second-person masculine**, and have no key. Third artboard.
6. **The header's DOM order puts the title away from the reading start.** Confirm.
7. **The three RSVP renderings are state-appropriate.** Record that, so nobody unifies them.
8. **No empty state**, and a coach with no events is common.
9. **`אימון מיוחד` is not in the type enum.** Fourth artboard.
