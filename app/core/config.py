from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

Env = Literal["development", "staging", "production", "test"]

LOCAL_DB = "127.0.0.1:55433/studio_manager"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENV: Env = "development"

    # Two DSNs, because two roles (SPEC §11.2). The app connects as a role that cannot
    # UPDATE or DELETE audit_log; Alembic connects as the schema owner.
    DATABASE_URL: str = f"postgresql+psycopg://studio_app@{LOCAL_DB}"
    MIGRATION_DATABASE_URL: str = f"postgresql+psycopg://studio_migrator@{LOCAL_DB}"
    # Named, not hardcoded, so revision 0001 grants to whatever role the environment
    # actually runs as.
    APP_DB_ROLE: str = "studio_app"

    # SPEC §11.1 -- keys live in Railway secrets, never in the database. Versioned so
    # rotation does not mean re-encrypting everything: a blob records the version it
    # was wrapped under and stays readable after the active version moves on.
    ENCRYPTION_KEYS: dict[int, SecretStr] = {}
    ENCRYPTION_ACTIVE_KEY_VERSION: int = 0

    # §19 -- who may call /dev/* on a deployed non-production environment. Staging is a
    # public HTTPS origin, so "the router exists there" must not mean "anyone may use
    # it". Unset in development, where there is no auth layer to authenticate against
    # yet; M1 replaces this with the is_developer flag and it becomes vestigial.
    DEV_TOOLS_TOKEN: SecretStr | None = None

    # §5.10 / §15 item 2 -- the merchant account a payment form charges to. Not a secret
    # in the cryptographic sense (it is a hidden field any payer can view-source), but it
    # is the identifier that decides whose account receives the money, so it lives in
    # Railway variables rather than in git. .gitleaks.toml carries a matching rule.
    # Unset in development and test: `upay_form_fields` needs it only for a live form,
    # and §19.6 means the demo studio never builds one.
    UPAY_MERCHANT_EMAIL: str | None = None

    # §5.2 -- "a short-lived access JWT (15 min) plus a rotating refresh token (30 days,
    # one-time-use, reuse detection revokes the family)". §10.3 reasons about both
    # numbers directly -- a coach on a mat for 90 minutes against a 15-minute token is
    # the whole reason that section exists -- so they are settings with asserted
    # defaults rather than literals inside the token service.
    #
    # HS256: one service mints these and the same service verifies them, so an
    # asymmetric pair would have no second reader. If a second service ever needs to
    # verify one, that is the moment to move to RS256, not before.
    JWT_SIGNING_KEY: SecretStr | None = None
    ACCESS_TOKEN_TTL_MINUTES: int = 15
    REFRESH_TOKEN_TTL_DAYS: int = 30

    # §5.2 -- Google and Apple only. No password, no phone OTP, no email magic links.
    # None rather than a placeholder: a default client id is one that reaches staging by
    # accident and fails there in a way that names neither half.
    GOOGLE_OAUTH_CLIENT_ID: str | None = None
    GOOGLE_OAUTH_CLIENT_SECRET: SecretStr | None = None

    # Sign in with Apple for the WEB needs a Services ID, a .p8 key and an ES256
    # client-secret JWT -- all behind a paid Apple Developer Program membership, which
    # §6.5 dropped along with the store builds. The provider is implemented because §5.2
    # says retrofitting Apple later would be an identity migration; it stays unset until
    # HB-apple-developer closes, and `configured_providers()` omits it so no user meets
    # a button that fails after they have committed to it.
    APPLE_OAUTH_CLIENT_ID: str | None = None
    APPLE_OAUTH_TEAM_ID: str | None = None
    APPLE_OAUTH_KEY_ID: str | None = None
    APPLE_OAUTH_PRIVATE_KEY: SecretStr | None = None

    # Where the provider sends the browser back. One value per environment, and the
    # OAuth console's own redirect-URI allowlist must match it exactly -- which is the
    # other half of what HB-domain gates (infra/railway/README.md § The domain).
    OAUTH_REDIRECT_BASE_URL: str = "http://localhost:8000"

    LOG_LEVEL: str = "INFO"


settings = Settings()
