# Object storage and the studio setup wizard — design

**Date:** 2026-08-25
**Status:** Approved for planning. No implementation has started.
**Covers:** M1.8 (the object-storage seam) and M1.9 (the §5.1 setup wizard).
**Canvas:** artboards `5c` (אשף · שלב 1 — פרטי מועדון) and `5f` (אשף · שלב 6 — סיום והזמנת הורים).

---

## 1. Why these two are one document

The wizard's first step is drawn with a 512×512 logo drop-zone. `studio.logo_object_key`
has existed since M0 as a **pointer** — a text column meant to hold something like
`studios/{id}/logo.png` — and nothing in this repository has ever been the thing it points
at. There is no storage service, no bucket, no upload endpoint and no code that accepts a
file.

That is not a wizard problem. `object_key` appears **six times** across SPEC §4.3:

| Field | Owner | What it points at |
|---|---|---|
| `studio.logo_object_key` | M1 | the club's logo |
| `person.photo_object_key` | M1/M3 | a person's photo |
| `health_form_template.source_pdf_object_key` | M4 | the manager's own PDF, per **D11** |
| `health_declaration.pdf_object_key` | M4 | the signed declaration |
| `data_export_request.object_key` | M9 | a completed subject-access export (§11) |

So the seam is a shared capability the spec assumes repeatedly and no milestone ever
scoped. M1.8 builds it once; the logo is merely its first customer. Building it *inside*
the wizard would hide a cross-cutting mechanism inside a feature, which is exactly what
`app/core/clock.py` and `app/core/encryption.py` exist not to do.

---

## 2. M1.8 — the object-storage seam

### 2.1 The seam

One module, `app/core/storage.py`, in the shape the project already uses for its
cross-cutting concerns: `clock.py` is *the only clock*, `encryption.py` is *the one
envelope*. This is *the only place bytes are filed*.

```python
class ObjectStore(Protocol):
    def put(self, key: str, data: bytes, *, content_type: str) -> None: ...
    def get(self, key: str) -> tuple[bytes, str]: ...     # (data, content_type)
    def delete(self, key: str) -> None: ...
    def exists(self, key: str) -> bool: ...
```

### 2.2 Two backends, and why the provider is a configuration value

| Backend | Where it runs | Why |
|---|---|---|
| `FilesystemObjectStore(root)` | local dev, **tests**, and staging/production on a Railway volume | no credentials, no network — tests stay hermetic and offline |
| `S3ObjectStore(...)` | later, if ever | Cloudflare R2 / S3 / B2 all speak the same API |

Chosen by `STORAGE_BACKEND` (`filesystem` | `s3`) and `STORAGE_ROOT`. **The filesystem
backend is built regardless**, because the test suite cannot depend on network
credentials — so running production on it too is a config choice rather than different
code, and moving to R2 later changes environment variables and nothing else.

**Decision: ship on a Railway volume; open no third-party account.** At the real volume —
under 100 MB per club per year — every provider costs approximately nothing, so cost is
not the deciding factor. What R2 actually buys is offloaded backups and multi-replica
reads. Neither applies yet: the API runs a single replica, and the data that matters is in
Postgres. The volume's two limits are stated rather than discovered later: it mounts to
**one** service instance, so horizontal scaling of the API is blocked while it is in use,
and its backups are ours. The seam is what keeps that reversible.

### 2.3 The upload path — through the API, not presigned

Presigned uploads (browser PUTs straight to storage) are the reflex for object storage,
and are **deliberately not used**. They cannot work against the filesystem backend, so
adopting them would make the client differ per environment — the one thing a seam exists
to prevent. Bytes therefore pass through the API, capped at **2 MB**. That cost is real
for large files and irrelevant for a logo, and the client code stays identical forever.

### 2.4 Validation, and what it refuses

- **Magic bytes, not the declared `Content-Type`.** The header is attacker-controlled;
  the first bytes are checked instead — `\x89PNG`, `\xff\xd8\xff`, `RIFF....WEBP`.
- **PNG, JPEG, WebP. Never SVG.** An SVG can carry script, and serving one from our own
  origin is a stored-XSS vector for a file a customer uploads.
