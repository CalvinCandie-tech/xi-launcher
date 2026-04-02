const { app, BrowserWindow, ipcMain, dialog, shell, protocol, safeStorage, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execSync, spawn, exec } = require('child_process');
const yauzl = require('yauzl');

/**
 * Extract a zip file using yauzl (streaming, handles large files, reports progress).
 * @param {string} zipPath - Path to the zip file
 * @param {string} destDir - Directory to extract into
 * @param {function} onProgress - Called with (percent, filename) during extraction
 * @returns {Promise<number>} Number of files extracted
 */
function extractZip(zipPath, destDir, onProgress) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      let extracted = 0;
      const total = zipfile.entryCount;

      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        const entryPath = path.join(destDir, entry.fileName);

        if (/\/$/.test(entry.fileName)) {
          // Directory entry
          fs.mkdirSync(entryPath, { recursive: true });
          extracted++;
          if (onProgress) onProgress(Math.round((extracted / total) * 100), entry.fileName);
          zipfile.readEntry();
        } else {
          // File entry — ensure parent dir exists
          fs.mkdirSync(path.dirname(entryPath), { recursive: true });
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) return reject(err);
            const writeStream = fs.createWriteStream(entryPath);
            readStream.on('end', () => {
              extracted++;
              if (onProgress) onProgress(Math.round((extracted / total) * 100), entry.fileName);
              zipfile.readEntry();
            });
            readStream.pipe(writeStream);
          });
        }
      });

      zipfile.on('end', () => resolve(extracted));
      zipfile.on('error', reject);
    });
  });
}

// electron-store ESM workaround
let Store;
let store;

async function initStore() {
  const mod = await import('electron-store');
  Store = mod.default;
  store = new Store({
    defaults: {
      ashitaPath: defaultAshitaPath,
      ffxiPath: 'C:\\Program Files (x86)\\PlayOnline\\SquareEnix\\FINAL FANTASY XI',
      xiloaderPath: '',
      profiles: [],
      activeProfile: null,
      serverHost: '',
      serverPort: '',
      loginUser: '',
      loginPass: '',
      lastLaunched: null
    }
  });
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Active HD pack download streams — keyed by packName for pause/resume/cancel
const activeDownloads = {};

// Runtime folder — always relative to the app root so bundled files stay in one place
const appRoot = isDev ? path.join(__dirname, '..') : path.dirname(app.getPath('exe'));
const runtimeDir = path.join(appRoot, 'runtime');
const defaultAshitaPath = path.join(runtimeDir, 'ashita');
const defaultXiloaderPath = path.join(runtimeDir, 'xiloader');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// ── Security helpers ──
const VALID_REG_PATH = /^HK(LM|CU)\\SOFTWARE\\(Wow6432Node\\)?(PlayOnline|PlayOnlineUS|PlayOnlineEU)\\SquareEnix\\FinalFantasyXI$/i;
const VALID_REG_KEY = /^[0-9]{4}$/;

function validateRegPath(regPath) {
  if (!regPath || !VALID_REG_PATH.test(regPath)) throw new Error('Invalid registry path');
}
function validateRegKey(key) {
  if (!key || !VALID_REG_KEY.test(key)) throw new Error(`Invalid registry key: ${key}`);
}
function validateRegValue(value) {
  const num = parseInt(value, 10);
  if (isNaN(num)) throw new Error(`Invalid registry value: ${value}`);
  return num;
}
function escapePSString(str) {
  return String(str).replace(/'/g, "''").replace(/`/g, '``').replace(/\$/g, '`$').replace(/"/g, '`"');
}
function isAllowedPath(filePath) {
  const resolved = path.resolve(filePath);
  const ffxiPath = store?.get('ffxiPath');
  const allowed = [
    store?.get('ashitaPath'),
    ffxiPath,
    store?.get('xiloaderPath'),
    runtimeDir,
    os.tmpdir(),
    // Allow sibling dirs of FFXI (e.g. PlayOnlineViewer for pol.exe)
    ffxiPath ? path.resolve(ffxiPath, '..') : null
  ].filter(Boolean).map(p => path.resolve(p));
  return allowed.some(root => resolved.startsWith(root + path.sep) || resolved === root);
}

// ── Shared utilities ──
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
function countFiles(dir) {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) count += countFiles(path.join(dir, e.name));
    else count++;
  }
  return count;
}

let mainWindow;
let tray = null;
let minimizeToTray = false;

function getAppIcon() {
  const iconPath = isDev
    ? path.join(__dirname, '..', 'public', 'crystal.ico')
    : path.join(__dirname, '..', 'build', 'crystal.ico');
  return fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
}

function createTray() {
  const icon = getAppIcon();
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('XI Launcher');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { minimizeToTray = false; app.quit(); } }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    icon: getAppIcon(),
    backgroundColor: '#0a0c10',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'build', 'index.html'));
  }

  mainWindow.on('close', (e) => {
    if (minimizeToTray && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

async function deployBundledXiloader() {
  try {
    // Bundled xiloader is in resources/ folder
    const bundledPath = isDev
      ? path.join(__dirname, '..', 'resources', 'xiloader.exe')
      : path.join(process.resourcesPath, 'xiloader.exe');

    if (!fs.existsSync(bundledPath)) return;

    // Deploy to runtime folder inside the launcher
    const deployDir = defaultXiloaderPath;
    const deployExe = path.join(deployDir, 'xiloader.exe');

    // Only deploy if not already there
    if (!fs.existsSync(deployExe)) {
      if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir, { recursive: true });
      fs.copyFileSync(bundledPath, deployExe);
    }

    // Auto-set xiloaderPath in store if not already set
    const currentPath = store?.get('xiloaderPath');
    if (!currentPath || !fs.existsSync(path.join(currentPath, 'xiloader.exe'))) {
      store?.set('xiloaderPath', deployDir);
    }
  } catch (e) {
    console.error('Failed to deploy bundled xiloader:', e);
  }
}

app.whenReady().then(async () => {
  // Ensure runtime directory exists
  if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });

  await initStore();

  // Set default paths only if not already configured
  if (!store.get('ashitaPath')) {
    store.set('ashitaPath', defaultAshitaPath);
  }
  if (!store.get('xiloaderPath') && fs.existsSync(path.join(defaultXiloaderPath, 'xiloader.exe'))) {
    store.set('xiloaderPath', defaultXiloaderPath);
  }

  // Migrate plaintext password to encrypted if needed
  if (safeStorage.isEncryptionAvailable() && store.get('loginPass') && !store.get('loginPassEncrypted')) {
    try {
      const plain = store.get('loginPass');
      store.set('loginPass', safeStorage.encryptString(plain).toString('base64'));
      store.set('loginPassEncrypted', true);
    } catch (e) {
      console.error('Failed to encrypt stored password:', e.message);
    }
  }

  await deployBundledXiloader();
  createWindow();
  createTray();
  minimizeToTray = store.get('minimizeToTray') || false;
  registerIPC();
});

app.on('window-all-closed', () => app.quit());

