# `6c` — מרכז התראות · everything that needs a manager's decision **(composite)**

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W2 · **container owned by M3 People**; each alert kind owned by its own lane |
| **i18n namespace** | per kind |
| **Slot** | **`alert-centre`** (`web/packages/ui/src/slots.ts`) |

One list, seven kinds, six lanes. The container knows an alert's copy and an action id; **it never
knows what any lane's action does.**

## Ownership — container and kinds

| Region | Owner |
|---|---|
| **Container**: header, filter bar, date-bucket grouping, the `alert-centre` slot host, the empty state | **M3 People** |
| Each alert kind's icon, copy, counter and actions | its own lane, registering a slot entry |
| Each action's behaviour | its own lane, entirely |

The seven kinds the artboard draws, in order, with their owning lane:

| # | Bucket | Kind | Severity | Actions | Lane |
|---|---|---|---|---|---|
| 1 | today | recurring charges failed | danger | request an update · open collections | **M6 Money** |
| 2 | today | tomorrow's session has no coach | danger | cancel the session · assign a coach | **M2 Schedule** |
| 3 | today | sessions with attendance unmarked | pending | remind the coaches · mark now | **M5 Attendance** |
| 4 | today | a join request awaiting approval | pending | reject · approve and add | **M3 People** |
| 5 | this week | belt exam soon, invitations not sent | neutral | send invitations | **M7 Events & belts** |
| 6 | this week | a student absent several sessions running | neutral | open their card | **M5 Attendance** |
| 7 | this week | a staff invitation not yet accepted | neutral | resend | **M1 Identity / staff** |

### Three kinds the slot design did not anticipate

Kinds **5, 6 and 7** are not in the set the slot was sketched for. Kinds 1–4 map cleanly to billing,
schedule, attendance and people. But:

- **belt-exam invitations** is M7's and there is no events kind in the registry sketch;
- **consecutive absences** is attendance-shaped but distinct from unmarked sessions — it is
  §5.14's at-risk student, which `reports.atRisk.*` models and `4c` renders in its own sidebar;
- **an unaccepted staff invitation** is M1's, and M1 owns no lane in W2–W5 at all.

And **two kinds the sketch expected are absent**: a missing health declaration (M4) and an event RSVP
(M7). `4e` and `6c` between them show that missing declarations get their own screen rather than an
alert. Whether they also belong here is a decision.

**Register a kind id per row, and let each lane own its own.** The set is not closed.

## Regions

1. **DashNav** — imported, `active="messages"`.
2. **Header bar** — title · a count subtitle · spacer · mark-all-read · notification settings.
3. **Filter bar** — five chips with counts: all · needs action · finance · attendance · staff.
4. **List panel** — a `היום` group label, then its rows; a `השבוע` group label, then its rows.

An alert row is: **severity dot · icon · [title over detail] · timestamp · [secondary button] ·
[primary button]**. Rows 1–4 carry two buttons, rows 5–7 carry one.

## States

| State | What renders |
|---|---|
| **Severity** | Three: danger (solid border, danger dot) · pending (**dashed** border, pending dot) · neutral (solid hairline, muted dot). |
| **Read / unread** | The dot doubles as an unread marker, but **no read state is drawn** — and the header offers "mark all as read". |
| **Empty** | **Not drawn, and it is the most important state on this screen.** An alert centre with nothing to decide is the goal state. Use `EmptyState`. |
| **Loading / error** | **Not drawn.** |
| **Filter — active** | The `הכל` chip is the only one with the thicker selected border. The `דורש פעולה` chip is permanently danger-tinted, so **whether it is selected or merely urgent is ambiguous.** |
| **Row as a click target** | **The row itself carries no pointer affordance** — only its buttons do. Rows are not navigable; actions are. That is a real design choice, worth keeping. |

**The header claims nine items and seven rows are drawn**, with no "show more". A mock shortcut, but
the real component needs a decision about overflow.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | header, filter bar, alert cards |
| Ink | `--fg` | titles, primary button fill |
| On-ink | `--on-fg` | primary button labels |
| Secondary text | `--text-secondary` | detail lines, neutral icons |
| Muted text | `--text-muted` | subtitle, group labels, timestamps |
| Semantic — danger | `--danger` (+ `--danger-tint`) | rows 1–2 and the needs-action chip |
| Semantic — pending | `--pending` | rows 3–4, drawn **dashed** |
| Semantic — neutral | `--cancelled` / `--border` | rows 5–7 |
| Border | `--border` / `--border-strong` | hairlines |
| Belt | — none on this artboard. |

No D8-retired grey. **No success token appears at all** — nothing here is good news, which is
correct for an alert centre and is precisely why the empty state matters.

## RTL

- Nav on the right. Header, filter bar and every row are plain flex rows under `dir` — **no
  `row-reverse`, and no physical property inside `6c`'s own range.** The header's "push to the far
  side" uses a bare `flex: 1` spacer, not a float or a margin. This is the cleanest dashboard
  artboard in the export.
