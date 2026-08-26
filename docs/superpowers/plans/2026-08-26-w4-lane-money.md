# Lane MONEY (M6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build SPEC §5.10's billing ledger end to end — price plans, the idempotent monthly
run with first-month proration, the charge/payment/allocation ledger, uPay's unsigned
one-time flow with all four §5.10 security checks, הוראת קבע reconciliation, the debt
escalation ladder, and the seven M6 artboards.

**Architecture:** The application ledger is the source of truth; uPay is one of several ways
money arrives. Charges are **never mutated to record payment** — a charge is settled when its
`payment_allocation` rows sum to `amount_agorot`, and `charge.status` is a derived cache with
exactly one writer, `recompute_charge_status`. Services take a session on the constructor
(`BillingService(session)`), the way `ScheduleService` does, because W4's contract fixed the
seam's parameter list before this worktree existed. Routers stay thin. The IPN endpoint
persists the raw callback and returns 200 before any processing, so evidence survives every
unknown in the provider's behaviour.

**Tech Stack:** FastAPI · SQLAlchemy 2 typed `Mapped` models · Alembic (revision `0008` is
head and this lane adds none) · pytest · React 19 + TypeScript + Vite · vitest.

**Spec:** `SPEC.md` §5.10 (payments and billing), §4.3 (tables), §7 (API), §12 (provider
constraints), §11.7, §13 (invariants 1/3/5), §19.5–19.6 · `upay-integration.md`
(**round two wins** wherever the two rounds disagree) · `docs/plan/milestone-plan.md`
§`Lane MONEY — M6` · `docs/plan/prompts/w4-lanes.md` · `.claude/skills/payments/SKILL.md` ·
artboard specs `docs/design/specs/{1b,12e,12f,11a,3e,5a,5e}-*.md`.

## Global Constraints

- **G2 — every money value is an integer count of agorot.** Never a float, never a
  `Numeric`. Every money column and every schema field is named `*_agorot`. Invariant 1 is
  live and asserts against ten real columns.
- **Charges are never mutated to record payment.** `charge.status` has exactly one writer:
  `BillingService.recompute_charge_status`. No route, service or worker sets it.
- **G8 — no automated recurring billing.** No mandate creator, no automatic matching. A
  הוראת קבע payment is marked by a human, in the same flow as a bank transfer. Matching is
  human-confirmed via `payer_fingerprint`; suggestions are never auto-applied.
- **The IPN carries no cryptographic signature** (§12, [VERIFIED] both rounds). UUIDv4 order
  refs, an IP *signal* (never a gate), and **independent** server-side amount verification
  are all mandatory. `amount_mismatch` is a real state recording real money received. The
  return redirect is **never** the source of truth.
- **Proration is first month only**, from **materialized sessions**, not calendar days:
  `round(monthly × remaining ÷ total_in_period)`.
- **`charge.payer_person_id` is captured at creation** from the student's primary guardian.
- **§11.7 — no card owner names and no last-4 digits in application logs.** They are data on
  `payer_fingerprint` and `upay_ipn_record`, never a log payload.
- **§15 / G15 — no PII is denormalized into a financial row.** Store the person id; render
  the name by join.
- `app.core.clock.now()` is the only clock. A bare `datetime.now()` in `app/` fails the build.
- **The seam signatures are frozen.** `create_charge(self, studio_id, payer_person_id, kind,
  amount_agorot, due_date, *, student_id=None, event_id=None) -> Charge` and
  `recompute_charge_status(self, charge_id) -> None`. Changing either is a stop-and-tell.
  Adding `BillingService.__init__(self, session)` is not a change to either — it is exactly
  what lane SCHEDULE did for `ScheduleService`, and `tests/contracts/test_seams.py` records
  the precedent.
- **This lane runs no `alembic revision`.** Revision `0008` is head. Studio-level billing
  settings live in the existing JSONB `studio.settings`, which is what kept M1.9 out of
  `alembic/versions/**` too.
- **Never run `./scripts/dev-db.sh reset`** — it destroys both lanes' databases.
- `.venv` and `web/node_modules` are symlinks to `main`'s. **A dependency change is a
  stop-and-tell**, not a lane decision.
- New endpoints are versioned under `/api/v1/`. Every list endpoint is cursor-paginated
  (`CursorPage[T]`); every mutating endpoint accepts the optional `Idempotency-Key` header.
- Hebrew strings live in `web/packages/i18n/he/billing.ts` and are mirrored in `en/` and
  `ru/`. **Never edit `web/packages/i18n/index.ts` or `types.ts`** — authored once, never
  by a lane.
- Per-task close: `./scripts/lane-check.sh billing` green, then commit. Tick the matching
  piece in `docs/plan/state.yaml` **in the same commit as the work**.

---
## Decisions this lane makes, and why (settle before Task 1)

**D-M6-1 — `1b` is the payments tab; `12f` is history reached from it.**
`1b`'s spec finding 1 and `12f`'s finding 6 both say the canvas does not decide, and both
say deciding matters more than which way. A parent who taps `תשלומים` came to pay, and a
parent who lands on a ledger has to hunt for the pay button; the reverse costs one tap for
a rarer intent. So the tab renders `1b`, and `1b`'s header carries a link into `12f`.

**D-M6-2 — the email-a-receipt affordance is per card row, and nowhere else.**
`12f`'s D9.3 half that was never applied. `billing.receipt.email` is singular and
`billing.receipt.cardOnly` states the scope. No footer button.

**D-M6-3 — `12f`'s four filter chips map onto `charge.kind`, not onto a second taxonomy.**
`12f` finding 3: the artboard's `מנויים · ציוד · אירועים` is a third vocabulary for an axis
`charge.kind` already names. The chips render `הכל` plus `charge.kind.tuition`,
`charge.kind.manual` and `charge.kind.event`. Two enums for one axis is how a filter starts
disagreeing with the rows it filters. `הכל` needs a new key (`filter.all`).

**D-M6-4 — billing's studio settings live under a `billing` key inside `studio.settings`,
read and written through this lane's own router.**
`§5.10` needs `standing_order_link`, `cash_instructions` and the run day. `studio.settings`
is JSONB and already holds `sport`/`address`/`phone` for exactly this reason, so no
migration is needed. But `app/schemas/studio.py` and `app/routers/studio.py` belong to the
structure lane, so this lane does **not** widen `StudioOut`/`StudioUpdate`. It exposes
`GET`/`PATCH /billing/settings` in `app/routers/billing.py` instead. Widening another lane's
shapes for a field only this lane reads is how a wave's merge conflicts start.

**D-M6-5 — the dev bar's `runJob` tool triggers `POST /billing-runs`, the real endpoint.**
`web/packages/ui/src/dev-bar/tools.ts` lists `runJob` as M6's pending tool, and §7 specifies
`POST /billing-runs` as a product endpoint anyway. `POST /dev/jobs/{name}/run` would live in
`app/routers/dev.py`, which is the core lane's file. §19.5's other three jobs (retention,
follow-up sweep, reconciliation suggestions) belong to the lanes that own them; this tool
offers the billing jobs M6 owns and names the rest as belonging elsewhere.

**D-M6-6 — invariant 5's live seam-detector case moves to `NotificationService.enqueue`.**
`test_the_seam_detector_recognises_the_contract_stub` asserts the detector against the real
seam so that it "stops passing the moment M6 writes a body". That moment is Task 1. The
detector still needs a live case — a detector proven only against fixtures is a detector
nobody has pointed at real code — and W5's `enqueue` is still an empty-bodied seam, so it
becomes the live case and `create_charge` becomes the *implemented* case. **Do not delete
the live assertion; move it.**

**D-M6-7 — `assert_idempotent` is wired to a real run, not weakened.**
The moment `create_charge` has a body, `test_the_billing_run_is_idempotent` raises
`AssertionError` by design. Task 1 replaces that raise with `assert_idempotent(run, snapshot)`
over a seeded period. The tripwire is working; wiring it is the whole point.

**D-M6-12 — `form_fields` refuses an empty merchant email, not just a missing one.**
Found while running the full suite after Task 1. The committed environment template ships
**eight** optional keys with empty values, and every one is declared `X | None = None` in the
settings module — so following the template produces `''`, never `None`. The same bug has now
bitten three times: `dev_tools_allowed` (fixed in `728b665`), `DevClockMiddleware` (fixed in
`b5cf3e1`), and `tests/identity/test_settings.py::test_no_provider_credential_has_a_default`,
which is still red.

`UPAY_MERCHANT_EMAIL` is on that list, and it is **this lane's blast radius**: an empty
merchant email builds a uPay form whose `email` field is blank — a real payer sent to a real
hosted page to pay an account that does not exist. `upay_form_fields` checks `studio.is_demo`
and nothing else, so nothing today would stop it.

The systemic fix belongs in the settings module (coerce empty to `None` once, the way
`configured_dev_token()` now does for one key) and that file is the **core lane's**. Whether
or not it lands, **Task 5's `OrderService.form_fields` raises when the merchant email is
missing or blank** — refusing to build a form is always better than building one that charges
nobody, and that check lives in a file this lane owns.

---

## File structure

**Backend — created**

| Path | Responsibility |
|---|---|
| `app/services/billing/service.py` | `BillingService` — the two seam methods and the charge/allocation core. The single writer of `charge.status`. |
| `app/services/billing/errors.py` | `NotFoundError`, `ConflictError`, `RefusedError` — so routers map outcomes in one place and services stay callable from a worker. |
| `app/services/billing/run.py` | `BillingRunService` — §5.10's monthly run: eligibility, proration, registration fees, idempotence. |
| `app/services/billing/catalogue.py` | Price plans (versioned, never edited in place) and the product catalogue. |
| `app/services/billing/payments.py` | Recording money that arrived, oldest-first allocation, reversal, payer balance. |
| `app/services/billing/orders.py` | `payment_order` lifecycle, charge selection, the double-payment guard. |
| `app/services/billing/reconciliation.py` | The IPN → ledger path, `payer_fingerprint`, suggestions, manual match. |
| `app/routers/billing.py` | `/price-plans`, `/products`, `/charges`, `/billing-runs`, `/billing/settings`, `/reconciliation/*`, `/recurring-subscriptions`. |
| `app/routers/payments.py` | `/payments`, `/payment-orders`, `/payment-complete`. |
| `app/routers/webhooks.py` | `GET /webhooks/upay/{public_ref}` — unauthenticated. Persist, 200, hand off. |
| `app/workers/billing.py` | The monthly run driver, the day 3/7/14 debt ladder, the 24h stale-order sweep. |
| `tests/billing/**`, `tests/upay/**` | This lane's tests. `tests/billing/conftest.py` already exists and is not this lane's to rewrite. |

**Backend — modified**

| Path | Change |
|---|---|
| `app/services/billing/__init__.py` | Becomes a re-export of `service.py`, matching `app/services/schedule/__init__.py`. |
| `tests/invariants/test_05_the_billing_run_is_idempotent.py` | Wire `assert_idempotent`; move the live detector case (D-M6-6, D-M6-7). |
| `tests/contracts/test_seams.py:245-253` | `test_the_billing_seams_refuse_rather_than_returning_nothing` becomes the constructor assertion, exactly as W2 did for `ScheduleService`. **The signature assertions above it are the seam and stay untouched.** |

**Frontend — created**

| Path | Responsibility |
|---|---|
| `web/apps/parent/src/features/billing/` | `1b` pay screen, `12f` history, `12e` order items, the uPay return page, the student-card payment strip slot. |
| `web/apps/staff/src/features/billing/` | `11a` hand-over, the roster-row item-handout slot. |
| `web/apps/dashboard/src/features/billing/` | `3e` collections + reconciliation queue, `5a` prices and plans, the `5e` wizard slot, the alert-centre cards, the `runJob` dev-bar tool. |

**Frontend — modified**: `web/packages/i18n/{he,en,ru}/billing.ts` only.

---
**D-M6-8 — a tuition charge's period is derived from its `due_date`, and the run always
dues a charge on the last day of the period it bills.** ⚠ *Read this before Task 1.*

The frozen seam takes `due_date` and has **no `period_year`/`period_month` parameters**,
yet its own docstring says the monthly run calls it and that
`UNIQUE(student_id, period_year, period_month, kind)` "is what makes a re-run after a
partial failure safe". Both are only true together if the period is derived, and `due_date`
is the only argument that carries a month.

So:
- `kind='tuition'` is the one **periodic** kind. `create_charge` sets
  `period_year, period_month = due_date.year, due_date.month` for it.
- `registration`, `event` and `manual` carry a **NULL period**, which is exactly what the
  index's `postgresql_where` was written for — "a manual charge may legitimately repeat".
- `BillingRunService` therefore dues every tuition charge on the **last day of the period it
  bills**, so the derived period and the billed period cannot disagree. The two halves are
  a coupled pair and Task 1 asserts they agree.
- §5.10 step 6's "registration fees are charged once per student, **never again**" is
  therefore *not* the index's job — a period-keyed registration fee would be re-raisable
  every month. The run guards it with a query: a student who already has any `registration`
  charge gets none.

The alternative — the run writing `Charge` rows directly and bypassing the seam — was
rejected: it gives `charge` a second writer, and invariant 5 keys idempotence on
`create_charge` having a real body.

---
**D-M6-9 — `3e`'s two headline finance figures get keys in `billing.ts`, not `reports.ts`.**
`3e`'s spec finding 6: `נגבה החודש` and `79% מהצפוי` resolve to `reports.financial.*`, which
is M9's namespace, on M6's screen. The spec says "decide in the W4 contract" and the
contract did not. Seam 3 exists so two *lanes* never touch one file, and `reports.ts` is
W5's — so the keys go in `billing.ts` under `debt.collectedThisMonth` and
`debt.collectedShare`. M9 may later render the same numbers from its own namespace on its
own screen; two namespaces owning one *string* is duplication, two lanes owning one *file*
is a merge conflict, and only the second is a problem this wave can suffer.

**D-M6-10 — "household" is the payer person. There is no household entity.**
L9 and §4.3, stated in `web/apps/dashboard/src/features/people/AddStudentScreen.tsx`:
*"There is no household … 'My children' is simply `SELECT student_id FROM guardian WHERE
person_id = me`."* `3e`'s row unit is therefore one `payer_person_id`, and its `חניכים`
column is the students that payer's open charges name. No new table, no new concept.

**D-M6-11 — the reconciliation queue is designed from §5.10, not ported.**
`3e`'s finding 3: eighteen `billing.reconciliation.*` keys exist and **no artboard anywhere
in the canvas draws them**. So this one screen is built from the spec's own two-column
description — unmatched payments on one side, payers expected to pay this month on the
other — and it lives as a section of `3e` rather than as a route nobody can reach.

---
## Tasks

### Task 1: The ledger core — `create_charge`, `recompute_charge_status`, and disarming invariant 5 honestly

This is the task the whole lane turns on, and it is deliberately the largest: the moment
`create_charge` has a body, invariant 5's tripwire fires and
`test_the_seam_detector_recognises_the_contract_stub` goes red. Both must be re-pointed in
the **same commit**, and `assert_idempotent` needs a real run to assert over. So this task
ships the two seam methods *and* the minimum billing run that makes idempotence assertable.
Proration, registration fees and freezes are Task 2.

**Files:**
- Create: `app/services/billing/errors.py`
- Create: `app/services/billing/service.py`
- Create: `app/services/billing/run.py`
- Modify: `app/services/billing/__init__.py` (replace the stub class with a re-export)
- Test: `tests/billing/test_charges.py`, `tests/billing/test_billing_run.py`
- Modify: `tests/invariants/test_05_the_billing_run_is_idempotent.py`
- Modify: `tests/contracts/test_seams.py` (only `test_the_billing_seams_refuse_rather_than_returning_nothing`, lines 245–253)

**Interfaces:**
- Consumes: `tests/billing/conftest.py`'s `studio`, `a_price_plan`, `a_priced_student`,
  `an_open_charge`, `tenant_session`, `app_session`, and the constants `T0`, `TODAY`,
  `PERIOD = (2026, 11)`, `MONTHLY_AGOROT = 25_000`, `REGISTRATION_AGOROT = 10_000`.
- Produces:
  - `BillingService(session: Session)` with the two frozen seam methods.
  - `BillingService.allocated_agorot(charge_id: uuid.UUID) -> int`
  - `BillingService.PERIODIC_KINDS: frozenset[str]` — `frozenset({"tuition"})`
  - `BillingRunService(session: Session).run(studio_id: uuid.UUID, *, period_year: int, period_month: int, at: datetime) -> BillingRun`
  - `app.services.billing.errors.{NotFoundError, ConflictError, RefusedError}`
  - `period_end(period_year: int, period_month: int) -> date` in `run.py`

- [ ] **Step 1: Write `app/services/billing/errors.py`**

Three exceptions, mirroring `app/services/people/errors.py` so a router maps outcomes in
one place and the worker can call the same service without a request in sight.

```python
"""Three exceptions, so a router maps outcomes to status codes in one place.

A service raising `HTTPException` would be a service whose guarantees depend on being
called from a router -- and `.claude/rules/api.md` puts authorization in the router
precisely so services stay callable from a worker. §5.10's monthly run is a worker: it
calls these same code paths with no request anywhere in sight.
"""

from __future__ import annotations


class NotFoundError(Exception):
    """The row is not in the caller's studio. The router answers 404 and never 403: a 403
    confirms the row exists somewhere, which is a cross-tenant read with a polite error
    message."""


class ConflictError(Exception):
    """The write would duplicate something the schema, or §5.10, forbids -- a second
    tuition charge for one student and period, a second allocation of one payment against
    one charge."""


class RefusedError(Exception):
    """The input is well-formed and the row exists, but the product says no. Allocating
    more than a payment holds, reversing a payment twice, paying a charge already covered
    by an open order."""
```

- [ ] **Step 2: Write the failing test for `create_charge`**

Create `tests/billing/test_charges.py`. Note `tenant_session` and `studio` come from the
lane conftest; `MONTHLY_AGOROT` is agorot, not shekels.

```python
"""§5.10's charge core: the seam M7 calls, and the derived cache nothing else may write."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.models.billing import Charge, Payment, PaymentAllocation
from app.services.billing import BillingService
from app.services.billing.errors import ConflictError, NotFoundError
from sqlalchemy import select
from tests.billing.conftest import MONTHLY_AGOROT, PERIOD, T0


def test_a_tuition_charge_derives_its_period_from_the_due_date(tenant_session, studio, a_priced_student):
    """D-M6-8. The frozen seam has no period parameters and its own docstring keys
    idempotence on (student, period, kind), so the period has to come from the one
    argument carrying a month."""
    charge = BillingService(tenant_session).create_charge(
        studio.id,
        a_priced_student.payer_person_id,
        "tuition",
        MONTHLY_AGOROT,
        date(2026, 11, 30),
        student_id=a_priced_student.student_id,
    )
    assert (charge.period_year, charge.period_month) == PERIOD


def test_a_manual_charge_carries_no_period_so_it_may_repeat(tenant_session, studio, a_priced_student):
    """The partial index's `postgresql_where` exists for this: a manual charge is a fact
    about one moment, not about a month, and two of them in November are two real charges."""
    service = BillingService(tenant_session)
    first = service.create_charge(
        studio.id, a_priced_student.payer_person_id, "manual", 18_000, date(2026, 11, 30),
        student_id=a_priced_student.student_id,
    )
    second = service.create_charge(
        studio.id, a_priced_student.payer_person_id, "manual", 18_000, date(2026, 11, 30),
        student_id=a_priced_student.student_id,
    )
    assert first.period_year is None and second.period_year is None
    assert first.id != second.id


def test_a_second_tuition_charge_for_one_student_and_period_is_refused(
    tenant_session, studio, a_priced_student
):
    """§5.10 step 5, and invariant 5's structural half. C11: keyed on the STUDENT, so a
    child in two groups is one charge however many times the run walks them."""
    service = BillingService(tenant_session)
    service.create_charge(
        studio.id, a_priced_student.payer_person_id, "tuition", MONTHLY_AGOROT,
        date(2026, 11, 30), student_id=a_priced_student.student_id,
    )
    with pytest.raises(ConflictError):
        service.create_charge(
            studio.id, a_priced_student.payer_person_id, "tuition", MONTHLY_AGOROT,
            date(2026, 11, 30), student_id=a_priced_student.student_id,
        )


def test_a_new_charge_is_open_and_created_by_the_kind_that_made_it(
    tenant_session, studio, a_priced_student
):
    """`status` starts `open` because nothing is allocated yet -- it is derived from the
    first moment, not defaulted and then corrected."""
    charge = BillingService(tenant_session).create_charge(
        studio.id, a_priced_student.payer_person_id, "event", 5_000, date(2026, 11, 30),
        event_id=uuid.uuid4(),
    )
    assert charge.status == "open"
    assert charge.created_by == "event"


def test_a_float_amount_is_refused(tenant_session, studio, a_priced_student):
    """G2 stated where it can actually be enforced. The annotation says `int`; Python does
    not check it, and 250.0 agorot reaching an INTEGER column rounds silently."""
    with pytest.raises(TypeError):
        BillingService(tenant_session).create_charge(
            studio.id, a_priced_student.payer_person_id, "manual", 250.0,  # type: ignore[arg-type]
            date(2026, 11, 30), student_id=a_priced_student.student_id,
        )


def test_a_charge_for_another_studio_is_refused_under_a_scoped_session(
    tenant_session, studio, a_priced_student
):
    """The seam takes `studio_id` explicitly so the worker can pass one. Under a REQUEST,
    the session already has a scope, and a mismatch means a caller has confused two
    studios -- the one case where the explicit parameter could write a row the session
    could never read back."""
    with pytest.raises(NotFoundError):
        BillingService(tenant_session).create_charge(
            uuid.uuid4(), a_priced_student.payer_person_id, "manual", 5_000,
            date(2026, 11, 30), student_id=a_priced_student.student_id,
        )
```

- [ ] **Step 3: Run it and confirm every case fails**

Run: `.venv/bin/pytest tests/billing/test_charges.py -q`
Expected: FAIL — `NotImplementedError` from the contract stub on most, and
`TypeError: BillingService() takes no arguments` on construction.

- [ ] **Step 4: Write `app/services/billing/service.py`**

```python
"""§5.10's ledger core: the two W4 seam methods, and the one writer of `charge.status`.

**Charges are never mutated to record payment** (§4.3). A charge is settled when its
`payment_allocation` rows sum to `amount_agorot`; `status` is a derived cache and
`recompute_charge_status` is its only writer. Every route that changes what is allocated
calls it rather than setting the field, because a derived cache with two writers is wrong
in exactly the cases nobody tests.

**The session arrives on the constructor**, the way `ScheduleService(session)` does and for
the same reason: W4's contract commit fixed both seam signatures before this worktree
existed, and neither has room for one. The service has NO studio filter of its own -- it is
exactly as scoped as the session it is handed.

**Why `studio_id` is still a parameter.** The monthly run is a worker: there is no request,
so `TenantSession` has nothing to infer from and `TenantMixin` fails closed rather than
returning every studio's rows. Under a request the session already carries a scope, and the
two disagreeing means a caller has confused two studios -- so it is checked, not trusted.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.tenancy import get_current_studio_id
from app.models.billing import Charge, PaymentAllocation
from app.schemas.billing import ChargeKind
from app.services.billing.errors import ConflictError, NotFoundError

if TYPE_CHECKING:  # pragma: no cover -- the annotation only
    pass

#: D-M6-8. `tuition` is the one kind a period belongs to, so it is the one kind the partial
#: unique index applies to. A `registration` fee is charged once per student for good
#: (§5.10 step 6) and a `manual` charge may legitimately repeat, so both carry a NULL
#: period -- which is exactly what `uq_charge_student_period_kind`'s `postgresql_where`
#: was written to allow.
PERIODIC_KINDS = frozenset({"tuition"})

#: §4.3 -- `charge  created_by(billing_run|manual|event)`. Provenance, not state. A tuition
#: or registration charge is always the run's; an event fee is always M7's.
_ORIGIN_BY_KIND: dict[str, str] = {
    "tuition": "billing_run",
    "registration": "billing_run",
    "event": "event",
    "manual": "manual",
}


