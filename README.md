# STYPE-to-FBX Converter

Electron desktop app that converts [STYPE HF](https://stype.tv) camera tracking XML files into FBX ASCII 7.4 files for import into **Unreal Engine 5**. Built for virtual production and broadcast workflows where STYPE camera tracking data needs to drive a CineCameraActor.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron) ![License](https://img.shields.io/badge/license-MIT-green)

## Quick Start

```bash
npm install
npm start        # Launch the GUI
```

### CLI Usage

```bash
# Basic conversion (uses STD2_v1 preset defaults)
node src/cli.js input.xml output.fbx

# Custom settings
node src/cli.js input.xml output.fbx --fps 25 --fpsMode resample --camera MyCam

# See all options
node src/cli.js --help
```

## How It Works

1. **Drop** one or more STYPE XML files onto the app window
2. **Select** a preset or configure axis/rotation mapping manually
3. **Convert** — the app generates FBX files ready for UE5 Level Sequence import

### UE5 Import

In Unreal Engine, open your Level Sequence containing a CineCameraActor, right-click the camera track → **Import FBX**. The camera name in the FBX must match the actor name (default: `nDisplay_CAM`).

## Default Preset: STD2_v1

The built-in preset maps STYPE coordinates to UE5's coordinate system:

| STYPE | → | UE5 | Notes |
|-------|---|-----|-------|
| X (lateral) | → | Y | Studio lateral axis |
| Y (height) | → | Z | Vertical axis |
| Z (depth) | → | -X | Forward/back (negated) |
| Pan | → | Yaw | Negated in FBX to match UE5 handedness |
| Tilt | → | Pitch | Direct mapping |
| Roll | → | Roll | Direct mapping |

Scale: meters × 100 → centimeters.

## Frame Rate Modes

- **source** — 1:1 mapping at original sample rate (typically 100 Hz)
- **drop** — Pick every Nth sample to reduce frame rate
- **resample** — Linear interpolation to exact output timestamps
- **slowmo** — 1:1 sample-to-frame mapping at lower FPS (slow-motion effect)

## Project Structure

```
src/
  main.js          # Electron main process + IPC
  preload.js       # Context bridge (security isolation)
  xml-parser.js    # STYPE HF XML → structured data
  fbx-writer.js    # Structured data → FBX ASCII 7.4
  cli.js           # Standalone CLI converter
  renderer/
    index.html     # App UI
    renderer.js    # UI logic, presets, batch conversion
    styles.css     # Dark theme styles
scripts/
  test-convert.js      # Conversion test using sample data
  make-static-test.js  # Generate static FBX for UE5 verification
samples/
  sample_20frames.xml  # Trimmed STYPE XML for testing
```

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) v18+ (LTS recommended)
- npm (comes with Node.js)

### Setup

```bash
git clone https://github.com/tokiostudio/stype-to-fbx.git
cd stype-to-fbx
npm install
```

### Run

```bash
npm start                  # Launch Electron app (dev mode with Vite hot reload)
npm test                   # Run conversion test
npm run static-test        # Generate static FBX for UE5 verification
node src/cli.js --help     # CLI reference
```

The app runs directly with plain JS — no TypeScript, no transpilation step.

## Building for Distribution

