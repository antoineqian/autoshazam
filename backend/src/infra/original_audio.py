"""Persistent excerpts of the input audio, independent of Shazam previews."""

import re
from pathlib import Path
from uuid import uuid4
from shazamio.converter import Converter
from pydub import AudioSegment

CLIP_DURATION_MS = 30_000


def recognition_offset_ms(segment) -> int:
    # shazamio 0.8.1's Converter.create_signature_generator starts its 12-second
    # fingerprint near the midpoint when the supplied segment exceeds 36 seconds.
    # Keep the saved excerpt and displayed timestamp aligned with that sample.
    # Resampling can remove a fraction of a millisecond, which matters before
    # Shazam truncates half the duration to a whole second.
    duration = Converter.normalize_audio_data(segment).duration_seconds
    return (int(duration / 2) - 6) * 1000 if duration > 36 else 0


def clip_directory() -> Path:
    return Path('storage/original-clips')


def clip_path(clip_id: str) -> Path | None:
    # Only opaque generated IDs can address audio; never accept a client path.
    if not re.fullmatch(r'[0-9a-f]{32}', clip_id):
        return None
    path = clip_directory() / f'{clip_id}.mp3'
    return path if path.is_file() and not path.is_symlink() else None


def save_original_clip(segment, start: int | None = None) -> str:
    """Store up to 30 seconds from the fingerprint's start in browser-safe MP3."""
    directory = clip_directory()
    directory.mkdir(parents=True, exist_ok=True)
    clip_id = uuid4().hex
    path = directory / f'{clip_id}.mp3'
    if start is None:
        start = recognition_offset_ms(segment)
    try:
        with segment[start:start + CLIP_DURATION_MS].export(path, format='mp3', bitrate='128k'):
            pass
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return clip_id


def restore_original_clips(filename: str, points: list[dict]) -> list[dict]:
    """Recover clips at existing timestamps without calling recognition again."""
    audio = AudioSegment.from_file(filename)
    starts = [round(point['position'] * 60_000) for point in points]
    if any(start >= len(audio) for start in starts):
        raise ValueError('This audio is shorter than the saved timestamps. Choose the original recording.')
    restored = []
    try:
        for point, start in zip(points, starts):
            # Existing positions may be legacy interval starts or exact new
            # fingerprint starts. Preserve them; never add a guessed offset.
            clip_id = save_original_clip(audio, start)
            restored.append({'id': point['id'], 'originalClipId': clip_id})
    except Exception:
        for clip in restored:
            path = clip_path(clip['originalClipId'])
            if path:
                path.unlink(missing_ok=True)
        raise
    return restored
