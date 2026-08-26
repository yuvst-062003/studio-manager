"""SPEC §4.3's billing ledger. **The application ledger is the source of truth**; uPay is
one of several ways money arrives (§5.10).

**Every money column is `*_agorot INTEGER`** (G2). This is the wave where invariant 1
stops being vacuous -- until now the detector in `tests/invariants/test_01` had nothing to
find. A `Numeric(10, 2)` would look responsible and still be wrong: money is a count of
agorot, and the moment it becomes a decimal someone divides by a hundred.

**Charges are never mutated to record payment** (§4.3). A charge is settled when its
`payment_allocation` rows sum to `amount_agorot`; `charge.status` is a *derived cache*
maintained only in `BillingService.recompute_charge_status`. That is why allocation is its
own table with its own amount: one payment can settle several charges (§5.10's "N months"
button creates one order across many), and one charge can be settled by several payments.

**G8 -- there is no recurring mandate here, and there cannot be one.** uPay cannot create a
per-payer mandate, cannot vary the amount per payer, and its recurring IPNs carry no
customer identifier (upay-integration.md, [VERIFIED] + [STATED], reconfirmed in round two).
`recurring_subscription` is therefore the *manager's own note* of who is on the shared
link, with no external reference to store, and reconciliation is human-confirmed.

**G15 -- no PII is denormalized into a financial row.** §11.4's anonymization *retains*
charges, payments and allocations while destroying health data, and that only works because
a receipt renders a name by join rather than reading it from the charge.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tenancy import TenantMixin
from app.models.base import Base, TimestampColumns, UUIDPrimaryKey

#: §4.3 -- `charge  kind(tuition|registration|event|manual)`. `event` is what M7 passes to
#: `BillingService.create_charge`; the events lane never writes a billing table directly.
CHARGE_KINDS = ("tuition", "registration", "event", "manual")

#: §4.3 -- `charge  status(open|settled|void|written_off)`. **A derived cache**, maintained
#: only in `recompute_charge_status`. Never set anywhere else.
CHARGE_STATUSES = ("open", "settled", "void", "written_off")

#: §4.3 -- `charge  created_by(billing_run|manual|event)`.
CHARGE_ORIGINS = ("billing_run", "manual", "event")

#: §4.3 -- `payment  method(...)`. `standing_order`, `bank_transfer` and `cash` are all
#: recorded by a human (G8, §5.10); only `upay_card` arrives automatically.
PAYMENT_METHODS = (
    "upay_card",
    "standing_order",
    "bank_transfer",
    "cash",
    "credit_adjustment",
)

#: §4.3 -- `payment_order  status(pending|paid|failed|amount_mismatch|expired)`.
#:
#: `amount_mismatch` is a **real state, not a failure**. §5.10: "A `payment` **is** recorded
#: for the real amount received, allocated to nothing, and a high-priority manager alert is
#: raised. Charges are **not** settled." Collapsing it into `failed` would lose money that
#: actually arrived in the merchant account.
PAYMENT_ORDER_STATUSES = ("pending", "paid", "failed", "amount_mismatch", "expired")

#: §4.3 -- `upay_ipn_record  match_status(auto|manual|unmatched|ignored)`.
IPN_MATCH_STATUSES = ("auto", "manual", "unmatched", "ignored")

#: §4.3 -- `billing_run  status(running|completed|failed)`.
BILLING_RUN_STATUSES = ("running", "completed", "failed")

#: §4.3 -- `recurring_subscription  status(active|cancelled)`.
SUBSCRIPTION_STATUSES = ("active", "cancelled")


class PricePlan(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§5.10 -- 'A `price_plan` is scoped by training volume and attaches to a student,
    never to a group.'

    **C11.** The club prices by how often a child trains -- about 300 for twice a week,
    about 500 for daily -- independent of which groups those sessions belong to. The plan
    the spec used to describe hung off `group_id` (falling back to `class_id`), which
    charged a child in the competition group *and* the teenagers group twice a month at two
    different prices, silently and forever. `sessions_per_week` is what a plan is now for,
    and `student.price_plan_id` is where a student's is chosen.

    `sessions_per_week` is a **label on the plan, not a rule the run enforces**. The
    manager picks the plan; the app shows the volume derived from the child's enrollments
    beside the picker so a mismatch is visible at the moment the price is set (§5.10).

    **Versioned by `active_from`/`active_to`, never edited in place**, so a price change
    never rewrites history. §5.15's rollover reviews prices with old plans **closed, not
    overwritten** -- a charge raised last year must still be explicable by the plan that
    was in force when it was raised.
    """

    __tablename__ = "price_plan"
    __tenant_table_args__ = (
        CheckConstraint("sessions_per_week > 0", name="price_plan_sessions_per_week"),
        CheckConstraint(
            "active_to IS NULL OR active_to >= active_from", name="price_plan_active_range"
        ),
        CheckConstraint("monthly_amount_agorot >= 0", name="price_plan_monthly_non_negative"),
        Index("ix_price_plan_studio_id_active_from", "studio_id", "active_from"),
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    #: C11 -- 'פעמיים בשבוע' is 2, 'כל יום' is 5. What the club actually charges by.
    sessions_per_week: Mapped[int] = mapped_column(Integer, nullable=False)
    monthly_amount_agorot: Mapped[int] = mapped_column(Integer, nullable=False)
    #: §5.10 -- 'Registration fees are charged once, on the first billing run after
    #: enrollment.' Nullable: most plans have none.
    registration_fee_agorot: Mapped[int | None] = mapped_column(Integer)
    active_from: Mapped[date] = mapped_column(Date, nullable=False)
    active_to: Mapped[date | None] = mapped_column(Date)


class Product(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 -- 'a catalog of sellable items (גי, חגורה, כפפות, דמי ביטוח).'

    **No stock counts.** §4.3 and §5.10 both say it outright: "inventory is a different
    product". Selling one creates a normal `charge` with `kind='manual'`. A `quantity`
    column here would be the first step into a product this one is deliberately not.
    """

    __tablename__ = "product"
    __tenant_table_args__ = (
        CheckConstraint("price_agorot >= 0", name="product_price_non_negative"),
        Index("ix_product_studio_id_is_active", "studio_id", "is_active"),
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    price_agorot: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Charge(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3's `charge`. **Never mutated to record payment** -- see the module docstring.

    `payer_person_id` is captured at creation from the student's primary guardian and is
    non-null. §4.3: "If the primary guardian changes later, historical charges stay with
    whoever actually owed them." That is also G15 in action -- the *id* is stored, never
    the name, so §11.4's anonymization can retain the charge and still destroy the person.

    `amount_agorot` is signed. §5.10: "Managers can also add a `manual` charge -- positive
    for an extra item, **negative for a credit or discount** -- with a mandatory reason."
    """

    __tablename__ = "charge"
    __tenant_table_args__ = (
        CheckConstraint(
            "kind IN ('tuition', 'registration', 'event', 'manual')", name="charge_kind"
        ),
        CheckConstraint(
            "status IN ('open', 'settled', 'void', 'written_off')", name="charge_status"
        ),
        CheckConstraint(
            "created_by IN ('billing_run', 'manual', 'event')", name="charge_created_by"
        ),
        CheckConstraint(
            "period_month IS NULL OR period_month BETWEEN 1 AND 12", name="charge_period_month"
        ),
        # §5.10 step 5, and invariant 5's structural half: 're-running for the same period
        # creates no duplicates'. Partial, because only periodic charges have a period --
        # a manual charge may legitimately repeat.
        #
        # **Keyed on student_id, not enrollment_id -- that is C11.** Tuition is priced per
        # student by training volume, so a child in two groups gets ONE charge. Keying this
        # on the enrollment is precisely what would let the second enrollment raise a second
        # charge, which is why the index is the structural half of the rule rather than a
        # nicety beside it.
        Index(
            "uq_charge_student_period_kind",
            "student_id",
            "period_year",
            "period_month",
            "kind",
            unique=True,
            postgresql_where=text("student_id IS NOT NULL AND period_year IS NOT NULL"),
        ),
        # §5.10's debt list and the parent payments screen: everything this person owes.
        Index(
            "ix_charge_studio_id_payer_person_id_status",
            "studio_id",
            "payer_person_id",
            "status",
        ),
        # The debt escalation ladder scans by due date.
        Index("ix_charge_studio_id_due_date", "studio_id", "due_date"),
    )

    #: G15 -- the id, never the name. Non-null: a charge nobody owes is not a charge.
    payer_person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    #: C11 -- the billing run's unit of work. There is deliberately **no `enrollment_id`**:
    #: a tuition charge covers a student for a period, not one of their group memberships,
    #: and a column here would invite the per-enrollment run C11 exists to remove.
    student_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("student.id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(String(15), nullable=False)
    period_year: Mapped[int | None] = mapped_column(Integer)
    period_month: Mapped[int | None] = mapped_column(Integer)
    #: Signed -- see the class docstring. A credit is a negative charge.
    amount_agorot: Mapped[int] = mapped_column(Integer, nullable=False)
    #: §5.10 -- kept so a prorated first month can be explained rather than looking like a
    #: cheaper price.
    original_amount_agorot: Mapped[int | None] = mapped_column(Integer)
    #: 'בגין 3 מתוך 8 שיעורים' -- human-readable, shown to the parent.
    proration_note: Mapped[str | None] = mapped_column(String(200))
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    #: **A derived cache.** Maintained only in `recompute_charge_status`.
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="open")
    created_by: Mapped[str] = mapped_column(String(12), nullable=False)
    created_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )


class BillingRun(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§5.10's monthly run. **Idempotent across repeated executions** -- invariant 5.

    The idempotency is enforced by `Charge`'s unique index rather than by this row, which
    is the right place for it: a run that crashed halfway and is retried must not depend on
    its own bookkeeping being intact to avoid double-charging a family.
    """

    __tablename__ = "billing_run"
    __tenant_table_args__ = (
        CheckConstraint("status IN ('running', 'completed', 'failed')", name="billing_run_status"),
        Index(
            "uq_billing_run_studio_period",
            "studio_id",
            "period_year",
            "period_month",
            unique=True,
        ),
    )

    period_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_month: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: A count, not money. `NOT_MONEY` in invariant 1 lists it for exactly that reason.
    charges_created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="running")
    log: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)


class Payment(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3's `payment` -- money that actually arrived, by any route.

    **Never deleted.** §11.4: hard deletion is impossible because Israeli tax law requires
    ~7 years of financial records. A reversal is a new fact recorded on the row
    (`reversed_at`, `reversal_reason`), not a `DELETE`.

    §11.7 forbids card owner names and last-4 digits in application *logs*; they live on
    `payer_fingerprint` and `upay_ipn_record`, which are data, not logs.
    """

    __tablename__ = "payment"
    __tenant_table_args__ = (
        CheckConstraint(
            "method IN ('upay_card', 'standing_order', 'bank_transfer', 'cash', "
            "'credit_adjustment')",
            name="payment_method",
        ),
        CheckConstraint(
            "reversed_at IS NULL OR reversal_reason IS NOT NULL",
            name="payment_reversal_has_a_reason",
        ),
        Index("ix_payment_studio_id_payer_person_id", "studio_id", "payer_person_id"),
        Index("ix_payment_studio_id_received_at", "studio_id", "received_at"),
    )

    payer_person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    method: Mapped[str] = mapped_column(String(20), nullable=False)
    amount_agorot: Mapped[int] = mapped_column(Integer, nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    recorded_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )
    payment_order_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("payment_order.id", ondelete="SET NULL")
    )
    upay_ipn_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("upay_ipn_record.id", ondelete="SET NULL")
    )
    note: Mapped[str | None] = mapped_column(Text)
    #: §5.10 -- 'An optional free-text `external_receipt_number` field on `payment` lets a
    #: manager keep the ledger reconcilable with their books.' We issue no tax document
    #: for cash, transfer or הוראת קבע; this is where the bookkeeper's number goes.
    external_receipt_number: Mapped[str | None] = mapped_column(String(60))
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reversal_reason: Mapped[str | None] = mapped_column(String(200))


