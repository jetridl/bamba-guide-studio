from __future__ import annotations

GAME_PAGE_ROUND_TYPES = {
    "first_letter_game": "firstLetter",
    "full_chunk_typing_game": "fullChunkTyping",
    "last_word_game": "lastWord",
    "first_last_word_game": "firstAndLast",
    "hidden_word_game": "hiddenWord",
}


def derive_round_type(page_type: str) -> str | None:
    return GAME_PAGE_ROUND_TYPES.get(page_type)