class BillingService:
    """§5.10's ledger. See the module docstring for the invariant every method inherits.

    **G8 constrains what may ever live here.** הוראת קבע mandates cannot be created
    programmatically by our provider, so there is no `create_subscription`, no recurring
    billing job, and no method that charges a card on a schedule.
    """

    #: Exported so `run.py` and the tests name the rule once. See D-M6-8.
    PERIODIC_KINDS = PERIODIC_KINDS

    def __init__(self, session: Session) -> None:
        self._session = session

    # -- the W4 seam ---------------------------------------------------------
    def create_charge(
        self,
        studio_id: uuid.UUID,
        payer_person_id: uuid.UUID,
        kind: ChargeKind,
        amount_agorot: int,
        due_date: date,
        *,
        student_id: uuid.UUID | None = None,
        event_id: uuid.UUID | None = None,
    ) -> Charge:
        """Create one charge and return it. The single entry point for every route that
        puts money on a family's balance: the monthly run (§5.10 step 1), a manual charge,
        and M7's event fee.

        `student_id` and `event_id` are keyword-only, and that is load-bearing: both are
        `UUID | None` in adjacent positions, so positionally an event id binds happily to
        `student_id` and no type checker can see it.

        Raises `ConflictError` when the period is already billed -- §5.10 step 5's
        idempotence, enforced by the database rather than by a read-then-write that two
        concurrent runs would both pass.
        """
        self._require_scope(studio_id)
        # G2, stated where it can be enforced. `bool` is an `int` subclass and `True`
        # would insert 1 agora, so it is excluded explicitly.
        if not isinstance(amount_agorot, int) or isinstance(amount_agorot, bool):
            raise TypeError(
                f"amount_agorot must be an integer count of agorot (G2), not "
                f"{type(amount_agorot).__name__}"
            )
        if kind not in _ORIGIN_BY_KIND:
            raise ValueError(f"unknown charge kind {kind!r}")

        periodic = kind in PERIODIC_KINDS
        charge = Charge(
            studio_id=studio_id,
            payer_person_id=payer_person_id,
            student_id=student_id,
            kind=kind,
            # D-M6-8 -- the due date is the only argument carrying a month, and the run
            # dues every tuition charge on the last day of the period it bills.
            period_year=due_date.year if periodic else None,
            period_month=due_date.month if periodic else None,
            amount_agorot=amount_agorot,
            due_date=due_date,
            # Derived from the first moment rather than defaulted and corrected: nothing
            # is allocated yet, so `open` is what recompute would say if it were asked.
            status="open",
            created_by=_ORIGIN_BY_KIND[kind],
        )
        self._session.add(charge)
        try:
            self._session.flush()
        except IntegrityError as exc:
            # A SAVEPOINT would let the caller carry on in the same transaction, but the
            # run wants to know and the router wants a 409. Rolling back to the nested
            # begin is the run's job (see run.py), not this method's.
            raise ConflictError(
                f"{kind} for student {student_id} in "
                f"{due_date.year}-{due_date.month:02d} already exists"
            ) from exc
        return charge

    def recompute_charge_status(self, charge_id: uuid.UUID) -> None:
        """Re-derive `charge.status` from the charge's `payment_allocation` rows.

        **The one place `charge.status` is maintained** (§4.3). Returns `None`
        deliberately: handing back the `Charge` would invite a caller to read the status
        off the return value and hold it, which is how a second reader becomes a second
        writer two milestones later.

        `void` and `written_off` are manager decisions, not sums, so they are left alone --
        a written-off charge that acquires a late payment must not silently become `open`
        again. Recording that money is the reconciliation queue's job.
        """
        charge = self._session.get(Charge, charge_id)
        if charge is None:
            raise NotFoundError(f"no charge {charge_id}")
        if charge.status in ("void", "written_off"):
            return
        allocated = self.allocated_agorot(charge_id)
        # A negative charge is a credit (§5.10), so "covered" is about magnitude reached,
        # not about `>=`, which is false for every credit the moment it is settled.
        settled = (
            allocated <= charge.amount_agorot
            if charge.amount_agorot < 0
            else allocated >= charge.amount_agorot
        )
        charge.status = "settled" if settled else "open"

    # -- reads other services in this lane share ------------------------------
    def allocated_agorot(self, charge_id: uuid.UUID) -> int:
        """How much of a charge is covered by `payment_allocation` rows.

        `COALESCE` rather than a Python `sum` over loaded rows: a charge settled by nine
        partial payments is nine rows nobody needs in memory, and `ChargeOut` carries this
        on every row of a page.
        """
        total = self._session.execute(
            select(func.coalesce(func.sum(PaymentAllocation.amount_agorot), 0)).where(
                PaymentAllocation.charge_id == charge_id
            )
        ).scalar_one()
        return int(total)

    # -- internals ------------------------------------------------------------
    def _require_scope(self, studio_id: uuid.UUID) -> None:
        """A worker passes the studio and has no scope; a request has both and they must
        agree. Writing a row the session could never read back is the one failure this
        parameter makes possible, so it is the one this checks."""
        scoped = get_current_studio_id()
        if scoped is not None and scoped != studio_id:
            raise NotFoundError(
                f"studio {studio_id} is not the studio this session is scoped to"
            )
```

- [ ] **Step 5: Replace `app/services/billing/__init__.py` with a re-export**

The stub class goes; the package keeps exporting the same name from the same dotted path, so
`tests/invariants/test_05`'s `importlib.import_module("app.services.billing")` and
`tests/contracts/test_seams.py`'s `from app.services.billing import BillingService` both
still resolve. Mirror `app/services/schedule/__init__.py`.

```python
"""W4's cross-lane seam: `BillingService.create_charge` and `recompute_charge_status`.

Plan §1.2 -- **M7 is a pure caller.** §5.12's event fee has to appear on the family's
balance, and M6 is the only lane that may write a billing table. `create_charge` is the
whole of the contract between them: it landed on `main` in W4's contract commit, before
either worktree existed, so neither lane could change it unilaterally.

**The bodies were `NotImplementedError` until lane MONEY merged**, per §2.2 item 4. They
are implemented now, and `tests/contracts/test_seams.py` has moved from asserting that they
raise to asserting the shape M7 calls them through -- the same move lane SCHEDULE made for
`ScheduleService.materialize_sessions`.

**The session arrives on the constructor.** Neither seam signature has room for one and
W4's contract fixed both before this worktree existed, so `BillingService(session)` is how
the tenancy gets in. The service has NO studio filter of its own: it is exactly as scoped
as the session it is handed, which is why `create_charge` still takes `studio_id` and
checks it against the session's scope rather than trusting either alone.
"""

from __future__ import annotations

from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from app.services.billing.service import PERIODIC_KINDS, BillingService

__all__ = [
    "PERIODIC_KINDS",
    "BillingService",
    "ConflictError",
    "NotFoundError",
    "RefusedError",
]
```

- [ ] **Step 6: Run the charge tests and confirm they pass**

Run: `.venv/bin/pytest tests/billing/test_charges.py -q`
Expected: 6 passed.

- [ ] **Step 7: Write the failing test for `recompute_charge_status`**

Append to `tests/billing/test_charges.py`:

```python
def _pay(session, studio, charge, amount_agorot, payer_person_id):
    """A payment and one allocation against `charge`. Written here rather than in the
    conftest because the conftest is the contract commit's and this lane does not rewrite
    it -- and because Task 4 replaces this helper with the real allocation service."""
    payment = Payment(
        studio_id=studio.id,
        payer_person_id=payer_person_id,
        method="cash",
        amount_agorot=amount_agorot,
        received_at=T0,
    )
    session.add(payment)
    session.flush()
    session.add(
        PaymentAllocation(
            studio_id=studio.id,
            payment_id=payment.id,
            charge_id=charge.id,
            amount_agorot=amount_agorot,
        )
    )
    session.flush()
    return payment


def test_a_charge_is_settled_when_its_allocations_reach_the_amount(
    tenant_session, studio, a_priced_student
):
    """§4.3 -- the charge is never mutated to record the payment. It is recomputed from
    the allocations, which are the fact."""
    service = BillingService(tenant_session)
    charge = service.create_charge(
        studio.id, a_priced_student.payer_person_id, "manual", MONTHLY_AGOROT,
        date(2026, 11, 30), student_id=a_priced_student.student_id,
    )
    _pay(tenant_session, studio, charge, MONTHLY_AGOROT, a_priced_student.payer_person_id)
    service.recompute_charge_status(charge.id)
    assert charge.status == "settled"


def test_a_partly_paid_charge_stays_open(tenant_session, studio, a_priced_student):
    """A family paying in parts. Two allocations against one charge is normal (§4.3)."""
    service = BillingService(tenant_session)
    charge = service.create_charge(
        studio.id, a_priced_student.payer_person_id, "manual", MONTHLY_AGOROT,
        date(2026, 11, 30), student_id=a_priced_student.student_id,
    )
    _pay(tenant_session, studio, charge, MONTHLY_AGOROT - 1, a_priced_student.payer_person_id)
    service.recompute_charge_status(charge.id)
    assert charge.status == "open"


def test_recompute_reopens_a_charge_whose_allocation_was_removed(
    tenant_session, studio, a_priced_student
):
    """A reversal deletes allocations (Task 4) and calls this. Without the reopen arm a
    reversed payment would leave the charge reading `settled` forever -- money the club
    never received, invisible in every debt report."""
    service = BillingService(tenant_session)
    charge = service.create_charge(
        studio.id, a_priced_student.payer_person_id, "manual", MONTHLY_AGOROT,
        date(2026, 11, 30), student_id=a_priced_student.student_id,
    )
    _pay(tenant_session, studio, charge, MONTHLY_AGOROT, a_priced_student.payer_person_id)
    service.recompute_charge_status(charge.id)
    tenant_session.execute(
        PaymentAllocation.__table__.delete().where(PaymentAllocation.charge_id == charge.id)
    )
    service.recompute_charge_status(charge.id)
    assert charge.status == "open"


def test_a_written_off_charge_is_not_reopened_by_a_late_payment(
    tenant_session, studio, a_priced_student
):
    """`void` and `written_off` are manager decisions, not sums. A late payment against a
    written-off debt is real money and belongs in the reconciliation queue -- silently
    un-writing-off the charge would erase the decision that a human made."""
    service = BillingService(tenant_session)
    charge = service.create_charge(
        studio.id, a_priced_student.payer_person_id, "manual", MONTHLY_AGOROT,
        date(2026, 11, 30), student_id=a_priced_student.student_id,
    )
    charge.status = "written_off"
    _pay(tenant_session, studio, charge, MONTHLY_AGOROT, a_priced_student.payer_person_id)
    service.recompute_charge_status(charge.id)
    assert charge.status == "written_off"


def test_a_credit_is_settled_when_it_is_fully_allocated(
    tenant_session, studio, a_priced_student
):
    """§5.10 -- 'negative for a credit or discount'. `allocated >= amount` is true for a
    credit the moment it is created, so a naive comparison marks every credit settled
    before a single agora moves."""
    service = BillingService(tenant_session)
    credit = service.create_charge(
        studio.id, a_priced_student.payer_person_id, "manual", -5_000,
        date(2026, 11, 30), student_id=a_priced_student.student_id,
    )
    service.recompute_charge_status(credit.id)
    assert credit.status == "open"
    _pay(tenant_session, studio, credit, -5_000, a_priced_student.payer_person_id)
    service.recompute_charge_status(credit.id)
    assert credit.status == "settled"
```

- [ ] **Step 8: Run and confirm the recompute tests pass**

Run: `.venv/bin/pytest tests/billing/test_charges.py -q`
Expected: 11 passed. If `test_a_credit_is_settled_when_it_is_fully_allocated` fails at the
first assertion, the sign arm in `recompute_charge_status` was dropped.

- [ ] **Step 9: Write the failing test for the minimum billing run**

Create `tests/billing/test_billing_run.py`:

```python
"""§5.10's monthly run. Proration, registration fees and freezes are Task 2; this file is
the run's spine and invariant 5's subject."""

from __future__ import annotations

from datetime import date

from app.models.billing import BillingRun, Charge
from app.services.billing.run import BillingRunService, period_end
from sqlalchemy import func, select
from tests.billing.conftest import MONTHLY_AGOROT, PERIOD, T0


def test_period_end_is_the_last_day_of_the_month():
    """D-M6-8's other half. The run dues every tuition charge here so the period the seam
    derives from `due_date` cannot disagree with the period the run believes it billed."""
    assert period_end(2026, 11) == date(2026, 11, 30)
    assert period_end(2026, 12) == date(2026, 12, 31)
    assert period_end(2028, 2) == date(2028, 2, 29)


def test_the_run_charges_one_student_once(tenant_session, studio, a_priced_student, an_enrolled_student):
    """§5.10 step 1 -- 'One student, one tuition charge, however many groups they are
    enrolled in.' C11."""
    run = BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    assert run.status == "completed"
    assert run.charges_created == 1
    charge = tenant_session.execute(
        select(Charge).where(Charge.student_id == a_priced_student.student_id)
    ).scalar_one()
    assert charge.amount_agorot == MONTHLY_AGOROT
    assert charge.due_date == date(2026, 11, 30)
    assert charge.created_by == "billing_run"


def test_the_charge_is_owed_by_the_primary_guardian(
    tenant_session, studio, a_priced_student, an_enrolled_student
):
    """§4.3 -- captured at creation, so changing the primary guardian later leaves
    historical charges with whoever actually owed them."""
    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    charge = tenant_session.execute(select(Charge)).scalars().one()
    assert charge.payer_person_id == a_priced_student.payer_person_id


def test_a_student_in_two_groups_is_charged_once(
    tenant_session, studio, a_priced_student, an_enrolled_student, a_second_enrollment
):
    """C11's whole point, and the defect the index makes unforgeable. Walking enrollments
    instead of students is what bills this child twice at two different prices."""
    run = BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    assert run.charges_created == 1


def test_a_student_with_no_price_plan_is_skipped_and_reported(
    tenant_session, studio, an_unpriced_student
):
    """A child the manager has not priced yet. Charging them zero would look like a
    working run; skipping silently would lose them. The run records both."""
    run = BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    assert run.charges_created == 0
    assert str(an_unpriced_student.student_id) in run.log["unpriced"]


def test_rerunning_the_same_period_creates_no_duplicates(
    tenant_session, studio, a_priced_student, an_enrolled_student
):
    """§5.10 step 5, and invariant 5 in this lane's own suite. A run that crashed halfway
    and is retried must not double-charge, and it must not depend on its own bookkeeping
    being intact to avoid it -- the database refuses."""
    service = BillingRunService(tenant_session)
    service.run(studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0)
    second = service.run(studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0)
    assert second.charges_created == 0
    total = tenant_session.execute(select(func.count()).select_from(Charge)).scalar_one()
    assert total == 1


def test_a_rerun_reuses_the_period_s_run_row(
    tenant_session, studio, a_priced_student, an_enrolled_student
):
    """`uq_billing_run_studio_period` is unique, so a second run for one period is the
    same row re-opened. Inserting a second would be an IntegrityError on the retry path --
    the exact path that only ever runs when something has already gone wrong."""
    service = BillingRunService(tenant_session)
    first = service.run(studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0)
    second = service.run(studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0)
    assert first.id == second.id
    assert tenant_session.execute(select(func.count()).select_from(BillingRun)).scalar_one() == 1
```

- [ ] **Step 10: Add this task's fixtures to `tests/billing/conftest.py`**

The contract commit's conftest gives a priced student with a primary guardian but **no
enrollment**, and the run's eligibility is "at least one `active` enrollment". Append these
four fixtures; do not edit the existing ones.

```python
@pytest.fixture
def a_group(app_session: Session, studio: Studio) -> uuid.UUID:
    """A group to enrol into. The run never reads a group -- C11 prices per student -- but
    `enrollment.group_id` is non-null, so eligibility needs one to exist."""
    from app.models.structure import Class as StudioClass
    from app.models.structure import Group

    klass = StudioClass(studio_id=studio.id, name="מתחילים", is_active=True)
    app_session.add(klass)
    app_session.flush()
    group = Group(studio_id=studio.id, class_id=klass.id, name="מתחילים א", is_active=True)
    app_session.add(group)
    app_session.commit()
    return group.id


