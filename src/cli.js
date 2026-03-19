#!/usr/bin/env node
/**
 * CLI tool for STYPE → FBX conversion and inspection.
 *
 * Usage:
 *   node src/cli.js <input.xml> [output.fbx] [--setting=value ...]
 *   node src/cli.js inspect <file.fbx>
 *   node src/cli.js info <file.xml>
 *
 * Examples:
 *   # Convert with defaults (Vanilla preset)
 *   node src/cli.js ../xml/take0070.xml out.fbx
 *
 *   # Convert with custom settings
 *   node src/cli.js ../xml/take0070.xml out.fbx --scale=100 --fpsMode=source
 *
 *   # Inspect an existing FBX file
 *   node src/cli.js inspect out.fbx
 *
 *   # Show XML info
 *   node src/cli.js info ../xml/take0070.xml
 *
 * Settings flags (all optional):
 *   --cameraName=NAME         Camera node name (default: nDisplay_CAM)
 *   --scale=N                 Unit scale (default: 100, meters→cm)
 *   --outputFps=N|source      Output frame rate (default: source)
 *   --fpsMode=MODE            source|drop|resample|slowmo (default: source)
 *   --preRotX=N --preRotY=N --preRotZ=N
 *   --originTX=N --originTY=N --originTZ=N    Origin translation (meters)
 *   --originRX=N --originRY=N --originRZ=N    Origin rotation (degrees)
 *   --originSX=N --originSY=N --originSZ=N    Origin scale (default: 1)
 *   --axisX=x|y|z --axisY=x|y|z --axisZ=x|y|z
 *   --axisXSign=1|-1 --axisYSign=1|-1 --axisZSign=1|-1
 *   --rotX=pan|tilt|roll --rotY=pan|tilt|roll --rotZ=pan|tilt|roll
 *   --rotXSign=1|-1 --rotYSign=1|-1 --rotZSign=1|-1
 *   --noTranslation --noRotation --noFov --enableFocus
 */

const path = require('path');
const fs = require('fs');
const { parseStypeXML } = require('./xml-parser');
const { generateFBX } = require('./fbx-writer');

// --- Parse CLI args ---
const args = process.argv.slice(2);
const flags = {};
const positional = [];

for (const arg of args) {
  if (arg.startsWith('--')) {
    const eq = arg.indexOf('=');
    if (eq > 0) {
      flags[arg.substring(2, eq)] = arg.substring(eq + 1);
    } else {
      flags[arg.substring(2)] = true;
    }
  } else {
    positional.push(arg);
  }
}

// --- Commands ---
const command = positional[0];

if (command === 'inspect') {
  inspectFBX(positional[1]);
  process.exit(0);
}

if (command === 'info') {
  showXMLInfo(positional[1]);
  process.exit(0);
}

if (!command || command === '--help' || command === '-h') {
  console.log('Usage:');
  console.log('  node src/cli.js <input.xml> [output.fbx] [--flags]');
  console.log('  node src/cli.js inspect <file.fbx>');
  console.log('  node src/cli.js info <file.xml>');
  console.log('Run with --help for full flag list (see source header).');
  process.exit(0);
}

// --- Convert ---
const inputPath = path.resolve(command);
const outputPath = positional[1]
  ? path.resolve(positional[1])
  : inputPath.replace(/\.xml$/i, '.fbx');

if (!fs.existsSync(inputPath)) {
  console.error('Input file not found:', inputPath);
  process.exit(1);
}

const data = parseStypeXML(inputPath);

