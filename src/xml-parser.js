const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

/**
 * Parse an STYPE HF camera tracking XML file.
 *
 * STYPE HF XML structure:
 *   <Stype_HF>
 *     <Header_Stype_HF>
 *       <Date>ISO timestamp</Date>
 *       <Port>6301</Port>
 *       <Protocol>Stype HF</Protocol>
 *       <Frame_rate>100 frames/s</Frame_rate>
 *     </Header_Stype_HF>
 *     <Data_sample> (repeated)
 *       <Index>sequential</Index>
 *       <Time>PT{seconds}S</Time>
 *       <Frame>timecode frame</Frame>
 *       <Sec/Min/Hours>timecode</Sec/Min/Hours>
 *       <X_Value>meters (comma decimal)</X_Value>
 *       <Y_Value>meters</Y_Value>
 *       <Z_Value>meters</Z_Value>
 *       <Pan>degrees</Pan>
 *       <Tilt>degrees</Tilt>
 *       <Roll>degrees</Roll>
 *       <FovX>degrees</FovX>
 *       <Aspect_Ratio>float</Aspect_Ratio>
 *       <Focus>float</Focus>
 *       <Zoom>float</Zoom>
 *       <k1>distortion mm^-2</k1>
 *       <k2>distortion mm^-4</k2>
 *       <Center-X>mm</Center-X>
 *       <Center-Y>mm</Center-Y>
 *       <PA_width>mm (sensor width)</PA_width>
 *     </Data_sample>
 *   </Stype_HF>
 */
function parseStypeXML(filePath) {
  const xml = fs.readFileSync(filePath, 'utf-8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false, // keep as strings so we handle comma decimals
  });
  const doc = parser.parse(xml);

  const root = doc.Stype_HF;
  if (!root) throw new Error('Not a valid STYPE HF XML file');

  const hdr = root.Header_Stype_HF || {};

  // Parse frame rate from "100 frames/s" format
  const frStr = hdr.Frame_rate || '100 frames/s';
  const stypeRate = parseFloat(frStr);

  const header = {
    date: hdr.Date || '',
    port: hdr.Port || '',
    protocol: hdr.Protocol || '',
    frameRate: stypeRate, // STYPE sampling rate (usually 100 Hz)
  };

  // Ensure Data_sample is always an array
  let rawSamples = root.Data_sample;
  if (!rawSamples) throw new Error('No data samples found');
  if (!Array.isArray(rawSamples)) rawSamples = [rawSamples];

  const samples = rawSamples.map((s) => ({
    index: parseInt(s.Index, 10),
    time: parseISODuration(s.Time),
    frame: parseInt(s.Frame, 10),
    sec: parseInt(s.Sec, 10),
    min: parseInt(s.Min, 10),
    hours: parseInt(s.Hours, 10),
    x: parseEuropeanFloat(s.X_Value),
    y: parseEuropeanFloat(s.Y_Value),
    z: parseEuropeanFloat(s.Z_Value),
    pan: parseEuropeanFloat(s.Pan),
    tilt: parseEuropeanFloat(s.Tilt),
    roll: parseEuropeanFloat(s.Roll),
    fovX: parseEuropeanFloat(s.FovX),
    aspectRatio: parseEuropeanFloat(s.Aspect_Ratio),
    focus: parseEuropeanFloat(s.Focus),
    zoom: parseEuropeanFloat(s.Zoom),
    k1: parseEuropeanFloat(s.k1),
    k2: parseEuropeanFloat(s.k2),
    centerX: parseEuropeanFloat(s['Center-X']),
    centerY: parseEuropeanFloat(s['Center-Y']),
    paWidth: parseEuropeanFloat(s.PA_width),
  }));

  // Build timecode strings
  const first = samples[0];
  const last = samples[samples.length - 1];
  const timecodeStart = formatTC(first.hours, first.min, first.sec, first.frame);
  const timecodeEnd = formatTC(last.hours, last.min, last.sec, last.frame);
  const durationSec = last.time - first.time;

  // Available channels
  const channels = [
    'X_Value', 'Y_Value', 'Z_Value',
    'Pan', 'Tilt', 'Roll',
    'FovX', 'Aspect_Ratio',
    'Focus', 'Zoom',
    'k1', 'k2',
    'Center-X', 'Center-Y',
    'PA_width',
  ];

  return { header, samples, timecodeStart, timecodeEnd, durationSec, channels };
}

/** Parse European-style float: "4,2688 m" → 4.2688, "-2,3772 m" → -2.3772 */
function parseEuropeanFloat(str) {
  if (str == null) return 0;
  // Strip units (m, °, mm^-2, etc.) but preserve minus sign and digits/commas/dots
  const cleaned = String(str)
    .replace(/[a-zA-Z°^_\s]/g, '') // remove letters, degree sign, caret, underscore, whitespace
    .replace(/(?!^)-/g, '')         // remove minus signs that are NOT at the start
    .replace(',', '.');             // European decimal comma → dot
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

/** Parse ISO 8601 duration: "PT0.0076412S" → 0.0076412 (seconds) */
function parseISODuration(str) {
  if (!str) return 0;
  const m = String(str).match(/PT([\d.]+)S/);
  if (m) return parseFloat(m[1]);
  if (str === 'PT0S') return 0;
  return 0;
}

function formatTC(h, m, s, f) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

module.exports = { parseStypeXML };