@pytest.fixture
def an_enrolled_student(
    app_session: Session, studio: Studio, a_priced_student: PricedStudent, a_group: uuid.UUID
) -> uuid.UUID:
    """§5.10 step 1's eligibility: at least one `active` enrollment. Started at the year's
    start, so this fixture prorates nothing -- Task 2's fixtures are the mid-month ones."""
    from app.models.people import Enrollment

    row = Enrollment(
        studio_id=studio.id,
        student_id=a_priced_student.student_id,
        group_id=a_group.id if hasattr(a_group, "id") else a_group,
        status="active",
        started_on=YEAR_STARTS,
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_second_enrollment(
    app_session: Session, studio: Studio, a_priced_student: PricedStudent, an_enrolled_student
) -> uuid.UUID:
    """C11's test case: the same child in a second group. One charge, not two."""
    from app.models.people import Enrollment
    from app.models.structure import Class as StudioClass
    from app.models.structure import Group

    klass = StudioClass(studio_id=studio.id, name="תחרותית", is_active=True)
    app_session.add(klass)
    app_session.flush()
    group = Group(studio_id=studio.id, class_id=klass.id, name="תחרותית א", is_active=True)
    app_session.add(group)
    app_session.flush()
    row = Enrollment(
        studio_id=studio.id,
        student_id=a_priced_student.student_id,
        group_id=group.id,
        status="active",
        started_on=YEAR_STARTS,
    )
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def an_unpriced_student(
    app_session: Session, studio: Studio, a_group: uuid.UUID
) -> PricedStudent:
    """A child the manager enrolled but has not priced. §5.4 sets `price_plan_id` at
    conversion and nothing forces it, so this is a real state and the run must survive it
    without inventing a number."""
    from app.models.people import Enrollment

    child = Person(studio_id=studio.id, first_name="ללא", last_name="מחיר")
    payer = Person(studio_id=studio.id, first_name="הורה", last_name="ללא מחיר")
    app_session.add_all([child, payer])
    app_session.flush()
    student = Student(
        studio_id=studio.id, person_id=child.id, status="active",
        joined_on=YEAR_STARTS, price_plan_id=None,
    )
    app_session.add(student)
    app_session.flush()
    app_session.add_all([
        Guardian(
            studio_id=studio.id, student_id=student.id, person_id=payer.id,
            is_primary=True, relation="parent",
        ),
        Enrollment(
            studio_id=studio.id, student_id=student.id, group_id=a_group,
            status="active", started_on=YEAR_STARTS,
        ),
    ])
    app_session.commit()
    return PricedStudent(
        student_id=student.id, person_id=child.id, payer_person_id=payer.id
    )
```

> **Before writing these, confirm the real column names** with
> `.venv/bin/python -c "from app.models.structure import Group, Class; print([c.name for c in Group.__table__.c], [c.name for c in Class.__table__.c])"`
> and the same for `app.models.people.Enrollment`. The lane conftest is the contract
> commit's and is authoritative about `Person`, `Student` and `Guardian`; these three are
> not, and a wrong keyword here is a fixture error that reads as a run bug.

- [ ] **Step 11: Run and confirm the run tests fail for the right reason**

Run: `.venv/bin/pytest tests/billing/test_billing_run.py -q`
Expected: FAIL — `ModuleNotFoundError: app.services.billing.run`.

- [ ] **Step 12: Write `app/services/billing/run.py`**

```python
"""§5.10's monthly billing run. **Idempotent across repeated executions** -- invariant 5.

The idempotency is enforced by `charge`'s unique index rather than by the run's own
bookkeeping, which is the right place for it: a run that crashed halfway and is retried
must not depend on its own records being intact to avoid double-charging a family.

**One student, one tuition charge, however many groups they are enrolled in** (C11).
Walking enrollments instead is the defect that bills a child in two groups twice, at two
different prices, silently and forever.

Proration, registration fees and freezes are Task 2. This module's spine -- eligibility,
one charge per student, a run row per period -- is what invariant 5 asserts over.
"""

from __future__ import annotations

import calendar
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.billing import BillingRun, PricePlan
from app.models.people import Enrollment, Student
from app.models.person import Guardian
from app.services.billing.errors import ConflictError
from app.services.billing.service import BillingService


def period_end(period_year: int, period_month: int) -> date:
    """The last day of a billing period.

    D-M6-8: the run dues every tuition charge here, because `create_charge` derives the
    period from `due_date` and the two must not be able to disagree. `calendar.monthrange`
    rather than arithmetic on 28/30/31 -- February 2028 is the case that catches a
    hand-rolled one.
    """
    return date(period_year, period_month, calendar.monthrange(period_year, period_month)[1])


@dataclass
class _Tally:
    """What the run tells the manager afterwards. Every number here is a COUNT, never
    money -- invariant 1's `NOT_MONEY` list carries `charges_created` for that reason."""

    charged: int = 0
    already_charged: int = 0
    unpriced: list[str] = field(default_factory=list)


class BillingRunService:
    """§5.10's run. Takes the session on the constructor, like every service in this lane."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._billing = BillingService(session)

    def run(
        self,
        studio_id: uuid.UUID,
        *,
        period_year: int,
        period_month: int,
        at: datetime,
    ) -> BillingRun:
        """Bill one studio for one period. Safe to call again for a period already partly
        billed -- that is the retry path, and it is the only path that ever runs after
        something has already gone wrong.

        `at` is passed rather than read from the clock so the worker and the manual route
        agree about when the run happened, and so §19.5's time travel reaches it.
        """
        run = self._open_run(studio_id, period_year, period_month, at)
        tally = _Tally()
        due = period_end(period_year, period_month)
        for student_id, price_plan_id in self._billable_students(studio_id, due):
            self._charge_one(studio_id, student_id, price_plan_id, due, tally)
        run.charges_created = tally.charged
        run.finished_at = at
        run.status = "completed"
        run.log = {
            "charged": tally.charged,
            "already_charged": tally.already_charged,
            "unpriced": tally.unpriced,
        }
        self._session.flush()
        return run

    # -- internals ------------------------------------------------------------
    def _open_run(
        self, studio_id: uuid.UUID, period_year: int, period_month: int, at: datetime
    ) -> BillingRun:
        """One row per (studio, period). `uq_billing_run_studio_period` is unique, so a
        retry re-opens the existing row rather than inserting a second one that the index
        would refuse on the exact path that only runs when something already broke."""
        existing = self._session.execute(
            select(BillingRun).where(
                BillingRun.studio_id == studio_id,
                BillingRun.period_year == period_year,
                BillingRun.period_month == period_month,
            )
        ).scalar_one_or_none()
        if existing is not None:
            existing.status = "running"
            existing.started_at = at
            existing.finished_at = None
            return existing
        row = BillingRun(
            studio_id=studio_id,
            period_year=period_year,
            period_month=period_month,
            started_at=at,
            status="running",
        )
        self._session.add(row)
        self._session.flush()
        return row

    def _billable_students(
        self, studio_id: uuid.UUID, due: date
    ) -> list[tuple[uuid.UUID, uuid.UUID | None]]:
        """§5.10 step 1 -- every **student** with at least one `active` enrollment.

        `DISTINCT` on the student is C11 made structural: the join to `enrollment` is what
        establishes eligibility, and without the distinct a child in two groups arrives
        twice and the second arrival is refused by the index rather than by the query,
        which turns a normal case into a logged conflict.
        """
        rows = self._session.execute(
            select(Student.id, Student.price_plan_id)
            .join(Enrollment, Enrollment.student_id == Student.id)
            .where(
                Student.studio_id == studio_id,
                Student.status == "active",
                Enrollment.status == "active",
            )
            .distinct()
            .order_by(Student.id)
        ).all()
        return [(row[0], row[1]) for row in rows]

    def _charge_one(
        self,
        studio_id: uuid.UUID,
        student_id: uuid.UUID,
        price_plan_id: uuid.UUID | None,
        due: date,
        tally: _Tally,
    ) -> None:
        if price_plan_id is None:
            # §5.4 sets the price at conversion and nothing forces it. Charging zero would
            # look like a working run; skipping silently would lose the child. Reported.
            tally.unpriced.append(str(student_id))
            return
        plan = self._session.get(PricePlan, price_plan_id)
        if plan is None:
            tally.unpriced.append(str(student_id))
            return
        payer_person_id = self._primary_guardian(student_id)
        if payer_person_id is None:
            tally.unpriced.append(str(student_id))
            return
        # A SAVEPOINT per student: `create_charge` raises `ConflictError` from an
        # IntegrityError, which poisons the transaction, and the run must carry on to the
        # next family rather than losing a whole studio's month to one duplicate.
        with self._session.begin_nested():
            try:
                self._billing.create_charge(
                    studio_id,
                    payer_person_id,
                    "tuition",
                    plan.monthly_amount_agorot,
                    due,
                    student_id=student_id,
                )
            except ConflictError:
                tally.already_charged += 1
                raise _AlreadyCharged from None
        tally.charged += 1

    def _primary_guardian(self, student_id: uuid.UUID) -> uuid.UUID | None:
        """§4.3 -- `charge.payer_person_id` is captured at creation from the primary
        guardian, so changing it later leaves historical charges with whoever owed them.
        `uq_guardian_one_primary_per_student` makes this at most one row."""
        return self._session.execute(
            select(Guardian.person_id).where(
                Guardian.student_id == student_id, Guardian.is_primary.is_(True)
            )
        ).scalar_one_or_none()


class _AlreadyCharged(Exception):
    """Rolls the per-student SAVEPOINT back without failing the run. Private: nothing
    outside this module should be able to catch it and mistake it for a real outcome."""
```

> **Careful with the SAVEPOINT.** `begin_nested()` rolls back when the block raises, and
> `_AlreadyCharged` escapes it. Wrap the `with` in `try: ... except _AlreadyCharged: return`
> so the run continues. Write it as:
> ```python
>         try:
>             with self._session.begin_nested():
>                 try:
>                     self._billing.create_charge(...)
>                 except ConflictError:
>                     tally.already_charged += 1
>                     raise _AlreadyCharged from None
>         except _AlreadyCharged:
>             return
>         tally.charged += 1
> ```

- [ ] **Step 13: Run the run tests**

Run: `.venv/bin/pytest tests/billing/test_billing_run.py -q`
Expected: 7 passed.

- [ ] **Step 14: Wire invariant 5 to a real run (D-M6-7)**

Replace the body of `test_the_billing_run_is_idempotent` in
`tests/invariants/test_05_the_billing_run_is_idempotent.py`. Keep `assert_idempotent` and
every harness self-test exactly as they are — the harness was unit-tested against
deliberately non-idempotent stubs precisely so this moment is a wiring change, not a
rewrite. The invariants directory runs **unscoped in every lane**, so this test seeds its
own studio rather than borrowing `tests/billing/conftest.py`.

```python
def test_the_billing_run_is_idempotent(app_session):
    """**Wired by lane MONEY (M6).** Until M6 this skipped, because the seam it guards had
    no body -- and W4's contract commit corrected the trigger from "the class imports" to
    "the body is still a stub" so the skip could not silently become permanent.

    Why this one matters more than most: the billing run creates money rows. A run that is
    not idempotent produces "we charged them twice" in a community where every parent knows
    every other parent (§8.1a).

    Three executions, snapshotted after each. `assert_idempotent`'s own self-tests below
    explain why after each and not only at the end.
    """
    from app.core.tenancy import use_studio
    from app.services.billing.run import BillingRunService

    studio_id, expected = _seed_a_billable_period(app_session)
    service = BillingRunService(app_session)

    def run() -> None:
        with use_studio(studio_id):
            service.run(studio_id, period_year=2026, period_month=11, at=_T0)
        app_session.commit()

    def snapshot() -> list[tuple[str, int, int | None, int | None, int]]:
        rows = app_session.execute(
            select(
                Charge.kind, Charge.amount_agorot, Charge.period_year,
                Charge.period_month, Charge.student_id,
            )
            .where(Charge.studio_id == studio_id)
            .order_by(Charge.student_id, Charge.kind)
        ).all()
        return [tuple(row) for row in rows]

    assert_idempotent(run, snapshot)
    assert len(snapshot()) == expected
```

`_seed_a_billable_period` and `_T0` are new helpers in the same file: one studio, one price
plan, one student with a primary guardian and one active enrollment, returning
`(studio_id, 1)`. Build it from the same models `tests/billing/conftest.py` uses and commit
it, so the run's own session sees it.

- [ ] **Step 15: Move the seam detector's live case (D-M6-6)**

In the same file, `test_the_seam_detector_recognises_the_contract_stub` currently asserts
`is_still_a_seam(BillingService.create_charge)` — true only while M6 is unwritten. Re-point
it, keeping a live case rather than deleting one:

```python
def test_the_seam_detector_recognises_a_contract_stub():
    """The live case, asserted against a seam that is still a seam.

    This pointed at `BillingService.create_charge` until lane MONEY filled it in -- by
    design: it was written to stop passing at exactly that moment, which is when the
    tripwire above had to start firing. A detector proven only against the fixtures below
    is a detector nobody has pointed at real code, so the live case moves to W5's
    `NotificationService.enqueue`, which is still empty-bodied. When W5 fills it in, move
    it again to whichever seam is then pending, or retire it and say so.
    """
    from app.services.comms import NotificationService

    assert is_still_a_seam(NotificationService.enqueue)


def test_the_billing_seam_is_no_longer_a_stub():
    """The other half, and the reason the tripwire above is now a real assertion rather
    than a skip. If this ever goes red, M6 was reverted and `test_the_billing_run_is_
    idempotent` is asserting over a method that raises."""
    service = _billing_service()
    assert service is not None
    assert not is_still_a_seam(service.create_charge)
    assert not is_still_a_seam(service.recompute_charge_status)
```

- [ ] **Step 16: Update the seam contract test (W2's precedent)**

In `tests/contracts/test_seams.py`, replace
`test_the_billing_seams_refuse_rather_than_returning_nothing` (lines 245–253). **Leave every
signature assertion above it untouched — those are the seam.**

```python
def test_the_billing_seams_are_reached_through_a_session_bound_service():
    """How M7 actually calls the seam: `BillingService(session).create_charge(...)`.

    Neither seam signature has room for a database session -- W4's contract commit fixed
    both before either worktree existed -- so M6 put the session on the constructor rather
    than widening a method and breaking the contract. That constructor is now part of what
    M7 builds against, which is why it is asserted here beside the methods it serves.

    **This replaces an assertion that both bodies raised `NotImplementedError`.** That was
    the right test while they were stubs: a `create_charge` that returned a detached
    `Charge` would have let M7 build an event-fee flow that passed its own tests and
    settled nothing. Now that lane MONEY has filled them in, the behaviour is owned by
    `tests/billing/test_charges.py`, and asserting it here too would give two files an
    opinion about one rule. Exactly the move lane SCHEDULE made for
    `ScheduleService.materialize_sessions`.
    """
    from app.services.billing import BillingService

    parameters = _signature(BillingService.__init__).parameters
    assert list(parameters) == ["self", "session"]
    assert parameters["session"].annotation is OrmSession
```

- [ ] **Step 17: Run the three gates that this task destabilises**

```bash
.venv/bin/pytest tests/invariants tests/contracts/test_seams.py tests/billing -q
```
Expected: all pass, **and `tests/invariants` reports no skip** — the run-idempotence test
now executes. Confirm with `-rs`: `test_the_billing_run_is_idempotent` must not appear.

- [ ] **Step 18: Typecheck, lint and run the lane check**

```bash
.venv/bin/mypy app/services/billing app/integrations/upay app/models/billing.py
.venv/bin/ruff check --fix app/services/billing && .venv/bin/ruff format app/services/billing
./scripts/lane-check.sh billing
```
Expected: `✅ lane billing green (6 scoped gates)`.

- [ ] **Step 19: Tick the piece and commit**

Add to `docs/plan/state.yaml` under wave `W4`'s `pieces:` — in the same commit as the work,
and nothing measurable:

```yaml
      - id: M6.1
        title: The ledger core — create_charge, recompute_charge_status, the run's spine
        status: shipped
        on: 2026-08-26
```

```bash
git add app/services/billing tests/billing tests/invariants/test_05_the_billing_run_is_idempotent.py \
        tests/contracts/test_seams.py docs/plan/state.yaml
git commit -m "feat(billing): the ledger core, and invariant 5 wired to a real run

create_charge and recompute_charge_status get bodies, so W4's tripwire fires by
design. assert_idempotent is wired over a seeded period rather than weakened, and
the seam detector's live case moves to the seam that is still a seam (W5's enqueue).

A charge is never mutated to record payment: status is derived from the allocation
sum and recompute_charge_status is its only writer.
"
```
### Task 2: Proration from materialized sessions, registration fees, and freezes

§5.10 steps 2, 3, 4 and 6. The rule that makes this worth its own task: **proration is
computed from materialized sessions, not calendar days**, and it applies to the **first
month only**. A calendar-day proration is right by luck in a month whose sessions happen to
be evenly spread and wrong for every club with a Friday-heavy timetable — which is this one
(§5.6's worked structure: Tue 15:00–17:00, Fri 15:00–19:00).

**Files:**
- Modify: `app/services/billing/run.py`
- Test: `tests/billing/test_proration.py`
- Modify: `tests/billing/conftest.py` (append fixtures only)

**Interfaces:**
- Consumes: Task 1's `BillingRunService`, `period_end`, `_Tally`; `BillingService.create_charge`.
- Consumes: `app.services.people.attendance_pattern.expected_weekdays` — **the shared C11/C12
  seam. The roster and the billing run read it rather than re-deriving, because a second
  implementation is a second answer.** Signature: `expected_weekdays(attends_weekdays: list[int] | None, group_weekdays: set[int]) -> set[int]`.
- Produces:
  - `proration(monthly_agorot: int, *, remaining: int, total: int) -> int` in `run.py`
  - `BillingRunService._sessions_in_period(...)` — internal
  - `charge.original_amount_agorot` and `charge.proration_note` populated for a prorated
    first month.

- [ ] **Step 1: Write the failing arithmetic test**

Create `tests/billing/test_proration.py` with the pure-function half first — it needs no
database and it is where the rounding rule lives.

```python
"""§5.10 step 2 — proration, from materialized sessions and never from calendar days."""

from __future__ import annotations

import pytest
from app.services.billing.run import proration


def test_a_full_period_is_the_full_price():
    """The identity case, and the one a broken multiplier still passes if `remaining ==
    total` is the only case tested. Every other test here joins mid-month for that reason."""
    assert proration(25_000, remaining=8, total=8) == 25_000


def test_half_the_sessions_is_half_the_price():
    assert proration(25_000, remaining=4, total=8) == 12_500


def test_the_result_is_rounded_to_a_whole_agora():
    """§5.10 writes `round(monthly × remaining ÷ total)`. 25000 × 3 ÷ 8 is 9375 exactly;
    25000 × 1 ÷ 3 is 8333.33, and the charge is an INTEGER column (G2) so the rounding has
    to happen here rather than in the driver."""
    assert proration(25_000, remaining=1, total=3) == 8_333
    assert proration(25_000, remaining=2, total=3) == 16_667


def test_the_arithmetic_never_goes_through_a_float():
    """G2. `round(25000 * 1 / 3)` is a float multiply and rounds correctly here, but
    `0.1 + 0.2` is the reason the rule is absolute rather than case-by-case. Integer
    arithmetic with an explicit half-up divide is what this asserts, via a value a float
    path gets wrong: banker's rounding turns 2.5 into 2, so 5 × 1 ÷ 2 must be 3, not 2."""
    assert proration(5, remaining=1, total=2) == 3


def test_a_period_with_no_sessions_charges_nothing():
    """A group whose sessions were all cancelled, or a student joining after the last one.
    Dividing by zero is the crash; charging the full month is the bug that reaches a
    parent."""
    assert proration(25_000, remaining=0, total=0) == 0


def test_more_remaining_than_total_is_a_programming_error():
    """Not clamped. A caller that computed `remaining` against a different period than
    `total` produces a plausible over-charge, and silently clamping it to the full month
    hides the bug behind a correct-looking number."""
    with pytest.raises(ValueError):
        proration(25_000, remaining=9, total=8)
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `.venv/bin/pytest tests/billing/test_proration.py -q`
Expected: FAIL — `ImportError: cannot import name 'proration'`.

- [ ] **Step 3: Add `proration` to `app/services/billing/run.py`**

```python
def proration(monthly_agorot: int, *, remaining: int, total: int) -> int:
    """§5.10 step 2 -- `round(monthly × remaining ÷ total_sessions_in_period)`.

    **Integer arithmetic, half-up.** G2 forbids a float touching money, and Python's
    `round` is banker's rounding: `round(2.5)` is 2, so a float path charges a family one
    agora less than the spec says for every exact half. `(n + d // 2) // d` is half-up in
    integers and has no representation error to argue about.

    `total == 0` is a real state -- a group whose period was entirely cancelled, or a
    student joining after the last session -- and it charges nothing. `remaining > total`
    is not: it means `remaining` and `total` were computed against different periods, and
    clamping would hide a plausible over-charge behind a correct-looking number.
    """
    if remaining < 0 or total < 0:
        raise ValueError(f"negative session counts: remaining={remaining} total={total}")
    if remaining > total:
        raise ValueError(
            f"remaining={remaining} exceeds total={total}: the two were computed against "
            "different periods"
        )
    if total == 0:
        return 0
    numerator = monthly_agorot * remaining
    return (numerator + total // 2) // total
```

- [ ] **Step 4: Run and confirm the arithmetic passes**

Run: `.venv/bin/pytest tests/billing/test_proration.py -q`
Expected: 6 passed.

- [ ] **Step 5: Write the failing test for the driver**

Append to `tests/billing/test_proration.py`. The lane conftest pins `T0` to
**2026-11-12**, deliberately not the 1st — a clock on the first of the month prorates
nothing (`remaining == total`) and a completely broken proration still returns the right
answer.

```python
def test_a_first_month_is_prorated_from_the_sessions_that_remain(
    tenant_session, studio, a_mid_month_joiner
):
    """§5.10 step 2. The child joined on the 12th of a month whose group trains Tuesdays
    and Fridays, so some sessions are behind them and the fee buys the slot for the rest."""
    from app.services.billing.run import BillingRunService, proration
    from tests.billing.conftest import MONTHLY_AGOROT, PERIOD, T0

    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    charge = _the_tuition_charge(tenant_session, a_mid_month_joiner.student_id)
    assert charge.amount_agorot == proration(
        MONTHLY_AGOROT,
        remaining=a_mid_month_joiner.remaining_sessions,
        total=a_mid_month_joiner.total_sessions,
    )
    assert charge.amount_agorot < MONTHLY_AGOROT


def test_a_prorated_charge_explains_itself(tenant_session, studio, a_mid_month_joiner):
    """§5.10 -- 'The original amount and a human-readable proration_note are stored so the
    parent sees בגין 3 מתוך 8 שיעורים.' Without both, a prorated month looks like a
    cheaper price, and next month's full charge looks like a rise."""
    from app.services.billing.run import BillingRunService
    from tests.billing.conftest import MONTHLY_AGOROT, PERIOD, T0

    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    charge = _the_tuition_charge(tenant_session, a_mid_month_joiner.student_id)
    assert charge.original_amount_agorot == MONTHLY_AGOROT
    assert charge.proration_note is not None
    assert str(a_mid_month_joiner.remaining_sessions) in charge.proration_note
    assert str(a_mid_month_joiner.total_sessions) in charge.proration_note


def test_the_second_month_is_the_flat_amount(tenant_session, studio, a_mid_month_joiner):
    """§5.10 step 3 -- 'Every subsequent month is the flat monthly amount. Closures,
    holidays and absences never change it.' The fee buys the slot."""
    from app.services.billing.run import BillingRunService
    from tests.billing.conftest import MONTHLY_AGOROT, T0

    service = BillingRunService(tenant_session)
    service.run(studio.id, period_year=2026, period_month=11, at=T0)
    service.run(studio.id, period_year=2026, period_month=12, at=T0)
    december = _the_tuition_charge(
        tenant_session, a_mid_month_joiner.student_id, period_month=12
    )
    assert december.amount_agorot == MONTHLY_AGOROT
    assert december.original_amount_agorot is None
    assert december.proration_note is None


def test_proration_counts_sessions_and_not_calendar_days(
    tenant_session, studio, a_mid_month_joiner
):
    """The rule this task exists for. Joining on the 12th of a 30-day month is 60% of the
    calendar remaining; the group trains Tuesdays and Fridays, so the session count is a
    different number. A test that only asserted "less than the full month" would pass a
    calendar-day implementation."""
    from app.services.billing.run import BillingRunService, proration
    from tests.billing.conftest import MONTHLY_AGOROT, PERIOD, T0

    BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    charge = _the_tuition_charge(tenant_session, a_mid_month_joiner.student_id)
    calendar_days_answer = proration(MONTHLY_AGOROT, remaining=19, total=30)
    assert charge.amount_agorot != calendar_days_answer


def test_a_registration_fee_is_charged_once_and_never_again(
    tenant_session, studio, a_mid_month_joiner
):
    """§5.10 step 6 -- 'charged once per student, on the first billing run after their
    first enrollment — never again when they add or change a group.'

    This is NOT the unique index's job. The index keys on the period, so a period-keyed
    registration fee is re-raisable every month, correctly, forever. The run guards it with
    a query, and this test is what proves the guard exists (D-M6-8)."""
    from app.models.billing import Charge
    from app.services.billing.run import BillingRunService
    from sqlalchemy import func, select
    from tests.billing.conftest import REGISTRATION_AGOROT, T0

    service = BillingRunService(tenant_session)
    service.run(studio.id, period_year=2026, period_month=11, at=T0)
    service.run(studio.id, period_year=2026, period_month=12, at=T0)
    fees = tenant_session.execute(
        select(Charge).where(
            Charge.student_id == a_mid_month_joiner.student_id,
            Charge.kind == "registration",
        )
    ).scalars().all()
    assert len(fees) == 1
    assert fees[0].amount_agorot == REGISTRATION_AGOROT
    assert fees[0].period_year is None  # D-M6-8: not periodic


def test_a_plan_with_no_registration_fee_raises_none(
    tenant_session, studio, a_joiner_on_a_free_plan
):
    """`registration_fee_agorot` is nullable because most plans have none. A zero-amount
    charge would appear on the parent's screen as a line item for nothing."""
    from app.models.billing import Charge
    from app.services.billing.run import BillingRunService
    from sqlalchemy import select
    from tests.billing.conftest import T0

    BillingRunService(tenant_session).run(
        studio.id, period_year=2026, period_month=11, at=T0
    )
    assert tenant_session.execute(
        select(Charge).where(
            Charge.student_id == a_joiner_on_a_free_plan.student_id,
            Charge.kind == "registration",
        )
    ).scalars().all() == []


def test_a_frozen_student_generates_nothing(tenant_session, studio, a_frozen_student):
    """§5.10 step 4, in four words: 'A frozen student generates nothing.' Not a zero
    charge, not a voided one — nothing."""
    from app.models.billing import Charge
    from app.services.billing.run import BillingRunService
    from sqlalchemy import select
    from tests.billing.conftest import PERIOD, T0

    run = BillingRunService(tenant_session).run(
        studio.id, period_year=PERIOD[0], period_month=PERIOD[1], at=T0
    )
    assert tenant_session.execute(
        select(Charge).where(Charge.student_id == a_frozen_student.student_id)
    ).scalars().all() == []
    assert str(a_frozen_student.student_id) in run.log["frozen"]


def _the_tuition_charge(session, student_id, *, period_month: int = 11):
    from app.models.billing import Charge
    from sqlalchemy import select

    return session.execute(
        select(Charge).where(
            Charge.student_id == student_id,
            Charge.kind == "tuition",
            Charge.period_month == period_month,
        )
    ).scalar_one()
```

- [ ] **Step 6: Add this task's fixtures**

Append to `tests/billing/conftest.py`. `a_mid_month_joiner` must **materialize real
sessions** — the whole rule is that the count comes from `session` rows, so a fixture that
faked the count would test nothing. Build the group's schedule rules and call
`ScheduleService(session).materialize_sessions(group_id, from_date, to_date)`, then count.

```python
@dataclass
class MidMonthJoiner:
    """A child who joined inside the period, and the two session counts their charge must
    be derived from. Carrying the counts is what lets a test assert the exact amount rather
    than 'less than a full month', which a calendar-day implementation also satisfies."""

    student_id: uuid.UUID
    person_id: uuid.UUID
    payer_person_id: uuid.UUID
    remaining_sessions: int
    total_sessions: int


@pytest.fixture
def a_mid_month_joiner(app_session, studio, a_price_plan) -> MidMonthJoiner:
    """Joined 2026-11-12 into a group that trains Tuesday and Friday (§5.6's worked
    structure). Sessions are MATERIALIZED, not counted from the calendar: §5.10 prorates
    from `session` rows and a fixture that computed the count itself would let a
    calendar-day implementation pass."""
    ...
```

> **Write this fixture against the real API.** Establish the exact names first:
> ```bash
> .venv/bin/python - <<'PY'
> import inspect
> from app.services.schedule import ScheduleService
> from app.models.schedule import GroupScheduleRule, Session, TrainingYear
> print(inspect.signature(ScheduleService.materialize_sessions))
> for m in (GroupScheduleRule, Session, TrainingYear):
>     print(m.__tablename__, [c.name for c in m.__table__.c])
> PY
> ```
> `tests/schedule/conftest.py` pins the 2026/27 training year the lane conftest's `T0`
> was chosen to sit inside — read it and reuse its shape rather than inventing a second
> training year, which would collide on `uq`-active.
>
> Then compute both counts from the materialized rows:
> ```python
>     total = <count of scheduled sessions for the group with starts_at inside November 2026>
>     remaining = <the same count, with starts_at >= the joining date>
> ```
> and assert in the fixture that `0 < remaining < total`, so a schedule change that
> flattened the case fails loudly here rather than quietly weakening every test above.

Add `a_joiner_on_a_free_plan` (a second `PricePlan` with `registration_fee_agorot=None`) and
`a_frozen_student` (an active enrollment plus a `StudentFreeze` covering November 2026 —
check the real column names with
`.venv/bin/python -c "from app.models.people import StudentFreeze; print([c.name for c in StudentFreeze.__table__.c])"`).

- [ ] **Step 7: Run and confirm the driver tests fail**

Run: `.venv/bin/pytest tests/billing/test_proration.py -q`
Expected: the six arithmetic tests pass; the eight driver tests fail — the run charges the
flat amount and raises no registration fee.

- [ ] **Step 8: Extend `BillingRunService`**

Four changes to `app/services/billing/run.py`:

1. `_Tally` gains `frozen: list[str] = field(default_factory=list)` and
   `registrations: int = 0`; `run()` writes both into `run.log`.
2. `_billable_students` excludes frozen students. §5.10 step 4 — a student is frozen for a
   period when a `student_freeze` row overlaps it. Add a `NOT EXISTS` against
   `StudentFreeze` over the period's date range, and record the excluded ids in the tally
   so the run reports them rather than silently dropping a family.
3. `_charge_one` prorates the **first month only**. The test is "is this the student's
   first tuition charge in this studio" — a query, not a date comparison, because a student
   who joined mid-October and was first billed in November has an October join date and a
   November first charge:

```python
    def _is_first_tuition(self, studio_id: uuid.UUID, student_id: uuid.UUID) -> bool:
        """§5.10 step 2 -- proration applies to the FIRST month only.

        Asked as "has this student ever been billed tuition", not as "did they join this
        month". A club that starts using the app in March has students who joined in
        September, and comparing dates would prorate every one of them against a period
        they were present for the whole of.
        """
        return (
            self._session.execute(
                select(Charge.id).where(
                    Charge.studio_id == studio_id,
                    Charge.student_id == student_id,
                    Charge.kind == "tuition",
                ).limit(1)
            ).scalar_one_or_none()
            is None
        )
```

   When it is the first month, compute the counts and, **only when `remaining < total`**,
   set `original_amount_agorot` and `proration_note`. A first month a student was present
   for the whole of is a full month and must not carry a note saying `בגין 8 מתוך 8 שיעורים`.

```python
    def _sessions_in_period(
        self, student_id: uuid.UUID, *, period_start: date, period_end_: date, joined: date
    ) -> tuple[int, int]:
        """(remaining, total) for one student across one period, from MATERIALIZED sessions.

        §5.10 step 2 is explicit that this is not a calendar-day calculation, and the club's own
        timetable is why: Tuesdays and Fridays are not evenly spread through a month, so
        the two answers differ for most joining dates.

        The student's expected days come from `app/services/people/attendance_pattern.py`
        -- C11 and C12's shared seam. The roster reads the same module, because a second
        implementation of "what is this child expected at" is a second answer.
        """
```

   Count `session` rows for the student's **active enrollments' groups**, `status !=
   'cancelled'`, `starts_at` inside the period, filtered to the weekdays
   `expected_weekdays(enrollment.attends_weekdays, group_weekdays)` returns. `remaining` is
   the same count with `starts_at >= joined`. A student in two groups counts both groups'
   sessions — C11 prices the volume, and the volume is every session they attend.

4. After the tuition charge, raise the registration fee: **only if the plan has one, and
   only if the student has no `registration` charge at all** (the query, not the index).

- [ ] **Step 9: Run and confirm green**

Run: `.venv/bin/pytest tests/billing/test_proration.py tests/billing/test_billing_run.py -q`
Expected: all pass. Then `.venv/bin/pytest tests/invariants -q` — the idempotence assertion
now covers a period containing a prorated charge and a registration fee, and it must still
be idempotent across three executions.

- [ ] **Step 10: Lane check and commit**

```bash
./scripts/lane-check.sh billing
```
Add the `M6.2` piece to `docs/plan/state.yaml`, then:

```bash
git add app/services/billing tests/billing docs/plan/state.yaml
git commit -m "feat(billing): proration from materialized sessions, fees, freezes

§5.10 steps 2, 3, 4 and 6. Proration is first month only and counts session
rows, never calendar days — the club trains Tuesdays and Fridays, so the two
answers differ for most joining dates. Half-up integer arithmetic (G2).

The registration fee's once-per-student rule is a query, not the unique index:
the index keys on the period, so a period-keyed fee is re-raisable every month.
"
```
### Task 3: The catalogue and the charges API — `app/routers/billing.py`

Price plans (versioned, never edited in place), the product catalogue (no stock counts), the
charge list and the manual charge/credit. This is the task that creates
`app/routers/billing.py`, the file `scripts/lane-check.sh` has been listing since the
contract commit precisely so the gate reaches it the day it appears.

**Files:**
- Create: `app/services/billing/catalogue.py`, `app/routers/billing.py`
- Test: `tests/billing/test_catalogue.py`, `tests/billing/test_charges_api.py`

**Interfaces:**
- Consumes: Task 1's `BillingService`, `errors`; `app.schemas.billing`'s `PricePlanOut`,
  `PricePlanPage`, `ProductOut`, `ProductPage`, `ChargeOut`, `ChargePage`, `ManualChargeIn`,
  `ChargeAdjustmentIn`, `PayerBalanceOut`, `BillingRunOut`, `BillingRunPage`.
- Consumes: `app.core.auth_context.{ManagerOrOwner, AnyStaff}`,
  `app.core.tenancy.TenantSessionDep`, `app.schemas._pagination.{CursorParams, IdempotencyKey}`.
- Produces:
  - `CatalogueService(session)` with `list_price_plans`, `create_price_plan`,
    `close_price_plan`, `list_products`, `create_product`, `update_product`.
  - `BillingService.payer_balance(studio_id, payer_person_id) -> PayerBalanceOut`
  - Endpoints: `GET/POST /price-plans`, `POST /price-plans/{id}/close`,
    `GET/POST /products`, `PATCH /products/{id}`, `GET /charges`, `POST /charges`,
    `POST /charges/{id}/adjust`, `POST /charges/{id}/write-off`,
    `GET /payers/{person_id}/balance`, `POST /billing-runs`, `GET /billing-runs`,
    `GET/PATCH /billing/settings`.

> **`app/main.py` mounts by discovery.** Creating `app/routers/billing.py` mounts it. Never
> edit `app/main.py` or `app/models/__init__.py` to register anything.

- [ ] **Step 1: Write the failing catalogue test**

Create `tests/billing/test_catalogue.py`. The rule with teeth here is §5.10's *"Plans are
versioned by `active_from`/`active_to` so a price change never rewrites history"* — an
edit-in-place is what makes last year's charge inexplicable.

```python
"""§5.10's price plans and product catalogue.

Plans are versioned, never edited in place: §5.15's rollover reviews prices with old plans
CLOSED, not overwritten, because a charge raised last year must still be explicable by the
plan that was in force when it was raised.
"""

from __future__ import annotations

from datetime import date

import pytest
from app.services.billing.catalogue import CatalogueService
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from tests.billing.conftest import MONTHLY_AGOROT


def test_closing_a_plan_opens_the_replacement_without_touching_the_old_amount(
    tenant_session, studio, a_price_plan
):
    """The whole point of versioning. After a price rise, last month's charge must still
    be explicable: the old row keeps its amount and gains an `active_to`."""
    service = CatalogueService(tenant_session)
    new_plan = service.close_price_plan(
        a_price_plan, closes_on=date(2026, 12, 31), replacement_amount_agorot=32_000
    )
    old = service.get_price_plan(a_price_plan)
    assert old.active_to == date(2026, 12, 31)
    assert old.monthly_amount_agorot == MONTHLY_AGOROT
    assert new_plan.active_from == date(2027, 1, 1)
    assert new_plan.monthly_amount_agorot == 32_000
    assert new_plan.active_to is None


def test_a_closed_plan_cannot_be_closed_twice(tenant_session, studio, a_price_plan):
    """A second close would leave two open successors and no way to say which priced a
    charge."""
    service = CatalogueService(tenant_session)
    service.close_price_plan(a_price_plan, closes_on=date(2026, 12, 31),
                             replacement_amount_agorot=32_000)
    with pytest.raises(ConflictError):
        service.close_price_plan(a_price_plan, closes_on=date(2027, 1, 31),
                                 replacement_amount_agorot=35_000)


def test_a_plan_cannot_close_before_it_opened(tenant_session, studio, a_price_plan):
    """`price_plan_active_range` is a CHECK constraint; this is the same rule refused with
    a message a manager can read rather than an IntegrityError."""
    with pytest.raises(RefusedError):
        CatalogueService(tenant_session).close_price_plan(
            a_price_plan, closes_on=date(2026, 1, 1), replacement_amount_agorot=32_000
        )


def test_a_product_has_a_price_and_no_stock_count(tenant_session, studio):
    """§4.3 and §5.10 both say it outright: 'inventory is a different product'. Asserted
    against the table, so a `quantity` column added later fails here rather than shipping."""
    from app.models.billing import Product

    product = CatalogueService(tenant_session).create_product(
        studio.id, name="גי מידה 140", price_agorot=18_000, description=None
    )
    assert product.price_agorot == 18_000
    assert "quantity" not in Product.__table__.c
    assert "stock" not in Product.__table__.c


def test_deactivating_a_product_keeps_it_for_history(tenant_session, studio):
    """`is_active`, never a DELETE. A charge raised for an item the club stopped selling
    still has to render its name."""
    service = CatalogueService(tenant_session)
    product = service.create_product(studio.id, name="חגורה", price_agorot=6_000, description=None)
    service.update_product(product.id, is_active=False)
    assert service.get_product(product.id).is_active is False
    assert [p.id for p in service.list_products(include_inactive=True)] == [product.id]
    assert service.list_products(include_inactive=False) == []
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `.venv/bin/pytest tests/billing/test_catalogue.py -q`
Expected: FAIL — `ModuleNotFoundError: app.services.billing.catalogue`.

- [ ] **Step 3: Write `app/services/billing/catalogue.py`**

`close_price_plan(plan_id, *, closes_on, replacement_amount_agorot, ...) -> PricePlan` sets
`active_to = closes_on` on the existing row and inserts a new row with
`active_from = closes_on + timedelta(days=1)`, copying `name`, `sessions_per_week` and
`registration_fee_agorot` unless overridden. Refuse (`ConflictError`) when `active_to` is
already set; refuse (`RefusedError`) when `closes_on < active_from`. Products are ordinary
CRUD with `is_active` instead of deletion. Every list method returns rows ordered by a
stable key so the cursor page below is deterministic.

- [ ] **Step 4: Run and confirm the catalogue tests pass**

Run: `.venv/bin/pytest tests/billing/test_catalogue.py -q` → 5 passed.

- [ ] **Step 5: Write the failing router test**

Create `tests/billing/test_charges_api.py`. **Invariant 3 is the rule with the sharpest
teeth here**: a coach may never read a financial field, and the lane conftest ships
`as_lead_coach`/`as_assistant_coach` as the refused side precisely so this is testable.

```python
"""SPEC §7's `/charges`, `/price-plans`, `/products` and `/billing-runs`.

**Every financial route is manager-or-owner.** §3.2's matrix gives a coach no financial
read at all, and invariant 3 enforces it against the `coach` router tag -- so this router
carries no `coach` tag anywhere, and the two coach callers below are the assertion that it
does not.
"""

from __future__ import annotations

from datetime import date

import pytest
from tests.billing.conftest import MONTHLY_AGOROT


def test_a_manager_lists_the_charges_a_payer_owes(client, as_manager, an_open_charge, a_priced_student):
    response = client.get(
        "/api/v1/charges",
        params={"payer_person_id": str(a_priced_student.payer_person_id)},
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["amount_agorot"] == MONTHLY_AGOROT
    assert items[0]["allocated_agorot"] == 0
    assert items[0]["status"] == "open"


@pytest.mark.parametrize("caller", ["as_lead_coach", "as_assistant_coach"])
def test_a_coach_cannot_read_charges(client, request, caller, an_open_charge):
    """§3.2 and invariant 3. A lead coach opens a student card and marks attendance; they
    never see what the family owes. In a small community that boundary is the product."""
    signed_in = request.getfixturevalue(caller)
    response = client.get("/api/v1/charges", headers=signed_in.headers)
    assert response.status_code == 403


def test_a_manual_credit_is_a_negative_charge_with_a_reason(
    client, as_manager, a_priced_student
):
    """§5.10 -- 'negative for a credit or discount, with a mandatory reason'. A credit is a
    new fact, never an edit to the charge it offsets, so last month's statement does not
    change after a parent has read it."""
    response = client.post(
        "/api/v1/charges",
        json={
            "payer_person_id": str(a_priced_student.payer_person_id),
            "student_id": str(a_priced_student.student_id),
            "kind": "manual",
            "amount_agorot": 5_000,
            "due_date": "2026-11-30",
            "note": "גי מידה 140",
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 201
    charge_id = response.json()["id"]
    adjusted = client.post(
        f"/api/v1/charges/{charge_id}/adjust",
        json={"amount_agorot": -2_000, "reason": "הנחת אח"},
        headers=as_manager.headers,
    )
    assert adjusted.status_code == 201
    assert adjusted.json()["amount_agorot"] == -2_000


def test_an_adjustment_of_zero_is_refused(client, as_manager, an_open_charge):
    """`ChargeAdjustmentIn._never_zero` already refuses it; this asserts the router surfaces
    422 rather than 500. Zero records nothing while looking like a correction."""
    response = client.post(
        f"/api/v1/charges/{an_open_charge}/adjust",
        json={"amount_agorot": 0, "reason": "טעות"},
        headers=as_manager.headers,
    )
    assert response.status_code == 422


def test_a_manual_tuition_charge_is_refused(client, as_manager, a_priced_student):
    """`ManualChargeIn.kind` excludes `tuition` -- a hand-made tuition charge is how a
    month ends up billed twice, beside a run that believes it did its job."""
    response = client.post(
        "/api/v1/charges",
        json={
            "payer_person_id": str(a_priced_student.payer_person_id),
            "kind": "tuition",
            "amount_agorot": 25_000,
            "due_date": "2026-11-30",
        },
        headers=as_manager.headers,
    )
    assert response.status_code == 422


def test_writing_off_a_charge_does_not_delete_it(client, as_manager, an_open_charge):
    """§11.4 -- Israeli tax law requires roughly seven years of financial records, so a
    write-off is a status a human chose, never a DELETE."""
    response = client.post(
        f"/api/v1/charges/{an_open_charge}/write-off",
        json={"reason": "משפחה עזבה"},
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "written_off"


def test_the_payer_balance_nets_credits_against_debts(
    client, as_manager, a_priced_student, an_open_charge
):
    """`12f`'s summary card and `3e`'s household row read this. Negative is a family in
    credit, which `MoneyDisplay` renders inside a `<bdi>` so it reads as a credit in a
    right-to-left sentence rather than as a debt."""
    response = client.get(
        f"/api/v1/payers/{a_priced_student.payer_person_id}/balance",
        headers=as_manager.headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["charged_agorot"] == MONTHLY_AGOROT
    assert body["paid_agorot"] == 0
    assert body["balance_agorot"] == MONTHLY_AGOROT
    assert body["open_charge_count"] == 1


def test_a_manager_runs_the_month_and_a_rerun_creates_nothing(
    client, as_manager, a_priced_student, an_enrolled_student
):
    """§7's `POST /billing-runs`, and the endpoint D-M6-5 points the dev bar's runJob tool
    at. `billing.run.idempotentHint` is this rule written on the button."""
    body = {"period_year": 2026, "period_month": 11}
    first = client.post("/api/v1/billing-runs", json=body, headers=as_manager.headers)
    assert first.status_code == 201
    assert first.json()["charges_created"] == 1
    second = client.post("/api/v1/billing-runs", json=body, headers=as_manager.headers)
    assert second.status_code == 201
    assert second.json()["charges_created"] == 0
```

- [ ] **Step 6: Run and confirm it fails**

Run: `.venv/bin/pytest tests/billing/test_charges_api.py -q`
Expected: FAIL — every route 404s, because `app/routers/billing.py` does not exist.

- [ ] **Step 7: Write `app/routers/billing.py`**

Follow `app/routers/enrollments.py`'s shape exactly: module docstring naming the SPEC
section and the permission decision, `router = APIRouter(tags=["billing"])`, small
`_not_found()` helper, an `_out()` mapper per shape, one thin handler per route.

Non-negotiable details:
- **No `coach` tag anywhere in this file.** §3.2 gives a coach no financial read;
  invariant 3 enforces it against the tag, so an untagged coach route would be unguarded
  and a tagged one would be a violation. Every handler takes `_: ManagerOrOwner`.
- Every handler takes `session: TenantSessionDep` — it fails closed, so a request with no
  resolved studio is a 401 rather than an unscoped session.
- Every list endpoint returns the matching `CursorPage[T]` and accepts `after` / `limit`.
- Every mutating endpoint accepts `idempotency_key: IdempotencyKey`.
- Map `NotFoundError → 404`, `ConflictError → 409`, `RefusedError → 422`, each with
  `{code, message, details?}`.
- `POST /charges` calls `BillingService.create_charge` and **not** an insert — one writer.
- `POST /charges/{id}/write-off` sets `status = "written_off"`. **This is the one place
  outside `recompute_charge_status` that assigns `charge.status`, and it must go through a
  named `BillingService.write_off(charge_id, reason, actor_person_id)` method** so the
  exception is written down in the class that owns the field rather than scattered in a
  router. Add the same for `void`. Both audit-log through `AuditService.record`.
- `GET/PATCH /billing/settings` reads and writes `studio.settings["billing"]`
  (D-M6-4): `standing_order_link`, `cash_instructions`, `run_day` (default 1). Validate
  with a Pydantic shape defined in this router module — `app/schemas/billing.py` is the
  contract commit's file and this lane does not widen it.
- `POST /charges` and `POST /charges/{id}/adjust` audit-log. §5.10: "Both are audit-logged."
  Never put an amount a health record could be inferred from in `diff`; a money amount is
  fine, a health answer never is.

- [ ] **Step 8: Run the router tests**

Run: `.venv/bin/pytest tests/billing/test_charges_api.py -q` → 9 passed.

If the two coach cases return 200 instead of 403, the handler is missing `_: ManagerOrOwner`.
If they return 401, the conftest's sign-in did not attach the role — re-read the conftest's
note about signing in twice.

- [ ] **Step 9: Confirm the lane gate now reaches four more files**

Run: `./scripts/lane-check.sh billing`
Expected: the `types · billing` gate reports **more than 6 source files** — `app/routers/
billing.py` now exists, so the `-e` filter stops dropping it. That widening is the point of
this task as much as the endpoints are.

- [ ] **Step 10: Tick `M6.3` in `docs/plan/state.yaml` and commit**

```bash
git add app/services/billing app/routers/billing.py tests/billing docs/plan/state.yaml
git commit -m "feat(billing): price plans, products, charges and the run endpoint

Plans are versioned by active_from/active_to and never edited in place, so a
price change leaves last year's charge explicable. Products carry no stock
count — §4.3 and §5.10 both say inventory is a different product.

No route in this router carries the coach tag: §3.2 gives a coach no financial
read, and invariant 3 enforces that against the tag.
"
```
### Task 4: Money that arrived — payments, oldest-first allocation, reversal

§5.10's *"Manual payments and adjustments"*, and the allocation engine every other route in
this lane settles through. **This is where G8 lands**: a הוראת קבע payment is recorded here,
by a human, in the same flow as a bank transfer — because our provider cannot create a
per-payer mandate and its recurring IPNs carry no customer identifier.

**Files:**
- Create: `app/services/billing/payments.py`, `app/routers/payments.py`
- Test: `tests/billing/test_payments.py`, `tests/billing/test_allocation.py`

**Interfaces:**
- Consumes: Task 1's `BillingService.{create_charge, recompute_charge_status,
  allocated_agorot}`; Task 3's errors and router conventions;
  `app.schemas.billing.{ManualPaymentIn, PaymentOut, PaymentPage, PaymentAllocationOut, PaymentReversalIn}`.
- Produces:
  - `PaymentService(session)` with:
    - `record(studio_id, *, payer_person_id, method, amount_agorot, received_at, charge_ids, recorded_by_person_id, external_receipt_number=None, note=None, upay_ipn_id=None, payment_order_id=None) -> Payment`
    - `allocate(payment_id, charge_ids) -> list[PaymentAllocation]`
    - `allocate_oldest_first(payment_id, *, payer_person_id, studio_id) -> list[PaymentAllocation]`
    - `reverse(payment_id, *, reason, actor_person_id) -> Payment`
    - `unallocated_agorot(payment_id) -> int`
  - Endpoints: `GET/POST /payments`, `POST /payments/{id}/reverse`.

- [ ] **Step 1: Write the failing allocation test**

Create `tests/billing/test_allocation.py`. Allocation is the piece with the most ways to be
quietly wrong, so it gets its own file and the largest share of the cases.

```python
"""§4.3's `payment_allocation` — the table that makes 'charges are never mutated' possible.

One payment can settle several charges (§5.10's 'choose N months'); one charge can be
settled by several payments (a family paying in parts). Both are normal, which is why the
allocation carries its own amount and the charge carries none.
"""

from __future__ import annotations

from datetime import date

import pytest
from app.services.billing import BillingService
from app.services.billing.errors import ConflictError, RefusedError
from app.services.billing.payments import PaymentService
from tests.billing.conftest import MONTHLY_AGOROT, T0


def test_a_payment_settles_the_charges_it_is_allocated_to(
    tenant_session, studio, a_priced_student, an_open_charge
):
    payment = PaymentService(tenant_session).record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT,
        received_at=T0,
        charge_ids=[an_open_charge],
        recorded_by_person_id=None,
    )
    assert BillingService(tenant_session).allocated_agorot(an_open_charge) == MONTHLY_AGOROT
    charge = tenant_session.get(__import__("app.models.billing", fromlist=["Charge"]).Charge, an_open_charge)
    assert charge.status == "settled"
    assert payment.amount_agorot == MONTHLY_AGOROT