The app uses [Electron Forge](https://www.electronforge.io/) with [Vite](https://vite.dev/) for bundling and packaging.

Key files:
- `forge.config.js` — Electron Forge configuration (makers, plugins, signing)
- `vite.main.config.mjs` — Vite config for the main process
- `vite.preload.config.mjs` — Vite config for the preload script
- `vite.renderer.config.mjs` — Vite config for the renderer
- `resources/` — Platform icons (`.icns`, `.ico`, `.png`) and macOS entitlements

### macOS — unsigned (local testing)

```bash
npm run make
```

Produces a DMG and ZIP in `out/make/`. The app will trigger a Gatekeeper warning on other machines.

### macOS — signed and notarized (distribution)

Requires an [Apple Developer Program](https://developer.apple.com/programs/) membership.

**One-time setup:**

1. Create a "Developer ID Application" certificate in the [Apple Developer portal](https://developer.apple.com/account/resources/certificates/list)
2. Download and install the certificate in Keychain Access
3. Store your App Store Connect credentials for notarization:
   ```bash
   xcrun notarytool store-credentials "AC_PASSWORD" \
     --apple-id "your-apple-id@email.com" \
     --team-id "YOURTEAMID" \
     --password "your-app-specific-password"
   ```
   Generate the app-specific password at [appleid.apple.com](https://appleid.apple.com/account/manage) → Sign-In and Security → App-Specific Passwords.

**Build (single command):**

Create a `build.sh` file (git-ignored, do not commit):

```bash
#!/usr/bin/env bash
set -euo pipefail

APPLE_IDENTITY="Developer ID Application: Your Name (TEAMID)"
APPLE_KEYCHAIN_PROFILE="AC_PASSWORD"
APP_NAME="STYPE to FBX"
VERSION=$(node -p "require('./package.json').version")
ARCH=$(uname -m)

DMG="out/make/${APP_NAME}-${VERSION}-${ARCH}.dmg"
APP="out/${APP_NAME}-darwin-${ARCH}/${APP_NAME}.app"

echo "=== Building ${APP_NAME} v${VERSION} (${ARCH}) ==="

# Step 1: Build + sign + notarize the .app
APPLE_IDENTITY="$APPLE_IDENTITY" \
APPLE_KEYCHAIN_PROFILE="$APPLE_KEYCHAIN_PROFILE" \
npm run make

# Step 2: Sign the DMG
codesign --force --sign "$APPLE_IDENTITY" "$DMG"

# Step 3: Notarize the DMG
xcrun notarytool submit "$DMG" --keychain-profile "$APPLE_KEYCHAIN_PROFILE" --wait

# Step 4: Staple notarization ticket
xcrun stapler staple "$DMG"

# Verify
spctl --assess --type execute --verbose "$APP" 2>&1
spctl --assess --type install --verbose "$DMG" 2>&1

echo "DMG: $DMG"
echo "ZIP: out/make/zip/darwin/${ARCH}/${APP_NAME}-darwin-${ARCH}-${VERSION}.zip"
```

```bash
chmod +x build.sh
./build.sh
```

The `forge.config.js` reads `APPLE_IDENTITY` and `APPLE_KEYCHAIN_PROFILE` from the environment — when present, it enables `osxSign` and `osxNotarize` automatically.

### Windows — building on a Windows machine

Build natively on Windows for production-quality installers:

```powershell
git clone https://github.com/tokiostudio/stype-to-fbx.git
cd stype-to-fbx
npm install
npm run make
```

Produces a Squirrel installer (`Setup.exe`) and a NuGet package in `out/make/squirrel.windows/x64/`.

**Optional: code signing on Windows**

To sign the Windows build with an EV or standard code signing certificate:

```powershell
$env:WINDOWS_CERTIFICATE_FILE = "path\to\certificate.pfx"
$env:WINDOWS_CERTIFICATE_PASSWORD = "your-password"
npm run make
```

The `forge.config.js` Squirrel maker picks these up automatically.

> **Cross-compiling from Mac** is technically possible (`npm run make -- --platform win32`) but requires `mono` and `wine`, and Squirrel installers may not work correctly. Use a Windows machine or Windows CI for production builds.

### Build output

All artifacts go to `out/make/` (git-ignored).

| Platform | Format | Location |
|----------|--------|----------|
| macOS | DMG | `out/make/STYPE to FBX-{version}-{arch}.dmg` |
| macOS | ZIP | `out/make/zip/darwin/{arch}/` |
| Windows | Squirrel installer | `out/make/squirrel.windows/{arch}/` |

### Creating a GitHub release

After building:

```bash
VERSION=$(node -p "require('./package.json').version")

gh release create "v${VERSION}" \
  --title "v${VERSION} — STYPE to FBX Converter" \
  --generate-notes \
  "out/make/STYPE to FBX-${VERSION}-arm64.dmg#STYPE.to.FBX-${VERSION}-macOS-arm64.dmg" \
  "out/make/zip/darwin/arm64/STYPE to FBX-darwin-arm64-${VERSION}.zip#STYPE.to.FBX-${VERSION}-macOS-arm64.zip"
```

Add Windows artifacts from the Windows build machine in the same release via `gh release upload`.

### Regenerating icons

If you update `stype-to-fbx.png` (the source logo), regenerate platform icons:

```bash
bash scripts/generate-icons.sh
```

Requires macOS (`sips` + `iconutil`) and `npx` (for `png-to-ico`). Outputs to `resources/`.

## License

MIT — [Tokio Studio](https://tokio.studio)
