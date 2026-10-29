FROM node:24-slim AS build
WORKDIR /app
COPY package.json ./
COPY server/package.json server/
COPY widget/package.json widget/
RUN npm install --workspace widget
COPY widget widget
RUN npm run build --workspace widget

FROM nginxinc/nginx-unprivileged:alpine AS runtime
COPY demo/index.html /usr/share/nginx/html/index.html
COPY --from=build /app/widget/dist/support-widget.js /usr/share/nginx/html/support-widget.js
EXPOSE 8080
