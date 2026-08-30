# הסכם הרשמה — folding the club's registration form into the health declaration

**Date:** 2026-08-30
**Status:** design approved, spec pending review
**Supersedes:** D11's "bundled default questionnaire" framing for studio `gladiator`

---

## 1 · Why

The club has a real paper form — `טופס הרשמה לאימוני ג'ודו (שנה"ל 2025-26)` — and a set of
payment terms that live outside it. The app today collects a strict subset of the paper
form (a health questionnaire) and none of its registration data, so the club runs both
systems: an app declaration *and* a paper page per family.

Two things follow, and they are the whole of this design:

1. **The paper form only dies if the app fully replaces it.** Collecting most of the
   fields leaves the club chasing the rest on paper, which is the situation we are in.
2. **The club's own legal text carries the club's own legal responsibility.** The app
   currently prints a disclaimer saying its questionnaire is "a starting point only and
   not a compliance document". That sentence was honest about a questionnaire we invented.
   It is not honest about, and must not be printed on, the club's own form.

### Sources

- `‎⁨טופס הרשמה⁩.pdf` — one page, six blocks, transcribed in §3.
- The `תנאי תשלום` text, supplied separately, transcribed in §4.

---

## 2 · What exists today

| Concern | Where it lives | Status |
|---|---|---|
| Health questions | `FULL_TEMPLATE_SCHEMA` v1, `app/services/structure/health_templates.py` | 5 sections, ~20 questions, 8 flagged. **Richer than the paper form.** |
| Signed answers | `health_declaration.answers_encrypted` | Encrypted, manager+owner only, every read audit-logged |
| Coach warnings | `health_declaration.derived_flags` | Booleans only; the ⚠ badge on a roster |
| Signed PDF | `app/services/health/pdf.py` | Dependency-free writer, embedded Hebrew face, golden fixture |
| Registration data | `app/services/people/registrations.py` | first name, last name, birthdate, guardian name/email/phone — **and nothing else** |
| National ID | — | **Does not exist anywhere in the codebase** |
| Consent ledger | `consent_record` + `app/services/privacy/` | Versioned, revocable, append-only. `POLICY_VERSION = 0` (draft) |

`person` has: `first_name`, `last_name`, `birthdate`, `phone`, `email`,
`photo_object_key`, `locale`. No ID number, no address, no city.
`student` has no grade. There is no pickup-contact concept.

---

## 3 · The paper form, transcribed

Six blocks:

1. **פרטים אישיים (student)** — first name, last name, date of birth, **ת.ז.**,
   כיתה/גן, address, יישוב, home phone, child's mobile (if any), parent's email,
   student's email
2. **פרטי ההורים** — mother (name, **ת.ז.**, phone), father (name, **ת.ז.**, phone)
3. **Authorized pickup** — "במידה ויש אנשים אחרים (חוץ מההורים) שרשאים לאסוף את הילדים
   מהחוג נא ציינו זאת" — name, phone
4. **Aliyah year** — "אם אחד מההורים עשה עליה ב-10 שנים אחרונות נא לכתוב שנת עליה"
5. **הצהרת בריאות** — two *alternative* clauses plus `הערות בריאות מיוחדות` free text
6. **Signature block** — "אני, ____, מאשר בזאת שקראתי את הצהרת הבריאות ותקנון של מועדון
   GLADIATOR ומתחייב לפעול עפ"י הנהלים הרשומים בו" + חתימה + תאריך

### 3.1 The two health clauses are alternatives

Clause 1 — no limitations:

> הנני מצהיר/ה כי לרשום מעלה אין מגבלות רפואיות/רגישויות כלשהן והוא מסוגל לעמוד במאמץ
> הדרוש לחוג אליו נרשם. יחד עם זאת, במידה ותהיה מגבלה רפואית כלשהי, הנני מתחייב/ת לדווח
> על כך בהקדם למאמן ו/או מנהל המועדון.

Clause 2 — limitations exist, still fit:

> הנני מצהיר/ה כי למרות המגבלות הרפואיות המצוינות לעיל, הרשום מעלה מסוגל לעמוד במאמץ
> הדרוש לחוג אליו נרשם.

**Which clause applies is fully determined by the health answers already given** — clause 2
if any flag question is `yes` or `restrictions` / `הערות בריאות מיוחדות` is non-empty,
clause 1 otherwise.

