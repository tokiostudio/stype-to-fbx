// ============================================================
// STYPE → FBX Converter — Renderer
// ============================================================

// --- Constants ---
const STORAGE_KEY_PRESETS = 'stype-fbx-presets';
const STORAGE_KEY_LAST = 'stype-fbx-last';
const PRESET_VERSION = 5;

// Built-in presets (cannot be deleted)
const BUILTIN_PRESETS = [
  {
    name: 'STD2_v1',
    builtin: true,
    version: PRESET_VERSION,
    cameraName: 'nDisplay_CAM',
    preRotation: { x: 0, y: 0, z: 0 },
    scale: 100,
    outputFps: 'source',
    fpsMode: 'source',
    dropOffset: 0,
    enableTranslation: true,
    enableRotation: true,
    enableFov: true,
    enableFocus: false,
    axisMapping: { fbxX: 'z', fbxY: 'y', fbxZ: 'x' },
    axisSign: { fbxX: -1, fbxY: 1, fbxZ: 1 },
    rotMapping: { fbxRotX: 'roll', fbxRotY: 'pan', fbxRotZ: 'tilt' },
    rotSign: { fbxRotX: 1, fbxRotY: -1, fbxRotZ: 1 },
    originTranslation: { x: 0, y: 0, z: 0 },
    originRotation: { x: 0, y: 0, z: 0 },
    originScale: { x: 1, y: 1, z: 1 },
  },
];

// --- Elements ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const fileCount = document.getElementById('file-count');
const btnClear = document.getElementById('btn-clear');
const btnBrowse = document.getElementById('btn-browse');
const btnExport = document.getElementById('btn-export');
const outputPath = document.getElementById('output-path');
const progressArea = document.getElementById('progress-area');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const logEl = document.getElementById('log');
const outputFpsSelect = document.getElementById('output-fps');
const fpsModeGroup = document.getElementById('fps-mode-group');
const dropFrameOpts = document.getElementById('drop-frame-opts');
const dropOffset = document.getElementById('drop-offset');
const dropInfo = document.getElementById('drop-info');
const fpsInfo = document.getElementById('fps-info');

// Preset elements
const presetSelect = document.getElementById('preset-select');
const btnPresetSave = document.getElementById('btn-preset-save');
const btnPresetDelete = document.getElementById('btn-preset-delete');
const btnPresetExport = document.getElementById('btn-preset-export');
const btnPresetImport = document.getElementById('btn-preset-import');

let files = []; // { path, name, info, error }
let outputDir = '';

// ============================================================
// PRESET SYSTEM
// ============================================================

function getDefaultSettings() {
  return JSON.parse(JSON.stringify(BUILTIN_PRESETS[0]));
}

function getUserPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PRESETS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveUserPresets(presets) {
  localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(presets));
}

function getAllPresets() {
  return [...BUILTIN_PRESETS, ...getUserPresets()];
}

function refreshPresetDropdown(selectName) {
  const all = getAllPresets();
  presetSelect.innerHTML = '<option value="">— Select Preset —</option>';
  all.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = p.builtin ? `builtin:${i}` : `user:${p.name}`;
    opt.textContent = p.name + (p.builtin ? ' (built-in)' : '');
    if (p.name === selectName) opt.selected = true;
    presetSelect.appendChild(opt);
  });
  updateDeleteButton();
}

function updateDeleteButton() {
  const val = presetSelect.value;
  btnPresetDelete.style.display = (val && val.startsWith('user:')) ? 'inline-block' : 'none';
}

