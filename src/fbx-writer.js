const fs = require('fs');

/**
 * Generate an FBX ASCII 7.4 file with camera animation compatible with UE5.
 *
 * ## Frame Rate Modes
 *
 * 1. **source** (default): Output at source rate (e.g. 100Hz→100fps). Every sample = 1 frame.
 *    Frame 0 in FBX = first sample, frame N = last sample. Real-time preserved.
 *
 * 2. **drop**: Drop frames to reduce rate while preserving real-time.
 *    E.g. 100Hz→25fps: take every 4th sample (step = sourceRate/outputFps).
 *    `dropOffset` picks which phase sample to start from (0..step-1).
 *    Output duration matches real-time.
 *
 * 3. **resample**: Interpolate samples to exact output timestamps.
 *    E.g. 100Hz→25fps: linear interpolation at 0s, 0.04s, 0.08s, etc.
 *    Output duration matches real-time. Smoothest result.
 *
 * 4. **slowmo**: Map each source sample 1:1 to a frame at the output FPS.
 *    E.g. 100 samples at 25fps = 4 seconds (instead of 1 second real-time).
 *    Creates slow motion effect (ratio = sourceRate / outputFps).
 *
 * ## Settings
 * - cameraName: FBX node name (must match UE5 CineCameraActor, default "nDisplay_CAM")
 * - outputFps: target frame rate, or 'source' to match input rate
 * - fpsMode: 'source' | 'drop' | 'resample' | 'slowmo'
 * - dropOffset: for drop mode, which phase to pick (0..step-1)
 * - sourceRate: detected Hz from XML (passed per-file from main process)
 * - scale: unit conversion (default 100 = meters→cm for UE5)
 * - channels: enableTranslation, enableRotation, enableFov, enableFocus
 * - axisMapping / rotMapping: configurable axis remapping
 */

