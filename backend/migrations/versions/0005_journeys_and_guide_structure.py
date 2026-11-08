"""Journeys and lossless schema v2 guide structure.

Revision ID: 0005_journeys_guide_structure
Revises: 0004_drop_page_estimated_seconds
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005_journeys_guide_structure"
down_revision = "0004_drop_page_estimated_seconds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("poems", sa.Column("structure_json", postgresql.JSONB(), nullable=True))
    op.add_column("guide_pages", sa.Column("estimated_seconds", sa.Integer(), nullable=True))
    op.create_table("journeys",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("external_id", sa.String(), nullable=False, unique=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("subtitle", sa.String(), nullable=False),
        sa.Column("curator", sa.String(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("introduction_json", postgresql.JSONB(), nullable=False),
        sa.Column("closing_json", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_table("journey_poems",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("external_id", sa.String(), nullable=False),
        sa.Column("journey_id", sa.Uuid(), sa.ForeignKey("journeys.id", ondelete="CASCADE"), nullable=False),
        sa.Column("poem_id", sa.Uuid(), sa.ForeignKey("poems.id"), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("note_json", postgresql.JSONB(), nullable=False),
        sa.UniqueConstraint("journey_id", "poem_id", name="uq_journey_poem"),
        sa.UniqueConstraint("journey_id", "external_id", name="uq_journey_poem_external"))


def downgrade() -> None:
    op.drop_table("journey_poems")
    op.drop_table("journeys")
    op.drop_column("guide_pages", "estimated_seconds")
    op.drop_column("poems", "structure_json")
