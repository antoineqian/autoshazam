from node:lts-slim
WORKDIR /code
COPY . /code/
RUN npm install -f
RUN npm run build
CMD ["npm", "run", "start"]
