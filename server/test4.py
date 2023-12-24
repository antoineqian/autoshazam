from yt_dlp import postprocessor, YoutubeDL

URLS = ['https://soundcloud.com/aedirecords/locust']

class ShazamProcessor(postprocessor.PostProcessor):
    def run(self, info):
        print(info['filepath'])
        
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

file_location = './storage/%(title)s.%(ext)s'
ydl_opts = {
    'outtmpl': file_location
}
with YoutubeDL(ydl_opts) as ydl:
    ydl.add_post_processor(ShazamProcessor(), when='post_process')
    ydl.download(URLS)

