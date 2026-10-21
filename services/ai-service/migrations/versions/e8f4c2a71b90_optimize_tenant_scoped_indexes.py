"""Optimize tenant-scoped indexes.

Revision ID: e8f4c2a71b90
Revises: d2e7a6b19c43
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e8f4c2a71b90"
down_revision: Union[str, Sequence[str], None] = "d2e7a6b19c43"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_documents_tenant_created_id",
        "documents",
        ["tenant_id", sa.text("created_at DESC"), sa.text("id DESC")],
        unique=False,
    )
    op.drop_index("ix_documents_tenant_created", table_name="documents")
    op.drop_index("ix_documents_tenant_id", table_name="documents")
    op.drop_index("ix_tenants_relay_user_id", table_name="tenants")
    op.drop_index("ix_incident_evidence_incident", table_name="incident_evidence")


def downgrade() -> None:
    op.create_index(
        "ix_incident_evidence_incident",
        "incident_evidence",
        ["tenant_id", "incident_id"],
        unique=False,
    )
    op.create_index(
        "ix_tenants_relay_user_id",
        "tenants",
        ["relay_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_documents_tenant_id",
        "documents",
        ["tenant_id"],
        unique=False,
    )
    op.drop_index("ix_documents_tenant_created_id", table_name="documents")
    op.create_index(
        "ix_documents_tenant_created",
        "documents",
        ["tenant_id", "created_at"],
        unique=False,
    )
