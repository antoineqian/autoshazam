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
    raise RuntimeError('Recognition failed after all retries')


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


async def _segments(filename, interval):
    """Decode the file and cut it into interval-sized pieces.

    pydub shells out to ffmpeg and slices in memory, both synchronous and both
    long enough on a full mix to freeze the event loop — which would leave the
    Soulseek client unable to answer pings or read transfer bytes while an
    analysis runs. Off the loop it goes.
    """

    def cut():
        seg = AudioSegment.from_file(filename)
        iters = ceil(seg.duration_seconds * 1000 / interval)
        return [(seg[i * interval:(i + 1) * interval], i * interval) for i in range(iters)]

    return await asyncio.to_thread(cut)


async def shazam_file(filename, interval):
    start = time.time()
    interval = interval * 60 * 1000
    segments = await _segments(filename, interval)
    iters = len(segments)

    coros = [shazam_segment(seg, position) for seg, position in segments]
    results = await asyncio.gather(*coros, return_exceptions=True)

    if results and all(isinstance(result, Exception) for result in results):
        raise RuntimeError('No audio samples could be checked')
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


async def shazam_file_ws(filename, interval, websocket, progress=False):
    start = time.time()
    interval = interval * 60 * 1000
    if progress:
        await websocket.send_json({'type': 'progress', 'stage': 'preparing'})
    segments = await _segments(filename, interval)
    iters = len(segments)
    completed = 0
    failed = 0

    async def report():
        if progress:
            await websocket.send_json({
                'type': 'progress', 'stage': 'recognizing',
                'completed': completed, 'total': iters, 'failedSegments': failed,
            })

    await report()
    tasks = [asyncio.create_task(shazam_segment(seg, position)) for seg, position in segments]
    try:
        for task in asyncio.as_completed(tasks):
            try:
                track = await task
            except Exception:
                failed += 1
            else:
                if track is not None:
                    await websocket.send_json(track)
            completed += 1
            await report()
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    end = time.time()
    print(f"Took {int(end-start)} seconds")
    return failed
