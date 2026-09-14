from dataclasses import replace

import pytest

from backend.src.infra.soulseek.matching import (
    Preferences,
    Target,
    bitrate_tier,
    evaluate,
    passes_filters,
    rank,
    score,
)
from backend.src.infra.soulseek.transport import Candidate


def cand(
    remote_path,
    *,
    username="peer",
    extension=None,
    filesize=8_000_000,
    bitrate=320,
    vbr=False,
    has_free_slots=True,
    avg_speed=1_000,
    queue_size=0,
):
    folder, _, filename = remote_path.rpartition("\\")
    folder = folder.rpartition("\\")[2]
    ext = extension or filename.rpartition(".")[2].lower()
    return Candidate(
        username=username,
        remote_path=remote_path,
        filename=filename,
        folder=folder,
        extension=ext,
        filesize=filesize,
        bitrate=bitrate,
        duration=None,
        vbr=vbr,
        sample_rate=None,
        bit_depth=None,
        has_free_slots=has_free_slots,
        avg_speed=avg_speed,
        queue_size=queue_size,
    )


PREFS = Preferences()
KOZE = Target.for_track("DJ Koze", "Pick Up")
KOZE_REMIX = Target.for_track("DJ Koze", "Pick Up (Stimming Remix)")


class TestFilters:
    def test_wrong_extension(self):
        assert not passes_filters(cand("@@x\\a\\DJ Koze - Pick Up.m4a"), KOZE, PREFS)

    def test_low_bitrate_mp3(self):
        assert not passes_filters(cand("@@x\\a\\DJ Koze - Pick Up.mp3", bitrate=192), KOZE, PREFS)

    def test_unknown_bitrate_passes(self):
        assert passes_filters(cand("@@x\\a\\DJ Koze - Pick Up.mp3", bitrate=None), KOZE, PREFS)

    def test_any_bitrate_when_unset(self):
        prefs = replace(PREFS, min_mp3_bitrate=None)
        assert passes_filters(cand("@@x\\a\\DJ Koze - Pick Up.mp3", bitrate=128), KOZE, prefs)

    def test_tiny_file(self):
        assert not passes_filters(cand("@@x\\a\\DJ Koze - Pick Up.mp3", filesize=100_000), KOZE, PREFS)

    def test_remix_of_the_original_is_rejected(self):
        assert not passes_filters(cand("@@x\\a\\DJ Koze - Pick Up (Stimming Remix).mp3"), KOZE, PREFS)

    def test_original_mix_label_is_fine(self):
        assert passes_filters(cand("@@x\\a\\DJ Koze - Pick Up (Original Mix).mp3"), KOZE, PREFS)

    def test_remix_target_accepts_remix_file(self):
        assert passes_filters(cand("@@x\\a\\DJ Koze - Pick Up (Stimming Remix).mp3"), KOZE_REMIX, PREFS)


class TestScore:
    def test_exact_artist_title_filename(self):
        s = score(cand("@@x\\Knock Knock\\03 - DJ Koze - Pick Up.flac"), KOZE)
        assert s.match >= 95

    def test_title_only_with_artist_in_folder(self):
        s = score(cand("@@x\\DJ Koze - Knock Knock (2018)\\03 Pick Up.flac"), KOZE)
        assert s.match >= 90

    def test_longer_title_is_penalised(self):
        s = score(cand("@@x\\Misc\\DJ Koze - Pick Up The Phone.mp3"), KOZE)
        assert s.match < 85

    def test_unrelated_track_is_below_threshold(self):
        s = score(cand("@@x\\Misc\\DJ Koze - Seeing Aliens.mp3"), KOZE)
        assert s.match < 80

    def test_remix_marker_contributes(self):
        good = score(cand("@@x\\a\\DJ Koze - Pick Up (Stimming Remix).mp3"), KOZE_REMIX)
        assert good.match >= 90

    def test_catalogue_numbers_are_not_penalised(self):
        s = score(cand("@@x\\a\\PAMPA042 DJ Koze - Pick Up.mp3"), KOZE)
        assert s.match >= 90


