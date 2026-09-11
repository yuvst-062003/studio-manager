# Flyers — a shareable recruitment board

> Design agreed 2026-09-08. **Planning only** — nothing in this document is implemented.
>
> The feature appears in neither SPEC.md nor `docs/plan/state.yaml`. SPEC.md mentions
> flyers twice, both times as something that happens *outside* the product: §5.4 line 543
> calls the public link "a marketing asset — put it on Instagram, on a flyer QR, in the
> club's bio", and §5.14's funnel report already breaks leads down by a `source` whose
> listed values include `flyer` and `word of mouth`. This design brings the flyer inside.

## 1. What this is

A studio-level board of recruitment flyers. A manager uploads a finished image; every
parent in the club sees it and can send it to anyone they like, most often into a WhatsApp
chat. A recipient who taps the link lands on the club's existing public landing page and
books a free trial lesson through the flow that already exists.

The product goal is growth: the club's existing parents are its most credible marketing
channel, and today the app gives them nothing to hand a friend.

**Vertical:** `marketing` — new. `./scripts/lane-check.sh marketing`

## 2. Decisions taken, and what they rule out

Each of these was chosen deliberately during the design conversation. They are recorded
with their consequences so a later reader can tell whether the reasoning still holds.

| Decision | Consequence |
|---|---|
| **Recruitment, not club notices.** A flyer advertises the club to people who are not members. | Club announcements stay in §5.11 where they belong. A flyer has no inbox entry and no push. |
| **The manager uploads a finished image.** The app stores it and never touches the pixels beyond resizing. | No template engine, no brand editor. A flyer's times go stale if the schedule changes, and nothing detects that. |
| **Attribution is per flyer, never per parent.** | The manager learns which flyer works. Nobody learns which parent brought which family — which is also what keeps one parent's name off another family's record. |
| **The share sends the image file, with the booking link in the text.** | Native and forwardable. A recipient who forwards only the picture loses the link, and file sharing needs a fallback path on iOS in a browser tab. |
| **No photo-consent gate at upload.** | The club's position is that the registration consents already cover publication. See §9. |

## 3. Data model

Two new tables, both owned by `marketing`, both carrying `TenantMixin`.

```
flyer                            TenantMixin · UUIDPrimaryKey · TimestampColumns
  title                 text          not null    board label, and the share text heading
  share_text            text          null        the pre-composed message
  image_key             text          not null    object-storage key
  image_content_type    text          not null
  image_width           int           not null    board reserves space; no reflow
  image_height          int           not null
  public_ref            varchar(10)   not null    the ?f= code
  status                varchar(12)   not null    draft | published | archived
  published_at          timestamptz   null
  archived_at           timestamptz   null
  expires_on            date          null        the board stops showing it after this
  share_count           int           not null    default 0
  created_by_person_id  uuid          null

  UNIQUE (studio_id, public_ref)
  CHECK  (status IN ('draft', 'published', 'archived'))
  INDEX  (studio_id, status, expires_on)          the board's query
```

```
flyer_lead                       TenantMixin · UUIDPrimaryKey · TimestampColumns
  flyer_id     uuid  not null  → flyer.id
  student_id   uuid  not null  → student.id   ON DELETE CASCADE

  UNIQUE (studio_id, student_id)               one lead has one origin
```

### Why the image is not encrypted

`EncryptedBytes` is for health declarations and minors' records. A recruitment flyer is a
public marketing asset whose entire purpose is to be broadcast to strangers; encrypting it
would protect nothing and break the share. Said out loud because CLAUDE.md's encryption
rule is emphatic and a reader is entitled to know this was considered rather than missed.

### Why `public_ref` gets no token ceremony

`onboarding_link` stores only `token_hash` because the token grants entry to a wizard that
creates real people. `public_ref` grants nothing — it names a flyer. Ten random base32
characters, enough that codes are not sequentially enumerable, stored in the clear because
there is nothing behind it to protect.

## 4. Attribution — the seam

`student.source` is already `varchar(40)`, nullable and free-text
(`app/models/people.py:140`), and SPEC §5.14 already names `flyer` as one of its expected
values. So a flyer-sourced booking sets `student.source = 'flyer'` **with no schema change
to the people vertical's table.** Which flyer lives in `flyer_lead`.

A join table rather than a column on `student`, for two reasons:

1. The foreign key points from `marketing` into `people` and never the reverse, so the
   people vertical never has to know marketing exists.
