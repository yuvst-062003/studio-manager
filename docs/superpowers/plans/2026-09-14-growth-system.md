# §20 Growth System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the club a loop — the app writes content from its own rows, the owner approves
it in one tap, it publishes to Facebook and Instagram, a stranger who sees it books a real
trial lesson, and that member's training becomes next week's content.

**Architecture:** Five levels, each independently useful and each gated on the one before.
A new `content` vertical (`app/services/content/`, `app/routers/content.py`,
`app/models/content.py`) owns drafting and the consent check. Publishing and WhatsApp arrive
later as **transports** behind an already-working state machine, never as a rebuild. The
model may phrase and interpret; it never decides a fact — prices, ages, times and addresses
come from rows. Nothing reaches a parent, a Page or an Instagram account without a manager's
explicit yes.

**Tech Stack:** FastAPI · SQLAlchemy · Alembic · PostgreSQL · React + TypeScript + Vite ·
`anthropic` Python SDK (`claude-opus-5`) · Web Push (VAPID, live since 2026-09-13) ·
Meta Graph API · WhatsApp Cloud API

**Spec:** [`docs/growth-spec.md`](../../growth-spec.md) — the reasoning and the citations.
[`docs/growth-plan.html`](../../growth-plan.html) — the system as a page; **where the two
conflict, the page is the later thinking.**
Account setup: [`docs/growth/meta-setup-runbook.md`](../../growth/meta-setup-runbook.md).

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from
`CLAUDE.md`, `SPEC.md` and `docs/growth-spec.md`.

- **Python tooling lives in `.venv`.** Always `.venv/bin/pytest`, `.venv/bin/mypy`,
  `.venv/bin/ruff`, `.venv/bin/alembic` — a bare `python3`/`pytest` resolves to an old 3.8
  interpreter earlier on PATH.
- **The lane check is `./scripts/lane-check.sh content`.** A vertical with no case branch in
  that script is a gate that skips silently and still prints green.
- **Money is stored in agorot (integers). Never floats.** Model spend included.
- **All timestamps stored UTC; rendered in Asia/Jerusalem.** `app.core.clock.now()` is the
  **only** clock — a test fails the build on any other `datetime.now()` in `app/`.
- **Tenancy:** every new model inherits `TenantMixin` from `app/core/tenancy.py`. It fails
  closed. `with_all_tenants(reason=...)` is not legal in this vertical.
- **Routers stay thin** — parse, call a service, return. Business logic lives in `services/`.
- **Never edit `app/main.py` or `app/models/__init__.py`.** Both mount by discovery. Adding
  `app/routers/content.py` mounts it under `/api/v1/content`.
- **Hebrew user-facing strings live in `web/packages/i18n/he/content.ts`**, mirrored in `en/`
  and `ru/`. Never inline a string in a component. `web/packages/i18n/index.ts` and
  `types.ts` are authored **once, in the contract commit** — never by a task.
- **Alembic:** `main` owns `alembic/versions/**`. One revision, in the contract commit.
- **Logging:** structured JSON with a scrubber. Log payloads as `extra=`, never interpolated
  into the message.
- **Audit:** `AuditService.record(...)`. Never put health contents, a child's name, or a
  consent answer in `diff`.
- **`ruff` line-length 100, `mypy` strict, Python 3.14.**
- **The model never sees the consent ledger, a health declaration, or a child's name.**
  Enforced by a test, not a policy.
- **The model may phrase and interpret. It must never decide a fact.** A price, an age band,
  an address or a lesson time in generated text must be traceable to a row.
- **Nothing publishes without a manager's yes.** Generation is owner-or-manager only; a coach
  may write and submit a draft by hand but may not spend the club's model budget.
- **Write a failing test before fixing a bug.** Typecheck and lint after a series of edits.
- **Scope a test run to what the change can reach.** Run the suites the diff touches.

---

## The five levels

| | Level | What it gives the club | Build | Runs at | Gate to enter |
|---|---|---|---|---|---|
| **L0** | Switch it on | 100+ families in the app · Meta verified · the three doors visible | ~1 day of code, the rest is waiting | ₪0 | none — start today |
| **L1** | The studio only this app can build | A coach knows who may not be filmed. The owner gets a Hebrew caption from a real event and copies it out | ~8 days | under ₪2/mo | L0.1 sent |
| **L2** | The approval loop, over push | Ask from your phone, get a draft, revise it, approve it — nothing published | ~4 days | ₪0 | L1 shipped |
| **L3** | Meta: publish, and be found | Approval publishes to the Page and Instagram. Lead forms arrive in the app. WhatsApp becomes a second approval transport | ~8 days + review | ₪0 + ads | L0.4 complete **and** App Review passed |
| **L4** | The lead bot | A stranger messages the club and walks out with a booked trial | ~5 days | ₪0 | a real count of strangers who messaged last month |

**Running cost at the end of all five: under ₪20/month**, plus $22/month only if the voice
gate in L1.6 passes, plus whatever ads budget the owner sets and nothing more.

### Dependencies

```
L0.1 onboarding link ──────────────> everything's VALUE
L0.2 Meta account track (runbook) ─────────────────────────> L3 ─> L4
L0.3 the third door (wa.me)  ─┐
L0.5 voice sample recorded  ──┼─> L1.6 voice gate ─(pass)─> L1.7 narration
L0.6 captioning tool tried ───┼─> (decides whether §20.4 D is ever built)
L0.7 camera proven on iOS ────┴─> (decides whether §20.4 E is ever estimated)

L1 ─> L2 ─> L3 ─> L4     (strictly sequential; each is useful alone)
```

### What this plan deliberately does not build

Named here so the next reader does not rediscover the argument: the lead table and lead
screen (`Student.status='lead'` and `app/workers/followups.py` already are this), WhatsApp
broadcasts to parents, AI fliers, video rendering (`STORAGE_BACKEND` is a 4.9 GB Railway
volume), AI-generated video (Veo is ₪4.40–₪22 per 8 seconds and produces synthetic children),
and the in-app teleprompter that owns the camera (deferred behind L0.7).

**It also does not build the agent platform.** `docs/superpowers/specs/2026-09-08-agent-platform-design.md`
designs `agent_proposal` around one rule — *"a handler is a call to an existing service… the
review question for any new kind is 'which endpoint does a manager press to do this today?'"*
There is no endpoint a manager presses to publish to Facebook, so a content publish fails that
test by the design's own standard. Content drafts get their own table. That design stays
unbuilt and unblocked.

---

# Level 0 — Switch it on

**No engineering gate. Start every item today; most of the elapsed time is other people's
queues.** Only L0.3 is code.

> **Two of §20's first three steps shipped on 2026-09-14** (commit `1be537e8`) and are not
> repeated below: the **photo-consent tick** beside the registration signature — one
> signature, two records, with `None` recorded as *not asked* rather than as a refusal — and
> **שיתוף המועדון**, the share button on the parent app's home screen and in the profile
> menu. The share button is the loop's return arrow and the only feature in §20 aimed at the
> channel that has actually brought this club its members; it is worth nothing until L0.1
> puts a hundred families in front of it, which is the next line.

### L0.1 — Send the onboarding link · **this week** · no code

`app/routers/onboarding.py` already is this feature. One message to the club's existing
WhatsApp groups and each parent registers their own children, their own phone numbers and
their own health declarations.

- [ ] Owner sends the onboarding link to the club's WhatsApp groups.
- [ ] Check after 72 hours: `SELECT count(*) FROM student WHERE studio_id = <gladiator>`.

**Why this is first and why nothing above it matters without it.** Three students are in the
app; over a hundred train at the club. A share button in an app three families have is a
button nobody presses. This is proven rather than theoretical — all three students in
production arrived through this link.

> **The photo-consent tick shipped on 2026-09-14 (commit `1be537e8`), which is what makes it
> safe to send this now.** Had the link gone out first, a hundred families would have signed
> without ever being asked about photographs, and the only way to ask afterwards is to hope
> they open the privacy screen. That deadline has been met — do not re-open it.

### L0.2 — Start the Meta account track · **today** · no code

- [ ] Owner works [`docs/growth/meta-setup-runbook.md`](../../growth/meta-setup-runbook.md)
      from M1 to M11. M5 (the dedicated number) on day one; M2 (verification) is 1–5 working
      days and gates M6–M9.
- [ ] Record the nine secret values the runbook's last section names. Do **not** set them in
      Railway until L3 — a half-configured integration is worse than an unconfigured one.

### L0.3 — The third door, made visible · **~1 hour** · code

The landing page already carries a `wa.me` link — `data-testid="landing-whatsapp"` in
[web/apps/parent/src/features/landing/PublicLanding.tsx:691](../../../web/apps/parent/src/features/landing/PublicLanding.tsx#L691) — but it sits in the
location card at the bottom of the page, beside "navigate", where a hesitant parent never
reaches it. §20.6's "three ways in" needs it as a **peer of the booking button**, above the
fold: *for the decided* (the form), *for the unsure* (the assistant, L4), *for the hesitant*
(WhatsApp, now).

- [ ] **Step 1: Write the failing test**

```tsx
// web/apps/parent/src/features/landing/PublicLanding.test.tsx — add to the hero describe
it('offers WhatsApp beside the booking button, above the fold', async () => {
  renderLanding()
  const hero = await screen.findByTestId('landing-hero-cta')
  const whatsapp = within(hero).getByTestId('landing-hero-whatsapp')
  expect(whatsapp).toHaveAttribute('href', 'https://wa.me/972521234567')
  // The hesitant parent's door is a peer of the booking button, not a footnote under it.
  expect(within(hero).getByTestId('landing-hero-book')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd web && npx vitest run apps/parent/src/features/landing/PublicLanding.test.tsx --reporter=dot
```
Expected: FAIL — `Unable to find an element by: [data-testid="landing-hero-whatsapp"]`.

- [ ] **Step 3: Add the second CTA to the hero**

In `PublicLanding.tsx`, inside the hero's CTA row (the one already holding the booking
button), add a sibling anchor. Reuse the `phoneDigits` value the location card already
computes rather than recomputing it:

```tsx
{phoneDigits ? (
  <a
    className="gl-btn gl-btn--ghost"
    href={`https://wa.me/${phoneDigits.replace(/^0/, '972')}`}
    data-testid="landing-hero-whatsapp"
    target="_blank"
    rel="noopener noreferrer"
  >
    {t(locale, 'people.landing.hero.whatsapp')}
  </a>
) : null}
```

- [ ] **Step 4: Add the string to all three locales**

```ts
// web/packages/i18n/he/people.ts  — inside the landing.hero object
whatsapp: 'שליחת הודעה בוואטסאפ',
// web/packages/i18n/en/people.ts
whatsapp: 'Message us on WhatsApp',
// web/packages/i18n/ru/people.ts
whatsapp: 'Написать в WhatsApp',
```

- [ ] **Step 5: Run the test and the i18n parity gate**

```bash
cd web && npx vitest run apps/parent/src/features/landing/PublicLanding.test.tsx --reporter=dot
./scripts/lane-check.sh people
```
Expected: PASS, and no missing-key report.

- [ ] **Step 6: Commit**

```bash
git add web/apps/parent/src/features/landing/PublicLanding.tsx \
        web/apps/parent/src/features/landing/PublicLanding.test.tsx \
        web/packages/i18n/he/people.ts web/packages/i18n/en/people.ts web/packages/i18n/ru/people.ts
git commit -m "feat(people): the hesitant parent's door sits beside the decided one

§20.6's three ways in. The wa.me link existed in the location card at the foot of
the page, next to 'navigate' — reachable by someone who had already decided to come.
The parent this door is for leaves before they get there.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

### L0.4 — Record thirty minutes of voice · **owner, free**

The one input only the owner can give, and it costs nothing to do early. Record in a quiet
room, one sitting, reading anything — a book, the club's own regulations, these notes.

- [ ] **One of the scripts must contain Japanese technique names inside Hebrew sentences** —
      אוצ'י-גארי, איפון, רנדורי, סאונאגי. That is the hardest case Hebrew TTS faces and it is
      what L1.6's gate listens for.
- [ ] Save as WAV or high-bitrate MP3. Keep the file; nothing is uploaded yet.

### L0.5 — Try one real clip in one Hebrew captioning tool · **ten minutes**

This decides three days of work (§20.4 **D**).

- [ ] Take one real 60-second clip of training. Run it through **one** of Sonix, VEED,
      Flixier, Submagic or Filmora.
- [ ] **Check the subtitles in a player, never in a text editor.** Hebrew `.srt` files come
      out of many tools flipped or misaligned; an `.srt` that looks right in code is the
      single most likely way to ship broken Hebrew subtitles.
- [ ] Record the answer here: if it is good enough, **§20.4 D is never built** and this plan
      does not change. If it is not, D re-enters at ~3 days after L2.

### L0.6 — Prove the camera in the installed app · **half a day**

This decides whether §20.4 **E** is ever estimated.

- [ ] Install the parent PWA to the home screen on a **real iPhone** and a **real Android**.
- [ ] From the installed app (standalone mode, not Safari), call `getUserMedia` and record
      five seconds with `MediaRecorder`.
- [ ] Record the iOS version and the container that worked (`audio/mp4` on 14.5–18.3,
      `webm/opus` from 18.4 — anything written here needs per-version branching).
- [ ] If either device fails, **E stays deferred** and the shot brief (L1.2) is the whole of
      it. The brief works without the camera, which is the point.

### L0 exit gate

- [ ] `student` count for the Gladiator studio is materially above 3.
- [ ] Business verification **approved** (M2), or a resubmission is in the queue.
- [ ] The hero carries three doors on production.
- [ ] A voice sample with Japanese technique names exists on disk.
- [ ] The captioning question and the camera question each have a written answer.

---

# Level 1 — The studio only this app can build

**~8 days.** Everything here works with no Meta account, no token and no review queue. It is
also the only part of §20 an outside tool could not do at all: CapCut does not know that
Tuesday 17:00 is the 7–9s, and no editor on earth can tell a coach which children in the room
may be filmed.

