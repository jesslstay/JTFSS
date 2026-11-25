#!/usr/bin/env bash
# Stream the fireplace to YouTube Live forever.
# Loops the master file endlessly and auto-reconnects if the connection drops.
#
#   cp config.env.example config.env   # add your stream key
#   scripts/stream_24_7.sh
#
# Set DRY_RUN=1 to write 20 s to build/stream_test.flv instead of going live.
set -uo pipefail
cd "$(dirname "$0")/.."

[[ -f config.env ]] && set -a && . ./config.env && set +a
STREAM_FILE=${STREAM_FILE:-build/fireplace_master_1h.mp4}
YT_RTMP_URL=${YT_RTMP_URL:-rtmp://a.rtmp.youtube.com/live2}
STREAM_MODE=${STREAM_MODE:-copy}

[[ -f "$STREAM_FILE" ]] || { echo "missing $STREAM_FILE — run: make master"; exit 1; }

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  DEST=(-t 20 -y build/stream_test.flv)
else
  [[ -n "${YT_STREAM_KEY:-}" && "$YT_STREAM_KEY" != xxxx* ]] || { echo "Set YT_STREAM_KEY in config.env"; exit 1; }
  DEST=("$YT_RTMP_URL/$YT_STREAM_KEY")
fi

if [[ "$STREAM_MODE" == "encode" ]]; then
  CODEC=(-c:v libx264 -preset veryfast -b:v 6000k -maxrate 6000k -bufsize 12000k
         -g 60 -keyint_min 60 -sc_threshold 0 -pix_fmt yuv420p
         -c:a aac -b:a 160k -ar 48000)
else
  CODEC=(-c copy)
fi

trap 'echo; echo "stopping"; exit 0' INT TERM
while true; do
  echo "[$(date '+%F %T')] going live ($STREAM_MODE) …"
  ffmpeg -hide_banner -loglevel warning -stats \
    -re -stream_loop -1 -i "$STREAM_FILE" \
    "${CODEC[@]}" -flvflags no_duration_filesize \
    -f flv "${DEST[@]}"
  code=$?
  [[ "${DRY_RUN:-0}" == "1" ]] && exit $code
  echo "[$(date '+%F %T')] ffmpeg exited ($code) — reconnecting in 10 s"
  sleep 10
done