function applySettingsToUI(s) {
  // Camera
  document.getElementById('camera-name').value = s.cameraName || 'nDisplay_CAM';

  // PreRotation
  document.getElementById('prerot-x').value = s.preRotation?.x ?? 0;
  document.getElementById('prerot-y').value = s.preRotation?.y ?? 0;
  document.getElementById('prerot-z').value = s.preRotation?.z ?? 0;

  // Origin Transform
  document.getElementById('origin-tx').value = s.originTranslation?.x ?? 0;
  document.getElementById('origin-ty').value = s.originTranslation?.y ?? 0;
  document.getElementById('origin-tz').value = s.originTranslation?.z ?? 0;
  document.getElementById('origin-rx').value = s.originRotation?.x ?? 0;
  document.getElementById('origin-ry').value = s.originRotation?.y ?? 0;
  document.getElementById('origin-rz').value = s.originRotation?.z ?? 0;
  document.getElementById('origin-sx').value = s.originScale?.x ?? 1;
  document.getElementById('origin-sy').value = s.originScale?.y ?? 1;
  document.getElementById('origin-sz').value = s.originScale?.z ?? 1;

  // Scale
  document.getElementById('scale').value = s.scale ?? 100;

  // FPS
  const fpsVal = s.outputFps === 'source' ? 'source' : String(s.outputFps);
  outputFpsSelect.value = fpsVal;
  // If value doesn't exist in dropdown, fall back to source
  if (outputFpsSelect.value !== fpsVal) outputFpsSelect.value = 'source';

  // FPS Mode
  if (s.fpsMode && s.fpsMode !== 'source') {
    const radio = document.querySelector(`input[name="fps-mode"][value="${s.fpsMode}"]`);
    if (radio) radio.checked = true;
  }
  document.getElementById('drop-offset').value = s.dropOffset ?? 0;

  // Channels
  document.getElementById('ch-translation').checked = s.enableTranslation !== false;
  document.getElementById('ch-rotation').checked = s.enableRotation !== false;
  document.getElementById('ch-fov').checked = s.enableFov !== false;
  document.getElementById('ch-focus').checked = s.enableFocus === true;

  // Axis mapping
  if (s.axisMapping) {
    document.getElementById('ax-x').value = s.axisMapping.fbxX || 'x';
    document.getElementById('ax-y').value = s.axisMapping.fbxY || 'y';
    document.getElementById('ax-z').value = s.axisMapping.fbxZ || 'z';
  }
  if (s.axisSign) {
    document.getElementById('ax-x-sign').value = String(s.axisSign.fbxX ?? 1);
    document.getElementById('ax-y-sign').value = String(s.axisSign.fbxY ?? 1);
    document.getElementById('ax-z-sign').value = String(s.axisSign.fbxZ ?? 1);
  }

  // Rotation mapping
  if (s.rotMapping) {
    document.getElementById('rot-x').value = s.rotMapping.fbxRotX || 'tilt';
    document.getElementById('rot-y').value = s.rotMapping.fbxRotY || 'pan';
    document.getElementById('rot-z').value = s.rotMapping.fbxRotZ || 'roll';
  }
  if (s.rotSign) {
    document.getElementById('rot-x-sign').value = String(s.rotSign.fbxRotX ?? 1);
    document.getElementById('rot-y-sign').value = String(s.rotSign.fbxRotY ?? 1);
    document.getElementById('rot-z-sign').value = String(s.rotSign.fbxRotZ ?? 1);
  }

  updateFpsInfo();
}

