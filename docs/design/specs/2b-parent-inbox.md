# `2b` — הודעות · עדכוני מועדון

| | |
|---|---|
| **Surface** | Parent app · 390×844 |
| **Canvas** | `docs/design/canvas/01-parent-app/Parent App.dc.html` |
| **Wave · lane** | W5 · **M8 Communication** |
| **i18n namespace** | `comms` |
| **Slot** | none |

> ## ▲ D9.1 — applied, and verified on all three counts
>
> D9.1 **cuts the conversation half** — `שיחה עם המשרד` — and keeps the `עדכוני מועדון` inbox alone.
> §2.3 puts in-app two-way chat out of scope and §5.11 permits exactly two levels: push, and a
> **one-way** inbox. Because the chat was the second tab of a two-tab switcher, **the switcher went
> with it.** Applied to the canvas and owner-approved on 2026-08-24.
>
> | Check | State |
> |---|---|
> | **No chat tab** | **Confirmed absent.** The string appears nowhere in the artboard. |
> | **No two-tab switcher** | **Confirmed absent.** The header flows straight into the list; no segmented control of any kind. |
> | **No reply or compose affordance** | **Confirmed absent.** No input, no compose icon, no reply button, no send. |
>
> The artboard's own inventory label carries the annotation `אין צ׳אט דו־כיווני — §2.3`, so the cut
> is recorded on the canvas as well as in the decision.
>
> **One thing that is present and must not be mistaken for the cut feature.** The bottom bar carries
> two **outbound** contact buttons — call the office, and WhatsApp. Those are one-tap escapes to the
> phone dialler and to WhatsApp; they are **not** an in-app reply. Build them as `tel:` and `wa.me`
> links, never as any in-app messaging state. §5.11's WhatsApp affordance elsewhere
> (`comms.delivery.shareToWhatsapp`) is a *manager* action and is a different thing again.
>
> **What ships:** a one-way inbox. `comms` deliberately carries **no `reply.*` and no `chat.*` key**,
> and adding one is how the decision gets reversed by someone who thought they were adding a small thing.

## Regions

1. **Device chrome** — mock status bar. Do not port.
2. **Header** — the title, alone.
3. **Content** — a **flat, ungrouped** list of four cards. **No date-group headers**; each card
   carries its own timestamp.
4. **Bottom bar** — a top divider and two buttons: call the office (outline), WhatsApp (filled).

## A row's anatomy

Every card is the same three-part shape:

- **Meta line** — `[a status dot] [a label] [spacer] [a date]`. The **label is a category or a
  source**, not a person: *requires action*, *club notice*, a child's name and group, *receipt*.
- **Title** — one line.
- **Body** — one muted line, on three of four cards.

**Read and unread are not modelled explicitly.** The closest signal is that three cards carry a
coloured dot, a card background and a full-ink title, while the fourth drops the dot, mutes its label
and title, and lays a faint wash over its background. That reads as *informational / already resolved*
rather than *read* — a receipt versus something outstanding.

`comms.inbox.unread`, `inbox.markRead`, `inbox.markAllRead` and `inbox.new` all exist, and **none of
the four is expressed on this artboard.** So either the model has a read flag the design does not
show, or the design has a resolved/outstanding axis the model does not have. Finding.

Only the first card carries actions. The other three have **no pointer and no chevron** — as drawn
they are static rows, which for a one-way inbox is coherent, but it means a parent cannot open a
notice to read a longer body.

## States

| State | What renders |
|---|---|
| **Requires action** | A danger-bordered card, a danger dot, and two buttons. |
| **Informational** | Neutral border, ink dot. |
| **Resolved / receipt** | No dot, muted label and title, a faint wash. |
| **Read / unread** | **Not modelled.** See above. |
| **Empty** | **Not drawn — and it is the state a new family is in.** `comms.inbox.empty` (`אין עדכונים`) and `inbox.emptyHint` (`הודעות מהמועדון יופיעו כאן`) both exist. Use `EmptyState` with both. |
| **Loading / error** | **Not drawn.** |
| **Push disabled** | **▲ Not drawn**, and this is the notable absence — see below. |
| **Grouping** | **Not drawn.** `comms.inbox.older` (`קודמות`) exists and nothing groups by it. |

