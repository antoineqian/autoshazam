import json
import stat

from backend.src.infra.soulseek.diagnostics import DownloadJournal


def test_journal_rotates_and_keeps_files_private(tmp_path):
    journal = DownloadJournal(tmp_path)
    journal.record("start", jobId="job")
    journal._handler.maxBytes = 200
    for i in range(20):
        journal.record("attempt", jobId="job", index=i)
    journal.close()
    paths = list((tmp_path / ".diagnostics").iterdir())
    assert len(paths) == 3
    for path in paths:
        assert stat.S_IMODE(path.stat().st_mode) == 0o600
        assert all(json.loads(line)["jobId"] == "job" for line in path.read_text().splitlines())
    # A replacement manager appends rather than truncating existing evidence.
    replacement = DownloadJournal(tmp_path)
    replacement.record("restart", jobId="job")
    replacement.close()
    events = [json.loads(line)["event"] for line in journal.path.read_text().splitlines()]
    assert events == ["attempt", "restart"]
