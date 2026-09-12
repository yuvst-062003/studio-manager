"""The studio-level billing settings: where they live, and what they mean unset.

`app/routers/billing.py` owns the manager-facing SHAPE (`BillingSettingsOut` /
`BillingSettingsPatch`). This module owns the two things more than one caller needs: the
`studio.settings` key they sit under, and each field's default.

**Split out on 2026-09-12.** The join wizard has to show a cash family the total it is about
to have recorded against them, and that total depends on `cash_prepay_months` -- which until
now was a Pydantic default inside a manager-only router. Writing a second `2` beside it in
`onboarding.py` would have made this a canonical value with two producers, which this repo
has already been bitten by: the two drift, and then the screen promises one total while the
promise records another. That is the 2026-09-12 defect exactly, in a new place.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.schedule import TrainingYear
from app.models.studio import Studio

#: The key `studio.settings` holds this lane's fields under. Namespaced so no other lane
#: writing that column can collide with them.
SETTINGS_KEY = "billing"

#: **Months of cash bought FORWARD, beside whatever is already owed** -- never a total.
#: `OrderService.create` and `PaymentPromiseService.create` both add
#: `prepay_months * monthly` ON TOP of the charges named, so a signup with one month already
#: open and a term of `2` collects three months, which is the club's rule.
#:
#: It was `3` until 2026-09-12, read as "three months altogether". Wired into a signup that
#: way it would have asked a joining family for four months (owner correction).
CASH_PREPAY_MONTHS = 2

#: Twelve post-dated cheques, the ordinary Israeli club arrangement — but as a SETTING this
#: is only the ceiling. See `cheque_months_remaining`: the club writes cheques for the
#: TRAINING YEAR, so a family joining in January writes the months that are left, not twelve
#: (owner, 2026-09-12: "12 for the full year. If the person joins later then the cheques is
#: the num months left").
CHEQUE_PREPAY_MONTHS = 12

#: 1..28, not 1..31. A run day of the 30th never fires in February.
RUN_DAY = 1


def billing_settings(studio: Studio) -> dict[str, Any]:
    """One studio's billing block, or `{}` when it has never been configured."""
    block = dict(studio.settings or {}).get(SETTINGS_KEY, {})
    return block if isinstance(block, dict) else {}


def cash_prepay_months(studio: Studio) -> int:
    """This studio's cash term, falling back to `CASH_PREPAY_MONTHS`.

    Defensive about the stored value's type and sign because `studio.settings` is untyped
    JSONB that predates this lane: a string or a negative left there by an older write must
    read as "not configured" rather than reaching `prepay_months * monthly` and pricing a
    family's signup off a corrupt number.
    """
    value = billing_settings(studio).get("cash_prepay_months", CASH_PREPAY_MONTHS)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return CASH_PREPAY_MONTHS
    return value


def cheque_months_remaining(session: Session, studio_id: uuid.UUID, *, on: date) -> int:
    """How many cheques a family joining on `on` writes: one per month left in the year.

    **Cheques are for the training YEAR, not for a fixed count** (owner, 2026-09-12). A
    family joining in September writes twelve; one joining in January writes the months
    that are left. `CHEQUE_PREPAY_MONTHS` is the ceiling, not the answer.

    Counted in whole months and INCLUSIVE of the joining month, because that month's cheque
    is one of them. The caller that buys months FORWARD wants one fewer -- the joining month
    already has a charge of its own -- which is the same off-by-one cash has; see
    `CASH_PREPAY_MONTHS`.

    No active training year is a studio that has not run the rollover yet. It falls back to
    the full year rather than to zero: a club with cheques configured and no year row should
    ask for the usual twelve, not silently stop asking.
    """
    year = session.execute(
        select(TrainingYear).where(
            TrainingYear.studio_id == studio_id, TrainingYear.status == "active"
        )
    ).scalar_one_or_none()
    if year is None:
        return CHEQUE_PREPAY_MONTHS
    months = (year.ends_on.year - on.year) * 12 + (year.ends_on.month - on.month) + 1
    # Clamped at both ends: a year that has already ended (or a joining date past it) still
    # owes the month being joined, and no arrangement runs past the configured ceiling.
    return max(1, min(months, CHEQUE_PREPAY_MONTHS))