**The app must not silently select a legal statement on the parent's behalf.** It renders
the clause that applies to their answers and requires an explicit confirmation of that
clause. One tap, but the parent reads what they are declaring. The confirmed clause id is
stored in the answers and rendered into the PDF.

These two clauses **replace** the current `fit_to_train` and `notify_changes` questions,
which are a weaker paraphrase of the same two sentences.

---

## 4 · The payment terms, transcribed

Supplied as RTL-scrambled text; reconstructed:

```
תנאי תשלום

1. תשלום בצ'קים יתבצע לטובת "עמותת מכבי נתניה סיף ואגרוף".
   תאריך הצ'ק לא יאוחר מה-10 לכל חודש.

2. ביטול מנוי יבוצע בכתב עד ה-27 לחודש, ויהיה תקף לגבי חודשים עתידיים בלבד.

3. בעת ביטול מנוי שנתי, התעריף החודשי יחושב בהתאם לניצול החודשים בפועל של המנוי
   (לדוגמה: אם המנוי ניצל שלושה חודשים, החישוב יבוצע לפי תעריף מנוי לשלושה חודשים).
```

**These are commercial policy, not medical data**, and must not enter the health boundary.

Note for implementers: clause 3 is a *pro-rata re-pricing rule*, not a refund rule. It
changes the rate applied to months already used. It is recorded here as signed text only —
**this design does not automate it.** Billing consequences are out of scope.

---

## 5 · Approach

Three approaches were weighed. The decisive constraint is the health access boundary.

- **A — everything inside `health_declaration`.** Rejected. Anything in
  `answers_encrypted` inherits the health rule: manager+owner only, every read
  audit-logged, excluded from break-glass. A coach could never read a pickup contact, and
  reading a child's address would burn an audit row. An address is not medical data and
  must not be governed as if it were.
- **B — a new `registration_agreement` table.** Cleanest separation, but needs a second
  signature blob or a cross-reference and duplicates signature/audit/PDF machinery
  `health_declaration` already has.
- **C — home each fact properly; the declaration anchors the signature.** **Chosen.**

### C, stated once

| Fact | Home | Governed by |
|---|---|---|
| ת.ז., address, city, phones, grade, aliyah year | `person` / `student` columns | ordinary admin access |
| Pickup contacts | `student_pickup_contact` | ordinary admin access; visible to coaches |
| Health answers + confirmed clause | `health_declaration.answers_encrypted` | health boundary, unchanged |
| Regulations + payment terms acceptance | `consent_record`, type `club_terms` | §11.6 consent ledger |
| Signature, `signed_at`, signer, IP, UA, PDF key | `health_declaration` | unchanged |
| The combined document | rendered PDF | a **view** over all four |

**Consequence worth having:** health changes more often than terms. Because acceptance
lives in the consent ledger rather than welded to the declaration, a parent editing an
asthma answer re-signs the health step and **skips the terms step** when they already hold
the current `club_terms` version. Approach A could not do this.

---

## 6 · Data model — one migration, revision `0018`

Alembic head is `0017`. `main` owns `alembic/versions/**`.

### 6.1 `person` — five nullable columns

```python
national_id_encrypted: Mapped[bytes | None] = mapped_column(
    EncryptedBytes("person.national_id_encrypted")
)
address:    Mapped[str | None] = mapped_column(String(200))
city:       Mapped[str | None] = mapped_column(String(80))
phone_home: Mapped[str | None] = mapped_column(String(32))
aliyah_year_encrypted: Mapped[Any] = mapped_column(
    EncryptedJSON("person.aliyah_year_encrypted")
)
```

`aliyah_year_encrypted` is encrypted because year-of-immigration is national-origin data.
It is collected for the club's עמותה funding reporting, it is optional, and it must never
appear on a roster.

`national_id_encrypted` is encrypted because a ת.ז. is a national identifier and Israel's
Privacy Protection Law treats it as sensitive. The other three are ordinary admin data a
coach may legitimately see; encrypting them would put a coach's roster behind a decrypt.

All five are nullable: every existing row has none of them, and §6.9's anonymisation must
be able to null them.

### 6.2 `student` — one nullable column

```python
grade: Mapped[str | None] = mapped_column(String(20))
```

Free text, not an integer: `ג'` and `גן חובה` are both valid answers to `כיתה/גן`, and the
paper form accepts either.

