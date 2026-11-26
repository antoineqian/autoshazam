import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydub import AudioSegment
from pydub.generators import Sine

from backend.src.app import main
from backend.src.infra import original_audio, original_preview


@pytest.fixture
def storage(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    return tmp_path


def test_existing_download_is_sought_without_network_or_full_decode(storage, monkeypatch):
    source = storage / 'storage/mix.wav'
    source.parent.mkdir()
    (AudioSegment.silent(duration=2000) + Sine(440).to_audio_segment(duration=1000)).export(source, format='wav').close()
    url = 'https://example.com/mix'
    original_preview.remember_original(url, str(source))
    monkeypatch.setattr(original_preview, 'YoutubeDL', lambda _: pytest.fail('Already downloaded'))
    clip_id = original_preview.prepare_url_preview(url, 2 / 60)
    clip = AudioSegment.from_mp3(original_audio.clip_path(clip_id))
    assert len(clip) == 1000
    assert clip[:500].rms > 1000
    monkeypatch.setattr(original_preview, 'extract_preview', lambda *_: pytest.fail('Already cached'))
    assert original_preview.prepare_url_preview(url, 2 / 60) == clip_id


def test_url_download_requests_only_the_selected_thirty_seconds(storage, monkeypatch):
    requested = []

    class Download:
        def __init__(self, options):
            self.options = options
            ranges = list(options['download_ranges']({'duration': 10000}, self))
            assert ranges == [{'start_time': 600, 'end_time': 630}]

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def add_post_processor(self, processor, when):
            self.processor = processor

        def download(self, urls):
            requested.extend(urls)
            source = Path(self.options['outtmpl'].replace('%(ext)s', 'wav'))
            # The downloaded section already starts at the requested timestamp.
            Sine(440).to_audio_segment(duration=800).export(source, format='wav').close()
            self.processor.run({'filepath': str(source)})

    monkeypatch.setattr(original_preview, 'YoutubeDL', Download)
    clip_id = original_preview.prepare_url_preview('https://example.com/mix', 10)
    assert len(AudioSegment.from_mp3(original_audio.clip_path(clip_id))) == 800
    assert requested == ['https://example.com/mix']
    assert not list(original_audio.clip_directory().glob('preview-*'))


def test_index_cannot_select_audio_outside_storage(storage):
    outside = storage / 'private.wav'
    outside.write_bytes(b'private')
    url = 'https://example.com/mix'
    original_preview.remember_original(url, str(outside))
    assert original_preview._cached_original(url) is None
    index = original_preview._source_index(url)
    index.parent.mkdir(parents=True, exist_ok=True)
    stat = outside.stat()
    index.write_text(json.dumps({'path': '../private.wav', 'size': stat.st_size, 'modified': stat.st_mtime_ns}))
    assert original_preview._cached_original(url) is None


def test_replaced_download_is_not_reused_for_the_old_url(storage):
    source = storage / 'storage/same-title.wav'
    source.parent.mkdir()
    source.write_bytes(b'first recording')
    url = 'https://example.com/first'
    original_preview.remember_original(url, str(source))
    assert original_preview._cached_original(url) == source
    source.write_bytes(b'another recording with the same title')
    assert original_preview._cached_original(url) is None


def test_out_of_range_preview_does_not_leave_a_cached_clip(storage, monkeypatch):
    source = storage / 'storage/mix.wav'
    source.parent.mkdir()
    AudioSegment.silent(duration=500).export(source, format='wav').close()
    url = 'https://example.com/mix'
    original_preview.remember_original(url, str(source))
    with pytest.raises(Exception):
        original_preview.prepare_url_preview(url, 100)
    assert not list(original_audio.clip_directory().glob('*.mp3'))
    assert not list(original_audio.clip_directory().glob('preview-*'))


def test_preview_api_validates_input_and_returns_one_clip(storage, monkeypatch):
    calls = []

    def prepare(url, position):
        calls.append((url, position))
        return 'a' * 32

    monkeypatch.setattr(main, 'prepare_url_preview', prepare)
    with TestClient(main.app) as client:
        response = client.post('/original-audio/preview', json={'url': 'https://example.com/mix', 'position': 3.5})
        assert response.json() == {'originalClipId': 'a' * 32}
        assert calls == [('https://example.com/mix', 3.5)]
        for value in [
            {'url': 'file:///private', 'position': 0},
            {'url': 'https://example.com', 'position': -1},
            {'url': 'https://example.com', 'position': None},
        ]:
            assert client.post('/original-audio/preview', json=value).status_code == 422
        assert len(calls) == 1


def test_preview_failure_offers_file_without_internal_details(storage, monkeypatch):
    def fail(*_):
        raise RuntimeError('private detail')

    monkeypatch.setattr(main, 'prepare_url_preview', fail)
    with TestClient(main.app) as client:
        response = client.post('/original-audio/preview', json={'url': 'https://example.com/mix', 'position': 0})
        assert response.status_code == 422
        assert 'original file' in response.json()['detail']
        assert 'private detail' not in response.text
