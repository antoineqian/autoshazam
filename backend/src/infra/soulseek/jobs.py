"""In-memory download jobs and the worker that runs them.

One worker searches sequentially (the Soulseek server drops clients that
flood it with searches); downloads run concurrently up to a small cap and do
not block the search loop.
"""
import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, Callable, Literal

from . import files
from .matching import Decision, Preferences, Scored, Target, evaluate
from .query import build_queries
from .transport import DownloadFailed, SearchFailed, SoulseekTransport, TransportError

log = logging.getLogger(__name__)

SEARCH_WINDOW_SECONDS = 8.0
SEARCH_GAP_SECONDS = 3.0
MAX_CONCURRENT_DOWNLOADS = 3
MAX_DOWNLOAD_ATTEMPTS = 3
JOB_RETENTION_SECONDS = 3600.0

ItemStatus = Literal[
    "queued", "searching", "matched", "downloading", "done",
    "review", "not_found", "failed", "skipped",
]
TERMINAL_STATUSES: frozenset[str] = frozenset({"done", "not_found", "failed", "skipped"})
RETRYABLE_STATUSES: frozenset[str] = frozenset({"not_found", "failed", "skipped"})


@dataclass
class Item:
    id: str
    title: str
    subtitle: str  # artist, same as tracks.subtitle
    source_label: str
    status: ItemStatus = "queued"
    query_used: str | None = None
    candidates: list[Scored] = field(default_factory=list)  # top groups, for review
    chosen: Scored | None = None
    progress: float | None = None
    local_path: str | None = None
    error: str | None = None
    attempts: int = 0
    # Every survivor of the last search, best first, so a failed download can
    # fall back to another peer without searching again. Not serialised.
    ranked: list[Scored] = field(default_factory=list, repr=False)
    start_tier: int = 1

    @property
    def terminal(self) -> bool:
        return self.status in TERMINAL_STATUSES


@dataclass
class Job:
    id: str
    created_at: datetime
    preferences: Preferences
    items: list[Item]
    finished_at: float | None = None

    def item(self, item_id: str) -> Item:
        for item in self.items:
            if item.id == item_id:
                return item
        raise KeyError(item_id)


class JobError(Exception):
    """A request that does not fit the item's current state."""


Sleep = Callable[[float], Awaitable[None]]


