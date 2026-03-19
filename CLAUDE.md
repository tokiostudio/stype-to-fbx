# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # Run the Electron app
npm test               # Run conversion test (scripts/test-convert.js)
npm run cli -- in.xml out.fbx   # CLI conversion
node src/cli.js --help          # CLI flags reference
```

No build step, linter, or CI — plain JS running in Electron.

## Architecture

Standard Electron app with `contextIsolation: true`. All source in `src/`.

### Core Pipeline

1. **`xml-parser.js`** — Parses STYPE HF XML. Handles European decimal commas (`"4,2688 m"` → `4.2688`), ISO 8601 durations, timecodes. Returns `{ header, samples[], timecodeStart, timecodeEnd, durationSec }`.

2. **`fbx-writer.js`** — Generates FBX ASCII 7.4 from parsed samples. Handles axis/rotation remapping, unit conversion (m→cm), FovX→focal length, origin transforms (translation/rotation/scale applied mathematically per-sample), and FBX time ticks (`46186158000` ticks/sec). Four FPS modes: source, drop, resample, slowmo.

3. **`cli.js`** — Standalone CLI converter. Defaults match the STD2_v1 preset. Supports `--inspect` for FBX analysis.

4. **`main.js`** / **`preload.js`** — Electron main process + context bridge. IPC: `parse-xml-info`, `convert-to-fbx`, `select-output-folder`, `save-preset-file`, `load-preset-file`.

5. **`renderer/renderer.js`** — UI: drag-and-drop, preset system with versioned localStorage, axis/rotation controls, batch conversion.

## Key Domain Knowledge

- **STYPE HF**: ~100 Hz camera tracker. Position in meters, rotation in degrees, FovX in degrees.
- **UE5 FBX import mapping** (confirmed via static tests):
  - `UE_X = FBX_X`, `UE_Y = FBX_Z`, `UE_Z = FBX_Y` (Y↔Z swap)
  - `UE_Pitch = FBX_RotZ`, `UE_Yaw = -FBX_RotY`, `UE_Roll = FBX_RotX`
- **STD2_v1 preset**: The default mapping from STYPE to FBX that produces correct UE5 results:
  - Position: `fbxX=stype_z×(-1)`, `fbxY=stype_y`, `fbxZ=stype_x` (all ×100 for cm)
  - Rotation: `fbxRotX=roll`, `fbxRotY=pan×(-1)`, `fbxRotZ=tilt`
- **Camera name** must match the CineCameraActor in UE5 (default: `nDisplay_CAM`).
- **Origin transforms** are applied mathematically per-sample (not via FBX hierarchy nesting, which breaks UE5 node matching).
- **PRESET_VERSION**: Increment when changing default preset values — forces localStorage refresh on existing installs.
