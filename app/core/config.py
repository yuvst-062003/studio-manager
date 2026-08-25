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

    LOG_LEVEL: str = "INFO"


settings = Settings()
