from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from pydub import AudioSegment
from pydub.generators import Sine
from shazamio.converter import Converter

from backend.src.app import main
from backend.src.infra import original_audio, shazam


@pytest.fixture
def storage(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    return tmp_path


def test_clips_keep_the_recognized_sample_and_survive_reload(storage):
    # Only the middle of this two-minute segment has a tone.
    sample = (AudioSegment.silent(duration=53_000) + Sine(440).to_audio_segment(duration=31_000)
              + AudioSegment.silent(duration=36_000))
    clip_id = original_audio.save_original_clip(sample)
    path = original_audio.clip_path(clip_id)
    decoded = AudioSegment.from_mp3(path)
    assert len(decoded) == 30_000
    assert decoded[:1000].rms > 1000
    assert decoded[-1000:].rms > 1000
    # Lookup uses disk, not a process-local map; a later library session can play it.
    assert path == Path('storage/original-clips') / f'{clip_id}.mp3'
    assert original_audio.save_original_clip(sample[:500]) != clip_id


@pytest.mark.parametrize('duration', [800, 36_000, 36_001, 60_000, 180_000, 181_500])
def test_clip_offset_matches_the_installed_shazam_fingerprint(duration):
    segment = AudioSegment.silent(duration=duration)
    audio = Converter.normalize_audio_data(segment)
    signature = Converter.create_signature_generator(audio)
    assert original_audio.recognition_offset_ms(segment) == signature.samples_processed / 16


def test_short_last_sample_is_not_padded(storage):
    clip_id = original_audio.save_original_clip(AudioSegment.silent(duration=800))
    assert len(AudioSegment.from_mp3(original_audio.clip_path(clip_id))) == 800


def test_audio_endpoint_serves_mp3_and_supports_ranges(storage):
    clip_id = original_audio.save_original_clip(AudioSegment.silent(duration=1000))
    with TestClient(main.app) as client:
        response = client.get(f'/original-audio/{clip_id}')
        assert response.status_code == 200
        assert response.headers['content-type'] == 'audio/mpeg'
        assert response.content == original_audio.clip_path(clip_id).read_bytes()
        partial = client.get(f'/original-audio/{clip_id}', headers={'Range': 'bytes=0-99'})
        assert partial.status_code == 206
        assert partial.content == response.content[:100]
        assert client.get('/original-audio/' + 'f' * 32).status_code == 404
        assert client.get('/original-audio/not-an-id').status_code == 404


def test_client_paths_and_symlinks_cannot_select_files(storage):
    secret = storage / 'private.mp3'
    secret.write_bytes(b'private')
    directory = original_audio.clip_directory()
    directory.mkdir(parents=True)
    (directory / f'{"a" * 32}.mp3').symlink_to(secret)
    for value in ('../private', str(secret), 'a' * 32):
        assert original_audio.clip_path(value) is None


@pytest.mark.asyncio
async def test_each_detection_keeps_its_own_segment_and_timestamp(storage, monkeypatch):
    first = AudioSegment.silent(duration=60_000)
    second = AudioSegment.silent(duration=800)
    segments = [(first, 0), (second, 60_000)]
    monkeypatch.setattr(shazam, '_segments', AsyncMock(return_value=segments))
    monkeypatch.setattr(shazam, '_recognize', AsyncMock(return_value={
        'track': {'title': 'Track', 'subtitle': 'Artist', 'url': 'https://example.com', 'hub': {}}
    }))
    monkeypatch.setattr(shazam, 'save_original_clip', lambda segment, _: 'first' if segment is first else 'second')
    tracks = await shazam.shazam_file('unused', 1)
    assert [t['position'] for t in tracks] == pytest.approx([23 / 60, 1])
    assert [t['originalClipId'] for t in tracks] == ['first', 'second']


@pytest.mark.asyncio
async def test_failed_clip_export_does_not_discard_a_match(storage, monkeypatch):
    monkeypatch.setattr(shazam, '_recognize', AsyncMock(return_value={
        'track': {'title': 'Track', 'subtitle': 'Artist', 'url': 'https://example.com', 'hub': {}}
    }))

    def fail(*_):
        raise OSError('disk full')

    monkeypatch.setattr(shazam, 'save_original_clip', fail)
    track = await shazam.shazam_segment(AudioSegment.silent(duration=800), 60_000)
    assert track['title'] == 'Track'
    assert 'originalClipId' not in track


def test_uploaded_files_return_persistent_clips_and_remove_temporary_inputs(storage, monkeypatch):
    seen = []

    async def recognize(path, interval):
        seen.append(Path(path))
        assert Path(path).read_bytes() in (b'first', b'second')
        clip_id = original_audio.save_original_clip(AudioSegment.silent(duration=100))
        return [{'title': 'Track', 'position': 0, 'originalClipId': clip_id}]

    monkeypatch.setattr(main, 'shazam_file', recognize)
    with TestClient(main.app) as client:
        response = client.post('/processFolder', data={'interval': '1'}, files=[
            ('files', ('same.mp3', b'first', 'audio/mpeg')),
            ('files', ('same.mp3', b'second', 'audio/mpeg')),
        ])
        assert response.status_code == 200
        tracks = response.json()
        assert [t['fileIndex'] for t in tracks] == [0, 1]
        assert all(t['sourceLabel'] == 'same.mp3' for t in tracks)
        assert tracks[0]['originalClipId'] != tracks[1]['originalClipId']
        assert all(original_audio.clip_path(t['originalClipId']) for t in tracks)
        assert len(set(seen)) == 2
        assert not any(p.exists() for p in seen)
