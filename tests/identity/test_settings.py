"""SPEC 5.2 -- 'a short-lived access JWT (15 min) plus a rotating refresh token
(30 days)'. Those two numbers are the contract 10.3 reasons about, so they are settings
with asserted defaults rather than literals scattered through the service.

The last test here is not decoration. tests/config/test_database_config.py asserts the
env template carries a line for every Settings field AND that it never contains the
substring "password". Those two rules are in tension the moment a credential becomes a
setting, which is exactly what holdback 5 would reach for -- so studio_app's credential
travels inside DATABASE_URL, which is already a field and already carries none locally.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.core.config import Settings

ROOT = Path(__file__).resolve().parents[2]
ENV_TEMPLATE = ROOT / ".env.example"


def test_the_access_token_lives_fifteen_minutes_by_default():
    assert Settings().ACCESS_TOKEN_TTL_MINUTES == 15


def test_the_refresh_token_lives_thirty_days_by_default():
    assert Settings().REFRESH_TOKEN_TTL_DAYS == 30


def test_no_provider_credential_has_a_default():
    """A default client id is a default that reaches staging by accident."""
    settings = Settings()
    assert settings.GOOGLE_OAUTH_CLIENT_ID is None
    assert settings.GOOGLE_OAUTH_CLIENT_SECRET is None
    assert settings.APPLE_OAUTH_CLIENT_ID is None


def test_the_env_template_documents_every_new_setting():
    text = ENV_TEMPLATE.read_text(encoding="utf-8")
    for name in Settings.model_fields:
        assert re.search(rf"^{name}=", text, re.MULTILINE), f"the env template omits {name}"


def test_the_env_template_still_carries_no_credential_named_as_one():
    text = ENV_TEMPLATE.read_text(encoding="utf-8").lower()
    assert "password" not in text