def test_one_payment_settles_several_charges(tenant_session, studio, a_priced_student, three_open_months):
    """§5.10's 'choose N months' button: one order, one payment, three charges."""
    payment = PaymentService(tenant_session).record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="bank_transfer",
        amount_agorot=MONTHLY_AGOROT * 3,
        received_at=T0,
        charge_ids=list(three_open_months),
        recorded_by_person_id=None,
    )
    service = BillingService(tenant_session)
    assert [service.allocated_agorot(c) for c in three_open_months] == [MONTHLY_AGOROT] * 3
    assert PaymentService(tenant_session).unallocated_agorot(payment.id) == 0


def test_a_partial_payment_allocates_oldest_first_and_leaves_a_remainder(
    tenant_session, studio, a_priced_student, three_open_months
):
    """§5.10's reconciliation step 3: 'allocates it to that payer's open charges
    oldest-first'. A family paying one month's worth against three months of debt clears
    the oldest, not the newest -- which is what the debt ladder's day counts are measured
    against."""
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT + 1_000,
        received_at=T0,
        charge_ids=[],
        recorded_by_person_id=None,
    )
    service.allocate_oldest_first(
        payment.id, payer_person_id=a_priced_student.payer_person_id, studio_id=studio.id
    )
    billing = BillingService(tenant_session)
    oldest, middle, newest = three_open_months
    assert billing.allocated_agorot(oldest) == MONTHLY_AGOROT
    assert billing.allocated_agorot(middle) == 1_000
    assert billing.allocated_agorot(newest) == 0
    assert service.unallocated_agorot(payment.id) == 0


def test_an_overpayment_leaves_a_surplus_rather_than_over_allocating(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """§5.10's third double-payment guard: 'the surplus surfaces as an overpayment in the
    manager's reconciliation queue and can be allocated forward to next month's charge.'
    Allocating more than a charge is owed would make the ledger disagree with the receipt."""
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        method="cash",
        amount_agorot=MONTHLY_AGOROT + 7_000,
        received_at=T0,
        charge_ids=[],
        recorded_by_person_id=None,
    )
    service.allocate_oldest_first(
        payment.id, payer_person_id=a_priced_student.payer_person_id, studio_id=studio.id
    )
    assert BillingService(tenant_session).allocated_agorot(an_open_charge) == MONTHLY_AGOROT
    assert service.unallocated_agorot(payment.id) == 7_000


def test_allocating_more_than_a_payment_holds_is_refused(
    tenant_session, studio, a_priced_student, three_open_months
):
    """The arithmetic that must never be possible: three months' charges against one
    month's money. A ledger where allocations exceed the payment reconciles to nothing."""
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id, payer_person_id=a_priced_student.payer_person_id, method="cash",
        amount_agorot=MONTHLY_AGOROT, received_at=T0, charge_ids=[],
        recorded_by_person_id=None,
    )
    with pytest.raises(RefusedError):
        service.allocate(payment.id, list(three_open_months))


def test_allocating_the_same_charge_twice_from_one_payment_is_refused(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """`uq_payment_allocation_payment_id_charge_id`. Two rows would be an accounting error
    that sums correctly and reconciles to nothing."""
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id, payer_person_id=a_priced_student.payer_person_id, method="cash",
        amount_agorot=MONTHLY_AGOROT, received_at=T0, charge_ids=[an_open_charge],
        recorded_by_person_id=None,
    )
    with pytest.raises(ConflictError):
        service.allocate(payment.id, [an_open_charge])


def test_a_reversal_reopens_the_charges_and_never_deletes_the_payment(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """§11.4 -- 'hard deletion is impossible because Israeli tax law requires ~7 years of
    financial records. A reversal is a new fact recorded on the row.' And the charge must
    reopen, or the club shows a month as paid that it was never paid for."""
    from app.models.billing import Charge, Payment

    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id, payer_person_id=a_priced_student.payer_person_id, method="cash",
        amount_agorot=MONTHLY_AGOROT, received_at=T0, charge_ids=[an_open_charge],
        recorded_by_person_id=None,
    )
    service.reverse(payment.id, reason="שיק חזר", actor_person_id=None)
    assert tenant_session.get(Payment, payment.id) is not None
    assert tenant_session.get(Payment, payment.id).reversed_at is not None
    assert tenant_session.get(Charge, an_open_charge).status == "open"
    assert BillingService(tenant_session).allocated_agorot(an_open_charge) == 0


def test_a_reversal_without_a_reason_is_refused(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """`payment_reversal_has_a_reason` is a CHECK constraint; this refuses it with a
    message rather than an IntegrityError, because 'why' is the only thing that makes a
    reversal auditable a year later."""
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id, payer_person_id=a_priced_student.payer_person_id, method="cash",
        amount_agorot=MONTHLY_AGOROT, received_at=T0, charge_ids=[an_open_charge],
        recorded_by_person_id=None,
    )
    with pytest.raises(RefusedError):
        service.reverse(payment.id, reason="   ", actor_person_id=None)


def test_a_payment_is_not_reversed_twice(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """The second reversal would delete allocations that are already gone and write a
    second `reversed_at`, overwriting the date the first one actually happened."""
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id, payer_person_id=a_priced_student.payer_person_id, method="cash",
        amount_agorot=MONTHLY_AGOROT, received_at=T0, charge_ids=[an_open_charge],
        recorded_by_person_id=None,
    )
    service.reverse(payment.id, reason="שיק חזר", actor_person_id=None)
    with pytest.raises(ConflictError):
        service.reverse(payment.id, reason="שוב", actor_person_id=None)


