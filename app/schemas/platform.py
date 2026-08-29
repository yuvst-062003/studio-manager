"""Request and response shapes for /platform/*.

Two fields are deliberately absent from every request body here, and both absences are
load-bearing:

* `is_demo` -- §19.1 makes it the flag deciding whether a studio contains real people, and
  §19.7 excludes flagged studios from every cross-studio total. A console that could set
  it could make a real club invisible to the numbers used to judge real clubs.
* `is_developer` -- §19.2, and tests/restrictions/test_04 walks every request body FastAPI
  publishes looking for exactly that name. The console is where "just let me flag this
  account" would feel most reasonable, which is why it is worth saying out loud here.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

#: A shape check, not a validator. `EmailStr` rejects RFC 2606's reserved TLDs (so every
#: `@example.invalid` address in the suite) and, more importantly, rejects addresses that
#: are legal under RFC 5321 but unusual -- and the only real test of an address is whether
#: delivery succeeds, which §5.11's push-delivery report already surfaces. One `@`, no
#: whitespace, and a length bound is what this layer can honestly assert.
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class ProvisionStudioRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    #: Appears in URLs and in the demo studio's own lookup, so it is constrained rather
    #: than free text. Lower-case, digits and hyphens: anything else either needs escaping
    #: or is invisibly different from something that looks the same.
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
    #: G3 -- a rendering timezone, never a storage one.
    timezone: str = Field(default="Asia/Jerusalem", max_length=64)
    default_locale: str = Field(default="he", pattern=r"^(he|en|ru)$")


class InviteOwnerRequest(BaseModel):
    email: str = Field(max_length=320, pattern=EMAIL_PATTERN)
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)


class StudioOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    timezone: str
    default_locale: str
    status: str
    is_demo: bool
    created_by_identity_id: uuid.UUID | None
    created_at: datetime


class StudioListResponse(BaseModel):
    items: list[StudioOut]


class InvitationOut(BaseModel):
    """§5.3's token, returned exactly once.

    Only its SHA-256 is stored, so nothing can reproduce this value later -- which is why
    the list endpoint has no field for it and why a re-send has to issue a new one.
    """

    id: uuid.UUID
    email: str
    expires_at: datetime
    token: str


# -- §18.3's operations board -----------------------------------------------------------
#
# "the rows, not the health chips (C4 -- M9 owns those, and the operations board with
# them)" is what `get_studios` said it was leaving for later. This is later.
#
# **Every field below is machine-readable, and that is a rule rather than an oversight.**
# Ids, counts, timestamps and enum-ish status strings; not one line of display copy. The
# dashboard renders Hebrew from `@studio/i18n` like every other screen (G4), and the alert
# email renders English from app/services/ops/alerts.py. An API that returned prose would
# have to pick a language for a reader it cannot see, and would then be the one place in
# the product where a user-facing string lives outside the locale files.


class JobHealthOut(BaseModel):
    """One scheduled job, as `infra/railway/jobs.json` declares it and `job_run` records it."""

    name: str
    schedule: str
    environment: str
    max_silence_minutes: int
    last_run_at: datetime | None
    last_success_at: datetime | None
    last_status: str | None
    #: No successful run inside the declared tolerance. Never true for a job this
    #: environment does not schedule -- see `scheduled_here`.
    overdue: bool
    #: The most recent run ended in an exception. Separate from `overdue` on purpose: a
    #: job failing every hour has a perfectly healthy heartbeat, and collapsing the two
    #: would let a broken job hide behind its own punctuality.
    failing: bool
    scheduled_here: bool


class SignalOut(BaseModel):
    """An API or business signal. `status` is 'ok', 'red' or 'unknown'."""

    id: str
    status: str
    value: int | None
    since: datetime | None


class OpsHealthResponse(BaseModel):
    status: str
    checked_at: datetime
    env: str
    jobs: list[JobHealthOut]
    signals: list[SignalOut]
    #: Whether an alert could actually be delivered. On the response because "no alerts"
    #: and "no delivery" look identical from an empty inbox and mean opposite things.
    email_configured: bool
