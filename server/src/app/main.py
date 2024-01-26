import json
import os
from fastapi import (
    Cookie, Depends, status, FastAPI, Form, Query, WebSocket)
from fastapi import File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from yt_dlp import YoutubeDL

from ..infra.processor import PathWriter
from ..infra.shazam import shazam_file

app = FastAPI()

app.add_middleware(
 CORSMiddleware,
 allow_origins=["http://localhost:3000"], # Add your frontend origin here
 allow_credentials=True,
 allow_methods=["*"],
 allow_headers=["*"],
)

@app.post("/processFolder")
async def processFolder(files: list[UploadFile] = File(...), interval: int=Form(...)):
    all_results = []
    for i, file in enumerate(files):
        if not file.content_type.startswith("audio"):
            print(f"Skipping non-audio file {file.filename} {file.content_type}")
            continue
        print(f"Processing file {file.filename} {file.content_type} with interval {interval}")
        contents = file.file.read()
        storage_dir = os.path.normpath(os.path.join(os.getcwd(), "storage"))
        if not os.path.exists(storage_dir):
            os.makedirs(storage_dir)
        file_location = os.path.join(storage_dir, "tmp")
        with open(file_location, 'wb') as f:
            f.write(contents)
        try:
            results = await shazam_file(file_location, interval)
            for r in results:
                r["fileIndex"] = i 
            all_results.extend(results) 
        except Exception as e:
            print(e)
            return {"message": "There was an error uploading the file", "e": e}
        finally:
            file.file.close()
            os.remove(file_location)
    return all_results



@app.post("/processUrl")
async def processUrl(url: str=Form(...), interval:int=Form(...)):
    print(f"Processing url {url} with {interval} seconds")
    file_location = './storage/%(title)s.%(ext)s'
    ydl_opts = {
        'outtmpl': file_location
    }
    with YoutubeDL(ydl_opts) as ydl:
        ydl.add_post_processor(PathWriter(), when='post_process')
        ydl.download(url)

    with open('storage/path.json', 'r') as f:  
        file_location = json.load(f)
        results = await shazam_file(file_location, interval)
    return results


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    print("WS Endpoint")
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        print(f"Received {data}")
        for i in range(3):
            result = await shazam_file("/Users/antoineqian/Documents/Programming/autoShazam/server/01 - Forest Drive West - Impulse.mp3 ", 3)
            await websocket.send_json(result)
        # await websocket.send_text(f"Message text was: {data}")