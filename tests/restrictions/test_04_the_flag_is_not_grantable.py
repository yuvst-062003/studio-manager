"""§19.6 restriction 4: 'Cannot grant itself the flag, or grant it to anyone else.'
§19.2: 'is_developer is set only by a database seed or migration. There is no API, no UI
and no admin screen that can grant it. A test asserts no route can write the column.'

NOT VACUOUS since M1's revision 0005 created `auth_identity.is_developer`. Both detectors
now guard a real column: the schema detector walks every request body FastAPI publishes,
and the source detector scans every .py file outside `alembic/versions/` and
`app/services/demo/` -- §19.2's two legal writers, and nothing else.

The test that recorded the vacuity was deleted when its own failure message said to, and
replaced by its complement: a search that finds nothing because the column was DELETED
looks identical to a search that found no violation, so one test asserts the column is
still there.

The self-tests at the bottom are what made the gate worth having while it was empty, and
they are what keeps it honest now that it is not.

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

import ast
from pathlib import Path
from typing import Any

import pytest
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

    Two independent patterns, ORed together, because one pattern cannot catch every
    grant shape without also catching a read:

    * ``x.is_developer = ...`` / bare ``is_developer = ...``, whitespace before the
      ``=`` required. This project's `.venv/bin/ruff format` writes assignments as
      ``x = y`` and keyword arguments as ``x=y`` (no space), and that formatting is
      enforced (DoD: ``ruff format --check``). Without the whitespace requirement, this
      half of the pattern also fires on every legitimate
      ``developer_may_act(is_developer=...)`` / ``dev_tools_allowed(is_developer=...)``
      call this task itself adds -- a call is a read, not a grant, and §19.2 is about
      grants.
    * ``is_developer=True`` / ``is_developer=1`` with **no** whitespace requirement, so
      it reaches a constructor kwarg (``AuthIdentity(is_developer=True)``) and an ORM
      ``.values(is_developer=True)`` call -- neither is caught by the whitespace form
      above, because ruff format writes both with no space around ``=``, the same as a
      keyword read. What tells a grant from a read here is not spacing but the RHS: a
      literal ``True``/``1`` can only be a grant, while ``is_developer=bool(x)`` or
      ``is_developer=some_var`` -- a read passed through -- is left alone because
      neither literal appears on its right-hand side.

    tests/restrictions/test_04... 's own self-tests pin the six-case table this was
    built against: two grant shapes an earlier fix already caught, two grant shapes it
    missed (the hole this closes), and two reads that must never be flagged (the false
    positive an earlier fix was written to remove, and must not reintroduce).
    """
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
        found.extend(f"{rel}:{lineno}" for lineno in grant_lines(path))
    return found


def _is_request_state(node: ast.expr) -> bool:
    """`request.state.<x>` -- the one attribute chain that is not a database row."""
    return (
        isinstance(node, ast.Attribute)
        and node.attr == "state"
        and isinstance(node.value, ast.Name)
        and node.value.id == "request"
    )


def _is_literal_true(node: ast.expr) -> bool:
    return isinstance(node, ast.Constant) and node.value in (True, 1)


#: The mapped class the column lives on, and the ORM verbs that write a row.
_MODEL = "AuthIdentity"
_WRITE_VERBS = {"values", "update", "insert"}


def _writes_the_row(call: ast.Call) -> bool:
    """Whether a call with an `is_developer=` keyword is writing the COLUMN.

    §19.2 forbids granting the flag, and `is_developer` exists on exactly one table -- so
    a keyword of that name is a grant only when the callee is the model's constructor or
    an ORM write verb. M1 introduced two other callables that legitimately take a literal
    True under the same name and touch no row: `AccessClaims(is_developer=True)` is a
    token claim, and `developer_may_act(is_developer=True, ...)` is a pure rule
    evaluation whose eight-row truth table tests/restrictions/test_01 asserts in full.

    Flagging those would have forced them to be renamed or the files exempted -- and the
    router that mints developer sessions is the last place anyone should be silencing
    this gate. Attribute and bare-name assignments are unaffected and still caught
    unconditionally, so `identity.is_developer = <anything>` remains a grant.
    """
    func = call.func
    if isinstance(func, ast.Name):
        return func.id == _MODEL
    if isinstance(func, ast.Attribute):
        return func.attr in _WRITE_VERBS or func.attr == _MODEL
    return False


