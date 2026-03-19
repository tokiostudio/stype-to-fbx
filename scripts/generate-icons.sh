#!/bin/bash
# Generate platform-specific icons from stype-to-fbx.png
# Requires: macOS (sips + iconutil), npx (for png-to-ico)

set -e
cd "$(dirname "$0")/.."

SRC="stype-to-fbx.png"
RESOURCES="resources"

if [ ! -f "$SRC" ]; then
  echo "Error: $SRC not found in project root"
  exit 1
fi

mkdir -p "$RESOURCES"

# --- macOS .icns ---
echo "Generating macOS .icns..."
ICONSET="$RESOURCES/icon.iconset"
mkdir -p "$ICONSET"

sips -z 16 16     "$SRC" --out "$ICONSET/icon_16x16.png"      > /dev/null
sips -z 32 32     "$SRC" --out "$ICONSET/icon_16x16@2x.png"   > /dev/null
sips -z 32 32     "$SRC" --out "$ICONSET/icon_32x32.png"      > /dev/null
sips -z 64 64     "$SRC" --out "$ICONSET/icon_32x32@2x.png"   > /dev/null
sips -z 128 128   "$SRC" --out "$ICONSET/icon_128x128.png"    > /dev/null
sips -z 256 256   "$SRC" --out "$ICONSET/icon_128x128@2x.png" > /dev/null
sips -z 256 256   "$SRC" --out "$ICONSET/icon_256x256.png"    > /dev/null
sips -z 512 512   "$SRC" --out "$ICONSET/icon_256x256@2x.png" > /dev/null
sips -z 512 512   "$SRC" --out "$ICONSET/icon_512x512.png"    > /dev/null
sips -z 1024 1024 "$SRC" --out "$ICONSET/icon_512x512@2x.png" > /dev/null

iconutil -c icns "$ICONSET" -o "$RESOURCES/icon.icns"
rm -rf "$ICONSET"
echo "  -> $RESOURCES/icon.icns"

# --- Windows .ico ---
echo "Generating Windows .ico..."
npx --yes png-to-ico "$SRC" > "$RESOURCES/icon.ico"
echo "  -> $RESOURCES/icon.ico"

# --- Linux/general PNG ---
echo "Copying PNG..."
cp "$SRC" "$RESOURCES/icon.png"
echo "  -> $RESOURCES/icon.png"

echo "Done! All icons generated in $RESOURCES/"
