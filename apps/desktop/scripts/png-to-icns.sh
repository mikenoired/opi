#!/bin/bash

set -e

INPUT="${1:-icon.png}"
OUTPUT="${2:-icon.icns}"
ICONSET="${OUTPUT%.icns}.iconset"

if [ ! -f "$INPUT" ]; then
  echo "❌ File not found: $INPUT"
  exit 1
fi

echo "→ Creating iconset..."
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

echo "→ Generating icon sizes..."

sips -z 16 16       "$INPUT" --out "$ICONSET/icon_16x16.png" >/dev/null
sips -z 32 32       "$INPUT" --out "$ICONSET/icon_16x16@2x.png" >/dev/null

sips -z 32 32       "$INPUT" --out "$ICONSET/icon_32x32.png" >/dev/null
sips -z 64 64       "$INPUT" --out "$ICONSET/icon_32x32@2x.png" >/dev/null

sips -z 128 128     "$INPUT" --out "$ICONSET/icon_128x128.png" >/dev/null
sips -z 256 256     "$INPUT" --out "$ICONSET/icon_128x128@2x.png" >/dev/null

sips -z 256 256     "$INPUT" --out "$ICONSET/icon_256x256.png" >/dev/null
sips -z 512 512     "$INPUT" --out "$ICONSET/icon_256x256@2x.png" >/dev/null

sips -z 512 512     "$INPUT" --out "$ICONSET/icon_512x512.png" >/dev/null
sips -z 1024 1024   "$INPUT" --out "$ICONSET/icon_512x512@2x.png" >/dev/null

echo "→ Creating $OUTPUT..."

iconutil -c icns "$ICONSET" -o "$OUTPUT"

rm -rf "$ICONSET"

echo "✓ Done: $OUTPUT"
