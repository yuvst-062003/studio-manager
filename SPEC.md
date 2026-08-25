# Studio Manager — Product & Technical Specification

**Version:** 1.0 (draft for review)
**Date:** 2026-08-23
**Status:** Awaiting approval — no implementation has started.

---

## 1. Overview

Studio Manager is a multi-tenant SaaS for martial-arts studios. It replaces the paper
forms, WhatsApp groups and spreadsheets a club currently runs on with three
production applications sharing one backend.

The first customer is **Gladiator Team**, a judo club. The system is built
tenant-generic from day one so additional studios can be onboarded without a
data-model change.

### 1.1 Deliverables

| # | Deliverable | Audience | Distribution |
|---|---|---|---|
| 1 | **Staff app** — installable PWA | Managers and coaches, role-gated | Web, installed to the home screen |
| 2 | **Parent app** — installable PWA | Guardians and adult students | Web, installed to the home screen |
| 3 | **Manager dashboard** — responsive web | Managers and studio owner | Web, installable PWA |
| 4 | **API + workers** | — | Railway |

All three clients live in one npm-workspaces monorepo and share types, API client,
design system and business logic.

### 1.2 Product goals

1. A coach takes attendance for 25 kids in under 10 seconds, on a mat, with no signal.
2. A parent knows where every one of their children needs to be, on one screen.
3. A manager knows exactly who owes money, without a spreadsheet.
4. No child trains without a signed health declaration on file.
5. A new training year is set up in 20 minutes, not a week.

### 1.3 Non-goals

- Studio-facing platform billing (studios do not pay to use this — no trials, no plans).
- Replacing WhatsApp as a chat product.
- Issuing legal tax receipts for non-card payments.
- Automated recurring credit-card billing (uPay cannot support it — see §12).

---

## 2. Scope

### 2.1 In v1 (the release the club receives)

Platform console with studio provisioning · first-run onboarding for both apps · studio
setup wizard · studio/class/group/session structure · staff and role management · student
and guardian management · manager-added, public-link and parent-initiated enrollment · health declarations with a hard
app gate · materialized schedules with per-session overrides · closure calendar with
Israeli holiday presets · public trial-lesson booking and the lead funnel · offline-first
attendance with parent pre-reporting · product catalog · debt escalation · at-risk alerts · events
(competitions, belt exams, seminars, joint training, trips) with RSVP, fees and consent ·
belts and grading history · monthly billing · uPay one-time payments · הוראת קבע
reconciliation with learned payer fingerprints · debt tracking · announcements ·
push/email/in-app notifications · ICS calendar feeds · manager operations and finance
dashboard with export · training-year rollover wizard · full privacy kit · three languages.

### 2.2 Deferred to v2

Group capacity limits and waitlists · coach payroll reports · automated per-guardian monthly
summary emails · split billing across two households · teen student logins · WhatsApp
Business API channel · competition results tracking (brackets, weight categories, medals) ·
automatic age-based student promotion.

### 2.3 Explicitly out of scope

Collecting תעודת זהות numbers · issuing legal חשבונית/קבלה for cash, bank transfer or
הוראת קבע · in-app two-way chat · automated recurring card billing.

---

## 3. Users and roles

### 3.1 Roles, and what is not a role

Two different mechanisms, which must not be conflated.

**Staff roles** are rows in `role_assignment` — granted by a human, scoped, revocable:

| Role | Scope | Granted by |
|---|---|---|
| `platform_admin` | Global | Seeded manually |
| `owner` | One studio | Created with the studio; exactly one; cannot be removed |
| `manager` | One studio | Owner or another manager |
| `lead_coach` | A group | Manager |
| `assistant_coach` | A group | Manager |

**Guardian is not a role.** There is no guardian role to grant, no
`role_assignment` row, and nothing for a manager to assign. A person is a guardian because a
row exists in the `guardian` table linking them to a child:

```
guardian   ← EXISTS(SELECT 1 FROM guardian WHERE person_id = :me)
student    ← EXISTS(SELECT 1 FROM student  WHERE person_id = :me)
```

A guardian is an ordinary user with a login and some children attached. "Adult student" is
likewise not a role — it is one Person who is both the student and their own guardian.

This makes app access a **query, not a role check**: the staff app asks *do you hold any
role assignment?*, the parent app asks *do you have any guardian rows?* (§6.1).

A single Person may hold several staff roles at once, and may simultaneously be a guardian.
"Manager who is also the lead coach of the competitive group and has two kids in the club"
is one person, one login, two role assignments and two guardian rows — never two accounts.

### 3.2 Permission matrix

| Capability | owner | manager | lead_coach | assistant_coach | guardian |
|---|:--:|:--:|:--:|:--:|:--:|
| Studio settings, training year, rollover | ✓ | ✓ | | | |
| Create/edit classes, groups, schedules | ✓ | ✓ | | | |
| Manage staff and role assignments | ✓ | ✓ | | | |
| View all students in studio | ✓ | ✓ | | | |
| View students in own groups | ✓ | ✓ | ✓ | ✓ | own children |
| Take/edit attendance | ✓ | ✓ | ✓ | ✓ | |
| Pre-report an absence | | | | | ✓ |
| Edit a single session (time, place, coach, cancel) | ✓ | ✓ | ✓ | | |
| Create events | ✓ | ✓ | ✓ | | |
| Record belt exam results | ✓ | ✓ | ✓ | | |
| Read health **flags** (asthma, allergy) | ✓ | ✓ | ✓ | ✓ | own children |
| Read full health **declaration** | ✓ | ✓ | | | own children |
| View charges, payments, debts | ✓ | ✓ | | | own students |
| Record a manual payment / adjustment | ✓ | ✓ | | | |
| Run reconciliation, billing runs | ✓ | ✓ | | | |
| Read/write student and session notes | ✓ | ✓ | ✓ | ✓ | |
| Publish announcements | ✓ | ✓ | ✓ (own groups) | | |
| Approve registration requests | ✓ | ✓ | | | |
| Export data, anonymize a student | ✓ | ✓ | | | request only |

Note that the `guardian` column is not a role — it is the permission set that applies to a
person **for the specific students they are a guardian of**, resolved per-record rather than
granted. "own" in that column always means "only for my own children".

**Hard rule:** coaches never see money. No charge, payment, debt or price is reachable
from any coach-scoped endpoint or screen.

### 3.3 Identity model

Four entities, deliberately separated:

- **`auth_identity`** — a Google or Apple login. **Global, not studio-scoped**, so one
  Google account can be a parent at one studio and a coach at another.
- **`person`** — a human profile inside one studio. Has a name, birthdate, phone, photo.
  A person **does not need a login**; `auth_identity_id` is nullable.
- **`guardian`** — a link `(person, student, is_primary)`. **This is the only thing that
  connects a parent to anything.** There is no household or family entity.
- **`role_assignment`** — `(person, role, scope_type, scope_id)`, revocable.

There are exactly **two link tables** in the whole system: `guardian` (parent ↔ student)
and `enrollment` (student ↔ group). A parent is never linked to a class or a group — they
are linked to their children, and their children are linked to groups.

Why this shape:

1. A young student is a Person with no auth identity. The parent runs the app.
2. Attaching an auth identity to an existing student Person later gives them a login with
   **zero migration** — all attendance and belt history stays attached. (v2.)
3. An adult student is their own guardian: one Person who is both the student and the
   primary guardian. No special-casing.
4. A coach who is also a parent is one Person with two role assignments.
5. Anonymization (§11.4) wipes the Person while leaving financial rows intact, because
   financial rows never duplicate a name.

---

## 4. Domain model

### 4.1 Entity relationships

```mermaid
erDiagram
    STUDIO ||--o{ CLASS : has
    STUDIO ||--o{ PERSON : has
    STUDIO ||--o{ LOCATION : has
    STUDIO ||--o{ TRAINING_YEAR : has
    CLASS  ||--o{ GROUP : has
    GROUP  ||--o{ GROUP_SCHEDULE_RULE : has
    GROUP  ||--o{ GROUP_STAFF : staffed_by
    GROUP  ||--o{ SESSION : materializes
    GROUP  ||--o{ ENROLLMENT : has
    SESSION ||--o{ ATTENDANCE : records
    SESSION ||--o{ SESSION_STAFF : substitutions
    SESSION ||--o{ SESSION_NOTE : has
    PERSON ||--o{ GUARDIAN : guardian_of
    STUDENT ||--o{ GUARDIAN : guarded_by
    PERSON ||--o{ CHARGE : owes_as_payer
    PERSON ||--o{ PAYMENT : pays
    PERSON ||--o{ PAYMENT_ORDER : initiates
    PERSON ||--o| AUTH_IDENTITY : may_login_as
    PERSON ||--o{ ROLE_ASSIGNMENT : holds
    PERSON ||--o| STUDENT : may_be
    STUDENT ||--o{ ENROLLMENT : enrolled_in
    STUDENT ||--o{ ATTENDANCE : attends
    STUDENT ||--o| HEALTH_DECLARATION : signed
    STUDENT ||--o{ STUDENT_BELT : awarded
    STUDENT ||--o{ EVENT_REGISTRATION : registers
    STUDENT ||--o{ STUDENT_NOTE : has
    CHARGE ||--o{ PAYMENT_ALLOCATION : settled_by
    PAYMENT ||--o{ PAYMENT_ALLOCATION : allocates
    PAYMENT_ORDER ||--o| PAYMENT : produces
    EVENT ||--o{ EVENT_TARGET : targets
    EVENT ||--o{ EVENT_REGISTRATION : has
    EVENT ||--o{ EVENT_EXAM_RESULT : grades
```

### 4.2 Tenancy

Every tenant-scoped table carries a non-null `studio_id`. Isolation is enforced at three
layers:

1. A `TenantSession` dependency resolves the active studio from the JWT and stores it in a
   request-scoped context.
2. All tenant models inherit a `TenantMixin` whose default SQLAlchemy query option applies
   `WHERE studio_id = :current_studio`. Bypassing it requires an explicit
   `.with_all_tenants()` escape hatch, which is only legal in platform-admin code and in
   background jobs that iterate studios deliberately.
3. A test in the suite asserts every tenant-scoped table has a `studio_id` column and a
   composite index leading with it.

### 4.3 Core tables

Only non-obvious columns are listed. Every table has `id UUID PK`, `created_at`,
`updated_at`. Money is **always `_agorot INTEGER`** — never a float, never a decimal.
Timestamps are **always UTC `timestamptz`** — rendered in the studio's timezone
(`Asia/Jerusalem`).

#### Tenancy and identity

```
studio               name, slug, logo_object_key, timezone, default_locale,
                     status(active|suspended), is_demo BOOL, settings JSONB,
                     created_by_identity_id
                     settings includes: standing_order_link, cash_instructions,
                     billing_day, health_declaration_validity_months,
                     retention_months
auth_identity        provider(google|apple), provider_subject UNIQUE, email,
                     last_login_at, is_developer BOOL  -- GLOBAL, no studio_id
                     is_developer set ONLY by seed/migration (§19)
person               studio_id, auth_identity_id?, first_name, last_name, birthdate?,
                     phone?, email?, photo_object_key?, locale?, anonymized_at?
role_assignment      studio_id, person_id, role, scope_type(studio|class|group),
                     scope_id?, granted_by_person_id, granted_at, revoked_at?
invitation           studio_id, email/phone, intended_role, student_id?, token,
                     expires_at, accepted_at?, accepted_by_person_id?
platform_admin       auth_identity_id
```

#### Students and guardians

```
student              studio_id, person_id UNIQUE,
                     status(lead|trial|pending_approval|active|frozen|left|lost),
                     source?, joined_on?, left_on?, current_belt_id?,
                     health_status(missing|trial_signed|signed), price_plan_id?
                     -- price_plan_id is per STUDENT, not per enrollment (C11).
                     -- One student, one tuition price, however many groups.
guardian             student_id, person_id, is_primary BOOL, relation
                     UNIQUE(student_id, person_id)
student_freeze       student_id, from_date, to_date?, reason, created_by_person_id
student_status_history student_id, from_status?, to_status, reason?, changed_by_person_id?,
                     changed_at
trial_booking        student_id, session_id?, group_id, booked_at, attended BOOL?,
                     outcome(pending|converted|lost)?, coach_note?,
                     is_override BOOL   -- a manager granting a 2nd free trial
```

There is **no household or family entity**. "My children" is simply
`SELECT student_id FROM guardian WHERE person_id = me`.

`is_primary` means exactly two things and nothing more: whose name the bill is addressed
to, and which person a הוראת קבע payment is matched to. **Every guardian on a student —
primary or not — sees and can do exactly the same things, payments included.** There is
one guardian view in the app and no permission branching inside it.

**There is no `payment_mode` on a person.** A payer is never locked into one way of paying;
the payments screen always offers all three (§5.10). What the manager sets is the *price*,
on the group's price plan — never visible as an input anywhere in the parent app.

#### Structure and schedule

```
location             studio_id, name, address, notes
class                studio_id, name, description, discipline, color, is_active
group                class_id, name, description, age_min?, age_max?, is_active
group_staff          group_id, person_id, role(lead_coach|assistant_coach), from, to?
group_schedule_rule  group_id, weekday(0-6), start_time, end_time, location_id,
                     effective_from, effective_to?
training_year        studio_id, name, starts_on, ends_on, status(draft|active|closed)
studio_closure       studio_id, training_year_id, date_from, date_to, reason,
                     source(holiday_preset|manual)
session              studio_id, group_id, training_year_id, starts_at, ends_at,
                     location_id, status(scheduled|cancelled|completed),
                     is_manually_edited BOOL, generated_from_rule_id?, cancel_reason?,
                     is_ad_hoc BOOL
session_staff        session_id, person_id, role, is_substitute BOOL
session_note         session_id, author_person_id, body, deleted_at?
```

#### Enrollment and attendance

```
enrollment           student_id, group_id, status(pending|active|frozen|ended),
                     started_on, ended_on?, attends_weekdays SMALLINT[]?
                     -- attends_weekdays is which of THIS group's weekly sessions the
                     -- student is expected at, 0-6 matching group_schedule_rule.weekday.
                     -- NULL means all of them, which is the common case and the default.
                     -- It carries NO price: tuition is priced per student (C11).
registration_request studio_id, source(public_link|parent_app|manager),
                     payload_encrypted, matched_person_id?, status(pending|approved|
                     rejected), submitted_at, reviewed_by_person_id?, reviewed_at?
absence_report       student_id, session_id, reported_by_person_id, reason?, created_at
attendance           session_id, student_id, status(unmarked|present|absent_excused|
                     absent_unexcused), source(coach|parent|bulk|system),
                     marked_by_person_id?, marked_at, device_marked_at,
                     client_mark_id UNIQUE, note?
```

