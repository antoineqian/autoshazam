from yt_dlp import postprocessor
import json

class PathWriter(postprocessor.PostProcessor):
    def run(self, info):
        print(info['filepath'])
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