class PaymentAllocation(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§4.3 -- `payment_allocation  payment_id, charge_id, amount_agorot`.

    **This table is what makes "charges are never mutated" possible.** A charge is settled
    when its allocations sum to `amount_agorot`. One payment across several charges is
    §5.10's "choose N months" button; several payments against one charge is a family
    paying in parts.

    §5.10's overpayment case falls out of the same shape: allocations totalling less than
    the payment leave a surplus, which surfaces in the reconciliation queue and can be
    allocated forward to next month's charge.
    """

    __tablename__ = "payment_allocation"
    __tenant_table_args__ = (
        # One allocation row per (payment, charge). Two would be an accounting error that
        # sums correctly and reconciles to nothing.
        Index(
            "uq_payment_allocation_payment_id_charge_id",
            "payment_id",
            "charge_id",
            unique=True,
        ),
        # `recompute_charge_status` sums by charge; this index is that query.
        Index("ix_payment_allocation_charge_id", "charge_id"),
    )

    payment_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("payment.id", ondelete="CASCADE"), nullable=False
    )
    charge_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("charge.id", ondelete="RESTRICT"), nullable=False
    )
    amount_agorot: Mapped[int] = mapped_column(Integer, nullable=False)


class PaymentOrder(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§5.10's uPay one-time flow. **`public_ref` is a UUIDv4, never a sequential id.**

    §5.10's first threat row, verbatim: "Anyone can forge an IPN for a guessed order" ->
    "Sequential ids in this endpoint would let anyone mark any tuition paid." The IPN
    endpoint is unauthenticated by necessity -- uPay calls it -- so the reference *is* the
    credential, and it must be unguessable.

    `expected_amount_agorot` is the **server's** record of what was owed. The uPay form is
    client-submitted and its `amount` field is editable (upay-integration.md, [VERIFIED]
    twice: an edited `amount=2` came back as `amount=2` and `depositamount=2`, unmodified).
    So the IPN's amount is never trusted; it is compared against this column.
    """

    __tablename__ = "payment_order"
    __tenant_table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'paid', 'failed', 'amount_mismatch', 'expired')",
            name="payment_order_status",
        ),
        CheckConstraint("expected_amount_agorot > 0", name="payment_order_amount_positive"),
        # Round two A1: the merchant dashboard's installment dropdown stops at 12, and
        # `MAX_INSTALLMENTS` in upay/form.py clamps to it.
        CheckConstraint("max_payments BETWEEN 1 AND 12", name="payment_order_max_payments"),
        Index("uq_payment_order_public_ref", "public_ref", unique=True),
        # §5.10's "IPN never arrives" row: a nightly job flags orders pending over 24h.
        Index("ix_payment_order_status_created_at", "status", "created_at"),
    )

    payer_person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="RESTRICT"), nullable=False
    )
    #: The unguessable public reference. Sent as `paymentdetails`, returned as
    #: `productdescription` (upay-integration.md round two B3 -- the rename is verified).
    public_ref: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, default=uuid.uuid4
    )
    expected_amount_agorot: Mapped[int] = mapped_column(Integer, nullable=False)
    #: A count of instalments, not money. Listed in invariant 1's `NOT_MONEY`.
    max_payments: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: uPay's `transactionid`. The receipt lives in uPay's dashboard and we link to it
    #: rather than generating one (round two A2: the document says קבלה, not חשבונית מס,
    #: whatever the account config claims -- so we do not infer it).
    external_payment_ref: Mapped[str | None] = mapped_column(String(100))


