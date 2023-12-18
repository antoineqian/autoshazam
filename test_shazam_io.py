import asyncio
from shazamio import Shazam


async def main():
    shazam = Shazam()
    res = await shazam.recognize_song("forestDriveWest_Dualism.mp3")
    print(f"The song was recognized to be {res['track']['title']} :  {res['track']['subtitle']}")

loop = asyncio.get_event_loop()
loop.run_until_complete(main())