# ruff: noqa: F811
from __future__ import annotations

from test_guides import client, load_example  # noqa: F401

from app.services.json_schema import validate_json_schema


def approved_poem(client):
    guide = client.post('/api/import/guide', json=load_example()).json()
    assert client.post(f"/api/guides/{guide['id']}/approve").status_code == 200
    return guide


def journey_input(poem_id):
    return {'externalId': 'images-of-light', 'title': 'Images of light', 'subtitle': 'A small path',
            'curator': 'Bamba', 'version': 1, 'introduction': ['Listen for the light.'],
            'closing': ['Carry these images with you.'],
            'coverImage': {'path': 'cover.jpg', 'alt': 'A lantern on a winter path'},
            'poems': [{'poemId': poem_id, 'note': ['Begin with the burning image.']}]}


def test_guide_export_is_v2_and_round_trips_line_identity(client):
    guide = approved_poem(client)
    exported = client.get(f"/api/guides/{guide['id']}/export").json()
    assert exported['schemaVersion'] == 2
    assert validate_json_schema(exported, 'guided-plan.schema.json') == []
    assert exported['stanzas'] and exported['lines']
    assert exported['chunks'][0]['lineIds']
    assert 'sectionId' not in exported['chunks'][0]
    imported = client.post('/api/import/guide', json=exported).json()
    assert client.post(f"/api/guides/{imported['id']}/approve").status_code == 200
    again = client.get(f"/api/guides/{imported['id']}/export").json()
    assert again['lines'] == exported['lines']
    assert again['chunks'] == exported['chunks']


def test_journey_editorial_flow_and_version_refresh(client):
    guide = approved_poem(client)
    data = journey_input(guide['poem']['externalId'])
    response = client.post('/api/journeys', json=data)
    assert response.status_code == 200, response.text
    journey = response.json()
    path = f"/api/journeys/{journey['id']}"
    assert client.get(f'{path}/export').status_code == 409
    assert client.post(f'{path}/mark-in-review').json()['status'] == 'in_review'
    assert client.post(f'{path}/approve').json()['status'] == 'approved'
    exported = client.get(f'{path}/export')
    assert exported.status_code == 200, exported.text
    assert validate_json_schema(exported.json(), 'journey.schema.json') == []
    assert exported.json()['journey']['status'] == 'exported'
    assert 'images-of-light_journey.json' in exported.headers['content-disposition']
    assert client.put(path, json=data).status_code == 409
    assert client.post(f'{path}/mark-in-review').status_code == 409
    assert client.post(f'{path}/approve').json()['status'] == 'exported'
    data['version'] = 2
    data['poems'][0]['note'] = ['A revised note.']
    updated = client.put(path, json=data)
    assert updated.status_code == 200, updated.text
    assert updated.json()['status'] == 'draft'
    assert updated.json()['version'] == 2
    assert updated.json()['poems'][0]['note'] == ['A revised note.']


def test_journey_rejects_poems_without_approved_guides(client):
    guide = client.post('/api/import/guide', json=load_example()).json()
    response = client.post('/api/journeys', json=journey_input(guide['poem']['externalId']))
    assert response.status_code == 409
    assert client.get('/api/journey-poems').json() == []


def test_journey_revalidates_guide_status_at_export(client):
    guide = approved_poem(client)
    journey = client.post('/api/journeys', json=journey_input(guide['poem']['externalId'])).json()
    path = f"/api/journeys/{journey['id']}"
    assert client.post(f'{path}/approve').status_code == 200
    assert client.patch(f"/api/guides/{guide['id']}", json={'status': 'draft'}).status_code == 200
    assert client.get(f'{path}/export').status_code == 409
    assert client.get(f'{path}/validate').json()['issues'][0]['code'] == 'poem_without_approved_guide'


def test_journey_rejects_duplicate_poems_and_changed_ids(client):
    guide = approved_poem(client)
    data = journey_input(guide['poem']['externalId'])
    data['poems'] *= 2
    assert client.post('/api/journeys', json=data).status_code == 422
    data['poems'] = data['poems'][:1]
    journey = client.post('/api/journeys', json=data).json()
    data['externalId'] = 'another-id'
    assert client.put(f"/api/journeys/{journey['id']}", json=data).status_code == 409


