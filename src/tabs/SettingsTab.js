import React, { useState, useEffect, useCallback } from 'react';
import './SettingsTab.css';

const api = window.xiAPI;

const INI_BLOCKED_KEYS = new Set();

const REG_KEY_LABELS = {
  '0001': 'Screen Width',
  '0002': 'Screen Height',
  '0003': 'Background Width',
  '0004': 'Background Height',
  '0007': 'Display Mode',
  '0026': 'Sound Enabled',
  '0028': 'Texture Compression',
  '0029': 'Mip Maps',
  '0030': 'Bump Mapping',
  '0034': 'Environment Animation',
  '0039': 'Max Sounds',
  '0040': 'Gamma'
};

const REG_VALUE_LABELS = {
  '0007': { 0: 'Fullscreen', 1: 'Windowed' },
  '0026': { 0: 'Off', 1: 'On' },
  '0034': { 0: 'Off', 1: 'Low', 2: 'High' }
};

function formatRegValue(key, value) {
  const labels = REG_VALUE_LABELS[key];
  if (labels && labels[value] !== undefined) return labels[value];
  return String(value);
}

const SCREEN_PRESETS = [
  { w: 640, h: 480, label: '640x480', ratio: '4:3', group: '4:3' },
  { w: 800, h: 600, label: '800x600', ratio: '4:3', group: '4:3' },
  { w: 1024, h: 768, label: '1024x768', ratio: '4:3', group: '4:3' },
  { w: 1280, h: 1024, label: '1280x1024', ratio: '4:3', group: '4:3' },
  { w: 1600, h: 1200, label: '1600x1200', ratio: '4:3', group: '4:3' },
  { w: 720, h: 480, label: '720x480', ratio: '16:9', group: '16:9' },
  { w: 1280, h: 720, label: '1280x720', ratio: 'HD', group: '16:9' },
  { w: 1920, h: 1080, label: '1920x1080', ratio: 'FHD', group: '16:9' },
  { w: 2560, h: 1440, label: '2560x1440', ratio: 'QHD', group: '16:9' },
  { w: 3840, h: 2160, label: '3840x2160', ratio: '4K', group: '16:9' },
  { w: 800, h: 480, label: '800x480', ratio: '16:10', group: '16:10' },
  { w: 1280, h: 768, label: '1280x768', ratio: '16:10', group: '16:10' },
  { w: 1440, h: 900, label: '1440x900', ratio: '16:10', group: '16:10' },
  { w: 1680, h: 1050, label: '1680x1050', ratio: '16:10', group: '16:10' },
  { w: 1920, h: 1200, label: '1920x1200', ratio: '16:10', group: '16:10' },
  { w: 2560, h: 1080, label: '2560x1080', ratio: 'UWFHD', group: 'Ultrawide' },
  { w: 3440, h: 1440, label: '3440x1440', ratio: 'UWQHD', group: 'Ultrawide' },
  { w: 3840, h: 1600, label: '3840x1600', ratio: 'UW4K', group: 'Ultrawide' },
  { w: 3840, h: 1080, label: '3840x1080', ratio: 'SUWFHD', group: 'Super Ultrawide' },
  { w: 5120, h: 1440, label: '5120x1440', ratio: 'SUWQHD', group: 'Super Ultrawide' },
  { w: 5120, h: 2160, label: '5120x2160', ratio: 'SUW4K', group: 'Super Ultrawide' }
];

