import React, { useState, useEffect, useCallback, useRef } from 'react';
import './SettingsTab.css';
import Modal from '../components/Modal';
import { getSection, setSectionValues, getScriptName } from '../utils/iniParser';

const api = window.xiAPI;

const INI_BLOCKED_KEYS = new Set();

const REG_KEY_LABELS = {
  '0000': 'Mip Mapping',
  '0001': 'Screen Width',
  '0002': 'Screen Height',
  '0003': 'Background Width',
  '0004': 'Background Height',
  '0007': 'Sound Enabled',
  '0011': 'Environment Animation',
  '0017': 'Bump Mapping',
  '0018': 'Texture Compression',
  '0019': 'Texture Compression Level',
  '0021': 'Hardware Mouse',
  '0022': 'Opening Movie',
  '0028': 'Gamma',
  '0029': 'Max Sounds',
  '0030': '3D LCD Mode',
  '0034': 'Display Mode',
  '0035': 'Sound Always On',
  '0036': 'Font Compression',
  '0037': 'Menu Width',
  '0038': 'Menu Height',
  '0040': 'Graphics Stabilization',
  '0044': 'Maintain Aspect Ratio',
  'padmode000': 'Gamepad Mode',
  'padsin000': 'Button Mapping',
  'padguid000': 'Controller GUID'
};

const REG_VALUE_LABELS = {
  '0034': { 0: 'Fullscreen', 1: 'Windowed', 2: 'Fullscreen Windowed', 3: 'Borderless Windowed' },
  '0007': { 0: 'Off', 1: 'On' },
  '0011': { 0: 'Off', 1: 'Normal', 2: 'Smooth' },
  '0017': { 0: 'Off', 1: 'On' },
  '0018': { 0: 'Compressed', 1: 'Low', 2: 'Uncompressed' },
  '0019': { 0: 'Compressed', 1: 'Uncompressed' },
  '0021': { 0: 'Off', 1: 'On' },
  '0022': { 0: 'Off', 1: 'On' },
  '0030': { 0: 'Off', 1: 'On' },
  '0035': { 0: 'Off', 1: 'On' },
  '0036': { 0: 'Compressed', 1: 'Uncompressed', 2: 'High Quality' },
  '0040': { 0: 'Off', 1: 'On' },
  '0044': { 0: 'Off', 1: 'On' }
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
    values: { '0001': 1280, '0002': 720, '0003': 1280, '0004': 720, '0034': 1, '0000': 1, '0017': 0, '0018': 0, '0019': 0, '0011': 0, '0007': 1, '0029': 12, '0028': 0, '0030': 0, '0035': 1, '0036': 0, '0037': 1280, '0038': 720, '0040': 0, '0044': 1 }
  },
  {
    name: 'Medium',
    desc: '1080p with matched background, bump mapping on, normal animations',
    tier: 'mid',
    values: { '0001': 1920, '0002': 1080, '0003': 1920, '0004': 1080, '0034': 1, '0000': 4, '0017': 1, '0018': 1, '0019': 0, '0011': 1, '0007': 1, '0029': 20, '0028': 0, '0030': 0, '0035': 1, '0036': 1, '0037': 1920, '0038': 1080, '0040': 0, '0044': 1 }
  },
  {
    name: 'High',
    desc: '1080p with 4K oversample, high quality textures, all effects on',
    tier: 'high',
    recommended: true,
    values: { '0001': 1920, '0002': 1080, '0003': 3840, '0004': 2160, '0034': 1, '0000': 6, '0017': 1, '0018': 2, '0019': 1, '0011': 2, '0007': 1, '0029': 20, '0028': 0, '0030': 0, '0035': 1, '0036': 2, '0037': 1920, '0038': 1080, '0040': 0, '0044': 1 }
  },
  {
    name: 'Max',
    desc: '1080p with 4K oversample, uncompressed textures, smooth animations, everything maxed',
    tier: 'max',
    values: { '0001': 1920, '0002': 1080, '0003': 3840, '0004': 2160, '0034': 1, '0000': 6, '0017': 1, '0018': 2, '0019': 1, '0011': 2, '0007': 1, '0029': 24, '0028': 50, '0030': 0, '0035': 1, '0036': 2, '0037': 1920, '0038': 1080, '0040': 0, '0044': 1, '0021': 1 }
  },
  {
    name: '2K Medium',
    desc: '1440p with matched background, balanced quality',
    tier: 'mid',
    values: { '0001': 2560, '0002': 1440, '0003': 2560, '0004': 1440, '0034': 1, '0000': 4, '0017': 1, '0018': 1, '0019': 0, '0011': 1, '0007': 1, '0029': 20, '0028': 0, '0030': 0, '0035': 1, '0036': 1, '0037': 2560, '0038': 1440, '0040': 0, '0044': 1 }
  },
  {
    name: '2K High',
    desc: '1440p with 4K oversample, all effects on',
    tier: 'high',
    recommended: true,
    values: { '0001': 2560, '0002': 1440, '0003': 3840, '0004': 2160, '0034': 1, '0000': 6, '0017': 1, '0018': 2, '0019': 1, '0011': 2, '0007': 1, '0029': 20, '0028': 0, '0030': 0, '0035': 1, '0036': 2, '0037': 2560, '0038': 1440, '0040': 0, '0044': 1 }
  },
  {
    name: '4K Max',
    desc: 'Native 4K, everything maxed — for powerful GPUs',
    tier: 'max',
    values: { '0001': 3840, '0002': 2160, '0003': 3840, '0004': 2160, '0034': 1, '0000': 6, '0017': 1, '0018': 2, '0019': 1, '0011': 2, '0007': 1, '0029': 20, '0028': 0, '0030': 0, '0035': 1, '0036': 2, '0037': 3840, '0038': 2160, '0040': 0, '0044': 1 }
  },
  {
    name: 'Ultrawide High',
    desc: '3440x1440 ultrawide with 2x oversample, all effects',
    tier: 'high',
    recommended: true,
    values: { '0001': 3440, '0002': 1440, '0003': 6880, '0004': 2880, '0034': 1, '0000': 6, '0017': 1, '0018': 2, '0019': 1, '0011': 2, '0007': 1, '0029': 20, '0028': 0, '0030': 0, '0035': 1, '0036': 2, '0037': 3440, '0038': 1440, '0040': 0, '0044': 1 }
  },
  {
    name: 'Super Ultrawide High',
    desc: '5120x1440 super ultrawide with 2x oversample, all effects',
    tier: 'high',
    recommended: true,
    values: { '0001': 5120, '0002': 1440, '0003': 10240, '0004': 2880, '0034': 1, '0000': 6, '0017': 1, '0018': 2, '0019': 1, '0011': 2, '0007': 1, '0029': 20, '0028': 0, '0030': 0, '0035': 1, '0036': 2, '0037': 5120, '0038': 1440, '0040': 0, '0044': 1 }
  }
];

const FPS_DIVISOR_OPTIONS = [
  { value: '', label: 'Default (30 FPS)' },
  { value: '0', label: 'Uncapped' },
  { value: '1', label: '60 FPS (Divisor 1)' },
  { value: '2', label: '30 FPS (Divisor 2)' },
];

