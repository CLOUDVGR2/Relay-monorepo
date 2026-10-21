"""Env module for the Relay AI service."""


import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool

from app.db.base import Base
from app.db.session import engine
from app import models  # noqa: F401 - register all model tables

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Use the application's URL, keeping credentials out of alembic.ini.
config.set_main_option(
    "sqlalchemy.url",
    str(engine.url).replace("%", "%%"),
)


def run_migrations_offline() -> None:
    context.configure(
        url=str(engine.url),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    # Reuse the application engine so special characters in the
    # database password are handled by SQLAlchemy's parsed URL.
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
