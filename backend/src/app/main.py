import asyncio
import os
import time
import tempfile
from typing import Annotated
from urllib.parse import urlparse
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Form, WebSocket, WebSocketDisconnect, HTTPException
from fastapi import File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from yt_dlp import YoutubeDL
from pydantic import BaseModel, Field, TypeAdapter, ValidationError

from ..infra.downloader import build_ydl_opts
from ..infra.processor import PathWriter
from ..infra.shazam import shazam_file, shazam_file_ws
from ..infra.original_audio import clip_path, restore_original_clips
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


@app.get('/original-audio/{clip_id}')
async def original_audio(clip_id: str):
    path = clip_path(clip_id)
    if path is None:
        raise HTTPException(status_code=404, detail='Original audio is not available on this computer.')
    return FileResponse(path, media_type='audio/mpeg')


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


class RecoveryPoint(BaseModel):
    id: int = Field(gt=0, strict=True)
    position: float = Field(ge=0, allow_inf_nan=False)


@app.post('/original-audio/restore')
async def restore_audio(
    points: str = Form(..., max_length=200_000),
    file: UploadFile | None = File(None),
    url: str | None = Form(None),
):
    try:
        parsed = TypeAdapter(Annotated[list[RecoveryPoint], Field(min_length=1, max_length=2000)]).validate_json(points)
        if len({p.id for p in parsed}) != len(parsed):
            raise ValueError('Duplicate tracks')
    except (ValidationError, ValueError) as exc:
        raise HTTPException(status_code=422, detail='Choose tracks with valid saved timestamps.') from exc
    if (file is None) == (not url):
        raise HTTPException(status_code=422, detail='Choose either the original file or its source URL.')
    if url:
        source = urlparse(url)
        if source.scheme not in ('http', 'https') or not source.hostname:
            raise HTTPException(status_code=422, detail='The source URL must use http or https.')

    # Uploaded recovery inputs are temporary. Only the resulting clips persist.
    try:
        with tempfile.TemporaryDirectory(prefix='autoshazam-recovery-') as directory:
            if file is not None:
                filename = str(Path(directory) / 'audio')
                with open(filename, 'wb') as output:
                    while chunk := await file.read(1024 * 1024):
                        await asyncio.to_thread(output.write, chunk)
            else:
                try:
                    filename = await asyncio.to_thread(_fetch_media, url)
                except Exception as exc:
                    raise HTTPException(status_code=422, detail='Could not fetch the saved URL. Try selecting the original file instead.') from exc
            try:
                return await asyncio.to_thread(restore_original_clips, filename, [p.model_dump() for p in parsed])
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            except Exception as exc:
                raise HTTPException(status_code=422, detail='Could not restore audio. Check the file format and available disk space.') from exc
    finally:
        if file is not None:
            await file.close()


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
        # Concurrent uploads (including identical filenames) need separate inputs.
        with tempfile.NamedTemporaryFile(dir=storage_dir, delete=False) as temporary:
            file_location = temporary.name
        try:
            await asyncio.to_thread(Path(file_location).write_bytes, contents)
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
