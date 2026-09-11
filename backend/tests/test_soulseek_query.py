import pytest

from backend.src.infra.soulseek.query import (
    build_queries,
    normalise,
    parse_filename,
    parse_title,
    primary_artist,
)


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Röyksopp & Robyn", "royksopp and robyn"),
        ("Mr. Fingers_Can You Feel It", "mr fingers can you feel it"),
        ("  Ça   plane! ", "ca plane"),
    ],
)
def test_normalise(raw, expected):
    assert normalise(raw) == expected


def test_parse_title_keeps_remix_and_drops_noise():
    parsed = parse_title("Pick Up (DJ Koze Remix) (Original Mix) [Bonus Track]")
    assert parsed.core == "pick up"
    assert parsed.markers == ("dj koze remix",)
    assert parsed.marker_words == {"remix"}


def test_parse_title_dash_segment_is_a_marker():
    parsed = parse_title("Shimmer - Extended Version")
    assert parsed.core == "shimmer"
    assert parsed.markers == ()  # "extended version" is noise

    parsed = parse_title("Shimmer - Live at Berghain")
    assert parsed.markers == ("live at berghain",)


def test_parse_title_strips_feat():
    parsed = parse_title("Baby Baby feat. Someone (Radio Edit)")
    assert parsed.core == "baby baby"
    assert parsed.markers == ()


def test_parse_filename_drops_track_number_and_extension():
    parsed = parse_filename("03 - Objekt - Ruff Dug (Vocal Mix).flac")
    assert parsed.core == "objekt"  # dash splitting: first segment is the "core"
    assert parsed.markers == ("vocal mix",)
    assert parsed.marker_words == {"mix"}


def test_parse_filename_original_mix_is_not_a_marker():
    assert parse_filename("Impulse (Original Mix).mp3").marker_words == set()


@pytest.mark.parametrize(
    "artist, expected",
    [
        ("Forest Drive West", "forest drive west"),
        ("Bicep, Hammer", "bicep"),
        ("Skee Mask x Zenker Brothers", "skee mask"),
        ("Röyksopp & Robyn", "royksopp"),
        ("Artist feat. Guest", "artist"),
    ],
)
def test_primary_artist(artist, expected):
    assert primary_artist(artist) == expected


def test_build_queries_two_tiers():
    tiers = build_queries("Bicep, Hammer", "Glue (Ben Klock Remix)")
    assert tiers == ["bicep hammer glue ben klock remix", "bicep glue"]


def test_build_queries_collapses_identical_tiers():
    assert build_queries("Objekt", "Ruff Dug") == ["objekt ruff dug"]


def test_build_queries_dedupes_tokens():
    assert build_queries("Sleep D", "Sleep") == ["sleep d"]