def test_oldest_first_skips_charges_already_settled(
    tenant_session, studio, a_priced_student, three_open_months
):
    """A second payment must not re-allocate against a month the first one cleared -- it
    would over-allocate the charge and under-serve the debt that is actually outstanding."""
    service = PaymentService(tenant_session)
    oldest, middle, newest = three_open_months
    first = service.record(
        studio.id, payer_person_id=a_priced_student.payer_person_id, method="cash",
        amount_agorot=MONTHLY_AGOROT, received_at=T0, charge_ids=[oldest],
        recorded_by_person_id=None,
    )
    second = service.record(
        studio.id, payer_person_id=a_priced_student.payer_person_id, method="cash",
        amount_agorot=MONTHLY_AGOROT, received_at=T0, charge_ids=[],
        recorded_by_person_id=None,
    )
    service.allocate_oldest_first(
        second.id, payer_person_id=a_priced_student.payer_person_id, studio_id=studio.id
    )
    billing = BillingService(tenant_session)
    assert billing.allocated_agorot(oldest) == MONTHLY_AGOROT
    assert billing.allocated_agorot(middle) == MONTHLY_AGOROT
    assert billing.allocated_agorot(newest) == 0


def test_oldest_first_never_allocates_against_a_credit(
    tenant_session, studio, a_priced_student, an_open_charge
):
    """A credit is a negative charge (§5.10). Allocating money 'against' it would settle
    the discount and leave the debt open -- exactly backwards."""
    billing = BillingService(tenant_session)
    billing.create_charge(
        studio.id, a_priced_student.payer_person_id, "manual", -3_000, date(2026, 10, 31),
        student_id=a_priced_student.student_id,
    )
    service = PaymentService(tenant_session)
    payment = service.record(
        studio.id, payer_person_id=a_priced_student.payer_person_id, method="cash",
        amount_agorot=MONTHLY_AGOROT, received_at=T0, charge_ids=[],
        recorded_by_person_id=None,
    )
    service.allocate_oldest_first(
        payment.id, payer_person_id=a_priced_student.payer_person_id, studio_id=studio.id
    )
    assert billing.allocated_agorot(an_open_charge) == MONTHLY_AGOROT
```

Add a `three_open_months` fixture to `tests/billing/conftest.py`: three `tuition` charges for
`a_priced_student` in periods (2026, 9), (2026, 10), (2026, 11), due on the last day of each,
returned **oldest first as a tuple** so a test can name them positionally.

- [ ] **Step 2: Run and confirm it fails**

Run: `.venv/bin/pytest tests/billing/test_allocation.py -q`
Expected: FAIL — `ModuleNotFoundError: app.services.billing.payments`.

- [ ] **Step 3: Write `app/services/billing/payments.py`**

Module docstring: this is §5.10's *"money that actually arrived, by any route"*, and G8's
landing point — `standing_order` is recorded here by a human exactly like `bank_transfer`,
because our provider cannot identify who paid through a shared recurring link.

Rules the implementation must hold:
- `record()` inserts the `Payment`, then allocates `charge_ids` in the order given, then
  calls `BillingService.recompute_charge_status` for each touched charge. **Never assigns
  `charge.status`.**
- `allocate()` refuses (`RefusedError`) when the requested total exceeds
  `unallocated_agorot(payment_id)`, and refuses (`ConflictError`) on a duplicate
  `(payment, charge)` pair — catch the `IntegrityError` from
  `uq_payment_allocation_payment_id_charge_id` rather than pre-checking, so two concurrent
  requests cannot both pass a read.
- Each allocation is `min(charge_outstanding, payment_remaining)` where
  `charge_outstanding = charge.amount_agorot - allocated_agorot(charge.id)`. Never more
  than the charge is owed; the remainder stays unallocated and surfaces as §5.10's
  overpayment.
- `allocate_oldest_first()` selects the payer's charges with `status == "open"` **and
  `amount_agorot > 0`** (credits are excluded — see the test), ordered by
  `due_date, id`, and stops when the payment is exhausted. The `id` tiebreak matters:
  three charges due the same day must allocate in a stable order, or a re-run allocates
  differently and the test that proves oldest-first is flaky.
- `reverse()` refuses a blank reason (`RefusedError`) and a second reversal
  (`ConflictError`); deletes the payment's allocations, sets `reversed_at`/`reversal_reason`,
  and recomputes every charge that was allocated to. Audit-logs.
- **§11.7:** nothing in this module logs a card owner name or last-4. If a log line is added
  here, it carries ids and amounts only.

- [ ] **Step 4: Run and confirm the allocation tests pass**

Run: `.venv/bin/pytest tests/billing/test_allocation.py -q` → 11 passed.

- [ ] **Step 5: Write the failing router test**

Create `tests/billing/test_payments.py` covering `GET/POST /payments` and
`POST /payments/{id}/reverse`: a manager records a `standing_order` payment (G8's normal
route, not an exception path); a coach is refused (403) on all three; a payment lists its
allocations; `external_receipt_number` round-trips (§5.10 — the club issues no tax document
for cash, transfer or הוראת קבע, so this is the bookkeeper's own number).

Add one case with real teeth:

```python
def test_recording_a_payment_never_writes_a_charge_status_directly(
    client, as_manager, a_priced_student, an_open_charge, tenant_session
):
    """The lane's central invariant, asserted through the API rather than the service.

    A route that set `status` itself would pass every test above -- the charge would read
    `settled` and the allocations would be right. What it would not survive is a reversal:
    the allocations go and the status stays. So this asserts the derived value, then
    removes the cause and asserts the effect follows.
    """
    from app.models.billing import Charge, PaymentAllocation

    client.post(
        "/api/v1/payments",
        json={
            "payer_person_id": str(a_priced_student.payer_person_id),
            "method": "standing_order",
            "amount_agorot": 25_000,
            "received_at": "2026-11-12T09:00:00+00:00",
            "charge_ids": [str(an_open_charge)],
        },
        headers=as_manager.headers,
    )
    tenant_session.expire_all()
    assert tenant_session.get(Charge, an_open_charge).status == "settled"
    tenant_session.execute(
        PaymentAllocation.__table__.delete().where(PaymentAllocation.charge_id == an_open_charge)
    )
    BillingService(tenant_session).recompute_charge_status(an_open_charge)
    assert tenant_session.get(Charge, an_open_charge).status == "open"
```

- [ ] **Step 6: Run, confirm failure, then write `app/routers/payments.py`**

Same conventions as Task 3's router: no `coach` tag, `ManagerOrOwner` on every handler,
`TenantSessionDep`, `CursorPage`, `IdempotencyKey`, `{code, message, details?}` errors.
`recorded_by_person_id` comes from the request context, never from the body — a client that
could name the recorder could attribute a payment to someone else.

- [ ] **Step 7: Run both files and the lane check**

```bash
.venv/bin/pytest tests/billing -q && ./scripts/lane-check.sh billing
```

- [ ] **Step 8: Tick `M6.4` and commit**

```bash
git commit -m "feat(billing): payments, oldest-first allocation and reversal

A charge is settled by its allocations summing to amount_agorot, and nothing here
assigns charge.status — recompute_charge_status stays the only writer. An
overpayment leaves a surplus rather than over-allocating; a reversal is a new fact
on the row, because §11.4 makes deletion impossible.

G8 lands here: a הוראת קבע payment is recorded by a human on the same flow as a
bank transfer, because uPay's recurring IPNs carry no customer identifier.
"
```
### Task 5: The uPay order — charge selection, the double-payment guard, the auto-submitting form

§5.10's *"uPay one-time flow"* steps 1–3 and 5, and the three double-payment protections.
The IPN itself is Task 6; this task ends at the moment the parent leaves for uPay's hosted
page, plus the return page that is explicitly **never the source of truth**.

**Files:**
- Create: `app/services/billing/orders.py`
- Modify: `app/routers/payments.py` (add the order routes)
- Test: `tests/billing/test_orders.py`, `tests/upay/test_form.py`

**Interfaces:**
- Consumes: Task 4's `PaymentService`; Task 1's `BillingService`;
  `app.integrations.upay.form.{upay_form_fields, shekels, UPAY_ENDPOINT, MAX_INSTALLMENTS, TooManyInstallmentsError, DemoStudioHasNoLiveFormError}`;
  `app.schemas.billing.{PaymentOrderCreateIn, PaymentOrderOut, PaymentOrderPage}`.
- Produces:
  - `OrderService(session)` with `selectable_charges`, `create`, `get_by_public_ref`,
    `form_fields`, `expire_stale`.
  - `ORDER_TTL_HOURS = 24`
  - Endpoints: `POST /payment-orders`, `GET /payment-orders/{public_ref}`,
    `GET /payment-orders/{public_ref}/form`, `GET /payment-complete`.

- [ ] **Step 1: Write the failing order test**

Create `tests/billing/test_orders.py`.

```python
"""§5.10's uPay one-time flow, up to the moment the parent leaves our origin.

`public_ref` is a UUIDv4 and it is the credential: the IPN endpoint is unauthenticated by
necessity, because uPay calls it, so a sequential id here would let anyone mark any
family's tuition paid by guessing.
"""

from __future__ import annotations

import uuid

import pytest
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from app.services.billing.orders import OrderService
from tests.billing.conftest import MONTHLY_AGOROT, T0


def test_an_order_prices_itself_from_the_server_side_charges(
    tenant_session, studio, a_priced_student, three_open_months
):
    """`PaymentOrderCreateIn` carries no expected amount on purpose: §5.10 compares the
    IPN against a server-side sum, and a client-supplied expected amount would be the
    thing it is compared to."""
    order = OrderService(tenant_session).create(
        studio.id,
        payer_person_id=a_priced_student.payer_person_id,
        charge_ids=list(three_open_months),
        max_payments=3,
        at=T0,
    )
    assert order.expected_amount_agorot == MONTHLY_AGOROT * 3
    assert order.status == "pending"


def test_the_public_ref_is_a_random_uuid4_and_not_a_sequence(
    tenant_session, studio, a_priced_student, three_open_months
):
    """§5.10's first threat row. Two orders created back to back must share no structure
    an attacker could walk."""
    service = OrderService(tenant_session)
    first = service.create(
        studio.id, payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]], max_payments=1, at=T0,
    )
    second = service.create(
        studio.id, payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[1]], max_payments=1, at=T0,
    )
    assert first.public_ref.version == 4
    assert second.public_ref.version == 4
    assert first.public_ref != second.public_ref


def test_a_charge_covered_by_an_open_order_is_not_selectable_again(
    tenant_session, studio, a_priced_student, three_open_months
):
    """§5.10's PRIMARY double-payment guard, and the one that works no matter which route
    the parent uses: 'A charge already covered by an open or paid payment_order is not
    selectable in the credit-card option.'"""
    service = OrderService(tenant_session)
    service.create(
        studio.id, payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]], max_payments=1, at=T0,
    )
    selectable = service.selectable_charges(
        studio.id, payer_person_id=a_priced_student.payer_person_id
    )
    assert three_open_months[0] not in [c.id for c in selectable]
    with pytest.raises(ConflictError):
        service.create(
            studio.id, payer_person_id=a_priced_student.payer_person_id,
            charge_ids=[three_open_months[0]], max_payments=1, at=T0,
        )


def test_an_expired_order_releases_its_charges(
    tenant_session, studio, a_priced_student, three_open_months
):
    """The guard above must not become a permanent lock. A parent who opened uPay and
    closed the tab would otherwise never be able to pay that month again."""
    from datetime import timedelta

    service = OrderService(tenant_session)
    service.create(
        studio.id, payer_person_id=a_priced_student.payer_person_id,
        charge_ids=[three_open_months[0]], max_payments=1, at=T0,
    )
    service.expire_stale(studio.id, at=T0 + timedelta(hours=25))
    selectable = service.selectable_charges(
        studio.id, payer_person_id=a_priced_student.payer_person_id
    )
    assert three_open_months[0] in [c.id for c in selectable]


def test_selectable_charges_span_every_child_this_person_pays_for(
    tenant_session, studio, a_two_child_family
):
    """§5.10 -- 'selects the N oldest unpaid tuition charges ACROSS EVERY STUDENT this
    person is the payer for, creates ONE payment_order covering all of them.' A family
    with two children pays once, not twice."""
    selectable = OrderService(tenant_session).selectable_charges(
        studio.id, payer_person_id=a_two_child_family.payer_person_id
    )
    students = {c.student_id for c in selectable}
    assert students == set(a_two_child_family.student_ids)


def test_selectable_charges_are_oldest_first(tenant_session, studio, a_priced_student, three_open_months):
    """`billing.card.oldestFirst` states this on the screen, and `1b`'s spec finding 5
    notes the key exists and the artboard never says it. The order is the product rule."""
    selectable = OrderService(tenant_session).selectable_charges(
        studio.id, payer_person_id=a_priced_student.payer_person_id
    )
    assert [c.id for c in selectable] == list(three_open_months)


def test_an_order_over_someone_else_s_charge_is_refused(
    tenant_session, studio, a_priced_student, a_two_child_family, three_open_months
):
    """A parent may pay only what they owe. `charge_ids` arrives from the client, so this
    is the check that stops one family opening an order over another family's debt --
    which would settle it on payment and leave the real payer's month reading paid."""
    with pytest.raises(NotFoundError):
        OrderService(tenant_session).create(
            studio.id,
            payer_person_id=a_two_child_family.payer_person_id,
            charge_ids=[three_open_months[0]],
            max_payments=1,
            at=T0,
        )


def test_an_order_with_no_charges_is_refused(tenant_session, studio, a_priced_student):
    """`PaymentOrderCreateIn.charge_ids` has `min_length=1`, and `payment_order_amount_
    positive` is a CHECK. An order for nothing would open uPay for zero shekels."""
    with pytest.raises(RefusedError):
        OrderService(tenant_session).create(
            studio.id, payer_person_id=a_priced_student.payer_person_id,
            charge_ids=[], max_payments=1, at=T0,
        )


def test_installments_above_the_account_s_cap_are_refused(
    tenant_session, studio, a_priced_student, three_open_months
):
    """Round two A1: the merchant dashboard's dropdown stops at 12, and behaviour above it
    was never tested against this account. `payment_order_max_payments` is the CHECK;
    `MAX_INSTALLMENTS` is the same number in `form.py`. Both, so neither can drift alone."""
    with pytest.raises(RefusedError):
        OrderService(tenant_session).create(
            studio.id, payer_person_id=a_priced_student.payer_person_id,
            charge_ids=list(three_open_months), max_payments=24, at=T0,
        )
```

Add `a_two_child_family` to `tests/billing/conftest.py`: one payer, two students, one open
tuition charge each, returning `payer_person_id` and `student_ids`.

- [ ] **Step 2: Run, confirm failure, write `app/services/billing/orders.py`**

The three §5.10 double-payment protections, in the order the spec gives them:
1. `selectable_charges()` excludes any charge with a `payment_order_charge` row whose order
   is `pending` or `paid`. **This is the primary guard** and it works whichever route the
   parent takes.
2. The active-`recurring_subscription` warning is a **read the client renders**, never a
   block — `1b`'s `billing.standingOrder.activeWarning`. `selectable_charges` returns the
   charges; a separate `has_active_subscription(payer_person_id) -> bool` feeds the warning.
3. The surplus case is Task 4's `unallocated_agorot` and needs nothing here.

`create()` must:
- Load the named charges **scoped to the payer**, and raise `NotFoundError` for any charge
  not owed by them. The client sends the ids.
- Refuse `status != "open"`, and refuse a charge already covered (`ConflictError`).
- Sum server-side into `expected_amount_agorot`; refuse `<= 0` (`RefusedError`).
- Clamp/refuse `max_payments` outside `1..MAX_INSTALLMENTS` (`RefusedError`).
- Set `expires_at = at + timedelta(hours=ORDER_TTL_HOURS)`.
- Insert `payment_order_charge` rows for every covered charge.

`expire_stale(studio_id, *, at)` moves `pending` orders past `expires_at` to `expired`,
which releases their charges. §5.10's *"IPN never arrives"* row is Task 8's nightly job and
calls this.

- [ ] **Step 3: Write the failing form test**

Create `tests/upay/test_form.py`. `app/integrations/upay/form.py` already exists and is
tested for its refusal; what is untested is **this lane's use of it**.

```python
"""§5.10 step 2 — the server-rendered, auto-submitting uPay form.

`form.py` is already written and already refuses a demo studio. What this file asserts is
that M6 renders it the one legal way: the amount comes from the ORDER's own row, the
reference is the order's `public_ref`, and the ipnurl is the endpoint that receives it.
"""

from __future__ import annotations

import pytest
from app.integrations.upay.form import (
    UPAY_ENDPOINT,
    DemoStudioHasNoLiveFormError,
    shekels,
)


def test_the_form_carries_the_server_s_amount_and_the_order_s_reference(
    tenant_session, studio, a_priced_student, three_open_months
):
    from app.services.billing.orders import OrderService
    from tests.billing.conftest import MONTHLY_AGOROT, T0

    service = OrderService(tenant_session)
    order = service.create(
        studio.id, payer_person_id=a_priced_student.payer_person_id,
        charge_ids=list(three_open_months), max_payments=3, at=T0,
    )
    fields = service.form_fields(order.public_ref, base_url="https://studio.example")
    assert fields["amount"] == shekels(MONTHLY_AGOROT * 3)
    assert fields["paymentdetails"] == str(order.public_ref)
    assert fields["ipnurl"].endswith(f"/api/v1/webhooks/upay/{order.public_ref}")
    assert fields["maxpayments"] == "3"
    assert fields["livesystem"] == "1"


def test_the_outbound_amount_format_is_not_the_inbound_one():
    """upay-integration.md round two B4, the correction that would otherwise have reached
    production: the form takes `1.00` and the callback returns `1`. A parser that compared
    the IPN against `shekels()` would raise a fraud alert on every correct whole-shekel
    payment -- and every charge in this product is whole shekels."""
    from app.integrations.upay.ipn import ipn_amount

    assert shekels(100) == "1.00"
    assert ipn_amount(100) == "1"
    assert shekels(100) != ipn_amount(100)


def test_a_demo_studio_gets_no_form_at_all(tenant_session, a_demo_studio, a_demo_order):
    """§19.6 restriction 5, as amended 2026-08-25. Not a sandbox-flagged form -- NO form.
    The account has no sandbox mode, so `livesystem=0` is a guarantee nobody can verify,
    and a demo walkthrough would have charged a real card with every test green."""
    from app.services.billing.orders import OrderService

    with pytest.raises(DemoStudioHasNoLiveFormError):
        OrderService(tenant_session).form_fields(
            a_demo_order.public_ref, base_url="https://studio.example"
        )


def test_this_lane_names_upay_s_endpoint_nowhere_but_form_py():
    """§19.6's second assertion: 'no other module in app/ names uPay's endpoint or writes
    livesystem'. A route that posted its own dict to that URL would bypass the refusal
    above entirely, so the refusal is only worth as much as this test."""
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[2] / "app"
    offenders = [
        path.relative_to(root)
        for path in root.rglob("*.py")
        if path.name != "form.py" and "upay.co.il" in path.read_text(encoding="utf-8")
    ]
    assert offenders == []
```

> **Verified while planning: this test already exists** at
> `tests/restrictions/test_05_no_live_money.py:157`, which is the right home for it — the
> restrictions directory runs **unscoped in every lane**, so every lane fails on the first
> violation rather than only this one. **Delete `test_this_lane_names_upay_s_endpoint_
> nowhere_but_form_py` from this file** rather than giving two files an opinion about one
> rule, and say so in the commit message. It is written out above only so an executor
> reading this task in isolation knows what the rule is and where it lives.

- [ ] **Step 4: Write `OrderService.form_fields` and the routes**

`form_fields(public_ref, *, base_url)` loads the order, loads its `Studio`, and calls
`upay_form_fields(studio=..., order_public_ref=..., expected_amount_agorot=order.expected_amount_agorot, max_payments=order.max_payments, merchant_email=settings.UPAY_MERCHANT_EMAIL, return_url=..., ipn_url=...)`.
It passes the **order's** amount, never a caller's.

> Confirm the settings name first: `grep -n "UPAY" app/core/config.py`. The merchant email
> is a Railway secret and is never in this repo.

Routes on `app/routers/payments.py`:
- `POST /payment-orders` — **guardian-callable**, unlike everything else in this lane. The
  parent creates their own order for their own charges, so the handler resolves the payer
  from the request context and ignores any payer in the body. A manager may also create one
  for a family. Check the existing guardian dependency with
  `grep -n "Guardian\|guardian" app/core/auth_context.py` and reuse it; do not invent a
  second permission vocabulary.
- `GET /payment-orders/{public_ref}` — the status the return page polls.
- `GET /payment-orders/{public_ref}/form` — returns `{action, fields}`, not HTML. The client
  builds the POST. Returning HTML from an API the OpenAPI client generates against would
  give the generated client a `string` where every other route has a model.
- `GET /payment-complete` — §5.10 step 5's `returnurl`. **Renders `billing.order.verifying`
  and reads status from `GET /payment-orders/{public_ref}`; it never marks anything paid.**
  The redirect is never the source of truth: a closed tab still produces an IPN.

- [ ] **Step 5: Run everything and the lane check**

```bash
.venv/bin/pytest tests/billing tests/upay -q && ./scripts/lane-check.sh billing
```

- [ ] **Step 6: Tick `M6.5` and commit**

```bash
git commit -m "feat(billing): uPay payment orders, the double-payment guard, the form

public_ref is a UUIDv4 and it is the credential — the IPN endpoint is
unauthenticated by necessity, so a sequential id would let anyone mark any
family's tuition paid.

The order prices itself server-side: PaymentOrderCreateIn carries no expected
amount, because that is the number the IPN is compared against. A charge covered
by an open or paid order is not selectable, and an expired order releases it.

The return page renders 'מאמת תשלום' and marks nothing paid.
"
```
### Task 6: The IPN endpoint — `app/routers/webhooks.py`

**The highest-stakes file in the product.** §12: the callback carries no cryptographic
signature, in either direction, [VERIFIED] in both rounds of live testing. Anyone who learns
the URL can send us bytes that look exactly like uPay's. `app/integrations/upay/callback.py`
already implements all four of §5.10's checks and touches no database; this task is the
endpoint that gives them a row to run against, in the order §5.10 requires:
**persist the raw callback → return 200 → do the work.**

**Files:**
- Create: `app/routers/webhooks.py`
- Modify: `app/services/billing/reconciliation.py` (created here, extended in Task 7)
- Test: `tests/upay/test_webhook.py`

**Interfaces:**
- Consumes: `app.integrations.upay.callback.{parse_ipn, verify_ipn, source_ip_is_known,
  IpnVerdict, IpnPayload, MalformedIpnError, NotAnOrderIpnError, UnobservedIpnOutcomeError}`;
  `app.integrations.upay.ipn.{IpnShape, build_ipn_query, agorot_from_ipn_amount, IPN_SOURCE_IP}`;
  Task 4's `PaymentService`; Task 5's `OrderService`.
- Produces:
  - `IpnIntake(session)` with `record(raw_query, *, source_ip, at) -> UpayIpnRecord` and
    `settle(ipn_record_id) -> None`.
  - `GET /webhooks/upay/{public_ref}` — unauthenticated, always 200.

- [ ] **Step 1: Write the failing endpoint test**

Create `tests/upay/test_webhook.py`. The four shapes are §19.5's, and they are exactly
§5.10's four security requirements — `build_ipn_query` produces all four, so the simulator
and the parser are tested against one vocabulary.

```python
"""§5.10's IPN endpoint. No signature exists on this callback, in either direction.

Four checks stand in for one: a UUIDv4 reference the server issued, an independent
server-side amount comparison, idempotence on `transactionid`, and a source-IP signal that
is deliberately never a gate.

**Every test here asserts 200.** §5.10: 'The endpoint persists the raw upay_ipn_record and
returns 200 immediately; all processing happens in a worker.' A non-200 invites retries
whose behaviour is [NOT COVERED] by any testing anyone has done against this account -- and
the raw bytes are already safe by then, which is what makes returning 200 to a forged
callback the right answer rather than a lax one.
"""

from __future__ import annotations

import uuid

