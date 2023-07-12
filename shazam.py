import asyncio
from shazamio import Shazam
from pydub import AudioSegment
from math import ceil

async def main():
    interval = 3 * 60
    shazam = Shazam()
    seg = AudioSegment.from_file("forestDriveWest_Dualism.mp3")
    dur = seg.duration_seconds
    
    for i in range(ceil(dur / interval)):
        part = seg[i*interval*1000:(i+1)*interval*1000]
        res = await shazam.recognize_song(part)
        print(f"{i*interval*1000}")
        print(f"The song was recognized to be {res['track']['title']} :  {res['track']['subtitle']}")

loop = asyncio.get_event_loop()
loop.run_until_complete(main())