import React, { useState, useEffect, useCallback, useRef } from 'react';
import './XIPivotTab.css';

const api = window.xiAPI;

const HD_PACKS = [
  { name: 'AshenbubsHD', desc: 'Massive HD upscale project — 232,000+ textures covering armor, enemies, NPCs, magic effects, and more', url: 'https://github.com/Exarie/AshenbubsHD-Beta', conflictGroup: 'hdtextures' },
  { name: 'NextGames HD', desc: 'HD texture packs by Amelila & RadialArcana — zones, monsters, furniture, trusts, mounts, weapons, and more. Two versions available: "NextHD" for high-quality replacements, or "NextLore" for a lore-friendly upscale closer to vanilla. Download your preferred version from Nexus Mods.', url: 'https://www.nexusmods.com/finalfantasy11/mods/12?tab=files', manual: true, conflictGroup: 'hdtextures' },
  { name: 'XiView', desc: 'HD UI overhaul — status icons, fonts, GUI elements, and menu skins for modern resolutions', url: 'https://github.com/KenshiDRK/XiView', variants: ['Normal', 'Widescreen'], conflictGroup: 'ui' },
  { name: 'XITide', desc: 'HD font and icon replacement — damage numbers, gil values, status icons, linkshell icons, and more (by Ashenbubs)', url: 'https://github.com/CalvinCandie-tech/XITide-Font-Pack', releaseAsset: true, conflictGroup: 'ui' },
  { name: 'FFXI-Vision', desc: 'Cleaner, more detailed zone maps — an overhaul of the stock in-game map files', url: 'https://github.com/Drauku/FFXI-Vision', conflictGroup: 'maps' },
  { name: 'Remapster', desc: 'Hand-drawn zone maps with fine detail — cities, dungeons, open world. Available in 1024 or 2048 resolution', url: 'https://github.com/AkadenTK/remapster_maps', releaseAsset: true, resolutions: true, conflictGroup: 'maps' },
  { name: 'LoFi-FFXI', desc: 'Lo-fi music replacements for FFXI — chill, relaxed versions of in-game BGM tracks', url: 'https://github.com/CatsAndBoats/LoFi-FFXI', conflictGroup: 'music' },
  { name: 'SkyrimXI', desc: 'Skyrim OST mood-matched to FFXI zones — epic orchestral music for towns, fields, dungeons, and battles', url: 'https://github.com/CalvinCandie-tech/SkyrimXI-Music-Pack', releaseAsset: true, conflictGroup: 'music' }
];

const CONFLICT_GROUP_LABELS = {
  hdtextures: 'HD Texture Pack',
  ui: 'UI Pack',
  maps: 'Map Pack',
  music: 'Music Pack'
};

