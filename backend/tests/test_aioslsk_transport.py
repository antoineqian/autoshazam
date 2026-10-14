import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from aioslsk.events import EventBus, SessionDestroyedEvent

from backend.src.infra.soulseek import aioslsk_transport
from backend.src.infra.soulseek.aioslsk_transport import AioslskTransport
from backend.src.infra.soulseek.config import SoulseekConfig
from backend.src.infra.soulseek.jobs import DownloadManager
from backend.src.infra.soulseek.matching import Preferences
from backend.src.infra.soulseek.transport import DownloadFailed, SearchFailed


class FakeClient:
    def __init__(self, settings):
        self.settings = settings
        self.session = None
        self.events = EventBus()
        self.start = AsyncMock()
        self.login = AsyncMock(side_effect=self._login)
        self.stop = AsyncMock(side_effect=self.lose_session)
        self.searches = SimpleNamespace(
            search=AsyncMock(return_value=SimpleNamespace(results=[]))
        )
        self.transfers = SimpleNamespace(download=AsyncMock())

    async def _login(self):
        self.session = object()

    async def lose_session(self):
        session, self.session = self.session, None
        if session is not None:
            await self.events.emit(SessionDestroyedEvent(session))


@pytest.fixture
def transport(tmp_path, monkeypatch):
    factory = Mock(side_effect=FakeClient)
    monkeypatch.setattr(aioslsk_transport, "SoulSeekClient", factory)
    return AioslskTransport(SoulseekConfig("user", "password", 2234, tmp_path))


@pytest.mark.asyncio
async def test_reuses_only_a_live_session(transport):
    assert not transport.connected
    await asyncio.gather(transport.connect(), transport.connect())
    client = transport._client
    assert transport.connected
    client.start.assert_awaited_once()
    client.login.assert_awaited_once()
    aioslsk_transport.SoulSeekClient.assert_called_once()

    # A stale client must not pass the connection check, even before cleanup.
    client.session = None
    assert not transport.connected
    await transport.connect()
    assert transport.connected
    assert transport._client is not client
    client.stop.assert_awaited_once()
    await transport.close()


@pytest.mark.asyncio
async def test_session_loss_stops_idle_peer_traffic_and_next_search_reconnects(transport, caplog):
    await transport.connect()
    client = transport._client
    await client.lose_session()
    assert not transport.connected
    await asyncio.gather(*transport._session_cleanup)
    client.stop.assert_awaited_once()
    assert transport._client is None
    assert caplog.text.count("Soulseek session ended") == 1

    assert await transport.search("artist title", 0) == []
    assert transport.connected
    assert transport._client is not client
    await transport.close()


@pytest.mark.asyncio
async def test_pending_cleanup_does_not_close_replacement_client(transport):
    await transport.connect()
    old_client = transport._client
    await old_client.lose_session()
    # Reconnect before the scheduled cleanup gets the lock.
    await transport.connect()
    new_client = transport._client
    await asyncio.gather(*transport._session_cleanup)
    assert new_client is not old_client
    assert transport.connected
    old_client.stop.assert_awaited_once()
    new_client.stop.assert_not_awaited()
    await transport.close()


@pytest.mark.asyncio
async def test_replacement_session_loss_is_cleaned_up_too(transport):
    await transport.connect()
    old_client = transport._client
    await old_client.lose_session()
    await transport.connect()
    new_client = transport._client
    await new_client.lose_session()
    await asyncio.gather(*transport._session_cleanup)
    old_client.stop.assert_awaited_once()
    new_client.stop.assert_awaited_once()
    assert transport._client is None
    await transport.close()


@pytest.mark.asyncio
async def test_intentional_shutdown_does_not_warn_about_session_loss(transport, caplog):
    await transport.connect()
    await transport.close()
    assert not transport.connected
    assert not transport._session_cleanup
    assert "Soulseek session ended" not in caplog.text


@pytest.mark.asyncio
async def test_lost_session_marks_search_failed_instead_of_not_found(transport, tmp_path):
    await transport.connect()
    client = transport._client

    async def interrupted_search(_query):
        await client.lose_session()
        return SimpleNamespace(results=[])

    client.searches.search.side_effect = interrupted_search
    manager = DownloadManager(
        transport, tmp_path, incoming_dir=transport.incoming_dir,
        search_window=0, search_gap=0,
    )
    try:
        job = manager.create_job(Preferences(), [("Title", "Artist", "Mix")])
        await manager.wait_idle()
        assert job.items[0].status == "failed"
        assert "session ended during search" in job.items[0].error
    finally:
        await manager.shutdown()


@pytest.mark.asyncio
async def test_old_search_failure_does_not_stop_new_session(transport):
    await transport.connect()
    old_client = transport._client

    async def failing_search(_query):
        await old_client.lose_session()
        await transport.connect()
        raise OSError("connection lost")

    old_client.searches.search.side_effect = failing_search
    with pytest.raises(SearchFailed, match="connection lost"):
        await transport.search("artist title", 0)
    await asyncio.gather(*transport._session_cleanup)
    assert transport.connected
    assert transport._client is not old_client
    transport._client.stop.assert_not_awaited()
    await transport.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("login_error", [None, OSError("login failed")])
async def test_unsuccessful_login_stops_client(transport, login_error):
    client = FakeClient(None)
    client.login.side_effect = login_error
    aioslsk_transport.SoulSeekClient.side_effect = None
    aioslsk_transport.SoulSeekClient.return_value = client
    with pytest.raises(SearchFailed, match="could not connect"):
        await transport.connect()
    client.stop.assert_awaited_once()
    assert not transport.connected


@pytest.mark.asyncio
async def test_close_waits_for_pending_cleanup(transport):
    await transport.connect()
    client = transport._client
    await client.lose_session()
    await transport.close()
    assert not transport._session_cleanup
    client.stop.assert_awaited_once()
    assert not transport.connected


@pytest.mark.asyncio
async def test_download_without_session_uses_download_error(transport):
    with pytest.raises(DownloadFailed, match="not connected"):
        await transport.download(SimpleNamespace(), lambda *_: None)


@pytest.mark.asyncio
async def test_session_loss_interrupts_download_without_waiting_for_stall(transport, monkeypatch):
    monkeypatch.setattr(aioslsk_transport, "POLL_SECONDS", 0)
    await transport.connect()
    client = transport._client
    transfer = SimpleNamespace(is_finalized=lambda: False)

    async def interrupted_download(*_args):
        await client.lose_session()
        return transfer

    client.transfers.download.side_effect = interrupted_download
    with pytest.raises(DownloadFailed, match="session ended during download"):
        await transport.download(
            SimpleNamespace(username="peer", remote_path="track.flac"), lambda *_: None
        )
    await transport.close()
