import asyncio
from pathlib import Path

import pytest

from backend.src.infra.soulseek.jobs import DownloadManager, JobError
from backend.src.infra.soulseek.matching import Preferences
from backend.src.infra.soulseek.transport import Candidate, DownloadFailed, DownloadStalled, SearchFailed


def cand(remote_path, username="peer", extension="flac", **kw):
    folder, _, filename = remote_path.rpartition("\\")
    return Candidate(
        username=username,
        remote_path=remote_path,
        filename=filename,
        folder=folder.rpartition("\\")[2],
        extension=extension,
        filesize=kw.get("filesize", 9_000_000),
        bitrate=kw.get("bitrate", None if extension == "flac" else 320),
        duration=None,
        vbr=False,
        sample_rate=None,
        bit_depth=None,
        has_free_slots=kw.get("has_free_slots", True),
        avg_speed=kw.get("avg_speed", 1000),
        queue_size=0,
    )


class FakeTransport:
    """Scripted transport: ``results`` maps a query to candidates, ``outcomes``
    maps a username to an exception class (or None for success)."""

    def __init__(self, incoming: Path, results=None, outcomes=None):
        self.incoming = incoming
        self.results = results or {}
        self.outcomes = outcomes or {}
        self.searches: list[str] = []
        self.downloads: list[str] = []
        self.connect_error = None
        self.closed = False

    async def connect(self):
        if self.connect_error:
            raise self.connect_error

    async def search(self, query, collect_seconds):
        self.searches.append(query)
        result = self.results.get(query, [])
        if isinstance(result, Exception):
            raise result
        return list(result)

    async def download(self, candidate, on_progress):
        self.downloads.append(candidate.username)
        outcome = self.outcomes.get(candidate.username)
        if outcome is not None:
            raise outcome("scripted failure")
        on_progress(candidate.filesize // 2, candidate.filesize)
        path = self.incoming / candidate.username / candidate.filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"audio")
        on_progress(candidate.filesize, candidate.filesize)
        return path

    async def close(self):
        self.closed = True


async def no_sleep(_seconds):
    await asyncio.sleep(0)


@pytest.fixture
def make_manager(tmp_path):
    def _make(results=None, outcomes=None, **kw):
        incoming = tmp_path / ".incoming"
        transport = FakeTransport(incoming, results, outcomes)
        manager = DownloadManager(
            transport,
            tmp_path,
            incoming_dir=incoming,
            search_window=0,
            search_gap=0,
            sleep=no_sleep,
            **kw,
        )
        return manager, transport

    return _make


KOZE = ("Pick Up", "DJ Koze", "Late Night Mix")
GOOD = "@@a\\Knock Knock\\DJ Koze - Pick Up.flac"


@pytest.mark.asyncio
async def test_happy_path_downloads_into_source_folder(make_manager, tmp_path):
    manager, transport = make_manager(results={"dj koze pick up": [cand(GOOD, "a")]})
    job = manager.create_job(Preferences(), [KOZE])
    await manager.wait_idle()

    item = job.items[0]
    assert item.status == "done"
    assert item.progress == 1.0
    assert item.local_path == str(tmp_path / "Late Night Mix" / "DJ Koze - Pick Up.flac")
    assert Path(item.local_path).read_bytes() == b"audio"
    assert transport.searches == ["dj koze pick up"]
    assert job.finished_at is not None


@pytest.mark.asyncio
async def test_not_found_falls_through_tiers(make_manager):
    manager, transport = make_manager(results={})
    job = manager.create_job(Preferences(), [("Glue (Ben Klock Remix)", "Bicep, Hammer", "Mix")])
    await manager.wait_idle()

    assert transport.searches == ["bicep hammer glue ben klock remix", "bicep glue"]
    assert job.items[0].status == "not_found"
    assert job.items[0].query_used == "bicep glue"


