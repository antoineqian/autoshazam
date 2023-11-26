import asyncio
from shazamio import Shazam
import time
import threading 

async def run_task(shazam):
    ret = await shazam.recognize_song('01 - Forest Drive West - Impulse.mp3')
    print(ret)

def between_callback(args):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    loop.run_until_complete(run_task(args))
    loop.close()


def run_all_tasks(iters):
    shazam = Shazam()
    loop = asyncio.get_event_loop()

    _thread = threading.Thread(target=between_callback, args=(shazam,))
    _thread.start() 
    _thread.join()
    return 

run_all_tasks(10)