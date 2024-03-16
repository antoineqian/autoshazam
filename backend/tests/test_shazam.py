from unittest.mock import AsyncMock
import pytest

from backend.src.infra.shazam import shazam_file

pytest.mark.asyncio


def test_processFolder():
    shazam_file = AsyncMock()
    pass


def test_processUrl():
    pass

async def test_shazam_file():
    result = await shazam_file("just_noise.mp3", 1)
    assert type(result) == list
    assert len(result) == 0
