"""Journey cover image.

Revision ID: 0006_journey_cover_image
Revises: 0005_journeys_guide_structure
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0006_journey_cover_image"
down_revision = "0005_journeys_guide_structure"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("journeys", sa.Column("cover_image_json", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("journeys", "cover_image_json")
