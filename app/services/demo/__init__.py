"""SPEC §19 -- the demo studio.

The names and the pinned settings live here rather than in the migration, so the
migration, the seed service, the fixture module and the tests all read one definition.
A slug rather than a hardcoded UUID: `studio.slug` is already unique, which makes
`ON CONFLICT (slug) DO NOTHING` the migration's idempotence for free.
"""

from __future__ import annotations

from typing import Any

#: §19.3's studio.
DEMO_STUDIO_SLUG = "demo"
DEMO_STUDIO_NAME = "מועדון הדגמה"

#: §19.6 -- 'Cannot touch live money.' uPay's form field is a string "1" or "0"
#: (upay-integration.md); it is stored here as an integer and rendered at the boundary,
#: because settings JSONB holding "0" and 0 as different things is a bug waiting to be
#: written. The pin is on the ROW: a code path that forgets to check is_demo still
#: cannot produce a live form for this studio.
DEMO_UPAY_SETTINGS: dict[str, Any] = {"livesystem": 0}

DEMO_STUDIO_SETTINGS: dict[str, Any] = {
    "upay": DEMO_UPAY_SETTINGS,
    # §5.10's two manual-payment strings. Present so the demo studio exercises the
    # payments screen's three options from M6's first day.
    "cash_instructions": "שלמו למאמן בתחילת החודש (נתוני הדגמה)",
    "billing_day": 1,
}
