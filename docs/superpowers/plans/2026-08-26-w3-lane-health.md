# Lane HEALTH — M4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship SPEC §5.5's health declaration end to end — a manager-editable `kind='full'`
question set on top of D11's seeded default, a parent flow with a finger-drawn signature,
encrypted answers and signature, `derived_flags` for coaches, a Hebrew signed PDF, escalating
reminders, and the parent-app hard gate.

**Architecture:** Everything backend lives under `app/services/health/**` behind two routers
(`health_templates.py`, `health_declarations.py`) and one worker (`health_reminders.py`). Flags are
derived, never stored by the writer — `HealthService.recompute_derived_flags` is the one entry
point, and a template publish re-derives every declaration in the studio through it. The PDF is a
dependency-free writer in `app/services/health/pdf.py` with a vendored SIL-OFL Noto Sans Hebrew
face and explicit visual-order bidi, so the golden fixture is byte-deterministic. Three frontend
surfaces: the parent flow and gate, the dashboard documents view and template editor, and one
`registerSlot('roster-row')` badge file for the staff roster M5 owns.

**Tech Stack:** FastAPI · SQLAlchemy 2 · Pydantic v2 · Postgres 18 · React 19 + TypeScript + Vite ·
vitest · pytest. No new Python dependency: the PDF writer is stdlib-only.

**Spec:** `SPEC.md` §5.5, §4.3, §11.1, §11.2, §11.6 · `docs/design/decisions.md` D11 ·
`docs/plan/milestone-plan.md` § W3 Lane HEALTH — M4 · `docs/design/specs/12c-parent-health-declaration.md` ·
`docs/design/specs/4e-dashboard-documents.md`

## Global Constraints

- **Worktree:** `/Users/yuvalstolin/Desktop/studio-manager-health`, branch `lane/health`. Never touch
  `../studio-manager` or `../studio-manager-attendance`.
