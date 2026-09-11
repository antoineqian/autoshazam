"""Manual end-to-end check of the Soulseek pipeline against the live network.

    SOULSEEK_ACCOUNT=... SOULSEEK_PASSWORD=... \
    .venv/bin/python -m scripts.soulseek_smoke "DJ Koze - Pick Up" "Objekt - Ruff Dug" [--download]

Each argument is "Artist - Title". Prints the queries, the surviving
candidates and the decision; with --download it also downloads what would be
downloaded automatically and prints the final paths.
"""
import argparse
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.src.infra.soulseek.aioslsk_transport import AioslskTransport  # noqa: E402
from backend.src.infra.soulseek.config import load_config  # noqa: E402
from backend.src.infra.soulseek.jobs import SEARCH_WINDOW_SECONDS, DownloadManager  # noqa: E402
from backend.src.infra.soulseek.matching import Preferences  # noqa: E402


def parse_track(raw: str) -> tuple[str, str]:
    artist, sep, title = raw.partition(" - ")
    if not sep:
        raise SystemExit(f'expected "Artist - Title", got {raw!r}')
    return artist.strip(), title.strip()


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tracks", nargs="+", help='"Artist - Title"')
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--formats", default="flac,mp3")
    parser.add_argument("--min-mp3", type=int, default=320)
    parser.add_argument("--window", type=float, default=SEARCH_WINDOW_SECONDS)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    config = load_config()
    if config is None:
        raise SystemExit("set SOULSEEK_ACCOUNT and SOULSEEK_PASSWORD")

    prefs = Preferences(
        format_priority=tuple(args.formats.split(",")),
        min_mp3_bitrate=args.min_mp3,
        auto_download=args.download,
    )
    transport = AioslskTransport(config)
    manager = DownloadManager(transport, config.download_dir, incoming_dir=transport.incoming_dir, search_window=args.window)

    items = [(title, artist, "Soulseek smoke test") for artist, title in map(parse_track, args.tracks)]
    job = manager.create_job(prefs, items)

    try:
        await manager.wait_idle()
        for item in job.items:
            print(f"\n== {item.subtitle} - {item.title}")
            print(f"   query: {item.query_used!r}  ->  {item.status}")
            for scored in item.ranked[:8]:
                c = scored.candidate
                quality = "lossless" if c.extension == "flac" else f"{c.bitrate or '?'}kbps"
                slot = "free" if c.has_free_slots else f"queue {c.queue_size}"
                print(f"   {scored.match:5.1f}  {c.extension:4} {quality:>9}  {c.filesize/1e6:6.1f}MB  {slot:>9}  {c.username}: {c.filename}")
            if item.error:
                print(f"   error: {item.error}")
            if item.local_path:
                print(f"   saved: {item.local_path}")
    finally:
        await manager.shutdown()

    return 0 if all(i.status in ("done", "review") for i in job.items) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
