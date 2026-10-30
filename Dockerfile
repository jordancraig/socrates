# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -s /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true
COPY --chown=node:node . .
RUN npm run build
ENV NODE_ENV=production BIND_HOST=0.0.0.0
RUN mkdir -p work/data && chown -R node:node work
USER node
EXPOSE 3001 1234
CMD ["node","--import","tsx","apps/server/src/index.ts"]