def grant_lines(path: Path) -> list[int]:
    """Every line in one file that GRANTS the flag.

    Reads the parse tree, not the text, and the reason is the same one that moved
    tests/dev/test_clock.py and tests/restrictions/test_19_7 to AST during M1: a text
    scan cannot tell a grant from a sentence about a grant. This detector fired on
    app/core/auth_context.py's own docstring -- the paragraph explaining why that
    middleware must never write ``is_developer = False`` -- so the gate guarding §19.2
    forbade documenting §19.2 in the module that obeys it.

    Three shapes are grants, and all three survive the move:

    * ``identity.is_developer = ...`` and a bare ``is_developer = ...`` -- an assignment;
    * ``AuthIdentity(is_developer=True)`` -- a constructor keyword with a literal;
    * ``update(AuthIdentity).values(is_developer=True)`` -- an ORM keyword with a literal.

    Two shapes are not, and both are the reason the RHS matters rather than the spacing:

    * ``developer_may_act(is_developer=bool(x))`` -- a read passed through as a keyword;
    * ``request.state.is_developer = claims.is_developer`` -- §19.6's rule is about the
      COLUMN, and `request.state` is not a row. app/core/auth_context.py copies a
      VERIFIED claim onto the request so app/core/tenancy.py can read it under the name
      M0 already chose; renaming that attribute to dodge this detector would change a
      contract tests/restrictions/test_01 drives directly, to satisfy a gate about
      something else entirely. The carve-out is exactly that narrow --
      ``request.state.is_developer = True`` is still a grant, because there is no
      legitimate reason to hard-code it anywhere.
    """
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:  # pragma: no cover -- app/ failing to parse fails elsewhere first
        return []

    lines: set[int] = set()
    for node in ast.walk(tree):
        # A plain assignment only. An ANNOTATED one (`is_developer: Mapped[bool] =
        # mapped_column(...)`, `is_developer: bool` in a dataclass) is a DECLARATION, and
        # declaring the column is precisely what app/models/identity.py must do -- §19.2
        # forbids granting the flag, not having one. The old regex never saw these
        # because a declaration writes `name: type =` rather than `name =`; the AST walk
        # does, so the distinction has to be made explicitly rather than by accident.
        if isinstance(node, ast.Assign):
            targets = node.targets
            value = node.value
            for target in targets:
                if isinstance(target, ast.Name) and target.id == COLUMN:
                    lines.add(node.lineno)
                elif isinstance(target, ast.Attribute) and target.attr == COLUMN:
                    if _is_request_state(target.value) and not (
                        value is not None and _is_literal_true(value)
                    ):
                        continue
                    lines.add(node.lineno)
        elif isinstance(node, ast.Call) and _writes_the_row(node):
            for keyword in node.keywords:
                if keyword.arg == COLUMN and _is_literal_true(keyword.value):
                    lines.add(node.lineno)
    return sorted(lines)


def test_no_route_can_write_the_flag():
    assert writable_properties(app) == []


def test_no_code_outside_a_seed_or_a_migration_assigns_it():
    assert source_writers(ROOT / "app") == [], (
        f"{COLUMN} is settable only by a database seed or migration (§19.2)"
    )


def test_the_column_the_two_detectors_guard_actually_exists():
    """The complement of the test this replaced, and the reason it is not simply gone.

    Both detectors above are searches, and a search finds nothing when the thing it
    guards has been DELETED just as reliably as when nothing violates it. The test that
    used to sit here recorded the opposite vacuity -- that the column did not exist yet
    -- and its own failure message said to delete it once M1 landed. This is the same
    gate pointed the other way, so the pair can never both be silent for the wrong
    reason.
    """
    import app.models

    assert COLUMN in {
        column.name for column in app.models.base.Base.metadata.tables["auth_identity"].columns
    }, f"auth_identity.{COLUMN} is gone; the two detectors above are vacuous again"


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


