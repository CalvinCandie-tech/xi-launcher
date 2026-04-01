import React, { useState, useEffect, useCallback } from 'react';
import './AddonsTab.css';

const api = window.xiAPI;

export const ADDON_CATALOGUE = [
  // Built-in
  { name: 'aspect', description: 'Handles non-standard aspect ratios not available via in-game config', category: 'Built-in' },
  { name: 'autojoin', description: 'Auto-responds to party invites based on config rules', category: 'Built-in' },
  { name: 'autorespond', description: 'Auto-replies to tells with a configured message when enabled', category: 'Built-in' },
  { name: 'bgamelog', description: 'Battle log customization with emphasis on combat messages', category: 'Built-in' },
  { name: 'bluesets', description: 'UI for managing Blue Mage spell sets', category: 'Built-in' },
  { name: 'craftmon', description: 'Tracks crafting skill-ups and synthesis attempts', category: 'Built-in' },
  { name: 'debuffed', description: 'Shows debuffs applied to your current target mob', category: 'Built-in' },
  { name: 'enternity', description: 'Removes the need to press Enter during cutscenes and dialog', category: 'Built-in' },
  { name: 'equipmon', description: 'Displays currently equipped items on screen at all times', category: 'Built-in' },
  { name: 'find', description: 'Search for items across all of your storage containers', category: 'Built-in' },
  { name: 'fps', description: 'Shows and controls the in-game FPS cap', category: 'Built-in' },
  { name: 'hideconsole', description: 'Hides the boot loader console window', category: 'Built-in' },
  { name: 'ibar', description: 'Displays info about yourself and your current target', category: 'Built-in' },
  { name: 'itemwatch', description: 'Track and monitor items and key items on-screen', category: 'Built-in' },
  { name: 'links', description: 'Captures URLs from chat and lets you open them in a browser', category: 'Built-in' },
  { name: 'logs', description: 'Creates per-character dated log files of all incoming text', category: 'Built-in' },
  { name: 'lotomatic', description: 'Treasure pool manager — auto lot/pass items', category: 'Built-in' },
  { name: 'minimap', description: 'Adds a configurable minimap to your screen', category: 'Built-in' },
  { name: 'seekhelp', description: 'Alternative /sea interface with advanced filtering', category: 'Built-in' },
  { name: 'shorthand', description: 'Write shortcuts for casting spells, JAs, weapon skills', category: 'Built-in' },
  { name: 'stfu', description: 'Blocks spam system messages and converts annoying macro sounds', category: 'Built-in' },
  { name: 'timestamp', description: 'Adds timestamps to the chat log', category: 'Built-in' },
  { name: 'toybox', description: 'Collection of simple but very useful UI addons', category: 'Built-in' },
  // Community — with GitHub repo URLs for auto-download
  // --- Gear & Combat ---
  { name: 'LuAshitacast', description: 'The gear-swapping engine for Ashita v4 — write Lua scripts that automatically change your equipment based on spells, abilities, and events. Essential for endgame players.', category: 'Community', repo: 'ThornyFFXI/LuAshitacast' },
  { name: 'chains', description: 'Displays available skillchain paths and results based on your current weapons and party members. Helps plan and execute skillchains in real-time with an intuitive overlay.', category: 'Community', repo: 'loonsies/chains' },
  { name: 'ninjaTool', description: 'Monitors Ninja tool inventory and displays casting cooldowns in a wheel display. Helps you track tool consumption and recast timing.', category: 'Community', repo: 'm4thmatic/ninjaTool' },
  // --- UI Overhauls ---
  { name: 'HXUI', description: 'Complete HUD replacement — party list, player bars, target bar, exp tracker, and more in a clean modern layout. One of the most popular Ashita v4 addons.', category: 'Community', repo: 'tirem/XIUI' },
  { name: 'XIVBar', description: 'Clean HP/MP/TP bars inspired by FFXIV, displayed on screen at all times. Customizable colors, size, and position.', category: 'Community', repo: 'tirem/XIVBar' },
  { name: 'XivParty', description: 'Full party list overlay ported from Windower — shows HP, MP, TP, buffs, and debuffs for all party and alliance members.', category: 'Community', repo: 'tirem/XivParty' },
  { name: 'statustimers', description: 'Replaces the default tiny status icons with a fully customizable timer overlay. Shows buff/debuff durations for you and your party members with free placement.', category: 'Community', repo: 'HealsCodes/statustimers' },
  { name: 'tTimers', description: 'Displays time remaining on buffs and debuffs you\'ve cast, plus recast timers for your spells and abilities. Clean, movable overlay.', category: 'Community', repo: 'ThornyFFXI/tTimers' },
  // --- Hotbars & Controls ---
  { name: 'tHotBar', description: 'Adds a visual hotbar to your screen for binding macros and abilities to keyboard shortcuts. Drag-and-drop setup with customizable size and layout.', category: 'Community', repo: 'ThornyFFXI/tHotBar' },
  { name: 'tCrossBar', description: 'Controller-friendly crossbar UI inspired by FFXIV. Maps abilities to a gamepad with a clean on-screen display. Requires Ashita 4.15+.', category: 'Community', repo: 'ThornyFFXI/tCrossBar' },
  // --- Camera & Visuals ---
  { name: 'XICamera', description: 'Unlocks extended camera distance and zoom controls. Lets you zoom out further than the game normally allows for better battlefield awareness.', category: 'Community', repo: 'Hokuten85/XICamera' },
  { name: 'Cosplay', description: 'Copy the appearance of your current target — great for screenshots or just fun. Changes are client-side only.', category: 'Community', repo: 'tirem/Cosplay' },
  // --- Info & Overlays ---
  { name: 'balloon', description: 'Displays NPC dialog text in speech bubbles above their heads instead of just the chat log. Makes conversations and cutscenes much easier to follow.', category: 'Community', repo: 'onimitch/ffxi-balloon-ashitav4' },
  { name: 'TreasurePool', description: 'Shows the treasure pool in a movable, customizable window with lot/pass information and item details for everything your party has found.', category: 'Community', repo: 'ShiyoKozuki/TreasurePool' },
  { name: 'EquipViewer', description: 'Overlays your currently equipped items anywhere on screen in a translucent, movable window. See your gear at a glance without opening menus.', category: 'Community', repo: 'ProjectTako/EquipViewer' },
  { name: 'HitPoints', description: 'Shows HP percentage on your current target and engaged enemies. Useful for knowing exactly when to weaponskill or use abilities.', category: 'Community', repo: 'ThornyFFXI/HitPoints' },
  { name: 'FindAll', description: 'Loads all inventory data instantly on zone and enables cross-character item searching. Much faster than the built-in find addon.', category: 'Community', repo: 'ThornyFFXI/FindAll' },
  // --- Maps ---
  { name: 'boussole', description: 'In-game map replacement with pan, zoom, real-time party/alliance position tracking, custom map points, and custom PNG map support. Integrates with XIPivot.', category: 'Community', repo: 'loonsies/boussole' },
  // --- Trusts & Pets ---
  { name: 'FancyTrusts', description: 'Fancy trust management UI — browse, summon, and organize your trusts without memorizing names or writing macros.', category: 'Community', repo: 'ThornyFFXI/FancyTrusts' },
  // --- Utility ---
  { name: 'Audible', description: 'Plays custom audio alerts triggered by in-game events like spell casts, ability readies, and battle actions.', category: 'Community', repo: 'ThornyFFXI/Audible' },
  { name: 'castdelay', description: 'Blocks spells, ranged attacks, and item use until you stop moving — prevents wasted casts from input lag.', category: 'Community', repo: 'ThornyFFXI/castdelay' },
  { name: 'Emotes', description: 'Displays all available emotes in a browsable list so you don\'t need to remember the commands.', category: 'Community', repo: 'tirem/Emotes' }
];

