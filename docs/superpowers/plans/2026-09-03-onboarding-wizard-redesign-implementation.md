# Parent onboarding wizard redesign — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan phase-by-phase. Steps use checkbox (`- [ ]`) syntax for tracking.
> This session executes inline (no subagent dispatch), reporting back at each phase
> boundary rather than after every step, per explicit instruction from the user.

**Goal:** Rebuild `/join/<token>`'s wizard from today's buggy 5-step flow into the
redesign spec's 4-step flow (Welcome+Agreements, Family, Health, Payment), fix the one
safety-critical cross-family data bug first, and ship the in-app payment overlay the
2026-09-03 addendum requires so a card-paying family's health declaration is never lost.

**Architecture:** Seven phases, in the prompt's own order: safety bug fixes → step
renumbering + Step 1 → Step 2 (family rebuild) → Step 3 (health redesign, deferred
submission) → Step 4 (payment done-state + in-app overlay) → draft persistence → docs
+ verification. Each UI step is TDD'd against the existing component boundaries
(`JoinFlow.tsx` owns routing between steps; `OnboardingWizardChrome`/`WizardNavButtons`
stay the shared chrome; `PaymentSetup.tsx`/`PaymentsSection.tsx`/
`PaymentCompleteScreen.tsx`/`PaymentCompleteSection.tsx` are touched narrowly, exactly
per the addendum's scope carve-out). Backend touches are limited to one guard fix in
`app/services/people/onboarding.py`; everything else flagged for `main` (the migration)
or another vertical (billing's plan-list endpoint) is written down, not built.

**Tech Stack:** FastAPI/SQLAlchemy backend (`.venv`, Python 3.14), React 19 + TypeScript
+ Vite frontend, Vitest + Testing Library, pytest.

**Spec:** `docs/superpowers/specs/2026-09-02-parent-onboarding-wizard-redesign.md`
(read in full, including both 2026-09-03 additions — "Corrections found before
implementation" and "Step 4 addendum"). Prompt:
`docs/plan/prompts/implement-onboarding-wizard-redesign.md`. Original feature spec:
`docs/onboarding-link-spec.md` §5.4b. Findings register:
`docs/superpowers/specs/2026-09-02-completion-findings-register.md` §5–§6.

## Global Constraints

- All Hebrew strings live in `web/packages/i18n/he/<namespace>.ts`, mirrored in `en/`
  and `ru/` — never inline a string in a component. Namespaces touched here: `people`,
  `health`, `billing`, `common`.
- RTL, logical CSS properties only (`margin-inline-start`, never `margin-left`). Every
  interactive element needs an accessible name, visible focus state, 4.5:1 contrast.
  Every input has an associated `<label>`.
- No new UI dependency without asking first.
- Money is agorot (integers), never floats. Timestamps UTC, rendered Asia/Jerusalem.
- `.venv/bin/` prefix for all Python tooling — a bare `python3`/`pytest` is 3.8.
- `docs/plan/state.yaml` ticked only if a piece it tracks completes, in the same commit
  as the work, never for anything measurable.
- Stage commits by explicit path, never `git add -A` — concurrent sessions commit to
  this repo mid-work on unrelated lanes.
- `JoinFamilyStep.tsx`, `JoinFlow.test.tsx`, `JoinHealthStep.tsx`,
  `OnboardingWizardChrome.tsx`, `WizardNavButtons.tsx` are **untracked** (confirmed via
  `git ls-files` and `git status`) — only `JoinFlow.tsx` is tracked, and it's modified.
  Phase 0's first commit brings this baseline under version control before any further
  edit touches these files, so nothing is one `git clean`/`reset` away from being lost.
- What this lane does **not** touch: `#/join`, `#/add-child`, landing/trial booking,
  `RegistrationStep.tsx`/`AgreementFlow.tsx`, any schema change beyond the one flagged
  for `main` in Phase 3, and — inside the payment files touched in Phase 4 — anything
  beyond the card button and standing-order links' handoff (method selection UI, the
  summary screen's layout, promise creation for cash/cheque/standing-order all stay as
  they are). `PaymentsScreen.tsx` (the file `PaymentsSection.tsx` wraps) is explicitly
  **not** in the addendum's touch list and is not edited — its own standing-order links
  stay `<a target="_blank">`, a known, deliberate scope boundary, not a silent gap.
- Cross-vertical dependencies (billing's plan-list endpoint,
  `OnboardingService.register()` accepting `price_plan_id`, the health-template
  required-field migration) are **flagged, not built**, exactly as the spec says.

---

## Phase 0 — Safety-critical bug fixes

Two standalone fixes in files that survive the redesign unchanged in shape
(`app/services/people/onboarding.py`, `JoinFlow.tsx`'s `submitFamily`). A third
candidate — `JoinFamilyStep.tsx`'s invisible-validation bug (forward button `disabled`
while invalid, so `submit()`'s `setShowErrors(true)` never runs) — is **deliberately not
patched here**: that whole component is replaced in Phase 2's flat-list rebuild, so
fixing it now and rebuilding it in a few hours would fix the same bug twice. Phase 2's
new component is built with an always-clickable forward button from the start, with its
own test asserting it (noted again at the top of Phase 2 so this isn't a silently
dropped bug).

### Task 0.1: Baseline the untracked onboarding files

**Files:**
- Add (git): `web/apps/parent/src/features/onboarding/JoinFamilyStep.tsx`,
  `JoinFlow.test.tsx`, `JoinHealthStep.tsx`, `OnboardingWizardChrome.tsx`,
  `WizardNavButtons.tsx`

- [ ] **Step 1: Confirm nothing else changed underneath these files since the working
  tree was last touched**

  Run: `git status --short web/apps/parent/src/features/onboarding/`
  Expected: the five files listed above (four `??`, one ` M` for `JoinFlow.tsx`) and
  nothing else. If anything else appears, stop and investigate before proceeding — do
  not commit an unrelated concurrent session's in-progress work.

- [ ] **Step 2: Stage and commit the baseline, by explicit path**

```bash
git add web/apps/parent/src/features/onboarding/JoinFamilyStep.tsx \
        web/apps/parent/src/features/onboarding/JoinFlow.test.tsx \
        web/apps/parent/src/features/onboarding/JoinHealthStep.tsx \
        web/apps/parent/src/features/onboarding/OnboardingWizardChrome.tsx \
        web/apps/parent/src/features/onboarding/WizardNavButtons.tsx
git commit -m "$(cat <<'EOF'
chore(onboarding): commit the untracked wizard baseline before the redesign

These four components and the test file existed only in the working tree — the
prompt's own git-is-not-a-record-here warning. Committing them now so the redesign
that follows has a real diff instead of one more session's work sitting on top of
nothing.
EOF
)"
git status --short web/apps/parent/src/features/onboarding/
```
  Expected final status: clean (only `JoinFlow.tsx` still shows ` M` if it had prior
  uncommitted edits — check `git diff web/apps/parent/src/features/onboarding/JoinFlow.tsx`
  before deciding whether that edit is this session's or a leftover to leave alone; if
  unclear, ask before touching it).

### Task 0.2: Guard cross-family writes in `_apply_family_details`

**Files:**
- Modify: `app/services/people/onboarding.py:466-526` (`_apply_family_details`)
- Test: `tests/people/test_onboarding.py`

**Interfaces:**
- Consumes: `Guardian`, `Student`, `Person` models (`app/models/person.py`,
  `app/models/people.py`); `AgreementService.save_registration` (unchanged signature).
- Produces: no interface change — `_apply_family_details`'s signature and call site in
  `register()` (line 440-451) stay identical. Only its internal loop body changes.

The bug, precisely: `save_registration` writes onto `session.get(Person,
student.person_id)` (the **matched** student's own person row — `national_id`,
`student.grade`) and calls `_replace_pickup_contacts`/`_upsert_other_parent` keyed to
that same `student`. Today's loop calls this for *every* pair in `created_pairs`,
including a duplicate match that turned out to belong to a different family — the
guardian check currently only runs *after* the write, to decide whether to update
`.relation`, so by the time it discovers "this isn't our kid" the corruption already
happened. The fix moves that same guardian check to the *top* of the loop, before
`save_registration` is called at all, and skips the pair entirely when it fails —
identical to today's existing safe behavior for a pair that isn't in `created_pairs`.

- [ ] **Step 1: Write the failing test**

```python
def test_apply_family_details_never_touches_a_different_familys_student(
    tenant_session, app_session, studio
):
    """Family A resubmits with a child whose name collides with Family B's real kid.
    `duplicate_student()` matches studio-wide, not per-family, so the server correctly
    reports a duplicate -- but `_apply_family_details` must refuse to write Family A's
    details onto Family B's student just because the match happened to be studio-wide.
    """
    from app.models.people import Student
    from app.models.person import Guardian, Person

    # Family B, already on the roster with a real, distinguishable grade on file.
    parent_b = Person(studio_id=studio.id, first_name="דנה", last_name="לוי")
    app_session.add(parent_b)
    app_session.flush()
    child_b_person = Person(studio_id=studio.id, first_name="יוסי", last_name="כהן")
    app_session.add(child_b_person)
    app_session.flush()
    student_b = Student(
        studio_id=studio.id,
        person_id=child_b_person.id,
        status="active",
        source="onboarding_link",
        health_status="missing",
        joined_on=T0.date(),
        grade="ג",
    )
    app_session.add(student_b)
    app_session.flush()
    app_session.add(
        Guardian(
            studio_id=studio.id,
            person_id=parent_b.id,
            student_id=student_b.id,
            relation="mother",
            is_primary=True,
        )
    )
    app_session.commit()

    # Family A: an unrelated parent, resubmitting with a same-named child. The caller
    # (OnboardingService.register) would have matched this as a duplicate of student_b
    # and handed its id to _apply_family_details via created_pairs -- reproduced directly
    # here since the matching itself is already covered by matching.py's own tests.
    parent_a = Person(studio_id=studio.id, first_name="מיכל", last_name="כהן")
    app_session.add(parent_a)
    app_session.commit()

    child_payload = {
        "first_name": "יוסי",
        "last_name": "כהן",
        "national_id": "100000017",
        "grade": "א",
        "self": False,
    }
    OnboardingService._apply_family_details(
        tenant_session,
        parent=parent_a,
        created_pairs=[(child_payload, student_b.id)],
        signer={
            "national_id": "100000025",
            "address": "הרצל 1",
            "city": "תל אביב",
            "relation": "mother",
        },
        other_parent=None,
        pickup_contacts=[{"name": "סבתא", "phone": "0500000000"}],
        at=T0,
        actor_person_id=parent_a.id,
        actor_identity_id=None,
    )
    tenant_session.commit()

    app_session.refresh(student_b)
    assert student_b.grade == "ג"
    guardians = (
        app_session.execute(select(Guardian).where(Guardian.student_id == student_b.id))
        .scalars()
        .all()
    )
    assert len(guardians) == 1
    assert guardians[0].person_id == parent_b.id
    assert guardians[0].relation == "mother"


def test_apply_family_details_still_writes_for_the_signers_own_resubmitted_child(
    tenant_session, app_session, studio
):
    """The original bug's actual scenario -- same family resubmitting after a duplicate
    hit -- must keep working: the guard must not turn into a blanket refusal.
    """
    from app.models.people import Student
    from app.models.person import Guardian, Person

    parent = Person(studio_id=studio.id, first_name="מיכל", last_name="כהן")
    app_session.add(parent)
    app_session.flush()
    child_person = Person(studio_id=studio.id, first_name="דנה", last_name="כהן")
    app_session.add(child_person)
    app_session.flush()
    student = Student(
        studio_id=studio.id,
        person_id=child_person.id,
        status="active",
        source="onboarding_link",
        health_status="missing",
        joined_on=T0.date(),
    )
    app_session.add(student)
    app_session.flush()
    app_session.add(
        Guardian(
            studio_id=studio.id,
            person_id=parent.id,
            student_id=student.id,
            relation="mother",
            is_primary=True,
        )
    )
    app_session.commit()

    child_payload = {
        "first_name": "דנה",
        "last_name": "כהן",
        "national_id": "100000009",
        "grade": "ד",
        "self": False,
    }
    OnboardingService._apply_family_details(
        tenant_session,
        parent=parent,
        created_pairs=[(child_payload, student.id)],
        signer={
            "national_id": "100000017",
            "address": "הרצל 12",
            "city": "רעננה",
            "relation": "mother",
        },
        other_parent=None,
        pickup_contacts=[],
        at=T0,
        actor_person_id=parent.id,
        actor_identity_id=None,
    )
    tenant_session.commit()

    app_session.refresh(student)
    assert student.grade == "ד"
```

  Add `T0` and `select` imports if not already present at module scope (both already
  imported in this file per the existing tests — confirm before adding a duplicate
  import).

- [ ] **Step 2: Run the tests to verify the first one fails**

  Run: `.venv/bin/pytest -q tests/people/test_onboarding.py -k apply_family_details -v`
  Expected: `test_apply_family_details_never_touches_a_different_familys_student` FAILS
  (`student_b.grade == "א"`, not `"ג"`) — reproducing the corruption.
  `test_apply_family_details_still_writes_for_the_signers_own_resubmitted_child` should
  already PASS against today's code (it's the non-regression case, not the bug).

- [ ] **Step 3: Fix `_apply_family_details`**

  Replace the loop body (lines 487-524 today) with the guard moved to the top:

```python
        for child, student_id in created_pairs:
            student = session.get(Student, student_id)
            if student is None:
                continue
            guardian = session.execute(
                select(Guardian).where(
                    Guardian.student_id == student.id,
                    Guardian.person_id == parent.id,
                )
            ).scalar_one_or_none()
            if guardian is None:
                # A freshly created child always has this row (add_child creates it in
                # the same transaction). A duplicate match with no guardian link here is
                # a same-name collision with a stranger's kid, not this family
                # resubmitting -- leave it untouched, same as today's existing safe
                # behavior for a child that never made it into created_pairs at all.
                continue
            is_self = child.get("self") or is_self_guarding(tenant_session, student)
            child_payload = {
                "national_id": signer["national_id"] if is_self else child.get("national_id"),
                "address": signer["address"],
                "city": signer["city"],
                "grade": "" if is_self else str(child.get("grade") or ""),
                "phone_home": signer.get("phone_home"),
                "phone": parent.phone,
                "email": parent.email,
            }
            signer_payload = {
                "national_id": signer["national_id"],
                "aliyah_year": signer.get("aliyah_year"),
            }
            AgreementService.save_registration(
                tenant_session,
                student,
                child=child_payload,
                signer=signer_payload,
                other_parent=other_parent if has_minor_children else None,
                pickup_contacts=pickup_contacts if has_minor_children else [],
                subject_person_id=parent.id,
                actor_person_id=actor_person_id,
                at=at,
                actor_identity_id=actor_identity_id,
            )
            guardian.relation = "self" if is_self else str(signer.get("relation") or "parent")
        session.flush()
```

  Note this also deletes the now-redundant second `select(Guardian)` lookup that used
  to run after `save_registration` — one lookup, moved earlier, does both jobs.

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `.venv/bin/pytest -q tests/people/test_onboarding.py -v`
  Expected: all PASS, including the two new tests and every pre-existing test in this
  file (the all-duplicate-resubmission test from the earlier "Applied" fix must still
  pass — it's the same-family case, which the guard now allows through explicitly
  rather than by accident).

- [ ] **Step 5: Lint, typecheck the touched file, commit**

```bash
.venv/bin/ruff check --fix app/services/people/onboarding.py
.venv/bin/ruff format app/services/people/onboarding.py
.venv/bin/mypy app/services/people/onboarding.py
git add app/services/people/onboarding.py tests/people/test_onboarding.py
git commit -m "$(cat <<'EOF'
fix(people): scope _apply_family_details' writes to the submitting family's own child

duplicate_student() matches by name studio-wide, with no concept of "this parent's
own kids" -- so a resubmission that collided with an unrelated family's same-named
child was overwriting that family's grade, national id, pickup contacts and other-
parent link. The guardian check that decided this already ran, just one write too
late. Moved it before the write instead of after.
EOF
)"
```

### Task 0.3: Surface the server's `{code, field}` on a national-id error

**Files:**
- Modify: `web/apps/parent/src/features/onboarding/JoinFlow.tsx:156-198` (`submitFamily`)
- Test: `web/apps/parent/src/features/onboarding/JoinFlow.test.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/onboarding/<token>/register` — on a national-id failure,
  responds 422 with body `{"detail": {"code": "national_id_invalid", "field": "..."}}`
  (`app/routers/onboarding.py:365-369`, unchanged by this task).
- Produces: no change to `submitFamily`'s external signature; only its error handling.

- [ ] **Step 1: Write the failing test**

  Add to `JoinFlow.test.tsx`, alongside the existing `describe('JoinFlow', ...)` block —
  reuse the same fetch-mock and fill pattern as the first test in that file, but make
  the register call return 422:

```tsx
  it('shows the national-id-specific message when the server rejects the id', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/api/v1/public/onboarding/live-token-123456')) {
          return new Response(
            JSON.stringify({
              studio_name: 'מועדון הדגמה',
              email: null,
              groups: [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }],
            }),
            { status: 200 },
          )
        }
        if (
          url.includes('/api/v1/onboarding/live-token-123456/register') &&
          init?.method === 'POST'
        ) {
          return new Response(
            JSON.stringify({ detail: { code: 'national_id_invalid', field: 'signer_national_id' } }),
            { status: 422 },
          )
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )

    render(
      <JoinFlow
        billingClient={billingClient}
        healthClient={healthClient}
        locale="he"
        standingOrderLinks={[]}
        token="live-token-123456"
      />,
    )

    await screen.findByTestId('join-terms-step')
    await user.click(screen.getByRole('checkbox', { name: t('he', 'health.clubTerms.accept') }))
    await user.click(screen.getByRole('button', { name: t('he', 'health.agreement.next') }))

    await screen.findByTestId('join-family-step')
    await user.type(screen.getAllByLabelText(t('he', 'people.join.nationalId'))[0]!, '100000017')
    await user.type(screen.getByLabelText(t('he', 'people.join.address')), 'הרצל 12')
    await user.type(screen.getByLabelText(t('he', 'people.join.city')), 'רעננה')
    await user.type(screen.getAllByLabelText(t('he', 'people.join.phone'))[0]!, '0548123456')
    await user.type(screen.getAllByLabelText(t('he', 'people.join.fullName'))[2]!, 'דנה כהן')
    await user.type(screen.getByLabelText(t('he', 'people.join.birthdate')), '2016-03-14')
    await user.type(screen.getAllByLabelText(t('he', 'people.join.nationalId'))[2]!, '100000009')
    await user.type(screen.getByLabelText(t('he', 'people.join.grade')), 'ד')
    await user.click(screen.getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await user.click(screen.getByTestId('join-submit'))

    await screen.findByText(t('he', 'people.join.nationalIdInvalid'))
    expect(screen.queryByText(t('he', 'common.error.generic'))).toBeNull()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/JoinFlow.test.tsx --reporter=dot`
  Expected: FAILS — today's `catch { setFailed(t(locale, 'common.error.generic')) }`
  shows the generic message regardless of the response body.

- [ ] **Step 3: Parse the response body on failure**

  In `submitFamily` (`JoinFlow.tsx:156-198`), replace the `if (!response.ok) throw new
  Error(...)` / generic `catch` pair:

```tsx
      if (!response.ok) {
        let detail: { code?: string; field?: string } | null = null
        try {
          const body = (await response.json()) as { detail?: { code?: string; field?: string } }
          detail = body.detail ?? null
        } catch {
          detail = null
        }
        setFailed(
          detail?.code === 'national_id_invalid'
            ? t(locale, 'people.join.nationalIdInvalid')
            : t(locale, 'common.error.generic'),
        )
        return
      }
```

  This replaces the `throw new Error(String(response.status))` line and the outer
  `catch { setFailed(...) }` becomes the network/parsing-only fallback (unreachable
  fetch, malformed JSON) — keep it, but it no longer decides the message for a 4xx.

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/JoinFlow.test.tsx --reporter=dot`
  Expected: PASS, including the pre-existing two tests in this file.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
cd web && npx tsc --noEmit -p apps/parent
cd /Users/yuvalstolin/Desktop/studio-manager
.venv/bin/ruff check app  # unaffected, sanity check only
git add web/apps/parent/src/features/onboarding/JoinFlow.tsx web/apps/parent/src/features/onboarding/JoinFlow.test.tsx
git commit -m "$(cat <<'EOF'
fix(onboarding): surface the server's national-id error instead of a generic one

submitFamily collapsed every non-2xx register() response to common.error.generic,
discarding the {code, field} the server already sends for an invalid national id.
Parses the body now and shows the specific message when the code matches.
EOF
)"
```

**Phase 0 checkpoint:** report back — both fixes green, `tests/people` and the
onboarding vitest file passing, baseline committed. No further phase touches
`app/services/people/onboarding.py`'s duplicate-guard logic or `JoinFlow.tsx`'s error
handling again except where Phase 1-4 restructure `submitFamily`'s surrounding code for
unrelated reasons (in which case this fix travels with it, not around it).

---

## Phase 1 — Step renumbering + Step 1 (Welcome + Agreements)

**Architectural change, stated up front:** today, consent (`ConsentGate`, `forceReview`)
wraps `JoinFlow` entirely from `App.tsx`'s `JoinShell`, gating it from *outside* the
wizard's own step numbering — that's why `ConsentGate`'s `wizard` prop is passed
`position: 1` today as a bolt-on. The redesign folds sign-in + both consents into one
screen owned *by* the wizard, so `JoinShell` stops wrapping `JoinFlow` in `ConsentGate`
for this route (not touching `ConsentGate.tsx` itself, which stays exactly as it is for
`App.tsx`'s regular first-run gate at line 694). `JoinFlow` gains a new first step that
composes `ConsentGate`'s document-rendering (`PolicyDocument`) and `ClubTermsStep`'s
clause list, calling the same two underlying writes (`privacyClient.grant(...)` and the
existing deferred `acceptClubTermsForFamily` mechanism) from one combined action.

### Task 1.1: Renumber the step list to 4 entries

**Files:**
- Modify: `web/apps/parent/src/features/onboarding/OnboardingWizardChrome.tsx:6-12`
- Test: new `web/apps/parent/src/features/onboarding/OnboardingWizardChrome.test.tsx`

**Interfaces:**
- Produces: `ONBOARDING_WIZARD_STEPS` (4 entries: `welcome`, `family`, `health`,
  `payment`), `ONBOARDING_WIZARD_TOTAL = 4`, `stepPosition(key)` — same signature,
  narrowed key union. Every later task in this plan reads step numbers through
  `stepPosition`, never a literal.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest'
import { ONBOARDING_WIZARD_STEPS, ONBOARDING_WIZARD_TOTAL, stepPosition } from './OnboardingWizardChrome'

describe('OnboardingWizardChrome step list', () => {
  it('has exactly 4 steps: welcome, family, health, payment', () => {
    expect(ONBOARDING_WIZARD_STEPS.map((s) => s.key)).toEqual([
      'welcome',
      'family',
      'health',
      'payment',
    ])
    expect(ONBOARDING_WIZARD_TOTAL).toBe(4)
  })

  it('positions each step 1-indexed in order', () => {
    expect(stepPosition('welcome')).toBe(1)
    expect(stepPosition('family')).toBe(2)
    expect(stepPosition('health')).toBe(3)
    expect(stepPosition('payment')).toBe(4)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/OnboardingWizardChrome.test.tsx --reporter=dot`
  Expected: FAIL — today's list has 5 entries (`consent`, `terms`, ...).

- [ ] **Step 3: Update the step list**

```tsx
export const ONBOARDING_WIZARD_STEPS = [
  { key: 'welcome', label: 'health.onboarding.step.welcome' },
  { key: 'family', label: 'health.onboarding.step.family' },
  { key: 'health', label: 'health.onboarding.step.health' },
  { key: 'payment', label: 'health.onboarding.step.payment' },
] as const
```

  Add `health.onboarding.step.welcome` to `web/packages/i18n/he/health.ts` (and
  `en/`, `ru/`) — e.g. Hebrew `"הצטרפות"`, mirroring the existing
  `health.onboarding.step.*` keys' style. `health.onboarding.step.consent` and
  `.terms` become unused by this file specifically (still used by `ConsentGate`'s
  regular `App.tsx` gate, which passes its own literal title — check before deleting
  any key; likely still referenced there, so leave both in place).

- [ ] **Step 4: Run to verify it passes**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/OnboardingWizardChrome.test.tsx --reporter=dot`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/apps/parent/src/features/onboarding/OnboardingWizardChrome.tsx \
        web/apps/parent/src/features/onboarding/OnboardingWizardChrome.test.tsx \
        web/packages/i18n/he/health.ts web/packages/i18n/en/health.ts web/packages/i18n/ru/health.ts
git commit -m "feat(onboarding): renumber the join wizard to 4 steps"
```

### Task 1.2: Build the composed Step 1 (Welcome + Agreements) screen

**Files:**
- Create: `web/apps/parent/src/features/onboarding/JoinWelcomeStep.tsx`
- Test: `web/apps/parent/src/features/onboarding/JoinWelcomeStep.test.tsx`

**Interfaces:**
- Consumes: `PrivacyClient` (`../privacy/privacyClient` — same type `ConsentGate` takes;
  `.consents()`, `.grant(version, {terms, privacy})`), `PolicyDocument` (`@studio/ui`,
  same component `ConsentGate` renders inside `openDoc`), `Card`/`Checkbox`/`Button`/
  `Alert`/`SignIn` (`@studio/ui`), `useSession` (`@studio/core`).
- Produces:

```tsx
export type JoinWelcomeStepProps = {
  locale: Locale
  studioName: string
  privacyClient: PrivacyClient
  onSignedIn?: () => void  // no-op hook point, sign-in itself navigates via OAuth
  onAccept: (clubTermsAccepted: boolean) => void
  token: string
}
```

  `onAccept`'s boolean mirrors today's `clubTermsAccepted` state `JoinFlow` already
  threads through to `acceptClubTermsForFamily` after registration — this task's screen
  always calls it with `true` (both cards ticked is required to reach `onAccept` at
  all), but the boolean keeps the call site symmetrical with existing code rather than
  hardcoding `true` two files apart.

  This screen has two inner panels under one step number (not two wizard steps):
  1. **Welcome panel** — studio name, one line of context copy, `SignIn` if
     `session.status !== 'signed-in'` (reuse `@studio/ui`'s `SignIn`, same
     `app="parent"` / `returnPath={`/join/${token}`}` pattern `JoinFlow.tsx:145`
     already uses).
  2. **Agreements panel**, shown once signed in — two cards:
     - **App card**: one `Checkbox` (`accepted.app`), `PolicyDocument`'s "read full
       document" affordance reused exactly as `ConsentGate.tsx:171-178`/`196-203` do
       (two `Button`s opening `openDoc: 'terms' | 'policy' | null`, rendering
       `<PolicyDocument only={openDoc} .../>` inline — same pattern, collapsed to one
       checkbox instead of `ConsentGate`'s two).
     - **Club card**: one `Checkbox` (`accepted.club`), the three payment clauses
       inline — reuse `PAYMENT_CLAUSE_KEYS` exported from `ClubTermsStep.tsx` (export
       it there if not already; it's a private `const` today) rather than retyping the
       three i18n keys a second place. **No links** — per the 2026-09-03 correction,
       `ClubTermsStep`'s actual shape (inline clauses, no separate תקנון document) is
       what this composes, not the spec's original "two links" phrasing.
  3. On mount, call `privacyClient.consents()` the same way `ConsentGate` does, to read
     `state.policy_version` / `policy_version_label` for the version line under the app
     card — this screen always shows the checkbox regardless of prior acceptance
     (mirrors today's `forceReview` behavior for this route: the join wizard always
     asks, even if a family already holds the current policy).
  4. Continue button enabled only when both checkboxes are ticked. On press: call
     `privacyClient.grant(state.policy_version, { terms: true, privacy: true })`
     (identical call to `ConsentGate.tsx:136`), then `onAccept(true)`. A failed grant
     shows an inline `Alert` and leaves both checkboxes checked — same failure posture
     `ConsentGate` already documents ("a failed WRITE stays up").
  5. No back button (first step) — pass no `onBack` to `OnboardingWizardChrome`, same
     pattern the payment step already uses for "no back target."

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import type { PrivacyClient } from '../privacy/privacyClient'
import { JoinWelcomeStep } from './JoinWelcomeStep'

vi.mock('@studio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@studio/core')>()
  return {
    ...actual,
    useSession: () => ({
      status: 'signed-in',
      access: { parent: true, staff: false },
      studios: [],
      activeStudioId: null,
      devTools: false,
      actingAsPersonId: null,
      actingAsLabel: null,
      activeStudioName: null,
      displayName: 'מיכל כהן',
      reload: vi.fn(async () => {}),
      signOut: vi.fn(async () => {}),
    }),
  }
})

function makeClient(): PrivacyClient {
  return {
    consents: vi.fn(async () => ({
      outstanding: ['terms', 'privacy'],
      policy_version: 3,
      policy_version_label: 'v3',
      policy_is_draft: false,
    })),
    grant: vi.fn(async () => ({
      outstanding: [],
      policy_version: 3,
      policy_version_label: 'v3',
      policy_is_draft: false,
    })),
  } as unknown as PrivacyClient
}

describe('JoinWelcomeStep', () => {
  it('requires both cards checked before continuing, then grants consent once', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    const onAccept = vi.fn()

    render(
      <JoinWelcomeStep
        locale="he"
        studioName="מועדון הדגמה"
        privacyClient={client}
        onAccept={onAccept}
        token="live-token-123456"
      />,
    )

    await screen.findByText('מועדון הדגמה')
    const continueButton = screen.getByRole('button', { name: t('he', 'health.agreement.next') })
    expect(continueButton).toBeDisabled()

    await user.click(screen.getByTestId('join-welcome-app-check'))
    expect(continueButton).toBeDisabled()
    await user.click(screen.getByTestId('join-welcome-club-check'))
    expect(continueButton).not.toBeDisabled()

    await user.click(continueButton)

    await waitFor(() => expect(client.grant).toHaveBeenCalledWith(3, { terms: true, privacy: true }))
    expect(onAccept).toHaveBeenCalledWith(true)
  })

  it('shows the club terms clauses inline, with no links', async () => {
    const client = makeClient()
    render(
      <JoinWelcomeStep
        locale="he"
        studioName="מועדון הדגמה"
        privacyClient={client}
        onAccept={vi.fn()}
        token="live-token-123456"
      />,
    )
    await screen.findByTestId('health.clubTerms.payment.cheques')
    expect(screen.queryByRole('link')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/JoinWelcomeStep.test.tsx --reporter=dot`
  Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Export `PAYMENT_CLAUSE_KEYS` from `ClubTermsStep.tsx`**

  Change `const PAYMENT_CLAUSE_KEYS = [...]` (line 48) to `export const PAYMENT_CLAUSE_KEYS = [...]`.
  No other change to that file.

- [ ] **Step 4: Implement `JoinWelcomeStep.tsx`**

  Compose per the Interfaces section above, following `ConsentGate.tsx`'s existing
  `openDoc` pattern for the app card and `ClubTermsStep.tsx`'s clause-card markup for
  the club card (same `Card`/`Checkbox`/`data-testid` conventions used throughout this
  feature — `join-welcome-app-check`, `join-welcome-club-check`,
  `join-welcome-continue` as the new `data-testid`s this screen introduces). Wrap in
  `OnboardingWizardChrome` with `position={stepPosition('welcome')}` and no `onBack`.
  Add new i18n keys under `people.join.welcome*` (he/en/ru) for the welcome-line copy
  and the collapsed app-card checkbox label — do not reuse `reports.privacy.terms.title`
  /`.policy.title` verbatim for the single combined checkbox label, since that pair of
  keys describes two separate checkboxes; add one new key,
  e.g. `people.join.welcome.appCardLabel`.

- [ ] **Step 5: Run to verify it passes**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/JoinWelcomeStep.test.tsx --reporter=dot`
  Expected: PASS.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
cd web && npx tsc --noEmit -p apps/parent && npx eslint apps/parent/src/features/onboarding/JoinWelcomeStep.tsx web/apps/parent/src/features/health/ClubTermsStep.tsx --fix
cd /Users/yuvalstolin/Desktop/studio-manager
git add web/apps/parent/src/features/onboarding/JoinWelcomeStep.tsx \
        web/apps/parent/src/features/onboarding/JoinWelcomeStep.test.tsx \
        web/apps/parent/src/features/health/ClubTermsStep.tsx \
        web/packages/i18n/he/people.ts web/packages/i18n/en/people.ts web/packages/i18n/ru/people.ts
git commit -m "feat(onboarding): build the composed Step 1 welcome + agreements screen"
```

### Task 1.3: Wire Step 1 into `JoinFlow` and stop wrapping it in `ConsentGate`

**Files:**
- Modify: `web/apps/parent/src/features/onboarding/JoinFlow.tsx`
- Modify: `web/apps/parent/src/App.tsx:206-293` (`JoinShell`)
- Modify: `web/apps/parent/src/features/onboarding/JoinFlow.test.tsx` (rewrite the
  terms-step and back-navigation tests for the new first step)

**Interfaces:**
- Consumes: `JoinWelcomeStep` (Task 1.2).
- Produces: `JoinFlow`'s `JoinStep` union becomes `'welcome' | 'family' | 'health' |
  'payment'`; `JoinFlowProps` gains `privacyClient: PrivacyClient`; `onBackToConsent`
  prop is removed (no longer meaningful — there is no external consent step to step
  back to).

- [ ] **Step 1: Update the two existing `JoinFlow.test.tsx` tests to the new first
  step** (write these as the new expected shape first, confirming they fail against
  today's code — this is the TDD step, since the assertions themselves encode the
  post-refactor behavior)

  Replace the first test's terms-step assertions:
```tsx
    await screen.findByTestId('join-welcome-step')
    expect(screen.getByTestId('join-step-position')).toHaveTextContent('שלב 1 מתוך 4')
    expect(screen.getByTestId('join-onboarding-rail-welcome')).toHaveAttribute('aria-current', 'step')

    await user.click(screen.getByTestId('join-welcome-app-check'))
    await user.click(screen.getByTestId('join-welcome-club-check'))
    await user.click(screen.getByRole('button', { name: t('he', 'health.agreement.next') }))

    await screen.findByTestId('join-family-step')
    expect(screen.getByTestId('join-step-position')).toHaveTextContent('שלב 2 מתוך 4')
```
  Replace the second test (`'can step back from club terms to consent'`) entirely — it
  no longer applies (Step 1 has no back target). Delete it; no replacement is needed
  since "no back button on the first step" is already covered implicitly by every other
  test not finding one, and is asserted directly in `JoinWelcomeStep.test.tsx` (Task
  1.2) if not already — add one assertion there if missing:
  `expect(screen.queryByTestId('onboarding-wizard-back')).toBeNull()`.

- [ ] **Step 2: Run to verify these fail**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/JoinFlow.test.tsx --reporter=dot`
  Expected: FAIL — `JoinFlow` still renders the old `'terms'` step.

- [ ] **Step 3: Update `JoinFlow.tsx`**

  - `type JoinStep = 'welcome' | 'family' | 'health' | 'payment'`, `useState<JoinStep>('welcome')`.
  - Add `privacyClient: PrivacyClient` to `JoinFlowProps` (import the type from
    `../privacy/privacyClient`).
  - Remove `onBackToConsent` from props and from the render tree.
  - Replace the `step === 'terms'` branch:
```tsx
  if (step === 'welcome') {
    return (
      <div style={pageStyle} data-testid="join-welcome-step">
        <JoinWelcomeStep
          locale={locale}
          studioName={info.studio_name}
          privacyClient={privacyClient}
          onAccept={(accepted) => {
            setClubTermsAccepted(accepted)
            setStep('family')
          }}
          token={token}
        />
      </div>
    )
  }
```
  - Update `stepPosition('terms')`/`stepPosition('payment')` call sites accordingly
    (`payment` unaffected; the removed `terms` position call disappears with the branch).
  - Delete the stale header comment ("shows only the studio sign-in before auth... one
    five-step wizard: consent, club terms...") — replace with a comment naming the
    actual 4 steps.

- [ ] **Step 4: Simplify `JoinShell` in `App.tsx`**

  Collapse the `session.status === 'signed-in' ? <ConsentGate>...</ConsentGate> :
  <JoinFlow .../>` branch (lines 265-290) to a single unconditional render — `JoinFlow`
  now owns sign-in internally (unchanged) and consent internally (new):
```tsx
  return (
    <ThemeProvider>
      <AccessibilityMenu locale={locale} />
      <LanguagePicker locale={locale} onChoose={setLocale} />
      <JoinFlow
        billingClient={billingClient}
        healthClient={healthClient}
        locale={locale}
        onComplete={() => {
          globalThis.location.assign('/')
        }}
        privacyClient={privacyClient}
        standingOrderLinks={mandateLinks}
        token={token}
      />
    </ThemeProvider>
  )
```
  Remove the now-unused `consentReviewed` state and its setter, and the `ConsentGate`
  import if `JoinShell` was its only user in this file (check — `App.tsx:694` uses it
  too, in `AuthedApp`, so the import itself stays; only `JoinShell`'s own usage goes).

- [ ] **Step 5: Run to verify the tests pass**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/JoinFlow.test.tsx --reporter=dot`
  Expected: PASS.

- [ ] **Step 6: Typecheck, lint, run the full onboarding+privacy vitest slice, commit**

```bash
cd web && npx tsc --noEmit -p apps/parent
npx vitest run apps/parent/src/features/onboarding apps/parent/src/features/privacy --reporter=dot
cd /Users/yuvalstolin/Desktop/studio-manager
git add web/apps/parent/src/features/onboarding/JoinFlow.tsx \
        web/apps/parent/src/features/onboarding/JoinFlow.test.tsx \
        web/apps/parent/src/App.tsx
git commit -m "feat(onboarding): fold consent into the join wizard's own Step 1"
```

**Phase 1 checkpoint:** report back — 4-step rail live, Step 1 composes both consents
under one counter, `App.tsx`'s regular gate (`ConsentGate` at line 694) untouched and
its own tests still green
(`cd web && npx vitest run apps/parent/src/App.test.tsx apps/parent/src/AppHealthGate.test.tsx --reporter=dot`).

---

## Phase 2 — Step 2 (Family, the flat-list rebuild)

Replaces `JoinFamilyStep.tsx` entirely. Bakes in the always-clickable-forward-button fix
Phase 0 deliberately deferred here. Per the spec's two 2026-09-03 corrections: **no**
per-minor "same as / different" parent-info toggle (one shared section for every minor,
matching today's actual wire behavior), and **no** plan picker (the billing-vertical
dependency is flagged below, not built — see "Cross-vertical dependency" note).

**Cross-vertical dependency — flagged, not built.** The plan picker per row (§Step 2
point 5 in the spec) needs a studio plan-list read endpoint and
`OnboardingService.register()`/`add_child()` accepting an optional `price_plan_id`,
both billing-vertical, per-CLAUDE.md cross-vertical escalation territory this lane
doesn't have standing to build. This task's flat list keeps today's actual pricing
behavior (auto-derived via `plan_for_volume`, unchanged) and carries no plan picker UI.
Record the dependency in the findings register annotation (Phase 6) rather than
building a control with nowhere to send its answer.

### Task 2.1: Build the flat-list `JoinFamilyStep` state and validation (pure logic)

**Files:**
- Create: `web/apps/parent/src/features/onboarding/familyDraft.ts`
- Test: `web/apps/parent/src/features/onboarding/familyDraft.test.ts`

**Interfaces:**
- Produces:
```ts
export type SubjectRow = {
  key: string
  kind: 'self' | 'child'
  firstName: string      // ignored for kind: 'self' (comes from sign-in)
  lastName: string
  birthdate: string
  groupIds: string[]
  isAdult: boolean        // the explicit "18+?" answer; defaults false for 'child', true is meaningless for 'self' (adults by construction, no control shown)
  nationalId: string
  grade: string
}

export function emptySubjectRow(kind: 'self' | 'child'): SubjectRow
export function hasSharedMinors(rows: SubjectRow[]): boolean  // >=1 non-self row with isAdult === false
export function familyFormValid(state: {
  signerNationalId: string
  address: string
  city: string
  phone: string
  rows: SubjectRow[]
  otherFullName: string
  otherNationalId: string
  relation: GuardianRelation
}): boolean
export function toJoinFamilyPayload(displayName: string, email: string | null, state: {...}): JoinFamilyPayload
```
  `familyFormValid` mirrors today's `valid` `useMemo` in `JoinFamilyStep.tsx:172-208`
  almost exactly, with two changes: (a) it operates over `rows: SubjectRow[]` (flat,
  empty-by-default) instead of `children: ChildDraft[]` (pre-seeded), (b) it adds "at
  least one row exists" as a new required condition (§Step 2 point 6). A `self` row
  needs only `groupIds.length > 0` (no name/birthdate/id fields, same as today's
  `child.selfStudent` branch). A minor `child` row (isAdult === false) needs
  `firstName`, `birthdate`, valid `nationalId`, `grade`, `groupIds.length > 0` — same
  fields as today, since the 18+/child distinction only decides which UI SECTIONS
  render (parent/pickup), not what a row itself asks (an adult "child" row still needs
  its own name/birthdate/id, same as today's non-self child). An adult `child` row
  (isAdult === true) needs `firstName`, `groupIds.length > 0` only — no birthdate/id/
  grade required (mirrors an adult member's own reduced field set, i.e. what today's
  `selfStudent` branch requires, since a parent-submitted adult child is functionally
  the same "we don't need school-grade or a strict id" case, but DOES still need a
  national id per registration's required-fields rule if not self-guarding — re-check
  against `REQUIRED_REGISTRATION_FIELDS` in `agreement.py:148` before finalizing: it
  requires `national_id, address, city, grade` for a non-self-guarding student
  regardless of age, so an adult "child" row still needs national_id and grade filled
  by the parent, exactly like a minor row. There is no separate "adult child" required
  set on the backend — only `is_self_guarding` (father signs in themselves) changes the
  set. So: **isAdult only changes which SECTIONS render (parent-of-record/pickup), not
  which fields the row itself requires** — align `familyFormValid`'s per-row check
  accordingly: every non-self row (whether `isAdult` true or false) requires the same
  fields (firstName, birthdate, nationalId, grade, groupIds), matching today's actual
  non-self branch untouched. Confirm this against the spec's own "guardian/age question,
  resolved" paragraph before implementing — it explicitly says the 18+ answer decides
  what the form *asks*, not what the backend records, and does not claim birthdate/grade
  become optional for an adult child row.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  emptySubjectRow,
  familyFormValid,
  hasSharedMinors,
  toJoinFamilyPayload,
} from './familyDraft'

const baseState = {
  signerNationalId: '100000017',
  address: 'הרצל 12',
  city: 'רעננה',
  phone: '0548123456',
  otherFullName: '',
  otherNationalId: '',
  relation: 'mother' as const,
}

describe('familyFormValid', () => {
  it('is invalid with zero subject rows', () => {
    expect(familyFormValid({ ...baseState, rows: [] })).toBe(false)
  })

  it('is valid with one self row that has a group', () => {
    const row = { ...emptySubjectRow('self'), groupIds: ['g1'] }
    expect(familyFormValid({ ...baseState, rows: [row] })).toBe(true)
  })

  it('requires name, birthdate, national id and grade on a child row regardless of the 18+ answer', () => {
    const incomplete = { ...emptySubjectRow('child'), groupIds: ['g1'], isAdult: true }
    expect(familyFormValid({ ...baseState, rows: [incomplete] })).toBe(false)
    const complete = {
      ...incomplete,
      firstName: 'דנה',
      birthdate: '2005-01-01',
      nationalId: '100000009',
      grade: '',
    }
    // an adult child row still has no grade -- but grade is required per
    // REQUIRED_REGISTRATION_FIELDS regardless of age; only self-guarding drops it.
    expect(familyFormValid({ ...baseState, rows: [complete] })).toBe(false)
    expect(
      familyFormValid({ ...baseState, rows: [{ ...complete, grade: 'יב' }] }),
    ).toBe(true)
  })

  it('requires at least one group per row', () => {
    const row = {
      ...emptySubjectRow('child'),
      firstName: 'דנה',
      birthdate: '2016-01-01',
      nationalId: '100000009',
      grade: 'ד',
      groupIds: [],
    }
    expect(familyFormValid({ ...baseState, rows: [row] })).toBe(false)
  })
})

describe('hasSharedMinors', () => {
  it('is false with zero or one minor row', () => {
    expect(hasSharedMinors([])).toBe(false)
    expect(hasSharedMinors([{ ...emptySubjectRow('child'), isAdult: false }])).toBe(true)
  })
})

describe('toJoinFamilyPayload', () => {
  it('maps a self row to a self_student child with no birthdate/national_id/grade', () => {
    const row = { ...emptySubjectRow('self'), groupIds: ['g1'] }
    const payload = toJoinFamilyPayload('מיכל כהן', 'p@example.invalid', {
      ...baseState,
      rows: [row],
    })
    expect(payload.children).toEqual([
      {
        first_name: 'מיכל',
        last_name: 'כהן',
        birthdate: null,
        group_ids: ['g1'],
        self_student: true,
        national_id: null,
        grade: null,
      },
    ])
  })
})
```

- [ ] **Step 2: Run to verify these fail**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/familyDraft.test.ts --reporter=dot`
  Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `familyDraft.ts`**

  Port the validation/mapping logic out of today's `JoinFamilyStep.tsx` (lines 163-263),
  adapted to the flat `SubjectRow[]` shape and the "at least one row" rule. Reuse
  `isValidNationalId` from `../health/nationalId` exactly as today does.

- [ ] **Step 4: Run to verify they pass**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/familyDraft.test.ts --reporter=dot`
  Expected: PASS.

- [ ] **Step 5: Typecheck, commit**

```bash
cd web && npx tsc --noEmit -p apps/parent
cd /Users/yuvalstolin/Desktop/studio-manager
git add web/apps/parent/src/features/onboarding/familyDraft.ts web/apps/parent/src/features/onboarding/familyDraft.test.ts
git commit -m "feat(onboarding): pure validation/mapping for the flat-list family step"
```

### Task 2.2: Build the flat-list `JoinFamilyStep` component

**Files:**
- Modify (full rewrite): `web/apps/parent/src/features/onboarding/JoinFamilyStep.tsx`
- Test: `web/apps/parent/src/features/onboarding/JoinFamilyStep.test.tsx` (new —
  component-level tests separate from `JoinFlow.test.tsx`'s end-to-end coverage)

**Interfaces:**
- Consumes: `familyDraft.ts` (Task 2.1).
- Produces: `JoinFamilyStepProps` unchanged in shape (`displayName`, `email`, `error`,
  `groups`, `inFlight`, `locale`, `onBack`, `onSubmit`) — `JoinFlow.tsx`'s call site
  (line 231-241) needs no change.

  UI structure, per spec:
  1. Your-details card (unchanged fields: national id, address, city, phone,
     phone-home, aliyah-year — same as today's signer card).
  2. Subject list, **starting empty** — two buttons: "I train too" (adds one `kind:
     'self'` row, disabled/hidden once a self row already exists — only one signer),
     "+ add a child" (adds one `kind: 'child'` row via `emptySubjectRow('child')`).
  3. Per non-self row: an explicit "18 or older?" `SegmentedControl` (yes/no, no
     default selected — matches the "third state" convention `DeclarationForm.tsx`
     already uses for its boolean questions) bound to `isAdult`. Below it, the row's
     own fields (name, birthdate, national id, grade, group checkboxes) — identical
     markup to today's non-self child card, just per-row instead of a fixed list.
  4. Parent-info + pickup cards: rendered **once**, shared, whenever
     `hasSharedMinors(rows)` is true (any row with `isAdult === false`) — no per-row
     toggle. Same fields/markup as today's `hasMinorChildren` branch
     (`JoinFamilyStep.tsx:349-442`), condition swapped from `hasMinorChildren` to
     `hasSharedMinors(rows)`.
  5. Forward button: **always enabled** (the Phase-0-deferred fix lands here) —
     `forwardDisabled={inFlight}` only, no `!valid`. `submit()` still calls
     `setShowErrors(true)` and bails on `!valid` before calling `onSubmit`, exactly
     like `ClubTermsStep`'s already-correct pattern, so the inline "required" `Alert`
     (`showErrors && !valid`) is now reachable.
  6. Reuse `WizardNavButtons`, `OnboardingWizardChrome` (`position={stepPosition('family')}`)
     exactly as today.

- [ ] **Step 1: Write the failing tests** (component-level; the end-to-end walk through
  `JoinFlow` is Task 2.3)

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { JoinFamilyStep } from './JoinFamilyStep'

const groups = [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }]

describe('JoinFamilyStep (flat list)', () => {
  it('starts with an empty subject list and requires at least one row before submitting', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    expect(screen.queryByLabelText(t('he', 'people.join.birthdate'))).toBeNull()
    await user.click(screen.getByTestId('join-submit'))
    expect(onSubmit).not.toHaveBeenCalled()
    await screen.findByText(t('he', 'people.join.required'))
  })

  it('the forward button is never disabled, even while invalid', () => {
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByTestId('join-submit')).not.toBeDisabled()
  })

  it('"I train too" adds a self row with no name/birthdate fields, and no parent/pickup cards', async () => {
    const user = userEvent.setup()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    await user.click(screen.getByTestId('join-add-self'))
    expect(screen.queryByLabelText(t('he', 'people.join.birthdate'))).toBeNull()
    expect(screen.queryByText(t('he', 'people.join.pickupTitle'))).toBeNull()
  })

  it('a minor child row shows the parent/pickup cards; a second minor row does not duplicate them', async () => {
    const user = userEvent.setup()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    await user.click(screen.getByTestId('join-add-child'))
    await user.click(screen.getAllByRole('radio', { name: t('he', 'common.no') })[0]!)
    expect(screen.getAllByText(t('he', 'people.join.pickupTitle'))).toHaveLength(1)
    await user.click(screen.getByTestId('join-add-child'))
    await user.click(screen.getAllByRole('radio', { name: t('he', 'common.no') })[1]!)
    expect(screen.getAllByText(t('he', 'people.join.pickupTitle'))).toHaveLength(1)
  })

  it('an 18+ row hides its own parent/pickup requirement and does not force the shared cards alone', async () => {
    const user = userEvent.setup()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    await user.click(screen.getByTestId('join-add-child'))
    await user.click(screen.getAllByRole('radio', { name: t('he', 'common.yes') })[0]!)
    expect(screen.queryByText(t('he', 'people.join.pickupTitle'))).toBeNull()
  })
})
```

  Confirm the exact yes/no option labels the redesign uses for the "18+?" control
  before finalizing — reuse `common.yes`/`common.no` if those keys exist (grep
  `web/packages/i18n/he/common.ts`), otherwise add `people.join.ageYes`/`ageNo`
  matching this file's existing key-naming convention.

- [ ] **Step 2: Run to verify these fail**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/JoinFamilyStep.test.tsx --reporter=dot`
  Expected: FAIL — today's component pre-seeds one blank child and disables the
  forward button while invalid.

- [ ] **Step 3: Rewrite `JoinFamilyStep.tsx`**

  Replace the `children: ChildDraft[]` state (seeded `[emptyChild()]`) with `rows:
  SubjectRow[]` seeded `[]`. Replace the single "I train too" checkbox + "add child"
  button pattern with two explicit buttons (`data-testid="join-add-self"`,
  `"join-add-child"`). Replace the per-child "relation" `SegmentedControl` gating
  (`hasMinorChildren`) with `hasSharedMinors(rows)` from `familyDraft.ts`. Replace the
  inline `valid` useMemo and `submit()`'s payload construction with
  `familyFormValid`/`toJoinFamilyPayload` from `familyDraft.ts`. Add the per-row "18 or
  older?" `SegmentedControl`. Drop `forwardDisabled={!valid || inFlight}` to
  `forwardDisabled={inFlight}`.

- [ ] **Step 4: Run to verify they pass**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/JoinFamilyStep.test.tsx --reporter=dot`
  Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
cd web && npx tsc --noEmit -p apps/parent
cd /Users/yuvalstolin/Desktop/studio-manager
git add web/apps/parent/src/features/onboarding/JoinFamilyStep.tsx \
        web/apps/parent/src/features/onboarding/JoinFamilyStep.test.tsx \
        web/packages/i18n/he/people.ts web/packages/i18n/en/people.ts web/packages/i18n/ru/people.ts
git commit -m "feat(onboarding): rebuild Step 2 as an empty-by-default flat subject list"
```

### Task 2.3: Rewrite `JoinFlow.test.tsx`'s family-step interaction for the empty-by-default list

**Files:**
- Modify: `web/apps/parent/src/features/onboarding/JoinFlow.test.tsx`

**Interfaces:** none new — this task updates the existing end-to-end test's fill
sequence to click "add a child" before typing into child fields (today's test fills the
pre-seeded blank child directly, which no longer exists).

- [ ] **Step 1: Update the fill sequence in the first `JoinFlow.test.tsx` test**

  After reaching `join-family-step` (already updated in Task 1.3's Step 1), insert
  `await user.click(screen.getByTestId('join-add-child'))` before the child-field
  `user.type` calls, and select "no" on the 18+ control before filling
  birthdate/national-id/grade (a minor row is what the rest of the test's assertions
  expect — `other_parent`/`pickup_contacts` behavior downstream is unaffected since this
  test doesn't fill those optional fields either way).

- [ ] **Step 2: Run the full onboarding vitest slice**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding --reporter=dot`
  Expected: PASS — this is also the first point every file this phase touched runs
  together.

- [ ] **Step 3: Commit**

```bash
git add web/apps/parent/src/features/onboarding/JoinFlow.test.tsx
git commit -m "test(onboarding): update JoinFlow's end-to-end walk for the empty subject list"
```

**Phase 2 checkpoint:** report back — flat-list Step 2 live, forward button always
clickable with visible validation, shared (not per-row) parent/pickup section, no plan
picker (dependency flagged for Phase 6's findings-register annotation), full onboarding
vitest slice green.

---

## Phase 3 — Step 3 (Health, 2-inner-step redesign + deferred submission)

**Migration flag, stated up front, not built here.** Flipping
`chronic_illness_details`/`allergy_details`/`medication_details`/`other_details` from
`"required": false` to required-when-visible in the seeded template schema
(`alembic/versions/0018_the_clubs_own_registration_agreement.py`'s
`_FULL_TEMPLATE_SCHEMA_V2`) is schema-owning territory — flag it for `main` (Phase 6's
findings-register annotation), do not author the migration in this lane. This phase
still enforces the same rule **client-side**: the 4 fields in question are exactly the
`type: 'text'` questions with a `visible_if` (every other text question —
`health_fund`, `restrictions`, `special_notes` — is always-visible with no
`visible_if`), so a client-side helper can identify and require them without touching
the backend schema.

New components, not a patch to `DeclarationForm.tsx`: the deferred-submission model
means nothing calls `client.submit()` until the wizard's final flush (Phase 4), so the
per-kid screen can no longer own its own submit button the way `DeclarationForm` does
today. `DeclarationForm.tsx` itself is untouched (still used by `AgreementFlow`/
`RegistrationStep` for the other three entrances, out of this lane's scope) — its
question-rendering patterns (boolean `SegmentedControl`, clause confirm, detail
textarea) are the reference this phase's new components follow, not something they
import wholesale.

### Task 3.1: Build the per-kid health draft state (pure logic)

**Files:**
- Create: `web/apps/parent/src/features/onboarding/healthDraft.ts`
- Test: `web/apps/parent/src/features/onboarding/healthDraft.test.ts`

**Interfaces:**
- Produces:
```ts
export type SubjectHealthDraft = {
  studentId: string
  openingAnswer: 'healthy' | 'reporting' | null   // step-1's opening question, null = unanswered
  answers: Record<string, AnswerValue>
  signatureBase64: string | null
}

export function emptyHealthDraft(studentId: string): SubjectHealthDraft

/** The 4 fields the spec requires-when-visible, identified structurally: text-type
 *  questions with a `visible_if` (every other text question in the schema is always
 *  visible). Client-side enforcement standing in for the flagged-not-built migration. */
export function conditionalDetailQuestionIds(schema: TemplateSchema): string[]

export function healthAnswersComplete(
  schema: TemplateSchema,
  draft: SubjectHealthDraft,
): boolean  // unansweredRequired(schema, draft.answers) is empty AND every
            // conditionalDetailQuestionIds() question currently visible has a
            // non-empty answer AND draft.signatureBase64 !== null

export function markAllHealthyDraft(schema: TemplateSchema, draft: SubjectHealthDraft): SubjectHealthDraft
```
  `markAllHealthyDraft` ports `DeclarationForm.tsx:194-200`'s `markAllHealthy` logic
  (fill blank booleans with `false`, leave everything else alone) onto the draft shape.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import type { TemplateSchema } from '../health/healthClient'
import {
  conditionalDetailQuestionIds,
  emptyHealthDraft,
  healthAnswersComplete,
  markAllHealthyDraft,
} from './healthDraft'

const schema: TemplateSchema = {
  sections: [
    {
      id: 's1',
      questions: [
        { id: 'asthma', type: 'boolean', label: 'אסתמה' },
        {
          id: 'chronic_illness_details',
          type: 'text',
          label: 'פרטים',
          required: false,
          visible_if: { asthma: true },
        },
        { id: 'health_fund', type: 'text', label: 'קופת חולים', required: false },
        { id: 'clause1', type: 'clause', label: '' },
      ],
    },
  ],
}

describe('conditionalDetailQuestionIds', () => {
  it('finds only text questions with a visible_if trigger', () => {
    expect(conditionalDetailQuestionIds(schema)).toEqual(['chronic_illness_details'])
  })
})

describe('healthAnswersComplete', () => {
  it('is false when a visible conditional detail field is blank, even though the schema marks it optional', () => {
    const draft = {
      ...emptyHealthDraft('st1'),
      answers: { asthma: true, clause1: 'clause-text' },
      signatureBase64: 'data:image/png;base64,x',
    }
    expect(healthAnswersComplete(schema, draft)).toBe(false)
  })

  it('is true once the visible detail field is filled', () => {
    const draft = {
      ...emptyHealthDraft('st1'),
      answers: { asthma: true, chronic_illness_details: 'טיפול קבוע', clause1: 'clause-text' },
      signatureBase64: 'data:image/png;base64,x',
    }
    expect(healthAnswersComplete(schema, draft)).toBe(true)
  })

  it('does not require the hidden detail field when the trigger is no', () => {
    const draft = {
      ...emptyHealthDraft('st1'),
      answers: { asthma: false, clause1: 'clause-text' },
      signatureBase64: 'data:image/png;base64,x',
    }
    expect(healthAnswersComplete(schema, draft)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify these fail**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/healthDraft.test.ts --reporter=dot`
  Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `healthDraft.ts`**, reusing `isVisible`/`isAnswered`/
  `unansweredRequired` from `../health/healthClient` (already exported, no change
  needed there).

- [ ] **Step 4: Run to verify they pass**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/healthDraft.test.ts --reporter=dot`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/apps/parent/src/features/onboarding/healthDraft.ts web/apps/parent/src/features/onboarding/healthDraft.test.ts
git commit -m "feat(onboarding): per-kid health draft state and required-when-visible detail fields"
```

### Task 3.2: Build the shared review popup

**Files:**
- Create: `web/apps/parent/src/features/onboarding/HealthReviewPopup.tsx`
- Test: `web/apps/parent/src/features/onboarding/HealthReviewPopup.test.tsx`

**Interfaces:**
- Consumes: `healthDraft.ts` (Task 3.1), `TemplateSchema`/`AnswerValue` (`../health/healthClient`).
- Produces:
```tsx
export type HealthReviewPopupProps = {
  locale: Locale
  schema: TemplateSchema
  answers: Record<string, AnswerValue>
  onChange: (next: Record<string, AnswerValue>) => void
  onClose: () => void
}
```
  Renders all 13 boolean questions + the 4 conditional detail fields (shown/required
  per `conditionalDetailQuestionIds`) + `health_fund`/`restrictions`/`special_notes`
  (always visible, optional) + the clause confirm — same question-rendering shapes as
  `DeclarationForm.tsx`'s section loop (boolean `SegmentedControl`, text `textarea`,
  clause `Checkbox`), reimplemented here since this component owns a different question
  set framing (a review/edit surface, not a top-to-bottom form) and needs no submit
  button of its own — it only calls `onChange` as the parent draft updates.
  `special_notes` is rendered with visibly distinct emphasis (a labeled callout, not
  just another textarea row) per the spec's "surfaced... prominently" requirement.

  Two callers seed it differently (both route through this one component, not two
  parallel UIs):
  - From the "healthy" collapsed card's "open" link: `answers` seeded all-false for
    every boolean not yet answered.
  - From the "something to report" button: `answers` seeded from whatever's already in
    the draft (blank on first entry).

  Both cases are the CALLER's responsibility (Task 3.3) — this component itself is
  seed-agnostic, just an editor over whatever `answers` it's given.

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HealthReviewPopup } from './HealthReviewPopup'
import type { TemplateSchema } from '../health/healthClient'

const schema: TemplateSchema = {
  sections: [
    {
      id: 's1',
      title: 'רקע רפואי',
      questions: [
        { id: 'asthma', type: 'boolean', label: 'אסתמה' },
        {
          id: 'chronic_illness_details',
          type: 'text',
          label: 'פרטים',
          required: false,
          visible_if: { asthma: true },
        },
        { id: 'special_notes', type: 'text', label: 'הערות למנהל', required: false },
        { id: 'clause1', type: 'clause', label: '' },
      ],
    },
  ],
}

describe('HealthReviewPopup', () => {
  it('surfaces special_notes distinctly from the ordinary text fields', () => {
    render(
      <HealthReviewPopup
        locale="he"
        schema={schema}
        answers={{}}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId('health-review-special-notes')).toBeInTheDocument()
  })

  it('answering yes reveals the detail field and reports the change', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <HealthReviewPopup
        locale="he"
        schema={schema}
        answers={{}}
        onChange={onChange}
        onClose={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('radio', { name: 'כן' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ asthma: true }))
  })
})
```

- [ ] **Step 2: Run to verify these fail**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/HealthReviewPopup.test.tsx --reporter=dot`
  Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `HealthReviewPopup.tsx`**

- [ ] **Step 4: Run to verify they pass, typecheck, commit**

```bash
cd web && npx vitest run apps/parent/src/features/onboarding/HealthReviewPopup.test.tsx --reporter=dot
npx tsc --noEmit -p apps/parent
cd /Users/yuvalstolin/Desktop/studio-manager
git add web/apps/parent/src/features/onboarding/HealthReviewPopup.tsx \
        web/apps/parent/src/features/onboarding/HealthReviewPopup.test.tsx \
        web/packages/i18n/he/health.ts web/packages/i18n/en/health.ts web/packages/i18n/ru/health.ts
git commit -m "feat(onboarding): shared health review popup, seeded two ways"
```

### Task 3.3: Build the 2-inner-step health queue screen (`JoinHealthStep` rebuild)

**Files:**
- Modify (full rewrite): `web/apps/parent/src/features/onboarding/JoinHealthStep.tsx`
- Test: `web/apps/parent/src/features/onboarding/JoinHealthStep.test.tsx` (new)

**Interfaces:**
- Consumes: `healthDraft.ts`, `HealthReviewPopup.tsx`, `SignaturePad`
  (`../health/SignaturePad`, unchanged import), `applicableClause`/`clauseTextKey`
  (`../health/clauses`, unchanged).
- Produces:
```tsx
export type JoinHealthStepProps = {
  client: HealthClient
  locale: Locale
  onBack: () => void
  onSigned: (draft: SubjectHealthDraft) => void   // was onSigned: () => void — now
                                                    // hands the caller the finished
                                                    // per-kid draft to accumulate
                                                    // (Phase 5 wires this into the
                                                    // sessionStorage draft)
  signerName?: string
  students: readonly GatedStudent[]
  drafts: Record<string, SubjectHealthDraft>        // accumulated so far, keyed by
                                                      // studentId (Phase 5's shape;
                                                      // this task just threads it)
}
```
  Per kid in the queue (`students.filter(needsFullDeclaration)`, unchanged from today),
  exactly 2 inner screens:
  1. **Opening question only**: "healthy?" vs "something to report" — two large buttons,
     nothing else. Selecting either sets the draft's `openingAnswer` and advances to
     screen 2 for the SAME kid (no separate step in the queue pill row for this — the
     pill row still counts by kid, not by inner screen).
  2. **Everything else**: if `openingAnswer === 'healthy'`, a collapsed card ("13
     questions marked no") with an "open" link into `HealthReviewPopup` seeded
     all-false for unanswered booleans (reuse `markAllHealthyDraft` from Task 3.1 to
     compute the seed). If `'reporting'`, the full popup content rendered expanded
     inline (same `HealthReviewPopup`, just not behind a collapsed card — or, simpler
     and matching "one component, not two parallel UIs": always render
     `HealthReviewPopup` inline on screen 2, collapsed-vs-expanded is purely whether
     it starts open or closed, which the popup component can take as a prop rather than
     this screen re-deriving the same content twice — reconsider `HealthReviewPopup`'s
     API during implementation if a `defaultOpen`/`startCollapsed` prop reads cleaner
     than two call shapes; keep the "one component" invariant either way). Below it,
     unchanged: קופת חולים + טלפון חירום fields, the derived clause (`applicableClause`),
     `SignaturePad`. A "sign and continue" button validates via
     `healthAnswersComplete` (Task 3.1), calls `onSigned(finishedDraft)`, and the queue
     advances to the next kid's opening question (screen 1 again, fresh).
  3. No `client.submit()` call anywhere in this file — that's the whole point of the
     deferred model; verified explicitly by a test asserting `client.submit` is never
     invoked while the queue runs.

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import type { HealthClient } from '../health/healthClient'
import { JoinHealthStep } from './JoinHealthStep'

const schema = {
  sections: [{ id: 's1', questions: [{ id: 'asthma', type: 'boolean' as const, label: 'אסתמה' }] }],
}

function makeClient(): HealthClient {
  return {
    template: vi.fn(async () => ({ id: 'tmpl1', version: 1, schema })),
    submit: vi.fn(),
  } as unknown as HealthClient
}

const students = [
  { id: 'st1', display_name: 'דנה כהן', health_status: 'missing' as const },
  { id: 'st2', display_name: 'יוסי כהן', health_status: 'missing' as const },
]

describe('JoinHealthStep (2-inner-step, deferred)', () => {
  it('shows the opening question first, with nothing else on screen', async () => {
    const client = makeClient()
    render(
      <JoinHealthStep
        client={client}
        drafts={{}}
        locale="he"
        onBack={vi.fn()}
        onSigned={vi.fn()}
        students={students}
      />,
    )
    await screen.findByTestId('health-opening-question')
    expect(screen.queryByTestId('signature-pad')).toBeNull()
  })

  it('never calls client.submit while the queue is in progress', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(
      <JoinHealthStep
        client={client}
        drafts={{}}
        locale="he"
        onBack={vi.fn()}
        onSigned={vi.fn()}
        students={students}
      />,
    )
    await user.click(await screen.findByTestId('health-opening-healthy'))
    expect(client.submit).not.toHaveBeenCalled()
  })

  it('advances to the next kid on sign, without touching the previous kid\'s draft again', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    const onSigned = vi.fn()
    render(
      <JoinHealthStep
        client={client}
        drafts={{}}
        locale="he"
        onBack={vi.fn()}
        onSigned={onSigned}
        students={students}
      />,
    )
    await user.click(await screen.findByTestId('health-opening-healthy'))
    // signature pad interaction is exercised in SignaturePad's own tests; here assert
    // the queue moves to student 2's opening question after signing student 1.
    // (fill via the pad's own testing-library affordance — see SignaturePad.test.tsx
    // for the exact interaction pattern already used elsewhere in this codebase.)
  })
})
```

  (The third test's body is intentionally left to reference `SignaturePad.test.tsx`'s
  existing interaction pattern — read that file during implementation to fill in the
  exact signing gesture rather than guessing at it here.)

- [ ] **Step 2: Run to verify these fail**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/JoinHealthStep.test.tsx --reporter=dot`
  Expected: FAIL — today's component renders `DeclarationForm` directly, with no
  opening question and an immediate `client.submit()` on sign.

- [ ] **Step 3: Implement the rewrite**, per the Interfaces section above.

- [ ] **Step 4: Run to verify they pass, typecheck, commit**

```bash
cd web && npx vitest run apps/parent/src/features/onboarding/JoinHealthStep.test.tsx --reporter=dot
npx tsc --noEmit -p apps/parent
cd /Users/yuvalstolin/Desktop/studio-manager
git add web/apps/parent/src/features/onboarding/JoinHealthStep.tsx \
        web/apps/parent/src/features/onboarding/JoinHealthStep.test.tsx \
        web/packages/i18n/he/health.ts web/packages/i18n/en/health.ts web/packages/i18n/ru/health.ts
git commit -m "feat(onboarding): rebuild Step 3 as opening-question + review popup, deferred submit"
```

### Task 3.4: Wire the deferred health accumulation into `JoinFlow`

**Files:**
- Modify: `web/apps/parent/src/features/onboarding/JoinFlow.tsx`
- Modify: `web/apps/parent/src/features/onboarding/JoinFlow.test.tsx`

**Interfaces:**
- Produces: `JoinFlow` gains `const [healthDrafts, setHealthDrafts] =
  useState<Record<string, SubjectHealthDraft>>({})`, passed to `JoinHealthStep` as
  `drafts`; `onSigned` becomes `(draft) => setHealthDrafts((prev) => ({ ...prev,
  [draft.studentId]: draft }))` followed by the existing `refreshStudents()`/advance
  logic — **except** `refreshStudents()` currently re-reads `/me/students` to check
  `firstStudentNeedingDeclaration`, which depended on the server already knowing the
  declaration was signed (today's immediate-submit model). Under deferred submission,
  the server never learns a kid is done until the final flush (Phase 4), so
  `firstStudentNeedingDeclaration` must be computed **locally** from `healthDrafts`
  instead of re-fetched: a kid counts as "still needing a declaration" while
  `healthDrafts[kid.id]` is absent or incomplete (per `healthAnswersComplete`), not by
  re-reading `health_status` from the server. This is the deferred model's central
  behavior change to `JoinFlow`'s advance-to-payment logic — get it right here, since
  Phase 4's flush depends on `healthDrafts` holding every kid's finished answers by the
  time the wizard reaches the done screen.

- [ ] **Step 1: Write the failing test**

  Add to `JoinFlow.test.tsx`: after registering a two-child family (extend the existing
  fixture or add a new test), sign the first kid's health draft, assert the wizard
  stays on the health queue for the second kid **without** a second `GET
  /me/students` call having changed `health_status` server-side (the mock server's
  `/me/students` response stays `health_status: 'missing'` for both throughout — this
  is exactly what proves the advance decision is now local, not server-derived). Sign
  the second kid, assert the wizard advances to `join-payment-step` even though the
  mocked `/me/students` never reports either kid as `'signed'`.

- [ ] **Step 2: Run to verify it fails**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/JoinFlow.test.tsx --reporter=dot`
  Expected: FAIL — today's `JoinFlow` advances based on `refreshStudents()`'s server
  response, which the test deliberately keeps at `'missing'`.

- [ ] **Step 3: Implement** — replace the `onSigned` callback at
  `JoinFlow.tsx:251-256` and the health-step advance effect at lines 115-124 to read
  from `healthDrafts` instead of `students`' server-reported `health_status`.

- [ ] **Step 4: Run to verify it passes, typecheck, run the full onboarding slice, commit**

```bash
cd web && npx vitest run apps/parent/src/features/onboarding --reporter=dot
npx tsc --noEmit -p apps/parent
cd /Users/yuvalstolin/Desktop/studio-manager
git add web/apps/parent/src/features/onboarding/JoinFlow.tsx web/apps/parent/src/features/onboarding/JoinFlow.test.tsx
git commit -m "feat(onboarding): advance the health queue from local drafts, not the server"
```

**Phase 3 checkpoint:** report back — 2-inner-step health redesign live, shared review
popup seeded both ways, `special_notes` surfaced, required-when-visible enforced
client-side (migration flagged, not built), deferred submission model wired through
`JoinFlow` with the queue advancing off local draft state. Full onboarding vitest slice
green. No `client.submit()` call anywhere yet outside a test's own mock assertion —
Phase 4 adds the one real call site.

---

## Phase 4 — Step 4 (Payment: richer done-state + in-app overlay)

Per the addendum, this phase's frontend touches are narrowly: `PaymentSetup.tsx` (card
button + standing-order links' handoff), `PaymentsSection.tsx`/`submitUpayForm`,
`PaymentCompleteScreen.tsx`/`PaymentCompleteSection.tsx`. `PaymentsScreen.tsx` (wrapped
by `PaymentsSection.tsx`) is **not** touched — its own standing-order links stay
`<a target="_blank">`, an acknowledged scope boundary. No backend change: `orders.py`
already builds `returnurl` pointing at the parent app's own origin
(`upay_form_fields`), which is all the overlay's `postMessage` mechanism needs.

### Task 4.1: Make `submitUpayForm` target an iframe

**Files:**
- Modify: `web/apps/parent/src/features/billing/PaymentsSection.tsx:62-75` (`submitUpayForm`)
- Test: `web/apps/parent/src/features/billing/PaymentsSection.test.tsx`

**Interfaces:**
- Produces: `submitUpayForm(form: UpayForm, targetName?: string): void` — when
  `targetName` is given, the built `<form>` gets `target={targetName}` before
  `.submit()`, navigating a same-named `<iframe>` instead of the top window. Existing
  call sites (no `targetName`) are unaffected — same full-page navigation as today.

- [ ] **Step 1: Write the failing test**

```tsx
it('submits into a named iframe instead of the top window when a target is given', () => {
  const iframe = document.createElement('iframe')
  iframe.name = 'upay-overlay-frame'
  document.body.append(iframe)

  submitUpayForm({ action: 'https://app.upay.co.il/x', fields: { a: '1' } }, 'upay-overlay-frame')

  const form = document.body.querySelector('form')
  expect(form).not.toBeNull()
  expect(form?.target).toBe('upay-overlay-frame')
  expect(form?.action).toBe('https://app.upay.co.il/x')

  iframe.remove()
})
```

  (Vitest/jsdom does not actually navigate the iframe on `.submit()` — this test
  asserts the form's `target`/`action`/`method` attributes are correct, which is the
  testable boundary; the actual navigation is exercised by the manual walkthrough in
  Phase 6, per the prompt's own instruction not to fake a real card payment in a test.)

- [ ] **Step 2: Run to verify it fails**

  Run: `cd web && npx vitest run apps/parent/src/features/billing/PaymentsSection.test.tsx --reporter=dot`
  Expected: FAIL — `submitUpayForm` takes one argument today.

- [ ] **Step 3: Implement**

```tsx
export function submitUpayForm(form: UpayForm, targetName?: string): void {
  const el = document.createElement('form')
  el.method = 'POST'
  el.action = form.action
  if (targetName) el.target = targetName
  for (const [name, value] of Object.entries(form.fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    el.append(input)
  }
  document.body.append(el)
  el.submit()
  el.remove()
}
```

  (Adding `el.remove()` after submit is a small, safe cleanup — the hidden form has no
  further purpose once the browser has read it to build the navigation. Not testable
  meaningfully; note it in the commit, don't add a test asserting DOM cleanup for its
  own sake.)

- [ ] **Step 4: Run to verify it passes, typecheck, commit**

```bash
cd web && npx vitest run apps/parent/src/features/billing/PaymentsSection.test.tsx --reporter=dot
npx tsc --noEmit -p apps/parent
cd /Users/yuvalstolin/Desktop/studio-manager
git add web/apps/parent/src/features/billing/PaymentsSection.tsx web/apps/parent/src/features/billing/PaymentsSection.test.tsx
git commit -m "feat(billing): submitUpayForm can target a named iframe"
```

### Task 4.2: Build `PaymentOverlay`

**Files:**
- Create: `web/apps/parent/src/features/billing/PaymentOverlay.tsx`
- Test: `web/apps/parent/src/features/billing/PaymentOverlay.test.tsx`

**Interfaces:**
- Consumes: `submitUpayForm` (Task 4.1), `UpayForm` type.
- Produces:
```tsx
export const PAYMENT_OVERLAY_FRAME_NAME = 'upay-payment-overlay'
export const PAYMENT_OVERLAY_MESSAGE_TYPE = 'upay-payment-complete'

export type PaymentOverlayRequest =
  | { kind: 'checkout'; form: UpayForm }
  | { kind: 'link'; url: string }

export type PaymentOverlayProps = {
  locale: Locale
  request: PaymentOverlayRequest
  onComplete: (ref: string) => void
  onClose: () => void
}

export function PaymentOverlay({ locale, request, onComplete, onClose }: PaymentOverlayProps)
```
  On mount: renders a modal/box (reuse whatever modal primitive `@studio/ui` already
  offers — grep for one before inventing a new overlay shell; if none exists, a
  full-viewport fixed-position `<div>` with a close button is the minimal fallback,
  matching this codebase's existing inline-style convention) containing `<iframe
  name={PAYMENT_OVERLAY_FRAME_NAME} title={...} />`. If `request.kind === 'checkout'`,
  calls `submitUpayForm(request.form, PAYMENT_OVERLAY_FRAME_NAME)` once, in an effect
  keyed on `request`. If `'link'`, sets the iframe's `src` directly to `request.url`
  (a plain GET navigation, no form).

  Listens via `window.addEventListener('message', ...)`: on a message whose
  `event.origin === window.location.origin` and `event.data?.type ===
  PAYMENT_OVERLAY_MESSAGE_TYPE`, calls `onComplete(event.data.ref)` and removes the
  listener. Cleans up the listener on unmount.

  `onClose` wires a visible close button — per the addendum's own framing, closing
  mid-payment is a real possibility (uPay's own page has its own cancel/back), and the
  overlay must not trap the user; closing does not call `onComplete`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PAYMENT_OVERLAY_MESSAGE_TYPE, PaymentOverlay } from './PaymentOverlay'

describe('PaymentOverlay', () => {
  it('renders an iframe and calls onComplete on a matching postMessage', () => {
    const onComplete = vi.fn()
    render(
      <PaymentOverlay
        locale="he"
        request={{ kind: 'link', url: 'https://app.upay.co.il/mandate/abc' }}
        onComplete={onComplete}
        onClose={vi.fn()}
      />,
    )
    const iframe = screen.getByTitle(/./) as HTMLIFrameElement
    expect(iframe.tagName).toBe('IFRAME')
    expect(iframe.src).toBe('https://app.upay.co.il/mandate/abc')

    fireEvent(
      window,
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: PAYMENT_OVERLAY_MESSAGE_TYPE, ref: 'ref-123' },
      }),
    )
    expect(onComplete).toHaveBeenCalledWith('ref-123')
  })

  it('ignores a message from a different origin', () => {
    const onComplete = vi.fn()
    render(
      <PaymentOverlay
        locale="he"
        request={{ kind: 'link', url: 'https://app.upay.co.il/mandate/abc' }}
        onComplete={onComplete}
        onClose={vi.fn()}
      />,
    )
    fireEvent(
      window,
      new MessageEvent('message', {
        origin: 'https://evil.example',
        data: { type: PAYMENT_OVERLAY_MESSAGE_TYPE, ref: 'ref-123' },
      }),
    )
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('close button calls onClose, not onComplete', async () => {
    const onClose = vi.fn()
    render(
      <PaymentOverlay
        locale="he"
        request={{ kind: 'link', url: 'https://app.upay.co.il/mandate/abc' }}
        onComplete={vi.fn()}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByTestId('payment-overlay-close'))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify these fail**

  Run: `cd web && npx vitest run apps/parent/src/features/billing/PaymentOverlay.test.tsx --reporter=dot`
  Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `PaymentOverlay.tsx`**

- [ ] **Step 4: Run to verify they pass, typecheck, commit**

```bash
cd web && npx vitest run apps/parent/src/features/billing/PaymentOverlay.test.tsx --reporter=dot
npx tsc --noEmit -p apps/parent
cd /Users/yuvalstolin/Desktop/studio-manager
git add web/apps/parent/src/features/billing/PaymentOverlay.tsx web/apps/parent/src/features/billing/PaymentOverlay.test.tsx
git commit -m "feat(billing): build the in-app payment overlay (iframe + postMessage completion)"
```

### Task 4.3: Wire `PaymentCompleteScreen`/`PaymentCompleteSection` to post the completion message when embedded

**Files:**
- Modify: `web/apps/parent/src/features/billing/PaymentCompleteSection.tsx`
- Test: `web/apps/parent/src/features/billing/PaymentCompleteSection.test.tsx` (check
  whether this file already exists — `PaymentsSection.test.tsx` was the only billing
  test file confirmed via `find` earlier; create if absent)

**Interfaces:**
- Produces: `PaymentCompleteSection` detects `window.top !== window.self` on mount; when
  embedded AND `status !== null` (the poll has resolved), posts
  `window.top?.postMessage({ type: PAYMENT_OVERLAY_MESSAGE_TYPE, ref: publicRef },
  window.location.origin)` **once** (guard with a ref so a re-render from a later poll
  doesn't re-post), then renders nothing further meaningful (the parent overlay is
  about to close it) — a minimal "processing" message is enough, since the real UI is
  the parent frame's. When NOT embedded (`window.top === window.self`), behavior is
  unchanged from today (renders `PaymentCompleteScreen` normally) — this is the
  standalone `#/payment-complete/<ref>` path for any context that doesn't go through
  the overlay (kept working, not removed).

- [ ] **Step 1: Write the failing test**

```tsx
it('posts the completion message to the parent frame when embedded, and does not when top-level', async () => {
  const postMessage = vi.fn()
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify({ status: 'paid' }), { status: 200 }),
  ))
  const originalTop = window.top
  Object.defineProperty(window, 'top', { value: { postMessage }, configurable: true })

  render(<PaymentCompleteSection locale="he" publicRef="ref-123" />)
  await waitFor(() =>
    expect(postMessage).toHaveBeenCalledWith(
      { type: PAYMENT_OVERLAY_MESSAGE_TYPE, ref: 'ref-123' },
      window.location.origin,
    ),
  )

  Object.defineProperty(window, 'top', { value: originalTop, configurable: true })
})
```

  Add a second test with `window.top === window.self` (the default in jsdom — no
  `defineProperty` override) asserting `screen.findByTestId('order-paid')` still
  renders (today's existing behavior, unchanged).

- [ ] **Step 2: Run to verify it fails**

  Run: `cd web && npx vitest run apps/parent/src/features/billing/PaymentCompleteSection.test.tsx --reporter=dot`
  Expected: FAIL — no `postMessage` call exists today.

- [ ] **Step 3: Implement** — import `PAYMENT_OVERLAY_MESSAGE_TYPE` from
  `./PaymentOverlay` (Task 4.2), add the embedded-detection + one-shot `postMessage` in
  an effect keyed on `status`.

- [ ] **Step 4: Run to verify they pass, typecheck, commit**

```bash
cd web && npx vitest run apps/parent/src/features/billing/PaymentCompleteSection.test.tsx --reporter=dot
npx tsc --noEmit -p apps/parent
cd /Users/yuvalstolin/Desktop/studio-manager
git add web/apps/parent/src/features/billing/PaymentCompleteSection.tsx web/apps/parent/src/features/billing/PaymentCompleteSection.test.tsx
git commit -m "feat(billing): PaymentCompleteSection posts completion to the parent frame when embedded"
```

### Task 4.4: Route `PaymentSetup`'s card button and standing-order links through the overlay

**Files:**
- Modify: `web/apps/parent/src/features/billing/PaymentSetup.tsx`
- Modify: `web/apps/parent/src/App.tsx` (the `PaymentSetupGate` call site, line
  ~713-719 — its `onOrderOpened={submitUpayForm}` wiring changes shape; see below)
- Test: `web/apps/parent/src/features/billing/PaymentSetup.test.tsx`

**Interfaces:**
- Produces: `PaymentSetupProps.onOrderOpened` is **removed** — `PaymentSetup` now owns
  overlay state internally (`const [overlay, setOverlay] =
  useState<PaymentOverlayRequest | null>(null)`), rendering `<PaymentOverlay
  request={overlay} onComplete={...} onClose={() => setOverlay(null)} />` as a sibling
  when `overlay !== null`. `payByCard()` calls `setOverlay({ kind: 'checkout', form })`
  instead of the removed prop. The standing-order `<a target="_blank">` (lines
  427-445) becomes a `<Button>` calling `setOverlay({ kind: 'link', url: link.url })`.
  `onComplete` (from the overlay) triggers a refetch of `openCharges` (bump the
  existing `reloads` counter) so the summary reflects the settled charge, then closes
  the overlay.

  This removes a prop `PaymentSetupProps` currently exposes — both call sites need
  updating: `JoinFlow.tsx:280` (`onOrderOpened={submitUpayForm}` — delete the prop
  entirely from that call) and `App.tsx`'s `PaymentSetupGate` usage (same deletion).
  Neither caller needs to know about the overlay; it's fully internal to
  `PaymentSetup`/`PaymentSetupGate` now.

- [ ] **Step 1: Write the failing tests**

```tsx
it('opens the overlay instead of navigating away when paying by card', async () => {
  const user = userEvent.setup()
  const client = makeClientWithOneCardCharge()  // reuse/extend this file's existing fixtures
  render(<PaymentSetup locale="he" client={client} students={students} standingOrderLinks={[]} onFinish={vi.fn()} />)
  await user.click(await screen.findByTestId('setup-method-card'))
  await user.click(screen.getByTestId('setup-pay-card'))
  await screen.findByTestId('payment-overlay-close')
  expect(document.querySelector('form[target]')).not.toBeNull()
})

it('opens the overlay instead of a new tab for a standing-order link', async () => {
  const user = userEvent.setup()
  const client = makeClientWithOneStandingOrderCharge()
  render(
    <PaymentSetup
      locale="he"
      client={client}
      students={students}
      standingOrderLinks={[{ studentId: 'st1', amountAgorot: 30000, url: 'https://app.upay.co.il/mandate/x' }]}
      onFinish={vi.fn()}
    />,
  )
  await user.click(await screen.findByTestId('setup-method-standing_order'))
  await user.click(screen.getByTestId('setup-standing-link-st1'))
  const iframe = await screen.findByTitle(/./)
  expect((iframe as HTMLIFrameElement).src).toBe('https://app.upay.co.il/mandate/x')
})
```

  (Adapt fixture names to whatever `PaymentSetup.test.tsx` already defines — read the
  file first; it has 501 lines' worth of existing coverage this task must not break.)

- [ ] **Step 2: Run to verify these fail**

  Run: `cd web && npx vitest run apps/parent/src/features/billing/PaymentSetup.test.tsx --reporter=dot`
  Expected: FAIL — today's card button calls the `onOrderOpened` prop directly (full
  navigation), and the standing-order row is a plain `<a target="_blank">`.

- [ ] **Step 3: Implement** — per the Interfaces section above. Update `JoinFlow.tsx`
  and `App.tsx` call sites to drop the now-removed `onOrderOpened` prop.

- [ ] **Step 4: Run to verify PaymentSetup's full test file still passes** (not just
  the two new tests — this file has extensive pre-existing coverage of the summary
  screen, hand-carried methods, and the family-vs-per-child answer flow that must
  survive this change unchanged)

  Run: `cd web && npx vitest run apps/parent/src/features/billing/PaymentSetup.test.tsx --reporter=dot`
  Expected: PASS, all tests.

- [ ] **Step 5: Typecheck the whole parent app, run the billing + onboarding vitest
  slices together (both callers of `PaymentSetup` live in these two areas), commit**

```bash
cd web && npx tsc --noEmit -p apps/parent
npx vitest run apps/parent/src/features/billing apps/parent/src/features/onboarding --reporter=dot
cd /Users/yuvalstolin/Desktop/studio-manager
git add web/apps/parent/src/features/billing/PaymentSetup.tsx \
        web/apps/parent/src/features/billing/PaymentSetup.test.tsx \
        web/apps/parent/src/features/onboarding/JoinFlow.tsx \
        web/apps/parent/src/App.tsx
git commit -m "feat(billing): PaymentSetup's card button and standing-order links route through the overlay"
```

### Task 4.5: Wire `PaymentsSection`'s own card-pay handoff through the overlay

**Files:**
- Modify: `web/apps/parent/src/features/billing/PaymentsSection.tsx:294-328`
  (`PaymentsSection`'s `onOrderOpened` callback)
- Test: `web/apps/parent/src/features/billing/PaymentsSection.test.tsx`

**Interfaces:**
- Produces: `PaymentsSection` gains its own local `overlay` state (same shape as Task
  4.4), and its `onOrderOpened` callback passed into `<PaymentsScreen>` sets that state
  instead of calling `submitUpayForm` directly (the demo-simulator branch at lines
  315-320 is unchanged — it never reaches the overlay, since `DEMO_SIMULATOR.action`
  is checked first and short-circuits to `refresh()`). Renders `<PaymentOverlay>` as a
  sibling of `<PaymentsScreen>` when `overlay !== null`, `onComplete` calling
  `refresh()` (the existing `reloads` bump) and clearing overlay state.
  `PaymentsScreen.tsx` itself is **not modified** — this task only changes what
  `PaymentsSection` does with the callback `PaymentsScreen` already exposes.

- [ ] **Step 1: Write the failing test**

```tsx
it('opens the overlay instead of navigating away when the screen opens a card order', async () => {
  // Drive PaymentsSection to the point where PaymentsScreen's onOrderOpened fires
  // with a real (non-demo) UpayForm -- reuse this file's existing mock-fetch setup,
  // adding a createOrder/orderForm pair that resolves to a live form. Assert a
  // `<form target="upay-payment-overlay">` appears in the document rather than
  // `document.body.querySelector('form')` navigating (i.e. no full-page nav attempted).
})
```

  (Write this against `PaymentsSection.test.tsx`'s existing fetch-mock conventions —
  read the file's current `beforeEach`/mock setup before authoring the exact
  assertions; the surrounding read/promise/balance mocks are extensive and must not be
  duplicated ad hoc.)

- [ ] **Step 2: Run to verify it fails**

  Run: `cd web && npx vitest run apps/parent/src/features/billing/PaymentsSection.test.tsx --reporter=dot`
  Expected: FAIL — today's `onOrderOpened` calls `submitUpayForm(form)` directly (full
  navigation) for a non-demo form.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the full billing vitest slice, typecheck, commit**

```bash
cd web && npx vitest run apps/parent/src/features/billing --reporter=dot
npx tsc --noEmit -p apps/parent
cd /Users/yuvalstolin/Desktop/studio-manager
git add web/apps/parent/src/features/billing/PaymentsSection.tsx web/apps/parent/src/features/billing/PaymentsSection.test.tsx
git commit -m "feat(billing): PaymentsSection's card-pay handoff routes through the overlay too"
```

### Task 4.6: Build the richer done-state and wire the deferred health flush

**Files:**
- Create: `web/apps/parent/src/features/onboarding/JoinDoneScreen.tsx`
- Modify: `web/apps/parent/src/features/onboarding/JoinFlow.tsx` (the `step ===
  'payment'` branch, and `finishWizard`)
- Test: `web/apps/parent/src/features/onboarding/JoinDoneScreen.test.tsx`,
  `web/apps/parent/src/features/onboarding/JoinFlow.test.tsx`

**Interfaces:**
- Consumes: `healthDrafts` (Phase 3's `JoinFlow` state), `HealthClient.submit`.
- Produces:
```tsx
export type JoinDoneChildRow = {
  studentId: string
  displayName: string
  method: 'card' | 'cash' | 'cheque' | 'standing_order'
  amountAgorot: number
}

export type JoinDoneScreenProps = {
  locale: Locale
  rows: readonly JoinDoneChildRow[]
  onEnterApp: () => void   // fires the flush; caller awaits/handles it
  flushing: boolean
  flushError: string | null
}
```
  Every child listed with a checkmark, identical visual weight regardless of method —
  card → "paid", cash/cheque → the concrete named-moment copy (amount, who, when/where
  — reuse `schedule.plan.gate.hand.*`/`schedule.setup.handSent`-style i18n keys already
  in the codebase where they fit; add new ones only for copy that doesn't already
  exist), standing order → per-child "not yet confirmable, the manager marks it
  received" (reuse `billing.standingOrder.notConfirmable`, already exists). No method
  renders as pending or lesser.

  `JoinFlow.tsx`'s payment-step branch replaces `onFinish={finishWizard}` with a new
  local `handleEnterApp` that: (1) sets a `flushing` state, (2) calls
  `client.submit(studentId, { template_id, answers, signature_image_base64 })` once per
  entry in `healthDrafts` (sequential or `Promise.all` — sequential is simpler to
  reason about and matches "back to back" from the spec; use a plain `for...of` with
  `await`), (3) on success, calls `finishWizard()` (unchanged), (4) on any failure,
  surfaces `flushError` and does **not** navigate away or clear the draft — per the
  spec, a failed flush must leave the family able to retry, not silently lose their
  held answers.

  This is the **one real call site** for the deferred submission's actual
  `client.submit()` invocations — verified explicitly by a test.

- [ ] **Step 1: Write the failing tests**

  `JoinDoneScreen.test.tsx`: render with a mix of methods, assert every row shows a
  checkmark and no row is visually/semantically marked as lesser (e.g., assert no row
  carries a `pending`/`warning` `StatusChip` tone — check whatever prop `StatusChip`
  takes for tone and assert `paid`/neutral tones only). Assert the "enter the app"
  button calls `onEnterApp`.

  `JoinFlow.test.tsx`: extend the two-child walkthrough (building on Task 3.4's test)
  through to the payment step, mock `healthClient.submit` to resolve, click "enter the
  app," assert `healthClient.submit` was called exactly twice (once per child) with
  each child's accumulated draft answers, and assert `onComplete` fires only after both
  resolve.

  Add a failure-path test: mock `healthClient.submit` to reject for the second child,
  assert `onComplete` is **not** called and an error is shown (the draft is not
  discarded — implicitly proven by the fact `healthDrafts` state isn't cleared, which a
  retry-and-succeed follow-up assertion can confirm if straightforward to add).

- [ ] **Step 2: Run to verify these fail**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding --reporter=dot`
  Expected: FAIL — `JoinDoneScreen` doesn't exist; `JoinFlow`'s payment step still
  calls `finishWizard` directly with no flush.

- [ ] **Step 3: Implement `JoinDoneScreen.tsx`** and wire `handleEnterApp` into
  `JoinFlow.tsx`. Compute `JoinDoneChildRow[]` from `PaymentSetup`'s existing row/method
  data — `PaymentSetup` needs to report its final per-child method/amount decision back
  up to `JoinFlow` for this screen to render (today `PaymentSetup` owns that state
  entirely internally and only calls `onFinish()` with no data). Add an `onSummary:
  (rows) => void` callback to `PaymentSetupProps`, called once alongside `onFinish`
  with the `rows`/`method` state already computed inside `PaymentSetup`'s summary
  render — `JoinFlow` captures it into local state and passes it to `JoinDoneScreen`.

- [ ] **Step 4: Run to verify they pass, typecheck, run the full onboarding + billing
  vitest slices, commit**

```bash
cd web && npx vitest run apps/parent/src/features/onboarding apps/parent/src/features/billing --reporter=dot
npx tsc --noEmit -p apps/parent
cd /Users/yuvalstolin/Desktop/studio-manager
git add web/apps/parent/src/features/onboarding/JoinDoneScreen.tsx \
        web/apps/parent/src/features/onboarding/JoinDoneScreen.test.tsx \
        web/apps/parent/src/features/onboarding/JoinFlow.tsx \
        web/apps/parent/src/features/onboarding/JoinFlow.test.tsx \
        web/apps/parent/src/features/billing/PaymentSetup.tsx \
        web/apps/parent/src/features/billing/PaymentSetup.test.tsx \
        web/packages/i18n/he/people.ts web/packages/i18n/en/people.ts web/packages/i18n/ru/people.ts
git commit -m "feat(onboarding): richer done-state and the one real deferred-health-flush call site"
```

**Phase 4 checkpoint:** report back — in-app payment overlay live for card checkout and
standing-order links (`PaymentSetup`/`PaymentsSection`), completion detection wired
through `postMessage`, richer done-state built, deferred health flush firing exactly
once per kid at "enter the app." Flag explicitly: the `postMessage` completion path has
only been exercised by tests that fire a synthetic `MessageEvent` — Phase 6's manual
walkthrough is what proves it against a real (or `returnurl`-navigated) iframe, per the
prompt's explicit instruction never to complete a real card payment to test it.

---

## Phase 5 — Draft persistence

Built last among the feature work, once every step's state shape is final — this phase
adds `sessionStorage` save/restore around `JoinFlow`'s existing family-form state and
`healthDrafts` state, keyed per token, without changing what either state shape holds.

### Task 5.1: Build the draft storage module (pure logic)

**Files:**
- Create: `web/apps/parent/src/features/onboarding/joinDraftStorage.ts`
- Test: `web/apps/parent/src/features/onboarding/joinDraftStorage.test.ts`

**Interfaces:**
- Produces:
```ts
export type JoinDraft = {
  family: Partial<JoinFamilyPayload> | null   // whatever's been typed so far; may be
                                                // incomplete, this is a draft
  healthDrafts: Record<string, SubjectHealthDraft>
}

export function loadJoinDraft(token: string): JoinDraft | null
export function saveJoinDraft(token: string, draft: JoinDraft): void
export function clearJoinDraft(token: string): void
```
  Storage key: `` `join-draft:${token}` ``. `saveJoinDraft` `JSON.stringify`s;
  `loadJoinDraft` parses and returns `null` on any parse failure or absence (never
  throws — a corrupted draft is the same as no draft, not a crash). No `localStorage`
  anywhere in this module — `sessionStorage` only, per the spec's explicit privacy
  decision (health answers and national ids should not outlive the tab).

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { clearJoinDraft, loadJoinDraft, saveJoinDraft } from './joinDraftStorage'

afterEach(() => sessionStorage.clear())

describe('joinDraftStorage', () => {
  it('round-trips a draft through sessionStorage, keyed per token', () => {
    const draft = { family: { first_name: 'מיכל' }, healthDrafts: {} }
    saveJoinDraft('tok-a', draft)
    expect(loadJoinDraft('tok-a')).toEqual(draft)
    expect(loadJoinDraft('tok-b')).toBeNull()
  })

  it('returns null rather than throwing on a corrupted entry', () => {
    sessionStorage.setItem('join-draft:tok-a', '{not json')
    expect(loadJoinDraft('tok-a')).toBeNull()
  })

  it('clear removes only that token\'s draft', () => {
    saveJoinDraft('tok-a', { family: null, healthDrafts: {} })
    saveJoinDraft('tok-b', { family: null, healthDrafts: {} })
    clearJoinDraft('tok-a')
    expect(loadJoinDraft('tok-a')).toBeNull()
    expect(loadJoinDraft('tok-b')).not.toBeNull()
  })

  it('never touches localStorage', () => {
    saveJoinDraft('tok-a', { family: null, healthDrafts: {} })
    expect(localStorage.length).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify these fail**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/joinDraftStorage.test.ts --reporter=dot`
  Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `joinDraftStorage.ts`**

- [ ] **Step 4: Run to verify they pass, commit**

```bash
cd web && npx vitest run apps/parent/src/features/onboarding/joinDraftStorage.test.ts --reporter=dot
cd /Users/yuvalstolin/Desktop/studio-manager
git add web/apps/parent/src/features/onboarding/joinDraftStorage.ts web/apps/parent/src/features/onboarding/joinDraftStorage.test.ts
git commit -m "feat(onboarding): sessionStorage draft module, keyed per token"
```

### Task 5.2: Wire save-on-change and restore-on-mount into `JoinFlow`

**Files:**
- Modify: `web/apps/parent/src/features/onboarding/JoinFlow.tsx`
- Modify: `web/apps/parent/src/features/onboarding/JoinFamilyStep.tsx` (accept an
  optional `initialState`/controlled-draft prop so a restored value can seed the form —
  check Task 2.2's implementation first; if the flat-list rewrite already lifted
  `rows`/signer fields into `familyDraft.ts`'s pure shape, this is a matter of passing
  an initial value in, not a new state-management mechanism)
- Test: `web/apps/parent/src/features/onboarding/JoinFlow.test.tsx`

**Interfaces:**
- Produces: `JoinFlow` calls `loadJoinDraft(token)` once on mount, seeding
  `healthDrafts` state directly (it's already a plain object matching `JoinDraft`'s
  shape from Phase 3) and passing `draft.family` into `JoinFamilyStep` as an initial
  value. On every change to the family form's in-progress state or `healthDrafts`,
  calls `saveJoinDraft(token, { family: ..., healthDrafts })` (debounce is not required
  — `sessionStorage` writes are synchronous and cheap at this data size; a plain effect
  keyed on the relevant state is enough, matching this codebase's existing style of
  simple effects over hand-rolled debouncing). On successful completion (after Task
  4.6's flush succeeds, before `finishWizard()` navigates away), calls
  `clearJoinDraft(token)`.

- [ ] **Step 1: Write the failing tests**

  Extend `JoinFlow.test.tsx`: (a) fill some family fields, assert
  `sessionStorage.getItem('join-draft:live-token-123456')` contains what was typed
  (proving save-on-change); (b) unmount and re-render `JoinFlow` with the same token,
  assert the family fields restore from what was saved (proving restore-on-mount); (c)
  drive a full successful walkthrough to the done screen and "enter the app," assert
  `sessionStorage.getItem('join-draft:live-token-123456')` is `null` afterward (proving
  clear-on-completion).

- [ ] **Step 2: Run to verify these fail**

  Run: `cd web && npx vitest run apps/parent/src/features/onboarding/JoinFlow.test.tsx --reporter=dot`
  Expected: FAIL — no persistence exists yet.

- [ ] **Step 3: Implement** the wiring described above.

- [ ] **Step 4: Run the full onboarding vitest slice, typecheck, commit**

```bash
cd web && npx vitest run apps/parent/src/features/onboarding --reporter=dot
npx tsc --noEmit -p apps/parent
cd /Users/yuvalstolin/Desktop/studio-manager
git add web/apps/parent/src/features/onboarding/JoinFlow.tsx \
        web/apps/parent/src/features/onboarding/JoinFamilyStep.tsx \
        web/apps/parent/src/features/onboarding/JoinFlow.test.tsx
git commit -m "feat(onboarding): persist and restore the join wizard's draft across a same-tab return"
```

**Phase 5 checkpoint:** report back — family and health data both survive a same-tab
close/reopen via `sessionStorage`, cleared only after the final flush succeeds, no
`localStorage` anywhere in the feature. This is the point where the plan's own manual
walkthrough (Phase 6) becomes meaningful to actually perform — closing the tab
mid-health-queue is now expected to preserve the draft, not lose it.

---

## Phase 6 — Docs + verification

### Task 6.1: Annotate the findings register

**Files:**
- Modify: `docs/superpowers/specs/2026-09-02-completion-findings-register.md` §5–§6

- [ ] Add a dated annotation (2026-09-03 or later, whatever today's actual date is at
  execution time) to §6.2 ("Validation refuses invisibly"), §6.3 ("Back is broken three
  different ways" — specifically the step 4→3 duplicate trap, and step 3→2's
  field-loss, both resolved by the flat-list rebuild), §6.4 ("Nothing is saved between
  steps"), §6.5 ("The adult-student question is asked, badly"), §6.7 (rail /
  `JOIN_STEP_POSITION` dead constants), §6.8 (both dead ends), §7.1/§7.2 (standing-order
  gaps this pass's overlay work touches — note precisely which parts are now fixed vs.
  still open: `tellTheManager()`'s `['cash','cheque']`-only loop at §7.1 is **not**
  touched by this pass and stays open; the overlay only changes how the link is
  *opened*, not whether choosing standing-order writes a promise).
- [ ] Record the two flagged-not-built cross-vertical/schema items explicitly: the
  plan-picker billing dependency (Phase 2) and the health-template required-field
  migration (Phase 3), each with enough detail that whoever picks them up doesn't have
  to re-derive the requirement from this plan.
- [ ] Cross-check every annotation against the actual code state reached by Phase 5,
  not against what the spec originally proposed — if something built differently than
  planned (a real possibility across a feature this size), the register should describe
  what shipped, not what was intended.

- [ ] **Commit**

```bash
git add docs/superpowers/specs/2026-09-02-completion-findings-register.md
git commit -m "docs: annotate the findings register with the onboarding redesign's fixes"
```

### Task 6.2: Run the full verification suite

- [ ] `.venv/bin/pytest -q tests/people tests/health`
- [ ] `cd web && npx vitest run apps/parent/src/features/onboarding apps/parent/src/features/health apps/parent/src/features/privacy apps/parent/src/features/billing --reporter=dot`
- [ ] `./scripts/lane-check.sh people && ./scripts/lane-check.sh health`
- [ ] `npm run typecheck && .venv/bin/mypy app`
- [ ] `.venv/bin/ruff check app && .venv/bin/ruff format --check app`

  Fix anything red before proceeding — do not report completion with a known-red gate.

### Task 6.3: Manual walkthrough (twice) — cannot be skipped or simulated

Per the prompt: **not optional**, the deferred-submission model has only been reasoned
through and unit-tested, not exercised by a human/browser yet. If a browser automation
tool (e.g. the `playwright` MCP server, if connected by then) is available in this
session, use it to drive the actual dev server through both passes and screenshot the
key screens; if not available, this step needs the user to perform it, or needs to be
explicitly flagged as unperformed rather than assumed.

- [ ] Start the dev servers: `.venv/bin/uvicorn app.main:app --reload` and
  (`cd web/apps/parent && npm run dev`), against a local database with a live
  onboarding link for a real (or demo) studio.
- [ ] **Pass 1 — one child.** Walk `/join/<token>` end to end: welcome+agreements,
  family (add one child), health (opening question → answer → sign), payment
  (choose a hand-carried method — cash or cheque — to avoid a real card charge), done
  screen, "enter the app." Press back at every step along the way and confirm no field
  is lost and no dead end appears.
- [ ] **Pass 2 — two children.** Same walk, two children, at least one minor and one
  "I train too" adult-self row if the studio's fixture data allows it exercising both
  row kinds. Confirm the shared parent/pickup section renders once, not twice.
- [ ] **Close the tab mid-health-queue** (after signing the first of two kids, before
  the second), reopen `/join/<token>` in a new tab in the **same browser session**
  (same-tab-return per the spec — a genuinely new tab, not a hard refresh of a closed
  one, is what `sessionStorage` actually preserves; confirm the tool/browser used
  matches this precisely). Confirm the draft restores: first kid's answers not asked
  again, second kid's opening question is where the wizard resumes.
- [ ] **In-app payment overlay.** Confirm uPay's real checkout renders inside the
  iframe (safe to view; do not submit a real card number — per the prompt, that is a
  separate, explicit, user-approved decision to spend real money and is out of scope
  for this walkthrough). To confirm the `postMessage` completion path specifically
  (not just that the page loads), navigate the iframe directly to the app's own
  `#/payment-complete/<ref>` route (or whatever this implementation's own test harness
  does — Task 4.2/4.3's tests already prove the message contract in isolation; this
  step is about confirming the real iframe/`returnurl` navigation triggers it, not
  re-deriving the contract) and confirm the overlay closes and the done screen appears.
- [ ] Report back with a plain-language pass/fail account of both walkthroughs — this
  is the one verification step in this plan that produces a claim about real user
  behavior, not just green tests, and it should be reported as such (what was actually
  observed, not "should work").

### Task 6.4: Final commit and `state.yaml` check

- [ ] Re-read `docs/plan/state.yaml`'s current active wave/piece list. This redesign is
  explicitly **not automatically one piece** per the prompt's "Done" section — tick
  something only if this work completes a specific tracked piece, and only in the same
  commit as whichever task actually finished it (likely already covered by Phase 4 or
  5's own commit if a piece maps cleanly; do not create a new ceremonial commit just to
  flip a flag).
- [ ] Final `git status` check across the whole `web/apps/parent/src/features/`
  tree and `app/services/`/`app/routers/` for anything left uncommitted from this
  session, staged by explicit path.

**Phase 6 checkpoint / plan complete:** report back with the full verification output,
the manual walkthrough's actual findings (not assumed), and a summary of what shipped
vs. what was flagged-not-built (plan picker, required-field migration, `tellTheManager`
standing-order gap) for whoever picks those up next.
