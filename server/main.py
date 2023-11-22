from fastapi import FastAPI
from fastapi import File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from djshazam import shazam_all


app = FastAPI()

app.add_middleware(
 CORSMiddleware,
 allow_origins=["http://localhost:3000"], # Add your frontend origin here
 allow_credentials=True,
 allow_methods=["*"],
 allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Welcome to DJ Shazam"}


@app.post("/detect")
async def upload_file_and_detect(file: UploadFile):
    try:
        print(file.filename, file.content_type)
        contents = file.file.read()
        with open(file.filename, 'wb') as f:
            f.write(contents)
        results = await shazam_all(file.filename)
        recognized_tracks = []
        for r in results:
            recognized_tracks.append(
                {
                "subtitle" : r[1]["subtitle"],
                "title": r[1]["title"],
                "url": r[1]["url"]
                }
            )

    except Exception as e:
        print(e)
        return {"message": "There was an error uploading the file", "e": e}
    finally:
        file.file.close()
    return recognized_tracks

