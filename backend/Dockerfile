FROM python:3.11
RUN apt-get -y update
RUN apt-get -y upgrade
RUN apt-get install -y ffmpeg

WORKDIR /code
COPY ./requirements.txt /code/requirements.txt
RUN pip3 install --no-cache-dir -r /code/requirements.txt
COPY . /code/

CMD ["uvicorn", "src.app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]
