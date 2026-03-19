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

# --- Windows .ico (multi-size, 32bpp RGBA via embedded PNGs) ---
echo "Generating Windows .ico..."
node -e "
const sharp = require('sharp');
const fs = require('fs');
const sizes = [16, 24, 32, 48, 64, 128, 256];
const src = process.argv[1], out = process.argv[2];
(async () => {
  const bufs = [];
  for (const s of sizes)
    bufs.push({ s, d: await sharp(src).resize(s,s).png().toBuffer() });
  const H = 6, E = 16, dirSz = E * bufs.length;
  let off = H + dirSz;
  const hdr = Buffer.alloc(H);
  hdr.writeUInt16LE(0,0); hdr.writeUInt16LE(1,2); hdr.writeUInt16LE(bufs.length,4);
  const dirs = [], imgs = [];
  for (const {s,d} of bufs) {
    const e = Buffer.alloc(E);
    e.writeUInt8(s>=256?0:s,0); e.writeUInt8(s>=256?0:s,1);
    e.writeUInt16LE(1,4); e.writeUInt16LE(32,6);
    e.writeUInt32LE(d.length,8); e.writeUInt32LE(off,12);
    dirs.push(e); imgs.push(d); off += d.length;
  }
  fs.writeFileSync(out, Buffer.concat([hdr,...dirs,...imgs]));
  console.log('  -> ' + out + ' (' + bufs.length + ' sizes, 32bpp)');
})();
" "$SRC" "$RESOURCES/icon.ico"


# --- Linux/general PNG ---
echo "Copying PNG..."
cp "$SRC" "$RESOURCES/icon.png"
echo "  -> $RESOURCES/icon.png"

echo "Done! All icons generated in $RESOURCES/"
