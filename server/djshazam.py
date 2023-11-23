import asyncio
from shazamio import Shazam
from pydub import AudioSegment
from math import ceil


async def do_shazam(shazam, part, i):
    ret = await shazam.recognize_song(part)
    if ret is not None and 'track' in ret and ret['track'] is not None:
        track_info = {
            'position': i,
            'title': ret['track']['title'],
            'subtitle': ret['track']['subtitle'],
            'url': ret['track']['url'],
        }
        return track_info 

async def shazam_all(filename, interval):
    interval = interval * 60 * 1000
    shazam = Shazam()
    seg = AudioSegment.from_file(filename)
    dur = seg.duration_seconds

    iters = ceil(dur * 1000 / interval)
    
    coros = [do_shazam(shazam, seg[i*interval:(i+1)*interval], i) for i in range(iters)]
    recognized_tracks = await asyncio.gather(*coros)
    recognized_tracks = list(filter(lambda item: item is not None, recognized_tracks))


    # print(recognized_tracks)
    print('Gathered')
    # print(recognized_tracks.keys())
    # for i, track in sorted(recognized_tracks.items()):
    #     print(f"The song was recognized to be {track['title']} :  {track['subtitle']} at {i*interval/60/1000} min")
    return recognized_tracks

# async def main():
#     await shazam_all(filename)

# loop = asyncio.get_event_loop()
# loop.run_until_complete(main())