const ADDON_BUNDLES = [
  {
    name: 'Solo Essentials',
    desc: 'Gear swaps, hotbar, camera, trusts, and all the QoL you need for solo play',
    addons: ['LuAshitacast', 'tHotBar', 'XICamera', 'HXUI', 'tTimers', 'balloon', 'FancyTrusts', 'FindAll', 'equipmon', 'fps', 'enternity', 'ibar']
  },
  {
    name: 'Party & Endgame',
    desc: 'Party list, skillchains, treasure pool, and target info for group content',
    addons: ['LuAshitacast', 'tHotBar', 'XivParty', 'chains', 'TreasurePool', 'HitPoints', 'tTimers', 'XICamera', 'balloon', 'debuffed', 'enternity']
  },
  {
    name: 'Crafting & Utility',
    desc: 'Crafting tracker, item search, loot management, and logging',
    addons: ['craftmon', 'FindAll', 'itemwatch', 'lotomatic', 'equipmon', 'fps', 'logs', 'timestamp', 'balloon', 'enternity']
  },
  {
    name: 'Controller Player',
    desc: 'Gamepad-friendly crossbar with FFXIV-style HUD overlays',
    addons: ['tCrossBar', 'LuAshitacast', 'HXUI', 'tTimers', 'XICamera', 'balloon', 'FancyTrusts', 'equipmon', 'fps', 'enternity']
  },
  {
    name: 'Full UI Overhaul',
    desc: 'Replace the default FFXI HUD with a modern, clean interface',
    addons: ['HXUI', 'XivParty', 'tTimers', 'tHotBar', 'XICamera', 'HitPoints', 'EquipViewer', 'balloon', 'enternity', 'fps']
  }
];

