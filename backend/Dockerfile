# This is a classic multi-stage build to considerably reduce (~1.5Gb -> ~900Mb) the final image

# Multi-stage build (stage 1, with non-slim python to be able to install all wheels)
FROM python:3.11 as builder
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir -r /code/requirements.txt

# Multi-stage build (stage 2, with slim python)
FROM python:3.11-slim
RUN apt-get -y update && apt-get -y upgrade && apt-get install --no-install-recommends -y ffmpeg && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
WORKDIR /code
COPY . /code/
CMD ["uvicorn", "src.app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]


