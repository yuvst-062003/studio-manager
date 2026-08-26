#!/usr/bin/env python
"""Prove — against a real environment — that the api connects as the runtime role.

HB-staging-superuser. SPEC §11.2 makes `audit_log` append-only by GRANT, and a grant on a
role the api does not connect as protects nothing. app/main.py's lifespan already checks
this on every boot; this is the same measurement runnable by hand, before a cutover and
after one, without reading a log.

Usage, from a shell that has the environment's DATABASE_URL:

    .venv/bin/python scripts/verify-db-roles.py
    DATABASE_URL='postgresql+psycopg://studio_app:...@host/db' \
        .venv/bin/python scripts/verify-db-roles.py

Exit code 0 when §11.2 is in force, 1 when it is not, 2 when the database could not be
reached — three outcomes, because "could not check" is not the same answer as "not
enforced" and a script that conflated them would let a network blip read as a pass.
"""

from __future__ import annotations

import pathlib
import sys

# Same as scripts/export_openapi.py: this is run as a file rather than as a module, so the
# repo root is not on sys.path and `app` would not import.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.core.db_roles import describe_runtime_role  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402


def main() -> int:
    engine = create_engine(settings.DATABASE_URL, connect_args={"connect_timeout": 10})
    try:
        report = describe_runtime_role(engine)
    except Exception as exc:  # noqa: BLE001 -- the reason is the output
        if "not permitted to log in" in str(exc):
            # The W0-W6 ship audit's B1: the role exists NOLOGIN, which reads as a
            # connection failure but is a role misconfiguration -- revision 0011 grants
            # LOGIN, so a database at head cannot show this. Answer 1, not 2: this is
            # "not enforced", measured, not "could not check".
            print(
                f"❌ the runtime role exists but cannot log in: {exc}\n"
                "   run `.venv/bin/alembic upgrade head` (revision 0011 grants LOGIN)",
                file=sys.stderr,
            )
            return 1
        print(f"?  could not reach the database: {exc}", file=sys.stderr)
        return 2
    finally:
        engine.dispose()

    print(f"   connected as : {report.connected_as}")
    print(f"   SELECT       : {report.can_select_audit_log}")
    print(f"   INSERT       : {report.can_insert_audit_log}")
    print(f"   UPDATE       : {report.can_update_audit_log}")
    print(f"   DELETE       : {report.can_delete_audit_log}")

    if report.enforced:
        print("✅ audit_log is append-only by grant (SPEC §11.2)")
        return 0
    print(f"❌ {report.explain()}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