- **2 MB ceiling**, enforced before the body is read into memory.
- **No image library on the backend.** The browser resizes to 512×512 on a canvas before
  upload. Worst case a logo is not exactly square, which is cosmetic; the alternative is
  Pillow and an image-decoding attack surface in the API process.

### 2.5 Keys and tenancy

Keys are **constructed server-side from UUIDs** and never accepted from a client:
`studios/{studio_id}/logo.{ext}`. The filesystem backend additionally rejects any key
containing `..` or a leading `/` — defence in depth behind a value no user can reach.

There is **no generic `GET /files/{key}`**. A generic file route invites both path
traversal and enumeration across tenants. Reads are scoped routes instead:

```
POST   /api/v1/studio/logo     multipart, ManagerOrOwner  → 200 {logo_url}
DELETE /api/v1/studio/logo     ManagerOrOwner             → 204
GET    /api/v1/studio/logo     active studio only         → the bytes
```

The active studio comes from the verified JWT via `TenantSession`, so one studio cannot
address another's object even by guessing.

---

## 3. M1.9 — the studio setup wizard

### 3.1 Six steps, four of them M1's

SPEC §5.1: once the owner accepts, *"the staff app and dashboard route them into a
resumable wizard, and a progress checklist stays on the dashboard until it is complete"*,
and *"each step can be skipped and returned to; progress is persisted so the wizard
survives a closed app."* The canvas fixes six steps, progress running right-to-left:

| # | Step | Owner | Artboard |
|---|---|---|---|
| 1 | פרטי מועדון | **M1** | `5c` |
| 2 | חגורות | M7 | `5d` |
| 3 | קבוצות ולו״ז | **M1** (schedule half → M2) | — |
| 4 | מחירים | M6 | `5e` |
| 5 | צוות | **M1** | — |
| 6 | חניכים | **M1** (acquisition routes → M3) | `5f` |

### 3.2 Where it lives

`web/packages/ui/src/setup-wizard/` — container, chrome and all six steps. **Both** the
dashboard and the staff app mount it in place, per SPEC's "the staff app and dashboard",
so no step may live in one app's feature directory. The flow is drawn at 1440×900 and must
therefore carry a real narrow layout; a redirect from staff to the dashboard was
considered and rejected, because an owner doing setup on a phone is a normal case, not an
error.

### 3.3 The steps are slot entries — and there is no new `SlotId`

The container renders `useSlot('setup-wizard')`, the id M0 already declared. Six entries,
`order` 1–6, `key` = step id.

```ts
type WizardStepId = 'studio' | 'belts' | 'groups' | 'prices' | 'staff' | 'students'
type WizardStepStatus = 'pending' | 'done' | 'skipped'
type WizardStepProps = {
  locale: Locale
  status: WizardStepStatus
  onDone: () => void      // the step reports its own outcome
  onSkip: () => void
}
```

M1 registers `studio`(1), `groups`(3), `staff`(5), `students`(6); M7 adds `belts`(2) and
M6 adds `prices`(4), each as one file plus one barrel line. **The container is never
reopened.**

**The M2/M3 gaps inside steps 3 and 6 do not get sub-slots.** `SlotId` is a closed
five-value union in a file the plan says is authored once, and
`web/apps/parent/src/features/identity/Resolve.tsx` already refused to invent a sixth for
this exact reason. Instead each of those two step files has **exactly one** later owner —
W2's SCHEDULE lane extends the groups step, W2's PEOPLE lane extends the students step.
Different files, different lanes, no collision, no new seam. Each file's header says so,
so the later lane knows the extension is its own.

### 3.4 Progress lives in `studio.settings`, and why not a column

SPEC §4.3 pins the studio column list exactly as it is already built. Adding a
`setup_progress` column would deviate from the spec **and** require an Alembic revision,
and `alembic/versions/**` is owned by `main` — a lane never runs `alembic revision`. The
JSONB `settings` column exists for precisely this, so:

```json
settings.setup_progress = {
  "version": 1,
  "steps": { "studio": {"status": "done", "at": "..."}, "belts": {"status": "skipped", "at": "..."} },
  "dismissed_at": null
}
```

**Two distinct notions, because SPEC states two different things.**

- `dismissed_at` — the owner reached step 6 and chose an exit. **Auto-routing stops.**
- *complete* — every one of the six steps is `done`. **The dashboard checklist disappears.**

