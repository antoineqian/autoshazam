import os
from fastapi import FastAPI, Form, WebSocket
from fastapi import File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from ..infra.shazam import shazam_file, process_url

app = FastAPI()

app.add_middleware(
 CORSMiddleware,
 allow_origins=["http://localhost:3000"], # Add your frontend origin here
 allow_credentials=True,
 allow_methods=["*"],
 allow_headers=["*"],
)
from yt_dlp import YoutubeDL, postprocessor


@app.post("/processFile")
async def processFile(file: UploadFile=File(...), interval: int=Form(...)):
    print(f"Processing file {file.filename} with interval {interval}")
    try:
        contents = file.file.read()
        file_location = os.path.join('./storage', file.filename)

        with open(file_location, 'wb') as f:
            f.write(contents)
        results = await shazam_file(file_location, interval)

    except Exception as e:
        print(e)
        return {"message": "There was an error uploading the file", "e": e}
    finally:
        file.file.close()
    return results



@app.post("/processUrl")
async def processUrl(url: str=Form(...), interval:int=Form(...)):
    print(f"Processing url {url} with {interval} seconds")
    process_url(url, interval)
    # file_location = './storage/downloaded_file.%(ext)s'
    # ydl_opts = {
    #     'outtmpl': file_location,
    #     'progress_hooks': [print_location],
    # }
    # with YoutubeDL(ydl_opts) as ydl:
        
    #     ydl.add_post_processor(ShazamProcessor(), when='post_process')
    #     ydl.download(url)
    return await shazam_file(downloaded_file_path, interval)


