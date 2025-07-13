FROM denoland/deno:alpine

WORKDIR /app
COPY deno.json* ./
COPY deno.lock* ./
COPY import_map.json* ./
COPY src ./src

CMD ["deno", "task", "prod"]