"""Map Python tenants to authenticated Relay users.

Revision ID: b7a2c91d4e60
Revises: 9c31a8d42e10
"""

from alembic import op
import sqlalchemy as sa

revision = "b7a2c91d4e60"
down_revision = "9c31a8d42e10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("relay_user_id", sa.String(length=24), nullable=True),
    )
    op.create_unique_constraint(
        "uq_tenants_relay_user_id",
        "tenants",
        ["relay_user_id"],
    )
    op.create_index(
        "ix_tenants_relay_user_id",
        "tenants",
        ["relay_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_tenants_relay_user_id", table_name="tenants")
    op.drop_constraint(
        "uq_tenants_relay_user_id",
        "tenants",
        type_="unique",
    )
    op.drop_column("tenants", "relay_user_id")
