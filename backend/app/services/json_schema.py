from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[3]


@lru_cache
def load_schema(name: str) -> dict[str, Any]:
    with (ROOT / "schemas" / name).open() as schema_file:
        return json.load(schema_file)


def validate_json_schema(payload: dict[str, Any], schema_name: str) -> list[str]:
    validator = Draft202012Validator(load_schema(schema_name))
    errors = sorted(validator.iter_errors(payload), key=lambda error: list(error.path))
    return [f"{'/'.join(str(part) for part in error.path) or '$'}: {error.message}" for error in errors]
