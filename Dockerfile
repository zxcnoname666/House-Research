FROM denoland/deno:alpine

RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      nodejs \
      yarn


WORKDIR /app
COPY deno.json* ./
COPY deno.lock* ./
COPY src ./src

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

CMD ["deno", "task", "prod"]