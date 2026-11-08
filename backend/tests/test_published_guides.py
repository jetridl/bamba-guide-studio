# ruff: noqa: F811
from __future__ import annotations

import json
from pathlib import Path

import pytest
from test_guides import client  # noqa: F401

from app.services.json_schema import validate_json_schema

ROOT = Path(__file__).resolve().parents[2]
PUBLISHED_GUIDES = sorted((ROOT / 'exports/curated_poems').glob('*/guided_plan.json'))


@pytest.mark.parametrize('path', PUBLISHED_GUIDES, ids=lambda path: path.parent.name)
def test_published_app_guide_imports_and_preserves_external_ids(client, path):
    source = json.loads(path.read_text())
    assert source['guide']['status'] in {'approved', 'exported'}
    assert validate_json_schema(source, 'guided-plan.schema.json') == []
    alias = ROOT / 'guides/json' / f'{path.parent.name}.json'
    assert alias.is_symlink()
    assert alias.read_bytes() == path.read_bytes()

    imported = client.post('/api/import/guide', json=source)
    assert imported.status_code == 200, imported.text
    guide_id = imported.json()['id']
    approved = client.post(f'/api/guides/{guide_id}/approve')
    assert approved.status_code == 200, approved.text
    response = client.get(f'/api/guides/{guide_id}/export')
    assert response.status_code == 200, response.text
    exported = response.json()
    assert exported['poem']['id'] == source['poem']['id']
    assert exported['guide']['poemId'] == source['guide']['poemId']
    for key in ['stanzas', 'lines', 'chunks']:
        assert exported[key] == source[key]
    assert [session['id'] for session in exported['sessions']] == [
        session['id'] for session in source['sessions']
    ]
    assert [page['id'] for session in exported['sessions'] for page in session['pages']] == [
        page['id'] for session in source['sessions'] for page in session['pages']
    ]
