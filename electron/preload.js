const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('xiAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Store
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store-set', key, value),
  storeGetAll: () => ipcRenderer.invoke('store-get-all'),
  getRuntimePaths: () => ipcRenderer.invoke('get-runtime-paths'),

  // File system
  browseFolder: (defaultPath) => ipcRenderer.invoke('browse-folder', defaultPath),
  readDir: (path) => ipcRenderer.invoke('read-dir', path),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  writeFile: (path, content) => ipcRenderer.invoke('write-file', path, content),
  pathExists: (path) => ipcRenderer.invoke('path-exists', path),
  openFolder: (path) => ipcRenderer.invoke('open-folder', path),

  // Registry
  readRegistry: () => ipcRenderer.invoke('read-ffxi-registry'),
  writeRegistry: (regPath, keyName, value) => ipcRenderer.invoke('write-ffxi-registry', regPath, keyName, value),
  writeRegistryBatch: (regPath, entries) => ipcRenderer.invoke('write-ffxi-registry-batch', regPath, entries),

  // Registry backup/undo
  backupRegistry: () => ipcRenderer.invoke('backup-registry'),
  getRegistryBackup: () => ipcRenderer.invoke('get-registry-backup'),
  restoreRegistryBackup: () => ipcRenderer.invoke('restore-registry-backup'),

  // xiloader download
  downloadXiloader: (destPath) => ipcRenderer.invoke('download-xiloader', destPath),
  onXiloaderDownloadProgress: (callback) => {
    const handler = (_, percent, detail) => callback(percent, detail);
    ipcRenderer.on('xiloader-download-progress', handler);
    return () => ipcRenderer.removeListener('xiloader-download-progress', handler);
  },

  // xiloader build
  checkBuildTools: () => ipcRenderer.invoke('check-build-tools'),
  cloneXiloader: (destPath) => ipcRenderer.invoke('clone-xiloader', destPath),
  buildXiloader: (repoDir) => ipcRenderer.invoke('build-xiloader', repoDir),
  copyXiloader: (srcExe, destDir) => ipcRenderer.invoke('copy-xiloader', srcExe, destDir),

  // Game launch
  launchGame: (opts) => ipcRenderer.invoke('launch-game', opts),
  onGameExited: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('game-exited', handler);
    return () => ipcRenderer.removeListener('game-exited', handler);
  },

  // Addons
  getAddons: (ashitaPath) => ipcRenderer.invoke('get-addons', ashitaPath),

  // Profiles
  listProfiles: (ashitaPath) => ipcRenderer.invoke('list-profiles', ashitaPath),
  readProfile: (ashitaPath, name) => ipcRenderer.invoke('read-profile', ashitaPath, name),
  saveProfile: (ashitaPath, name, content) => ipcRenderer.invoke('save-profile', ashitaPath, name, content),
  deleteProfile: (ashitaPath, name) => ipcRenderer.invoke('delete-profile', ashitaPath, name),

  // Profile import/export
  exportProfile: (ashitaPath, profileName) => ipcRenderer.invoke('export-profile', ashitaPath, profileName),
  importProfile: (ashitaPath) => ipcRenderer.invoke('import-profile', ashitaPath),

  // Update checker
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Music
  listMusic: () => ipcRenderer.invoke('list-music'),
  getMusicPath: (filename) => ipcRenderer.invoke('get-music-path', filename),
  openMusicFolder: () => ipcRenderer.invoke('open-music-folder'),

  // Profile settings (per-profile snapshots)
  saveProfileSettings: (profileName, settings) => ipcRenderer.invoke('save-profile-settings', profileName, settings),
  loadProfileSettings: (profileName) => ipcRenderer.invoke('load-profile-settings', profileName),

  // LargeAddressAware
  checkLAA: (exePath) => ipcRenderer.invoke('check-laa', exePath),
  setLAA: (exePath, enable) => ipcRenderer.invoke('set-laa', exePath, enable),

  // GPU detection
  detectGPU: () => ipcRenderer.invoke('detect-gpu'),


  // XIPivot
  installXIPivot: (ashitaPath) => ipcRenderer.invoke('install-xipivot', ashitaPath),
  installHDPack: (ashitaPath, packName, repoUrl, subdir) => ipcRenderer.invoke('install-hdpack', ashitaPath, packName, repoUrl, subdir),
  installHDPackRelease: (ashitaPath, packName, repoUrl, resolution) => ipcRenderer.invoke('install-hdpack-release', ashitaPath, packName, repoUrl, resolution),
  installHDPackManual: (ashitaPath, packName) => ipcRenderer.invoke('install-hdpack-manual', ashitaPath, packName),
  hdpackPause: (packName) => ipcRenderer.invoke('hdpack-pause', packName),
  hdpackResume: (packName) => ipcRenderer.invoke('hdpack-resume', packName),
  hdpackCancel: (packName) => ipcRenderer.invoke('hdpack-cancel', packName),
  onHDPackProgress: (callback) => {
    const handler = (_, packName, phase, percent, detail) => callback(packName, phase, percent, detail);
    ipcRenderer.on('hdpack-progress', handler);
    return () => ipcRenderer.removeListener('hdpack-progress', handler);
  },
  readXIPivotConfig: (ashitaPath) => ipcRenderer.invoke('read-xipivot-config', ashitaPath),
  writeXIPivotConfig: (ashitaPath, config) => ipcRenderer.invoke('write-xipivot-config', ashitaPath, config),

  // Ashita v4 install
  installAshitaV4: (destPath) => ipcRenderer.invoke('install-ashita-v4', destPath),
  onAshitaInstallProgress: (callback) => {
    const handler = (_, percent, detail) => callback(percent, detail);
    ipcRenderer.on('ashita-install-progress', handler);
    return () => ipcRenderer.removeListener('ashita-install-progress', handler);
  },

  // Addon update check
  checkAddonUpdates: (addonList) => ipcRenderer.invoke('check-addon-updates', addonList),

  // System tray
  setMinimizeToTray: (enabled) => ipcRenderer.invoke('set-minimize-to-tray', enabled),
  getMinimizeToTray: () => ipcRenderer.invoke('get-minimize-to-tray'),

  // Server status
  checkServerStatus: (host, port) => ipcRenderer.invoke('check-server-status', host, port),

  // Backup / Restore
  backupAshitaConfig: () => ipcRenderer.invoke('backup-ashita-config'),
  restoreAshitaConfig: () => ipcRenderer.invoke('restore-ashita-config'),

  // dgVoodoo2
  downloadDgVoodoo: () => ipcRenderer.invoke('download-dgvoodoo'),
  getDgVoodooPath: () => ipcRenderer.invoke('get-dgvoodoo-path'),
  onDgVoodooProgress: (callback) => {
    const handler = (_, percent, detail) => callback(percent, detail);
    ipcRenderer.on('dgvoodoo-download-progress', handler);
    return () => ipcRenderer.removeListener('dgvoodoo-download-progress', handler);
  },
  checkDgVoodoo: (ffxiPath) => ipcRenderer.invoke('check-dgvoodoo', ffxiPath),
  readDgVoodooConf: (ffxiPath) => ipcRenderer.invoke('read-dgvoodoo-conf', ffxiPath),
  copyDgVoodooFiles: (sourcePath, ffxiPath) => ipcRenderer.invoke('copy-dgvoodoo-files', sourcePath, ffxiPath),
  writeDgVoodooConf: (ffxiPath, settings) => ipcRenderer.invoke('write-dgvoodoo-conf', ffxiPath, settings),
  launchDgVoodooCpl: (ffxiPath) => ipcRenderer.invoke('launch-dgvoodoo-cpl', ffxiPath),
  openDefenderSettings: () => ipcRenderer.invoke('open-defender-settings'),
  addDefenderExclusion: (folderPath) => ipcRenderer.invoke('add-defender-exclusion', folderPath),
  checkDefenderExclusion: (folderPath) => ipcRenderer.invoke('check-defender-exclusion', folderPath),
  removeDgVoodoo: (ffxiPath) => ipcRenderer.invoke('remove-dgvoodoo', ffxiPath),

  // ReShade
  checkReShade: (ffxiPath) => ipcRenderer.invoke('check-reshade', ffxiPath),
  downloadReShade: () => ipcRenderer.invoke('download-reshade'),
  onReShadeProgress: (callback) => {
    const handler = (_, percent, detail) => callback(percent, detail);
    ipcRenderer.on('reshade-download-progress', handler);
    return () => ipcRenderer.removeListener('reshade-download-progress', handler);
  },
  installReShade: (ffxiPath) => ipcRenderer.invoke('install-reshade', ffxiPath),
  toggleReShade: (ffxiPath, enable) => ipcRenderer.invoke('toggle-reshade', ffxiPath, enable),
  writeReShadeConfig: (ffxiPath, effects) => ipcRenderer.invoke('write-reshade-config', ffxiPath, effects),
  readReShadeConfig: (ffxiPath) => ipcRenderer.invoke('read-reshade-config', ffxiPath),

  // Community addon install
  getPlugins: (ashitaPath) => ipcRenderer.invoke('get-plugins', ashitaPath),
  installAddon: (ashitaPath, addonName, repo, subdir, useRelease, releaseFolder, isPlugin) => ipcRenderer.invoke('install-addon', ashitaPath, addonName, repo, subdir, useRelease, releaseFolder, isPlugin),
  uninstallAddon: (ashitaPath, addonName, isPlugin) => ipcRenderer.invoke('uninstall-addon', ashitaPath, addonName, isPlugin),
  copyDir: (src, dest) => ipcRenderer.invoke('copy-dir', src, dest),
  onAddonProgress: (callback) => {
    const handler = (_, addonName, percent, detail) => callback(addonName, percent, detail);
    ipcRenderer.on('addon-progress', handler);
    return () => ipcRenderer.removeListener('addon-progress', handler);
  },

  // Game controller enumeration
  enumerateGameControllers: () => ipcRenderer.invoke('enumerate-game-controllers'),
});
