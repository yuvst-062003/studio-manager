from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

Env = Literal["development", "staging", "production", "test"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENV: Env = "development"


settings = Settings()