**`aliyah_year` is NOT here.** The paper form asks "אם אחד מההורים עשה עליה" — it is a fact
about a *parent*, so it lives on that parent's `person` row (§6.1). On `student` it would be
asked once per child and stored twice for a two-child family, with nothing keeping the two
copies in agreement.

### 6.3 `student_pickup_contact` — new table

```python
class StudentPickupContact(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    __tablename__ = "student_pickup_contact"
    student_id: Mapped[uuid.UUID]        # FK student.id, ondelete=CASCADE
    contact_encrypted: Mapped[Any]       # EncryptedJSON: {name, phone, relation}
```

A dedicated table rather than `Guardian` rows with `relation='pickup'`: a `Guardian` needs
a `Person`, and minting person rows for people who will never log in pollutes §5.2's
identity resolution for no gain. Encrypted because it is contact data for a third party who
never agreed to anything.

Read access is **coach and above** — the entire purpose of the field is that whoever is at
the door knows who may collect the child. A pickup contact nobody at the door can read is
write-only data.

### 6.4 `consent_record` — CHECK constraint

`CONSENT_TYPES` gains `club_terms`; the CHECK constraint in
`app/models/health.py` is altered accordingly. One value, not two: the paper form's
signature covers regulations and (now) payment terms as a single acceptance, and splitting
them would let a club change a payment date without re-confirming the regulations it sits
inside.

### 6.5 Migration also seeds

`FULL_TEMPLATE_SCHEMA` **v2** for every existing studio, alongside v1 (which is retained —
declarations already signed carry `template_version = 1` and the PDF renders from the
template they were signed against).

---

## 7 · The club terms — version and text

Follows the precedent already set by `app/services/privacy/policy.py`, verbatim in shape.

New module `app/services/health/club_terms.py`:

```python
#: The club's own reviewed text, unlike POLICY_VERSION's draft. Starts at 1.
CLUB_TERMS_VERSION = 1
```

**Text lives in i18n**, not in the template schema and not in `studio.settings`. The
platform's own terms already do exactly this (`privacy.terms.*` in
`web/packages/i18n/he/reports.ts` + `POLICY_VERSION`), and matching that pattern means the
version-bump-forces-re-acceptance behaviour is already built and tested.

New keys in `web/packages/i18n/{he,en,ru}/health.ts`, Hebrew reference:

| Key | Content |
|---|---|
| `clubTerms.title` | `תקנון ותנאי תשלום` |
| `clubTerms.payment.title` | `תנאי תשלום` |
| `clubTerms.payment.cheques` | clause 1 of §4 |
| `clubTerms.payment.cancellation` | clause 2 of §4 |
| `clubTerms.payment.proRata` | clause 3 of §4 |
| `clubTerms.accept` | `קראתי את התקנון ותנאי התשלום ואני מאשר/ת אותם` |
| `declaration.clause.none` | clause 1 of §3.1 |
| `declaration.clause.limited` | clause 2 of §3.1 |
| `declaration.clause.confirm` | `אני מאשר/ת את ההצהרה שלמעלה` |
| `declaration.specialNotes` | `הערות בריאות מיוחדות` |
| `agreement.signatureLine` | the §3 block-6 sentence, with `GLADIATOR` interpolated from studio name |

### 7.1 One integration hazard

`ConsentService.record` validates `version != POLICY_VERSION` **globally**, so a
`club_terms` grant at version 1 would be rejected while `POLICY_VERSION` is 0.

Fix: a per-type expected version.

```python
def expected_version(consent_type: str) -> int:
    return CLUB_TERMS_VERSION if consent_type == "club_terms" else POLICY_VERSION
```

`GRANTABLE_CONSENT_TYPES` gains `club_terms`. **`REQUIRED_CONSENT_TYPES` does not** — that
tuple drives §6.1 step 5's platform-consent screen, and the club agreement is step 6's
gate, checked separately (§9).

---

## 8 · The flow — three steps, one signature

Replaces today's single-screen `DeclarationForm`. New container
`web/apps/parent/src/features/health/AgreementFlow.tsx`; `DeclarationForm` becomes step 2.

### Step 1 — `פרטי הרשמה`

