"""Prepare only the original moment the listener requested."""

import hashlib
import json
import math
import subprocess
import tempfile
from pathlib import Path
from uuid import uuid4

from yt_dlp import YoutubeDL
from yt_dlp.utils import download_range_func

from .downloader import build_ydl_opts
from .original_audio import clip_directory, clip_path
from .processor import PathWriter


def _source_index(url: str) -> Path:
    return Path('storage/original-sources') / f'{hashlib.sha256(url.encode()).hexdigest()}.json'


def remember_original(url: str, filename: str) -> None:
    """Index full downloads already retained by analysis; no audio copy needed."""
    root = Path('storage').resolve()
    path = Path(filename).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        return
    index = _source_index(url)
    temporary = index.with_suffix(f'.{uuid4().hex}.tmp')
    try:
        index.parent.mkdir(parents=True, exist_ok=True)
        stat = path.stat()
        temporary.write_text(json.dumps({
            'path': str(path.relative_to(root)), 'size': stat.st_size, 'modified': stat.st_mtime_ns,
        }))
        temporary.replace(index)
    except OSError:
        # Indexing is optional and must not fail a successful analysis.
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def _cached_original(url: str) -> Path | None:
    try:
        root = Path('storage').resolve()
        entry = json.loads(_source_index(url).read_text())
        path = (root / entry['path']).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            return None
        stat = path.stat()
        # yt-dlp filenames can be reused by a different URL with the same title.
        return path if (stat.st_size, stat.st_mtime_ns) == (entry['size'], entry['modified']) else None
    except (OSError, ValueError, TypeError, KeyError):
        return None


def extract_preview(filename: str, start: float, output: Path) -> None:
    # Input seeking avoids decoding an entire multi-hour recording with pydub.
    subprocess.run([
        'ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(start),
        '-i', filename, '-t', '30', '-map', '0:a:0', '-vn', '-c:a', 'libmp3lame',
        '-b:a', '128k', str(output),
    ], check=True, capture_output=True, timeout=90)
    probe = subprocess.run([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'json', str(output),
    ], check=True, capture_output=True, timeout=15)
    duration = float(json.loads(probe.stdout)['format'].get('duration', 0))
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('No audio at this timestamp')


def prepare_url_preview(url: str, position: float) -> str:
    start = round(position * 60_000) / 1000
    clip_id = hashlib.sha256(f'url-preview-v1\0{url}\0{start}'.encode()).hexdigest()[:32]
    if clip_path(clip_id):
        return clip_id
    directory = clip_directory()
    directory.mkdir(parents=True, exist_ok=True)
    # Unique work files keep simultaneous clicks from reading a partial MP3.
    with tempfile.TemporaryDirectory(prefix='preview-', dir=directory) as temporary:
        output = Path(temporary) / 'clip.mp3'
        cached = _cached_original(url)
        if cached:
            extract_preview(str(cached), start, output)
        else:
            options = build_ydl_opts(str(Path(temporary) / 'source.%(ext)s'))
            options['download_ranges'] = download_range_func(None, [(start, start + 30)])
            paths = []
            with YoutubeDL(options) as downloader:
                downloader.add_post_processor(PathWriter(on_path=paths.append), when='post_process')
                downloader.download([url])
            if not paths:
                raise ValueError('No audio was downloaded')
            # yt-dlp has already sought to the selected position.
            extract_preview(paths[-1], 0, output)
        output.replace(directory / f'{clip_id}.mp3')
    return clip_id