Collapsing them would break one sentence or the other: if skipping counted as complete the
checklist would vanish over a studio with no classes, and if the wizard re-opened until
everything was `done` an owner who skipped a step would be trapped in it forever.

The container never computes completeness — each step reports its own outcome. That is
what makes the seam hold: the container cannot know when *belts* is finished without M7
reopening it.

### 3.5 The API

New `app/routers/setup.py`. `app/main.py` mounts routers by discovery, so **no
registration edit** — adding the file mounts it.

```
GET   /api/v1/setup                    → {steps: [...], complete: bool, dismissed_at}
PATCH /api/v1/setup/steps/{step_id}    → {status: done|skipped}, audited
POST  /api/v1/setup/dismiss            → sets dismissed_at
PATCH /api/v1/studio                   → step 1's fields, ManagerOrOwner
```

Steps 3 and 5 need **no new endpoints**: `POST /classes`, `/groups`, `/locations`,
`/groups/{id}/staff` and the invitation flow all shipped in M1.4.

`PATCH /api/v1/studio` writes `name` to its column and `address`, `phone`, `sport` and
`parent_locales` into `settings` — none of them are spec'd columns, and §4.3's
"settings includes:" list is a description of what it holds, not a closed set.

Every transition is written through `AuditService.record`. Setup steps are studio
configuration, and §3.2 puts studio settings at owner ✓ manager ✓, which is the guard
these routes carry.

### 3.6 What each M1 step does

**Step 1 · פרטי מועדון** — name, ענף, address, phone, and which languages parents see
(he · en · ru), plus the logo drop-zone now that M1.8 exists. Welcome copy per `5c`:
*"אפשר לדלג על כל שלב ולחזור אליו אחר כך. שום דבר לא נשלח להורים עד שתאשרו בסוף."*

**Step 3 · קבוצות ולו״ז** — create a class, create a group, set a location. The weekly
schedule is `group_schedule_rule`, a W2 contract model; the file header records that
SCHEDULE lane owns that extension.

**Step 5 · צוות** — invite a coach by email, assign them to a group. Fully M1.

**Step 6 · חניכים** — the *מה הוגדר עד כה* summary and both exits
(פתיחת לוח המנהל · אמשיך אחר כך). The three acquisition routes — Excel/CSV import, the
parent registration link, manual add — are M3's, and the file header records that PEOPLE
lane owns them.

### 3.7 The routing bug this closes

`Resolve.decideOutcome` currently routes on *"does this studio have classes?"*. An owner
who skips step 3 therefore has no classes, and is thrown back into the wizard **on every
launch, forever**. It changes to: wizard if owner **and** `dismissed_at is null`. That is
the persistence SPEC asks for, and it removes a real defect rather than working around it.

---

## 4. Testing

**Backend.** The storage seam against the filesystem backend — round-trip, delete,
overwrite, and the refusals: SVG, a lying `Content-Type` with PNG magic bytes and vice
versa, a 2 MB+ body, a key containing `..`. The setup router under `TenantSession`, and a
test that one studio cannot read another's logo. Progress transitions and the
`complete` / `dismissed_at` split.

**Frontend.** The container: ordering, skip, and resume-where-you-left-off. Each M1 step.
And the test that protects M6 and M7 — **a fake step registers into `'setup-wizard'` and
lands in the right position without the container being touched.** If that test is
absent, the seam is a claim rather than a guarantee.

**i18n.** Strings go in the `common` namespace. There is no `setup` namespace and
`i18n/index.ts` is authored once, so a lane never adds one. he/en/ru parity is gate-enforced.

---

## 5. What this deliberately does not deliver

- No image processing on the backend, and no SVG support.
- No presigned uploads, and therefore no multi-replica API while the volume is in use.
- No `person.photo_object_key` upload UI — the seam serves it, M3 builds the screen.
- No sub-slots inside steps 3 and 6.
- Nothing in `alembic/versions/**`. This design needs **no migration**.

## 6. Open items

- **`HB-logo`** stays open and is unrelated to this work: the club has not supplied a logo
  file. The drop-zone will work before there is anything to drop into it.
- **Cloudflare R2** is a config flip, not a rewrite, if multi-replica or offloaded backups
  are ever wanted. No account is needed now.