| Field | Target | Required | Pre-filled |
|---|---|---|---|
| Child first/last name | `person` | ✔ | ✔ confirm only |
| Date of birth | `person.birthdate` | ✔ | ✔ confirm only |
| ת.ז. of child | `person.national_id_encrypted` | ✔ | — |
| כיתה/גן | `student.grade` | ✔ | — |
| כתובת | `person.address` | ✔ | — |
| יישוב | `person.city` | ✔ | — |
| טלפון בבית | `person.phone_home` | — | — |
| נייד של הילד/ה | `person.phone` | — | — |
| דוא"ל של התלמיד/ה | `person.email` | — | — |
| Signing parent name/phone/email | their `person` | ✔ | ✔ confirm only |
| ת.ז. of signing parent | their `person.national_id_encrypted` | ✔ | — |
| Other parent name / ת.ז. / phone | a `Guardian`-linked `person` (§8.1) | — | — |
| Pickup contacts (repeatable) | `student_pickup_contact` | — | — |
| שנת עליה | the immigrating parent's `person.aliyah_year_encrypted` | — | — |

Six required fields are genuinely new typing. The rest is confirmation or optional.

**ת.ז. validation:** the Israeli check-digit algorithm, client and server. A mistyped ID
is worse than a missing one — it is a wrong ID on an insurance list.

#### 8.1 The other parent — what is and is not created

Filling in the second parent creates a `Person` with `auth_identity_id = NULL` and a
`Guardian` row linking them to the student, exactly the shape `registrations.py` already
uses for the submitting guardian. It does **not**:

- send an invitation — §5.2's invite flow is a separate, deliberate act by a manager
- create an `auth_identity` — nobody has logged in as this person
- grant a role — §3.1: guardian is not a role, and there is no code path that grants one

If a `Person` in this studio already matches on ת.ז., it is **reused, not duplicated** —
the ID is the only field on this form that is a reliable key. Matching on name is not
attempted: two siblings' parents share a surname, and a false match writes one family's
ת.ז. onto another's record.

### Step 2 — `הצהרת בריאות`

Today's `DeclarationForm`, unchanged in mechanism (three answer states, `SegmentedControl`,
`visible_if` clearing), minus `fit_to_train` / `notify_changes`, plus:

- `הערות בריאות מיוחדות` free text
- the applicable clause from §3.1, rendered and explicitly confirmed

### Step 3 — `תקנון ותנאי תשלום`

Read-and-accept. Renders `clubTerms.*`. **Skipped entirely** when the signing person
already holds a granted, non-revoked `club_terms` row at `CLUB_TERMS_VERSION`.

Then the signature pad (unchanged `SignaturePad`), under `agreement.signatureLine`.

### Submission — one request, one transaction

`POST /api/v1/students/{id}/agreement` writes, atomically:

1. `person` / `student` column updates + `student_pickup_contact` rows
2. `health_declaration` (superseding any prior — the unique index already enforces this)
3. `consent_record` `club_terms` at `CLUB_TERMS_VERSION`, unless already held
4. the rendered PDF to object storage
5. audit rows for each

**G7 holds throughout:** no answer, no ID number and no pickup contact is ever logged.
Payloads go through `extra=`, never interpolated.

---

## 9 · Existing families

Everyone who signed v1 has no registration data and no `club_terms` acceptance.
**They are blocked at next login until they complete the agreement** — the same hard gate
`HealthGate` already applies, extended to check three conditions instead of one:

```
agreement_complete(student, signer) :=
      student.health_status != 'missing'
  AND student.person.national_id_encrypted IS NOT NULL     -- the child's ת.ז.
  AND student.person.address IS NOT NULL                   -- stands for the §8 required set
  AND student.grade IS NOT NULL
  AND signer.national_id_encrypted IS NOT NULL             -- the signing parent's ת.ז.
  AND a granted, non-revoked club_terms row for `signer`
      at version = CLUB_TERMS_VERSION exists
```

Computed in one place — `app/services/health/agreement.py` — and returned on
`/me/students` so the client never re-derives it. A gate whose condition is spelled out at
two call sites is a gate that will eventually disagree with itself.

This is what the club needs legally: a complete signed agreement per family, not a partial
set. The gate wording tells the parent why they are seeing it again rather than presenting
a blank form they thought they had already filled.

`AppHealthGate.test.tsx` extends to assert that **each** clause of
`agreement_complete` blocks independently — a family failing only the terms clause is
blocked exactly as hard as one with no declaration at all.

---

## 10 · The PDF

`render_declaration_pdf` grows the registration and terms blocks and **loses its
`disclaimer` parameter**. Document order mirrors the paper page, so a manager holding both
can read them side by side:

