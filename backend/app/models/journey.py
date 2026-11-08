from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.core.database import Base
from app.models.guide import Poem, TimestampMixin, json_type


class Journey(Base, TimestampMixin):
    __tablename__ = "journeys"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    subtitle: Mapped[str] = mapped_column(String, nullable=False, default="")
    curator: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    introduction_json: Mapped[list[str]] = mapped_column(json_type, default=list, nullable=False)
    closing_json: Mapped[list[str]] = mapped_column(json_type, default=list, nullable=False)
    # {"path": "<file name beside journey.json>", "alt": "<screen reader text>"}, or None.
    cover_image_json: Mapped[dict[str, str] | None] = mapped_column(json_type, nullable=True)
    poems: Mapped[list[JourneyPoem]] = relationship(
        back_populates="journey", cascade="all, delete-orphan", order_by="JourneyPoem.order_index"
    )


class JourneyPoem(Base):
    __tablename__ = "journey_poems"
    __table_args__ = (
        UniqueConstraint("journey_id", "poem_id", name="uq_journey_poem"),
        UniqueConstraint("journey_id", "external_id", name="uq_journey_poem_external"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str] = mapped_column(String, nullable=False)
    journey_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("journeys.id", ondelete="CASCADE"), nullable=False)
    poem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("poems.id"), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    note_json: Mapped[list[str]] = mapped_column(json_type, default=list, nullable=False)
    journey: Mapped[Journey] = relationship(back_populates="poems")
    poem: Mapped[Poem] = relationship()
