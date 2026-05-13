from __future__ import annotations

from app.models import PoemChunk


def chunk_sort_key(chunk: PoemChunk) -> tuple[int, int, str]:
    section_order = chunk.section.order_index if chunk.section else 1_000_000
    return (section_order, chunk.order_index, chunk.external_id)