const DRAW_DISTANCE_OPTIONS = [
  { value: '0', label: 'Default (Game Default)' },
  { value: '5', label: '5 — Short' },
  { value: '10', label: '10 — Medium' },
  { value: '15', label: '15 — Far' },
  { value: '20', label: '20 — Maximum' },
];

// padmode000: 6 comma-separated booleans
// [0] Enable Gamepad, [1] Force Feedback, [2] Sliders, [3] Hat Switches, [4] When Inactive, [5] XInput
const PADMODE_LABELS = ['Enable Gamepad', 'Force Feedback', 'Sliders', 'Hat Switches', 'Active When Unfocused', 'XInput'];
const PADMODE_HINTS = [
  'Enable or disable gamepad input entirely',
  'Enable controller vibration/rumble',
  'Enable slider controls on the gamepad',
  'Enable hat switch (D-pad) controls',
  'Allow the gamepad to work when FFXI is not the active window',
  'Use XInput mode (recommended for Xbox controllers) instead of DirectInput'
];

// padsin000: 27 comma-separated button IDs
const PADSIN_ACTIONS = [
  'Auto-Run', 'CTRL Macro Bar', 'First/Third Person', 'ALT Macro Bar',
  'Heal / Lock Target', 'Cancel', 'Main Menu', 'Confirm',
  'Active Window', 'Toggle UI', 'Menu Nav (hold)', 'Camera (hold)',
  'Logout', 'Move Up', 'Move Down', 'Move Left', 'Move Right',
  'Camera Up', 'Camera Down', 'Camera Left', 'Camera Right',
  'Menu Up (targeting)', 'Menu Down (targeting)', 'Menu Left (targeting)',
  'Menu Right (targeting)', 'Screenshot', 'Toggle Controls'
];

const PADSIN_GROUPS = [
  { name: 'Movement', indices: [13, 14, 15, 16, 0] },
  { name: 'Camera', indices: [17, 18, 19, 20, 2, 11] },
  { name: 'Menu / UI', indices: [7, 5, 6, 9, 10, 8, 12] },
  { name: 'Menu / Targeting', indices: [21, 22, 23, 24] },
  { name: 'Combat', indices: [4, 1, 3] },
  { name: 'Other', indices: [25, 26] },
];

const XINPUT_BUTTONS = [
  { id: 0, label: 'B' }, { id: 1, label: 'X' }, { id: 2, label: 'Y' }, { id: 3, label: 'A' },
  { id: 4, label: 'D-Pad Right' }, { id: 5, label: 'D-Pad Left' }, { id: 6, label: 'D-Pad Up' }, { id: 7, label: 'D-Pad Down' },
  { id: 8, label: 'LB (L1)' }, { id: 9, label: 'LT (L2)' }, { id: 10, label: 'L3' },
  { id: 11, label: 'RB (R1)' }, { id: 12, label: 'RT (R2)' }, { id: 13, label: 'R3' },
  { id: 14, label: 'Start' }, { id: 15, label: 'Back' },
  { id: 32, label: 'L Stick X' }, { id: 33, label: 'L Stick Y' },
  { id: 35, label: 'R Stick X' }, { id: 36, label: 'R Stick Y' },
  { id: -32, label: 'L Stick X (Rev)' }, { id: -33, label: 'L Stick Y (Rev)' },
  { id: -35, label: 'R Stick X (Rev)' }, { id: -36, label: 'R Stick Y (Rev)' },
  { id: -1, label: 'None' }
];

const DINPUT_BUTTONS = [
  { id: 0, label: 'Square' },
  { id: 1, label: 'Cross (X)' },
  { id: 2, label: 'Circle' },
  { id: 3, label: 'Triangle' },
  { id: 4, label: 'L1' },
  { id: 5, label: 'R1' },
  { id: 6, label: 'L2' },
  { id: 7, label: 'R2' },
  { id: 8, label: 'Select' },
  { id: 9, label: 'Start' },
  { id: 10, label: 'L3' },
  { id: 11, label: 'R3' },
  { id: 12, label: 'PS Button' },
  { id: 13, label: 'Touchpad' },
  { id: 14, label: 'Mute' },
  { id: 32, label: 'L Stick X' }, { id: 33, label: 'L Stick Y' },
  { id: 34, label: 'R Stick X' }, { id: 37, label: 'R Stick Y' },
  { id: 40, label: 'D-Pad X' }, { id: 41, label: 'D-Pad Y' },
  { id: -32, label: 'L Stick X (Rev)' }, { id: -33, label: 'L Stick Y (Rev)' },
  { id: -34, label: 'R Stick X (Rev)' }, { id: -37, label: 'R Stick Y (Rev)' },
  { id: -40, label: 'D-Pad X (Rev)' }, { id: -41, label: 'D-Pad Y (Rev)' },
  { id: -1, label: 'None' }
];

const DEFAULT_XINPUT_PADSIN = [
  13, 9, 10, 12, 2, 0, 14, 3, 15, -1, 8, 11, -1,
  33, 33, 32, 32, 36, 36, 35, 35, 6, 7, 5, 1, -1, 4
];

// Web Gamepad API to FFXI button ID mapping
const WEB_TO_XINPUT = { 0:3, 1:0, 2:1, 3:2, 4:8, 5:11, 6:9, 7:12, 8:15, 9:14, 10:10, 11:13, 12:6, 13:7, 14:5, 15:4 };
const WEB_AXIS_TO_XINPUT = { 0:32, 1:33, 2:35, 3:36 };
const WEB_AXIS_TO_DINPUT = { 0:32, 1:33, 2:34, 3:37 };

// Official-style gamepad config layout: maps rows to padsin indices
// btnIdx = standalone button setting, comboIdx = button combination setting (modifier + button)
const GAMEPAD_CONFIG_ROWS = [
  { label: 'Button Combination', btnIdx: 10, comboIdx: null },
  { label: 'Select / Confirm', btnIdx: 7, comboIdx: 4 },
  { label: 'Cancel', btnIdx: 5, comboIdx: 9 },
  { label: 'Active Window /\nWindow Options', btnIdx: 8, comboIdx: 24 },
  { label: 'Main Menu', btnIdx: 6, comboIdx: 12 },
  { label: 'Autorun', btnIdx: 0, comboIdx: 2 },
  { label: 'Heal / Rest', btnIdx: 4, comboIdx: null },
  { label: 'First/Third Person', btnIdx: 2, comboIdx: null },
  { label: 'Macro Palette (Ctrl)', btnIdx: 1, comboIdx: 25 },
  { label: 'Macro Palette (Alt)', btnIdx: 3, comboIdx: 26 },
];

// Directional control groups for sidebar expansion panels
const DIR_GROUPS = {
  Movement: { indices: [13, 14, 15, 16], labels: ['Up', 'Down', 'Left', 'Right'] },
  Camera: { indices: [11, 17, 18, 19, 20], labels: ['Camera (hold)', 'Up', 'Down', 'Left', 'Right'] },
  'Menu / Targeting': { indices: [21, 22, 23, 24], labels: ['Up', 'Down', 'Left', 'Right'] },
};

