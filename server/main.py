from fastapi import FastAPI, Form, WebSocket
from fastapi import File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from djshazam import shazam_all
from fastapi.responses import HTMLResponse
import asyncio

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

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

ws = None

@app.websocket("/detect")
async def websocket_endpoint(websocket: WebSocket):
        # await websocket.accept()
    # await manager.connect(websocket)
    ws = websocket
    # await asyncio.sleep(2)
    # for i in range(10):
    #     await manager.send(f"Message text was: {i}")

async def process_and_send(websocket: WebSocket):
    while True:
        # Receive data from the client
        data = await websocket.receive_text()

        # Check if the file transfer is complete
        if data == "FileTransferComplete":
            print("File transfer complete")
            break

        # Process and handle each chunk (e.g., save to a file)
        print("Received chunk:", len(data), "bytes")

@app.post("/process")
async def initiate_processing(file: UploadFile=File(...), interval: int=Form(...)):
    uri = "ws://localhost:8000/detect"
    await websocket.accept()
    # await process_and_send(WebSocket(uri))
    print( f"Processing file {file.filename} with interval {interval}")
    await websocket.send_tet("received file")
    

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

