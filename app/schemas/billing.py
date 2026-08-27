"""Request and response shapes for the §5.10 ledger.

**Money is `int` everywhere in this module, and every field says `_agorot`** (G2). The
annotation is not decoration: it is the last place the rule is stated before a value
reaches a caller who cannot see the column. `float` would round-trip most prices
correctly and lose an agora on the ones that matter, which is the failure mode that makes
a parent's balance disagree with the receipt they were handed.

**Charges are never mutated to record payment** (§4.3). Nothing here exposes a settable
`status`: `ChargeOut.status` is read-only output of `BillingService.recompute_charge_status`,
and there is deliberately no `ChargeStatusIn`. A shape that let a caller write the status
would make the derived cache writable from nine places by W5.

**§3.2 / invariant 3 — a coach can never read a financial field.** That is enforced at the
permission layer rather than here, because these shapes are correct for a manager and the
question is who may ask. What this module can do is avoid handing a financial field to a
shape that a coach-facing endpoint already returns, and it does: no roster or session
shape imports from here.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas._pagination import CursorPage

#: §4.3 — `charge  kind(tuition|registration|event|manual)`. A `Literal` rather than a
#: pattern because it is **the W4 seam**: `BillingService.create_charge(kind=...)` is what
#: M7 calls for an event fee, and a union type makes a typo a red build in the calling
#: lane rather than a check-constraint violation at runtime in the billing worker.
ChargeKind = Literal["tuition", "registration", "event", "manual"]

#: §4.3 — a **derived cache**, maintained only in `recompute_charge_status`.
ChargeStatus = Literal["open", "settled", "void", "written_off"]

#: §4.3 — `charge  created_by(billing_run|manual|event)`. Provenance, not state: it says
#: which of the three routes created the row, which is what makes a monthly run auditable
#: against the charges it claims to have produced.
ChargeOrigin = Literal["billing_run", "manual", "event"]

#: §4.3 / G8 — only `upay_card` arrives automatically. The other five are recorded by a
#: human, including `standing_order`: our provider cannot create a הוראת קבע mandate
#: programmatically, so its payments are marked in-app exactly like a bank transfer.
#:
#: This tuple and `PAYMENT_METHODS` in `app/models/billing.py` are one list living in two
#: files, and the wire shape is the half that fails LOUDLY when they drift: a method the
#: table accepts and this Literal does not is a 500 on a screen that was working, with
#: nothing wrong in the database. Add to both or to neither.
PaymentMethod = Literal[
    "upay_card", "standing_order", "bank_transfer", "cash", "cheque", "credit_adjustment"
]

#: §5.10 — `amount_mismatch` is a real state, not a failure. A payment **is** recorded for
#: the real amount received and allocated to nothing; collapsing it into `failed` would
#: lose money that actually arrived in the merchant account.
PaymentOrderStatus = Literal["pending", "paid", "failed", "amount_mismatch", "expired"]

BillingRunStatus = Literal["running", "completed", "failed"]
IpnMatchStatus = Literal["auto", "manual", "unmatched", "ignored"]
SubscriptionStatus = Literal["active", "cancelled"]


# -- catalogue ----------------------------------------------------------------
class PricePlanOut(BaseModel):
    """§5.10 step 1 prices from here. `active_to` is null for the current plan, which is
    what lets a mid-year price change leave last month's charges explainable.

    **No `group_id` and no `class_id`** — C11. A plan is scoped by training volume and
    chosen per student (`StudentOut.price_plan_id`); a group has no price."""

    id: uuid.UUID
    name: str
    #: C11 — 'פעמיים בשבוע' is 2, 'כל יום' is 5.
    sessions_per_week: int
    monthly_amount_agorot: int
    registration_fee_agorot: int
    active_from: date
    active_to: date | None


class ProductOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    price_agorot: int
    is_active: bool


# -- charges ------------------------------------------------------------------
class ChargeOut(BaseModel):
    """One line of what a family owes.

    `original_amount_agorot` and `proration_note` travel together and are how a
    mid-month join is explained on the parent's screen rather than looking like an
    arbitrary discount (§5.10).
    """

    id: uuid.UUID
    payer_person_id: uuid.UUID
    #: C11 — no `enrollment_id`. Tuition covers a student for a period, not one of their
    #: group memberships, so a child in two groups has one charge and not two.
    student_id: uuid.UUID | None
    kind: ChargeKind
    period_year: int | None
    period_month: int | None = Field(default=None, ge=1, le=12)
    amount_agorot: int
    original_amount_agorot: int | None
    proration_note: str | None
    due_date: date
    #: Read-only. Derived by `BillingService.recompute_charge_status`, never sent in.
    status: ChargeStatus
    created_by: ChargeOrigin
    #: How much of `amount_agorot` is covered by `payment_allocation` rows. Carried on the
    #: read shape because §4.3 settles a charge by summing allocations, so a client that
    #: rendered `amount_agorot` alone would show a fully-paid charge as outstanding.
    allocated_agorot: int = 0
    #: §5.10 — 'a charge already covered by an open or paid `payment_order` is **not
    #: selectable** in the credit-card option'. The refusal itself was always enforced by
    #: `OrderService`; without this field the read shape could not say *why*, so a parent
    #: whose charge sat in an order opened on another device tapped a visible row and got a
    #: generic error. Computed from the same `HOLDING_STATUSES` predicate the refusal uses,
    #: so the screen and the server cannot disagree about which rows are payable.
    #:
    #: Defaulted rather than optional on purpose: `None` would have to mean "unknown", and a
    #: client cannot render an explanation for a state it does not know it is in.
    is_covered_elsewhere: bool = False


class ManualChargeIn(BaseModel):
    """§5.10's manual charge. `kind` excludes `tuition` and `billing_run` provenance on
    purpose -- a hand-made tuition charge is how a month ends up billed twice."""

    payer_person_id: uuid.UUID
    student_id: uuid.UUID | None = None
    kind: Literal["registration", "event", "manual"]
    amount_agorot: int = Field(gt=0)
    due_date: date
    note: str | None = Field(default=None, max_length=200)


class ChargeAdjustmentIn(BaseModel):
    """A correction, recorded as a new fact. §5.10 makes a credit a negative amount
    rather than an edit to the original charge, so the ledger stays append-only and last
    month's statement does not change after a parent has read it."""

    amount_agorot: int = Field(description="Negative for a credit. Never zero.")
    reason: str = Field(min_length=1, max_length=200)

    @field_validator("amount_agorot")
    @classmethod
    def _never_zero(cls, value: int) -> int:
        """The docstring above said "Never zero" and nothing enforced it.

        Zero is the one value that records nothing while looking like a correction: it
        writes an audit entry saying a manager adjusted a family's balance by no money at
        all, which is indistinguishable from a mis-click and impossible to explain later.
        A caller that means "no adjustment" should not be calling this.
        """
        if value == 0:
            raise ValueError("an adjustment of zero records nothing; omit it instead")
        return value


