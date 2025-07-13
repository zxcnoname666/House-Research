FROM denoland/deno:alpine

WORKDIR /app
COPY deno.json* ./
COPY deno.lock* ./
COPY src ./src

CMD ["deno", "task", "prod"]