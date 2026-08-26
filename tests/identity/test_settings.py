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
from typing import get_args

import pytest
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


# -- an empty optional setting is an UNSET one --------------------------------
def _optional_field_names() -> list[str]:
    """Every field whose annotation admits `None`, derived rather than listed.

    A hand-written list is what let this bug spread: the rule was written once for
    `DEV_TOOLS_TOKEN` and the next optional key added did not inherit it.
    """
    return [
        name
        for name, field in Settings.model_fields.items()
        if type(None) in get_args(field.annotation)
    ]


def test_there_are_optional_settings_to_check():
    """Guards the two tests below from passing vacuously if the derivation breaks."""
    assert len(_optional_field_names()) >= 8


@pytest.mark.parametrize("name", _optional_field_names())
def test_an_empty_optional_setting_reads_as_unset(name):
    """`''` is not `None`, and the committed template ships eight optional keys empty.

    Following the template -- which its own first line instructs -- therefore produced a
    value that is falsy, not absent, and every reader testing `is not None` got the wrong
    answer. It bit `dev_tools_allowed` (728b665), then `DevClockMiddleware` (b5cf3e1),
    then `GOOGLE_OAUTH_CLIENT_ID` here, and lane MONEY defended `UPAY_MERCHANT_EMAIL`
    against it by hand. Four times is a rule that belongs in the parser.

    Asserted over every optional field rather than the ones that have bitten so far,
    because the next one will be a key nobody has added yet.
    """
    assert getattr(Settings(_env_file=None, **{name: ""}), name) is None


@pytest.mark.parametrize("name", _optional_field_names())
def test_a_whitespace_only_optional_setting_reads_as_unset(name):
    """A key edited to a space is as unset as one left empty, and a `SecretStr(' ')`
    presented as a token would compare equal to a header carrying one space."""
    assert getattr(Settings(_env_file=None, **{name: "   "}), name) is None


def test_a_real_optional_value_still_survives():
    """The rule must not eat configuration. Guards against a validator that returns None
    for everything, which would make every test above pass and every deployment fail."""
    settings = Settings(_env_file=None, GOOGLE_OAUTH_CLIENT_ID="a-real-client-id")
    assert settings.GOOGLE_OAUTH_CLIENT_ID == "a-real-client-id"
