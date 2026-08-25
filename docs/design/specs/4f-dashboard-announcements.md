# `4f` — הודעות · composing, with an audience and a preview

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 |
| **Canvas** | `docs/design/canvas/03-manager-dashboard/Manager Dashboard.dc.html` |
| **Wave · lane** | W5 · **M8 Communication** |
| **i18n namespace** | `comms` |
| **Slot** | none |

## Regions

1. **DashNav** — imported, `active="messages"`.
2. **Header bar** — title · a subtitle stating the scope (*sent to the parent app · no external
   channel*) · spacer · save-as-template · **a send primary carrying the recipient count**.
3. **Body row**
   - **Compose column** (at the reading start) — three stacked cards:
     1. **Audience** — a wrapping chip row, then a recipient-count caption.
     2. **Content** — a title field, a body textarea, and a **language-tab row**.
     3. **Options** — two toggle rows: mark as requiring action, and schedule the send.
   - **Preview column** (fixed width, far side) — a caption, a **phone frame** mocking the parent's
     inbox, and a caveat note beneath it.

## The audience picker

**A combinable multi-select, not a dropdown.**

- Two **group chips** already selected, each individually removable, plus a dashed *add a group*
  affordance — additive across groups.
- Two more chips are **narrowing filters** — only households in debt, only those missing a document —
  drawn in the same row, unselected. So they AND-combine with the group selection.
- **The recipient count appears twice**: in a caption under the chips, and **in the send button's own
  label.**

**The count is household-deduplicated**, and the screen says so twice — the caption states *one
message per household, even with several children*, and the preview's caveat gives the worked case:
a parent with three children across two groups receives it **once**. That is exactly right, it is the
kind of thing that is expensive to discover late, and `comms.audience.recipients` already interpolates
a count.

**No zero-recipient state is drawn**, and a filter combination that reaches nobody is easy to build.

## The preview shows the inbox, not a push notification

The frame is labelled *preview — the parent app*, and what it renders is the parent's **inbox list** —
a screen headed `הודעות`, with the new message as a card above an existing one, its body **truncated
with an ellipsis**.

**The push notification is claimed only in the caveat text and never mocked.** `comms.preview.pushLine`
(`כך תיראה ההתראה בנעילת המסך`) exists for a lock-screen rendering and **is not drawn.** Given §5.11's
whole delivery model is push-plus-inbox, previewing only half of it is a real gap — and the truncation
in the inbox card is the one place a manager can see their body is too long.

**The preview is the same component [`7b`](7b-dashboard-create-event.md) needs**, and its inner
strings must come from the **parent app's** keys, not be re-authored here.

## ▲ The delivery report has no artboard, anywhere

W5's model distinguishes three reasons a message did not land — the app was never installed
(`no_token`), notifications are switched off (`denied`), and the send failed (`failed`) — and §5.11
says merging them turns the screen back into a number nobody can act on: *"5 didn't receive it"* is
not actionable; *"5 never installed the app"* is.

`comms` carries the whole family: `delivery.title`, `delivery.sent`, `delivery.received`,
`delivery.missed`, `delivery.inFlight`, `delivery.allReceived`, **`delivery.reason.no_token`,
`delivery.reason.denied`, `delivery.reason.failed`**, `delivery.copyNumbers`, `delivery.numbersCopied`,
`delivery.resend` and `delivery.shareToWhatsapp`.

**Thirteen keys. No artboard.** `4f` is the compose screen and stops at send; nothing anywhere in the
canvas draws a post-send report, on this surface or any other. **That screen has to be designed from
§5.11 and the W5 model, not ported.** It is the single largest design gap the specs surfaced.

The same goes for **`delivery.shareToWhatsapp`** — §5.11's no-API, no-cost WhatsApp path, where the
manager picks the group from a share sheet. No affordance for it exists here; the header subtitle
says *no external channel* outright, which reads as a deliberate scope statement and needs
reconciling with the key.

## States

