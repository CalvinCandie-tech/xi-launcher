# Auto-Updater — Design Spec

## Overview
Add automatic update checking and in-app update installation to XI Launcher. The launcher checks GitHub Releases for new versions, notifies the user via a Home tab banner, and can download + install updates without leaving the app. User data in `runtime/` is preserved.

## Update Check Flow
- On app launch, `main.js` calls `https://api.github.com/repos/CalvinCandie-tech/XI-Launcher/releases/latest`
- Compares the release tag (e.g. `v1.0.8`) against the current `package.json` version using semver comparison
- If newer and not in the skip list: sends update info to renderer — version, release notes, download URL
- If same, older, or skipped: does nothing
- Manual "Check for Updates" button on the Home tab triggers the same check (ignores skip list so the user can change their mind)
- Skipped versions stored in `runtime/launcher-prefs.json`

## Home Tab Banner UI
- A banner appears at the top of HomeTab when an update is available
- Shows: "**v1.0.8 available**" + first line of release notes as a summary
- Two buttons: **"Download & Install"** and **"Skip this version"**
- Small "X" to dismiss for now (comes back next launch unless skipped)
- When downloading: banner content is replaced with a progress bar + percentage
- When extracting/installing: shows "Installing..."
- When done: shows "Restarting..." briefly before the app relaunches
- On error: shows error message with "Retry" button
- Styled with existing design system — teal accent, gold version text

## Download & Install Flow
1. User clicks "Download & Install"
2. `main.js` downloads the zip asset from the GitHub release to `os.tmpdir()/xi-launcher-update/`
3. Extracts with `yauzl` (existing dependency)
4. Copies all files from extracted folder into the app directory, **skipping:**
   - `runtime/` — preserves all user data (Ashita, HD packs, configs, music, ReShade)
   - `node_modules/` — if present in zip
5. After copy completes: `app.relaunch()` then `app.exit()`
6. On any failure (network, extraction, copy): banner shows error + "Retry". Existing app is untouched since work happens in a temp folder.

## Skipped Versions
- Stored in `runtime/launcher-prefs.json`: `{ "skippedVersions": ["v1.0.8"] }`
- Auto-check on launch skips versions in this list
- Manual "Check for Updates" button ignores the skip list
- Each new version is independent — skipping v1.0.8 does not skip v1.0.9

## IPC Handlers (main.js)
| Handler | Description |
|---------|-------------|
| `check-for-update` | Hits GitHub API, compares versions, returns `{ available, version, notes, downloadUrl }` or `{ available: false }` |
| `download-and-install-update` | Downloads zip, extracts, copies (skipping runtime/), relaunches. Sends progress via `update-download-progress` channel |
| `skip-update-version` | Writes version string to `runtime/launcher-prefs.json` skip list |

## Preload Bridge (preload.js)
| Method | Maps to |
|--------|---------|
| `checkForUpdate()` | `invoke('check-for-update')` |
| `downloadAndInstallUpdate()` | `invoke('download-and-install-update')` |
| `onUpdateProgress(callback)` | `on('update-download-progress', callback)` — returns unsubscribe function |
| `skipUpdateVersion(version)` | `invoke('skip-update-version', version)` |

## HomeTab.js Changes
- New `UpdateBanner` div at the top of the Home tab (conditional, not a separate component)
- Calls `checkForUpdate()` on mount
- "Check for Updates" button near the existing version display
- States: hidden → available → downloading → installing → error

## Files Changed
- `electron/main.js` — new IPC handlers, GitHub API call, download/extract/copy logic
- `electron/preload.js` — new bridge methods
- `src/tabs/HomeTab.js` — update banner UI, check on mount, manual check button
- `src/tabs/HomeTab.css` — banner styles

## Out of Scope
- Downgrade support
- Beta/pre-release channels
- Delta updates (always full zip)
- Updating `runtime/` contents (that's a separate "addon updater" feature)
