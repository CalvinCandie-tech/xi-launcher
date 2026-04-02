# Controller Settings Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the controller settings tab match Ashita 4's padmode000/padsin000/padguid000 docs exactly, and add controller GUID selection UI.

**Architecture:** Update constants and button lists in SettingsTab.js for correct labels and reversed axis support, add a new IPC handler in main.js for enumerating game controllers via PowerShell, expose it through preload.js, and add GUID selection UI in the controller panel.

**Tech Stack:** React, Electron IPC, PowerShell (Win32_PnPEntity WMI), CSS

**Spec:** `docs/superpowers/specs/2026-04-02-controller-settings-enhancement-design.md`

---

### Task 1: Fix PADSIN_ACTIONS labels and PADSIN_GROUPS

**Files:**
- Modify: `src/tabs/SettingsTab.js:193-209`

- [ ] **Step 1: Update PADSIN_ACTIONS array**

Replace lines 193-201 in `src/tabs/SettingsTab.js`:

```js
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
```

- [ ] **Step 2: Update PADSIN_GROUPS**

Replace lines 204-209:

```js
const PADSIN_GROUPS = [
  { name: 'Movement', indices: [13, 14, 15, 16, 0] },
  { name: 'Camera', indices: [17, 18, 19, 20, 2, 11] },
  { name: 'Menu / UI', indices: [7, 5, 6, 9, 10, 8, 12] },
  { name: 'Menu / Targeting', indices: [21, 22, 23, 24] },
  { name: 'Combat', indices: [4, 1, 3] },
  { name: 'Other', indices: [25, 26] },
];
```

- [ ] **Step 3: Run the app and verify**

Run: `npm start`
- Open Settings tab > Controller section
- Enable gamepad, verify the button mapping table shows corrected action names
- Verify PADSIN_GROUPS display correctly in any grouped views

- [ ] **Step 4: Commit**

```bash
git add src/tabs/SettingsTab.js
git commit -m "fix: correct PADSIN_ACTIONS labels and groups to match Ashita 4 docs"
```

---

### Task 2: Fix DINPUT_BUTTONS with PS-style labels

**Files:**
- Modify: `src/tabs/SettingsTab.js:222-229`

- [ ] **Step 1: Replace DINPUT_BUTTONS array**

Replace lines 222-229 in `src/tabs/SettingsTab.js`:

```js
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
  { id: -1, label: 'None' }
];
```

- [ ] **Step 2: Verify in UI**

Run: `npm start`
- Open Settings > Controller, enable gamepad
- Toggle XInput OFF in Gamepad Options sidebar
- Verify dropdowns now show "Square", "Cross (X)", "Circle", etc. instead of "Button 1", "Button 2", etc.

- [ ] **Step 3: Commit**

```bash
git add src/tabs/SettingsTab.js
git commit -m "fix: use PS-style labels for DirectInput buttons per Ashita 4 docs"
```

---

### Task 3: Add reversed axis values to both button lists

**Files:**
- Modify: `src/tabs/SettingsTab.js:211-229`

- [ ] **Step 1: Add reversed axes to XINPUT_BUTTONS**

In `src/tabs/SettingsTab.js`, replace the XINPUT_BUTTONS array (lines 212-220). Insert the reversed axis entries before the `None` entry:

```js
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
```

- [ ] **Step 2: Add reversed axes to DINPUT_BUTTONS**

Append reversed entries before the `None` entry in DINPUT_BUTTONS (which was updated in Task 2):

```js
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
```

- [ ] **Step 3: Verify in UI**

Run: `npm start`
- Open Settings > Controller, enable gamepad
- Click any button mapping dropdown — verify reversed axis entries appear (e.g. "L Stick X (Rev)")
- Toggle between XInput and DirectInput modes — verify each shows the correct reversed entries

- [ ] **Step 4: Commit**

```bash
git add src/tabs/SettingsTab.js
git commit -m "feat: add reversed axis values to XInput and DirectInput button lists"
```

---

### Task 4: Add Menu/Targeting direction group to sidebar

**Files:**
- Modify: `src/tabs/SettingsTab.js:254-258`

- [ ] **Step 1: Update DIR_GROUPS**

Replace lines 254-258 in `src/tabs/SettingsTab.js`:

```js
const DIR_GROUPS = {
  Movement: { indices: [13, 14, 15, 16], labels: ['Up', 'Down', 'Left', 'Right'] },
  Camera: { indices: [11, 17, 18, 19, 20], labels: ['Camera (hold)', 'Up', 'Down', 'Left', 'Right'] },
  'Menu / Targeting': { indices: [21, 22, 23, 24], labels: ['Up', 'Down', 'Left', 'Right'] },
};
```

Note: Camera group no longer includes indices 21/22/23 (those were wrongly labeled as zoom/reset — they belong in Menu/Targeting).

- [ ] **Step 2: Verify in UI**

Run: `npm start`
- Open Settings > Controller, enable gamepad
- In the "Directional Control Devices" sidebar, verify three buttons: Movement, Camera, Menu / Targeting
- Click "Menu / Targeting" — verify it expands with Up/Down/Left/Right bindings for indices 21-24
- Click "Camera" — verify it no longer shows the old zoom/reset entries

- [ ] **Step 3: Commit**

```bash
git add src/tabs/SettingsTab.js
git commit -m "feat: add Menu/Targeting direction group, fix Camera group indices"
```