- **Must not mirror:** every count, every timestamp, the money amount in row 1, the dates in the
  detail lines.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Every alert row | `Alert` | Near-exact, and the core of the screen. It needs: a **severity variant** (`AlertTone` is `danger \| pending \| paid` — **there is no neutral**, and three of seven rows are neutral), a **leading icon slot**, a **title** distinct from the body (`Alert` has `iconLabel` + `children` only), a **trailing meta slot** for the timestamp, and an **action slot** taking one or two `Button`s. Finding. |
| Every button | `Button` | Secondary and primary variants both appear. |
| Filter chips | *feature-specific* | `SegmentedControl` renders one connected track with uniform segments; **one of these five carries a semantic tint the others do not**, and each carries a count. Sixth artboard wanting `FilterChip`. |
| The money in row 1's detail | `MoneyDisplay` | Agorot in. **Not a hand-formatted `₪` string.** |
| Empty state | `EmptyState` | Not drawn; required. |
| Per-kind icons | *per lane* | Each lane brings its own. Not `Alert`'s default. |
| Page shell, date buckets | *feature-specific* | Container's. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `מרכז התראות` | — | **No key.** `comms.preferences.title` is `הגדרות התראות` — the settings, not the centre. Finding. |
| `9 פריטים · 4 דורשים פעולה` | — | **No key.** Two counts. |
| `סימון הכל כנקרא` | `comms.inbox.markAllRead` (`סימון הכל כנקרא`) | **exact — but it is the parent inbox's key**, in M8. A manager's alert centre borrowing the parent inbox's string is either right (same action) or a collision. Decide. |
| `הגדרות התראות` | `comms.preferences.title` | exact (M8) |
| `הכל` / `דורש פעולה` / `כספים` / `נוכחות` / `צוות` | `attendance.roster.title` covers one | **Four of five have no key**, and they are filter *categories*, a taxonomy that does not exist anywhere in the model. Finding. |
| `היום` / `השבוע` | `schedule.week.today` / `schedule.week.title` | Neither is a date-bucket label. **No key.** |
| row 1 — `7 חיובי הוראת קבע נכשלו` + detail | `billing.method.standingOrder`, `billing.order.status.failed`, `billing.run.title` | **Cross-namespace (M6).** The composed title and detail have no keys; the detail carries a money amount and a date. |
| row 2 — `שיעור מחר ללא מאמן` + detail | `schedule.session.noCoach` | The label exists; the composed alert does not. Its actions map to `schedule.session.cancel` and — **`שיבוץ מאמן` has no key**, same gap as [`9a`](9a-staff-today.md) finding 4. |
| row 3 — `4 מפגשים ללא סימון נוכחות` + detail | `attendance.report.unmarkedSessions` | Exists without a count. `תזכורת למאמנים` and `סימון עכשיו` **have no keys**. |
| row 4 — `בקשת הצטרפות ממתינה לאישור` | `people.request.title` / `request.empty` | Near. Actions map exactly to `people.request.reject` and `people.request.approveInGroup`. **Row 4 is the only row whose actions both have keys.** |
| row 5 — `מבחן חגורה בעוד 18 יום — הזמנות טרם נשלחו` | `events.exam.title`, `events.exam.candidates` | **Cross-namespace (M7).** `שליחת הזמנות` has no key. |
| row 6 — `רוני ברק — 5 היעדרויות רצופות` | `reports.atRisk.consecutiveAbsences` (`{{count}} היעדרויות רצופות`) | **exact, with the count already interpolated** — the best-matched string on the artboard. It lives in `reports` (M9). `פתיחת כרטיס` has no key. |
| row 7 — `תומר בן דוד טרם אישר את ההזמנה לצוות` | — | **No key, and no namespace owns staff invitations.** M1's, and M1 has no namespace among the nine. Finding. |

## Findings for the lane

1. **`Alert` cannot render this row as it stands.** It needs a neutral tone, a title, a leading icon,
   a trailing meta slot and an action slot. It is a **shared primitive**, so this is a
   contract-commit decision, not a lane's. `9c`, `12j` and `3c` also want the neutral tone.
2. **The kind set is open, not closed.** Three kinds fall outside the sketch and two expected kinds
   are absent. Register per kind id.
3. **A staff-invitation alert belongs to M1**, which owns none of the nine namespaces. Either it
   moves to `common`, or the row does not ship in W2–W5.
4. **The filter taxonomy — finance · attendance · staff — exists nowhere in the model.**
5. **No empty state**, on the one screen whose empty state is the goal.
6. **No read state**, though "mark all as read" is offered.
7. **Nine of the eleven action labels have no key.** Row 4's are the exception.
8. **`comms.inbox.markAllRead` would be shared** between the parent inbox and the manager's centre.
9. **The row is not a click target.** Keep it that way, deliberately.
