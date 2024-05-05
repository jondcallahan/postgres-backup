FROM node:22.1.0-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY src ./src

ARG PG_VERSION='16'
RUN apk add --update --no-cache postgresql${PG_VERSION}-client --repository=https://dl-cdn.alpinelinux.org/alpine/edge/main

CMD pg_isready --dbname=$BACKUP_DATABASE_URL && \
    pg_dump --version && \
    npm start