| State | What renders |
|---|---|
| **Group chips** | Selected and removable; a dashed add. |
| **Filter chips** | **Unselected only** — the selected state is undrawn. |
| **Language tabs** | One active; two dashed *add a translation* affordances. |
| **Requires-action toggle** | **Off**, with its state label. |
| **Schedule toggle** | **On**, with its state label — **and its helper doubles as the chosen time's readout**, plus a fixed guardrail: no messages after 21:00. |
| **The time picker** | **Not drawn** — only the toggle's resting state with a value already set. |
| **Zero recipients** | **Not drawn.** |
| **Sending / sent / failed** | **Not drawn.** |
| **Empty / loading / error** | **Not drawn**, anywhere. |

Between the two toggles both states are documented — but not on one control.

## Tokens by role

| Role | Token | Where |
|---|---|---|
| Ground | `--ground` | the page |
| Surface | `--surface` | the header bar, all three cards, the preview column, the preview's message cards |
| Ink | `--fg` | headings, the selected chip's fill, the send button's fill, the title field's focused border |
| On-ink | `--on-fg` | those labels |
| Secondary text | `--text-secondary` | subtitle copy, helper lines, the preview card's body |
| Muted text | `--text-muted` | field micro-labels, the off state label, the preview timestamp — **at D8's floor** |
| Semantic — on | `--paid` | the schedule toggle's label and track |
| Border | `--border` / `--border-strong` | hairlines, the body field's edge, the **dashed** add-affordances |
| Belt | — none. |

**No danger and no pending token appears anywhere** — on a screen that sends to 128 households
irreversibly. There is no error colour because there are no error states. No D8-retired grey.

## RTL

- Nav on the right; the compose column at the reading start, the preview at the far side, by `dir`
  plus DOM order.
- **▲ The preview column's divider is a physical `border-right`.** It faces the compose column only
  because of where the preview falls; mirrored to LTR it lands on the outer edge.
  → `border-inline-start`. The only physical work in `4f`'s range.
- **Must not mirror:** the recipient counts (twice), the scheduled time, the guardrail hour, the
  preview's timestamp.
- **The preview frame renders parent-app content inside a manager screen** — it must carry the parent
  app's direction and typography, not inherit ad hoc.

## Primitives

| Part | Primitive | Notes |
|---|---|---|
| Both toggles | `Switch` | `stateLabels: {on, off}` — the visible label is the primitive's contract and D5's rule. |
| Title field | `TextField` | |
| **Body textarea** | `TextField`, multiline | **Confirm the primitive has a multiline mode.** `12c`, `9g` and `7b` need one too — four artboards. |
| All three cards, the preview's message tiles | `Card` | |
| Buttons | `Button` | Save-as-template `secondary`, send `primary` with an interpolated count. |
| **Language tabs** | *not `SegmentedControl`* | Two of the three "segments" are **add** affordances, not peers. A tab-plus-add composite. |
| **Audience picker** | *gap* | Removable chips, an add affordance, and filter chips, all in one row, with a live recount. **`StatusChip` is a display indicator**; none of the 18 covers this. Twelfth artboard wanting a chip control. |
| **Time picker** | *gap* | Not drawn, and not `DateRangePicker`. |
| **Phone-frame preview** | *feature-specific, shared with `7b`* | Build once. Feed it the parent's keys. |
| **Delivery report** | — | **No artboard.** See above. |

## Strings → keys