function generateFBX(data, outputPath, settings = {}) {
  const cameraName = settings.cameraName || 'nDisplay_CAM';
  const scale = settings.scale || 100;
  const sourceRate = settings.sourceRate || data.header.frameRate || 100;
  const preRotation = settings.preRotation || { x: 0, y: 0, z: 0 };
  const originTranslation = settings.originTranslation || { x: 0, y: 0, z: 0 };
  const originRotation = settings.originRotation || { x: 0, y: 0, z: 0 };
  const originScale = settings.originScale || { x: 1, y: 1, z: 1 };

  // Determine output FPS
  const fpsMode = settings.fpsMode || 'source';
  let outputFps;
  if (fpsMode === 'source' || settings.outputFps === 'source') {
    outputFps = sourceRate;
  } else {
    outputFps = parseFloat(settings.outputFps) || 25;
  }

  // Axis mapping
  const axisMap = settings.axisMapping || { fbxX: 'x', fbxY: 'y', fbxZ: 'z' };
  const rotMap = settings.rotMapping || { fbxRotX: 'tilt', fbxRotY: 'pan', fbxRotZ: 'roll' };
  const axisSign = settings.axisSign || { fbxX: 1, fbxY: 1, fbxZ: 1 };
  const rotSign = settings.rotSign || { fbxRotX: 1, fbxRotY: 1, fbxRotZ: 1 };

  // Channels
  const enableTranslation = settings.enableTranslation !== false;
  const enableRotation = settings.enableRotation !== false;
  const enableFov = settings.enableFov !== false;
  const enableFocus = settings.enableFocus === true;

  // --- Build output frames based on mode ---
  let frames;
  switch (fpsMode) {
    case 'drop':
      frames = dropFrames(data.samples, sourceRate, outputFps, settings.dropOffset || 0);
      break;
    case 'resample':
      frames = resampleData(data.samples, sourceRate, outputFps);
      break;
    case 'slowmo':
      // 1:1 mapping: every sample becomes a frame at the output fps
      frames = data.samples.map((s, i) => ({ ...s, frameIndex: i }));
      break;
    case 'source':
    default:
      // All samples, 1:1, at source rate
      frames = data.samples.map((s, i) => ({ ...s, frameIndex: i }));
      break;
  }

  const totalFrames = frames.length;
  if (totalFrames === 0) throw new Error('No frames to export');
  const lastFrame = totalFrames - 1;

  // Sensor width for focal length calculation
  const sensorWidthMM = frames[0].paWidth || 34.199;
  const filmWidthInches = sensorWidthMM / 25.4;
  const filmHeightInches = filmWidthInches / (frames[0].aspectRatio || 1.7778);

  // Build value arrays
  const posX = [], posY = [], posZ = [];
  const rotX = [], rotY = [], rotZ = [];
  const fovArr = [], focusArr = [];

  // Precompute origin rotation matrix (Euler XYZ degrees → 3x3)
  const oRotMatrix = eulerToMatrix(originRotation.x, originRotation.y, originRotation.z);

  for (const f of frames) {
    let mapped = mapAxes(f, axisMap, axisSign, scale);
    let mappedRot = mapRotation(f, rotMap, rotSign);

    // Apply origin transforms: scale → rotate → translate (on the mapped position)
    // 1. Scale
    mapped.x *= originScale.x;
    mapped.y *= originScale.y;
    mapped.z *= originScale.z;
    // 2. Rotate position by origin rotation
    const rp = mat3MulVec(oRotMatrix, mapped.x, mapped.y, mapped.z);
    mapped.x = rp[0]; mapped.y = rp[1]; mapped.z = rp[2];
    // 3. Translate (origin translation is in source units, apply scale)
    mapped.x += originTranslation.x * scale;
    mapped.y += originTranslation.y * scale;
    mapped.z += originTranslation.z * scale;

    // Apply origin rotation to camera orientation (compose Euler rotations)
    if (originRotation.x !== 0 || originRotation.y !== 0 || originRotation.z !== 0) {
      const composed = composeEulerXYZ(originRotation, mappedRot);
      mappedRot = composed;
    }
    // Apply origin scale sign to rotations (mirroring flips rotation sign)
    if (originScale.x < 0) { mappedRot.y = -mappedRot.y; mappedRot.z = -mappedRot.z; }
    if (originScale.y < 0) { mappedRot.x = -mappedRot.x; mappedRot.z = -mappedRot.z; }
    if (originScale.z < 0) { mappedRot.x = -mappedRot.x; mappedRot.y = -mappedRot.y; }

    posX.push(mapped.x);
    posY.push(mapped.y);
    posZ.push(mapped.z);
    rotX.push(mappedRot.x);
    rotY.push(mappedRot.y);
    rotZ.push(mappedRot.z);

    const hfovRad = (f.fovX || 50) * Math.PI / 180;
    const focalLength = (sensorWidthMM / 2) / Math.tan(hfovRad / 2);
    fovArr.push(focalLength);
    focusArr.push((f.focus || 0.5) * 100);
  }

  // Generate unique IDs
  let nextId = 100000000;
  const uid = () => nextId++;

  const cameraAttrId = uid();
  const cameraNodeId = uid();
  const animStackId = uid();
  const animLayerId = uid();

  const curveNodes = [];
  const curves = [];
  const connections = [];

  connections.push(`  C: "OO",${cameraNodeId},0`);
  connections.push(`  C: "OO",${cameraAttrId},${cameraNodeId}`);
  connections.push(`  C: "OO",${animLayerId},${animStackId}`);

  if (enableTranslation) {
    const cnId = uid();
    const cxId = uid(), cyId = uid(), czId = uid();
    curveNodes.push(buildCurveNode(cnId, 'T', posX[0], posY[0], posZ[0]));
    curves.push(buildAnimCurve(cxId, 'dX', totalFrames, posX, outputFps));
    curves.push(buildAnimCurve(cyId, 'dY', totalFrames, posY, outputFps));
    curves.push(buildAnimCurve(czId, 'dZ', totalFrames, posZ, outputFps));
    connections.push(`  C: "OO",${cnId},${animLayerId}`);
    connections.push(`  C: "OP",${cnId},${cameraNodeId},"Lcl Translation"`);
    connections.push(`  C: "OP",${cxId},${cnId},"d|X"`);
    connections.push(`  C: "OP",${cyId},${cnId},"d|Y"`);
    connections.push(`  C: "OP",${czId},${cnId},"d|Z"`);
  }

  if (enableRotation) {
    const cnId = uid();
    const cxId = uid(), cyId = uid(), czId = uid();
    curveNodes.push(buildCurveNode(cnId, 'R', rotX[0], rotY[0], rotZ[0]));
    curves.push(buildAnimCurve(cxId, 'dX', totalFrames, rotX, outputFps));
    curves.push(buildAnimCurve(cyId, 'dY', totalFrames, rotY, outputFps));
    curves.push(buildAnimCurve(czId, 'dZ', totalFrames, rotZ, outputFps));
    connections.push(`  C: "OO",${cnId},${animLayerId}`);
    connections.push(`  C: "OP",${cnId},${cameraNodeId},"Lcl Rotation"`);
    connections.push(`  C: "OP",${cxId},${cnId},"d|X"`);
    connections.push(`  C: "OP",${cyId},${cnId},"d|Y"`);
    connections.push(`  C: "OP",${czId},${cnId},"d|Z"`);
  }

  if (enableFov) {
    const cnId = uid();
    const cId = uid();
    curveNodes.push(buildSingleCurveNode(cnId, 'FocalLength', fovArr[0]));
    curves.push(buildAnimCurve(cId, 'dFocalLength', totalFrames, fovArr, outputFps));
    connections.push(`  C: "OO",${cnId},${animLayerId}`);
    connections.push(`  C: "OP",${cnId},${cameraAttrId},"FocalLength"`);
    connections.push(`  C: "OP",${cId},${cnId},"d|FocalLength"`);
  }

  if (enableFocus) {
    const cnId = uid();
    const cId = uid();
    curveNodes.push(buildSingleCurveNode(cnId, 'FocusDistance', focusArr[0]));
    curves.push(buildAnimCurve(cId, 'dFocusDistance', totalFrames, focusArr, outputFps));
    connections.push(`  C: "OO",${cnId},${animLayerId}`);
    connections.push(`  C: "OP",${cnId},${cameraAttrId},"FocusDistance"`);
    connections.push(`  C: "OP",${cId},${cnId},"d|FocusDistance"`);
  }

  const fbx = buildFBXDocument({
    cameraName,
    preRotation,
    fps: outputFps,
    lastFrame,
    filmWidthInches,
    filmHeightInches,
    focalLength: fovArr[0],
    cameraAttrId,
    cameraNodeId,
    animStackId,
    animLayerId,
    curveNodes,
    curves,
    connections,
  });

  fs.writeFileSync(outputPath, fbx, 'utf-8');

  return { frameCount: totalFrames, outputFps: outputFps };
}

