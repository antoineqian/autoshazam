from shazamio import Shazam
from pydub import AudioSegment
import time
import asyncio
from math import ceil

async def shazam_segment(segment, position): 
    shazam = Shazam()
    ret = await shazam.recognize_song(segment)
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
        else:
            print(ret)
        return track_info
    else:
        print(f"Didn't recognize at {position :}")


async def shazam_file(filename, interval):
    start = time.time()
    interval = interval * 60 * 1000
    seg = AudioSegment.from_file(filename)
    dur = seg.duration_seconds

    iters = ceil(dur * 1000 / interval)
    coros = [shazam_segment(seg[i*interval:(i+1)*interval], i) for i in range(iters)]
    results = await asyncio.gather(*coros)

    end = time.time()
    print(f"Took {int(end-start)} seconds")
    return [r for r in results if r is not None]


async def shazam_segment_ws(segment, position, websocket):
    shazam = Shazam()
    ret = await shazam.recognize_song(segment)
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
        else:
            print(ret)
        await websocket.send_json(track_info)
    else:
        print(f"Didn't recognize at {position :}")

async def shazam_file_ws(filename, interval, websocket):
    start = time.time()
    interval = interval * 60 * 1000
    seg = AudioSegment.from_file(filename)
    dur = seg.duration_seconds

    iters = ceil(dur * 1000 / interval)
    coros = [shazam_segment_ws(seg[i*interval:(i+1)*interval], i, websocket) for i in range(iters)]
    results = await asyncio.gather(*coros)

    end = time.time()
    print(f"Took {int(end-start)} seconds")