2. §11.4's anonymisation already walks `student`. The cascade is the entire deletion
   story — no new privacy code, and no new row for the retention job to learn about.

### The path the value travels

```
WhatsApp text     …/t/gladiator?f=k3n9q7x2p1
      ↓
PublicLanding     reads ?f= from location.search
      ↓           (the route regex in features/landing/route.ts:14 matches on
                   pathname only, so a query string does not disturb it)
      ↓
BookingFlow       carried in React state across welcome → family → health
      ↓           (the trial flow is ANONYMOUS — BookingFlow.tsx:52 — so the
                   code does not have to survive an OAuth round trip)
      ↓
POST booking      { …, flyer_ref: "k3n9q7x2p1" }
      ↓
booking service   resolves ref → flyer, inside the SAME transaction that already
                  writes Student + Guardian + trial_booking + health_declaration
      ↓
rows              student.source = 'flyer'
                  flyer_lead(flyer_id, student_id)
```

### A stale code is ignored, not rejected

An unknown, expired or archived `flyer_ref` lets the booking complete with `source` unset.

This departs from CLAUDE.md's *"refuse rather than accept, when accepting creates a dead
end"*, and the departure is deliberate. That rule exists because a write that succeeds and
then fails a downstream check leaves a user repeating themselves with nothing to read.
Here there is no downstream check and no dead end: the booking is complete and correct,
and only an analytics row is missing. Blocking a parent's friend from booking a free lesson
because a marketing code went stale would be the actual failure.

## 5. API

`app/routers/flyers.py`, mounted by discovery. Tagged `APIRouter(tags=["coach"])` because
staff read the board — per `.claude/rules/api.md` an untagged coach router is an unguarded
one. SPEC §13's third invariant passes trivially: no flyer endpoint returns a financial
field.

**Manager only** — `ManagerOrOwner` (`app/core/auth_context.py:116`):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/flyers` | all flyers including drafts and archived, with share and lead counts |
| `POST` | `/api/v1/flyers` | multipart: image + title + share_text → lands as `draft` |
| `PATCH` | `/api/v1/flyers/{id}` | title, share_text, `expires_on`, status transitions |
| `PUT` | `/api/v1/flyers/{id}/image` | replace the image |
| `DELETE` | `/api/v1/flyers/{id}` | archives — never a hard delete, `flyer_lead` rows point at it |

**Any signed-in member of the studio** — guardians and staff alike:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/flyers/board` | published, not archived, not past `expires_on` |
| `GET` | `/api/v1/flyers/{id}/image` | the bytes, for the share sheet |
| `POST` | `/api/v1/flyers/{id}/shares` | increments `share_count`, returns 204 |

**Public: nothing.** No new unauthenticated surface at all. The `?f=` code is read by the
landing page that already exists and handed to the booking endpoint that already exists.
This keeps faith with the standing rule at `app/routers/studio.py:8` — *"There is no
generic `GET /files/{key}`, and there must never be one."* The flyer id in the image URL is
safe for the same reason `/public/studios/{slug}/photos/{photo_id}` is: `TenantSession`
scopes the lookup, so another studio's id is a 404 rather than a leak.

`AuditService.record(...)` on publish, archive, image replacement and delete. **Not** on
share — a parent tapping שתף changes nobody's record, and at a few thousand taps a season
it would bury the log.

All timestamps through `app.core.clock.now()`. `expires_on` is compared against the studio's
Asia/Jerusalem date, not UTC, or a flyer expires three hours early.

### Status transitions, stated so nobody has to guess

```
draft ──publish──► published ──archive──► archived
  ▲                    │                      │
  └────unpublish───────┘                      │
                       ◄──────republish────────┘
```

`published_at` is set on the first publish and never cleared — it records when the flyer
first went out, which is what a later reader wants. `archived_at` is cleared on republish.
A flyer past its `expires_on` is not archived: it stays `published` and simply drops off the
board, so extending the date brings it back without a status change.

For a caller who is **not** a manager, `GET /flyers/{id}/image` and
`POST /flyers/{id}/shares` are 404 for any flyer not currently on the board: a parent
cannot share a draft, and a parent whose board is stale gets a clean refusal rather than a
silently uncounted share. A manager reaches every flyer's image regardless of status —
the dashboard in §7 renders draft and archived thumbnails, so a blanket 404 would blank
its own list.

## 6. The upload

