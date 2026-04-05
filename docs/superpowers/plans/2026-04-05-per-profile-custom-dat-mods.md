# Per-Profile Custom DAT Mods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make XIPivot overlays per-profile and allow users to install custom DAT mods from any GitHub URL or direct zip link.

**Architecture:** Overlay selections move from the global `pivot.ini` to electron-store keyed by profile name. At launch time, the active profile's overlays are written to `pivot.ini`. A new "Custom DAT Mods" section on the XIPivot tab lets users paste a URL to download and install mods, which appear as cards alongside built-in packs.

**Tech Stack:** Electron IPC (main.js), React (XIPivotTab.js, ProfileTab.js, App.js), electron-store, yauzl, Node https

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `electron/main.js` | Modify (~1348-1360, add new handlers after ~1441) | Add `install-custom-mod`, `remove-custom-mod`, `fetch-github-repo-info` IPC handlers; update `write-xipivot-config` |
| `electron/preload.js` | Modify (~99-113) | Expose new IPC methods + progress listener to renderer |
| `src/App.js` | Modify (~440-471, ~114-143) | Write profile overlays to pivot.ini before launch; migration logic on startup |
| `src/tabs/XIPivotTab.js` | Modify (major) | Profile-aware overlay list, custom mods section with URL input and cards |
| `src/tabs/XIPivotTab.css` | Modify | Styles for profile banner, custom mod cards, URL input |
| `src/tabs/ProfileTab.js` | Modify (~330-340) | Add mod count badge to profile rows |

---

### Task 1: Per-Profile Overlay Storage — Preload & IPC

**Files:**
- Modify: `electron/preload.js:99-113`

- [ ] **Step 1: Add new IPC bridge methods to preload.js**

In `electron/preload.js`, add three new methods and one progress listener to the `xiAPI` object, right after the existing `writeXIPivotConfig` line (line 113):

```javascript
  // Custom DAT mods
  installCustomMod: (ashitaPath, url) => ipcRenderer.invoke('install-custom-mod', ashitaPath, url),
  removeCustomMod: (ashitaPath, modName) => ipcRenderer.invoke('remove-custom-mod', ashitaPath, modName),
  fetchGithubRepoInfo: (url) => ipcRenderer.invoke('fetch-github-repo-info', url),
  onCustomModProgress: (callback) => {
    const handler = (_, modName, percent, detail) => callback(modName, percent, detail);
    ipcRenderer.on('custom-mod-progress', handler);
    return () => ipcRenderer.removeListener('custom-mod-progress', handler);
  },
```

- [ ] **Step 2: Verify no syntax errors**

Run: `cd "C:/Users/Calvin Candie/xi-launcher" && npx electron --version`
Expected: prints Electron version without errors (confirms the project's Electron is accessible)

- [ ] **Step 3: Commit**

```bash
git add electron/preload.js
git commit -m "feat: add custom mod IPC bridge methods to preload"
```

---

### Task 2: Backend — install-custom-mod IPC Handler

**Files:**
- Modify: `electron/main.js` (add after the `install-xipivot` handler, around line 1441)

- [ ] **Step 1: Add URL parsing helper**

Add this helper function inside the `app.whenReady().then(() => {` block in `main.js`, before the IPC handlers (around line 30-50, near other helpers):

```javascript
  // Parse a URL to determine mod download type
  function parseModUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'github.com') {
        const parts = u.pathname.replace(/^\//, '').replace(/\/$/, '').split('/');
        if (parts.length >= 2) {
          const owner = parts[0];
          const repo = parts[1];
          if (parts.length >= 4 && parts[2] === 'releases') {
            return { type: 'github-release', owner, repo, url };
          }
          return { type: 'github-repo', owner, repo, url: `https://github.com/${owner}/${repo}` };
        }
      }
      // Direct zip URL — any non-GitHub URL or GitHub URL that didn't match above
      return { type: 'direct-zip', url, name: path.basename(u.pathname, '.zip') || 'custom-mod' };
    } catch {
      return null;
    }
  }