// === Frame Rate Conversion Functions ===

/**
 * Drop frames: pick every `step`-th sample, starting at `offset`.
 * Preserves real-time duration.
 */
function dropFrames(samples, sourceRate, outputFps, offset) {
  const step = Math.max(1, Math.round(sourceRate / outputFps));
  const clampedOffset = Math.min(offset, step - 1);
  const result = [];
  let frameIdx = 0;
  for (let i = clampedOffset; i < samples.length; i += step) {
    result.push({ ...samples[i], frameIndex: frameIdx++ });
  }
  return result;
}

/**
 * Resample: linear interpolation to exact output frame timestamps.
 * Preserves real-time duration.
 */
function resampleData(samples, sourceRate, outputFps) {
  if (samples.length === 0) return [];

  const t0 = samples[0].time;
  const tEnd = samples[samples.length - 1].time;
  const duration = tEnd - t0;
  const totalFrames = Math.max(1, Math.round(duration * outputFps) + 1);
  const result = [];

  const numericKeys = ['x', 'y', 'z', 'pan', 'tilt', 'roll', 'fovX', 'aspectRatio',
    'focus', 'zoom', 'k1', 'k2', 'centerX', 'centerY', 'paWidth'];

  let srcIdx = 0;

  for (let f = 0; f < totalFrames; f++) {
    const targetTime = t0 + (f / outputFps);

    while (srcIdx < samples.length - 1 && samples[srcIdx + 1].time <= targetTime) {
      srcIdx++;
    }

    if (srcIdx >= samples.length - 1) {
      result.push({ ...samples[samples.length - 1], frameIndex: f });
      continue;
    }

    const s0 = samples[srcIdx];
    const s1 = samples[srcIdx + 1];
    const dt = s1.time - s0.time;
    const alpha = dt > 0 ? (targetTime - s0.time) / dt : 0;

    const interpolated = { frameIndex: f };
    for (const key of numericKeys) {
      interpolated[key] = (s0[key] || 0) + ((s1[key] || 0) - (s0[key] || 0)) * alpha;
    }
    result.push(interpolated);
  }
  return result;
}

