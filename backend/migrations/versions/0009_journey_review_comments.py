"""Review notes on Journeys, the same shape as guide review notes.

Revision ID: 0009_journey_review_comments
Revises: 0008_content_versions
"""
import sqlalchemy as sa
from alembic import op

revision = "0009_journey_review_comments"
down_revision = "0008_content_versions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "journey_review_comments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("external_id", sa.String(), nullable=False),
        sa.Column("journey_id", sa.Uuid(), sa.ForeignKey("journeys.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewer", sa.String(), nullable=False),
        sa.Column("target_type", sa.String(), nullable=False),
        sa.Column("target_external_id", sa.String(), nullable=True),
        sa.Column("severity", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("suggested_revision", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_journey_review_comments_journey_id", "journey_review_comments", ["journey_id"])


def downgrade() -> None:
    op.drop_index("ix_journey_review_comments_journey_id", table_name="journey_review_comments")
    op.drop_table("journey_review_comments")
