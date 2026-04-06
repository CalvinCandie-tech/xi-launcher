import React, { useState, useEffect, useCallback, useRef } from 'react';
import './DgVoodooTab.css';

const api = window.xiAPI;

const STEPS = ['overview', 'download', 'defender', 'copy', 'configure', 'verify'];
const STEP_LABELS = ['Overview', 'Download', 'Defender', 'Install', 'Configure', 'Verify'];

const RECOMMENDED_SETTINGS = {
  outputAPI: 'd3d11',
  scalingMode: 'stretched_ar',
  watermark: false,
  msaa: '4x',
  anisotropic: '16x',
  vsync: true,
  resolution: 'app_controlled',
  depthBuffer: 'forcemin24bit',
  fastVram: true,
  keepFilter: true,
  vram: '2048',
  fpsLimit: '0',
  fullscreenAttr: 'default',
  resampling: 'bilinear',
  mipmapping: 'appdriven',
  captureMouse: false
};

const MSAA_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: '2x', label: '2x MSAA' },
  { value: '4x', label: '4x MSAA (Recommended)' },
  { value: '8x', label: '8x MSAA (Heavy)' }
];

const VRAM_OPTIONS = [
  { value: '512', label: '512 MB' },
  { value: '1024', label: '1024 MB' },
  { value: '2048', label: '2048 MB (Recommended)' },
  { value: '4096', label: '4096 MB (HD Textures)' }
];

const FPS_OPTIONS = [
  { value: '0', label: 'Unlimited' },
  { value: '30', label: '30 FPS' },
  { value: '60', label: '60 FPS' },
  { value: '120', label: '120 FPS' }
];

const AF_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: '2x', label: '2x' },
  { value: '4x', label: '4x' },
  { value: '8x', label: '8x' },
  { value: '16x', label: '16x (Recommended)' }
];

