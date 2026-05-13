"""drop page estimated seconds

Revision ID: 0004_drop_page_estimated_seconds
Revises: 0003_backfill_session_chunk_ids
Create Date: 2026-05-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_drop_page_estimated_seconds"
down_revision: str | None = "0003_backfill_session_chunk_ids"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("guide_pages", "estimated_seconds")


def downgrade() -> None:
    op.add_column("guide_pages", sa.Column("estimated_seconds", sa.Integer(), nullable=True))
