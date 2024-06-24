FROM node:16

RUN apt-get -y update
RUN apt-get install -y --no-install-recommends ffmpeg imagemagick graphicsmagick

WORKDIR /opt

COPY . .

RUN npm install

RUN npm install -g pm2 gulp

COPY ./docker/jschan/secrets.js ./configs/secrets.js

ARG MONGO_USERNAME
ARG MONGO_PASSWORD
ARG REDIS_USERNAME
ARG REDIS_PASSWORD
ARG REDIS_HOST
ARG REDIS_PORT
ARG RESET=0

ENV MONGO_USERNAME $MONGO_USERNAME
ENV MONGO_PASSWORD $MONGO_PASSWORD
ENV REDIS_USERNAME $REDIS_USERNAME
ENV REDIS_PASSWORD $REDIS_PASSWORD
ENV REDIS_HOST $REDIS_HOST
ENV REDIS_PORT $REDIS_PORT

ENV RESET $RESET  # Set the default value for RESET.

RUN gulp generate-favicon

EXPOSE 80

CMD ["/bin/sh", "-c", "if [ \"$RESET\" -eq 1 ]; then gulp reset; fi; gulp; pm2-runtime start ecosystem.config.js"]