// === FBX Building Functions ===

function mapAxes(sample, axisMap, axisSign, scale) {
  const get = (key) => sample[key.replace('-', '')] || 0;
  return {
    x: get(axisMap.fbxX) * (axisSign.fbxX || 1) * scale,
    y: get(axisMap.fbxY) * (axisSign.fbxY || 1) * scale,
    z: get(axisMap.fbxZ) * (axisSign.fbxZ || 1) * scale,
  };
}

function mapRotation(sample, rotMap, rotSign) {
  const get = (key) => sample[key] || 0;
  return {
    x: get(rotMap.fbxRotX) * (rotSign.fbxRotX || 1),
    y: get(rotMap.fbxRotY) * (rotSign.fbxRotY || 1),
    z: get(rotMap.fbxRotZ) * (rotSign.fbxRotZ || 1),
  };
}

function buildCurveNode(id, label, dx, dy, dz) {
  return `  AnimationCurveNode: ${id}, "AnimCurveNode::${label}", "" {
    Properties70:  {
      P: "d|X", "Number", "", "A",${dx}
      P: "d|Y", "Number", "", "A",${dy}
      P: "d|Z", "Number", "", "A",${dz}
    }
  }`;
}

function buildSingleCurveNode(id, propName, val) {
  return `  AnimationCurveNode: ${id}, "AnimCurveNode::${propName}", "" {
    Properties70:  {
      P: "d|${propName}", "Number", "", "A",${val}
    }
  }`;
}

function buildAnimCurve(id, label, frameCount, values, fps) {
  const n = frameCount;
  const FBX_TIME_PER_SECOND = 46186158000;
  const timePerFrame = Math.round(FBX_TIME_PER_SECOND / fps);

  const times = [];
  const vals = [];
  for (let i = 0; i < n; i++) {
    times.push(i * timePerFrame);
    vals.push(values[i]);
  }

  return `  AnimationCurve: ${id}, "AnimCurve::${label}", "" {
    Default: ${vals[0]}
    KeyVer: 4009
    KeyTime: *${n} {
      a: ${times.join(',')}
    }
    KeyValueFloat: *${n} {
      a: ${vals.map(v => v.toFixed(6)).join(',')}
    }
    KeyAttrFlags: *1 {
      a: 24840
    }
    KeyAttrDataFloat: *4 {
      a: 0,0,4.185602e+09,0
    }
    KeyAttrRefCount: *1 {
      a: ${n}
    }
  }`;
}

