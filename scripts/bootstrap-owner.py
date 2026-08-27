#!/usr/bin/env python
"""Seed the first studio and its owner into an environment, by hand.

SPEC §5.1's chain of authority starts at `platform_admin`, and §3.1 says that row is
"seeded manually" — there is deliberately no route anywhere that creates one. That is
the right rule and it leaves exactly one gap: a **fresh deployed environment has no
reachable operator at all**, so nobody can call the console that provisions the first
studio. `app/services/demo/personas.py` seeds a platform_admin outside production, but
onto the identity whose provider_subject is the literal string `demo-developer` — not a
subject Google will ever mint, so no human can sign in as it. This script is the manual
seed that closes that gap, and it is the only thing in the repo that writes
`platform_admin`.

**It fabricates nothing.** `auth_identity` rows are keyed by (provider, provider_subject)
and the subject is Google's to mint, so the person being bootstrapped must sign in once
first — anywhere, even onto a refusal screen. That single sign-in is what creates the row
this script then attaches a studio to; without it the script refuses and says so.

Everything after that runs through the app's own service functions rather than through
hand-written INSERTs: `provision_studio` and `invite_owner` are what the console calls,
`accept_invitation` is what the invited owner's browser calls, and calling all three here
leaves a database indistinguishable from one where a human clicked through — health
templates seeded, audit rows written, the owner's Person carrying its role before any
login was attached to it (§3.3 point 2).

Idempotent. Re-running against a bootstrapped environment reports what is already there
and writes nothing.

Usage — from a shell holding the target environment's DATABASE_URL::

    DATABASE_URL='postgresql+psycopg://studio_app:...@host/db' \
        .venv/bin/python scripts/bootstrap-owner.py \
            --email owner@example.com \
            --first-name ... --last-name ... \
            --studio-name '...' --studio-slug '...'

Add `--dry-run` to see the plan without writing. Exit 0 when the environment is
bootstrapped, 2 when it cannot be (no identity yet, unreachable database) — two codes,
because "you must sign in first" is not a failure of this script.
"""

from __future__ import annotations

import argparse
import pathlib
import sys
import uuid

# Same as scripts/verify-db-roles.py: run as a file, so the repo root is not on sys.path
# and `app` would not import.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.core.clock import now  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.tenancy import with_all_tenants  # noqa: E402
from app.models.identity import AuthIdentity, PlatformAdmin  # noqa: E402
from app.models.person import Person, RoleAssignment  # noqa: E402
from app.models.studio import Studio  # noqa: E402
from app.services.identity.platform import invite_owner, provision_studio  # noqa: E402
from app.services.identity.resolution import accept_invitation  # noqa: E402
from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

#: Why this script may read across every studio. It is the platform operator's own
#: bootstrap, which §18.1 puts above every tenant — the same reason
#: app/services/identity/platform.py gives for its own hatch.
_SCOPE = "SPEC 18.1 -- bootstrapping the platform operator, which sits above every studio"


def find_identity(session: Session, email: str) -> AuthIdentity | None:
    """The Google identity behind an address, or None if nobody has signed in as it yet.

    `auth_identity.email` is deliberately not unique (Apple's private-relay addresses are
    stored as-is), so this can match more than one row. It takes the verified, non-relay,
    unlinked Google one — the same shape `upsert_identity` requires before it will link
    anything to an address — and the oldest of those, so a re-run picks the same row.
    """
    with with_all_tenants(reason=_SCOPE):
        return (
            session.execute(
                select(AuthIdentity)
                .where(
                    AuthIdentity.email == email,
                    AuthIdentity.provider == "google",
                    AuthIdentity.email_verified.is_(True),
                    AuthIdentity.is_private_relay.is_(False),
                    AuthIdentity.linked_to_identity_id.is_(None),
                )
                .order_by(AuthIdentity.created_at)
            )
            .scalars()
            .first()
        )


def ensure_platform_admin(session: Session, identity_id: uuid.UUID) -> bool:
    """§3.1's "seeded manually", performed. Returns whether a row was written."""
    with with_all_tenants(reason=_SCOPE):
        held = session.execute(
            select(PlatformAdmin).where(PlatformAdmin.auth_identity_id == identity_id)
        ).scalar_one_or_none()
        if held is not None:
            return False
        session.add(PlatformAdmin(auth_identity_id=identity_id))
        session.flush()
        return True


def find_studio(session: Session, slug: str) -> Studio | None:
    with with_all_tenants(reason=_SCOPE):
        return session.execute(select(Studio).where(Studio.slug == slug)).scalar_one_or_none()