class PaymentOrderCharge(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """Which charges an order covers. §5.10: choosing N months "selects the N oldest unpaid
    tuition charges **across every student this person is the payer for**, creates **one**
    `payment_order` covering all of them".

    It is also §5.10's primary double-payment guard: "A charge already covered by an open
    or paid `payment_order` is **not selectable** in the credit-card option", which is a
    query against this table.
    """

    __tablename__ = "payment_order_charge"
    __tenant_table_args__ = (
        Index("uq_payment_order_charge", "payment_order_id", "charge_id", unique=True),
        Index("ix_payment_order_charge_charge_id", "charge_id"),
    )

    payment_order_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("payment_order.id", ondelete="CASCADE"), nullable=False
    )
    charge_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("charge.id", ondelete="RESTRICT"), nullable=False
    )


class UpayIpnRecord(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """Every IPN, persisted verbatim, matched or not (§5.10).

    upay-integration.md calls this "the single highest-value piece of infrastructure here":
    retries on a non-200, IPNs for failed payments, and duplicate delivery are all
    **[NOT COVERED]** by any testing anyone has done against this account. Logging the raw
    callback before parsing turns each of those unknowns into something observed in
    production with full data, rather than pre-guessed.

    **Idempotence is keyed on `transactionid`**, which neutralises retries and duplicates
    whatever uPay actually does -- the design deliberately does not depend on knowing.

    `order_public_ref` is nullable because הוראת קבע IPNs arrive from the shared link with
    no reference at all (§5.10) and land here as `unmatched` for a human to reconcile.
    """

    __tablename__ = "upay_ipn_record"
    __tenant_table_args__ = (
        CheckConstraint(
            "match_status IN ('auto', 'manual', 'unmatched', 'ignored')",
            name="upay_ipn_record_match_status",
        ),
        # The idempotency key. A second delivery is logged and ignored (§5.10).
        Index("uq_upay_ipn_record_transactionid", "transactionid", unique=True),
        # The reconciliation queue: unmatched first, newest first.
        Index("ix_upay_ipn_record_studio_id_match_status", "studio_id", "match_status"),
    )

    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: §5.10's weak layer, never a gate. Round two B8 observed 84.95.87.35 on two of three
    #: deliveries and could not establish whether it is stable.
    source_ip: Mapped[str | None] = mapped_column(String(45))
    #: The full query string, before parsing. This is the column the class docstring is
    #: about.
    raw_query: Mapped[str] = mapped_column(Text, nullable=False)
    order_public_ref: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True))
    transactionid: Mapped[str] = mapped_column(String(100), nullable=False)
    #: uPay's inbound rendering, kept as sent. Parsed to agorot by
    #: `app.integrations.upay.ipn.agorot_from_ipn_amount` -- storing the parsed integer
    #: only would lose the evidence of what actually arrived.
    amount: Mapped[str] = mapped_column(String(30), nullable=False)
    card_owner_name: Mapped[str | None] = mapped_column(String(120))
    four_digits: Mapped[str | None] = mapped_column(String(4))
    payment_date: Mapped[date | None] = mapped_column(Date)
    #: §5.10's reconciliation link -- and the deferred side of the `payment` <-> this
    #: table cycle. Both directions are §4.3 columns (`payment.upay_ipn_id?` here,
    #: `matched_payment_id?` there), so the cycle is real and cannot be modelled away.
    #: `use_alter` makes this one constraint arrive by ALTER once both tables exist,
    #: which is also the runtime order: the IPN is persisted verbatim first (§5.10 --
    #: the endpoint returns 200 immediately), the payment is created from it, and the
    #: match is recorded last. Named explicitly, because Alembic cannot drop an
    #: auto-named constraint it added by ALTER.
    matched_payment_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(
            "payment.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_upay_ipn_record_matched_payment_id",
        ),
    )
    match_status: Mapped[str] = mapped_column(String(10), nullable=False, default="unmatched")


