#!/usr/bin/env bash
# Make a long video file (e.g. the full 24-hour fireplace) from the 1-hour master.
# No re-encoding: this takes a few minutes, not hours.
#
#   scripts/make_long_video.sh HOURS [MASTER] [OUT]
#
#   HOURS=24 → the full 24-hour video (~69 GB at the default quality).
#   Note: YouTube *uploads* are capped at 12 hours / 256 GB. For a 24-hour
#   fireplace on YouTube use the 24-hour live broadcast (make live-24h).
set -euo pipefail
cd "$(dirname "$0")/.."

HOURS=${1:-24}
MASTER=${2:-build/fireplace_master_1h.mp4}
OUT=${3:-build/ember_noir_fireplace_${HOURS}h.mp4}

[[ -f "$MASTER" ]] || { echo "missing $MASTER — run: scripts/build_master.sh"; exit 1; }
if (( $(echo "$HOURS > 12" | bc -l) )); then
  echo "Note: ${HOURS}h is longer than YouTube's 12-hour upload cap."
  echo "      Fine for TVs, USB sticks, Vimeo, your own site. For YouTube use: make live-24h"
fi

SECS=$(echo "$HOURS * 3600 / 1" | bc)
NEED_GB=$(( $(stat -c %s "$MASTER") * SECS / 3600 / 1000000000 + 1 ))
FREE_GB=$(( $(df -P --output=avail "$(dirname "$OUT")" 2>/dev/null | tail -1 || echo 0) / 1000000 ))
echo "Building ${HOURS}h video → $OUT  (needs ~${NEED_GB} GB, ${FREE_GB} GB free)"
(( FREE_GB == 0 || FREE_GB > NEED_GB )) || { echo "Not enough disk space."; exit 1; }

mkdir -p "$(dirname "$OUT")"
ffmpeg -hide_banner -loglevel warning -stats -y \
  -stream_loop -1 -i "$MASTER" -t "$SECS" \
  -c copy -movflags +faststart "$OUT"
ls -lh "$OUT"
