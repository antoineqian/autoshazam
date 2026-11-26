import io
import json

import pytest
from fastapi.testclient import TestClient
from pydub import AudioSegment
from pydub.generators import Sine

from backend.src.app import main
from backend.src.infra import original_audio


@pytest.fixture
def recovery(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    with TestClient(main.app) as client:
        yield client


def recording():
    # Silence then a tone makes a wrong timestamp observable in the output.
    audio = AudioSegment.silent(duration=1000) + Sine(440).to_audio_segment(duration=1000)
    buffer = io.BytesIO()
    audio.export(buffer, format='wav')
    return buffer.getvalue()


def test_file_restores_all_requested_timestamps_without_recognition(recovery, monkeypatch):
    async def no_recognition(*args, **kwargs):
        pytest.fail('Recovery must not call Shazam')

    monkeypatch.setattr(main, 'shazam_file', no_recognition)
    response = recovery.post('/original-audio/restore', data={
        'points': json.dumps([{'id': 2, 'position': 0}, {'id': 3, 'position': 1 / 60}]),
    }, files={'file': ('original.wav', recording(), 'audio/wav')})
    assert response.status_code == 200
    clips = response.json()
    assert [clip['id'] for clip in clips] == [2, 3]
    assert clips[0]['originalClipId'] != clips[1]['originalClipId']
    first = AudioSegment.from_mp3(original_audio.clip_path(clips[0]['originalClipId']))
    second = AudioSegment.from_mp3(original_audio.clip_path(clips[1]['originalClipId']))
    assert first[:500].rms == 0
    assert second[:500].rms > 1000
    assert len(second) == 1000
    assert recovery.get('/original-audio/' + clips[1]['originalClipId']).status_code == 200


def test_url_restores_existing_tracks(recovery, monkeypatch, tmp_path):
    path = tmp_path / 'download.wav'
    path.write_bytes(recording())
    requested = []

    def fetch(url):
        requested.append(url)
        return str(path)

    monkeypatch.setattr(main, '_fetch_media', fetch)
    response = recovery.post('/original-audio/restore', data={
        'points': '[{"id": 1, "position": 0}]', 'url': 'https://example.com/original',
    })
    assert response.status_code == 200
    assert requested == ['https://example.com/original']
    assert original_audio.clip_path(response.json()[0]['originalClipId'])


@pytest.mark.parametrize('points', [
    '[]', 'invalid json', '[{"id": 1, "position": -1}]',
    '[{"id": 1, "position": null}]', '[{"id": 1, "position": NaN}]',
    '[{"id": 0, "position": 0}]', '[{"id": 1, "position": 0}, {"id": 1, "position": 1}]',
])
def test_invalid_points_are_rejected_before_downloading(recovery, monkeypatch, points):
    monkeypatch.setattr(main, '_fetch_media', lambda _: pytest.fail('Invalid input must not download'))
    response = recovery.post('/original-audio/restore', data={'points': points, 'url': 'https://example.com'})
    assert response.status_code == 422


def test_requires_one_http_source(recovery):
    points = '[{"id": 1, "position": 0}]'
    for data, files in [
        ({'points': points}, None),
        ({'points': points, 'url': 'file:///etc/passwd'}, None),
        ({'points': points, 'url': 'https://example.com'}, {'file': ('x.wav', b'x')}),
    ]:
        assert recovery.post('/original-audio/restore', data=data, files=files).status_code == 422


def test_wrong_recording_leaves_no_partial_clips(recovery):
    response = recovery.post('/original-audio/restore', data={
        'points': '[{"id": 1, "position": 0}, {"id": 2, "position": 10}]',
    }, files={'file': ('short.wav', recording(), 'audio/wav')})
    assert response.status_code == 422
    assert 'shorter' in response.json()['detail']
    assert not list(original_audio.clip_directory().glob('*.mp3'))


def test_export_failure_cleans_up_partial_batch(recovery, monkeypatch, tmp_path):
    path = tmp_path / 'input.wav'
    path.write_bytes(recording())
    original = original_audio.save_original_clip
    calls = 0

    def export(segment, start):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError('disk full')
        return original(segment, start)

    monkeypatch.setattr(original_audio, 'save_original_clip', export)
    with pytest.raises(OSError):
        original_audio.restore_original_clips(str(path), [{'id': 1, 'position': 0}, {'id': 2, 'position': 0}])
    assert not list(original_audio.clip_directory().glob('*.mp3'))


def test_download_failure_suggests_file_without_leaking_internal_error(recovery, monkeypatch):
    def fail(_):
        raise RuntimeError('private path')

    monkeypatch.setattr(main, '_fetch_media', fail)
    response = recovery.post('/original-audio/restore', data={
        'points': '[{"id": 1, "position": 0}]', 'url': 'https://example.com',
    })
    assert response.status_code == 422
    assert 'original file' in response.json()['detail']
    assert 'private path' not in response.text
