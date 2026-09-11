# autoshazam
Autoshazam lets you shazam a long audio file, typically a mix, according to a specified interval in minutes. It can also process a folder of audio files (other types are ignored). Soon it will process urls

## Install and run the frontend

First, install the required node packages. We need to use `-f` since there are some incompatibilities between some packages.

`npm install -f`

`npm run dev`

## Install and run the backend

Using `python3.11`, install the requirements (note that this includes `yt-dlp` to be able to use `autoshazam` with URLs, which will require `ffmpeg` to be installed in order to function properly):

```
apt-get install ffmpeg # Optional (note: use brew install ffmpeg if on macOS)
pip install -r requirements.txt
```

YouTube URLs additionally need a JavaScript runtime (`deno`, `node`, `bun` or `quickjs`) on the `PATH`, which `yt-dlp` uses to solve YouTube's signature challenges; without one most formats are unavailable. Any of them will do, e.g. `brew install deno` (the Docker image ships `deno`).

Run the backend via the `uvicorn` python module:

`uvicorn src.app.main:app --reload --host 0.0.0.0 --port 8000`


## Downloading tracks from Soulseek (optional)

The library can fetch the audio file of a detected track from the Soulseek network: a download icon on each track, and a "Download missing" button on each source. The backend searches, keeps only the formats you allow (Settings › General › Soulseek downloads), scores every result against the artist and title, and downloads the best one on its own, or asks you to choose between at most three when it is not sure.

It needs a Soulseek account, set on the backend:

```
export SOULSEEK_ACCOUNT=your_login
export SOULSEEK_PASSWORD=your_password
export SOULSEEK_LISTEN_PORT=2234      # optional, default 2234
export SOULSEEK_DOWNLOAD_DIR=./downloads   # optional
```

Peers connect back to the listening port, so forward it on your router (TCP) or most downloads will sit in the queue forever. Without an account the buttons simply do not appear.

Files are saved as `<download dir>/<source name>/<Artist - Title>.<ext>`, one folder per analysed mix. To check the pipeline against the live network without the UI:

```
cd backend && SOULSEEK_ACCOUNT=... SOULSEEK_PASSWORD=... .venv/bin/python -m scripts.soulseek_smoke "DJ Koze - Pick Up" "Objekt - Ruff Dug"
```

Add `--download` to actually fetch what would be downloaded automatically.

## Install and run frontend and backend using `docker-compose`

If you have `docker` and `docker-compose` installed, it might be easier (and much lighter!) for you to simply build and run the containers:

`docker-compose up -d --build`

You can then make sure everything is running properly by following the logs:

`docker-compose logs -f`

Just to give you an idea, thanks to multi-stage Docker building and slim packages, we go from a total size of around 2.5Gb (~1Gb for frontend and ~1.5Gb for backend) to a total built size of "only" 500Mb for the two Docker images (~50Mb for frontend and ~450Mb for backend).

# Future updates
- Persistent results
- Audio controls on the original file for each result for easier comparison
- Scrap youtube url from shazam info page
- Tests !
- ~~Containerize~~
- ~~Integrate with a media downloader~~ (Soulseek)

Suggestions are welcome !
