"""Bounded, local download evidence that survives job expiry and restarts."""
import json
import logging
import os
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path

log = logging.getLogger(__name__)


class _PrivateRotatingHandler(RotatingFileHandler):
    def _open(self):
        # Apply the same permissions to new files after rotation.
        fd = os.open(self.baseFilename, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        return os.fdopen(fd, self.mode, encoding=self.encoding)


class DownloadJournal:
    def __init__(self, download_dir: Path):
        self.path = download_dir / ".diagnostics" / "soulseek.jsonl"
        self._handler: RotatingFileHandler | None = None

    def record(self, event: str, **fields) -> None:
        try:
            if self._handler is None:
                self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                self._handler = _PrivateRotatingHandler(
                    self.path, maxBytes=2 * 1024 * 1024, backupCount=2, encoding="utf-8"
                )
                self.path.chmod(0o600)
            message = json.dumps({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "event": event, **fields,
            }, ensure_ascii=False)
            self._handler.handle(logging.LogRecord(
                __name__, logging.INFO, __file__, 0, message, (), None
            ))
        except Exception:  # Diagnostics must never strand a download.
            log.warning("Could not write Soulseek diagnostics", exc_info=True)

    def close(self) -> None:
        if self._handler is not None:
            self._handler.close()
            self._handler = None
