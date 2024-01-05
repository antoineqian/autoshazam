from yt_dlp import YoutubeDL, postprocessor
import asyncio
def process_url(url, interval):
    file_location = './storage/%(title)s.%(ext)s'
    ydl_opts = {
        'outtmpl': file_location
    }
    with YoutubeDL(ydl_opts) as ydl: 
        ydl.add_post_processor(ShazamProcessor(interval), when='post_process')
        ydl.download(url)
    return []

class ShazamProcessor(postprocessor.PostProcessor):
    def __init__(self, interval=3):
        self.interval = interval
    def run(self, info):
        self.to_screen('Doing stuff')
        print(info['filepath'])
        asyncio.sleep(self.interval)
        
        return [], info

    def debug(self, msg):

        if msg.startswith('[debug] '):
            pass
        else:
            self.info(msg)

    def info(self, msg):
        pass

    def warning(self, msg):
        pass

    def error(self, msg):
        print(msg)


# process_url("https://www.youtube.com/watch?v=u4B_-X0ERt0&ab_channel=VariousArtists-Topic", 2)