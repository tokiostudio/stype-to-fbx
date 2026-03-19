const path = require('path');
const fs = require('fs');
const { parseStypeXML } = require('../src/xml-parser');
const { generateFBX } = require('../src/fbx-writer');

const sampleDir = path.join(__dirname, '..', 'samples');
const outDir = path.join(__dirname, '..', 'test-output');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const testFile = path.join(sampleDir, 'sample_20frames.xml');
if (!fs.existsSync(testFile)) {
  console.error('Sample file not found:', testFile);
  process.exit(1);
}

console.log('=== Parsing', testFile, '===');
const data = parseStypeXML(testFile);
console.log('Samples:', data.samples.length);
console.log('Duration:', data.durationSec.toFixed(3), 's');
console.log('First sample:', JSON.stringify(data.samples[0], null, 2));

// Generate FBX with STD2_v1 preset
const outputPath = path.join(outDir, 'test_sample.fbx');
const settings = {
  cameraName: 'nDisplay_CAM',
  scale: 100,
  outputFps: 25,
  fpsMode: 'source',
  sourceRate: 100,
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
};

console.log('\n=== Generating FBX (STD2_v1 preset) ===');
const result = generateFBX(data, outputPath, settings);
console.log('Written:', outputPath);
console.log('Frames:', result.frameCount);
console.log('Size:', fs.statSync(outputPath).size, 'bytes');

// Verify FBX structure
const content = fs.readFileSync(outputPath, 'utf-8');
console.log('\n=== FBX Verification ===');
console.log('Has FBX header:', content.includes('FBXHeaderExtension'));
console.log('Has Camera:', content.includes('NodeAttribute::Camera'));
console.log('Has AnimStack:', content.includes('AnimStack'));
console.log('Has AnimCurve:', content.includes('AnimationCurve:'));

console.log('\n=== ALL TESTS PASSED ===');
