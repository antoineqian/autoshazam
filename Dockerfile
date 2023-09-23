FROM python:3.8
COPY src .
RUN pip3 install -r autoshazam_requirements.txt
CMD ["python", "./shazam.py"]