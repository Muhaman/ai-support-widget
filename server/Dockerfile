FROM node:24-slim AS build
WORKDIR /app
COPY package.json ./
COPY server/package.json server/
COPY widget/package.json widget/
RUN npm install --workspace server
COPY server server
RUN npm run build --workspace server

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    MODEL_CACHE_DIR=/app/.model-cache \
    KB_DIR=/app/server/kb
COPY package.json ./
COPY server/package.json server/
COPY widget/package.json widget/
RUN npm install --workspace server --omit=dev \
    && mkdir -p /app/.model-cache \
    && chown node:node /app/.model-cache
COPY --from=build /app/server/dist server/dist
COPY server/kb server/kb
USER node
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
