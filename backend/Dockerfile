FROM python:3.11
RUN apt-get -y update && apt-get -y upgrade && apt-get install --no-install-recommends -y ffmpeg

COPY ./requirements.txt /code/requirements.txt
RUN pip3 install --no-cache-dir -r /code/requirements.txt

WORKDIR /code
COPY . /code/

CMD ["uvicorn", "src.app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]