function DgVoodooTab({ config, updateConfig }) {
  const [setupComplete, setSetupComplete] = useState(!!config?.dgvSetupComplete);
  const [step, setStep] = useState(0);
  const [dgvStatus, setDgvStatus] = useState({ d3d8Exists: false, confExists: false, cplExists: false });
  const [sourcePath, setSourcePath] = useState('');
  const [sourceValid, setSourceValid] = useState(false);
  const [copyStatus, setCopyStatus] = useState(''); // '' | 'copying' | 'done' | 'error'
  const [copyMsg, setCopyMsg] = useState('');
  const [settings, setSettings] = useState({ ...RECOMMENDED_SETTINGS });
  const [confStatus, setConfStatus] = useState(''); // '' | 'writing' | 'done' | 'error'
  const [confMsg, setConfMsg] = useState('');
  const [removeStatus, setRemoveStatus] = useState('');
  const [defenderExcluded, setDefenderExcluded] = useState(config?.dgvDefenderExcluded ?? null); // null=unknown, true, false
  const [defenderAdding, setDefenderAdding] = useState(false);
  const [defenderMsg, setDefenderMsg] = useState('');
  const [dlStatus, setDlStatus] = useState(''); // '' | 'downloading' | 'done' | 'error'
  const [dlProgress, setDlProgress] = useState({ percent: 0, detail: '' });
  const [dlMsg, setDlMsg] = useState('');
  const [dlVersion, setDlVersion] = useState('');
  const [cachedPath, setCachedPath] = useState('');

  const ffxiPath = config?.ffxiPath || '';
  const settingsLoaded = useRef(false);

  const checkStatus = useCallback(async () => {
    if (!api || !ffxiPath) return;
    const result = await api.checkDgVoodoo(ffxiPath);
    setDgvStatus(result);
  }, [ffxiPath]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  // Load saved dgVoodoo settings from conf file on mount
  useEffect(() => {
    if (!api?.readDgVoodooConf || !ffxiPath) return;
    settingsLoaded.current = false;
    api.readDgVoodooConf(ffxiPath).then(result => {
      if (result?.success && result.settings) {
        setSettings(prev => ({ ...prev, ...result.settings }));
      }
      settingsLoaded.current = true;
    });
  }, [ffxiPath]);

  // Auto-save conf whenever settings change (after initial load)
  useEffect(() => {
    if (!settingsLoaded.current || !ffxiPath || !dgvStatus.confExists) return;
    const timer = setTimeout(() => {
      api.writeDgVoodooConf(ffxiPath, settings);
    }, 400);
    return () => clearTimeout(timer);
  }, [settings, ffxiPath, dgvStatus.confExists]);

  // Check Defender exclusion status (requires admin — only run on explicit user action)
  const checkDefenderExclusion = useCallback(async () => {
    if (!api?.checkDefenderExclusion || !ffxiPath) return;
    const result = await api.checkDefenderExclusion(ffxiPath);
    setDefenderExcluded(result.excluded);
    updateConfig('dgvDefenderExcluded', result.excluded);
  }, [ffxiPath, updateConfig]);

  const addDefenderExclusion = async () => {
    if (!api?.addDefenderExclusion || !ffxiPath) return;
    setDefenderAdding(true);
    setDefenderMsg('');
    try {
      const result = await api.addDefenderExclusion(ffxiPath);
      if (result.success) {
        setDefenderMsg('Exclusion added successfully');
        setDefenderExcluded(true);
        updateConfig('dgvDefenderExcluded', true);
      } else {
        setDefenderMsg(result.error || 'Failed to add exclusion');
      }
    } catch (e) {
      setDefenderMsg(e.message);
    }
    setDefenderAdding(false);
  };

  // Check if dgVoodoo was already downloaded to runtime folder
  useEffect(() => {
    if (!api?.getDgVoodooPath) return;
    api.getDgVoodooPath().then(result => {
      if (result.exists) {
        setCachedPath(result.path);
        // Auto-fill source path if empty
        setSourcePath(prev => prev || result.path);
      }
    });
  }, [dlStatus]);

  // Listen for download progress
  useEffect(() => {
    if (!api?.onDgVoodooProgress) return;
    const unsub = api.onDgVoodooProgress((percent, detail) => {
      setDlProgress({ percent, detail });
    });
    return unsub;
  }, []);

  const downloadDgVoodoo = async () => {
    setDlStatus('downloading');
    setDlMsg('');
    setDlProgress({ percent: 0, detail: 'Starting...' });
    try {
      const result = await api.downloadDgVoodoo();
      if (result.success) {
        setDlStatus('done');
        setDlMsg(`Downloaded successfully${result.version ? ` (${result.version})` : ''}`);
        setDlVersion(result.version || '');
        setCachedPath(result.path);
        setSourcePath(result.path);
      } else {
        setDlStatus('error');
        setDlMsg(result.error || 'Download failed');
      }
    } catch (e) {
      setDlStatus('error');
      setDlMsg(e.message);
    }
  };

  // Validate source path when it changes
  useEffect(() => {
    if (!api || !sourcePath) { setSourceValid(false); return; }
    api.pathExists(sourcePath + '\\MS\\x86\\D3D8.dll').then(setSourceValid);
  }, [sourcePath]);

  const browseDgVoodoo = async () => {
    const result = await api.browseFolder(sourcePath || '');
    if (result) setSourcePath(result);
  };

  const copyFiles = async () => {
    if (!sourceValid || !ffxiPath) return;
    setCopyStatus('copying');
    setCopyMsg('');
    try {
      const result = await api.copyDgVoodooFiles(sourcePath, ffxiPath);
      if (result.success) {
        setCopyStatus('done');
        setCopyMsg(result.message || 'Files copied successfully');
        await checkStatus();
      } else {
        setCopyStatus('error');
        setCopyMsg(result.error || 'Copy failed');
      }
    } catch (e) {
      setCopyStatus('error');
      setCopyMsg(e.message);
    }
  };

  const writeConf = async () => {
    if (!ffxiPath) return;
    setConfStatus('writing');
    setConfMsg('');
    try {
      const result = await api.writeDgVoodooConf(ffxiPath, settings);
      if (result.success) {
        setConfStatus('done');
        setConfMsg('Configuration saved successfully');
        await checkStatus();
      } else {
        setConfStatus('error');
        setConfMsg(result.error || 'Failed to write config');
      }
    } catch (e) {
      setConfStatus('error');
      setConfMsg(e.message);
    }
  };

  const launchCpl = async () => {
    if (!ffxiPath) return;
    const result = await api.launchDgVoodooCpl(ffxiPath);
    if (!result.success) {
      setConfMsg(result.error || 'Failed to launch dgVoodooCpl.exe');
    }
  };

  const openDefenderSettings = async () => {
    if (!api) return;
    await api.openDefenderSettings();
  };

  const removeDgVoodoo = async () => {
    if (!ffxiPath) return;
    if (!window.confirm('Remove dgVoodoo2 files (D3D8.dll, dgVoodoo.conf, dgVoodooCpl.exe) from your FFXI directory?')) return;
    setRemoveStatus('removing');
    try {
      const result = await api.removeDgVoodoo(ffxiPath);
      if (result.success) {
        setRemoveStatus('done');
        await checkStatus();
      } else {
        setRemoveStatus('error');
      }
    } catch {
      setRemoveStatus('error');
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const currentStep = STEPS[step];
  const canGoNext = () => {
    if (currentStep === 'copy' && !dgvStatus.d3d8Exists && copyStatus !== 'done') return false;
    return true;
  };

  // Determine if the current step's task is complete (triggers glow on Next)
  const isStepDone = () => {
    switch (currentStep) {
      case 'overview': return true; // just informational
      case 'download': return !!(cachedPath || sourceValid || dlStatus === 'done');
      case 'defender': return defenderExcluded === true;
      case 'copy': return !!(dgvStatus.d3d8Exists || copyStatus === 'done');
      case 'configure': return !!(dgvStatus.confExists || confStatus === 'done');
      default: return false;
    }
  };

  if (!ffxiPath) {
    return (
      <div className="dgv-tab">
        <div className="panel dgv-warning">
          <strong>FFXI Path Not Set</strong>
          <p>Set your FFXI install path in Settings before configuring dgVoodoo2.</p>
        </div>
      </div>
    );
  }

  const renderSettingsGrid = () => (
    <>
      <div className="dgv-settings-grid">
        <div className="dgv-setting-card">
          <label>Output API</label>
          <select value={settings.outputAPI} onChange={e => updateSetting('outputAPI', e.target.value)}>
            <option value="d3d11">Direct3D 11 (Recommended)</option>
            <option value="d3d12">Direct3D 12 (Experimental)</option>
          </select>
        </div>

        <div className="dgv-setting-card">
          <label>Anti-Aliasing (MSAA)</label>
          <select value={settings.msaa} onChange={e => updateSetting('msaa', e.target.value)}>
            {MSAA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="dgv-setting-card">
          <label>Anisotropic Filtering</label>
          <select value={settings.anisotropic} onChange={e => updateSetting('anisotropic', e.target.value)}>
            {AF_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="dgv-setting-card">
          <label>Scaling Mode</label>
          <select value={settings.scalingMode} onChange={e => updateSetting('scalingMode', e.target.value)}>
            <option value="stretched_ar">Stretched (Keep Aspect Ratio)</option>
            <option value="stretched">Stretched (Fill Screen)</option>
            <option value="centered">Centered</option>
            <option value="unspecified">Unspecified</option>
          </select>
        </div>

        <div className="dgv-setting-card">
          <label>VSync</label>
          <select value={settings.vsync ? 'on' : 'off'} onChange={e => updateSetting('vsync', e.target.value === 'on')}>
            <option value="on">On (Prevents tearing)</option>
            <option value="off">Off</option>
          </select>
        </div>

        <div className="dgv-setting-card">
          <label>Resolution</label>
          <select value={settings.resolution} onChange={e => updateSetting('resolution', e.target.value)}>
            <option value="app_controlled">Application Controlled (Use FFXI Settings)</option>
            <option value="1920x1080">1920x1080 (1080p)</option>
            <option value="2560x1440">2560x1440 (1440p)</option>
            <option value="3840x2160">3840x2160 (4K)</option>
          </select>
        </div>

        <div className="dgv-setting-card">
          <label>Depth Buffer Precision</label>
          <select value={settings.depthBuffer} onChange={e => updateSetting('depthBuffer', e.target.value)}>
            <option value="appdriven">App Driven (Default)</option>
            <option value="forcemin24bit">Force 24-bit (Recommended — Fixes Z-fighting)</option>
            <option value="force32bit">Force 32-bit</option>
          </select>
          <span className="dgv-field-hint">Fixes flickering terrain and disappearing textures</span>
        </div>

        <div className="dgv-setting-card">
          <label>Reported VRAM</label>
          <select value={settings.vram} onChange={e => updateSetting('vram', e.target.value)}>
            {VRAM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="dgv-field-hint">Set higher for HD texture packs</span>
        </div>

        <div className="dgv-setting-card">
          <label>FPS Limit</label>
          <select value={settings.fpsLimit} onChange={e => updateSetting('fpsLimit', e.target.value)}>
            {FPS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="dgv-field-hint">Cap frame rate to reduce GPU heat</span>
        </div>

        <div className="dgv-setting-card">
          <label>Fullscreen Mode</label>
          <select value={settings.fullscreenAttr} onChange={e => updateSetting('fullscreenAttr', e.target.value)}>
            <option value="default">Exclusive Fullscreen</option>
            <option value="fake">Fake Fullscreen (Borderless)</option>
          </select>
          <span className="dgv-field-hint">Fake avoids alt-tab crashes</span>
        </div>

        <div className="dgv-setting-card">
          <label>Upscale Filter</label>
          <select value={settings.resampling} onChange={e => updateSetting('resampling', e.target.value)}>
            <option value="pointsampled">Point Sampled (Pixelated)</option>
            <option value="bilinear">Bilinear (Default)</option>
            <option value="bicubic">Bicubic (Sharper)</option>
            <option value="lanczos-2">Lanczos-2 (Sharp)</option>
            <option value="lanczos-3">Lanczos-3 (Sharpest)</option>
          </select>
          <span className="dgv-field-hint">Filter used when dgVoodoo upscales the image</span>
        </div>

        <div className="dgv-setting-card">
          <label>Mipmapping</label>
          <select value={settings.mipmapping} onChange={e => updateSetting('mipmapping', e.target.value)}>
            <option value="appdriven">App Driven</option>
            <option value="disabled">Disabled (Sharper distant textures)</option>
            <option value="autogen_bilinear">Auto-Generate Bilinear</option>
          </select>
        </div>
      </div>

      <div className="dgv-setting dgv-setting-check">
        <label>
          <input type="checkbox" checked={!settings.watermark} onChange={e => updateSetting('watermark', !e.target.checked)} />
          Hide dgVoodoo watermark
        </label>
        <span className="dgv-field-hint">Removes the dgVoodoo logo from the bottom-right corner</span>
      </div>

      <div className="dgv-setting dgv-setting-check">
        <label>
          <input type="checkbox" checked={settings.fastVram} onChange={e => updateSetting('fastVram', e.target.checked)} />
          Fast Video Memory Access
        </label>
        <span className="dgv-field-hint">Improves performance — disable if you see black textures with HD packs</span>
      </div>

      <div className="dgv-setting dgv-setting-check">
        <label>
          <input type="checkbox" checked={settings.keepFilter} onChange={e => updateSetting('keepFilter', e.target.checked)} />
          Preserve Point-Sampled Textures
        </label>
        <span className="dgv-field-hint">Prevents transparent texture artifacts when forcing anisotropic filtering (trees, windows)</span>
      </div>

      <div className="dgv-setting dgv-setting-check">
        <label>
          <input type="checkbox" checked={settings.captureMouse} onChange={e => updateSetting('captureMouse', e.target.checked)} />
          Capture Mouse
        </label>
        <span className="dgv-field-hint">Locks cursor inside game window — disable for multiboxing</span>
      </div>
    </>
  );

  return (
    <div className="dgv-tab">
      <div className="dgv-header">
        <h2>dgVoodoo2 Setup</h2>
        <p>Step-by-step graphics wrapper configuration for FFXI</p>
      </div>

      {/* Status bar */}
      <div className="dgv-status-bar">
        <span className={`pill ${dgvStatus.d3d8Exists ? 'pill-green' : 'pill-red'}`}>
          D3D8.dll {dgvStatus.d3d8Exists ? 'Installed' : 'Not Found'}
        </span>
        <span className={`pill ${dgvStatus.confExists ? 'pill-green' : 'pill-red'}`}>
          Config {dgvStatus.confExists ? 'Present' : 'Missing'}
        </span>
        {dgvStatus.d3d8Exists && (
          <button className="btn btn-sm dgv-remove-btn" onClick={removeDgVoodoo}>
            Remove dgVoodoo2
          </button>
        )}
        {removeStatus === 'done' && <span style={{ fontSize: 12, color: 'var(--green)' }}>Removed</span>}
      </div>

      {/* Step progress */}
      <div className="dgv-steps">
        {STEPS.map((s, i) => (
          <button
            key={s}
            className={`dgv-step-btn ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            onClick={() => setStep(i)}
          >
            <span className="dgv-step-num">{i + 1}</span>
            <span className="dgv-step-label">{STEP_LABELS[i]}</span>
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="dgv-body">

        {currentStep === 'overview' && (
          <div className="dgv-step-content">
            <div className="panel dgv-panel">
              <h3 className="dgv-step-title">What is dgVoodoo2?</h3>
              <p className="dgv-desc">
                dgVoodoo2 is a graphics wrapper that translates FFXI's old DirectX 8 calls into modern
                DirectX 11. This gives you access to features the original engine can't provide:
              </p>
              <div className="dgv-benefits">
                <div className="dgv-benefit-card">
                  <span className="dgv-benefit-icon">+</span>
                  <div>
                    <strong>Anti-Aliasing (MSAA)</strong>
                    <p>Smooths jagged edges on character models, terrain, and objects</p>
                  </div>
                </div>
                <div className="dgv-benefit-card">
                  <span className="dgv-benefit-icon">+</span>
                  <div>
                    <strong>Anisotropic Filtering</strong>
                    <p>Sharper ground and wall textures at oblique angles</p>
                  </div>
                </div>
                <div className="dgv-benefit-card">
                  <span className="dgv-benefit-icon">+</span>
                  <div>
                    <strong>Modern GPU Compatibility</strong>
                    <p>Fixes rendering issues on newer graphics cards</p>
                  </div>
                </div>
                <div className="dgv-benefit-card">
                  <span className="dgv-benefit-icon">+</span>
                  <div>
                    <strong>Better Performance</strong>
                    <p>Modern API translation can improve frame rates on some systems</p>
                  </div>
                </div>
              </div>
            </div>
            {!setupComplete && (
              <div className="panel dgv-note">
                <strong>Important:</strong> dgVoodoo2's DLL files are frequently flagged as false positives
                by antivirus software. This is because they intercept graphics API calls — a pattern that
                looks suspicious to heuristic scanners. The files are safe, but you'll need to add a
                Windows Defender exclusion before installing. We'll walk you through it.
              </div>
            )}

            {setupComplete && (
              <>
                <div className="panel dgv-panel">
                  <h3 className="dgv-step-title">Graphics Settings</h3>
                  <p className="dgv-desc">
                    Adjust your dgVoodoo2 configuration. Changes are written to <code>dgVoodoo.conf</code> in your FFXI directory.
                  </p>

                  {renderSettingsGrid()}

                  <div className="dgv-action-box">
                    <div className="dgv-action-row">
                      <button
                        className="btn btn-primary"
                        onClick={writeConf}
                        disabled={confStatus === 'writing'}
                      >
                        {confStatus === 'writing' ? 'Writing...' : 'Save Configuration'}
                      </button>
                      <button className="btn btn-ghost" onClick={() => setSettings({ ...RECOMMENDED_SETTINGS })}>
                        Reset to Recommended
                      </button>
                      {dgvStatus.cplExists && (
                        <button className="btn btn-ghost" onClick={launchCpl} title="Changes made in dgVoodooCpl will be overwritten next time you click Save Configuration">
                          Launch dgVoodooCpl.exe
                        </button>
                      )}
                    </div>
                    <p className="dgv-cpl-note">Note: Saving configuration above will overwrite any changes made directly in dgVoodooCpl.exe.</p>
                    {confMsg && (
                      <p className={`dgv-status-msg ${confStatus === 'done' ? 'success' : 'error'}`}>
                        {confMsg}
                      </p>
                    )}
                  </div>
                </div>

                <div className="panel dgv-panel">
                  <div className="dgv-action-row">
                    <button className="btn btn-ghost btn-sm" onClick={() => { setSetupComplete(false); updateConfig('dgvSetupComplete', false); setStep(0); }}>
                      Re-run Setup Wizard
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => api.openFolder(ffxiPath)}>
                      Open FFXI Folder
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {currentStep === 'download' && (
          <div className="dgv-step-content">
            <div className="panel dgv-panel">
              <h3 className="dgv-step-title">Download dgVoodoo2</h3>
              <p className="dgv-desc">
                We can download and extract the correct dgVoodoo2 release automatically, or you can
                grab it manually from GitHub.
              </p>

              {cachedPath && dlStatus !== 'downloading' && (
                <div className="dgv-already-installed-box">
                  <strong>dgVoodoo2 already downloaded</strong>
                  <p>Found at: <code>{cachedPath}</code></p>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => api.openFolder(cachedPath)}>
                      Open Folder
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={downloadDgVoodoo}>
                      Re-download Latest
                    </button>
                  </div>
                </div>
              )}

              {!cachedPath && dlStatus !== 'downloading' && dlStatus !== 'done' && (
                <div className="dgv-action-box">
                  <div className="dgv-action-row">
                    <button
                      className="btn btn-primary"
                      onClick={downloadDgVoodoo}
                      disabled={dlStatus === 'downloading'}
                    >
                      Download dgVoodoo2 Automatically
                    </button>
                  </div>
                  <p className="dgv-hint">
                    Downloads the latest release, extracts it, and stores it inside the launcher folder
                  </p>
                </div>
              )}

              {dlStatus === 'downloading' && (
                <div className="dgv-progress-box">
                  <div className="dgv-progress-bar">
                    <div className="dgv-progress-fill" style={{ width: `${dlProgress.percent}%` }} />
                  </div>
                  <span className="dgv-progress-text">{dlProgress.detail}</span>
                </div>
              )}

              {dlStatus === 'done' && (
                <div className="dgv-already-installed-box">
                  <strong>{dlMsg}</strong>
                  <p>Stored at: <code>{cachedPath}</code></p>
                  <div style={{ marginTop: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => api.openFolder(cachedPath)}>
                      Open Folder
                    </button>
                  </div>
                </div>
              )}

              {dlStatus === 'error' && (
                <div style={{ marginTop: 8 }}>
                  <p className="dgv-status-msg error">{dlMsg}</p>
                  <button className="btn btn-ghost btn-sm" onClick={downloadDgVoodoo} style={{ marginTop: 6 }}>
                    Retry
                  </button>
                </div>
              )}
            </div>

            <div className="panel dgv-panel">
              <h4 className="dgv-step-title" style={{ fontSize: 14 }}>Manual Download</h4>
              <p className="dgv-hint" style={{ marginBottom: 10 }}>
                If you prefer to download manually, click below to open the releases page.
              </p>
              <div className="dgv-action-box" style={{ marginTop: 0 }}>
                <div className="dgv-action-row">
                  <button
                    className="btn btn-ghost"
                    onClick={() => api.openExternal('https://github.com/dege-diosg/dgVoodoo2/releases')}
                  >
                    Open Releases Page
                  </button>
                </div>
              </div>
              <div className="dgv-manual-hint">
                <p>
                  <strong>Which file to download:</strong> Pick the main ZIP — it will be named something
                  like <code>dgVoodoo2_87.zip</code>. Avoid files with <code>_dbg</code> (debug),
                  <code>_dev64</code> (developer), or <code>API</code> in the name.
                </p>
                <p style={{ marginTop: 6 }}>
                  After downloading, extract the ZIP and continue to the next step.
                </p>
              </div>
            </div>
          </div>
        )}

        {currentStep === 'defender' && (
          <div className="dgv-step-content">
            <div className="panel dgv-panel">
              <h3 className="dgv-step-title">Add Windows Defender Exclusion</h3>
              <p className="dgv-desc">
                You <strong>must</strong> add your FFXI folder as a Defender exclusion <strong>before</strong> copying
                the dgVoodoo2 files. Otherwise Windows will quarantine them immediately.
              </p>

              {/* Status indicator */}
              <div className="dgv-defender-status">
                {defenderExcluded === true && (
                  <div className="dgv-defender-badge pass">
                    <span className="dgv-verify-icon">{'\u2713'}</span>
                    <div>
                      <strong>Exclusion active</strong>
                      <p>Your FFXI folder is excluded from Windows Defender scanning</p>
                    </div>
                  </div>
                )}
                {defenderExcluded === false && (
                  <div className="dgv-defender-badge fail">
                    <span className="dgv-verify-icon">{'\u2717'}</span>
                    <div>
                      <strong>Not excluded</strong>
                      <p>Your FFXI folder is not in Defender's exclusion list yet</p>
                    </div>
                  </div>
                )}
                {defenderExcluded === null && (
                  <div className="dgv-defender-badge info">
                    <span className="dgv-verify-icon">?</span>
                    <div>
                      <strong>Checking...</strong>
                      <p>Verifying Defender exclusion status</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Auto-add button */}
              <div className="dgv-action-box">
                <div className="dgv-action-row">
                  <button
                    className="btn btn-primary"
                    onClick={addDefenderExclusion}
                    disabled={defenderAdding || defenderExcluded === true}
                  >
                    {defenderAdding ? 'Adding...' : defenderExcluded ? 'Exclusion Added' : 'Add Exclusion Automatically'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={checkDefenderExclusion}>
                    Recheck
                  </button>
                </div>
                <p className="dgv-hint">
                  Adds your FFXI folder as a Defender exclusion — you'll see a single UAC prompt to approve
                </p>
                {defenderMsg && (
                  <p className={`dgv-status-msg ${defenderExcluded ? 'success' : 'error'}`}>
                    {defenderMsg}
                  </p>
                )}
              </div>

              <div className="dgv-path-row">
                <span className="dgv-dest-label">Folder to exclude:</span>
                <span className="dgv-path-display">{ffxiPath}</span>
              </div>
            </div>

            <div className="panel dgv-panel">
              <h4 className="dgv-step-title" style={{ fontSize: 14 }}>Manual Method</h4>
              <p className="dgv-hint" style={{ marginBottom: 10 }}>
                If the automatic method doesn't work, you can add the exclusion manually through Windows Security.
              </p>
              <div className="dgv-action-box" style={{ marginTop: 0 }}>
                <div className="dgv-action-row">
                  <button className="btn btn-ghost" onClick={openDefenderSettings}>
                    Open Windows Security
                  </button>
                </div>
              </div>
              <div className="dgv-instructions">
                <h4>Follow these steps in Windows Security:</h4>
                <ol>
                  <li>Click <strong>"Virus & threat protection"</strong> on the left sidebar</li>
                  <li>Scroll down and click <strong>"Manage settings"</strong> under Virus & threat protection settings</li>
                  <li>Scroll down to <strong>"Exclusions"</strong> and click <strong>"Add or remove exclusions"</strong></li>
                  <li>Click <strong>"Yes"</strong> on the UAC prompt</li>
                  <li>Click <strong>"Add an exclusion"</strong> &rarr; choose <strong>"Folder"</strong></li>
                  <li>Navigate to your FFXI game folder:
                    <div className="dgv-path-display">{ffxiPath}</div>
                  </li>
                  <li>Click <strong>"Select Folder"</strong></li>
                  <li>You should see your FFXI folder appear in the exclusions list — <strong>you can close Windows Security after that</strong></li>
                </ol>
              </div>
            </div>

            <div className="panel dgv-note">
              <strong>Why is this needed?</strong> dgVoodoo2's DLLs hook into DirectX calls at a low level.
              Antivirus heuristics see this as suspicious behavior (similar to how malware injects into processes).
              The files are safe — they're open source and widely used by the gaming community — but Defender
              doesn't know that.
            </div>

            <div className="panel dgv-note dgv-note-warn">
              <strong>If you already copied the files and they disappeared:</strong> Go to
              Windows Security &rarr; Virus & threat protection &rarr; Protection history. Find the
              quarantined files and click <strong>"Restore"</strong> after adding the exclusion above.
            </div>
          </div>
        )}

        {currentStep === 'copy' && (
          <div className="dgv-step-content">
            <div className="panel dgv-panel">
              <h3 className="dgv-step-title">Install dgVoodoo2 Files</h3>
              <p className="dgv-desc">
                Point us to the folder where you extracted dgVoodoo2. We'll copy the correct files
                into your FFXI directory.
              </p>

              {dgvStatus.d3d8Exists ? (
                <div className="dgv-already-installed-box">
                  <strong>Already installed</strong>
                  <p>D3D8.dll is already present in your FFXI directory. You can skip this step or re-copy to update.</p>
                </div>
              ) : null}

              <div className="dgv-field">
                <label>dgVoodoo2 Extracted Folder</label>
                <span className="dgv-field-hint">
                  The folder containing <code>dgVoodooCpl.exe</code> and the <code>MS</code> subfolder
                </span>
                <div className="dgv-field-row">
                  <input
                    type="text"
                    value={sourcePath}
                    onChange={e => setSourcePath(e.target.value)}
                    placeholder="C:\dgVoodoo2"
                  />
                  <button className="btn btn-ghost btn-sm" onClick={browseDgVoodoo}>Browse</button>
                  <span className={`pill ${sourceValid ? 'pill-green' : sourcePath ? 'pill-red' : ''}`} style={{ fontSize: 10 }}>
                    {sourceValid ? 'Valid' : sourcePath ? 'Invalid' : ''}
                  </span>
                </div>
                {sourcePath && !sourceValid && (
                  <p className="dgv-field-error">
                    Could not find <code>MS\x86\D3D8.dll</code> in this folder. Make sure you selected the
                    root dgVoodoo2 folder (the one containing <code>dgVoodooCpl.exe</code>).
                  </p>
                )}
              </div>

              <div className="dgv-action-box">
                <div className="dgv-action-row">
                  <button
                    className="btn btn-primary"
                    onClick={copyFiles}
                    disabled={!sourceValid || copyStatus === 'copying'}
                  >
                    {copyStatus === 'copying' ? 'Copying...' : 'Copy Files to FFXI Directory'}
                  </button>
                </div>
                {copyMsg && (
                  <p className={`dgv-status-msg ${copyStatus === 'done' ? 'success' : 'error'}`}>
                    {copyMsg}
                  </p>
                )}
              </div>

              <div className="dgv-dest-info">
                <span className="dgv-dest-label">Destination:</span>
                <span className="dgv-path-display">{ffxiPath}</span>
              </div>
            </div>

            <div className="panel dgv-panel">
              <div className="dgv-copy-info">
                <h4>Files that will be copied:</h4>
                <table className="dgv-file-table">
                  <thead>
                    <tr><th>File</th><th>Source</th><th>Purpose</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><code>D3D8.dll</code></td>
                      <td><code>MS\x86\</code></td>
                      <td>Core DirectX 8 wrapper (required)</td>
                    </tr>
                    <tr>
                      <td><code>dgVoodooCpl.exe</code></td>
                      <td>Root folder</td>
                      <td>Configuration GUI (for manual tweaking)</td>
                    </tr>
                  </tbody>
                </table>
                <p className="dgv-hint" style={{ marginTop: 8 }}>
                  Only the 32-bit D3D8.dll is needed — FFXI is a 32-bit DirectX 8 application.
                  D3D9.dll and DDraw.dll are <strong>not</strong> copied to avoid conflicts with Ashita.
                </p>
              </div>
            </div>
          </div>
        )}

        {currentStep === 'configure' && (
          <div className="dgv-step-content">
            <div className="panel dgv-panel">
              <h3 className="dgv-step-title">Quick Configure (Recommended)</h3>
              <p className="dgv-desc">
                Choose your graphics settings below and we'll write an optimized <code>dgVoodoo.conf</code> for FFXI.
              </p>

              {renderSettingsGrid()}

              <div className="dgv-action-box">
                <div className="dgv-action-row">
                  <button
                    className="btn btn-primary"
                    onClick={writeConf}
                    disabled={confStatus === 'writing'}
                  >
                    {confStatus === 'writing' ? 'Writing...' : 'Save Configuration'}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setSettings({ ...RECOMMENDED_SETTINGS })}>
                    Reset to Recommended
                  </button>
                </div>
                {confMsg && (
                  <p className={`dgv-status-msg ${confStatus === 'done' ? 'success' : 'error'}`}>
                    {confMsg}
                  </p>
                )}
              </div>
            </div>

            <div className="dgv-config-divider">
              <span>or</span>
            </div>

            <div className="panel dgv-panel">
              <h4 className="dgv-step-title" style={{ fontSize: 14 }}>Advanced: Use dgVoodoo2 GUI</h4>
              <p className="dgv-hint">
                Launch dgVoodooCpl.exe for full control over all settings. Make sure it was
                copied to your FFXI directory in the previous step.
              </p>
              <div className="dgv-action-box">
                <div className="dgv-action-row">
                  <button
                    className="btn btn-ghost"
                    onClick={launchCpl}
                    disabled={!dgvStatus.cplExists}
                    title="Changes made in dgVoodooCpl will be overwritten next time you click Save Configuration"
                  >
                    Launch dgVoodooCpl.exe
                  </button>
                  {!dgvStatus.cplExists && (
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      (not found in FFXI directory)
                    </span>
                  )}
                </div>
              </div>
              {dgvStatus.cplExists && (
                <div className="dgv-cpl-checklist">
                  <h4>Recommended settings in dgVoodooCpl:</h4>
                  <ul>
                    <li><strong>General tab:</strong> Output API = Direct3D 11, uncheck "dgVoodoo Watermark"</li>
                    <li><strong>DirectX tab:</strong> MSAA = 4x, Filtering = 16x AF</li>
                    <li><strong>DirectX tab:</strong> Make sure "Disable and passthru to real DirectX" is <strong>unchecked</strong> for DirectX 8</li>
                    <li>Click <strong>Apply</strong> when done — this writes <code>dgVoodoo.conf</code></li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === 'verify' && (
          <div className="dgv-step-content">
            <div className="panel dgv-panel">
              <h3 className="dgv-step-title">Verify Installation</h3>
              <p className="dgv-desc">
                Let's make sure everything is in place.
              </p>

              <div className="dgv-verify-list">
                <div className={`dgv-verify-item ${dgvStatus.d3d8Exists ? 'pass' : 'fail'}`}>
                  <span className="dgv-verify-icon">{dgvStatus.d3d8Exists ? '\u2713' : '\u2717'}</span>
                  <div>
                    <strong>D3D8.dll</strong>
                    <p>{dgvStatus.d3d8Exists ? 'Present in FFXI directory' : 'Not found — go back to Step 4 (Install)'}</p>
                  </div>
                </div>

                <div className={`dgv-verify-item ${dgvStatus.confExists ? 'pass' : 'fail'}`}>
                  <span className="dgv-verify-icon">{dgvStatus.confExists ? '\u2713' : '\u2717'}</span>
                  <div>
                    <strong>dgVoodoo.conf</strong>
                    <p>{dgvStatus.confExists ? 'Configuration file present' : 'Not found — go back to Step 5 (Configure)'}</p>
                  </div>
                </div>

                <div className={`dgv-verify-item ${dgvStatus.cplExists ? 'pass' : 'info'}`}>
                  <span className="dgv-verify-icon">{dgvStatus.cplExists ? '\u2713' : 'i'}</span>
                  <div>
                    <strong>dgVoodooCpl.exe</strong>
                    <p>{dgvStatus.cplExists ? 'Configuration GUI available' : 'Optional — not needed at runtime, only for changing settings'}</p>
                  </div>
                </div>
              </div>

              {dgvStatus.d3d8Exists && dgvStatus.confExists ? (
                <div className="dgv-result-box dgv-result-success">
                  <strong>dgVoodoo2 is ready!</strong>
                  <p>
                    Launch FFXI normally through Ashita. dgVoodoo2 will automatically intercept DirectX 8
                    calls and apply your configured graphics enhancements.
                  </p>
                  <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-dim)' }}>
                    If you experience issues, you can remove dgVoodoo2 using the button at the top of this page,
                    or launch dgVoodooCpl.exe to adjust settings.
                  </p>
                </div>
              ) : (
                <div className="dgv-result-box dgv-result-incomplete">
                  <strong>Setup incomplete</strong>
                  <p>Use the step buttons above to go back and complete the missing steps.</p>
                </div>
              )}

              <div className="dgv-action-box" style={{ marginTop: 16 }}>
                <div className="dgv-action-row">
                  <button className="btn btn-ghost btn-sm" onClick={checkStatus}>
                    Recheck Status
                  </button>
                  {dgvStatus.d3d8Exists && (
                    <button className="btn btn-ghost btn-sm" onClick={() => api.openFolder(ffxiPath)}>
                      Open FFXI Folder
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="panel dgv-panel">
              <h4 className="dgv-step-title" style={{ fontSize: 14 }}>Troubleshooting</h4>
              <div className="dgv-faq">
                <details>
                  <summary>DLL files keep disappearing</summary>
                  <p>Windows Defender is quarantining them. Go back to Step 3 (Defender) and add your FFXI folder as an exclusion. Check Protection History to restore quarantined files.</p>
                </details>
                <details>
                  <summary>Game crashes on launch</summary>
                  <p>Try changing the Output API from Direct3D 12 to Direct3D 11 in the Configure step. If using Ashita plugins that hook D3D9, make sure only D3D8.dll was copied (not D3D9.dll).</p>
                </details>
                <details>
                  <summary>dgVoodoo watermark appears on screen</summary>
                  <p>Re-run the Configure step and make sure "Hide dgVoodoo watermark" is checked, or launch dgVoodooCpl.exe and uncheck the watermark option on the General tab.</p>
                </details>
                <details>
                  <summary>Game looks the same as before</summary>
                  <p>Make sure "Disable and passthru to real DirectX" is unchecked in dgVoodooCpl's DirectX tab. If you wrote config via Quick Configure, this is already set correctly.</p>
                </details>
                <details>
                  <summary>Black screen or wrong monitor</summary>
                  <p>Launch dgVoodooCpl.exe and check the General tab — set the correct output display and try Direct3D 11 instead of 12.</p>
                </details>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="dgv-footer">
        <div>
          {step > 0 && (
            <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)}>
              &larr; Back
            </button>
          )}
        </div>
        <div>
          {step < STEPS.length - 1 && (
            <button
              className={`btn btn-primary ${isStepDone() && canGoNext() ? 'dgv-next-glow' : ''}`}
              onClick={() => setStep(s => s + 1)}
              disabled={!canGoNext()}
            >
              Next &rarr;
            </button>
          )}
          {step === STEPS.length - 1 && (
            <button
              className={`btn btn-primary ${dgvStatus.d3d8Exists && dgvStatus.confExists ? 'dgv-next-glow' : ''}`}
              onClick={() => {
                setSetupComplete(true);
                updateConfig('dgvSetupComplete', true);
                setStep(0);
              }}
            >
              Finish &check;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default DgVoodooTab;
