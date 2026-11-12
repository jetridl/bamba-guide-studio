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


NEW_WORLD_GUIDE_IDS = WORLD_OF_POETRY_IDS - {'the_road_not_taken', 'o_captain_my_captain'}


@pytest.mark.parametrize(
    'path',
    [path for path in PUBLISHED_GUIDES if json.loads(path.read_text())['poem']['id'] in NEW_WORLD_GUIDE_IDS],
    ids=lambda path: path.parent.name,
)
def test_new_world_guides_alternate_text_and_practice_after_two_day_recaps(path):
    source = json.loads(path.read_text())
    round_order = [
        'last_word_game', 'first_word_game', 'first_last_word_game',
        'hidden_word_game', 'first_letter_game',
    ]
    readable = {'commentary', 'context', 'poet_background', 'poem_background', 'poem_chunk'}
    previous_passages = []
    for session in sorted(source['sessions'], key=lambda item: item['orderIndex']):
        pages = sorted(session['pages'], key=lambda item: item['orderIndex'])
        today_index = next(index for index, page in enumerate(pages)
                           if page.get('metadata', {}).get('scope') == 'today_chunks')
        current = pages[today_index]['chunkIds']
        recaps = [page for page in pages if page.get('metadata', {}).get('recapOffsetDays')]
        intros = [page for page in pages if page.get('metadata', {}).get('scope') == 'recap_intro']
        assert len(intros) == bool(previous_passages)
        expected_recaps = []
        if len(previous_passages) >= 2:
            expected_recaps.extend((2, 'hidden_word_game', [chunk]) for chunk in previous_passages[-2])
        if previous_passages:
            expected_recaps.extend((1, 'first_last_word_game', [chunk]) for chunk in previous_passages[-1])
        assert [(page['metadata']['recapOffsetDays'], page['type'], page['chunkIds'])
                for page in recaps] == expected_recaps
        whole_index = next(index for index, page in enumerate(pages)
                           if page.get('metadata', {}).get('scope') == 'whole_poem')
        assert whole_index < today_index
        assert all(page['orderIndex'] < whole_index for page in recaps)
        assert all(page['bodyMarkdown'] == source['poem']['text'] for page in pages
                   if page.get('metadata', {}).get('scope') == 'whole_poem')

        ranges = []
        for kind in round_order:
            indices = [index for index, page in enumerate(pages)
                       if page['type'] == kind and not page.get('metadata', {}).get('recapOffsetDays')]
            assert len(indices) == len(current)
            assert indices == list(range(min(indices), max(indices) + 1))
            assert today_index < min(indices)
            ranges.append((min(indices), max(indices)))
        for (_, last_index), (next_index, _) in zip(ranges, ranges[1:]):
            assert last_index < next_index
            assert any(page['type'] in readable and len((page.get('bodyMarkdown') or '').split()) >= 8
                       for page in pages[last_index + 1:next_index]), session['id']
        assert all(page['orderIndex'] > ranges[-1][1] for page in pages
                   if page['type'] in {'reflection', 'completion'})
        expected_scope = {chunk for passage in previous_passages[-2:] for chunk in passage} | set(current)
        assert set(session['chunkIds']) == expected_scope
        previous_passages.append(current)
