# `1d` — אפליקציית צוות · היום (the earlier take)

| | |
|---|---|
| **Surface** | Staff app · 390×844 · light only |
| **Canvas** | `docs/design/canvas/02-staff-app/Staff App.dc.html` |
| **Wave · lane** | W2 · **M2 Schedule** |
| **i18n namespace** | `schedule` |
| **Slot** | none |

> **Read this before building anything.** `1d` and [`9a`](9a-staff-today.md) are both captioned
> היום and they are **not the same screen**. `1d` is a read-only agenda; `9a` is the filterable,
> day-switchable, action-capable version, drawn in both themes. **`9a` is the one that ships** —
> it is the only one that carries D5's coverage-and-completion affordances and the only one drawn
> dark. `1d` is kept here because it is the honest minimum, and because two of its choices differ
> from `9a`'s in ways someone has to decide rather than inherit.

## What differs from `9a`, and what has to be decided

| | `1d` | `9a` |
|---|---|---|
| Title | `היום` | `שיעורים`, plus a back-to-today control |
| Day navigation | a static date label — **no way to see another day** | a seven-day strip |
| Filters | none; the coach's name is inline prose | coach chip + location chip + count |
| Card actions | whole-card tap only | inline buttons per state |
| Coverage management | none | uncovered-session assign/cancel, unmarked reminder, three summary tiles |
| Themes | light only | light + dark |
| **Tab bar** | היום · חניכים · **הודעות** · **פרופיל** | שיעורים · חניכים · **אירועים** · **עוד** |

**The tab bar difference is a product decision, not a relabelling.** Messages + Profile versus
Events + More is two different information architectures for the staff app. The parent app's
drawer (`2e`) and the staff "more" screen (`9e`) are M1's, so this belongs to whoever owns the
app shell — it is not M2's to settle inside a session card.

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — date block (weekday over date) at one end, title + subline (`N שיעורים · coach`) at the other.
3. **Sync line** — refresh icon + one line. Identical to `9a`'s, same copy, same position.
4. **Session list** — `[time column] + [session card]`. A card is: title (struck through when cancelled)
   + meta, a chevron, then a status line carrying the chip and, conditionally, one warning.
5. **Tab bar** — four tabs.

## States

| Card state | Treatment |
|---|---|
| **Completed** | Plain card, success chip. |
| **In progress** | Emphasised ink ring on the card, pending chip, plus the conditional warning line. |
| **Upcoming** | Plain card, neutral outline chip. |
| **Cancelled** | Ink-tinted card, struck-through title, cancelled chip. |

| Screen state | What renders |
|---|---|
| **Empty** | **Not drawn.** Use `EmptyState` with `schedule.today.empty` + `schedule.today.emptyHint`. |
| **Loading** | **Not drawn.** |
| **Error** | **Not drawn.** |
| **Offline** | Only the sync line. |

Every card carries a pointer cursor including the cancelled one, and **no handler is wired** in
the export — "tap opens the roster" is asserted by the inventory caption, not by the markup.
Whether a cancelled session is tappable is undecided.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | cards, tab bar |
| Ink | `--fg` | title, time, active tab, the in-progress card's ring |
| Secondary text | `--text-secondary` | date subline, meta, sync line, neutral chips |
| Muted text | `--text-muted` | duration, chevron, inactive tabs |
| Semantic — completed | `--paid` | the attendance-recorded chip |
| Semantic — in progress | `--pending` | the in-progress chip and the inline warning |
| Semantic — cancelled | `--cancelled` (+ `--cancelled-tint`) | the cancelled chip and the card's tint |
| Border (hairline) | `--border` | card edges |
| Belt | — none. |

No D8-retired grey. **No danger token appears at all** — `1d` draws no uncovered-session state,
which is one more reason `9a` is the one that ships.

## RTL

- The date block is given a **physical `text-align: left`** in the export. That is a D10 violation
  in miniature: it must become `text-align: end`, or better, be handled by the flex row's ordering.
  It is the clearest example on the staff surface of why the rule exists.
- The card **chevron** is directional and must flip with locale.
- The **warning triangle** and the **sync icon** are not directional and must not flip.
- **Must not mirror:** times, counts.
- Counts (`5 שיעורים`, `3 שיעורים ממתינים לסנכרון`) need plural forms in `en` and `ru`, not one
  fixed string.

## Primitives

Same mapping as `9a`, minus everything `1d` does not draw:

| Part | Primitive |
|---|---|
| Status chips | `StatusChip` — `paid` / `pending` / `cancelled` |
| Session card | `Card` |
| Inline warning | `Alert`, `tone="pending"` |
| Sync line | *feature-specific*, reading M5's core |
| Tab bar | *app shell* |

`1d` draws **no `Button` at all**. Every CTA on the staff Today screen lives in `9a`.

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `היום` (title) | `schedule.today.title` | exact |
| weekday · date | — | Data, via `core/datetime`. |
| `5 שיעורים · אלון מזרחי` | — | **No key** for the count; the coach name is data. |
| `3 שיעורים ממתינים לסנכרון` | `attendance.sync.pendingCount` | **Unit mismatch** — the key counts marks, the screen counts sessions. Same finding as `9a`. |
| `נוכחות נרשמה` | `schedule.session.attendanceTaken` | exact |
| `מתקיים כעת` | — | **No key, no status.** See `9a` finding 1. |
| `עתידי` | `schedule.session.status.scheduled` | Wording differs. |
| `בוטל` | `schedule.session.status.cancelled` | exact |
| `הצהרת בריאות חסרה לחניך` | `health.badge.missing` | **Cross-namespace (M4)**, wording differs. |
| `המאמן בהשתלמות` | `schedule.session.cancelReason` | Data — this is a *reason value*, not copy. `session.cancelReason` labels the field. |
| Tab labels | — | **No keys.** See `9a` finding 3. |

## Findings for the lane

1. **Pick a screen and record it.** This spec's position is `9a`. If `1d` is meant to be the MVP
   cut, that is a decision to write down, not to leave implicit in two artboards with one caption.
2. **The two tab bars disagree.** Escalate to the app-shell owner.
3. **The physical `text-align: left`** on the date block is the concrete D10 case on this surface.
4. **A cancelled card is tappable in the markup and it is not clear it should be.**