function XIPivotTab({ config, updateConfig, onSettingsSaved }) {
  const [pivotConfig, setPivotConfig] = useState({
    exists: false, rootPath: '', overlays: [], cacheEnabled: false, cacheSize: 1024, cacheMaxAge: 600
  });
  const [dllExists, setDllExists] = useState(false);
  const [newOverlay, setNewOverlay] = useState('');
  const [installStatus, setInstallStatus] = useState('idle'); // idle | installing | done | error
  const [installMsg, setInstallMsg] = useState('');
  const [laaStatus, setLaaStatus] = useState({ exists: false, patched: false, error: null });
  const [laaWorking, setLaaWorking] = useState(false);
  const [laaMsg, setLaaMsg] = useState({ text: '', type: '' }); // type: success | error
  const [polExePath, setPolExePath] = useState('');
  const [profileOverlays, setProfileOverlays] = useState([]);
  const [customMods, setCustomMods] = useState([]);
  const [customModUrl, setCustomModUrl] = useState('');
  const [customModStatus, setCustomModStatus] = useState({});
  const [customModError, setCustomModError] = useState('');
  const [modFolderStatus, setModFolderStatus] = useState({});

  const checkLAA = useCallback(async () => {
    if (!api || !config.ffxiPath) return;
    // pol.exe can be in several places relative to the FFXI install
    const candidates = [
      config.ffxiPath + '\\pol.exe',
      config.ffxiPath + '\\..\\PlayOnlineViewer\\pol.exe',
      config.ffxiPath + '\\..\\..\\PlayOnlineViewer\\pol.exe',
      'C:\\Program Files (x86)\\PlayOnline\\SquareEnix\\PlayOnlineViewer\\pol.exe',
      'C:\\Ashita\\ffxi-bootmod\\pol.exe'
    ];
    for (const candidate of candidates) {
      const exists = await api.pathExists(candidate);
      if (exists) {
        setPolExePath(candidate);
        const result = await api.checkLAA(candidate);
        setLaaStatus(result);
        return;
      }
    }
    setPolExePath('');
    setLaaStatus({ exists: false, patched: false });
  }, [config.ffxiPath]);

  const load = useCallback(async () => {
    if (!api) return;
    const [cfg, dll] = await Promise.all([
      api.readXIPivotConfig(config.ashitaPath),
      api.pathExists(config.ashitaPath + '\\polplugins\\pivot.dll')
    ]);
    setPivotConfig(cfg);
    setDllExists(dll);
  }, [config.ashitaPath]);

  useEffect(() => { checkLAA(); }, [checkLAA]);

  useEffect(() => { load(); }, [load]);

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

  // Load custom mods list
  useEffect(() => {
    if (!api) return;
    api.storeGet('customMods').then(mods => setCustomMods(mods || []));
  }, []);

  // Check if each custom mod's folder exists on disk
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

  // Listen for custom mod install progress
  useEffect(() => {
    if (!api?.onCustomModProgress) return;
    const cleanup = api.onCustomModProgress((modName, percent, detail) => {
      setCustomModStatus(prev => ({ ...prev, [modName]: { status: 'installing', message: detail, percent } }));
    });
    return cleanup;
  }, []);

  const saveProfileOverlays = async (newOverlays) => {
    if (!config.activeProfile) return;
    setProfileOverlays(newOverlays);
    const allOverlays = await api.storeGet('profileOverlays') || {};
    allOverlays[config.activeProfile] = newOverlays;
    await api.storeSet('profileOverlays', allOverlays);
  };

  // Ensure 'pivot' is listed under [ashita.polplugins] in the active profile
  const ensurePivotInProfile = async () => {
    if (!config?.activeProfile || !config?.ashitaPath || !api) return;
    const profile = await api.readProfile(config.ashitaPath, config.activeProfile);
    if (!profile.exists) return;

    const lines = profile.content.split('\n');
    const polIdx = lines.findIndex(l => l.trim() === '[ashita.polplugins]');
    if (polIdx === -1) return;

    // Find section end
    let nextIdx = lines.length;
    for (let i = polIdx + 1; i < lines.length; i++) {
      if (lines[i].trim().startsWith('[')) { nextIdx = i; break; }
    }

    // Check if pivot is already listed
    const sectionLines = lines.slice(polIdx + 1, nextIdx);
    const hasPivot = sectionLines.some(l => l.trim().replace(/\s*=\s*.*/, '') === 'pivot');
    if (hasPivot) return;

    // Insert 'pivot = 1' into the section
    lines.splice(polIdx + 1, 0, 'pivot = 1');
    await api.saveProfile(config.ashitaPath, config.activeProfile, lines.join('\n'));
  };

  const installXIPivot = async () => {
    setInstallStatus('installing');
    setInstallMsg('Downloading XIPivot from GitHub...');
    const result = await api.installXIPivot(config.ashitaPath);
    if (result.success) {
      setInstallStatus('done');
      setInstallMsg(result.message);
      await ensurePivotInProfile();
      await load(); // Refresh status
    } else {
      setInstallStatus('error');
      setInstallMsg(result.error);
    }
  };

  const toggleLAA = async () => {
    if (laaWorking) return;
    const enabling = !laaStatus.patched;
    setLaaWorking(true);
    setLaaMsg({ text: '', type: '' });
    const result = await api.setLAA(polExePath, enabling);
    if (result.success) {
      setLaaStatus(prev => ({ ...prev, patched: result.patched }));
      setLaaMsg({
        text: enabling
          ? '✓ pol.exe has been patched — FFXI can now use up to 4 GB of RAM. The change takes effect next time you launch the game.'
          : '✓ pol.exe has been reverted to the default 2 GB memory limit.',
        type: 'success'
      });
    } else {
      setLaaMsg({ text: '✕ ' + result.error, type: 'error' });
    }
    setLaaWorking(false);
  };

  const saveConfig = async (updates) => {
    const newCfg = { ...pivotConfig, ...updates };
    setPivotConfig(newCfg);
    await api.writeXIPivotConfig(config.ashitaPath, newCfg);
    await ensurePivotInProfile();
    if (onSettingsSaved) onSettingsSaved();
  };

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

  // Drag-and-drop reordering
  const dragIdx = useRef(null);
  const handleDragStart = (idx) => { dragIdx.current = idx; };
  const handleDragOver = (e) => { e.preventDefault(); };
  const handleDrop = async (targetIdx) => {
    const fromIdx = dragIdx.current;
    if (fromIdx === null || fromIdx === targetIdx) return;
    const overlays = [...profileOverlays];
    const [moved] = overlays.splice(fromIdx, 1);
    overlays.splice(targetIdx, 0, moved);
    dragIdx.current = null;
    await saveProfileOverlays(overlays);
  };

  const browseOverlay = async () => {
    const result = await api.browseFolder(pivotConfig.rootPath || config.ashitaPath);
    if (result) {
      const parts = result.replace(/\\/g, '/').split('/');
      setNewOverlay(parts[parts.length - 1]);
    }
  };

  const browseRoot = async () => {
    const result = await api.browseFolder(pivotConfig.rootPath || config.ashitaPath);
    if (result) await saveConfig({ rootPath: result });
  };

  const isValidModUrl = (url) => {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  };

  const installCustomMod = async () => {
    const url = customModUrl.trim();
    if (!url) return;
    if (!isValidModUrl(url)) {
      setCustomModError('Not a valid URL — paste a GitHub link or direct zip URL');
      return;
    }
    setCustomModError('');

    const info = await api.fetchGithubRepoInfo(url);
    if (!info.success) {
      setCustomModError(info.error);
      return;
    }

    setCustomModStatus(prev => ({ ...prev, [info.name]: { status: 'installing', message: 'Starting...', percent: 0 } }));
    setCustomModUrl('');

    const result = await api.installCustomMod(config.ashitaPath, url);
    if (result.success) {
      const updatedMods = customMods.filter(m => m.name !== result.name);
      updatedMods.push({ name: result.name, url, description: info.description || '', installedAt: new Date().toISOString() });
      setCustomMods(updatedMods);
      await api.storeSet('customMods', updatedMods);

      if (config.activeProfile && !profileOverlays.includes(result.name)) {
        await saveProfileOverlays([...profileOverlays, result.name]);
      }

      setCustomModStatus(prev => ({ ...prev, [result.name]: { status: 'done', message: result.message, percent: 100 } }));
    } else {
      setCustomModStatus(prev => ({ ...prev, [info.name]: { status: 'error', message: result.error, percent: 0 } }));
    }
  };

  const removeCustomMod = async (modName) => {
    const result = await api.removeCustomMod(config.ashitaPath, modName);
    if (result.success) {
      const updatedMods = customMods.filter(m => m.name !== modName);
      setCustomMods(updatedMods);
      await api.storeSet('customMods', updatedMods);

      if (profileOverlays.includes(modName)) {
        await saveProfileOverlays(profileOverlays.filter(n => n !== modName));
      }

      setCustomModStatus(prev => { const s = { ...prev }; delete s[modName]; return s; });
    }
  };

  const [hdPackStatus, setHdPackStatus] = useState({}); // { packName: { status, message, percent } }
  const [remapsterRes, setRemapsterRes] = useState(() => config.remapsterRes || '2048');
  const [xiviewVariant, setXiviewVariant] = useState(() => config.xiviewVariant || 'Widescreen');

  useEffect(() => {
    if (!api?.onHDPackProgress) return;
    const cleanup = api.onHDPackProgress((packName, phase, percent, detail) => {
      setHdPackStatus(prev => ({ ...prev, [packName]: { status: 'installing', message: detail, percent } }));
    });
    return cleanup;
  }, []);

  const installHDPack = async (pack) => {
    if (hdPackStatus[pack.name]?.status === 'installing') return;
    setHdPackStatus(prev => ({ ...prev, [pack.name]: { status: 'installing', message: 'Starting download...', percent: 0 } }));

    let result;
    if (pack.manual) {
      result = await api.installHDPackManual(config.ashitaPath, pack.name);
    } else if (pack.releaseAsset) {
      result = await api.installHDPackRelease(config.ashitaPath, pack.name, pack.url, remapsterRes);
    } else {
      const subdir = pack.variants ? (pack.name === 'XiView' ? xiviewVariant : null) : null;
      result = await api.installHDPack(config.ashitaPath, pack.name, pack.url, subdir);
    }
    if (result.success) {
      // Remove conflicting packs from overlays
      let newOverlays = [...profileOverlays];
      if (pack.conflictGroup && pack.conflictGroup !== 'hdtextures' && pack.conflictGroup !== 'ui') {
        const conflicting = HD_PACKS
          .filter(p => p.conflictGroup === pack.conflictGroup && p.name !== pack.name)
          .map(p => p.name);
        newOverlays = newOverlays.filter(name => !conflicting.includes(name));
        // Clear done status on conflicting packs so they show as installable again
        setHdPackStatus(prev => {
          const updated = { ...prev };
          conflicting.forEach(name => { delete updated[name]; });
          return updated;
        });
      }
      if (!newOverlays.includes(pack.name)) {
        newOverlays.push(pack.name);
      }
      await saveProfileOverlays(newOverlays);
      setHdPackStatus(prev => ({ ...prev, [pack.name]: { status: 'done', message: result.message, percent: 100 } }));
    } else {
      setHdPackStatus(prev => ({ ...prev, [pack.name]: { status: 'error', message: result.error, percent: 0 } }));
    }
  };

  const pauseHDPack = async (packName) => {
    const ps = hdPackStatus[packName];
    if (!ps) return;
    if (ps.paused) {
      await api.hdpackResume(packName);
      setHdPackStatus(prev => ({ ...prev, [packName]: { ...prev[packName], paused: false } }));
    } else {
      await api.hdpackPause(packName);
      setHdPackStatus(prev => ({ ...prev, [packName]: { ...prev[packName], paused: true } }));
    }
  };

  const cancelHDPack = async (packName) => {
    await api.hdpackCancel(packName);
    setHdPackStatus(prev => ({ ...prev, [packName]: { status: 'error', message: 'Download cancelled.', percent: 0, paused: false } }));
  };

  return (
    <div className="xipivot-tab">
      <div className="panel xipivot-status-bar">
        <div className="xipivot-status-items">
          <span className={`pill ${dllExists ? 'pill-green' : 'pill-red'}`}>
            pivot.dll {dllExists ? 'Found' : 'Not Found'}
          </span>
          <span className={`pill ${pivotConfig.exists ? 'pill-green' : 'pill-red'}`}>
            pivot.ini {pivotConfig.exists ? 'Found' : 'Not Found'}
          </span>
          <span className="pill pill-teal">{profileOverlays.length} overlay{profileOverlays.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {config.activeProfile ? (
        <div className="xipivot-profile-banner">
          Editing overlays for: <strong>{config.activeProfile}</strong>
        </div>
      ) : (
        <div className="xipivot-profile-banner xipivot-profile-banner-inactive">
          No active profile — select one on the Profiles tab
        </div>
      )}

      {!dllExists && (
        <div className="panel xipivot-install-panel">
          <div className="xipivot-install-info">
            <strong>XIPivot is not installed</strong>
            <p>XIPivot is a polplugin that lets you load HD texture packs and DAT mods without modifying your game files. Click below to automatically download and install it from GitHub.</p>
          </div>
          <div className="xipivot-install-actions">
            <button
              className="btn btn-teal"
              onClick={installXIPivot}
              disabled={installStatus === 'installing'}
            >
              {installStatus === 'installing' ? '◌ Downloading...' : '⚡ Install XIPivot Automatically'}
            </button>
          </div>
          {installMsg && (
            <div className={`xiloader-build-log ${installStatus === 'error' ? 'error' : installStatus === 'done' ? 'success' : ''}`}>
              {installMsg}
            </div>
          )}
        </div>
      )}

      <div className="section-header">DATs Root Path</div>
      <div className="panel">
        <p className="xipivot-hint">The root directory where overlay folders are stored. Default is <code className="mono">{config.ashitaPath}\polplugins\DATs</code>.</p>
        <div className="xipivot-path-row">
          <input
            type="text"
            value={pivotConfig.rootPath || ''}
            onChange={e => setPivotConfig(prev => ({ ...prev, rootPath: e.target.value }))}
            onBlur={e => saveConfig({ rootPath: e.target.value })}
            className="xipivot-flex-1"
            placeholder={config.ashitaPath}
          />
          <button className="btn btn-ghost btn-sm" onClick={browseRoot}>Browse</button>
        </div>
      </div>

      <div className="section-header">Active Overlays</div>
      <div className="panel">
        <p className="xipivot-hint">Top = highest priority. Changes after launch may not affect already-loaded DATs.</p>
        {profileOverlays.length === 0 ? (
          <div className="xipivot-empty">No overlays configured. Add one below.</div>
        ) : (
          <div className="xipivot-overlay-list">
            {profileOverlays.map((name, idx) => (
              <div key={idx} className="xipivot-overlay-row"
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(idx)}
              >
                <span className="xipivot-overlay-num" title="Drag to reorder">{idx + 1}</span>
                <span className="xipivot-overlay-name mono">{name}</span>
                <div className="xipivot-overlay-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => moveOverlay(idx, -1)} disabled={idx === 0}>▲</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => moveOverlay(idx, 1)} disabled={idx === profileOverlays.length - 1}>▼</button>
                  <button className="btn btn-ghost btn-sm xipivot-remove-btn" onClick={() => removeOverlay(idx)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {config.activeProfile && (
          <div className="xipivot-add-row">
            <input
              type="text"
              value={newOverlay}
              onChange={e => setNewOverlay(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addOverlay()}
              placeholder="Overlay folder name..."
              className="xipivot-flex-1"
            />
            <button className="btn btn-ghost btn-sm" onClick={browseOverlay}>Browse</button>
            <button className="btn btn-primary btn-sm" onClick={addOverlay} disabled={!newOverlay.trim()}>Add</button>
          </div>
        )}
      </div>

      <div className="section-header">Memory Cache</div>
      <div className="panel">
        <p className="xipivot-hint">
          The memory cache keeps recently loaded DAT files in RAM so they don't need to be re-read from disk.
          This speeds up zone transitions and model loading, especially on HDDs.
          {laaStatus.patched ? (
            <> You have the <strong className="xipivot-text-green">4 GB patch</strong> applied, so you have more room to work with —
            but FFXI still shares that memory with addons, plugins, and the game itself. A cache size of 512–1024 MB is a good range.</>
          ) : (
            <> Be careful with large HD packs — FFXI is a 32-bit game limited to <strong className="xipivot-text-red">2 GB RAM</strong> by default,
            so setting this too high can cause crashes. Apply the <strong>4 GB RAM Patch</strong> below to double the available memory.</>
          )}
        </p>
        <div className={`setting-row ${pivotConfig.cacheEnabled ? 'xipivot-border-bottom' : 'xipivot-no-border'}`}>
          <div className="setting-info">
            <span className="setting-name">Enable Cache</span>
            <span className="setting-hint-inline">
              Recommended: <strong className="xipivot-text-green">ON</strong> if you use any HD texture packs or experience slow zone transitions.
              When enabled, XIPivot stores DAT files it has already loaded in RAM so the game doesn't re-read them from disk every time.
              This makes repeated zone-ins, model loads, and menu opens noticeably faster — especially on mechanical hard drives (HDDs).
              If you're on an SSD with no HD packs, you can leave this off.
            </span>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={pivotConfig.cacheEnabled} onChange={e => saveConfig({ cacheEnabled: e.target.checked })} />
            <span className="toggle-slider" />
          </label>
        </div>
        {pivotConfig.cacheEnabled && (
          <>
            <div className="cache-setting-block">
              <span className="setting-name">Cache Size (MB)</span>
              <span className="setting-hint-inline xipivot-mb-6">
                {laaStatus.patched
                  ? <>With the <strong className="xipivot-text-green">4 GB patch</strong> applied, you can safely go higher.
                    Recommended: <strong>512 MB</strong> for 1–2 small overlays, <strong>768–1024 MB</strong> for multiple HD packs like AshenbubsHD.
                    Don't exceed 1536 MB — the game, addons, and plugins also need room in the 4 GB address space.</>
                  : <>Without the 4 GB patch, FFXI is capped at 2 GB total RAM.
                    Recommended: <strong>256 MB</strong> for light use, <strong>512 MB max</strong> to stay safe.
                    Going higher risks out-of-memory crashes, especially with multiple addons loaded.
                    Apply the <strong>4 GB RAM Patch</strong> below to unlock more headroom.</>
                }
              </span>
              <div className="cache-options">
                {[
                  { value: 128, label: '128 MB', tag: 'Minimal' },
                  { value: 256, label: '256 MB', tag: 'Light' },
                  { value: 512, label: '512 MB', tag: 'Recommended' },
                  { value: 768, label: '768 MB', tag: 'HD Packs' },
                  { value: 1024, label: '1024 MB', tag: 'Multiple HD' },
                  { value: 1536, label: '1536 MB', tag: 'Heavy Use' },
                  { value: 2048, label: '2048 MB', tag: 'Maximum' }
                ].map(opt => (
                  <button
                    key={opt.value}
                    className={`cache-option-btn ${pivotConfig.cacheSize === opt.value ? 'active' : ''}`}
                    onClick={() => saveConfig({ cacheSize: opt.value })}
                  >
                    <span className="cache-option-value mono">{opt.label}</span>
                    <span className="cache-option-tag">{opt.tag}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="cache-setting-block xipivot-no-border">
              <span className="setting-name">Max Age</span>
              <span className="setting-hint-inline xipivot-mb-6">
                How long an unused DAT stays in the cache before it gets removed to free up RAM.
                Recommended: <strong>10 min</strong> for most players. Lower to <strong>2–5 min</strong> if you're tight on memory,
                or increase to <strong>30–60 min</strong> if you revisit the same zones frequently and have RAM to spare.
              </span>
              <div className="cache-options">
                {[
                  { value: 60, label: '1 min', tag: 'Low Memory' },
                  { value: 120, label: '2 min', tag: 'Conservative' },
                  { value: 300, label: '5 min', tag: 'Light Use' },
                  { value: 600, label: '10 min', tag: 'Recommended' },
                  { value: 900, label: '15 min', tag: 'Extended' },
                  { value: 1800, label: '30 min', tag: 'Long Sessions' },
                  { value: 3600, label: '1 hour', tag: 'Maximum' }
                ].map(opt => (
                  <button
                    key={opt.value}
                    className={`cache-option-btn ${pivotConfig.cacheMaxAge === opt.value ? 'active' : ''}`}
                    onClick={() => saveConfig({ cacheMaxAge: opt.value })}
                  >
                    <span className="cache-option-value mono">{opt.label}</span>
                    <span className="cache-option-tag">{opt.tag}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="section-header">4GB RAM Patch (Large Address Aware)</div>
      <div className="panel laa-panel">
        <div className="laa-content">
          <div className="laa-info">
            <p className="xipivot-hint xipivot-mb-8">
              FFXI's <code className="mono">pol.exe</code> is a 32-bit application limited to <strong>2 GB of RAM</strong> by default.
              This patch flips a flag in the executable's header that tells 64-bit Windows to allow the process to use <strong>up to 4 GB</strong> instead.
              This is highly recommended if you use HD texture packs — more textures means more memory, and hitting the 2 GB limit causes crashes.
            </p>
            <p className="xipivot-hint xipivot-hint-small">
              The patch modifies a single byte in <code className="mono">pol.exe</code>. It's safe, reversible, and widely used by the FFXI community.
              Game updates may replace the file, so you may need to re-apply after a version update.
            </p>
          </div>
          <div className="laa-controls">
            {!config.ffxiPath ? (
              <span className="pill pill-red">Set FFXI path in Profiles first</span>
            ) : !laaStatus.exists ? (
              <span className="pill pill-red">pol.exe not found — check your FFXI install path</span>
            ) : (
              <>
                <span className={`pill ${laaStatus.patched ? 'pill-green' : 'pill-red'}`}>
                  {laaStatus.patched ? '4 GB Enabled' : '2 GB (Default)'}
                </span>
                <button
                  className={`btn ${laaStatus.patched ? 'btn-ghost' : 'btn-primary'} btn-sm`}
                  onClick={toggleLAA}
                  disabled={laaWorking}
                >
                  {laaWorking ? '◌ Working...' : laaStatus.patched ? 'Unpatch (Revert to 2 GB)' : '⚡ Patch pol.exe for 4 GB'}
                </button>
              </>
            )}
            {laaStatus.error && (
              <span className="pill pill-red xipivot-pill-small">{laaStatus.error}</span>
            )}
          </div>
          {laaMsg.text && (
            <div className={`laa-feedback ${laaMsg.type}`}>
              {laaMsg.text}
            </div>
          )}
          {polExePath && laaStatus.exists && (
            <div className="xipivot-laa-path mono">
              {polExePath}
            </div>
          )}
        </div>
      </div>

      <div className="section-header">Popular HD Mod Packs</div>
      <p className="xipivot-hint">
        Click "Install" to automatically download the mod from GitHub and set it up as an XIPivot overlay.
        Some packs are hosted on Nexus Mods — download the zip first, then click "Select Zip" to install.
        The files will be extracted to your DATs folder and registered in your config. Some packs are large and may take a minute to download.
      </p>

      {/* Render conflict groups first */}
      {Object.entries(CONFLICT_GROUP_LABELS).map(([groupKey, groupLabel]) => {
        const groupPacks = HD_PACKS.filter(p => p.conflictGroup === groupKey);
        const activePacks = groupPacks.filter(p => profileOverlays.includes(p.name));
        const isNonExclusive = groupKey === 'hdtextures' || groupKey === 'ui';
        return (
          <div key={groupKey} className="conflict-group panel">
            <div className="conflict-group-header">
              <span className="conflict-group-label">{groupLabel}{isNonExclusive ? '' : ' — choose one'}</span>
              {activePacks.length > 0 && activePacks.map(p => (
                <span key={p.name} className="pill pill-green xipivot-pill-tiny">Using {p.name}</span>
              ))}
            </div>
            <div className="conflict-group-cards">
              {groupPacks.map(pack => {
                const added = profileOverlays.includes(pack.name);
                const ps = hdPackStatus[pack.name];
                const isInstalling = ps?.status === 'installing';
                return (
                  <div key={pack.name} className={`hdpack-card-inline ${added ? 'hdpack-selected' : ''}`}>
                    <div className="hdpack-card-body">
                      <h3 className="hdpack-name cinzel">{pack.name}</h3>
                      <p className="hdpack-desc">{pack.desc}</p>
                      {pack.releaseAsset && pack.resolutions && (
                        <div className="hdpack-resolution">
                          <span className="hdpack-res-label">Resolution:</span>
                          <button className={`btn btn-sm ${remapsterRes === '1024' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setRemapsterRes('1024'); updateConfig('remapsterRes', '1024'); }}>1024</button>
                          <button className={`btn btn-sm ${remapsterRes === '2048' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setRemapsterRes('2048'); updateConfig('remapsterRes', '2048'); }}>2048</button>
                        </div>
                      )}
                      {pack.manual ? (
                        <div className="hdpack-manual-steps">
                          <div className="hdpack-step">
                            <span className="hdpack-step-num">1</span>
                            <button className="btn btn-primary btn-sm" onClick={() => api.openExternal(pack.url)}>
                              Download from Nexus Mods ↗
                            </button>
                          </div>
                          <div className="hdpack-step">
                            <span className="hdpack-step-num">2</span>
                            <button
                              className={`btn ${added ? 'btn-ghost' : 'btn-teal'} btn-sm`}
                              onClick={() => installHDPack(pack)}
                              disabled={isInstalling || (added && ps?.status === 'done')}
                            >
                              {isInstalling ? '◌ Installing...' : added && ps?.status === 'done' ? '✓ Active' : added ? '↻ Reinstall' : 'Select Downloaded Zip'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="hdpack-actions">
                          <button
                            className={`btn ${added ? 'btn-ghost' : 'btn-primary'} btn-sm`}
                            onClick={() => installHDPack(pack)}
                            disabled={isInstalling || (added && ps?.status === 'done')}
                          >
                            {isInstalling ? '◌ Installing...' : added && ps?.status === 'done' ? '✓ Active' : added ? '↻ Reinstall' : 'Install'}
                          </button>
                          {pack.url && (
                            <button className="btn btn-ghost btn-sm hdpack-link" onClick={() => api.openExternal(pack.url)}>GitHub ↗</button>
                          )}
                        </div>
                      )}
                    </div>
                    {ps && (
                      <div className="hdpack-progress-area">
                        {ps.status === 'installing' && (
                          <>
                            <div className="hdpack-progress-row">
                              <div className="hdpack-progress-bar">
                                <div className="hdpack-progress-fill" style={{ width: `${ps.percent || 0}%` }} />
                              </div>
                              <span className="hdpack-progress-pct">{Math.round(ps.percent || 0)}%</span>
                            </div>
                            {!pack.manual && (
                              <div className="hdpack-dl-controls">
                                <button className="btn btn-ghost btn-xs" onClick={() => pauseHDPack(pack.name)}>
                                  {ps.paused ? '▶ Resume' : '⏸ Pause'}
                                </button>
                                <button className="btn btn-ghost btn-xs hdpack-cancel-btn" onClick={() => cancelHDPack(pack.name)}>
                                  ✕ Cancel
                                </button>
                              </div>
                            )}
                          </>
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
          </div>
        );
      })}

      {/* Render non-conflicting packs in grid */}
      <div className="hdpacks-grid">
        {HD_PACKS.filter(p => !p.conflictGroup).map(pack => {
          const added = profileOverlays.includes(pack.name);
          const ps = hdPackStatus[pack.name];
          const isInstalling = ps?.status === 'installing';
          return (
            <div key={pack.name} className={`panel hdpack-card ${added ? 'hdpack-installed' : ''}`}>
              <h3 className="hdpack-name cinzel">{pack.name}</h3>
              <p className="hdpack-desc">{pack.desc}</p>
              {pack.variants && (
                <div className="hdpack-resolution">
                  <span className="hdpack-res-label">Variant:</span>
                  {pack.variants.map(v => (
                    <button key={v} className={`btn btn-sm ${xiviewVariant === v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setXiviewVariant(v); updateConfig('xiviewVariant', v); }}>{v}</button>
                  ))}
                </div>
              )}
              {pack.manual ? (
                <div className="hdpack-manual-steps">
                  <div className="hdpack-step">
                    <span className="hdpack-step-num">1</span>
                    <button className="btn btn-primary btn-sm" onClick={() => api.openExternal(pack.url)}>
                      Download from Nexus Mods ↗
                    </button>
                  </div>
                  <div className="hdpack-step">
                    <span className="hdpack-step-num">2</span>
                    <button
                      className={`btn ${added ? 'btn-ghost' : 'btn-teal'} btn-sm`}
                      onClick={() => installHDPack(pack)}
                      disabled={isInstalling || (added && ps?.status === 'done')}
                    >
                      {isInstalling ? '◌ Installing...' : added && ps?.status === 'done' ? '✓ Installed' : added ? '↻ Reinstall' : 'Select Downloaded Zip'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="hdpack-actions">
                  <button
                    className={`btn ${added ? 'btn-ghost' : 'btn-primary'} btn-sm`}
                    onClick={() => installHDPack(pack)}
                    disabled={isInstalling || (added && ps?.status === 'done')}
                  >
                    {isInstalling ? '◌ Installing...' : added && ps?.status === 'done' ? '✓ Installed' : added ? '↻ Reinstall' : 'Install'}
                  </button>
                  {pack.url && (
                    <button className="btn btn-ghost btn-sm hdpack-link" onClick={() => api.openExternal(pack.url)}>GitHub ↗</button>
                  )}
                </div>
              )}
              {ps && (
                <div className="hdpack-progress-area">
                  {ps.status === 'installing' && (
                    <>
                      <div className="hdpack-progress-row">
                        <div className="hdpack-progress-bar">
                          <div className="hdpack-progress-fill" style={{ width: `${ps.percent || 0}%` }} />
                        </div>
                        <span className="hdpack-progress-pct">{Math.round(ps.percent || 0)}%</span>
                      </div>
                      {!pack.manual && (
                        <div className="hdpack-dl-controls">
                          <button className="btn btn-ghost btn-xs" onClick={() => pauseHDPack(pack.name)}>
                            {ps.paused ? '▶ Resume' : '⏸ Pause'}
                          </button>
                          <button className="btn btn-ghost btn-xs hdpack-cancel-btn" onClick={() => cancelHDPack(pack.name)}>
                            ✕ Cancel
                          </button>
                        </div>
                      )}
                    </>
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
                <h3 className="hdpack-name cinzel">
                  {mod.name}
                  {modFolderStatus[mod.name] === false && (
                    <span className="pill pill-red custom-mod-missing">Not found</span>
                  )}
                </h3>
                <p className="hdpack-desc">{mod.description || 'Custom DAT mod'}</p>
                <div className="custom-mod-meta">
                  <button className="btn btn-ghost btn-sm hdpack-link" onClick={() => api.openExternal(mod.url)}>Source ↗</button>
                </div>
                <div className="hdpack-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={async () => {
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

    </div>
  );
}

export default XIPivotTab;
