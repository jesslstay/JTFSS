# Tiny always-on streamer. Build after `make master` so the video is baked in:
#   docker build -f deploy/Dockerfile -t ember-noir .
#   docker run -d --restart=always --name fireplace \
#     -e YT_STREAM_KEY=xxxx-xxxx-xxxx-xxxx ember-noir
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY scripts/stream_24_7.sh scripts/
COPY build/fireplace_master_1h.mp4 build/
CMD ["scripts/stream_24_7.sh"]
