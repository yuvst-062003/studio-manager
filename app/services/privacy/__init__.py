"""§11's privacy kit: the consent ledger, the subject-access request, the erasure request.

**A package rather than the single `privacy.py` it replaced**, for one concrete reason:
`scripts/lane-check.sh` builds this lane's mypy, ruff and format targets from
`app/services/$V`, which resolved to a directory that did not exist -- so the lane's own
gate skipped its own service and printed green. A gate that reads as ownership and reaches
nothing is worse than a red one. The public names below are unchanged, so every existing
`from app.services.privacy import PrivacyService` still resolves.

Three modules, split along the two things §11 actually asks for:

  `policy.py`   which version of the terms and privacy policy is published, and the fact
                that it is an unreviewed draft.
  `consent.py`  §11.6's ledger -- append-only, versioned, revocable.
  `requests.py` §11.3's export and §11.4's erasure, plus who may act for whom.
"""

from app.services.privacy.consent import (
    ConsentService,
    PolicyVersionMismatchError,
    UngrantableConsentError,
)
from app.services.privacy.policy import (
    GRANTABLE_CONSENT_TYPES,
    POLICY_IS_DRAFT,
    POLICY_VERSION,
    POLICY_VERSION_LABEL,
    REQUIRED_CONSENT_TYPES,
)
from app.services.privacy.requests import PrivacyService

__all__ = [
    "GRANTABLE_CONSENT_TYPES",
    "POLICY_IS_DRAFT",
    "POLICY_VERSION",
    "POLICY_VERSION_LABEL",
    "REQUIRED_CONSENT_TYPES",
    "ConsentService",
    "PolicyVersionMismatchError",
    "PrivacyService",
    "UngrantableConsentError",
]
