"""Filter, score, rank and decide between search candidates."""
from dataclasses import dataclass, field
from typing import Literal

from rapidfuzz import fuzz

from .query import (
    ParsedTitle,
    normalise,
    parse_filename,
    parse_title,
    primary_artist,
    strip_feat,
    tokens,
    version_words,
)
from .transport import Candidate

MATCH_THRESHOLD = 80.0
AUTO_THRESHOLD = 85.0
MIN_FILESIZE = 500 * 1024
EXTRA_WORD_PENALTY = 10.0
MAX_EXTRA_PENALTY = 40.0
REVIEW_CANDIDATES = 3

LOSSLESS = frozenset({"flac", "wav", "aiff", "aif", "alac"})
ALLOWED_FORMATS = ("flac", "mp3", "aiff", "wav", "m4a", "ogg")


@dataclass(frozen=True)
class Preferences:
    format_priority: tuple[str, ...] = ("flac", "mp3")
    min_mp3_bitrate: int | None = 320
    auto_download: bool = True


@dataclass(frozen=True)
class Scored:
    candidate: Candidate
    match: float
    clean_name: str  # normalised filename, the identity of a "distinct file"
    # Meaningful version markers only: "Original Mix" is the track itself, so a
    # file labelled with it must read as unmarked, exactly as in passes_filters.
    markers: frozenset[str] = frozenset()


DecisionStatus = Literal["matched", "review", "not_found"]


@dataclass
class Decision:
    status: DecisionStatus
    ranked: list[Scored] = field(default_factory=list)  # every survivor, best first
    groups: list[Scored] = field(default_factory=list)  # best user per distinct file


@dataclass(frozen=True)
class Target:
    """The track we are looking for, pre-parsed once per search."""

    artist: str
    artist_primary: str
    title: ParsedTitle

    @classmethod
    def for_track(cls, artist: str, title: str) -> "Target":
        return cls(
            artist=normalise(strip_feat(artist)),
            artist_primary=primary_artist(artist),
            title=parse_title(title),
        )


def clean_filename(filename: str) -> str:
    """Normalised stem, markers included: two peers sharing the same rip
    collapse to one identity."""
    stem, dot, _ = filename.rpartition(".")
    return normalise(stem if dot else filename)


# ----------------------------------------------------------------- filters --


def passes_filters(candidate: Candidate, target: Target, prefs: Preferences) -> bool:
    if candidate.extension not in prefs.format_priority:
        return False

    if (
        candidate.extension == "mp3"
        and prefs.min_mp3_bitrate is not None
        and candidate.bitrate is not None
        and candidate.bitrate < prefs.min_mp3_bitrate
    ):
        return False

    if candidate.filesize < MIN_FILESIZE:
        return False

    # A remix, edit or live take of the right track is the wrong download.
    # Compare version *words* so "DJ Koze Remix" and "Koze Rmx" agree enough,
    # while "Original Mix" was already discarded as noise by the parser.
    file_markers = parse_filename(candidate.filename).marker_words
    if not file_markers <= target.title.marker_words:
        return False

    return True


# ----------------------------------------------------------------- scoring --


def score(candidate: Candidate, target: Target) -> Scored:
    clean = clean_filename(candidate.filename)
    clean_tokens = tokens(clean)

    remove = set(tokens(target.artist)) | set(
        w for m in target.title.markers for w in m.split()
    ) | version_words(clean) | _noise_words()
    residual_tokens = [t for t in clean_tokens if t not in remove]
    residual = " ".join(residual_tokens)

    s_title = fuzz.token_set_ratio(target.title.core, residual) if residual else 0.0
    s_artist = max(
        fuzz.partial_ratio(target.artist, clean),
        fuzz.partial_ratio(target.artist, normalise(candidate.folder)),
        fuzz.partial_ratio(target.artist_primary, clean) if target.artist_primary else 0.0,
    )
    s_marker = (
        min(fuzz.partial_ratio(m, clean) for m in target.title.markers)
        if target.title.markers
        else 100.0
    )

    core_tokens = set(target.title.core.split())
    extra = [
        t for t in residual_tokens if t not in core_tokens and not any(c.isdigit() for c in t)
    ]
    penalty = min(EXTRA_WORD_PENALTY * len(extra), MAX_EXTRA_PENALTY)

    match = 0.55 * s_title + 0.30 * s_artist + 0.15 * s_marker - penalty
    return Scored(
        candidate=candidate,
        match=round(max(match, 0.0), 1),
        clean_name=clean,
        markers=parse_filename(candidate.filename).marker_words,
    )


