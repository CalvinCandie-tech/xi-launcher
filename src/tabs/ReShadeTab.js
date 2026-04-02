import React, { useState, useEffect, useCallback } from 'react';
import './ReShadeTab.css';
import CollapsibleSection from '../components/CollapsibleSection';

const api = window.xiAPI;

const EFFECT_META = [
  { key: 'smaa',             label: 'SMAA Anti-Aliasing',  hint: 'Smooths jagged edges — big quality boost for FFXI',       hasSlider: false },
  { key: 'sharpening',       label: 'Sharpening',          hint: 'Crisp edges and fine texture detail',                      hasSlider: true, min: 0, max: 1, step: 0.05 },
  { key: 'clarity',          label: 'Clarity',             hint: 'Mid-tone contrast — textures look more detailed',          hasSlider: true, min: 0, max: 1, step: 0.05 },
  { key: 'vibrance',         label: 'Vibrance',            hint: 'Intelligent saturation — boosts dull colors, preserves vivid ones', hasSlider: true, min: 0, max: 1, step: 0.05 },
  { key: 'colourfulness',    label: 'Colourfulness',       hint: 'Per-channel saturation — makes each color more distinct',  hasSlider: true, min: 0, max: 1, step: 0.05 },
  { key: 'bloom',            label: 'Bloom / Glow',        hint: 'Candles, fires, and crystals radiate soft light',          hasSlider: true, min: 0, max: 1, step: 0.05 },
  { key: 'ambientOcclusion', label: 'Ambient Occlusion',   hint: 'Adds depth shadows in corners and crevices',              hasSlider: false },
  { key: 'vignette',         label: 'Vignette',            hint: 'Darkens screen edges — draws focus to the center',         hasSlider: true, min: 0, max: 1, step: 0.05 },
  { key: 'filmGrain',        label: 'Film Grain',          hint: 'Subtle noise for a cinematic look',                        hasSlider: true, min: 0, max: 1, step: 0.05 },
  { key: 'depthOfField',     label: 'Depth of Field',      hint: 'Blurs background like a camera lens — great for screenshots', hasSlider: false },
  { key: 'fakeHDR',          label: 'Fake HDR',            hint: 'Tone mapping — recovers highlight and shadow detail',      hasSlider: true, min: 0, max: 1, step: 0.05 },
  { key: 'liftGammaGain',    label: 'Lift Gamma Gain',     hint: 'Color grading — adjust shadows, midtones, and highlights', hasSlider: false },
];

const DEFAULT_EFFECTS = Object.fromEntries(
  EFFECT_META.map(m => [m.key, m.hasSlider ? { enabled: false, value: 0.50 } : { enabled: false }])
);

const PRESETS = [
  {
    name: 'Clean',
    desc: "Fixes FFXI's rough edges without changing the look.",
    effects: {
      smaa: { enabled: true },
      sharpening: { enabled: true, value: 0.60 },
      clarity: { enabled: true, value: 0.30 },
    },
    count: 3,
  },
  {
    name: 'Vivid',
    desc: 'Clean + punchy, saturated colors that make zones pop.',
    effects: {
      smaa: { enabled: true },
      sharpening: { enabled: true, value: 0.60 },
      clarity: { enabled: true, value: 0.30 },
      vibrance: { enabled: true, value: 0.30 },
      colourfulness: { enabled: true, value: 0.40 },
    },
    count: 5,
  },
  {
    name: 'Cinematic',
    desc: 'Vivid + bloom, ambient occlusion, vignette, and film grain.',
    effects: {
      smaa: { enabled: true },
      sharpening: { enabled: true, value: 0.60 },
      clarity: { enabled: true, value: 0.30 },
      vibrance: { enabled: true, value: 0.30 },
      colourfulness: { enabled: true, value: 0.40 },
      bloom: { enabled: true, value: 0.30 },
      ambientOcclusion: { enabled: true },
      vignette: { enabled: true, value: 0.40 },
      filmGrain: { enabled: true, value: 0.15 },
    },
    count: 9,
  },
  {
    name: 'Screenshot',
    desc: 'Cinematic + depth of field, HDR, and color grading. Not for gameplay.',
    effects: {
      smaa: { enabled: true },
      sharpening: { enabled: true, value: 0.60 },
      clarity: { enabled: true, value: 0.30 },
      vibrance: { enabled: true, value: 0.30 },
      colourfulness: { enabled: true, value: 0.40 },
      bloom: { enabled: true, value: 0.30 },
      ambientOcclusion: { enabled: true },
      vignette: { enabled: true, value: 0.40 },
      filmGrain: { enabled: true, value: 0.15 },
      depthOfField: { enabled: true },
      fakeHDR: { enabled: true, value: 0.50 },
      liftGammaGain: { enabled: true },
    },
    count: 12,
  },
];