function buildFBXDocument(opts) {
  const {
    cameraName, preRotation,
    fps, lastFrame, filmWidthInches, filmHeightInches, focalLength,
    cameraAttrId, cameraNodeId, animStackId, animLayerId,
    curveNodes, curves, connections,
  } = opts;
  const preRot = preRotation || { x: 0, y: 0, z: 0 };

  const FBX_TIME_PER_SECOND = 46186158000;
  const timePerFrame = Math.round(FBX_TIME_PER_SECOND / fps);
  const animStartTime = 0;
  const animEndTime = lastFrame * timePerFrame;
  const totalObjects = 4 + curveNodes.length + curves.length;

  let timeMode = 0;
  if (fps === 24) timeMode = 1;
  else if (fps === 25) timeMode = 3;
  else if (fps === 30) timeMode = 6;
  else if (fps === 50) timeMode = 10;
  else if (fps === 60) timeMode = 11;
  else timeMode = 14; // custom

  const safeName = cameraName.replace(/"/g, '');

  return `; FBX 7.4.0 project file
; Created by STYPE-to-FBX Converter for Unreal Engine 5
; Camera: ${safeName} | FPS: ${fps} | Frames: ${lastFrame + 1}
; ---
FBXHeaderExtension:  {
  FBXHeaderVersion: 1003
  FBXVersion: 7400
  CreationTimeStamp:  {
    Version: 1000
    Year: ${new Date().getFullYear()}
    Month: ${new Date().getMonth() + 1}
    Day: ${new Date().getDate()}
    Hour: ${new Date().getHours()}
    Minute: ${new Date().getMinutes()}
    Second: ${new Date().getSeconds()}
    Millisecond: 0
  }
  Creator: "STYPE-to-FBX Converter 1.0"
  SceneInfo: "SceneInfo::GlobalInfo", "UserData" {
    Type: "UserData"
    Version: 100
    MetaData:  {
      Version: 100
      Title: "STYPE Camera Tracking"
      Subject: ""
      Author: "STYPE-to-FBX Converter"
      Keywords: ""
      Revision: ""
      Comment: ""
    }
  }
}

GlobalSettings:  {
  Version: 1000
  Properties70:  {
    P: "UpAxis", "int", "Integer", "",1
    P: "UpAxisSign", "int", "Integer", "",1
    P: "FrontAxis", "int", "Integer", "",2
    P: "FrontAxisSign", "int", "Integer", "",1
    P: "CoordAxis", "int", "Integer", "",0
    P: "CoordAxisSign", "int", "Integer", "",1
    P: "OriginalUpAxis", "int", "Integer", "",1
    P: "OriginalUpAxisSign", "int", "Integer", "",1
    P: "UnitScaleFactor", "double", "Number", "",1
    P: "OriginalUnitScaleFactor", "double", "Number", "",1
    P: "AmbientColor", "ColorRGB", "Color", "",0,0,0
    P: "DefaultCamera", "KString", "", "", "Producer Perspective"
    P: "TimeMode", "enum", "", "",${timeMode}
    P: "TimeSpanStart", "KTime", "Time", "",${animStartTime}
    P: "TimeSpanStop", "KTime", "Time", "",${animEndTime}
    P: "CustomFrameRate", "double", "Number", "",${fps}
  }
}

Documents:  {
  Count: 1
  Document: 1000000000, "Scene", "Scene" {
    Properties70:  {
      P: "SourceObject", "object", "", ""
      P: "ActiveAnimStackName", "KString", "", "", "Take 001"
    }
    RootNode: 0
  }
}

References:  {
}

Definitions:  {
  Version: 100
  Count: ${totalObjects}
  ObjectType: "NodeAttribute" {
    Count: 1
    PropertyTemplate: "FbxCamera" {
      Properties70:  {
        P: "Color", "ColorRGB", "Color", "",0.8,0.8,0.8
        P: "Position", "Vector", "", "A",0,0,-50
        P: "UpVector", "Vector", "", "A",0,1,0
        P: "InterestPosition", "Vector", "", "A",0,0,0
        P: "Roll", "double", "Number", "",0
        P: "NearPlane", "double", "Number", "",10
        P: "FarPlane", "double", "Number", "",400000
        P: "FilmWidth", "double", "Number", "",${filmWidthInches.toFixed(6)}
        P: "FilmHeight", "double", "Number", "",${filmHeightInches.toFixed(6)}
        P: "FilmAspectRatio", "double", "Number", "",${(filmWidthInches / filmHeightInches).toFixed(6)}
        P: "ApertureMode", "enum", "", "",2
        P: "GateFit", "enum", "", "",2
        P: "FocalLength", "double", "Number", "",${focalLength.toFixed(6)}
        P: "CameraFormat", "enum", "", "",0
        P: "AspectW", "double", "Number", "",320
        P: "AspectH", "double", "Number", "",200
        P: "FieldOfView", "double", "Number", "",25.115
        P: "FieldOfViewX", "double", "Number", "",40
        P: "FieldOfViewY", "double", "Number", "",40
      }
    }
  }
  ObjectType: "Model" {
    Count: 1
    PropertyTemplate: "FbxNode" {
      Properties70:  {
        P: "QuaternionInterpolate", "enum", "", "",0
        P: "RotationOffset", "Vector3D", "Vector", "",0,0,0
        P: "RotationPivot", "Vector3D", "Vector", "",0,0,0
        P: "ScalingOffset", "Vector3D", "Vector", "",0,0,0
        P: "ScalingPivot", "Vector3D", "Vector", "",0,0,0
        P: "TranslationActive", "bool", "", "",0
        P: "TranslationMin", "Vector3D", "Vector", "",0,0,0
        P: "TranslationMax", "Vector3D", "Vector", "",0,0,0
        P: "TranslationMinX", "bool", "", "",0
        P: "TranslationMinY", "bool", "", "",0
        P: "TranslationMinZ", "bool", "", "",0
        P: "TranslationMaxX", "bool", "", "",0
        P: "TranslationMaxY", "bool", "", "",0
        P: "TranslationMaxZ", "bool", "", "",0
        P: "RotationOrder", "enum", "", "",0
        P: "RotationSpaceForLimitOnly", "bool", "", "",0
        P: "RotationStiffnessX", "double", "Number", "",0
        P: "RotationStiffnessY", "double", "Number", "",0
        P: "RotationStiffnessZ", "double", "Number", "",0
        P: "AxisLen", "double", "Number", "",10
        P: "PreRotation", "Vector3D", "Vector", "",0,0,0
        P: "PostRotation", "Vector3D", "Vector", "",0,0,0
        P: "RotationActive", "bool", "", "",0
        P: "RotationMin", "Vector3D", "Vector", "",0,0,0
        P: "RotationMax", "Vector3D", "Vector", "",0,0,0
        P: "RotationMinX", "bool", "", "",0
        P: "RotationMinY", "bool", "", "",0
        P: "RotationMinZ", "bool", "", "",0
        P: "RotationMaxX", "bool", "", "",0
        P: "RotationMaxY", "bool", "", "",0
        P: "RotationMaxZ", "bool", "", "",0
        P: "InheritType", "enum", "", "",0
        P: "ScalingActive", "bool", "", "",0
        P: "ScalingMin", "Vector3D", "Vector", "",0,0,0
        P: "ScalingMax", "Vector3D", "Vector", "",1,1,1
        P: "ScalingMinX", "bool", "", "",0
        P: "ScalingMinY", "bool", "", "",0
        P: "ScalingMinZ", "bool", "", "",0
        P: "ScalingMaxX", "bool", "", "",0
        P: "ScalingMaxY", "bool", "", "",0
        P: "ScalingMaxZ", "bool", "", "",0
        P: "GeometricTranslation", "Vector3D", "Vector", "",0,0,0
        P: "GeometricRotation", "Vector3D", "Vector", "",0,0,0
        P: "GeometricScaling", "Vector3D", "Vector", "",1,1,1
        P: "MinDampRangeX", "double", "Number", "",0
        P: "MinDampRangeY", "double", "Number", "",0
        P: "MinDampRangeZ", "double", "Number", "",0
        P: "MaxDampRangeX", "double", "Number", "",0
        P: "MaxDampRangeY", "double", "Number", "",0
        P: "MaxDampRangeZ", "double", "Number", "",0
        P: "MinDampStrengthX", "double", "Number", "",0
        P: "MinDampStrengthY", "double", "Number", "",0
        P: "MinDampStrengthZ", "double", "Number", "",0
        P: "MaxDampStrengthX", "double", "Number", "",0
        P: "MaxDampStrengthY", "double", "Number", "",0
        P: "MaxDampStrengthZ", "double", "Number", "",0
        P: "PreferedAngleX", "double", "Number", "",0
        P: "PreferedAngleY", "double", "Number", "",0
        P: "PreferedAngleZ", "double", "Number", "",0
        P: "LookAtProperty", "object", "", ""
        P: "UpVectorProperty", "object", "", ""
        P: "Show", "bool", "", "",1
        P: "NegativePercentShapeSupport", "bool", "", "",1
        P: "DefaultAttributeIndex", "int", "Integer", "",0
        P: "Freeze", "bool", "", "",0
        P: "LODBox", "bool", "", "",0
        P: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
        P: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0
        P: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
        P: "Visibility", "Visibility", "", "A",1
        P: "Visibility Inheritance", "Visibility Inheritance", "", "",1
      }
    }
  }
  ObjectType: "AnimationStack" {
    Count: 1
    PropertyTemplate: "FbxAnimStack" {
      Properties70:  {
        P: "Description", "KString", "", "", ""
        P: "LocalStart", "KTime", "Time", "",0
        P: "LocalStop", "KTime", "Time", "",0
        P: "ReferenceStart", "KTime", "Time", "",0
        P: "ReferenceStop", "KTime", "Time", "",0
      }
    }
  }
  ObjectType: "AnimationLayer" {
    Count: 1
    PropertyTemplate: "FbxAnimLayer" {
      Properties70:  {
        P: "Weight", "double", "Number", "",100
        P: "Mute", "bool", "", "",0
        P: "Solo", "bool", "", "",0
        P: "Lock", "bool", "", "",0
        P: "Color", "ColorRGB", "Color", "",0.8,0.8,0.8
      }
    }
  }
  ObjectType: "AnimationCurveNode" {
    Count: ${curveNodes.length}
  }
  ObjectType: "AnimationCurve" {
    Count: ${curves.length}
  }
}

Objects:  {
  NodeAttribute: ${cameraAttrId}, "NodeAttribute::${safeName}", "Camera" {
    Properties70:  {
      P: "FilmWidth", "double", "Number", "",${filmWidthInches.toFixed(6)}
      P: "FilmHeight", "double", "Number", "",${filmHeightInches.toFixed(6)}
      P: "FilmAspectRatio", "double", "Number", "",${(filmWidthInches / filmHeightInches).toFixed(6)}
      P: "ApertureMode", "enum", "", "",2
      P: "GateFit", "enum", "", "",2
      P: "FocalLength", "Number", "", "A",${focalLength.toFixed(6)}
      P: "NearPlane", "double", "Number", "",10
      P: "FarPlane", "double", "Number", "",400000
    }
    TypeFlags: "Camera"
    GeometryVersion: 124
    Position: 0,0,0
    Up: 0,1,0
    LookAt: 0,0,-1
    ShowInfoOnMoving: 1
    ShowAudio: 0
    AudioColor: 0,1,0
    CameraOrthoZoom: 1
  }

  Model: ${cameraNodeId}, "Model::${safeName}", "Camera" {
    Version: 232
    Properties70:  {
      P: "PreRotation", "Vector3D", "Vector", "",${preRot.x},${preRot.y},${preRot.z}
      P: "RotationActive", "bool", "", "",1
      P: "RotationOrder", "enum", "", "",0
      P: "InheritType", "enum", "", "",1
      P: "ScalingMax", "Vector3D", "Vector", "",0,0,0
      P: "DefaultAttributeIndex", "int", "Integer", "",0
      P: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
      P: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0
      P: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
    }
    Shading: Y
    Culling: "CullingOff"
  }

  AnimationStack: ${animStackId}, "AnimStack::Take 001", "" {
    Properties70:  {
      P: "LocalStart", "KTime", "Time", "",${animStartTime}
      P: "LocalStop", "KTime", "Time", "",${animEndTime}
      P: "ReferenceStart", "KTime", "Time", "",${animStartTime}
      P: "ReferenceStop", "KTime", "Time", "",${animEndTime}
    }
  }

  AnimationLayer: ${animLayerId}, "AnimLayer::BaseLayer", "" {
  }

${curveNodes.join('\n\n')}

${curves.join('\n\n')}
}

Connections:  {
${connections.join('\n')}
}

Takes:  {
  Current: "Take 001"
  Take: "Take 001" {
    FileName: "Take_001.tak"
    LocalTime: ${animStartTime},${animEndTime}
    ReferenceTime: ${animStartTime},${animEndTime}
  }
}
`;
}

// === Math helpers for origin transforms ===

/** Convert Euler XYZ (degrees) to 3x3 rotation matrix (row-major flat array[9]) */
function eulerToMatrix(xDeg, yDeg, zDeg) {
  const d2r = Math.PI / 180;
  const cx = Math.cos(xDeg * d2r), sx = Math.sin(xDeg * d2r);
  const cy = Math.cos(yDeg * d2r), sy = Math.sin(yDeg * d2r);
  const cz = Math.cos(zDeg * d2r), sz = Math.sin(zDeg * d2r);
  // Rz * Ry * Rx (extrinsic XYZ = intrinsic ZYX)
  return [
    cy * cz, cz * sx * sy - cx * sz, cx * cz * sy + sx * sz,
    cy * sz, cx * cz + sx * sy * sz, cx * sy * sz - cz * sx,
    -sy, cy * sx, cx * cy,
  ];
}

/** Multiply 3x3 matrix (flat[9]) by vector (x,y,z), return [x,y,z] */
function mat3MulVec(m, x, y, z) {
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ];
}

