import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import HomeTab from './tabs/HomeTab';
import ProfileTab from './tabs/ProfileTab';
import AddonsTab from './tabs/AddonsTab';
import SettingsTab from './tabs/SettingsTab';
import XIPivotTab from './tabs/XIPivotTab';
import DgVoodooTab from './tabs/DgVoodooTab';
import PluginsTab from './tabs/PluginsTab';
// ScriptEditorTab is now embedded in ProfileTab
import SetupWizard from './components/SetupWizard';
import UpdateModal from './components/UpdateModal';
import ErrorBoundary from './components/ErrorBoundary';
import Modal from './components/Modal';
import { ADDON_CATALOGUE } from './tabs/AddonsTab';

const api = window.xiAPI;

function App() {
  const [config, setConfig] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchLog, setLaunchLog] = useState('');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [addonUpdates, setAddonUpdates] = useState([]);
  const [launchWarning, setLaunchWarning] = useState(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicTracks, setMusicTracks] = useState([]);
  const [musicIndex, setMusicIndex] = useState(0);
  const [musicVolume, setMusicVolume] = useState(0.05);
  const [musicShuffle, setMusicShuffle] = useState(false);
  const [musicLoop, setMusicLoop] = useState('none'); // 'none' | 'all' | 'one'
  const [profiles, setProfiles] = useState([]);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [dirtyConfirm, setDirtyConfirm] = useState(null); // { message, onConfirm }
  const audioRef = useRef(null);
  const shuffleOrderRef = useRef([]);

  useEffect(() => {
    if (!api) return;
    api.storeGetAll().then(async (data) => {
      // Auto-detect paths that aren't set yet
      const updates = {};

      // Get runtime paths from main process
      const runtime = api.getRuntimePaths ? await api.getRuntimePaths() : {};

      // Only auto-detect Ashita if the current path doesn't have Ashita-cli.exe
      // and is NOT already pointing to the runtime folder (user chose runtime — don't override)
      const ashitaValid = data.ashitaPath && await api.pathExists(data.ashitaPath + '\\Ashita-cli.exe');
      const isRuntimePath = runtime.defaultAshitaPath && data.ashitaPath?.startsWith(runtime.runtimeDir);
      if (!ashitaValid && !isRuntimePath) {
        const ashitaCandidates = [
          runtime.defaultAshitaPath,
          'C:\\Ashita-v4',
          'C:\\Ashita v4',
          'C:\\Ashita-v4beta',
          'C:\\Ashita',
          'D:\\Ashita-v4',
          'D:\\Ashita',
          'C:\\Games\\Ashita-v4',
          'C:\\Games\\Ashita'
        ].filter(Boolean);
        for (const p of ashitaCandidates) {
          if (await api.pathExists(p + '\\Ashita-cli.exe')) {
            updates.ashitaPath = p;
            break;
          }
        }
      }

      if (!data.ffxiPath) {
        const ffxiCandidates = [
          'C:\\Program Files (x86)\\PlayOnline\\SquareEnix\\FINAL FANTASY XI',
          'C:\\Program Files (x86)\\PlayOnline\\SquareEnix\\FinalFantasyXI',
          'D:\\Program Files (x86)\\PlayOnline\\SquareEnix\\FINAL FANTASY XI',
          'C:\\Games\\FINAL FANTASY XI',
          'D:\\Games\\FINAL FANTASY XI'
        ];
        for (const p of ffxiCandidates) {
          if (await api.pathExists(p)) {
            updates.ffxiPath = p;
            break;
          }
        }
      }

      if (!data.xiloaderPath || !(await api.pathExists((data.xiloaderPath || '') + '\\xiloader.exe'))) {
        const xiloaderCandidates = [
          runtime.defaultXiloaderPath,
          'C:\\xiloader',
          'C:\\Ashita\\xiloader',
          'D:\\xiloader',
          data.ashitaPath ? data.ashitaPath + '\\xiloader' : null,
          updates.ashitaPath ? updates.ashitaPath + '\\xiloader' : null
        ].filter(Boolean);
        for (const p of xiloaderCandidates) {
          if (await api.pathExists(p + '\\xiloader.exe')) {
            updates.xiloaderPath = p;
            break;
          }
        }
      }

      // Apply any found paths
      const merged = { ...data, ...updates };
      for (const [key, value] of Object.entries(updates)) {
        api.storeSet(key, value);
      }
      setConfig(merged);

      // Show setup wizard for first-time users
      if (!merged.setupComplete && !merged.activeProfile) {
        setShowWizard(true);
      }

      // Save initial profile settings snapshot if a profile is active
      if (merged.activeProfile) {
        const existing = await api.loadProfileSettings(merged.activeProfile);
        if (!existing) {
          // First time — capture current state
          const snapshot = {};
          for (const k of ['serverHost', 'serverPort', 'loginUser', 'loginPass']) {
            if (merged[k] !== undefined) snapshot[k] = merged[k];
          }
          try {
            const pivot = await api.readXIPivotConfig(merged.ashitaPath);
            snapshot.xipivot = {
              overlays: pivot.overlays || [],
              cacheEnabled: pivot.cacheEnabled || false,
              cacheSize: pivot.cacheSize || 1024,
              cacheMaxAge: pivot.cacheMaxAge || 600,
              rootPath: pivot.rootPath || ''
            };
          } catch (e) { console.error('Failed to read XIPivot config for profile snapshot:', e); }
          api.saveProfileSettings(merged.activeProfile, snapshot);
        }
      }
    });
  }, []);

  // Load profiles list
  useEffect(() => {
    if (!api || !config?.ashitaPath) return;
    api.listProfiles(config.ashitaPath).then(setProfiles).catch(() => {});
  }, [config?.ashitaPath, config?.activeProfile]);

  // Check for updates on startup
  useEffect(() => {
    if (!api?.checkForUpdates) return;
    api.checkForUpdates().then(info => {
      if (info && !info.upToDate && info.latest) setUpdateInfo(info);
    });
  }, []);

  // Check for addon updates on startup
  useEffect(() => {
    if (!api?.checkAddonUpdates || !config?.ashitaPath) return;
    const communityAddons = ADDON_CATALOGUE.filter(a => a.category === 'Community' && a.repo);
    api.checkAddonUpdates(communityAddons).then(result => {
      if (result?.updates?.length > 0) {
        setAddonUpdates(result.updates);
      }
    });
  }, [config?.ashitaPath]);

  // Music player
  const autoPlayedRef = useRef(false);
  useEffect(() => {
    if (!api?.listMusic) return;
    api.listMusic().then(tracks => setMusicTracks(tracks));
  }, []);

  // Generate shuffle order when tracks change or shuffle toggled
  useEffect(() => {
    if (musicTracks.length === 0) return;
    const order = musicTracks.map((_, i) => i);
    if (musicShuffle) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    shuffleOrderRef.current = order;
  }, [musicTracks, musicShuffle]);

  const getTrackIndex = useCallback((idx) => {
    const len = shuffleOrderRef.current.length;
    if (len === 0) return 0;
    return shuffleOrderRef.current[((idx % len) + len) % len];
  }, []);

  const currentTrackName = musicTracks.length > 0
    ? musicTracks[getTrackIndex(musicIndex)]?.replace(/\.[^.]+$/, '') || ''
    : '';

  const toggleMusic = useCallback(async () => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = musicVolume;
      audioRef.current.addEventListener('ended', () => {
        setMusicLoop(currentLoop => {
          if (currentLoop === 'one') {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
            return currentLoop;
          }
          setMusicIndex(prev => {
            const next = prev + 1;
            setMusicTracks(tracks => {
              if (currentLoop === 'none' && next >= tracks.length) {
                setMusicPlaying(false);
                audioRef.current.pause();
              }
              return tracks;
            });
            return next;
          });
          return currentLoop;
        });
      });
    }

    if (musicPlaying) {
      audioRef.current.pause();
      setMusicPlaying(false);
    } else {
      if (musicTracks.length === 0) {
        if (api?.openMusicFolder) api.openMusicFolder();
        return;
      }
      const trackIdx = getTrackIndex(musicIndex);
      const track = musicTracks[trackIdx];
      const dataUrl = await api.getMusicPath(track);
      if (dataUrl) {
        audioRef.current.src = dataUrl;
        audioRef.current.volume = musicVolume;
        audioRef.current.play().catch(() => {});
        setMusicPlaying(true);
      }
    }
  }, [musicPlaying, musicTracks, musicIndex, musicVolume, getTrackIndex]);

  const skipTrack = useCallback((direction) => {
    if (musicTracks.length === 0) return;
    setMusicIndex(prev => {
      const next = direction === 'next'
        ? (prev + 1) % musicTracks.length
        : (prev - 1 + musicTracks.length) % musicTracks.length;
      return next;
    });
  }, [musicTracks]);

  const handleVolumeChange = useCallback((vol) => {
    setMusicVolume(vol);
    if (audioRef.current) audioRef.current.volume = vol;
  }, []);

  const toggleShuffle = useCallback(() => {
    setMusicShuffle(prev => !prev);
  }, []);

  const toggleLoop = useCallback(() => {
    setMusicLoop(prev => prev === 'none' ? 'all' : prev === 'all' ? 'one' : 'none');
  }, []);

  // Keep a ref to toggleMusic for auto-play so we don't capture a stale closure
  const toggleMusicRef = useRef(toggleMusic);
  useEffect(() => { toggleMusicRef.current = toggleMusic; }, [toggleMusic]);

  // Auto-play music on startup once tracks are loaded
  useEffect(() => {
    if (autoPlayedRef.current || musicTracks.length === 0 || musicPlaying) return;
    autoPlayedRef.current = true;
    toggleMusicRef.current();
  // eslint-disable-next-line
  }, [musicTracks]);

  // Auto-play next track when index changes
  useEffect(() => {
    if (!musicPlaying || !audioRef.current || musicTracks.length === 0) return;
    const trackIdx = getTrackIndex(musicIndex);
    const track = musicTracks[trackIdx];
    if (!track) return;
    api.getMusicPath(track).then(dataUrl => {
      if (dataUrl) {
        audioRef.current.src = dataUrl;
        audioRef.current.play().catch(() => {});
      }
    });
  }, [musicIndex, musicPlaying, musicTracks, getTrackIndex]);

  // Keys that are saved per-profile
  const PROFILE_KEYS = ['serverHost', 'serverPort', 'loginUser', 'loginPass'];

  const saveCurrentProfileSettings = useCallback(async (cfg) => {
    if (!api || !cfg?.activeProfile) return;
    const snapshot = {};
    for (const k of PROFILE_KEYS) {
      if (cfg[k] !== undefined) snapshot[k] = cfg[k];
    }
    // Save XIPivot config
    try {
      const pivot = await api.readXIPivotConfig(cfg.ashitaPath);
      snapshot.xipivot = {
        overlays: pivot.overlays || [],
        cacheEnabled: pivot.cacheEnabled || false,
        cacheSize: pivot.cacheSize || 1024,
        cacheMaxAge: pivot.cacheMaxAge || 600,
        rootPath: pivot.rootPath || ''
      };
    } catch (e) { console.error('Failed to read XIPivot config for profile save:', e); }
    await api.saveProfileSettings(cfg.activeProfile, snapshot);
  }, []);

  const loadProfileSettings = useCallback(async (profileName, currentCfg) => {
    if (!api || !profileName) return;
    const snapshot = await api.loadProfileSettings(profileName);
    if (!snapshot) return;

    // Restore server settings
    const updates = {};
    for (const k of PROFILE_KEYS) {
      if (snapshot[k] !== undefined) {
        updates[k] = snapshot[k];
        api.storeSet(k, snapshot[k]);
      }
    }


    // Restore XIPivot config
    if (snapshot.xipivot) {
      try {
        await api.writeXIPivotConfig(currentCfg.ashitaPath, {
          exists: true,
          ...snapshot.xipivot
        });
      } catch (e) { console.error('Failed to restore XIPivot config:', e); }
    }

    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const doUpdateConfig = useCallback((key, value) => {
    const prev = configRef.current;
    setConfig(prevState => {
      if (!prevState) return prevState;
      return { ...prevState, [key]: value };
    });
    if (prev) {
      if (key === 'activeProfile' && prev.activeProfile && prev.activeProfile !== value) {
        saveCurrentProfileSettings(prev).then(() =>
          loadProfileSettings(value, { ...prev, [key]: value })
        );
      } else if (PROFILE_KEYS.includes(key) && prev.activeProfile) {
        saveCurrentProfileSettings({ ...prev, [key]: value });
      }
    }
    if (api) api.storeSet(key, value);
  }, [saveCurrentProfileSettings, loadProfileSettings]);

  const updateConfig = useCallback((key, value) => {
    if (key === 'activeProfile' && settingsDirty) {
      setDirtyConfirm({
        message: 'You have unsaved settings changes. Switch profile without applying?',
        onConfirm: () => { setSettingsDirty(false); setDirtyConfirm(null); doUpdateConfig(key, value); }
      });
      return;
    }
    doUpdateConfig(key, value);
  }, [settingsDirty, doUpdateConfig]);

  const guardedSetActiveTab = useCallback((tab) => {
    if (settingsDirty && activeTab === 'settings' && tab !== 'settings') {
      setDirtyConfirm({
        message: 'You have unsaved settings changes. Leave without applying?',
        onConfirm: () => { setSettingsDirty(false); setDirtyConfirm(null); setActiveTab(tab); }
      });
      return;
    }
    setActiveTab(tab);
  }, [settingsDirty, activeTab]);

  const fadeOutMusic = useCallback(() => {
    if (!audioRef.current || audioRef.current.paused) return;
    const audio = audioRef.current;
    const startVol = audio.volume;
    const steps = 60;
    const interval = 120; // ~7s total fade
    let step = 0;
    const fade = setInterval(() => {
      step++;
      audio.volume = Math.max(0, startVol * (1 - step / steps));
      if (step >= steps) {
        clearInterval(fade);
        audio.pause();
        audio.volume = 0;
        setMusicPlaying(false);
      }
    }, interval);
  }, []);

  const doLaunch = useCallback(async (useXiloader) => {
    fadeOutMusic();
    setIsLaunching(true);
    setLaunchLog('');
    try {
      const result = await api.launchGame({
        ashitaPath: config.ashitaPath,
        profileName: config.activeProfile,
        useXiloader,
        xiloaderPath: config.xiloaderPath,
        serverName: config.serverHost,
        serverPort: config.serverPort,
        loginUser: config.loginUser,
        loginPass: config.loginPass,
        hairpin: config.hairpin
      });
      if (result.error) {
        setLaunchLog(`Error: ${result.error}`);
      } else {
        setLaunchLog(result.message);
        updateConfig('lastLaunched', new Date().toISOString());
        // Append to launch history
        const history = config.launchHistory || [];
        const entry = { profile: config.activeProfile, time: new Date().toISOString(), method: useXiloader ? 'xiloader' : 'ashita' };
        updateConfig('launchHistory', [entry, ...history].slice(0, 20));
      }
    } catch (e) {
      setLaunchLog(`Error: ${e.message}`);
    } finally {
      setTimeout(() => setIsLaunching(false), 2000);
    }
  }, [config, updateConfig, fadeOutMusic]);

  const handleLaunch = useCallback(async (useXiloader) => {
    if (!api || !config) return;
    // Pre-launch check: verify enabled addons/plugins exist on disk
    try {
      const profile = await api.readProfile(config.ashitaPath, config.activeProfile);
      if (profile?.exists) {
        let scriptName = 'default.txt';
        for (const line of profile.content.split('\n')) {
          const m = line.match(/^\s*script\s*=\s*(.+)/i);
          if (m && m[1].trim()) { scriptName = m[1].trim(); break; }
        }
        const scriptResult = await api.readFile(config.ashitaPath + '\\scripts\\' + scriptName);
        if (scriptResult?.content) {
          const missing = [];
          const checks = [];
          for (const line of scriptResult.content.split('\n')) {
            const pluginMatch = line.trim().match(/^\/load\s+(\S+)/i);
            if (pluginMatch) {
              const name = pluginMatch[1];
              checks.push(api.pathExists(config.ashitaPath + '\\plugins\\' + name + '.dll').then(exists => { if (!exists) missing.push({ name, type: 'plugin' }); }));
            }
            const addonMatch = line.trim().match(/^\/addon\s+load\s+(\S+)/i);
            if (addonMatch) {
              const name = addonMatch[1];
              const isBuiltIn = ADDON_CATALOGUE.some(a => (a.installAs || a.name).toLowerCase() === name.toLowerCase() && !a.repo);
              if (!isBuiltIn) {
                checks.push(api.pathExists(config.ashitaPath + '\\addons\\' + name).then(exists => { if (!exists) missing.push({ name, type: 'addon' }); }));
              }
            }
          }
          await Promise.all(checks);
          if (missing.length > 0) {
            setLaunchWarning({ missing, useXiloader });
            return;
          }
        }
      }
    } catch (e) {
      console.error('Pre-launch check failed:', e);
    }
    doLaunch(useXiloader);
  }, [config, doLaunch]);

  if (!api) {
    return (
      <div className="no-electron">
        <div className="no-electron-icon">✦</div>
        <h2>Not running in Electron</h2>
        <p>This application must be launched via the Electron wrapper.</p>
      </div>
    );
  }

  if (!config) {
    return <div className="loading">Loading...</div>;
  }

  const renderTab = () => {
    const tabProps = { config, updateConfig };
    switch (activeTab) {
      case 'home': return <HomeTab {...tabProps} onNavigate={guardedSetActiveTab} onLaunch={handleLaunch} isLaunching={isLaunching} launchLog={launchLog} updateInfo={updateInfo} onShowWizard={() => setShowWizard(true)} />;
      case 'profiles': return <ProfileTab {...tabProps} />;
      case 'addons': return <AddonsTab {...tabProps} />;
      case 'plugins': return <PluginsTab {...tabProps} />;
      // Script editor is now embedded in ProfileTab
      case 'settings': return <SettingsTab {...tabProps} config={config} onSettingsSaved={() => saveCurrentProfileSettings(config)} onDirtyChange={setSettingsDirty} />;
      case 'xipivot': return <XIPivotTab {...tabProps} onSettingsSaved={() => saveCurrentProfileSettings(config)} />;
      case 'dgvoodoo': return <DgVoodooTab {...tabProps} />;
      default: return null;
    }
  };

  return (
    <div className="app">
      <video
        className="app-bg-video"
        src="./bg-video.mp4"
        autoPlay
        loop
        muted
        playsInline
        ref={el => { if (el) el.play().catch(() => {}); }}
      />
      <TitleBar />
      {showWizard && (
        <SetupWizard
          config={config}
          updateConfig={updateConfig}
          onComplete={() => setShowWizard(false)}
        />
      )}
      {addonUpdates.length > 0 && !showWizard && (
        <UpdateModal
          updates={addonUpdates}
          ashitaPath={config.ashitaPath}
          onClose={() => setAddonUpdates([])}
        />
      )}
      {launchWarning && (
        <Modal onClose={() => setLaunchWarning(null)} ariaLabel="Missing addons and plugins">
          <div className="launch-warning-modal panel">
            <h3 className="cinzel modal-title">Missing Addons / Plugins</h3>
            <p className="modal-desc">
              The following are enabled in your script but not found on disk. They will cause errors at startup.
              Resolve each item or launch anyway.
            </p>
            <div className="launch-warning-list">
              {launchWarning.missing.map(m => {
                const catalogueEntry = ADDON_CATALOGUE.find(a =>
                  (a.installAs || a.name).toLowerCase() === m.name.toLowerCase() ||
                  a.name.toLowerCase() === m.name.toLowerCase()
                );
                const canInstall = catalogueEntry && catalogueEntry.repo;
                return (
                  <div key={m.name} className="launch-warning-item">
                    <div className="launch-warning-item-info">
                      <span className="mono text-bright">{m.name}</span>
                      <span className={`pill pill-xs ${m.type === 'plugin' ? 'pill-teal' : 'pill-gold'}`}>{m.type}</span>
                    </div>
                    <div className="launch-warning-item-actions">
                      {m.status === 'installing' && (
                        <span className="launch-status launch-status-teal">Installing...</span>
                      )}
                      {m.status === 'installed' && (
                        <span className="launch-status launch-status-green">Installed</span>
                      )}
                      {m.status === 'removed' && (
                        <span className="launch-status launch-status-dim">Removed from script</span>
                      )}
                      {m.status === 'error' && (
                        <span className="launch-status launch-status-red">Failed</span>
                      )}
                      {!m.status && (
                        <>
                          {!canInstall && catalogueEntry && !catalogueEntry.repo && (
                            <span className="launch-status launch-status-dim" title="Built-in Ashita addon — reinstall or update Ashita to restore it">Built-in (reinstall Ashita)</span>
                          )}
                          {canInstall && (
                            <button className="btn btn-ghost btn-xs" onClick={async () => {
                              setLaunchWarning(prev => ({
                                ...prev,
                                missing: prev.missing.map(x => x.name === m.name ? { ...x, status: 'installing' } : x)
                              }));
                              try {
                                const result = await api.installAddon(
                                  config.ashitaPath,
                                  catalogueEntry.installAs || catalogueEntry.name,
                                  catalogueEntry.repo,
                                  catalogueEntry.subdir,
                                  catalogueEntry.useRelease,
                                  catalogueEntry.releaseFolder,
                                  catalogueEntry.isPlugin
                                );
                                setLaunchWarning(prev => ({
                                  ...prev,
                                  missing: prev.missing.map(x => x.name === m.name ? { ...x, status: result.success ? 'installed' : 'error' } : x)
                                }));
                              } catch {
                                setLaunchWarning(prev => ({
                                  ...prev,
                                  missing: prev.missing.map(x => x.name === m.name ? { ...x, status: 'error' } : x)
                                }));
                              }
                            }}>
                              Install
                            </button>
                          )}
                          <button className="btn btn-ghost btn-xs" onClick={async () => {
                            try {
                              const profile = await api.readProfile(config.ashitaPath, config.activeProfile);
                              if (!profile?.exists) return;
                              let scriptName = 'default.txt';
                              for (const line of profile.content.split('\n')) {
                                const match = line.match(/^\s*script\s*=\s*(.+)/i);
                                if (match && match[1].trim()) { scriptName = match[1].trim(); break; }
                              }
                              const scriptPath = config.ashitaPath + '\\scripts\\' + scriptName;
                              const scriptResult = await api.readFile(scriptPath);
                              if (scriptResult?.content) {
                                const lines = scriptResult.content.split('\n');
                                const filtered = lines.filter(l => {
                                  const trimmed = l.trim().toLowerCase();
                                  if (m.type === 'addon') return trimmed !== '/addon load ' + m.name.toLowerCase();
                                  return trimmed !== '/load ' + m.name.toLowerCase();
                                });
                                await api.writeFile(scriptPath, filtered.join('\n'));
                              }
                              setLaunchWarning(prev => ({
                                ...prev,
                                missing: prev.missing.map(x => x.name === m.name ? { ...x, status: 'removed' } : x)
                              }));
                            } catch {
                              setLaunchWarning(prev => ({
                                ...prev,
                                missing: prev.missing.map(x => x.name === m.name ? { ...x, status: 'error' } : x)
                              }));
                            }
                          }}>
                            Remove from Script
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setLaunchWarning(null)}>Cancel</button>
              {launchWarning.missing.every(m => m.status === 'installed' || m.status === 'removed') ? (
                <button className="btn btn-primary" onClick={() => { const xi = launchWarning.useXiloader; setLaunchWarning(null); doLaunch(xi); }}>
                  Launch
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => { const xi = launchWarning.useXiloader; setLaunchWarning(null); doLaunch(xi); }}>
                  Launch Anyway
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
      {dirtyConfirm && (
        <Modal onClose={() => setDirtyConfirm(null)} ariaLabel="Unsaved changes">
          <div className="launch-warning-modal panel">
            <h3 className="cinzel modal-title">Unsaved Changes</h3>
            <p className="modal-desc">
              {dirtyConfirm.message}
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDirtyConfirm(null)}>Stay</button>
              <button className="btn btn-primary" onClick={dirtyConfirm.onConfirm}>Leave</button>
            </div>
          </div>
        </Modal>
      )}
      <div className="app-body">
        <Sidebar
          activeTab={activeTab}
          onTabChange={guardedSetActiveTab}
          onToggleMusic={toggleMusic}
          musicPlaying={musicPlaying}
          musicVolume={musicVolume}
          onVolumeChange={handleVolumeChange}
          currentTrackName={currentTrackName}
          onSkipTrack={skipTrack}
          musicShuffle={musicShuffle}
          onToggleShuffle={toggleShuffle}
          musicLoop={musicLoop}
          onToggleLoop={toggleLoop}
        />
        <main className="app-content" key={activeTab}>
          <ErrorBoundary>
            {renderTab()}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default App;