function GamepadTestModal({ onClose }) {
  const rafRef = useRef(null);
  const [gpState, setGpState] = useState(null);

  useEffect(() => {
    let active = true;
    const poll = () => {
      if (!active) return;
      const gp = navigator.getGamepads?.()[0];
      if (gp) {
        setGpState({
          id: gp.id,
          buttons: gp.buttons.map(b => ({ pressed: b.pressed, value: b.value })),
          axes: gp.axes.map(v => Math.round(v * 100) / 100),
        });
      } else {
        setGpState(null);
      }
      rafRef.current = requestAnimationFrame(poll);
    };
    rafRef.current = requestAnimationFrame(poll);
    return () => { active = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  // Standard gamepad button labels (Web Gamepad API order)
  const BTN_LABELS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Home'];

  return (
    <Modal onClose={onClose} ariaLabel="Gamepad Tester">
      <div className="gp-test-modal">
        <div className="gp-test-header">
          <h3>Gamepad Tester</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        {!gpState ? (
          <div className="gp-test-empty">
            <p>No gamepad detected</p>
            <p className="gp-test-hint">Press any button on your controller to connect it</p>
          </div>
        ) : (
          <>
            <div className="gp-test-id">{gpState.id}</div>

            <div className="gp-test-section">
              <div className="gp-test-section-title">Buttons</div>
              <div className="gp-test-buttons">
                {gpState.buttons.map((b, i) => (
                  <div key={i} className={`gp-test-button ${b.pressed ? 'pressed' : ''}`}>
                    <span className="gp-test-btn-label">{BTN_LABELS[i] || `B${i}`}</span>
                    {b.value > 0 && b.value < 1 && (
                      <span className="gp-test-btn-value">{(b.value * 100).toFixed(0)}%</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="gp-test-section">
              <div className="gp-test-section-title">Axes</div>
              <div className="gp-test-axes">
                {Array.from({ length: Math.ceil(gpState.axes.length / 2) }, (_, i) => {
                  const xIdx = i * 2;
                  const yIdx = i * 2 + 1;
                  const x = gpState.axes[xIdx] || 0;
                  const y = gpState.axes[yIdx] || 0;
                  const stickLabels = ['Left Stick', 'Right Stick'];
                  return (
                    <div key={i} className="gp-test-axis-group">
                      <div className="gp-test-axis-label">{stickLabels[i] || `Axis ${xIdx}-${yIdx}`}</div>
                      <div className="gp-test-axis-visual">
                        <div className="gp-test-axis-crosshair" />
                        <div
                          className="gp-test-axis-dot"
                          style={{ left: `${50 + x * 45}%`, top: `${50 + y * 45}%` }}
                        />
                      </div>
                      <div className="gp-test-axis-values">
                        X: {x.toFixed(2)} &nbsp; Y: {y.toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function SettingsTab({ config, onSettingsSaved, onDirtyChange }) {
  const [regValues, setRegValues] = useState({});
  const [iniValues, setIniValues] = useState({});
  const [pendingWrites, setPendingWrites] = useState({});
  const [loading, setLoading] = useState(true);
  const [applyStatus, setApplyStatus] = useState('');
  const [applyMessage, setApplyMessage] = useState('');
  const [gpuInfo, setGpuInfo] = useState(null);
  const [gpuDetecting, setGpuDetecting] = useState(false);
  const [noProfile, setNoProfile] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const [drawMob, setDrawMob] = useState('0');
  const [drawWorld, setDrawWorld] = useState('0');
  const [drawPending, setDrawPending] = useState(false);
  const [fpsDivisor, setFpsDivisor] = useState('');
  const [fpsShow, setFpsShow] = useState(false);
  const [fpsPending, setFpsPending] = useState(false);
  const [disableEnumeration, setDisableEnumeration] = useState(false);
  const [disableEnumPending, setDisableEnumPending] = useState(false);
  const [capturingIndex, setCapturingIndex] = useState(null);
  const captureRef = useRef(null);
  const captureTimeoutRef = useRef(null);
  const prevGamepadState = useRef(null);
  // Track all fire-and-forget setTimeouts so we can cancel them on unmount and
  // avoid setState-after-unmount warnings from the auto-dismiss banners below.
  const pendingTimeoutsRef = useRef(new Set());
  const setAutoClearTimeout = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      pendingTimeoutsRef.current.delete(id);
      fn();
    }, ms);
    pendingTimeoutsRef.current.add(id);
    return id;
  }, []);
  useEffect(() => {
    return () => {
      pendingTimeoutsRef.current.forEach(clearTimeout);
      pendingTimeoutsRef.current.clear();
      if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
    };
  }, []);
  const [dirControlOpen, setDirControlOpen] = useState(null);
  const [gamepadTestOpen, setGamepadTestOpen] = useState(false);
  const gamepadTestRef = useRef(null);
  const [detectedControllers, setDetectedControllers] = useState([]);
  const [controllersLoading, setControllersLoading] = useState(false);

  // Load registry values (read-only baseline) and INI overrides
  const loadValues = useCallback(async () => {
    if (!api) return;
    setLoading(true);

    // Read registry baseline
    const regResult = await api.readRegistry();
    setRegValues(regResult.values || {});

    // Single profile read for all INI sections + script name
    if (config?.activeProfile && config?.ashitaPath) {
      const profile = await api.readProfile(config.ashitaPath, config.activeProfile);
      if (profile.exists) {
        setNoProfile(false);

        // Parse [ffxi.registry] overrides
        const regSection = getSection(profile.content, 'ffxi.registry');
        if (regSection) {
          const iniVals = {};
          for (const [key, raw] of Object.entries(regSection)) {
            if (key.startsWith('pad')) {
              iniVals[key] = raw;
            } else {
              const val = parseInt(raw, 10);
              if (!isNaN(val)) iniVals[key] = val;
            }
          }
          setIniValues(iniVals);
        }

        // Parse [ashita.input] for gamepad.disableenumeration
        const inputSection = getSection(profile.content, 'ashita.input');
        if (inputSection?.['gamepad.disableenumeration']) {
          setDisableEnumeration(parseInt(inputSection['gamepad.disableenumeration'], 10) === 1);
        }

        // Read boot script commands (draw distance, fps)
        try {
          const scriptName = getScriptName(profile.content);
          const scriptPath = `${config.ashitaPath}/scripts/${scriptName}`;
          const scriptResult = await api.readFile(scriptPath);
          if (scriptResult?.content) {
            for (const sl of scriptResult.content.split('\n')) {
              const mobMatch = sl.match(/\/drawdistance\s+(?:setm|setmob|setentity|sete)\s+(\d+)/i);
              if (mobMatch) setDrawMob(mobMatch[1]);
              const worldMatch = sl.match(/\/drawdistance\s+(?:setw|setworld)\s+(\d+)/i);
              if (worldMatch) setDrawWorld(worldMatch[1]);
              const fpsMatch = sl.match(/^\/fps\s+(\d+)\s*$/i);
              if (fpsMatch) setFpsDivisor(fpsMatch[1]);
              if (sl.trim() === '/fps show') setFpsShow(true);
            }
          }
        } catch {}
      } else {
        setNoProfile(true);
      }
    } else {
      setNoProfile(true);
    }

    setPendingWrites({});
    setDrawPending(false);
    setLoading(false);
  }, [config?.activeProfile, config?.ashitaPath]);

  useEffect(() => { loadValues(); }, [loadValues]);

  const loadControllers = useCallback(async () => {
    if (!api?.enumerateGameControllers) return;
    setControllersLoading(true);
    const result = await api.enumerateGameControllers();
    if (result.success) setDetectedControllers(result.devices);
    setControllersLoading(false);
  }, []);

  useEffect(() => { loadControllers(); }, [loadControllers]);
  useEffect(() => {
    if (api?.getMinimizeToTray) api.getMinimizeToTray().then(v => setMinimizeToTray(!!v));
  }, []);

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

  const getPadmode = () => {
    const raw = getValue('padmode000');
    if (!raw || raw === '-1') return [0, 0, 0, 0, 0, 0];
    return String(raw).split(',').map(v => parseInt(v.trim(), 10) || 0);
  };

  const setPadmodeFlag = (idx, val) => {
    const current = getPadmode();
    current[idx] = val ? 1 : 0;
    setPending('padmode000', current.join(','));
  };

  const getPadsin = () => {
    const raw = getValue('padsin000');
    if (!raw || raw === '-1') return Array(27).fill(-1);
    return String(raw).split(',').map(v => parseInt(v.trim(), 10));
  };

  const setPadsinButton = (idx, val) => {
    const current = getPadsin();
    current[idx] = val;
    setPending('padsin000', current.join(','));
  };

  const invertPadsinAxis = (upIdx, downIdx) => {
    const current = getPadsin();
    current[upIdx] = -current[upIdx];
    current[downIdx] = -current[downIdx];
    setPending('padsin000', current.join(','));
  };

  const isXInput = () => getPadmode()[5] === 1;
  const isXInputRef = useRef(isXInput);
  const setPadsinButtonRef = useRef(setPadsinButton);
  useEffect(() => { isXInputRef.current = isXInput; setPadsinButtonRef.current = setPadsinButton; });

  const applyDefaultPadsin = () => {
    setPending('padsin000', DEFAULT_XINPUT_PADSIN.join(','));
  };

  const startCapture = (idx) => {
    // Snapshot current gamepad state so we detect only NEW presses
    const gp = navigator.getGamepads?.()[0];
    if (gp) {
      prevGamepadState.current = {
        buttons: gp.buttons.map(b => b.pressed),
        axes: gp.axes.map(a => a),
      };
    } else {
      prevGamepadState.current = null;
    }
    setCapturingIndex(idx);
    captureRef.current = idx;
    // Auto-cancel capture after 10 seconds if no input detected
    if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
    captureTimeoutRef.current = setTimeout(() => {
      if (captureRef.current !== null) cancelCapture();
    }, 10000);
  };

  const cancelCapture = () => {
    setCapturingIndex(null);
    captureRef.current = null;
    prevGamepadState.current = null;
    if (captureTimeoutRef.current) { clearTimeout(captureTimeoutRef.current); captureTimeoutRef.current = null; }
  };

  // Gamepad polling effect for press-to-bind capture mode
  useEffect(() => {
    if (capturingIndex === null) return;
    let raf;
    const poll = () => {
      if (captureRef.current === null) return;
      const gp = navigator.getGamepads?.()[0];
      if (!gp) { raf = requestAnimationFrame(poll); return; }

      const xinput = isXInputRef.current();
      const axisMap = xinput ? WEB_AXIS_TO_XINPUT : WEB_AXIS_TO_DINPUT;
      const btnMap = xinput ? WEB_TO_XINPUT : null; // DirectInput: web button index = FFXI id

      // Check buttons
      for (let i = 0; i < gp.buttons.length; i++) {
        const wasPressed = prevGamepadState.current?.buttons?.[i] ?? false;
        if (gp.buttons[i].pressed && !wasPressed) {
          const ffxiId = btnMap ? (btnMap[i] ?? i) : i;
          setPadsinButtonRef.current(captureRef.current, ffxiId);
          cancelCapture();
          return;
        }
      }

      // Check axes (threshold 0.7)
      for (let i = 0; i < gp.axes.length; i++) {
        const prevVal = prevGamepadState.current?.axes?.[i] ?? 0;
        if (Math.abs(gp.axes[i]) > 0.7 && Math.abs(prevVal) < 0.5) {
          const ffxiId = axisMap[i];
          if (ffxiId !== undefined) {
            setPadsinButtonRef.current(captureRef.current, ffxiId);
            cancelCapture();
            return;
          }
        }
      }

      // Update prev state for continuous tracking
      prevGamepadState.current = {
        buttons: gp.buttons.map(b => b.pressed),
        axes: gp.axes.map(a => a),
      };
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line
  }, [capturingIndex]);

  const getButtonLabel = (id) => {
    const buttons = isXInput() ? XINPUT_BUTTONS : DINPUT_BUTTONS;
    const found = buttons.find(b => b.id === id);
    return found ? found.label : (id === -1 ? 'None' : `#${id}`);
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
      setAutoClearTimeout(() => { setApplyStatus(''); setApplyMessage(''); }, 8000);
      return;
    }

    setApplyStatus('saving');
    setApplyMessage('Writing to profile...');

    try {
      const profile = await api.readProfile(config.ashitaPath, config.activeProfile);
      if (!profile.exists) {
        setApplyStatus('error');
        setApplyMessage('Profile not found.');
        setAutoClearTimeout(() => { setApplyStatus(''); setApplyMessage(''); }, 8000);
        return;
      }

      // Build registry updates (skip blocked and internal keys)
      const regUpdates = {};
      let count = 0;
      for (const [key, value] of Object.entries(pendingWrites)) {
        if (INI_BLOCKED_KEYS.has(key) || key.startsWith('_')) continue;
        regUpdates[key] = String(value);
        count++;
      }

      // Apply registry updates to [ffxi.registry]
      let content = setSectionValues(profile.content, 'ffxi.registry', regUpdates);

      // Apply [ashita.input] gamepad.disableenumeration if changed
      if (disableEnumPending) {
        content = setSectionValues(content, 'ashita.input', {
          'gamepad.disableenumeration': disableEnumeration ? '1' : '0'
        });
      }

      await api.saveProfile(config.ashitaPath, config.activeProfile, content);

      // Ensure required addons are enabled in profile when their settings are used
      const requiredAddons = [];
      if (drawMob !== '0' || drawWorld !== '0') requiredAddons.push('drawdistance');
      if (fpsDivisor !== '') requiredAddons.push('fps');
      if (requiredAddons.length > 0) {
        const freshProfile = await api.readProfile(config.ashitaPath, config.activeProfile);
        if (freshProfile?.exists) {
          const pLines = freshProfile.content.split('\n');
          const addonsIdx = pLines.findIndex(l => l.trim() === '[ashita.addons]');
          if (addonsIdx !== -1) {
            let nextIdx = pLines.length;
            for (let i = addonsIdx + 1; i < pLines.length; i++) {
              if (pLines[i].trim().startsWith('[')) { nextIdx = i; break; }
            }
            const sectionLines = pLines.slice(addonsIdx + 1, nextIdx);
            const enabledNames = sectionLines.map(l => l.trim().replace(/\s*=\s*.*/, '').toLowerCase()).filter(Boolean);
            const toAdd = requiredAddons.filter(a => !enabledNames.includes(a));
            if (toAdd.length > 0) {
              pLines.splice(addonsIdx + 1, 0, ...toAdd.map(a => `${a} = 1`));
              await api.saveProfile(config.ashitaPath, config.activeProfile, pLines.join('\n'));
            }
          }
        }
      }

      // Sync addon commands to boot script (draw distance, fps)
      try {
        const profile2 = await api.readProfile(config.ashitaPath, config.activeProfile);
        const scriptName = getScriptName(profile2.content || profile.content);
        const scriptPath = `${config.ashitaPath}/scripts/${scriptName}`;
        const scriptResult = await api.readFile(scriptPath);
        if (scriptResult?.content) {
          let sLines = scriptResult.content.split('\n').filter(l =>
            !l.match(/\/drawdistance\s+(?:setm|setmob|setentity|sete|setw|setworld)/i) &&
            !l.match(/^\/fps\s+(?:\d+|show)\s*$/i)
          );
          const newCmds = [];
          if (drawMob !== '0') newCmds.push(`/drawdistance setm ${drawMob}`);
          if (drawWorld !== '0') newCmds.push(`/drawdistance setw ${drawWorld}`);
          if (fpsDivisor !== '') newCmds.push(`/fps ${fpsDivisor}`);
          if (fpsShow) newCmds.push('/fps show');
          if (newCmds.length > 0) {
            const waitIdx = sLines.reduce((last, l, i) => l.trim().startsWith('/wait') ? i : last, -1);
            if (waitIdx !== -1) sLines.splice(waitIdx + 1, 0, ...newCmds);
            else sLines.push(...newCmds);
          }
          await api.writeFile(scriptPath, sLines.join('\n'));
        }
      } catch (e) {
        console.error('Failed to update boot script:', e);
      }

      setApplyStatus('success');
      setApplyMessage(`${count} setting${count !== 1 ? 's' : ''} saved to profile "${config.activeProfile}". Takes effect next launch.`);
      await loadValues();
      if (onSettingsSaved) onSettingsSaved();
    } catch (e) {
      setApplyStatus('error');
      setApplyMessage(e.message || 'Failed to write profile.');
    }

    setAutoClearTimeout(() => { setApplyStatus(''); setApplyMessage(''); }, 8000);
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
    // Keep window size keys in sync to prevent dual-render issue
    setPending('0037', w);
    setPending('0038', h);
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

  useEffect(() => {
    if (onDirtyChange) onDirtyChange(pendingCount > 0);
  }, [pendingCount, onDirtyChange]);

  const screenW = getValue('0001');
  const screenH = getValue('0002');
  const bgW = getValue('0003');
  const bgH = getValue('0004');

  // Detect aspect ratio mismatch between screen and background resolution
  const screenRatio = screenH > 0 ? (screenW / screenH).toFixed(2) : 0;
  const bgRatio = bgH > 0 ? (bgW / bgH).toFixed(2) : 0;
  const aspectMismatch = screenH > 0 && bgH > 0 && Math.abs(screenRatio - bgRatio) > 0.05;

  if (loading) return (
    <div className="settings-tab settings-tab-loading">
      <div className="skeleton skeleton-row" style={{ width: '40%', height: 20 }} />
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-row" style={{ width: '30%', height: 20, marginTop: 16 }} />
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-row" style={{ width: '50%', height: 20, marginTop: 16 }} />
      <div className="skeleton skeleton-card" style={{ height: 80 }} />
    </div>
  );

  return (
    <div className="settings-tab">
      <div className="settings-header-bar panel">
        <div className="settings-header-left">
          <span className="mono settings-profile-label">
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

      <div className="settings-subnav">
        {[
          { id: 'section-graphics', label: 'Graphics' },
          { id: 'section-display', label: 'Display' },
          { id: 'section-performance', label: 'Performance' },
          { id: 'section-sound', label: 'Sound' },
          { id: 'section-controller', label: 'Controller' },
          { id: 'section-app', label: 'App' },
        ].map(nav => (
          <button
            key={nav.id}
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const el = document.getElementById(nav.id);
              const container = document.querySelector('.app-content');
              if (el && container) {
                const top = el.offsetTop - container.offsetTop - 60;
                container.scrollTo({ top, behavior: 'smooth' });
              }
            }}
          >
            {nav.label}
          </button>
        ))}
      </div>

      <div className="settings-warning panel">
        Settings are saved to your Ashita profile and take effect next time you launch the game. Set a value to -1 to use the default from FFXI Config / Windows registry.
      </div>

      {noProfile && (
        <div className="panel panel-error">
          <span className="panel-error-title">No active profile</span>
          <p className="panel-error-desc">
            Create a profile in the Profiles tab first. Settings are saved per-profile.
          </p>
        </div>
      )}

      {aspectMismatch && (
        <div className="panel panel-error">
          <span className="panel-error-title">Aspect Ratio Mismatch</span>
          <p className="panel-error-desc">
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
        <div className="panel settings-gpu-panel">
          <div className="settings-gpu-header">
            <span className="section-header settings-gpu-title">Detected GPU</span>
            <button className="btn btn-ghost btn-sm" onClick={detectGPU} disabled={gpuDetecting}>&#8635; Re-scan</button>
          </div>
          {gpuInfo.gpus?.map((gpu, i) => (
            <div key={i} className="settings-gpu-row">
              <span className="mono settings-gpu-name">{gpu.name}</span>
              <span className="pill pill-teal settings-pill-sm">{gpu.vram} MB VRAM</span>
            </div>
          ))}
          <p className="settings-gpu-recommendation">
            {gpuInfo.recommendation}
          </p>
        </div>
      )}

      <div className="section-header" id="section-graphics">Graphics Presets</div>
      <p className="settings-hint settings-hint-tight">Quick-apply a full configuration including resolution, graphics quality and sound settings.</p>
      <div className="presets-grid">
        {RECOMMENDED_PRESETS.map(preset => {
          const isActive = Object.entries(preset.values).every(([k, v]) => getValue(k) === v);
          return (
            <div key={preset.name} className={`preset-card panel ${isActive ? 'preset-active' : ''}`} onClick={() => applyPreset(preset)}>
              <div className="preset-card-header">
                <h3 className={`preset-name cinzel ${isActive ? 'gold' : ''}`}>{preset.name}</h3>
                {isActive && <span className="pill pill-gold settings-pill-sm">Active</span>}
              </div>
              <p className="preset-desc">{preset.desc}</p>
              <button className="btn btn-ghost btn-sm settings-preset-action">
                {isActive ? 'Selected' : 'Apply Preset'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="section-header" id="section-display">Screen (Overlay) Resolution</div>
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
          <input type="number" value={screenW} onChange={e => { const v = parseInt(e.target.value) || 0; setPending('0001', v); setPending('0037', v); }} className="settings-input-sm" />
          <span>x</span>
          <input type="number" value={screenH} onChange={e => { const v = parseInt(e.target.value) || 0; setPending('0002', v); setPending('0038', v); }} className="settings-input-sm" />
        </div>
      </div>

      <div className="section-header">Display Mode</div>
      <div className="panel">
        <p className="settings-hint">Controls how FFXI is displayed on your screen.</p>
        <div className="display-mode-row">
          {[
            { val: 0, label: 'Fullscreen', desc: 'Exclusive fullscreen — best performance but alt-tab can cause crashes without dgVoodoo2' },
            { val: 1, label: 'Windowed', desc: 'Runs in a window — most compatible, easy to alt-tab' },
            { val: 3, label: 'Borderless Windowed', desc: 'Borderless fullscreen window — easy alt-tab, no screen flash' },
          ].map(m => (
            <button
              key={m.val}
              className={`display-mode-btn ${getValue('0034') === m.val ? 'active' : ''}`}
              onClick={() => setPending('0034', m.val)}
            >
              <span className="display-mode-label">{m.label}</span>
              <span className="display-mode-desc">{m.desc}</span>
            </button>
          ))}
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
          <input type="number" value={bgW} onChange={e => setPending('0003', parseInt(e.target.value) || 0)} className="settings-input-sm" />
          <span>x</span>
          <input type="number" value={bgH} onChange={e => setPending('0004', parseInt(e.target.value) || 0)} className="settings-input-sm" />
        </div>
      </div>

      <div className="section-header">Graphics Quality</div>
      <div className="panel">
        <p className="settings-hint">Controls how FFXI renders textures and effects. Set to -1 to use the value from FFXI Config.</p>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Mip Mapping</span>
            <span className="setting-hint-inline">Reduces texture shimmer and flickering on distant surfaces (0=Off, 6=Best Quality)</span>
          </div>
          <select value={getValue('0000')} onChange={e => setPending('0000', parseInt(e.target.value))}>
            <option value={-1}>Default (FFXI Config)</option>
            <option value={0}>Off</option>
            <option value={1}>On - Lowest</option>
            <option value={2}>On - Low</option>
            <option value={3}>On - Medium</option>
            <option value={4}>On - High</option>
            <option value={5}>On - Very High</option>
            <option value={6}>On - Best Quality</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Texture Compression</span>
            <span className="setting-hint-inline">Controls texture quality — uncompressed is sharper but uses more VRAM</span>
          </div>
          <select value={getValue('0018')} onChange={e => setPending('0018', parseInt(e.target.value))}>
            <option value={-1}>Default (FFXI Config)</option>
            <option value={0}>High (Compressed)</option>
            <option value={1}>Low</option>
            <option value={2}>Uncompressed</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Bump Mapping</span>
            <span className="setting-hint-inline">Adds surface depth to walls, terrain and other textures</span>
          </div>
          <select value={getValue('0017')} onChange={e => setPending('0017', parseInt(e.target.value))}>
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
          <select value={getValue('0011')} onChange={e => setPending('0011', parseInt(e.target.value))}>
            <option value={-1}>Default (FFXI Config)</option>
            <option value={0}>Off</option>
            <option value={1}>Normal</option>
            <option value={2}>Smooth</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Texture Compression Level</span>
            <span className="setting-hint-inline">Secondary compression toggle — set to Uncompressed for best quality</span>
          </div>
          <select value={getValue('0019')} onChange={e => setPending('0019', parseInt(e.target.value))}>
            <option value={-1}>Default (FFXI Config)</option>
            <option value={0}>Compressed</option>
            <option value={1}>Uncompressed</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Font Compression</span>
            <span className="setting-hint-inline">Text rendering quality — High Quality gives the sharpest in-game text</span>
          </div>
          <select value={getValue('0036')} onChange={e => setPending('0036', parseInt(e.target.value))}>
            <option value={-1}>Default (FFXI Config)</option>
            <option value={0}>Compressed</option>
            <option value={1}>Uncompressed</option>
            <option value={2}>High Quality</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Gamma</span>
            <span className="setting-hint-inline">Adjusts overall screen brightness — increase if the game looks too dark</span>
          </div>
          <div className="setting-range-group">
            <input type="range" min={0} max={100} value={getValue('0028') === -1 ? 0 : getValue('0028')} onChange={e => setPending('0028', parseInt(e.target.value))} />
            <span className="mono settings-range-value">{getValue('0028') === -1 ? 'Default' : getValue('0028')}</span>
          </div>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Hardware Mouse</span>
            <span className="setting-hint-inline">Use hardware cursor instead of software-rendered — reduces mouse lag</span>
          </div>
          <select value={getValue('0021')} onChange={e => setPending('0021', parseInt(e.target.value))}>
            <option value={-1}>Default (FFXI Config)</option>
            <option value={0}>Off</option>
            <option value={1}>On</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Graphics Stabilization</span>
            <span className="setting-hint-inline">May help reduce visual glitches on some hardware</span>
          </div>
          <select value={getValue('0040')} onChange={e => setPending('0040', parseInt(e.target.value))}>
            <option value={-1}>Default (FFXI Config)</option>
            <option value={0}>Off</option>
            <option value={1}>On</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Maintain Aspect Ratio</span>
            <span className="setting-hint-inline">Keep the window aspect ratio when resizing</span>
          </div>
          <select value={getValue('0044')} onChange={e => setPending('0044', parseInt(e.target.value))}>
            <option value={-1}>Default (FFXI Config)</option>
            <option value={0}>Off</option>
            <option value={1}>On</option>
          </select>
        </div>
      </div>

      <div className="section-header" id="section-performance">Performance</div>
      <div className="section-header settings-subheader">Draw Distance</div>
      <div className="panel">
        <p className="settings-hint">Controls how far the game renders entities and terrain. Uses the <strong>drawdistance</strong> addon — it will be auto-enabled when you apply these settings. Higher values show more of the world but may impact performance in crowded zones.</p>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Entity / Mob Distance</span>
            <span className="setting-hint-inline">How far NPCs, players and monsters render</span>
          </div>
          <select value={drawMob} onChange={e => { setDrawMob(e.target.value); setDrawPending(true); setPendingWrites(p => ({ ...p, _drawdistance: true })); }}>
            {DRAW_DISTANCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">World / Terrain Distance</span>
            <span className="setting-hint-inline">How far terrain, buildings and objects render</span>
          </div>
          <select value={drawWorld} onChange={e => { setDrawWorld(e.target.value); setDrawPending(true); setPendingWrites(p => ({ ...p, _drawdistance: true })); }}>
            {DRAW_DISTANCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div className="section-header">Frame Rate</div>
      <div className="panel">
        <p className="settings-hint">Controls FFXI's frame rate divisor via the <strong>fps</strong> addon — it will be auto-enabled when you apply these settings. FFXI's engine ties game logic to frame rate, so 60 FPS makes movement and animations smoother but may cause minor timing quirks on some private servers.</p>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">FPS Divisor</span>
            <span className="setting-hint-inline">Sets the frame rate cap on launch</span>
          </div>
          <select value={fpsDivisor} onChange={e => { setFpsDivisor(e.target.value); setFpsPending(true); setPendingWrites(p => ({ ...p, _fps: true })); }}>
            {FPS_DIVISOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Show FPS Counter</span>
            <span className="setting-hint-inline">Display the FPS overlay on screen at launch</span>
          </div>
          <select value={fpsShow ? 'on' : 'off'} onChange={e => { setFpsShow(e.target.value === 'on'); setFpsPending(true); setPendingWrites(p => ({ ...p, _fps: true })); }}>
            <option value="off">Off</option>
            <option value="on">On</option>
          </select>
        </div>
      </div>

      <div className="section-header" id="section-sound">Audio</div>
      <div className="section-header settings-subheader">Sound Settings</div>
      <div className="panel">
        <p className="settings-hint">Controls FFXI's sound system. Disabling sound can improve performance on low-end hardware.</p>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Sound</span>
            <span className="setting-hint-inline">Master toggle for all in-game audio including music, SFX and ambient sounds</span>
          </div>
          <select value={getValue('0007')} onChange={e => setPending('0007', parseInt(e.target.value))}>
            <option value={-1}>Default (FFXI Config)</option>
            <option value={0}>Off</option>
            <option value={1}>On</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Max Simultaneous Sounds</span>
            <span className="setting-hint-inline">How many sound effects can play at the same time (12-20)</span>
          </div>
          <div className="setting-range-group">
            <input type="range" min={12} max={20} step={1} value={getValue('0029') === -1 ? 20 : getValue('0029')} onChange={e => setPending('0029', parseInt(e.target.value))} />
            <span className="mono settings-range-value">{getValue('0029') === -1 ? 'Default' : getValue('0029')}</span>
          </div>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Sound Always On</span>
            <span className="setting-hint-inline">Keep playing audio when the game is in the background</span>
          </div>
          <select value={getValue('0035')} onChange={e => setPending('0035', parseInt(e.target.value))}>
            <option value={-1}>Default (FFXI Config)</option>
            <option value={0}>Off</option>
            <option value={1}>On</option>
          </select>
        </div>
      </div>

      <div className="section-header" id="section-controller">Controller</div>
      <div className="panel">
        <p className="settings-hint">Configure gamepad settings. These are written to your Ashita profile and override FFXI's built-in gamepad config. Leave disabled if you play with keyboard and mouse.</p>

        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Disable Gamepad Enumeration</span>
            <span className="setting-hint-inline">Prevents Ashita from scanning for controllers — fixes micro-stutter when no gamepad is connected</span>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={disableEnumeration} onChange={e => {
              setDisableEnumeration(e.target.checked);
              setDisableEnumPending(true);
              setPendingWrites(p => ({ ...p, _disableEnum: true }));
            }} />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Enable Gamepad</span>
            <span className="setting-hint-inline">{PADMODE_HINTS[0]}</span>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={getPadmode()[0] === 1} onChange={e => setPadmodeFlag(0, e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
        {getPadmode()[0] === 1 && (
          <div className="setting-row setting-row-stack">
            <div className="setting-info">
              <span className="setting-name">Controller Device (GUID)</span>
              <span className="setting-hint-inline">Select which controller Ashita should use. Leave on "Auto-detect" to use the first controller found.</span>
            </div>
            <div className="gp-guid-controls">
              <div className="gp-guid-row">
                <select
                  className="gp-guid-select"
                  value={getValue('padguid000') || ''}
                  onChange={e => setPending('padguid000', e.target.value)}
                >
                  <option value="">Auto-detect (first found)</option>
                  {detectedControllers.map((c, i) => (
                    <option key={i} value={c.GUID}>{c.Name} — {c.GUID}</option>
                  ))}
                </select>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={loadControllers}
                  disabled={controllersLoading}
                  title="Re-scan for controllers"
                >
                  {controllersLoading ? '...' : '\u27F3'}
                </button>
              </div>
              <div className="gp-guid-row">
                <input
                  type="text"
                  className="gp-guid-input"
                  placeholder="{00000000-0000-0000-0000-000000000000}"
                  value={getValue('padguid000') || ''}
                  onChange={e => setPending('padguid000', e.target.value)}
                />
                {getValue('padguid000') && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPending('padguid000', '')}
                    title="Clear GUID (use auto-detect)"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {getPadmode()[0] === 1 && (
        <>
          <div className="section-header">Gamepad Configuration ({isXInput() ? 'XInput' : 'DirectInput'})</div>
          <div className="panel gp-config-panel">
            <p className="settings-hint settings-hint-compact">
              Click any capture box in the table below, then press a button on your controller to bind it. The "Button" column maps single presses. The "Button Combination" column maps modifier+button combos.
            </p>
            {capturingIndex !== null && (
              <div className="gp-capture-banner">
                Listening for controller input — press a button on your gamepad or{' '}
                <button className="btn-link" onClick={cancelCapture}>cancel</button>
                <span className="settings-capture-hint">(auto-cancels in 10s)</span>
              </div>
            )}

            <div className="gp-config-layout">
              {/* Left: Button mapping table */}
              <div className="gp-config-main">
                <table className="gp-table">
                  <thead>
                    <tr>
                      <th className="gp-th-label"></th>
                      <th className="gp-th-btn">Button Settings</th>
                      <th className="gp-th-combo">
                        <div>Button Combination</div>
                        <div>Settings</div>
                        <div className="gp-combo-sub">{getButtonLabel(getPadsin()[10]) !== 'None' ? getButtonLabel(getPadsin()[10]) + ' +' : 'Unassigned +'}</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {GAMEPAD_CONFIG_ROWS.map((row, i) => {
                      const buttons = isXInput() ? XINPUT_BUTTONS : DINPUT_BUTTONS;
                      const padsin = getPadsin();
                      return (
                        <tr key={i} className="gp-table-row">
                          <td className="gp-td-label">{row.label}</td>
                          <td className="gp-td-btn">
                            <div className="gp-btn-wrap">
                              <button
                                className={`gp-capture-box ${capturingIndex === row.btnIdx ? 'capturing' : ''}`}
                                onClick={() => capturingIndex === row.btnIdx ? cancelCapture() : startCapture(row.btnIdx)}
                                title="Click to bind — press a button on your controller"
                              >
                                {capturingIndex === row.btnIdx ? 'Press a button...' : getButtonLabel(padsin[row.btnIdx])}
                              </button>
                              <select
                                className="gp-fallback-select"
                                value={padsin[row.btnIdx]}
                                onChange={e => { setPadsinButton(row.btnIdx, parseInt(e.target.value)); cancelCapture(); }}
                              >
                                <option value={-1}>None</option>
                                {buttons.filter(b => b.id !== -1).map(b => (
                                  <option key={b.id} value={b.id}>{b.label}</option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="gp-td-combo">
                            {row.comboIdx !== null ? (
                              <div className="gp-btn-wrap">
                                <button
                                  className={`gp-capture-box ${capturingIndex === row.comboIdx ? 'capturing' : ''}`}
                                  onClick={() => capturingIndex === row.comboIdx ? cancelCapture() : startCapture(row.comboIdx)}
                                  title="Click to bind — press a button on your controller"
                                >
                                  {capturingIndex === row.comboIdx ? 'Press a button...' : getButtonLabel(padsin[row.comboIdx])}
                                </button>
                                <select
                                  className="gp-fallback-select"
                                  value={padsin[row.comboIdx]}
                                  onChange={e => { setPadsinButton(row.comboIdx, parseInt(e.target.value)); cancelCapture(); }}
                                >
                                  <option value={-1}>None</option>
                                  {buttons.filter(b => b.id !== -1).map(b => (
                                    <option key={b.id} value={b.id}>{b.label}</option>
                                  ))}
                                </select>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Right: Options sidebar */}
              <div className="gp-config-sidebar">
                <fieldset className="gp-fieldset">
                  <legend>Gamepad Options</legend>
                  {[
                    { idx: 2, label: 'Enable slider' },
                    { idx: 3, label: 'Enable hat switches' },
                    { idx: 1, label: 'Enable force feedback' },
                    { idx: 5, label: 'Enable XInput' },
                    { idx: 4, label: 'Enable gamepad when game is inactive' },
                  ].map(opt => (
                    <label key={opt.idx} className="gp-checkbox-label">
                      <input
                        type="checkbox"
                        checked={getPadmode()[opt.idx] === 1}
                        onChange={e => setPadmodeFlag(opt.idx, e.target.checked)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </fieldset>

                <fieldset className="gp-fieldset">
                  <legend>Directional Control Devices</legend>
                  {Object.keys(DIR_GROUPS).map(name => (
                    <button
                      key={name}
                      className={`gp-dir-btn ${dirControlOpen === name ? 'active' : ''}`}
                      onClick={() => setDirControlOpen(dirControlOpen === name ? null : name)}
                    >
                      {name}
                    </button>
                  ))}
                </fieldset>

                <button
                  className="gp-dir-btn gp-test-btn"
                  onClick={() => setGamepadTestOpen(true)}
                >
                  Test Gamepad (T)
                </button>
              </div>
            </div>

            {/* Directional control expansion panel */}
            {dirControlOpen && (
              <div className="gp-dir-panel">
                <div className="gp-dir-panel-header">{dirControlOpen} Controls</div>
                <div className="gp-dir-grid">
                  {DIR_GROUPS[dirControlOpen].indices.map((idx, i) => {
                    const buttons = isXInput() ? XINPUT_BUTTONS : DINPUT_BUTTONS;
                    const padsin = getPadsin();
                    return (
                      <div key={idx} className="gp-dir-row">
                        <span className="gp-dir-label">{DIR_GROUPS[dirControlOpen].labels[i]}</span>
                        <div className="gp-btn-wrap">
                          <button
                            className={`gp-capture-box ${capturingIndex === idx ? 'capturing' : ''}`}
                            onClick={() => capturingIndex === idx ? cancelCapture() : startCapture(idx)}
                            title="Click to bind — press a button on your controller"
                          >
                            {capturingIndex === idx ? 'Press a button...' : getButtonLabel(padsin[idx])}
                          </button>
                          <select
                            className="gp-fallback-select"
                            value={padsin[idx]}
                            onChange={e => { setPadsinButton(idx, parseInt(e.target.value)); cancelCapture(); }}
                          >
                            <option value={-1}>None</option>
                            {buttons.filter(b => b.id !== -1).map(b => (
                              <option key={b.id} value={b.id}>{b.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {(dirControlOpen === 'Movement' || dirControlOpen === 'Camera') && (() => {
                  const padsin = getPadsin();
                  const upIdx = dirControlOpen === 'Movement' ? 13 : 17;
                  const downIdx = dirControlOpen === 'Movement' ? 14 : 18;
                  const upVal = padsin[upIdx] || 0;
                  const downVal = padsin[downIdx] || 0;
                  const isAxisBound = upVal !== -1 && upVal !== 0 && downVal !== -1 && downVal !== 0;
                  const isInverted = isAxisBound && (upVal < -1 || downVal < -1);
                  return (
                    <label className="gp-invert-toggle">
                      <input
                        type="checkbox"
                        checked={isInverted}
                        disabled={!isAxisBound}
                        onChange={() => invertPadsinAxis(upIdx, downIdx)}
                      />
                      <span>Invert Y-Axis</span>
                      {!isAxisBound && <span className="setting-hint-inline">Bind Up/Down to an axis first</span>}
                    </label>
                  );
                })()}
              </div>
            )}

            {/* Predefined Setups */}
            <div className="gp-presets">
              <span className="gp-presets-label">Predefined Setups</span>
              <div className="gp-presets-buttons">
                {isXInput() && (
                  <button className="gp-preset-btn" onClick={applyDefaultPadsin}>XInput (F)</button>
                )}
                <button className="gp-preset-btn" onClick={() => setPending('padsin000', Array(27).fill(-1).join(','))}>
                  Clear All
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="section-header" id="section-app">Miscellaneous</div>
      <div className="panel">
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Opening Movie</span>
            <span className="setting-hint-inline">Show the intro cinematic when launching the game</span>
          </div>
          <select value={getValue('0022')} onChange={e => setPending('0022', parseInt(e.target.value))}>
            <option value={-1}>Default (FFXI Config)</option>
            <option value={0}>Off</option>
            <option value={1}>On</option>
          </select>
        </div>
      </div>

      <div className="section-header">Launcher</div>
      <div className="section-header">Launcher Settings</div>
      <div className="panel">
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Minimize to System Tray</span>
            <span className="setting-hint-inline">Keep the launcher running in the background when you close the window</span>
          </div>
          <div className="toggle" onClick={() => {
            const next = !minimizeToTray;
            setMinimizeToTray(next);
            if (api?.setMinimizeToTray) api.setMinimizeToTray(next);
          }}>
            <input type="checkbox" checked={minimizeToTray} readOnly />
            <span className="toggle-slider" />
          </div>
        </div>
      </div>

      <div className="section-header">Backup &amp; Restore</div>
      <div className="panel">
        <p className="settings-hint settings-hint-compact">
          Back up your profiles, scripts, and addon settings to a ZIP file. Restore from a previous backup to recover your configuration.
        </p>
        <div className="settings-backup-actions">
          <button className="btn btn-primary" onClick={async () => {
            if (!api) return;
            const result = await api.backupAshitaConfig();
            if (result.success) setApplyMessage(result.message);
            else if (!result.cancelled) setApplyMessage(result.error);
          }}>↑ Backup Config</button>
          <button className="btn btn-ghost" onClick={async () => {
            if (!api) return;
            const result = await api.restoreAshitaConfig();
            if (result.success) setApplyMessage(result.message);
            else if (!result.cancelled) setApplyMessage(result.error);
          }}>↓ Restore from Backup</button>
        </div>
      </div>

      <div className="section-header">Ashita Logs</div>
      <div
        className="panel settings-logs-tile"
        onClick={() => { if (api && config?.ashitaPath) api.openExternal(config.ashitaPath + '\\logs'); }}
      >
        <div className="settings-logs-left">
          <span className="settings-logs-icon">▤</span>
          <div>
            <div className="settings-logs-title">Open Logs Folder</div>
            <div className="settings-logs-desc">View Ashita debug and error logs in Explorer</div>
          </div>
        </div>
        <span className="settings-logs-arrow">↗</span>
      </div>

      {(pendingCount > 0 || applyStatus) && (
        <div className="settings-sticky-bar">
          <div className="settings-sticky-info">
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
        <Modal onClose={() => setShowConfirm(false)}>
          <div className="settings-confirm-dialog">
            <h3 className="cinzel">Apply Settings to Profile?</h3>
            <p>This will write <strong>{pendingCount} setting{pendingCount !== 1 ? 's' : ''}</strong> to your Ashita profile <strong>"{config?.activeProfile}"</strong>. Changes take effect next launch.</p>
            <div className="settings-confirm-preview">
              {Object.entries(pendingWrites).filter(([k]) => !INI_BLOCKED_KEYS.has(k) && !k.startsWith('_')).map(([key, value]) => (
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
        </Modal>
      )}

      {gamepadTestOpen && <GamepadTestModal onClose={() => setGamepadTestOpen(false)} />}
    </div>
  );
}

export default SettingsTab;
