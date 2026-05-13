"""backfill session chunk ids from page chunks

Revision ID: 0003_backfill_session_chunk_ids
Revises: 0002_session_chunk_ids
Create Date: 2026-05-12
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0003_backfill_session_chunk_ids"
down_revision: str | None = "0002_session_chunk_ids"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        WITH expanded AS (
            SELECT
                guide_pages.session_id,
                chunk_item.chunk_id,
                MIN((guide_pages.order_index * 100000) + chunk_item.ordinality) AS sort_order
            FROM guide_pages
            CROSS JOIN LATERAL jsonb_array_elements_text(guide_pages.chunk_ids_json)
                WITH ORDINALITY AS chunk_item(chunk_id, ordinality)
            GROUP BY guide_pages.session_id, chunk_item.chunk_id
        ),
        backfill AS (
            SELECT
                session_id,
                jsonb_agg(chunk_id ORDER BY sort_order) AS chunk_ids
            FROM expanded
            GROUP BY session_id
        )
        UPDATE guide_sessions
        SET chunk_ids_json = backfill.chunk_ids
        FROM backfill
        WHERE guide_sessions.id = backfill.session_id
            AND guide_sessions.chunk_ids_json = '[]'::jsonb
        """
    )


def downgrade() -> None:
    pass