def _noise_words() -> set[str]:
    return {"original", "album", "explicit", "clean", "bonus", "track", "feat", "ft", "featuring"}


# ----------------------------------------------------------------- ranking --


def bitrate_tier(candidate: Candidate) -> int:
    if candidate.extension in LOSSLESS:
        return 6
    bitrate = candidate.bitrate
    if bitrate is None:
        return 0
    if bitrate >= 320:
        return 5
    if candidate.vbr and bitrate >= 220:
        return 4
    if bitrate >= 256:
        return 3
    if bitrate >= 192:
        return 2
    return 1


def _format_index(scored: Scored, prefs: Preferences) -> int:
    ext = scored.candidate.extension
    return (
        prefs.format_priority.index(ext)
        if ext in prefs.format_priority
        else len(prefs.format_priority)
    )


def group_key(scored: Scored, prefs: Preferences):
    """Which *file* to take. Confidence first: the right track in a second-choice
    format beats a likely-wrong one in the preferred format. Within a confidence
    tier the user's format and bitrate preferences decide, and availability does
    not enter — that is a question about peers, settled by rank_key."""
    return (
        0 if scored.match >= AUTO_THRESHOLD else 1,
        _format_index(scored, prefs),
        -bitrate_tier(scored.candidate),
        -scored.match,
    )


def rank_key(scored: Scored, prefs: Preferences):
    """Which *peer* to take it from, among everyone offering files."""
    c = scored.candidate
    return (
        _format_index(scored, prefs),
        -bitrate_tier(c),
        0 if c.has_free_slots else 1,
        c.queue_size,
        -c.avg_speed,
        -scored.match,
    )


def rank(scored: list[Scored], prefs: Preferences) -> list[Scored]:
    return sorted(scored, key=lambda s: rank_key(s, prefs))


# ---------------------------------------------------------------- pipeline --


def evaluate(candidates: list[Candidate], target: Target, prefs: Preferences) -> Decision:
    survivors = [
        s
        for s in (score(c, target) for c in candidates if passes_filters(c, target, prefs))
        if s.match >= MATCH_THRESHOLD
    ]
    ranked = rank(survivors, prefs)

    # One entry per distinct file, each represented by its most available peer,
    # then reordered by how good the file itself looks.
    groups: list[Scored] = []
    seen: set[str] = set()
    for s in ranked:
        if s.clean_name not in seen:
            seen.add(s.clean_name)
            groups.append(s)
    groups.sort(key=lambda s: group_key(s, prefs))

    if not groups:
        return Decision(status="not_found")

    if not prefs.auto_download:
        return Decision(status="review", ranked=ranked, groups=groups[:REVIEW_CANDIDATES])

    # Two strong candidates are only a real doubt when they are different takes
    # of the track. Reading raw filename words here would count "Checkpoint" and
    # "Checkpoint (Original Mix)" as a disagreement, though the filter above has
    # already ruled that marker meaningless.
    top = groups[0]
    trigger = next(
        (
            other
            for other in groups[1:]
            if other.match >= AUTO_THRESHOLD and other.markers != top.markers
        ),
        None,
    )
    if top.match >= AUTO_THRESHOLD and trigger is None:
        return Decision(status="matched", ranked=ranked, groups=groups[:REVIEW_CANDIDATES])

    return Decision(status="review", ranked=ranked, groups=_review_list(groups, trigger))


def _review_list(groups: list[Scored], trigger: Scored | None) -> list[Scored]:
    """The card asks the user to settle a doubt, so whatever raised it has to be
    on the card — otherwise they see a row of equally good files and no reason."""
    shown = groups[:REVIEW_CANDIDATES]
    if trigger is None or trigger in shown:
        return shown
    return shown[: REVIEW_CANDIDATES - 1] + [trigger]
