"""W5 — comms and reports. **A DRAFT, NOT A REVISION.**

See `README.md` in this directory. The last of the four, and the smallest: five
communications tables plus §11.3's export request.
"""

from __future__ import annotations

revision = "0009"
down_revision = "0008"

TABLES = {
    "app/models/comms.py": (
        "announcement",
        "notification",
        "notification_delivery",
        "push_token",
        "calendar_feed",
    ),
    "app/models/reports.py": ("data_export_request",),
}

HAND_CHECK = (
    # ---------------------------------------------------------------------------------
    "notification_delivery and push_token carry studio_id even though §4.3's shorthand "
    "column list for them does not. Both are children of tenant-scoped rows, and "
    "TenantSession filters on the mixin -- a child without studio_id is a table the tenant "
    "filter cannot see. Invariant 2 states this as a closed rule and neither table has a "
    "reason to be global, so neither is in CROSS_TENANT_TABLES.",
    # ---------------------------------------------------------------------------------
    "notification_delivery.status must keep all six values: queued, sent, delivered, failed, "
    "no_token, denied. The last two are §5.11's whole delivery-report mechanism -- push is "
    "opt-in, so 'never installed the app' and 'turned notifications off' are different "
    "conversations and neither is 'the send errored'. Collapsing them into `failed` turns the "
    "manager's ⚠ list into a count nobody can act on.",
    # ---------------------------------------------------------------------------------
    "push_token.token and calendar_feed.token are unique PRODUCT-WIDE, not per studio. An FCM "
    "registration identifies a device, and §5.12's feed lives at an unauthenticated URL that "
    "carries no studio to disambiguate it -- a per-tenant constraint would let two studios "
    "issue the same calendar URL.",
    # ---------------------------------------------------------------------------------
    "notification's unread index is PARTIAL: `postgresql_where=read_at IS NULL`. It serves "
    "§5.11's badge, and within a month the read rows are the overwhelming majority.",
    # ---------------------------------------------------------------------------------
    "Three paired CHECKs that encode 'these two columns agree', and each one is a state the "
    "UI would otherwise render as a lie: announcement's (scope_type = 'studio') = (scope_id "
    "IS NULL); data_export_request's (status = 'completed') = (object_key IS NOT NULL); and "
    "its completed_at pairing. A completed export with no object_key is a download link to "
    "nothing, shown to a guardian who was told their data is ready.",
    # ---------------------------------------------------------------------------------
    "data_export_request.object_key is a String pointer, never the bundle. §8.1 puts export "
    "bundles in object storage. Inlining one puts a child's complete record -- health "
    "declarations included -- into every backup, every replica and every pg_dump.",
    # ---------------------------------------------------------------------------------
    "No reply_to_id, thread_id or sender_person_id on any table here, and none may be added. "
    "§2.3 puts in-app two-way chat out of scope, §5.11 permits push plus a ONE-WAY inbox, and "
    "D9.1 cut שיחה עם המשרד from artboard 2b. tests/contracts/test_w5_models.py asserts their "
    "absence; a migration that adds one is how the scope cut gets reversed.",
)

VERIFY = (
    "fresh database -- notification_delivery references notification, and both reference "
    "person from 0005",
    "a 0008 database -- all new tables, so the risk is the paired CHECKs being dropped as "
    "'redundant' during a tidy-up",
    "tests/contracts/test_w5_models.py and tests/contracts/test_w5_schemas.py",
    "after this lands, `pytest -q` should have no migration-gap failures left: 0006-0009 "
    "close the whole set that the contract branch could not create",
)


def upgrade() -> None:
    raise NotImplementedError(
        "This is a draft. The body comes from `alembic revision --autogenerate` on `main`, "
        "reconciled against HAND_CHECK above. See README.md in this directory."
    )


def downgrade() -> None:
    raise NotImplementedError("See upgrade().")
