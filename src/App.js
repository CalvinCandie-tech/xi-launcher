import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import HomeTab from './tabs/HomeTab';
import ProfileTab from './tabs/ProfileTab';
import AddonsTab from './tabs/AddonsTab';
import SettingsTab from './tabs/SettingsTab';
import XIPivotTab from './tabs/XIPivotTab';
import SetupWizard from './components/SetupWizard';
import UpdateModal from './components/UpdateModal';
import ErrorBoundary from './components/ErrorBoundary';
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
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicTracks, setMusicTracks] = useState([]);
  const [musicIndex, setMusicIndex] = useState(0);
  const [musicVolume, setMusicVolume] = useState(0.1);
  const [musicShuffle, setMusicShuffle] = useState(false);
  const [musicLoop, setMusicLoop] = useState('none'); // 'none' | 'all' | 'one'
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
    if (shuffleOrderRef.current.length === 0) return 0;
    return shuffleOrderRef.current[idx % shuffleOrderRef.current.length];
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

  // Auto-play music on startup once tracks are loaded
  useEffect(() => {
    if (autoPlayedRef.current || musicTracks.length === 0 || musicPlaying) return;
    autoPlayedRef.current = true;
    toggleMusic();
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

  const updateConfig = useCallback((key, value) => {
    setConfig(prev => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      // When activating a profile, save current then load new
      if (key === 'activeProfile' && prev.activeProfile && prev.activeProfile !== value) {
        saveCurrentProfileSettings(prev);
        loadProfileSettings(value, next);
      }
      // Auto-save per-profile keys when they change
      if (PROFILE_KEYS.includes(key) && next.activeProfile) {
        saveCurrentProfileSettings(next);
      }
      return next;
    });
    if (api) api.storeSet(key, value);
  }, [saveCurrentProfileSettings, loadProfileSettings]);

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
        audio.volume = startVol;
        setMusicPlaying(false);
      }
    }, interval);
  }, []);

  const fadeInMusic = useCallback(async () => {
    if (!audioRef.current || musicTracks.length === 0) return;
    const audio = audioRef.current;
    const targetVol = musicVolume;
    audio.volume = 0;
    // Resume from where we left off, or start current track
    if (audio.src) {
      audio.play().catch(() => {});
    } else {
      const trackIdx = getTrackIndex(musicIndex);
      const track = musicTracks[trackIdx];
      if (!track) return;
      const dataUrl = await api.getMusicPath(track);
      if (dataUrl) {
        audio.src = dataUrl;
        audio.play().catch(() => {});
      }
    }
    setMusicPlaying(true);
    const steps = 60;
    const interval = 120; // ~7s fade in
    let step = 0;
    const fade = setInterval(() => {
      step++;
      audio.volume = Math.min(targetVol, targetVol * (step / steps));
      if (step >= steps) {
        clearInterval(fade);
        audio.volume = targetVol;
      }
    }, interval);
  }, [musicVolume, musicTracks, musicIndex, getTrackIndex]);

  // Fade music back in when game exits
  useEffect(() => {
    if (!api?.onGameExited) return;
    return api.onGameExited(() => {
      fadeInMusic();
    });
  }, [fadeInMusic]);

  const handleLaunch = useCallback(async (useXiloader) => {
    if (!api || !config) return;
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
      }
    } catch (e) {
      setLaunchLog(`Error: ${e.message}`);
    } finally {
      setTimeout(() => setIsLaunching(false), 2000);
    }
  }, [config, updateConfig, fadeOutMusic]);

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
      case 'home': return <HomeTab {...tabProps} onNavigate={setActiveTab} onLaunch={handleLaunch} isLaunching={isLaunching} launchLog={launchLog} updateInfo={updateInfo} onShowWizard={() => setShowWizard(true)} />;
      case 'profiles': return <ProfileTab {...tabProps} />;
      case 'addons': return <AddonsTab {...tabProps} />;
      case 'settings': return <SettingsTab {...tabProps} config={config} onSettingsSaved={() => saveCurrentProfileSettings(config)} />;
      case 'xipivot': return <XIPivotTab {...tabProps} onSettingsSaved={() => saveCurrentProfileSettings(config)} />;
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
      <div className="app-body">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
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
        <main className="app-content">
          <ErrorBoundary>
            {renderTab()}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default App;
