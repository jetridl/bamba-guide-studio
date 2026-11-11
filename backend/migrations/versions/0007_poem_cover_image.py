"""Preserve bundled poem cover references on import and export.

Revision ID: 0007_poem_cover_image
Revises: 0006_journey_cover_image
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_poem_cover_image"
down_revision = "0006_journey_cover_image"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("poems", sa.Column("cover_image_json", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("poems", "cover_image_json")
