"""Turn a track's artist and title into Soulseek search queries.

Soulseek only returns files whose full path contains every query token, so
the query has to be lean; matching (``matching.py``) is where strictness
lives. The same normalisation is applied to remote filenames so the two sides
compare like with like.
"""
import re
import unicodedata
from dataclasses import dataclass

# Words that mark a *version* of a track rather than the track itself.
VERSION_WORDS = frozenset(
    {
        "remix", "mix", "edit", "rework", "version", "dub", "vip", "bootleg",
        "instrumental", "acoustic", "live", "remaster", "remastered",
        "extended", "radio", "club",
    }
)

# Version markers that carry no information: a file labelled "Original Mix" is
# the track itself, and "Radio Edit" is the same recording cut short.
NOISE_PATTERNS = tuple(
    re.compile(p)
    for p in (
        r"^original( mix| version)?$",
        r"^extended( mix| version)?$",
        r"^radio (edit|mix|version)$",
        r"^album (version|mix)$",
        r"^(\d{4} )?remaster(ed)?( \d{4})?$",
        r"^explicit$",
        r"^clean$",
        r"^(feat|ft|featuring)\b.*",
        r"^bonus track$",
    )
)

_FEAT_RE = re.compile(r"\b(feat|ft|featuring)\b\.?\s.*$", re.IGNORECASE)
_BRACKET_RE = re.compile(r"[\(\[\{]([^\)\]\}]*)[\)\]\}]")
_DASH_SPLIT_RE = re.compile(r"\s+[-–—]\s+")
_TRACK_NUMBER_RE = re.compile(r"^\d{1,3}[\s._-]+")
_ARTIST_SPLIT_RE = re.compile(r",|\s+x\s+|\s+vs\.?\s+|\s+and\s+|\s+&\s+")


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().replace("&", " and ")
    text = re.sub(r"[_.]", " ", text)
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def tokens(text: str) -> list[str]:
    return normalise(text).split()


def strip_feat(text: str) -> str:
    return _FEAT_RE.sub("", text).strip()


def is_noise(marker: str) -> bool:
    return any(p.match(marker) for p in NOISE_PATTERNS)


def version_words(text: str) -> frozenset[str]:
    return frozenset(t for t in tokens(text) if t in VERSION_WORDS)


@dataclass(frozen=True)
class ParsedTitle:
    core: str  # normalised title without brackets, dash segments or credits
    markers: tuple[str, ...]  # normalised version markers that must be present

    @property
    def marker_words(self) -> frozenset[str]:
        return frozenset(w for m in self.markers for w in version_words(m))


def parse_title(title: str) -> ParsedTitle:
    segments: list[str] = []

    def grab(match: re.Match) -> str:
        segments.append(match.group(1))
        return " "

    rest = _BRACKET_RE.sub(grab, title)
    parts = _DASH_SPLIT_RE.split(rest)
    core = strip_feat(parts[0])
    segments.extend(parts[1:])

    markers = []
    for segment in segments:
        marker = normalise(strip_feat(segment))
        if not marker or is_noise(marker):
            continue
        if version_words(marker):
            markers.append(marker)
        # Anything else in brackets ("Bonus", a catalogue number) says
        # nothing about which recording this is and is dropped.

    return ParsedTitle(core=normalise(core), markers=tuple(markers))


def parse_filename(filename: str) -> ParsedTitle:
    """Same parsing for a remote filename: extension and track number off."""
    stem, dot, _ = filename.rpartition(".")
    name = stem if dot else filename
    name = _TRACK_NUMBER_RE.sub("", name.strip())
    return parse_title(name)


def primary_artist(artist: str) -> str:
    """First credited artist: "A, B", "A x B", "A vs B", "A & B" -> "A"."""
    head = _ARTIST_SPLIT_RE.split(strip_feat(artist), maxsplit=1)[0]
    return normalise(head)


def _dedupe(words: list[str]) -> list[str]:
    seen: set[str] = set()
    return [w for w in words if not (w in seen or seen.add(w))]


def build_queries(artist: str, title: str) -> list[str]:
    """Tier 1 then tier 2. Tier 2 is omitted when identical to tier 1."""
    parsed = parse_title(title)
    full_artist = normalise(strip_feat(artist))

    tier1 = " ".join(
        _dedupe(f"{full_artist} {parsed.core} {' '.join(parsed.markers)}".split())
    )
    tier2 = " ".join(_dedupe(f"{primary_artist(artist)} {parsed.core}".split()))

    queries = [q for q in (tier1, tier2) if q]
    return _dedupe(queries)
