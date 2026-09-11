from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol


@dataclass(frozen=True)
class Candidate:
    """One file offered by one peer, flattened out of a search response."""

    username: str
    remote_path: str  # full path as returned by the peer, backslash separated
    filename: str  # last path segment
    folder: str  # second to last segment, '' if none
    extension: str  # lowercase, no dot
    filesize: int
    bitrate: int | None
    duration: int | None  # seconds
    vbr: bool
    sample_rate: int | None
    bit_depth: int | None
    has_free_slots: bool
    avg_speed: int
    queue_size: int


def split_remote_path(remote_path: str) -> tuple[str, str]:
    """Soulseek paths are Windows style whatever the peer runs. Returns
    ``(folder, filename)``."""
    parts = [p for p in remote_path.replace("/", "\\").split("\\") if p]
    if not parts:
        return "", ""
    filename = parts[-1]
    folder = parts[-2] if len(parts) > 1 else ""
    return folder, filename


def extension_of(filename: str) -> str:
    _, dot, ext = filename.rpartition(".")
    return ext.lower() if dot else ""


class TransportError(Exception):
    """Base class for everything the transport can raise."""


class SearchFailed(TransportError):
    pass


class DownloadFailed(TransportError):
    pass


class DownloadStalled(DownloadFailed):
    """The peer accepted the request but never sent any bytes in time."""


ProgressCallback = Callable[[int, int], None]  # (bytes_done, bytes_total)


class SoulseekTransport(Protocol):
    async def connect(self) -> None: ...

    async def search(self, query: str, collect_seconds: float) -> list[Candidate]: ...

    async def download(
        self, candidate: Candidate, on_progress: ProgressCallback
    ) -> Path: ...

    async def close(self) -> None: ...
