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
    """`טופס הרשמה` block 1, with legacy family fields kept for compatibility.

    `address`, `city`, `phone_home`, `phone` and `email` are accepted here because the
    already-shipped parent client sends them in the child object. The service writes them
    to the signing guardian's `person` row; they are not child facts.
    """

    model_config = ConfigDict(extra="forbid")

    #: Validated for its check digit by `app.core.national_id`, not by a pattern here: the
    #: check digit is the whole point, and a `\d{9}` pattern would accept every transposition.
    national_id: str = Field(min_length=1, max_length=20)
    address: str = Field(min_length=1, max_length=200)
    city: str = Field(min_length=1, max_length=80)
    #: `כיתה/גן`. Free text: `ג'` and `גן חובה` are both answers the paper form accepts.
    grade: str = Field(default="", max_length=20)
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


class PickupContactOut(BaseModel):
    """One authorised collector, as a coach at the door reads it.

    Name and phone, nothing else. The point of the field is that somebody can check who is
    standing there, and a coach who cannot read it is a coach the field does not help.
    """

    name: str
    phone: str
    relation: str | None = None


class OtherParentDefaultsOut(BaseModel):
    """The second parent, as already on file for one of this signer's other children."""

    first_name: str | None = None
    last_name: str | None = None
    national_id: str | None = None
    phone: str | None = None


class RegistrationDefaultsOut(BaseModel):
    """What this family already told the club, offered so a sibling's registration does not
    re-ask it. See `registration_defaults` in `app.services.health.agreement` for where each
    field comes from and why.
    """

    address: str | None = None
    city: str | None = None
    phone_home: str | None = None
    phone: str | None = None
    email: str | None = None
    signer_national_id: str | None = None
    aliyah_year: str | None = None
    other_parent: OtherParentDefaultsOut | None = None
    pickup_contacts: list[PickupContactOut] = Field(default_factory=list)


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
    #: Whether the registration step must ask this student for `כיתה/גן`. False for a student
    #: who is their own guardian: a school class is a fact about a school-age child and a
    #: grown adult has no answer for it. Sent for the same reason as everything else here --
    #: the client cannot see the guardian rows, and a form requiring a field the server does
    #: not is a submit button that never fires.
    school_class_required: bool = True
    #: `None` once registration is complete (nothing left to prefill) or for a family's first
    #: child (nothing on file yet). Computed only while the registration step would actually
    #: render -- see `read_agreement_status`.
    registration_defaults: RegistrationDefaultsOut | None = None


class StudentRegistrationOut(BaseModel):
    """`טופס הרשמה` blocks 3 and 4, for staff.

    **Two access levels in one response, deliberately.** `pickup_contacts` is safety
    information a coach needs at the door. `aliyah_years` is national-origin data collected
    for the עמותה's funding return, which a coach has no reason to see -- it is `None` for
    anyone below manager rather than a second endpoint, so the door surface stays one call.
    """

    pickup_contacts: list[PickupContactOut] = Field(default_factory=list)
    #: Manager and owner only. `None` (not `[]`) for a coach, so "not shown to you" is
    #: distinguishable from "this family gave none".
    aliyah_years: list[str] | None = None
