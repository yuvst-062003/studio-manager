"""Request and response shapes for `הסכם הרשמה` -- the club's registration agreement.

Deliberately **not** in `app/schemas/health.py`. The health schemas carry §11.1's boundary in
their names and their docstrings -- `HealthDeclarationOut` has flags and no answers,
`HealthDeclarationFullOut` is manager-only and audit-logged -- and registration details are
governed by an ordinary admin rule. Putting an address into that file is the first step
toward putting it behind that boundary.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class PickupContactIn(BaseModel):
    """One person, other than a parent, who may collect the child (`טופס הרשמה` block 3)."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(default="", max_length=32)
    relation: str | None = Field(default=None, max_length=40)


class ChildDetailsIn(BaseModel):
    """`טופס הרשמה` block 1. Four required fields; the rest are optional on the paper form too."""

    model_config = ConfigDict(extra="forbid")

    #: Validated for its check digit by `app.core.national_id`, not by a pattern here: the
    #: check digit is the whole point, and a `\d{9}` pattern would accept every transposition.
    national_id: str = Field(min_length=1, max_length=20)
    address: str = Field(min_length=1, max_length=200)
    city: str = Field(min_length=1, max_length=80)
    #: `כיתה/גן`. Free text: `ג'` and `גן חובה` are both answers the paper form accepts.
    grade: str = Field(min_length=1, max_length=20)
    phone_home: str | None = Field(default=None, max_length=32)
    phone: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=320)


class ParentDetailsIn(BaseModel):
    """`טופס הרשמה` block 2, for the signing parent and optionally the other one."""

    model_config = ConfigDict(extra="forbid")

    first_name: str | None = Field(default=None, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)
    national_id: str | None = Field(default=None, max_length=20)
    phone: str | None = Field(default=None, max_length=32)
    #: `שנת עליה` -- block 4. A string rather than an int because the field is optional and
    #: free-form on the paper form, and because it is stored encrypted either way.
    aliyah_year: str | None = Field(default=None, max_length=8)


class RegistrationIn(BaseModel):
    """Blocks 1-4. Posted by step 1 of the agreement flow."""

    model_config = ConfigDict(extra="forbid")

    child: ChildDetailsIn
    signer: ParentDetailsIn
    other_parent: ParentDetailsIn | None = None
    pickup_contacts: list[PickupContactIn] = Field(default_factory=list, max_length=10)


class ClubTermsIn(BaseModel):
    """Step 3's acceptance.

    **The version is the one the client RENDERED**, echoed back, exactly as
    `POST /privacy/consents` does. Recording the server's current version for a screen that
    showed the previous one is how a consent ledger comes to hold agreements nobody made.
    """

    model_config = ConfigDict(extra="forbid")

    accepted: bool
    version: int


class AgreementStatusOut(BaseModel):
    """The three gate conditions, computed server-side and never re-derived by a client.

    A gate whose condition is spelled out at two call sites is a gate that will eventually
    disagree with itself -- and the failure modes are a family locked out of an app they have
    finished with, or one walking past a signature the club needs.
    """

    health_signed: bool
    registration_complete: bool
    terms_accepted: bool
    complete: bool
    #: What the terms step must echo back if it renders. Sent so the client never hard-codes it.
    club_terms_version: int