**Order inside the level is not arbitrary.** The spec: *"If you only ever build one thing from
§20.4, it is B, the consent check"* — so it is Task 1, before anything that writes a word.

## File structure

| File | Responsibility |
|---|---|
| `app/models/content.py` | `ContentDraft`, `ContentGeneration`. Nothing else. |
| `app/services/content/filmability.py` | Who in this room may be filmed. Reads the consent ledger; no model, no network. |
| `app/services/content/briefs.py` | The shot brief: where to stand, how long, what to say. Club data only, no model call. |
| `app/services/content/model.py` | The **only** file in the app that talks to Anthropic. Cost accounting and the monthly cap live here. |
| `app/services/content/drafts.py` | The draft lifecycle. Builds the facts, calls the model seam, writes the rows. |
| `app/routers/content.py` | Thin. Parse, call a service, translate refusals. |
| `web/apps/staff/src/features/content/` | The filmability card, the brief screen, the editable box. |
| `web/packages/i18n/{he,en,ru}/content.ts` | Every Hebrew string in the vertical. |
| `tests/content/` | The suite. `./scripts/lane-check.sh content` runs it. |

---

## Task L1-C: The contract commit — on `main`, before any other task

**Files:**
- Create: `alembic/versions/<rev>_content_drafts.py`
- Create: `app/models/content.py`
- Create: `web/packages/i18n/he/content.ts`, `en/content.ts`, `ru/content.ts`
- Create: `tests/content/__init__.py`, `tests/content/conftest.py`
- Modify: `web/packages/i18n/types.ts`, `web/packages/i18n/index.ts`
- Modify: `scripts/lane-check.sh`
- Modify: `app/core/config.py`
- Modify: `requirements-dev.txt`

**Interfaces:**
- Produces: `ContentDraft`, `ContentGeneration` (SQLAlchemy models); the `content` i18n
  namespace; `settings.ANTHROPIC_API_KEY`, `settings.CONTENT_MODEL`,
  `settings.CONTENT_MONTHLY_CAP_AGOROT`; `./scripts/lane-check.sh content`.

> **This commit is the only one in Level 1 that touches shared surface.** `types.ts`,
> `index.ts`, `lane-check.sh`, `config.py` and the alembic revision are authored once, here,
> and never by a later task. `.claude/hooks/block-protected.sh` will deny the alembic file and
> may deny the i18n registry — **ask the owner per file** before bypassing, one at a time.

- [ ] **Step 1: The models**

```python
# app/models/content.py
"""§20.4 — the content studio's two tables.

**Why a table of its own rather than `agent_proposal`.** The agent platform design
(docs/superpowers/specs/2026-09-08-agent-platform-design.md §4) admits a `kind` only when
it can answer "which endpoint does a manager press to do this today?" — publishing to a
Facebook Page has no such endpoint, so a content publish fails that test by that design's
own standard. Two tables that look alike are cheaper than one table whose central rule is
untrue of half its rows.

**Why the spend is a second table.** A revision is a second model call against the same
draft. Folding the cost into `content_draft` would lose the first call's cost the moment
the body was rewritten, and `CONTENT_MONTHLY_CAP_AGOROT` is a guard against a loop with a
bug — a guard that under-counts is not a guard.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

#: What was asked for. `shot_script` is the brief's spoken line — generated, unlike the
#: brief's framing, which is club data and never a model call.
CONTENT_DRAFT_KINDS = ("event_post", "photo_caption", "shot_script")

#: L1 only ever writes `draft` and `discarded`. L2 adds the other two and the transitions
#: between them; the column carries all four from the start so L2 needs no migration.
CONTENT_DRAFT_STATUSES = ("draft", "pending_approval", "approved", "discarded")

#: Why a manager threw it away. Fixed vocabulary for the same reason the agent platform's
#: is: `wrong_facts` is a bug report arriving through the product, and free text is neither
#: countable nor actionable.
CONTENT_DISCARD_REASONS = ("wrong_facts", "wrong_tone", "not_worth_it", "wrong_photo")


class ContentDraft(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    __tablename__ = "content_draft"
    __tenant_table_args__ = (
        CheckConstraint(
            "kind IN ('event_post', 'photo_caption', 'shot_script')", name="content_draft_kind"
        ),
        CheckConstraint(
            "status IN ('draft', 'pending_approval', 'approved', 'discarded')",
            name="content_draft_status",
        ),
        CheckConstraint(
            "status <> 'approved' OR approved_by_person_id IS NOT NULL",
            name="content_draft_approved_has_actor",
        ),
        Index("ix_content_draft_studio_status", "studio_id", "status", "created_at"),
    )

    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    #: The Hebrew the manager reads and edits. Plain text: it is written to be published.
    body_he: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: What it was written FROM. Both nullable — a photo caption has no event.
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("event.id", ondelete="SET NULL")
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("session.id", ondelete="SET NULL")
    )
    #: Object-store keys for the photographs the caption was written from. Keys, never bytes.
    media_keys: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    #: Hashtags, kept apart from the body so a manager can drop them without retyping.
    hashtags: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    created_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    approved_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    discard_reason: Mapped[str | None] = mapped_column(String(20))


class ContentGeneration(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    __tablename__ = "content_generation"
    __tenant_table_args__ = (
        #: The cap's query: this studio, this month. Leading studio_id, then the clock.
        Index("ix_content_generation_studio_created", "studio_id", "created_at"),
    )

    draft_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("content_draft.id", ondelete="SET NULL")
    )
    model: Mapped[str] = mapped_column(String(40), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    #: G-money: agorot, integer. Never a float, and never a dollar figure.
    cost_agorot: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Which facts were handed to the model, by NAME only — never their values, and never
    #: a child's name. This is what makes "the model never decides a fact" auditable.
    fact_keys: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    #: Present when the call was refused or fell back to the template writer.
    failure: Mapped[str | None] = mapped_column(String(40))
```

- [ ] **Step 2: The alembic revision**

Hand-write it (a lane never runs `alembic revision`; `main` owns `alembic/versions/**`).
Two `op.create_table` calls matching the models above, each with `studio_id` non-null,
`ForeignKey("studio.id", ondelete="RESTRICT")`, the `ix_<table>_studio_id_id` composite index
`TenantMixin` declares, the named check constraints, and the two extra indexes. `downgrade()`
drops `content_generation` first (it references `content_draft`).

- [ ] **Step 3: Run it against a real database**

```bash
./scripts/dev-db.sh up
.venv/bin/alembic upgrade head
.venv/bin/alembic downgrade -1 && .venv/bin/alembic upgrade head
```
Expected: clean up, clean down, clean up again. A revision that cannot be reversed is a
revision that cannot be deployed twice.

- [ ] **Step 4: The i18n namespace**

```ts
// web/packages/i18n/types.ts — add to NAMESPACES, after 'tasks'
  // §20.4's content studio. One namespace for the whole vertical: the filmability card,
  // the shot brief and the draft box are one screen flow and split keys would read as
  // three features.
  'content',
```

Add the three imports and the three bundle entries to `index.ts` following the existing
pattern exactly (`he`, `en`, `ru` blocks, then the bundle map). Create the three files with
the keys the later tasks use:

```ts
// web/packages/i18n/he/content.ts
export const content = {
  'filmability.title': 'מי מותר לצילום',
  'filmability.allClear': 'כל התלמידים בשיעור הזה מאושרים לצילום',
  'filmability.blocked': '{{count}} תלמידים אינם מאושרים לצילום',
  'filmability.reason.declined': 'ההורה סירב',
  'filmability.reason.never_asked': 'לא נשאלו',
  'filmability.rule': 'אין לפרסם קליפ שבו נראה ילד שאינו מאושר.',
  'brief.title': 'הנחיות צילום',
  'brief.seconds': '{{seconds}} שניות',
  'brief.orientation.portrait': 'לאורך',
  'brief.orientation.landscape': 'לרוחב',
  'draft.title': 'טיוטה',
  'draft.copy': 'העתקה',
  'draft.copied': 'הועתק',
  'draft.revise': 'תיקון',
  'draft.revisePlaceholder': 'מה לשנות? למשל: קצר יותר',
  'draft.discard': 'מחיקה',
  'draft.capReached': 'נגמרה מכסת הכתיבה החודשית. אפשר לכתוב ידנית.',
  'draft.unavailable': 'הכתיבה האוטומטית אינה זמינה כרגע. הטקסט למטה הוא תבנית.',
} as const
```

Mirror every key in `en/content.ts` and `ru/content.ts`. The parity script reports missing
keys per locale; `he` is the reference.

- [ ] **Step 5: The lane-check branch**

```bash
# scripts/lane-check.sh — a new case branch beside the others
  content)
    # §20.4. `app/workers/` holds nothing for this vertical in L1 — the studio is entirely
    # request-path. L3 adds app/workers/content_publish.py and it is listed here now, on the
    # same reasoning `comms` lists app/workers/notify.py before it exists: a path named here
    # is reached the day it appears, without anyone remembering.
    py_candidates=("app/services/$V" "app/routers/$V.py" "app/models/$V.py" \
                   "app/workers/content_publish.py")
    test_candidates=("tests/$V")
    # Owns nothing under web/packages/core.
    core_dirs=()
    ;;
```

- [ ] **Step 6: Config**

```python
# app/core/config.py — beside the other provider secrets
    #: §20.4. Unset disables generation rather than crashing: `ContentModel` falls back to
    #: the template writer and every screen still works. Same shape as SMTP_PASSWORD and
    #: the VAPID pair — an unset secret is a feature that is off, never a boot failure.
    ANTHROPIC_API_KEY: SecretStr | None = None
    #: The writer. Opus 5 is the better Hebrew writer and costs ~3 agorot a caption; the
    #: club's whole monthly volume is under two shekels either way, so this is set for
    #: quality and left alone. `claude-haiku-4-5` is the cheap swap if volume ever changes.
    CONTENT_MODEL: str = "claude-opus-5"
    #: A GUARD, not a budget (growth-spec §20.4). At ~3 agorot a caption this is ~660
    #: generations a month — far past any real use, and it stops a retry loop with a bug
    #: from spending real money overnight.
    CONTENT_MONTHLY_CAP_AGOROT: int = 2000
```

- [ ] **Step 7: The dependency**

```
# requirements-dev.txt — append with its reason, as pywebpush did
# §20.4 — the content studio's only model client. app/services/content/model.py is the
# single file that imports it; everything else in the vertical takes a `ContentModel`.
anthropic
```

- [ ] **Step 8: The test scaffolding**

```python
# tests/content/conftest.py
"""§20.4's fixtures. The studio, the callers, the group and the session are identical to
attendance's — a content draft is written about the same lesson a coach marks a roster on —
so they are imported rather than copied. A second copy would drift."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from app.models.health import ConsentRecord
from app.models.person import Guardian, Person
from app.models.studio import Studio
from app.services.privacy.policy import expected_version
from tests.attendance.conftest import (  # noqa: F401 -- re-exported as fixtures
    Caller,
    a_class,
    a_group,
    a_session,
    a_training_year,
    an_enrolled_student,
    as_assistant_coach,
    as_lead_coach,
    as_manager,
    studio,
    tenant_session,
)


@pytest.fixture
def guardian_of(app_session: Session, studio: Studio):
    """Attach a guardian to a student, optionally with a photo_video answer.

    `granted=None` means ASKED NOBODY — the third state the 2026-09-14 consent commit is
    built around, and the one that must read as "not filmable" without reading as a refusal.
    """

    def _attach(student_id: uuid.UUID, *, granted: bool | None) -> uuid.UUID:
        person = Person(
            studio_id=studio.id, first_name="הורה", last_name=str(uuid.uuid4())[:8]
        )
        app_session.add(person)
        app_session.flush()
        app_session.add(
            Guardian(
                studio_id=studio.id,
                student_id=student_id,
                person_id=person.id,
                is_primary=True,
                relation="parent",
            )
        )
        if granted is not None:
            app_session.add(
                ConsentRecord(
                    studio_id=studio.id,
                    subject_type="person",
                    subject_id=person.id,
                    consent_type="photo_video",
                    version=expected_version("photo_video"),
                    granted=granted,
                    granted_at=datetime(2026, 9, 14, tzinfo=UTC),
                )
            )
        app_session.commit()
        return person.id

    return _attach
```

- [ ] **Step 9: Verify the whole contract**

```bash
.venv/bin/pytest tests/content -q
.venv/bin/mypy app
cd web && npm run typecheck && cd ..
./scripts/lane-check.sh content
```
Expected: the suite collects (no tests yet is fine), mypy clean, typecheck clean, and the
lane check prints `content` gates rather than "skipped — no targets".

- [ ] **Step 10: Commit**

