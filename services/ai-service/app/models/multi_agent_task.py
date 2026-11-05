"""Durable task records for the multi-agent execution queue."""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    desc,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MultiAgentTask(Base):
    __tablename__ = "multi_agent_tasks"

    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'running', 'completed', 'failed', 'cancelled')",
            name="ck_multi_agent_tasks_status",
        ),
        CheckConstraint(
            "attempt_count >= 0",
            name="ck_multi_agent_tasks_attempt_count",
        ),
        Index(
            "ix_multi_agent_tasks_tenant_created",
            "tenant_id",
            desc("created_at"),
            desc("id"),
        ),
        Index(
            "ix_multi_agent_tasks_queue",
            "status",
            "created_at",
        ),
        Index(
            "ix_multi_agent_tasks_lease",
            "lease_expires_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="queued",
        server_default=text("'queued'"),
    )

    # Contains the validated TaskRequest; never return this field in task
    # status responses unless a caller explicitly needs its own submitted data.
    request_json: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
    )

    # Bounded, non-sensitive lifecycle information for polling clients.
    progress_json: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )

    result_json: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )

    # Safe machine-readable codes only; do not store raw provider exceptions.
    error_code: Mapped[str | None] = mapped_column(
        String(80),
        nullable=True,
    )

    attempt_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )

    worker_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    # Unique fencing token for each claim attempt.
    lease_token: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )

    lease_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