class DownloadManager:
    def __init__(
        self,
        transport: SoulseekTransport,
        download_dir: Path,
        *,
        incoming_dir: Path | None = None,
        search_window: float = SEARCH_WINDOW_SECONDS,
        search_gap: float = SEARCH_GAP_SECONDS,
        max_concurrent_downloads: int = MAX_CONCURRENT_DOWNLOADS,
        retention_seconds: float = JOB_RETENTION_SECONDS,
        sleep: Sleep = asyncio.sleep,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._transport = transport
        self._download_dir = download_dir
        self._incoming_dir = incoming_dir
        self._search_window = search_window
        self._search_gap = search_gap
        self._retention = retention_seconds
        self._sleep = sleep
        self._clock = clock

        self.jobs: dict[str, Job] = {}
        self._queue: asyncio.Queue[tuple[Job, Item]] = asyncio.Queue()
        self._worker: asyncio.Task | None = None
        self._downloads = asyncio.Semaphore(max_concurrent_downloads)
        self._tasks: set[asyncio.Task] = set()

    # ------------------------------------------------------------- public --

    def create_job(self, preferences: Preferences, items: list[tuple[str, str, str]]) -> Job:
        """``items`` are ``(title, subtitle, source_label)`` triples."""
        self._purge()
        job = Job(
            id=uuid.uuid4().hex[:12],
            created_at=datetime.now(timezone.utc),
            preferences=preferences,
            items=[
                Item(id=uuid.uuid4().hex[:8], title=t, subtitle=s, source_label=label)
                for t, s, label in items
            ],
        )
        self.jobs[job.id] = job
        for item in job.items:
            self._enqueue(job, item)
        return job

    def get_job(self, job_id: str) -> Job | None:
        self._purge()
        return self.jobs.get(job_id)

    def choose(self, job_id: str, item_id: str, username: str, remote_path: str) -> Item:
        job, item = self._lookup(job_id, item_id)
        if item.status != "review":
            raise JobError(f"item is {item.status}, not awaiting review")

        pool = item.ranked or item.candidates
        chosen = next(
            (s for s in pool if s.candidate.username == username and s.candidate.remote_path == remote_path),
            None,
        )
        if chosen is None:
            raise JobError("that candidate is not one of the options for this item")

        item.chosen = chosen
        item.status = "matched"
        self._spawn(self._download_item(job, item, _fallback_order(item.ranked, chosen)))
        return item

    def skip(self, job_id: str, item_id: str) -> Item:
        job, item = self._lookup(job_id, item_id)
        if item.status != "review":
            raise JobError(f"item is {item.status}, not awaiting review")
        item.status = "skipped"
        self._finish(job)
        return item

    def retry(self, job_id: str, item_id: str) -> Item:
        job, item = self._lookup(job_id, item_id)
        if item.status not in RETRYABLE_STATUSES:
            raise JobError(f"item is {item.status}, nothing to retry")
        item.status = "queued"
        item.error = None
        item.progress = None
        item.candidates = []
        item.chosen = None
        item.start_tier = 2
        job.finished_at = None
        self._enqueue(job, item)
        return item

    async def shutdown(self) -> None:
        pending = [t for t in (self._worker, *self._tasks) if t is not None]
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        await self._transport.close()

    async def wait_idle(self) -> None:
        """Test helper: block until every queued search and download is done."""
        await self._queue.join()
        while self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)

    # ------------------------------------------------------------ worker --

    def _enqueue(self, job: Job, item: Item) -> None:
        self._queue.put_nowait((job, item))
        if self._worker is None or self._worker.done():
            self._worker = asyncio.get_running_loop().create_task(self._run(), name="soulseek-worker")

    async def _run(self) -> None:
        while True:
            job, item = await self._queue.get()
            try:
                if item.status == "queued":
                    await self._search_item(job, item)
            except Exception as exc:  # noqa: BLE001 - one bad item must not kill the loop
                log.exception("search failed for %s - %s", item.subtitle, item.title)
                item.status = "failed"
                item.error = str(exc)
                self._finish(job)
            finally:
                self._queue.task_done()
            await self._sleep(self._search_gap)

    async def _search_item(self, job: Job, item: Item) -> None:
        item.status = "searching"
        target = Target.for_track(item.subtitle, item.title)
        queries = build_queries(item.subtitle, item.title)
        queries = queries[item.start_tier - 1 :] or queries[-1:]

        try:
            await self._transport.connect()
        except TransportError as exc:
            self._fail(job, item, str(exc))
            return

        decision = Decision(status="not_found")
        for index, query in enumerate(queries):
            if index:
                await self._sleep(self._search_gap)
            item.query_used = query
            try:
                candidates = await self._transport.search(query, self._search_window)
            except SearchFailed as exc:
                self._fail(job, item, str(exc))
                return
            decision = evaluate(candidates, target, job.preferences)
            if decision.status != "not_found":
                break

        item.ranked = decision.ranked
        item.candidates = decision.groups

        if decision.status == "not_found":
            item.status = "not_found"
            self._finish(job)
        elif decision.status == "review":
            item.status = "review"
        else:
            item.chosen = decision.groups[0]
            item.status = "matched"
            self._spawn(self._download_item(job, item, _fallback_order(decision.ranked, item.chosen)))

    async def _download_item(self, job: Job, item: Item, ordered: list[Scored]) -> None:
        async with self._downloads:
            tried: set[str] = set()
            last_error: str | None = None

            for scored in ordered:
                user = scored.candidate.username
                if user in tried:
                    continue
                if len(tried) >= MAX_DOWNLOAD_ATTEMPTS:
                    break
                tried.add(user)

                item.attempts = len(tried)
                item.chosen = scored
                item.status = "downloading"
                item.progress = 0.0

                def on_progress(done: int, total: int) -> None:
                    item.progress = min(done / total, 1.0) if total else None

                try:
                    downloaded = await self._transport.download(scored.candidate, on_progress)
                except DownloadFailed as exc:
                    last_error = str(exc)
                    log.info("download from %s failed: %s", user, exc)
                    continue

                target = files.destination(
                    self._download_dir,
                    item.source_label,
                    item.subtitle,
                    item.title,
                    scored.candidate.extension,
                )
                try:
                    files.finalise(downloaded, target, self._incoming_dir)
                except OSError as exc:
                    self._fail(job, item, f"could not move file into place: {exc}")
                    return

                item.local_path = str(target)
                item.progress = 1.0
                item.status = "done"
                self._finish(job)
                return

            self._fail(job, item, last_error or "no peer could deliver the file")

    # ----------------------------------------------------------- helpers --

    def _spawn(self, coro) -> None:
        task = asyncio.get_running_loop().create_task(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    def _lookup(self, job_id: str, item_id: str) -> tuple[Job, Item]:
        job = self.get_job(job_id)
        if job is None:
            raise KeyError(job_id)
        return job, job.item(item_id)

    def _fail(self, job: Job, item: Item, error: str) -> None:
        item.status = "failed"
        item.error = error
        self._finish(job)

    def _finish(self, job: Job) -> None:
        if all(i.terminal for i in job.items):
            job.finished_at = self._clock()

    def _purge(self) -> None:
        now = self._clock()
        for job_id in [
            j.id
            for j in self.jobs.values()
            if j.finished_at is not None and now - j.finished_at > self._retention
        ]:
            del self.jobs[job_id]


def _fallback_order(ranked: list[Scored], chosen: Scored) -> list[Scored]:
    """The chosen peer first, then other peers sharing the same file, then the
    rest of the survivors in rank order."""
    same = [s for s in ranked if s is not chosen and s.clean_name == chosen.clean_name]
    rest = [s for s in ranked if s is not chosen and s.clean_name != chosen.clean_name]
    return [chosen, *same, *rest]