function gatherSettings() {
  const isSourceMode = outputFpsSelect.value === 'source';
  const mode = isSourceMode ? 'source' : getSelectedMode();

  return {
    cameraName: document.getElementById('camera-name').value.trim() || 'nDisplay_CAM',
    outputFps: isSourceMode ? 'source' : parseFloat(outputFpsSelect.value),
    fpsMode: mode,
    dropOffset: parseInt(dropOffset.value) || 0,
    preRotation: {
      x: parseFloat(document.getElementById('prerot-x').value) || 0,
      y: parseFloat(document.getElementById('prerot-y').value) || 0,
      z: parseFloat(document.getElementById('prerot-z').value) || 0,
    },
    originTranslation: {
      x: parseFloat(document.getElementById('origin-tx').value) || 0,
      y: parseFloat(document.getElementById('origin-ty').value) || 0,
      z: parseFloat(document.getElementById('origin-tz').value) || 0,
    },
    originRotation: {
      x: parseFloat(document.getElementById('origin-rx').value) || 0,
      y: parseFloat(document.getElementById('origin-ry').value) || 0,
      z: parseFloat(document.getElementById('origin-rz').value) || 0,
    },
    originScale: {
      x: parseFloat(document.getElementById('origin-sx').value) || 1,
      y: parseFloat(document.getElementById('origin-sy').value) || 1,
      z: parseFloat(document.getElementById('origin-sz').value) || 1,
    },
    scale: parseFloat(document.getElementById('scale').value),
    enableTranslation: document.getElementById('ch-translation').checked,
    enableRotation: document.getElementById('ch-rotation').checked,
    enableFov: document.getElementById('ch-fov').checked,
    enableFocus: document.getElementById('ch-focus').checked,
    axisMapping: {
      fbxX: document.getElementById('ax-x').value,
      fbxY: document.getElementById('ax-y').value,
      fbxZ: document.getElementById('ax-z').value,
    },
    axisSign: {
      fbxX: parseInt(document.getElementById('ax-x-sign').value),
      fbxY: parseInt(document.getElementById('ax-y-sign').value),
      fbxZ: parseInt(document.getElementById('ax-z-sign').value),
    },
    rotMapping: {
      fbxRotX: document.getElementById('rot-x').value,
      fbxRotY: document.getElementById('rot-y').value,
      fbxRotZ: document.getElementById('rot-z').value,
    },
    rotSign: {
      fbxRotX: parseInt(document.getElementById('rot-x-sign').value),
      fbxRotY: parseInt(document.getElementById('rot-y-sign').value),
      fbxRotZ: parseInt(document.getElementById('rot-z-sign').value),
    },
  };
}

function saveLastSettings() {
  try {
    const s = gatherSettings();
    s.version = PRESET_VERSION;
    localStorage.setItem(STORAGE_KEY_LAST, JSON.stringify(s));
  } catch {}
}

function restoreLastSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LAST);
    if (raw) {
      const s = JSON.parse(raw);
      applySettingsToUI(s);
    }
  } catch {}
}

// --- Preset event handlers ---

presetSelect.addEventListener('change', () => {
  updateDeleteButton();
  const val = presetSelect.value;
  if (!val) return;

  const all = getAllPresets();
  let preset;
  if (val.startsWith('builtin:')) {
    preset = BUILTIN_PRESETS[parseInt(val.split(':')[1])];
  } else if (val.startsWith('user:')) {
    const name = val.substring(5);
    preset = getUserPresets().find(p => p.name === name);
  }
  if (preset) applySettingsToUI(preset);
});

btnPresetSave.addEventListener('click', () => {
  const name = prompt('Preset name:');
  if (!name || !name.trim()) return;
  const trimmed = name.trim();

  // Don't allow overwriting builtins
  if (BUILTIN_PRESETS.some(p => p.name === trimmed)) {
    alert('Cannot overwrite a built-in preset. Choose a different name.');
    return;
  }

  const settings = gatherSettings();
  settings.name = trimmed;
  settings.version = PRESET_VERSION;

  const userPresets = getUserPresets();
  const existingIdx = userPresets.findIndex(p => p.name === trimmed);
  if (existingIdx >= 0) {
    userPresets[existingIdx] = settings;
  } else {
    userPresets.push(settings);
  }
  saveUserPresets(userPresets);
  refreshPresetDropdown(trimmed);
  log(`Preset "${trimmed}" saved`, 'ok');
});

btnPresetDelete.addEventListener('click', () => {
  const val = presetSelect.value;
  if (!val.startsWith('user:')) return;
  const name = val.substring(5);
  if (!confirm(`Delete preset "${name}"?`)) return;

  const userPresets = getUserPresets().filter(p => p.name !== name);
  saveUserPresets(userPresets);
  refreshPresetDropdown('');
  log(`Preset "${name}" deleted`, 'info');
});

btnPresetExport.addEventListener('click', async () => {
  const settings = gatherSettings();
  settings.version = PRESET_VERSION;
  settings.name = settings.name || 'Exported Preset';
  const json = JSON.stringify(settings, null, 2);
  const result = await window.api.savePresetFile(json);
  if (result.success) {
    log(`Preset exported to ${result.filePath}`, 'ok');
  }
});