---

### Task 5: Add enumerate-game-controllers IPC handler

**Files:**
- Modify: `electron/main.js` (append after last `ipcMain.handle` around line 2494)
- Modify: `electron/preload.js:3-153`

- [ ] **Step 1: Add IPC handler in main.js**

Add after the last `ipcMain.handle` block (after line 2494) in `electron/main.js`:

```js

  // Enumerate game controllers (DirectInput GUIDs)
  ipcMain.handle('enumerate-game-controllers', async () => {
    try {
      const output = execSync(
        `powershell -Command "Get-PnpDevice -Class 'HIDClass','Media' -Status 'OK' -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'game|controller|gamepad|joystick|xbox|playstation|dualshock|dualsense|wireless controller' } | ForEach-Object { $instanceId = $_.InstanceId; $guidMatch = [regex]::Match($instanceId, '\\{[0-9A-Fa-f-]+\\}'); @{ Name = $_.FriendlyName; GUID = if ($guidMatch.Success) { $guidMatch.Value } else { '' }; InstanceId = $instanceId } } | ConvertTo-Json -Compress"`,
        { encoding: 'utf-8', timeout: 8000 }
      );
      const parsed = JSON.parse(output || '[]');
      const devices = Array.isArray(parsed) ? parsed : [parsed];
      return { success: true, devices: devices.filter(d => d.GUID) };
    } catch (e) {
      return { success: false, devices: [], error: e.message };
    }
  });
```

- [ ] **Step 2: Expose in preload.js**

In `electron/preload.js`, add before the closing `});` of `contextBridge.exposeInMainWorld` (before line 154):

```js

  // Game controller enumeration
  enumerateGameControllers: () => ipcRenderer.invoke('enumerate-game-controllers'),
```

- [ ] **Step 3: Test the IPC handler**

Run: `npm start`
Open DevTools (Ctrl+Shift+I), run in console:
```js
window.xiAPI.enumerateGameControllers().then(r => console.log(r))
```
Expected: `{ success: true, devices: [...] }` — if a controller is connected, the array has entries with `Name` and `GUID` fields. If no controller, `devices` is empty array.

- [ ] **Step 4: Commit**

```bash
git add electron/main.js electron/preload.js
git commit -m "feat: add IPC handler to enumerate game controllers with DirectInput GUIDs"
```

---

### Task 6: Add padguid000 UI in controller panel

**Files:**
- Modify: `src/tabs/SettingsTab.js:352-377` (state declarations) and `src/tabs/SettingsTab.js:1135-1164` (controller panel UI)
- Modify: `src/tabs/SettingsTab.css`

- [ ] **Step 1: Add state and loader for controllers**

In `src/tabs/SettingsTab.js`, add state declarations after line 376 (`const gamepadTestRef = useRef(null);`):

```js
  const [detectedControllers, setDetectedControllers] = useState([]);
  const [controllersLoading, setControllersLoading] = useState(false);
```

Add a load function after the `loadValues` function (after line 442, before the `useEffect` on line 444):

```js
  const loadControllers = useCallback(async () => {
    if (!api?.enumerateGameControllers) return;
    setControllersLoading(true);
    const result = await api.enumerateGameControllers();
    if (result.success) setDetectedControllers(result.devices);
    setControllersLoading(false);
  }, []);
```

Add a useEffect to call it on mount, right after the existing `useEffect(() => { loadValues(); }, [loadValues]);` on line 444:

```js
  useEffect(() => { loadControllers(); }, [loadControllers]);
```

- [ ] **Step 2: Add GUID selector UI**

In `src/tabs/SettingsTab.js`, insert the GUID selector UI after the "Enable Gamepad" toggle (after line 1163, before the closing `</div>` on line 1164). This should be inside the same panel, visible only when gamepad is enabled:

```jsx
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
                  {controllersLoading ? '...' : '⟳'}
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
```

- [ ] **Step 3: Add CSS for GUID controls**

In `src/tabs/SettingsTab.css`, add after the existing `.gp-preset-btn:hover` block (around line 630):

```css
/* Controller GUID selector */
.setting-row-stack {
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.gp-guid-controls {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gp-guid-row {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.gp-guid-select {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  background: var(--bg-elevated, #1a1a2e);
  border: 1px solid var(--border, #2a2a4a);
  color: var(--text, #e0e0e0);
  border-radius: 4px;
  font-size: 0.85rem;
}

.gp-guid-input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  background: var(--bg-elevated, #1a1a2e);
  border: 1px solid var(--border, #2a2a4a);
  color: var(--text, #e0e0e0);
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.85rem;
}

.gp-guid-input::placeholder {
  color: var(--text-muted, #666);
}
```

- [ ] **Step 4: Verify in UI**

Run: `npm start`
- Open Settings > Controller, enable gamepad
- Verify GUID section appears below "Enable Gamepad" toggle
- Verify dropdown shows "Auto-detect (first found)" as default
- Click refresh button — should scan for controllers
- If a controller is connected, verify it appears in dropdown
- Type a GUID in the manual input field — verify it syncs with dropdown
- Click "Clear" — verify field resets to empty
- Make a change, click Apply — verify padguid000 is written to profile

- [ ] **Step 5: Commit**

```bash
git add src/tabs/SettingsTab.js src/tabs/SettingsTab.css
git commit -m "feat: add padguid000 controller GUID selection UI with auto-detect"
```