from app.integrations.upay.ipn import IPN_SOURCE_IP, IpnShape, build_ipn_query
from app.models.billing import Charge, Payment, PaymentOrder, UpayIpnRecord
from sqlalchemy import func, select
from tests.billing.conftest import MONTHLY_AGOROT, T0


def _deliver(client, order, shape, *, transaction_id="TXN-1", source_ip=IPN_SOURCE_IP):
    query = build_ipn_query(
        shape=shape,
        order_public_ref=order.public_ref,
        expected_amount_agorot=order.expected_amount_agorot,
        transaction_id=transaction_id,
    )
    return client.get(
        f"/api/v1/webhooks/upay/{order.public_ref}",
        params=query,
        headers={"X-Forwarded-For": source_ip, "X-Dev-Now": T0.isoformat()},
    )


def test_a_clean_success_settles_every_charge_the_order_covers(client, an_order, tenant_session):
    """§5.10's happy path, and E2E-3's backend half."""
    response = _deliver(client, an_order, IpnShape.SUCCESS)
    assert response.status_code == 200
    tenant_session.expire_all()
    order = tenant_session.get(PaymentOrder, an_order.id)
    assert order.status == "paid"
    assert order.external_payment_ref == "TXN-1"
    assert order.paid_at is not None
    payment = tenant_session.execute(select(Payment)).scalars().one()
    assert payment.method == "upay_card"
    assert payment.amount_agorot == an_order.expected_amount_agorot
    for charge_id in an_order.charge_ids:
        assert tenant_session.get(Charge, charge_id).status == "settled"


def test_the_raw_callback_is_persisted_before_anything_else(client, an_order, tenant_session):
    """upay-integration.md calls this 'the single highest-value piece of infrastructure
    here': retries on a non-200, IPNs for failed payments and duplicate delivery are all
    [NOT COVERED], and logging the raw callback turns each unknown into something observed
    in production with full data rather than pre-guessed."""
    _deliver(client, an_order, IpnShape.SUCCESS)
    record = tenant_session.execute(select(UpayIpnRecord)).scalars().one()
    assert record.transactionid == "TXN-1"
    assert "productdescription=" in record.raw_query
    assert record.amount == "250"  # round two B4: whole shekels come back with no decimal
    assert record.source_ip == IPN_SOURCE_IP
    assert record.match_status == "auto"


def test_an_amount_mismatch_records_the_money_and_settles_nothing(
    client, an_order, tenant_session
):
    """§5.10's fourth threat row, verbatim: 'A payment IS recorded for the real amount
    received, allocated to nothing, and a high-priority manager alert is raised. Charges
    are NOT settled.'

    Never collapse this into `failed`. The money is in the merchant account."""
    response = _deliver(client, an_order, IpnShape.AMOUNT_MISMATCH)
    assert response.status_code == 200
    tenant_session.expire_all()
    order = tenant_session.get(PaymentOrder, an_order.id)
    assert order.status == "amount_mismatch"
    payment = tenant_session.execute(select(Payment)).scalars().one()
    assert payment.amount_agorot == an_order.expected_amount_agorot - 1
    assert tenant_session.execute(
        select(func.count()).select_from(
            __import__("app.models.billing", fromlist=["PaymentAllocation"]).PaymentAllocation
        )
    ).scalar_one() == 0
    for charge_id in an_order.charge_ids:
        assert tenant_session.get(Charge, charge_id).status == "open"


def test_a_forged_reference_settles_nothing_and_still_returns_200(
    client, an_order, tenant_session
):
    """E2E-4's backend half. The reference names no order of ours, so there is nothing to
    settle -- and the bytes are kept, because a forged callback is the one we most want a
    record of."""
    query = build_ipn_query(
        shape=IpnShape.FORGED_REF,
        order_public_ref=an_order.public_ref,
        expected_amount_agorot=an_order.expected_amount_agorot,
        transaction_id="TXN-FORGED",
    )
    response = client.get(
        f"/api/v1/webhooks/upay/{an_order.public_ref}",
        params=query,
        headers={"X-Dev-Now": T0.isoformat()},
    )
    assert response.status_code == 200
    tenant_session.expire_all()
    assert tenant_session.get(PaymentOrder, an_order.id).status == "pending"
    assert tenant_session.execute(select(Payment)).scalars().all() == []
    record = tenant_session.execute(select(UpayIpnRecord)).scalars().one()
    assert record.match_status == "unmatched"


def test_a_callback_for_an_unknown_public_ref_is_logged_and_rejected(client, tenant_session, studio):
    """The `payments` skill states it as a rule: 'A callback for an unknown reference is
    logged and rejected, not auto-created.' Auto-creating an order from a callback would
    let anyone mint paid orders out of nothing."""
    unknown = uuid.uuid4()
    query = build_ipn_query(
        shape=IpnShape.SUCCESS, order_public_ref=unknown,
        expected_amount_agorot=25_000, transaction_id="TXN-GHOST",
    )
    response = client.get(f"/api/v1/webhooks/upay/{unknown}", params=query,
                          headers={"X-Dev-Now": T0.isoformat()})
    assert response.status_code == 200
    assert tenant_session.execute(select(PaymentOrder)).scalars().all() == []


def test_a_duplicate_transactionid_is_logged_once_and_ignored(client, an_order, tenant_session):
    """§5.10's fifth threat row. Idempotence on `transactionid` neutralises retries AND
    duplicates whatever uPay actually does -- both are [NOT COVERED], and the design
    deliberately does not depend on knowing."""
    _deliver(client, an_order, IpnShape.SUCCESS, transaction_id="TXN-1")
    second = _deliver(client, an_order, IpnShape.DUPLICATE, transaction_id="TXN-1")
    assert second.status_code == 200
    tenant_session.expire_all()
    assert tenant_session.execute(select(func.count()).select_from(Payment)).scalar_one() == 1
    assert tenant_session.execute(
        select(func.count()).select_from(UpayIpnRecord)
    ).scalar_one() == 1


def test_a_second_delivery_never_double_settles(client, an_order, tenant_session):
    """The consequence the idempotence exists for, asserted on the money rather than on
    the row count: a duplicate that created a second payment would settle the family's
    NEXT month too, and nobody would notice until the following run."""
    _deliver(client, an_order, IpnShape.SUCCESS, transaction_id="TXN-1")
    _deliver(client, an_order, IpnShape.SUCCESS, transaction_id="TXN-1")
    total = tenant_session.execute(
        select(func.coalesce(func.sum(Payment.amount_agorot), 0))
    ).scalar_one()
    assert total == an_order.expected_amount_agorot


def test_an_unknown_source_ip_is_recorded_and_never_refused(client, an_order, tenant_session):
    """§5.10 allows a source-IP allowlist and calls it 'one weak layer, not proof'. Round
    two observed 84.95.87.35 on TWO OF THREE deliveries and could not establish whether it
    is stable -- so an address that changed would make us refuse real payments, silently,
    and the parent would have paid.

    Recorded for a human, acted on by nobody."""
    response = _deliver(client, an_order, IpnShape.SUCCESS, source_ip="203.0.113.9")
    assert response.status_code == 200
    tenant_session.expire_all()
    assert tenant_session.get(PaymentOrder, an_order.id).status == "paid"
    record = tenant_session.execute(select(UpayIpnRecord)).scalars().one()
    assert record.source_ip == "203.0.113.9"


def test_a_tampered_amount_in_either_money_field_is_caught(client, an_order, tenant_session):
    """Round two B10 [VERIFIED]: an edited `amount=2` came back as `amount=2` AND
    `depositamount=2`, both unmodified. A parser reading either one alone would be right by
    luck; `verify_ipn` compares both, and this asserts the endpoint does not undo that by
    reading only one."""
    query = build_ipn_query(
        shape=IpnShape.SUCCESS, order_public_ref=an_order.public_ref,
        expected_amount_agorot=an_order.expected_amount_agorot, transaction_id="TXN-T",
    )
    query["depositamount"] = "1"
    response = client.get(f"/api/v1/webhooks/upay/{an_order.public_ref}", params=query,
                          headers={"X-Dev-Now": T0.isoformat()})
    assert response.status_code == 200
    tenant_session.expire_all()
    assert tenant_session.get(PaymentOrder, an_order.id).status == "amount_mismatch"


def test_a_malformed_callback_is_kept_and_answered_200(client, an_order, tenant_session):
    """A delivery missing `transactionid` cannot be classified at all. Refusing it with a
    4xx would invite a retry loop whose behaviour nobody has observed; keeping the bytes
    and answering 200 puts it in front of a human instead."""
    response = client.get(
        f"/api/v1/webhooks/upay/{an_order.public_ref}",
        params={"amount": "250", "productdescription": str(an_order.public_ref)},
        headers={"X-Dev-Now": T0.isoformat()},
    )
    assert response.status_code == 200
    record = tenant_session.execute(select(UpayIpnRecord)).scalars().one()
    assert record.match_status == "unmatched"


def test_the_endpoint_needs_no_authentication(client, an_order):
    """uPay calls it, so it cannot be authenticated -- which is exactly why the reference
    is a UUIDv4 and the amount is verified server-side. Asserted so nobody 'fixes' the
    missing auth dependency and silently stops every real payment from reconciling."""
    response = _deliver(client, an_order, IpnShape.SUCCESS)
    assert response.status_code == 200


def test_no_card_owner_name_or_last_four_reaches_the_logs(client, an_order, caplog):
    """§11.7, and the reason `upay_ipn_record` exists as DATA. The card owner name and the
    last four digits are on a manager-only screen where reconciling actually happens; a log
    line carrying them is a copy nobody can redact later."""
    import logging

    from app.integrations.upay.ipn import DEMO_CARD_OWNER, DEMO_FOUR_DIGITS

    with caplog.at_level(logging.DEBUG):
        _deliver(client, an_order, IpnShape.SUCCESS)
    text = "\n".join(record.getMessage() for record in caplog.records)
    assert DEMO_CARD_OWNER not in text
    assert DEMO_FOUR_DIGITS not in text
