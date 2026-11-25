#!/usr/bin/env bash
# Mux the seamless video loop + seamless audio loop into a 1-hour master.
#   video loop (60 s) and audio loop (10 min) both divide 1 h evenly, so the
#   master itself is also a perfect loop — ideal for 24/7 streaming.
#
#   scripts/build_master.sh [VIDEO_LOOP] [AUDIO] [OUT] [MINUTES]
#
# Want a real recorded fire instead of the generated one? Pass your own file
# as AUDIO (wav/mp3/flac). It will be looped to fill the master.
set -euo pipefail
cd "$(dirname "$0")/.."

VIDEO=${1:-build/fire_loop.mp4}
AUDIO=${2:-build/fire_audio.wav}
OUT=${3:-build/fireplace_master_1h.mp4}
MINUTES=${4:-60}

[[ -f "$VIDEO" ]] || { echo "missing $VIDEO — run: make video"; exit 1; }
[[ -f "$AUDIO" ]] || { echo "missing $AUDIO — run: make audio"; exit 1; }

echo "Building ${MINUTES}-minute master → $OUT"
ffmpeg -hide_banner -loglevel warning -stats -y \
  -stream_loop -1 -i "$VIDEO" \
  -stream_loop -1 -i "$AUDIO" \
  -map 0:v:0 -map 1:a:0 \
  -t $((MINUTES * 60)) \
  -c:v copy \
  -c:a aac -b:a 192k -ar 48000 -ac 2 \
  -movflags +faststart \
  "$OUT"
ls -lh "$OUT"
