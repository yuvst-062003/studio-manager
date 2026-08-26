"""SPEC §13 invariant 3: no coach-scoped endpoint returns any financial field.

Vacuous today -- no coach router exists until M1, and no financial field until M6. That
is correct and intended: it must exist now so no lane can land the first violation
unnoticed. The self-tests below are what make a currently-empty gate worth having,
because they prove the detector fires when there *is* something to find.

The convention it keys off is recorded in `.claude/rules/api.md`: a router serving
coaches is tagged `coach`.

**Why the OpenAPI schema and not `app.routes`.** The obvious implementation -- iterate
`app.routes`, keep the `APIRoute`s, read `response_model` -- finds **nothing** in this
FastAPI version: `include_router` mounts an opaque `_IncludedRouter` that exposes no
`.routes`, and `app/main.py` mounts every router that way. The gate would have been
permanently, invisibly empty. The generated schema is also the better thing to assert
against: it is what a coach's client actually receives, and it survives FastAPI changing
its internals again.
"""

from __future__ import annotations

import re
from typing import Any

from app.main import app
from fastapi import APIRouter, FastAPI
from pydantic import BaseModel

COACH_TAG = "coach"
FINANCIAL = re.compile(
    r"(_agorot$|^amount|^price|^balance|charge|payment|invoice|receipt|debt)", re.IGNORECASE
)


def _resolve(schema: dict[str, Any], components: dict[str, Any]) -> dict[str, Any]:
    ref = schema.get("$ref")
    if not ref:
        return schema
    return components.get(ref.rsplit("/", 1)[-1], {})


def _financial_properties(
    schema: dict[str, Any], components: dict[str, Any], seen: set[str] | None = None
) -> list[str]:
    """Walk a response schema, following $refs, and report financial property names.

    Recursive because a nested model is how this leaks in practice: a roster row that
    innocently embeds a student summary carrying a balance.
    """
    seen = set() if seen is None else seen
    ref = schema.get("$ref")
    if ref:
        if ref in seen:
            return []
        seen.add(ref)
    resolved = _resolve(schema, components)
    name = resolved.get("title", "?")

    found = []
    for prop, subschema in (resolved.get("properties") or {}).items():
        if FINANCIAL.search(prop):
            found.append(f"{name}.{prop}")
        branches = [subschema, *(subschema.get("anyOf") or []), *(subschema.get("allOf") or [])]
        items = subschema.get("items")
        if isinstance(items, dict):
            branches.append(items)
        for branch in branches:
            if branch is not subschema or branch.get("$ref"):
                found.extend(_financial_properties(branch, components, seen))
    return found


def leaks(application: FastAPI) -> list[str]:
    schema = application.openapi()
    components = schema.get("components", {}).get("schemas", {})
    found = []
    for path, operations in schema.get("paths", {}).items():
        for method, operation in operations.items():
            if COACH_TAG not in (operation.get("tags") or []):
                continue
            body = (
                operation.get("responses", {})
                .get("200", {})
                .get("content", {})
                .get("application/json", {})
                .get("schema")
            )
            if not body:
                continue
            found.extend(
                f"{method.upper()} {path} -> {field}"
                for field in _financial_properties(body, components)
            )
    return sorted(set(found))


def test_no_coach_scoped_endpoint_returns_a_financial_field():
    assert leaks(app) == []


def test_the_gate_is_no_longer_vacuous():
    """This file used to end with `test_the_gate_is_currently_empty_and_says_so`, which
    asserted that **no** coach-tagged route existed and whose docstring said: "When M1
    lands the first coach router this goes red, and the correct fix is to delete this
    test."

    Both W2 lanes landed one, independently and in the same wave — lane SCHEDULE's
    `app/routers/sessions.py`, §7's coach-facing block, and lane PEOPLE's
    `app/routers/students.py`, whose reads staff `9c` and `9h` make coach-reachable. Which
    of the two arrived first is not a fact this test should depend on, so it names both.
    The tripwire is spent either way, and this replaces it with the opposite assertion
    rather than deleting it outright. The point of both is the same and worth keeping: a
    gate with nothing to check is a gate that passes while verifying nothing, and the day
    the last coach route disappears is a day somebody should notice rather than inherit a
    green tick.
    """
    tagged = [
        path
        for path, operations in app.openapi()["paths"].items()
        for operation in operations.values()
        if COACH_TAG in (operation.get("tags") or [])
    ]
    assert tagged, (
        "no coach-scoped route is tagged any more -- either the tag was dropped from a "
        "router that still serves coaches, in which case invariant 3 is now unguarded, or "
        "the routes are gone and this test should say so deliberately"
    )


def test_the_traversal_finds_the_routes_that_do_exist():
    """Guards the failure this file was rewritten for: a detector that walks the wrong
    structure reports 'no leaks' forever. If the app's own routes are invisible here, so
    is every coach route M1 lands."""
    assert "/api/v1/health" in app.openapi()["paths"]


# -- proven to fire ----------------------------------------------------------
def _probe_app(model: type[BaseModel], *, tags: list[str]) -> FastAPI:
    router = APIRouter(tags=tags)

    @router.get("/roster", response_model=model)
    def roster() -> None: ...  # pragma: no cover -- never called

    probe = FastAPI()
    probe.include_router(router)
    return probe


def test_the_detector_flags_a_coach_route_that_returns_money():
    class RosterRow(BaseModel):
        student_id: str
        balance_agorot: int

    assert leaks(_probe_app(RosterRow, tags=[COACH_TAG])) == [
        "GET /roster -> RosterRow.balance_agorot"
    ]


def test_the_detector_reaches_into_a_nested_model():
    class Summary(BaseModel):
        outstanding_charge_agorot: int

    class RosterRow(BaseModel):
        student_id: str
        summary: Summary

    assert leaks(_probe_app(RosterRow, tags=[COACH_TAG])) == [
        "GET /roster -> Summary.outstanding_charge_agorot"
    ]


def test_the_detector_reaches_through_an_optional():
    class Summary(BaseModel):
        debt_agorot: int

    class RosterRow(BaseModel):
        summary: Summary | None = None

    assert leaks(_probe_app(RosterRow, tags=[COACH_TAG])) == ["GET /roster -> Summary.debt_agorot"]


def test_the_detector_reaches_into_a_list_of_rows():
    class Row(BaseModel):
        amount_agorot: int

    class Page(BaseModel):
        items: list[Row]

    assert leaks(_probe_app(Page, tags=[COACH_TAG])) == ["GET /roster -> Row.amount_agorot"]


def test_a_manager_route_may_return_money():
    """The invariant is about coach scope, not about money. A manager route returning a
    balance is the product working."""

    class Ledger(BaseModel):
        balance_agorot: int

    assert leaks(_probe_app(Ledger, tags=["billing"])) == []


def test_a_coach_route_with_no_financial_field_is_left_alone():
    class RosterRow(BaseModel):
        student_id: str
        health_status: str

    assert leaks(_probe_app(RosterRow, tags=[COACH_TAG])) == []