```bash
git add alembic/versions app/models/content.py app/core/config.py requirements-dev.txt \
        scripts/lane-check.sh web/packages/i18n tests/content
git commit -m "contract(content): §20.4's two tables, the namespace and the model seam's config

The one commit in Level 1 that touches shared surface. content_draft carries all four
statuses from the start so L2's approval loop needs no second migration, and the spend
is its own table because a revision is a second call and a guard that under-counts is
not a guard.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task L1.1: The consent check — who in this room may be filmed

**This is the most valuable thing in §20 and the cheapest.** It is the one capability no
outside tool has, it costs ₪0 to run, and the club has already been caught once by the
question it answers — five photographs came off the landing page on 2026-09-08.

**Files:**
- Create: `app/services/content/__init__.py`, `app/services/content/filmability.py`
- Create: `app/routers/content.py`
- Create: `tests/content/test_filmability.py`
- Create: `web/apps/staff/src/features/content/FilmabilityCard.tsx`, `contentClient.ts`,
  `FilmabilityCard.test.tsx`

**Interfaces:**
- Consumes: `ConsentService.holds_current(session, *, person_id, consent_type) -> bool`
  ([app/services/privacy/consent.py:111](../../../app/services/privacy/consent.py#L111));
  `build_roster(session, session_id) -> tuple[SessionRow, list[RosterRowRaw]]`
  ([app/services/attendance/roster.py:110](../../../app/services/attendance/roster.py#L110)).
- Produces: `FilmabilityService(session).for_session(session_id) -> FilmabilityReport`;
  `GET /api/v1/content/filmability/{session_id}`; the `FilmabilityOut` wire shape.

### The rule, decided here and not left to the reader

A student is **filmable** only when *every* person who can answer for them holds a current,
granted, non-revoked `photo_video` consent, and there is at least one such person.

- **Guardians answer.** §20.5.1: the parent signs at registration and the app reads their
  file, so `subject_type='person'` is correct.
- **Two guardians, one yes and one no, is a NO.** A child's image is not a majority vote.
- **No guardian on file** → fall back to the student's own `person_id`. That is how an adult
  student answers for themselves, and for a child with no guardian row it produces
  `never_asked`, which is the fail-closed answer.
- **`never_asked` is not `declined`**, and the screen must not conflate them. The 2026-09-14
  commit kept three states apart on purpose — `True` is consent, `False` is asked and
  declined, `None` is *not asked* — and a report that renders "not asked" as a refusal makes
  the club's own privacy policy text untrue.

- [ ] **Step 1: Write the failing test**

```python
# tests/content/test_filmability.py
"""§20.4 B — the one thing no outside tool can do.

Every case here is a real one from this club: a family that ticked yes at registration, a
family that ticked no, a family that registered before the tick existed, and an adult
student answering for themselves.
"""

from __future__ import annotations

import uuid

from app.services.content.filmability import FilmabilityService


def test_a_child_whose_guardian_granted_is_filmable(
    tenant_session, a_session: uuid.UUID, an_enrolled_student: uuid.UUID, guardian_of
):
    guardian_of(an_enrolled_student, granted=True)

    report = FilmabilityService(tenant_session).for_session(a_session)

    assert report.total == 1
    assert report.filmable == 1
    assert report.blocked == ()


def test_a_child_whose_guardian_declined_is_blocked_and_says_so(
    tenant_session, a_session: uuid.UUID, an_enrolled_student: uuid.UUID, guardian_of
):
    guardian_of(an_enrolled_student, granted=False)

    report = FilmabilityService(tenant_session).for_session(a_session)

    assert report.filmable == 0
    assert [b.reason for b in report.blocked] == ["declined"]


def test_a_child_nobody_ever_asked_is_blocked_but_not_recorded_as_a_refusal(
    tenant_session, a_session: uuid.UUID, an_enrolled_student: uuid.UUID, guardian_of
):
    """The families who registered before 2026-09-14. `None` is not `False`, and a screen
    that says "ההורה סירב" about a parent nobody asked is a lie the club would have to
    answer for."""
    guardian_of(an_enrolled_student, granted=None)

    report = FilmabilityService(tenant_session).for_session(a_session)

    assert report.filmable == 0
    assert [b.reason for b in report.blocked] == ["never_asked"]


def test_one_no_among_two_guardians_blocks_the_child(
    tenant_session, a_session: uuid.UUID, an_enrolled_student: uuid.UUID, guardian_of
):
    """A child's image is not a majority vote."""
    guardian_of(an_enrolled_student, granted=True)
    guardian_of(an_enrolled_student, granted=False)

    report = FilmabilityService(tenant_session).for_session(a_session)

    assert report.filmable == 0
    assert [b.reason for b in report.blocked] == ["declined"]


def test_a_student_with_no_guardian_answers_for_themselves(
    tenant_session, a_session: uuid.UUID, an_enrolled_student: uuid.UUID
):
    """The adult-student path, and the fail-closed path for a child with no guardian row:
    with nobody on file, nobody has said yes."""
    report = FilmabilityService(tenant_session).for_session(a_session)

    assert report.filmable == 0
    assert [b.reason for b in report.blocked] == ["never_asked"]


def test_the_report_never_carries_a_consent_answer_or_a_health_field(
    tenant_session, a_session: uuid.UUID, an_enrolled_student: uuid.UUID, guardian_of
):
    """G7, and §13 invariant 3's shape argument: a structure with nowhere to put a health
    flag cannot leak one. The coach needs a name to avoid a face, and nothing else."""
    guardian_of(an_enrolled_student, granted=False)

    report = FilmabilityService(tenant_session).for_session(a_session)

    assert set(vars(report.blocked[0])) == {"student_id", "display_name", "reason"}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
./scripts/dev-db.sh up
.venv/bin/pytest tests/content/test_filmability.py -q
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.content.filmability'`.

- [ ] **Step 3: Write the service**

```python
# app/services/content/filmability.py
"""§20.4 B — which children in this room may be filmed.

**The strongest idea in the growth spec, and it arrived by accident.** `consent_record`
already carries `photo_video`, versioned and revocable, and since 2026-09-14 the
registration signature asks for it. No outside tool can read that. This file is the whole
of the capability: one query over a roster the app already builds, and one consent lookup
the privacy service already answers.

**It fails closed and says which kind of closed.** `never_asked` and `declined` are
different facts about a family, and the club's published policy says refusal "אינו נרשם
כהסכמה" — so an unanswered box must never render as a refusal.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from app.models.person import Guardian
from app.models.people import Student
from app.models.structure import Group
from app.services.attendance.roster import build_roster
from app.services.privacy.consent import ConsentService

#: Why a student is not filmable. Two values, kept apart on purpose -- see the docstring.
BLOCK_REASONS = ("declined", "never_asked")


@dataclass(frozen=True)
class BlockedStudent:
    """A face to keep out of frame. **Three fields and no room for a fourth** -- §13's
    invariant 3 argument: a shape with nowhere to put a health flag cannot leak one."""

    student_id: uuid.UUID
    display_name: str
    reason: str


@dataclass(frozen=True)
class FilmabilityReport:
    session_id: uuid.UUID
    group_name: str
    total: int
    filmable: int
    blocked: tuple[BlockedStudent, ...]


class FilmabilityService:
    def __init__(self, session: OrmSession) -> None:
        self._session = session

    def for_session(self, session_id: uuid.UUID) -> FilmabilityReport:
        session_row, roster = build_roster(self._session, session_id)
        group_name = self._session.get(Group, session_row.group_id)
        blocked: list[BlockedStudent] = []

        for row in roster:
            reason = self._block_reason(row.student_id)
            if reason is not None:
                blocked.append(
                    BlockedStudent(
                        student_id=row.student_id,
                        display_name=row.display_name,
                        reason=reason,
                    )
                )

        return FilmabilityReport(
            session_id=session_id,
            group_name=group_name.name if group_name is not None else "",
            total=len(roster),
            filmable=len(roster) - len(blocked),
            blocked=tuple(blocked),
        )

    def _block_reason(self, student_id: uuid.UUID) -> str | None:
        """`None` when every answerer has said yes. Otherwise which kind of no it is."""
        answerers = self._answerers(student_id)
        if not answerers:
            return "never_asked"

        saw_refusal = False
        saw_silence = False
        for person_id in answerers:
            if ConsentService.holds_current(
                self._session, person_id=person_id, consent_type="photo_video"
            ):
                continue
            latest = ConsentService.latest_by_type(self._session, person_id=person_id)
            row = latest.get("photo_video")
            #: A revoked or superseded grant is a refusal, not a silence: somebody answered,
            #: and the answer standing today is no.
            if row is None:
                saw_silence = True
            else:
                saw_refusal = True

        if saw_refusal:
            return "declined"
        if saw_silence:
            return "never_asked"
        return None

    def _answerers(self, student_id: uuid.UUID) -> tuple[uuid.UUID, ...]:
        """Every person who can answer for this student.

        The guardians, or -- when there are none -- the student's own person row. That
        second branch is how an adult student answers for themselves, and it is also what
        makes a child with no guardian on file read as `never_asked` rather than as
        filmable.
        """
        guardians = tuple(
            self._session.execute(
                select(Guardian.person_id).where(Guardian.student_id == student_id)
            ).scalars()
        )
        if guardians:
            return guardians
        student = self._session.get(Student, student_id)
        return (student.person_id,) if student is not None else ()
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
.venv/bin/pytest tests/content/test_filmability.py -q
```
Expected: 6 passed.

- [ ] **Step 5: Write the failing route test**

```python
# tests/content/test_content_routes.py
from __future__ import annotations

import uuid


def test_a_coach_may_read_the_filmability_of_a_session(
    client, as_lead_coach, a_session: uuid.UUID, an_enrolled_student: uuid.UUID, guardian_of
):
    """A coach is the person holding the phone, so a coach must be able to ask. This is the
    same roster they already see -- it carries no fact they are not already trusted with."""
    guardian_of(an_enrolled_student, granted=False)

    response = client.get(
        f"/api/v1/content/filmability/{a_session}", headers=as_lead_coach.headers
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    assert body["filmable"] == 0
    assert body["blocked"][0]["reason"] == "declined"


def test_a_guardian_may_not(client, as_guardian, a_session: uuid.UUID):
    response = client.get(
        f"/api/v1/content/filmability/{a_session}", headers=as_guardian.headers
    )
    assert response.status_code == 403, response.text
```

- [ ] **Step 6: Run it and watch it fail**

```bash
.venv/bin/pytest tests/content/test_content_routes.py -q
```
Expected: FAIL with 404 — the router does not exist, so `/api/v1/content/...` is unmounted.

- [ ] **Step 7: Write the router**

```python
# app/routers/content.py
"""§20.4 — the content studio's routes. Thin: parse, call a service, translate a refusal.

Mounted by discovery (`app/main.py` seam 2) under `/api/v1/content`. Nothing is registered
anywhere for this file to exist.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.auth_context import AnyStaff
from app.core.tenancy import TenantSessionDep
from app.services.attendance.errors import NotFoundError
from app.services.content.filmability import FilmabilityService

router = APIRouter(prefix="/content", tags=["content"])


class BlockedOut(BaseModel):
    student_id: uuid.UUID
    display_name: str
    reason: str


class FilmabilityOut(BaseModel):
    session_id: uuid.UUID
    group_name: str
    total: int
    filmable: int
    blocked: list[BlockedOut]


@router.get("/filmability/{session_id}", response_model=FilmabilityOut)
def read_filmability(
    _: AnyStaff, session_id: uuid.UUID, session: TenantSessionDep
) -> FilmabilityOut:
    """Who in this lesson may be filmed. Open to coaches: they hold the phone."""
    try:
        report = FilmabilityService(session).for_session(session_id)
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "לא נמצא"},
        ) from exc
    return FilmabilityOut(
        session_id=report.session_id,
        group_name=report.group_name,
        total=report.total,
        filmable=report.filmable,
        blocked=[BlockedOut(**vars(b)) for b in report.blocked],
    )
```

- [ ] **Step 8: Run the route tests**

```bash
.venv/bin/pytest tests/content -q
```
Expected: 8 passed.

- [ ] **Step 9: Regenerate the API client, then build the card**

```bash
.venv/bin/python -m app.main --openapi > openapi.json || true   # if the repo has a task for it
cd web && npm run -w @studio/api-client generate
```
`web/packages/api-client/` is generated from OpenAPI and **never hand-edited**.

Then `web/apps/staff/src/features/content/FilmabilityCard.tsx` — a card the coach sees on the
session screen before filming. It renders the count, then the names, then the rule. Every
string from `t(locale, 'content.…')`; RTL comes from `@studio/ui`.

- [ ] **Step 10: Write the component test first**

```tsx
// web/apps/staff/src/features/content/FilmabilityCard.test.tsx
it('names the children to keep out of frame, and does not call an unanswered parent a refusal', async () => {
  server.use(filmability({ total: 8, filmable: 6, blocked: [
    { student_id: 'a', display_name: 'אורי', reason: 'declined' },
    { student_id: 'b', display_name: 'נועם', reason: 'never_asked' },
  ]}))
  render(<FilmabilityCard sessionId="s1" />)
  expect(await screen.findByText('אורי')).toBeInTheDocument()
  expect(screen.getByTestId('filmability-reason-b')).toHaveTextContent('לא נשאלו')
  expect(screen.getByTestId('filmability-reason-b')).not.toHaveTextContent('סירב')
})
```

- [ ] **Step 11: Run the frontend gate**

```bash
cd web && npx vitest run apps/staff/src/features/content/FilmabilityCard.test.tsx --reporter=dot
```
Expected: PASS.

- [ ] **Step 12: Look at it**

Open the staff app on a session screen and read the card. *If it renders, render it and look* —
two defects reached production that one look would have caught.

- [ ] **Step 13: Commit**

```bash
git add app/services/content app/routers/content.py tests/content \
        web/apps/staff/src/features/content web/packages/api-client openapi.json
git commit -m "feat(content): a coach is told who may not be filmed, before they press record

§20.4 B. One query over a roster the app already builds and one consent lookup the
privacy service already answers — and the only capability in §20 that no outside tool
has. Fails closed, and keeps 'nobody asked' apart from 'the parent said no', because
the club's published policy says a refusal is not recorded as a consent.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task L1.2: The shot brief — where to stand, how long, what to say

**No model call, and that is the point.** The brief is club data plus a fixed vocabulary of
shot types. It costs ₪0 to run and it answers the thing that actually stops the owner from
posting: *not knowing what to post*.

**Files:**
- Create: `app/services/content/briefs.py`
- Modify: `app/routers/content.py`
- Create: `tests/content/test_briefs.py`
- Create: `web/apps/staff/src/features/content/ShotBrief.tsx`, `ShotBrief.test.tsx`

**Interfaces:**
- Consumes: `FilmabilityService(session).for_session(...)` from L1.1;
  `Session.starts_at / group_id / location_id`
  ([app/models/schedule.py:186](../../../app/models/schedule.py#L186));
  `Group.name / age_min / age_max`, `Location.name / address`.
- Produces: `SHOT_TYPES: tuple[ShotType, ...]`;
  `BriefService(session).for_session(session_id, *, shot_key) -> ShotBrief`;
  `GET /api/v1/content/shot-brief/{session_id}?shot=<key>`.

### Why the Hebrew is not in this file

The shot types carry **i18n keys**, not sentences. The service returns
`framing_key='brief.framing.technique_closeup'` and the real facts (`group_name`,
`starts_at_local`, `age_min`, `age_max`); the client renders. That is the house rule — *never
inline a string in a component* — and it is also what lets the same brief read in Russian for
a coach who needs it to.

- [ ] **Step 1: Write the failing test**

```python
# tests/content/test_briefs.py
"""§20.4 A. The brief is the cheapest thing in the growth spec and the answer to the actual
blocker: the owner does not post because they do not know what to post, not because writing
takes too long."""

