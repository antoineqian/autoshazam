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

parser = argparse.ArgumentParser()
parser.add_argument("-f", "--filename", help='File to be shazamed', type=str)
parser.add_argument("-i", "--interval", help='A call to Shazam will be performed at this interval in minutes', type=check_positive, default=3)
args = parser.parse_args()
filename, interval = args.filename, args.interval * 60 * 1000

async def main():
    shazam = Shazam()
    seg = AudioSegment.from_file("forestDriveWest_Dualism.mp3")
    dur = seg.duration_seconds
    
    for i in range(ceil(dur * 1000 / interval)):
        part = seg[i*interval:(i+1)*interval]
        res = await shazam.recognize_song(part)
        print(f"{i*interval*1000}")
        if res['matches']:
            print(f"The song was recognized to be {res['track']['title']} :  {res['track']['subtitle']}")
        else:
            print("No match")

loop = asyncio.get_event_loop()
loop.run_until_complete(main())