- **NEVER run `alembic revision`.** Missing schema is a stop-and-tell.
- **Never edit** `app/main.py`, `app/models/__init__.py`, `web/packages/i18n/index.ts`,
  `app/routers/health.py` (core's liveness probe), or anything under
  `web/apps/staff/src/features/attendance/`, `web/packages/core/src/offline/`, `app/routers/sync.py`,
  `app/services/attendance/`.
- **Ownership:** `app/models/health.py` · `app/services/health/**` · `app/routers/health_templates.py` ·
  `app/routers/health_declarations.py` · `app/workers/health_reminders.py` · `tests/health/**` ·
  `web/apps/parent/src/features/health/**` · `web/apps/dashboard/src/features/health/**` ·
  `web/apps/staff/src/features/health/HealthBadge.tsx` · `web/packages/i18n/{he,en,ru}/health.ts`.
- **G7:** never log declaration contents; never put them in an audit `diff`. Log with `extra=`, never
  an f-string.
- **`derived_flags` are booleans only** (§4.3). Never free text, never on a coach's screen as text.
- **Reading a full declaration is manager/owner only and every read is audit-logged** (§11.2).
- **Declarations do not expire.** `valid_until` stays `NULL`;
  `health_declaration_validity_months` lives on `studio.settings` and defaults to `null`.
- **Nothing on the mat is blocked.** No `block_attendance_without_health` setting exists or may be added.
- **Clock:** `app.core.clock.now()` only. A test fails the build on any other `datetime.now()` in `app/`.
- **Money:** none in this lane. **Timestamps:** stored UTC, rendered Asia/Jerusalem.
- **Hebrew strings** only in `web/packages/i18n/he/health.ts`, mirrored in `en/` (strict) and `ru/`
  (reported). Never inline a string in a component.
- **Tenancy:** every model inherits `TenantMixin`; services take `TenantSession`, which fails closed.
- **D10:** no physical CSS properties (`margin-left`, `left`, …) — logical only.
- **Check:** `./scripts/lane-check.sh health` green is a precondition for reporting done.
- **Commands:** `.venv/bin/pytest`, `.venv/bin/mypy`, `.venv/bin/ruff`, `npx vitest run … --reporter=dot`
  from `web/`. `.venv` is Python 3.14 built from
  `/Library/Frameworks/Python.framework/Versions/3.14/bin/python3.14`.

## File Structure

| File | Responsibility |
|---|---|
| `app/services/health/flags.py` | Derive `dict[str, bool]` from (answers, template schema). Pure, no I/O. |
| `app/services/health/templates.py` | `HealthTemplateService` — read/edit/publish the `full` template, upload the studio PDF, re-derive after a publish. |
| `app/services/health/declarations.py` | `HealthDeclarationService` — submit, coach-safe read, manager full read + audit, `student.health_status` maintenance, reminder recording. |
| `app/services/health/pdf.py` | Dependency-free PDF writer: TrueType embedding (CIDFontType2/Identity-H), visual-order bidi, deterministic bytes. |
| `app/services/health/fonts/NotoSansHebrew-Regular.ttf` | Vendored SIL-OFL face. |
| `app/services/health/fonts/LICENSE.txt` | Its licence. |
| `app/services/health/__init__.py` | `HealthService` — the cross-lane seam. Signature already fixed on `main`. |
| `app/routers/health_templates.py` | `PUT /health-templates/{id}`, `POST /health-templates/{id}/publish`, `POST /health-templates/{id}/source-pdf`. |
| `app/routers/health_declarations.py` | `GET/POST /students/{id}/health-declaration`, `…/full`, `…/pdf`, `…/reminder`, `GET /health-declarations/summary`. |
| `app/workers/health_reminders.py` | §5.5's day 1/3/7 ladder over students with `health_status='missing'`. |
| `web/apps/parent/src/features/health/` | `HealthGate`, `DeclarationForm`, `SignaturePad`, `healthClient`, `index.ts`. |
| `web/apps/dashboard/src/features/health/` | `DocumentsScreen`, `TemplateEditor`, `healthClient`, `index.ts`. |
| `web/apps/staff/src/features/health/HealthBadge.tsx` | The `roster-row` slot fill. |
| `web/apps/staff/src/features/health/register.ts` | `registerHealthSections()`. |
| `tests/health/**` | One test file per task. |

---

### Task 1: Flag derivation, and the seam's body

**Files:**
- Create: `app/services/health/flags.py`
- Modify: `app/services/health/__init__.py`
- Test: `tests/health/test_flags.py`

**Interfaces:**
- Consumes: `FULL_FLAG_QUESTIONS`, `TRIAL_FLAG_QUESTIONS`, `FULL_TEMPLATE_SCHEMA` from
  `app/services/structure/health_templates.py`; `HealthDeclaration`, `HealthFormTemplate` from
  `app/models/health.py`.
- Produces:
  - `flag_question_ids(schema: dict[str, Any]) -> tuple[str, ...]`
  - `derive_flags(answers: Mapping[str, Any], schema: dict[str, Any]) -> dict[str, bool]`
  - `HealthService(session: TenantSession | None = None)` with
    `recompute_derived_flags(self, student_id: uuid.UUID) -> dict[str, bool]` — **signature fixed by
    `tests/contracts/test_seams.py`; do not change it.**
  - `HealthService.roster_health(self, student_ids) -> dict[uuid.UUID, tuple[str, dict[str, bool]]]`

**Design notes the implementer needs:**
- A flag question is one carrying `"flag": True` in the template schema. `FULL_FLAG_QUESTIONS` is the
  frozen list for the bundled set; `flag_question_ids` reads the *schema being used*, because D11 lets a
  manager add a flag question and the derivation must follow the template a declaration was signed
  against — not the bundled constant.
- `derive_flags` coerces nothing. A missing answer is `False`; a non-boolean answer for a flag question
  is `False` **and is a bug**, so it raises rather than silently down-converting — §4.3's
  `_flags_are_booleans` makes the same argument at the schema boundary.
- `HealthService()` with no session keeps `tests/contracts/test_seams.py` green: it constructs
  `HealthService()` positionally with no argument.
- `recompute_derived_flags` returns `{}` for a student with no declaration — not an error (§5.5).
- It **writes** the recomputed flags back onto the row before returning, because "recompute" is the
  entry point a template edit uses to fix a whole roster.

- [ ] **Step 1: Write the failing tests**

```python
# tests/health/test_flags.py
from app.services.health.flags import derive_flags, flag_question_ids
from app.services.structure.health_templates import FULL_FLAG_QUESTIONS, FULL_TEMPLATE_SCHEMA


def test_the_bundled_schema_declares_exactly_the_eight_frozen_flag_questions():
    assert flag_question_ids(FULL_TEMPLATE_SCHEMA) == FULL_FLAG_QUESTIONS


def test_every_flag_is_a_boolean_and_an_unanswered_flag_is_false():
    flags = derive_flags({"asthma": True}, FULL_TEMPLATE_SCHEMA)
    assert flags["asthma"] is True
    assert flags["allergy"] is False
    assert set(flags) == set(FULL_FLAG_QUESTIONS)
    assert all(isinstance(v, bool) for v in flags.values())


def test_free_text_never_becomes_a_flag():
    """§4.3 — a free-text answer is a medical description; it must not reach a coach."""
    flags = derive_flags(
        {"asthma": True, "allergy_details": "פירוט", "restrictions": "כלשהו"},
        FULL_TEMPLATE_SCHEMA,
    )
    assert "allergy_details" not in flags
    assert "restrictions" not in flags


def test_a_string_answer_to_a_flag_question_is_refused_rather_than_coerced():
    import pytest

    with pytest.raises(ValueError):
        derive_flags({"asthma": "no"}, FULL_TEMPLATE_SCHEMA)


def test_a_manager_added_flag_question_derives_a_flag():
    """D11 — the question set is editable, so derivation follows the schema, not a constant."""
    schema = {
        "version": 2,
        "kind": "full",
        "sections": [
            {"id": "s", "questions": [{"id": "vertigo", "type": "boolean", "flag": True}]}
        ],
    }
    assert derive_flags({"vertigo": True}, schema) == {"vertigo": True}
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/health/test_flags.py -q`
Expected: FAIL — `ModuleNotFoundError: app.services.health.flags`

- [ ] **Step 3: Implement `app/services/health/flags.py`**

Pure functions only. Walk `schema["sections"][*]["questions"][*]`, keep `q.get("flag") is True`,
return their ids in schema order. `derive_flags` builds `{qid: bool(answers[qid])}` but raises
`ValueError` when the raw answer is present and not a `bool`.

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/pytest tests/health/test_flags.py -q`
Expected: PASS

- [ ] **Step 5: Write the failing seam test**

```python
# tests/health/test_seam.py
import uuid
from app.services.health import HealthService


def test_no_declaration_yields_no_flags(tenant_session, a_student):
    assert HealthService(tenant_session).recompute_derived_flags(a_student) == {}
```

Plus a test that a declaration's stale flags are re-derived and persisted, and a test that
`roster_health` returns a `(health_status, flags)` pair that validates as a `RosterEntry`.

- [ ] **Step 6: Fill the body in `app/services/health/__init__.py`**

Keep the module docstring and the method docstring. Add `__init__(self, session: TenantSession | None = None)`.
`recompute_derived_flags` loads the declaration for the student, loads its template, calls
`derive_flags`, assigns `row.derived_flags`, flushes, returns.
`HealthService()` with no session must still raise `NotImplementedError`-free behaviour for the
signature test — it only *constructs*; the seam test calls the method with a real session.

> **Careful:** `tests/contracts/test_seams.py::test_recompute_derived_flags_refuses_rather_than_returning_nothing`
> asserts `HealthService().recompute_derived_flags(uuid4())` raises `NotImplementedError`. That test
> encodes "M4 has not filled this in yet" and **must be updated in this lane**, because filling the body
> is the lane's job. Replace it with an assertion that a session-less service refuses (`RuntimeError`),
> and note the change in the commit message — it is the seam's own file, not another lane's.
> **Do not change the signature.** If the reviewer prefers the contract test untouched, make the
> session-less call raise `NotImplementedError` verbatim and keep the test as-is.

- [ ] **Step 7: Run tests, then commit**

```bash
.venv/bin/pytest tests/health tests/contracts -q
git add -A && git commit -m "feat(health): derive booleans-only flags from the template a declaration was signed against"
```

---

### Task 2: The template editor (D11)

**Files:**
- Create: `app/services/health/templates.py`, `app/routers/health_templates.py`
- Test: `tests/health/test_templates.py`

**Interfaces:**
- Produces `HealthTemplateService` (all `@staticmethod`, taking `session: TenantSession` first):
  - `get_full(session) -> HealthFormTemplate`
  - `edit_draft(session, template_id, *, schema, at) -> HealthFormTemplate`
  - `publish(session, template_id, *, at) -> tuple[HealthFormTemplate, int]` — returns the new row and
    how many declarations were re-derived.
  - `attach_source_pdf(session, template_id, *, data, at) -> str` — returns the object key.
- Routes (all `ManagerOrOwner`, all under `/api/v1`):
  - `PUT /health-templates/{template_id}` — replace `schema`, 200 `HealthFormTemplateOut`.
  - `POST /health-templates/{template_id}/publish` — 201, new version.
  - `POST /health-templates/{template_id}/source-pdf` — multipart, 200.

**Design notes:**
- **A publish creates a new row at `version + 1`**, never mutates a published one. §4.3 stores
  `template_version` on the declaration precisely so a signature records the questions actually asked;
  editing v1 in place would silently rewrite the meaning of every signature already collected.
- `is_bundled_default` is dropped from the schema the moment a manager edits it. A studio that reworded
  our questions is no longer showing ours, and telling them otherwise is the opposite of D11's caveat.
- **`kind='trial'` is refused.** Conflict C3: M1 owns that row and M3 writes against it. A 409, not a 403 —
  the row exists, the operation does not apply to it.
- Publishing calls `HealthService.recompute_derived_flags` for every student in the studio holding a
  declaration. That is the whole reason the seam is one named entry point.
- The PDF upload validates magic bytes `%PDF-` and `MAX_UPLOAD_BYTES` from `app/core/storage.py`,
  the same way the logo upload does. Key: `studios/{studio_id}/health-template/{template_id}.pdf`.
  It is **reference only** — nothing reads it back into the question set (D11).
- Audit: `health_template.publish` with a diff naming *the version numbers and the question ids added
  and removed*. Never the wording, never an answer. There are no answers in a template, but the rule
  is stated here so the next editor does not add one.

- [ ] **Step 1: Write the failing tests** covering: a manager rewords a question and the draft changes;
  publishing mints `version=2` and leaves `version=1` intact; a declaration signed against v1 keeps
  `template_version=1` but gets fresh `derived_flags`; a coach gets 403 on all three routes; a guardian
  gets 403; editing the `trial` template is 409; the bundled marker disappears after an edit; an added
  flag question appears in a recomputed declaration's flags; a non-PDF upload is refused.
- [ ] **Step 2: Run — expect FAIL** (`.venv/bin/pytest tests/health/test_templates.py -q`)
- [ ] **Step 3: Implement the service, then the router.** `app/main.py` mounts by discovery — do not edit it.
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `feat(health): a manager can add, remove and reword the full template's questions (D11)`

---

### Task 3: The declaration flow — submit, read, gate

**Files:**
- Create: `app/services/health/declarations.py`, `app/routers/health_declarations.py`
- Test: `tests/health/test_declarations.py`, `tests/health/test_privacy.py`

**Interfaces:**
- `HealthDeclarationService` (staticmethods, `session: TenantSession` first):
  - `submit(session, student_id, *, template_id, answers, signature_png, signed_by_person_id, ip, user_agent, at) -> HealthDeclaration`
  - `for_student(session, student_id) -> HealthDeclaration | None`
  - `read_full(session, student_id, *, actor_person_id, actor_identity_id, actor_ip, at) -> HealthDeclaration`
  - `status_summary(session, *, cursor, limit) -> tuple[list[HealthStatusSummaryOut], uuid.UUID | None]`
  - `record_reminder(session, student_id, *, actor_person_id, actor_ip, at) -> datetime`
  - `last_reminder_sent_at(session, student_ids) -> dict[uuid.UUID, datetime]`
- Routes:
  - `GET /students/{student_id}/health-declaration` → `HealthDeclarationOut` (coach-safe). `AnyStaff`
    **or a guardian of that student**.
  - `POST /students/{student_id}/health-declaration` → 201 `HealthDeclarationOut`. Guardian of that
    student, or manager/owner.
  - `GET /students/{student_id}/health-declaration/full` → `HealthDeclarationFullOut`. **ManagerOrOwner
    only, audit-logged on every call.**
  - `POST /students/{student_id}/health-declaration/reminder` → 202. `AnyStaff` (§5.5's one-tap is on a
    coach's roster).
  - `GET /health-declarations/summary` → `HealthStatusSummaryPage`. `ManagerOrOwner`.

**Design notes:**
- `answers_encrypted` and `signature_image_encrypted` are already `EncryptedJSON`/`EncryptedBytes` on the
  columns. **Assign plaintext; the column type encrypts.** Never call `encrypt()` at the call site.
- The signature arrives as base64 PNG in `HealthDeclarationIn.signature_image_base64`. Validate with
  `sniff_image_type` from `app/core/storage.py` — PNG only. A missing signature is a 422 carrying
  `declaration.signatureRequired`'s code, and **the answers are not persisted**, so the parent does not
  lose them (that is why the field is optional in the schema and required by the service).
- On submit: `student.health_status` moves to `'signed'` for a `full` template and `'trial_signed'` for a
  `trial` one. **The lane never writes `'trial_signed'` from a full submission** and never downgrades.
- One live declaration per student (`uq_health_declaration_student_id`). A re-submit **supersedes**:
  update the existing row in place, bump `template_version`, replace answers, signature, `signed_at`, and
  clear `pdf_object_key` so the render is re-run. Two rows would be two answers to "is this child asthmatic".
- `valid_until` is left `NULL`. **Write a test that asserts it stays `NULL` even when
  `studio.settings['health_declaration_validity_months']` is set**, because §5.5 makes the setting a
  renewal-reminder switch, not an expiry the row records. (The setting turning on reminders is Task 5.)
- **Audit, exactly three actions:** `health_declaration.create`, `health_declaration.read_full`,
  `health_declaration.reminder_sent`. `is_sensitive=True` on the first two. `diff` never carries answers —
  on create it carries `{"template_version": n, "flag_count": len(flags)}` and nothing else.
- `last_reminder_sent_at` is **derived from `audit_log`**, not a column. There is no such column on
  `student` or `health_declaration`, and inventing one would be a stop-and-tell. `audit_log` is
  append-only with SELECT granted, so `MAX(created_at) WHERE action='health_declaration.reminder_sent'
  AND entity_id=student_id` is exactly the fact `HealthStatusSummaryOut.last_reminder_sent_at` wants.
  Document this in the service docstring so nobody adds the column later.

- [ ] **Step 1: Write `tests/health/test_declarations.py`** — submit round-trips answers; the flags land
  on the row; `student.health_status` becomes `signed`; a re-submit supersedes rather than duplicating;
  `valid_until` is `NULL` with and without the studio setting; a submission with no signature is 422 and
  writes nothing; a non-PNG signature is 422; a guardian of a *different* child is 403; a cross-studio
  student is 404.
- [ ] **Step 2: Write `tests/health/test_privacy.py`** — the coach-safe shape carries no `answers` key
  at all; `GET …/full` is 403 for both coach levels and for a guardian; it is 200 for manager and owner
  **and writes exactly one `audit_log` row per call, with no answer text anywhere in `diff`**; two reads
  write two rows; a coach reading the coach-safe shape writes **no** sensitive audit row.
- [ ] **Step 3: Run both — expect FAIL**
- [ ] **Step 4: Implement service then router**
- [ ] **Step 5: Run — expect PASS**
- [ ] **Step 6: Write `tests/health/test_no_logging.py`** — capture logs with `caplog` around a submit
  and a full read, and assert no answer value and no base64 signature fragment appears in any record's
  message or its `extra`. G7 as a test, not a review note.
- [ ] **Step 7: Run, then commit** — `feat(health): the declaration flow, encrypted at rest and audit-logged on every full read`

---

### Task 4: The Hebrew signed PDF, and its golden fixture

**Files:**
- Create: `app/services/health/pdf.py`, `app/services/health/fonts/NotoSansHebrew-Regular.ttf`,
  `app/services/health/fonts/LICENSE.txt`
- Modify: `app/services/health/declarations.py` (render on submit, store the key)
- Create: `app/routers/health_declarations.py` route `GET …/health-declaration/pdf`
- Test: `tests/health/test_pdf.py`, fixture `tests/health/golden/declaration.pdf`

**Interfaces:**
- `render_declaration_pdf(*, title: str, student_name: str, signed_at: datetime, signed_by: str, sections: list[RenderedSection], signature_png: bytes | None) -> bytes`
- `RenderedSection = tuple[str, list[tuple[str, str]]]` — a section title and its (question, answer) pairs.
- `shape_rtl(text: str) -> str` — visual-order reordering.

**Why hand-rolled:** `requirements-dev.txt` carries no PDF library and adding one is outside this lane's
ownership. A minimal writer is also the only way the golden fixture is meaningful — ReportLab stamps a
creation date and a random document ID into every file, so a byte-comparison would fail on the second
run for reasons that have nothing to do with the rendering.

**How the font works:** embed the TTF whole as a `FontFile2` stream inside a `CIDFontType2` descendant
with `Encoding /Identity-H`. Text is then written as **glyph ids**, two bytes each, which sidesteps
encoding entirely — the PDF never has to agree with a consumer about what code point a byte means. Parse
four tables out of the TTF: `head` (unitsPerEm, indexToLocFormat), `hhea`+`hmtx` (advance widths),
`maxp` (numGlyphs), `cmap` format 4 (code point → glyph id). Build `/W` from the advances of the glyphs
actually used.

**Bidi, explicitly:** the writer lays glyphs left-to-right in the order given, so Hebrew must be handed to
it already in **visual order**. `shape_rtl` splits a string into runs — RTL (`U+0590–U+05FF`), neutral,
and LTR — reverses the RTL runs and the whole sequence, leaves digits and Latin in logical order inside
their run, and mirrors the four bracket pairs. §5.5 calls this fiddly; that is why it is a named function
with its own tests rather than an inline reversal.

**Determinism:** no `/CreationDate`, no `/ID` derived from time, no random object order, and
`signed_at` is rendered from the value passed in — never from `now()`. The fixture is then stable.

- [ ] **Step 1: Vendor the font**

```bash
mkdir -p app/services/health/fonts
curl -sSL -o app/services/health/fonts/NotoSansHebrew-Regular.ttf \
  "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansHebrew/hinted/ttf/NotoSansHebrew-Regular.ttf"
curl -sSL -o app/services/health/fonts/LICENSE.txt \
  "https://raw.githubusercontent.com/notofonts/hebrew/main/OFL.txt"
```

Verify: the TTF is ~26 KB and `file` reports `TrueType Font data`.

- [ ] **Step 2: Write the failing bidi tests**

```python
# tests/health/test_pdf.py
from app.services.health.pdf import shape_rtl


def test_a_hebrew_run_is_reversed_into_visual_order():
    assert shape_rtl("שלום") == "םולש"


def test_digits_inside_a_hebrew_sentence_keep_their_own_order():
    # "טלפון 054" — the number reads 054 on screen, not 450.
    assert "054" in shape_rtl("טלפון 054")


def test_latin_inside_a_hebrew_sentence_is_not_reversed():
    assert "PDF" in shape_rtl("קובץ PDF מצורף")
```

- [ ] **Step 3: Run — expect FAIL**
- [ ] **Step 4: Implement `shape_rtl` and the TTF parser; run — expect PASS**
- [ ] **Step 5: Write the failing golden test**

```python
def test_the_rendered_pdf_matches_the_golden_fixture():
    """§5.5 mandates this. Regenerate deliberately with REGENERATE_GOLDEN=1, never casually:
    the diff is the review."""
    produced = render_declaration_pdf(**GOLDEN_INPUT)
    golden = (Path(__file__).parent / "golden" / "declaration.pdf").read_bytes()
    assert produced == golden


def test_the_pdf_embeds_a_hebrew_capable_font_rather_than_a_base14_one():
    produced = render_declaration_pdf(**GOLDEN_INPUT)
    assert b"/FontFile2" in produced
    assert b"NotoSansHebrew" in produced
    assert b"/Identity-H" in produced


def test_rendering_twice_is_byte_identical():
    assert render_declaration_pdf(**GOLDEN_INPUT) == render_declaration_pdf(**GOLDEN_INPUT)


def test_the_signature_image_is_embedded():
    produced = render_declaration_pdf(**{**GOLDEN_INPUT, "signature_png": ONE_PIXEL_PNG})
    assert b"/Image" in produced
```

- [ ] **Step 6: Run — expect FAIL, generate the fixture, run — expect PASS**
- [ ] **Step 7: Wire it into submit** — render on `submit()`, `put` it to the object store at
  `studios/{studio_id}/health-declarations/{declaration_id}.pdf`, set `pdf_object_key`. Add
  `GET /students/{id}/health-declaration/pdf` returning the bytes: **guardian of that student, or
  manager/owner** (§5.5 — "downloadable by the guardian and by managers"). A coach gets 403; the file is
  the full record. Audit the manager's download as a `read_full`.
- [ ] **Step 8: Run `tests/health`, then commit** — `feat(health): a deterministic Hebrew signed PDF with an embedded Noto face and explicit bidi`

---

### Task 5: The reminder ladder

**Files:**
- Create: `app/workers/health_reminders.py`
- Test: `tests/health/test_reminders.py`

**Design notes:**
- §5.5: "The parent gets escalating reminders on days 1, 3 and 7." Days counted from
  `student.joined_on` (or `created_at` when `joined_on` is null) for a `missing` declaration — exactly
  those three days, matching `app/workers/followups.py`'s `FOLLOW_UP_DAYS` reasoning: a message on day
  two is one the club did not ask for.
- Renewal reminders exist **only** when `studio.settings['health_declaration_validity_months']` is set,
  and even then `valid_until` stays `NULL` — the worker computes the renewal date from `signed_at` plus
  the setting. Write a test with the setting unset (no renewal reminders at all) and one with it set.
- Messages go through `NotificationService.enqueue`, which still raises `NotImplementedError` until lane
  COMMS lands. Count the refusals and report them; never swallow. Same shape as `followups.py`.
- Cross-studio the same way `followups.py` does it: a plain unscoped `Session` to list studios, then one
  `use_studio` scope per studio. Do **not** call `with_all_tenants` — it puts the file in front of §19.7's
  demo-hygiene detector, whose registry this lane does not own.
- Every send records `health_declaration.reminder_sent` in the audit log, which is what
  `last_reminder_sent_at` reads back (Task 3).

- [ ] **Step 1: Write the failing tests** — a student missing a declaration for exactly 1/3/7 days gets a
  reminder; days 2, 4 and 8 get none; a signed student gets none; the tally counts undeliverable
  messages rather than reporting sends that did not happen; no renewal reminder when the setting is null.
- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `feat(health): the day 1/3/7 reminder ladder, and renewal only when the studio asked for it`

---

### Task 6: i18n — the keys the artboards found missing

**Files:**
- Modify: `web/packages/i18n/he/health.ts`, `en/health.ts`, `ru/health.ts`

Add, in all three locales (Hebrew is the reference; `en` is strict in the parity check; `ru` is reported
but fill it anyway):

- `documents.all`, `documents.awaitingSignature`, `documents.columnType`, `documents.columnValidity`,
  `documents.sendRequest`, `documents.summary` (a composed line with `{total}` / `{missing}`),
  `documents.requestGroupCount` (`בקשה קבוצתית ל־{count}`), `documents.filteredEmpty`,
  `documents.loading`, `documents.error`.
- `declaration.attestation` — 12c finding 3: the paragraph the parent actually signs has no key today.
- `declaration.unanswered` and `declaration.answerRequired` — 12c finding 5, the most consequential gap
  on that artboard: a declaration that defaults every question to "no" and gets signed is a health
  record nobody answered. A third, unanswered state needs copy.
- `declaration.error`, `declaration.loading`.
- `template.editingBundled` / `template.editingYours` — so the editor can say **whose** questions it is
  showing, which is what `is_bundled_default` exists for.
- `template.publishConfirm`, `template.published`, `template.recomputed` (`{count}` declarations
  re-derived), `template.questionType.boolean` / `.text` / `.phone`, `template.flagQuestion`.

**Do not** add an expiry string. Eight artboards assume one; §5.5 says declarations do not expire, and
`declaration.noExpiry` already says so. Record it as a finding rather than shipping a ninth contradiction.

- [ ] **Step 1: Add the keys to `he/health.ts`**
- [ ] **Step 2: Run `node web/scripts/i18n-parity.mjs health` — expect FAIL naming the missing `en` keys**
- [ ] **Step 3: Mirror into `en/health.ts` and `ru/health.ts`**
- [ ] **Step 4: Run again — expect PASS**
- [ ] **Step 5: Commit** — `feat(i18n): the health keys 12c and 4e found missing`

---

### Task 7: The parent flow and the hard gate (artboard 12c)

**Files:**
- Create: `web/apps/parent/src/features/health/SignaturePad.tsx`, `DeclarationForm.tsx`,
  `HealthGate.tsx`, `healthClient.ts`, `index.ts`, and one `.test.tsx` beside each component.

**Design notes:**
- **The gate is a hard block in the parent app only.** `HealthGate` renders in front of everything when
  any linked student has `health_status === 'missing'`, and there is no way past it but the form.
  Nothing in this lane blocks a coach.
- **The signature pad must not mirror.** It sits inside `dir="rtl"`. Capture pointer coordinates from
  `getBoundingClientRect()` in screen space and draw into a canvas whose own `dir` is `ltr`, so no
  ancestor transform can flip a person's handwriting. Test it: a pointer path drawn at increasing `clientX`
  must produce increasing canvas x, with the container in RTL.
- **Three answer states, not two.** 12c finding 5: `Switch` is two-position, so an unanswered question
  renders as a `SegmentedControl` of `declaration.yes` / `declaration.no` with neither selected, and
  submit is disabled until every required question is answered. Name the primitive; do not write a
  second one.
- Progressive disclosure: a `yes` reveals the `visible_if` detail `TextField`. A `no` hides **and clears** it.
- Bind the `כן` state to `--accent`, never `--paid` (12c finding 8).
- D11's disclaimer belongs on the editor; 12c finding 3 asks whether the parent should see it too.
  Render `template.disclaimer` on the parent screen as well — a parent signing a medical attestation is
  entitled to the same caveat, and it costs one line.
- Primitives to use: `Card`, `SegmentedControl`, `TextField` (multiline), `Button`, `Alert`, `EmptyState`.
- No inline strings. No physical CSS properties.

- [ ] **Step 1: Write `SignaturePad.test.tsx`** — an empty pad reports empty; a drawn path reports
  non-empty and exports a `data:image/png` URL; clear empties it; **the RTL non-mirroring test above**.
- [ ] **Step 2: Run — expect FAIL** (`cd web && npx vitest run apps/parent/src/features/health/SignaturePad.test.tsx --reporter=dot`)
- [ ] **Step 3: Implement `SignaturePad.tsx`; run — expect PASS**
- [ ] **Step 4: Write `DeclarationForm.test.tsx`** — every question renders unanswered; submit is
  disabled until all required are answered **and** a signature exists; answering yes reveals the detail
  field; answering no again clears it; submitting posts answers plus the base64 PNG; the disclaimer is
  on screen.
- [ ] **Step 5: Run — expect FAIL; implement; run — expect PASS**
- [ ] **Step 6: Write `HealthGate.test.tsx`** — a missing declaration renders the gate and no children;
  a signed one renders children; a `trial_signed` one still renders the gate (§5.5's gate is on the
  full declaration).
- [ ] **Step 7: Run — expect FAIL; implement; run — expect PASS**
- [ ] **Step 8: Commit** — `feat(parent): the health declaration flow and §5.5's parent-app gate (12c)`

---

### Task 8: The dashboard documents view and template editor (artboard 4e)

**Files:**
- Create: `web/apps/dashboard/src/features/health/DocumentsScreen.tsx`, `TemplateEditor.tsx`,
  `healthClient.ts`, `index.ts`, plus tests.

**Design notes:**
- **No medical content on this screen.** Only whether a document exists, who owes it, and how to ask.
  Not one `derived_flag`, not one answer.
- `documents.viewFullNotice` is **required** wherever `צפייה` opens (4e finding 1) — §11.2 logs the read
  and the manager is told before it happens, not after.
- The filter chips are `StatusChip` today; note in the code comment that they are selectable and
  `StatusChip` is a display indicator — the eighth artboard wanting a `FilterChip`. Do not build a second
  chip primitive in a feature directory.
- `EmptyState` for "everything filed" — the goal state, undrawn on the artboard (4e finding 8).
- **Do not build manual upload of a completed declaration** (4e finding 3). It produces a record with no
  `derived_flags`, so the coach's ⚠ badge silently does not appear — reintroducing exactly the design D11
  rejected. Record it as a finding.
- **Do not build the insurance-certificate or photo-waiver rows** (4e finding 5). Neither is M4's model:
  insurance has none at all, and a photo waiver is §11.6 consent, M9's.
- The template editor renders `template.disclaimer` **unconditionally and above the questions** — D11's
  caveat lives where the manager edits, and `is_bundled_default` picks between
  `template.editingBundled` and `template.editingYours`.

- [ ] **Step 1: Write `DocumentsScreen.test.tsx`** — rows render student, group, status chip and the
  status-appropriate action; the empty state renders when nothing is missing; **no answer text and no
  flag label appears anywhere in the DOM**; the audit notice renders next to `צפייה`.
- [ ] **Step 2: Run — expect FAIL; implement; run — expect PASS**
- [ ] **Step 3: Write `TemplateEditor.test.tsx`** — the disclaimer is always visible; a question can be
  reworded, added and removed; publishing calls the publish endpoint and reports how many declarations
  were re-derived; the bundled marker switches to `editingYours` after an edit.
- [ ] **Step 4: Run — expect FAIL; implement; run — expect PASS**
- [ ] **Step 5: Commit** — `feat(dashboard): the documents view and D11's template editor, caveat included (4e)`

---

### Task 9: The staff badge — a slot fill, no screen

**Files:**
- Create: `web/apps/staff/src/features/health/HealthBadge.tsx`, `register.ts`, `HealthBadge.test.tsx`

**Design notes:**
- Conflict C2: this lane's staff surface has no artboard of its own and that is expected. `HealthBadge`
  is a `registerSlot('roster-row', …)` fill rendering from two fields the contract commit already put in
  `BootstrapPayload.roster[]`. It never fetches.
- Props, from the contract: `{ status: 'missing' | 'trial_signed' | 'signed'; flags: Record<string, boolean>; studentId: string; onRemind?: (studentId: string) => void }`.
- **Booleans only.** The chips render `health.flag.<id>` for flags that are `true`. A flag with no label
  renders **nothing** rather than a blank chip — a warning that silently is not one is worse than no
  warning (the reason `FULL_FLAG_QUESTIONS` is frozen to the eight labelled ids).
- The `missing` state renders `badge.missing` **and** `badge.missingHint` — "אפשר לסמן נוכחות". Nothing
  here disables anything.
- **M5 has not merged `roster-row` yet.** Build against the prop shape and defer only the integration
  test; say so in the file's docstring and in the report.

- [ ] **Step 1: Write `HealthBadge.test.tsx`** — `missing` renders the warning and the hint; `signed`
  with `{asthma: true, allergy: false}` renders one chip, not two; an unknown flag id renders nothing;
  **no test asserts anything is disabled, and a test asserts nothing in the rendered output has
  `aria-disabled` or `disabled`**; the reminder button calls `onRemind` once.
- [ ] **Step 2: Run — expect FAIL; implement; run — expect PASS**
- [ ] **Step 3: Commit** — `feat(staff): the roster health badge, registered into M5's roster-row slot`

---

### Task 10: Close the lane

- [ ] **Step 1:** `./scripts/lane-check.sh health` — green, with the gate count recorded.
- [ ] **Step 2:** Tick the W3 HEALTH pieces in `docs/plan/state.yaml` **in the same commit as the work**.
  Nothing measurable goes in that file — no test counts, no branch, no environment health.
- [ ] **Step 3:** Commit — `docs(plan): tick M4's pieces`

---

## Self-Review

**Spec coverage.** §5.5 gate → Task 7. Structured template + `source_pdf_object_key` → Task 2.
Signature → Tasks 3, 7. Encrypted answers + signature → Task 3. Template version on the declaration →
Tasks 2, 3. Signed PDF → Task 4. No expiry → Tasks 3, 5. Coaches see flags only → Tasks 1, 9.
Manager-only full read, audit-logged → Task 3. No block setting → Tasks 7, 9 (asserted, not merely
omitted). ⚠ badge + one-tap reminder → Tasks 3, 9. Escalating day 1/3/7 → Task 5. Manager dashboard lists
every student missing one → Tasks 3, 8. Hebrew PDF + golden fixture → Task 4. §11.1 encryption → Task 3.
§11.2 audit → Task 3. §11.6 consent — `ConsentRecord` exists and `ConsentRecordOut` is shaped, but §11.6's
consent *management* screens are M9's (`reports.privacy.*` is that namespace); this lane leaves the model
alone and records it. D11 editable questions → Task 2, caveat in the UI → Tasks 7, 8.

**Placeholders.** None: every task names exact files, exact interfaces and real test bodies or a precise
enumeration of the cases.

**Type consistency.** `derive_flags` / `flag_question_ids` / `recompute_derived_flags` /
`roster_health` are used with the same names and signatures everywhere. `HealthDeclarationOut` and
`HealthDeclarationFullOut` are the shapes already on `main` and are not redefined. `RenderedSection` is
defined in Task 4 and used only there.

**Known risk.** Task 4 is the day-eater §5.5 warned about. If it overruns, Tasks 5–9 are independent of
it except for the `pdf_object_key` field, which is nullable — ship them and leave the render behind.