```

Add an `an_order` fixture to `tests/billing/conftest.py`: a `PaymentOrder` over one open
tuition charge for `a_priced_student`, `expected_amount_agorot = MONTHLY_AGOROT`,
`max_payments=1`, plus a `charge_ids` attribute on the returned object so a test can walk
them. Build it through Task 5's `OrderService` — a hand-built order would not carry the
`payment_order_charge` rows the settlement path reads.

- [ ] **Step 2: Run and confirm every case fails**

Run: `.venv/bin/pytest tests/upay/test_webhook.py -q`
Expected: FAIL — 404 on every delivery; `app/routers/webhooks.py` does not exist.

- [ ] **Step 3: Write `app/services/billing/reconciliation.py`'s intake half**

`IpnIntake.record(raw_query, *, source_ip, at)` — persists first, always, whatever the
bytes are:
- Store the **full query string verbatim** in `raw_query`, before parsing.
- Parse leniently: pull `transactionid`, `amount`, `productdescription`, `cardownername`,
  `fourdigits`, `paymentdate` if present. A `MalformedIpnError` still produces a row —
  `transactionid` is non-null on the table, so fall back to a deterministic placeholder
  derived from the raw query, and set `match_status = "unmatched"`.
- Idempotence: catch the `IntegrityError` from `uq_upay_ipn_record_transactionid` and return
  the existing row with a flag saying it is a repeat. **Do not pre-check** — two concurrent
  deliveries would both pass a read.

`IpnIntake.settle(ipn_record_id)` — the work, run after the response is committed:
1. Load the order by `order_public_ref`. No order → leave `unmatched` and stop.
2. `verify_ipn(payload, expected_amount_agorot=order.expected_amount_agorot,
   known_public_ref=order.public_ref, seen_transaction_ids=<the other IPN rows' ids>)`.
3. `SUCCESS` → `PaymentService.record(..., method="upay_card", charge_ids=<the order's
   charges>, upay_ipn_id=record.id, payment_order_id=order.id)`; order → `paid`,
   `paid_at`, `external_payment_ref = transactionid`; record → `auto`,
   `matched_payment_id`.
4. `AMOUNT_MISMATCH` → **record a `Payment` for the amount actually received, with
   `charge_ids=[]`**; order → `amount_mismatch`; record → `unmatched`. Charges untouched.
   This is real money and the reconciliation queue is where it goes.
5. `FORGED_REF` → nothing but the record, `unmatched`.
6. `DUPLICATE` → nothing. The first delivery already earned its verdict.
7. `NotAnOrderIpnError` → `unmatched`. **This is the recurring path and it is legitimate**:
   every הוראת קבע payment arrives with no reference, and answering `forged_ref` for them
   would raise a fraud alert on every one of them.
8. `UnobservedIpnOutcomeError` → `unmatched`, and log at WARNING with the error code only.
   The first real failed-payment callback should surface as a human question, not as a guess.

- [ ] **Step 4: Write `app/routers/webhooks.py`**

```python
"""SPEC §5.10's uPay IPN endpoint. **Unauthenticated by necessity — uPay calls it.**

§12: there is no cryptographic signature on this callback, in either direction, [VERIFIED]
in both rounds of live testing. So the reference IS the credential, which is why it is a
UUIDv4 the server issued, and why the amount is compared against our own row rather than
believed.

**The ordering here is the contract.** §5.10's last threat row: 'The endpoint persists the
raw upay_ipn_record and returns 200 immediately; all processing happens in a worker.'
Retries on a non-200 are [NOT COVERED] by any testing against this account, so the design
never depends on knowing what they are: the bytes are written down first, the answer is
200, and every verdict is reached afterwards against a row that already exists.

**This router carries no `coach` tag and no auth dependency**, and both absences are
deliberate. A test asserts the second one, so that nobody 'fixes' it and silently stops
every real payment in the club from reconciling.

**§11.7 — nothing here logs a card owner name or last four digits.** They are columns on
`upay_ipn_record`, read on a manager-only screen. A log line carrying them is a copy that
cannot be redacted later.
"""
```

The handler:
- `GET /webhooks/upay/{public_ref}` with `request: Request`, `session` — **not**
  `TenantSessionDep`. There is no authenticated caller and therefore no resolved studio;
  `TenantSession` fails closed and would 401 every real payment. Open the tenant scope from
  the **order's own `studio_id`** once the order is found, using `use_studio(...)`. Before
  that, the lookup by `public_ref` is a deliberate cross-tenant read — `public_ref` is
  globally unique (`uq_payment_order_public_ref`) and unguessable, which is what makes it
  safe. Use `.with_all_tenants(reason="§5.10 — the IPN endpoint is unauthenticated and
  resolves its tenant from the order's own public_ref")`.
- Source IP from `X-Forwarded-For`'s first hop, falling back to `request.client.host`.
- Always `return Response(status_code=200)` — including on every exception. Wrap the whole
  body so a bug in settlement cannot turn into a retry storm.
- `str(request.url.query)` is the raw query string to persist.

- [ ] **Step 5: Run and confirm green**

Run: `.venv/bin/pytest tests/upay -q` → all pass.

Then confirm §19.5's simulator now delivers for real, which it has been reporting
`delivered: false` for since M0.4:

```bash
.venv/bin/pytest tests/dev/test_ipn_simulator.py -q
```

If that file asserts `delivered is False`, **it is now wrong** and this task fixes it: the
route is mounted, so `simulate_ipn` finds it in `request.app.openapi()["paths"]` and
delivers. `app/routers/dev.py` itself needs no change — its docstring says "When M6 lands,
this starts delivering with no change here" — but its **test** encodes the old world.
Updating a `core`-lane test that this lane's work makes false is the same move Task 1 made
for the seam tests; say so in the commit message.

- [ ] **Step 6: Lane check, tick `M6.6`, commit**

```bash
./scripts/lane-check.sh billing
git commit -m "feat(billing): the uPay IPN endpoint — persist, 200, then settle

§12: no signature exists on this callback. Four checks stand in for one — a
UUIDv4 reference, an independent server-side amount comparison against the
order's own row, idempotence on transactionid, and a source-IP signal that is
recorded and never gates.

amount_mismatch records a payment for the money actually received, allocates it
to nothing and settles no charge. A callback with no reference is the recurring
path, not a forgery — answering forged_ref for those would raise a fraud alert on
every הוראת קבע payment in the club.

§19.5's simulator now delivers; its test asserted the pre-M6 world and is updated.
"
```
### Task 7: הוראת קבע reconciliation — fingerprints, suggestions, human confirmation

§5.10's *"הוראת קבע reconciliation"*, all five numbered steps. **G8's most important
consequence lives here**: uPay cannot create a per-payer mandate, cannot vary the amount per
payer, and provides no field identifying which customer paid. All three were confirmed with
support and re-confirmed in round two of live testing. So the system never claims to know —
it makes the manager's monthly reconciliation fast and progressively more automatic, and a
human confirms every single match.

> **Month 1 is fully manual. By month 3 most rows are one-tap confirmations.** That is the
> product goal, and it is why `confidence` is advisory and nothing acts on a threshold.

**Files:**
- Modify: `app/services/billing/reconciliation.py`
- Modify: `app/routers/billing.py` (add `/reconciliation/*`, `/recurring-subscriptions`)
- Test: `tests/billing/test_reconciliation.py`

**Interfaces:**
- Consumes: Task 6's `IpnIntake`; Task 4's `PaymentService`;
  `app.schemas.billing.{UpayIpnRecordOut, UpayIpnRecordPage, IpnMatchIn, PayerFingerprintOut,
  PayerFingerprintPage, RecurringSubscriptionOut, RecurringSubscriptionPage}`.
- Produces:
  - `normalize_card_owner_name(raw: str) -> str`
  - `ReconciliationService(session)` with `unmatched`, `suggestions`, `confirm_match`,
    `ignore`, `expected_payers`, `list_subscriptions`, `record_subscription`,
    `cancel_subscription`.
  - Endpoints: `GET /reconciliation/unmatched`, `GET /reconciliation/suggestions`,
    `POST /reconciliation/match`, `GET/POST /recurring-subscriptions`,
    `POST /recurring-subscriptions/{id}/cancel`.

- [ ] **Step 1: Write the failing test**

Create `tests/billing/test_reconciliation.py`.

```python
"""§5.10's הוראת קבע reconciliation. G8 in practice.

uPay's recurring IPNs are structurally identical to one-time ones (`constantpayment=0`,
`numberpayments=1` regardless of a 12-month plan) and carry no customer identifier. That is
a confirmed provider limitation, not a design choice, so this module never guesses — it
suggests, and a human confirms.

**A wrong automatic match marks the wrong payer paid and sends the wrong parent a debt
reminder — an expensive bug in a small community.** Every test here exists to keep that
impossible.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError
from app.services.billing.reconciliation import (
    ReconciliationService,
    normalize_card_owner_name,
)
from tests.billing.conftest import MONTHLY_AGOROT, T0


class TestNormalisation:
    """The fingerprint's other half. `(normalized card owner name, last 4) -> payer`, and
    the normalisation is what makes month 3 mostly one-tap rather than mostly retyping."""

    def test_case_and_surrounding_space_are_removed(self):
        assert normalize_card_owner_name("  ישראל ישראלי ") == normalize_card_owner_name(
            "ישראל ישראלי"
        )

    def test_internal_runs_of_space_collapse(self):
        assert normalize_card_owner_name("ישראל   ישראלי") == normalize_card_owner_name(
            "ישראל ישראלי"
        )

    def test_latin_case_folds(self):
        assert normalize_card_owner_name("YISRAEL COHEN") == normalize_card_owner_name(
            "Yisrael Cohen"
        )

    def test_two_different_people_do_not_collide(self):
        """The failure that matters: a normalisation aggressive enough to merge two real
        names would suggest the wrong payer with high confidence."""
        assert normalize_card_owner_name("ישראל ישראלי") != normalize_card_owner_name(
            "ישראלה ישראלי"
        )


def test_a_recurring_ipn_with_no_reference_lands_unmatched(client, studio, tenant_session):
    """§5.10 step 1. Every הוראת קבע payment arrives this way, and they are legitimate
    payments from real parents. Treating them as forgeries would raise a fraud alert on
    every one of them."""
    from app.models.billing import UpayIpnRecord
    from sqlalchemy import select

    _deliver_shared_link_payment(client, amount="250", transaction_id="TXN-SO-1")
    record = tenant_session.execute(select(UpayIpnRecord)).scalars().one()
    assert record.order_public_ref is None
    assert record.match_status == "unmatched"
    assert record.matched_payment_id is None


def test_confirming_a_match_creates_a_standing_order_payment_allocated_oldest_first(
    tenant_session, studio, a_priced_student, three_open_months, an_unmatched_ipn
):
    """§5.10 step 3, verbatim: 'creates a payment with method = standing_order, allocates
    it to that payer's open charges oldest-first, and writes a payer_fingerprint.'"""
    from app.models.billing import Charge

    payment = ReconciliationService(tenant_session).confirm_match(
        an_unmatched_ipn.id,
        payer_person_id=a_priced_student.payer_person_id,
        confirmed_by_person_id=uuid.uuid4(),
        at=T0,
    )
    assert payment.method == "standing_order"
    assert payment.amount_agorot == MONTHLY_AGOROT
    assert tenant_session.get(Charge, three_open_months[0]).status == "settled"
    assert tenant_session.get(Charge, three_open_months[1]).status == "open"


def test_confirming_a_match_writes_a_fingerprint(
    tenant_session, studio, a_priced_student, three_open_months, an_unmatched_ipn
):
    """§5.10 step 3's third clause, and the whole reason month 3 is faster than month 1."""
    from app.models.billing import PayerFingerprint
    from sqlalchemy import select

    ReconciliationService(tenant_session).confirm_match(
        an_unmatched_ipn.id,
        payer_person_id=a_priced_student.payer_person_id,
        confirmed_by_person_id=uuid.uuid4(),
        at=T0,
    )
    fingerprint = tenant_session.execute(select(PayerFingerprint)).scalars().one()
    assert fingerprint.payer_person_id == a_priced_student.payer_person_id
    assert fingerprint.four_digits == "4242"
    assert fingerprint.confirmed_by_person_id is not None


def test_a_second_confirmation_for_one_payer_raises_confidence_and_does_not_duplicate(
    tenant_session, studio, a_priced_student, three_open_months, two_unmatched_ipns
):
    """`uq_payer_fingerprint_identity` is unique on (studio, four_digits, name). Month 2's
    confirmation is the same card, so it updates `last_seen` and `confidence` rather than
    inserting a second row that would split the evidence in half."""
    from app.models.billing import PayerFingerprint
    from sqlalchemy import func, select

    service = ReconciliationService(tenant_session)
    for record in two_unmatched_ipns:
        service.confirm_match(
            record.id, payer_person_id=a_priced_student.payer_person_id,
            confirmed_by_person_id=uuid.uuid4(), at=T0,
        )
    assert tenant_session.execute(
        select(func.count()).select_from(PayerFingerprint)
    ).scalar_one() == 1
    assert tenant_session.execute(select(PayerFingerprint)).scalars().one().confidence >= 2


def test_next_month_the_same_card_is_offered_as_a_suggestion(
    tenant_session, studio, a_priced_student, three_open_months, two_unmatched_ipns
):
    """§5.10 step 4 -- 'arriving IPNs are pre-matched against fingerprints and presented as
    suggestions with a confidence indicator. The manager confirms with one tap.'"""
    service = ReconciliationService(tenant_session)
    service.confirm_match(
        two_unmatched_ipns[0].id, payer_person_id=a_priced_student.payer_person_id,
        confirmed_by_person_id=uuid.uuid4(), at=T0,
    )
    suggestions = service.suggestions(studio.id)
    assert len(suggestions) == 1
    assert suggestions[0].ipn_id == two_unmatched_ipns[1].id
    assert suggestions[0].payer_person_id == a_priced_student.payer_person_id
    assert suggestions[0].confidence > 0


def test_a_suggestion_is_never_applied_without_a_human(
    tenant_session, studio, a_priced_student, three_open_months, two_unmatched_ipns
):
    """§5.10 step 5, and the most important assertion in this file. Computing a suggestion
    must have NO side effect on the ledger -- not a payment, not an allocation, not a
    changed charge status. The manager's tap is the only thing that moves money."""
    from app.models.billing import Charge, Payment
    from sqlalchemy import select

    service = ReconciliationService(tenant_session)
    service.confirm_match(
        two_unmatched_ipns[0].id, payer_person_id=a_priced_student.payer_person_id,
        confirmed_by_person_id=uuid.uuid4(), at=T0,
    )
    before = len(tenant_session.execute(select(Payment)).scalars().all())
    service.suggestions(studio.id)
    service.suggestions(studio.id)
    assert len(tenant_session.execute(select(Payment)).scalars().all()) == before
    assert tenant_session.get(Charge, three_open_months[1]).status == "open"
    assert two_unmatched_ipns[1].match_status == "unmatched"


def test_confirming_a_match_requires_a_person_who_confirmed_it(
    tenant_session, studio, a_priced_student, an_unmatched_ipn
):
    """`confirmed_by_person_id` is how the row records that a human made the call. A match
    with nobody behind it is an automatic match with extra steps."""
    with pytest.raises(RefusedError):
        ReconciliationService(tenant_session).confirm_match(
            an_unmatched_ipn.id, payer_person_id=a_priced_student.payer_person_id,
            confirmed_by_person_id=None, at=T0,
        )


def test_an_already_matched_ipn_cannot_be_matched_again(
    tenant_session, studio, a_priced_student, three_open_months, an_unmatched_ipn
):
    """Two matches would create two payments for one arrival of money."""
    service = ReconciliationService(tenant_session)
    service.confirm_match(
        an_unmatched_ipn.id, payer_person_id=a_priced_student.payer_person_id,
        confirmed_by_person_id=uuid.uuid4(), at=T0,
    )
    with pytest.raises(ConflictError):
        service.confirm_match(
            an_unmatched_ipn.id, payer_person_id=a_priced_student.payer_person_id,
            confirmed_by_person_id=uuid.uuid4(), at=T0,
        )


def test_ignoring_an_ipn_leaves_it_readable_and_creates_no_payment(
    tenant_session, studio, an_unmatched_ipn
):
    """`ignored` is a manager saying 'this is not ours' -- a test charge, a refund, a
    payment to a different business on the same account. The bytes stay."""
    from app.models.billing import Payment
    from sqlalchemy import select

    ReconciliationService(tenant_session).ignore(an_unmatched_ipn.id)
    assert an_unmatched_ipn.match_status == "ignored"
    assert tenant_session.execute(select(Payment)).scalars().all() == []


def test_the_expected_column_lists_payers_with_an_active_subscription(
    tenant_session, studio, a_priced_student
):
    """§5.10 -- `recurring_subscription` 'drives the "expected to pay this month" column in
    the reconciliation queue and the double-payment warning, and nothing else.'"""
    service = ReconciliationService(tenant_session)
    service.record_subscription(
        studio.id, payer_person_id=a_priced_student.payer_person_id,
        amount_agorot=MONTHLY_AGOROT, start_date=date(2026, 9, 1),
    )
    expected = service.expected_payers(studio.id)
    assert [row.payer_person_id for row in expected] == [a_priced_student.payer_person_id]


def test_a_payer_has_at_most_one_active_subscription(tenant_session, studio, a_priced_student):
    """`uq_recurring_subscription_active_payer` is partial on `status = 'active'`. Two
    would make 'expected this month' ambiguous for the one family it matters for."""
    service = ReconciliationService(tenant_session)
    service.record_subscription(
        studio.id, payer_person_id=a_priced_student.payer_person_id,
        amount_agorot=MONTHLY_AGOROT, start_date=date(2026, 9, 1),
    )
    with pytest.raises(ConflictError):
        service.record_subscription(
            studio.id, payer_person_id=a_priced_student.payer_person_id,
            amount_agorot=MONTHLY_AGOROT, start_date=date(2026, 10, 1),
        )


def test_cancelling_frees_the_payer_for_a_new_subscription(
    tenant_session, studio, a_priced_student
):
    """A family who stops and later restarts. The cancelled row stays as history."""
    service = ReconciliationService(tenant_session)
    first = service.record_subscription(
        studio.id, payer_person_id=a_priced_student.payer_person_id,
        amount_agorot=MONTHLY_AGOROT, start_date=date(2026, 9, 1),
    )
    service.cancel_subscription(first.id, at=T0)
    second = service.record_subscription(
        studio.id, payer_person_id=a_priced_student.payer_person_id,
        amount_agorot=MONTHLY_AGOROT, start_date=date(2027, 1, 1),
    )
    assert second.id != first.id
    assert first.status == "cancelled" and first.cancelled_at is not None
```

Add fixtures `an_unmatched_ipn` (one `UpayIpnRecord`, `order_public_ref=None`,
`card_owner_name="ישראל ישראלי"`, `four_digits="4242"`, `amount="250"`,
`match_status="unmatched"`) and `two_unmatched_ipns` (the same card, two months, two
`transactionid`s), plus a `_deliver_shared_link_payment` helper that GETs the webhook with
`build_ipn_query(shape=IpnShape.SUCCESS, ...)` and `productdescription` blanked — which is
exactly what a shared-link callback looks like.

- [ ] **Step 2: Run, confirm failure, implement**

`normalize_card_owner_name`: strip, collapse internal whitespace runs, `casefold()`.
**Nothing more.** Removing punctuation or transliterating is what merges two real names.

`suggestions(studio_id)`: join `upay_ipn_record` rows with `match_status == "unmatched"`
and a non-null `four_digits` against `payer_fingerprint` on
`(four_digits, normalized name)`. Return a small dataclass carrying `ipn_id`,
`payer_person_id`, `confidence`, and the payer's open-charge total, ordered newest IPN
first. **It writes nothing.**

`confirm_match(...)`: refuse a `None` confirmer (`RefusedError`); refuse an
already-matched record (`ConflictError`); record a `standing_order` payment for
`agorot_from_ipn_amount(record.amount)`; allocate oldest-first; upsert the fingerprint
(`confidence += 1`, `last_seen = at`); set `match_status = "manual"` and
`matched_payment_id`. Audit-log — this is a human moving money.

`record_subscription`: catch the `IntegrityError` from the partial unique index →
`ConflictError`. **There is no `update_subscription` and no `RecurringSubscriptionIn` in
`app/schemas/billing.py`** — `tests/contracts/test_w4_schemas.py` asserts the second, so do
not add one.

- [ ] **Step 3: Add the routes to `app/routers/billing.py`**

All manager-or-owner. `POST /reconciliation/match` takes `IpnMatchIn`, whose
`match_status` is `Literal["manual", "ignored"]` — **there is no `auto` a client can send**,
and that is the schema saying §5.10 step 5 out loud. `confirmed_by_person_id` comes from the
request context, never the body.

- [ ] **Step 4: Run, lane check, tick `M6.7`, commit**

```bash
.venv/bin/pytest tests/billing tests/upay -q && ./scripts/lane-check.sh billing
git commit -m "feat(billing): הוראת קבע reconciliation, fingerprints and suggestions

uPay provides no field identifying which customer paid a shared recurring link —
confirmed with support, re-confirmed in round two of live testing. So the system
never claims to know: it suggests from (normalized card owner name, last 4) and a
human confirms every match.

Computing a suggestion has no side effect on the ledger. A wrong automatic match
marks the wrong payer paid and sends the wrong parent a debt reminder.
"
```

---

### Task 8: The workers — the monthly run, the debt ladder, the stale-order sweep

`app/workers/billing.py`, which `scripts/lane-check.sh` has been listing since the contract
commit for the same reason it lists the routers: *"a job outside every lane's check is a job
nothing type-checks."*

**Files:**
- Create: `app/workers/billing.py`
- Test: `tests/billing/test_worker.py`

**Interfaces:**
- Consumes: Task 2's `BillingRunService`; Task 5's `OrderService.expire_stale`;
  `app.services.comms.NotificationService.enqueue` (W5's seam, still raising);
  `app.core.demo.exclude_demo_studios`; `app.core.clock.now`.
- Produces: `run_billing(session, *, at) -> Tally`, `escalate_debt(session, *, at) -> Tally`,
  `sweep_stale_orders(session, *, at) -> Tally`, and `ESCALATION_DAYS = (3, 7, 14)`.

- [ ] **Step 1: Write the failing test**

Create `tests/billing/test_worker.py`. Follow `app/workers/followups.py` exactly — it is the
same shape, by the same rules, and its `Tally.undeliverable` pattern is the precedent for a
worker whose messages depend on a seam that has not landed.

```python
"""§5.10's jobs. Three of them, and one shared rule: **messages go through W5's seam.**

`NotificationService.enqueue` still raises `NotImplementedError` until lane COMMS lands, so
the refusals are COUNTED and reported, never swallowed. A run that reported "12 reminders
sent" when none were is worse than one that says so -- the debt ladder is the feature a
manager will most want to trust.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.workers.billing import ESCALATION_DAYS, escalate_debt, run_billing, sweep_stale_orders
from tests.billing.conftest import T0


def test_the_escalation_days_are_three_seven_and_fourteen():
    """§5.10 -- 'day 3 a gentle reminder to the payer, day 7 a firmer one, day 14 a final
    notice plus a task on the manager's dashboard.' Exactly these three."""
    assert ESCALATION_DAYS == (3, 7, 14)


def test_a_charge_three_days_overdue_gets_the_first_reminder(app_session, studio, an_overdue_charge):
    tally = escalate_debt(app_session, at=_days_after_due(an_overdue_charge, 3))
    assert tally.reminders == 1
    assert tally.stage == {3: 1}


def test_each_stage_fires_once_and_not_again(app_session, studio, an_overdue_charge):
    """A daily job must not send the day-3 reminder on days 3, 4, 5, 6 and 7. Bounded to
    the exact day, the same way followups.py bounds its 24-hour window."""
    for offset in (3, 4, 5, 6):
        tally = escalate_debt(app_session, at=_days_after_due(an_overdue_charge, offset))
        assert tally.reminders == (1 if offset == 3 else 0), offset


def test_a_settled_charge_is_never_chased(app_session, studio, a_settled_overdue_charge):
    """The bug that costs a club its credibility: a debt reminder to a parent who paid."""
    tally = escalate_debt(app_session, at=_days_after_due(a_settled_overdue_charge, 7))
    assert tally.reminders == 0


def test_a_written_off_charge_is_never_chased(app_session, studio, a_written_off_charge):
    """A written-off debt is a decision a manager made. Chasing it undoes that decision
    once a week forever."""
    tally = escalate_debt(app_session, at=_days_after_due(a_written_off_charge, 14))
    assert tally.reminders == 0


def test_day_fourteen_raises_a_manager_task_as_well_as_a_notice(
    app_session, studio, an_overdue_charge
):
    """§5.10 -- 'day 14 a final notice PLUS a task on the manager's dashboard.' The parent
    message and the manager task are two different facts and both have to happen."""
    tally = escalate_debt(app_session, at=_days_after_due(an_overdue_charge, 14))
    assert tally.stage == {14: 1}
    assert tally.manager_tasks == 1


def test_undeliverable_messages_are_counted_rather_than_swallowed(
    app_session, studio, an_overdue_charge
):
    """W5's seam raises until lane COMMS lands. The job must carry on -- the manager task
    at day 14 is a database row and does not depend on comms -- and must say so."""
    tally = escalate_debt(app_session, at=_days_after_due(an_overdue_charge, 3))
    assert tally.undeliverable == tally.reminders


def test_every_guardian_is_reminded_and_not_only_the_payer(
    app_session, studio, an_overdue_charge_for_a_two_guardian_family
):
    """§5.3 and L8 -- `is_primary` decides bill addressing and הוראת קבע matching, and a
    reminder is neither. `followups.py::_guardians_of` states the same rule."""
    tally = escalate_debt(app_session, at=_days_after_due(an_overdue_charge_for_a_two_guardian_family, 3))
    assert tally.reminders == 2


def test_the_demo_studio_is_excluded_from_every_job(app_session, a_demo_studio_with_debt):
    """§19.7. A demo walkthrough must not send a real parent a real debt reminder, and the
    demo studio is excluded from every cross-studio number by the same helper."""
    tally = escalate_debt(app_session, at=T0)
    assert tally.reminders == 0


def test_an_order_pending_past_twenty_four_hours_is_swept(app_session, studio, a_stale_order):
    """§5.10's 'IPN never arrives' row: 'a nightly job flags orders pending for more than
    24h; the dashboard shows them for manual verification against uPay's own reports.'

    upay-integration.md puts it more strongly: treat 'no IPN ever arrived' as a failure
    signal in its own right, because a failure-shaped payload may not exist at all."""
    tally = sweep_stale_orders(app_session, at=T0 + timedelta(hours=25))
    assert tally.expired == 1


def test_a_fresh_order_is_left_alone(app_session, studio, a_fresh_order):
    """uPay's IPN is 'delayed' [VERIFIED], and the ~5 minutes is approximate. Sweeping
    early would expire an order the parent is mid-way through paying."""
    tally = sweep_stale_orders(app_session, at=T0 + timedelta(hours=2))
    assert tally.expired == 0


def test_the_monthly_run_covers_every_active_studio(app_session, two_studios_with_students):
    """The job's own job: §5.10 runs 'for each active studio'. A run that stopped at the
    first would silently bill one club and not the other."""
    tally = run_billing(app_session, at=T0)
    assert tally.studios == 2
    assert tally.charges_created == 2
```

- [ ] **Step 2: Run, confirm failure, write `app/workers/billing.py`**

Module docstring naming §5.10, the `NotificationService` rule and §19.7's exclusion, exactly
as `followups.py` does. Then:

- `run_billing(session, *, at)` — iterate active studios via `exclude_demo_studios`, and for
  each, `with use_studio(studio.id): BillingRunService(session).run(...)`. Derive the period
  from `at`. **Confirm the helper's real name and shape first:**
  `grep -n "def exclude_demo_studios" -A 12 app/core/demo.py`.
- `escalate_debt(session, *, at)` — for each `ESCALATION_DAYS` offset, select open charges
  with `due_date == at.date() - timedelta(days=offset)` and `status == "open"`. **Bounded to
  the exact day**, which is what makes the job idempotent across a daily schedule without
  storing per-charge state. Notify every guardian of the charge's student, through
  `_notify()` returning a bool exactly as `followups.py` does. At day 14 also create the
  manager task.
- `sweep_stale_orders(session, *, at)` — `OrderService(session).expire_stale(studio_id, at=at)`
  per studio, tallying.
- Every count is a **count**. No money in a tally.

> **The manager task at day 14.** §5.10 says "a task on the manager's dashboard", and
> `6c מרכז התראות` is M3's container with M6 filling a slot (the contract commit's slot
> list: *"`alert-centre` reconciliation cards (M6)"*). Find the existing mechanism before
> inventing one: `grep -rn "alert-centre\|alertCentre" web/ --include=*.ts --include=*.tsx
> | grep -v node_modules` and `grep -rn "task\|alert" app/models/*.py | grep -i "class "`.
> If no backend table exists for a manager task, the day-14 task **is** the `charge` row
> being 14+ days overdue, and `3e`'s screen queries for it — say so in the docstring and do
> not invent a table this lane has no migration for.

- [ ] **Step 3: Run, lane check, tick `M6.8`, commit**

```bash
.venv/bin/pytest tests/billing -q && ./scripts/lane-check.sh billing
git commit -m "feat(billing): the monthly run job, the debt ladder and the stale-order sweep

Day 3, 7 and 14, each bounded to the exact day so a daily schedule sends each
reminder once. A settled or written-off charge is never chased. Every guardian is
reminded, not only the payer — is_primary decides bill addressing, and a reminder
is not that.

Messages go through W5's seam, which still raises; the refusals are counted and
reported rather than swallowed. §19.7 excludes the demo studio from all three.
"
```
---

## Frontend

Four tasks for seven artboards, four slot fills and the i18n mirrors. Every one of them
follows rules already settled elsewhere in this repo, and re-deriving any of them is a
finding waiting to happen:

- **Never inline a string.** Every visible string is `t(locale, 'billing.<key>')`. The
  namespace is fully authored; a screen that needs a key the namespace lacks **adds it to
  `he/`, `en/` and `ru/` in the same commit**, or `node web/scripts/i18n-parity.mjs billing`
  fails the lane check.
- **Never edit `web/packages/i18n/index.ts` or `types.ts`.** Authored once, never by a lane.
- **Every money figure renders through `MoneyDisplay`** with `agorot` and a semantic
  `tone` — never a hand-built `₪` string (G2), and never a `direction: ltr` wrapper or a
  mirroring transform. Digits are strong-LTR and resolve on their own; **the danger is the
  fix, not the bug**, and a wrapper flips `1,280₪` to `₪1,280`.
- **D10's logical-property rule.** No `margin-left`, no `left`, no `padding-right` — the
  eslint rule catches JS object properties and the `stylelint` gate catches `.css` files,
  and the lane check runs both.
- **Compose the existing primitives.** `Card`, `Button`, `SegmentedControl`, `MoneyDisplay`,
  `Alert`, `EmptyState`, `StatusChip`, `Checkbox`, `TextField`, `BeltBar`. Adding a
  primitive is **not a lane's to do** — see the note in Task 9 step 1.
- **Loading, error and empty states are required even where the artboard omits them.** Every
  one of the seven specs lists them as not drawn, and every one names the empty-state key
  that already exists.

### Task 9: The parent's money — `1b`, `12f`, `12e` and the uPay return page

**Files:**
- Create: `web/apps/parent/src/features/billing/` — `billingClient.ts`, `PaymentsScreen.tsx`
  (`1b`), `PaymentHistoryScreen.tsx` (`12f`), `OrderItemsScreen.tsx` (`12e`),
  `PaymentCompleteScreen.tsx`, `PaymentStrip.tsx` (the `student-card` slot), `register.ts`,
  `index.ts`, and one `.test.tsx` per screen.
- Modify: `web/packages/i18n/{he,en,ru}/billing.ts` (new keys only)

- [ ] **Step 1: Settle the two primitive gaps before writing a component**

Both `1b` and `12f` name gaps that are **not this lane's to fill**:
- an **icon-only button variant** (`12f`'s receipt icon; `9b` and `9c` want the same one),
- a **link/action row** with a chevron (`1b`'s standing-order row).

`w4-lanes.md`'s five handed-forward decisions make the rule explicit for `TextField`
multiline: *"Primitives are not a lane's to add, so deferring does not mean 'a lane will do
it' — it means each lane builds a local one and the two diverge on label wiring,
`aria-describedby` and the error state."*

So: **build both locally in `features/billing/`, name them in the commit message as owed
back to `packages/ui`, and do not export them from this feature's barrel.** A local
component nobody else can import is a thing to migrate later; one exported from a feature
barrel is a second design system.

Check first whether `main` has landed the `TextField` multiline prop while this lane ran —
`grep -n "multiline" web/packages/ui/src/primitives/TextField.tsx`. `12e`'s note field and
`3e`'s payment-note field both want it. If it is there, use it; if not, a local
`<textarea>` in this feature, flagged the same way.

- [ ] **Step 2: Write the failing test for `1b`**

Create `web/apps/parent/src/features/billing/PaymentsScreen.test.tsx`. The cases that carry
a rule rather than a render:

```tsx
// Parent artboard 1b — תשלומים · the pay screen. D-M6-1 makes this the tab; 12f is history.
//
// §5.10: **all three payment routes are always visible.** Nothing here hides one, and the
// standing-order warning is a WARNING, never a block — the parent decides.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PaymentsScreen } from './PaymentsScreen'

describe('1b — the pay screen', () => {
  it('shows all three routes even when a standing order is already active', async () => {
    // §5.10's second double-payment guard is a warning, not a block: 'A warning, not a
    // block — the parent decides.' A screen that hid the card option here would leave a
    // family who set up a mandate and then wanted to clear a one-off with no route at all.
    render(<PaymentsScreen {...propsWith({ hasActiveSubscription: true })} />)
    expect(screen.getByTestId('route-card')).toBeInTheDocument()
    expect(screen.getByTestId('route-standing-order')).toBeInTheDocument()
    expect(screen.getByTestId('route-cash')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('ודא שאינך משלם פעמיים')
    expect(screen.getByTestId('pay-button')).toBeEnabled()
  })

  it('says the selection is oldest-first across every child', () => {
    // `billing.card.oldestFirst` exists and 1b's finding 5 records that the artboard never
    // says it. The rule IS the product behaviour: choosing 3 months selects the 3 oldest
    // unpaid tuition charges across every student this person pays for.
    render(<PaymentsScreen {...propsWith({})} />)
    expect(screen.getByTestId('route-card')).toHaveTextContent(
      'נבחרים החיובים הוותיקים ביותר',
    )
  })

  it('excludes a charge already covered by an open order and says why', () => {
    // §5.10's PRIMARY double-payment guard. `billing.card.coveredElsewhere` exists for it.
    render(<PaymentsScreen {...propsWith({ debts: [openDebt, coveredDebt] })} />)
    const rows = screen.getAllByTestId('debt-row')
    expect(rows).toHaveLength(2)
    expect(within(rows[1]).getByText('החיוב כלול בתשלום שכבר נפתח')).toBeInTheDocument()
    expect(screen.getByTestId('months-control')).toHaveAttribute('data-max', '1')
  })

  it('renders the empty state when nothing is owed', () => {
    // 1b's finding 3: not drawn, and it is the GOAL state. A family in good standing sees
    // this every month.
    render(<PaymentsScreen {...propsWith({ debts: [] })} />)
    expect(screen.getByText('אין חובות פתוחים')).toBeInTheDocument()
    expect(screen.queryByTestId('pay-button')).not.toBeInTheDocument()
  })

  it('disables the pay button while the order is being created', () => {
    // 1b's finding 2: no in-flight state is drawn, and this button opens a payment page.
    // A double submit creates two orders over overlapping charges.
  })

  it('renders every amount through MoneyDisplay and never a built ₪ string', () => {
    const { container } = render(<PaymentsScreen {...propsWith({})} />)
    expect(container.querySelectorAll('.studio-money').length).toBeGreaterThan(0)
    expect(container.textContent).not.toMatch(/₪\d/)  // ₪ before digits is the mirrored bug
  })
})
```

- [ ] **Step 3: Build `1b`, then `12f`, then `12e`, each red-first**

`1b` — regions from the spec: an itemised open-debt list card (belt-coloured accent bars
**through `BeltBar`, which rings unconditionally**, per D7 — the bars on this screen *are*
belt fills), a total row, then the three route cards. Two `SegmentedControl` instances
(months, instalments). `Alert tone="danger"` with `iconLabel` for the standing-order
warning. **The instalment split line needs a new key and two plural shapes** (`1b` finding
6): `card.splitEqual` (`{{count}} תשלומים × {{amount}}`) and `card.splitSingle`
(`תשלום אחד · {{months}} חודשים`).

`12f` — summary card, four `charge.kind` filter chips per **D-M6-3** (`הכל` needs
`filter.all`), history rows, and **D-M6-2**: the email affordance renders on
`method === 'upay_card'` rows only, with `receipt.cardOnly` as the scoping line. No footer
button. The overdue day count needs a plural key (`charge.overdueDays`) — `12f` finding 8.

`12e` — the product catalogue as a picker; selecting items creates `kind='manual'` charges
and opens the card route immediately. `product.noStockHint` is on the screen: *"אין ניהול
מלאי — בחירת פריט יוצרת חיוב בלבד."*

`PaymentCompleteScreen` — §5.10 step 5. Renders `order.verifying` and
`order.verifyingHint` (*"אפשר לסגור את החלון"*), polls `GET /payment-orders/{public_ref}`,
and **marks nothing paid**. It is the one screen whose entire job is to be honest that it
does not know yet.

`PaymentStrip` — the `student-card` slot (`2c` is M3's container). One line: what this child
owes, and a link to `1b`.

- [ ] **Step 4: Register the slot and run the gate**

`register.ts` exports `registerBillingSlots()`, called from the app entry — **never at module
import**, for the reason `features/people/register.ts` states: a registration on import
registers twice under HMR and in any test importing the barrel twice.

```bash
cd web && npx vitest run $(git ls-files 'apps/parent/src/features/billing/*.test.tsx') --reporter=dot
cd .. && ./scripts/lane-check.sh billing
```
The `frontend · billing` gate stops saying *"skipped — no frontend tests for billing"*. That
transition is this task's real deliverable as much as the screens are.

- [ ] **Step 5: Tick `M6.9`, commit**

```bash
git commit -m "feat(billing): the parent's money — 1b, 12f, 12e and the return page

D-M6-1: 1b is the payments tab, 12f is history reached from it. D-M6-2: the
receipt email is a card-row affordance, which is D9.3's structural half and the
half that was never applied. D-M6-3: the history filters are charge.kind, not a
third taxonomy.

All three payment routes stay visible with an active standing order — §5.10 makes
that a warning and not a block. The return page marks nothing paid.
"
```
### Task 10: Staff `11a` — handing an item over in a lesson

The smallest of the seven, and the only M6 screen a **coach** sees — which makes it the one
place invariant 3 is a design constraint rather than a router tag.

**Files:**
- Create: `web/apps/staff/src/features/billing/` — `HandOverSheet.tsx`, `RosterItemAction.tsx`
  (the `roster-row` slot), `billingClient.ts`, `register.ts`, `index.ts`, tests.

- [ ] **Step 1: Read the spec and settle the permission question first**

`docs/design/specs/11a-staff-hand-over.md`. Before writing a line, answer this from §3.2 and
resolve it in the component:

> **A coach may never read a financial field (invariant 3).** `11a` hands a child a גי and
> the app raises a charge for it. Does the coach see the price?

The product answer is that a coach picks the **item**, not the amount — `product.handOut`
and `product.handedOut` (*"הפריט נמסר ונוצר חיוב"*) are the two keys, and neither names a
number. The charge is created server-side from `product.price_agorot`. So:

- the picker lists product **names** and no prices;
- the confirmation says a charge was created, not what it was for in money;
- `GET /products` is manager-scoped, so this screen calls a **coach-safe list endpoint that
  returns `{id, name}` and no `price_agorot`** — add
  `GET /products/handout-options` to `app/routers/billing.py`, tagged `coach`, returning a
  shape with no money field. Invariant 3 inspects routes by that tag, so this is the one
  route in the lane that carries it, and it must survive that inspection.

> **Run invariant 3 immediately after adding the tag** — `.venv/bin/pytest
> tests/invariants/test_03_coach_endpoints_expose_no_money.py -q`. It is designed to fail
> exactly here, and a green is the assertion that the shape carries no money field.

- [ ] **Step 2: Write the failing test**

```tsx
// Staff artboard 11a — מסירת פריטים בשיעור.
//
// **Invariant 3 is the design here, not a router tag.** A coach picks the ITEM; the server
// prices it. This file's first two tests are that rule, and they are the reason the screen
// calls a coach-scoped options endpoint rather than the manager's /products.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HandOverSheet } from './HandOverSheet'

describe('11a — handing an item over', () => {
  it('shows no price anywhere', () => {
    const { container } = render(<HandOverSheet {...props} />)
    expect(container.textContent).not.toMatch(/₪/)
    expect(container.querySelector('.studio-money')).toBeNull()
  })

  it('confirms that a charge was created without naming an amount', async () => {
    render(<HandOverSheet {...props} />)
    await userEvent.click(screen.getByRole('button', { name: 'גי מידה 140' }))
    await userEvent.click(screen.getByTestId('hand-over-confirm'))
    expect(await screen.findByText('הפריט נמסר ונוצר חיוב')).toBeInTheDocument()
  })

  it('says there is no inventory', () => {
    // §5.10 and §4.3 both: 'No stock counts, no inventory — that is a different product.'
    // On the screen, because a coach handing out the last גי will otherwise expect the app
    // to know it was the last one.
    render(<HandOverSheet {...props} />)
    expect(screen.getByText('אין ניהול מלאי — בחירת פריט יוצרת חיוב בלבד')).toBeInTheDocument()
  })

  it('renders the empty state when the club sells nothing', () => {
    render(<HandOverSheet {...props} products={[]} />)
    expect(screen.getByText('לא הוגדרו פריטים')).toBeInTheDocument()
  })

  it('disables confirm while the charge is in flight', async () => {
    // A double tap in a noisy dojo raises two charges for one גי, and the parent disputes
    // the second one a month later.
  })
})
```

- [ ] **Step 3: Build it, register the `roster-row` slot, run the gate**

The `roster-row` slot is M5's container. Find the exact slot key and props before
registering: `grep -rn "roster-row" web/ --include=*.ts --include=*.tsx | grep -v node_modules`.
Register at module-call time from the app entry, never on import.

```bash
cd web && npx vitest run $(git ls-files 'apps/staff/src/features/billing/*.test.tsx') --reporter=dot
cd .. && .venv/bin/pytest tests/invariants -q && ./scripts/lane-check.sh billing
```

- [ ] **Step 4: Tick `M6.10`, commit**

```bash
git commit -m "feat(billing): 11a — a coach hands an item over, and never sees a price

Invariant 3 as a design constraint rather than a router tag: the coach picks the
item, the server prices it from product.price_agorot, and the confirmation says a
charge was created without naming an amount. The one coach-tagged route in this
lane returns {id, name} and no money field.
"
```

---

### Task 11: Dashboard `3e` — collections, and the reconciliation queue that has no artboard

The largest frontend task, and the one carrying the most rules the canvas gets wrong.

**Files:**
- Create: `web/apps/dashboard/src/features/billing/` — `CollectionsScreen.tsx` (`3e`),
  `RecordPaymentDialog.tsx`, `ReconciliationQueue.tsx`, `DebtAlert.tsx` (the `alert-centre`
  slot), `RunChargesButton.tsx`, `billingClient.ts`, `register.ts`, `index.ts`, tests.

- [ ] **Step 1: Write the failing test for the three findings with teeth**

```tsx
// Dashboard artboard 3e — תשלומים וגבייה · debt by household.
//
// **"Household" is the payer person** (D-M6-10). L9 and §4.3: there is no household entity,
// and 'my children' is `SELECT student_id FROM guardian WHERE person_id = me`. The row unit
// is one payer; `חניכים` is a flat summary column inside it, never a row key.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CollectionsScreen } from './CollectionsScreen'

describe('3e — collections', () => {
  it('records a cash payment through allocation and reports what it settled', async () => {
    // ▲ 3e finding 1, the sharpest one on the artboard. The label is right — it records a
    // PAYMENT — but a one-click, one-row, one-aggregate affordance is exactly the shape
    // that invites the shortcut §5.10 forbids. So the control opens a dialogue with a
    // date, an amount and a note, and reports what the allocation settled.
    const recordPayment = vi.fn().mockResolvedValue({ allocated: 2, unallocated_agorot: 3000 })
    render(<CollectionsScreen {...propsWith({ recordPayment })} />)
    await userEvent.click(within(screen.getAllByTestId('household-row')[0])
      .getByRole('button', { name: /רישום תשלום/ }))
    expect(screen.getByLabelText('תאריך התשלום')).toBeInTheDocument()
    expect(screen.getByLabelText('סכום שהתקבל')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('record-payment-submit'))
    expect(await screen.findByText('התשלום שויך לחיובים הוותיקים ביותר')).toBeInTheDocument()
    expect(screen.getByText('יתרה לא משויכת')).toBeInTheDocument()
  })

  it('puts invariant 5 in words on the charge-generation button', async () => {
    // 3e finding 2. `billing.run.idempotentHint` IS invariant 5 written for the manager,
    // on the single most consequential button on the dashboard — and the artboard does not
    // draw it, nor a confirmation, nor an in-progress state, nor a result.
    render(<CollectionsScreen {...propsWith({})} />)
    await userEvent.click(screen.getByTestId('run-charges'))
    expect(screen.getByText('הרצה חוזרת לאותו חודש לא תיצור חיובים כפולים')).toBeInTheDocument()
  })

  it('reports the result of the run and its in-progress state', async () => {
    render(<CollectionsScreen {...propsWith({})} />)
    await userEvent.click(screen.getByTestId('run-charges'))
    await userEvent.click(screen.getByTestId('run-charges-confirm'))
    expect(screen.getByText('רצה')).toBeInTheDocument()
    expect(await screen.findByText('נוצרו 12 חיובים')).toBeInTheDocument()
  })

  it('shows which rung of the ladder each household is on', () => {
    // 3e finding 4: `billing.debt.escalation.*` models FOUR rungs — day3, day7, day14,
    // none — and the artboard has one undifferentiated reminder button. A manager who
    // cannot see the rung cannot tell a first nudge from a final notice.
    render(<CollectionsScreen {...propsWith({})} />)
    const rows = screen.getAllByTestId('household-row')
    expect(within(rows[0]).getByText('תזכורת ראשונה')).toBeInTheDocument()
    expect(within(rows[1]).getByText('התראה אחרונה')).toBeInTheDocument()
    expect(within(rows[2]).getByText('טרם נשלחה תזכורת')).toBeInTheDocument()
  })

  it('renders the empty state when the club has no debt', () => {
    // 3e finding 7, and the goal state for a well-run club.
    render(<CollectionsScreen {...propsWith({ households: [] })} />)
    expect(screen.getByText('אין חובות פתוחים במועדון')).toBeInTheDocument()
  })

  it('disables the bulk reminder at zero selected', () => {
    render(<CollectionsScreen {...propsWith({})} />)
    expect(screen.getByTestId('bulk-reminder')).toBeDisabled()
  })
})

describe('the reconciliation queue', () => {
  // D-M6-11. Eighteen keys, no artboard anywhere in the canvas. Designed from §5.10's own
  // two-column description.
  it('never applies a suggestion without a human', async () => {
    // §5.10 step 5, and the most important assertion on the screen. A wrong automatic match
    // marks the wrong payer paid and sends the wrong parent a debt reminder.
    const confirmMatch = vi.fn()
    render(<ReconciliationQueue {...queueProps({ confirmMatch })} />)
    expect(screen.getByText('שיוך נרשם רק לאחר אישור אנושי')).toBeInTheDocument()
    expect(confirmMatch).not.toHaveBeenCalled()
    await userEvent.click(screen.getByTestId('confirm-match-0'))
    expect(confirmMatch).toHaveBeenCalledTimes(1)
  })

  it('shows the card owner name and last four, because this is where reconciling happens', () => {
    // §11.7 forbids these in application LOGS. They are data, on a manager-only screen, and
    // matching an unmatched הוראת קבע payment is impossible without them.
    render(<ReconciliationQueue {...queueProps({})} />)
    expect(screen.getByText('ישראל ישראלי')).toBeInTheDocument()
    expect(screen.getByText('4242')).toBeInTheDocument()
  })

  it('shows both the raw amount and our parse of it when they disagree', () => {
    // `UpayIpnRecordOut.amount` is a STRING kept exactly as uPay sent it, beside
    // `amount_agorot`, which is our parse. A manager seeing both is the only way an amount
    // mismatch is legible.
  })

  it('renders the empty state when nothing awaits matching', () => {
    render(<ReconciliationQueue {...queueProps({ unmatched: [] })} />)
    expect(screen.getByText('אין תשלומים הממתינים לשיוך')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Build the screen**

Regions per the spec: `DashNav active="payments"`, a header bar, a four-card KPI row, a
section toolbar, and a table of payer rows. Notes that matter:
- The KPI stat-tile shape is *"the same as `6a`, `4a`, `4c`, `1c`, `9g` — extract once
  across the dashboard."* **Check whether one of those already extracted it**
  (`grep -rln "stat" web/apps/dashboard/src/features --include=*.tsx`) and reuse it. A sixth
  copy is the finding the spec is complaining about.
- `--pending` on the failed-charges KPI **always with a dashed border**; `--border` on the
  standing-orders KPI, which is informational and deliberately uncoloured.
- The **sort control is a gap** — no select/dropdown primitive exists, on its third
  artboard. Build a local one in this feature, flagged in the commit like Task 9's two.
- `Checkbox` needs **checked and indeterminate**; the artboard draws neither.
- New keys this screen needs: `debt.collectedThisMonth`, `debt.collectedShare`
  (D-M6-9), `debt.balance` (`יתרה`), `debt.monthsInDebt`, `debt.sortBy`,
  `debt.sendReminderToCount`, `run.confirm`, `export.forAccountant`, `payment.recordCash`.
  Add each to `he`, `en` and `ru` in this commit.

- [ ] **Step 3: Register the `alert-centre` slot**

`features/people/register.ts` says outright: *"M6's debt alert belongs above a trial
queue"* — so `order: 10`, and the gaps in M3's numbering exist so this lane does not
renumber anything. The alert card carries the open-debt count and the amount-mismatch count;
an `amount_mismatch` order is §5.10's *"high-priority manager alert"* and this is where it
surfaces.

> `w4-lanes.md` decision 2: **`AlertTone` has no green that is not `paid`**, and the
> reconciliation queue is the first screen needing a success tone that is not about money
> having been received. **Do not add a colour to the token layer.** Use an existing tone and
> raise **D13** in `docs/design/decisions.md` — a colour added without a decision record is
> how a palette stops meaning anything.

- [ ] **Step 4: Run the gate and commit**

```bash
cd web && npx vitest run $(git ls-files 'apps/dashboard/src/features/billing/*.test.tsx') --reporter=dot
cd .. && ./scripts/lane-check.sh billing
```

```bash
git commit -m "feat(billing): 3e collections, and the reconciliation queue from the spec

The cash affordance opens a dialogue and allocates oldest-first — a one-click
one-aggregate control is the shape that invites the shortcut §5.10 forbids. The
charge-generation button carries run.idempotentHint, which is invariant 5 written
for the manager about to press it.

The reconciliation queue has eighteen keys and no artboard anywhere in the canvas,
so it is built from §5.10's two-column description. A suggestion is never applied
without a human.

Household is the payer person (L9): there is no household entity.
"
```
### Task 12: Dashboard `5a` prices, the `5e` wizard slot, and the dev bar's `runJob`

**Files:**
- Create: `web/apps/dashboard/src/features/billing/` — `PricePlansScreen.tsx` (`5a`),
  `WizardPricesStep.tsx` (the `5e` slot fill), `RunJobTool.tsx` (the `dev-bar` slot), tests.
- Modify: `web/apps/dashboard/src/features/billing/register.ts`

- [ ] **Step 1: Write the failing test for `5a`**

The rule with teeth: §5.10's *"Plans are versioned by `active_from`/`active_to` so a price
change never rewrites history"*, and `billing.plan.versionedHint` already says it in Hebrew.

```tsx
// Dashboard artboard 5a — מחירים ומסלולים.
//
// **A plan is never edited in place.** §5.10 and §5.15: a price change CLOSES the current
// plan and opens a new one, because a charge raised last year must still be explicable by
// the plan that was in force when it was raised. `billing.plan.versionedHint` is that rule
// in Hebrew and it belongs on the screen, not in a comment.
describe('5a — prices and plans', () => {
  it('offers to close and replace a plan, never to edit its amount', async () => {
    render(<PricePlansScreen {...props} />)
    await userEvent.click(screen.getByTestId('plan-row-0'))
    expect(screen.getByText('שינוי מחיר סוגר את המסלול הקיים ופותח חדש. חיובים קודמים נשמרים'))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'סגירת המסלול הנוכחי' })).toBeInTheDocument()
    expect(screen.queryByLabelText('מחיר חודשי')).toBeDisabled()
  })

  it('prices by training volume and never by group', () => {
    // C11. A plan carries sessions_per_week and no group. A group picker on this screen is
    // exactly the defect C11 removed: a child in two groups billed twice, at two prices.
    render(<PricePlansScreen {...props} />)
    expect(screen.getByText('פעמיים בשבוע')).toBeInTheDocument()
    expect(screen.queryByLabelText(/קבוצה/)).not.toBeInTheDocument()
  })

  it('shows a closed plan as history rather than hiding it', () => {
    render(<PricePlansScreen {...propsWith({ plans: [current, closed] })} />)
    expect(screen.getAllByTestId('plan-row')).toHaveLength(2)
  })

  it('renders the empty state before any plan exists', () => {
    render(<PricePlansScreen {...propsWith({ plans: [] })} />)
    expect(screen.getByText('לא הוגדרו מסלולים')).toBeInTheDocument()
  })

  it('takes amounts in shekels and sends agorot', async () => {
    // G2 at the one boundary where a human types money. A manager types 320; the client
    // sends 32000. Getting this wrong by a factor of a hundred is the single most likely
    // money bug in the product, and it is invisible until a parent is billed ₪3.20.
    const createPlan = vi.fn()
    render(<PricePlansScreen {...propsWith({ createPlan })} />)
    await userEvent.type(screen.getByLabelText('מחיר חודשי'), '320')
    await userEvent.click(screen.getByTestId('plan-save'))
    expect(createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ monthly_amount_agorot: 32000 }),
    )
  })
})
```

> `@studio/core`'s `money.ts` already exists. **Read it before writing a conversion**
> (`sed -n 1,60p web/packages/core/src/money.ts`) — if it has a shekels↔agorot pair, use it;
> if it does not, that is a `core` package addition and therefore **not this lane's**, so
> build the parse locally in this feature and flag it in the commit alongside Task 9's
> primitives.

- [ ] **Step 2: Build `5a`, then the `5e` slot fill**

`5e` is **wizard step 4, a slot fill into M1's container** — `docs/design/specs/
5e-wizard-step4-prices.md`. Read it, and note the rule the plan states twice:
**neither lane opens `SetupWizard.tsx`.** Find the slot key and props the way Task 10 finds
`roster-row`: `grep -rn "setup-wizard" web/ --include=*.ts --include=*.tsx | grep -v node_modules`.

The step is the same two lists as `5a` — plans and products — in the wizard's own chrome,
which the container supplies. Do not rebuild the chrome.

- [ ] **Step 3: Fill the `dev-bar` `runJob` slot (D-M6-5)**

`web/packages/ui/src/dev-bar/tools.ts` names `runJob` as M6's pending tool at
`DEV_TOOL_ORDER.runJob = 40`, and `PENDING_TOOLS` erases its own placeholder the moment a
lane registers that key. Register through the **public `registerSlot`** at that exact order,
the way `web/apps/staff/src/features/attendance/devbar.tsx` does — `registerDevTool` is not
on the package's export map, and that file's own slot test asserts the two numbers are equal.

D-M6-5: the tool triggers `POST /billing-runs`, the real manager-scoped endpoint §7
specifies. `POST /dev/jobs/{name}/run` would live in `app/routers/dev.py`, which is the core
lane's file, and §19.5's other three jobs (retention, follow-up sweep, reconciliation
suggestions) belong to the lanes that own them. **Say that in the tool's own comment** so
the next lane extends it rather than re-deriving why it only offers one job.

Test it the way the staff dev bar is tested: the key registers, the order matches
`DEV_TOOL_ORDER`, and the placeholder disappears.

- [ ] **Step 4: Run and commit**

```bash
cd web && npx vitest run $(git ls-files 'apps/dashboard/src/features/billing/*.test.tsx') --reporter=dot
cd .. && ./scripts/lane-check.sh billing
git commit -m "feat(billing): 5a prices, the 5e wizard step and the dev bar's runJob