# -- the six-case table -------------------------------------------------------
# An earlier fix changed `\s*=` to `\s+=` to stop false-positiving on a *read* passed
# as a keyword (`developer_may_act(is_developer=bool(...))`). That removed the false
# positive and introduced a false negative on the two grant shapes M1 will actually
# use: a constructor kwarg and an ORM `.values(...)` call, both written with no space
# around `=` by ruff format -- the same as a keyword read. This table pins all six
# cases together so a fix to one half cannot regress the other without this file
# noticing.
SIX_CASES = [
    pytest.param("identity.is_developer = True", True, id="attribute assign"),
    pytest.param("is_developer = True", True, id="bare assign"),
    pytest.param("AuthIdentity(is_developer=True)", True, id="constructor kwarg"),
    pytest.param("update(AuthIdentity).values(is_developer=True)", True, id="update .values"),
    pytest.param("if identity.is_developer == True:\n    pass", False, id="comparison (read)"),
    pytest.param("developer_may_act(is_developer=bool(x))", False, id="passing a read"),
    # M1's addition, and the reason it is not a seventh arbitrary case: §19.6's rule is
    # about the COLUMN, and `request.state` is not a row. app/core/auth_context.py copies
    # a verified claim onto the request so app/core/tenancy.py can read it under the name
    # M0 already chose -- renaming that attribute to dodge this detector would change a
    # contract tests/restrictions/test_01 drives directly, to satisfy a gate about
    # something else entirely.
    pytest.param(
        "request.state.is_developer = claims.is_developer", False, id="request.state (not a row)"
    ),
    # ...and the carve-out is exactly that narrow. A literal on the right-hand side is a
    # grant no matter where it is written, and any other attribute target still is one.
    pytest.param("request.state.is_developer = True", True, id="request.state, literal"),
    pytest.param("session.identity.is_developer = flag", True, id="other attribute chain"),
    # Declarations. §19.2 forbids GRANTING the flag, not having one — and
    # app/models/identity.py has to declare the column for there to be anything to
    # guard. The regex never saw these (a declaration writes `name: type =`, not
    # `name =`); the AST walk does, so the distinction is explicit rather than accidental.
    pytest.param(
        "is_developer: Mapped[bool] = mapped_column(Boolean, nullable=False)",
        False,
        id="column declaration",
    ),
    pytest.param("is_developer: bool", False, id="dataclass field"),
    # §19.2 is about writing the COLUMN, and `is_developer` exists on exactly one table.
    # M1 introduced two other callables that legitimately take a literal True under that
    # name, and neither touches a row: a token claim and a pure rule evaluation. Treating
    # every literal kwarg as a grant would have forced both to be renamed or exempted --
    # and a per-file exemption on the router that mints developer sessions is the last
    # place anyone should be silencing this gate.
    pytest.param("AccessClaims(is_developer=True)", False, id="a token claim, not a row"),
    pytest.param(
        "developer_may_act(is_developer=True, studio_is_demo=d, env=e)",
        False,
        id="a rule evaluation, not a row",
    ),
    # ...and the model writes are still caught, which is what keeps the narrowing honest.
    pytest.param("AuthIdentity(is_developer=True)", True, id="model constructor"),
    pytest.param(
        "session.execute(update(AuthIdentity).values(is_developer=True))",
        True,
        id="ORM update .values",
    ),
]


@pytest.mark.parametrize("line, should_be_caught", SIX_CASES)
def test_the_detector_gets_all_six_cases_right(tmp_path, line, should_be_caught):
    (tmp_path / "probe.py").write_text(f"{line}\n", encoding="utf-8")
    caught = bool(source_writers(tmp_path))
    assert caught is should_be_caught, (
        f"{line!r}: expected caught={should_be_caught}, got caught={caught}"
    )
