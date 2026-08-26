"""The lane's fixtures, reused for the uPay boundary tests.

**pytest does not share a conftest between sibling directories**, and `tests/upay/` is a
sibling of `tests/billing/` rather than a child. Both are this lane's -- `scripts/
lane-check.sh billing` runs both, deliberately, because "tests/upay already exists and
already covers app/integrations/upay/callback.py; a test directory over this lane's code
that no lane's check runs is the same silent gap as an unreached source file."

So the fixtures are imported rather than rewritten. A second copy of `a_priced_student`
would be a second definition of what a priced student *is*, and the two would drift the
first time the contract commit's version changed.

Imported explicitly rather than with `import *`: a star-import here would also pull in the
module's constants and dataclasses, and a reader could not tell which names in this file are
fixtures pytest will collect and which are incidental.
"""

from __future__ import annotations

from tests.billing.conftest import (  # noqa: F401 -- re-exported for pytest to collect
    a_demo_order,
    a_demo_studio,
    a_demo_tenant_session,
    a_group,
    a_merchant_email,
    a_price_plan,
    a_priced_student,
    a_two_child_family,
    an_open_charge,
    as_manager,
    studio,
    tenant_session,
    three_open_months,
)