const BG_PRESETS = [
  { w: 512, h: 512, label: '512x512', group: 'Standard' },
  { w: 640, h: 480, label: '640x480', group: 'Standard' },
  { w: 800, h: 600, label: '800x600', group: 'Standard' },
  { w: 1024, h: 768, label: '1024x768', group: 'Standard' },
  { w: 1280, h: 720, label: '1280x720', group: 'Standard' },
  { w: 1280, h: 1024, label: '1280x1024', group: 'Standard' },
  { w: 1920, h: 1080, label: '1920x1080', group: 'Standard' },
  { w: 2560, h: 1440, label: '2560x1440 (2x AA)', group: 'Standard' },
  { w: 3840, h: 2160, label: '3840x2160 (4x AA)', group: 'Standard' },
  { w: 2560, h: 1080, label: '2560x1080', group: 'Ultrawide' },
  { w: 3440, h: 1440, label: '3440x1440', group: 'Ultrawide' },
  { w: 3840, h: 1600, label: '3840x1600', group: 'Ultrawide' },
  { w: 5120, h: 2160, label: '5120x2160 (2x AA)', group: 'Ultrawide' },
  { w: 6880, h: 2880, label: '6880x2880 (4x AA)', group: 'Ultrawide' },
  { w: 3840, h: 1080, label: '3840x1080', group: 'Super Ultrawide' },
  { w: 5120, h: 1440, label: '5120x1440', group: 'Super Ultrawide' },
  { w: 7680, h: 2160, label: '7680x2160 (2x AA)', group: 'Super Ultrawide' },
  { w: 10240, h: 2880, label: '10240x2880 (4x AA)', group: 'Super Ultrawide' }
];

const RECOMMENDED_PRESETS = [
  {
    name: 'Low',
    desc: 'Minimal settings for older hardware — 720p, compressed textures, effects off',
    tier: 'low',
    values: { '0001': 1280, '0002': 720, '0003': 1280, '0004': 720, '0007': 1, '0028': 0, '0029': 0, '0030': 0, '0034': 0, '0026': 1, '0039': 12, '0040': 0 }
  },
  {
    name: 'Medium',
    desc: '1080p with matched background, bump mapping on, normal animations',
    tier: 'mid',
    values: { '0001': 1920, '0002': 1080, '0003': 1920, '0004': 1080, '0007': 1, '0028': 0, '0029': 1, '0030': 1, '0034': 1, '0026': 1, '0039': 20, '0040': 0 }
  },
  {
    name: 'High',
    desc: '1080p with 4K oversample, high quality textures, all effects on',
    tier: 'high',
    recommended: true,
    values: { '0001': 1920, '0002': 1080, '0003': 3840, '0004': 2160, '0007': 1, '0028': 1, '0029': 1, '0030': 1, '0034': 2, '0026': 1, '0039': 32, '0040': 0 }
  },
  {
    name: 'Max',
    desc: '1080p with 4K oversample, uncompressed textures, smooth animations, max sounds',
    tier: 'max',
    values: { '0001': 1920, '0002': 1080, '0003': 3840, '0004': 2160, '0007': 1, '0028': 1, '0029': 1, '0030': 1, '0034': 2, '0026': 1, '0039': 64, '0040': 0 }
  },
  {
    name: '2K Medium',
    desc: '1440p with matched background, balanced quality',
    tier: 'mid',
    values: { '0001': 2560, '0002': 1440, '0003': 2560, '0004': 1440, '0007': 1, '0028': 0, '0029': 1, '0030': 1, '0034': 1, '0026': 1, '0039': 20, '0040': 0 }
  },
  {
    name: '2K High',
    desc: '1440p with 4K oversample, all effects on',
    tier: 'high',
    recommended: true,
    values: { '0001': 2560, '0002': 1440, '0003': 3840, '0004': 2160, '0007': 1, '0028': 1, '0029': 1, '0030': 1, '0034': 2, '0026': 1, '0039': 32, '0040': 0 }
  },
  {
    name: '4K Max',
    desc: 'Native 4K, everything maxed — for powerful GPUs',
    tier: 'max',
    values: { '0001': 3840, '0002': 2160, '0003': 3840, '0004': 2160, '0007': 1, '0028': 1, '0029': 1, '0030': 1, '0034': 2, '0026': 1, '0039': 64, '0040': 0 }
  },
  {
    name: 'Ultrawide High',
    desc: '3440x1440 ultrawide with 2x oversample, all effects',
    tier: 'high',
    recommended: true,
    values: { '0001': 3440, '0002': 1440, '0003': 6880, '0004': 2880, '0007': 1, '0028': 1, '0029': 1, '0030': 1, '0034': 2, '0026': 1, '0039': 32, '0040': 0 }
  },
  {
    name: 'Super Ultrawide High',
    desc: '5120x1440 super ultrawide with 2x oversample, all effects',
    tier: 'high',
    recommended: true,
    values: { '0001': 5120, '0002': 1440, '0003': 10240, '0004': 2880, '0007': 1, '0028': 1, '0029': 1, '0030': 1, '0034': 2, '0026': 1, '0039': 32, '0040': 0 }
  }
];

