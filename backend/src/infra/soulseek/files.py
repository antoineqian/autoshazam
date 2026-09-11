"""Where a finished download ends up.

    <download_dir>/<sanitised source label>/<sanitised "Artist - Title">.<ext>
"""
import os
import re
import shutil
from pathlib import Path

MAX_FOLDER_CHARS = 120
MAX_FILENAME_CHARS = 180
FALLBACK_FOLDER = "Unknown source"
FALLBACK_STEM = "Untitled"

_FORBIDDEN_RE = re.compile(r'[\\/:*?"<>|\x00-\x1f]')


def sanitise(name: str, max_chars: int) -> str:
    cleaned = _FORBIDDEN_RE.sub("_", name)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    return cleaned[:max_chars].rstrip(" .")


def source_folder(label: str) -> str:
    cleaned = sanitise(label, MAX_FOLDER_CHARS)
    # A label made only of replaced characters ("///") says nothing either.
    return cleaned if cleaned.strip("_ ") else FALLBACK_FOLDER


def track_filename(artist: str, title: str, extension: str) -> str:
    suffix = f".{extension}" if extension else ""
    budget = MAX_FILENAME_CHARS - len(suffix)
    stem = sanitise(f"{artist} - {title}", budget) or FALLBACK_STEM
    return f"{stem}{suffix}"


def destination(
    download_dir: Path, source_label: str, artist: str, title: str, extension: str
) -> Path:
    """The final path for a track, with " (2)", " (3)"... when taken."""
    folder = download_dir / source_folder(source_label)
    filename = track_filename(artist, title, extension)
    candidate = folder / filename
    if not candidate.exists():
        return candidate

    stem, dot, ext = filename.rpartition(".")
    if not dot:
        stem, ext = filename, ""
    n = 2
    while True:
        suffixed = f"{stem} ({n}).{ext}" if ext else f"{stem} ({n})"
        candidate = folder / suffixed
        if not candidate.exists():
            return candidate
        n += 1


def finalise(downloaded: Path, target: Path, incoming_root: Path | None = None) -> Path:
    """Move the transfer's file into place and tidy the empty remote-folder
    skeleton the library left under ``incoming_root``."""
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(downloaded), str(target))

    if incoming_root is not None:
        _remove_empty_parents(downloaded.parent, incoming_root)

    return target


def _remove_empty_parents(start: Path, stop: Path) -> None:
    try:
        stop = stop.resolve()
        current = start.resolve()
    except OSError:
        return

    while current != stop and stop in current.parents:
        try:
            os.rmdir(current)
        except OSError:
            return
        current = current.parent
