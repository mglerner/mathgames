#!/bin/sh
# Takes pictures of episode 2's screens so they can be checked without a phone.
#
#   story/test/shots.sh            every screen
#   story/test/shots.sh lock       only previews whose name contains "lock"
#
# It serves the story folder on this machine only (127.0.0.1), opens each
# preview in headless Chrome with a throwaway profile (your normal Chrome
# windows, tabs and logins are not touched), saves PNGs to story/test/shots/,
# and then stops the server. Nothing is sent anywhere.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$HERE")
OUT="$HERE/shots"
PORT=8765
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Google Chrome not found at $CHROME" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/.profile"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null; rm -rf "$OUT/.profile"' EXIT
sleep 1

# Each picture gets its own Chrome and its own profile folder, and at most 20 seconds:
# a second Chrome started on a profile the first is still closing can wait forever.
node "$HERE/preview-pages.mjs" "${1:-}" 2>/dev/null | while read -r name query; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
    --user-data-dir="$OUT/.profile/$name" --window-size=850,1800 --virtual-time-budget=4000 \
    --screenshot="$OUT/$name.png" "http://127.0.0.1:$PORT/test/preview.html?names=$query" >/dev/null 2>&1 </dev/null &
  SHOT=$!
  n=0
  # Chrome often stays open after saving the picture, so stop waiting as soon as the file is there.
  while kill -0 "$SHOT" 2>/dev/null && [ ! -s "$OUT/$name.png" ] && [ "$n" -lt 40 ]; do sleep 0.5; n=$((n + 1)); done
  sleep 0.5
  kill "$SHOT" 2>/dev/null || true
  if [ -s "$OUT/$name.png" ]; then echo "saved $name.png"; else echo "FAILED $name.png (no picture after 20 seconds)"; fi
done
echo "Pictures are in $OUT"