from __future__ import annotations

import uuid

import pytest

from app.services.content.briefs import SHOT_TYPES, BriefService, UnknownShotError


def test_the_brief_carries_the_real_lesson_and_not_a_generic_one(
    tenant_session, a_session: uuid.UUID
):
    brief = BriefService(tenant_session).for_session(a_session, shot_key="technique_closeup")

    assert brief.shot.key == "technique_closeup"
    assert brief.shot.seconds == 20
    assert brief.shot.orientation == "portrait"
    #: The facts come from rows. A brief that says "your group" is a brief nobody films.
    assert brief.group_name != ""
    assert brief.starts_at_local.endswith(("0", "5"))  # HH:MM in Asia/Jerusalem


def test_the_brief_carries_the_filmability_report_with_it(
    tenant_session, a_session: uuid.UUID, an_enrolled_student: uuid.UUID, guardian_of
):
    """One screen, one answer. A coach who has to open a second screen to find out who may
    not be filmed is a coach who films first."""
    guardian_of(an_enrolled_student, granted=False)

    brief = BriefService(tenant_session).for_session(a_session, shot_key="warmup_wide")

    assert brief.filmability.filmable == 0
    assert brief.filmability.blocked[0].reason == "declined"


def test_every_shot_type_has_a_duration_an_orientation_and_three_keys(tenant_session):
    """The vocabulary is fixed, and a shot type with a missing key renders a blank card."""
    for shot in SHOT_TYPES:
        assert shot.seconds > 0
        assert shot.orientation in ("portrait", "landscape")
        assert shot.framing_key.startswith("brief.framing.")
        assert shot.script_key.startswith("brief.script.")
        assert shot.title_key.startswith("brief.shot.")


def test_an_unknown_shot_is_refused_rather_than_guessed(tenant_session, a_session: uuid.UUID):
    with pytest.raises(UnknownShotError):
        BriefService(tenant_session).for_session(a_session, shot_key="drone_flyover")
```

- [ ] **Step 2: Run it and watch it fail**

```bash
.venv/bin/pytest tests/content/test_briefs.py -q
```
Expected: FAIL — `No module named 'app.services.content.briefs'`.

- [ ] **Step 3: Write the service**

```python
# app/services/content/briefs.py
"""§20.4 A -- the shot brief. Club data and a fixed vocabulary; no model call, ₪0 to run.

**Four shot types and no more.** A list of twenty is a list nobody reads on a mat. Each one
answers the same four questions -- where to stand, what is in frame, how long, what to say --
and each carries i18n keys rather than sentences, so the Hebrew lives where every other
Hebrew string in this product lives.

**The camera is not ours.** §20.4 E (the in-app teleprompter) is deferred behind a real-device
test, and this file is the version that always works: the app shows the brief, the coach props
the phone and films with the ordinary camera app.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session as OrmSession

from app.models.schedule import Session as SessionRow
from app.models.structure import Group, Location
from app.services.attendance.errors import NotFoundError
from app.services.content.filmability import FilmabilityReport, FilmabilityService

#: G3 -- stored UTC, rendered Asia/Jerusalem. The rendering happens at the edge, and a brief
#: read on a mat at 17:45 is the edge.
STUDIO_TZ = ZoneInfo("Asia/Jerusalem")


class UnknownShotError(ValueError):
    """A shot key with no entry. Refused rather than defaulted: a brief for the wrong shot
    is worse than no brief, because the coach films it."""


@dataclass(frozen=True)
class ShotType:
    key: str
    seconds: int
    orientation: str
    title_key: str
    framing_key: str
    script_key: str


SHOT_TYPES: tuple[ShotType, ...] = (
    ShotType(
        key="technique_closeup",
        seconds=20,
        orientation="portrait",
        title_key="brief.shot.technique_closeup",
        framing_key="brief.framing.technique_closeup",
        script_key="brief.script.technique_closeup",
    ),
    ShotType(
        key="warmup_wide",
        seconds=15,
        orientation="landscape",
        title_key="brief.shot.warmup_wide",
        framing_key="brief.framing.warmup_wide",
        script_key="brief.script.warmup_wide",
    ),
    ShotType(
        key="belt_moment",
        seconds=25,
        orientation="portrait",
        title_key="brief.shot.belt_moment",
        framing_key="brief.framing.belt_moment",
        script_key="brief.script.belt_moment",
    ),
    ShotType(
        key="coach_to_camera",
        seconds=30,
        orientation="portrait",
        title_key="brief.shot.coach_to_camera",
        framing_key="brief.framing.coach_to_camera",
        script_key="brief.script.coach_to_camera",
    ),
)

_BY_KEY = {shot.key: shot for shot in SHOT_TYPES}


@dataclass(frozen=True)
class ShotBrief:
    shot: ShotType
    group_name: str
    age_min: int | None
    age_max: int | None
    #: HH:MM in Asia/Jerusalem. A string because it is read, not computed against.
    starts_at_local: str
    location_name: str
    location_address: str
    filmability: FilmabilityReport


class BriefService:
    def __init__(self, session: OrmSession) -> None:
        self._session = session

    def for_session(self, session_id: uuid.UUID, *, shot_key: str) -> ShotBrief:
        shot = _BY_KEY.get(shot_key)
        if shot is None:
            raise UnknownShotError(shot_key)

        session_row = self._session.get(SessionRow, session_id)
        if session_row is None:
            raise NotFoundError(str(session_id))

        group = self._session.get(Group, session_row.group_id)
        location = (
            self._session.get(Location, session_row.location_id)
            if session_row.location_id is not None
            else None
        )

        return ShotBrief(
            shot=shot,
            group_name=group.name if group is not None else "",
            age_min=group.age_min if group is not None else None,
            age_max=group.age_max if group is not None else None,
            starts_at_local=session_row.starts_at.astimezone(STUDIO_TZ).strftime("%H:%M"),
            location_name=location.name if location is not None else "",
            location_address=(location.address or "") if location is not None else "",
            filmability=FilmabilityService(self._session).for_session(session_id),
        )
```

- [ ] **Step 4: Run the tests**

```bash
.venv/bin/pytest tests/content/test_briefs.py -q
```
Expected: 4 passed.

- [ ] **Step 5: Add the route**

```python
# app/routers/content.py -- add beneath read_filmability
class ShotBriefOut(BaseModel):
    shot_key: str
    seconds: int
    orientation: str
    title_key: str
    framing_key: str
    script_key: str
    group_name: str
    age_min: int | None
    age_max: int | None
    starts_at_local: str
    location_name: str
    location_address: str
    filmability: FilmabilityOut


@router.get("/shot-brief/{session_id}", response_model=ShotBriefOut)
def read_shot_brief(
    _: AnyStaff, session_id: uuid.UUID, shot: str, session: TenantSessionDep
) -> ShotBriefOut:
    """Open to coaches. The brief and the prompter are theirs; generation is not."""
    try:
        brief = BriefService(session).for_session(session_id, shot_key=shot)
    except UnknownShotError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "unknown_shot", "message": "סוג צילום לא מוכר"},
        ) from exc
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "לא נמצא"},
        ) from exc
    return _brief_out(brief)
```

Write `_brief_out` as a plain mapping function beside it — a router that builds a response
inline three times is a router that drifts.

- [ ] **Step 6: The Hebrew, in the namespace**

```ts
// web/packages/i18n/he/content.ts — twelve keys, three per shot type.
// The framing is an instruction a coach follows without thinking; the script is something
// sayable in the seconds the shot allows. Neither interpolates club data — the facts are
// rendered around them from the API's own fields, so a script can never quote a time or an
// age the rows did not supply.
  'brief.shot.technique_closeup': 'טכניקה מקרוב',
  'brief.framing.technique_closeup':
    'עמדו מהצד, המצלמה לאורך ובגובה החגורה. שני התלמידים בפריים מלא — אל תתקרבו יותר מדי, צריך לראות את הרגליים.',
  'brief.script.technique_closeup':
    'תראו את ההכנה, ואז את הזריקה. ג׳ודו זה לא כוח — זה תזמון.',

  'brief.shot.warmup_wide': 'חימום, פריים רחב',
  'brief.framing.warmup_wide':
    'עמדו בפינת המזרן, המצלמה לרוחב ובגובה החזה. כל הקבוצה בפריים, בלי לחתוך רגליים.',
  'brief.script.warmup_wide':
    'ככה מתחיל אצלנו כל אימון — כולם ביחד, מהקטן ועד הגדול.',

  'brief.shot.belt_moment': 'רגע החגורה',
  'brief.framing.belt_moment':
    'המצלמה לאורך, בגובה העיניים של הילד. צלמו מלפנים, עם ההורים ברקע אם הם שם.',
  'brief.script.belt_moment':
    'החגורה הזאת לא ניתנת — היא נלקחת. עבדת עליה חודשים.',

  'brief.shot.coach_to_camera': 'מאמן למצלמה',
  'brief.framing.coach_to_camera':
    'המצלמה לאורך, בגובה העיניים, שתי צעדים מכם. רקע של מזרן ולא של קיר.',
  'brief.script.coach_to_camera':
    'שיעור ניסיון אצלנו הוא חינם ובלי התחייבות. בואו לראות אם זה מתאים לילד שלכם.',
```

Mirror all twelve in `en/content.ts` and `ru/content.ts`.

- [ ] **Step 7: Build the screen, test first, then look at it**

```bash
cd web && npx vitest run apps/staff/src/features/content/ShotBrief.test.tsx --reporter=dot
```
Then open it on a phone-width viewport. The brief is read standing up, holding a phone, in a
dojo — if it needs scrolling to get from the framing to the script, it is wrong.

- [ ] **Step 8: Lane check and commit**

```bash
./scripts/lane-check.sh content
git add app/services/content/briefs.py app/routers/content.py tests/content/test_briefs.py \
        web/apps/staff/src/features/content web/packages/i18n web/packages/api-client openapi.json
git commit -m "feat(content): the shot brief — four shots, the real lesson, no model call

§20.4 A. The owner does not post because they do not know what to post; this is the
answer to that sentence and it costs nothing to run. Carries the filmability report
with it, so the coach gets one screen rather than two.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task L1.3: The model seam — the only file that talks to Anthropic

**Files:**
- Create: `app/services/content/model.py`
- Create: `tests/content/test_model_guard.py`

**Interfaces:**
- Consumes: `settings.ANTHROPIC_API_KEY`, `settings.CONTENT_MODEL`,
  `settings.CONTENT_MONTHLY_CAP_AGOROT`; `ContentGeneration` from L1-C;
  `app.core.clock.now()`.
- Produces:
  `ContentModel(session).write(*, task: str, facts: dict[str, str | int], instruction: str, images: Sequence[tuple[bytes, str]] = ()) -> Generation`;
  `Generation(body_he, hashtags, model, input_tokens, output_tokens, cost_agorot, failure)`;
  `MonthlyCapReachedError`.

### Three rules this file exists to enforce

1. **The model never decides a fact.** Every number, name, time and address in the output must
   have come in through `facts`. The system prompt says so, and `fact_keys` on
   `content_generation` records which were handed over — so "where did 320 shekels come from"
   is answerable.
2. **The model never sees a child.** No student name, no consent answer, no health field ever
   enters a prompt. Enforced by an import test, not a comment.
3. **An unset key is a feature that is off, not a crash.** With no `ANTHROPIC_API_KEY` the
   writer falls back to a template built from the same facts, every screen still works, and
   the row records `failure='no_api_key'`. Same shape as `SMTP_PASSWORD` and the VAPID pair.

- [ ] **Step 1: Write the failing test**

```python
# tests/content/test_model_guard.py
"""The guards around the one file in this product that spends money.

