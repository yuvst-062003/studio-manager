"""Alembic wiring.

Three things matter here. The URL comes from MIGRATION_DATABASE_URL, so migrations run as
the schema owner and not as the runtime role -- SPEC §11.2 needs those to differ. And
`app.models` is imported for its side effect: seam 2's discovery loop imports every
model module, so autogenerate sees a table the moment a lane adds a file.

The third is `_render_item`. §11.1's encrypted columns are `TypeDecorator`s taking a
required `aad` argument, and autogenerate renders a custom type by its class path with an
EMPTY argument list -- `app.core.encryption.EncryptedJSON()`. That is not a style problem:
the generated revision raises `TypeError: missing 1 required positional argument` the first
time it runs, and the obvious repair is to substitute the JSONB/LargeBinary it wraps, which
produces a working schema and an `alembic check` that is dirty forever. Rendering the
argument here fixes it once for every wave rather than in each revision by hand -- W2 has
one such column, W3 has two.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

import app.models  # noqa: F401 -- seam 2 discovery populates Base.metadata
from app.core.config import settings
from app.core.encryption import EncryptedBytes, EncryptedJSON
from app.models.base import Base

def _render_item(type_, obj, autogen_context):
    """Render §11.1's encrypted types with the `aad` they require.

    The AAD names the column, so a blob cannot be moved between columns and still decrypt
    (`app/core/encryption.py`). It is part of the type's identity and has to survive into
    the revision. Returning `False` for everything else leaves Alembic's own rendering in
    place -- this hook narrows, it does not replace.
    """
    if type_ == "type" and isinstance(obj, (EncryptedJSON, EncryptedBytes)):
        autogen_context.imports.add("import app.core.encryption")
        return f"app.core.encryption.{type(obj).__name__}({obj.aad!r})"
    return False


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
        render_item=_render_item,
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
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_item=_render_item,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
