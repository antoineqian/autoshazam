from yt_dlp import postprocessor
import json

class PathWriter(postprocessor.PostProcessor):
    def __init__(self, on_path=None):
        super().__init__()
        self.on_path = on_path

    def run(self, info):
        print(info['filepath'])
        if self.on_path is not None:
            self.on_path(info['filepath'])
        else:
            with open('storage/path.json', 'w') as f:
                json.dump(info['filepath'], f)
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