None of these tests call Anthropic. The API client is replaced; what is under test is the
accounting, the cap and the boundary -- which are the parts that can go wrong at 03:00.
"""

from __future__ import annotations

import ast
import pathlib

import pytest

from app.core.config import settings
from app.models.content import ContentGeneration
from app.services.content.model import (
    USD_TO_AGOROT,
    ContentModel,
    MonthlyCapReachedError,
    cost_agorot,
)


def test_cost_is_integer_agorot_and_never_rounds_down_to_free():
    """G-money: agorot, integers, never floats. And a call that cost a fraction of an agora
    must still count as one -- a cap that treats small calls as free is not a cap."""
    assert cost_agorot("claude-opus-5", input_tokens=500, output_tokens=200) == 3
    assert cost_agorot("claude-opus-5", input_tokens=1, output_tokens=1) == 1
    assert isinstance(cost_agorot("claude-haiku-4-5", input_tokens=500, output_tokens=200), int)
    #: Haiku is the cheap swap the spec prices at ~0.5 agorot; it must still not be free.
    assert cost_agorot("claude-haiku-4-5", input_tokens=500, output_tokens=200) == 1
    assert USD_TO_AGOROT > 0


def test_an_unset_key_writes_a_template_and_records_why(tenant_session, monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)

    result = ContentModel(tenant_session).write(
        task="event_post",
        facts={"event_title": "בחינות חגורות", "starts_at_local": "16.9 17:45"},
        instruction="כתוב פוסט קצר",
    )

    assert result.failure == "no_api_key"
    assert result.cost_agorot == 0
    #: The facts still reach the page. A blank box is the failure this feature exists to fix.
    assert "בחינות חגורות" in result.body_he
    rows = tenant_session.query(ContentGeneration).all()
    assert [r.failure for r in rows] == ["no_api_key"]
    assert set(rows[0].fact_keys) == {"event_title", "starts_at_local"}


def test_the_cap_refuses_before_spending_rather_than_after(tenant_session, studio, monkeypatch):
    monkeypatch.setattr(settings, "CONTENT_MONTHLY_CAP_AGOROT", 10)
    tenant_session.add(
        ContentGeneration(
            studio_id=studio.id,
            model="claude-opus-5",
            input_tokens=0,
            output_tokens=0,
            cost_agorot=10,
            fact_keys=[],
        )
    )
    tenant_session.commit()

    with pytest.raises(MonthlyCapReachedError):
        ContentModel(tenant_session).write(task="event_post", facts={}, instruction="x")


def test_the_model_file_cannot_import_a_child(tenant_session):
    """G7, made mechanical. The strongest form of "the model never sees a child's name" is a
    module that has no way to obtain one. An import test is cheap and it fails on the commit
    that breaks it, which a comment does not."""
    source = pathlib.Path("app/services/content/model.py").read_text(encoding="utf-8")
    imported = {
        node.module
        for node in ast.walk(ast.parse(source))
        if isinstance(node, ast.ImportFrom) and node.module
    }
    forbidden = {
        "app.models.health",
        "app.models.people",
        "app.models.person",
        "app.services.privacy.consent",
        "app.services.health.declarations",
        "app.services.content.filmability",
    }
    assert not (imported & forbidden), f"the writer can reach a child through {imported & forbidden}"
```

- [ ] **Step 2: Run it and watch it fail**

```bash
.venv/bin/pytest tests/content/test_model_guard.py -q
```
Expected: FAIL — `No module named 'app.services.content.model'`.

- [ ] **Step 3: Write the seam**

```python
# app/services/content/model.py
"""The one file in this product that talks to Anthropic, and the only one that spends money.

**Why the boundary is a file rather than a rule.** Every other module in this vertical takes
a `ContentModel` and hands it facts. That means the answer to "can a child's name reach the
model" is a list of imports rather than a review of every call site -- and
tests/content/test_model_guard.py asserts that list.

**The cap is a guard, not a budget** (growth-spec §20.4): "a loop with a bug can spend real
money". It is checked BEFORE the call, because a cap checked afterwards has already paid.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session as OrmSession

from app.core.clock import now
from app.core.config import settings
from app.models.content import ContentGeneration

#: USD per million tokens, from the provider's own rate card. Verified 2026-09-14 and worth
#: re-checking before it is spent against.
_RATES_USD_PER_MTOK: dict[str, tuple[int, int]] = {
    "claude-opus-5": (5, 25),
    "claude-sonnet-5": (2, 10),
    "claude-haiku-4-5": (1, 5),
}
#: Agorot per US dollar -- a rate, not a price, and deliberately rounded UP. This number
#: exists to keep a runaway loop under a ceiling, never to invoice anybody, so erring high
#: is the safe direction.
USD_TO_AGOROT = 400

#: The rule, in the model's own instructions. It is repeated in the prompt because a policy
#: the model cannot read is a policy about the model rather than for it.
SYSTEM_HE = """אתה כותב תוכן שיווקי בעברית עבור מועדון ג'ודו.

חוקים שאין לחרוג מהם:
• כל עובדה — מחיר, גיל, שעה, תאריך, כתובת, שם קבוצה — חייבת להילקח מהעובדות שנמסרו לך.
  אם עובדה חסרה, אל תמציא אותה ואל תרמוז עליה. כתוב בלעדיה.
• אל תזכיר ילד מסוים בשם, גם אם נדמה לך שאתה יודע שם.
• עברית טבעית, קצרה, בגובה העיניים. בלי סופרלטיבים ובלי סימני קריאה מיותרים.
• החזר טקסט מוכן לפרסום, ותגיות בנפרד.
"""


class MonthlyCapReachedError(RuntimeError):
    """The studio has spent its month. Raised before the call, never after."""


class WrittenContent(BaseModel):
    """The shape the model must return. `strict` validation happens in the SDK."""

    body_he: str = Field(description="הטקסט המוכן לפרסום, בעברית")
    hashtags: list[str] = Field(default_factory=list, max_length=8)


@dataclass(frozen=True)
class Generation:
    body_he: str
    hashtags: tuple[str, ...]
    model: str
    input_tokens: int
    output_tokens: int
    cost_agorot: int
    #: None on success. 'no_api_key' | 'provider_error' otherwise -- and the body is then a
    #: template built from the same facts, so the screen still has something to show.
    failure: str | None


def cost_agorot(model: str, *, input_tokens: int, output_tokens: int) -> int:
    """Integer agorot, rounded UP. A call that cost a fraction of an agora still counts as
    one: a cap that treats small calls as free is not a cap."""
    rate_in, rate_out = _RATES_USD_PER_MTOK.get(model, _RATES_USD_PER_MTOK["claude-opus-5"])
    micro = input_tokens * rate_in + output_tokens * rate_out
    if micro == 0:
        return 0
    return (micro * USD_TO_AGOROT + 999_999) // 1_000_000


class ContentModel:
    def __init__(self, session: OrmSession) -> None:
        self._session = session

    def write(
        self,
        *,
        task: str,
        facts: dict[str, str | int],
        instruction: str,
        images: Sequence[tuple[bytes, str]] = (),
        draft_id: uuid.UUID | None = None,
    ) -> Generation:
        self._refuse_if_capped()

        key = settings.ANTHROPIC_API_KEY
        if key is None:
            return self._record(
                self._template(facts), task=task, facts=facts, draft_id=draft_id,
                failure="no_api_key",
            )

        import anthropic

        client = anthropic.Anthropic(api_key=key.get_secret_value())
        content: list[dict[str, Any]] = [
            {
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": data},
            }
            for data, media_type in images
        ]
        content.append({"type": "text", "text": self._user_text(task, facts, instruction)})

        try:
            response = client.messages.parse(
                model=settings.CONTENT_MODEL,
                max_tokens=1500,
                system=SYSTEM_HE,
                messages=[{"role": "user", "content": content}],
                output_format=WrittenContent,
            )
        except anthropic.APIError:
            #: The provider is down, rate-limiting, or refusing. The screen must still open.
            #: Logged as `extra=` by the caller's logger -- never interpolated, and never
            #: carrying the prompt.
            return self._record(
                self._template(facts), task=task, facts=facts, draft_id=draft_id,
                failure="provider_error",
            )

        written = response.parsed_output
        return self._record(
            WrittenContent(body_he=written.body_he, hashtags=written.hashtags),
            task=task,
            facts=facts,
            draft_id=draft_id,
            failure=None,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )

    def _user_text(self, task: str, facts: dict[str, str | int], instruction: str) -> str:
        lines = [f"{key}: {value}" for key, value in sorted(facts.items())]
        return f"סוג התוכן: {task}\n\nעובדות:\n" + "\n".join(lines) + f"\n\nהמשימה:\n{instruction}"

    def _template(self, facts: dict[str, str | int]) -> WrittenContent:
        """The no-model fallback. Not a good post -- a starting point that carries every
        fact, so the owner edits rather than stares at an empty box."""
        return WrittenContent(
            body_he="\n".join(str(value) for value in facts.values()), hashtags=[]
        )

    def _refuse_if_capped(self) -> None:
        month_start = now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        spent = self._session.execute(
            select(func.coalesce(func.sum(ContentGeneration.cost_agorot), 0)).where(
                ContentGeneration.created_at >= month_start
            )
        ).scalar_one()
        if spent >= settings.CONTENT_MONTHLY_CAP_AGOROT:
            raise MonthlyCapReachedError(f"{spent} >= {settings.CONTENT_MONTHLY_CAP_AGOROT}")

    def _record(
        self,
        written: WrittenContent,
        *,
        task: str,
        facts: dict[str, str | int],
        draft_id: uuid.UUID | None,
        failure: str | None,
        input_tokens: int = 0,
        output_tokens: int = 0,
    ) -> Generation:
        model = settings.CONTENT_MODEL
        cost = cost_agorot(model, input_tokens=input_tokens, output_tokens=output_tokens)
        self._session.add(
            ContentGeneration(
                draft_id=draft_id,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_agorot=cost,
                #: Keys, never values. "which facts did the model get" is auditable; "what
                #: were they" is the draft, and it is already stored.
                fact_keys=sorted(facts),
                failure=failure,
            )
        )
        return Generation(
            body_he=written.body_he,
            hashtags=tuple(written.hashtags),
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_agorot=cost,
            failure=failure,
        )
```

- [ ] **Step 4: Run the tests**

```bash
.venv/bin/pytest tests/content/test_model_guard.py -q
```
Expected: 4 passed.

- [ ] **Step 5: Prove it against the real provider, once**

```bash
ANTHROPIC_API_KEY=<key> .venv/bin/python -c "
from app.core.tenancy import TenantSession
from app.services.content.model import ContentModel
# ... open a tenant session for the demo studio, then:
# print(ContentModel(s).write(task='event_post', facts={...}, instruction='...'))
"
```
**Read the Hebrew it comes back with.** Not the token count — the sentences. A writer that
produces grammatical Hebrew nobody would post is a failure this suite cannot see.

- [ ] **Step 6: Commit**

```bash
git add app/services/content/model.py tests/content/test_model_guard.py
git commit -m "feat(content): the model seam — one file, a cap checked before it spends

The only file in the product that talks to Anthropic. The cap is a guard rather than a
budget and is checked BEFORE the call, because a cap checked afterwards has already paid.
'The model never sees a child' is an import test rather than a comment.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task L1.4: The writer — a post from an event, a caption from photographs

**Files:**
- Create: `app/services/content/drafts.py`
- Modify: `app/routers/content.py`
- Create: `tests/content/test_drafts.py`