| On screen | Key | Status |
|---|---|---|
| `הודעה חדשה` | `comms.announcement.create` (`הודעה חדשה`) | exact |
| `נשלחת לאפליקציית ההורים · ללא ערוץ חיצוני` | — | **No key**, and it is a **scope statement that contradicts `comms.delivery.shareToWhatsapp`.** Reconcile. |
| `שמירה כתבנית` | — | **No key**, and a **message template** has no model — `comms` has `announcement.draft` and nothing about templates. Finding. |
| `שליחה ל־128 הורים` | `comms.announcement.publish` (`שליחה`) + `comms.audience.recipients` (`יגיע ל-{{count}} משפחות`) | Both exist; **the composed button does not** — and note **`הורים` vs `משפחות`**: the key says *families*, the button says *parents*, the caption says both. **Third word for one concept**, after `משק בית`. Finding. |
| `קהל יעד` | `comms.audience.title` | exact |
| the two group chips | `comms.audience.group` (`קבוצה`) | Data. |
| `+ קבוצה` | — | **No key.** |
| `רק משקי בית בחוב` / `רק מסמך חסר` | `billing.debt.byHousehold` / `health.documents.missing` | **▲ No keys, and both are cross-lane audience filters** — M6's balance and M4's declaration selecting an M8 audience. `comms.audience.*` has studio, class, group and `limitedToOwnGroups`. **Neither filter has a member.** Finding. |
| `128 הורים · 143 חניכים · הודעה אחת למשק בית…` | `comms.audience.recipients` | The key covers one count; **the three-part caption has none.** The dedup sentence is the important half. |
| `תוכן` / `כותרת` / `גוף ההודעה` | — / `comms.announcement.subject` / `announcement.body` | Two of three exact. |
| the title and body **values** | — | **Manager-authored content**, not copy. |
| `עברית` / `+ תרגום לרוסית` / `+ תרגום לאנגלית` | — | **▲ No keys — and this is a product decision hiding in a tab row.** Per-message translation, authored by the manager, in the three locales D6 ships. `comms` has no translation family, and §5.11 does not model a multi-locale announcement. **A message with a Hebrew body and no Russian translation reaches a Russian-speaking parent (§6.1) in Hebrew** — that is either fine and stated, or it is a gap. Finding. |
| `סימון כ"דורש פעולה"` / `ההודעה תיצמד לראש המסך עד שההורה יאשר` | — | **No keys.** This is the toggle that produces [`2b`](2b-parent-inbox.md)'s danger card — **and the two disagree**: this says *pinned until the parent acknowledges*, and `2b` gives that card an `אחר כך` dismiss. Reconcile. |
| `כבוי` / `מופעל` | `comms.preferences.off` / `.on` | exact — **and they are the generic pair every other namespace borrows.** They belong in `common`. |
| `תזמון שליחה` / `מחר, 08:00 — לא נשלחות הודעות אחרי 21:00` | `comms.announcement.schedule` (`תזמון שליחה`) + `announcement.scheduledFor` | The label is exact; **the readout and the 21:00 guardrail have no key** — and a quiet-hours rule is a product policy with no §-line. Finding. |
| `תצוגה מקדימה — אפליקציית ההורים` | `comms.preview.title` + `preview.asParent` | Both exist. |
| the preview's inner strings | *see* [`2b`](2b-parent-inbox.md) | They must come from the **parent's** keys. |
| `ההודעה תופיע גם כהתראת דחיפה. הורה עם שלושה ילדים בשתי הקבוצות יקבל אותה פעם אחת בלבד.` | `comms.preview.pushLine` | **The push half has a key and no mock.** The dedup half has no key and is the more valuable sentence. |

`comms.announcement.cancelSchedule` and `announcement.delete` both exist and nothing on this artboard
uses them — a scheduled message cannot be unscheduled here, and a sent one cannot be withdrawn.

## Findings for the lane

1. **▲ The delivery report has thirteen keys and no artboard, anywhere.** §5.11's three reasons —
   never installed, notifications off, send failed — are the whole point of the screen. Design it
   from the spec. **The largest single design gap in the canvas.**
2. **▲ Per-message translation is a product decision hiding in a tab row.** No model, no keys, and
   §6.1 expects Russian-speaking parents.
3. **Two audience filters are cross-lane** — M6's debt and M4's missing document — with no member in
   `comms.audience.*`.
4. **Message templates have no model.**
5. **The preview shows the inbox and not the push**, and `preview.pushLine` exists.
6. **`4f` says the requiring-action card is pinned until acknowledged; [`2b`](2b-parent-inbox.md)
   gives it a dismiss.** Reconcile.
7. **A quiet-hours rule — nothing sent after 21:00 — has no §-line.**
8. **Nothing can be unscheduled or withdrawn**, though both keys exist.
9. **No zero-recipient, sending, sent or failed state** on a screen that sends irreversibly to 128
   households — and no danger token appears anywhere.
10. **Parents · families · households: three words, one concept.**
11. **`preferences.on`/`.off` belong in `common`.** Every namespace borrows them.
