import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from backend.src.app import main
from backend.src.infra import shazam


@pytest.fixture
def analysis(monkeypatch):
    def fetch(url, progress=None):
        if progress:
            progress({'type': 'progress', 'stage': 'downloading',
                      'downloadedBytes': 500, 'totalBytes': 1000})
        return '/tmp/Example Mix.mp3'

    monkeypatch.setattr(main, '_fetch_media', fetch)
    monkeypatch.setattr(shazam, '_segments', AsyncMock(return_value=[(b'a', 0), (b'b', 60000)]))

    async def recognize(segment, position):
        if position:
            return None
        return {'track': {'title': 'Example track', 'subtitle': 'Example artist',
                          'url': 'https://example.com/track', 'hub': {}}}

    monkeypatch.setattr(shazam, '_recognize', recognize)
    with TestClient(main.app) as client:
        yield client


def receive_run(client, path='/url?progress=1', interval='3'):
    with client.websocket_connect(path) as ws:
        ws.send_text('https://example.com/mix')
        ws.send_text(interval)
        messages = []
        while True:
            message = ws.receive_json()
            messages.append(message)
            if message.get('type') in ('complete', 'error'):
                return messages


def test_download_preparation_and_every_sample_are_reported(analysis):
    messages = receive_run(analysis)
    progress = [m for m in messages if m.get('type') == 'progress']
    assert progress[0]['stage'] == 'downloading'
    assert progress[1]['downloadedBytes'] == 500
    assert progress[1]['totalBytes'] == 1000
    assert progress[2]['stage'] == 'preparing'
    samples = [m for m in progress if m['stage'] == 'recognizing']
    assert [m['completed'] for m in samples] == [0, 1, 2]
    assert all(m['total'] == 2 for m in samples)
    assert next(m for m in messages if m.get('type') == 'source')['label'] == 'Example Mix'
    assert len([m for m in messages if 'title' in m]) == 1
    assert messages[-1] == {'type': 'complete', 'failedSegments': 0}


def test_recognition_failure_is_counted_without_losing_other_matches(analysis, monkeypatch):
    original = shazam._recognize

    async def recognize(segment, position):
        if position:
            raise RuntimeError('upstream unavailable')
        return await original(segment, position)

    monkeypatch.setattr(shazam, '_recognize', recognize)
    messages = receive_run(analysis)
    assert len([m for m in messages if 'title' in m]) == 1
    assert messages[-2]['completed'] == 2
    assert messages[-1] == {'type': 'complete', 'failedSegments': 1}


def test_download_failure_is_not_reported_as_success(analysis, monkeypatch):
    def fail(*args):
        raise RuntimeError('private backend detail')

    monkeypatch.setattr(main, '_fetch_media', fail)
    messages = receive_run(analysis)
    assert messages[-1]['type'] == 'error'
    assert 'download' in messages[-1]['message']
    assert 'private backend detail' not in str(messages)
    assert not any(m.get('type') == 'source' for m in messages)


@pytest.mark.parametrize('interval', ['0', '-1', 'abc', '1.5'])
def test_invalid_interval_rejected_before_downloading(analysis, monkeypatch, interval):
    fetch = AsyncMock()
    monkeypatch.setattr(main, '_fetch_media', fetch)
    assert receive_run(analysis, interval=interval)[0]['type'] == 'error'
    fetch.assert_not_called()


def test_legacy_websocket_contract_is_preserved(analysis):
    with analysis.websocket_connect('/url') as ws:
        ws.send_text('https://example.com/mix')
        ws.send_text('3')
        assert ws.receive_json()['type'] == 'source'
        assert ws.receive_json()['title'] == 'Example track'
        assert ws.receive_text() == 'DONE'


def test_file_failure_uses_an_error_status(analysis, monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(main, 'shazam_file', AsyncMock(side_effect=ValueError('bad audio')))
    result = analysis.post('/processFolder', data={'interval': '3'},
                           files={'files': ('example.mp3', b'invalid', 'application/octet-stream')})
    assert result.status_code == 422
    assert 'audio' in result.json()['detail']


def test_recognition_exhaustion_is_distinct_from_no_match(monkeypatch):
    class BrokenShazam:
        async def recognize_song(self, _segment):
            raise RuntimeError('unavailable')

    monkeypatch.setattr(shazam, 'Shazam', BrokenShazam)
    monkeypatch.setattr(shazam, 'MAX_RETRIES', 0)
    with pytest.raises(RuntimeError, match='after all retries'):
        asyncio.run(shazam._recognize(b'a', 0))


def test_download_hook_reports_actual_bytes_and_keeps_its_own_path(monkeypatch):
    class FakeDownload:
        def __init__(self, options):
            self.options = options

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def add_post_processor(self, processor, when):
            self.processor = processor

        def download(self, url):
            hook = self.options['progress_hooks'][0]
            hook({'status': 'downloading', 'downloaded_bytes': 42, 'total_bytes_estimate': 100})
            self.processor.run({'filepath': '/tmp/this-request.mp3'})

    monkeypatch.setattr(main, 'YoutubeDL', FakeDownload)
    monkeypatch.setattr(main, 'build_ydl_opts', lambda _: {})
    events = []
    assert main._fetch_media('https://example.com/mix', events.append) == '/tmp/this-request.mp3'
    assert events == [{'type': 'progress', 'stage': 'downloading',
                       'downloadedBytes': 42, 'totalBytes': None}]


@pytest.mark.asyncio
async def test_total_recognition_outage_is_not_an_empty_success(monkeypatch):
    monkeypatch.setattr(shazam, '_segments', AsyncMock(return_value=[(b'a', 0)]))
    monkeypatch.setattr(shazam, '_recognize', AsyncMock(side_effect=RuntimeError('unavailable')))
    with pytest.raises(RuntimeError, match='No audio samples'):
        await shazam.shazam_file('/tmp/audio.mp3', 3)
