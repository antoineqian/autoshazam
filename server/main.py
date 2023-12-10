from fastapi import FastAPI, Form, WebSocket
from fastapi import File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
import asyncio
from shazamio import Shazam
from pydub import AudioSegment
from math import ceil
import threading 
import time

app = FastAPI()

app.add_middleware(
 CORSMiddleware,
 allow_origins=["http://localhost:3000"], # Add your frontend origin here
 allow_credentials=True,
 allow_methods=["*"],
 allow_headers=["*"],
)

@app.post("/process")
async def initiate_processing(file: UploadFile=File(...), interval: int=Form(...)):
    print(f"Processing file {file.filename} with interval {interval}")
    try:
        contents = file.file.read()
        with open(file.filename, 'wb') as f:
            f.write(contents)
        results = await run_all_tasks(file.filename, interval)

    except Exception as e:
        print(e)
        return {"message": "There was an error uploading the file", "e": e}
    finally:
        file.file.close()
    return results

async def run_task(part, position): 
    shazam = Shazam()
    ret = await shazam.recognize_song(part)
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


async def run_all_tasks(filename, interval):
    start = time.time()
    interval = interval * 60 * 1000
    seg = AudioSegment.from_file(filename)
    dur = seg.duration_seconds

    iters = ceil(dur * 1000 / interval)
    coros = [run_task(seg[i*interval:(i+1)*interval], i) for i in range(iters)]
    results = await asyncio.gather(*coros)

    end = time.time()
    print(f"Took {int(end-start)} seconds")
    return results

@app.get("/")
async def root():
    return {"message": "Welcome to DJ Shazam"}