## ▲ §5.11's push-disabled banner is missing, on the screen it belongs to

§5.11 expects a **persistent, non-dismissible banner** for a user with push turned off, and expects it
to convert a meaningful share of denials — which it only does if it says **what is actually being
missed**. `comms` carries the whole family: `pushDisabled.title`, `pushDisabled.body`
(`לא תקבלו עדכונים על ביטולי שיעורים`), `pushDisabled.openSettings`, `pushDisabled.iosNeedsInstall`
(§6.5 — on iOS there is no way to prompt; Web Push exists only for an installed app),
`pushEnabled.confirmation` and `push.enable`.

**Six keys, no banner.** This is the parent's messages screen; if the banner lives anywhere, it lives
here. Design it.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the screen |
| Surface | `--surface` | all four cards |
| Ink | `--fg` | titles, the primary button's fill, the informational dot |
| On-ink | `--on-fg` | the primary button's label |
| Secondary text | `--text-secondary` | labels, body copy |
| Muted text | `--text-muted` | timestamps, the muted card's label — **at D8's floor** |
| Semantic — requires action | `--danger` (+ border tint) | the dot, the label, the card's edge |
| De-emphasis | a faint ink wash | the resolved card |
| Border | `--border` / `--border-strong` | card edges; the outline button's edge |
| Belt | — none. |

No D8-retired grey. **The de-emphasis wash has no token** — it is an ad-hoc ink alpha. If *resolved*
is a real state it needs a role; if it is only "read", it needs the read model first.

## RTL

- Root is `dir="rtl"`; the layout is flex plus `gap` and symmetric shorthand throughout, with **no
  physical property anywhere in `2b`'s range.** One of the cleanest artboards in the canvas.
- Still author it with logical properties — the mock's cleanliness is not the component's.
- **Must not mirror:** every timestamp, the money amount in the receipt card's title, the phone number
  behind the call button.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| The three neutral cards | `Card` | |
