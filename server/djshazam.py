import asyncio
from shazamio import Shazam
from pydub import AudioSegment
from math import ceil

import argparse

def check_positive(value):
    ivalue = int(value)
    if ivalue <= 0:
        raise argparse.ArgumentTypeError("%s is an invalid positive int value" % value)
    return ivalue

async def do_shazam(shazam, part, i):
    ret = await shazam.recognize_song(part)
    if ret['matches']:
        return i, ret['track'] 

async def shazam_all(filename):
    interval = 3 * 60 * 1000
    shazam = Shazam()
    seg = AudioSegment.from_file(filename)
    dur = seg.duration_seconds

    iters = ceil(dur * 1000 / interval)
    
    coros = [do_shazam(shazam, seg[i*interval:(i+1)*interval], i) for i in range(iters)]
    recognized_tracks = await asyncio.gather(*coros)
    for i, track in sorted(recognized_tracks):
        print(f"The song was recognized to be {track['title']} :  {track['subtitle']} at {i*interval/60/1000} min")
    return recognized_tracks

# async def main():
#     await shazam_all(filename)

# loop = asyncio.get_event_loop()
# loop.run_until_complete(main())