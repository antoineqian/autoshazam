"""The one module that imports aioslsk."""
import asyncio
import logging
import time
from pathlib import Path

from aioslsk.client import SoulSeekClient
from aioslsk.events import SessionDestroyedEvent
from aioslsk.protocol.primitives import AttributeKey
from aioslsk.settings import (
    CredentialsSettings,
    ListeningSettings,
    NetworkSettings,
    Settings,
    SharesSettings,
)
from aioslsk.transfer.state import TransferState

from .config import SoulseekConfig
from .transport import (
    Candidate,
    DownloadFailed,
    DownloadStalled,
    ProgressCallback,
    SearchFailed,
    extension_of,
    split_remote_path,
)

log = logging.getLogger(__name__)

INCOMING_DIRNAME = ".incoming"
# A peer that accepted our request but sent nothing for this long is treated
# as unreachable (typically NAT on either side) and we move on.
STALL_TIMEOUT_SECONDS = 600.0
POLL_SECONDS = 1.0


def to_candidate(username: str, has_free_slots: bool, avg_speed: int, queue_size: int, item) -> Candidate:
    attrs = item.get_attribute_map()
    folder, filename = split_remote_path(item.filename)
    return Candidate(
        username=username,
        remote_path=item.filename,
        filename=filename,
        folder=folder,
        extension=extension_of(filename) or (item.extension or "").lower().lstrip("."),
        filesize=item.filesize,
        bitrate=attrs.get(AttributeKey.BITRATE),
        duration=attrs.get(AttributeKey.DURATION),
        vbr=bool(attrs.get(AttributeKey.VBR, 0)),
        sample_rate=attrs.get(AttributeKey.SAMPLE_RATE),
        bit_depth=attrs.get(AttributeKey.BIT_DEPTH),
        has_free_slots=has_free_slots,
        avg_speed=avg_speed,
        queue_size=queue_size,
    )


class AioslskTransport:
    def __init__(self, config: SoulseekConfig):
        self._config = config
        self._client: SoulSeekClient | None = None
        self._lock = asyncio.Lock()
        self._session_cleanup: set[asyncio.Task] = set()
        self.incoming_dir = config.download_dir / INCOMING_DIRNAME

    @property
    def connected(self) -> bool:
        return self._client is not None and self._client.session is not None

    async def connect(self) -> None:
        async with self._lock:
            if self.connected:
                return
            await self._drop_client_locked()

            self.incoming_dir.mkdir(parents=True, exist_ok=True)
            settings = Settings(
                credentials=CredentialsSettings(
                    username=self._config.account, password=self._config.password
                ),
                shares=SharesSettings(download=str(self.incoming_dir), scan_on_start=False),
                network=NetworkSettings(
                    listening=ListeningSettings(
                        port=self._config.listen_port,
                        obfuscated_port=self._config.listen_port + 1,
                    )
                ),
            )
            client = SoulSeekClient(settings)
            try:
                await client.start()
                await client.login()
                if client.session is None:
                    raise SearchFailed("Soulseek login ended without an active session")
            except Exception as exc:  # noqa: BLE001 - surfaced as one transport error
                await self._stop(client)
                raise SearchFailed(f"could not connect to Soulseek: {exc}") from exc

            log.info("Connected to Soulseek as %s", self._config.account)
            self._client = client
            client.events.register(SessionDestroyedEvent, self._on_session_destroyed)

    async def search(self, query: str, collect_seconds: float) -> list[Candidate]:
        # A session can end between query tiers or while the worker is idle.
        await self.connect()
        client = self._require_client()
        session = client.session
        try:
            request = await client.searches.search(query)
        except Exception as exc:  # noqa: BLE001
            await self._drop_client(client)
            raise SearchFailed(f"search failed: {exc}") from exc

        # Results trickle in from peers; there is no "done" signal, so we give
        # the network a fixed window and take what arrived.
        await asyncio.sleep(collect_seconds)
        if self._client is not client or client.session is not session:
            await self._drop_client(client)
            raise SearchFailed("Soulseek session ended during search; retry the track")

        candidates: list[Candidate] = []
        for result in list(request.results):
            for item in result.shared_items:
                candidates.append(
                    to_candidate(
                        result.username,
                        result.has_free_slots,
                        result.avg_speed,
                        result.queue_size,
                        item,
                    )
                )
        return candidates

    async def download(self, candidate: Candidate, on_progress: ProgressCallback) -> Path:
        try:
            client = self._require_client()
            transfer = await client.transfers.download(candidate.username, candidate.remote_path)
        except Exception as exc:  # noqa: BLE001
            raise DownloadFailed(f"could not request download: {exc}") from exc

        last_bytes = -1
        last_progress_at = time.monotonic()
        try:
            while True:
                await asyncio.sleep(POLL_SECONDS)
                if self._client is not client or client.session is None:
                    raise DownloadFailed("Soulseek session ended during download; retry the track")
                state = transfer.state.VALUE
                done = transfer.bytes_transfered
                if done != last_bytes:
                    last_bytes = done
                    last_progress_at = time.monotonic()
                    on_progress(done, transfer.filesize or candidate.filesize)

                if state == TransferState.COMPLETE:
                    if not transfer.local_path:
                        raise DownloadFailed("transfer completed without a local path")
                    return Path(transfer.local_path)

                if state in (TransferState.FAILED, TransferState.ABORTED):
                    reason = transfer.fail_reason or transfer.abort_reason or state.name.lower()
                    raise DownloadFailed(f"{candidate.username}: {reason}")

                if time.monotonic() - last_progress_at > STALL_TIMEOUT_SECONDS:
                    await client.transfers.abort(transfer)
                    raise DownloadStalled(
                        f"{candidate.username}: no data for {int(STALL_TIMEOUT_SECONDS)}s"
                    )
        finally:
            if transfer.is_finalized():
                try:
                    await client.transfers.remove(transfer)
                except Exception:  # noqa: BLE001 - bookkeeping only
                    log.debug("could not remove transfer %s", transfer.remote_path, exc_info=True)

    async def close(self) -> None:
        await self._drop_client()
        await asyncio.gather(*self._session_cleanup)

    def _require_client(self) -> SoulSeekClient:
        if not self.connected:
            raise SearchFailed("not connected to Soulseek")
        return self._client

    def _on_session_destroyed(self, _event: SessionDestroyedEvent) -> None:
        client = self._client
        if client is None or client.session is not None:
            return
        log.warning("Soulseek session ended; reconnecting on the next search")
        # The event runs inside the network reader. Stop in a separate task so
        # shutdown can await that reader without making it await itself.
        task = asyncio.create_task(self._drop_client(client))
        self._session_cleanup.add(task)
        task.add_done_callback(self._session_cleanup.discard)

    async def _drop_client(self, expected: SoulSeekClient | None = None) -> None:
        async with self._lock:
            # Cleanup from an old search/session must not stop its replacement.
            if expected is not None and self._client is not expected:
                return
            await self._drop_client_locked()

    async def _drop_client_locked(self) -> None:
        client, self._client = self._client, None
        if client is not None:
            client.events.unregister(SessionDestroyedEvent, self._on_session_destroyed)
            await self._stop(client)

    @staticmethod
    async def _stop(client: SoulSeekClient) -> None:
        try:
            await client.stop()
        except Exception:  # noqa: BLE001
            log.debug("error while stopping Soulseek client", exc_info=True)
