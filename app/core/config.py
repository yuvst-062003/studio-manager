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

    LOG_LEVEL: str = "INFO"


settings = Settings()