const settings = {
  cameraName: flags.cameraName || 'nDisplay_CAM',
  scale: parseFloat(flags.scale) || 100,
  outputFps: flags.outputFps === 'source' ? 'source' : (parseFloat(flags.outputFps) || 'source'),
  fpsMode: flags.fpsMode || 'source',
  dropOffset: parseInt(flags.dropOffset) || 0,
  sourceRate: data.header.frameRate,
  preRotation: {
    x: parseFloat(flags.preRotX) || 0,
    y: parseFloat(flags.preRotY) || 0,
    z: parseFloat(flags.preRotZ) || 0,
  },
  originTranslation: {
    x: parseFloat(flags.originTX) || 0,
    y: parseFloat(flags.originTY) || 0,
    z: parseFloat(flags.originTZ) || 0,
  },
  originRotation: {
    x: parseFloat(flags.originRX) || 0,
    y: parseFloat(flags.originRY) || 0,
    z: parseFloat(flags.originRZ) || 0,
  },
  originScale: {
    x: flags.originSX !== undefined ? parseFloat(flags.originSX) : 1,
    y: flags.originSY !== undefined ? parseFloat(flags.originSY) : 1,
    z: flags.originSZ !== undefined ? parseFloat(flags.originSZ) : 1,
  },
  axisMapping: {
    fbxX: flags.axisX || 'z',
    fbxY: flags.axisY || 'y',
    fbxZ: flags.axisZ || 'x',
  },
  axisSign: {
    fbxX: flags.axisXSign !== undefined ? parseInt(flags.axisXSign) : -1,
    fbxY: parseInt(flags.axisYSign) || 1,
    fbxZ: parseInt(flags.axisZSign) || 1,
  },
  rotMapping: {
    fbxRotX: flags.rotX || 'roll',
    fbxRotY: flags.rotY || 'pan',
    fbxRotZ: flags.rotZ || 'tilt',
  },
  rotSign: {
    fbxRotX: parseInt(flags.rotXSign) || 1,
    fbxRotY: flags.rotYSign !== undefined ? parseInt(flags.rotYSign) : -1,
    fbxRotZ: parseInt(flags.rotZSign) || 1,
  },
  enableTranslation: !flags.noTranslation,
  enableRotation: !flags.noRotation,
  enableFov: !flags.noFov,
  enableFocus: !!flags.enableFocus,
};

console.log('=== INPUT ===');
console.log('File:', path.basename(inputPath));
console.log('Samples:', data.samples.length);
console.log('Source rate:', data.header.frameRate, 'Hz');
console.log('Duration:', data.durationSec.toFixed(3), 's');
console.log('TC:', data.timecodeStart, '→', data.timecodeEnd);

const s0 = data.samples[0];
console.log('\nFirst sample (raw STYPE):');
console.log('  Pos:  X=%s  Y=%s  Z=%s  (meters)', s0.x, s0.y, s0.z);
console.log('  Rot:  Pan=%s  Tilt=%s  Roll=%s  (degrees)', s0.pan, s0.tilt, s0.roll);
console.log('  FovX=%s  Focus=%s  Zoom=%s', s0.fovX, s0.focus, s0.zoom);

console.log('\n=== SETTINGS ===');
console.log('Scale:', settings.scale);
console.log('FPS mode:', settings.fpsMode, '→', settings.outputFps === 'source' ? data.header.frameRate : settings.outputFps, 'fps');
console.log('Axis mapping: FBX_X=%s*%d  FBX_Y=%s*%d  FBX_Z=%s*%d',
  settings.axisMapping.fbxX, settings.axisSign.fbxX,
  settings.axisMapping.fbxY, settings.axisSign.fbxY,
  settings.axisMapping.fbxZ, settings.axisSign.fbxZ);
console.log('Rot mapping:  FBX_RotX=%s*%d  FBX_RotY=%s*%d  FBX_RotZ=%s*%d',
  settings.rotMapping.fbxRotX, settings.rotSign.fbxRotX,
  settings.rotMapping.fbxRotY, settings.rotSign.fbxRotY,
  settings.rotMapping.fbxRotZ, settings.rotSign.fbxRotZ);
console.log('PreRotation:', JSON.stringify(settings.preRotation));
console.log('Origin T:', JSON.stringify(settings.originTranslation));
console.log('Origin R:', JSON.stringify(settings.originRotation));
console.log('Origin S:', JSON.stringify(settings.originScale));

console.log('\n=== CONVERTING ===');
const result = generateFBX(data, outputPath, settings);
console.log('Output:', outputPath);
console.log('Frames:', result.frameCount, '@', result.outputFps, 'fps');
console.log('Size:', fs.statSync(outputPath).size, 'bytes');

// Show what ended up in the FBX
console.log('\n=== OUTPUT VERIFICATION ===');
inspectFBX(outputPath);

// --- Helper functions ---