`attendance` has a unique constraint on `(session_id, student_id)` and a second unique
index on `client_mark_id` for offline idempotency.

#### Health and consent

```
health_form_template  studio_id, kind(full|trial), version INT, schema JSONB,
                      source_pdf_object_key, published_at
health_declaration    student_id, template_id, template_version,
                      answers_encrypted BYTEA, derived_flags JSONB,
                      signature_image_encrypted BYTEA, signed_by_person_id, signed_at,
                      valid_until? NULL, signed_ip, signed_user_agent, pdf_object_key
consent_record        studio_id, subject_type(person|student), subject_id,
                      consent_type(terms|privacy|photo_video|medical_share|event),
                      version, granted BOOL, granted_at, revoked_at?, ip
```

`derived_flags` holds **booleans only** — `{"asthma": true, "allergy": true,
"medication": false}` — never free text. This is what a coach sees. The encrypted
`answers` are readable only by managers and the owner, and every read is audit-logged.

#### Belts and events

```
belt_rank            studio_id, class_id, name, kyu?, order_index, color_hex
student_belt         student_id, belt_rank_id, awarded_on, awarded_by_person_id,
                     event_id?, note?
event                studio_id, type(competition|belt_exam|seminar|joint_training|
                     trip|other), title, description, starts_at, ends_at,
                     location_id?, location_text?, rsvp_deadline?, fee_agorot?,
                     requires_consent BOOL, consent_text?,
                     status(draft|published|cancelled|completed)
event_target         event_id, target_type(studio|class|group|student), target_id
event_registration   event_id, student_id, rsvp(pending|yes|no),
                     responded_by_person_id?, responded_at?, consent_signed_at?,
                     charge_id?, attended BOOL
event_exam_result    event_id, student_id, belt_rank_id, result(pass|fail),
                     examiner_person_id, note?
```

#### Billing ledger

```
price_plan           studio_id, name, sessions_per_week,
                     monthly_amount_agorot, registration_fee_agorot?,
                     active_from, active_to?
                     -- Scoped by TRAINING VOLUME, never by group (C11). "פעמיים בשבוע
                     -- 300", "כל יום 500". A student attending two groups once each
                     -- is on the twice-a-week plan and pays once.
product              studio_id, name, description?, price_agorot, is_active
                     -- a catalog of sellable items (גי, חגורה, כפפות, דמי ביטוח).
                     -- Selling one creates a normal charge. NO stock counts:
                     -- inventory is a different product.
charge               studio_id, payer_person_id, student_id?,
                     kind(tuition|registration|event|manual),
                     period_year?, period_month?, amount_agorot,
                     original_amount_agorot?, proration_note?, due_date,
                     status(open|settled|void|written_off),
                     created_by(billing_run|manual|event), created_by_person_id?
billing_run          studio_id, period_year, period_month, started_at, finished_at?,
                     charges_created INT, status(running|completed|failed), log JSONB
payment              studio_id, payer_person_id, method(upay_card|standing_order|
                     bank_transfer|cash|credit_adjustment), amount_agorot, received_at,
                     recorded_by_person_id?, payment_order_id?, upay_ipn_id?, note?,
                     reversed_at?, reversal_reason?
payment_allocation   payment_id, charge_id, amount_agorot
payment_order        studio_id, payer_person_id, public_ref UUID UNIQUE,
                     expected_amount_agorot, max_payments INT,
                     status(pending|paid|failed|amount_mismatch|expired),
                     created_at, expires_at, paid_at?, external_payment_ref?
payment_order_charge payment_order_id, charge_id
upay_ipn_record      received_at, source_ip, raw_query TEXT, order_public_ref?,
                     transactionid, amount, card_owner_name, four_digits, payment_date,
                     matched_payment_id?, match_status(auto|manual|unmatched|ignored)
payer_fingerprint    studio_id, payer_person_id, four_digits, card_owner_name_normalized,
                     confidence, first_seen, last_seen, confirmed_by_person_id
recurring_subscription studio_id, payer_person_id, amount_agorot, start_date,
                     status(active|cancelled), cancelled_at?
```

**Charges are never mutated to record payment.** A charge is settled when the sum of its
`payment_allocation` rows equals `amount_agorot`. `charge.status` is a derived cache
maintained in one place (`BillingService.recompute_charge_status`).

`charge.payer_person_id` is captured at creation time from the student's primary guardian.
If the primary guardian changes later, historical charges stay with whoever actually owed
them.

#### Communications and platform

```
announcement          studio_id, author_person_id, title, body,
                      scope_type(studio|class|group), scope_id?, scheduled_for?,
                      published_at?
notification          studio_id, person_id, kind, title, body, payload JSONB,
                      read_at?, created_at
notification_delivery notification_id, channel(push|inapp),
                      status(queued|sent|delivered|failed|no_token|denied),
                      provider_message_id?, error?, sent_at?
push_token            person_id, app(staff|parent), platform(ios|android|web),
                      token UNIQUE, last_seen_at
calendar_feed         studio_id, subject_type(guardian|coach), person_id,
                      token UNIQUE, rotated_at?
audit_log             studio_id?, actor_person_id?, actor_identity_id?, actor_ip,
                      action, entity_type, entity_id, is_sensitive BOOL,
                      diff JSONB, created_at
data_export_request   studio_id, subject_person_id, requested_by_person_id, status,
                      object_key?, completed_at?
```

---

## 5. Feature specifications

### 5.1 Studio creation and onboarding

**Studios are provisioned by the platform operator, never self-created.** There is no
"צור סטודיו" button anywhere in the staff app. The chain of authority is:

```
platform_admin  ──creates studio + designates──►  owner
       owner    ──invites──►  managers
    manager     ──invites──►  coaches
    manager     ──invites──►  guardians (via student enrollment)
```

The platform console (web, `platform_admin` only) creates a studio with its name, timezone
and default language, and sends an invitation to the person who will be its owner. It also
lists studios, suspends them, and shows aggregate usage. A `status = pending_approval` value
exists in the enum and is unused, so an approval workflow can be added without a migration.

Consequence for sign-in: an auth identity with **no role assignment in any studio cannot
enter the staff app at all** (§6.1). Nobody enrolls themselves into the business side.

**Studio setup wizard.** Once the owner accepts, the staff app and dashboard route them
into a resumable wizard, and a progress checklist stays on the dashboard until it is
complete: studio details and logo → create a class → create a group → set the group's
weekly schedule → assign a coach → set a price → define the training year and closures →
generate sessions → invite the first student's guardian. Each step can be skipped and
returned to; progress is persisted so the wizard survives a closed app.

### 5.2 Authentication

- Providers: **Google and Apple only.** No passwords, no phone OTP, no email magic links.
- Apple is offered alongside Google but is **no longer mandatory**: Guideline 4.8 binds only
  App Store builds, and §6.5 ships no App Store build. It stays because a meaningful share of
  Israeli iPhone users prefer it, and retrofitting it later would be an identity migration.
- **OAuth must never run inside a webview.** Google returns `disallowed_useragent`. An
  installed PWA does not use one — the flow is a standard top-level redirect, then PKCE code
  exchange server-side, returning to the app's start URL. A home-screen web app on iOS opens
  the redirect in its own standalone context; verify the session survives the round trip on a
  real device, because this is the one place the install mode changes auth behaviour.
- Backend issues its own short-lived access JWT (15 min) plus a rotating refresh token
  (30 days, one-time-use, reuse detection revokes the family of tokens).
- The JWT carries `identity_id`, `active_studio_id` and a role snapshot. Role changes take
  effect on the next refresh, at most 15 minutes later. Revocations (removing a coach) are
  written to a small denylist checked on refresh.
- **Account linking:** if a person signs in with Apple using a Google-verified email
  already on file, the identities are linked automatically **only when Apple reports
  `email_verified` and the email is not a private relay address**. Otherwise the user is
  asked to confirm by opening an invitation link sent to the original address. Apple's
  private-relay addresses are stored as-is and never used for matching.
- A person belonging to more than one studio gets a studio switcher; otherwise it is hidden.

### 5.3 Students and guardians

- A student has one or more **guardians**. Any number, no household entity.
- **All guardians are equal.** Every one of them sees schedule, attendance, health
  declaration, belts, announcements and payments for their students, and any of them can
  pay. One guardian view, no permission branching.
- Exactly one guardian per student carries `is_primary`. That flag decides only whose name
  the bill is addressed to and which person a הוראת קבע payment is matched to.
- A guardian with several children sees all of them in one app. Adding a second child is a
  single manager action — no second invitation, no second account, nothing for the parent
  to do.
- Two parents on the same child are simply two guardian rows. Splitting one bill between
  two households is not modelled in v1 (§16).
- An adult student is their own guardian: one Person who is both the student and the
  primary guardian.
- Guardians are invited by email or phone; the invitation carries a token binding the
  accepting auth identity to the pre-created Person.

### 5.4 Enrollment

A parent never enrolls *themselves* in anything. They register **children**, each child is
enrolled in **one or more groups**, and the parent sees those groups through their children.

`enrollment` is a link table (§3.3) and always was — a child in the competition group *and*
the teenagers group is two rows, which the club confirmed is normal. **Two enrollments are
still one tuition charge**: tuition is priced per student by training volume, not per group
(§5.10). Each enrollment carries `attends_weekdays`, which of that group's weekly sessions
the child is actually expected at.

**Enrollment is always a manager decision.** The public link's only job is to get someone
through the door for a first lesson; nobody enrolls themselves.

**a) Manager-added (staff app or dashboard).** `+ תלמיד חדש` → parent details → child
details and group → `+ הוסף ילד נוסף` for each additional child → save. Creates everything
immediately with `health_status = missing`, and sends the parent an invitation. The parent
completes the full health declaration through the app gate (§5.5) — **the manager never
types a health form.**

**b) Public trial link → manager converts.** The public URL and QR are for **booking a first
free lesson only** (§5.4a). After the trial the manager converts the lead into a student,
picks the group and sets the price; the parent then completes the full health declaration
and consents through the app gate.

This split matters. A full registration form — health declaration, consents, payment — is an
enormous ask of someone whose entire intent is *"my kid wants to try judo"*, and every field
is a place to abandon. Splitting it puts each job where it belongs:

| | Who | What they provide |
|---|---|---|
| **Trial booking** | Public link | Name, age, parent name, phone. **Four fields.** |
| **Conversion** | Manager | Decides they're in, picks the group, sets the price |
| **Full data** | Parent, in-app | Health declaration + consents, via the existing gate |

The public link therefore stops being an admin form and becomes a **marketing asset** — put
it on Instagram, on a flyer QR, in the club's bio.

**c) Parent adds a sibling from inside the app.** An existing guardian taps `+ הוסף ילד`,
fills the child form and picks a group. This creates a `registration_request` with
`source = 'parent_app'` and `matched_person_id` set — **a request, not an enrollment.** The
manager approves it, consistent with (b): conversion is always a human decision.

#### 5.4a Trial lessons and the lead funnel

**A lead is just a student in an early status.** No parallel entity, no union queries — a
trial person is a real `student` who simply has **no `enrollment`**, which is what makes
everything else work automatically.

```
lead ──► trial ──► pending_approval ──► active ──► frozen ──► left
   │                                                      ↘ lost
```

Because there is no enrollment: the billing run generates **no charges** (it only walks
active enrollments), they are excluded from active-student counts, and attendance, rosters,
notes and health declarations all work with zero special-casing.

```
① BOOK      A public LANDING PAGE at /t/{studio-slug} — the club's shop window, not a
            form. Logo, photos, what the club does, where and when, and one offer:
            "שיעור ניסיון חינם". A per-group QR pre-selects that group.

            [ קבע שיעור ניסיון ]
                 ↓
            1. התחברות      [ המשך עם Google ]  [ המשך עם Apple ]
                            System browser, same rules as everywhere else.
                            → auth_identity + person created NOW
            2. פרטי הילדים   name · birthdate · class ▸ group   (groups filtered
                            by the child's age where age_min/age_max are set)
                            [ + הוסף ילד נוסף ]  — several children in one booking
            3. הצהרת בריאות  the SHORT trial form + drawn signature, per child
                            (health_form_template kind='trial')
            4. בחירת שיעור   the next N upcoming sessions of each chosen group,
                            one pick per child
            5. אישור         "נתראה ביום א' 17:00"  ·  [ הוסף ליומן ]  ·  .ics
                 ↓
            → Student(status=trial) + guardian(is_primary) + trial_booking(session_id)
              + health_declaration(kind=trial) per child
            → the parent lands DIRECTLY in the parent app, already signed in

            The parent authenticates **before** entering child details. Three consequences
            worth stating: there is no invitation email and no waiting, so the funnel has
            one less place to leak; the profile exists in the parent app the moment they
            finish, in `trial` state; and a person who abandons after step 1 leaves a Person
            with no students, which the parent app renders as a resume-booking prompt and
            the retention job cleans up if nothing follows.

            A manager can also log a phone enquiry, producing the same rows.

② BEFORE    Manager sees a "שיעורי ניסיון" queue on the dashboard
            Parent reminder 24h ahead
            The roster marks trial students unmistakably — a manager or coach taking
            attendance must be able to see at a glance that this child is not enrolled:

              👤  נועה לוי          ניסיון · שיעור ראשון
                  ⌐ לא רשומה לקבוצה · אין חיוב

            The `ניסיון` chip appears on the roster row, on the student card, in the
            session header count ("22 רשומים · 1 ניסיון"), and in the manager's daily
            summary. `student.status = 'trial'` is surfaced everywhere a student is
            rendered — never inferred from the absence of an enrollment.

③ LESSON    Coach marks attendance exactly as normal — the trial row is flagged
            Coach can leave a note ("מתאימה למתחילים" / "צעירה מדי לקבוצה הזו")

④ FOLLOW-UP Day 1 "איך היה?" · day 3 · day 7 — the 7–14 day conversion window
            every buyer's guide names as decisive

⑤ OUTCOME   Manager converts → picks group, sets price, status=active,
            enrollment created, parent completes the FULL health declaration
            No conversion after N days → status=lost, with a reason
```

**One free lesson per student, full stop.** A second free trial requires a manager to grant
an override in one tap (`trial_booking.is_override`), so a child torn between judo and
karate isn't lost to a rule nobody meant to be that strict — but nobody trains free forever
by rebooking.

