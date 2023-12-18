from yt_dlp import YoutubeDL

URLS = ['https://soundcloud.com/aedirecords/locust']

with YoutubeDL() as ydl:
    ydl.download(URLS)

# with SoundCloudDL() as scdl:
#     scdl.download("https://soundcloud.com/aedirecords/locust")