Two gaps in the existing upload layer have to close for this feature to work.

**`MAX_UPLOAD_BYTES` is 2 MB** (`app/core/storage.py:40`) — right for a logo, too tight for
a flyer. A Canva PNG export routinely lands at 4–6 MB, and telling a manager to go compress
it is the likeliest first-run support call.

**Nothing in the codebase reads image dimensions.** `sniff_image_type`
(`app/core/storage.py:155`) reads magic bytes and nothing else, so the server cannot fill
`image_width` / `image_height`. Pillow 12.3.0 is importable in the venv but is **not
declared in `pyproject.toml`** — it is a transitive dependency of something else, which is
not a thing to build on.

So: **declare Pillow explicitly**, and add `app/services/marketing/images.py`:

```
accept      ≤ 8 MB, enforced while reading (the pattern in app/core/uploads.py:60 —
            a declared Content-Length is a claim from the caller)
sniff       PNG | JPEG | WebP, from the bytes; the Content-Type header is never
            consulted, exactly as app/routers/studio.py:18 already refuses to
measure     → image_width, image_height
downscale   long edge > 2000px
re-encode   → WebP q82, typically 200–400 KB stored
```

Nothing is lost: WhatsApp recompresses on send regardless.

## 7. Clients

### Parent app — `web/apps/parent/src/features/marketing/`

Route `#/flyers`, reached from a card on the **home** screen. Not a sixth tab: the bar
already holds five and its own comment records that the 360px label check was tight at five
(`features/shell/ParentTabBar.tsx:34`). Avoiding a tab also avoids editing the `common`
namespace's `tabs.*` keys, a file other lanes own.

```
  הזמינו חברים לאימון                         ‹

  ┌──────────────────────────────────────┐
  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
  │ ░░░      flyer image             ░░░ │   ← true aspect ratio,
  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │     reserved from
  │                                      │     image_width/height
  │  שיעור ניסיון חינם                    │
  │                                      │
  │  [        שתפו בוואטסאפ        ]     │
  └──────────────────────────────────────┘
```

### The share, and the three details that decide whether it works

```ts
// The link goes INSIDE `text`, never in `url`. WhatsApp drops `url` when a file
// is attached, which would send a picture nobody can book from.
const text = `${flyer.shareText}\n${bookingUrl(flyer.publicRef)}`

if (navigator.canShare?.({ files: [file] })) {
  await navigator.share({ files: [file], text })     // the chosen behaviour
} else if (navigator.share) {
  await navigator.share({ text })                    // iOS in a tab, desktop Firefox
} else {
  await navigator.clipboard.writeText(text)          // last resort
}
```

1. **The blob must be ready before the click.** `navigator.share` requires transient user
   activation, and an `await fetch(...)` inside the handler loses it on Safari — the sheet
   silently never opens. The image is prefetched on `pointerdown` into a ref so the handler
   calls `share()` in the same task as the gesture. This is the single most likely way to
   ship this feature broken, and the reason a manual check on a real iPhone belongs in the
   done-when below.
2. **`AbortError` is not a failure.** Dismissing the share sheet throws it. It must not
   surface as an error and must not increment `share_count`.
3. **`POST /shares` is fire-and-forget.** A failed count never blocks or reverses a share
   that already happened.

### Dashboard — `web/apps/dashboard/src/features/marketing/`

```
  פליירים                                  [ + פלייר חדש ]

  ┌───────────────────────────────────────────────────┐
  │ [thumb]  שיעור ניסיון חינם          ● מפורסם      │
  │          34 שיתופים · 12 לידים · 5 נרשמו          │
  │          פג ב-30 בספטמבר                          │
  │                     [ ערוך ]  [ העבר לארכיון ]    │
  ├───────────────────────────────────────────────────┤
  │ [thumb]  קייטנת קיץ                 ○ טיוטה       │
  │          —                                        │
  │                     [ ערוך ]  [ פרסם ]            │
  └───────────────────────────────────────────────────┘
```

לידים and נרשמו come from `flyer_lead` joined to `student.status`. That join is what
answers the manager's real question — which flyer is working — and it is the reason
`flyer_lead` exists at all.

### i18n

A new `marketing` namespace: `web/packages/i18n/{he,en,ru}/marketing.ts`. Hebrew is the
reference locale. No string is inlined in a component.

## 8. What must land in a contract commit on `main`

Per §2 of the `feature` skill, a lane may author **none** of these. They land together, in
one wave's contract commit, before any lane work starts.

