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
RUN yarn add puppeteer@13.5.0
RUN addgroup -S pptruser && adduser -S -G pptruser pptruser \
    && mkdir -p /home/pptruser/Downloads /app \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /app
USER pptruser

CMD ["deno", "task", "prod"]