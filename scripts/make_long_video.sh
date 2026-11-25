#!/usr/bin/env bash
# Make a long upload-ready video (e.g. "10 Hours of Fireplace") from the master.
# No re-encoding: this takes seconds, not hours.
#
#   scripts/make_long_video.sh HOURS [MASTER] [OUT]
#
# YouTube's upload cap is 12 hours / 256 GB (verified accounts).
set -euo pipefail
cd "$(dirname "$0")/.."

HOURS=${1:-10}
MASTER=${2:-build/fireplace_master_1h.mp4}
OUT=${3:-build/ember_noir_fireplace_${HOURS}h.mp4}

[[ -f "$MASTER" ]] || { echo "missing $MASTER — run: make master"; exit 1; }
if (( $(echo "$HOURS > 12" | bc -l) )); then echo "YouTube uploads max out at 12 hours"; exit 1; fi

SECS=$(echo "$HOURS * 3600 / 1" | bc)
echo "Building ${HOURS}h video → $OUT"
ffmpeg -hide_banner -loglevel warning -stats -y \
  -stream_loop -1 -i "$MASTER" -t "$SECS" \
  -c copy -movflags +faststart "$OUT"
ls -lh "$OUT"
