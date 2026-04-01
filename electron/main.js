const { app, BrowserWindow, ipcMain, dialog, shell, protocol, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execSync, spawn, exec } = require('child_process');

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

// Runtime folder — in dev mode, use appData to avoid triggering CRA's file watcher reload
const appRoot = isDev ? path.join(__dirname, '..') : path.dirname(app.getPath('exe'));
const runtimeDir = isDev
  ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'xi-launcher', 'runtime')
  : path.join(appRoot, 'runtime');
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
  return String(str).replace(/'/g, "''");
}
function isAllowedPath(filePath) {
  const resolved = path.resolve(filePath);
  const allowed = [
    store?.get('ashitaPath'),
    store?.get('ffxiPath'),
    store?.get('xiloaderPath'),
    runtimeDir,
    os.tmpdir()
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    frame: false,
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

  ipcMain.handle('path-exists', async (_, p) => fs.existsSync(p));

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
    const filePath = path.join(musicDir, filename);
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
      const current = await ipcMain.listeners('read-ffxi-registry'); // reuse existing handler
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
      execSync(`powershell -Command "Expand-Archive -Path '${tmpZip}' -DestinationPath '${tmpExtract}' -Force"`, { timeout: 120000 });

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
      if (msg.includes('Expand-Archive')) {
        return { success: false, error: 'Failed to extract the download. The ZIP file may be corrupted — try again.' };
      }
      return { success: false, error: `Install failed: ${msg}` };
    }
  });

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
        if (opts.serverPort) args.push('--port', opts.serverPort);
        if (opts.loginUser) args.push('--user', opts.loginUser);
        if (opts.loginPass) args.push('--pass', opts.loginPass);
        if (opts.hairpin) args.push('--hairpin');
        const argStr = args.map(a => `'${escapePSString(a)}'`).join(',');
        const psCmd = `Start-Process -FilePath '${escapePSString(exe)}' ${argStr ? `-ArgumentList ${argStr}` : ''} -WorkingDirectory '${escapePSString(opts.xiloaderPath)}' -Verb RunAs`;
        exec(`powershell -Command "${psCmd}"`, { timeout: 15000 }, (err) => {
          if (err) console.error('Launch error:', err.message);
        });
        return { success: true, message: 'xiloader launched' };
      } else {
        if (!opts.ashitaPath) return { error: 'Ashita path is not set. Go to Profiles → Installation Paths and set the Ashita v4 path.' };
        const exe = path.join(opts.ashitaPath, 'Ashita-cli.exe');
        if (!fs.existsSync(exe)) return { error: `Ashita-cli.exe not found at ${opts.ashitaPath}. Install Ashita v4 from the Home tab or set the correct path in Profiles → Installation Paths.` };
        if (!opts.profileName) return { error: 'No profile selected. Create or select a profile from the Profiles tab before launching.' };
        const profileIni = path.join(opts.ashitaPath, 'config', 'boot', `${opts.profileName}.ini`);
        if (!fs.existsSync(profileIni)) return { error: `Profile "${opts.profileName}" INI file not found. The profile may have been deleted. Select a different profile or create a new one.` };
        const argStr = opts.profileName ? `-ArgumentList '${escapePSString(opts.profileName)}.ini'` : '';
        const psCmd = `Start-Process -FilePath '${escapePSString(exe)}' ${argStr} -WorkingDirectory '${escapePSString(opts.ashitaPath)}' -Verb RunAs`;
        exec(`powershell -Command "${psCmd}"`, { timeout: 15000 }, (err) => {
          if (err) console.error('Launch error:', err.message);
        });
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

  ipcMain.handle('read-profile', async (_, ashitaPath, name) => {
    const filePath = path.join(ashitaPath, 'config', 'boot', `${name}.ini`);
    try {
      if (!fs.existsSync(filePath)) return { exists: false, content: '' };
      return { exists: true, content: fs.readFileSync(filePath, 'utf-8') };
    } catch {
      return { exists: false, content: '' };
    }
  });

  ipcMain.handle('save-profile', async (_, ashitaPath, name, content) => {
    const filePath = path.join(ashitaPath, 'config', 'boot', `${name}.ini`);
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

      // Step 4: Extract using PowerShell
      const tmpExtract = path.join(os.tmpdir(), 'xipivot-extract');
      if (fs.existsSync(tmpExtract)) {
        fs.rmSync(tmpExtract, { recursive: true, force: true });
      }
      execSync(`powershell -Command "Expand-Archive -Path '${tmpZip}' -DestinationPath '${tmpExtract}' -Force"`, { timeout: 30000 });

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
  ipcMain.handle('install-hdpack', async (_, ashitaPath, packName, repoUrl) => {



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
            let receivedBytes = 0;
            const file = fs.createWriteStream(tmpZip);
            res.on('data', (chunk) => {
              receivedBytes += chunk.length;
              file.write(chunk);
              const mb = (receivedBytes / 1048576).toFixed(1);
              if (totalBytes > 0) {
                const pct = Math.round((receivedBytes / totalBytes) * 70);
                const totalMb = (totalBytes / 1048576).toFixed(1);
                sendProgress('download', pct, `Downloading... ${mb} MB / ${totalMb} MB`);
              } else {
                sendProgress('download', Math.min(60, Math.round(receivedBytes / 50000)), `Downloading... ${mb} MB`);
              }
            });
            res.on('end', () => { file.end(); file.on('finish', resolve); });
            res.on('error', reject);
          }).on('error', reject);
        };
        download(zipUrl);
      });

      sendProgress('extract', 75, 'Extracting files...');

      // Extract to temp folder
      const tmpExtract = path.join(os.tmpdir(), `hdpack-${packName}-extract`);
      if (fs.existsSync(tmpExtract)) {
        fs.rmSync(tmpExtract, { recursive: true, force: true });
      }
      execSync(`powershell -Command "Expand-Archive -Path '${tmpZip}' -DestinationPath '${tmpExtract}' -Force"`, { timeout: 120000 });

      // GitHub ZIPs extract to a folder like "RepoName-main/" — find it
      const extracted = fs.readdirSync(tmpExtract);
      const innerDir = extracted.length === 1 && fs.statSync(path.join(tmpExtract, extracted[0])).isDirectory()
        ? path.join(tmpExtract, extracted[0])
        : tmpExtract;

      sendProgress('copy', 85, 'Copying files to DATs folder...');

      // Copy to DATs/[packName]
      const destDir = path.join(datsRoot, packName);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      copyRecursive(innerDir, destDir);
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
      const asset = release.assets.find(a => a.name.includes('dats') && a.name.includes(resStr) && a.name.endsWith('.zip'));
      if (!asset) {
        const available = release.assets.map(a => a.name).join(', ');
        return { success: false, error: `No DAT asset found for resolution ${resStr}. Available: ${available}` };
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
            res.on('data', (chunk) => {
              receivedBytes += chunk.length;
              file.write(chunk);
              const mb = (receivedBytes / 1048576).toFixed(1);
              const totalMb = (totalBytes / 1048576).toFixed(1);
              const pct = totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 70) : Math.min(60, Math.round(receivedBytes / 50000));
              sendProgress('download', pct, `Downloading... ${mb} MB / ${totalMb} MB`);
            });
            res.on('end', () => { file.end(); file.on('finish', resolve); });
            res.on('error', reject);
          }).on('error', reject);
        };
        download(asset.browser_download_url);
      });

      sendProgress('extract', 75, 'Extracting files...');

      const tmpExtract = path.join(os.tmpdir(), `hdpack-${packName}-extract`);
      if (fs.existsSync(tmpExtract)) {
        fs.rmSync(tmpExtract, { recursive: true, force: true });
      }
      execSync(`powershell -Command "Expand-Archive -Path '${tmpZip}' -DestinationPath '${tmpExtract}' -Force"`, { timeout: 300000 });

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

      sendProgress('copy', 85, 'Copying files to DATs folder...');

      const destDir = path.join(datsRoot, packName);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      copyRecursive(sourceDir, destDir);
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

  // Community addon install/update from GitHub
  ipcMain.handle('install-addon', async (_, ashitaPath, addonName, repo, subdir) => {



    try {
      const sendProgress = (percent, detail) => {
        try { mainWindow?.webContents?.send('addon-progress', addonName, percent, detail); } catch {}
      };

      sendProgress(0, 'Fetching repo info...');

      // Get default branch
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

      const branch = repoInfo.default_branch || 'main';
      const zipUrl = `https://github.com/${repo}/archive/refs/heads/${branch}.zip`;

      sendProgress(5, 'Downloading...');

      // Download ZIP to temp
      const tmpZip = path.join(os.tmpdir(), `addon-${addonName}.zip`);
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
      execSync(`powershell -Command "Expand-Archive -Path '${tmpZip}' -DestinationPath '${tmpExtract}' -Force"`, { timeout: 120000 });

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

      sendProgress(80, 'Installing to addons folder...');

      // Copy to ashitaPath/addons/<addonName>
      const destDir = path.join(ashitaPath, 'addons', addonName);
      if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
      }
      fs.mkdirSync(destDir, { recursive: true });

      copyRecursive(innerDir, destDir);
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
}
