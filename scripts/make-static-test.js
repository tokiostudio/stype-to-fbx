#!/usr/bin/env node
/**
 * Generate static test FBX files with known values for UE5 import verification.
 * All 20 frames have identical values so any frame can be checked.
 */
const path = require('path');
const fs = require('fs');
const { generateFBX } = require('../src/fbx-writer');

const outDir = path.resolve(__dirname, '..', 'test-output');
fs.mkdirSync(outDir, { recursive: true });

// Mid-clip values from take0006
const KNOWN = {
  x: 3.5508, y: 1.2209, z: 1.2371,
  pan: 2.030, tilt: -3.424, roll: 0.213,
  fovX: 79.71, aspectRatio: 1.7818, focus: 0.54, zoom: 0, paWidth: 34.199,
};

function makeStaticData(overrides) {
  const vals = { ...KNOWN, ...overrides };
  const samples = [];
  for (let i = 0; i < 20; i++) {
    samples.push({ ...vals, time: i * 0.04, frameIndex: i });
  }
  return {
    header: { frameRate: 25 },
    samples,
    durationSec: 0.76,
    timecodeStart: '00:00:00:00',
    timecodeEnd: '00:00:00:19',
  };
}

function makeSettings(overrides) {
  return {
    cameraName: 'nDisplay_CAM',
    scale: 100,
    outputFps: 25,
    fpsMode: 'source',
    sourceRate: 25,
    preRotation: { x: 0, y: 0, z: 0 },
    originTranslation: { x: 0, y: 0, z: 0 },
    originRotation: { x: 0, y: 0, z: 0 },
    originScale: { x: 1, y: 1, z: 1 },
    axisMapping: { fbxX: 'z', fbxY: 'y', fbxZ: 'x' },
    axisSign: { fbxX: -1, fbxY: 1, fbxZ: 1 },
    rotMapping: { fbxRotX: 'roll', fbxRotY: 'pan', fbxRotZ: 'tilt' },
    rotSign: { fbxRotX: 1, fbxRotY: -1, fbxRotZ: 1 },
    enableTranslation: true,
    enableRotation: true,
    enableFov: true,
    enableFocus: false,
    ...overrides,
  };
}

// STD2_v1 preset
const out = path.join(outDir, 'static_std2v1.fbx');
generateFBX(makeStaticData(), out, makeSettings());

console.log('=== static_std2v1.fbx (STD2_v1 preset) ===');
console.log('STYPE: x=3.5508 y=1.2209 z=1.2371 pan=2.030 tilt=-3.424 roll=0.213');
console.log('');
console.log('Expected UE5:');
console.log('  Location: X=-123.71  Y=355.08  Z=122.09');
console.log('  Rotation: Pitch=-3.424(tilt)  Yaw=2.030(pan)  Roll=0.213(roll)');
console.log('');
console.log('Output:', out);
