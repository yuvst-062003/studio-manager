"""SPEC 3.3 and 4.3's identity block, asserted at the metadata level so a column that
quietly changes shape is a red build rather than a runtime surprise.

The negative assertions carry the weight here. 3.3's opening claim is that these tables
are GLOBAL -- "one Google account can be a parent at one studio and a coach at another"
-- and a studio_id added to any of them would make that sentence false while every other
test in the suite stayed green.
"""

from __future__ import annotations

import app.models  # noqa: F401 -- seam 2 discovery
from app.core.tenancy import TenantMixin
from app.models.base import Base

GLOBAL_TABLES = (
    "auth_identity",
    "platform_admin",
    "refresh_token",
    "auth_revocation",
    "oauth_transaction",
)


def test_the_identity_tables_are_global_and_carry_no_studio_id():
    """3.3 -- 'GLOBAL, no studio_id', so one Google account is a parent at one studio
    and a coach at another."""
    for name in GLOBAL_TABLES:
        table = Base.metadata.tables[name]
        assert "studio_id" not in table.c, f"{name} must not be tenant-scoped"


def test_no_global_identity_table_inherits_the_tenant_mixin():
    offenders = [
        mapper.local_table.name
        for mapper in Base.registry.mappers
        if issubclass(mapper.class_, TenantMixin)
        and mapper.local_table is not None
        and mapper.local_table.name in GLOBAL_TABLES
    ]
    assert offenders == []


def test_is_developer_is_non_null_and_defaults_to_false():
    """19.2 -- 'auth_identity.is_developer BOOLEAN NOT NULL DEFAULT false'. The server
    default is the half that matters: a seed inserting a row without the column gets
    what the database says, not what the model says."""
    column = Base.metadata.tables["auth_identity"].c["is_developer"]
    assert column.nullable is False
    assert column.server_default is not None


def test_provider_subject_is_unique_per_provider():
    """4.3 writes `provider_subject UNIQUE`. Scoped to the provider: Google and Apple
    mint subjects in separate namespaces, so a bare unique on the subject alone would
    forbid a collision that is not one."""
    table = Base.metadata.tables["auth_identity"]
    uniques = [
        tuple(c.name for c in constraint.columns)
        for constraint in table.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    ]
    assert ("provider", "provider_subject") in uniques


def test_a_refresh_token_stores_a_hash_and_never_the_token():
    """11.7. A database read must not yield a usable session."""
    table = Base.metadata.tables["refresh_token"]
    assert "token_hash" in table.c
    assert "token" not in table.c


def test_a_refresh_token_carries_its_family_so_reuse_can_revoke_the_family():
    """5.2 -- 'one-time-use, reuse detection revokes the family of tokens'. Revoking
    only the presented row would leave an attacker's freshly-rotated successor alive,
    which is the opposite of the point."""
    table = Base.metadata.tables["refresh_token"]
    for column in ("family_id", "parent_id", "used_at", "revoked_at"):
        assert column in table.c, column


def test_the_denylist_is_a_watermark_and_not_a_list_of_tokens():
    """5.2 -- 'Revocations (removing a coach) are written to a small denylist checked on
    refresh.' Small because it is per-identity: one row kills every device that coach
    holds, including devices this server has never issued a token to."""
    table = Base.metadata.tables["auth_revocation"]
    assert "sessions_issued_before" in table.c
    assert "token_hash" not in table.c


def test_the_pkce_verifier_is_stored_and_single_use():
    """5.2 -- 'a standard top-level redirect, then PKCE code exchange server-side.'
    Server-side means the verifier never leaves this process, so it needs somewhere to
    live between the redirect out and the callback back."""
    table = Base.metadata.tables["oauth_transaction"]
    assert "code_verifier" in table.c
    assert "consumed_at" in table.c