function AddonsTab({ config, updateConfig }) {
  const [installedAddons, setInstalledAddons] = useState([]);
  const [enabledAddons, setEnabledAddons] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [installing, setInstalling] = useState({});   // { addonName: { percent, detail } }
  const [installMsg, setInstallMsg] = useState(null);  // { addonName, success, text }
  const [batchInstalling, setBatchInstalling] = useState(false);

  const loadAddons = useCallback(async () => {
    if (!api) return;
    const result = await api.getAddons(config.ashitaPath);
    setInstalledAddons(result.addons.map(a => a.name.toLowerCase()));
  }, [config.ashitaPath]);

  const loadEnabledFromProfile = useCallback(async () => {
    if (!api || !config.activeProfile) {
      setEnabledAddons([]);
      return;
    }
    const result = await api.readProfile(config.ashitaPath, config.activeProfile);
    if (!result.exists) return;
    const lines = result.content.split('\n');
    const addonsIdx = lines.findIndex(l => l.trim() === '[ashita.addons]');
    if (addonsIdx === -1) return;
    const enabled = [];
    for (let i = addonsIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('[')) break;
      if (line) enabled.push(line.toLowerCase());
    }
    setEnabledAddons(enabled);
  }, [config.ashitaPath, config.activeProfile]);

  useEffect(() => { loadAddons(); }, [loadAddons]);
  useEffect(() => { loadEnabledFromProfile(); }, [loadEnabledFromProfile]);

  // Listen for addon install progress
  useEffect(() => {
    if (!api?.onAddonProgress) return;
    const unsub = api.onAddonProgress((addonName, percent, detail) => {
      setInstalling(prev => ({ ...prev, [addonName]: { percent, detail } }));
    });
    return unsub;
  }, []);

  const handleInstall = async (addon) => {
    if (!api || !addon.repo) return;
    setInstalling(prev => ({ ...prev, [addon.name]: { percent: 0, detail: 'Starting...' } }));
    setInstallMsg(null);
    const result = await api.installAddon(config.ashitaPath, addon.name, addon.repo, addon.subdir);
    setInstalling(prev => {
      const next = { ...prev };
      delete next[addon.name];
      return next;
    });
    if (result.success) {
      setInstallMsg({ addonName: addon.name, success: true, text: result.message });
      loadAddons(); // refresh installed list
    } else {
      setInstallMsg({ addonName: addon.name, success: false, text: result.error });
    }
    setTimeout(() => setInstallMsg(prev => prev?.addonName === addon.name ? null : prev), 5000);
  };

  const batchInstall = async (addonNames) => {
    if (!api || batchInstalling) return;
    setBatchInstalling(true);
    const communityAddons = ADDON_CATALOGUE.filter(a => a.category === 'Community' && a.repo && addonNames.map(n => n.toLowerCase()).includes(a.name.toLowerCase()));
    const toInstall = communityAddons.filter(a => !installedAddons.includes(a.name.toLowerCase()));
    for (const addon of toInstall) {
      await handleInstall(addon);
    }
    setBatchInstalling(false);
  };

  const applyBundle = async (bundle) => {
    // Install missing community addons
    const communityInBundle = bundle.addons.filter(name =>
      ADDON_CATALOGUE.find(a => a.name.toLowerCase() === name.toLowerCase() && a.category === 'Community')
    );
    const toInstall = communityInBundle.filter(name => !installedAddons.includes(name.toLowerCase()));
    if (toInstall.length > 0) {
      await batchInstall(toInstall);
    }
    // Enable all addons in the bundle
    const newEnabled = [...new Set([...enabledAddons, ...bundle.addons.map(a => a.toLowerCase())])];
    setEnabledAddons(newEnabled);
    await saveAddonsToProfile(newEnabled);
  };

  const installAllCommunity = async () => {
    const allCommunity = ADDON_CATALOGUE.filter(a => a.category === 'Community' && a.repo).map(a => a.name);
    await batchInstall(allCommunity);
  };

  const toggleAddon = async (addonName) => {
    if (!config.activeProfile) return;
    const lower = addonName.toLowerCase();
    const isEnabled = enabledAddons.includes(lower);
    const newEnabled = isEnabled
      ? enabledAddons.filter(a => a !== lower)
      : [...enabledAddons, lower];
    setEnabledAddons(newEnabled);
    try {
      await saveAddonsToProfile(newEnabled);
    } catch (e) {
      console.error('Failed to save addon toggle:', e);
    }
  };

  const setAll = async (enable) => {
    if (!config.activeProfile) return;
    const newEnabled = enable ? ADDON_CATALOGUE.map(a => a.name.toLowerCase()) : [];
    setEnabledAddons(newEnabled);
    await saveAddonsToProfile(newEnabled);
  };

  const saveAddonsToProfile = async (enabled) => {
    try {
      if (!config.activeProfile || !config.ashitaPath) return;
      const result = await api.readProfile(config.ashitaPath, config.activeProfile);
      if (!result.exists) return;
      const lines = result.content.split('\n');
      const addonsIdx = lines.findIndex(l => l.trim() === '[ashita.addons]');
      if (addonsIdx === -1) return;

      let nextSectionIdx = lines.length;
      for (let i = addonsIdx + 1; i < lines.length; i++) {
        if (lines[i].trim().startsWith('[')) { nextSectionIdx = i; break; }
      }

      const before = lines.slice(0, addonsIdx + 1);
      const after = lines.slice(nextSectionIdx);
      const addonLines = enabled.map(a => a);
      const newContent = [...before, ...addonLines, '', ...after].join('\n');
      await api.saveProfile(config.ashitaPath, config.activeProfile, newContent);
    } catch (e) {
      console.error('Failed to save addons to profile:', e);
    }
  };

  const filtered = ADDON_CATALOGUE.filter(a => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter === 'Built-in' && a.category !== 'Built-in') return false;
    if (categoryFilter === 'Community' && a.category !== 'Community') return false;
    if (categoryFilter === 'Installed' && !(a.category === 'Community' && installedAddons.includes(a.name.toLowerCase()))) return false;
    return true;
  });

  const builtinCount = ADDON_CATALOGUE.filter(a => a.category === 'Built-in').length;
  const communityCount = ADDON_CATALOGUE.filter(a => a.category === 'Community').length;
  const installedCount = ADDON_CATALOGUE.filter(a => a.category === 'Community' && installedAddons.includes(a.name.toLowerCase())).length;

  return (
    <div className="addons-tab">
      <div className="panel addons-toolbar">
        <div className="addons-toolbar-left">
          <span className="addons-enabled-count cinzel">{enabledAddons.length}</span>
          <div className="addons-toolbar-labels">
            <span style={{ color: 'var(--gold)', fontSize: 12 }}>Enabled</span>
            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{installedAddons.length} installed</span>
          </div>
          {!config.activeProfile && (
            <span className="pill pill-red" style={{ marginLeft: 12 }}>No profile selected</span>
          )}
          <div className="addons-filters">
            {['All', 'Built-in', 'Community', 'Installed'].map(cat => (
              <button
                key={cat}
                className={`addons-filter-pill ${categoryFilter === cat ? 'active' : ''}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat}
                <span className="addons-filter-count">
                  {cat === 'All' ? ADDON_CATALOGUE.length : cat === 'Built-in' ? builtinCount : cat === 'Community' ? communityCount : installedCount}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="addons-toolbar-right">
          <input
            type="text"
            placeholder="Search addons..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="addons-search"
          />
          <button className="btn btn-ghost btn-sm" onClick={loadAddons}>↻</button>
          <button className="btn btn-ghost btn-sm" onClick={installAllCommunity} disabled={batchInstalling}>
            {batchInstalling ? '◌ Installing...' : '↓ Install All'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setAll(false)}>Disable All</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setAll(true)}>Enable All</button>
        </div>
      </div>

      <div className="addons-bundles">
        <div className="section-header">Quick Setup Bundles</div>
        <div className="addons-bundles-grid">
          {ADDON_BUNDLES.map(bundle => (
            <div key={bundle.name} className="addon-bundle-card panel">
              <h4 className="cinzel" style={{ color: 'var(--gold)', fontSize: 14, marginBottom: 4 }}>{bundle.name}</h4>
              <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>{bundle.desc}</p>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {bundle.addons.join(', ')}
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => applyBundle(bundle)}
                disabled={batchInstalling || !config.activeProfile}
                style={{ width: '100%' }}
              >
                {batchInstalling ? '◌ Installing...' : 'Apply Bundle'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="addons-grid">
        {filtered.map(addon => {
          const isEnabled = enabledAddons.includes(addon.name.toLowerCase());
          const isInstalled = installedAddons.includes(addon.name.toLowerCase());
          return (
            <div key={addon.name} className={`addon-card ${isEnabled ? 'enabled' : ''}`}>
              <div className="addon-card-header">
                <span className="addon-name mono">{addon.name}</span>
                <div className="addon-tags">
                  <span className={`addon-category-tag ${addon.category.toLowerCase()}`}>{addon.category}</span>
                  {isInstalled && addon.category === 'Community' && <span className="addon-installed-tag">Installed</span>}
                </div>
              </div>
              <p className="addon-desc">{addon.description}</p>
              {installing[addon.name] && (
                <div className="addon-progress">
                  <div className="addon-progress-bar">
                    <div className="addon-progress-fill" style={{ width: `${installing[addon.name].percent}%` }} />
                  </div>
                  <span className="addon-progress-text">{installing[addon.name].detail}</span>
                </div>
              )}
              {installMsg?.addonName === addon.name && (
                <div className={`addon-install-msg ${installMsg.success ? 'success' : 'error'}`}>
                  {installMsg.text}
                </div>
              )}
              <div className="addon-card-footer">
                <div className="addon-card-footer-left">
                  <div className="toggle" onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleAddon(addon.name); }}>
                    <input type="checkbox" checked={isEnabled} readOnly />
                    <span className="toggle-slider" />
                  </div>
                  <span className="addon-status-label">{isEnabled ? 'Enabled' : 'Disabled'}</span>
                </div>
                {addon.category === 'Community' && addon.repo && !installing[addon.name] && (
                  <button
                    className={`btn btn-sm ${isInstalled ? 'btn-ghost' : 'btn-primary'}`}
                    onClick={() => handleInstall(addon)}
                  >
                    {isInstalled ? '↻ Update' : '↓ Install'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AddonsTab;