def test_v2_page_metadata_and_timing_are_preserved(client):
    guide = approved_poem(client)
    exported = client.get(f"/api/guides/{guide['id']}/export").json()
    page = exported['sessions'][0]['pages'][0]
    page['metadata'] = {'editorial': 'keep'}
    page['estimatedSeconds'] = 45
    imported = client.post('/api/import/guide', json=exported).json()
    client.post(f"/api/guides/{imported['id']}/approve")
    result = client.get(f"/api/guides/{imported['id']}/export").json()
    assert result['sessions'][0]['pages'][0]['metadata'] == {'editorial': 'keep'}
    assert result['sessions'][0]['pages'][0]['estimatedSeconds'] == 45


def test_journey_order_notes_and_removal_are_saved(client):
    first = approved_poem(client)
    second_payload = load_example()
    second_payload['poem']['id'] = 'second-poem'
    second_payload['poem']['title'] = 'Another poem'
    second_payload['guide']['id'] = 'second-guide'
    second_payload['guide']['poemId'] = 'second-poem'
    second = client.post('/api/import/guide', json=second_payload).json()
    assert client.post(f"/api/guides/{second['id']}/approve").status_code == 200
    data = journey_input(first['poem']['externalId'])
    data['poems'].append({'poemId': 'second-poem', 'note': ['A second image.']})
    created = client.post('/api/journeys', json=data).json()
    path = f"/api/journeys/{created['id']}"
    data['poems'].reverse()
    updated = client.put(path, json=data)
    assert updated.status_code == 200
    assert [p['poemId'] for p in updated.json()['poems']] == ['second-poem', first['poem']['externalId']]
    data['poems'] = data['poems'][:1]
    assert client.put(path, json=data).json()['poems'][0]['note'] == ['A second image.']
    assert len(client.get(path).json()['poems']) == 1


def test_journey_draft_saves_gaps_but_validation_blocks_them(client):
    guide = approved_poem(client)
    data = journey_input(guide['poem']['externalId'])
    data['introduction'] = []
    data['closing'] = []
    data['poems'][0]['note'] = []
    created = client.post('/api/journeys', json=data)
    assert created.status_code == 200, created.text
    path = f"/api/journeys/{created.json()['id']}"
    codes = {issue['code'] for issue in client.get(f'{path}/validate').json()['issues']}
    assert codes == {'missing_introduction', 'missing_note'}
    assert client.post(f'{path}/approve').status_code == 409

    data['introduction'] = ['Listen for the light.']
    data['poems'][0]['note'] = ['Begin with the burning image.']
    assert client.put(path, json=data).status_code == 200
    assert client.post(f'{path}/approve').status_code == 200
    exported = client.get(f'{path}/export').json()
    assert 'closing' not in exported['journey']
    assert validate_json_schema(exported, 'journey.schema.json') == []


def test_journey_requires_subtitle(client):
    guide = approved_poem(client)
    data = journey_input(guide['poem']['externalId'])
    data['subtitle'] = '  '
    assert client.post('/api/journeys', json=data).status_code == 422


def test_journey_cover_image_round_trips_into_export(client):
    guide = approved_poem(client)
    data = journey_input(guide['poem']['externalId'])
    data['coverImage'] = {'path': ' cover.jpg ', 'alt': ' A lantern on a winter path '}
    journey = client.post('/api/journeys', json=data).json()
    assert journey['coverImage'] == {'path': 'cover.jpg', 'alt': 'A lantern on a winter path'}
    path = f"/api/journeys/{journey['id']}"
    assert client.post(f'{path}/approve').status_code == 200
    exported = client.get(f'{path}/export').json()
    assert validate_json_schema(exported, 'journey.schema.json') == []
    assert exported['journey']['coverImage'] == {'path': 'cover.jpg', 'alt': 'A lantern on a winter path'}


def test_journey_without_cover_saves_but_cannot_be_approved(client):
    guide = approved_poem(client)
    data = journey_input(guide['poem']['externalId'])
    data['coverImage'] = {'path': '', 'alt': '  '}
    journey = client.post('/api/journeys', json=data).json()
    assert journey['coverImage'] is None
    path = f"/api/journeys/{journey['id']}"
    assert [issue['code'] for issue in client.get(f'{path}/validate').json()['issues']] == ['missing_cover']
    assert client.post(f'{path}/approve').status_code == 409
    assert client.get(f'{path}/export').status_code == 409


