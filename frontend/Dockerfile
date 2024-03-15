from node:lts-slim
COPY . /code/
WORKDIR /code
RUN npm install -f && npm run build
CMD ["npm", "run", "start"]
