"""Add tenant-scoped incident intelligence records.

Revision ID: 9c31a8d42e10
Revises: 48fedefa1eff
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "9c31a8d42e10"
down_revision = "48fedefa1eff"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "incidents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(250), nullable=False),
        sa.Column("service", sa.String(150), nullable=False),
        sa.Column(
            "status", sa.String(30), nullable=False, server_default="detected"
        ),
        sa.Column("investigation_json", postgresql.JSONB(), nullable=True),
        sa.Column("action_json", postgresql.JSONB(), nullable=True),
        sa.Column("approval_token_hash", sa.String(64), nullable=True),
        sa.Column("approval_action_hash", sa.String(64), nullable=True),
        sa.Column("approval_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_json", postgresql.JSONB(), nullable=True),
        sa.Column(
            "audit_json",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "id", name="uq_incidents_tenant_id_id"),
    )
    op.create_index(
        "ix_incidents_tenant_created", "incidents", ["tenant_id", "created_at"]
    )
    op.create_index(
        "ix_incidents_tenant_status", "incidents", ["tenant_id", "status"]
    )

    op.create_table(
        "incident_evidence",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("incident_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("evidence_key", sa.String(100), nullable=False),
        sa.Column("evidence_type", sa.String(40), nullable=False),
        sa.Column("source", sa.String(100), nullable=False),
        sa.Column("observation", sa.Text(), nullable=False),
        sa.Column(
            "details_json",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["tenant_id", "incident_id"],
            ["incidents.tenant_id", "incidents.id"],
            ondelete="CASCADE",
            name="fk_incident_evidence_tenant_incident",
        ),
        sa.UniqueConstraint(
            "tenant_id", "incident_id", "evidence_key",
            name="uq_incident_evidence_key",
        ),
    )
    op.create_index(
        "ix_incident_evidence_incident",
        "incident_evidence",
        ["tenant_id", "incident_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_incident_evidence_incident", table_name="incident_evidence")
    op.drop_table("incident_evidence")
    op.drop_index("ix_incidents_tenant_status", table_name="incidents")
    op.drop_index("ix_incidents_tenant_created", table_name="incidents")
    op.drop_table("incidents")
