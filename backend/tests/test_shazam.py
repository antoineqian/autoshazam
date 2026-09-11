from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from backend.src.infra.shazam import shazam_file

JUST_NOISE = Path(__file__).parent / "just_noise.mp3"


def test_processFolder():
    pass


def test_processUrl():
    pass


@pytest.mark.asyncio
async def test_shazam_file():
    # Stub the Shazam call rather than reaching the live endpoint: noise matches
    # nothing anyway, and the behaviour under test is that unmatched segments
    # are dropped from the result rather than surfacing as None entries.
    with patch(
        "backend.src.infra.shazam._recognize", new=AsyncMock(return_value=None)
    ):
        result = await shazam_file(str(JUST_NOISE), 1)

    assert type(result) == list
    assert len(result) == 0
