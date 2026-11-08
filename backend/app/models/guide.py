from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON, Uuid

from app.core.database import Base

json_type = JSON().with_variant(JSONB, "postgresql")


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Poem(Base, TimestampMixin):
    __tablename__ = "poems"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    author: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    year: Mapped[int | None] = mapped_column(Integer)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(json_type, default=dict, nullable=False)

    structure_json: Mapped[dict[str, Any] | None] = mapped_column(json_type)

    sections: Mapped[list[PoemSection]] = relationship(
        back_populates="poem", cascade="all, delete-orphan", order_by="PoemSection.order_index"
    )
    chunks: Mapped[list[PoemChunk]] = relationship(
        back_populates="poem", cascade="all, delete-orphan", order_by="PoemChunk.order_index"
    )
    guides: Mapped[list[Guide]] = relationship(back_populates="poem")


class PoemSection(Base, TimestampMixin):
    __tablename__ = "poem_sections"
    __table_args__ = (UniqueConstraint("poem_id", "external_id", name="uq_poem_section_external"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str] = mapped_column(String, nullable=False)
    poem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("poems.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str | None] = mapped_column(String)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)

    poem: Mapped[Poem] = relationship(back_populates="sections")
    chunks: Mapped[list[PoemChunk]] = relationship(back_populates="section")


class PoemChunk(Base, TimestampMixin):
    __tablename__ = "poem_chunks"
    __table_args__ = (UniqueConstraint("poem_id", "external_id", name="uq_poem_chunk_external"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str] = mapped_column(String, nullable=False)
    poem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("poems.id", ondelete="CASCADE"), nullable=False)
    section_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("poem_sections.id", ondelete="SET NULL"))
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(json_type, default=dict, nullable=False)

    poem: Mapped[Poem] = relationship(back_populates="chunks")
    section: Mapped[PoemSection | None] = relationship(back_populates="chunks")


class Guide(Base, TimestampMixin):
    __tablename__ = "guides"
    __table_args__ = (UniqueConstraint("external_id", "version", name="uq_guide_external_version"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str] = mapped_column(String, index=True, nullable=False)
    poem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("poems.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    metadata_json: Mapped[dict[str, Any]] = mapped_column(json_type, default=dict, nullable=False)
    import_snapshot_json: Mapped[dict[str, Any] | None] = mapped_column(json_type)

    poem: Mapped[Poem] = relationship(back_populates="guides")
    sessions: Mapped[list[GuideSession]] = relationship(
        back_populates="guide", cascade="all, delete-orphan", order_by="GuideSession.order_index"
    )
    reviews: Mapped[list[GuideReview]] = relationship(back_populates="guide", cascade="all, delete-orphan")


class GuideSession(Base, TimestampMixin):
    __tablename__ = "guide_sessions"
    __table_args__ = (UniqueConstraint("guide_id", "external_id", name="uq_guide_session_external"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str] = mapped_column(String, nullable=False)
    guide_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("guides.id", ondelete="CASCADE"), nullable=False)
    session_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    subtitle: Mapped[str | None] = mapped_column(String)
    focus_summary: Mapped[str | None] = mapped_column(Text)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_ids_json: Mapped[list[str]] = mapped_column(json_type, default=list, nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(json_type, default=dict, nullable=False)

    guide: Mapped[Guide] = relationship(back_populates="sessions")
    pages: Mapped[list[GuidePage]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="GuidePage.order_index"
    )


class GuidePage(Base, TimestampMixin):
    __tablename__ = "guide_pages"
    __table_args__ = (UniqueConstraint("session_id", "external_id", name="uq_guide_page_external"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str] = mapped_column(String, nullable=False)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("guide_sessions.id", ondelete="CASCADE"), nullable=False)
    estimated_seconds: Mapped[int | None] = mapped_column(Integer)
    page_type: Mapped[str] = mapped_column(String, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String)
    body_markdown: Mapped[str | None] = mapped_column(Text)
    chunk_ids_json: Mapped[list[str]] = mapped_column(json_type, default=list, nullable=False)
    round_type: Mapped[str | None] = mapped_column(String)
    prompt: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(json_type, default=dict, nullable=False)
    session: Mapped[GuideSession] = relationship(back_populates="pages")


class GuideReview(Base):
    __tablename__ = "guide_reviews"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    guide_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("guides.id", ondelete="CASCADE"), nullable=False)
    reviewer: Mapped[str] = mapped_column(String, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    raw_json: Mapped[dict[str, Any]] = mapped_column(json_type, nullable=False)

    guide: Mapped[Guide] = relationship(back_populates="reviews")
    comments: Mapped[list[GuideReviewComment]] = relationship(
        back_populates="review", cascade="all, delete-orphan", order_by="GuideReviewComment.created_at"
    )


class GuideReviewComment(Base, TimestampMixin):
    __tablename__ = "guide_review_comments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str] = mapped_column(String, nullable=False)
    review_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("guide_reviews.id", ondelete="CASCADE"), nullable=False)
    target_type: Mapped[str] = mapped_column(String, nullable=False)
    target_external_id: Mapped[str | None] = mapped_column(String)
    target_db_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    field: Mapped[str | None] = mapped_column(String)
    severity: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    suggested_revision: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, nullable=False, default="open")

    review: Mapped[GuideReview] = relationship(back_populates="comments")
