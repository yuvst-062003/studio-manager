"""§5.10's price plans and product catalogue.

**A plan is versioned, never edited in place.** §5.10: "Plans are versioned by
`active_from`/`active_to` so a price change never rewrites history", and §5.15's rollover
reviews prices with old plans **closed, not overwritten**. A charge raised last year must
still be explicable by the plan that was in force when it was raised, and an edit in place
is what makes it inexplicable -- the amount on the row stops matching the amount the family
was actually billed, with nothing recording that it ever changed.

**C11 -- a plan is scoped by training volume and attaches to a student, never to a group.**
There is no `group_id` and no `class_id` on this table. The club prices by how often a child
trains, so a child in two groups who comes twice a week pays the twice-a-week price once.

**The catalogue carries no stock counts.** §4.3 and §5.10 both say it outright: "inventory
is a different product". Selling an item creates an ordinary `charge` with `kind='manual'`,
and a `quantity` column here would be the first step into a product this one is deliberately
not. Deactivation is `is_active`, never a DELETE -- a charge raised for an item the club
stopped selling still has to render its name.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from urllib.parse import urlsplit

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, aliased

from app.core.config import settings
from app.integrations.upay.form import UPAY_ENDPOINT
from app.models.billing import PricePlan, Product
from app.models.people import Student
from app.models.person import Guardian, Person
from app.services.billing.errors import ConflictError, NotFoundError, RefusedError

#: A picker, not a catalogue of a supplier's whole range. A גי runs 100..190 in tens (ten
#: labels) and gloves run S/M/L; twenty is generous and still a list a parent can read on a
#: phone without scrolling past the button.
MAX_SIZES = 20
#: `120`, `S`, `XL`, `1.5 מ׳`. Anything longer is a description that wandered into the
#: wrong field, and it is about to be rendered inside a radio label.
MAX_SIZE_LABEL = 24


def validate_standing_order_link(url: str) -> str:
    """The two rules from the payment-routes spec §4, in one place.

    This URL is shown to parents as the club's official payment page, so a bad value here
    is a phishing page with the club's name on it. Hence: **https only**, and **the host
    must be on `settings.STANDING_ORDER_LINK_HOSTS`**, which defaults to uPay's domains. A
    club whose provider is someone else asks for a configuration change -- deliberately a
    higher bar than a text field, and deliberately not a code change.

    The host match is EXACT rather than a suffix: `upay.co.il.evil.example` ends with the
    right string and is a different site entirely, which is the whole trick.

    An unset allowlist means **our own payment provider**, taken from `UPAY_ENDPOINT` --
    the host we already post payment forms to is by definition the one whose recurring
    links are ours. §19.6 restriction 5 gives that host exactly one home in `app/`, so it
    is read from there rather than copied into a settings default.

    Read from `settings` at call time rather than captured at import, so a test (and a
    deployed environment reloading configuration) sees the value it actually set.
    """
    parts = urlsplit(url.strip())
    if parts.scheme != "https":
        raise RefusedError(
            "a standing-order link must be https -- a plaintext link to a payment form "
            "is a credential leak with the club's name on it"
        )
    host = (parts.hostname or "").lower()
    configured = tuple(h.lower() for h in settings.STANDING_ORDER_LINK_HOSTS)
    allowed = configured or ((urlsplit(UPAY_ENDPOINT).hostname or "").lower(),)
    if host not in allowed:
        raise RefusedError(
            f"{host or 'that host'} is not a configured payment host; "
            "add it to STANDING_ORDER_LINK_HOSTS to allow it"
        )
    return url.strip()


def plan_for_volume(session: Session, *, studio_id: uuid.UUID, volume: int) -> PricePlan | None:
    """The plan a self-service enrolment assigns for a weekly volume, or None.

    **This is the one place the rule lives, and every door with no manager behind it calls
    it** — §5.4b's join link, `+ הוסף ילד`, and a trial family joining from their own app.
    `sessions_per_week` stays what the model says it is, a LABEL the manager sets and the
    billing run does not enforce; what changes is only how a lane with nobody to ask reads
    that label.

    **It used to demand an exact match, and that cost the club money in silence.** The old
    rule took the ONE live plan whose `sessions_per_week == volume`; zero or two matches
    left the student with no plan, no charge, and a line in `billing_run.log` that no
    router, worker or screen reads. A club selling 1× / 2× / open membership has no plan
    labelled 3, so a perfectly ordinary child ticking three groups' worth of training was
    billed nothing for the rest of the year.

    The rule now:

    1. **The cheapest live plan that covers the volume.** `sessions_per_week IS NULL` is
       open membership — the column's documented third state — so it covers everything.
    2. **If nothing covers it, the largest plan the club sells.** A club with no open
       membership and a child training four times a week is charged for the biggest
       package that exists rather than for nothing.
    3. **Ties by amount, then by id**, so a re-run picks the same plan and a family's
       price never depends on row order.

    A child can now be priced ABOVE their exact volume — three sessions on the open plan.
    That is the club selling the smallest package that covers them, it is on the student
    card, and the plan-change flow exists. The alternative was free forever, and the
    asymmetry is the argument: a family billed 550 who expected 400 says so within the
    month, and a family billed nothing says nothing.

    None is still a real answer — a club with no live plans at all — which is why
    `GET /billing/unpriced-students` exists. It just stops being the normal outcome of an
    ordinary timetable.
    """
    if volume <= 0:
        # No training days means no weekly volume, and the cheapest plan in the club would
        # be a price for lessons nobody attends.
        return None
    live = select(PricePlan).where(PricePlan.studio_id == studio_id, PricePlan.active_to.is_(None))
    covering = session.execute(
        live.where(
            or_(PricePlan.sessions_per_week.is_(None), PricePlan.sessions_per_week >= volume)
        ).order_by(PricePlan.monthly_amount_agorot, PricePlan.id)
    ).scalars()
    chosen = next(iter(covering), None)
    if chosen is not None:
        return chosen
    # Nothing covers it. `sessions_per_week` is non-null in every row left -- an open
    # membership would have covered -- so `desc()` needs no NULLS handling.
    biggest = session.execute(
        live.order_by(
            PricePlan.sessions_per_week.desc(), PricePlan.monthly_amount_agorot, PricePlan.id
        )
    ).scalars()
    return next(iter(biggest), None)


@dataclass(frozen=True)
class UnpricedStudent:
    """One row of the collections screen's 'nobody can bill this child' list."""

    student_id: uuid.UUID
    display_name: str
    joined_on: date | None
    payer_person_id: uuid.UUID | None
    payer_display_name: str | None