**Interfaces:**
- Consumes: `ContentModel(session).write(...) -> Generation` and `MonthlyCapReachedError`
  from L1.3; `FilmabilityService` from L1.1; `ContentDraft` from L1-C;
  `Event.title / type / starts_at / location_text / fee_agorot`
  ([app/models/events.py:55](../../../app/models/events.py#L55)); `ObjectStore.get(key)`
  ([app/core/storage.py:78](../../../app/core/storage.py#L78)); `AuditService.record(...)`.
- Produces: `DraftService(session)` with `write_event_post`, `write_photo_caption`,
  `revise`, `edit`, `discard`; `POST /api/v1/content/drafts`,
  `POST /api/v1/content/drafts/{id}/revise`, `PATCH /api/v1/content/drafts/{id}`,
  `POST /api/v1/content/drafts/{id}/discard`, `GET /api/v1/content/drafts`.

### Who may generate, and why a coach may not

`ManagerOrOwner` on every route that calls the model. The spec is explicit — *"Generation
stays owner-or-manager only; the prompter and the brief are open to coaches"* — and the reason
is money, not trust: a coach cannot spend the club's monthly allowance, and the person
accountable for what the club publishes is the person who asked for it. A coach who wants to
write a post writes one by hand in L2.

### The facts each kind is built from

| Kind | Facts handed to the model | Facts deliberately withheld |
|---|---|---|
| `event_post` | `event_title`, `event_type`, `starts_at_local`, `location`, `age_min`, `age_max`, `group_name`, `fee_shekels` | every child's name; anything from `health_declaration`; the consent ledger |
| `photo_caption` | `group_name`, `age_min`, `age_max`, `weekday_local`, `starts_at_local`, `location` + the images | the same, plus **who is in the photographs** — the model is not asked and must not guess |

**`fee_shekels`, not `fee_agorot`.** The model writes for a reader. Handing it `32000` invites
it to write ₪32,000, and a bot that invents a price to a prospective parent has done more
damage than one that says nothing. Convert at the boundary, and only there.

- [ ] **Step 1: Write the failing test**

```python
# tests/content/test_drafts.py
from __future__ import annotations

import uuid

import pytest

from app.models.content import ContentDraft
from app.services.content.drafts import DraftService
from app.services.content.model import MonthlyCapReachedError


def test_an_event_post_is_written_from_the_event_row(tenant_session, an_event: uuid.UUID, fake_model):
    draft = DraftService(tenant_session, model=fake_model).write_event_post(
        event_id=an_event, actor_person_id=None
    )

    assert draft.kind == "event_post"
    assert draft.status == "draft"
    assert draft.event_id == an_event
    #: The facts the model was handed are the event's own, by name.
    assert set(fake_model.last_facts) >= {"event_title", "starts_at_local", "location"}


def test_the_price_reaches_the_model_in_shekels_and_never_in_agorot(
    tenant_session, an_event_with_a_fee: uuid.UUID, fake_model
):
    """Money is stored in agorot and read in shekels. Handing 32000 to a writer invites it
    to publish ₪32,000 to a prospective parent."""
    DraftService(tenant_session, model=fake_model).write_event_post(
        event_id=an_event_with_a_fee, actor_person_id=None
    )

    assert fake_model.last_facts["fee_shekels"] == 120
    assert "fee_agorot" not in fake_model.last_facts


def test_no_child_reaches_the_writer(tenant_session, a_session: uuid.UUID, an_enrolled_student, guardian_of, fake_model):
    guardian_of(an_enrolled_student, granted=True)

    DraftService(tenant_session, model=fake_model).write_photo_caption(
        media_keys=[], session_id=a_session, actor_person_id=None
    )

    handed = " ".join(str(v) for v in fake_model.last_facts.values())
    assert "תלמיד" not in fake_model.last_facts
    for forbidden in ("student", "guardian", "consent", "health"):
        assert not any(forbidden in key for key in fake_model.last_facts)
    assert handed  # the group and the time did reach it


def test_a_photo_caption_carries_the_filmability_report_back(
    tenant_session, a_session: uuid.UUID, an_enrolled_student, guardian_of, fake_model
):
    """The owner is choosing photographs while they read this. The warning has to be on the
    same screen as the choice, not discovered at publishing time."""
    guardian_of(an_enrolled_student, granted=False)

    draft, filmable = DraftService(tenant_session, model=fake_model).write_photo_caption(
        media_keys=[], session_id=a_session, actor_person_id=None
    )

    assert filmable.blocked[0].reason == "declined"


def test_a_revision_is_a_second_call_carrying_the_previous_body(
    tenant_session, an_event: uuid.UUID, fake_model
):
    service = DraftService(tenant_session, model=fake_model)
    draft = service.write_event_post(event_id=an_event, actor_person_id=None)

    service.revise(draft.id, instruction="קצר יותר", actor_person_id=None)

    assert "קצר יותר" in fake_model.last_instruction
    assert fake_model.calls == 2


def test_the_cap_surfaces_rather_than_being_swallowed(tenant_session, an_event, capped_model):
    with pytest.raises(MonthlyCapReachedError):
        DraftService(tenant_session, model=capped_model).write_event_post(
            event_id=an_event, actor_person_id=None
        )
    #: And nothing half-written is left behind.
    assert tenant_session.query(ContentDraft).count() == 0
```

Add `an_event`, `an_event_with_a_fee`, `fake_model` and `capped_model` to
`tests/content/conftest.py`. `fake_model` is a small stub with the same `write(...)` signature
as `ContentModel`, recording `last_facts`, `last_instruction` and `calls` — **a stub rather
than a mock of `anthropic`**, because what is under test is what this service hands over, not
how the SDK is called.

- [ ] **Step 2: Run it and watch it fail**

```bash
.venv/bin/pytest tests/content/test_drafts.py -q
```
Expected: FAIL — `No module named 'app.services.content.drafts'`.

- [ ] **Step 3: Write the service**

`DraftService.__init__(self, session, *, model: ContentModel | None = None)` — the model seam
is injected so the suite never needs a key, and defaults to `ContentModel(session)` in
production.

```python
def write_event_post(self, *, event_id: uuid.UUID, actor_person_id: uuid.UUID | None) -> ContentDraft:
    event = self._session.get(Event, event_id)
    if event is None:
        raise NotFoundError(str(event_id))
    facts = self._event_facts(event)
    generation = self._model.write(
        task="event_post",
        facts=facts,
        instruction=(
            "כתוב פוסט קצר לפייסבוק ולאינסטגרם על האירוע הזה. "
            "שתיים עד ארבע שורות, ותגיות בסוף."
        ),
    )
    draft = ContentDraft(
        kind="event_post",
        status="draft",
        body_he=generation.body_he,
        hashtags=list(generation.hashtags),
        event_id=event_id,
        created_by_person_id=actor_person_id,
    )
    self._session.add(draft)
    self._session.flush()
    AuditService.record(
        self._session,
        action="content.draft_written",
        entity_type="content_draft",
        entity_id=draft.id,
        actor_person_id=actor_person_id,
        #: Field NAMES and the cost. Never the body -- a diff is read by people, and this
        #: one would carry a paragraph on every generation.
        diff={"kind": "event_post", "cost_agorot": generation.cost_agorot},
    )
    return draft
```

`_event_facts` converts `fee_agorot` to `fee_shekels` (`// 100`) and renders `starts_at` in
`Asia/Jerusalem`, reusing `STUDIO_TZ` from `briefs.py` rather than declaring a second zone.
`write_photo_caption` is the same shape, returning `tuple[ContentDraft, FilmabilityReport]`
and loading each `media_key` through the object store into `images`. `revise` re-calls the
model with the previous `body_he` in `facts['previous']` and the correction as the
instruction, then rewrites `body_he` in place.

- [ ] **Step 4: Run the tests**

```bash
.venv/bin/pytest tests/content/test_drafts.py -q
```
Expected: 6 passed.

- [ ] **Step 5: The routes**

All five on `ManagerOrOwner`. `MonthlyCapReachedError` becomes a **429** with
`{"code": "monthly_cap", ...}` so the screen can say *"נגמרה מכסת הכתיבה החודשית"* rather than
showing a generic failure — *refuse rather than accept, when accepting creates a dead end*.

- [ ] **Step 6: Run the whole vertical, lint, typecheck**

```bash
.venv/bin/pytest tests/content -q
.venv/bin/ruff check --fix app && .venv/bin/ruff format app
.venv/bin/mypy app
./scripts/lane-check.sh content
```

- [ ] **Step 7: Commit**

```bash
git add app/services/content/drafts.py app/routers/content.py tests/content \
        web/packages/api-client openapi.json
git commit -m "feat(content): a post from an event, a caption from photographs

§20.4 C. The model phrases; the rows decide. The fee crosses the boundary in shekels
because handing a writer 32000 invites it to publish that number to a parent, and the
caption path hands the filmability report back with the draft so the warning is on the
same screen as the choice of photographs.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task L1.5: The box the owner edits

**Files:**
- Create: `web/apps/staff/src/features/content/DraftBox.tsx`, `DraftBox.test.tsx`,
  `useDraft.ts`
- Modify: `web/apps/staff/src/features/content/contentClient.ts`

**Interfaces:**
- Consumes: the generated `@studio/api-client` bindings for the five draft routes.
- Produces: `<DraftBox draftId={...} />`, mounted from the event screen and the session
  screen.

**Everything lands in a box you edit.** Nothing here posts, and there is no button that
looks like it might.

- [ ] **Step 1: Write the failing tests**

```tsx
const writeText = vi.fn().mockResolvedValue(undefined)
Object.assign(navigator, { clipboard: { writeText } })

it('copies the body, and says so', async () => {
  server.use(draft({ id: 'd1', body_he: 'בחינות חגורות ביום שלישי', hashtags: ['ג׳ודו'] }))
  render(<DraftBox draftId="d1" />)

  await userEvent.click(await screen.findByTestId('draft-copy'))

  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('בחינות חגורות'))
  expect(await screen.findByText('הועתק')).toBeInTheDocument()
})

it('replaces the body with the revision, and never blanks the box first', async () => {
  server.use(draft({ id: 'd1', body_he: 'הנוסח הראשון' }), reviseReturns({ body_he: 'קצר' }))
  render(<DraftBox draftId="d1" />)
  const box = await screen.findByTestId('draft-body')

  await userEvent.type(screen.getByTestId('draft-correction'), 'קצר יותר')
  await userEvent.click(screen.getByTestId('draft-revise'))

  // Never empty in between: a box that blanks while it thinks looks like lost work, and
  // the owner retypes what the model was about to hand back.
  expect(box).not.toHaveValue('')
  await waitFor(() => expect(box).toHaveValue('קצר'))
})

it('says the month is spent rather than failing silently', async () => {
  server.use(draft({ id: 'd1', body_he: 'הנוסח הראשון' }), reviseReturns429({ code: 'monthly_cap' }))
  render(<DraftBox draftId="d1" />)

  await userEvent.click(await screen.findByTestId('draft-revise'))

  expect(await screen.findByText('נגמרה מכסת הכתיבה החודשית. אפשר לכתוב ידנית.')).toBeInTheDocument()
  // And the work survives the refusal.
  expect(screen.getByTestId('draft-body')).toHaveValue('הנוסח הראשון')
})

it('says the writer is unavailable when what came back was a template', async () => {
  server.use(draft({ id: 'd1', body_he: 'בחינות חגורות', failure: 'no_api_key' }))
  render(<DraftBox draftId="d1" />)

  expect(await screen.findByText('הכתיבה האוטומטית אינה זמינה כרגע. הטקסט למטה הוא תבנית.')).toBeInTheDocument()
  // Still editable. A template the owner can fix beats a blank page, which is the whole
  // problem this feature exists to solve.
  expect(screen.getByTestId('draft-body')).toBeEnabled()
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd web && npx vitest run apps/staff/src/features/content/DraftBox.test.tsx --reporter=dot
```

- [ ] **Step 3: Build it**

A `<textarea dir="rtl">` holding `body_he`, the hashtags as removable chips beneath it, a
copy button, a one-line correction field with a **תיקון** button, and a discard control that
asks for one of the four `CONTENT_DISCARD_REASONS`. No publish button, no share sheet, no
"post to Facebook" — those arrive in L3 and pretending otherwise now teaches the wrong habit.

- [ ] **Step 4: Run the tests and the lane check**

```bash
cd web && npx vitest run apps/staff/src/features/content --reporter=dot && cd ..
./scripts/lane-check.sh content
```

- [ ] **Step 5: Look at it, on a phone**

Open the staff app at phone width, generate a real post from a real event, read the Hebrew,
correct it once, and copy it out. *If it renders, render it and look.*

- [ ] **Step 6: Commit**

```bash
git add web/apps/staff/src/features/content web/packages/i18n
git commit -m "feat(content): the box the owner edits, and nothing that looks like publish

§20.4 C's last sentence: everything lands in a box you edit. The month-spent and
writer-unavailable states are on screen rather than in a console, because a screen that
fails silently sends the owner back to a blank page — which is the problem this feature
exists to solve.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task L1.6: The voice gate — listen before paying

**Not code. Half an hour, and it decides ~3 days of work and $22/month.**

Hebrew text-to-speech is good enough to publish and still misplaces stress, and it struggles
with exactly what Israeli speech does constantly: switching between Hebrew and English
mid-sentence. A judo club adds a third layer — אוצ'י-גארי, איפון, רנדורי are Japanese words
inside Hebrew sentences, which is the hardest case there is.

- [ ] Open an ElevenLabs account on the **$6 tier** and make the **quick clone** from L0.4's
      recording. Do not buy Creator yet.
- [ ] Synthesise **one real script** — the one with the Japanese technique names in it.
- [ ] **Listen to it on a phone speaker**, not headphones. That is where a parent will hear it.
- [ ] Decide, and write the answer into this file:
  - **Pass** → L1.7 is built, and the Creator tier ($22/month) is bought at that point and
    not before.
  - **Fail** → L1.7 is cut. The shot brief's script (L1.2) is already the thing the owner
    reads aloud themselves, and nothing else in the plan changes.

> **Two rules that hold either way.** It narrates content, never correspondence — nothing
> about a payment, a health declaration or a specific child is ever spoken by a machine
> wearing the owner's voice. And when a clip is voiced rather than recorded, the club should
> be comfortable saying so if asked: parents know what the owner sounds like, and a synthetic
> voice discovered is worse than one disclosed.

---

## Task L1.7: Narration — **only if L1.6 passed**

**~3 days. Skip this task entirely if the gate failed.**

**Files:**
- Create: `app/integrations/elevenlabs/__init__.py`, `app/integrations/elevenlabs/tts.py`
- Modify: `app/services/content/drafts.py`, `app/routers/content.py`, `app/core/config.py`
- Create: `tests/content/test_narration.py`

**Interfaces:**
- Consumes: `ObjectStore.put(key, data, content_type=...)`; `ContentDraft.body_he`.
- Produces: `POST /api/v1/content/drafts/{id}/narrate` → an object key;
  `GET /api/v1/content/drafts/{id}/audio` → the MP3.
  `settings.ELEVENLABS_API_KEY`, `settings.ELEVENLABS_VOICE_ID` — both
  `SecretStr | None` / `str | None`, both defaulting to off.

Three things this task must get right, each of which has bitten somebody:

1. **A cap, as in L1.3.** Characters, not tokens. About a minute of speech is ~1,000
   characters and the plan carries roughly two hours a month; a loop that re-narrates on every
   edit would eat that in an afternoon.
2. **Storage is a 4.9 GB Railway volume** ([app/core/storage.py](../../../app/core/storage.py)),
   currently 0.1 GB used. A one-minute MP3 is ~1 MB, so twenty a month is fine — but nothing
   here may store video, and old narrations should be purgeable.
3. **It narrates `body_he` and nothing else.** No route may hand it arbitrary text. That is
   the mechanical form of "content, never correspondence".

- [ ] Write `tests/content/test_narration.py` first: the cap refuses before calling; an unset
      key returns 503 with a named code rather than crashing; the object key is namespaced per
      studio; and a narration request for a draft in another studio 404s.
- [ ] Build it, run the suite, and **listen to the output once more** before committing.

---

## Level 1 exit gate

- [ ] `./scripts/lane-check.sh content` green.
- [ ] A coach opens a real session in the staff app and is told, by name, who to keep out of
      frame — with "nobody asked" and "the parent said no" reading differently.
- [ ] The owner generates a post from a real event, corrects it once, and copies it out, in
      under a minute, on a phone.
- [ ] `SELECT sum(cost_agorot) FROM content_generation` after a week of real use is a number
      the owner is comfortable reading aloud.
- [ ] The voice question has a written answer.

---

# Level 2 — The approval loop, over push

**~4 days.** §20.5.3's state machine, and the spec is explicit about the order: *"The expensive
half of this is not WhatsApp, it is the state machine: draft → sent for approval →
corrections → revised → approved → published, with nothing leaving that flow unapproved. Push
notifications have been live since 2026-09-13, so that state machine plus an in-app
approve/revise screen works today, costs nothing, and needs no Meta account at all."*

**Nothing published, still.** L2 ends with a draft marked `approved` and the owner copying it
out. What L2 buys is the machine — so that when L3 arrives, WhatsApp and the Graph API are
**transports plugged into a working loop**, not a rebuild.

**No migration.** `content_draft` already carries all four statuses (L1-C, deliberately).

## File structure

| File | Responsibility |
|---|---|
| `app/services/content/lifecycle.py` | The single writer of `content_draft.status`. Nothing else may assign it. |
| `app/services/content/transports.py` | Where an approval request goes. `push` today; `whatsapp` in L3. |
| `web/apps/staff/src/features/content/ApprovalQueue.tsx` | The manager's list of drafts awaiting a yes. |

---

## Task L2.1: The lifecycle — one writer, and a coach who may draft but not approve

**Files:**
- Create: `app/services/content/lifecycle.py`
- Modify: `app/routers/content.py`, `app/services/content/drafts.py`
- Create: `tests/content/test_lifecycle.py`

**Interfaces:**
- Consumes: `ContentDraft`, `CONTENT_DRAFT_STATUSES`, `CONTENT_DISCARD_REASONS` from L1-C;
  `AuditService.record(...)`; `app.core.clock.now()`.
- Produces:
  `DraftLifecycle(session).submit(draft_id, *, actor_person_id) -> ContentDraft`,
  `.approve(draft_id, *, actor_person_id)`, `.send_back(draft_id, *, actor_person_id)`,
  `.discard(draft_id, *, reason, actor_person_id)`;
  `IllegalTransitionError`; `TRANSITIONS: dict[str, frozenset[str]]`.

### The graph, written down rather than implied

```
draft ──submit──> pending_approval ──approve──> approved
  │                     │  ▲                        │
  │                     │  └────── send_back ───────┘   (a manager who changed their mind)
  │                     │
  └──discard──> discarded <──discard──┘
```

Modelled on [app/services/people/status.py](../../../app/services/people/status.py) — the
house's existing single-writer transition graph. Two rules it inherits and one it adds:

1. **One writer.** No other module assigns `content_draft.status`. A status set in a router is
   a status nothing audits.
2. **Every transition is audited**, with the action and the actor — never the body.
3. **`approve` is `ManagerOrOwner`, and it is the only gate in the vertical that matters.**
   §20.4's review gate: *"a coach can draft and record; only an owner or manager can mark
   something ready to publish. Not because coaches are careless, but because the consent
   question has to be answered by the person who is accountable for it."*

- [ ] **Step 1: Write the failing test**

```python
# tests/content/test_lifecycle.py
from __future__ import annotations

import pytest

from app.models.audit import AuditLog
from app.services.content.lifecycle import DraftLifecycle, IllegalTransitionError


def test_the_happy_path_walks_draft_to_approved(tenant_session, a_draft, a_manager_person):
    lifecycle = DraftLifecycle(tenant_session)

    lifecycle.submit(a_draft.id, actor_person_id=a_manager_person)
    assert a_draft.status == "pending_approval"

    lifecycle.approve(a_draft.id, actor_person_id=a_manager_person)
    assert a_draft.status == "approved"
    assert a_draft.approved_by_person_id == a_manager_person
    assert a_draft.approved_at is not None


def test_a_draft_cannot_skip_the_queue(tenant_session, a_draft, a_manager_person):
    """Approving straight from `draft` would make the review gate optional, which is the one
    property this graph exists to guarantee."""
    with pytest.raises(IllegalTransitionError):
        DraftLifecycle(tenant_session).approve(a_draft.id, actor_person_id=a_manager_person)


def test_an_approved_draft_cannot_be_approved_twice(tenant_session, a_draft, a_manager_person):
    lifecycle = DraftLifecycle(tenant_session)
    lifecycle.submit(a_draft.id, actor_person_id=a_manager_person)
    lifecycle.approve(a_draft.id, actor_person_id=a_manager_person)

    with pytest.raises(IllegalTransitionError):
        lifecycle.approve(a_draft.id, actor_person_id=a_manager_person)


def test_a_manager_may_send_it_back_rather_than_discard_it(tenant_session, a_draft, a_manager_person):
    """'Not yet' and 'never' are different answers. A loop with only the second one makes a
    manager approve things they do not like."""
    lifecycle = DraftLifecycle(tenant_session)
    lifecycle.submit(a_draft.id, actor_person_id=a_manager_person)

    lifecycle.send_back(a_draft.id, actor_person_id=a_manager_person)

    assert a_draft.status == "draft"


def test_a_discard_needs_a_reason_from_the_vocabulary(tenant_session, a_draft, a_manager_person):
    with pytest.raises(ValueError):
        DraftLifecycle(tenant_session).discard(
            a_draft.id, reason="לא אהבתי", actor_person_id=a_manager_person
        )


def test_every_transition_is_audited_and_the_diff_never_carries_the_body(
    tenant_session, a_draft, a_manager_person
):
    lifecycle = DraftLifecycle(tenant_session)
    lifecycle.submit(a_draft.id, actor_person_id=a_manager_person)
    lifecycle.approve(a_draft.id, actor_person_id=a_manager_person)

    entries = tenant_session.query(AuditLog).filter(AuditLog.entity_type == "content_draft").all()
    assert [e.action for e in entries][-2:] == ["content.submitted", "content.approved"]
    for entry in entries:
        assert a_draft.body_he not in str(entry.diff)
```

- [ ] **Step 2: Run it and watch it fail**

```bash
.venv/bin/pytest tests/content/test_lifecycle.py -q
```
Expected: FAIL — `No module named 'app.services.content.lifecycle'`.

- [ ] **Step 3: Write the lifecycle**

```python
# app/services/content/lifecycle.py
"""The single writer of `content_draft.status`.

Same shape and the same reason as app/services/people/status.py: a status assigned in a
router is a status nothing audits, and a graph written down is a graph a reader can check
against the screen.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session as OrmSession

from app.core.clock import now
from app.models.content import CONTENT_DISCARD_REASONS, ContentDraft
from app.services.audit import AuditService

#: from -> the statuses it may become. Absent key or absent member is a refusal.
TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"pending_approval", "discarded"}),
    "pending_approval": frozenset({"approved", "draft", "discarded"}),
    "approved": frozenset({"discarded"}),
    "discarded": frozenset(),
}


class IllegalTransitionError(ValueError):
    """Refused rather than accepted. A write that succeeds and then fails a downstream check
    leaves the manager repeating themselves with nothing to read."""


class DraftNotFoundError(LookupError):
    """Named apart from `app.services.attendance.errors.NotFoundError`, which this
    vertical's router already catches: one router catching two different classes with one
    name is how the wrong 404 gets returned."""


class DraftLifecycle:
    def __init__(self, session: OrmSession) -> None:
        self._session = session

    def submit(self, draft_id: uuid.UUID, *, actor_person_id: uuid.UUID | None) -> ContentDraft:
        return self._move(draft_id, "pending_approval", "content.submitted", actor_person_id)

    def approve(self, draft_id: uuid.UUID, *, actor_person_id: uuid.UUID | None) -> ContentDraft:
        draft = self._move(draft_id, "approved", "content.approved", actor_person_id)
        draft.approved_by_person_id = actor_person_id
        draft.approved_at = now()
        return draft

    def send_back(self, draft_id: uuid.UUID, *, actor_person_id: uuid.UUID | None) -> ContentDraft:
        return self._move(draft_id, "draft", "content.sent_back", actor_person_id)

    def discard(
        self, draft_id: uuid.UUID, *, reason: str, actor_person_id: uuid.UUID | None
    ) -> ContentDraft:
        if reason not in CONTENT_DISCARD_REASONS:
            raise ValueError(f"unknown discard reason: {reason}")
        draft = self._move(draft_id, "discarded", "content.discarded", actor_person_id)
        draft.discard_reason = reason
        return draft

    def _move(
        self, draft_id: uuid.UUID, to: str, action: str, actor_person_id: uuid.UUID | None
    ) -> ContentDraft:
        draft = self._session.get(ContentDraft, draft_id)
        if draft is None:
            raise DraftNotFoundError(str(draft_id))
        if to not in TRANSITIONS.get(draft.status, frozenset()):
            raise IllegalTransitionError(f"{draft.status} -> {to}")
        previous, draft.status = draft.status, to
        AuditService.record(
            self._session,
            action=action,
            entity_type="content_draft",
            entity_id=draft.id,
            actor_person_id=actor_person_id,
            #: Statuses and nothing else. The body is a paragraph, and a diff is read by
            #: people.
            diff={"from": previous, "to": to},
        )
        return draft
```

- [ ] **Step 4: Run the tests**

```bash
.venv/bin/pytest tests/content/test_lifecycle.py -q
```
Expected: 6 passed.

- [ ] **Step 5: The manual-draft route, so a coach has a way in**

```python
# app/routers/content.py
class ManualDraftIn(BaseModel):
    kind: str
    body_he: str = Field(min_length=1, max_length=4000)
    session_id: uuid.UUID | None = None
    event_id: uuid.UUID | None = None


@router.post("/drafts/manual", response_model=DraftOut, status_code=201)
def write_manual_draft(
    _: AnyStaff, body: ManualDraftIn, request: Request, session: TenantSessionDep
) -> DraftOut:
    """A coach writing by hand. **AnyStaff, and it calls no model** — the review gate is
    about who is accountable for what the club publishes; the ManagerOrOwner gate on
    /drafts is about who may spend the club's monthly allowance. Two different questions,
    two different routes, rather than one route with a permission fork inside it."""
```

Then `POST /drafts/{id}/submit` (`AnyStaff`), `POST /drafts/{id}/approve` (`ManagerOrOwner`),
`POST /drafts/{id}/send-back` (`ManagerOrOwner`), `POST /drafts/{id}/discard`
(`ManagerOrOwner`). `IllegalTransitionError` → **409** with a named code, never 500.

- [ ] **Step 6: Route tests, including the refusals**

```python
def test_a_coach_may_submit_but_may_not_approve(client, as_lead_coach, a_pending_draft):
    approve = client.post(
        f"/api/v1/content/drafts/{a_pending_draft}/approve", headers=as_lead_coach.headers
    )
    assert approve.status_code == 403, approve.text


def test_approving_twice_is_a_409_that_names_the_reason(client, as_manager, a_pending_draft):
    first = client.post(f"/api/v1/content/drafts/{a_pending_draft}/approve", headers=as_manager.headers)
    assert first.status_code == 200
    second = client.post(f"/api/v1/content/drafts/{a_pending_draft}/approve", headers=as_manager.headers)
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "illegal_transition"
```

- [ ] **Step 7: Run, lint, typecheck, commit**

```bash
.venv/bin/pytest tests/content -q
.venv/bin/ruff check --fix app && .venv/bin/ruff format app && .venv/bin/mypy app
git add app/services/content/lifecycle.py app/routers/content.py tests/content \
        web/packages/api-client openapi.json
git commit -m "feat(content): one writer for a draft's status, and a coach who may draft but not approve

§20.5.3's state machine, and §20.4's review gate. Two routes rather than one with a
permission fork: /drafts asks who may spend the club's allowance, /drafts/manual asks
who may write — and only approve asks who is accountable for what the club publishes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task L2.2: The transport seam — push today, WhatsApp later

**Files:**
- Create: `app/services/content/transports.py`
- Modify: `app/services/content/lifecycle.py`
- Create: `tests/content/test_transports.py`

**Interfaces:**
- Consumes: `NotificationFanOut(session).enqueue(person_id, kind, title, body, payload)`
  ([app/services/comms/notifications.py:61](../../../app/services/comms/notifications.py#L61));
  `RoleAssignment.role / revoked_at`.
- Produces: `ApprovalTransport` (Protocol) with
  `request(draft: ContentDraft, *, recipients: Sequence[uuid.UUID]) -> None`;
  `PushApprovalTransport`; `approval_transport() -> ApprovalTransport`.

### Why this is a seam and not three lines in `lifecycle.py`

Because L3 adds WhatsApp, and the spec's whole argument for shipping push first is that the
WhatsApp half then becomes *"a transport, not a rebuild"*. A `Protocol` with one method costs
almost nothing today and is what makes that sentence true later. The same shape
`app/services/comms/push.py` already uses for `WebPushSender` / `RecordingPushSender`.

### The notification kind, and why it is ungoverned

`content.pending_approval`. The prefix `content` has no entry in `_GROUP_BY_PREFIX`
([app/services/comms/kinds.py](../../../app/services/comms/kinds.py)), so `group_for` returns
`None` and the notification is **ungoverned rather than muted** — which is exactly right: this
is a staff workflow notification to the person who runs the club, and there is no parent
preference screen it belongs on. Adding a `content` entry would give a manager a switch whose
only effect is to hide their own queue from themselves.

- [ ] **Step 1: Write the failing test**

```python
def test_submitting_asks_every_manager_and_owner_for_a_yes(tenant_session, a_draft, two_managers, a_coach_person):
    DraftLifecycle(tenant_session).submit(a_draft.id, actor_person_id=a_coach_person)

    notifications = tenant_session.query(Notification).all()
    assert {n.person_id for n in notifications} == set(two_managers)
    assert {n.kind for n in notifications} == {"content.pending_approval"}


def test_the_notification_carries_the_draft_id_and_not_the_draft(tenant_session, a_draft, two_managers, a_coach_person):
    """A push payload travels to a browser's push service. It carries an id to open, never
    the club's unpublished copy."""
    DraftLifecycle(tenant_session).submit(a_draft.id, actor_person_id=a_coach_person)

    note = tenant_session.query(Notification).first()
    assert note.payload["draft_id"] == str(a_draft.id)
    assert a_draft.body_he not in str(note.payload)


def test_a_revoked_manager_is_not_asked(tenant_session, a_draft, a_revoked_manager, a_coach_person):
    DraftLifecycle(tenant_session).submit(a_draft.id, actor_person_id=a_coach_person)

    assert tenant_session.query(Notification).count() == 0


def test_approval_never_notifies_anybody(tenant_session, a_pending_draft, a_manager_person):
    """The loop ends at the person who pressed the button. A notification confirming your
    own tap is noise, and §5.11's channel rules are not a suggestion."""
    before = tenant_session.query(Notification).count()
    DraftLifecycle(tenant_session).approve(a_pending_draft.id, actor_person_id=a_manager_person)
    assert tenant_session.query(Notification).count() == before
```

- [ ] **Step 2: Run it and watch it fail** — `No module named 'app.services.content.transports'`.

- [ ] **Step 3: Write the transport**

`ApprovalTransport` as a `typing.Protocol`; `PushApprovalTransport` wrapping
`NotificationFanOut`; `approval_transport()` returning the push one today and reading a
setting in L3. `DraftLifecycle.submit` resolves the recipients (every un-revoked
`owner`/`manager` `RoleAssignment` in the studio) and calls it **after** the status has moved,
so a transport that raises cannot leave a draft that looks submitted and was never sent.

- [ ] **Step 4: Run the tests, then prove it on a real device**

```bash
.venv/bin/pytest tests/content/test_transports.py -q
```

Then submit a real draft on staging and **watch the phone**. `app/services/comms/push.py`'s
transport is verified end to end up to the wire; the last hop still needs a device, and this
is a good excuse to close that.

- [ ] **Step 5: Commit**

```bash
git add app/services/content/transports.py app/services/content/lifecycle.py \
        tests/content/test_transports.py
git commit -m "feat(content): approval asks over push, behind a seam WhatsApp can plug into

§20.5.3 ships push first on purpose: the state machine is the expensive half, push has
been live since 2026-09-13, and doing it this way makes the WhatsApp half a transport
rather than a rebuild. content.* is an ungoverned prefix — a manager should not be able
to mute their own queue.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task L2.3: The approval queue

**Files:**
- Create: `web/apps/staff/src/features/content/ApprovalQueue.tsx`, `ApprovalQueue.test.tsx`
- Modify: `web/apps/staff/src/features/content/contentClient.ts`, the staff app's routing
- Modify: `web/packages/i18n/{he,en,ru}/content.ts`

**Interfaces:**
- Consumes: `GET /api/v1/content/drafts?status=pending_approval` and the four transition
  routes from L2.1.
- Produces: the queue screen, reachable from the push notification's tap (the service worker
  routes on the notification's `kind` — `app/services/comms/push.py` already puts it on the
  wire, which is the only thing a worker with no session can route a tap on).

- [ ] **Step 1: Write the failing tests**

```tsx
it('opens straight to the draft the notification was about', async () => {
  // A tap that lands on a list is a tap that costs a search, on a phone, at 21:40.
  server.use(pendingDrafts([{ id: 'd1', body_he: 'ראשון' }, { id: 'd2', body_he: 'שני' }]))
  renderAt('/content/drafts/d2')

  expect(await screen.findByTestId('draft-body')).toHaveValue('שני')
})

it('offers approve, send back, and discard with a reason — and nothing that publishes', async () => {
  render(<ApprovalQueue />)
  expect(await screen.findByTestId('draft-approve')).toBeInTheDocument()
  expect(screen.getByTestId('draft-send-back')).toBeInTheDocument()
  expect(screen.queryByTestId('draft-publish')).not.toBeInTheDocument()
})

it('shows a coach their own submitted draft without an approve button', async () => {
  // the same screen, two roles, one truth
})
```

- [ ] **Step 2: Run them, watch them fail, build the screen, run them again**

```bash
cd web && npx vitest run apps/staff/src/features/content/ApprovalQueue.test.tsx --reporter=dot
```

- [ ] **Step 3: Look at it, and walk the whole loop by hand**

Coach writes a draft by hand on one device → owner's phone buzzes → owner opens the tap,
reads the Hebrew, sends it back with a correction → coach fixes it and resubmits → owner
approves → owner copies it out and posts it to Instagram themselves. **That round trip is
Level 2's entire deliverable**, and it is worth doing once with two real phones before
calling it done.

- [ ] **Step 4: Lane check and commit**

```bash
./scripts/lane-check.sh content
git add web/apps/staff/src/features/content web/packages/i18n
git commit -m "feat(content): the manager's queue — approve, send back, or say why not

Level 2's whole deliverable is the round trip: a coach submits, the owner's phone buzzes,
the owner corrects it and approves. Nothing publishes, and there is deliberately no
button that looks like it might.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Level 2 exit gate

- [ ] `./scripts/lane-check.sh content` green.
- [ ] The full round trip walked on two real devices, with a real push arriving on a real
      phone — closing the one thing `state.yaml`'s push heartbeat says is still unproven.
- [ ] A draft cannot reach `approved` without passing `pending_approval`, proven by a test
      rather than by trying.
- [ ] `docs/plan/state.yaml` ticked in the same commit as the work.

---

# Level 3 — Meta: publish, and be found

**~8 days of code, plus a review queue nobody controls.** Steps and gates only. Task-level
detail is written when the gate opens, deliberately: the App Review outcome, the permissions
actually granted, and the Graph API version in force at that moment all change what gets
written, and a task written today against `v21.0` would be rewritten before it was executed.

### Entry gate — all four, no exceptions

- [ ] Business verification **approved** (runbook M2).
- [ ] The Page claimed, Instagram converted to Business **and linked**, with
      `instagram_business_account` visible on the Page in the Graph API Explorer (M3, M4).
- [ ] A system user with a **permanent** token holding the eleven permissions (M7).
- [ ] **App Review passed** (M9). Not submitted — passed.

### The steps

| | Step | Shape | Days |
|---|---|---|---|
| **L3.1** | `app/integrations/meta/` — the client seam. `httpx` (already a dependency), a `MetaClient` that fails closed on unset config exactly as `ContentModel` does, and a recording fake for the suite | ~1 |
| **L3.2** | Publishing: a **two-step container upload** per image or video, for a feed post, a Reel and a Story. Tedious, well-documented, and it breaks on Meta's schedule rather than ours | ~3 |
| **L3.3** | **The consent hard gate.** `approved → published` refuses when the draft's session has a blocked student and the manager has not attested that no blocked child appears in the media. A clip with an unconsented child must be **blocked at the point of posting, not caught afterwards** | ~1 |
| **L3.4** | **The red light.** An `app/services/ops/checks.py` signal on *last successful delivery*, not on a hope. A lapsed page token stops publishing and stops lead delivery **with no error on screen** | ~1 |
| **L3.5** | WhatsApp as a second `ApprovalTransport` (L2.2's Protocol). Manager-initiated, so every message in the exchange is free. Inbound webhook patterned on [app/routers/webhooks.py](../../../app/routers/webhooks.py) | ~2 |
| **L3.6** | Meta lead forms → `Student.status='lead'` via the existing funnel. **Meta keeps lead data 90 days only** — an integration that stops quietly destroys leads rather than delaying them | ~1 |
| **L3.7** | The first Click-to-WhatsApp campaign (runbook M11). Owner, not code | — |

### The five things that will bite, named before they do

1. **A user token instead of a system user token.** Works for 60 days, then stops silently.
2. **App Review can be rejected.** It is a person watching a screencast. Budget one
   resubmission and promise nobody a date before it clears.
3. **Photographs of children pass through Meta's servers** when a draft travels over
   WhatsApp. The owner would almost certainly send them there anyway — but §11 makes this a
   decision to write down, not one to let happen by default. **Open question 16.**
4. **No marketing templates to parents, ever.** Per-message, unignorable, and it gets a
   number reported. Club announcements already reach an app the family chose to install.
5. **`X-Hub-Signature-256` is computed over raw bytes.** Prove it with a payload whose
   re-serialisation differs (key order, whitespace) and which must still verify — the exact
   test [`2026-09-08-whatsapp-bot-design.md` §14](../specs/2026-09-08-whatsapp-bot-design.md)
   already specifies.

### Contract commit for L3 (on `main`, before the steps)

One alembic revision for `whatsapp_number`, `whatsapp_conversation`, `whatsapp_message` and
`content_publication`; the four `WHATSAPP_*` settings plus the five `META_*` ones in
`app/core/config.py`; `infra/railway/jobs.json` entries for `whatsapp-replies` (every minute)
and `content-publish`, each with its `max_silence_minutes` and `why`. **Remember the cron is
UTC** — `jobs.json`'s own `$comment` says so and four production jobs still fire three hours
late because somebody read the `why:` instead.

### Exit gate

- [ ] A post the owner approved in the staff app appears on the Page and on Instagram.
- [ ] `/ops` turns **red** within one cycle when the token is revoked, tested by revoking it.
- [ ] A lead form submission becomes a `Student` with `status='lead'` and enters
      `app/workers/followups.py`'s ladder.
- [ ] An approval round trip completed entirely in WhatsApp, at zero cost.

---

# Level 4 — The lead bot

**~5 days.** The right-hand half of the loop already exists: `POST /trial-bookings/self`
([app/routers/trial_bookings.py:155](../../../app/routers/trial_bookings.py#L155)),
`GET /public/groups/{id}/trial-slots`
([app/routers/public.py:492](../../../app/routers/public.py#L492)), §5.4a's funnel and the
day-1/3/7 ladder all run today. L4 adds a door, not a pipeline.

### Entry gate — one number, and it is countable

- [ ] **How many strangers messaged the club's number last month?** Nobody has counted, and
      the spec is blunt about why it matters: *"At four enquiries a month, this bot will hold
      about four conversations… a week of work for four conversations is not a good trade, and
      this document has cut other things for less."* It earns its place **only** if L0.3 and
      L3.7 widened the funnel. Count first. If the answer is still four, do not build it.

### The steps

| | Step | Shape | Days |
|---|---|---|---|
| **L4.1** | **The script, written once, pointed at either transport** — exactly as the approval loop is. Build the on-page assistant first: it needs no Meta account and it is testable in the suite | ~2 |
| **L4.2** | The four questions. Name (typed) · age (a list of five bands — WhatsApp allows three buttons, so it is a list) · slot (from the real endpoint, capped at ten by WhatsApp; the next three are enough) · parent's name (typed, last, once they are committed). **The phone number is never asked** — it is the number they are messaging from | ~1 |
| **L4.3** | The same script over WhatsApp, behind L3.5's transport | ~1 |
| **L4.4** | The escape hatch, the price answers, the declaration link | ~1 |

### The four rules inside it, from §20.6

1. **It writes as it goes, never at the end.** This is the one rule the on-page version must
   not break. The trial page was rebuilt on 2026-09-08 for exactly this: the booking used to
   be written last, so a parent who filled everything in and abandoned at the final step left
   the club nothing. A chat is four steps — **create the lead the moment it has a name and a
   way to reach them**, and enrich it afterwards.
2. **An escape hatch on the first message.** *לדבר עם מאמן* hands the conversation to a human
   and stops the bot. A parent who wants a person and cannot find one is a parent who leaves.
3. **It books, then says what is still missing.** The booking is real the moment the slot is
   tapped; the declaration does not gate it, and
   [app/workers/health_reminders.py](../../../app/workers/health_reminders.py) already chases
   exactly the `health_status='missing'` state `TrialService` writes. But the message must say
   plainly that the mat needs it first — that is §5.5, a safety rule and not paperwork.
4. **It never quotes a price it was not given.** *מחירים ושעות* answers from `price_plan`
   rows. A bot that invents 320 shekels to a prospective parent has done more damage than one
   that says nothing.

### Two constraints that shape the architecture rather than decorate it

- **Meta bans open-ended AI assistants on WhatsApp from 15 January 2026**, and **explicitly
  permits structured booking and appointment bots.** So this is a booking flow, not a chat
  assistant — which is what the product should have chosen anyway. **The model may phrase, and
  may interpret. It must never decide a fact.** *"בן 7"* → age 7 is interpretation and is
  fine; the price, the age range, the address and the lesson time come from rows.
- **Nobody can sign inside a chat.** A health declaration needs a drawn signature
  (`signature_image_base64`, and the accessibility statement is explicit that it is drawn with
  a finger or a mouse and no other way). The booking does not require one, so: bot books →
  one link to the declaration → the existing worker chases it → and the child does not step
  onto the mat until it is signed.

### Privacy, which is not optional here

The bot collects **a child's name and age from a stranger, over Meta's infrastructure** —
personal data about a minor, arriving from a third party, before anyone at the club has agreed
to receive it. `registration_request.payload_encrypted` exists for precisely this case (§4.3:
*"the one table holding data nobody in the studio has yet agreed to receive, so it is the one
that cannot sit in plaintext"*). The conversation's collected answers belong behind the same
boundary, **G7 applies without exception — the message contents never reach a log** — and a
lead that never books must be purgeable on §11.4's schedule like any other subject data.

### Exit gate

- [ ] A stranger messages the club's number and comes out with a real `TrialBooking`, a real
      `Student` and a real `Guardian`, inside the tenant scope.
- [ ] That booking appears in §5.4a's funnel and is chased by the same day-1/3/7 worker as a
      landing-page booking, with nothing special-cased for the bot.
- [ ] The whole conversation cost **₪0**, verified against the message log.
- [ ] *לדבר עם מאמן* stops the bot and a human answers.

---

# What is still open

Four questions the spec left open and this plan does not close. Each is cheap, and each
belongs to the owner rather than to an engineer.

| # | Question | Decided by | Costs |
|---|---|---|---|
| 14 | **Which captioning tool, if any?** One real clip through one of Sonix / VEED / Flixier / Submagic / Filmora | L0.5 | ten minutes, and it decides three days |
| 16 | **Does the club accept photographs of children passing through Meta's servers?** | before L3.5 | a decision, not a build |
| 17 | **How many strangers messaged the club's number last month?** | before L4 | a count nobody has taken |
| — | **Does the cloned voice survive Japanese technique names inside Hebrew sentences?** | L1.6 | $6 and half an hour |

**Question 15 is closed by this plan's shape**: the Meta Business portfolio is needed for L3
and L4 and for nothing else, so L0.2 starts it on day one and L1 and L2 never wait on it.

---

# Executing this plan

**Levels 0, 1 and 2 are executable as written.** Each task's steps are self-contained and each
ends at a commit.

**Levels 3 and 4 need a second pass before execution** — their task detail is written when
their entry gate opens, for the reason stated at the top of L3.

Two standing rules from `CLAUDE.md` that this plan leans on and that an executor must not
drop:

- **Tick the piece in `docs/plan/state.yaml` in the same commit as the work.** A piece
  finished but not ticked is progress nobody can see. Never write anything measurable there.
- **Never finish a session with a piece deliberately left undone.** When something is blocked
  on a decision only the owner can make — a number, a business rule, a choice between two
  shapes — **ask with the question tool and then finish it.** A blocker is a question, not a
  status.