| # | Change | Why it is contract |
|---|---|---|
| 1 | One alembic revision — `flyer`, `flyer_lead` | new tables |
| 2 | `web/packages/i18n/types.ts` + `index.ts` — the 13th namespace `marketing` | authored once, never by a lane |
| 3 | `scripts/lane-check.sh` — a `marketing` case branch | a path not listed is a gate that skips silently and still prints green |
| 4 | Trial-booking request schema gains optional `flyer_ref` | a schema the `people` vertical reads |
| 5 | `pyproject.toml` — declare Pillow | a runtime dependency, not a lane's to add |

Items 2 and 3 are roughly eight and ten lines. Item 4 is additive and optional, so it
cannot break the existing booking flow.

The `lane-check.sh` branch, written out because the script's own comments insist that what
a gate covers should be a statement someone made rather than an accident of a default:

```bash
marketing)
    py_candidates=(app/services/marketing app/routers/flyers.py app/models/marketing.py)
    test_candidates=(tests/marketing)
    # Owns nothing under web/packages/core.
    core_dirs=()
    ;;
```

## 9. Photo consent — recorded, not gated

A recruitment flyer for a children's judo club will usually carry photographs of children
training. The club's position, taken explicitly during this design, is that the consents
parents already sign cover publication, and **no gate is built**: the manager uploads what
they choose, exactly as the studio logo and landing photos work today.

One fact is recorded here so it is on the record rather than discovered later.
`REQUIRED_CONSENT_TYPES` is `("terms", "privacy")` (`app/services/privacy/policy.py:51`).
`photo_video` is *grantable but not required*, and a withdrawal writes a new row with
`granted = False` (`app/models/health.py:176`). So "the parents already agreed to the
policy" is true of terms and privacy, and is not by itself a record of photo consent for
any particular child.

This changes nothing about what gets built. It is written down because a future reader
deciding whether to add a gate should start from the actual state of the consent table
rather than from an assumption about it.

## 10. Testing

**The seam, not the ends** — CLAUDE.md: *"A field added to an API is not proven by a test
that constructs the component's props by hand."*

- `tests/marketing/test_attribution.py` — a trial booking posted with `flyer_ref` writes
  **both** `student.source == 'flyer'` **and** the `flyer_lead` row, in one transaction.
  Negative: an archived, expired or unknown ref books successfully and writes no lead.
- `tests/marketing/test_flyers.py` — tenancy (studio B cannot read studio A's flyer or its
  image), permissions (a coach gets 403 on publish and 200 on the board), the 8 MB ceiling
  enforced while reading, a lying `Content-Type` refused by byte-sniffing, and an archived
  flyer absent from `/flyers/board`.
- `tests/marketing/test_images.py` — downscaling and re-encoding, and that
  `image_width` / `image_height` match what was stored.
- `FlyerBoard.test.tsx` — the whole `fetch → state → share payload` mapping, with
  `navigator.canShare` stubbed both ways, asserting the booking URL is inside `text` and
  never in `url`, and that an `AbortError` neither surfaces nor counts.

## 11. Done when

- A manager uploads a 5 MB flyer, gives it a title and a share message, and publishes it.
- Every parent sees it on `#/flyers` with no layout reflow as the image loads.
- A parent taps שתף **on a real iPhone**, picks a WhatsApp contact, and the picture and the
  booking link both arrive. (Manual: the activation gotcha in §7 cannot be caught by jsdom.)
- The recipient taps the link, books a free trial, and the manager's flyer row shows
  `1 ליד`. When that lead converts, it shows `1 נרשם`.
- `./scripts/lane-check.sh marketing` green.

## 12. Deliberately not in v1

Generated flyers from templates · per-parent referral attribution and rewards · referral
credit against tuition · targeting a flyer at particular groups · the staff app board · a
push or inbox notice when a flyer is published · QR generation and print-optimised
download · Instagram or social posting · scheduled publication.

The model is shaped so the first of these is additive: a generated flyer is a second `kind`
of the same row, not a rewrite.

## 13. Open — a delivery-plan question, not a code one

This feature is in neither SPEC.md nor `docs/plan/state.yaml`. Every wave from W0 to W9S is
shipped or active, so there is no open piece to tick. It needs either a new wave or a new
piece appended to `W8C`. `state.yaml` is machine-written by the cockpit, so that placement
is a call about the delivery plan and is left open here.