class BillingRunOut(BaseModel):
    id: uuid.UUID
    period_year: int
    period_month: int = Field(ge=1, le=12)
    started_at: datetime
    finished_at: datetime | None
    #: A count of charges, not an amount. Named without `_agorot` for that reason, and
    #: listed in invariant 1's NOT_MONEY so the naming gate does not read it as money.
    charges_created: int
    status: BillingRunStatus


# -- money that arrived -------------------------------------------------------
class PaymentAllocationOut(BaseModel):
    """The join that settles a charge. Its own amount, because one payment covers several
    months and the split is the fact that has to survive (§5.10's "N months")."""

    id: uuid.UUID
    payment_id: uuid.UUID
    charge_id: uuid.UUID
    amount_agorot: int


class PaymentOut(BaseModel):
    """§11.4 — never deleted. Israeli tax law requires roughly seven years of financial
    records, so a reversal is `reversed_at` plus a reason on the row, not a DELETE."""

    id: uuid.UUID
    payer_person_id: uuid.UUID
    method: PaymentMethod
    amount_agorot: int
    received_at: datetime
    recorded_by_person_id: uuid.UUID | None
    payment_order_id: uuid.UUID | None
    note: str | None
    external_receipt_number: str | None
    reversed_at: datetime | None
    reversal_reason: str | None
    allocations: list[PaymentAllocationOut] = Field(default_factory=list)


class ManualPaymentIn(BaseModel):
    """G8's consequence. הוראת קבע and bank transfers are marked paid by a human in the
    same flow as cash, because our provider cannot create a per-payer recurring mandate
    programmatically -- so this shape is the *normal* route for recurring money, not an
    exception path."""

    payer_person_id: uuid.UUID
    #: `upay_card` is excluded and `cheque` is not: a cheque handed over at the door never
    #: passed through a promise, and §10's point is that it must reach the ledger as a
    #: cheque rather than as a `bank_transfer` nobody can count later.
    method: Literal["standing_order", "bank_transfer", "cash", "cheque", "credit_adjustment"]
    amount_agorot: int
    received_at: datetime
    charge_ids: list[uuid.UUID] = Field(default_factory=list)
    external_receipt_number: str | None = Field(default=None, max_length=60)
    note: str | None = Field(default=None, max_length=500)


