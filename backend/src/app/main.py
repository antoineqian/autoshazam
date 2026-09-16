import asyncio
import json
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Form, WebSocket
from fastapi import File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from yt_dlp import YoutubeDL

from ..infra.downloader import build_ydl_opts
from ..infra.processor import PathWriter
from ..infra.shazam import shazam_file, shazam_file_ws
from .soulseek import router as soulseek_router, shutdown_manager



@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    # Log out of Soulseek cleanly so the account is not left half-connected.
    await shutdown_manager()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(soulseek_router)


def _fetch_media(url: str) -> str:
    """Download the media and return where it landed. yt-dlp and the ffmpeg
    post-processor are wholly synchronous, so this only ever runs in a thread."""
    ydl_opts = build_ydl_opts("./storage/%(title)s.%(ext)s")
    with YoutubeDL(ydl_opts) as ydl:
        ydl.add_post_processor(PathWriter(), when="post_process")
        ydl.download(url)

    with open("storage/path.json", "r") as f:
        return json.load(f)


@app.post("/processFolder")
async def processFolder(files: list[UploadFile] = File(...), interval: int = Form(...)):
    all_results = []
    for i, file in enumerate(files):
        if not file.content_type.startswith("audio"):
            print(f"Skipping non-audio file {file.filename} {file.content_type}")
            continue
        print(
            f"Processing file {file.filename} {file.content_type} with interval {interval}"
        )
        contents = await file.read()
        storage_dir = os.path.normpath(os.path.join(os.getcwd(), "storage"))
        if not os.path.exists(storage_dir):
            os.makedirs(storage_dir)
        file_location = os.path.join(storage_dir, "tmp")
        await asyncio.to_thread(Path(file_location).write_bytes, contents)
        try:
            results = await shazam_file(file_location, interval)
            for r in results:
                r["fileIndex"] = i
                # The library groups tracks by the run they came from, so the
                # filename has to travel with the results instead of only
                # being logged.
                r["sourceLabel"] = file.filename
                r["sourceKind"] = "file"
                r["intervalMinutes"] = interval
            all_results.extend(results)
        except Exception as e:
            print("Exception caught")
            print(e)
            return {"message": "There was an error uploading the file", "e": e}
        finally:
            file.file.close()
            os.remove(file_location)
    return all_results


@app.post("/processUrl")
async def processUrl(url: str = Form(...), interval: int = Form(...)):
    print(f"Processing url {url} with {interval} seconds")
    file_location = await asyncio.to_thread(_fetch_media, url)
    return await shazam_file(file_location, interval)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    print("WS Endpoint")
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        print(f"Received {data}")
        for i in range(3):
            result = await shazam_file(
                "/Users/antoineqian/Documents/Programming/autoShazam/server/01 - Forest Drive West - Impulse.mp3 ",
                3,
            )
            await websocket.send_json(result)


@app.websocket("/ws_processFolder")
async def ws_processFolder(websocket: WebSocket):
    print("WS processFolder")
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        print(f"Received {data}")
        for i in range(3):
            result = await shazam_file(
                "/Users/antoineqian/Documents/Programming/autoShazam/server/01 - Forest Drive West - Impulse.mp3 ",
                3,
            )
            await websocket.send_json(result)


@app.websocket("/url")
async def ws_processUrl(websocket: WebSocket):
    await websocket.accept()
    url = await websocket.receive_text()
    interval = int(await websocket.receive_text())
    file_location = await asyncio.to_thread(_fetch_media, url)

    # Announce the run before streaming any tracks, so the client can record
    # the source they belong to. yt-dlp names the file after the media title,
    # which reads far better in the library than the raw URL.
    await websocket.send_json(
        {
            "type": "source",
            "kind": "url",
            "label": os.path.splitext(os.path.basename(file_location))[0],
            "url": url,
            "intervalMinutes": interval,
        }
    )

    await shazam_file_ws(file_location, interval, websocket)

    await websocket.send_text("DONE")