def unpriced_students(session: Session, *, today: date) -> list[UnpricedStudent]:
    """Active students nobody can bill, for the collections screen.

    **The billing run has recorded these since M6 and nothing has ever read the record.**
    `_charge_one` appends to `tally.unpriced` when no plan matches, the tally lands in
    `billing_run.log`, and no router, worker or screen reads that column. A child whose
    groups total three sessions a week in a club selling 1 / 2 / open membership trained all
    year and was never billed -- visible only in a JSON blob nobody opens.

    `plan_for_volume` makes that the exception rather than the ordinary outcome of a normal
    timetable; this makes the exception visible. Both are needed: a club with no live plans
    at all still produces unpriced children, and the run keeps writing `tally.unpriced` --
    this adds a read that a human reaches.

    **`price_plan_id IS NULL` is not the only way to be unpriced.** §3.5 -- a plan closed by
    rollover leaves the student who did not get repointed still holding a now-stale id, which
    this table alone cannot tell apart from a live one. `today` names the date that decides
    "closed"; the caller reads the clock so this stays a pure query.

    **Active only.** A student who left owes the club nothing new, and a checklist padded
    with them is a checklist nobody works through. Ordered by name so the list is stable
    between reloads.

    The payer is the primary guardian, which is who a charge would name (§4.3). `None` when
    a student has no guardian attached, which is its own reason the run raises nothing --
    and a row saying so is more use than the student silently missing from the list.
    """
    primary = (
        select(Guardian.student_id, Guardian.person_id)
        .where(Guardian.is_primary.is_(True))
        .subquery()
    )
    payer = aliased(Person)
    plan = aliased(PricePlan)
    rows = session.execute(
        select(Student, Person, payer)
        .join(Person, Student.person_id == Person.id)
        .outerjoin(primary, primary.c.student_id == Student.id)
        .outerjoin(payer, payer.id == primary.c.person_id)
        .outerjoin(plan, plan.id == Student.price_plan_id)
        .where(
            Student.status == "active",
            or_(Student.price_plan_id.is_(None), plan.active_to < today),
        )
        .order_by(Person.first_name, Person.last_name, Student.id)
    ).all()
    return [
        UnpricedStudent(
            student_id=student.id,
            display_name=f"{person.first_name} {person.last_name}",
            joined_on=student.joined_on,
            payer_person_id=payer_person.id if payer_person is not None else None,
            payer_display_name=(
                f"{payer_person.first_name} {payer_person.last_name}"
                if payer_person is not None
                else None
            ),
        )
        for student, person, payer_person in rows
    ]