btnPresetImport.addEventListener('click', async () => {
  const result = await window.api.loadPresetFile();
  if (!result.success) return;
  try {
    const settings = JSON.parse(result.content);
    applySettingsToUI(settings);
    log(`Preset imported from ${result.filePath}`, 'ok');

    // Optionally save to user presets
    if (settings.name) {
      const userPresets = getUserPresets();
      const existingIdx = userPresets.findIndex(p => p.name === settings.name);
      if (existingIdx >= 0) {
        userPresets[existingIdx] = settings;
      } else {
        userPresets.push(settings);
      }
      saveUserPresets(userPresets);
      refreshPresetDropdown(settings.name);
    }
  } catch (err) {
    log(`Failed to parse preset: ${err.message}`, 'err');
  }
});

// ============================================================
// FILE HANDLING
// ============================================================

// --- Drop Zone ---
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  addFiles(Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.xml')));
});
fileInput.addEventListener('change', () => {
  addFiles(Array.from(fileInput.files));
  fileInput.value = '';
});

async function addFiles(newFiles) {
  for (const f of newFiles) {
    let filePath;
    try { filePath = window.api.getFilePath(f); } catch (err) { /* fallback */ }
    if (!filePath) filePath = f.path;
    if (!filePath) {
      files.push({ path: null, name: f.name, info: null, error: 'Cannot read native file path' });
      renderFileList(); continue;
    }
    if (files.some(x => x.path === filePath)) continue;

    const entry = { path: filePath, name: f.name, info: null, error: null };
    files.push(entry);
    try {
      const result = await window.api.parseXmlInfo(filePath);
      entry.info = result.success ? result.info : null;
      entry.error = result.success ? null : result.error;
    } catch (err) { entry.error = err.message; }
  }
  renderFileList();
  updateButtons();
  updateFpsInfo();
}

function renderFileList() {
  fileList.innerHTML = '';
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const div = document.createElement('div');
    div.className = 'file-item ' + (f.error ? 'status-err' : 'status-ok');

    let meta = '';
    if (f.info) {
      const rate = f.info.frameRate || '?';
      meta = `${f.info.sampleCount} samples · ${rate}Hz · ${f.info.durationSec.toFixed(1)}s · TC ${f.info.timecodeStart}`;
    } else if (f.error) {
      meta = f.error;
    }

    div.innerHTML = `
      <span class="file-name">${f.name}</span>
      <span class="file-meta">${meta}</span>
      <button class="file-remove" data-idx="${i}">&times;</button>
    `;
    fileList.appendChild(div);
  }
  fileList.querySelectorAll('.file-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      files.splice(parseInt(e.target.dataset.idx), 1);
      renderFileList();
      updateButtons();
      updateFpsInfo();
    });
  });
  fileCount.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
}

function updateButtons() {
  const hasFiles = files.some(f => f.info);
  btnClear.disabled = files.length === 0;
  btnExport.disabled = !hasFiles || !outputDir;
}

btnClear.addEventListener('click', () => {
  files = [];
  renderFileList();
  updateButtons();
  updateFpsInfo();
});

// --- Output folder ---
btnBrowse.addEventListener('click', async () => {
  const dir = await window.api.selectOutputFolder();
  if (dir) { outputDir = dir; outputPath.value = dir; updateButtons(); }
});

// ============================================================
// FRAME RATE UI
// ============================================================

