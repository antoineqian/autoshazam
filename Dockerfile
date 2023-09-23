FROM python:3.8
WORKDIR /code
COPY ./autoshazam_requirements.txt /code/autoshazam_requirements.txt

RUN pip3 install --no-cache-dir -r /code/autoshazam_requirements.txt
COPY ./src /code/app

# CMD ["python", "./shazam.py"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "80"]