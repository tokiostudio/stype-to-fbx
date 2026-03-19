const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { parseStypeXML } = require('./xml-parser');
const { generateFBX } = require('./fbx-writer');

// Tell Windows to associate our windows with the Squirrel shortcut's AppUserModelId.
// Without this, the taskbar shows the stub exe's default Electron icon instead of ours.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.squirrel.stype-to-fbx.stype-to-fbx');
}

// Handle Squirrel install/update/uninstall events on Windows.
// We check process.argv directly instead of relying on the return value of
// electron-squirrel-startup, because Vite's CJS bundling wraps the module
// export in an object — making it always truthy and killing the app on every launch.
if (process.platform === 'win32') {
  const squirrelCommand = process.argv[1];
  if (
    squirrelCommand === '--squirrel-install' ||
    squirrelCommand === '--squirrel-updated' ||
    squirrelCommand === '--squirrel-uninstall' ||
    squirrelCommand === '--squirrel-obsolete'
  ) {
    require('electron-squirrel-startup');
    return;
  }
}

let mainWindow;

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        ...(isMac ? [{ role: 'zoom' }] : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getAppIcon() {
  const ext = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const candidates = [
    path.join(process.resourcesPath, ext),          // production: extraResource copies here
    path.join(__dirname, '..', 'resources', ext),   // dev: src/../resources/
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 850,
    minWidth: 900,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'STYPE \u2192 FBX Converter (UE5)',
    backgroundColor: '#0c0c14',
    icon: getAppIcon(),
  });

  // Vite: use dev server in development, bundled files in production
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
});
app.on('window-all-closed', () => app.quit());

// Select output folder
ipcMain.handle('select-output-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Output Folder for FBX Files',
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Parse XML files to get metadata
ipcMain.handle('parse-xml-info', async (_event, filePath) => {
  try {
    const data = parseStypeXML(filePath);
    return {
      success: true,
      info: {
        fileName: path.basename(filePath),
        filePath,
        sampleCount: data.samples.length,
        frameRate: data.header.frameRate,
        date: data.header.date,
        timecodeStart: data.timecodeStart,
        timecodeEnd: data.timecodeEnd,
        durationSec: data.durationSec,
        channels: data.channels,
      },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Save preset file
ipcMain.handle('save-preset-file', async (_event, jsonString) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Preset',
    defaultPath: 'stype-fbx-preset.json',
    filters: [{ name: 'JSON Preset', extensions: ['json'] }],
  });
  if (result.canceled) return { success: false };
  fs.writeFileSync(result.filePath, jsonString, 'utf-8');
  return { success: true, filePath: result.filePath };
});

// Load preset file
ipcMain.handle('load-preset-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Preset',
    filters: [{ name: 'JSON Preset', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled) return { success: false };
  const content = fs.readFileSync(result.filePaths[0], 'utf-8');
  return { success: true, content, filePath: result.filePaths[0] };
});

// Convert XML to FBX
ipcMain.handle('convert-to-fbx', async (_event, { filePath, outputDir, settings }) => {
  try {
    const data = parseStypeXML(filePath);
    const baseName = path.basename(filePath, '.xml');
    // Append first-frame timecode as _HH_MM_SS for easier identification.
    const tcSuffix = data.timecodeStart
      ? '_' + data.timecodeStart.split(':').slice(0, 3).join('_')
      : '';
    const outputFile = baseName + tcSuffix + '.fbx';
    const outputPath = path.join(outputDir, outputFile);
    const result = generateFBX(data, outputPath, settings);
    return {
      success: true,
      outputPath,
      outputFile,
      frameCount: result.frameCount,
      outputFps: result.outputFps,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
