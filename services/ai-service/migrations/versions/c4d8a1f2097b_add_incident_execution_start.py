"""Add execution start timestamp for incident recovery."""

from alembic import op
import sqlalchemy as sa

revision = "c4d8a1f2097b"
down_revision = "b7a2c91d4e60"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "incidents",
        sa.Column("execution_started_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column("incidents", "execution_started_at")