A price change closes the current plan and opens a new one — never an edit in
place, because a charge raised last year must stay explicable by the plan in force
when it was raised. C11: plans price training volume, and there is no group picker.

runJob fills the slot tools.ts has listed as M6's since M0.4, and triggers
POST /billing-runs rather than a /dev/jobs route in the core lane's file.
"
```

---

### Task 13: Close the lane — i18n parity, the mirrors, and the handover note

**Files:**
- Modify: `web/packages/i18n/{en,ru}/billing.ts`
- Modify: `docs/plan/state.yaml`
- Create: `docs/plan/prompts/w4-money-handover.md`

- [ ] **Step 1: Prove parity is green and complete**

Every task above added keys to `he/billing.ts` and mirrored them as it went, which is what
kept the lane check green. This step is the audit that the mirrors are **translations and
not copies of the Hebrew**:

```bash
node web/scripts/i18n-parity.mjs billing
.venv/bin/python - <<'PY'
import pathlib, re
root = pathlib.Path("web/packages/i18n")
def keys(locale):
    text = (root / locale / "billing.ts").read_text(encoding="utf-8")
    return dict(re.findall(r"^\s*'([^']+)':\s*'(.*)',\s*$", text, re.M))
he, en, ru = keys("he"), keys("en"), keys("ru")
assert he.keys() == en.keys() == ru.keys(), "key sets differ"
untranslated = [k for k in he if en[k] == he[k] or ru[k] == he[k]]
print("identical to Hebrew:", untranslated)
PY
```

A key whose `en` value is still the Hebrew string is a key nobody translated. Fix each one;
D6 ships all three locales.

- [ ] **Step 2: Run the whole suite, not just the lane**

The lane check is scoped by design. Before handing over, run everything — this lane touched
`tests/invariants`, `tests/contracts/test_seams.py` and `tests/dev/test_ipn_simulator.py`,
all of which live outside it:

```bash
.venv/bin/pytest -q
cd web && npm run typecheck && npx vitest run --reporter=dot; cd ..
.venv/bin/mypy app && .venv/bin/ruff check app && .venv/bin/ruff format --check app
```

State the counts in the handover note as measured, never as remembered.

- [ ] **Step 3: Verify the two E2E backend paths by hand**

W4's exit gate is E2E-3 and E2E-4, and `HB-w3-e2e-harness` records that **neither is
reachable at merge time** — there is no Playwright harness, no router, and eleven named
testids that do not exist. That is a carried holdback, not this lane's to close. What this
lane *can* prove is that the backend halves work end to end through the real simulator:

```bash
.venv/bin/uvicorn app.main:app --reload   # in one shell
```

Then, with a developer token, `POST /api/v1/dev/upay/simulate-ipn` in each of the four
shapes against a real order, and confirm: `success` settles, `amount_mismatch` records a
payment and settles nothing, `forged_ref` settles nothing, `duplicate` changes nothing. Each
response should now report `delivered: true` — it has said `false` since M0.4.

Record the four results in the handover note. **If a shape does not behave as stated, that
is a bug in this lane, not a gap in the harness.**

- [ ] **Step 4: Write `docs/plan/prompts/w4-money-handover.md`**

What the merging session needs, and nothing it can measure for itself:
- the four simulator results from step 3;
- the **primitives owed back to `packages/ui`**: the icon-only button variant, the action
  row with a chevron, the sort/select control, and `TextField` multiline if `main` has not
  landed it — each with the feature-local path that currently implements it;
- **D13 is raised and unresolved** (`AlertTone` has no non-`paid` green) — `w4-lanes.md`
  decision 2;
- the merge order: **MONEY first**, then `security-reviewer` on the uPay diff specifically,
  *"the one diff in the project where a review miss costs real money"*, then rebase EVENTS;
- `HB-price-list` is still **open**: the club's real numbers are studio data a manager
  enters, so the lane shipped against the fixture's ₪250/₪100 and the first real run is
  where wrong numbers would surface;
- every decision D-M6-1 … D-M6-11, one line each, so the merging session can re-open one
  rather than rediscover it.

- [ ] **Step 5: Tick the pieces and commit**

```bash
git add web/packages/i18n docs/plan
git commit -m "docs(money): close lane MONEY — parity, the full suite, the handover

Records the four IPN simulator results measured against a running server, the
four primitives owed back to packages/ui, and D13 as raised and unresolved.

E2E-3 and E2E-4 remain blocked by HB-w3-e2e-harness, which is a carried holdback
and not this lane's to close: there is no Playwright harness, no router, and none
of the eleven testids the specs name. The backend halves of both are proven here.
"
```

---

## Self-review

Run against the spec after the plan is saved, before execution starts.

**Spec coverage.** §5.10's every sub-section maps to a task: pricing → 3, 12 · the monthly
run → 1, 2, 8 · how a parent pays → 5, 9 · the uPay one-time flow → 5, 6 · הוראת קבע
reconciliation → 7, 11 · debt escalation → 8, 11 · selling items → 3, 9, 10 · manual
payments and adjustments → 3, 4, 11 · receipts → 9 (D-M6-2). §19.5's simulator → 6, 12, 13.
§19.6 restriction 5 → 5. Invariants 1, 3 and 5 → 1, 3, 10.

**Known gaps, stated rather than hidden:**
- **E2E-3 and E2E-4 are not closed by this plan.** `HB-w3-e2e-harness` blocks both, they
  need a harness nobody has built, and W4's stated exit gate depends on it. Task 13 proves
  the backend halves and says so plainly.
- **`HB-price-list` stays open.** It blocks the club's real numbers, not the code.
- **`/dev/jobs/{name}/run` is not built** (D-M6-5). It belongs to the core lane's file.
- **Four primitives are owed back to `packages/ui`** and ship feature-local, per
  `w4-lanes.md`'s own rule that primitives are not a lane's to add.
- **D13 is raised, not resolved.**

**Type consistency.** `BillingService(session)` throughout; `create_charge` and
`recompute_charge_status` keep W4's frozen signatures in every task; `PaymentService.record`
takes `charge_ids` in tasks 4, 6 and 7 alike; `allocated_agorot` is named identically in
tasks 1, 3, 4 and 7; `period_end` is defined in task 1 and reused in task 2.