function SettingsTab({ config, onSettingsSaved }) {
  const [regValues, setRegValues] = useState({});
  const [iniValues, setIniValues] = useState({});
  const [pendingWrites, setPendingWrites] = useState({});
  const [loading, setLoading] = useState(true);
  const [applyStatus, setApplyStatus] = useState('');
  const [applyMessage, setApplyMessage] = useState('');
  const [gpuInfo, setGpuInfo] = useState(null);
  const [gpuDetecting, setGpuDetecting] = useState(false);
  const [noProfile, setNoProfile] = useState(false);

  // Load registry values (read-only baseline) and INI overrides
  const loadValues = useCallback(async () => {
    if (!api) return;
    setLoading(true);

    // Read registry baseline
    const regResult = await api.readRegistry();
    setRegValues(regResult.values || {});

    // Read INI overrides from active profile
    if (config?.activeProfile && config?.ashitaPath) {
      const profile = await api.readProfile(config.ashitaPath, config.activeProfile);
      if (profile.exists) {
        setNoProfile(false);
        const lines = profile.content.split('\n');
        const regIdx = lines.findIndex(l => l.trim() === '[ffxi.registry]');
        if (regIdx !== -1) {
          const iniVals = {};
          for (let i = regIdx + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('[')) break;
            const match = line.match(/^(\S+)\s*=\s*(.+)/);
            if (match) {
              const val = parseInt(match[2].trim(), 10);
              if (!isNaN(val)) iniVals[match[1].trim()] = val;
            }
          }
          setIniValues(iniVals);
        }
      } else {
        setNoProfile(true);
      }
    } else {
      setNoProfile(true);
    }

    setPendingWrites({});
    setLoading(false);
  }, [config?.activeProfile, config?.ashitaPath]);

  useEffect(() => { loadValues(); }, [loadValues]);

  const detectGPU = async () => {
    if (!api?.detectGPU) return;
    setGpuDetecting(true);
    const result = await api.detectGPU();
    setGpuDetecting(false);
    if (result.success) setGpuInfo(result);
  };

  useEffect(() => {
    if (api?.detectGPU) detectGPU();
  // eslint-disable-next-line
  }, []);

  // Get the effective value: pending > INI override > registry baseline
  const getValue = (key) => {
    if (key in pendingWrites) return pendingWrites[key];
    if (key in iniValues && iniValues[key] !== -1) return iniValues[key];
    return regValues[key] ?? 0;
  };

  const setPending = (key, value) => {
    if (INI_BLOCKED_KEYS.has(key)) return;
    setPendingWrites(prev => ({ ...prev, [key]: value }));
  };

  const [showConfirm, setShowConfirm] = useState(false);

  const requestApply = () => {
    setShowConfirm(true);
  };

  // Write changes to the Ashita profile INI (not the Windows registry)
  const applyChanges = async () => {
    setShowConfirm(false);
    if (!config?.activeProfile || !config?.ashitaPath || !api) {
      setApplyStatus('error');
      setApplyMessage('No active profile selected. Create a profile first.');
      setTimeout(() => { setApplyStatus(''); setApplyMessage(''); }, 4000);
      return;
    }

    setApplyStatus('saving');
    setApplyMessage('Writing to profile...');

    try {
      const profile = await api.readProfile(config.ashitaPath, config.activeProfile);
      if (!profile.exists) {
        setApplyStatus('error');
        setApplyMessage('Profile not found.');
        setTimeout(() => { setApplyStatus(''); setApplyMessage(''); }, 4000);
        return;
      }

      const lines = profile.content.split('\n');
      const regIdx = lines.findIndex(l => l.trim() === '[ffxi.registry]');

      if (regIdx === -1) {
        setApplyStatus('error');
        setApplyMessage('Profile has no [ffxi.registry] section.');
        setTimeout(() => { setApplyStatus(''); setApplyMessage(''); }, 4000);
        return;
      }

      // Find end of [ffxi.registry] section
      let nextIdx = lines.length;
      for (let i = regIdx + 1; i < lines.length; i++) {
        if (lines[i].trim().startsWith('[')) { nextIdx = i; break; }
      }

      // Parse existing INI entries
      const regEntries = {};
      for (let i = regIdx + 1; i < nextIdx; i++) {
        const match = lines[i].match(/^(\S+)\s*=\s*(.+)/);
        if (match) regEntries[match[1].trim()] = match[2].trim();
      }

      // Apply pending changes (skip blocked keys)
      let count = 0;
      for (const [key, value] of Object.entries(pendingWrites)) {
        if (INI_BLOCKED_KEYS.has(key)) continue;
        regEntries[key] = String(value);
        count++;
      }

      // Rebuild the section
      const before = lines.slice(0, regIdx + 1);
      const after = lines.slice(nextIdx);
      const regLines = Object.entries(regEntries).map(([k, v]) => `${k} = ${v}`);
      const newContent = [...before, ...regLines, '', ...after].join('\n');
      await api.saveProfile(config.ashitaPath, config.activeProfile, newContent);

      setApplyStatus('success');
      setApplyMessage(`${count} setting${count !== 1 ? 's' : ''} saved to profile "${config.activeProfile}". Takes effect next launch.`);
      await loadValues();
      if (onSettingsSaved) onSettingsSaved();
    } catch (e) {
      setApplyStatus('error');
      setApplyMessage(e.message || 'Failed to write profile.');
    }

    setTimeout(() => { setApplyStatus(''); setApplyMessage(''); }, 4000);
  };

  const applyPreset = (preset) => {
    const newPending = { ...pendingWrites };
    for (const [k, v] of Object.entries(preset.values)) {
      newPending[k] = v;
    }
    setPendingWrites(newPending);
  };

  const setScreenRes = (w, h) => {
    setPending('0001', w);
    setPending('0002', h);
    // Auto-adjust background resolution to maintain matching aspect ratio
    const currentBgW = getValue('0003');
    const currentBgH = getValue('0004');
    const currentBgRatio = currentBgH > 0 ? (currentBgW / currentBgH).toFixed(2) : 0;
    const newScreenRatio = h > 0 ? (w / h).toFixed(2) : 0;
    if (Math.abs(currentBgRatio - newScreenRatio) > 0.05) {
      setPending('0003', w * 2);
      setPending('0004', h * 2);
    }
  };

  const setBgRes = (w, h) => {
    setPending('0003', w);
    setPending('0004', h);
  };

  const pendingCount = Object.keys(pendingWrites).length;
  const screenW = getValue('0001');
  const screenH = getValue('0002');
  const bgW = getValue('0003');
  const bgH = getValue('0004');

  // Detect aspect ratio mismatch between screen and background resolution
  const screenRatio = screenH > 0 ? (screenW / screenH).toFixed(2) : 0;
  const bgRatio = bgH > 0 ? (bgW / bgH).toFixed(2) : 0;
  const aspectMismatch = screenH > 0 && bgH > 0 && Math.abs(screenRatio - bgRatio) > 0.05;

  if (loading) return <div className="settings-loading">Loading settings...</div>;

  return (
    <div className="settings-tab">
      <div className="settings-header-bar panel">
        <div className="settings-header-left">
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            Profile: {config?.activeProfile || 'None'}
          </span>
          <span className={`pill ${!noProfile ? 'pill-green' : 'pill-red'}`}>
            {noProfile ? 'No Profile' : 'Ready'}
          </span>
        </div>
        <div className="settings-header-right">
          <button className="btn btn-ghost btn-sm" onClick={loadValues}>&#8635; Refresh</button>
          {pendingCount > 0 && (
            <button className="btn btn-primary" onClick={requestApply}>
              Apply {pendingCount} Change{pendingCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      <div className="settings-warning panel">
        Settings are saved to your Ashita profile and take effect next time you launch the game. Set a value to -1 to use the default from FFXI Config / Windows registry.
      </div>

      {noProfile && (
        <div className="panel" style={{ padding: '12px 18px', marginBottom: 16, background: 'rgba(231, 76, 60, 0.1)', border: '1px solid rgba(231, 76, 60, 0.3)', borderRadius: 8 }}>
          <span style={{ color: '#e74c3c', fontWeight: 700, fontSize: 14 }}>No active profile</span>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Create a profile in the Profiles tab first. Settings are saved per-profile.
          </p>
        </div>
      )}

      {aspectMismatch && (
        <div className="panel" style={{ padding: '12px 18px', marginBottom: 16, background: 'rgba(231, 76, 60, 0.1)', border: '1px solid rgba(231, 76, 60, 0.3)', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ color: '#e74c3c', fontWeight: 700, fontSize: 14 }}>Aspect Ratio Mismatch</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
            Your screen resolution ({screenW}x{screenH}) and background resolution ({bgW}x{bgH}) have different aspect ratios.
            This can cause rendering issues. The background resolution should match the screen's aspect ratio.
          </p>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setPending('0003', screenW * 2);
              setPending('0004', screenH * 2);
            }}
          >
            Fix: Set background to {screenW * 2}x{screenH * 2} (2x oversample)
          </button>
        </div>
      )}

      {gpuInfo && (
        <div className="panel" style={{ marginBottom: 16, padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="section-header" style={{ margin: 0 }}>Detected GPU</span>
            <button className="btn btn-ghost btn-sm" onClick={detectGPU} disabled={gpuDetecting}>&#8635; Re-scan</button>
          </div>
          {gpuInfo.gpus?.map((gpu, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <span className="mono" style={{ color: 'var(--teal)', fontSize: 13 }}>{gpu.name}</span>
              <span className="pill pill-teal" style={{ fontSize: 10 }}>{gpu.vram} MB VRAM</span>
            </div>
          ))}
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
            {gpuInfo.recommendation}
          </p>
        </div>
      )}

      <div className="section-header">Presets</div>
      <p className="settings-hint" style={{ marginBottom: 12 }}>Quick-apply a full configuration including resolution, graphics quality and sound settings.</p>
      <div className="presets-grid">
        {RECOMMENDED_PRESETS.map(preset => {
          const isActive = Object.entries(preset.values).every(([k, v]) => getValue(k) === v);
          return (
            <div key={preset.name} className={`preset-card panel ${isActive ? 'preset-active' : ''}`} onClick={() => applyPreset(preset)}>
              <div className="preset-card-header">
                <h3 className={`preset-name cinzel ${isActive ? 'gold' : ''}`}>{preset.name}</h3>
                {isActive && <span className="pill pill-gold" style={{ fontSize: 10 }}>Active</span>}
              </div>
              <p className="preset-desc">{preset.desc}</p>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>
                {isActive ? 'Selected' : 'Apply Preset'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="section-header">Screen (Overlay) Resolution</div>
      <div className="panel">
        <p className="settings-hint">The resolution of the 2D overlay (UI, menus, text). This is what your monitor displays. The aspect addon reads this from the profile to calculate correct widescreen ratios.</p>
        {['4:3', '16:9', '16:10', 'Ultrawide', 'Super Ultrawide'].map(group => {
          const presets = SCREEN_PRESETS.filter(p => p.group === group);
          return (
            <div key={group} className="res-group">
              <span className="res-group-label">{group}</span>
              <div className="res-presets">
                {presets.map(p => (
                  <button
                    key={p.label}
                    className={`res-preset-btn ${screenW === p.w && screenH === p.h ? 'active' : ''}`}
                    onClick={() => setScreenRes(p.w, p.h)}
                  >
                    <span className="res-preset-label">{p.label}</span>
                    <span className="res-preset-ratio">{p.ratio}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div className="res-custom">
          <label>Custom:</label>
          <input type="number" value={screenW} onChange={e => setPending('0001', parseInt(e.target.value) || 0)} style={{ width: 80 }} />
          <span>x</span>
          <input type="number" value={screenH} onChange={e => setPending('0002', parseInt(e.target.value) || 0)} style={{ width: 80 }} />
        </div>
      </div>

      <div className="section-header">Display Mode</div>
      <div className="panel">
        <p className="settings-hint">Controls how FFXI is displayed on your screen.</p>
        <div className="dgv-option-row">
          <button
            className={`cache-option-btn ${getValue('0007') === 0 ? 'active' : ''}`}
            onClick={() => setPending('0007', 0)}
          >
            <span className="cache-option-value">Fullscreen</span>
            <span className="cache-option-tag">Exclusive fullscreen — best performance but alt-tab can cause crashes without dgVoodoo2</span>
          </button>
          <button
            className={`cache-option-btn ${getValue('0007') === 1 ? 'active' : ''}`}
            onClick={() => setPending('0007', 1)}
          >
            <span className="cache-option-value">Windowed</span>
            <span className="cache-option-tag">Runs in a window — most compatible, easy to alt-tab. Enable the borderless addon in the Addons tab for borderless fullscreen</span>
          </button>
        </div>
      </div>

      <div className="section-header">Background (3D Render) Resolution</div>
      <div className="panel">
        <p className="settings-hint">
          The resolution 3D geometry is rendered at before scaling. Setting higher than screen res creates oversampling AA — the biggest visual improvement. Recommended: 2x screen res.
        </p>
        {['Standard', 'Ultrawide', 'Super Ultrawide'].map(group => {
          const presets = BG_PRESETS.filter(p => p.group === group);
          return (
            <div key={group} className="res-group">
              <span className="res-group-label">{group}</span>
              <div className="res-presets">
                {presets.map(p => (
                  <button
                    key={p.label}
                    className={`res-preset-btn ${bgW === p.w && bgH === p.h ? 'active' : ''}`}
                    onClick={() => setBgRes(p.w, p.h)}
                  >
                    <span className="res-preset-label">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div className="res-custom">
          <label>Custom:</label>
          <input type="number" value={bgW} onChange={e => setPending('0003', parseInt(e.target.value) || 0)} style={{ width: 80 }} />
          <span>x</span>
          <input type="number" value={bgH} onChange={e => setPending('0004', parseInt(e.target.value) || 0)} style={{ width: 80 }} />
        </div>
      </div>

      <div className="section-header">Graphics Quality</div>
      <div className="panel">
        <p className="settings-hint">Controls how FFXI renders textures and effects. Set to -1 to use the value from FFXI Config.</p>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Texture Compression</span>
            <span className="setting-hint-inline">Low = compressed/faster, High = uncompressed/sharper</span>
          </div>
          <select value={getValue('0028')} onChange={e => setPending('0028', parseInt(e.target.value))}>
            <option value={-1}>Default (FFXI Config)</option>
            <option value={0}>Low (Compressed)</option>
            <option value={1}>High (Uncompressed)</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Mip Mapping</span>
            <span className="setting-hint-inline">Reduces texture shimmer and flickering on distant surfaces</span>
          </div>
          <select value={getValue('0029')} onChange={e => setPending('0029', parseInt(e.target.value))}>
            <option value={-1}>Default (FFXI Config)</option>
            <option value={0}>Off</option>
            <option value={1}>On</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Bump Mapping</span>
            <span className="setting-hint-inline">Adds surface depth to walls, terrain and other textures</span>
          </div>
          <select value={getValue('0030')} onChange={e => setPending('0030', parseInt(e.target.value))}>
            <option value={-1}>Default (FFXI Config)</option>
            <option value={0}>Off</option>
            <option value={1}>On</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Environment Animation</span>
            <span className="setting-hint-inline">Animated effects like swaying trees, flowing water and weather particles</span>
          </div>
          <select value={getValue('0034')} onChange={e => setPending('0034', parseInt(e.target.value))}>
            <option value={-1}>Default (FFXI Config)</option>
            <option value={0}>Off</option>
            <option value={1}>Normal</option>
            <option value={2}>Smooth</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Gamma</span>
            <span className="setting-hint-inline">Adjusts overall screen brightness — increase if the game looks too dark</span>
          </div>
          <div className="setting-range-group">
            <input type="range" min={0} max={100} value={getValue('0040') === -1 ? 0 : getValue('0040')} onChange={e => setPending('0040', parseInt(e.target.value))} />
            <span className="mono" style={{ fontSize: 12, minWidth: 30, textAlign: 'right' }}>{getValue('0040') === -1 ? 'Default' : getValue('0040')}</span>
          </div>
        </div>
      </div>

      <div className="section-header">Audio</div>
      <div className="panel">
        <p className="settings-hint">Controls FFXI's sound system. Disabling sound can improve performance on low-end hardware.</p>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Sound</span>
            <span className="setting-hint-inline">Master toggle for all in-game audio including music, SFX and ambient sounds</span>
          </div>
          <select value={getValue('0026')} onChange={e => setPending('0026', parseInt(e.target.value))}>
            <option value={-1}>Default (FFXI Config)</option>
            <option value={0}>Off</option>
            <option value={1}>On</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Max Simultaneous Sounds</span>
            <span className="setting-hint-inline">How many sound effects can play at the same time (12-64 recommended)</span>
          </div>
          <div className="setting-range-group">
            <input type="range" min={1} max={64} step={1} value={getValue('0039') === -1 ? 20 : getValue('0039')} onChange={e => setPending('0039', parseInt(e.target.value))} />
            <span className="mono" style={{ fontSize: 12, minWidth: 30, textAlign: 'right' }}>{getValue('0039') === -1 ? 'Default' : getValue('0039')}</span>
          </div>
        </div>
      </div>

      {(pendingCount > 0 || applyStatus) && (
        <div className="settings-sticky-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {pendingCount > 0 && <span>{pendingCount} pending change{pendingCount !== 1 ? 's' : ''}</span>}
            {applyMessage && (
              <span className={`pill ${applyStatus === 'success' ? 'pill-green' : applyStatus === 'error' ? 'pill-red' : 'pill-gold'}`}>
                {applyMessage}
              </span>
            )}
          </div>
          {pendingCount > 0 && (
            <button className="btn btn-primary" onClick={requestApply} disabled={applyStatus === 'saving'}>
              {applyStatus === 'saving' ? 'Saving...' : `Apply ${pendingCount} Change${pendingCount !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}

      {showConfirm && (
        <div className="settings-confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="settings-confirm-dialog" onClick={e => e.stopPropagation()}>
            <h3 className="cinzel">Apply Settings to Profile?</h3>
            <p>This will write <strong>{pendingCount} setting{pendingCount !== 1 ? 's' : ''}</strong> to your Ashita profile <strong>"{config?.activeProfile}"</strong>. Changes take effect next launch.</p>
            <div className="settings-confirm-preview">
              {Object.entries(pendingWrites).filter(([k]) => !INI_BLOCKED_KEYS.has(k)).map(([key, value]) => (
                <div key={key} className="settings-confirm-row">
                  <span className="confirm-label">{REG_KEY_LABELS[key] || key}</span>
                  <span className="confirm-arrow">&rarr;</span>
                  <span className="confirm-value mono">{formatRegValue(key, value)}</span>
                </div>
              ))}
            </div>
            <div className="settings-confirm-actions">
              <button className="btn btn-ghost" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={applyChanges}>Yes, Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsTab;
