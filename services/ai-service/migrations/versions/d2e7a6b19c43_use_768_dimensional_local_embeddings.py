"""Use 768-dimensional local embedding vectors.

Revision ID: d2e7a6b19c43
Revises: c4d8a1f2097b
"""

from typing import Sequence, Union

from alembic import op
from pgvector.sqlalchemy import VECTOR


revision: str = "d2e7a6b19c43"
down_revision: Union[str, Sequence[str], None] = "c4d8a1f2097b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM document_chunks
                WHERE embedding IS NOT NULL
            ) THEN
                RAISE EXCEPTION
                    'Cannot change embedding dimensions: existing embeddings '
                    'must be re-generated with the local 768-dimensional model first.';
            END IF;
        END
        $$;
        """
    )

    op.alter_column(
        "document_chunks",
        "embedding",
        existing_type=VECTOR(dim=1536),
        type_=VECTOR(dim=768),
        existing_nullable=True,
        postgresql_using="embedding::vector(768)",
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM document_chunks
                WHERE embedding IS NOT NULL
            ) THEN
                RAISE EXCEPTION
                    'Cannot downgrade embedding dimensions while embeddings exist.';
            END IF;
        END
        $$;
        """
    )

    op.alter_column(
        "document_chunks",
        "embedding",
        existing_type=VECTOR(dim=768),
        type_=VECTOR(dim=1536),
        existing_nullable=True,
        postgresql_using="embedding::vector(1536)",
    )