function registerIPC() {
  // Window controls
  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window-close', () => mainWindow?.close());

  ipcMain.handle('set-minimize-to-tray', (_, enabled) => {
    minimizeToTray = !!enabled;
    store.set('minimizeToTray', minimizeToTray);
    return minimizeToTray;
  });
  ipcMain.handle('get-minimize-to-tray', () => minimizeToTray);

  // Store (with password encryption)
  ipcMain.handle('store-get', (_, key) => {
    if (key === 'loginPass' && store.get('loginPassEncrypted')) {
      try {
        return safeStorage.decryptString(Buffer.from(store.get('loginPass'), 'base64'));
      } catch { return ''; }
    }
    return store.get(key);
  });
  ipcMain.handle('store-set', (_, key, value) => {
    if (key === 'loginPass' && safeStorage.isEncryptionAvailable()) {
      store.set(key, safeStorage.encryptString(String(value)).toString('base64'));
      store.set('loginPassEncrypted', true);
      return true;
    }
    store.set(key, value);
    return true;
  });
  ipcMain.handle('store-get-all', () => {
    const data = { ...store.store };
    if (data.loginPassEncrypted && data.loginPass) {
      try {
        data.loginPass = safeStorage.decryptString(Buffer.from(data.loginPass, 'base64'));
      } catch { data.loginPass = ''; }
    }
    return data;
  });
  ipcMain.handle('get-runtime-paths', () => ({
    runtimeDir,
    defaultAshitaPath,
    defaultXiloaderPath
  }));

  // Profile settings (per-profile snapshots)
  ipcMain.handle('save-profile-settings', (_, profileName, settings) => {
    const all = store.get('profileSettings') || {};
    all[profileName] = settings;
    store.set('profileSettings', all);
    return true;
  });

  ipcMain.handle('load-profile-settings', (_, profileName) => {
    const all = store.get('profileSettings') || {};
    return all[profileName] || null;
  });

  // File system
  ipcMain.handle('browse-folder', async (_, defaultPath) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      defaultPath: defaultPath || '',
      properties: ['openDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('read-dir', async (_, dirPath) => {
    try {
      if (!isAllowedPath(dirPath)) return { exists: false, files: [] };
      if (!fs.existsSync(dirPath)) return { exists: false, files: [] };
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      return {
        exists: true,
        files: entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }))
      };
    } catch {
      return { exists: false, files: [] };
    }
  });

  ipcMain.handle('read-file', async (_, filePath) => {
    try {
      if (!isAllowedPath(filePath)) return { exists: false, content: '', error: 'Path not allowed' };
      if (!fs.existsSync(filePath)) return { exists: false, content: '' };
      const content = fs.readFileSync(filePath, 'utf-8');
      return { exists: true, content };
    } catch (e) {
      console.error('[read-file]', e.message);
      return { exists: false, content: '' };
    }
  });

  ipcMain.handle('write-file', async (_, filePath, content) => {
    try {
      if (!isAllowedPath(filePath)) return { success: false, error: 'Path not allowed' };
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (e) {
      console.error('[write-file]', e.message);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('path-exists', async (_, p) => {
    if (!isAllowedPath(p)) return false;
    return fs.existsSync(p);
  });

  ipcMain.handle('open-folder', async (_, p) => {
    try { await shell.openPath(p); return true; } catch { return false; }
  });

  // Version / update checker
  const APP_VERSION = '1.0.0';
  const UPDATE_REPO = 'xi-launcher/xi-launcher'; // TODO: Update to actual GitHub repo when published

  ipcMain.handle('get-app-version', () => APP_VERSION);

  ipcMain.handle('check-for-updates', async () => {

    try {
      const data = await new Promise((resolve, reject) => {
        https.get(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
          headers: { 'User-Agent': 'XI-Launcher', Accept: 'application/json' }
        }, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => {
            try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
          });
          res.on('error', reject);
        }).on('error', reject);
      });

      if (!data.tag_name) return { upToDate: true, current: APP_VERSION };

      const latest = data.tag_name.replace(/^v/, '');
      const isNewer = latest.localeCompare(APP_VERSION, undefined, { numeric: true }) > 0;
      return {
        upToDate: !isNewer,
        current: APP_VERSION,
        latest,
        releaseUrl: data.html_url || '',
        releaseNotes: (data.body || '').slice(0, 500)
      };
    } catch {
      return { upToDate: true, current: APP_VERSION, error: 'Could not check for updates' };
    }
  });

  ipcMain.handle('open-external', async (_, url) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  // Music
  const musicDir = path.join(runtimeDir, 'music');
  if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true });

  ipcMain.handle('list-music', async () => {
    try {
      const files = fs.readdirSync(musicDir).filter(f =>
        /\.(mp3|ogg|wav|flac|m4a|aac|wma)$/i.test(f)
      );
      return files;
    } catch { return []; }
  });

  ipcMain.handle('get-music-path', async (_, filename) => {
    const filePath = path.resolve(musicDir, filename);
    // Validate that the resolved path stays within the music directory
    if (!filePath.startsWith(musicDir + path.sep) && filePath !== musicDir) return null;
    if (!fs.existsSync(filePath)) return null;
    const ext = path.extname(filename).toLowerCase().slice(1);
    const mimeMap = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', wma: 'audio/x-ms-wma' };
    const mime = mimeMap[ext] || 'audio/mpeg';
    const data = fs.readFileSync(filePath).toString('base64');
    return `data:${mime};base64,${data}`;
  });

  ipcMain.handle('open-music-folder', async () => {
    if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true });
    shell.openPath(musicDir);
  });

  // Registry
  ipcMain.handle('read-ffxi-registry', async () => {
    const paths = [
      // HKLM paths (original install locations)
      'HKLM\\SOFTWARE\\PlayOnlineUS\\SquareEnix\\FinalFantasyXI',
      'HKLM\\SOFTWARE\\PlayOnlineEU\\SquareEnix\\FinalFantasyXI',
      'HKLM\\SOFTWARE\\PlayOnline\\SquareEnix\\FinalFantasyXI',
      'HKLM\\SOFTWARE\\Wow6432Node\\PlayOnlineUS\\SquareEnix\\FinalFantasyXI',
      'HKLM\\SOFTWARE\\Wow6432Node\\PlayOnlineEU\\SquareEnix\\FinalFantasyXI',
      'HKLM\\SOFTWARE\\Wow6432Node\\PlayOnline\\SquareEnix\\FinalFantasyXI',
      // HKCU paths (user-writable without admin)
      'HKCU\\SOFTWARE\\PlayOnlineUS\\SquareEnix\\FinalFantasyXI',
      'HKCU\\SOFTWARE\\PlayOnlineEU\\SquareEnix\\FinalFantasyXI',
      'HKCU\\SOFTWARE\\PlayOnline\\SquareEnix\\FinalFantasyXI'
    ];

    for (const regPath of paths) {
      try {
        const output = execSync(`reg query "${regPath}"`, { encoding: 'utf-8', timeout: 5000 });
        const values = {};
        const lines = output.split('\n');
        for (const line of lines) {
          const match = line.trim().match(/^(\S+)\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
          if (match) {
            values[match[1]] = parseInt(match[2], 16);
          }
        }
        if (Object.keys(values).length > 0) {
          return { values, regPath };
        }
      } catch {
        // Try next path
      }
    }
    return { values: {}, regPath: null };
  });

  // Single key write (kept for compatibility)
  ipcMain.handle('write-ffxi-registry', async (_, regPath, keyName, value) => {
    try {
      validateRegPath(regPath);
      validateRegKey(keyName);
      const safeValue = validateRegValue(value);
      execSync(`reg add "${regPath}" /v ${keyName} /t REG_DWORD /d ${safeValue} /f`, { encoding: 'utf-8', timeout: 5000 });
      return { success: true };
    } catch (e) {
      console.error('[write-ffxi-registry]', e.message);
      return { success: false, error: e.message || 'Access denied' };
    }
  });

  // Backup registry before writing — stores previous values for undo
  ipcMain.handle('backup-registry', async () => {
    try {
      // Read current values directly
      const regPaths = [
        'HKLM\\SOFTWARE\\PlayOnlineUS\\SquareEnix\\FinalFantasyXI',
        'HKLM\\SOFTWARE\\PlayOnlineEU\\SquareEnix\\FinalFantasyXI',
        'HKLM\\SOFTWARE\\PlayOnline\\SquareEnix\\FinalFantasyXI',
        'HKLM\\SOFTWARE\\Wow6432Node\\PlayOnlineUS\\SquareEnix\\FinalFantasyXI',
        'HKLM\\SOFTWARE\\Wow6432Node\\PlayOnlineEU\\SquareEnix\\FinalFantasyXI',
        'HKLM\\SOFTWARE\\Wow6432Node\\PlayOnline\\SquareEnix\\FinalFantasyXI',
        'HKCU\\SOFTWARE\\PlayOnlineUS\\SquareEnix\\FinalFantasyXI',
        'HKCU\\SOFTWARE\\PlayOnlineEU\\SquareEnix\\FinalFantasyXI',
        'HKCU\\SOFTWARE\\PlayOnline\\SquareEnix\\FinalFantasyXI'
      ];
      for (const rp of regPaths) {
        try {
          const output = execSync(`reg query "${rp}"`, { encoding: 'utf-8', timeout: 5000 });
          const values = {};
          for (const line of output.split('\n')) {
            const match = line.trim().match(/^(\S+)\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
            if (match) values[match[1]] = parseInt(match[2], 16);
          }
          if (Object.keys(values).length > 0) {
            store.set('registryBackup', { values, regPath: rp, timestamp: new Date().toISOString() });
            return { success: true };
          }
        } catch {}
      }
      return { success: false, error: 'No registry values found to backup' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-registry-backup', async () => {
    return store.get('registryBackup') || null;
  });

  ipcMain.handle('restore-registry-backup', async () => {
    const backup = store.get('registryBackup');
    if (!backup || !backup.values || !backup.regPath) {
      return { success: false, error: 'No registry backup found' };
    }
    try { validateRegPath(backup.regPath); } catch {
      return { success: false, error: 'Invalid registry path in backup' };
    }
    const entries = Object.entries(backup.values).map(([key, value]) => ({ key, value: parseInt(value, 10) }))
      .filter(({ key, value }) => VALID_REG_KEY.test(key) && !isNaN(value));
    if (entries.length === 0) return { success: false, error: 'No valid entries in backup' };
    try {
      for (const { key, value } of entries) {
        execSync(`reg add "${backup.regPath}" /v ${key} /t REG_DWORD /d ${value} /f`, { encoding: 'utf-8', timeout: 5000 });
      }
      return { success: true, count: entries.length };
    } catch {
      const regCmds = entries.map(({ key, value }) =>
        `reg add '${escapePSString(backup.regPath)}' /v ${key} /t REG_DWORD /d ${value} /f`
      ).join('; ');
      try {
        const tmpScript = path.join(app.getPath('temp'), 'xi-launcher-reg-undo.ps1');
        fs.writeFileSync(tmpScript, regCmds, 'utf-8');
        execSync(
          `powershell -Command "Start-Process powershell -ArgumentList '-ExecutionPolicy','Bypass','-File','${escapePSString(tmpScript)}' -Verb RunAs -Wait -WindowStyle Hidden"`,
          { timeout: 30000 }
        );
        try { fs.unlinkSync(tmpScript); } catch (e) { console.error('[restore-registry] cleanup', e.message); }
        return { success: true, count: entries.length };
      } catch (e) {
        console.error('[restore-registry]', e.message);
        return { success: false, error: 'Failed to restore registry. Try running as Administrator.' };
      }
    }
  });

  // Batch registry write — all keys in one elevated PowerShell command (single UAC prompt)
  ipcMain.handle('write-ffxi-registry-batch', async (_, regPath, entries) => {
    try { validateRegPath(regPath); } catch (e) {
      return { success: false, error: e.message };
    }
    // Validate and sanitize all entries
    const safeEntries = [];
    for (const { key, value } of entries) {
      if (!VALID_REG_KEY.test(key)) continue;
      const num = parseInt(value, 10);
      if (isNaN(num)) continue;
      safeEntries.push({ key, value: num });
    }
    if (safeEntries.length === 0) return { success: false, error: 'No valid entries' };

    // Auto-backup before writing
    try {
      const output = execSync(`reg query "${regPath}"`, { encoding: 'utf-8', timeout: 5000 });
      const backupValues = {};
      for (const line of output.split('\n')) {
        const match = line.trim().match(/^(\S+)\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
        if (match) backupValues[match[1]] = parseInt(match[2], 16);
      }
      if (Object.keys(backupValues).length > 0) {
        store.set('registryBackup', { values: backupValues, regPath, timestamp: new Date().toISOString() });
      }
    } catch (e) {
      console.error('[write-ffxi-registry-batch] backup failed:', e.message);
    }

    // First try direct (no UAC)
    try {
      for (const { key, value } of safeEntries) {
        execSync(`reg add "${regPath}" /v ${key} /t REG_DWORD /d ${value} /f`, { encoding: 'utf-8', timeout: 5000 });
      }
      return { success: true, count: safeEntries.length };
    } catch {
      // Needs elevation
    }

    const regCmds = safeEntries.map(({ key, value }) =>
      `reg add '${escapePSString(regPath)}' /v ${key} /t REG_DWORD /d ${value} /f`
    ).join('; ');

    try {
      const tmpScript = path.join(app.getPath('temp'), 'xi-launcher-reg.ps1');
      fs.writeFileSync(tmpScript, regCmds, 'utf-8');
      execSync(
        `powershell -Command "Start-Process powershell -ArgumentList '-ExecutionPolicy','Bypass','-File','${escapePSString(tmpScript)}' -Verb RunAs -Wait -WindowStyle Hidden"`,
        { timeout: 30000 }
      );
      try { fs.unlinkSync(tmpScript); } catch (e) { console.error('[write-ffxi-registry-batch] cleanup', e.message); }
      return { success: true, count: safeEntries.length };
    } catch {
      // Last resort: try HKCU fallback
      const hkcuPath = regPath.replace(/^HKLM\\SOFTWARE\\(Wow6432Node\\)?/, 'HKCU\\SOFTWARE\\');
      try {
        for (const { key, value } of safeEntries) {
          execSync(`reg add "${hkcuPath}" /v ${key} /t REG_DWORD /d ${value} /f`, { encoding: 'utf-8', timeout: 5000 });
        }
        return { success: true, count: safeEntries.length, fallback: hkcuPath };
      } catch {
        return { success: false, error: 'Registry write failed. The admin elevation prompt may have been cancelled. Try running XI Launcher as Administrator, or check that FFXI registry keys exist (run FFXI Config once if you haven\'t).' };
      }
    }
  });

  // Install Ashita v4 from GitHub
  ipcMain.handle('install-ashita-v4', async (_, destPath) => {



    try {
      const sendProgress = (percent, detail) => {
        try { mainWindow?.webContents?.send('ashita-install-progress', percent, detail); } catch {}
      };

      sendProgress(0, 'Preparing download...');

      if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });

      const zipUrl = 'https://github.com/AshitaXI/Ashita-v4beta/archive/refs/heads/main.zip';
      const tmpZip = path.join(os.tmpdir(), 'ashita-v4.zip');

      sendProgress(5, 'Downloading Ashita v4 from GitHub...');

      await new Promise((resolve, reject) => {
        const download = (url) => {
          https.get(url, { headers: { 'User-Agent': 'XI-Launcher' } }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
              return download(res.headers.location);
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`Download failed with status ${res.statusCode}`));
            }
            const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
            let receivedBytes = 0;
            const file = fs.createWriteStream(tmpZip);
            res.on('data', (chunk) => {
              receivedBytes += chunk.length;
              file.write(chunk);
              const mb = (receivedBytes / 1048576).toFixed(1);
              if (totalBytes > 0) {
                const pct = 5 + Math.round((receivedBytes / totalBytes) * 50);
                const totalMb = (totalBytes / 1048576).toFixed(1);
                sendProgress(pct, `Downloading... ${mb} / ${totalMb} MB`);
              } else {
                sendProgress(Math.min(50, 5 + Math.round(receivedBytes / 50000)), `Downloading... ${mb} MB`);
              }
            });
            res.on('end', () => { file.end(); file.on('finish', resolve); });
            res.on('error', reject);
          }).on('error', reject);
        };
        download(zipUrl);
      });

      sendProgress(60, 'Extracting...');

      const tmpExtract = path.join(os.tmpdir(), 'ashita-v4-extract');
      if (fs.existsSync(tmpExtract)) {
        fs.rmSync(tmpExtract, { recursive: true, force: true });
      }
      fs.mkdirSync(tmpExtract, { recursive: true });
      await extractZip(tmpZip, tmpExtract);

      // GitHub ZIP has a top-level folder like "Ashita-v4beta-main/"
      const extracted = fs.readdirSync(tmpExtract);
      const innerDir = extracted.length === 1 && fs.statSync(path.join(tmpExtract, extracted[0])).isDirectory()
        ? path.join(tmpExtract, extracted[0])
        : tmpExtract;

      sendProgress(75, 'Copying files...');

      copyRecursive(innerDir, destPath);

      sendProgress(95, 'Cleaning up...');

      try { fs.unlinkSync(tmpZip); } catch (e) { console.error('[install-ashita-v4] cleanup', e.message); }
      try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch (e) { console.error('[install-ashita-v4] cleanup', e.message); }

      // Verify install
      const cliExe = path.join(destPath, 'Ashita-cli.exe');
      if (!fs.existsSync(cliExe)) {
        return { success: false, error: 'Download completed but Ashita-cli.exe not found. The repo structure may have changed.' };
      }

      sendProgress(100, 'Ashita v4 installed successfully');

      return { success: true, message: `Ashita v4 installed to ${destPath}` };
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
        return { success: false, error: 'Network error: Could not reach GitHub. Check your internet connection and try again.' };
      }
      if (msg.includes('EACCES') || msg.includes('EPERM')) {
        return { success: false, error: `Permission denied writing to ${destPath}. Try running XI Launcher as Administrator or choose a different install location.` };
      }
      if (msg.includes('Expand-Archive') || msg.includes('tar')) {
        return { success: false, error: 'Failed to extract the download. The ZIP file may be corrupted — try again.' };
      }
      return { success: false, error: `Install failed: ${msg}` };
    }
  });

  // Watch for game process to exit, then notify renderer
  let gameExitPoll = null;
  let gameExitTimeout = null;
  const watchForGameExit = (processName) => {
    // Clear any previous watcher
    if (gameExitPoll) clearInterval(gameExitPoll);
    if (gameExitTimeout) clearTimeout(gameExitTimeout);
    // Wait a few seconds for the process to start
    gameExitTimeout = setTimeout(() => {
      let pollCount = 0;
      gameExitPoll = setInterval(() => {
        pollCount++;
        if (pollCount > 720) { clearInterval(gameExitPoll); gameExitPoll = null; return; } // max 1 hour
        exec(`tasklist /FI "IMAGENAME eq ${processName}" /NH`, (err, stdout) => {
          if (err || !stdout.toLowerCase().includes(processName.toLowerCase())) {
            clearInterval(gameExitPoll);
            gameExitPoll = null;
            try { mainWindow?.webContents?.send('game-exited'); } catch {}
          }
        });
      }, 5000);
    }, 10000);
  };

  // Game launch
  ipcMain.handle('launch-game', async (_, opts) => {
    try {
      if (opts.useXiloader) {
        if (!opts.xiloaderPath) return { error: 'xiloader path is not set. Go to Profiles → Installation Paths and set the xiloader path.' };
        const exe = path.join(opts.xiloaderPath, 'xiloader.exe');
        if (!fs.existsSync(exe)) return { error: `xiloader.exe not found at ${opts.xiloaderPath}. You can download it from the Profiles tab or place xiloader.exe in that folder manually.` };
        if (!opts.serverName) return { error: 'No server address set. Go to Profiles → Private Server Connection and enter your server hostname.' };
        const args = [];
        if (opts.serverName) args.push('--server', opts.serverName);
        if (opts.serverPort) args.push('--serverport', opts.serverPort);
        if (opts.loginUser) args.push('--user', opts.loginUser);
        if (opts.loginPass) args.push('--pass', opts.loginPass);
        if (opts.hairpin) args.push('--hairpin');
        const argStr = args.map(a => `'${escapePSString(a)}'`).join(',');
        const psCmd = `Start-Process -FilePath '${escapePSString(exe)}' ${argStr ? `-ArgumentList ${argStr}` : ''} -WorkingDirectory '${escapePSString(opts.xiloaderPath)}' -Verb RunAs`;
        exec(`powershell -Command "${psCmd}"`, { timeout: 15000 }, (err) => {
          if (err) console.error('Launch error:', err.message);
        });
        // Watch for game exit and notify renderer
        watchForGameExit('pol.exe');
        return { success: true, message: 'xiloader launched' };
      } else {
        if (!opts.ashitaPath) return { error: 'Ashita path is not set. Go to Profiles → Installation Paths and set the Ashita v4 path.' };
        const exe = path.join(opts.ashitaPath, 'Ashita-cli.exe');
        if (!fs.existsSync(exe)) return { error: `Ashita-cli.exe not found at ${opts.ashitaPath}. Install Ashita v4 from the Home tab or set the correct path in Profiles → Installation Paths.` };
        if (!opts.profileName) return { error: 'No profile selected. Create or select a profile from the Profiles tab before launching.' };
        const profileIni = path.join(opts.ashitaPath, 'config', 'boot', `${opts.profileName}.ini`);
        if (!fs.existsSync(profileIni)) return { error: `Profile "${opts.profileName}" INI file not found. The profile may have been deleted. Select a different profile or create a new one.` };
        const iniName = `${opts.profileName}.ini`;
        const argStr = iniName.includes(' ')
          ? `-ArgumentList '""${escapePSString(iniName)}""'`
          : `-ArgumentList '${escapePSString(iniName)}'`;
        const psCmd = `Start-Process -FilePath '${escapePSString(exe)}' ${argStr} -WorkingDirectory '${escapePSString(opts.ashitaPath)}' -Verb RunAs`;
        exec(`powershell -Command "${psCmd}"`, { timeout: 15000 }, (err) => {
          if (err) console.error('Launch error:', err.message);
        });
        // Watch for game exit and notify renderer
        watchForGameExit('pol.exe');
        return { success: true, message: `Ashita launched with profile: ${opts.profileName}` };
      }
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('elevation') || msg.includes('denied') || msg.includes('UAC')) {
        return { error: 'Admin elevation was cancelled or denied. Ashita requires administrator privileges to inject into FFXI. Try right-clicking XI Launcher and selecting "Run as administrator".' };
      }
      if (msg.includes('ENOENT')) {
        return { error: 'PowerShell could not be found. Ensure Windows PowerShell is installed and available in your PATH.' };
      }
      return { error: `Launch failed: ${msg}` };
    }
  });

  // Download pre-built xiloader from GitHub
  ipcMain.handle('download-xiloader', async (_, destDir) => {

    try {
      const targetDir = destDir || defaultXiloaderPath;
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const destExe = path.join(targetDir, 'xiloader.exe');

      const sendProgress = (percent, detail) => {
        try { mainWindow?.webContents?.send('xiloader-download-progress', percent, detail); } catch {}
      };

      sendProgress(5, 'Checking for latest xiloader release...');

      // Try LandSandBoat releases first
      const releaseUrl = 'https://api.github.com/repos/LandSandBoat/xiloader/releases/latest';
      const getJson = (url) => new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'XI-Launcher', Accept: 'application/json' } }, (res) => {
          if (res.statusCode === 302 || res.statusCode === 301) return getJson(res.headers.location).then(resolve, reject);
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
          });
          res.on('error', reject);
        }).on('error', reject);
      });

      let downloadUrl = null;
      try {
        const release = await getJson(releaseUrl);
        if (release.assets) {
          const asset = release.assets.find(a => a.name.toLowerCase().includes('xiloader') && a.name.endsWith('.exe'));
          if (asset) downloadUrl = asset.browser_download_url;
        }
      } catch {}

      if (!downloadUrl) {
        // Fallback: build from source advice
        return { success: false, error: 'No pre-built xiloader release found on GitHub. Use the "Download & Build" option instead (requires Git + CMake + Visual Studio).' };
      }

      sendProgress(10, 'Downloading xiloader.exe...');

      await new Promise((resolve, reject) => {
        const download = (url) => {
          https.get(url, { headers: { 'User-Agent': 'XI-Launcher' } }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) return download(res.headers.location);
            if (res.statusCode !== 200) return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
            const total = parseInt(res.headers['content-length'] || '0', 10);
            let received = 0;
            const file = fs.createWriteStream(destExe);
            res.on('data', (chunk) => {
              received += chunk.length;
              file.write(chunk);
              if (total > 0) sendProgress(10 + Math.round((received / total) * 85), `Downloading... ${(received / 1024).toFixed(0)} KB`);
            });
            res.on('end', () => { file.end(); file.on('finish', resolve); });
            res.on('error', reject);
          }).on('error', reject);
        };
        download(downloadUrl);
      });

      sendProgress(100, 'xiloader.exe downloaded successfully');
      store.set('xiloaderPath', targetDir);
      return { success: true, message: `xiloader.exe downloaded to ${targetDir}` };
    } catch (e) {
      if (e.message.includes('ENOTFOUND') || e.message.includes('getaddrinfo')) {
        return { success: false, error: 'Network error: Could not reach GitHub. Check your internet connection.' };
      }
      return { success: false, error: `Download failed: ${e.message}` };
    }
  });

  // xiloader download & build
  ipcMain.handle('check-build-tools', async () => {
    const tools = { git: false, cmake: false, msbuild: false };
    try { execSync('git --version', { timeout: 5000 }); tools.git = true; } catch {}
    try { execSync('cmake --version', { timeout: 5000 }); tools.cmake = true; } catch {}
    // Check for MSBuild via vswhere or direct path
    try {
      const vswhere = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe';
      if (fs.existsSync(vswhere)) {
        const vsPath = execSync(`"${vswhere}" -latest -products * -requires Microsoft.Component.MSBuild -find MSBuild\\**\\Bin\\MSBuild.exe`, { encoding: 'utf-8', timeout: 10000 }).trim();
        if (vsPath) tools.msbuild = true;
      }
    } catch {}
    // Fallback: try cmake --build which uses its own generator
    if (!tools.msbuild && tools.cmake) tools.msbuild = true;
    return tools;
  });

  ipcMain.handle('clone-xiloader', async (_, destPath) => {
    try {
      if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
      const repoDir = path.join(destPath, 'xiloader');
      if (fs.existsSync(repoDir)) {
        // Pull latest instead of re-cloning
        execSync('git pull', { cwd: repoDir, timeout: 60000 });
        return { success: true, repoDir, message: 'Repository updated' };
      }
      execSync(`git clone https://github.com/LandSandBoat/xiloader.git`, { cwd: destPath, timeout: 120000 });
      return { success: true, repoDir, message: 'Repository cloned' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('build-xiloader', async (_, repoDir) => {
    return new Promise((resolve) => {
      const buildDir = path.join(repoDir, 'build');
      if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

      const cmds = [
        `cmake -S "${repoDir}" -B "${buildDir}" -A Win32`,
        `cmake --build "${buildDir}" --config Release`
      ].join(' && ');

      const child = exec(cmds, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          return resolve({ success: false, error: err.message, stdout, stderr });
        }
        // Find the built exe
        const possiblePaths = [
          path.join(buildDir, 'Release', 'xiloader.exe'),
          path.join(buildDir, 'xiloader.exe'),
          path.join(buildDir, 'Debug', 'xiloader.exe')
        ];
        const exePath = possiblePaths.find(p => fs.existsSync(p));
        if (exePath) {
          return resolve({ success: true, exePath, message: 'Build successful' });
        }
        return resolve({ success: false, error: 'Build completed but xiloader.exe not found', stdout, stderr });
      });
    });
  });

  ipcMain.handle('copy-xiloader', async (_, srcExe, destDir) => {
    try {
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      const destPath = path.join(destDir, 'xiloader.exe');
      fs.copyFileSync(srcExe, destPath);
      return { success: true, destPath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Addons
  ipcMain.handle('get-plugins', async (_, ashitaPath) => {
    const pluginsDir = path.join(ashitaPath, 'plugins');
    try {
      if (!fs.existsSync(pluginsDir)) return { plugins: [] };
      const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
      const plugins = entries
        .filter(e => e.isFile() && e.name.endsWith('.dll'))
        .map(e => ({
          name: e.name.replace(/\.dll$/i, ''),
          size: fs.statSync(path.join(pluginsDir, e.name)).size
        }));
      return { plugins };
    } catch {
      return { plugins: [] };
    }
  });

  ipcMain.handle('get-addons', async (_, ashitaPath) => {
    const addonsDir = path.join(ashitaPath, 'addons');
    try {
      if (!fs.existsSync(addonsDir)) return { addons: [] };
      const entries = fs.readdirSync(addonsDir, { withFileTypes: true });
      const addons = entries
        .filter(e => e.isDirectory())
        .map(e => {
          const mainLua = path.join(addonsDir, e.name, `${e.name}.lua`);
          const altLua = path.join(addonsDir, e.name, 'main.lua');
          return {
            name: e.name,
            hasMainLua: fs.existsSync(mainLua) || fs.existsSync(altLua)
          };
        });
      return { addons };
    } catch {
      return { addons: [] };
    }
  });

  // Profiles
  ipcMain.handle('list-profiles', async (_, ashitaPath) => {
    const profileDir = path.join(ashitaPath, 'config', 'boot');
    try {
      if (!fs.existsSync(profileDir)) return [];
      const files = fs.readdirSync(profileDir);
      return files.filter(f => f.endsWith('.ini')).map(f => f.replace('.ini', ''));
    } catch {
      return [];
    }
  });

  const sanitizeProfileName = (name) => {
    if (!name || typeof name !== 'string') return null;
    // Block path traversal and unsafe characters
    if (/[/\\:*?"<>|]|\.\./.test(name)) return null;
    return name.trim();
  };

  ipcMain.handle('read-profile', async (_, ashitaPath, name) => {
    const safeName = sanitizeProfileName(name);
    if (!safeName) return { exists: false, content: '' };
    const filePath = path.join(ashitaPath, 'config', 'boot', `${safeName}.ini`);
    try {
      if (!fs.existsSync(filePath)) return { exists: false, content: '' };
      return { exists: true, content: fs.readFileSync(filePath, 'utf-8') };
    } catch {
      return { exists: false, content: '' };
    }
  });

  ipcMain.handle('save-profile', async (_, ashitaPath, name, content) => {
    const safeName = sanitizeProfileName(name);
    if (!safeName) return { success: false, error: 'Invalid profile name' };
    const filePath = path.join(ashitaPath, 'config', 'boot', `${safeName}.ini`);
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('delete-profile', async (_, ashitaPath, name) => {
    const filePath = path.join(ashitaPath, 'config', 'boot', `${name}.ini`);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return { success: true };
      }
      return { success: false, error: 'Profile file not found' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Profile export — saves INI + per-profile settings as a JSON file
  ipcMain.handle('export-profile', async (_, ashitaPath, profileName) => {
    try {
      const iniPath = path.join(ashitaPath, 'config', 'boot', `${profileName}.ini`);
      if (!fs.existsSync(iniPath)) return { success: false, error: 'Profile INI not found' };
      const iniContent = fs.readFileSync(iniPath, 'utf-8');
      const profileSettings = (store.get('profileSettings') || {})[profileName] || {};

      const exportData = {
        version: 1,
        name: profileName,
        ini: iniContent,
        settings: profileSettings,
        exportedAt: new Date().toISOString()
      };

      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: `${profileName}.xiprofile`,
        filters: [{ name: 'XI Launcher Profile', extensions: ['xiprofile'] }]
      });
      if (result.canceled) return { success: false, cancelled: true };
      fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8');
      return { success: true, message: `Profile exported to ${result.filePath}` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Profile import — reads a .xiprofile JSON and creates the profile
  ipcMain.handle('import-profile', async (_, ashitaPath) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        filters: [{ name: 'XI Launcher Profile', extensions: ['xiprofile'] }],
        properties: ['openFile']
      });
      if (result.canceled) return { success: false, cancelled: true };
      const content = fs.readFileSync(result.filePaths[0], 'utf-8');
      const data = JSON.parse(content);

      if (!data.name || !data.ini) return { success: false, error: 'Invalid profile file — missing name or INI data.' };

      const bootDir = path.join(ashitaPath, 'config', 'boot');
      if (!fs.existsSync(bootDir)) fs.mkdirSync(bootDir, { recursive: true });

      // Check for name collision
      let name = data.name;
      const iniPath = path.join(bootDir, `${name}.ini`);
      if (fs.existsSync(iniPath)) {
        name = `${data.name}_imported`;
      }
      fs.writeFileSync(path.join(bootDir, `${name}.ini`), data.ini, 'utf-8');

      // Restore per-profile settings if present
      if (data.settings && Object.keys(data.settings).length > 0) {
        const all = store.get('profileSettings') || {};
        all[name] = data.settings;
        store.set('profileSettings', all);
      }

      return { success: true, name, message: `Profile "${name}" imported successfully` };
    } catch (e) {
      if (e instanceof SyntaxError) return { success: false, error: 'Invalid profile file — not valid JSON.' };
      return { success: false, error: e.message };
    }
  });

  // XIPivot
  ipcMain.handle('read-xipivot-config', async (_, ashitaPath) => {
    // Try INI format first (actual XIPivot format), then XML (legacy)
    const iniPaths = [
      path.join(ashitaPath, 'config', 'pivot', 'pivot.ini'),
      path.join(ashitaPath, 'config', 'pivot', 'pivot.sample.ini')
    ];
    for (const iniPath of iniPaths) {
      try {
        if (!fs.existsSync(iniPath)) continue;
        const content = fs.readFileSync(iniPath, 'utf-8');
        const lines = content.split('\n');
        let section = '';
        let overlays = [];
        let cacheEnabled = false;
        let cacheSize = 128;
        let cacheMaxAge = 600;
        let debugLog = false;

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            section = trimmed.slice(1, -1);
            continue;
          }
          if (trimmed.startsWith(';') || !trimmed) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx === -1) continue;
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();

          if (section === 'overlays') {
            // key is numeric index, val is overlay name
            overlays.push(val);
          } else if (section === 'cache') {
            if (key === 'enabled') cacheEnabled = val === 'true';
            if (key === 'size') cacheSize = parseInt(val) || 128;
            if (key === 'max_age') cacheMaxAge = parseInt(val) || 600;
          } else if (section === 'settings') {
            if (key === 'debug_log') debugLog = val === 'true';
          }
        }

        return {
          exists: true,
          rootPath: path.join(ashitaPath, 'polplugins', 'DATs'),
          overlays,
          cacheEnabled,
          cacheSize,
          cacheMaxAge,
          configPath: iniPath
        };
      } catch {
        continue;
      }
    }
    return { exists: false, rootPath: '', overlays: [], cacheEnabled: false, cacheSize: 128, cacheMaxAge: 600 };
  });

  ipcMain.handle('write-xipivot-config', async (_, ashitaPath, config) => {
    const iniPath = path.join(ashitaPath, 'config', 'pivot', 'pivot.ini');
    const overlayLines = config.overlays.map((name, i) => `${i}=${name}`).join('\n');
    const ini = `[settings]\ndebug_log=false\n\n[overlays]\n${overlayLines}\n\n[cache]\nenabled=${config.cacheEnabled ? 'true' : 'false'}\nmax_age=${config.cacheMaxAge || 600}\nsize=${config.cacheSize || 128}\n`;
    try {
      const dir = path.dirname(iniPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(iniPath, ini, 'utf-8');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // XIPivot auto-download and install
  ipcMain.handle('install-xipivot', async (_, ashitaPath) => {



    try {
      // Step 1: Fetch latest release info from GitHub API
      const releaseData = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.github.com',
          path: '/repos/HealsCodes/XIPivot/releases/latest',
          headers: { 'User-Agent': 'XI-Launcher' }
        };
        https.get(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch { reject(new Error('Failed to parse release data')); }
          });
        }).on('error', reject);
      });

      // Step 2: Find the Ashita v4 ZIP asset
      const asset = releaseData.assets?.find(a =>
        a.name.toLowerCase().includes('ashita') && a.name.endsWith('.zip')
      );
      if (!asset) {
        return { success: false, error: 'No Ashita ZIP found in latest release.' };
      }

      // Step 3: Download the ZIP to temp
      const tmpZip = path.join(os.tmpdir(), 'xipivot-latest.zip');
      await new Promise((resolve, reject) => {
        const download = (url) => {
          https.get(url, { headers: { 'User-Agent': 'XI-Launcher' } }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
              return download(res.headers.location);
            }
            const file = fs.createWriteStream(tmpZip);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
          }).on('error', reject);
        };
        download(asset.browser_download_url);
      });

      // Step 4: Extract
      const tmpExtract = path.join(os.tmpdir(), 'xipivot-extract');
      if (fs.existsSync(tmpExtract)) {
        fs.rmSync(tmpExtract, { recursive: true, force: true });
      }
      fs.mkdirSync(tmpExtract, { recursive: true });
      await extractZip(tmpZip, tmpExtract);

      // Step 5: Copy extracted contents into Ashita directory
      copyRecursive(tmpExtract, ashitaPath);

      // Step 6: Create default pivot config INI if it doesn't exist
      const pivotIni = path.join(ashitaPath, 'config', 'pivot', 'pivot.ini');
      if (!fs.existsSync(pivotIni)) {
        const pivotDir = path.dirname(pivotIni);
        if (!fs.existsSync(pivotDir)) fs.mkdirSync(pivotDir, { recursive: true });
        const defaultIni = `[settings]\ndebug_log=false\n\n[overlays]\n\n[cache]\nenabled=false\nmax_age=600\nsize=128\n`;
        fs.writeFileSync(pivotIni, defaultIni, 'utf-8');
      }

      // Cleanup
      try { fs.unlinkSync(tmpZip); } catch {}
      try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch {}

      return {
        success: true,
        version: releaseData.tag_name || 'latest',
        message: `XIPivot ${releaseData.tag_name || ''} installed to ${ashitaPath}`
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // LargeAddressAware — check if exe has LAA flag set
  ipcMain.handle('check-laa', async (_, exePath) => {
    try {
      if (!fs.existsSync(exePath)) return { exists: false, patched: false };
      const fd = fs.openSync(exePath, 'r');
      const buf2 = Buffer.alloc(2);
      const buf4 = Buffer.alloc(4);

      // Check MZ header
      fs.readSync(fd, buf2, 0, 2, 0);
      if (buf2.readUInt16LE(0) !== 0x5A4D) {
        fs.closeSync(fd);
        return { exists: true, patched: false, error: 'Not a valid executable (no MZ header)' };
      }

      // Read e_lfanew (offset to PE header)
      fs.readSync(fd, buf4, 0, 4, 0x3C);
      const peOffset = buf4.readUInt32LE(0);

      // Check PE signature
      fs.readSync(fd, buf4, 0, 4, peOffset);
      if (buf4.readUInt32LE(0) !== 0x00004550) {
        fs.closeSync(fd);
        return { exists: true, patched: false, error: 'Not a valid PE executable' };
      }

      // Read Characteristics at peOffset + 0x16 (22 bytes into COFF header)
      fs.readSync(fd, buf2, 0, 2, peOffset + 0x16);
      const characteristics = buf2.readUInt16LE(0);
      const patched = (characteristics & 0x20) !== 0;

      fs.closeSync(fd);
      return { exists: true, patched };
    } catch (e) {
      return { exists: false, patched: false, error: e.message };
    }
  });

  // LargeAddressAware — patch or unpatch exe
  ipcMain.handle('set-laa', async (_, exePath, enable) => {
    try {
      if (!fs.existsSync(exePath)) return { success: false, error: 'File not found: ' + exePath };

      // Helper: patch LAA flag in a buffer
      const patchBuffer = (data, enable) => {
        if (data.readUInt16LE(0) !== 0x5A4D) throw new Error('Not a valid executable');
        const peOffset = data.readUInt32LE(0x3C);
        if (data.readUInt32LE(peOffset) !== 0x00004550) throw new Error('Not a valid PE executable');
        const charOffset = peOffset + 0x16;
        let characteristics = data.readUInt16LE(charOffset);
        if (enable) {
          characteristics |= 0x20;
        } else {
          characteristics &= ~0x20;
        }
        data.writeUInt16LE(characteristics, charOffset);
        return data;
      };

      // Try direct write first
      try {
        const fd = fs.openSync(exePath, 'r+');
        const data = Buffer.alloc(fs.fstatSync(fd).size);
        fs.readSync(fd, data, 0, data.length, 0);
        patchBuffer(data, enable);
        fs.writeSync(fd, data.slice(0, 0x200), 0, 0x200, 0); // Only write the header
        fs.closeSync(fd);
        return { success: true, patched: enable };
      } catch (directErr) {
        if (directErr.code !== 'EPERM' && directErr.code !== 'EACCES') throw directErr;
      }

      // Fallback: patch via temp file + elevated copy
      const tmpDir = os.tmpdir();
      const tmpFile = path.join(tmpDir, 'pol_laa_patch.exe');
      const data = fs.readFileSync(exePath);
      patchBuffer(data, enable);
      fs.writeFileSync(tmpFile, data);

      const psCmd = `Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-Command',\"Copy-Item -Path '${escapePSString(tmpFile)}' -Destination '${escapePSString(exePath)}' -Force\"`;
      execSync(`powershell -NoProfile -Command "${psCmd}"`, { timeout: 30000 });

      // Clean up temp file
      try { fs.unlinkSync(tmpFile); } catch (_) {}

      // Verify it worked
      const verify = fs.readFileSync(exePath);
      const peOff = verify.readUInt32LE(0x3C);
      const chars = verify.readUInt16LE(peOff + 0x16);
      const isPatched = (chars & 0x20) !== 0;
      if (isPatched !== enable) return { success: false, error: 'Patch did not apply — the file may be protected.' };

      return { success: true, patched: enable };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // GPU detection
  ipcMain.handle('detect-gpu', async () => {
    try {
      const output = execSync(
        'powershell -Command "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion | ConvertTo-Json"',
        { encoding: 'utf-8', timeout: 10000 }
      );
      const parsed = JSON.parse(output);
      const gpus = Array.isArray(parsed) ? parsed : [parsed];
      const primary = gpus[0] || {};
      const name = (primary.Name || '').toLowerCase();
      const vramBytes = primary.AdapterRAM || 0;
      const vramMB = Math.round(vramBytes / 1048576);

      let tier = 'mid'; // low | mid | high
      if (name.includes('intel') && !name.includes('arc')) {
        tier = 'low';
      } else if (name.includes('rtx 40') || name.includes('rtx 50') || name.includes('rx 7') || name.includes('rx 9')) {
        tier = 'high';
      } else if (name.includes('rtx 30') || name.includes('rx 6') || name.includes('rtx 20')) {
        tier = 'high';
      } else if (name.includes('gtx 10') || name.includes('rx 5') || name.includes('gtx 16')) {
        tier = 'mid';
      } else if (vramMB < 2048) {
        tier = 'low';
      }

      return {
        success: true,
        gpus: gpus.map(g => ({
          name: g.Name || 'Unknown',
          vram: Math.round((g.AdapterRAM || 0) / 1048576),
          driver: g.DriverVersion || 'Unknown'
        })),
        tier,
        recommendation: tier === 'high'
          ? 'Your GPU is powerful. Use 1080p+4K oversample or native 4K with all quality settings maxed.'
          : tier === 'mid'
          ? 'Your GPU handles 1080p well. Use 1080p with 2K-4K oversample for the best balance.'
          : 'Integrated or older GPU detected. Use 1080p balanced preset.'
      };
    } catch (e) {
      return { success: false, error: 'Could not detect GPU: ' + e.message };
    }
  });

  // Download and install an HD mod pack from GitHub
  ipcMain.handle('install-hdpack', async (_, ashitaPath, packName, repoUrl, subdir) => {



    try {
      // Determine DATs root from pivot.ini or default
      const pivotIni = path.join(ashitaPath, 'config', 'pivot', 'pivot.ini');
      let datsRoot = path.join(ashitaPath, 'polplugins', 'DATs');
      if (fs.existsSync(pivotIni)) {
        const iniContent = fs.readFileSync(pivotIni, 'utf-8');
        const rootMatch = iniContent.match(/root_path\s*=\s*(.+)/i);
        if (rootMatch && rootMatch[1].trim()) datsRoot = rootMatch[1].trim();
      }

      // Query GitHub API for the default branch name
      const repoPath = repoUrl.replace('https://github.com/', '');
      const repoInfo = await new Promise((resolve, reject) => {
        https.get({
          hostname: 'api.github.com',
          path: `/repos/${repoPath}`,
          headers: { 'User-Agent': 'XI-Launcher' }
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch { reject(new Error('Failed to parse repo info')); }
          });
        }).on('error', reject);
      });

      if (repoInfo.message === 'Not Found') {
        return { success: false, error: `Repository ${repoPath} not found on GitHub.` };
      }

      const branch = repoInfo.default_branch || 'main';
      const zipUrl = repoUrl + `/archive/refs/heads/${branch}.zip`;

      // Send progress updates to renderer
      const sendProgress = (phase, percent, detail) => {
        try { mainWindow?.webContents?.send('hdpack-progress', packName, phase, percent, detail); } catch {}
      };

      sendProgress('download', 0, 'Connecting to GitHub...');

      // Download the ZIP to temp
      const tmpZip = path.join(os.tmpdir(), `hdpack-${packName}.zip`);
      await new Promise((resolve, reject) => {
        const download = (url) => {
          https.get(url, { headers: { 'User-Agent': 'XI-Launcher' } }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
              return download(res.headers.location);
            }
            if (res.statusCode === 404) {
              return reject(new Error('Repository not found (404). The download URL may have changed.'));
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`Download failed with status ${res.statusCode}`));
            }
            const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
            // GitHub archive zips often lack content-length; use repo size (KB) as estimate
            const estimatedTotal = totalBytes > 0 ? totalBytes : (repoInfo.size ? repoInfo.size * 1024 : 0);
            let receivedBytes = 0;
            const file = fs.createWriteStream(tmpZip);
            activeDownloads[packName] = { response: res, file, cancelled: false };
            res.on('data', (chunk) => {
              if (activeDownloads[packName]?.cancelled) return;
              receivedBytes += chunk.length;
              file.write(chunk);
              const mb = (receivedBytes / 1048576).toFixed(1);
              if (estimatedTotal > 0) {
                const pct = Math.min(70, Math.round((receivedBytes / estimatedTotal) * 70));
                const totalMb = (estimatedTotal / 1048576).toFixed(1);
                sendProgress('download', pct, `Downloading... ${mb} MB / ${totalMb} MB`);
              } else {
                sendProgress('download', Math.min(60, Math.round(receivedBytes / 50000)), `Downloading... ${mb} MB`);
              }
            });
            res.on('end', () => {
              delete activeDownloads[packName];
              file.end();
              file.on('finish', resolve);
            });
            res.on('error', (err) => { delete activeDownloads[packName]; reject(err); });
          }).on('error', (err) => { delete activeDownloads[packName]; reject(err); });
        };
        download(zipUrl);
      });

      sendProgress('extract', 75, 'Extracting files...');

      // Extract to temp folder
      const tmpExtract = path.join(os.tmpdir(), `hdpack-${packName}-extract`);
      if (fs.existsSync(tmpExtract)) {
        fs.rmSync(tmpExtract, { recursive: true, force: true });
      }
      fs.mkdirSync(tmpExtract, { recursive: true });
      await extractZip(tmpZip, tmpExtract, (pct, file) => {
        sendProgress('extract', 75 + Math.round(pct * 0.15), `Extracting... ${pct}% — ${path.basename(file)}`);
      });

      // GitHub ZIPs extract to a folder like "RepoName-main/" — find it
      const extracted = fs.readdirSync(tmpExtract);
      let innerDir = extracted.length === 1 && fs.statSync(path.join(tmpExtract, extracted[0])).isDirectory()
        ? path.join(tmpExtract, extracted[0])
        : tmpExtract;

      // Some HD packs nest the actual DAT folders (ROM/, ROM2/, etc.) inside a
      // subfolder. Detect this and unwrap one more level so XIPivot finds the
      // ROM directories directly inside the overlay folder.
      const innerContents = fs.readdirSync(innerDir);
      const subDirs = innerContents.filter(f => fs.statSync(path.join(innerDir, f)).isDirectory());
      const isDatDir = (name) => /^(ROM|sound)\d*$/i.test(name);
      const hasRomDirs = subDirs.some(d => isDatDir(d));
      if (!hasRomDirs && subDirs.length === 1) {
        const candidate = path.join(innerDir, subDirs[0]);
        const candidateContents = fs.readdirSync(candidate);
        if (candidateContents.some(f => isDatDir(f))) {
          innerDir = candidate;
        }
      }

      // If a specific subdirectory was requested (e.g. XiView variant), use it
      if (subdir) {
        const subPath = path.join(innerDir, subdir);
        if (!fs.existsSync(subPath)) {
          return { success: false, error: `Subdirectory "${subdir}" not found in the repository.` };
        }
        innerDir = subPath;
      }

      sendProgress('copy', 85, 'Moving files to DATs folder...');

      // Move to DATs/[packName] — avoid file-by-file copy which crashes on 232K+ files
      const destDir = path.join(datsRoot, packName);
      if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
      if (!fs.existsSync(datsRoot)) fs.mkdirSync(datsRoot, { recursive: true });

      let moved = false;
      // Try instant rename first (works if same volume)
      try {
        fs.renameSync(innerDir, destDir);
        moved = true;
      } catch {}

      if (!moved) {
        // Fall back to robocopy (native Windows bulk move — handles cross-drive, much faster than Node)
        try {
          execSync(`robocopy "${innerDir}" "${destDir}" /E /MOVE /NFL /NDL /NJH /NJS /NS /NC /R:1 /W:0`, { timeout: 600000 });
          moved = true;
        } catch (e) {
          // robocopy returns exit code 1 for success with files copied — only 8+ is a real error
          if (e.status < 8) moved = true;
        }
      }

      if (!moved) {
        // Last resort: file-by-file copy
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        copyRecursive(innerDir, destDir);
      }

      const fileCount = countFiles(destDir);

      sendProgress('done', 100, `Installed — ${fileCount} files`);

      try { fs.unlinkSync(tmpZip); } catch (e) { console.error('[install-hdpack] cleanup', e.message); }
      try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch {}

      return {
        success: true,
        message: `${packName} installed — ${fileCount} files extracted to ${destDir}`
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Install an HD pack from a user-selected local zip (for Nexus-only packs)
  ipcMain.handle('install-hdpack-manual', async (_, ashitaPath, packName) => {
    try {
      const downloadsPath = app.getPath('downloads');
      const { filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: `Select ${packName} zip file`,
        defaultPath: downloadsPath,
        filters: [{ name: 'Zip Archives', extensions: ['zip'] }],
        properties: ['openFile']
      });

      if (!filePaths || filePaths.length === 0) {
        return { success: false, error: 'No file selected.' };
      }

      const zipPath = filePaths[0];

      const pivotIni = path.join(ashitaPath, 'config', 'pivot', 'pivot.ini');
      let datsRoot = path.join(ashitaPath, 'polplugins', 'DATs');
      if (fs.existsSync(pivotIni)) {
        const iniContent = fs.readFileSync(pivotIni, 'utf-8');
        const rootMatch = iniContent.match(/root_path\s*=\s*(.+)/i);
        if (rootMatch && rootMatch[1].trim()) datsRoot = rootMatch[1].trim();
      }

      const sendProgress = (phase, percent, detail) => {
        try { mainWindow?.webContents?.send('hdpack-progress', packName, phase, percent, detail); } catch {}
      };

      sendProgress('extract', 10, 'Extracting files...');

      const tmpExtract = path.join(os.tmpdir(), `hdpack-${packName}-extract`);
      if (fs.existsSync(tmpExtract)) {
        fs.rmSync(tmpExtract, { recursive: true, force: true });
      }
      fs.mkdirSync(tmpExtract, { recursive: true });
      await extractZip(zipPath, tmpExtract, (pct, file) => {
        sendProgress('extract', 10 + Math.round(pct * 0.6), `Extracting... ${pct}% — ${path.basename(file)}`);
      });

      // Find the inner directory with ROM folders
      const extracted = fs.readdirSync(tmpExtract);
      let innerDir = extracted.length === 1 && fs.statSync(path.join(tmpExtract, extracted[0])).isDirectory()
        ? path.join(tmpExtract, extracted[0])
        : tmpExtract;

      const innerContents = fs.readdirSync(innerDir);
      const subDirs = innerContents.filter(f => fs.statSync(path.join(innerDir, f)).isDirectory());
      const isDatDir = (name) => /^(ROM|sound)\d*$/i.test(name);
      const hasRomDirs = subDirs.some(d => isDatDir(d));
      if (!hasRomDirs && subDirs.length === 1) {
        const candidate = path.join(innerDir, subDirs[0]);
        const candidateContents = fs.readdirSync(candidate);
        if (candidateContents.some(f => isDatDir(f))) {
          innerDir = candidate;
        }
      }

      sendProgress('copy', 75, 'Moving files to DATs folder...');

      const destDir = path.join(datsRoot, packName);
      if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
      if (!fs.existsSync(datsRoot)) fs.mkdirSync(datsRoot, { recursive: true });

      let moved = false;
      try {
        fs.renameSync(innerDir, destDir);
        moved = true;
      } catch {}

      if (!moved) {
        try {
          execSync(`robocopy "${innerDir}" "${destDir}" /E /MOVE /NFL /NDL /NJH /NJS /NS /NC /R:1 /W:0`, { timeout: 600000 });
          moved = true;
        } catch (e) {
          if (e.status < 8) moved = true;
        }
      }

      if (!moved) {
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        copyRecursive(innerDir, destDir);
      }

      const fileCount = countFiles(destDir);

      sendProgress('done', 100, `Installed — ${fileCount} files`);

      try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch {}

      return {
        success: true,
        message: `${packName} installed — ${fileCount} files extracted to ${destDir}`
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Pause/resume/cancel active HD pack downloads
  ipcMain.handle('hdpack-pause', (_, packName) => {
    const dl = activeDownloads[packName];
    if (dl?.response) { dl.response.pause(); return { success: true }; }
    return { success: false };
  });

  ipcMain.handle('hdpack-resume', (_, packName) => {
    const dl = activeDownloads[packName];
    if (dl?.response) { dl.response.resume(); return { success: true }; }
    return { success: false };
  });

  ipcMain.handle('hdpack-cancel', (_, packName) => {
    const dl = activeDownloads[packName];
    if (dl) {
      dl.cancelled = true;
      try { dl.response.destroy(); } catch {}
      try { dl.file.destroy(); } catch {}
      delete activeDownloads[packName];
      return { success: true };
    }
    return { success: false };
  });

  // Download and install an HD pack from a GitHub release asset (e.g. Remapster)
  ipcMain.handle('install-hdpack-release', async (_, ashitaPath, packName, repoUrl, resolution) => {



    try {
      const pivotIni = path.join(ashitaPath, 'config', 'pivot', 'pivot.ini');
      let datsRoot = path.join(ashitaPath, 'polplugins', 'DATs');
      if (fs.existsSync(pivotIni)) {
        const iniContent = fs.readFileSync(pivotIni, 'utf-8');
        const rootMatch = iniContent.match(/root_path\s*=\s*(.+)/i);
        if (rootMatch && rootMatch[1].trim()) datsRoot = rootMatch[1].trim();
      }

      const repoPath = repoUrl.replace('https://github.com/', '');

      const sendProgress = (phase, percent, detail) => {
        try { mainWindow?.webContents?.send('hdpack-progress', packName, phase, percent, detail); } catch {}
      };

      sendProgress('download', 0, 'Fetching latest release...');

      // Get latest release from GitHub API
      const releases = await new Promise((resolve, reject) => {
        https.get({
          hostname: 'api.github.com',
          path: `/repos/${repoPath}/releases`,
          headers: { 'User-Agent': 'XI-Launcher' }
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch { reject(new Error('Failed to parse releases')); }
          });
        }).on('error', reject);
      });

      if (!Array.isArray(releases) || releases.length === 0) {
        return { success: false, error: 'No releases found for this repository.' };
      }

      // Find the latest release (first in list)
      const release = releases[0];

      // Find the dats asset matching the resolution (e.g. remapster-dats-pack-1-2-2048.zip)
      const resStr = resolution || '2048';
      let asset = release.assets.find(a => a.name.includes('dats') && a.name.includes(resStr) && a.name.endsWith('.zip'));
      // Fallback: if no resolution-specific asset, grab the first .zip asset
      if (!asset) {
        asset = release.assets.find(a => a.name.endsWith('.zip'));
      }
      if (!asset) {
        const available = release.assets.map(a => a.name).join(', ');
        return { success: false, error: `No downloadable asset found. Available: ${available}` };
      }

      sendProgress('download', 5, `Downloading ${asset.name} (${(asset.size / 1048576).toFixed(1)} MB)...`);

      // Download the release asset
      const tmpZip = path.join(os.tmpdir(), `hdpack-${packName}.zip`);
      await new Promise((resolve, reject) => {
        const download = (url) => {
          const urlObj = new URL(url);
          const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            headers: { 'User-Agent': 'XI-Launcher', 'Accept': 'application/octet-stream' }
          };
          https.get(options, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
              return download(res.headers.location);
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`Download failed with status ${res.statusCode}`));
            }
            const totalBytes = parseInt(res.headers['content-length'] || String(asset.size), 10);
            let receivedBytes = 0;
            const file = fs.createWriteStream(tmpZip);
            activeDownloads[packName] = { response: res, file, cancelled: false };
            res.on('data', (chunk) => {
              if (activeDownloads[packName]?.cancelled) return;
              receivedBytes += chunk.length;
              file.write(chunk);
              const mb = (receivedBytes / 1048576).toFixed(1);
              const totalMb = (totalBytes / 1048576).toFixed(1);
              const pct = totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 70) : Math.min(60, Math.round(receivedBytes / 50000));
              sendProgress('download', pct, `Downloading... ${mb} MB / ${totalMb} MB`);
            });
            res.on('end', () => {
              delete activeDownloads[packName];
              file.end();
              file.on('finish', resolve);
            });
            res.on('error', (err) => { delete activeDownloads[packName]; reject(err); });
          }).on('error', (err) => { delete activeDownloads[packName]; reject(err); });
        };
        download(asset.browser_download_url);
      });

      sendProgress('extract', 75, 'Extracting files...');

      const tmpExtract = path.join(os.tmpdir(), `hdpack-${packName}-extract`);
      if (fs.existsSync(tmpExtract)) {
        fs.rmSync(tmpExtract, { recursive: true, force: true });
      }
      fs.mkdirSync(tmpExtract, { recursive: true });
      await extractZip(tmpZip, tmpExtract, (pct, file) => {
        sendProgress('extract', 75 + Math.round(pct * 0.15), `Extracting... ${pct}% — ${path.basename(file)}`);
      });

      // Look for a 'dats' subfolder inside the extracted content — that's what XIPivot needs
      const extracted = fs.readdirSync(tmpExtract);
      let sourceDir = tmpExtract;
      // Check for nested folder (e.g. the zip might have a root folder)
      if (extracted.length === 1 && fs.statSync(path.join(tmpExtract, extracted[0])).isDirectory()) {
        sourceDir = path.join(tmpExtract, extracted[0]);
      }
      // If there's a 'dats' subfolder, use that as the source
      const datsSubfolder = path.join(sourceDir, 'dats');
      if (fs.existsSync(datsSubfolder) && fs.statSync(datsSubfolder).isDirectory()) {
        sourceDir = datsSubfolder;
      }

      sendProgress('copy', 85, 'Moving files to DATs folder...');

      const destDir = path.join(datsRoot, packName);
      if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
      if (!fs.existsSync(datsRoot)) fs.mkdirSync(datsRoot, { recursive: true });

      let moved = false;
      try {
        fs.renameSync(sourceDir, destDir);
        moved = true;
      } catch {}

      if (!moved) {
        try {
          execSync(`robocopy "${sourceDir}" "${destDir}" /E /MOVE /NFL /NDL /NJH /NJS /NS /NC /R:1 /W:0`, { timeout: 600000 });
          moved = true;
        } catch (e) {
          if (e.status < 8) moved = true;
        }
      }

      if (!moved) {
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        copyRecursive(sourceDir, destDir);
      }

      const fileCount = countFiles(destDir);

      sendProgress('done', 100, `Installed — ${fileCount} files`);

      try { fs.unlinkSync(tmpZip); } catch (e) { console.error('[install-hdpack-release] cleanup', e.message); }
      try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch (e) { console.error('[install-hdpack-release] cleanup', e.message); }

      return {
        success: true,
        message: `${packName} installed — ${fileCount} files extracted to ${destDir}`
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── dgVoodoo2 Setup ──

  // Whitelist for dgVoodoo config values
  const DGV_ALLOWED = {
    outputAPI: ['d3d11', 'd3d12'],
    scalingMode: ['stretched_ar', 'stretched', 'centered', 'unspecified'],
    msaa: ['off', '2x', '4x', '8x'],
    anisotropic: ['off', '2x', '4x', '8x', '16x'],
    resolution: ['app_controlled', '1920x1080', '2560x1440', '3840x2160'],
    depthBuffer: ['appdriven', 'forcemin24bit', 'force32bit'],
    vram: ['512', '1024', '2048', '4096'],
    fpsLimit: ['0', '30', '60', '120'],
    fullscreenAttr: ['default', 'fake'],
    resampling: ['pointsampled', 'bilinear', 'bicubic', 'lanczos-2', 'lanczos-3'],
    mipmapping: ['appdriven', 'disabled', 'autogen_bilinear']
  };

  function validateStoredFfxiPath(ffxiPath) {
    const stored = store?.get('ffxiPath');
    if (!stored || path.resolve(ffxiPath) !== path.resolve(stored)) {
      throw new Error('FFXI path does not match stored configuration');
    }
  }

  ipcMain.handle('download-dgvoodoo', async () => {
    const destDir = path.join(runtimeDir, 'dgvoodoo');
    try {
      const sendProgress = (percent, detail) => {
        try { mainWindow?.webContents?.send('dgvoodoo-download-progress', percent, detail); } catch {}
      };

      sendProgress(0, 'Fetching latest release info...');

      // Query GitHub API for latest release
      const releaseInfo = await new Promise((resolve, reject) => {
        https.get('https://api.github.com/repos/dege-diosg/dgVoodoo2/releases/latest', {
          headers: { 'User-Agent': 'XI-Launcher', 'Accept': 'application/vnd.github.v3+json' }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode !== 200) return reject(new Error(`GitHub API returned ${res.statusCode}`));
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
          });
          res.on('error', reject);
        }).on('error', reject);
      });

      // Find the main zip (not _dbg, _dev64, or API)
      const asset = releaseInfo.assets?.find(a =>
        a.name.endsWith('.zip') &&
        !a.name.includes('_dbg') &&
        !a.name.includes('_dev') &&
        !a.name.toLowerCase().includes('api') &&
        !a.name.includes('source')
      );
      if (!asset) return { success: false, error: 'Could not find the main dgVoodoo2 ZIP in the latest release' };

      sendProgress(5, `Downloading ${asset.name}...`);

      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      const tmpZip = path.join(os.tmpdir(), asset.name);

      // Download the zip
      await new Promise((resolve, reject) => {
        const download = (url) => {
          https.get(url, { headers: { 'User-Agent': 'XI-Launcher' } }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
              return download(res.headers.location);
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`Download failed with status ${res.statusCode}`));
            }
            const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
            let receivedBytes = 0;
            const file = fs.createWriteStream(tmpZip);
            res.on('data', (chunk) => {
              receivedBytes += chunk.length;
              file.write(chunk);
              const mb = (receivedBytes / 1048576).toFixed(1);
              if (totalBytes > 0) {
                const pct = 5 + Math.round((receivedBytes / totalBytes) * 60);
                const totalMb = (totalBytes / 1048576).toFixed(1);
                sendProgress(pct, `Downloading... ${mb} / ${totalMb} MB`);
              } else {
                sendProgress(Math.min(60, 5 + Math.round(receivedBytes / 50000)), `Downloading... ${mb} MB`);
              }
            });
            res.on('end', () => { file.end(); file.on('finish', resolve); });
            res.on('error', reject);
          }).on('error', reject);
        };
        download(asset.browser_download_url);
      });

      sendProgress(70, 'Extracting...');

      // Clear old contents and extract
      if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
      fs.mkdirSync(destDir, { recursive: true });

      await extractZip(tmpZip, destDir);

      sendProgress(90, 'Cleaning up...');
      try { fs.unlinkSync(tmpZip); } catch {}

      // Verify D3D8.dll exists
      const d3d8 = path.join(destDir, 'MS', 'x86', 'D3D8.dll');
      if (!fs.existsSync(d3d8)) {
        return { success: false, error: 'Download completed but MS\\x86\\D3D8.dll not found. The release structure may have changed.' };
      }

      sendProgress(100, 'dgVoodoo2 downloaded successfully');
      return { success: true, path: destDir, version: releaseInfo.tag_name || asset.name };
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
        return { success: false, error: 'Network error: Could not reach GitHub. Check your internet connection.' };
      }
      return { success: false, error: `Download failed: ${msg}` };
    }
  });

  ipcMain.handle('get-dgvoodoo-path', async () => {
    const destDir = path.join(runtimeDir, 'dgvoodoo');
    const exists = fs.existsSync(path.join(destDir, 'MS', 'x86', 'D3D8.dll'));
    return { path: destDir, exists };
  });

  // Helper: get all directories where dgVoodoo files should be placed
  // dgVoodoo D3D8.dll must be next to the exe that creates the Direct3D8 device.
  // With Ashita+xiloader, that's the xiloader dir (xiloader.exe process loads d3d8).
  // We also place in FFXI dir and bootloader for standalone/pol.exe launches.
  function getDgVoodooTargetDirs(ffxiPath) {
    const dirs = [];
    if (ffxiPath) dirs.push(ffxiPath);
    const ashitaPath = store?.get('ashitaPath');
    if (ashitaPath) {
      const bootDir = path.join(ashitaPath, 'bootloader');
      if (fs.existsSync(bootDir) && !dirs.includes(bootDir)) dirs.push(bootDir);
    }
    const xiloaderPath = store?.get('xiloaderPath');
    if (xiloaderPath && fs.existsSync(xiloaderPath) && !dirs.includes(xiloaderPath)) {
      dirs.push(xiloaderPath);
    }
    return dirs;
  }

  ipcMain.handle('check-dgvoodoo', async (_, ffxiPath) => {
    try {
      // Check both FFXI dir and Ashita bootloader dir
      const dirs = getDgVoodooTargetDirs(ffxiPath);
      const d3d8Exists = dirs.some(d => fs.existsSync(path.join(d, 'D3D8.dll')));
      const confExists = dirs.some(d => fs.existsSync(path.join(d, 'dgVoodoo.conf')));
      const cplExists = dirs.some(d => fs.existsSync(path.join(d, 'dgVoodooCpl.exe')));
      return { d3d8Exists, confExists, cplExists };
    } catch {
      return { d3d8Exists: false, confExists: false, cplExists: false };
    }
  });

  ipcMain.handle('copy-dgvoodoo-files', async (_, sourcePath, ffxiPath) => {
    try {
      if (!sourcePath || !ffxiPath) return { success: false, error: 'Missing paths' };
      validateStoredFfxiPath(ffxiPath);

      const d3d8Src = path.join(sourcePath, 'MS', 'x86', 'D3D8.dll');
      if (!fs.existsSync(d3d8Src)) return { success: false, error: 'D3D8.dll not found in MS\\x86\\ — wrong folder?' };

      const cplSrc = path.join(sourcePath, 'dgVoodooCpl.exe');
      const dirs = getDgVoodooTargetDirs(ffxiPath);
      const copied = [];

      for (const dir of dirs) {
        fs.copyFileSync(d3d8Src, path.join(dir, 'D3D8.dll'));
        if (fs.existsSync(cplSrc)) {
          fs.copyFileSync(cplSrc, path.join(dir, 'dgVoodooCpl.exe'));
        }
        copied.push(dir);
      }

      return { success: true, message: `Files copied to: ${copied.join(', ')}` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('read-dgvoodoo-conf', async (_, ffxiPath) => {
    try {
      if (!ffxiPath) return { success: false };
      const dirs = getDgVoodooTargetDirs(ffxiPath);
      for (const dir of dirs) {
        const confPath = path.join(dir, 'dgVoodoo.conf');
        if (fs.existsSync(confPath)) {
          const content = fs.readFileSync(confPath, 'utf-8');
          const get = (key, fallback) => {
            const m = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)`, 'mi'));
            return m ? m[1].trim() : fallback;
          };
          const toBool = (v) => v === 'true';
          const resolution = get('Resolution', 'unforced');
          const filtering = get('Filtering', 'appdriven');
          const antialiasing = get('Antialiasing', 'appdriven');
          // Parse Mipmapping key (v2.8x format), fall back to legacy DisableMipmapping
          const mipmapVal = get('Mipmapping', '');
          const legacyDisableMipmap = toBool(get('DisableMipmapping', 'false'));
          let mipmapping = 'appdriven';
          if (mipmapVal) {
            mipmapping = mipmapVal; // already correct: 'appdriven', 'disabled', 'autogen_bilinear', etc.
          } else if (legacyDisableMipmap) {
            mipmapping = 'disabled';
          }
          // Parse Filtering: could be 'appdriven', 'bilinear', etc. or an integer (1-16) for AF
          let afVal = 'off';
          if (filtering === 'appdriven' || filtering === 'pointsampled' || filtering === 'bilinear' || filtering === 'trilinear') {
            afVal = 'off';
          } else {
            // Could be integer like '16' or old format like '16x'
            const num = parseInt(filtering, 10);
            if (num >= 2 && num <= 16) afVal = num + 'x';
            else if (filtering.endsWith('x')) afVal = filtering;
            else afVal = 'off';
          }
          return {
            success: true,
            settings: {
              outputAPI: get('OutputAPI', 'd3d11').includes('d3d12') || get('OutputAPI', '') === 'bestavailable' ? 'd3d12' : 'd3d11',
              scalingMode: get('ScalingMode', 'stretched_ar'),
              watermark: toBool(get('dgVoodooWatermark', 'false')),
              msaa: (antialiasing === 'appdriven' || antialiasing === 'off') ? 'off' : antialiasing,
              anisotropic: afVal,
              vsync: toBool(get('ForceVerticalSync', 'false')),
              resolution: resolution === 'unforced' ? 'app_controlled' : resolution,
              depthBuffer: get('DepthBuffersBitDepth', 'forcemin24bit'),
              fastVram: toBool(get('FastVideoMemoryAccess', 'false')),
              keepFilter: toBool(get('KeepFilterIfPointSampled', 'false')),
              vram: get('VRAM', '2048'),
              fpsLimit: get('FPSLimit', '0'),
              fullscreenAttr: get('FullscreenAttributes', '').includes('fake') ? 'fake' : 'default',
              resampling: get('Resampling', 'bilinear'),
              mipmapping: mipmapping,
              captureMouse: toBool(get('CaptureMouse', 'false')),
            }
          };
        }
      }
      return { success: false };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('write-dgvoodoo-conf', async (_, ffxiPath, settings) => {
    try {
      if (!ffxiPath) return { success: false, error: 'FFXI path not set' };
      validateStoredFfxiPath(ffxiPath);

      // Validate all string settings against whitelists
      const outputAPI = DGV_ALLOWED.outputAPI.includes(settings.outputAPI) ? settings.outputAPI : 'd3d11';
      const scalingMode = DGV_ALLOWED.scalingMode.includes(settings.scalingMode) ? settings.scalingMode : 'stretched_ar';
      const msaa = DGV_ALLOWED.msaa.includes(settings.msaa) ? settings.msaa : '4x';
      const anisotropic = DGV_ALLOWED.anisotropic.includes(settings.anisotropic) ? settings.anisotropic : '16x';
      const resolution = DGV_ALLOWED.resolution.includes(settings.resolution) ? settings.resolution : 'app_controlled';
      const depthBuffer = DGV_ALLOWED.depthBuffer.includes(settings.depthBuffer) ? settings.depthBuffer : 'forcemin24bit';
      const vram = DGV_ALLOWED.vram.includes(settings.vram) ? settings.vram : '2048';
      const fpsLimit = DGV_ALLOWED.fpsLimit.includes(settings.fpsLimit) ? settings.fpsLimit : '0';
      const fullscreenAttr = DGV_ALLOWED.fullscreenAttr.includes(settings.fullscreenAttr) ? settings.fullscreenAttr : 'default';
      const resampling = DGV_ALLOWED.resampling.includes(settings.resampling) ? settings.resampling : 'bilinear';
      const mipmapping = DGV_ALLOWED.mipmapping.includes(settings.mipmapping) ? settings.mipmapping : 'appdriven';
      const watermark = !!settings.watermark;
      const vsync = !!settings.vsync;
      const fastVram = !!settings.fastVram;
      const keepFilter = !!settings.keepFilter;
      const captureMouse = !!settings.captureMouse;

      // Resolution: "app_controlled" => "unforced", else "WxH"
      const resValue = resolution === 'app_controlled' ? 'unforced' : resolution;

      // Convert anisotropic '16x' -> integer '16' for dgVoodoo conf format
      const afValue = anisotropic === 'off' ? 'appdriven' : anisotropic.replace('x', '');

      // Build conf lines matching dgVoodoo2 v2.8x format
      const confLines = [
        '; dgVoodoo.conf — generated by XI Launcher',
        '',
        'Version                              = 0x287',
        '',
        '[General]',
        `OutputAPI                            = ${outputAPI === 'd3d12' ? 'bestavailable' : 'd3d11_fl11_0'}`,
        'Adapters                             = all',
        'FullScreenOutput                     = default',
        'FullScreenMode                       = true',
        `ScalingMode                          = ${scalingMode}`,
        'ProgressiveScanlineOrder             = false',
        'EnumerateRefreshRates                = false',
        'Brightness                           = 100',
        'Color                                = 100',
        'Contrast                             = 100',
        'InheritColorProfileInFullScreenMode  = true',
        'KeepWindowAspectRatio                = true',
        `CaptureMouse                         = ${captureMouse ? 'true' : 'false'}`,
        'CenterAppWindow                      = false',
        '',
        '[GeneralExt]',
        `Resampling                           = ${resampling}`,
        'PresentationModel                    = auto',
        'ColorSpace                           = appdriven',
        `FullscreenAttributes                 = ${fullscreenAttr === 'fake' ? 'fake' : ''}`,
        `FPSLimit                             = ${fpsLimit}`,
        '',
        '[DirectX]',
        'DisableAndPassThru                   = false',
        'VideoCard                            = internal3D',
        `VRAM                                 = ${vram}`,
        `Filtering                            = ${afValue}`,
        `Mipmapping                           = ${mipmapping}`,
        `KeepFilterIfPointSampled             = ${keepFilter ? 'true' : 'false'}`,
        `Resolution                           = ${resValue}`,
        `Antialiasing                         = ${msaa === 'off' ? 'appdriven' : msaa}`,
        `AppControlledScreenMode              = true`,
        'DisableAltEnterToToggleScreenMode    = true',
        `ForceVerticalSync                    = ${vsync ? 'true' : 'false'}`,
        `dgVoodooWatermark                    = ${watermark ? 'true' : 'false'}`,
        `FastVideoMemoryAccess                = ${fastVram ? 'true' : 'false'}`,
        '',
        '[DirectXExt]',
        `DepthBuffersBitDepth                 = ${depthBuffer}`,
        '',
        '[Glide]',
        'DisableAndPassThru                   = true',
        '',
        '[GlideExt]',
        ''
      ];

      const conf = confLines.join('\r\n');

      const dirs = getDgVoodooTargetDirs(ffxiPath);
      for (const dir of dirs) {
        fs.writeFileSync(path.join(dir, 'dgVoodoo.conf'), conf, 'utf8');
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('launch-dgvoodoo-cpl', async (_, ffxiPath) => {
    try {
      validateStoredFfxiPath(ffxiPath);
      const dirs = getDgVoodooTargetDirs(ffxiPath);
      let cplPath = null;
      for (const dir of dirs) {
        const p = path.join(dir, 'dgVoodooCpl.exe');
        if (fs.existsSync(p)) { cplPath = p; break; }
      }
      if (!cplPath) return { success: false, error: 'dgVoodooCpl.exe not found' };
      spawn(cplPath, [], { cwd: path.dirname(cplPath), detached: true, stdio: 'ignore' }).unref();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('open-defender-settings', async () => {
    try {
      await shell.openExternal('ms-settings:windowsdefender');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('add-defender-exclusion', async (_, folderPath) => {
    try {
      if (!folderPath) return { success: false, error: 'No folder path provided' };
      const resolved = path.resolve(folderPath);
      // Use elevated PowerShell to add the exclusion
      const cmd = `powershell -Command "Start-Process powershell -ArgumentList '-Command','Add-MpPreference -ExclusionPath \\\"${escapePSString(resolved)}\\\"' -Verb RunAs -Wait"`;
      execSync(cmd, { timeout: 30000 });
      return { success: true };
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('canceled') || msg.includes('cancelled') || msg.includes('The operation was canceled')) {
        return { success: false, error: 'UAC prompt was cancelled — exclusion not added' };
      }
      return { success: false, error: `Failed to add exclusion: ${msg}` };
    }
  });

  ipcMain.handle('check-defender-exclusion', async (_, folderPath) => {
    try {
      if (!folderPath) return { excluded: false };
      const resolved = path.resolve(folderPath);
      const output = execSync('powershell -Command "(Get-MpPreference).ExclusionPath"', { timeout: 10000, encoding: 'utf8' });
      const exclusions = output.split(/\r?\n/).map(l => l.trim().toLowerCase()).filter(Boolean);
      const found = exclusions.some(ex => resolved.toLowerCase() === ex || resolved.toLowerCase().startsWith(ex + path.sep));
      return { excluded: found };
    } catch {
      return { excluded: false, error: 'Could not check exclusions' };
    }
  });

  ipcMain.handle('remove-dgvoodoo', async (_, ffxiPath) => {
    try {
      if (!ffxiPath) return { success: false, error: 'FFXI path not set' };
      validateStoredFfxiPath(ffxiPath);
      const files = ['D3D8.dll', 'dgVoodoo.conf', 'dgVoodooCpl.exe'];
      const dirs = getDgVoodooTargetDirs(ffxiPath);
      for (const dir of dirs) {
        for (const f of files) {
          const fp = path.join(dir, f);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── ReShade Setup ──

  function findFileRecursive(dir, filename) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findFileRecursive(fullPath, filename);
        if (found) return found;
      } else if (entry.name === filename) {
        return fullPath;
      }
    }
    return null;
  }

  function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDirSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  ipcMain.handle('check-reshade', async (_, ffxiPath) => {
    try {
      validateStoredFfxiPath(ffxiPath);
      const dllPath = path.join(ffxiPath, 'dxgi.dll');
      const disabledPath = path.join(ffxiPath, 'dxgi.dll.disabled');
      const shadersPath = path.join(ffxiPath, 'reshade-shaders');
      const iniPath = path.join(ffxiPath, 'ReShade.ini');
      const dgvD3D8 = path.join(ffxiPath, 'D3D8.dll');

      const dllExists = fs.existsSync(dllPath);
      const disabledExists = fs.existsSync(disabledPath);
      const installed = dllExists || disabledExists;
      const enabled = dllExists && !disabledExists;
      const shadersExist = fs.existsSync(shadersPath);
      const iniExists = fs.existsSync(iniPath);
      const dgvReady = fs.existsSync(dgvD3D8);

      return { installed, enabled, shadersExist, iniExists, dgvReady };
    } catch (e) {
      return { installed: false, enabled: false, shadersExist: false, iniExists: false, dgvReady: false, error: e.message };
    }
  });

  ipcMain.handle('download-reshade', async () => {
    const destDir = path.join(runtimeDir, 'reshade');
    try {
      const sendProgress = (percent, detail) => {
        try { mainWindow?.webContents?.send('reshade-download-progress', percent, detail); } catch {}
      };

      sendProgress(0, 'Fetching latest release info...');

      const releaseInfo = await new Promise((resolve, reject) => {
        https.get('https://api.github.com/repos/crosire/reshade/releases/latest', {
          headers: { 'User-Agent': 'XI-Launcher', 'Accept': 'application/vnd.github.v3+json' }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode !== 200) return reject(new Error(`GitHub API returned ${res.statusCode}`));
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
          });
          res.on('error', reject);
        }).on('error', reject);
      });

      const asset = releaseInfo.assets?.find(a =>
        a.name.endsWith('.exe') && a.name.includes('Addon')
      ) || releaseInfo.assets?.find(a =>
        a.name.endsWith('.exe') && a.name.includes('Setup')
      );
      if (!asset) return { success: false, error: 'Could not find ReShade installer in the latest release' };

      sendProgress(5, `Downloading ${asset.name}...`);

      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      const tmpFile = path.join(os.tmpdir(), asset.name);

      await new Promise((resolve, reject) => {
        const download = (url) => {
          https.get(url, { headers: { 'User-Agent': 'XI-Launcher' } }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
              return download(res.headers.location);
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`Download failed with status ${res.statusCode}`));
            }
            const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
            let receivedBytes = 0;
            const file = fs.createWriteStream(tmpFile);
            res.on('data', (chunk) => {
              receivedBytes += chunk.length;
              file.write(chunk);
              const mb = (receivedBytes / 1048576).toFixed(1);
              if (totalBytes > 0) {
                const pct = 5 + Math.round((receivedBytes / totalBytes) * 60);
                const totalMb = (totalBytes / 1048576).toFixed(1);
                sendProgress(pct, `Downloading... ${mb} / ${totalMb} MB`);
              } else {
                sendProgress(Math.min(60, 5 + Math.round(receivedBytes / 50000)), `Downloading... ${mb} MB`);
              }
            });
            res.on('end', () => { file.end(); file.on('finish', resolve); });
            res.on('error', reject);
          }).on('error', reject);
        };
        download(asset.browser_download_url);
      });

      sendProgress(70, 'Extracting ReShade DLL...');

      if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
      fs.mkdirSync(destDir, { recursive: true });

      await extractZip(tmpFile, destDir);

      sendProgress(90, 'Cleaning up...');
      try { fs.unlinkSync(tmpFile); } catch {}

      const dll32 = path.join(destDir, 'ReShade32.dll');
      if (!fs.existsSync(dll32)) {
        const found = findFileRecursive(destDir, 'ReShade32.dll');
        if (found) {
          fs.copyFileSync(found, dll32);
        } else {
          return { success: false, error: 'Download completed but ReShade32.dll not found. The release structure may have changed.' };
        }
      }

      sendProgress(100, 'ReShade downloaded successfully');
      return { success: true, path: destDir, version: releaseInfo.tag_name || asset.name };
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
        return { success: false, error: 'Network error: Could not reach GitHub. Check your internet connection.' };
      }
      return { success: false, error: `Download failed: ${msg}` };
    }
  });

  ipcMain.handle('install-reshade', async (_, ffxiPath) => {
    try {
      validateStoredFfxiPath(ffxiPath);
      const cacheDir = path.join(runtimeDir, 'reshade');
      const dll32 = path.join(cacheDir, 'ReShade32.dll');

      if (!fs.existsSync(dll32)) {
        return { success: false, error: 'ReShade not downloaded yet. Download first.' };
      }

      fs.copyFileSync(dll32, path.join(ffxiPath, 'dxgi.dll'));

      const srcShaders = path.join(cacheDir, 'reshade-shaders');
      const destShaders = path.join(ffxiPath, 'reshade-shaders');
      if (fs.existsSync(srcShaders)) {
        if (fs.existsSync(destShaders)) fs.rmSync(destShaders, { recursive: true, force: true });
        copyDirSync(srcShaders, destShaders);
      }

      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('toggle-reshade', async (_, ffxiPath, enable) => {
    try {
      validateStoredFfxiPath(ffxiPath);
      const dllPath = path.join(ffxiPath, 'dxgi.dll');
      const disabledPath = path.join(ffxiPath, 'dxgi.dll.disabled');

      if (enable) {
        if (fs.existsSync(disabledPath) && !fs.existsSync(dllPath)) {
          fs.renameSync(disabledPath, dllPath);
        }
      } else {
        if (fs.existsSync(dllPath)) {
          if (fs.existsSync(disabledPath)) fs.unlinkSync(disabledPath);
          fs.renameSync(dllPath, disabledPath);
        }
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('write-reshade-config', async (_, ffxiPath, effects) => {
    try {
      validateStoredFfxiPath(ffxiPath);

      const enabledEffects = [];
      if (effects.sharpening?.enabled) enabledEffects.push('LumaSharpen.fx');
      if (effects.saturation?.enabled) enabledEffects.push('Vibrance.fx');
      if (effects.bloom?.enabled) enabledEffects.push('Bloom.fx');
      if (effects.filmGrain?.enabled) enabledEffects.push('FilmGrain.fx');
      if (effects.ambientOcclusion?.enabled) enabledEffects.push('MXAO.fx');

      const lines = [
        '; ReShade.ini — generated by XI Launcher',
        '; Do not edit manually — changes will be overwritten',
        '',
        '[GENERAL]',
        'EffectSearchPaths=.\\reshade-shaders\\Shaders',
        'TextureSearchPaths=.\\reshade-shaders\\Textures',
        'PreprocessorDefinitions=',
        `Effects=${enabledEffects.join(',')}`,
        '',
        '[LumaSharpen.fx]',
        `sharp_strength=${(effects.sharpening?.value ?? 0.60).toFixed(2)}`,
        '',
        '[Vibrance.fx]',
        `Vibrance=${(effects.saturation?.value ?? 0.50).toFixed(2)}`,
        '',
        '[Bloom.fx]',
        `BloomIntensity=${(effects.bloom?.value ?? 0.20).toFixed(2)}`,
        '',
        '[FilmGrain.fx]',
        `Intensity=${(effects.filmGrain?.value ?? 0.30).toFixed(2)}`,
        '',
        '[MXAO.fx]',
        '; Ambient occlusion — toggle only, no exposed parameters',
        '',
      ];

      fs.writeFileSync(path.join(ffxiPath, 'ReShade.ini'), lines.join('\r\n'), 'utf8');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('read-reshade-config', async (_, ffxiPath) => {
    try {
      validateStoredFfxiPath(ffxiPath);
      const iniPath = path.join(ffxiPath, 'ReShade.ini');
      if (!fs.existsSync(iniPath)) return { success: false, error: 'ReShade.ini not found' };

      const content = fs.readFileSync(iniPath, 'utf8');
      const lines = content.split(/\r?\n/);

      let currentSection = '';
      const sections = {};

      for (const line of lines) {
        const sectionMatch = line.match(/^\[(.+)\]$/);
        if (sectionMatch) {
          currentSection = sectionMatch[1];
          sections[currentSection] = {};
          continue;
        }
        const kvMatch = line.match(/^(\w+)\s*=\s*(.*)$/);
        if (kvMatch && currentSection) {
          sections[currentSection][kvMatch[1]] = kvMatch[2];
        }
      }

      const enabledList = (sections['GENERAL']?.Effects || '').split(',').map(s => s.trim()).filter(Boolean);

      const effects = {
        sharpening: {
          enabled: enabledList.includes('LumaSharpen.fx'),
          value: parseFloat(sections['LumaSharpen.fx']?.sharp_strength) || 0.60,
        },
        saturation: {
          enabled: enabledList.includes('Vibrance.fx'),
          value: parseFloat(sections['Vibrance.fx']?.Vibrance) || 0.50,
        },
        bloom: {
          enabled: enabledList.includes('Bloom.fx'),
          value: parseFloat(sections['Bloom.fx']?.BloomIntensity) || 0.20,
        },
        filmGrain: {
          enabled: enabledList.includes('FilmGrain.fx'),
          value: parseFloat(sections['FilmGrain.fx']?.Intensity) || 0.30,
        },
        ambientOcclusion: {
          enabled: enabledList.includes('MXAO.fx'),
        },
      };

      return { success: true, effects };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Community addon install/update from GitHub
  ipcMain.handle('install-addon', async (_, ashitaPath, addonName, repo, subdir, useRelease, releaseFolder, isPlugin) => {
    try {
      const sendProgress = (percent, detail) => {
        try { mainWindow?.webContents?.send('addon-progress', addonName, percent, detail); } catch {}
      };

      sendProgress(0, 'Fetching repo info...');

      let zipUrl;
      let branch = 'main';

      if (useRelease) {
        // Try to get the latest release with assets
        const releaseInfo = await new Promise((resolve, reject) => {
          https.get({
            hostname: 'api.github.com',
            path: `/repos/${repo}/releases/latest`,
            headers: { 'User-Agent': 'XI-Launcher' }
          }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(data)); }
              catch { resolve(null); }
            });
          }).on('error', () => resolve(null));
        });

        if (releaseInfo && releaseInfo.assets && releaseInfo.assets.length > 0) {
          // Pick the first .zip asset (skip horizon-specific builds)
          const asset = releaseInfo.assets.find(a => a.name.endsWith('.zip') && !a.name.includes('horizon')) || releaseInfo.assets.find(a => a.name.endsWith('.zip'));
          if (asset) {
            zipUrl = asset.browser_download_url;
            sendProgress(5, `Downloading release ${releaseInfo.tag_name}...`);
          }
        }
      }

      if (!zipUrl) {
        // Fallback to source ZIP
        const repoInfo = await new Promise((resolve, reject) => {
          https.get({
            hostname: 'api.github.com',
            path: `/repos/${repo}`,
            headers: { 'User-Agent': 'XI-Launcher' }
          }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(data)); }
              catch { reject(new Error('Failed to parse repo info')); }
            });
          }).on('error', reject);
        });

        if (repoInfo.message === 'Not Found') {
          return { success: false, error: `Repository ${repo} not found on GitHub.` };
        }

        branch = repoInfo.default_branch || 'main';
        zipUrl = `https://github.com/${repo}/archive/refs/heads/${branch}.zip`;
        sendProgress(5, 'Downloading...');
      }

      // Download ZIP to temp
      const tmpZip = path.join(os.tmpdir(), `addon-${addonName}.zip`);
      await new Promise((resolve, reject) => {
        const download = (url) => {
          const mod = url.startsWith('https') ? https : require('http');
          mod.get(url, { headers: { 'User-Agent': 'XI-Launcher' } }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
              return download(res.headers.location);
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`Download failed with status ${res.statusCode}`));
            }
            const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
            let receivedBytes = 0;
            const file = fs.createWriteStream(tmpZip);
            res.on('data', (chunk) => {
              receivedBytes += chunk.length;
              file.write(chunk);
              const mb = (receivedBytes / 1048576).toFixed(1);
              if (totalBytes > 0) {
                const pct = 5 + Math.round((receivedBytes / totalBytes) * 55);
                const totalMb = (totalBytes / 1048576).toFixed(1);
                sendProgress(pct, `Downloading... ${mb} / ${totalMb} MB`);
              } else {
                sendProgress(Math.min(50, 5 + Math.round(receivedBytes / 20000)), `Downloading... ${mb} MB`);
              }
            });
            res.on('end', () => { file.end(); file.on('finish', resolve); });
            res.on('error', reject);
          }).on('error', reject);
        };
        download(zipUrl);
      });

      sendProgress(65, 'Extracting...');

      // Extract to temp
      const tmpExtract = path.join(os.tmpdir(), `addon-${addonName}-extract`);
      if (fs.existsSync(tmpExtract)) {
        fs.rmSync(tmpExtract, { recursive: true, force: true });
      }
      fs.mkdirSync(tmpExtract, { recursive: true });
      await extractZip(tmpZip, tmpExtract);

      // GitHub ZIPs have a top-level folder like "RepoName-main/"
      const extracted = fs.readdirSync(tmpExtract);
      let innerDir = extracted.length === 1 && fs.statSync(path.join(tmpExtract, extracted[0])).isDirectory()
        ? path.join(tmpExtract, extracted[0])
        : tmpExtract;

      // If a subdir is specified (monorepo), use that subfolder as the source
      if (subdir) {
        const subPath = path.join(innerDir, subdir);
        if (!fs.existsSync(subPath)) {
          return { success: false, error: `Subdirectory "${subdir}" not found in the repository.` };
        }
        innerDir = subPath;
      }

      // For release ZIPs, look for the addon folder inside (e.g. XIUI/ inside XIUI-1.7.5.zip)
      if (useRelease && releaseFolder) {
        const relPath = path.join(innerDir, releaseFolder);
        if (fs.existsSync(relPath) && fs.statSync(relPath).isDirectory()) {
          innerDir = relPath;
        }
      }

      sendProgress(78, `Installing to ${isPlugin ? 'plugins' : 'addons'} folder...`);

      // Determine destination: plugins/ for plugins, addons/ for addons
      const destBase = isPlugin ? 'plugins' : 'addons';
      const destDir = path.join(ashitaPath, destBase, addonName);

      // Back up user config files before overwriting
      const configBackupDir = path.join(os.tmpdir(), 'xi-addon-backup-' + addonName + '-' + Date.now());
      const configPatterns = ['config', 'settings', 'data'];
      const configExts = ['.ini', '.json', '.lua', '.xml'];
      const configExclude = ['manifest.json', 'package.json'];
      if (fs.existsSync(destDir)) {
        sendProgress(79, 'Preserving config files...');
        const backupFile = (dir, rel) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const ent of entries) {
            const fullPath = path.join(dir, ent.name);
            const relPath = path.join(rel, ent.name);
            if (ent.isDirectory()) {
              if (configPatterns.includes(ent.name.toLowerCase())) {
                // Back up entire config/settings/data directories
                const backupDest = path.join(configBackupDir, relPath);
                fs.mkdirSync(backupDest, { recursive: true });
                copyRecursive(fullPath, backupDest);
              } else {
                backupFile(fullPath, relPath);
              }
            } else if (configExts.includes(path.extname(ent.name).toLowerCase()) && !configExclude.includes(ent.name.toLowerCase())) {
              const backupDest = path.join(configBackupDir, relPath);
              fs.mkdirSync(path.dirname(backupDest), { recursive: true });
              fs.copyFileSync(fullPath, backupDest);
            }
          }
        };
        try { backupFile(destDir, ''); } catch (e) { console.error('[install-addon] config backup:', e.message); }
        fs.rmSync(destDir, { recursive: true, force: true });
      }
      fs.mkdirSync(destDir, { recursive: true });

      copyRecursive(innerDir, destDir);

      // Restore backed up config files
      if (fs.existsSync(configBackupDir)) {
        sendProgress(85, 'Restoring config files...');
        try { copyRecursive(configBackupDir, destDir); } catch (e) { console.error('[install-addon] config restore:', e.message); }
        try { fs.rmSync(configBackupDir, { recursive: true, force: true }); } catch {}
      }
      const fileCount = countFiles(destDir);

      sendProgress(100, `Installed — ${fileCount} files`);

      try { fs.unlinkSync(tmpZip); } catch (e) { console.error('[install-addon] cleanup', e.message); }
      try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch {}

      // Fetch latest commit SHA for version tracking
      let latestSha = null;
      try {
        latestSha = await new Promise((resolve, reject) => {
          https.get({
            hostname: 'api.github.com',
            path: `/repos/${repo}/commits?per_page=1`,
            headers: { 'User-Agent': 'XI-Launcher' }
          }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              try {
                const commits = JSON.parse(data);
                resolve(Array.isArray(commits) && commits.length > 0 ? commits[0].sha : null);
              } catch { resolve(null); }
            });
          }).on('error', () => resolve(null));
        });
      } catch { /* SHA fetch is best-effort */ }

      if (latestSha && store) {
        const shas = store.get('addonUpdateSHAs', {});
        shas[addonName] = { sha: latestSha, repo, subdir: subdir || null };
        store.set('addonUpdateSHAs', shas);
      }

      return { success: true, message: `${addonName} installed — ${fileCount} files` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Copy a directory recursively (for local dependency installation)
  ipcMain.handle('copy-dir', async (_, src, dest) => {
    try {
      if (!fs.existsSync(src)) return { success: false, error: 'Source not found' };
      fs.cpSync(src, dest, { recursive: true, force: true });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Uninstall an addon/plugin
  ipcMain.handle('uninstall-addon', async (_, ashitaPath, addonName, isPlugin) => {
    try {
      const base = isPlugin ? 'plugins' : 'addons';
      const addonDir = path.join(ashitaPath, base, addonName);
      if (!fs.existsSync(addonDir)) {
        return { success: false, error: 'Addon folder not found.' };
      }
      fs.rmSync(addonDir, { recursive: true, force: true });
      // Clean up stored SHA
      if (store) {
        const shas = store.get('addonUpdateSHAs', {});
        delete shas[addonName];
        store.set('addonUpdateSHAs', shas);
      }
      return { success: true, message: `${addonName} uninstalled.` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Check for addon updates by comparing stored SHAs against GitHub
  ipcMain.handle('check-addon-updates', async (_, addonList) => {
    try {
      if (!store) return { updates: [] };

      // Enforce 24-hour cooldown
      const lastCheck = store.get('addonUpdateLastCheck', 0);
      const now = Date.now();
      if (now - lastCheck < 24 * 60 * 60 * 1000) {
        return { updates: [], skipped: true };
      }

      const shas = store.get('addonUpdateSHAs', {});
      const updates = [];

      for (const addon of addonList) {
        const stored = shas[addon.name];
        if (!stored || !stored.sha) continue;

        try {
          const remoteSha = await new Promise((resolve, reject) => {
            https.get({
              hostname: 'api.github.com',
              path: `/repos/${addon.repo}/commits?per_page=1`,
              headers: { 'User-Agent': 'XI-Launcher' }
            }, (res) => {
              let data = '';
              res.on('data', (chunk) => data += chunk);
              res.on('end', () => {
                try {
                  const commits = JSON.parse(data);
                  resolve(Array.isArray(commits) && commits.length > 0 ? commits[0].sha : null);
                } catch { resolve(null); }
              });
            }).on('error', () => resolve(null));
          });

          if (remoteSha && remoteSha !== stored.sha) {
            updates.push({ name: addon.name, repo: addon.repo, subdir: addon.subdir || null });
          }
        } catch {
          // Skip addons that fail to check
        }
      }

      store.set('addonUpdateLastCheck', now);
      return { updates };
    } catch (e) {
      console.error('[check-addon-updates]', e.message);
      return { updates: [], error: e.message };
    }
  });

  // Server status check (TCP ping)
  ipcMain.handle('check-server-status', async (_, host, port) => {
    if (!host) return { online: false, error: 'No host' };
    const net = require('net');
    const p = parseInt(port) || 54231;
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({ online: false, latency: null });
      }, 5000);
      const start = Date.now();
      socket.connect(p, host, () => {
        clearTimeout(timeout);
        const latency = Date.now() - start;
        socket.destroy();
        resolve({ online: true, latency });
      });
      socket.on('error', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve({ online: false, latency: null });
      });
    });
  });

  // One-Click Backup — creates a ZIP of config/boot, scripts, and addon settings
  ipcMain.handle('backup-ashita-config', async () => {
    try {
      const ashitaPath = store.get('ashitaPath');
      if (!ashitaPath) return { success: false, error: 'Ashita path not set' };

      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Ashita Backup',
        defaultPath: `xi-launcher-backup-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.zip`,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
      });
      if (!filePath) return { success: false, cancelled: true };

      // Use PowerShell to create ZIP of key directories
      const dirsToBackup = [
        path.join(ashitaPath, 'config', 'boot'),
        path.join(ashitaPath, 'scripts'),
        path.join(ashitaPath, 'config', 'addons')
      ].filter(d => fs.existsSync(d));

      if (dirsToBackup.length === 0) return { success: false, error: 'No config directories found to backup' };

      // Create a temp staging dir, copy files, then zip
      const tmpDir = path.join(os.tmpdir(), 'xi-launcher-backup-' + Date.now());
      fs.mkdirSync(tmpDir, { recursive: true });

      for (const dir of dirsToBackup) {
        const relPath = path.relative(ashitaPath, dir);
        const destDir = path.join(tmpDir, relPath);
        fs.mkdirSync(path.dirname(destDir), { recursive: true });
        // Copy directory recursively
        execSync(`xcopy "${dir}" "${destDir}\\" /E /I /H /Y /Q`, { timeout: 30000 });
      }

      // Also backup launcher settings
      const launcherConfig = store.store;
      fs.writeFileSync(path.join(tmpDir, 'xi-launcher-settings.json'), JSON.stringify(launcherConfig, null, 2));

      // Create ZIP
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      execSync(`powershell -Command "Compress-Archive -Path '${escapePSString(tmpDir)}\\*' -DestinationPath '${escapePSString(filePath)}'"`, { timeout: 60000 });

      // Cleanup temp
      fs.rmSync(tmpDir, { recursive: true, force: true });

      return { success: true, message: `Backup saved to ${filePath}` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Restore from backup ZIP
  ipcMain.handle('restore-ashita-config', async () => {
    try {
      const ashitaPath = store.get('ashitaPath');
      if (!ashitaPath) return { success: false, error: 'Ashita path not set' };

      const { filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Ashita Backup',
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
        properties: ['openFile']
      });
      if (!filePaths || filePaths.length === 0) return { success: false, cancelled: true };

      const zipPath = filePaths[0];
      const tmpDir = path.join(os.tmpdir(), 'xi-launcher-restore-' + Date.now());
      fs.mkdirSync(tmpDir, { recursive: true });

      // Extract ZIP
      await extractZip(zipPath, tmpDir);

      // Copy config dirs back
      const configBoot = path.join(tmpDir, 'config', 'boot');
      const scripts = path.join(tmpDir, 'scripts');
      const configAddons = path.join(tmpDir, 'config', 'addons');

      if (fs.existsSync(configBoot)) {
        execSync(`xcopy "${configBoot}" "${path.join(ashitaPath, 'config', 'boot')}\\" /E /I /H /Y /Q`, { timeout: 30000 });
      }
      if (fs.existsSync(scripts)) {
        execSync(`xcopy "${scripts}" "${path.join(ashitaPath, 'scripts')}\\" /E /I /H /Y /Q`, { timeout: 30000 });
      }
      if (fs.existsSync(configAddons)) {
        execSync(`xcopy "${configAddons}" "${path.join(ashitaPath, 'config', 'addons')}\\" /E /I /H /Y /Q`, { timeout: 30000 });
      }

      // Restore launcher settings if present
      const settingsFile = path.join(tmpDir, 'xi-launcher-settings.json');
      if (fs.existsSync(settingsFile)) {
        const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
        for (const [key, value] of Object.entries(settings)) {
          store.set(key, value);
        }
      }

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });

      return { success: true, message: 'Backup restored successfully. Restart the launcher to apply changes.' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Enumerate game controllers (DirectInput GUIDs)
  ipcMain.handle('enumerate-game-controllers', async () => {
    try {
      const output = execSync(
        `powershell -Command "Get-PnpDevice -Class 'HIDClass','Media' -Status 'OK' -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'game|controller|gamepad|joystick|xbox|playstation|dualshock|dualsense|wireless controller' } | ForEach-Object { $instanceId = $_.InstanceId; $guidMatch = [regex]::Match($instanceId, '\\\\{[0-9A-Fa-f-]+\\\\}'); @{ Name = $_.FriendlyName; GUID = if ($guidMatch.Success) { $guidMatch.Value } else { '' }; InstanceId = $instanceId } } | ConvertTo-Json -Compress"`,
        { encoding: 'utf-8', timeout: 8000 }
      );
      const parsed = JSON.parse(output || '[]');
      const devices = Array.isArray(parsed) ? parsed : [parsed];
      return { success: true, devices: devices.filter(d => d.GUID) };
    } catch (e) {
      return { success: false, devices: [], error: e.message };
    }
  });
}