```
הסכם הרשמה — <studio name> — <school year>
  פרטי התלמיד/ה         (name, DOB, ת.ז., grade, address, city, phones, email)
  פרטי ההורים           (each: name, ת.ז., phone)
  מורשי איסוף            (name, phone)   — omitted entirely when none
  שנת עליה               — omitted entirely when absent
  הצהרת בריאות           (answers, then the CONFIRMED clause, then הערות)
  תקנון ותנאי תשלום      (the three clauses, verbatim)
  <signature line>  <signature image>  <date>
```

The golden fixture `tests/health/golden/declaration.pdf` is **re-baselined**, not patched.
The writer is deterministic by design, so a regenerated fixture stays meaningful.

---

## 11 · Removals — D11's caveat

Four sites. The fourth is code, not copy.

| # | Site | Action |
|---|---|---|
| 1 | `DeclarationForm.tsx:208` | delete the disclaimer `<p>` and its `Card` wrapper if empty |
| 2 | `TemplateEditor.tsx:175` | delete the disclaimer line |
| 3 | `declarations.py` `_DISCLAIMER` + `pdf.py` `disclaimer` param | delete both, and the `_wrap` block at `pdf.py:631` |
| 4 | `is_bundled_default` | delete from `FULL_TEMPLATE_SCHEMA`, the `pop` at `templates.py:213`, the `bundled` branch at `TemplateEditor.tsx:167`, and the `healthClient.ts` field in both apps |

i18n keys deleted from all three locales: `template.disclaimer`,
`template.editingBundled`, `template.editingYours`.

**Why this is safe rather than reckless:** the disclaimer was truthful about a
questionnaire *we* wrote and shipped as a default. The v2 template is the club's own form
and the club's own regulations, signed under the club's own name. Printing "this is not a
compliance document" on the club's own legal instrument would be false.

**What is NOT removed** — these are unrelated to D11's caveat and stay:

- `flag.detailsRestricted` — "the full detail is available to the manager only"
- `documents.viewFullNotice` — "viewing this declaration is recorded in the audit log"
- `badge.missingHint` — "attendance can still be marked"
- every §11.1 / §11.2 / G7 access control and audit rule

---

## 12 · Testing

| Area | Test |
|---|---|
| ת.ז. | check-digit validator: valid, invalid, wrong length, non-numeric, leading zeros |
| Encryption | `national_id_encrypted` and `aliyah_year_encrypted` round-trip; ciphertext differs from plaintext at rest |
| Boundary | a coach may read a pickup contact; a coach may **not** read `answers_encrypted` |
| Clause | flags all-`no` → clause 1 offered; any flag `yes` → clause 2; unconfirmed clause → submission refused |
| Consent | `club_terms` at v1 accepted while `POLICY_VERSION == 0`; wrong version rejected |
| Skip | terms step skipped when current version already held; shown again after a version bump |
| Gate | each clause of `agreement_complete` blocks independently |
| Atomicity | a failure at any of §8's five writes rolls back all of them |
| PDF | golden fixture; every §10 block present; **no disclaimer string anywhere in the bytes** |
| G7 | `test_no_logging.py` extends to ת.ז., aliyah year and pickup contacts |
| i18n | the three deleted keys are absent from all three locales; new keys present in all three |

Existing suites that will fail until updated: `tests/health/test_pdf.py`,
`tests/health/test_templates.py`, `tests/structure/test_health_template_model.py`,
`web/apps/parent/src/features/health/ParentHealth.test.tsx`,
`web/apps/dashboard/src/features/health/DashboardHealth.test.tsx`.

---

## 13 · Explicitly out of scope

- **Automating payment clause 3.** The pro-rata re-pricing rule is recorded as signed text.
  Billing does not read it. Automating it is a separate design.
- **Recurring billing.** Unchanged — הוראת קבע stays manual (CLAUDE.md §Gotchas).
- **A manager-facing editor for the club terms.** Text is in i18n; changing it is a code
  change plus a `CLUB_TERMS_VERSION` bump. Making it studio-editable was considered and
  rejected as premature for one club.
- **Migrating the paper archive.** Existing signed paper forms stay paper.
- **`source_pdf_object_key`.** The column stays; nothing in this design writes it.

---

## 14 · Open questions

None. All six design decisions were taken before this document was written:
health content (structured + club wording), field scope (everything, staged), one document,
consent-ledger recording, pickup contacts surfaced on the student card, and existing
families blocked.