| The requires-action card | `Alert` | `tone="danger"` — with a title, a body and **two actions**, none of which `Alert` has a slot for. **Sixth artboard** with that gap. Pick one canonical pattern rather than hand-rolling the red callout inside `Card`. |
| The meta line | `StatusChip` | Dot plus label — exactly a chip's shape. **`ChipStatus` has no member for *requires action*, *club notice* or *receipt*.** Categorical again; see the README's finding 3. |
| All four buttons | `Button` | `primary` and `secondary`. |
| The receipt card's amount | `MoneyDisplay` | **Cross-namespace (M6)** — inline, in a title. |
| Empty state | `EmptyState` | **Required, and the most important missing state on the artboard.** |
| **Notification row** | *feature-specific* | `Card`/`Alert` + `StatusChip` + an optional action row + the read treatment. **Not `StudentRow`.** |
| **Push-disabled banner** | `Alert` | Not drawn; six keys exist. |
| Bottom contact bar | *feature-specific* | Two `Button`s wrapping `tel:` and `wa.me`. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `הודעות` | `comms.inbox.title` (`עדכוני מועדון`) | **Wording differs**, and the difference is D9.1's. The key is the *inbox's* name — the thing that survived the cut — and `הודעות` is the generic *messages* the two-tab screen was called. **Ship `inbox.title`**; the generic word is a residue of the cut switcher. Finding. |
| `דורש פעולה` | — | **No key.** And `4f` has a *mark as requiring action* toggle that produces exactly this state — see [`4f`](4f-dashboard-announcements.md). The producing side has no key either. |
| `הודעת מועדון` | `comms.announcement.title` (`הודעות`) | Wording differs. |
| `דנה · ג'ודו / מתחילים` | `people.student.group` | Data, **cross-namespace (M3)** — a per-child notice's source label. |
| `קבלה` | `billing.receipt.email` names the artefact | **Cross-namespace (M6)**, and **▲ a receipt notice in the inbox is D9.3's territory**: §5.10 issues a tax document for **card payments only**. A `קבלה` card is correct **only** if the underlying payment was by card. Finding. |
| `אתמול` / `16.08 · 19:24` / `14.08` / `01.08` | — | **▲ No key, and three different formats on one screen** — a relative day, an absolute date-and-time, and two bare dates. A relative-time formatter in `core` — **sixth artboard asking for one.** |
| `הצהרת בריאות לנועה — נדרשת לפני 25.08` | `health.gate.title` (`נדרשת הצהרת בריאות`) | **Cross-namespace (M4)**; the composed title interpolates a name and a deadline and has no key. |
| `ללא הצהרה חתומה לא ניתן להשתתף באימון.` | `health.badge.missingHint` **contradicts it** | **▲ *Without a signed declaration the child cannot take part in training.*** §5.5 says **nothing on the mat is ever blocked**, there is no `block_attendance_without_health` setting, and the shipped key reads `אפשר לסמן נוכחות. ההצהרה נדרשת מההורה`. **Third artboard making this claim**, after `11b` and `2d` — and this one is to the parent. |
| `מילוי הצהרה` | `health.gate.action` (`מילוי ההצהרה`) | Near-exact **(M4)**. |
| `אחר כך` | — | **No key.** A dismiss-for-now on a card §5.11 describes as pinned until acknowledged. Reconcile with [`4f`](4f-dashboard-announcements.md). |
| `אין אימונים בערב שבועות (01.06)` | `schedule.session.cancelled` | **Cross-namespace (M2)**; the announcement's own title is manager-authored **content**, not copy. |
| `כל הקבוצות. השיעורים יושלמו בשבוע שאחרי.` | `comms.audience.studio` (`כל המועדון`) | Content, not copy. |
| `מבחן חגורה — 12.09, אולם א'` | `events.exam.title` | **Cross-namespace (M7)**; content. |
| `נדרשת נוכחות של 80% בחודשיים האחרונים. דנה עומדת בתנאי.` | `events.exam.eligibleHint` **contradicts it** | **▲ Attendance as an eligibility criterion — the seventh artboard**, and the second stated to a parent. §5.9 says rank and time held. See the README's finding 18. |
| `קבלה על 640₪ — אוגוסט` | `billing.receipt.*` | **Cross-namespace (M6)**; content with an amount. |
| `התקשרו למשרד` / `וואטסאפ` | — | **No keys**, and see the D9.1 note — these are outbound escapes, not replies. |

**Four of the four cards carry content authored in another lane.** That is the shape of an inbox and
it is worth stating: **`comms` owns the shell, the states and the chrome; every card's title and body
is data another lane produced.** The i18n boundary runs between them.

## Findings for the lane

1. **▲ §5.11's push-disabled banner has six keys and no design**, on the screen it belongs to.
2. **▲ The health card tells a parent their child cannot train.** §5.5 forbids the rule; three
   artboards now state it.
3. **▲ Attendance as exam eligibility — seventh artboard**, second stated to a parent.
4. **Read/unread is not modelled**, and four keys exist for it. The design has a
   resolved/outstanding axis instead. One of the two has to give.
5. **`הודעות` is the cut switcher's word.** Ship `comms.inbox.title`.
6. **Three timestamp formats on one screen**, and no relative-time formatter. Sixth artboard.
7. **A receipt card is only honest for a card payment** — D9.3 again, from the inbox side.
8. **`אחר כך` dismisses a card §5.11 pins until acknowledged.** Reconcile with `4f`.
9. **No empty state**, and every new family starts in it.
10. **`Alert` needs a title and an action slot.** Sixth artboard.