function getSourceRate() {
  const rates = files.filter(f => f.info).map(f => f.info.frameRate);
  if (rates.length === 0) return 100;
  const counts = {};
  rates.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
  return parseFloat(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
}

function getOutputFps() {
  const val = outputFpsSelect.value;
  return val === 'source' ? getSourceRate() : parseFloat(val);
}

function getSelectedMode() {
  const radio = document.querySelector('input[name="fps-mode"]:checked');
  return radio ? radio.value : 'drop';
}

function updateFpsInfo() {
  const sourceRate = getSourceRate();
  const outFps = getOutputFps();
  const isSourceMode = outputFpsSelect.value === 'source';
  const mode = getSelectedMode();

  fpsModeGroup.style.display = isSourceMode ? 'none' : 'flex';

  const showDrop = !isSourceMode && mode === 'drop';
  dropFrameOpts.style.display = showDrop ? 'block' : 'none';

  if (showDrop && sourceRate > 0 && outFps > 0) {
    const step = Math.round(sourceRate / outFps);
    const maxOffset = Math.max(0, step - 1);
    dropOffset.max = maxOffset;
    if (parseInt(dropOffset.value) > maxOffset) dropOffset.value = 0;
    dropInfo.textContent = `Every ${step}${step > 1 ? 'th' : 'st'} sample (step=${step}, max offset=${maxOffset})`;
  }

  if (files.some(f => f.info)) {
    let infoText = `Source: ${sourceRate}Hz`;
    if (isSourceMode) {
      infoText += ` → Output: ${sourceRate} fps (1:1, all samples)`;
    } else if (mode === 'drop') {
      const step = Math.max(1, Math.round(sourceRate / outFps));
      const kept = Math.ceil(files.filter(f=>f.info).reduce((max, f) => Math.max(max, f.info.sampleCount), 0) / step);
      infoText += ` → ${outFps} fps (drop, ~${kept} frames, real-time)`;
    } else if (mode === 'resample') {
      infoText += ` → ${outFps} fps (interpolated, real-time)`;
    } else {
      const samples = files.filter(f=>f.info).reduce((max, f) => Math.max(max, f.info.sampleCount), 0);
      const dur = (samples / outFps).toFixed(1);
      const ratio = (sourceRate / outFps).toFixed(1);
      infoText += ` → ${outFps} fps (slow motion ${ratio}x, ~${dur}s)`;
    }
    fpsInfo.textContent = infoText;
    fpsInfo.style.display = 'block';
  } else {
    fpsInfo.style.display = 'none';
  }
}

outputFpsSelect.addEventListener('change', updateFpsInfo);
document.querySelectorAll('input[name="fps-mode"]').forEach(r => r.addEventListener('change', updateFpsInfo));
dropOffset.addEventListener('input', updateFpsInfo);

// --- Collapsible sections ---
document.querySelectorAll('.collapsible-header').forEach(header => {
  header.addEventListener('click', () => {
    const body = document.getElementById(header.dataset.target);
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    header.classList.toggle('open', !isOpen);
  });
});

// ============================================================
// EXPORT
// ============================================================

btnExport.addEventListener('click', async () => {
  const validFiles = files.filter(f => f.info);
  if (validFiles.length === 0 || !outputDir) return;

  const settings = gatherSettings();

  // Auto-save last used settings
  saveLastSettings();

  progressArea.hidden = false;
  logEl.innerHTML = '';
  btnExport.disabled = true;

  let done = 0;
  for (const f of validFiles) {
    progressText.textContent = `Converting ${f.name}...`;
    progressFill.style.width = `${(done / validFiles.length) * 100}%`;

    try {
      const result = await window.api.convertToFbx({
        filePath: f.path,
        outputDir,
        settings: {
          ...settings,
          sourceRate: f.info.frameRate,
        },
      });
      if (result.success) {
        log(`${f.name} → ${result.outputFile} (${result.frameCount} frames @ ${result.outputFps} fps)`, 'ok');
      } else {
        log(`${f.name}: ${result.error}`, 'err');
      }
    } catch (err) {
      log(`${f.name}: ${err.message}`, 'err');
    }
    done++;
    progressFill.style.width = `${(done / validFiles.length) * 100}%`;
  }

  progressText.textContent = `Done! ${done} file(s) exported.`;
  btnExport.disabled = false;
});

function log(msg, type = 'info') {
  const div = document.createElement('div');
  div.className = `log-${type}`;
  div.textContent = msg;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  refreshPresetDropdown('');
  // If saved settings are from an older version, reset to Vanilla preset
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LAST);
    if (raw) {
      const saved = JSON.parse(raw);
      if (!saved.version || saved.version < PRESET_VERSION) {
        localStorage.removeItem(STORAGE_KEY_LAST);
        applySettingsToUI(BUILTIN_PRESETS[0]);
        return;
      }
    }
  } catch {}
  restoreLastSettings();
});