class PayerFingerprint(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """§5.10's הוראת קבע reconciliation aid: `(normalized card owner name, last 4) -> payer`.

    **Suggestions are never auto-applied.** §5.10: "A wrong automatic match marks the wrong
    payer paid and sends the wrong parent a debt reminder -- an expensive bug in a small
    community. A human always confirms." `confirmed_by_person_id` is how the row records
    that a person made the call, and it is why `confidence` is advisory rather than a
    threshold anything acts on.
    """

    __tablename__ = "payer_fingerprint"
    __tenant_table_args__ = (
        Index(
            "uq_payer_fingerprint_identity",
            "studio_id",
            "four_digits",
            "card_owner_name_normalized",
            unique=True,
        ),
    )

    payer_person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="CASCADE"), nullable=False
    )
    four_digits: Mapped[str] = mapped_column(String(4), nullable=False)
    card_owner_name_normalized: Mapped[str] = mapped_column(String(120), nullable=False)
    #: Advisory only -- a human confirms every match. Never a gate.
    confidence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    confirmed_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="SET NULL")
    )


class RecurringSubscription(UUIDPrimaryKey, TimestampColumns, TenantMixin, Base):
    """**The manager's record of who is on הוראת קבע. Not a mandate, and not creatable.**

    G8 and §12: uPay cannot create a per-payer recurring mandate, cannot vary the amount
    per payer, and provides no field identifying which customer paid. All three were
    confirmed with uPay support and re-confirmed in round two of live testing.

    So there is deliberately **no external reference, no token and no provider id** on this
    table -- there is nothing to store. The manager necessarily knows who is on the link,
    because they handed it out. This row drives the "expected to pay this month" column in
    the reconciliation queue and §5.10's double-payment warning, and nothing else.

    **The parent never sets this.**
    """

    __tablename__ = "recurring_subscription"
    __tenant_table_args__ = (
        CheckConstraint("status IN ('active', 'cancelled')", name="recurring_subscription_status"),
        # **Not `recurring_subscription_amount_positive`.** NAMING_CONVENTION expands `ck`
        # to `ck_%(table_name)s_%(constraint_name)s`, so repeating the table name in the
        # constraint name -- the habit everywhere else in this schema -- produces
        # `ck_recurring_subscription_recurring_subscription_amount_positive`: 64
        # characters, one over Postgres's 63-character identifier limit. Postgres
        # truncates silently, the model and the database then disagree about the name
        # forever, and `test_the_migrations_match_the_models` is red on a schema that is
        # otherwise correct. That test's own docstring records catching this exact class
        # of bug once before. `recurring_subscription` is simply the first table name long
        # enough to expose it; the generated name here is still conventionally prefixed.
        CheckConstraint("amount_agorot > 0", name="amount_positive"),
        Index(
            "uq_recurring_subscription_active_payer",
            "studio_id",
            "payer_person_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    payer_person_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("person.id", ondelete="CASCADE"), nullable=False
    )
    amount_agorot: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="active")
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
