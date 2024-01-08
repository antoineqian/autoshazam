# Autoshazam
Autoshazam lets you shazam a long audio file, typically a mix, according to a specified interval in minutes. It can also process a folder of audio files (other types are ignored). Soon it will process urls

## Run the client 

`npm install`
`npm run start`


## Run the server

`pip3 install -r requirements.txt`
`python -m uvicorn src.app.main:app--reload`

# Future updates
- Persistent results
- Audio controls on the original file for each result for easier comparison
- Scrap youtube url from shazam info page
- Tests !
- Containerize
- Integrate with a media downloader

Suggestions are welcome !