# Addon Update Checker — Manual Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Check for Addon Updates" button to the Addons tab that bypasses the 24h cooldown, and fix the startup check filter so it actually finds addons with repos.

**Architecture:** Add a `force` parameter to the existing `check-addon-updates` IPC handler. Fix the broken `ADDON_CATALOGUE` filter in App.js (filters by `'Community'` category which doesn't exist — should filter by `a.repo` only). Add a callback from App.js to AddonsTab so the manual check can trigger the existing UpdateModal.

**Tech Stack:** Electron IPC, React state

---

### Task 1: Add `force` parameter to `check-addon-updates` IPC handler

**Files:**
- Modify: `electron/main.js:3057-3066`
- Modify: `electron/preload.js:124`

- [ ] **Step 1: Update the IPC handler to accept a `force` flag**

In `electron/main.js`, find the handler at line 3057:

```javascript
  ipcMain.handle('check-addon-updates', async (_, addonList) => {
    try {
      if (!store) return { updates: [] };

      // Enforce 24-hour cooldown
      const lastCheck = store.get('addonUpdateLastCheck', 0);
      const now = Date.now();
      if (now - lastCheck < 24 * 60 * 60 * 1000) {
        return { updates: [], skipped: true };
      }
```

Replace with:

```javascript
  ipcMain.handle('check-addon-updates', async (_, addonList, force) => {
    try {
      if (!store) return { updates: [] };

      // Enforce 24-hour cooldown (skip if force=true)
      if (!force) {
        const lastCheck = store.get('addonUpdateLastCheck', 0);
        const now = Date.now();
        if (now - lastCheck < 24 * 60 * 60 * 1000) {
          return { updates: [], skipped: true };
        }
      }
```

- [ ] **Step 2: Update the preload bridge to pass the force flag**

In `electron/preload.js`, find line 124:

```javascript
  checkAddonUpdates: (addonList) => ipcRenderer.invoke('check-addon-updates', addonList),
```

Replace with:

```javascript
  checkAddonUpdates: (addonList, force) => ipcRenderer.invoke('check-addon-updates', addonList, force),
```

- [ ] **Step 3: Commit**

```bash
git add electron/main.js electron/preload.js
git commit -m "feat(addons): add force parameter to check-addon-updates to bypass cooldown"
```

---

### Task 2: Fix the startup check filter and add manual check handler in App.js

**Files:**
- Modify: `src/App.js:180-189` (startup check effect)
- Modify: `src/App.js:525` (AddonsTab render)

- [ ] **Step 1: Fix the broken ADDON_CATALOGUE filter and add manual check handler**

In `src/App.js`, find the startup addon update check (around line 180):

```javascript
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
```

Replace with:

```javascript
  // Check for addon updates on startup
  useEffect(() => {
    if (!api?.checkAddonUpdates || !config?.ashitaPath) return;
    const repoAddons = ADDON_CATALOGUE.filter(a => a.repo);
    api.checkAddonUpdates(repoAddons).then(result => {
      if (result?.updates?.length > 0) {
        setAddonUpdates(result.updates);
      }
    });
  }, [config?.ashitaPath]);

  const handleManualAddonCheck = async () => {
    if (!api?.checkAddonUpdates) return { updates: [] };
    const repoAddons = ADDON_CATALOGUE.filter(a => a.repo);
    const result = await api.checkAddonUpdates(repoAddons, true);
    if (result?.updates?.length > 0) {
      setAddonUpdates(result.updates);
    }
    return result;
  };
```

- [ ] **Step 2: Pass the handler to AddonsTab**

Find the AddonsTab render line (around line 525):

```javascript
      case 'addons': return <AddonsTab {...tabProps} />;
```

Replace with:

```javascript
      case 'addons': return <AddonsTab {...tabProps} onCheckAddonUpdates={handleManualAddonCheck} />;
```

- [ ] **Step 3: Commit**

```bash
git add src/App.js
git commit -m "fix(addons): fix broken category filter, add manual addon update check handler"
```

---

### Task 3: Add "Check for Addon Updates" button to AddonsTab

**Files:**
- Modify: `src/tabs/AddonsTab.js:210` (function signature and top of component)
- Modify: `src/tabs/AddonsTab.css` (button styling)

- [ ] **Step 1: Update AddonsTab props and add state**

In `src/tabs/AddonsTab.js`, find the function signature at line 210:

```javascript
function AddonsTab({ config, updateConfig }) {
```

Replace with:

```javascript
function AddonsTab({ config, updateConfig, onCheckAddonUpdates }) {
```

Add these state variables after the existing state declarations inside the component (find the first `useState` calls and add after them):

```javascript
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [checkMsg, setCheckMsg] = useState('');
```

- [ ] **Step 2: Add the check handler function**

Add this function inside the component, after the state declarations:

```javascript
  const handleCheckUpdates = async () => {
    if (!onCheckAddonUpdates) return;
    setCheckingUpdates(true);
    setCheckMsg('');
    try {
      const result = await onCheckAddonUpdates();
      if (result?.updates?.length > 0) {
        setCheckMsg('');
      } else {
        setCheckMsg('All addons up to date');
        setTimeout(() => setCheckMsg(''), 3000);
      }
    } catch {
      setCheckMsg('Check failed');
      setTimeout(() => setCheckMsg(''), 3000);
    }
    setCheckingUpdates(false);
  };
```

- [ ] **Step 3: Add the button to the JSX**

Find the opening of the return JSX in AddonsTab. Look for the first element after `return (` — it should be a container div. Add the button right after the opening container, before any existing content. Find this pattern:

```javascript
    <div className="addons-tab">
```

Insert immediately after it:

```javascript
      <div className="addons-update-bar">
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleCheckUpdates}
          disabled={checkingUpdates}
        >
          {checkingUpdates ? 'Checking...' : checkMsg || 'Check for Addon Updates'}
        </button>
      </div>
```

- [ ] **Step 4: Add CSS for the button bar**

In `src/tabs/AddonsTab.css`, add at the end of the file:

```css
.addons-update-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
```

- [ ] **Step 5: Verify the app launches and the button renders**

Run: `npm start` — confirm:
- Button appears at top-right of Addons tab
- Clicking shows "Checking..." briefly
- Shows "All addons up to date" or triggers the UpdateModal

- [ ] **Step 6: Commit**

```bash
git add src/tabs/AddonsTab.js src/tabs/AddonsTab.css
git commit -m "feat(addons): add Check for Addon Updates button to Addons tab"
```
