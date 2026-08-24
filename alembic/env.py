"""Alembic wiring.

Two things matter here. The URL comes from MIGRATION_DATABASE_URL, so migrations run as
the schema owner and not as the runtime role -- SPEC §11.2 needs those to differ. And
`app.models` is imported for its side effect: seam 2's discovery loop imports every
model module, so autogenerate sees a table the moment a lane adds a file.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

import app.models  # noqa: F401 -- seam 2 discovery populates Base.metadata
from app.core.config import settings
from app.models.base import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", settings.MIGRATION_DATABASE_URL)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.MIGRATION_DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