function inspectFBX(fbxPath) {
  if (!fbxPath || !fs.existsSync(fbxPath)) {
    console.error('FBX file not found:', fbxPath);
    process.exit(1);
  }
  const fbx = fs.readFileSync(fbxPath, 'utf-8');

  // Extract camera node
  const cameraBlock = extractModelBlock(fbx, '", "Camera"');
  if (cameraBlock) {
    console.log('Camera Node:');
    const preRot = extractProperty(cameraBlock, 'PreRotation');
    console.log('  PreRotation:', preRot || '0,0,0');
  }

  // Extract animation curves
  const curves = extractAnimCurves(fbx);
  if (curves.length > 0) {
    console.log('Animation Curves:');

    // Group: first 3 are translation, next 3 rotation, then focal length
    const labels = ['Translate X', 'Translate Y', 'Translate Z',
                    'Rotate X', 'Rotate Y', 'Rotate Z', 'FocalLength'];
    for (let i = 0; i < curves.length; i++) {
      const c = curves[i];
      const label = labels[i] || c.name;
      const vals = c.values;
      console.log('  %s: first=%s  last=%s  min=%s  max=%s  (%d keys)',
        label,
        vals[0].toFixed(4),
        vals[vals.length - 1].toFixed(4),
        Math.min(...vals).toFixed(4),
        Math.max(...vals).toFixed(4),
        vals.length);
    }
  }

  // Connections hierarchy
  const connLines = fbx.match(/C: "OO",\d+,\d+/g) || [];
  console.log('Hierarchy connections:', connLines.length);
  for (const c of connLines.slice(0, 5)) {
    console.log(' ', c.trim());
  }
}

function showXMLInfo(xmlPath) {
  if (!xmlPath || !fs.existsSync(xmlPath)) {
    console.error('XML file not found:', xmlPath);
    process.exit(1);
  }
  const data = parseStypeXML(xmlPath);
  console.log('File:', path.basename(xmlPath));
  console.log('Samples:', data.samples.length);
  console.log('Rate:', data.header.frameRate, 'Hz');
  console.log('Duration:', data.durationSec.toFixed(3), 's');
  console.log('TC:', data.timecodeStart, '→', data.timecodeEnd);

  const s = data.samples[0];
  console.log('\nFirst sample:');
  console.log('  X=%s  Y=%s  Z=%s  (meters)', s.x, s.y, s.z);
  console.log('  Pan=%s  Tilt=%s  Roll=%s  (degrees)', s.pan, s.tilt, s.roll);
  console.log('  FovX=%s  Aspect=%s  PA_width=%smm', s.fovX, s.aspectRatio, s.paWidth);

  const l = data.samples[data.samples.length - 1];
  console.log('Last sample:');
  console.log('  X=%s  Y=%s  Z=%s', l.x, l.y, l.z);
  console.log('  Pan=%s  Tilt=%s  Roll=%s', l.pan, l.tilt, l.roll);

  // Show ranges
  const keys = ['x', 'y', 'z', 'pan', 'tilt', 'roll'];
  console.log('\nRanges:');
  for (const k of keys) {
    const vals = data.samples.map(s => s[k]);
    console.log('  %s: [%s .. %s]  delta=%s', k,
      Math.min(...vals).toFixed(4), Math.max(...vals).toFixed(4),
      (Math.max(...vals) - Math.min(...vals)).toFixed(4));
  }
}

function extractModelBlock(fbx, marker) {
  const idx = fbx.indexOf('Model::');
  let searchFrom = 0;
  while (true) {
    const pos = fbx.indexOf(marker, searchFrom);
    if (pos < 0) return null;
    // Find the Model: line start
    const lineStart = fbx.lastIndexOf('Model:', pos);
    if (lineStart < 0) return null;
    // Find closing brace
    let depth = 0;
    let blockStart = fbx.indexOf('{', lineStart);
    if (blockStart < 0) return null;
    for (let i = blockStart; i < fbx.length; i++) {
      if (fbx[i] === '{') depth++;
      if (fbx[i] === '}') { depth--; if (depth === 0) return fbx.substring(lineStart, i + 1); }
    }
    searchFrom = pos + 1;
  }
}

function extractProperty(block, propName) {
  const regex = new RegExp(`P: "${propName}".*?"A",(.*)`);
  const m = block.match(regex);
  return m ? m[1].trim() : null;
}

function extractAnimCurves(fbx) {
  const results = [];
  const curveRegex = /AnimationCurve: \d+, "AnimCurve::(\w+)".*?\{[\s\S]*?KeyValueFloat: \*\d+ \{\s*a: ([^\}]+)\}/g;
  let match;
  while ((match = curveRegex.exec(fbx)) !== null) {
    results.push({
      name: match[1],
      values: match[2].split(',').map(Number),
    });
  }
  return results;
}
