#!/usr/bin/env bash
# Stream the fireplace to YouTube Live.
# Loops the master file and auto-reconnects if the connection drops.
#
#   cp config.env.example config.env   # add your stream key
#   DURATION_HOURS=24 scripts/stream_24_7.sh   # one 24-hour broadcast, then stop
#   scripts/stream_24_7.sh                     # forever (DURATION_HOURS unset/0)
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
  DEST=(-y build/stream_test.flv); DURATION_HOURS=${DURATION_HOURS:-0.0056}  # ~20 s
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

# Fixed-length broadcast: stop after DURATION_HOURS of wall-clock time,
# reconnecting (for the remaining time only) if the connection drops.
DURATION_S=$(awk "BEGIN{printf \"%d\", ${DURATION_HOURS:-0}*3600}")
END_AT=$(( $(date +%s) + DURATION_S ))

trap 'echo; echo "stopping"; exit 0' INT TERM
while true; do
  LIMIT=()
  if (( DURATION_S > 0 )); then
    LEFT=$(( END_AT - $(date +%s) ))
    (( LEFT > 0 )) || { echo "[$(date '+%F %T')] ${DURATION_HOURS}h broadcast complete 🔥"; exit 0; }
    LIMIT=(-t "$LEFT")
    echo "[$(date '+%F %T')] going live ($STREAM_MODE), $((LEFT/3600))h $(((LEFT%3600)/60))m remaining …"
  else
    echo "[$(date '+%F %T')] going live ($STREAM_MODE), no end time …"
  fi
  ffmpeg -hide_banner -loglevel warning -nostats \
    -re -stream_loop -1 -i "$STREAM_FILE" "${LIMIT[@]}" \
    "${CODEC[@]}" -flvflags no_duration_filesize \
    -f flv "${DEST[@]}"
  code=$?
  [[ "${DRY_RUN:-0}" == "1" ]] && exit $code
  (( DURATION_S > 0 && END_AT - $(date +%s) <= 5 )) && { echo "[$(date '+%F %T')] ${DURATION_HOURS}h broadcast complete 🔥"; exit 0; }
  echo "[$(date '+%F %T')] ffmpeg exited ($code) — reconnecting in 10 s"
  sleep 10
done
