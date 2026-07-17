from shazamio import Shazam
from pydub import AudioSegment
import time
import asyncio
from math import ceil

# Shazam's endpoint throttles bursts, so we cap how many segments are
# recognized at once instead of firing the whole set concurrently.
MAX_CONCURRENT_RECOGNITIONS = 5
_semaphore = asyncio.Semaphore(MAX_CONCURRENT_RECOGNITIONS)

# Rate-limited / transient failures are retried with exponential backoff.
MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 2


async def _recognize(segment, position):
    """Recognize a single segment, throttled and retried. Returns the raw
    Shazam response, or None if it never succeeded."""
    async with _semaphore:
        for attempt in range(MAX_RETRIES + 1):
            shazam = Shazam()
            try:
                return await shazam.recognize_song(segment)
            except Exception as e:
                if attempt < MAX_RETRIES:
                    delay = BACKOFF_BASE_SECONDS * (2 ** attempt)
                    print(
                        f"Recognition error at position {position} "
                        f"(attempt {attempt + 1}/{MAX_RETRIES + 1}): {e}. "
                        f"Retrying in {delay}s"
                    )
                    await asyncio.sleep(delay)
                else:
                    print(
                        f"Giving up on position {position} after "
                        f"{MAX_RETRIES + 1} attempts: {e}"
                    )
    return None


def _parse_track(ret, position):
    """Turn a raw Shazam response into a track dict, or None if no match."""
    if ret is not None and 'track' in ret and ret['track'] is not None:
        track_info = {
            'position': position / 60 / 1000,
            'title': ret['track']['title'],
            'subtitle': ret['track']['subtitle'],
            'url': ret['track']['url'],

        }
        if 'actions' in ret['track']['hub'].keys():
            actions = ret['track']['hub']['actions']
            for action in actions:
                if 'uri' in action:
                    track_info['uri'] = action['uri']
        return track_info
    return None


async def shazam_segment(segment, position):
    ret = await _recognize(segment, position)
    track_info = _parse_track(ret, position)
    if track_info is None and ret is not None:
        print(f"Didn't recognize at {position}")
    return track_info


async def shazam_file(filename, interval):
    start = time.time()
    interval = interval * 60 * 1000
    seg = AudioSegment.from_file(filename)
    dur = seg.duration_seconds

    iters = ceil(dur * 1000 / interval)
    coros = [shazam_segment(seg[i*interval:(i+1)*interval], i) for i in range(iters)]
    results = await asyncio.gather(*coros, return_exceptions=True)

    tracks = [r for r in results if r is not None and not isinstance(r, Exception)]
    end = time.time()
    print(f"Took {int(end-start)} seconds, {len(tracks)}/{iters} segments matched")
    return tracks


async def shazam_segment_ws(segment, position, websocket):
    ret = await _recognize(segment, position)
    track_info = _parse_track(ret, position)
    if track_info is not None:
        print(f"sending {track_info['subtitle']}")
        await websocket.send_json(track_info)
    else:
        print(f"Didn't recognize at {position}")


async def shazam_file_ws(filename, interval, websocket):
    start = time.time()
    interval = interval * 60 * 1000
    seg = AudioSegment.from_file(filename)
    dur = seg.duration_seconds

    iters = ceil(dur * 1000 / interval)
    coros = [shazam_segment_ws(seg[i*interval:(i+1)*interval], i, websocket) for i in range(iters)]
    # return_exceptions=True so one failed segment can't abort the whole run.
    results = await asyncio.gather(*coros, return_exceptions=True)

    failures = [r for r in results if isinstance(r, Exception)]
    if failures:
        print(f"{len(failures)}/{iters} segments raised an error")

    end = time.time()
    print(f"Took {int(end-start)} seconds")
