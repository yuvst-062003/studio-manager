"""An open-membership plan — `sessions_per_week` NULL, the third state the column means.

`price_plan.sessions_per_week` has been nullable since W4 and its own docstring spells
out the club's real ladder: "300 → 0, 400 → 1, 550 → NULL = unlimited". The API never
allowed it. `PricePlanIn` required an int and `PricePlanOut` declared one, so the plan a
club actually sells most — the unlimited one — could not be created, and a row written
directly would have failed serialisation on the way back out.

Reported through the setup wizard (2026-08-29): "a better option is to have base payment
- times a week / 400 - 3 times / 550 fully".
"""

from __future__ import annotations

from datetime import date

PLANS = "/api/v1/price-plans"


def _create(client, caller, **overrides):
    body = {
        "name": "מנוי חופשי",
        "sessions_per_week": None,
        "monthly_amount_agorot": 55000,
        "active_from": date(2026, 9, 1).isoformat(),
    }
    body.update(overrides)
    return client.post(PLANS, json=body, headers=caller.headers)


def test_a_plan_may_have_no_session_limit(client, as_manager) -> None:
    created = _create(client, as_manager)
    assert created.status_code == 201, created.text
    assert created.json()["sessions_per_week"] is None


def test_an_unlimited_plan_survives_the_round_trip(client, as_manager) -> None:
    """The read shape declared a non-null int, so a NULL row would 500 on the way out —
    the failure would have appeared on the list screen, not at the point of creation."""
    _create(client, as_manager, name="מנוי חופשי ב")
    listed = client.get(PLANS, headers=as_manager.headers)
    assert listed.status_code == 200, listed.text
    plans = listed.json()["items"]
    assert any(p["name"] == "מנוי חופשי ב" and p["sessions_per_week"] is None for p in plans)


def test_a_counted_plan_still_refuses_zero_and_absurd_counts(client, as_manager) -> None:
    """Widening to nullable must not turn the bounds off: NULL is "no limit", and 0 or 30
    times a week are still typing mistakes."""
    assert _create(client, as_manager, sessions_per_week=0).status_code == 422
    assert _create(client, as_manager, sessions_per_week=30).status_code == 422