function ReShadeTab({ config, updateConfig, onNavigate }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dlStatus, setDlStatus] = useState('');
  const [dlProgress, setDlProgress] = useState({ percent: 0, detail: '' });
  const [dlMsg, setDlMsg] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [effects, setEffects] = useState(DEFAULT_EFFECTS);

  const ffxiPath = config?.ffxiPath || '';

  const checkStatus = useCallback(async () => {
    if (!api || !ffxiPath) { setLoading(false); return; }
    const result = await api.checkReShade(ffxiPath);
    setStatus(result);
    setLoading(false);
  }, [ffxiPath]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  useEffect(() => {
    if (status) setEnabled(status.enabled);
  }, [status]);

  // Load saved config on mount
  useEffect(() => {
    if (!api || !ffxiPath || !status?.installed) return;
    api.readReShadeConfig(ffxiPath).then(result => {
      if (result?.success && result.effects) {
        setEffects(result.effects);
      }
    });
  }, [ffxiPath, status?.installed]);

  // Listen for download progress
  useEffect(() => {
    if (!api?.onReShadeProgress) return;
    const unsub = api.onReShadeProgress((percent, detail) => {
      setDlProgress({ percent, detail });
    });
    return unsub;
  }, []);

  const handleDownloadAndInstall = async () => {
    setDlStatus('downloading');
    setDlMsg('');
    setDlProgress({ percent: 0, detail: 'Starting...' });
    try {
      const result = await api.downloadReShade();
      if (!result.success) {
        setDlStatus('error');
        setDlMsg(result.error);
        return;
      }
      setDlProgress({ percent: 85, detail: 'Installing to FFXI directory...' });
      const installResult = await api.installReShade(ffxiPath);
      if (!installResult.success) {
        setDlStatus('error');
        setDlMsg(installResult.error);
        return;
      }
      setDlStatus('done');
      setDlMsg('ReShade installed successfully');
      await checkStatus();
    } catch (e) {
      setDlStatus('error');
      setDlMsg(e.message);
    }
  };

  const handleToggle = async () => {
    const newEnabled = !enabled;
    const result = await api.toggleReShade(ffxiPath, newEnabled);
    if (result.success) {
      setEnabled(newEnabled);
    }
  };

  // Determine which preset matches current effects (or 'Custom')
  const activePreset = PRESETS.find(preset => {
    return EFFECT_META.every(meta => {
      const presetEffect = preset.effects[meta.key];
      const currentEffect = effects[meta.key];
      if (presetEffect) {
        if (!currentEffect?.enabled) return false;
        if (presetEffect.value !== undefined && currentEffect.value !== undefined) {
          return Math.abs(presetEffect.value - currentEffect.value) < 0.01;
        }
        return true;
      }
      return !currentEffect?.enabled;
    });
  })?.name || 'Custom';

  const applyPreset = async (preset) => {
    const newEffects = {};
    for (const meta of EFFECT_META) {
      if (preset.effects[meta.key]) {
        newEffects[meta.key] = { ...preset.effects[meta.key] };
      } else {
        newEffects[meta.key] = meta.hasSlider ? { enabled: false, value: DEFAULT_EFFECTS[meta.key].value } : { enabled: false };
      }
    }
    setEffects(newEffects);
    await api.writeReShadeConfig(ffxiPath, newEffects);
  };

  const updateEffect = async (key, changes) => {
    const newEffects = {
      ...effects,
      [key]: { ...effects[key], ...changes },
    };
    setEffects(newEffects);
    await api.writeReShadeConfig(ffxiPath, newEffects);
  };

  if (loading) {
    return <div className="reshade-tab"><div className="panel">Loading...</div></div>;
  }

  if (!ffxiPath) {
    return (
      <div className="reshade-tab">
        <div className="reshade-gate">
          <div className="reshade-gate-icon">⚙</div>
          <div className="reshade-gate-title cinzel">FFXI Path Not Set</div>
          <p className="reshade-gate-desc">Set your FFXI installation path in Settings first.</p>
          <button className="btn btn-primary" onClick={() => onNavigate('settings')}>
            Go to Settings →
          </button>
        </div>
      </div>
    );
  }

  if (!status?.dgvReady) {
    return (
      <div className="reshade-tab">
        <div className="reshade-gate">
          <div className="reshade-gate-icon">⚠</div>
          <div className="reshade-gate-title cinzel">dgVoodoo Required</div>
          <p className="reshade-gate-desc">
            ReShade needs dgVoodoo to work with FFXI. dgVoodoo upgrades the game's graphics
            from Direct3D 8 to Direct3D 11, which ReShade then hooks into for post-processing effects.
          </p>
          <div className="reshade-gate-error panel">
            <strong>D3D8.dll not found</strong> in your FFXI directory.<br/>
            Set up dgVoodoo first, then come back here.
          </div>
          <button className="btn btn-primary" onClick={() => onNavigate('dgvoodoo')}>
            Go to dgVoodoo Tab →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="reshade-tab">
      {/* Master Toggle Bar */}
      <div className="panel reshade-master-bar">
        <div className="reshade-master-info">
          <div className="reshade-master-title cinzel">ReShade Post-Processing</div>
          <div className="reshade-master-subtitle">Enhances visuals with shaders applied on top of dgVoodoo</div>
        </div>
        {status?.installed && (
          <div className="reshade-master-toggle">
            <span className={`reshade-toggle-label ${enabled ? 'active' : ''}`}>
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
            <div className="toggle" onClick={handleToggle}>
              <input type="checkbox" checked={enabled} readOnly />
              <span className="toggle-slider" />
            </div>
          </div>
        )}
      </div>

      {/* Install panel */}
      {!status?.installed && (
        <div className="panel reshade-install-panel">
          <strong>Install ReShade</strong>
          <p>Download and install ReShade to enable post-processing effects. This will download the ReShade DLL and shader files from GitHub.</p>
          {dlStatus === '' && (
            <button className="btn btn-primary" onClick={handleDownloadAndInstall}>
              Download & Install ReShade
            </button>
          )}
          {dlStatus === 'downloading' && (
            <div className="reshade-progress-area">
              <div className="reshade-progress-row">
                <div className="reshade-progress-bar">
                  <div className="reshade-progress-fill" style={{ width: `${dlProgress.percent}%` }} />
                </div>
                <span className="reshade-progress-pct">{dlProgress.percent}%</span>
              </div>
              <div className="reshade-status-msg">{dlProgress.detail}</div>
            </div>
          )}
          {dlStatus === 'done' && (
            <div className="reshade-status-msg success">{dlMsg}</div>
          )}
          {dlStatus === 'error' && (
            <div className="reshade-status-msg error">
              {dlMsg}
              <button className="btn btn-ghost btn-sm" onClick={handleDownloadAndInstall} style={{ marginLeft: 10 }}>
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Presets and Effects — only shown when installed and enabled */}
      {status?.installed && enabled && (
        <>
          <div className="section-header">Presets</div>
          <div className="reshade-presets-list">
            {PRESETS.map(preset => (
              <div
                key={preset.name}
                className={`reshade-preset-row ${activePreset === preset.name ? 'active' : ''}`}
                onClick={() => applyPreset(preset)}
              >
                <div className="reshade-preset-name cinzel">{preset.name}</div>
                <div className="reshade-preset-desc">{preset.desc}</div>
                <div className="reshade-preset-count">{preset.count} effects</div>
              </div>
            ))}
          </div>

          <CollapsibleSection title="Customize Effects" defaultOpen={false}>
            <div className="reshade-effects-list">
              {EFFECT_META.map(meta => {
                const effect = effects[meta.key];
                return (
                  <div key={meta.key} className={`reshade-effect-row ${effect?.enabled ? '' : 'disabled'}`}>
                    <div className="toggle" onClick={() => updateEffect(meta.key, { enabled: !effect?.enabled })}>
                      <input type="checkbox" checked={effect?.enabled ?? false} readOnly />
                      <span className="toggle-slider" />
                    </div>
                    <div className="reshade-effect-info">
                      <div className="reshade-effect-label">{meta.label}</div>
                      <div className="reshade-effect-hint">{meta.hint}</div>
                    </div>
                    {meta.hasSlider && (
                      <div className="reshade-effect-slider">
                        <input
                          type="range"
                          min={meta.min ?? 0}
                          max={meta.max ?? 1}
                          step={meta.step ?? 0.05}
                          value={effect?.value ?? 0.5}
                          onChange={e => updateEffect(meta.key, { value: parseFloat(e.target.value) })}
                          disabled={!effect?.enabled}
                          className="reshade-slider"
                        />
                        <span className={`reshade-effect-value ${effect?.enabled ? 'active' : ''}`}>
                          {effect?.enabled ? (effect?.value ?? 0).toFixed(2) : 'Off'}
                        </span>
                      </div>
                    )}
                    {!meta.hasSlider && (
                      <div className="reshade-effect-slider">
                        <span className={`reshade-effect-value ${effect?.enabled ? 'active' : ''}`}>
                          {effect?.enabled ? 'On' : 'Off'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {activePreset === 'Custom' && (
              <div className="reshade-custom-hint">
                Slider values differ from all presets — showing as <strong>Custom</strong>.
              </div>
            )}
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}

export default ReShadeTab;
