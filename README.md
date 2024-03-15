# autoshazam
Autoshazam lets you shazam a long audio file, typically a mix, according to a specified interval in minutes. It can also process a folder of audio files (other types are ignored). Soon it will process urls

## Install and run the frontend

First, install the required node packages. We need to use `-f` since there are some incompatibilities between some packages.

`npm install -f`

Then, build the frontend website with `gastby` using the following alias:

`npm run build`

Finally, run the frontend.

`npm run start`


## Install and run the backend

Using `python3.11`, install the requirements (note that this includes `yt-dlp` to be able to use `autoshazam` with URLs, which will require `ffmpeg` to be installed in order to function properly):

```
apt-get install ffmpeg # Optional (note: use brew install ffmpeg if on macOS)
pip install -r requirements.txt
```

Run the backend via the `uvicorn` python module:

`uvicorn src.app.main:app --reload --host 0.0.0.0 --port 8000`


## Install and run frontend and backend using `docker-compose`

If you have `docker` and `docker-compose` installed, it might be easier (and much lighter!) for you to simply build and run the containers:

`docker-compose up -d --build`

You can then make sure everything is running properly by following the logs:

`docker-compose logs -f`

Just to give you an idea, thanks to multi-stage Docker building and slim packages, we go from a total size of around 2.5Gb (~1Gb for frontend and ~1.5Gb for backend) to a total built size of "only" 750Mb for the two Docker images (~50Mb for frontend and ~700Mb for backend).

# Future updates
- Persistent results
- Audio controls on the original file for each result for easier comparison
- Scrap youtube url from shazam info page
- Tests !
- ~~Containerize~~
- Integrate with a media downloader

Suggestions are welcome !
