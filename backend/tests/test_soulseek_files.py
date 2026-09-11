from pathlib import Path

from backend.src.infra.soulseek import files


def test_sanitise_replaces_forbidden_characters():
    assert files.sanitise('Mix: 12/06 "live" <set>?', 120) == "Mix_ 12_06 _live_ _set__"


def test_sanitise_trims_dots_and_caps_length():
    assert files.sanitise("...  hello  ...", 120) == "hello"
    assert len(files.sanitise("a" * 500, 120)) == 120


def test_source_folder_fallback():
    assert files.source_folder("///") == "Unknown source"
    assert files.source_folder("  ...  ") == "Unknown source"
    assert files.source_folder("Blawan - Essential Mix") == "Blawan - Essential Mix"


def test_track_filename_budget_includes_extension():
    name = files.track_filename("A" * 200, "B" * 200, "flac")
    assert name.endswith(".flac")
    assert len(name) <= files.MAX_FILENAME_CHARS


def test_destination_and_collisions(tmp_path: Path):
    first = files.destination(tmp_path, "My Mix", "DJ Koze", "Pick Up", "flac")
    assert first == tmp_path / "My Mix" / "DJ Koze - Pick Up.flac"

    first.parent.mkdir()
    first.write_bytes(b"x")
    second = files.destination(tmp_path, "My Mix", "DJ Koze", "Pick Up", "flac")
    assert second.name == "DJ Koze - Pick Up (2).flac"

    second.write_bytes(b"x")
    third = files.destination(tmp_path, "My Mix", "DJ Koze", "Pick Up", "flac")
    assert third.name == "DJ Koze - Pick Up (3).flac"


def test_finalise_moves_and_cleans_incoming_skeleton(tmp_path: Path):
    incoming = tmp_path / ".incoming"
    downloaded = incoming / "@@peer" / "Music" / "Album" / "03 - track.flac"
    downloaded.parent.mkdir(parents=True)
    downloaded.write_bytes(b"audio")

    target = tmp_path / "My Mix" / "DJ Koze - Pick Up.flac"
    result = files.finalise(downloaded, target, incoming)

    assert result == target
    assert target.read_bytes() == b"audio"
    assert not downloaded.exists()
    assert not (incoming / "@@peer").exists()
    assert incoming.exists()  # the root itself stays


def test_finalise_leaves_non_empty_folders(tmp_path: Path):
    incoming = tmp_path / ".incoming"
    folder = incoming / "@@peer" / "Album"
    folder.mkdir(parents=True)
    (folder / "other.flac").write_bytes(b"keep")
    downloaded = folder / "track.flac"
    downloaded.write_bytes(b"audio")

    files.finalise(downloaded, tmp_path / "Mix" / "t.flac", incoming)
    assert (folder / "other.flac").exists()