@pytest.mark.asyncio
async def test_failed_peer_falls_back_to_next_user(make_manager):
    manager, transport = make_manager(
        results={"dj koze pick up": [cand(GOOD, "a", avg_speed=9000), cand(GOOD.replace("@@a", "@@b"), "b")]},
        outcomes={"a": DownloadStalled},
    )
    job = manager.create_job(Preferences(), [KOZE])
    await manager.wait_idle()

    assert transport.downloads == ["a", "b"]
    item = job.items[0]
    assert item.status == "done"
    assert item.attempts == 2
    assert item.chosen.candidate.username == "b"


@pytest.mark.asyncio
async def test_all_peers_fail(make_manager):
    manager, transport = make_manager(
        results={"dj koze pick up": [cand(GOOD, u) for u in "abcd"]},
        outcomes={u: DownloadFailed for u in "abcd"},
    )
    job = manager.create_job(Preferences(), [KOZE])
    await manager.wait_idle()

    assert transport.downloads == ["a", "b", "c"]  # capped at three attempts
    assert job.items[0].status == "failed"
    assert "scripted failure" in job.items[0].error


@pytest.mark.asyncio
async def test_review_then_choose(make_manager):
    manager, transport = make_manager(results={"dj koze pick up": [cand(GOOD, "a")]})
    job = manager.create_job(Preferences(auto_download=False), [KOZE])
    await manager.wait_idle()

    item = job.items[0]
    assert item.status == "review"
    assert [s.candidate.username for s in item.candidates] == ["a"]
    assert transport.downloads == []

    with pytest.raises(JobError):
        manager.choose(job.id, item.id, "nobody", "nowhere")

    manager.choose(job.id, item.id, "a", GOOD)
    await manager.wait_idle()
    assert item.status == "done"
    assert transport.downloads == ["a"]


@pytest.mark.asyncio
async def test_review_then_skip_and_retry(make_manager):
    manager, transport = make_manager(results={"dj koze pick up": [cand(GOOD, "a")]})
    job = manager.create_job(Preferences(auto_download=False), [KOZE])
    await manager.wait_idle()
    item = job.items[0]

    manager.skip(job.id, item.id)
    assert item.status == "skipped"
    assert job.finished_at is not None

    with pytest.raises(JobError):
        manager.skip(job.id, item.id)

    manager.retry(job.id, item.id)
    assert job.finished_at is None
    await manager.wait_idle()
    assert item.status == "review"
    assert transport.searches == ["dj koze pick up", "dj koze pick up"]


@pytest.mark.asyncio
async def test_search_failure_marks_item_failed_and_keeps_going(make_manager):
    manager, transport = make_manager(
        results={
            "dj koze pick up": SearchFailed("server hung up"),
            "objekt ruff dug": [cand("@@a\\x\\Objekt - Ruff Dug.flac", "a")],
        }
    )
    job = manager.create_job(Preferences(), [KOZE, ("Ruff Dug", "Objekt", "Mix")])
    await manager.wait_idle()

    assert job.items[0].status == "failed"
    assert "server hung up" in job.items[0].error
    assert job.items[1].status == "done"


@pytest.mark.asyncio
async def test_connect_failure(make_manager):
    manager, transport = make_manager()
    transport.connect_error = SearchFailed("bad credentials")
    job = manager.create_job(Preferences(), [KOZE])
    await manager.wait_idle()
    assert job.items[0].status == "failed"
    assert job.items[0].error == "bad credentials"


@pytest.mark.asyncio
async def test_finished_jobs_are_purged_after_retention(make_manager):
    now = [1000.0]
    manager, _ = make_manager(results={"dj koze pick up": [cand(GOOD, "a")]}, retention_seconds=60, clock=lambda: now[0])
    job = manager.create_job(Preferences(), [KOZE])
    await manager.wait_idle()

    assert manager.get_job(job.id) is job
    now[0] += 61
    assert manager.get_job(job.id) is None


@pytest.mark.asyncio
async def test_shutdown_closes_transport(make_manager):
    manager, transport = make_manager()
    manager.create_job(Preferences(), [KOZE])
    await manager.wait_idle()
    await manager.shutdown()
    assert transport.closed
