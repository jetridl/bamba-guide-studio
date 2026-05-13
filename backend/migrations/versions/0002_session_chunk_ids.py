"""add session chunk ids

Revision ID: 0002_session_chunk_ids
Revises: 0001_initial_schema
Create Date: 2026-05-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_session_chunk_ids"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "guide_sessions",
        sa.Column(
            "chunk_ids_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.alter_column("guide_sessions", "chunk_ids_json", server_default=None)


def downgrade() -> None:
    op.drop_column("guide_sessions", "chunk_ids_json")
