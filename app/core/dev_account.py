"""SPEC §19.6 -- what the developer account cannot do, as functions rather than prose.

Everything here is a pure decision over booleans and strings. That is deliberate: a
guardrail expressed as a pure function has a truth table, and a truth table can be
asserted in full. The FastAPI dependency at the bottom is the only part that touches a
request, and it does nothing but read three values and call one of these functions.
"""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.core.config import settings

DEV_TOKEN_HEADER = "X-Dev-Token"


def configured_dev_token() -> str | None:
    """The configured developer token, or `None` when there is not one.

    **An empty value is no token**, and this function exists so that sentence is written
    down once. The committed environment template ships the key with an empty value and
    says in its own comment that an unset token means "this machine only"; `SecretStr("")`
    is not `None`, so every reader that tested the setting for `is not None` got both
    halves wrong at once.

    Too strict locally: it refused the capability on a machine where nothing was
    misconfigured. Too permissive on a public origin, which is the half that matters --
    `secrets.compare_digest("", "")` is True, so an empty configured value authorised
    anyone who sent an empty `X-Dev-Token` header.

    728b665 fixed that inside `dev_tools_allowed` and missed the second copy of the same
    rule in `app.core.clock.DevClockMiddleware`, which is how a lane worktree ended up
    with every HTTP test failing. Both callers read the setting through here now, so there
    is one place to be wrong rather than two places to keep in step.

    **`settings` is imported inside the body, not off this module's own binding.**
    `app.core.clock` imports this function at module scope and is deliberately absent from
    `tests/dev/conftest.py`'s RELOADABLE list -- it reads `settings` late, inside
    `dispatch`, so its binding can never freeze to whichever environment imported it
    first. A module-level read here would hand that frozen binding straight back to it:
    the harness reloads `app.core.dev_account`, but `clock` still points at the *previous*
    function object, and that object would carry the pre-swap settings with it.
    """
    from app.core.config import settings as current

    token = current.DEV_TOOLS_TOKEN
    if token is None:
        return None
    return token.get_secret_value() or None


def dev_tools_allowed(
    *,
    env: str,
    is_developer: bool,
    presented_token: str | None,
    configured_token: str | None,
) -> bool:
    """Who may call /dev/* on an environment where the router is mounted at all.

    Production returns False on every input. The router is not registered there, so
    this branch is unreachable over HTTP -- it exists so that a future refactor which
    accidentally mounts the router does not also hand it out.
    """
    if env == "production":
        return False
    if is_developer:
        return True
    # An EMPTY token is no token. The committed environment template ships the key with an
    # empty value and says so in a comment -- "an unset token means this machine only" --
    # and `SecretStr("")` is not None, so reading it as a configured token got both halves
    # wrong at once. Locally it refused every /dev/* call on a machine where nothing was
    # misconfigured; on a public origin it was worse, because `compare_digest("", "")` is
    # True, so an empty configured value authorised anyone who sent an empty header.
    if configured_token:
        return presented_token is not None and secrets.compare_digest(
            presented_token, configured_token
        )
    # No token configured: allowed only on a developer's own machine.
    return env == "development"


def developer_may_act(*, is_developer: bool, studio_is_demo: bool, env: str) -> bool:
    """§19.6 restriction 1 -- 'cannot act inside a non-demo studio in production'.

    §19.1: in dev and staging the role switcher works across any studio in that
    environment; in production it works only inside a studio that contains no real
    people. Not "is discouraged from": this is the resolver's answer.
    """
    if not is_developer:
        return True
    if env != "production":
        return True
    return studio_is_demo


def require_developer(request: Request) -> None:
    """The dependency every /dev route declares (.claude/rules/api.md: authorization is
    checked in the router via a dependency, never inside a service)."""
    if not dev_tools_allowed(
        env=settings.ENV,
        is_developer=bool(getattr(request.state, "is_developer", False)),
        presented_token=request.headers.get(DEV_TOKEN_HEADER),
        configured_token=configured_dev_token(),
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="the developer tools are not available to this caller",
        )


RequireDeveloper = Annotated[None, Depends(require_developer)]
