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
npm start                  # Run the Electron app
npm test                   # Run conversion test
npm run static-test        # Generate static test FBX
node src/cli.js --help     # CLI help
```

No build step, transpilation, or bundler — plain JavaScript running in Electron.

## License

MIT — [Tokio Studio](https://tokio.studio)