```

- [ ] **Step 2: Add fetch-github-repo-info handler**

Add after the `install-xipivot` handler block (after line ~1441):

```javascript
  ipcMain.handle('fetch-github-repo-info', async (_, url) => {
    const parsed = parseModUrl(url);
    if (!parsed) return { success: false, error: 'Invalid URL' };
    if (parsed.type === 'direct-zip') {
      return { success: true, name: parsed.name, description: 'Custom DAT mod (direct download)', url };
    }
    try {
      const data = await new Promise((resolve, reject) => {
        https.get({
          hostname: 'api.github.com',
          path: `/repos/${parsed.owner}/${parsed.repo}`,
          headers: { 'User-Agent': 'XI-Launcher' }
        }, (res) => {
          let body = '';
          res.on('data', (chunk) => body += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch { reject(new Error('Failed to parse GitHub response')); }
          });
        }).on('error', reject);
      });
      if (data.message === 'Not Found') return { success: false, error: 'Repository not found on GitHub' };
      if (data.message && data.message.includes('rate limit')) return { success: false, error: 'GitHub rate limit reached — try again in a few minutes' };
      return { success: true, name: data.name || parsed.repo, description: data.description || '', url };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
```

- [ ] **Step 3: Add install-custom-mod handler**

Add immediately after the `fetch-github-repo-info` handler. This follows the same download+extract pattern as the existing `install-hdpack` handler (line 1588+):

```javascript
  ipcMain.handle('install-custom-mod', async (_, ashitaPath, url) => {
    const parsed = parseModUrl(url);
    if (!parsed) return { success: false, error: 'Invalid URL' };

    const modName = parsed.type === 'direct-zip' ? parsed.name : parsed.repo;

    const sendProgress = (percent, detail) => {
      try { mainWindow?.webContents?.send('custom-mod-progress', modName, percent, detail); } catch {}
    };

    try {
      const datsRoot = path.join(ashitaPath, 'polplugins', 'DATs');
      if (!fs.existsSync(datsRoot)) fs.mkdirSync(datsRoot, { recursive: true });

      let zipUrl;
      let estimatedSize = 0;

      if (parsed.type === 'github-repo') {
        sendProgress(0, 'Fetching repo info from GitHub...');
        const repoInfo = await new Promise((resolve, reject) => {
          https.get({
            hostname: 'api.github.com',
            path: `/repos/${parsed.owner}/${parsed.repo}`,
            headers: { 'User-Agent': 'XI-Launcher' }
          }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(body)); }
              catch { reject(new Error('Failed to parse GitHub response')); }
            });
          }).on('error', reject);
        });
        if (repoInfo.message === 'Not Found') return { success: false, error: 'Repository not found on GitHub' };
        if (repoInfo.message && repoInfo.message.includes('rate limit')) return { success: false, error: 'GitHub rate limit reached — try again in a few minutes' };
        const branch = repoInfo.default_branch || 'main';
        zipUrl = `https://github.com/${parsed.owner}/${parsed.repo}/archive/refs/heads/${branch}.zip`;
        estimatedSize = repoInfo.size ? repoInfo.size * 1024 : 0;
      } else if (parsed.type === 'github-release') {
        sendProgress(0, 'Fetching latest release from GitHub...');
        const releaseData = await new Promise((resolve, reject) => {
          https.get({
            hostname: 'api.github.com',
            path: `/repos/${parsed.owner}/${parsed.repo}/releases/latest`,
            headers: { 'User-Agent': 'XI-Launcher' }
          }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(body)); }
              catch { reject(new Error('Failed to parse GitHub response')); }
            });
          }).on('error', reject);
        });
        if (releaseData.message === 'Not Found') return { success: false, error: 'No releases found for this repository' };
        if (releaseData.message && releaseData.message.includes('rate limit')) return { success: false, error: 'GitHub rate limit reached — try again in a few minutes' };
        const zipAsset = (releaseData.assets || []).find(a => a.name.endsWith('.zip'));
        if (!zipAsset) {
          zipUrl = releaseData.zipball_url;
        } else {
          zipUrl = zipAsset.browser_download_url;
          estimatedSize = zipAsset.size || 0;
        }
      } else {
        zipUrl = parsed.url;
        sendProgress(0, 'Starting download...');
      }

      // Download zip
      const tmpZip = path.join(os.tmpdir(), `custom-mod-${modName}.zip`);
      await new Promise((resolve, reject) => {
        const download = (downloadUrl) => {
          const lib = downloadUrl.startsWith('https') ? https : require('http');
          lib.get(downloadUrl, { headers: { 'User-Agent': 'XI-Launcher' } }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
              return download(res.headers.location);
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`Download failed with status ${res.statusCode}`));
            }
            const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
            const total = totalBytes > 0 ? totalBytes : estimatedSize;
            let received = 0;
            const file = fs.createWriteStream(tmpZip);
            res.on('data', (chunk) => {
              received += chunk.length;
              file.write(chunk);
              const mb = (received / 1048576).toFixed(1);
              if (total > 0) {
                const pct = Math.min(70, Math.round((received / total) * 70));
                const totalMb = (total / 1048576).toFixed(1);
                sendProgress(pct, `Downloading... ${mb} MB / ${totalMb} MB`);
              } else {
                sendProgress(Math.min(60, Math.round(received / 50000)), `Downloading... ${mb} MB`);
              }
            });
            res.on('end', () => { file.end(); file.on('finish', resolve); });
            res.on('error', reject);
          }).on('error', reject);
        };
        download(zipUrl);
      });

      // Extract
      sendProgress(75, 'Extracting files...');
      const tmpExtract = path.join(os.tmpdir(), `custom-mod-${modName}-extract`);
      if (fs.existsSync(tmpExtract)) fs.rmSync(tmpExtract, { recursive: true, force: true });
      fs.mkdirSync(tmpExtract, { recursive: true });
      await extractZip(tmpZip, tmpExtract, (pct, file) => {
        sendProgress(75 + Math.round(pct * 0.15), `Extracting... ${pct}% — ${path.basename(file)}`);
      });

      // Unwrap single top-level folder (GitHub zip pattern)
      const extracted = fs.readdirSync(tmpExtract);
      let innerDir = extracted.length === 1 && fs.statSync(path.join(tmpExtract, extracted[0])).isDirectory()
        ? path.join(tmpExtract, extracted[0])
        : tmpExtract;

      // Unwrap nested DAT dirs (ROM/ROM2/etc.)
      const innerContents = fs.readdirSync(innerDir);
      const subDirs = innerContents.filter(f => fs.statSync(path.join(innerDir, f)).isDirectory());
      const isDatDir = (name) => /^(ROM|sound)\d*$/i.test(name);
      if (!subDirs.some(d => isDatDir(d)) && subDirs.length === 1) {
        const candidate = path.join(innerDir, subDirs[0]);
        if (fs.readdirSync(candidate).some(f => isDatDir(f))) {
          innerDir = candidate;
        }
      }

      // Copy to DATs folder
      sendProgress(92, 'Installing to DATs folder...');
      const destDir = path.join(datsRoot, modName);
      if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
      fs.cpSync(innerDir, destDir, { recursive: true });

      // Cleanup temp files
      try { fs.rmSync(tmpZip, { force: true }); } catch {}
      try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch {}

      sendProgress(100, 'Done!');
      return { success: true, name: modName, message: `${modName} installed to DATs folder` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
```

- [ ] **Step 4: Add remove-custom-mod handler**

Add right after `install-custom-mod`:

```javascript
  ipcMain.handle('remove-custom-mod', async (_, ashitaPath, modName) => {
    try {
      const datsRoot = path.join(ashitaPath, 'polplugins', 'DATs');
      const modDir = path.join(datsRoot, modName);
      if (fs.existsSync(modDir)) {
        fs.rmSync(modDir, { recursive: true, force: true });
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
```

- [ ] **Step 5: Verify the app starts without errors**

Run: `cd "C:/Users/Calvin Candie/xi-launcher" && npx electron . &` then close it.
Expected: App launches without crash. New IPC handlers are registered.

- [ ] **Step 6: Commit**

```bash
git add electron/main.js
git commit -m "feat: add custom mod install/remove/info IPC handlers"
```

---

### Task 3: Per-Profile Overlay Storage — Migration & Launch Integration

**Files:**
- Modify: `src/App.js:114-143` (migration in useEffect)
- Modify: `src/App.js:440-471` (launch flow)

- [ ] **Step 1: Add migration logic on app startup**

In `src/App.js`, inside the startup `useEffect` (around line 114-143), add migration logic right after `setConfig(merged)` (line 114) and before the setup wizard check (line 117). This reads the current pivot.ini overlays and copies them to all existing profiles if `profileOverlays` doesn't exist yet:

```javascript
      // Migrate: copy global pivot.ini overlays to all profiles as per-profile overlays
      const existingProfileOverlays = await api.storeGet('profileOverlays');
      if (!existingProfileOverlays && merged.ashitaPath) {
        try {
          const pivot = await api.readXIPivotConfig(merged.ashitaPath);
          const overlays = pivot.overlays || [];
          const profileList = await api.listProfiles(merged.ashitaPath);
          const profileOverlays = {};
          for (const name of profileList) {
            profileOverlays[name] = [...overlays];
          }
          await api.storeSet('profileOverlays', profileOverlays);
        } catch (e) { console.error('Failed to migrate profile overlays:', e); }
      }
```

- [ ] **Step 2: Write profile overlays to pivot.ini before launch**

In `src/App.js`, inside the `doLaunch` function (around line 440), add this block right before the `const result = await api.launchGame({` call (line 445). This writes the active profile's overlay list to pivot.ini:

```javascript
      // Write active profile's overlays to pivot.ini before launch
      const profileOverlays = await api.storeGet('profileOverlays') || {};
      const overlays = profileOverlays[config.activeProfile] || [];
      const pivotCfg = await api.readXIPivotConfig(config.ashitaPath);
      await api.writeXIPivotConfig(config.ashitaPath, {
        ...pivotCfg,
        overlays
      });
```

- [ ] **Step 3: Verify app starts and migration runs**

Run: `cd "C:/Users/Calvin Candie/xi-launcher" && npx electron .`
Expected: App launches. If profiles exist and `profileOverlays` doesn't exist in store, the migration creates it. Check dev tools console for any errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.js
git commit -m "feat: add per-profile overlay migration and launch-time pivot.ini write"
```

---

### Task 4: XIPivot Tab — Profile-Aware Overlay List

**Files:**
- Modify: `src/tabs/XIPivotTab.js` (major changes to state management and overlay section)
- Modify: `src/tabs/XIPivotTab.css` (profile banner styles)

- [ ] **Step 1: Add profile overlay state to XIPivotTab**

At the top of the `XIPivotTab` function (after the existing state declarations around line 24-35), add state for per-profile overlays:

```javascript
  const [profileOverlays, setProfileOverlays] = useState([]);
```

- [ ] **Step 2: Load profile overlays on mount and when active profile changes**

Add a new `useEffect` after the existing `load` effect (after line 72). This reads the active profile's overlay list from electron-store:

```javascript
  // Load per-profile overlays
  const loadProfileOverlays = useCallback(async () => {
    if (!api || !config.activeProfile) {
      setProfileOverlays([]);
      return;
    }
    const allOverlays = await api.storeGet('profileOverlays') || {};
    setProfileOverlays(allOverlays[config.activeProfile] || []);
  }, [config.activeProfile]);

  useEffect(() => { loadProfileOverlays(); }, [loadProfileOverlays]);
```

- [ ] **Step 3: Add helper to save profile overlays**

Add a helper function that saves profile overlays to electron-store and updates local state:

```javascript
  const saveProfileOverlays = async (newOverlays) => {
    if (!config.activeProfile) return;
    setProfileOverlays(newOverlays);
    const allOverlays = await api.storeGet('profileOverlays') || {};
    allOverlays[config.activeProfile] = newOverlays;
    await api.storeSet('profileOverlays', allOverlays);
  };
```

- [ ] **Step 4: Replace overlay list data source**

Update the overlay list section in the JSX (around lines 310-347). Replace all references to `pivotConfig.overlays` with `profileOverlays` in the Active Overlays section. Update the overlay management functions to use `saveProfileOverlays` instead of `saveConfig`:

Replace the existing `addOverlay`, `removeOverlay`, `moveOverlay`, and `handleDrop` functions (lines 143-175) with:

```javascript
  const addOverlay = async () => {
    const name = newOverlay.trim();
    if (!name || profileOverlays.includes(name)) return;
    await saveProfileOverlays([...profileOverlays, name]);
    setNewOverlay('');
  };

  const removeOverlay = async (idx) => {
    await saveProfileOverlays(profileOverlays.filter((_, i) => i !== idx));
  };

  const moveOverlay = async (idx, dir) => {
    const overlays = [...profileOverlays];
    const target = idx + dir;
    if (target < 0 || target >= overlays.length) return;
    [overlays[idx], overlays[target]] = [overlays[target], overlays[idx]];
    await saveProfileOverlays(overlays);
  };

  const handleDrop = async (targetIdx) => {
    const fromIdx = dragIdx.current;
    if (fromIdx === null || fromIdx === targetIdx) return;
    const overlays = [...profileOverlays];
    const [moved] = overlays.splice(fromIdx, 1);
    overlays.splice(targetIdx, 0, moved);
    dragIdx.current = null;
    await saveProfileOverlays(overlays);
  };
```

- [ ] **Step 5: Update the overlay list JSX to use profileOverlays**

In the Active Overlays JSX section (around line 310-347), replace all `pivotConfig.overlays` with `profileOverlays`:

- `pivotConfig.overlays.length` → `profileOverlays.length` (in the count display and empty check)
- `pivotConfig.overlays.map(...)` → `profileOverlays.map(...)` (in the list rendering)
- `pivotConfig.overlays.length - 1` → `profileOverlays.length - 1` (in the move down disable check)

Also in the status bar (line 267), change:
```javascript
<span className="pill pill-teal">{pivotConfig.overlays.length} overlay{pivotConfig.overlays.length !== 1 ? 's' : ''}</span>
```
to:
```javascript
<span className="pill pill-teal">{profileOverlays.length} overlay{profileOverlays.length !== 1 ? 's' : ''}</span>
```

- [ ] **Step 6: Update HD pack install to use saveProfileOverlays**

In the `installHDPack` function (around line 202-238), replace the overlay manipulation at the end. Change:

```javascript
      let newOverlays = [...pivotConfig.overlays];
```
to:
```javascript
      let newOverlays = [...profileOverlays];
```

And replace:
```javascript
      await saveConfig({ overlays: newOverlays });
```
with:
```javascript
      await saveProfileOverlays(newOverlays);
```

- [ ] **Step 7: Update HD pack "added" checks to use profileOverlays**

Throughout the JSX where HD pack cards check if a pack is active, replace `pivotConfig.overlays.includes(pack.name)` with `profileOverlays.includes(pack.name)`. This appears in:
- The `activePacks` filter (around line 505)
- The `added` const inside each card render (around lines 517 and 603)

- [ ] **Step 8: Add profile banner to the top of the tab**

Add a profile indicator banner right after the status bar (after line 269), before the "DATs Root Path" section:

```jsx
      {config.activeProfile ? (
        <div className="xipivot-profile-banner">
          Editing overlays for: <strong>{config.activeProfile}</strong>
        </div>
      ) : (
        <div className="xipivot-profile-banner xipivot-profile-banner-inactive">
          No active profile — select one on the Profiles tab
        </div>
      )}
```

- [ ] **Step 9: Add profile banner CSS**

Add to `src/tabs/XIPivotTab.css`:

```css
.xipivot-profile-banner {
  padding: 10px 16px;
  border-radius: 8px;
  background: rgba(var(--teal-rgb, 0, 200, 180), 0.1);
  border: 1px solid rgba(var(--teal-rgb, 0, 200, 180), 0.25);
  color: var(--teal, #00c8b4);
  font-size: var(--text-sm, 13px);
  margin-bottom: 8px;
}

.xipivot-profile-banner-inactive {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.4);
}
```

- [ ] **Step 10: Verify the XIPivot tab shows profile-aware overlays**

Run: `cd "C:/Users/Calvin Candie/xi-launcher" && npx electron .`
Expected: XIPivot tab shows profile banner with active profile name. Overlay list shows per-profile overlays. Adding/removing overlays persists per profile.

- [ ] **Step 11: Commit**

```bash
git add src/tabs/XIPivotTab.js src/tabs/XIPivotTab.css
git commit -m "feat: make XIPivot overlay list per-profile with profile banner"
```

---

### Task 5: XIPivot Tab — Custom Mods Section

**Files:**
- Modify: `src/tabs/XIPivotTab.js` (add custom mods state, URL input, card rendering)
- Modify: `src/tabs/XIPivotTab.css` (custom mod card styles)

- [ ] **Step 1: Add custom mod state**

At the top of the `XIPivotTab` function, add state for custom mods:

```javascript
  const [customMods, setCustomMods] = useState([]);
  const [customModUrl, setCustomModUrl] = useState('');
  const [customModStatus, setCustomModStatus] = useState({}); // { modName: { status, message, percent } }
  const [customModError, setCustomModError] = useState('');
```

- [ ] **Step 2: Load custom mods from store and set up progress listener**

Add effects to load custom mods and listen for progress:

```javascript
  // Load custom mods list
  useEffect(() => {
    if (!api) return;
    api.storeGet('customMods').then(mods => setCustomMods(mods || []));
  }, []);

  // Listen for custom mod install progress
  useEffect(() => {
    if (!api?.onCustomModProgress) return;
    const cleanup = api.onCustomModProgress((modName, percent, detail) => {
      setCustomModStatus(prev => ({ ...prev, [modName]: { status: 'installing', message: detail, percent } }));
    });
    return cleanup;
  }, []);
```

- [ ] **Step 3: Add URL validation helper**

```javascript
  const isValidModUrl = (url) => {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  };
```

- [ ] **Step 4: Add installCustomMod function**

```javascript
  const installCustomMod = async () => {
    const url = customModUrl.trim();
    if (!url) return;
    if (!isValidModUrl(url)) {
      setCustomModError('Not a valid URL — paste a GitHub link or direct zip URL');
      return;
    }
    setCustomModError('');

    // Fetch repo info for display
    const info = await api.fetchGithubRepoInfo(url);
    if (!info.success) {
      setCustomModError(info.error);
      return;
    }

    // Check for duplicate
    const existing = customMods.find(m => m.name === info.name);
    if (existing) {
      // Allow reinstall — update status to show installing
    }

    setCustomModStatus(prev => ({ ...prev, [info.name]: { status: 'installing', message: 'Starting...', percent: 0 } }));
    setCustomModUrl('');

    const result = await api.installCustomMod(config.ashitaPath, url);
    if (result.success) {
      // Add to custom mods list if not already there
      const updatedMods = customMods.filter(m => m.name !== result.name);
      updatedMods.push({ name: result.name, url, description: info.description || '', installedAt: new Date().toISOString() });
      setCustomMods(updatedMods);
      await api.storeSet('customMods', updatedMods);

      // Auto-add to active profile's overlays
      if (config.activeProfile && !profileOverlays.includes(result.name)) {
        await saveProfileOverlays([...profileOverlays, result.name]);
      }

      setCustomModStatus(prev => ({ ...prev, [result.name]: { status: 'done', message: result.message, percent: 100 } }));
    } else {
      setCustomModStatus(prev => ({ ...prev, [info.name]: { status: 'error', message: result.error, percent: 0 } }));
    }
  };
```

- [ ] **Step 5: Add removeCustomMod function**

```javascript
  const removeCustomMod = async (modName) => {
    const result = await api.removeCustomMod(config.ashitaPath, modName);
    if (result.success) {
      const updatedMods = customMods.filter(m => m.name !== modName);
      setCustomMods(updatedMods);
      await api.storeSet('customMods', updatedMods);

      // Remove from active profile overlays if present
      if (profileOverlays.includes(modName)) {
        await saveProfileOverlays(profileOverlays.filter(n => n !== modName));
      }

      setCustomModStatus(prev => { const s = { ...prev }; delete s[modName]; return s; });
    }
  };
```

- [ ] **Step 6: Add Custom Mods section JSX**

Add this JSX at the bottom of the XIPivot tab return, right before the closing `</div>` (before line 684):

```jsx
      <div className="section-header">Custom DAT Mods</div>
      <p className="xipivot-hint">
        Install custom DAT mods by pasting a GitHub repo URL, release URL, or any direct link to a .zip file.
        Mods are extracted to your DATs folder and added to your active profile's overlay list.
      </p>

      <div className="panel custom-mod-input-panel">
        <div className="custom-mod-input-row">
          <input
            type="text"
            value={customModUrl}
            onChange={e => { setCustomModUrl(e.target.value); setCustomModError(''); }}
            onKeyDown={e => e.key === 'Enter' && installCustomMod()}
            placeholder="Paste a GitHub link or direct zip URL..."
            className="xipivot-flex-1"
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={installCustomMod}
            disabled={!customModUrl.trim()}
          >
            Add
          </button>
        </div>
        {customModError && (
          <div className="custom-mod-error">{customModError}</div>
        )}
      </div>

      {customMods.length > 0 && (
        <div className="custom-mods-grid">
          {customMods.map(mod => {
            const ps = customModStatus[mod.name];
            const isInstalling = ps?.status === 'installing';
            const added = profileOverlays.includes(mod.name);
            return (
              <div key={mod.name} className={`panel hdpack-card ${added ? 'hdpack-installed' : ''}`}>
                <h3 className="hdpack-name cinzel">{mod.name}</h3>
                <p className="hdpack-desc">{mod.description || 'Custom DAT mod'}</p>
                <div className="custom-mod-meta">
                  <button className="btn btn-ghost btn-sm hdpack-link" onClick={() => api.openExternal(mod.url)}>Source ↗</button>
                </div>
                <div className="hdpack-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setCustomModUrl(mod.url); installCustomMod(); }}
                    disabled={isInstalling}
                  >
                    {isInstalling ? '◌ Installing...' : '↻ Reinstall'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm xipivot-remove-btn"
                    onClick={() => removeCustomMod(mod.name)}
                    disabled={isInstalling}
                  >
                    Remove
                  </button>
                </div>
                {ps && (
                  <div className="hdpack-progress-area">
                    {ps.status === 'installing' && (
                      <div className="hdpack-progress-row">
                        <div className="hdpack-progress-bar">
                          <div className="hdpack-progress-fill" style={{ width: `${ps.percent || 0}%` }} />
                        </div>
                        <span className="hdpack-progress-pct">{Math.round(ps.percent || 0)}%</span>
                      </div>
                    )}
                    <div className={`hdpack-status-msg ${ps.status === 'error' ? 'error' : ps.status === 'done' ? 'success' : ''}`}>
                      {ps.message}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
```

- [ ] **Step 7: Add custom mod CSS**

Add to `src/tabs/XIPivotTab.css`:

```css
.custom-mod-input-panel {
  margin-bottom: 12px;
}

.custom-mod-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.custom-mod-error {
  color: var(--red, #ff4d4f);
  font-size: var(--text-xs, 11px);
  margin-top: 6px;
}

.custom-mods-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.custom-mod-meta {
  margin-bottom: 8px;
}
```

- [ ] **Step 8: Verify custom mods section works**

Run: `cd "C:/Users/Calvin Candie/xi-launcher" && npx electron .`
Expected: "Custom DAT Mods" section appears below built-in packs. Can paste a GitHub URL, click Add, see progress, card appears after install. Remove button deletes the mod.

- [ ] **Step 9: Commit**

```bash
git add src/tabs/XIPivotTab.js src/tabs/XIPivotTab.css
git commit -m "feat: add custom DAT mods section with URL input and mod cards"
```

---

### Task 6: Profile Tab — Mod Count Badge & Cleanup on Delete/Clone

**Files:**
- Modify: `src/tabs/ProfileTab.js:330-345` (profile row badge)
- Modify: `src/tabs/ProfileTab.js:111-125` (delete cleanup)
- Modify: `src/tabs/ProfileTab.js:127-145` (clone copy)
- Modify: `src/tabs/ProfileTab.css` (badge styles)

- [ ] **Step 1: Add state for profile overlay counts**

At the top of the `ProfileTab` function (around line 9), add state and an effect to load overlay counts:

```javascript
  const [profileOverlays, setProfileOverlays] = useState({});

  useEffect(() => {
    if (!api) return;
    api.storeGet('profileOverlays').then(data => setProfileOverlays(data || {}));
  }, [config.activeProfile]); // Reload when profile changes (overlays may have been edited)
```

- [ ] **Step 2: Add mod count badge to profile rows**

In the profile list JSX (around line 330-345), inside the `.profile-row` div, add a badge after the profile name span. Find the `<span className="profile-row-name">` block and add after it:

```jsx
              {(() => {
                const count = (profileOverlays[name] || []).length;
                return count > 0 ? (
                  <span className="pill pill-teal profile-mod-count">{count} mod{count !== 1 ? 's' : ''}</span>
                ) : null;
              })()}
```

- [ ] **Step 3: Clean up profileOverlays on profile delete**

In the `deleteProfile` function (around line 111-125), after the `if (result.success)` block and before `setConfirmDelete(null)`, add:

```javascript
        // Clean up per-profile overlays
        const allOverlays = await api.storeGet('profileOverlays') || {};
        delete allOverlays[name];
        await api.storeSet('profileOverlays', allOverlays);
        setProfileOverlays(allOverlays);
```

- [ ] **Step 4: Copy overlays on profile clone**

In the `cloneProfile` function (around line 127-145), after the `await api.saveProfile(...)` call and before `await loadProfiles()`, add:

```javascript
    // Copy overlay list to cloned profile
    const allOverlays = await api.storeGet('profileOverlays') || {};
    if (allOverlays[name]) {
      allOverlays[cloneName] = [...allOverlays[name]];
      await api.storeSet('profileOverlays', allOverlays);
      setProfileOverlays(allOverlays);
    }
```

- [ ] **Step 5: Add badge CSS**

Add to `src/tabs/ProfileTab.css`:

```css
.profile-mod-count {
  font-size: var(--text-xs, 11px);
  margin-left: 8px;
  flex-shrink: 0;
}
```

- [ ] **Step 6: Verify profile tab changes**

Run: `cd "C:/Users/Calvin Candie/xi-launcher" && npx electron .`
Expected: Profile rows show mod count badges. Deleting a profile cleans up its overlays. Cloning a profile copies overlays.

- [ ] **Step 7: Commit**

```bash
git add src/tabs/ProfileTab.js src/tabs/ProfileTab.css
git commit -m "feat: add mod count badge to profiles, cleanup on delete/clone"
```

---

### Task 7: Edge Cases & Polish

**Files:**
- Modify: `src/tabs/XIPivotTab.js` (reinstall button fix, missing folder badge)

- [ ] **Step 1: Fix reinstall button to not require double-click**

The reinstall button in the custom mods section sets the URL then calls `installCustomMod()`, but the state update hasn't flushed yet. Replace the reinstall button's `onClick` with a direct call:

```jsx
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      setCustomModUrl(mod.url);
                      // Install directly with the mod's URL instead of relying on state
                      setCustomModError('');
                      setCustomModStatus(prev => ({ ...prev, [mod.name]: { status: 'installing', message: 'Starting...', percent: 0 } }));
                      const result = await api.installCustomMod(config.ashitaPath, mod.url);
                      if (result.success) {
                        setCustomModStatus(prev => ({ ...prev, [mod.name]: { status: 'done', message: result.message, percent: 100 } }));
                      } else {
                        setCustomModStatus(prev => ({ ...prev, [mod.name]: { status: 'error', message: result.error, percent: 0 } }));
                      }
                    }}
                    disabled={isInstalling}
                  >
                    {isInstalling ? '◌ Installing...' : '↻ Reinstall'}
                  </button>
```

- [ ] **Step 2: Add "Not found" badge for missing mod folders**

Add a state and effect to check which custom mod folders actually exist on disk:

```javascript
  const [modFolderStatus, setModFolderStatus] = useState({});

  useEffect(() => {
    if (!api || !config.ashitaPath || customMods.length === 0) return;
    const datsRoot = config.ashitaPath + '\\polplugins\\DATs';
    Promise.all(
      customMods.map(mod =>
        api.pathExists(datsRoot + '\\' + mod.name).then(exists => [mod.name, exists])
      )
    ).then(results => {
      setModFolderStatus(Object.fromEntries(results));
    });
  }, [config.ashitaPath, customMods]);
```

In the custom mod card JSX, add a "Not found" badge after the mod name:

```jsx
                <h3 className="hdpack-name cinzel">
                  {mod.name}
                  {modFolderStatus[mod.name] === false && (
                    <span className="pill pill-red custom-mod-missing">Not found</span>
                  )}
                </h3>
```

- [ ] **Step 3: Add missing badge CSS**

Add to `src/tabs/XIPivotTab.css`:

```css
.custom-mod-missing {
  font-size: var(--text-xs, 11px);
  margin-left: 8px;
  vertical-align: middle;
}
```

- [ ] **Step 4: Disable overlay editing when no profile is active**

In the Active Overlays section, wrap the add-overlay input row in a check:

```jsx
        {config.activeProfile && (
          <div className="xipivot-add-row">
            {/* existing input + buttons */}
          </div>
        )}
```

Also disable the HD pack install buttons when no profile is active by adding `disabled={!config.activeProfile}` to the install buttons.

- [ ] **Step 5: Final verification**

Run: `cd "C:/Users/Calvin Candie/xi-launcher" && npx electron .`
Expected:
- Reinstall button works in one click
- Missing mod folders show "Not found" badge
- Overlay management disabled when no profile is active
- Full flow works: install custom mod → appears in profile overlays → launch writes to pivot.ini

- [ ] **Step 6: Commit**

```bash
git add src/tabs/XIPivotTab.js src/tabs/XIPivotTab.css
git commit -m "fix: polish custom mods — reinstall button, missing folder badge, no-profile guard"
```
