FROM python:3.12
WORKDIR /code
COPY ./server/requirements.txt /code/requirements.txt

RUN pip3 install --no-cache-dir -r /code/requirements.txt
COPY ./src /code/app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "80"]