class CatalogueService:
    """Prices and sellable items. Takes the session on the constructor, like every service
    in this lane, and is exactly as tenant-scoped as the session it is handed."""

    def __init__(self, session: Session) -> None:
        self._session = session

    # -- price plans ----------------------------------------------------------
    def list_price_plans(
        self, *, after: uuid.UUID | None = None, limit: int = 50
    ) -> tuple[list[PricePlan], uuid.UUID | None]:
        """Every plan, current first (`5a`, and the wizard's step 4).

        Ordered by `active_from` descending so the live plan is at the top whatever order
        the rows were inserted in, with `id` as the tiebreak -- a keyset cursor names a
        position, and two plans opened on the same day would otherwise page unstably.
        """
        stmt = select(PricePlan)
        if after is not None:
            stmt = stmt.where(PricePlan.id > after)
        rows = list(
            self._session.execute(
                stmt.order_by(PricePlan.active_from.desc(), PricePlan.id).limit(limit + 1)
            ).scalars()
        )
        has_more = len(rows) > limit
        rows = rows[:limit]
        return rows, (rows[-1].id if has_more and rows else None)

    def get_price_plan(self, plan_id: uuid.UUID) -> PricePlan:
        plan = self._session.get(PricePlan, plan_id)
        if plan is None:
            raise NotFoundError(f"no price plan {plan_id}")
        return plan

    def create_price_plan(
        self,
        studio_id: uuid.UUID,
        *,
        name: str,
        sessions_per_week: int | None,
        monthly_amount_agorot: int,
        registration_fee_agorot: int | None,
        active_from: date,
    ) -> PricePlan:
        """A new plan, open-ended. `active_to` is null until it is closed."""
        self._require_money(monthly_amount_agorot, "monthly_amount_agorot")
        if registration_fee_agorot is not None:
            self._require_money(registration_fee_agorot, "registration_fee_agorot")
        # None is open membership, not a missing answer — the column's documented third
        # state. A counted plan still has to count at least one session.
        if sessions_per_week is not None and sessions_per_week <= 0:
            raise RefusedError("a plan covers at least one session a week")
        plan = PricePlan(
            studio_id=studio_id,
            name=name,
            sessions_per_week=sessions_per_week,
            monthly_amount_agorot=monthly_amount_agorot,
            registration_fee_agorot=registration_fee_agorot,
            active_from=active_from,
            active_to=None,
        )
        self._session.add(plan)
        self._session.flush()
        return plan

    def close_price_plan(
        self,
        plan_id: uuid.UUID,
        *,
        closes_on: date,
        replacement_amount_agorot: int,
        replacement_registration_fee_agorot: int | None = None,
        inherit_registration_fee: bool = True,
    ) -> PricePlan:
        """Close a plan and open its successor the next day. **Never an edit in place.**

        `billing.plan.versionedHint` says this in Hebrew on the screen -- "שינוי מחיר סוגר
        את המסלול הקיים ופותח חדש. חיובים קודמים נשמרים" -- and this method is that
        sentence. The old row keeps its amount and gains an `active_to`; the successor
        inherits everything the caller did not change, because a price rise is a price rise
        and losing `sessions_per_week` would silently reclassify what the plan is for.

        Refuses a second close (`ConflictError`): two open successors leave no way to say
        which plan priced a charge.
        """
        plan = self.get_price_plan(plan_id)
        if plan.active_to is not None:
            raise ConflictError(
                f"price plan {plan_id} was already closed on {plan.active_to}; "
                "closing it again would leave two open successors"
            )
        if closes_on < plan.active_from:
            raise RefusedError(
                f"a plan cannot close on {closes_on}, before it opened on {plan.active_from}"
            )
        self._require_money(replacement_amount_agorot, "monthly_amount_agorot")
        fee = (
            plan.registration_fee_agorot
            if inherit_registration_fee and replacement_registration_fee_agorot is None
            else replacement_registration_fee_agorot
        )
        if fee is not None:
            self._require_money(fee, "registration_fee_agorot")

        plan.active_to = closes_on
        successor = PricePlan(
            studio_id=plan.studio_id,
            name=plan.name,
            sessions_per_week=plan.sessions_per_week,
            monthly_amount_agorot=replacement_amount_agorot,
            registration_fee_agorot=fee,
            active_from=closes_on + timedelta(days=1),
            active_to=None,
            # **Never inherited, and written explicitly so nobody adds it to the list
            # above by symmetry.** A uPay shared link charges a FIXED amount: carrying the
            # 300 ₪ link onto a 320 ₪ successor sends every family to sign a mandate at the
            # old price, and the club under-collects all year with no error anywhere. NULL
            # degrades visibly -- the parent's card loses its anchor and the dashboard
            # badges the gap -- which is the failure this feature can survive.
            standing_order_link_url=None,
        )
        self._session.add(successor)
        self._session.flush()
        return successor

    def set_standing_order_link(self, plan_id: uuid.UUID, url: str | None) -> PricePlan:
        """The one in-place edit this table allows. `None` clears the link.

        Refused on a CLOSED plan: its amount is not what anyone is billed any more, so its
        link is dead by definition and editing one is a no-op a manager would read as
        having worked. The dashboard's editor lists active plans only for the same reason.

        The audit entry is written by the caller (`app/routers/billing.py`), which is
        where the actor is known -- the history of this column lives in `audit_log` rather
        than in extra plan rows, and that is what makes the exception to versioning safe.
        """
        plan = self.get_price_plan(plan_id)
        if plan.active_to is not None:
            raise RefusedError(
                f"price plan {plan_id} closed on {plan.active_to}; its standing-order link "
                "charges an amount nobody is billed any more"
            )
        plan.standing_order_link_url = None if url is None else validate_standing_order_link(url)
        self._session.flush()
        return plan

    def links_for_students(self, student_ids: list[uuid.UUID]) -> list[tuple[uuid.UUID, PricePlan]]:
        """(student_id, plan) for each of these students whose ACTIVE plan carries a link.

        Closed plans are excluded, and that is §3.2 seen from the parent's end: a student
        still pointing at last year's plan would otherwise be handed a link that signs a
        mandate at last year's amount.
        """
        if not student_ids:
            return []
        from app.models.people import Student

        rows = self._session.execute(
            select(Student.id, PricePlan)
            .join(PricePlan, Student.price_plan_id == PricePlan.id)
            .where(
                Student.id.in_(student_ids),
                PricePlan.active_to.is_(None),
                PricePlan.standing_order_link_url.is_not(None),
            )
        ).all()
        return [(student_id, plan) for student_id, plan in rows]

    # -- products -------------------------------------------------------------
    @staticmethod
    def normalise_sizes(sizes: Sequence[str] | None) -> list[str]:
        """The one place a size list is cleaned, so the column holds what the parent picks from.

        Trimmed, blanks dropped, de-duplicated, ORDER PRESERVED. Order is the manager's:
        a גי runs 100, 110, 120 and gloves run S, M, L, and sorting either alphabetically
        would put 100 before 90 and L before M. De-duplication is case-sensitive on purpose
        -- `s` and `S` are the same size to a person and folding them is right, but folding
        them would also fold two genuinely different labels in a script that has no case,
        so equality is on the trimmed string and the manager sees their own list back.

        Bounded here rather than by a CHECK: `MAX_SIZES` and `MAX_SIZE_LABEL` are product
        decisions about a picker's usable length, not truths about the data.
        """
        seen: set[str] = set()
        kept: list[str] = []
        for raw in sizes or ():
            label = (raw or "").strip()
            if not label or label in seen:
                continue
            if len(label) > MAX_SIZE_LABEL:
                raise RefusedError(f"a size label is at most {MAX_SIZE_LABEL} characters")
            seen.add(label)
            kept.append(label)
        if len(kept) > MAX_SIZES:
            raise RefusedError(f"an item carries at most {MAX_SIZES} sizes")
        return kept

    def list_products(
        self,
        *,
        include_inactive: bool = False,
        after: uuid.UUID | None = None,
        limit: int = 50,
    ) -> tuple[list[Product], uuid.UUID | None]:
        stmt = select(Product)
        if not include_inactive:
            stmt = stmt.where(Product.is_active.is_(True))
        if after is not None:
            stmt = stmt.where(Product.id > after)
        rows = list(self._session.execute(stmt.order_by(Product.id).limit(limit + 1)).scalars())
        has_more = len(rows) > limit
        rows = rows[:limit]
        return rows, (rows[-1].id if has_more and rows else None)

    def get_product(self, product_id: uuid.UUID) -> Product:
        product = self._session.get(Product, product_id)
        if product is None:
            raise NotFoundError(f"no product {product_id}")
        return product

    def create_product(
        self,
        studio_id: uuid.UUID,
        *,
        name: str,
        price_agorot: int,
        description: str | None,
        sizes: Sequence[str] | None = None,
    ) -> Product:
        """`sizes` defaults to empty, which is the honest answer for an item nobody was
        asked about -- a חגורה has no sizes and neither does a caller that omitted the
        field."""
        self._require_money(price_agorot, "price_agorot")
        product = Product(
            studio_id=studio_id,
            name=name,
            price_agorot=price_agorot,
            description=description,
            sizes=self.normalise_sizes(sizes),
            is_active=True,
        )
        self._session.add(product)
        self._session.flush()
        return product

    def update_product(
        self,
        product_id: uuid.UUID,
        *,
        name: str | None = None,
        price_agorot: int | None = None,
        description: str | None = None,
        is_active: bool | None = None,
        sizes: Sequence[str] | None = None,
    ) -> Product:
        """A partial update. Deactivation goes through `is_active`; there is no delete.

        **An empty `sizes` clears them**, which is why this one is `is not None` like the
        rest rather than truthiness: "this item turned out not to come in sizes after all"
        is an ordinary correction, and a falsy-skip would make it the one edit the screen
        could not save. The router's `exclude_unset` is what separates "sent empty" from
        "not sent".
        """
        product = self.get_product(product_id)
        if price_agorot is not None:
            self._require_money(price_agorot, "price_agorot")
            product.price_agorot = price_agorot
        if name is not None:
            product.name = name
        if description is not None:
            product.description = description
        if is_active is not None:
            product.is_active = is_active
        if sizes is not None:
            product.sizes = self.normalise_sizes(sizes)
        self._session.flush()
        return product

    # -- internals ------------------------------------------------------------
    @staticmethod
    def _require_money(amount_agorot: int, field: str) -> None:
        """G2 and the table's own CHECK constraints, refused with a message a manager can
        read rather than an IntegrityError from three frames down."""
        if not isinstance(amount_agorot, int) or isinstance(amount_agorot, bool):
            raise TypeError(f"{field} must be an integer count of agorot (G2)")
        if amount_agorot < 0:
            raise RefusedError(f"{field} cannot be negative")
