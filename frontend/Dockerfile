# This is a classic multi-stage build to considerably reduce (~1Gb -> ~50Mb) the final image

# Multi-stage build (stage 1)
from node:lts-slim as builder
WORKDIR /code
COPY package.json package-lock.json /code/
RUN npm install -f
COPY . /code/
RUN npm run build
# We don't need the line below since now we are doing a multi-stage build
#CMD ["npm", "run", "start"]

# Multi-stage build (stage2 - use nginx as final web service for the webserver)
from nginx:alpine
# We only copy the public code (no need for node_modules)
COPY --from=builder /code/public /usr/share/nginx/html
# We copy nginx conf to be able to start on port 3000 (specified in nginx.conf)
COPY nginx.conf /etc/nginx/conf.d/default.conf
CMD ["nginx", "-g", "daemon off;"]
