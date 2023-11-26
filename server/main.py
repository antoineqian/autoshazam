from fastapi import FastAPI, Form, WebSocket
from fastapi import File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
import asyncio
from shazamio import Shazam
from pydub import AudioSegment
from math import ceil
import threading 

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
    except:
        manager.disconnect()

@app.post("/process")
async def initiate_processing(file: UploadFile=File(...), interval: int=Form(...)):
    print(f"Processing file {file.filename} with interval {interval}")
    try:
        contents = file.file.read()
        with open(file.filename, 'wb') as f:
            f.write(contents)
        run_all_tasks(file.filename, interval)
        # results = await shazam_all(file.filename, interval)
        manager.disconnect()

    except Exception as e:
        print(e)
        return {"message": "There was an error uploading the file", "e": e}
    finally:
        file.file.close()
    return {"message": "Done"}

async def run_task(shazam, part, position): 
    ret = await shazam.recognize_song(part)
    if ret is not None and 'track' in ret and ret['track'] is not None:
        track_info = {
            'position': position / 60 / 1000,
            'title': ret['track']['title'],
            'subtitle': ret['track']['subtitle'],
            'url': ret['track']['url'],

        }
        actions = ret['track']['hub']['actions']
        for action in actions:
            if 'uri' in action:
                track_info['uri'] = action['uri']
        # print(ret)
        await manager.send_json(track_info)
        # return track_info 

def run_all_tasks(filename, interval):
    interval = interval * 60 * 1000
    shazam = Shazam()
    seg = AudioSegment.from_file(filename)
    dur = seg.duration_seconds

    iters = ceil(dur * 1000 / interval)
    threads = []
    
    for i in range(iters):
        thread = threading.Thread(
            target=asyncio.run, 
            args=(run_task(shazam, seg[i*interval:(i+1)*interval], i*interval),))
        threads.append(thread)
        thread.start()

    # Wait for all threads to finish
    for thread in threads:
        thread.join()

@app.get("/")
async def root():
    return {"message": "Welcome to DJ Shazam"}
