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
    assert exported['guide']['version'] == source['guide']['version']
    assert exported['poem'].get('coverImage') == source['poem'].get('coverImage')
    if cover := source['poem'].get('coverImage'):
        assert (path.parent / cover['path']).is_file()
    for key in ['stanzas', 'lines', 'chunks']:
        assert exported[key] == source[key]
    assert [session['id'] for session in exported['sessions']] == [
        session['id'] for session in source['sessions']
    ]
    assert [page['id'] for session in exported['sessions'] for page in session['pages']] == [
        page['id'] for session in source['sessions'] for page in session['pages']
    ]


WORLD_OF_POETRY_IDS = {
    item['poemId'] for item in json.loads(
        (ROOT / 'guides/journeys/a_world_of_poetry/journey.json').read_text()
    )['poems']
}


@pytest.mark.parametrize(
    'path',
    [path for path in PUBLISHED_GUIDES if json.loads(path.read_text())['poem']['id'] in WORLD_OF_POETRY_IDS],
    ids=lambda path: path.parent.name,
)
def test_world_of_poetry_practises_every_days_new_lines_in_the_requested_order(path):
    source = json.loads(path.read_text())
    required = [
        ('last_word_game', 'lastWord'),
        ('first_word_game', 'firstWord'),
        ('first_last_word_game', 'firstAndLast'),
        ('hidden_word_game', 'hiddenWord'),
        ('first_letter_game', 'firstLetter'),
    ]
    chunks = {chunk['id']: chunk for chunk in source['chunks']}
    seen = set()
    for session in sorted(source['sessions'], key=lambda item: item['orderIndex']):
        pages = sorted(session['pages'], key=lambda item: item['orderIndex'])
        # New passages are identified independently of page titles or template
        # metadata. Prior-day recap exercises refer to chunks already seen.
        referenced = {chunk_id for page in pages for chunk_id in page.get('chunkIds', [])}
        new_chunks = referenced - seen
        assert new_chunks, session['id']
        games = [page for page in pages if page['type'].endswith('_game')
                 and set(page.get('chunkIds', [])) & new_chunks]
        assert [(page['type'], page['roundType']) for page in games] == [
            pair for pair in required for _ in new_chunks
        ], session['id']
        for game_type, _ in required:
            round_pages = [page for page in games if page['type'] == game_type]
            assert len(round_pages) == len(new_chunks)
            assert {chunk_id for page in round_pages for chunk_id in page['chunkIds']} == new_chunks
            assert all(len(page['chunkIds']) == 1 for page in round_pages)
            assert all(len(chunks[page['chunkIds'][0]]['lineIds']) <= 2 for page in round_pages)
        assert [page['orderIndex'] for page in pages] == list(range(len(pages)))
        seen |= referenced
    assert seen == chunks.keys()