/** Compose two Euler XYZ rotations (degrees): result = a then b */
function composeEulerXYZ(a, b) {
  const ma = eulerToMatrix(a.x, a.y, a.z);
  const mb = eulerToMatrix(b.x, b.y, b.z);
  // mc = mb * ma (apply a first, then b — but for origin rotation applied to camera, it's ma * mb)
  // Origin rotation transforms the world, so camera rotation in new frame = originRot * cameraRot
  const mc = mat3Mul(ma, mb);
  return matrixToEulerXYZ(mc);
}

/** Multiply two 3x3 matrices (flat[9]) */
function mat3Mul(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r;
}

/** Extract Euler XYZ (degrees) from 3x3 rotation matrix */
function matrixToEulerXYZ(m) {
  const sy = -m[6];
  const cy = Math.sqrt(m[0] * m[0] + m[3] * m[3]);
  let x, y, z;
  if (cy > 1e-6) {
    x = Math.atan2(m[7], m[8]);
    y = Math.atan2(sy, cy);
    z = Math.atan2(m[3], m[0]);
  } else {
    x = Math.atan2(-m[5], m[4]);
    y = Math.atan2(sy, cy);
    z = 0;
  }
  const r2d = 180 / Math.PI;
  return { x: x * r2d, y: y * r2d, z: z * r2d };
}

module.exports = { generateFBX };
