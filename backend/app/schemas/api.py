from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class PagePatch(CamelModel):
    type: str | None = None
    title: str | None = None
    body_markdown: str | None = Field(default=None, alias="bodyMarkdown")
    prompt: str | None = None
    chunk_ids: list[str] | None = Field(default=None, alias="chunkIds")
    round_type: str | None = Field(default=None, alias="roundType")
    order_index: int | None = Field(default=None, alias="orderIndex")


class SessionPatch(CamelModel):
    session_number: int | None = Field(default=None, alias="sessionNumber")
    title: str | None = None
    subtitle: str | None = None
    focus_summary: str | None = Field(default=None, alias="focusSummary")
    chunk_ids: list[str] | None = Field(default=None, alias="chunkIds")
    order_index: int | None = Field(default=None, alias="orderIndex")
    metadata: dict[str, Any] | None = None


class GuidePatch(CamelModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    metadata: dict[str, Any] | None = None
    content_version: int | None = Field(default=None, alias="contentVersion", ge=1)


class ReorderItem(CamelModel):
    id: str
    order_index: int = Field(alias="orderIndex")


class ReorderPayload(CamelModel):
    items: list[ReorderItem]


class ReviewCommentPatch(CamelModel):
    status: str


class ValidationIssue(CamelModel):
    severity: str
    code: str
    message: str
    target_type: str = Field(alias="targetType")
    target_id: str | None = Field(default=None, alias="targetId")
    field: str | None = None
