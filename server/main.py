from fastapi import FastAPI, Form, WebSocket
from fastapi import File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from djshazam import shazam_all
from fastapi.responses import HTMLResponse
import asyncio
from shazamio import Shazam
from pydub import AudioSegment
from math import ceil

app = FastAPI()

app.add_middleware(
 CORSMiddleware,
 allow_origins=["http://localhost:3000"], # Add your frontend origin here
 allow_credentials=True,
 allow_methods=["*"],
 allow_headers=["*"],
)
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self):
        self.active_connections = []

    async def send_text(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)
    
    async def send_json(self, message: str):
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()

@app.websocket("/detect")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect()

@app.post("/process")
async def initiate_processing(file: UploadFile=File(...), interval: int=Form(...)):
    print(f"Processing file {file.filename} with interval {interval}")
    try:
        print(file.filename, file.content_type)
        contents = file.file.read()
        with open(file.filename, 'wb') as f:
            f.write(contents)
        results = await shazam_all(file.filename, interval)
        manager.disconnect()

    except Exception as e:
        print(e)
        return {"message": "There was an error uploading the file", "e": e}
    finally:
        file.file.close()
    return results


async def do_shazam(shazam, part, i):
    ret = await shazam.recognize_song(part)
    if ret is not None and 'track' in ret and ret['track'] is not None:
        track_info = {
            'position': i,
            'title': ret['track']['title'],
            'subtitle': ret['track']['subtitle'],
            'url': ret['track']['url'],
        }
        await manager.send_json(track_info)
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

    return recognized_tracks

@app.get("/")
async def root():
    return {"message": "Welcome to DJ Shazam"}

@app.post("/detect")
async def upload_file_and_detect(file: UploadFile=File(...), interval: int=Form(...)):
    try:
        print(file.filename, file.content_type)
        contents = file.file.read()
        with open(file.filename, 'wb') as f:
            f.write(contents)
        results = await shazam_all(file.filename, interval)

    except Exception as e:
        print(e)
        return {"message": "There was an error uploading the file", "e": e}
    finally:
        file.file.close()
    return results