def live_owner(session: Session, studio_id: uuid.UUID) -> Person | None:
    """The studio's current owner Person, attached to a login or not.

    §3.1 allows exactly one live owner per studio and the partial unique index enforces
    it, so finding one here is what makes a second `invite_owner` unnecessary rather than
    merely redundant — it would fail on the index.
    """
    with with_all_tenants(reason=_SCOPE):
        return (
            session.execute(
                select(Person)
                .join(RoleAssignment, RoleAssignment.person_id == Person.id)
                .where(
                    RoleAssignment.studio_id == studio_id,
                    RoleAssignment.role == "owner",
                    RoleAssignment.revoked_at.is_(None),
                    Person.anonymized_at.is_(None),
                )
            )
            .scalars()
            .first()
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True, help="the Google address of the owner")
    parser.add_argument("--first-name", required=True)
    parser.add_argument("--last-name", required=True)
    parser.add_argument("--studio-name", required=True)
    parser.add_argument("--studio-slug", required=True)
    parser.add_argument("--timezone", default="Asia/Jerusalem")
    parser.add_argument("--locale", default="he")
    parser.add_argument(
        "--no-platform-admin",
        action="store_true",
        help="make them an owner without also making them the platform operator",
    )
    parser.add_argument("--dry-run", action="store_true", help="report the plan, write nothing")
    args = parser.parse_args()

    try:
        engine = create_engine(settings.DATABASE_URL, connect_args={"connect_timeout": 10})
        connection = engine.connect()
    except Exception as exc:  # noqa: BLE001 -- the reason is the output
        print(f"?  could not reach the database: {exc}", file=sys.stderr)
        return 2
    connection.close()

    at = now()
    with Session(engine) as session:
        identity = find_identity(session, args.email)
        if identity is None:
            # Not a failure. The subject belongs to Google and this script will not
            # invent one, so the only way forward is a real sign-in.
            print(
                f"?  no Google identity for {args.email} yet.\n"
                "   Sign in once with that account at the deployed app — landing on the\n"
                "   'you have no access' refusal screen is fine and expected, the row is\n"
                "   written before that screen renders — then run this again.",
                file=sys.stderr,
            )
            return 2
        print(f"·  identity {identity.id} — {args.email}")

        studio = find_studio(session, args.studio_slug)
        owner = live_owner(session, studio.id) if studio is not None else None
        wrote: list[str] = []

        if args.dry_run:
            print("—  dry run, nothing written. The plan:")
            if not args.no_platform_admin:
                held = holds_platform_admin(session, identity.id)
                print("   platform_admin:", "already held" if held else "would be seeded")
            print(
                "   studio:",
                f"{studio.id} exists" if studio else f"would provision {args.studio_slug!r}",
            )
            print("   owner:", f"person {owner.id} exists" if owner else "would invite and accept")
            return 0

        if not args.no_platform_admin and ensure_platform_admin(session, identity.id):
            wrote.append("platform_admin")
        print("·  platform admin: skipped" if args.no_platform_admin else "·  platform admin: yes")

        if studio is None:
            studio = provision_studio(
                session,
                name=args.studio_name,
                slug=args.studio_slug,
                timezone=args.timezone,
                default_locale=args.locale,
                created_by_identity_id=identity.id,
                at=at,
            )
            wrote.append("studio")
        print(f"·  studio {studio.id} — {studio.name} ({studio.slug})")

        owner = live_owner(session, studio.id)
        if owner is None:
            # The console's own call, followed by the browser's own call. The token
            # never leaves this process: it is minted, spent, and dropped.
            _, token = invite_owner(
                session,
                studio_id=studio.id,
                email=args.email,
                first_name=args.first_name,
                last_name=args.last_name,
                granted_by_identity_id=identity.id,
                at=at,
            )
            owner = accept_invitation(session, token=token, identity_id=identity.id, at=at)
            wrote.append("owner")
        elif owner.auth_identity_id is None:
            # An invitation was created but never accepted. Binding it here is exactly
            # what accept_invitation does, minus a token nobody kept.
            owner.auth_identity_id = identity.id
            session.flush()
            wrote.append("owner login attached")
        elif owner.auth_identity_id != identity.id:
            print(
                f"✋ studio {studio.slug!r} already has a different owner "
                f"(person {owner.id}). §3.1 allows exactly one; nothing written.",
                file=sys.stderr,
            )
            session.rollback()
            return 1
        print(f"·  owner person {owner.id} — {owner.first_name} {owner.last_name}")

        session.commit()

    if wrote:
        print(f"✅ wrote: {', '.join(wrote)}")
    else:
        print("✅ already bootstrapped, nothing to do")
    return 0


def holds_platform_admin(session: Session, identity_id: uuid.UUID) -> bool:
    """Dry-run helper: does this identity already hold platform_admin?"""
    with with_all_tenants(reason=_SCOPE):
        return (
            session.execute(
                select(PlatformAdmin.id).where(PlatformAdmin.auth_identity_id == identity_id)
            ).first()
            is not None
        )


if __name__ == "__main__":
    raise SystemExit(main())
