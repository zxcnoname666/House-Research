FROM denoland/deno:debian

# ------------ зависимости Chromium ------------
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        wget gnupg ca-certificates fonts-ipafont-gothic \
        fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst \
        fonts-freefont-ttf libxss1 && \
    wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" \
        > /etc/apt/sources.list.d/google.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends google-chrome-stable && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY deno.json* ./
COPY deno.lock* ./
COPY src ./src

CMD ["deno", "task", "prod"]
