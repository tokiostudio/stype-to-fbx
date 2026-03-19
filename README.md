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

```bash
npm install                # Install dependencies
npm start                  # Run the Electron app (dev mode with hot reload)
npm test                   # Run conversion test
npm run static-test        # Generate static test FBX
node src/cli.js --help     # CLI help
```

## Building for Distribution

The app uses [Electron Forge](https://www.electronforge.io/) with Vite for packaging and distribution.

### macOS (unsigned, for local testing)

```bash
npm run make
```

Produces `out/make/STYPE to FBX.dmg` and a ZIP archive.

### macOS (signed + notarized, for distribution)

Requires an [Apple Developer Program](https://developer.apple.com/programs/) membership.

**One-time setup:**

1. Get a "Developer ID Application" certificate from Apple Developer portal
2. Store notarization credentials in Keychain:
   ```bash
   xcrun notarytool store-credentials "AC_PASSWORD" \
     --apple-id "your@email.com" \
     --team-id "YOURTEAMID" \
     --password "app-specific-password"
   ```

**Build:**

```bash
APPLE_IDENTITY="Developer ID Application: Your Name (TEAMID)" \
APPLE_KEYCHAIN_PROFILE="AC_PASSWORD" \
npm run make
```

The app is signed and notarized automatically. To also sign and notarize the DMG:

```bash
codesign --force --sign "Developer ID Application: Your Name (TEAMID)" out/make/*.dmg
xcrun notarytool submit out/make/*.dmg --keychain-profile "AC_PASSWORD" --wait
xcrun stapler staple out/make/*.dmg
```

### Windows

Build natively on a Windows machine for best results:

```bash
npm install
npm run make
```

Produces a Squirrel installer in `out/make/squirrel.windows/`.

> **Cross-compiling from Mac**: `npm run make -- --platform win32` is possible but requires `mono` and `wine` installed, and can be unreliable. For production builds, use a Windows machine or CI.

### Build output

All build artifacts are placed in `out/make/`. The `out/` directory is git-ignored.

| Platform | Format | Location |
|----------|--------|----------|
| macOS | DMG | `out/make/*.dmg` |
| macOS | ZIP | `out/make/zip/darwin/*/` |
| Windows | Squirrel installer | `out/make/squirrel.windows/*/` |

### Regenerating icons

If you update `stype-to-fbx.png`, regenerate platform icons:

```bash
bash scripts/generate-icons.sh
```

Requires macOS (uses `sips` + `iconutil`) and `npx` (for `png-to-ico`).

## License

MIT — [Tokio Studio](https://tokio.studio)
