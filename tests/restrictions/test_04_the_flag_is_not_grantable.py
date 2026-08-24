"""§19.6 restriction 4: 'Cannot grant itself the flag, or grant it to anyone else.'
§19.2: 'is_developer is set only by a database seed or migration. There is no API, no UI
and no admin screen that can grant it. A test asserts no route can write the column.'

FULLY VACUOUS TODAY, both detectors, and deliberately so. `auth_identity` is M1's table:
no schema names is_developer and no code assigns it, so both detectors find nothing.
They exist now so that M1 cannot land the first violation unnoticed -- the same reason
tests/invariants 3 and 5 exist while the things they guard do not.

TRIGGER: M1's contract commit creating auth_identity.is_developer. From that commit on,
the day a request schema exposes the field or a service assigns it, these go red.

The self-tests at the bottom are what make a currently-empty gate worth having.

Deviation from the brief: this file omits ``from __future__ import annotations``
(present in most of this repo's modules, absent already in test_02 and several
tests/config files, so not a universal convention). With it enabled, every annotation
becomes a string, and the two "proven to fire" tests below define their probe
``BaseModel`` subclasses *inside* the test function -- so the route's ``body: GrantRequest``
annotation cannot be resolved from the module's globals when ``app.openapi()`` builds
the schema, and pydantic raises ``PydanticUserError: ... is not fully defined`` instead
of the assertion under test ever running. Reproduced in isolation against this repo's
installed fastapi/pydantic before removing the import; every other name in this file
(``dict[str, Any]``, ``list[str]``, ``tuple[Any, ...]``) is valid at runtime under this
project's Python 3.14, so nothing else in the file depends on the deferred form.
"""

import re
from pathlib import Path
from typing import Any

from app.main import app
from fastapi import APIRouter, FastAPI
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[2]
COLUMN = "is_developer"

#: Where the flag may legally be set. §19.2 names exactly these two.
ALLOWED_WRITERS = ("alembic/versions/", "app/services/demo/")


def writable_properties(application: FastAPI) -> list[str]:
    """Every property a client can SEND, walked through $refs.

    Request bodies, not responses: exposing `is_developer` in a response is a privacy
    question, but §19.2's requirement is that no route can WRITE it.
    """
    schema = application.openapi()
    components: dict[str, Any] = schema.get("components", {}).get("schemas", {})

    def walk(node: dict[str, Any], seen: set[str]) -> list[str]:
        ref = node.get("$ref")
        if ref:
            if ref in seen:
                return []
            seen = seen | {ref}
            node = components.get(ref.rsplit("/", 1)[-1], {})
        found = []
        for prop, sub in (node.get("properties") or {}).items():
            if prop == COLUMN:
                found.append(f"{node.get('title', '?')}.{prop}")
            branches = [*(sub.get("anyOf") or []), *(sub.get("allOf") or [])]
            if isinstance(sub.get("items"), dict):
                branches.append(sub["items"])
            if sub.get("$ref"):
                branches.append(sub)
            for branch in branches:
                found.extend(walk(branch, seen))
        return found

    out = []
    for path, operations in schema.get("paths", {}).items():
        for method, operation in operations.items():
            body = (
                operation.get("requestBody", {})
                .get("content", {})
                .get("application/json", {})
                .get("schema")
            )
            if body:
                out.extend(f"{method.upper()} {path} -> {p}" for p in walk(body, set()))
    return sorted(set(out))


def source_writers(root: Path) -> list[str]:
    """Every assignment to the column outside a seed or a migration.

    Requires whitespace before the ``=`` -- this project's `.venv/bin/ruff format`
    writes assignments as ``x = y`` and keyword arguments as ``x=y`` (no space), and
    that formatting is enforced (DoD: ``ruff format --check``). Without this, the
    pattern also fires on every legitimate ``developer_may_act(is_developer=...)`` /
    ``dev_tools_allowed(is_developer=...)`` call this task itself adds -- a call is a
    read, not a grant, and §19.2 is about grants.
    """
    pattern = re.compile(rf"(\.{COLUMN}\s+=(?!=)|\b{COLUMN}\s+=(?!=))")
    found = []
    for path in sorted(root.rglob("*.py")):
        try:
            rel = str(path.relative_to(ROOT))
        except ValueError:
            # A scan root outside the repo -- pytest's tmp_path in the self-tests below
            # -- has no ROOT-relative form. ALLOWED_WRITERS only ever needs to match
            # ROOT-relative paths, which a real scan of app/ always produces.
            rel = str(path.relative_to(root))
        if rel.startswith(ALLOWED_WRITERS):
            continue
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if pattern.search(line):
                found.append(f"{rel}:{lineno}")
    return found


def test_no_route_can_write_the_flag():
    assert writable_properties(app) == []


def test_no_code_outside_a_seed_or_a_migration_assigns_it():
    assert source_writers(ROOT / "app") == [], (
        f"{COLUMN} is settable only by a database seed or migration (§19.2)"
    )


def test_the_gate_is_currently_empty_and_says_so():
    """Records the vacuity rather than hiding it. When M1 lands auth_identity this goes
    red, and the correct fix is to delete this test -- the two assertions above stop
    being vacuous at that point."""
    import app.models

    assert COLUMN not in {
        column.name
        for table in app.models.base.Base.metadata.tables.values()
        for column in table.columns
    }, (
        f"auth_identity.{COLUMN} now exists -- delete this test; the assertions above "
        "are no longer vacuous"
    )


# -- proven to fire ----------------------------------------------------------
def test_the_schema_detector_flags_a_route_that_accepts_the_flag():
    class GrantRequest(BaseModel):
        person_id: str
        is_developer: bool

    router = APIRouter()

    @router.post("/grant")
    def grant(body: GrantRequest) -> None: ...  # pragma: no cover -- never called

    probe = FastAPI()
    probe.include_router(router)
    assert writable_properties(probe) == ["POST /grant -> GrantRequest.is_developer"]


def test_the_schema_detector_reaches_into_a_nested_model():
    class Identity(BaseModel):
        is_developer: bool

    class Body(BaseModel):
        identity: Identity

    router = APIRouter()

    @router.post("/grant")
    def grant(body: Body) -> None: ...  # pragma: no cover -- never called

    probe = FastAPI()
    probe.include_router(router)
    assert writable_properties(probe) == ["POST /grant -> Identity.is_developer"]


def test_the_source_detector_flags_an_assignment(tmp_path):
    (tmp_path / "probe.py").write_text("identity.is_developer = True\n", encoding="utf-8")
    assert [hit.split(":")[-1] for hit in source_writers(tmp_path)] == ["1"]


def test_the_source_detector_leaves_a_comparison_alone(tmp_path):
    """`==` is a read, and a read is exactly what M1's resolver must do."""
    (tmp_path / "probe.py").write_text(
        "if identity.is_developer == True:\n    pass\n", encoding="utf-8"
    )
    assert source_writers(tmp_path) == []