**The trial declaration is not sufficient for enrollment.** `health_status` moves
`missing → trial_signed → signed`; converting requires the full form.

**An unconverted lead is still personal data about a minor.** The retention job (§11.5)
anonymizes leads that never converted on the same schedule as students who left.

`student_status_history` records every transition, which yields the funnel report for free:
**enquiries → trials booked → trials attended → converted**, sliced by source and by month.
That is the question every studio owner asks, and the one Arbox users complain requires
exporting a spreadsheet.

**Person matching.** Before a request enters the queue, the submitted email and phone are
matched against existing people in the studio. The queue shows the difference plainly:

```
יעל כהן · הורה חדש                יעל כהן · הורה קיים
  דנה כהן, 8   → ג'ודו/מתחילים      + נועה כהן, 6 → קראטה/ילדים
  יוסי כהן, 11 → ג'ודו/נבחרת        ⚠ תלמיד דומה קיים: נועה כהן, 6
  ✓ הצהרות בריאות  ✓ אישורים        ✓ הצהרת בריאות
      [ דחה ]      [ אשר ]              [ דחה ]   [ מזג ]   [ אשר ]
```

A matched parent is **never duplicated** — approval attaches the new children to their
existing Person, and they appear in the app the parent is already using. No second
invitation, no second account, no second login.

**Duplicate-child detection.** If a submitted child's name and birthdate closely match an
existing student, the manager sees a warning and can merge into the existing student rather
than creating a second one.

**Approval transaction.** Approving creates, atomically, for each child in the request:
Person → Student → Guardian(`is_primary` on the submitting parent) → Enrollment →
HealthDeclaration → consent records; and on the parent: Person (or the matched one) and an
Invitation if they have no login yet.

