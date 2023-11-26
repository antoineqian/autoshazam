# Autoshazam
Autoshazam lets you shazam a long audio file, typically a mix, according to a specified interval in minutes.

## Run the client 

`
npm install
npm run start
`

## Run the server

`
pip3 install fastapi uvicorn python-multipart websockets shazamio
python3 -m uvicorn main:app --reload
`

# Future updates
- Persistent results
- Audio controls on the original file for each result for easier comparison
- Scrap youtube url from shazam info page
- Tests !
- Containerize
- Integrate with a media downloader

Suggestions are welcome !