class TestRank:
    def test_format_priority_beats_bitrate_and_speed(self):
        flac = score(cand("@@x\\a\\DJ Koze - Pick Up.flac", avg_speed=10), KOZE)
        mp3 = score(cand("@@x\\a\\DJ Koze - Pick Up.mp3", avg_speed=10_000), KOZE)
        assert rank([mp3, flac], PREFS) == [flac, mp3]

        mp3_first = replace(PREFS, format_priority=("mp3", "flac"))
        assert rank([flac, mp3], mp3_first) == [mp3, flac]

    def test_free_slot_then_queue_then_speed(self):
        busy = score(cand("@@x\\a\\DJ Koze - Pick Up.mp3", username="a", has_free_slots=False), KOZE)
        queued = score(cand("@@x\\a\\DJ Koze - Pick Up.mp3", username="b", queue_size=5), KOZE)
        fast = score(cand("@@x\\a\\DJ Koze - Pick Up.mp3", username="c", avg_speed=9_999), KOZE)
        assert [s.candidate.username for s in rank([busy, queued, fast], PREFS)] == ["c", "b", "a"]

    def test_bitrate_tiers(self):
        assert bitrate_tier(cand("a\\b\\x.flac", bitrate=None)) == 6
        assert bitrate_tier(cand("a\\b\\x.mp3", bitrate=320)) == 5
        assert bitrate_tier(cand("a\\b\\x.mp3", bitrate=245, vbr=True)) == 4
        assert bitrate_tier(cand("a\\b\\x.mp3", bitrate=256)) == 3
        assert bitrate_tier(cand("a\\b\\x.mp3", bitrate=192)) == 2
        assert bitrate_tier(cand("a\\b\\x.mp3", bitrate=128)) == 1
        assert bitrate_tier(cand("a\\b\\x.mp3", bitrate=None)) == 0


class TestEvaluate:
    def test_nothing_survives(self):
        decision = evaluate([cand("@@x\\a\\Someone Else - Other Song.mp3")], KOZE, PREFS)
        assert decision.status == "not_found"
        assert decision.groups == []

    def test_confident_match_downloads(self):
        cands = [
            cand("@@x\\a\\DJ Koze - Pick Up.flac", username="a"),
            cand("@@x\\b\\DJ Koze - Pick Up.flac", username="b"),
            cand("@@x\\c\\03 - DJ Koze - Pick Up.mp3", username="c"),
        ]
        decision = evaluate(cands, KOZE, PREFS)
        assert decision.status == "matched"
        # Two users sharing the same rip collapse into one group.
        assert [g.clean_name for g in decision.groups] == ["dj koze pick up", "03 dj koze pick up"]
        assert decision.groups[0].candidate.extension == "flac"
        assert len(decision.ranked) == 3

    def test_auto_download_off_always_reviews(self):
        decision = evaluate([cand("@@x\\a\\DJ Koze - Pick Up.flac")], KOZE, replace(PREFS, auto_download=False))
        assert decision.status == "review"

    def test_borderline_match_reviews(self):
        decision = evaluate([cand("@@x\\a\\DJ Koze - Pick Up The Phone.mp3")], KOZE, PREFS)
        assert decision.status == "review"

    def test_disagreeing_markers_review(self):
        target = Target.for_track("DJ Koze", "Pick Up (Stimming Remix)")
        cands = [
            cand("@@x\\a\\DJ Koze - Pick Up (Stimming Remix).flac", username="a"),
            # Passes the marker filter (no *extra* marker) but is a different file.
            cand("@@x\\b\\DJ Koze - Pick Up Stimming.flac", username="b"),
        ]
        decision = evaluate(cands, target, PREFS)
        assert decision.status == "review"
        assert len(decision.groups) == 2

    def test_noise_marker_is_not_a_disagreement(self):
        """"Original Mix" is the track itself, so it must not force a review."""
        cands = [
            cand("@@x\\a\\DJ Koze - Pick Up.flac", username="a"),
            cand("@@x\\b\\DJ Koze - Pick Up (Original Mix).flac", username="b"),
            cand("@@x\\c\\DJ Koze - Pick Up (Radio Edit).flac", username="c"),
        ]
        decision = evaluate(cands, KOZE, PREFS)
        assert decision.status == "matched"
        assert len(decision.groups) == 3

    def test_review_keeps_at_most_three_groups(self):
        cands = [
            cand(f"@@x\\{i}\\DJ Koze - Pick Up The Phone {i}.mp3", username=str(i)) for i in range(5)
        ]
        decision = evaluate(cands, KOZE, replace(PREFS, auto_download=False))
        assert decision.status == "review"
        assert len(decision.groups) <= 3
