"""Keep every guide and Journey version: guide content versions and Journey history.

Revision ID: 0008_content_versions
Revises: 0007_poem_cover_image
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008_content_versions"
down_revision = "0007_poem_cover_image"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("guides", sa.Column("content_version", sa.Integer(), nullable=False, server_default="1"))
    # A saved version is its own content version. The working copy (version 0)
    # exports the version of the file it was imported from.
    op.execute("UPDATE guides SET content_version = version WHERE version > 0")
    op.execute(
        """
        UPDATE guides SET content_version = (import_snapshot_json -> 'guide' ->> 'version')::int
        WHERE version = 0 AND jsonb_typeof(import_snapshot_json -> 'guide' -> 'version') = 'number'
        """
    )
    op.create_table(
        "journey_versions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("journey_id", sa.Uuid(), sa.ForeignKey("journeys.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("journey_id", "version", name="uq_journey_version"),
    )


def downgrade() -> None:
    op.drop_table("journey_versions")
    op.drop_column("guides", "content_version")
