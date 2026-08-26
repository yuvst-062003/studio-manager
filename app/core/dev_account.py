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
    configured = settings.DEV_TOOLS_TOKEN
    if not dev_tools_allowed(
        env=settings.ENV,
        is_developer=bool(getattr(request.state, "is_developer", False)),
        presented_token=request.headers.get(DEV_TOKEN_HEADER),
        configured_token=None if configured is None else configured.get_secret_value(),
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="the developer tools are not available to this caller",
        )


RequireDeveloper = Annotated[None, Depends(require_developer)]