def test_journey_cover_gaps_save_but_block_approval(client):
    guide = approved_poem(client)
    data = journey_input(guide['poem']['externalId'])
    cases = [
        ({'path': 'cover.jpg', 'alt': ''}, {'missing_cover_alt'}),
        ({'path': '', 'alt': 'A lantern'}, {'missing_cover'}),
        ({'path': '../cover.jpg', 'alt': 'A lantern'}, {'cover_image_path'}),
        ({'path': 'images/cover.jpg', 'alt': 'A lantern'}, {'cover_image_path'}),
        ({'path': 'cover.gif', 'alt': ''}, {'cover_image_path', 'missing_cover_alt'}),
    ]
    journey = client.post('/api/journeys', json=data).json()
    path = f"/api/journeys/{journey['id']}"
    for cover, codes in cases:
        data['coverImage'] = cover
        saved = client.put(path, json=data)
        assert saved.status_code == 200, saved.text
        result = client.get(f'{path}/validate').json()
        assert {issue['code'] for issue in result['issues']} == codes, cover
        assert client.post(f'{path}/approve').status_code == 409


def write_journey(folder, journey_id, poem_ids, status='draft'):
    import json
    (folder / journey_id).mkdir(parents=True)
    (folder / journey_id / 'journey.json').write_text(json.dumps({
        'schemaVersion': 1,
        'journey': {'id': journey_id, 'version': 2, 'status': status, 'title': 'Images of light',
                    'subtitle': 'A small path', 'curator': 'Bamba', 'introduction': ['Listen for the light.'],
                    'coverImage': {'path': 'cover.png', 'alt': 'A lamp on a desk.'}},
        'poems': [{'poemId': poem_id, 'note': [f'Why {poem_id} belongs.']} for poem_id in poem_ids],
    }))


def test_refresh_adds_new_journey_files_once(client, tmp_path, monkeypatch):
    from app.core.config import settings

    poem_id = approved_poem(client)['poem']['externalId']
    write_journey(tmp_path, 'images-of-light', [poem_id], status='approved')
    monkeypatch.setattr(settings, 'journeys_dir', tmp_path)
    monkeypatch.setattr(settings, 'published_journeys_dir', tmp_path / 'absent')

    first = client.post('/api/journeys/refresh').json()
    assert first['loaded'] == ['images-of-light'] and first['failed'] == []
    journey = client.get('/api/journeys').json()[0]
    assert journey['status'] == 'approved'  # the file's status, because it passes validation
    assert journey['version'] == 2
    assert journey['coverImage'] == {'path': 'cover.png', 'alt': 'A lamp on a desk.'}
    assert journey['poems'][0]['note'] == [f'Why {poem_id} belongs.']

    data = journey_input(poem_id)
    data['title'] = 'Edited in Studio'
    data['version'] = 2
    assert client.put(f"/api/journeys/{journey['id']}", json=data).status_code == 200
    second = client.post('/api/journeys/refresh').json()
    assert second['loaded'] == [] and second['skipped'] == ['images-of-light']
    assert client.get('/api/journeys').json()[0]['title'] == 'Edited in Studio'


def test_refresh_reports_journeys_it_cannot_import(client, tmp_path, monkeypatch):
    from app.core.config import settings

    write_journey(tmp_path, 'unknown-poem', ['not_in_studio'])
    (tmp_path / 'broken').mkdir()
    (tmp_path / 'broken' / 'journey.json').write_text('{ not json')
    (tmp_path / 'wrong-shape').mkdir()
    (tmp_path / 'wrong-shape' / 'journey.json').write_text('{"schemaVersion": 1}')
    monkeypatch.setattr(settings, 'journeys_dir', tmp_path)
    monkeypatch.setattr(settings, 'published_journeys_dir', tmp_path / 'absent')

    result = client.post('/api/journeys/refresh').json()

    assert result['loaded'] == []
    assert sorted(result['failed']) == ['broken', 'unknown-poem', 'wrong-shape']
    assert any('not_in_studio' in problem for problem in result['problems'])
    assert client.get('/api/journeys').json() == []


def test_refresh_with_missing_folder_adds_nothing(client, tmp_path, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, 'journeys_dir', tmp_path / 'absent')
    monkeypatch.setattr(settings, 'published_journeys_dir', tmp_path / 'absent')
    assert client.post('/api/journeys/refresh').json() == {'loaded': [], 'skipped': [], 'failed': [], 'problems': []}