class PaymentReversalIn(BaseModel):
    reason: str = Field(min_length=1, max_length=200)


# -- the uPay one-time flow ---------------------------------------------------
class PaymentOrderOut(BaseModel):
    """§5.10. `public_ref` is a UUIDv4 and is the only identifier that reaches uPay -- a
    sequential id here would let anyone mark any family's tuition paid by guessing."""

    id: uuid.UUID
    payer_person_id: uuid.UUID
    public_ref: uuid.UUID
    expected_amount_agorot: int
    #: How many months this order covers. A count, not money.
    max_payments: int
    status: PaymentOrderStatus
    expires_at: datetime
    paid_at: datetime | None
    charge_ids: list[uuid.UUID] = Field(default_factory=list)


class PaymentOrderCreateIn(BaseModel):
    """The parent picks charges; the server prices them. `expected_amount_agorot` is
    absent on purpose -- §5.10 compares the IPN against a server-side sum, and a
    client-supplied expected amount would be the thing it is compared to."""

    charge_ids: list[uuid.UUID] = Field(min_length=1)


class UpayIpnRecordOut(BaseModel):
    """The reconciliation screen's row.

    `amount` is a **string**, and that is the point: it is uPay's inbound rendering kept
    exactly as sent, because the integer alone would lose the evidence of what arrived.
    `amount_agorot` beside it is our parse of the same value, so a manager sees both when
    they disagree -- which is the only way an amount mismatch is legible.

    §11.7 forbids the card owner name and last four digits in application *logs*. They are
    data here, on a manager-only screen, which is where reconciling an unmatched הוראת קבע
    payment actually happens.
    """

    id: uuid.UUID
    received_at: datetime
    transactionid: str
    order_public_ref: uuid.UUID | None
    amount: str
    amount_agorot: int | None
    card_owner_name: str | None
    four_digits: str | None
    payment_date: date | None
    matched_payment_id: uuid.UUID | None
    match_status: IpnMatchStatus
    #: §5.10's weak signal, never a gate. Round two could not establish that uPay's source
    #: address is stable, so it is shown to a human and acted on by nobody.
    source_ip: str | None


class IpnMatchIn(BaseModel):
    """§5.10: "A wrong automatic match marks the wrong payer paid and sends the wrong
    parent a debt reminder. A human always confirms." So this exists and there is no
    endpoint that applies a suggestion without one."""

    payment_id: uuid.UUID | None = None
    match_status: Literal["manual", "ignored"]


class PayerFingerprintOut(BaseModel):
    """A reconciliation *aid*. `confidence` is advisory and nothing acts on a threshold."""

    id: uuid.UUID
    payer_person_id: uuid.UUID
    four_digits: str
    card_owner_name_normalized: str
    confidence: float
    first_seen: datetime
    last_seen: datetime
    confirmed_by_person_id: uuid.UUID | None


class RecurringSubscriptionOut(BaseModel):
    """G8 — a record of a mandate that exists at the provider, not one we can create.
    Nothing in the API creates or varies these; they are entered when a parent sets one up
    at the bank and cancelled when they stop."""

    id: uuid.UUID
    payer_person_id: uuid.UUID
    amount_agorot: int
    start_date: date
    status: SubscriptionStatus
    cancelled_at: datetime | None


class PayerBalanceOut(BaseModel):
    """What a parent sees on `12f` תשלומים (D9.3 — titled תשלומים, not קבלות ותשלומים).

    `balance_agorot` is negative when the family is in credit. §5.10 makes that real via
    credit adjustments, and `MoneyDisplay` wraps the amount in `<bdi>` precisely so a
    negative reads as a credit in a right-to-left sentence rather than as a debt.
    """

    payer_person_id: uuid.UUID
    charged_agorot: int
    paid_agorot: int
    balance_agorot: int
    open_charge_count: int


ChargePage = CursorPage[ChargeOut]
PaymentPage = CursorPage[PaymentOut]
PaymentOrderPage = CursorPage[PaymentOrderOut]
PricePlanPage = CursorPage[PricePlanOut]
ProductPage = CursorPage[ProductOut]
BillingRunPage = CursorPage[BillingRunOut]
UpayIpnRecordPage = CursorPage[UpayIpnRecordOut]
PayerFingerprintPage = CursorPage[PayerFingerprintOut]
RecurringSubscriptionPage = CursorPage[RecurringSubscriptionOut]
