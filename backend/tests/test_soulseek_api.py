import time
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.src.app import soulseek as api
from backend.src.infra.soulseek.jobs import DownloadManager
from backend.tests.test_soulseek_jobs import GOOD, FakeTransport, cand, no_sleep


@pytest.fixture
def client(tmp_path: Path, monkeypatch):
    incoming = tmp_path / ".incoming"
    transport = FakeTransport(incoming, results={"dj koze pick up": [cand(GOOD, "a")]})
    manager = DownloadManager(
        transport, tmp_path, incoming_dir=incoming, search_window=0, search_gap=0, sleep=no_sleep
    )
    monkeypatch.setattr(api, "_manager", manager)
    monkeypatch.setattr(api, "load_config", lambda: object())

    app = FastAPI()
    app.include_router(api.router)
    with TestClient(app) as test_client:
        yield test_client, manager, transport


def test_status_unconfigured(monkeypatch):
    monkeypatch.setattr(api, "_manager", None)
    monkeypatch.setattr(api, "load_config", lambda: None)
    app = FastAPI()
    app.include_router(api.router)
    with TestClient(app) as c:
        assert c.get("/soulseek/status").json() == {"configured": False, "connected": False}
        response = c.post("/soulseek/jobs", json={"items": [{"title": "a", "subtitle": "b"}]})
        assert response.status_code == 503
        assert response.json()["detail"] == "Soulseek is not configured"


def test_create_and_poll_job(client):
    c, manager, transport = client
    response = c.post(
        "/soulseek/jobs",
        json={
            "preferences": {"formatPriority": ["FLAC", "mp3"], "minMp3Bitrate": None, "autoDownload": False},
            "items": [{"title": "Pick Up", "subtitle": "DJ Koze", "sourceLabel": "Late Night Mix"}],
        },
    )
    assert response.status_code == 201, response.text
    job = response.json()
    assert job["items"][0]["status"] == "queued"
    assert job["items"][0]["sourceLabel"] == "Late Night Mix"

    # The TestClient runs the app on its own loop between requests; poll until
    # the worker has run.
    for _ in range(50):
        time.sleep(0.01)
        polled = c.get(f"/soulseek/jobs/{job['id']}").json()
        if polled["items"][0]["status"] == "review":
            break
    item = polled["items"][0]
    assert item["status"] == "review"
    assert item["candidates"][0]["username"] == "a"
    assert item["candidates"][0]["remotePath"] == GOOD
    assert item["candidates"][0]["extension"] == "flac"
    assert item["candidates"][0]["matchScore"] >= 85
    assert item["chosen"] is None

    chosen = c.post(
        f"/soulseek/jobs/{job['id']}/items/{item['id']}/choose",
        json={"username": "a", "remotePath": GOOD},
    )
    assert chosen.status_code == 200, chosen.text
    assert chosen.json()["status"] in ("matched", "downloading", "done")

    for _ in range(50):
        time.sleep(0.01)
        polled = c.get(f"/soulseek/jobs/{job['id']}").json()
        if polled["items"][0]["status"] == "done":
            break
    assert polled["items"][0]["status"] == "done"
    assert polled["items"][0]["localPath"].endswith("Late Night Mix/DJ Koze - Pick Up.flac")
    assert polled["items"][0]["candidates"] == []  # only sent while reviewing


def test_validation_errors(client):
    c, _, _ = client
    bad = c.post(
        "/soulseek/jobs",
        json={"preferences": {"formatPriority": ["wma"]}, "items": [{"title": "a", "subtitle": "b"}]},
    )
    assert bad.status_code == 422
    assert c.post("/soulseek/jobs", json={"items": []}).status_code == 422
    assert c.get("/soulseek/jobs/nope").status_code == 404
    assert c.post("/soulseek/jobs/nope/items/x/skip").status_code == 404


def test_skip_wrong_state_is_a_conflict(client):
    c, manager, _ = client
    job = c.post("/soulseek/jobs", json={"items": [{"title": "Pick Up", "subtitle": "DJ Koze"}]}).json()
    for _ in range(50):
        time.sleep(0.01)
        polled = c.get(f"/soulseek/jobs/{job['id']}").json()
        if polled["items"][0]["status"] == "done":
            break
    response = c.post(f"/soulseek/jobs/{job['id']}/items/{job['items'][0]['id']}/skip")
    assert response.status_code == 409
