"""Add durable multi-agent task queue.

Revision ID: f3a7b9c2d601
Revises: e8f4c2a71b90
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "f3a7b9c2d601"
down_revision: Union[str, Sequence[str], None] = "e8f4c2a71b90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "multi_agent_tasks",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'queued'"),
            nullable=False,
        ),
        sa.Column(
            "request_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "progress_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "result_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "error_code",
            sa.String(length=80),
            nullable=True,
        ),
        sa.Column(
            "attempt_count",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "worker_id",
            sa.String(length=100),
            nullable=True,
        ),
        sa.Column(
            "lease_token",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "lease_expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "finished_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'completed', 'failed', 'cancelled')",
            name="ck_multi_agent_tasks_status",
        ),
        sa.CheckConstraint(
            "attempt_count >= 0",
            name="ck_multi_agent_tasks_attempt_count",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_multi_agent_tasks_tenant_id_tenants",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_multi_agent_tasks"),
    )

    op.create_index(
        "ix_multi_agent_tasks_tenant_created",
        "multi_agent_tasks",
        ["tenant_id", sa.text("created_at DESC"), sa.text("id DESC")],
        unique=False,
    )
    op.create_index(
        "ix_multi_agent_tasks_queue",
        "multi_agent_tasks",
        ["status", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_multi_agent_tasks_lease",
        "multi_agent_tasks",
        ["lease_expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_multi_agent_tasks_lease",
        table_name="multi_agent_tasks",
    )
    op.drop_index(
        "ix_multi_agent_tasks_queue",
        table_name="multi_agent_tasks",
    )
    op.drop_index(
        "ix_multi_agent_tasks_tenant_created",
        table_name="multi_agent_tasks",
    )
    op.drop_table("multi_agent_tasks")
