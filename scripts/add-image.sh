#!/usr/bin/env bash
# Optimise an image for the site, whatever its source.
#
#   scripts/add-image.sh <file> <slug> [width] [mode]
#
#   width  target px on the long edge (default 900)
#   mode   file  -> writes assets/<slug>.jpg and prints the URL   (default)
#          b64   -> prints a data: URI for inlining in a page
#
# Handles heic/webp/png/jpg. sips will not resize webp or heic directly, so
# anything non-jpeg is converted to png first -- that two-step is deliberate.
set -euo pipefail

src=${1:?usage: add-image.sh <file> <slug> [width] [mode]}
slug=${2:?missing slug}
width=${3:-900}
mode=${4:-file}
[ -f "$src" ] || { echo "no such file: $src" >&2; exit 1; }

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
sips -s format png "$src" --out "$tmp/x.png" >/dev/null 2>&1
sips -Z "$width" -s format jpeg -s formatOptions 72 "$tmp/x.png" --out "$tmp/out.jpg" >/dev/null 2>&1

bytes=$(wc -c < "$tmp/out.jpg" | tr -d ' ')
dims=$(sips -g pixelWidth -g pixelHeight "$tmp/out.jpg" | awk '/pixel/{printf "%s ",$2}')

if [ "$mode" = "b64" ]; then
  printf 'data:image/jpeg;base64,'
  base64 -i "$tmp/out.jpg" | tr -d '\n'
  printf '\n'
  echo "# ${dims}px, ${bytes} bytes" >&2
else
  mkdir -p assets
  cp "$tmp/out.jpg" "assets/$slug.jpg"
  echo "/assets/$slug.jpg"
  echo "# ${dims}px, ${bytes} bytes" >&2
fi
