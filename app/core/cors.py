"""The API's CORS allowlist, read from infra/railway/domains.json.

infra/railway/README.md: "Every hostname lives in domains.json and nowhere else, so the
swap is one file." A literal origin in this module would be a second place, and on the
day HB-domain closes it would be the one nobody remembers to change. That README names
this file as M1's work, alongside the OAuth redirect URIs in the provider console.

`allow_credentials=True` is required -- the refresh cookie is the whole point -- and the
fetch spec forbids pairing it with `allow_origins=["*"]`. So there is no wildcard here,
and a test asserts there never is: a wildcard would not raise, it would silently stop the
cookie being sent and the failure would look like an expired session.

**This is cross-ORIGIN in every environment and that is deliberate.** The api and the
three PWAs are separate services because §Why-four-services requires the apps not to share
origin-scoped IndexedDB -- it holds `pending_ops` (§10.6) and cached health flags (G7).
Origin and site are different boundaries, and only the wider one has to match for the
cookie (see § The domain).
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

DOMAINS_PATH = Path(__file__).resolve().parents[2] / "infra/railway/domains.json"

#: The three PWAs. `api` is deliberately absent -- a same-origin request needs no CORS
#: entry, and listing it would make a misconfigured client appear to work.
_APPS = ("staff", "parent", "dashboard")

#: The runbook's "Production is not yet populated": domains.json carries this placeholder
#: for every production host. An origin built from it would allowlist a hostname that does
#: not exist -- three times over, so the list would look populated.
_PLACEHOLDER = "PENDING"


@lru_cache(maxsize=1)
def _environments() -> dict[str, dict[str, str]]:
    data: dict[str, Any] = json.loads(DOMAINS_PATH.read_text(encoding="utf-8"))
    environments: dict[str, dict[str, str]] = data["environments"]
    return environments


def allowed_origins(env: str) -> list[str]:
    """The origins the API answers credentialed cross-origin requests from.

    `test` reads development's entry: the suite's environment has no hosts of its own, and
    falling back is what lets a test client exercise the real middleware rather than a
    parallel configuration.

    An unknown environment yields an empty list. Failing closed: a name nobody wrote down
    should reach no client, not every client.
    """
    hosts = _environments().get("development" if env == "test" else env, {})
    return [origin for app in _APPS if (origin := hosts.get(app)) and _PLACEHOLDER not in origin]
