"""Data access and persistence integration for the Relay AI service."""


import os
from collections.abc import AsyncIterator
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# Load the repository-level .env without printing or overriding existing variables.
REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
load_dotenv(REPOSITORY_ROOT / ".env", override=False)

database_url = os.getenv("DATABASE_URL")
if not database_url:
    password = os.getenv("ATLAS_POSTGRES_PASSWORD")
    if not password:
        raise RuntimeError(
            "Set DATABASE_URL or ATLAS_POSTGRES_PASSWORD in the repository .env."
        )
    database_url = URL.create(
        drivername="postgresql+asyncpg",
        username="atlas_ai",
        password=password,
        host="127.0.0.1",
        port=5433,
        database="atlas_ai",
    )
elif database_url.startswith("postgres://"):
    database_url = "postgresql+asyncpg://" + database_url[len("postgres://"):]
elif database_url.startswith("postgresql://"):
    database_url = "postgresql+asyncpg://" + database_url[len("postgresql://"):]

engine = create_async_engine(
    database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session
