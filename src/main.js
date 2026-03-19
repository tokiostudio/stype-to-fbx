const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { parseStypeXML } = require('./xml-parser');
const { generateFBX } = require('./fbx-writer');

// Handle Squirrel install/update/uninstall events on Windows
if (process.platform === 'win32' && require('electron-squirrel-startup')) app.quit();

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
    icon: path.join(__dirname, '..', 'resources', 'icon.png'),
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
    const outputPath = path.join(outputDir, baseName + '.fbx');
    const result = generateFBX(data, outputPath, settings);
    return {
      success: true,
      outputPath,
      outputFile: baseName + '.fbx',
      frameCount: result.frameCount,
      outputFps: result.outputFps,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
