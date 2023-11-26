import asyncio
from shazamio import Shazam
import threading 

#Bestversion

async def run_task(shazam): 
    ret = await shazam.recognize_song('01 - Forest Drive West - Impulse.mp3')
    print(ret)

def run_all_tasks(iters):
    shazam = Shazam()
    threads = []
    
    for i in range(iters):
        thread = threading.Thread(target=asyncio.run, args=(run_task(shazam),))
        threads.append(thread)
        thread.start()

    # Wait for all threads to finish
    for thread in threads:
        thread.join()

    return 

run_all_tasks(5)