from __future__ import annotations

GAME_PAGE_ROUND_TYPES = {
    "first_word_game": "firstWord",
    "first_letter_game": "firstLetter",
    "full_chunk_typing_game": "fullChunkTyping",
    "last_word_game": "lastWord",
    "first_last_word_game": "firstAndLast",
    "hidden_word_game": "hiddenWord",
}


def derive_round_type(page_type: str) -> str | None:
    return GAME_PAGE_ROUND_TYPES.get(page_type)


CHUNK_SCOPED_PAGE_TYPES = set(GAME_PAGE_ROUND_TYPES) | {"poem_chunk"}

# Studio can author these page types, but the Bamba app parser cannot render them yet.
# `fullChunkTyping` makes the app reject the whole guide; the other two show an empty page.
# Export stays blocked until the app supports them.
APP_UNSUPPORTED_PAGE_TYPES = {"recap_previous", "whole_poem", "full_chunk_typing_game"}
