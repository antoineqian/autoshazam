import asyncio
import os
import time
from urllib.parse import urlparse
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Form, WebSocket, WebSocketDisconnect, HTTPException
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


def _fetch_media(url: str, progress=None) -> str:
    """Download the media and return where it landed. yt-dlp and the ffmpeg
    post-processor are wholly synchronous, so this only ever runs in a thread."""
    ydl_opts = build_ydl_opts("./storage/%(title)s.%(ext)s")
    last_update = 0.0

    def report(data):
        nonlocal last_update
        now = time.monotonic()
        if data['status'] == 'downloading' and now - last_update >= 0.25:
            last_update = now
            progress({
                'type': 'progress', 'stage': 'downloading',
                'downloadedBytes': data.get('downloaded_bytes', 0),
                'totalBytes': data.get('total_bytes'),
            })

    if progress is not None:
        ydl_opts['progress_hooks'] = [report]
    paths = []
    with YoutubeDL(ydl_opts) as ydl:
        # Keep the path within this request instead of sharing storage/path.json
        # with another analysis that may finish downloading at the same time.
        ydl.add_post_processor(PathWriter(on_path=paths.append), when="post_process")
        ydl.download(url)
    if not paths:
        raise ValueError('No audio file was downloaded')
    return paths[-1]


@app.post("/processFolder")
async def processFolder(files: list[UploadFile] = File(...), interval: int = Form(..., ge=1)):
    all_results = []
    for i, file in enumerate(files):
        if not ((file.content_type or '').startswith("audio") or
                Path(file.filename or '').suffix.lower() in {'.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.aiff', '.aif', '.wma'}):
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
            raise HTTPException(status_code=422, detail="Could not analyze the audio file. Check that it is a supported audio format.") from e
        finally:
            file.file.close()
            os.remove(file_location)
    return all_results


@app.post("/processUrl")
async def processUrl(url: str = Form(...), interval: int = Form(..., ge=1)):
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
    # Old clients still receive only source/track messages and DONE.
    show_progress = websocket.query_params.get('progress') == '1'
    stage = 'validating'
    try:
        url = await websocket.receive_text()
        interval = int(await websocket.receive_text())
        parsed = urlparse(url)
        if interval < 1 or parsed.scheme not in ('http', 'https') or not parsed.hostname:
            raise ValueError('Invalid analysis input')
        stage = 'downloading'
        if show_progress:
            await websocket.send_json({'type': 'progress', 'stage': stage})
        loop = asyncio.get_running_loop()

        def report(event):
            # yt-dlp hooks run in the worker thread; serialize their writes on
            # the websocket's event loop and apply backpressure to the worker.
            asyncio.run_coroutine_threadsafe(websocket.send_json(event), loop).result(timeout=30)

        file_location = await asyncio.to_thread(_fetch_media, url, report if show_progress else None)
        stage = 'recognizing'
        await websocket.send_json({
            'type': 'source', 'kind': 'url',
            'label': Path(file_location).stem, 'url': url,
            'intervalMinutes': interval,
        })
        failed = await shazam_file_ws(file_location, interval, websocket, progress=show_progress)
        if show_progress:
            await websocket.send_json({'type': 'complete', 'failedSegments': failed})
        else:
            await websocket.send_text('DONE')
    except WebSocketDisconnect:
        return
    except Exception:
        messages = {
            'validating': 'Enter a valid http(s) URL and a whole-number interval of at least one minute.',
            'downloading': 'Could not download this audio. Check that the link is public and supported, then try again.',
            'recognizing': 'Could not analyze this audio. Any tracks already saved are still in your library.',
        }
        try:
            await websocket.send_json({'type': 'error', 'message': messages[stage]})
        except (WebSocketDisconnect, RuntimeError):
            return
    finally:
        try:
            await websocket.close()
        except (WebSocketDisconnect, RuntimeError):
            pass
