"""Refusals the booking rules raise, so a router can turn them into status codes.

Separate from `app/services/billing/errors.py` on purpose: these are schedule-lane
refusals and a shared module would make one lane's error taxonomy the other's problem.
"""

from __future__ import annotations


class BookingRefusedError(Exception):
    """A mark or a release the rules do not allow.

    **Every refusal names its reason**, and where a higher plan would remove it, the plan
    — because "you cannot mark this" with no explanation is a support call, and the answer
    is usually an upgrade the club would like to sell.
    """

    def __init__(self, message: str, *, upgrade_hint: bool = False) -> None:
        super().__init__(message)
        #: True when a plan with a larger allowance would have allowed this. The parent
        #: screen turns it into the upgrade offer; the reason is the same sentence either
        #: way, so the flag carries no second copy of the text.
        self.upgrade_hint = upgrade_hint


class PlanChangeRefusedError(Exception):
    """A plan change the rules do not allow."""