**Worked example — two children at once.** יעל submits one form with דנה (ג'ודו/מתחילים)
and יוסי (ג'ודו/נבחרת). The manager approves once. Result: `Person(יעל)`,
two Students, two Guardian rows both `is_primary`, two Enrollments
into two different groups, two signed health declarations, one invitation. יעל signs in
with Google and both children are already there.

**Worked example — a third child a month later.** Any of the three paths above. Two rows
are added — `Student(נועה)` and `Guardian(נועה ← יעל)` — plus her enrollment. יעל's app
now lists three children; nothing else about her account changes. נועה's first charge is
prorated by remaining sessions (`320 × 2/8 = 80₪`), and from the following month a single
payment link covers all three children.

No capacity limits and no waitlist in v1. A group can be over-subscribed; the dashboard
shows current enrollment counts so a manager can see it happening.

**Leaving.** A manager ends an enrollment with an effective date. Notice must be given
before a month begins — ending an enrollment mid-month does **not** void that month's
charge and produces no refund. The student's status becomes `left`; all history is retained.

**Freezing.** A manager freezes a student for a date range (injury, trip, army). While
frozen: no charges are generated, the enrollment and the spot are retained, the student
does not appear on attendance rosters, and the guardians see "מוקפא" with the return date.

### 5.5 Health declarations

**This is a hard gate.** A guardian cannot use the parent app for a student until that
student's declaration is signed. On first login, if any linked student has
`health_status = missing`, the app routes to the declaration flow and no other screen is
reachable.

- The form is a **structured template derived from the studio's existing PDF**. The PDF is
  mapped once into `health_form_template.schema` (a versioned JSON schema of sections,
  questions and types) and the original is kept at `source_pdf_object_key` for reference.
- The guardian answers the questions and **draws a signature** with their finger.
- On submit the backend stores: encrypted answers, encrypted signature image, the template
  version, the signing person, timestamp, IP and user agent — and **renders a filled,
  signed PDF** which is saved to object storage and downloadable by the guardian and by
  managers.
- **Declarations do not expire.** `valid_until` is nullable and left `NULL`. A studio
  setting `health_declaration_validity_months` exists, defaults to `null` (never expires),
  and when set turns on renewal reminders and expiry. This is a config flag, not a migration.
- Coaches see **only** `derived_flags` — a ⚠ badge with "אסתמה" or "אלרגיה" on the roster.
  Reading the full declaration requires manager or owner and is audit-logged.
- **A missing declaration never blocks anything in the app.** The roster shows a ⚠ with
  "הצהרת בריאות חסרה" and a one-tap "שלח תזכורת להורה". The parent gets escalating
  reminders on days 1, 3 and 7. The manager dashboard lists every student missing one. The
  coach can still mark them present.

  This is deliberate, not a compromise. Blocking a row in an app does not stop a child from
  stepping onto a mat — the coach controls that physically and can simply decline to accept
  the child. A hard block would only stop the *record* from being accurate, making the data
  worse without making anyone safer. The app's job is to make the gap impossible to miss and
  to chase the parent; the decision stays with the people actually in the room. There is
  therefore **no `block_attendance_without_health` setting** — nothing to configure.

**Hebrew PDF rendering** requires an embedded RTL-capable font (Noto Sans Hebrew) and
explicit bidi handling. This is a known-fiddly area and gets its own test fixture
comparing rendered output against a golden PDF.

### 5.6 Classes, groups and schedules

Structure, using the customer's own vocabulary:

```
Studio: "Gladiator Team"
├── Class: "ג'ודו"
│   ├── Group: "מתחילים"   — א' 17:00–19:00 · ו' 12:00–14:00
│   ├── Group: "מתקדמים"
│   └── Group: "נבחרת"
└── Class: "אומנויות לחימה"
    └── Group: "כללי"
```

- A **Class** is a discipline. It has no schedule and no roster.
- A **Group** is a roster. It owns the weekly schedule rules, the coaching staff and the
  price plan. Students enroll in a **Group**.
- A **Session** is one dated occurrence of a group. Attendance is taken on a session.

**Materialization.** When a group's schedule is set, sessions are generated as real rows
for the **entire training year**, skipping dates covered by `studio_closure`.

**Changing a schedule rule** rewrites only sessions with `starts_at > now()`. Two
categories are protected and never overwritten:
1. Sessions in the past — historical attendance keeps its true times.
2. Sessions with `is_manually_edited = true`.

The change dialog shows exactly what will happen before confirming:

```
שינוי לוח זמנים — ג'ודו / מתחילים
מ:  א' 17:00–19:00  ·  ו' 12:00–14:00
ל:  א' 17:30–19:30  ·  ו' 12:00–14:00

  ✓ 32 שיעורים עתידיים יעודכנו
  ✕ 18 שיעורים שהתקיימו — ללא שינוי
  ✕ 2 שיעורים שעודכנו ידנית — ללא שינוי  ⚠
      · 15.11 אימון ים 90 דק'
      · 22.11 אימון משותף
```

**Per-session overrides.** A manager or lead coach can change any single session's start
time, duration, location and staff, or cancel it with a reason. Doing so sets
`is_manually_edited = true`. They can also add an ad-hoc session that belongs to no rule.

**Closures.** The training-year setup pre-fills Israeli holidays (ראש השנה, יום כיפור,
סוכות, פסח, יום העצמאות, שבועות and חופש גדול) as **proposals the manager ticks**. Nothing
is closed automatically — studios differ, and a wrong guess deletes real lessons. Manual
closure ranges can be added at any time; adding one cancels the affected sessions and
notifies the affected guardians.

### 5.7 Attendance

**States and transitions.** Four states, and `unmarked` is a real state — never an
assumption:

| State | Meaning |
|---|---|
| `unmarked` | Nobody has said anything. A session left entirely unmarked appears as a gap in reports, never as 25 present students. |
| `present` | Marked present by a coach, individually or via bulk. |
| `absent_unexcused` | Marked absent by a coach; nobody warned us. |
| `absent_excused` | A guardian pre-reported the absence, or a coach explicitly marked it excused. |

**Who is expected, and who is merely enrolled.** A student enrolled in a group that trains
twice a week may be signed up for only one of those days — the manager sets which, per
student, in `enrollment.attends_weekdays`. That is **not a fifth attendance state.** The
four above record what somebody *said*; expectation records what was *asked of them*, and
the two are independent axes:

- The roster lists the students **expected** at that session. Students enrolled in the group
  but not expected today sit in a separate collapsed section beneath it, `לא אמורים להגיע
  היום`, and can still be marked — a child who turns up on an extra day is a real child.
- `סמן הכל נוכח` never touches that section, and its rows never count toward `לא סומן`.
- Every denominator in §5.14 counts **expected** sessions only. A twice-a-week student who
  attends both their days is at 100%, not 50%, and the at-risk rule counts consecutive
  missed *expected* sessions.
- `attends_weekdays IS NULL` means "all of this group's sessions", which is the default and
  the common case. A group that trains once a week never needs the column set.

**Money does not read this.** The monthly fee buys the slot, not the sessions (below), and
tuition is priced per student by training volume (§5.10). `attends_weekdays` is what the
manager and the child agreed to; it is the input to the volume the price is *set* against,
never a per-session meter.

**Parent pre-reporting.** A guardian taps "לא אגיע היום" on an upcoming session, optionally
with a reason. This writes an `absence_report` and sets the attendance row to
`absent_excused` with `source = parent`.

**The bulk rule.** "סמן הכל נוכח" sets every `unmarked` row to `present`. It **does not
touch** rows that are `absent_excused` with `source = parent`, and it does not touch rows a
coach has already set. A pre-reported absence can only be changed by an explicit coach tap.

Roster interaction: tapping a row cycles `unmarked → present → absent_unexcused → unmarked`;
an excused absence shows as ✕ with a "הודיעו מראש" label and requires a long-press to override.

```
ג'ודו / מתחילים  ·  א' 17:00
נוכחות: 22 · חסרים: 2 · לא סומן: 1

      [  ✓  סמן הכל נוכח  ]

 ✓  דנה כהן
 ✓  יוסי כהן
 ✕  נועה לוי        הודיעו מראש
 ✓  איתי מזרחי
 ✕  רוני ברק
 ○  עמית שרון       לא סומן
 ⚠  ליאם דוד        הצהרת בריאות חסרה
```

**Offline-first.** This is the single most adoption-critical feature.

- On app open, and again at each session start, the staff app caches today's and tomorrow's
  sessions with full rosters into IndexedDB.
- Marks are written to the local store first and the UI updates immediately. Each mark
  carries a client-generated `client_mark_id` (UUID) and a `device_marked_at`.
- A background sync queue flushes to `POST /api/v1/attendance/batch` when connectivity
  returns. The endpoint is idempotent on `client_mark_id`.
- Conflict rule: **last write by `device_marked_at` wins**, with the exception that a
  parent pre-report never loses to a bulk mark, regardless of timestamp.
- The UI shows a persistent badge: "3 שיעורים ממתינים לסנכרון", tappable to see what's queued.
- If a queued mark is rejected (session deleted, student unenrolled), it surfaces as a
  dismissible conflict card rather than being silently dropped.

**Consequences of absence.** None, financially. The monthly fee buys the slot, not the
sessions. Absences are recorded and reported only.

### 5.8 Events

An Event is a first-class scheduled item that is not part of a group's weekly pattern.

Types: `competition`, `belt_exam`, `seminar`, `joint_training`, `trip`, `other`.

An event targets any mix of studio, classes, groups or individual students via
`event_target`. Every targeted student gets an `event_registration` row with
`rsvp = pending`.

```
תחרות אליפות המרכז
ו' 12.09.2026 · 08:00 · אולם נוקיה, ראשל"צ

קבוצות: ג'ודו/נבחרת · ג'ודו/מתקדמים
עלות: 120₪ · הרשמה עד 05.09
דרוש: אישור הורה ✓

נרשמו  14   טרם ענו  6   לא מגיע  3
שולם   11 / 14

[ תזכורת למי שלא ענה ]
```

- **RSVP.** Guardians get a push and an in-app card and answer מגיע / לא מגיע before
  `rsvp_deadline`. Managers can nudge non-responders in one tap.
- **Fee.** If `fee_agorot` is set, confirming attendance creates a `charge` with
  `kind = 'event'` for that student's payer, payable through the standard uPay one-time
  flow. For payers in `standing_order` mode the charge appears in the manager's collection
  list, exactly like tuition.
- **Consent.** If `requires_consent`, the guardian must sign the event's consent text
  (a `consent_record` with `consent_type = 'event'`) before the RSVP counts as confirmed.
- **Attendance** is taken on an event with the same UI and offline behaviour as a session.
- Events appear in the parent app, the staff app and the ICS calendar feed, and each has an
  explicit "הוסף ליומן" button in addition to the subscription feed.

### 5.9 Belts and grading

- `belt_rank` is defined per class, ordered, with a name, optional kyu number and a colour.
  A judo default set is seeded and fully editable.
- `student.current_belt_id` points at the current rank; `student_belt` is the full history.
- A **belt exam** is an `event` with `type = 'belt_exam'`:
  1. A lead coach or manager creates the exam and nominates candidates (targeting students
     directly rather than whole groups).
  2. On the day, the examiner records pass/fail per candidate with an optional note.
  3. A pass writes an `event_exam_result`, creates a `student_belt` row, and updates
     `student.current_belt_id` — in one transaction.
  4. The guardians receive a notification, and the belt appears on the profile with
     the award date.
- The parent app shows a belt progression strip on the student page: belts earned, dates,
  and the current rank highlighted.

### 5.10 Payments and billing

The application ledger is the source of truth. uPay is one of several ways money arrives.

#### Pricing

A `price_plan` is **scoped by training volume and attaches to a student**, never to a
group. It carries `sessions_per_week`, a `monthly_amount_agorot` and an optional
`registration_fee_agorot` — "פעמיים בשבוע · 300", "כל יום · 500". Plans are versioned by
`active_from`/`active_to` so a price change never rewrites history.

**A group has no price.** The club prices by how often a child trains, independent of which
groups those sessions belong to, so a child in two groups who comes twice a week pays the
twice-a-week price once. Attaching the plan to the group instead would charge that child
twice a month, at two different prices, silently and forever.

The manager sets `student.price_plan_id` at conversion (§5.4). The app shows the child's
**derived weekly volume** — the sessions per week implied by their enrollments'
`attends_weekdays` — beside the plan picker, so a mismatch between what a child attends and
what they are billed for is visible at the moment the price is set. It is a suggestion, not
a computation: the manager decides, and a discount is a negative `manual` charge as it
always was.

#### The monthly billing run

A worker job runs on a configurable day (default the 1st) for each active studio:

1. For every **student** with at least one `active` enrollment and not covered by a
   `student_freeze`, create **one** `charge` with `kind = 'tuition'` for that period, at
   their `price_plan`'s amount. **One student, one tuition charge, however many groups
   they are enrolled in.** Walking enrollments instead is the C11 defect: it bills a child
   in two groups twice.
2. **First-month proration.** If the enrollment started mid-period:
   `amount = round(monthly × remaining_sessions ÷ total_sessions_in_period)`, using
   materialized sessions — not calendar days. The original amount and a human-readable
   `proration_note` are stored so the parent sees "בגין 3 מתוך 8 שיעורים".
3. Every subsequent month is the flat monthly amount. Closures, holidays and absences
   never change it.
4. A frozen student generates nothing.
5. The run is **idempotent**: re-running for the same period creates no duplicates
   (unique on `student_id, period_year, period_month, kind`). Keying this on
   `enrollment_id` is what would let a second enrollment raise a second charge, so the
   uniqueness index is the structural half of the rule above, not a nicety beside it.
6. Registration fees are charged once per **student**, on the first billing run after
   their first enrollment — never again when they add or change a group.

#### How a parent pays

The **manager sets the price** on the group's price plan. The **parent chooses how to pay**
— and **all three options are always visible**. Nothing is ever hidden from the payments
screen, and there is no persistent payment mode stored on a person.

```
תשלומים

חובות פתוחים
  ספטמבר 2026   דנה   320₪
  ספטמבר 2026   יוסי  320₪
  אוקטובר 2026  דנה   320₪
  אוקטובר 2026  יוסי  320₪
                        ─────
  סה"כ חוב            1,280₪

איך תרצה לשלם?
┌─────────────────────────────────────┐
│ 💳  כרטיס אשראי                      │
│     בחר חודשים   [1] [2] [3] [6]     │
│     תשלומים בכרטיס  [1] [2] [3]      │
│     סה"כ 1,280₪        [ לתשלום ]    │
├─────────────────────────────────────┤
│ 🔁  הוראת קבע                        │
│     קישור להקמת הוראת קבע  ▸         │
│     ⚠ רשומה הוראת קבע פעילה —        │
│        ודא שאינך משלם פעמיים         │
├─────────────────────────────────────┤
│ 💵  מזומן                            │
│     שלמו למאמן בתחילת החודש          │
└─────────────────────────────────────┘
```

**כרטיס אשראי.** Choosing N months selects the N oldest unpaid tuition charges **across
every student this person is the payer for**, creates **one** `payment_order` covering all
of them, and opens uPay.

**הוראת קבע.** Shows the studio's `standing_order_link` — the shared recurring link the
manager created once in the uPay dashboard and pasted into studio settings — with
instructions. The app cannot confirm these payments (§12), so the charges stay open until a
manager reconciles them.

**מזומן.** Shows the studio's `cash_instructions`. No order is created; a manager later
records `payment.method = 'cash'` and it allocates like any other payment.

**Double-payment protection**, since nothing is hidden:

1. A charge already covered by an open or paid `payment_order` is **not selectable** in the
   credit-card option. This is the primary guard and it works no matter which route they use.
2. If the payer has an active `recurring_subscription`, the credit-card option shows a
   warning before opening uPay. A **warning, not a block** — the parent decides.
3. If they pay twice anyway, the surplus surfaces as an overpayment in the manager's
   reconciliation queue and can be allocated forward to next month's charge.

`recurring_subscription` is the **manager's** record of who is on הוראת קבע — the manager
necessarily knows, because they handed out the link. It drives the "expected to pay this
month" column in the reconciliation queue and the warning above. The parent never sets it.

#### uPay one-time flow

Per `upay-integration.md`, using the server-rendered form POST integration.

1. Backend creates a `payment_order` with a **`public_ref UUID`** and
   `expected_amount_agorot`, and links the covered charges.
2. Backend renders the uPay form with `amount`, `paymentdetails = public_ref`,
   `returnurl`, `ipnurl = /webhooks/upay/{public_ref}`, `maxpayments`,
   `createinvoiceandreceipt=1`, `lang=HE`, `currency=NIS`, and auto-submits it.
3. The parent pays on uPay's hosted page. Card data never reaches our servers.
4. uPay sends an unsigned IPN `GET` roughly 5 minutes later.
5. `returnurl` renders a "התקבל, מאמת תשלום…" page. **The redirect is never the source
   of truth** — a closed tab still produces an IPN.

**Security requirements — all mandatory:**

| Threat | Mitigation |
|---|---|
| Anyone can forge an IPN for a guessed order | `public_ref` is a **UUIDv4**, never a sequential id. Sequential ids in this endpoint would let anyone mark any tuition paid. |
| No signature on the callback | Source-IP allowlist (`84.95.87.35`, configurable). Treated as one weak layer, not proof. |
| Client tampers with `amount` before submitting | Never trust the IPN's amount. Compare against `expected_amount_agorot`. |
| Amount mismatch leaves real money received | Explicit `amount_mismatch` status. A `payment` **is** recorded for the real amount received, allocated to nothing, and a high-priority manager alert is raised. Charges are **not** settled. |
| Duplicate IPN delivery | Idempotent on `transactionid`. A second delivery is logged and ignored. |
| IPN never arrives | Nightly job flags orders `pending` for more than 24h; the dashboard shows them for manual verification against uPay's own reports. |
| Slow processing causes uPay retries | The endpoint persists the raw `upay_ipn_record` and returns 200 immediately; all processing happens in a worker. |

Every IPN is persisted verbatim in `upay_ipn_record` whether matched or not.

#### הוראת קבע reconciliation

uPay cannot create a per-payer recurring mandate, cannot vary the amount per payer, and
provides **no field identifying which customer paid**. This is a confirmed provider
limitation, not a design choice.

The system therefore never claims to know. Instead it makes the manager's monthly
reconciliation fast and progressively more automatic:

1. All IPNs from the shared recurring link arrive with no `public_ref` and land in
   `upay_ipn_record` with `match_status = 'unmatched'`.
2. The dashboard shows a two-column reconciliation screen: unmatched payments on one side
   (amount, card owner name, last 4 digits, date), payers expected to pay this month on
   the other.
3. When a manager confirms a match, the system creates a `payment` with
   `method = 'standing_order'`, allocates it to that payer's open charges oldest-first,
   and writes a **`payer_fingerprint`** of `(normalized card owner name, last 4 digits) → payer`.
4. Next month, arriving IPNs are **pre-matched** against fingerprints and presented as
   suggestions with a confidence indicator. The manager confirms with one tap.
5. **Suggestions are never auto-applied.** A wrong automatic match marks the wrong payer
   paid and sends the wrong parent a debt reminder — an expensive bug in a small community.
   A human always confirms.

Month 1 is fully manual. By month 3 most rows are one-tap confirmations.

#### Debt escalation

A charge that passes its due date unpaid triggers an escalating ladder rather than sitting
silently in a report: **day 3** a gentle reminder to the payer, **day 7** a firmer one,
**day 14** a final notice plus a task on the manager's dashboard. Aged debt (0–30, 31–60,
60+) is on the finance report. This is the "failed-payment recovery" that Gymdesk and Arbox
both advertise, built on notifications that already exist.

#### Selling items

A small `product` catalog (גי, חגורה, כפפות, דמי ביטוח) with names and prices. A manager
picks an item for a family instead of retyping "גי מידה 140 — 180₪" every time; it creates a
normal `charge` with `kind = 'manual'`, payable through the standard flow. **No stock
counts, no inventory** — that is a different product and it is not this one.

#### Manual payments and adjustments

Managers record cash, bank transfer or any other payment with method, amount, date and an
optional note. Managers can also add a `manual` charge — positive for an extra item,
**negative for a credit or discount** — with a mandatory reason. Both are audit-logged.

#### Receipts

uPay issues its own חשבונית/קבלה for card payments via `createinvoiceandreceipt=1`. The
system does **not** issue tax documents for cash, bank transfer or הוראת קבע — the studio's
bookkeeper handles those. An optional free-text `external_receipt_number` field on
`payment` lets a manager keep the ledger reconcilable with their books.

### 5.11 Announcements and notifications

**Announcements** are one-way. A manager (studio-wide, any class, any group) or a lead
coach (their own groups) publishes a title and body, optionally scheduled. There are no
replies and no chat — parents keep using WhatsApp for conversation, which they would do
regardless.

#### Two levels, and only two

```
📱 PHONE LEVEL — push notification
   Buzzes and shows on the lock screen even when the app is closed.
   Web Push — FCM on Android and desktop, delivered in a normal browser tab.
   ⚠ On iOS, Web Push exists ONLY for a web app added to the home screen.
     In a Safari tab the API is absent — not denied, absent. See §6.5.
   ⚠ Requires OS permission. Opt-in on iOS and on Android 13+.
                        ↓ tap
📨 APP LEVEL — in-app inbox
   🔔③  unread badge on the app icon and the tab.
   A permanent הודעות list. No permission needed, never expires.
```

**Every message goes to both.** Push is the doorbell; the inbox is where the message lives.
They are not alternatives.

**There is no email, no SMS and no WhatsApp channel.** Deliberate: email goes unread in
Israel, SMS means a gateway contract, and the WhatsApp Business API would require Meta
verification plus roughly 48 pre-approved templates across three languages — for wording
that will change repeatedly in the first month. See §12 for why WhatsApp *groups* cannot be
automated at all.

#### Closing the silent-failure gap

Push is opt-in, so some parents will have a broken doorbell and nobody would ever know.
Two cheap mechanisms make that visible instead of silent:

1. **Delivery reporting on critical sends.** Every push records a
   `notification_delivery` row. After a cancellation the publisher sees:

```
ביטול שיעור — ג'ודו/מתחילים, היום 17:00

נשלח ל-24 משפחות
✓ 19 קיבלו
⚠ 5 לא קיבלו — התראות כבויות

  יעל כהן        054-123-4567
  דנה לוי        052-987-6543
  ...

[ העתק מספרים ]        [ שלח שוב ]
```

   The manager pastes those numbers into the WhatsApp group the club already has. Same
   outcome as automation, half a day of work, zero risk.

2. **A persistent in-app banner** for any user with push disabled —
   *"התראות כבויות — לא תקבל עדכונים על ביטולי שיעורים"* — non-dismissible, with a button
   that opens OS settings directly. This converts a meaningful share of denials.

Optionally, `שלח גם בוואטסאפ` on any announcement opens WhatsApp via the share sheet with
the message pre-composed, so the manager picks a group and sends. No API, no cost.

**Triggers:**

| Event | Recipients | Delivery |
|---|---|---|
| Session cancelled or moved | Affected guardians | push + inbox + **delivery report** |
| Closure added affecting sessions | Affected guardians | push + inbox + **delivery report** |
| Coach substituted | Affected guardians | push + inbox |
| New announcement | Scoped guardians | push + inbox + **delivery report** |
| New event published | Targeted guardians | push + inbox |
| RSVP deadline in 48h, no response | Non-responding guardians | push + inbox |
| Charge created / payment due | Payer | push + inbox |
| Payment received | Payer | push + inbox |
| Payment overdue | Payer | push + inbox, escalating day 3 / 7 / 14 |
| Payment failed or amount mismatch | Payer + all managers | push + inbox |
| Belt awarded | Guardians | push + inbox |
| Health declaration missing | Guardians | push + inbox, escalating day 1 / 3 / 7 |
| **Student at risk (3+ consecutive absences)** | Group's coaches + managers | push + inbox |
| **Trial lesson tomorrow** | Lead's guardian | push + inbox |
| **Trial follow-up** | Lead's guardian | push + inbox, day 1 / 3 / 7 after |
| Registration request submitted | All managers | push + inbox |
| Order pending > 24h | All managers | inbox |
| Unmatched IPN awaiting reconciliation | All managers | inbox |

Every notification type is individually mutable per user, except health-declaration and
payment-failure notices, which are transactional.

### 5.12 Calendar integration

**Subscription feed.** `GET /api/v1/calendar/{token}.ics` returns RFC 5545 iCalendar
content. Feeds exist per guardian (all their students' sessions and events) and per coach
(all sessions they staff). The token is a long random secret stored in `calendar_feed`,
rotatable from settings — rotating invalidates the old URL immediately.

Each `VEVENT` carries a stable `UID` derived from the session id, `SUMMARY` like
`דנה · ג'ודו/מתחילים`, `LOCATION`, `DTSTART`/`DTEND` in `Asia/Jerusalem`, the coach in
`DESCRIPTION`, and `STATUS:CANCELLED` for cancelled sessions.

The app offers three buttons: "הוסף ליומן Google" (deep-link to Google's subscribe dialog),
"הוסף ליומן Apple" (a `webcal://` URL, which opens the native subscribe sheet on iOS and
macOS), and "העתק קישור".

Chosen over the Calendar APIs because **Apple provides no third-party calendar write API at
all** — the API route cannot serve iPhone users — and Google's calendar write scope is a
restricted scope requiring an annual third-party security assessment.

**Known limitation, handled explicitly:** Google refreshes subscribed calendars slowly
(up to ~24h). The feed is for "where do I need to be next Tuesday", never for "tonight is
cancelled". Urgent changes always go out through push and email as well (§5.11). The feed
contains no medical and no financial data.

**Per-event add button.** Events additionally expose a single-event `.ics` download for
parents who want the competition in their calendar without subscribing to everything.

### 5.13 Notes

Both kinds, both optional — never required to complete any flow.

- **Session notes** — attached to a session by any staff member. "עבדנו על הטלות, 3 ילדים
  בלי גי." Multiple notes per session, each attributed.
- **Student notes** — attached to a student by any staff member. "מתקשה בנה-וואזה", "מוכן
  למבחן".

Visible to coaches of that student's groups and to all managers. **Never visible to
guardians.** Every note is audit-logged, included in a data-export request, and destroyed
by anonymization — a written opinion about a child is personal data.

### 5.14 Reports and the manager dashboard

Live on the web dashboard, with CSV/XLSX export on every table.

**Financial**
- Revenue collected vs expected, by month, with a 12-month trend
- Outstanding debt by payer, aged (0–30, 31–60, 60+ days)
- Payments by method (card / הוראת קבע / bank transfer / cash / adjustment)
- Charges created, settled, voided and written off
- Unreconciled IPNs and orders pending over 24h

**Funnel** (from `student_status_history`, no spreadsheet export required)
- Enquiries → trials booked → trials attended → converted, by month
- Conversion rate and average days-to-convert
- Breakdown by `source` (Instagram, flyer, word of mouth, walk-in)
- Trials booked this week, and who hasn't been followed up

**Operational**
- Attendance rate per group, per student and per month. **The denominator is sessions the
  student was expected at** (§5.7), never every session the group held — a twice-a-week
  student in a daily group is not at 40% attendance
- **Sessions held vs planned** (this is why `unmarked` must be a real state)
- Students at risk — three or more consecutive **expected** sessions missed. **This fires a notification to
  the group's coaches and to managers with a one-tap "צור קשר עם ההורה"** — it is not left
  sitting in a report nobody opens
- New enrollments, dropouts and net change per month
- Students missing a health declaration
- Coach session counts (the raw data v2's payroll report will build on)

**Studio overview** — active students, active groups, this week's sessions, today's
attendance, open registration requests, total outstanding debt.

### 5.15 Training-year rollover

The single highest-leverage screen in the product. A guided wizard, run once a year:

1. **Define the year** — name, start date, end date.
2. **Closures** — Israeli holidays are proposed as a checklist; tick the ones the studio
   actually closes for; add manual ranges.
3. **Groups** — carry each group forward as-is, rename, retire, or create new ones.
4. **Students** — for each group, confirm who continues, who moves to another group, and
   who is not returning. Bulk actions, no automatic age-based promotion in v1.
5. **Prices** — review each group's price plan and set new amounts, effective from the new
   year's start. Old plans are closed, not overwritten.
6. **Generate** — materialize every session for the year, skipping closures, and show a
   summary of what was created.
7. **Announce** — optionally publish the new schedule to all guardians in one action.

The wizard is resumable; a `training_year` in `draft` status holds partial progress and
nothing is visible to guardians until it is activated.

---

## 6. Client applications

### 6.1 First run and onboarding

There are exactly **two applications**: the **staff app** (business) and the **parent app**
(users). They never merge and neither grows features belonging to the other. A coach who is
also a parent at the same studio installs both — one Google/Apple identity, two apps, two
different jobs.

#### Who may sign in to which

| | Staff app | Parent app |
|---|:--:|:--:|
| `platform_admin` | ✓ | |
| `owner` / `manager` | ✓ | ✓ if they are also a guardian |
| `lead_coach` / `assistant_coach` | ✓ | ✓ if they are also a guardian |
| `guardian` only | **✗ refused** | ✓ |
| No role and no children | ✗ | ✗ |

Access to each app is a **query, not a role check** (§3.1):

```
staff app   → EXISTS(role_assignment WHERE person_id = :me AND revoked_at IS NULL)
parent app  → EXISTS(guardian        WHERE person_id = :me)
```

**Staff-app access is provisioned, never self-service.** Signing in with a Google account
that holds no role assignment produces a refusal — there is no path from "I downloaded the
app" to "I have a studio". Only a `platform_admin` creates studios, and only an owner or
manager grants roles inside one.

**Parent-app access needs no provisioning at all**, because booking a trial creates the
guardian row itself (§5.4a). That is the only self-service entry point in the system, and it
grants nothing beyond visibility of the children it just created.

#### Parent app — first launch

```
1  שפה            device locale → he / en / ru   (BEFORE login — she may not read Hebrew)
2  welcome        [ המשך עם Google ]  [ המשך עם Apple ]
                  system browser only — never a webview (§5.2)
3  resolve        invitation token         → attach identity to the pre-created Person
                  verified email/phone hit → attach to the matched Person
                  no match                 → "לא מצאנו אותך"
                                             [ יש לי קוד הזמנה ] [ הרשמה לסטודיו ]
4  studio picker  only shown if she belongs to more than one studio
────────── BLOCKING — home is unreachable until done ──────────
5  אישורים        terms of service + privacy policy
6  הצהרת בריאות   one per child with health_status = missing, signed in sequence
────────── PROMPTED ONCE, SKIPPABLE ──────────────────────────
7  צילום ופרסום   per child. Skipping = NO consent recorded (the safe default)
8  התראות        value pre-prompt first ("נודיע לך אם שיעור מתבטל"), THEN the OS dialog.
                  Never the raw OS permission dialog on launch — a denial is permanent.
9  יומן           offer the ICS subscription. Fully optional.

   No payment step. The payments screen always shows all three ways to pay,
   so there is nothing to decide up front.
────────── Home ──────────────────────────────────────────────
```

Steps 5 and 6 are the only hard gates. Steps 7, 8 and 9 are one-time prompts that can be
dismissed, are re-offered from Settings, and never block the app.

Ordering rationale: language before login, because a Russian-speaking parent cannot read a
Hebrew consent screen. Push permission last and behind a pre-prompt, because iOS gives you
exactly one chance and a denial cannot be re-requested in-app.

#### Staff app — first launch

```
1  שפה            device locale → he / en / ru
2  welcome        [ המשך עם Google ]  [ המשך עם Apple ]
3  resolve        ├─ owner of a studio with no classes yet
                  │     → studio setup wizard (§5.1), resumable
                  ├─ manager / coach with role assignments
                  │     → 3-screen tour → offline priming → Today
                  └─ no role assignment anywhere
                        → "אין לך גישה לאפליקציית הצוות.
                           פנה למנהל הסטודיו שלך."   [ אפליקציית ההורים ]
4  tour           3 screens, skippable: "כאן השיעורים של היום" ·
                  "לחיצה לסימון נוכחות" · "עובד גם בלי אינטרנט"
5  התראות        pre-prompt then OS dialog — coaches need substitution and
                  cancellation notices, so this is asked during the tour, not later
6  offline prime  today's and tomorrow's sessions + rosters are fetched and written to
                  IndexedDB BEFORE the coach reaches Today
```

**Offline priming is not optional.** A coach whose very first session is in a basement with
no signal must already have the roster. The first launch blocks on this fetch with a short
progress indicator, and it re-runs on every foreground resume.

#### Wrong app

A person who signs in to an app they have no business in is told which app is theirs and
given a direct store link, not a dead end:

- Guardian in the **staff app** → *"אין לך גישה לאפליקציית הצוות"* + a link to the parent app.
- Staff member with no children in the **parent app** → *"לא נמצאו תלמידים המשויכים אליך"* +
  a link to the staff app.

Both screens offer sign-out. Neither leaks whether the account exists in the other app.

### 6.2 Staff app — managers and coaches, role-gated

One app, one URL, one login. Coaches see an operational subset; managers see
everything. A person who is both never switches apps.

**Coach screens:** Today (chronological list of their sessions with a state chip) ·
Session detail with the attendance roster · Student card (photo, belt, contact,
health flags, attendance history, notes) · Group roster · Session and student notes ·
My schedule · Announcements (own groups) · Sync status.

**Additional manager screens:** All students, searchable and filterable · Enrollment and
registration approval queue with person/child matching · Trial bookings queue ·
Convert a lead to a student · Add a child to an existing parent · Sell an item ·
Student and payment detail · Record a payment · Reconciliation
queue · Add/edit a session, cancel, substitute · Create events · Belt exams · Studio-wide
announcements · Quick studio stats.

Built mobile-first for one-handed use on a mat: large tap targets, high contrast, works in
bright light, no interaction requiring precision.

### 6.3 Parent app — guardians and adult students

**Home** — one view across every student this guardian is linked to:

```
──────── הילדים שלי ────────

⚠  חוב של 320₪  ·  [לתשלום]
⚠  הצהרת בריאות לנועה חסרה

היום, יום א'
  17:00  דנה    ג'ודו / מתחילים
  17:00  יוסי   ג'ודו / נבחרת
  18:30  נועה   קראטה / ילדים

מחר, יום ב'
  16:00  יוסי   ג'ודו / נבחרת

[ דנה ] [ יוסי ] [ נועה ]  ← drill in
```

One screen answers "where does everyone need to be today": every linked student's upcoming
sessions merged chronologically, one payment banner covering everything this person owes,
one alert list. A guardian with a single student skips this layer entirely and lands
directly on that student's page.

**Trial state.** A guardian whose children are all `trial` sees a reduced home: the booked
session with a countdown, an add-to-calendar button, directions to the studio, and what to
bring. No payments screen (they have no charges), no attendance history, no belt strip. After
the lesson the home shows "איך היה?" and, once a manager converts them, the full app appears
with no further action from the parent.

**Other screens:** Student page (schedule, attendance history, belt progression, health
declaration) · Add a child (`+ הוסף ילד`, goes to the approval queue) ·
Payments (open charges, all three ways to pay, history) · Events and RSVP ·
Announcements inbox · Report an absence · Calendar setup · Settings (language,
notification preferences, guardians, photo consent) · Data export request.

The health declaration flow is a **blocking gate** on first use for any unsigned student.

### 6.4 Manager dashboard — web

Desktop-first. Everything the staff app has, plus what needs a big screen: the full
financial reports and exports, the reconciliation queue side-by-side, the schedule grid
for a whole week across all groups, bulk student operations, price plan management, staff
and role management, studio settings, the training-year rollover wizard, and the health
declaration template editor.

### 6.5 Distribution

**Both apps ship as installable PWAs. There is no App Store build and no Play listing.**

| | Android | iOS | Desktop |
|---|---|---|---|
| Method | Installable PWA | Installable PWA — Add to Home Screen | Installable PWA |
| Store | — | — | — |
| Cost | — | — | — |
| Distribution | The invitation link (§5.3) | The invitation link (§5.3) | The invitation link |
| Push | Web Push (FCM) — **works in a normal tab** | Web Push — **home-screen install required** | Web Push |
| Install prompt | `beforeinstallprompt` — a real button | **No API.** Guided instructions only | `beforeinstallprompt` |
| Updates | Instant, no review | Instant, no review | Instant |

**Why no stores.** The wrappers were only ever wrappers — the apps are PWAs underneath either
way. Dropping them removes two developer accounts, App Store review, and Google Play's
12-testers-for-14-consecutive-days closed test for new personal accounts, which is wall-clock
time that cannot be compressed. Nothing in the product changes.

**The cost, and it is real: the iOS install.** Apple exposes the Push API only to a web app
launched from the home screen. In a Safari tab it does not exist, so an iPhone parent who
never installs receives **no push at all** — and §5.11 permits no email or SMS fallback, so
that parent is reachable only by telephone. iOS also offers no way to *trigger* an install;
`beforeinstallprompt` is Chromium-only, so on iPhone the install can only be taught, never
prompted.

An App Store build would not remove that install step, only make it familiar. So the install
is treated as **part of onboarding, not an afterthought**: the invitation link detects iOS and
opens a walkthrough with a screenshot, and first run does not proceed until the app is running
in standalone display mode. The dashboard lists guardians who have not installed, alongside the
push-delivery report (§5.11), so the office can see exactly who it needs to call.

**Storage caveat for the staff app.** §10.6 requires that `pending_ops` is never reclaimed. A
home-screen web app on iOS is exempt from Safari's 7-day script-storage cap, but iOS may still
evict under storage pressure — a guarantee a native container would have given. Coaches are a
small, known group, so this is managed rather than engineered around: the staff app requires
standalone mode, calls `navigator.storage.persist()`, and shows a blocking warning when
unsynced work has been queued for more than one session.

---

## 7. API design

REST, versioned under `/api/v1/`. OpenAPI schema generated by FastAPI and used to generate
the TypeScript client, so a breaking backend change fails CI rather than production.

Routers stay thin — parse, call a service, return. All business logic lives in
`app/services/`.

```
POST   /auth/{google|apple}/callback      GET  /auth/me         POST /auth/refresh
POST   /auth/logout                       POST /auth/switch-studio

GET/PATCH /studios/{id}                   (creation is platform-admin only, see below)
GET    /studios/{id}/settings             PATCH /studios/{id}/settings

GET/POST /classes                         GET/PATCH/DELETE /classes/{id}
GET/POST /groups                          GET/PATCH/DELETE /groups/{id}
GET/PUT  /groups/{id}/schedule            (PUT returns an impact preview before applying)
GET/POST /groups/{id}/staff
GET/POST /locations

GET/POST /training-years                  POST /training-years/{id}/generate-sessions
POST   /training-years/{id}/activate      GET/POST /closures
GET    /holiday-presets?year=2026

GET    /sessions?from&to&group_id         GET/PATCH /sessions/{id}
POST   /sessions/{id}/cancel              POST /sessions (ad-hoc)
GET/POST /sessions/{id}/notes

GET    /sessions/{id}/attendance          POST /attendance/batch   (idempotent)
POST   /sessions/{id}/attendance/bulk-present
POST   /absence-reports
GET    /sync/bootstrap?from&to            (offline cache payload)

GET/POST /students                        GET/PATCH /students/{id}
POST   /students/{id}/freeze              POST /students/{id}/leave
GET/POST /students/{id}/notes             GET /students/{id}/attendance
GET/POST /students/{id}/guardians         DELETE /students/{id}/guardians/{person_id}
POST   /students/{id}/guardians/{person_id}/set-primary
GET    /me/students
GET/POST /enrollments                     PATCH /enrollments/{id}

GET/POST /registration-requests           POST /registration-requests/{id}/{approve|reject}
GET    /public/studios/{slug}             GET  /public/studios/{slug}/groups
GET    /public/studios/{slug}/landing     (unauthenticated — landing page content)
GET    /public/groups/{id}/trial-slots    (next N bookable sessions for a group)
POST   /trial-bookings/self               (AUTHENTICATED — the parent has just signed in;
                                           body: children[] + group + session + trial
                                           health declarations. captcha + rate-limited)
POST   /me/students                       (guardian-initiated add-sibling request)

GET/POST /trial-bookings                  POST /trial-bookings/{id}/grant-override
POST   /students/{id}/convert             POST /students/{id}/mark-lost
GET    /students/{id}/status-history      GET  /reports/funnel
GET/POST /products                        PATCH /products/{id}

GET    /health-templates                  POST /health-templates
GET    /students/{id}/health-declaration  POST /students/{id}/health-declaration
GET    /students/{id}/health-declaration/pdf

GET/POST /belt-ranks                      GET/POST /students/{id}/belts
GET/POST /events                          GET/PATCH /events/{id}
POST   /events/{id}/publish               POST /events/{id}/rsvp
GET    /events/{id}/registrations         POST /events/{id}/attendance
POST   /events/{id}/exam-results
GET    /events/{id}.ics

GET/POST /price-plans
GET    /charges?payer_person_id&status    POST /charges          (manual/credit)
POST   /billing-runs                      GET  /billing-runs
POST   /payment-orders                    GET  /payment-orders/{public_ref}
GET    /payment-orders/{public_ref}/form  (server-rendered auto-submitting uPay form)
GET    /webhooks/upay/{public_ref}        (unauthenticated, IP-allowlisted)
GET    /payment-complete                  (returnurl landing)
GET/POST /payments                        POST /payments/{id}/reverse
GET    /reconciliation/unmatched          POST /reconciliation/match
GET    /reconciliation/suggestions

GET/POST /announcements                   GET  /notifications
POST   /notifications/{id}/read           GET/PATCH /notification-preferences
POST   /push-tokens

GET    /calendar/{token}.ics              (unauthenticated, token-secured)
POST   /calendar-feeds/{id}/rotate

GET    /reports/{financial|attendance|overview}   GET /reports/{name}/export?format=xlsx

POST   /privacy/export-requests           GET  /privacy/export-requests/{id}
POST   /privacy/students/{id}/anonymize
GET    /audit-log?entity_type&entity_id

GET/POST /platform/studios                POST /platform/studios/{id}/suspend
POST   /platform/studios/{id}/invite-owner
POST   /platform/break-glass              (reason + expiry; notifies the studio owner)

--- non-production only; the router is NOT MOUNTED when ENV=production (§19) ---
POST   /dev/act-as/{person_id}            POST /dev/demo/reset
POST   /dev/jobs/{name}/run               POST /dev/upay/simulate-ipn
```

---

## 8. Technical architecture

### 8.1 Stack

- **Backend:** Python 3.14, FastAPI, SQLAlchemy 2.x, Alembic, PostgreSQL 18, Pydantic v2
- **Workers:** ARQ (Redis-backed) for billing runs, notification fan-out, IPN processing,
  PDF rendering, retention jobs and reconciliation suggestions
- **Frontend:** React 19, TypeScript 5.9, Vite 7, TanStack Query, Zustand, Tailwind with
  logical properties
- **Offline:** Workbox service worker + Dexie (IndexedDB) + a custom sync queue
- **Install:** Web App Manifest + Workbox — installable on Android, iOS and desktop. No native shell
- **Hosting:** Railway (existing instance) — API service, worker service, managed
  PostgreSQL with PITR, Redis, and object storage for PDFs and photos
- **CI:** GitHub Actions — lint, typecheck, tests, build, then deploy on green
- **Observability:** Sentry, structured JSON logs, health endpoints, and an alert set
  covering money, delivery and sync — see §18 for the full operator view

### 8.1a Data storage — what lives where, and why

Four stores, each with a job the others cannot do.

#### PostgreSQL 18 — the system of record

Everything durable. Chosen for four reasons that are specific to this product, not generic
database preference:

1. **The money ledger requires ACID.** A payment allocated across four charges either lands
   entirely or not at all. Eventual consistency here produces "we charged them twice"
   bugs — extremely expensive to unwind in a community where everyone knows each other.
2. **Multi-row atomic transactions are the core operation, not an edge case.** Approving a
   registration writes Person + Student + Guardian + Enrollment + HealthDeclaration +
   consent records in one commit. A belt-exam pass writes `event_exam_result`, creates
   `student_belt` and updates `student.current_belt_id` together. Half of either is corruption.
3. **Referential integrity is the cheapest correctness available.** A charge cannot reference
   a student that does not exist; an allocation cannot outlive its charge. The database
   refuses, so the code does not have to remember.
4. **JSONB exactly where the shape is genuinely unknown** — health form templates, audit
   diffs, studio settings, notification payloads — without surrendering relational guarantees
   everywhere else.

Also used: partial and composite indexes leading with `studio_id` for tenant scoping; a
unique partial index for "one active enrollment per student per group"; `tstzrange` checks
for overlapping closures.

| Rejected | Why |
|---|---|
| MongoDB / Firestore | The ledger is inherently relational and needs cross-document transactions. Firestore's query limits would push us to denormalize names into charge documents — which would **destroy the anonymization design rule** (§11.4) and make deletion impossible |
| SQLite | Concurrent writers, multi-tenant isolation, managed PITR backups |
| A separate OLAP store | At this scale reports run fine against indexed queries and a read replica. Revisit past roughly 50 studios — not before |
| A search engine | Postgres full-text is more than enough for "find a student by name" |

#### Redis — ephemeral only, nothing durable

ARQ's job queue, rate-limit counters, the refresh-token reuse denylist, and short-lived
caches (holiday presets, the compiled OpenAPI schema).

**Nothing here survives a wipe, and nothing needs to.** Every job must be re-derivable from
Postgres: the billing run is idempotent per period, the IPN processor works from the already
persisted `upay_ipn_record`, notification fan-out re-reads `notification`. If Redis is lost,
a redeploy re-enqueues from durable state.

*Honest alternative:* at one studio, a Postgres-backed queue
(`SELECT … FOR UPDATE SKIP LOCKED`) would remove a whole service. Redis stays because ARQ is
the chosen worker and Railway provisions it in one click — but if you ever want fewer moving
parts, this is the one to drop.

#### IndexedDB via Dexie — client side, staff app

Cached rosters and the `pending_ops` queue. `localStorage` was rejected outright: a 5 MB cap,
a **synchronous API that blocks the UI thread**, strings only, and no transactions — the
pending-ops queue needs atomic writes so an attendance mark is never half-recorded when the
app is killed mid-tap.

#### Object storage — files, never in the database

Signed health PDFs, student photos, studio logos, data-export bundles. Postgres BLOBs were
rejected because they bloat every backup and every PITR restore, and you cannot hand a
browser an expiring link to a `bytea` column. All access is through short-lived signed URLs;
no bucket is ever public.

#### Railway secrets — encryption keys

Deliberately **not** in the database, which is the entire point: a leaked dump is inert
without them (§11.1). Keys are versioned so rotation does not require re-encrypting
everything at once.

#### Backup and recovery

Managed Postgres with point-in-time recovery, object-storage versioning, and — the step
everyone skips — **a documented restore drill run once before launch and once per year**,
because a backup you have never restored is a hypothesis. Migrations run through Alembic
with a forward-only policy; only the most recent migration keeps a tested rollback.

### 8.2 Monorepo layout

```
studio-manager/
├── app/                          FastAPI backend
│   ├── routers/                  thin — parse, call a service, return
│   ├── services/                 all business logic
│   ├── models/                   SQLAlchemy
│   ├── schemas/                  Pydantic
│   ├── workers/                  ARQ tasks
│   ├── integrations/upay/        form builder, IPN parser, reconciler
│   ├── core/                     auth, tenancy, encryption, audit, config
│   └── main.py
├── alembic/
├── web/
│   ├── package.json              npm workspaces root
│   ├── packages/
│   │   ├── api-client/           generated from OpenAPI — never hand-edited
│   │   ├── ui/                   RTL/LTR-aware design system
│   │   ├── core/                 shared hooks, formatting, permissions, offline queue
│   │   └── i18n/                 he.ts · en.ts · ru.ts
│   └── apps/
│       ├── staff/                managers + coaches
│       ├── parent/               guardians + adult students
│       └── dashboard/            manager web
├── docs/forms/                   source PDFs (health declaration)
├── SPEC.md
└── CLAUDE.md
```

**Type flow:** Python models → FastAPI OpenAPI schema → `openapi-typescript` →
`packages/api-client`. Generated on every CI run; a diff in generated output that is not
committed fails the build.

### 8.3 Cross-cutting conventions

- Money is **always** an integer count of agorot. A lint rule and a model-level test reject
  float columns on any money field.
- Timestamps are **always** stored UTC `timestamptz`; rendered in `Asia/Jerusalem`.
- No user-facing string is ever inlined in a component — everything goes through
  `packages/i18n`. A lint rule enforces this.
- Soft-delete (`deleted_at`) on user-generated content; hard delete only via anonymization.
- Every list endpoint is cursor-paginated.
- Every mutating endpoint accepts an optional `Idempotency-Key`.

---

## 9. Internationalisation and layout direction

Three locales at launch, user-selectable, with a per-studio default:

| Locale | Direction |
|---|---|
| `he` — Hebrew | **RTL** |
| `en` — English | LTR |
| `ru` — Russian | LTR |

French was considered and cut: Arbox and Boostapp ship Hebrew + English, Russian has a real
Israeli community behind it, and French had no identified user while costing every string
forever plus a permanent slot in the bidi test matrix. Adding a locale later is a
translation file, not a refactor.

Because Hebrew is RTL and the other two are LTR, the UI must be **genuinely
bidirectional** — not RTL-only with LTR bolted on:

- **CSS logical properties everywhere.** `margin-inline-start`, `padding-inline-end`,
  `inset-inline-start`, `text-align: start`. A lint rule bans `margin-left`,
  `padding-right`, `left:`, `right:` in component styles.
- `dir` is set on the document root from the active locale and flows down.
- Icons with inherent direction (back arrows, chevrons, progress) mirror via
  `[dir="rtl"] &` rules; icons without it (a clock, a belt) never mirror.
- Numbers, dates and currency format per locale via `Intl`, while the **timezone remains
  `Asia/Jerusalem` regardless of locale** — a Russian-speaking parent in Israel needs
  Israeli times.
- Mixed-direction text (a Hebrew name next to a Latin group name, a phone number) is
  wrapped in isolation to prevent bidi reordering bugs.
- The test matrix runs every component in both `he` and `en`; visual tests cover both
  directions.

Hebrew is the reference locale. Missing keys in other locales fall back to Hebrew and are
reported by a CI check that lists untranslated keys per locale.

---

## 10. Online, offline and degraded operation

Offline support is scoped deliberately: **attendance is fully offline; everything else
degrades gracefully.** But "offline" is not one state — the interesting failures live in
between.

### 10.1 Four network states, not two

| State | What it looks like | How the app behaves |
|---|---|---|
| **Online** | Requests succeed | Normal |
| **Slow** | 3–15s responses, a basement with one bar | Optimistic UI everywhere; a 6s timeout demotes the request into the offline path rather than spinning. Never a blocked screen waiting on a slow write |
| **Intermittent** | Connects, drops, reconnects. Captive portals. | Treated as offline until two consecutive requests succeed, so the app does not thrash between modes mid-session |
| **Offline** | No route at all | Full offline path |
| **API down, client online** | 5xx or a failing health check | Distinguished from offline: "השרת אינו זמין, ננסה שוב". Queueable writes still queue; non-queueable ones are blocked with an explanation, not a silent failure |

The client never trusts `navigator.onLine` alone — it is true on a captive-portal wifi that
routes nowhere. Mode is derived from actual request outcomes against a lightweight ping.

### 10.2 Per client

| | Staff app | Parent app | Dashboard |
|---|---|---|---|
| Offline scope | **Full for attendance** | Read-only cache | **Online only**, explicitly |
| Cached | Today + tomorrow's sessions, rosters, student cards, health flags, belts | Upcoming sessions, announcements inbox, student profile, the trial booking | — |
| Writable offline | Attendance, session notes, student notes | Nothing | — |
| Never offline | Payments, reports, settings, staff management | Payments, absence pre-reports, RSVP | — |

A parent's **absence pre-report requires a connection on purpose**: it is time-critical and
worthless if it lands after the lesson. The app says so rather than queuing it into the void.

### 10.3 Authentication while offline

The one that bites. The access JWT lives 15 minutes; a coach on a mat for 90 minutes will
have an expired token long before they finish.

1. **Offline writes never depend on a valid token.** Marks go to `pending_ops` regardless of
   auth state — the local write is not an API call.
2. On reconnect the client refreshes (refresh token, 30 days, rotating) and *then* flushes.
3. If the refresh token has also expired — a device offline for over a month — **the queue is
   preserved, not discarded**. The user signs in again and the queue flushes afterwards,
   validated against the same `person_id`.
4. If the re-authenticated identity is a *different* person, the queue is not flushed; it is
   surfaced as a conflict card for a manager to resolve. Attendance is attributed to whoever
   marked it, and a device changing hands must not silently rewrite that.
5. A queue is **never** dropped on an auth failure. There is no code path that discards
   unsynced work.

### 10.4 Staleness

The bootstrap payload carries `synced_at` and a server-side `generation`. If the cached
window is older than 24 hours the roster header shows `נתונים מ-<time>` and a refresh is
attempted on every app open and foreground resume. Past 7 days the cache is treated as
untrustworthy for display but the pending queue is still preserved and flushable.

### 10.5 Cross-actor conflicts

The interesting case is not two coaches — it is a coach offline and a manager online.

- **Coach marks attendance offline; a manager cancels that session meanwhile.** On flush the
  marks are accepted and stored, but the session is `cancelled`, so a card appears for the
  manager: *"השיעור בוטל — התקבלו 22 סימוני נוכחות"*. A human decides. Never silently dropped,
  never silently applied to a cancelled session's reports.
- **Coach marks a student who was unenrolled meanwhile.** Same treatment: stored, flagged,
  surfaced.
- **Two coaches mark the same session.** Last write by `device_marked_at` wins — except a
  parent pre-report, which never loses to a bulk action regardless of timestamp.
- **The same device flushes twice.** Idempotent on `client_mark_id`; the replay is a no-op.

### 10.6 Cache budget

A single day's rosters for a busy studio is on the order of tens of KB, so quota is not a
real constraint — but the cache is bounded anyway: two days of sessions, evicted oldest-first,
with `pending_ops` **exempt from eviction under all circumstances**. Unsynced work is the one
thing that must never be reclaimed.

| Capability | Offline behaviour |
|---|---|
| Today's and tomorrow's sessions + rosters | Cached, fully readable |
| Marking attendance | Fully writable, queued |
| Parent absence pre-reports | Read from cache; writing requires connection |
| Student details, health flags, belts | Cached read-only for own groups |
| Session and student notes | Writable, queued |
| Everything else (payments, reports, settings) | Requires connection, clear offline state |

**Sync queue mechanics**

1. `GET /sync/bootstrap?from&to` returns everything a coach needs for a date window in one
   payload, stored in IndexedDB with a `synced_at` watermark.
2. Every local mutation writes to a `pending_ops` store with a `client_mark_id`, an
   operation type and a payload, and updates the UI optimistically.
3. A background sync (via the service worker where supported, plus a foreground retry loop)
   flushes `pending_ops` to the batch endpoints.
4. Server endpoints are idempotent on `client_mark_id`. Replays are no-ops.
5. Conflicts resolve by `device_marked_at` (last write wins), except that a parent
   pre-report is never overwritten by a bulk action regardless of timestamp.
6. Rejected operations become dismissible conflict cards; nothing is silently dropped.
7. A visible badge always shows outstanding queue depth, tappable for detail.

---

## 11. Privacy, security and compliance

The system holds medical information about minors belonging to organisations other than
its operator. All six measures below are in v1.

### 11.1 Encryption of sensitive data

Application-level AES-256-GCM on: health declaration answers, signature images,
registration request payloads, and any free-text medical note. Keys live in Railway
secrets, never in the database, and are versioned so rotation is possible without
re-encrypting everything at once.

This is **in addition to** disk encryption. Disk encryption protects against a stolen
server; column encryption protects against a leaked backup, a SQL injection, or a
developer browsing production.

Encrypted columns are not queryable — which is fine, because nothing queries them.
`derived_flags` exists precisely so coaches can be warned without decryption.

### 11.2 Audit log

Append-only. The application database role has `INSERT` on `audit_log` and no `UPDATE` or
`DELETE`.

Logged: every read **and** write of health declarations · every role assignment or
revocation · every payment status change and manual payment · every charge created,
voided or written off · student and guardian creation, anonymization and deletion · every
data export · every login and studio switch · every note read on a student · every
reconciliation match.

Each row records actor person, actor identity, IP, action, entity type and id, whether the
data was sensitive, and a diff. Managers can view the audit trail for any entity;
`platform_admin` can view it globally.

This answers the two questions that actually get asked: *"who has seen my child's medical
information?"* and *"who marked this payment as received?"*

### 11.3 Data export

A guardian requests everything held about their students from the app. A worker assembles a
bundle — JSON of every related record plus rendered PDFs of health declarations — and
delivers a time-limited download link. Managers can trigger the same for any student.
Notes about a student are included, because a written opinion about a child is personal data.

### 11.4 Deletion and anonymization

Hard deletion is impossible: Israeli tax law requires retaining financial records for
approximately seven years.

Anonymization therefore:
- Overwrites `person` name, birthdate, phone, email and photo, and sets `anonymized_at`
- **Destroys** health declarations, signature images and the rendered PDFs outright
- Deletes student and session notes referencing the person
- **Retains** charges, payments and allocations, which reference only `payer_person_id` and
  `student_id` — never a name

This works only because of a design rule enforced from day one: **no PII is ever
denormalized into a financial row.** Invoices and receipts render names by join, never by
stored copy.

### 11.5 Retention

A configurable studio setting (default 24 months) after which students with
`status = 'left'` are automatically anonymized by a nightly job. Managers see a preview of
what the next run will anonymize and can exempt individuals.

### 11.6 Consent management

Versioned `consent_record` rows for: terms of service · privacy policy ·
**photo/video publication** · sharing medical flags with coaches · per-event consent.

Each records the version consented to, who consented, when, and from what IP. Consent can
be revoked, which is recorded rather than deleted. Photo consent is surfaced prominently:
the student card shows a clear ✓ or ✕ for "מותר לפרסם תמונות", because posting a child
without recorded permission is the most realistic complaint this club will face.

### 11.7 Application security

- Tenant isolation enforced at the query layer with an explicit escape hatch (§4.2), plus a
  test asserting every tenant table is scoped
- Rate limiting on auth, public registration and the IPN endpoint
- The public registration endpoint is captcha-protected and rate-limited per IP
- Strict CSP, HSTS, and secure/httpOnly/SameSite cookies for the refresh token
- No health data, card owner names or last-4 digits in application logs — enforced by a log
  scrubber and a test that asserts sensitive fields never serialize into log output
- Dependency scanning and secret scanning in CI
- Object storage access via short-lived signed URLs only; no public buckets

---

## 12. Known third-party constraints

Recorded so they are never rediscovered the hard way. Details in `upay-integration.md`.

| Constraint | Consequence |
|---|---|
| uPay's IPN has **no cryptographic signature** | UUID order refs + IP allowlist + independent amount verification are mandatory, not optional |
| The uPay form is client-submitted and `amount` is editable | `amount_mismatch` must be a real state that records the real money received |
| uPay recurring links are **dashboard-created only** | הוראת קבע mandates cannot be created in code |
| One shared recurring link, one fixed amount, for all parents | Per-payer recurring amounts are impossible |
| Recurring IPNs carry **no customer identifier** | Automatic matching is impossible; reconciliation is human-confirmed |
| No custom free-text field on the uPay payment page | Cannot ask the payer to type a student name |
| IPN arrives ~5 minutes after payment | The return redirect must never be the source of truth |
| **The IPN's `amount` is not the form's `amount`** — a ₪1 charge returns `1`, not `1.00` | Reconciliation compares **integers** (`agorot_from_ipn_amount`), never strings. A string compare fails every correct whole-shekel payment into `amount_mismatch`, i.e. a fraud alert on good money |
| **The merchant account has no sandbox** — `livesystem=0` is untestable and may be a no-op | §19.6 cannot rest on it. A demo studio is refused a form in our own code instead |
| The form field `paymentdetails` returns as `productdescription` | Confirmed live, 3/3. The outbound and inbound names for the order reference genuinely differ |
| Installments cap at **12** on the merchant account | `max_payments` is clamped; above it is an untested path |
| `application=BIT` is uPay's channel label, **not** the payment method | Never parse it as the instrument used — it reads "bit" for Visa-paid transactions |
| uPay issues a **קבלה**, not a **חשבונית מס** | Do not generate or infer tax documents; store `transactionid` and link to uPay's own receipt view |
| **Apple has no third-party calendar write API** | ICS subscription is the only cross-platform calendar option |
| Google Calendar write is a restricted scope | Would require an annual third-party security assessment |
| **iOS Web Push exists only for a home-screen web app** | An iPhone parent using a Safari tab can receive no push whatsoever. The API is absent, not denied — there is nothing to request |
| **iOS has no install-prompt API** | `beforeinstallprompt` is Chromium-only. On iPhone the install can be taught with instructions, never triggered |
| **iOS may evict a web app's storage under pressure** | §10.6's `pending_ops` exemption cannot be fully guaranteed on iOS. The staff app requires standalone mode, requests persistent storage, and warns on stale unsynced work |
| OAuth in embedded webviews | Blocked by Google (`disallowed_useragent`); must use system browser |
| **WhatsApp Groups API caps a group at 8 participants** (the business number takes one) and exposes **no endpoint to add a participant** | A club's 25-family WhatsApp group cannot be created or messaged programmatically. Only a share-sheet handoff is viable |
| Unofficial WhatsApp libraries (Baileys, whatsapp-web.js) | Violate WhatsApp ToS; the phone number gets banned. Unusable in a product that would be risking *customers'* numbers |
| Push notification permission is opt-in on iOS and Android 13+ | Some parents will never receive alerts — hence delivery reporting (§5.11) |

---

## 13. Testing strategy

Per `CLAUDE.md`: a failing test is written before any bug fix, and single test files are
preferred over full-suite runs during development.

| Layer | Tool | Coverage focus |
|---|---|---|
| Backend unit | pytest | Every service. Billing maths, proration, allocation, tenancy scoping, permissions |
| Backend integration | pytest + test Postgres | Migrations, transactional flows (approve registration, record exam result) |
| uPay | pytest with recorded fixtures | Form generation, IPN parse, amount mismatch, duplicate IPN, forged IPN, missing IPN, fingerprint matching |
| Frontend unit | vitest | Hooks, formatting, permission helpers, the offline sync queue |
| Component | vitest + Testing Library | Every component rendered in both `he` (RTL) and `en` (LTR) |
| E2E | Playwright | The five flows below |
| Visual | Playwright screenshots | Key screens in both directions, light and dark |

**Critical E2E flows, all of which must pass before release:**

1. Public registration → health declaration → manager approval → student active
2. Coach takes attendance **offline** → reconnects → marks sync → dashboard reflects them
3. Parent selects 3 months → uPay order → simulated IPN → charges settled → parent sees paid
4. Forged/tampered IPN → `amount_mismatch` → charges **not** settled → manager alerted
5. Manager changes a group's schedule → future sessions update, past and manually-edited
   sessions do not

**Non-negotiable invariant tests:**
- No money column is a float
- Every tenant-scoped table has `studio_id` and a leading composite index
- No coach-scoped endpoint returns any financial field
- Health data never appears in serialized log output
- The billing run is idempotent across repeated executions

---

## 14. Delivery plan

Single release: the club receives the finished product, payments included. Milestones are
build order, not separate releases.

| # | Milestone | Contents |
|---|---|---|
| **M0** | Foundations | Monorepo, CI, Railway environments, migrations, tenancy layer, encryption, audit log, i18n scaffolding, **the demo studio seed, the developer account and the dev bar** (§19) — built first so every later milestone is testable end to end. **Plus the PWA install layer: manifests, icons, service worker and the standalone-mode check** (§6.5). |
| **M1** | Identity & structure | Google/Apple auth with system-browser flow, both apps' first-run and identity-resolution flows, platform console with studio provisioning and owner invitation, Person/Identity/Guardian/Role model, classes, groups, locations, staff assignment |
| **M2** | Schedule | Training years, closure calendar with holiday presets, schedule rules, session materialization, per-session overrides, ad-hoc sessions |
| **M3** | People & funnel | Students, guardians, enrollment, public trial landing page with sign-in-first booking and session picker, lead/trial statuses and status history, manager conversion, trial follow-up automation, person and child matching, approval queue, parent-initiated add-sibling, freeze and leave, invitations |
| **M4** | Health | Template derived from the studio's PDF, declaration flow with drawn signature, encryption, derived flags, signed PDF rendering, the app gate |
| **M5** | Attendance | Roster UI, bulk mark with the pre-report protection rule, parent absence reporting, offline queue, sync, conflict handling |
| **M6** | Money | Price plans, product catalog, debt escalation ladder, billing run with proration, charge/payment/allocation ledger, uPay one-time flow with all security requirements, reconciliation queue, payer fingerprints, manual payments and adjustments |
| **M7** | Events & belts | Event types, targeting, RSVP, event fees, event consent, event attendance, belt ranks, grading history, belt exams |
| **M8** | Communication | Announcements, push + inbox delivery with delivery reporting and the push-disabled banner, at-risk alerts, notification preferences, ICS calendar feeds, per-event calendar buttons |
| **M9** | Reports & privacy completion | Financial, operational and funnel reports with export, studio overview, data export, anonymization, retention job, platform console |
| **M10** | Rollover & polish | Training-year wizard, studio setup wizard polish, accessibility pass, both-direction visual pass, performance |
| **M11** | Launch | Production cutover, the club's real data loaded, the iOS install walkthrough validated on real parents' phones, install-conversion and push-delivery reporting live, operator alert set verified (§18). **No store submission** — both apps ship as installable PWAs (§6.5) |

Realistic calendar time with daily review: roughly **4–6 weeks of building**. There is no
store wall-clock — §6.5 ships installable PWAs, so nothing waits on App Store review or Google
Play's 14-day closed test. The bottleneck is review throughput, not queue time.

---

## 15. Required from you before or during implementation

| # | Item | Blocks |
|---|---|---|
| 1 | The studio's **הצהרת בריאות PDF** at `docs/forms/health-declaration.pdf` | M4 |
| 2 | **uPay merchant email** and confirmation the account is live | M6 |
| 3 | A **public HTTPS URL** for IPN testing (Railway staging is fine) | M6 |
| 4 | **One iPhone and one Android device** to test the install walkthrough on | M1 |
| 5 | **A stable HTTPS domain** for the apps — an invitation link people install from should not be a random subdomain, and the four hosts must share one registrable domain or §11.7's refresh cookie is third-party (see `infra/railway/README.md`) | M1 |
| 6 | **3–5 real parents** to walk through the iPhone install, before the club-wide invite | M11 |
| 7 | Studio branding: logo, colours | M1 |
| 8 | Current price list per group | M6 |
| 9 | Translation source for **ru** — machine translation approved and at parity in M0; the **native-speaker review** is what remains, and it gates only tightening `i18n-parity.mjs` to `strict` | M11 |
| 10 | The club's real class/group structure and weekly schedule | M2 |

---

## 16. Assumptions

Stated explicitly because they were inferred rather than confirmed. Any of them can be
changed now at no cost.

1. **Two parents on one child:** both are guardians, both see everything, either can pay.
   One carries `is_primary`, which decides only whose name the bill is addressed to and
   which person a הוראת קבע payment is matched to. Splitting one bill between two
   households is not modelled in v1 — uPay's shared, unidentifiable recurring link makes
   percentage-split reconciliation impractical anyway. `payment_allocation` supports it
   structurally if you ever want it.
2. **Training year** defaults to 1 September – 31 August, editable per studio.
3. **Default language** is Hebrew per studio; each user can override it for themselves.
4. **Billing day** is the 1st of each month, configurable per studio.
5. **Retention** defaults to 24 months after a student leaves.
6. **Adult students** are modelled as one Person who is both the student and their own
   primary guardian; no separate self-service experience is built in v1.
7. **Coach role names** are `lead_coach` / `assistant_coach`, displayed as
   "מאמן ראשי" / "מאמן משנה". These labels are i18n strings, so renaming them per studio is
   possible later without a schema change.
8. **Notes are optional everywhere** — no flow requires a note to complete.
9. **The platform console** is the only way a studio comes into existence: a
    `platform_admin` creates it and invites its owner. It also lists and suspends studios
   and shows aggregate usage. This replaces the open self-signup described in an earlier
   draft — nobody can create a studio from the staff app.

---

## 17. Competitive validation

Reviewed 2026-08-23 against **Arbox** and **Boostapp** (Israel), **Gymdesk**, **PushPress**,
**Kicksite**, **Zen Planner**, **Martialytics**, **Spark Membership**, **Wodify** and
**Mindbody**, plus 2026 buyer's guides and user-complaint threads.

Recorded so these decisions are not re-argued later.

### 17.1 Where this spec leads the market

| Capability | Who else has it |
|---|---|
| **Offline-first attendance** | **Nobody.** Every platform assumes connectivity. For a dojo in a basement this is the feature that decides whether coaches use the app at all |
| `unmarked` as a real attendance state | Nobody — competitors default to present or absent, so a forgotten session silently reports perfect attendance |
| Full privacy kit (encryption, audit log, export, anonymize, retention, consent) | Nobody advertises it. תיקון 13 makes it a differentiator in Israel, not overhead |
| הוראת קבע reconciliation with learned payer fingerprints | Nobody — it's a workaround for a uPay constraint nobody else has had to solve |
| ICS calendar subscription feeds | Nobody advertises it |
| Multi-program hierarchy where **groups** own schedule, staff and price | PushPress markets this as its headline martial-arts feature |
| Parent-signed digital waivers for minors | PushPress; ours is deeper (structured medical form, derived coach-visible flags) |

### 17.2 Adopted from the review

Public trial-lesson booking and the lead funnel (universal across competitors; the 7–14 day
trial window is named decisive in every buyer's guide) · at-risk alerts fired as
notifications rather than left in a report · debt escalation ladder ("failed-payment
recovery" per Gymdesk and Arbox) · product catalog for one-off items · push delivery
reporting so an undelivered cancellation is visible rather than silent.

### 17.3 Deliberately omitted, with reasons

| Feature | Who has it | Why not here |
|---|---|---|
| Full sales CRM pipeline (stages, assignment, drip campaigns) | Spark Membership, Arbox | A second product bolted onto the first. The lightweight funnel captures the same signal |
| POS with stock counts | Gymdesk, Arbox | `product` catalog covers selling; inventory management is a different product |
| Kiosk / QR / RFID self check-in | Arbox, Kicksite, Gymdesk | 7-year-olds do not reliably check themselves in, and someone must own the tablet. The coach roster is faster and more accurate for a children's club |
| Invoicing integration (Green Invoice / iCount) | Boostapp | uPay issues receipts for card payments; the bookkeeper handles cash and הוראת קבע. Explicitly out of scope (§2.3) |
| SMS and WhatsApp channels | Boostapp | Push + inbox + delivery reporting instead. WhatsApp *groups* cannot be automated at all (§12); 1:1 would cost ~48 templates across three languages |
| Capacity limits and waitlists | Boostapp | v2 |
| Coach payroll / instructor utilisation | Arbox, Zen Planner | v2. The raw session counts are already collected |
| Belt progress bar for parents | Gymdesk | Considered and not adopted. Every input exists, so it is ~1 day whenever wanted |
| Drip-campaign / automation builder | Arbox, Gymdesk | A fixed trigger table (§5.11) covers the cases that matter without a rules engine |
| Website builder | Zen Planner | The public trial link is the only public surface needed |
| Door access control | Arbox, Mindbody | Out of scope |
| Competition results (brackets, weight classes, medals) | Martialytics | v2 |
| French locale | — | Cut. No identified user; every string forever plus a bidi test-matrix slot |

### 17.4 Competitor failures designed against

Real complaints from 2026 review threads, and the structural answer in this spec:

- **Arbox: "reporting is rigid — custom data means exporting to a spreadsheet."**
  Every report table has CSV/XLSX export, and the funnel report exists natively rather than
  being reconstructed by hand.
- **Arbox: "the member-facing app lacks modern design and engagement."**
  The parent app is a first-class deliverable with its own screens, not a stripped-down
  admin panel — which is also why the manager mobile and web clients are separate shells.
- **Mindbody: "feels like tools stitched together that don't talk to each other."**
  One ledger, one shared design system, and TypeScript types generated from the backend's
  OpenAPI schema so the clients cannot drift from the API.
- **Zen Planner: "glitches, incorrect charges."**
  Charges are never mutated to record payment — settlement is derived from
  `payment_allocation` — and every payment status change is written to an append-only audit
  log, so "who marked this paid?" always has an answer.

---

## 18. Platform operations & monitoring

You are the platform operator. This section is what you can see, what you deliberately
**cannot** see, and what wakes you up.

### 18.1 The boundary comes first

A `platform_admin` sees **operational metadata**. Never **tenant content**.

| Visible to platform_admin | Never visible |
|---|---|
| Studio name, slug, status, created date | Any student's or guardian's name |
| Counts: active students, groups, sessions, staff | Any health declaration, in any form |
| Last activity timestamp | Any student note or session note |
| Aggregate revenue processed, charge/payment counts | Any individual charge, payment or amount |
| Unreconciled IPN count, pending-order count | Any announcement body or message |
| Failed job counts, error rates, storage used | Any person's phone, email or photo |
| App versions in use, push delivery rates | Any attendance record for a named student |

**This is enforced structurally, not by trusting the console UI.** The platform console reads
a dedicated aggregate model — `platform_studio_stats`, refreshed by a worker — which contains
only counts and timestamps. It has no join path to a person, a student or a charge. A bug in
the platform UI therefore cannot leak a child's medical file, because the data was never in
the query result.

### 18.2 Break-glass access

Sometimes you genuinely will need to look at a studio's real data to debug something. That
path exists, and it is deliberately uncomfortable:

1. A platform admin requests elevation for **one studio**, with a **typed reason** and a
   **fixed expiry** (default 60 minutes, maximum 24 hours).
2. The elevation is written to **that studio's own audit log** — not a separate admin log —
   so the owner sees it alongside every other access.
3. The studio owner is **notified immediately**, by push and in their inbox:
   *"גישת תמיכה הופעלה לחשבון שלך — <reason> — עד <time>"*.
4. Every read performed under elevation is individually audit-logged with the elevation id.
5. Elevation expires automatically. There is no permanent superuser and no silent access.

Health declarations are excluded from break-glass entirely. If you need to debug something
touching them, you debug the shape and the encryption, never the contents.

### 18.3 Platform console

Web, `platform_admin` only.

**Studio list** — name · status · created · active students · last activity · a health chip.

**Per-studio drill-down** — the counts above, plus: last billing run and its outcome,
unreconciled IPN backlog, orders pending over 24h, failed jobs in the last 7 days, storage
used, client app versions in use, push delivery success rate.

**Actions** — create a studio · invite its owner · suspend · request break-glass · rotate a
studio's calendar-feed tokens.

**Cross-studio operations board** — the one screen you actually check daily:

```
מצב הפלטפורמה                                   23.08.2026

⚠  Gladiator Team    billing run failed — 04:12          [ retry ]
⚠  Dojo Herzliya     7 orders pending > 24h              [ view ]
⚠  Gladiator Team    31 unmatched IPNs, oldest 9 days    [ view ]
·  Dojo Herzliya     push delivery 62% (23 devices off)
·  Gladiator Team    sync queue: 1 device, 47 ops, 3d

3 studios · 412 active students · 0 API errors (24h)
```

**Per-studio health score** — a single green/amber/red chip computed from last activity,
attendance-marking rate, unpaid ratio, unreconciled backlog and push delivery rate. This is
how you notice a studio quietly abandoning the product *before* they churn, rather than when
they stop replying.

### 18.4 Technical observability

- **Sentry** on the backend and all three clients, with releases tagged and source maps
  uploaded, so a stack trace names a real line.
- **Structured JSON logs** carrying `request_id`, `studio_id` and `person_id` — and never
  health answers, card owner names or last-four digits. A log scrubber enforces this and a
  test asserts sensitive fields never serialize into log output (§11.7).
- **Health endpoints:** `/health` for liveness, `/health/ready` checking Postgres and Redis.
- **Uptime monitoring hosted outside Railway**, so you find out when Railway itself is down
  rather than being told by a parent.

### 18.5 Alerts

You are the entire on-call rotation, so the list is short and every entry is actionable at
2am. Everything else is a dashboard item, not an alert.

| Alert | Fires when | Why it matters |
|---|---|---|
| Billing run failed | Any failure | Nobody gets charged this month |
| IPN endpoint returning 5xx | Any, immediately | uPay stops retrying — payments are lost, not delayed |
| Orders pending > 24h | Count > 0 for 1h | Real money in limbo |
| Unmatched IPN backlog | > 10, or oldest > 7 days | Reconciliation rotting |
| Push delivery failure rate | > 30% for a studio | The doorbell is broken for that club |
| Job queue depth | > 100 for 10 min | A worker is down |
| Sync queue depth | Any device > 50 ops for > 24h | A coach is offline and never reconnecting |
| API error rate | > 1% for 5 min | |
| p95 latency | > 800ms for 10 min | |
| Failed login spike | Unusual rate per IP | Credential stuffing |
| DB connections | > 80% of pool | |
| Encryption key age | > 12 months | Rotation due |

### 18.6 What is deliberately not built

No per-studio usage billing (studios do not pay), no session-replay tooling (it would record
children's medical forms), no third-party analytics SDK in the parent app (same reason), and
no aggregate export of tenant data for "product research". If a metric cannot be computed
from `platform_studio_stats`, it does not get computed.

---

## 19. The developer account

One identity that can act as every role, so the whole system can be exercised end to end
without maintaining six real accounts. Because this is an impersonation feature in a system
holding medical data about minors, the guardrails are part of the specification, not an
afterthought.

### 19.1 Two mechanisms, deliberately separate

| | Demo studio | Role switcher |
|---|---|---|
| What it is | A studio flagged `is_demo = true`, seeded with fixture data | A dev-only control that swaps which Person you are acting as |
| Contains | Invented people only. **Never a real person's data** | — |
| Exists in production | **Yes** — so you can smoke-test a live deploy | **Only inside a demo studio** |
| Exists in dev/staging | Yes | Yes, across any studio in that environment |

The two combine: in production the developer account can do anything it likes, but **only
ever inside a studio that contains no real people.**

### 19.2 The flag

`auth_identity.is_developer BOOLEAN NOT NULL DEFAULT false` and
`studio.is_demo BOOLEAN NOT NULL DEFAULT false`.

- `is_developer` is set **only by a database seed or migration**. There is no API, no UI and
  no admin screen that can grant it. A test asserts no route can write the column.
- `/dev/*` routes are **conditionally mounted** — when `ENV == production` the router is
  never registered, so the endpoints do not exist rather than being guarded by an
  `if` statement someone can invert.
- A test asserts that with `ENV=production` no `/dev/*` route resolves, and that a developer
  identity cannot resolve a studio where `is_demo = false`.

### 19.3 Personas seeded in the demo studio

Studio **"מועדון הדגמה"** — 2 classes, 5 groups, ~40 fixture students with Hebrew names, a
full training year of materialized sessions, partial attendance history, price plans, settled
and open charges, two unmatched IPNs, belt history, one competition and one belt exam.

| Persona | Role | What it exists to test |
|---|---|---|
| `dev+owner` | `owner` | Setup wizard, training-year rollover, staff management, studio settings |
| `dev+manager` | `manager` | Enrollment approval, trial conversion, payments, reconciliation queue, reports |
| `dev+lead` | `lead_coach` | Attendance, session edits, events, belt exams, notes |
| `dev+assistant` | `assistant_coach` | Attendance only — **used to verify no financial data leaks** |
| `dev+parent3` | guardian of 3 students | Family home, the three payment options, health gate, RSVP, calendar feed |
| `dev+parent1` | guardian of 1 student | The single-child path that skips the family layer |
| `dev+trial` | guardian of a `trial` student | Landing page → booking → parent app in trial state |
| `dev+both` | `lead_coach` **and** guardian | The dual-role case — two apps, one identity |
| `dev+none` | no roles, no children | The refusal screens in both apps |

**There is no student persona**, because students have no login in v1 (§16). The switcher
offers *"guardian of דנה"* instead and the dev bar says so explicitly, so the gap is visible
rather than confusing. If teen logins are brought forward from v2, a `dev+student` persona
joins this list unchanged.

### 19.4 The dev bar

Rendered only when the authenticated identity has `is_developer`. Never shipped to anyone
else — the component is tree-shaken out of production client bundles by an env flag, so it
is not merely hidden.

```
🛠 DEV · מועדון הדגמה · acting as: [ מנהל ▾ ]
   בעלים · מנהל · מאמן ראשי · מאמן משנה
   הורה (3 ילדים) · הורה (ילד אחד) · הורה (ניסיון) · הורה+מאמן · ללא הרשאות

   [ 📴 offline ] [ 🐌 slow ] [ ⏩ +1 month ] [ ↺ reset demo data ]
   [ simulate IPN ▾ ]  success · amount mismatch · forged ref · duplicate
```

Switching sets `acting_as_person_id` on the session; the API resolves permissions from that
Person exactly as it would for a real login. Every switch is audit-logged in the demo
studio's own log, and every response carries an `X-Acting-As` header so the active persona is
visible in dev tools and in Sentry breadcrumbs.

### 19.5 The tools that matter

Four controls, each targeting something that is otherwise painful or impossible to test:

- **Simulate offline / slow.** Forces the client into the offline or slow path (§10.1) without
  airplane mode, so the attendance queue, the sync badge and the conflict cards can be
  exercised at a desk.
- **Time travel.** An `X-Dev-Now` header shifts the server's clock **for that request only**,
  in non-production. This is the only practical way to test the billing run, the debt
  escalation ladder (day 3 / 7 / 14), health reminders (day 1 / 3 / 7) and trial follow-ups
  without waiting a fortnight.
- **Run a job now.** Trigger the billing run, retention job, reconciliation suggestions or
  follow-up sweep on demand.
- **Simulate a uPay IPN.** The important one. Fires a synthetic callback in four shapes:
  a clean success, an **amount mismatch**, a **forged order reference**, and a **duplicate
  `transactionid`**. These are the four security requirements from §5.10, and without a
  simulator they are only testable against live money.

### 19.6 What the developer account cannot do

- **Cannot act inside a non-demo studio in production.** Not "is discouraged from" —
  the studio resolver excludes `is_demo = false` for developer sessions in production, and
  a test asserts it.
- **Cannot read any real person's health declaration.** Legitimate support access to real
  data goes through break-glass (§18.2), which is time-boxed, reason-tagged, written to the
  tenant's own audit log and notified to the studio owner. Break-glass excludes health
  declaration contents entirely, and the developer flag does not change that.
- **Cannot grant itself the flag**, or grant it to anyone else.
- **Cannot touch live money.** `upay_form_fields` **raises** for a demo studio: it gets no
  payment form at all, and its payment step renders §19.5's IPN simulator instead. Tests
  assert both the refusal and that no other module in `app/` names uPay's endpoint or
  writes `livesystem`.
  > **Amended 2026-08-25.** This previously read *"pinned to `livesystem=0`"*. That
  > delegated the guarantee to uPay — a test can assert what we send, never what uPay
  > does with it — and live testing found the merchant account has no sandbox mode, so
  > the flag's effect is unverified and may be nothing. A demo would have charged a real
  > card with every test green. The row-level pin stays as defence in depth.

### 19.7 Demo data hygiene

The demo studio is excluded from `platform_studio_stats`, from every cross-studio report and
from the operations board totals (§18.3), so it never contaminates the numbers you use to
judge real studios. `POST /dev/demo/reset` restores the fixture set from a versioned seed,
and a nightly job does the same in staging so the data never drifts into a state that hides
a bug.
