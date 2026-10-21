"""Data access and persistence integration for the Relay AI service."""


from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for Atlas AI database models."""
