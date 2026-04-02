import React, { useState, useEffect, useCallback, useRef } from 'react';
import Modal from '../components/Modal';
import './AddonsTab.css';

const api = window.xiAPI;

// Conflict groups — addons in the same group may conflict
const ADDON_CONFLICTS = {
  'hud-bars': { label: 'HUD / Player Bars', addons: ['HXUI', 'XIVBar', 'ibar'] },
  'hotbar': { label: 'Hotbar System', addons: ['tHotBar', 'tCrossBar'] },
  'party-list': { label: 'Party List', addons: ['XivParty', 'HXUI'] },
  'buff-timers': { label: 'Buff Timers', addons: ['statustimers', 'tTimers'] },
};

export const ADDON_CATALOGUE = [
  // --- QoL / General ---
  { name: 'enternity', description: 'Removes the need to press Enter during cutscenes and dialog', category: 'QoL / General' },
  { name: 'instantchat', description: 'Removes the delay from adding messages to the chat windows', category: 'QoL / General' },
  { name: 'instantah', description: 'Removes the delay from auction house interactions', category: 'QoL / General' },
  { name: 'macrofix', description: 'Removes the macro bar delay when pressing CTRL or ALT', category: 'QoL / General' },
  { name: 'quicksets', description: 'Removes the delay between equipping different equipment sets', category: 'QoL / General' },
  { name: 'fastswap', description: 'Fixes a state issue with the client when trying to swap jobs too fast', category: 'QoL / General' },
  { name: 'fps', description: 'Shows and controls the in-game FPS cap', category: 'QoL / General' },
  { name: 'clock', description: 'Allows the player to display various times on screen', category: 'QoL / General' },
  { name: 'hideconsole', description: 'Hides the boot loader console window', category: 'QoL / General' },
  { name: 'move', description: 'Window helper to adjust position, size, border, and more', category: 'QoL / General' },
  { name: 'cleancs', description: 'Hides Ashita rendered elements while in a cutscene', category: 'QoL / General' },
  { name: 'freemem', description: 'Memory cleanup utility', category: 'QoL / General' },
  { name: 'aspect', description: 'Handles non-standard aspect ratios not available via in-game config', category: 'QoL / General' },
  { name: 'stepdialog', description: 'Manually invoke the key press to continue the current chat dialog', category: 'QoL / General' },
  { name: 'nomad', description: 'Enables mog house functionality in any zone', category: 'QoL / General' },
  { name: 'toybox', description: 'Bundle of small UI tweaks — recast timers, inventory counts, giltracker, and more. Toggle each feature with /toybox.', category: 'QoL / General' },
  { name: 'castdelay', description: 'Blocks spells, ranged attacks, and item use until you stop moving — prevents wasted casts from input lag.', category: 'QoL / General', repo: 'ThornyFFXI/castdelay' },
  // --- Combat & Targeting ---
  { name: 'debuff', description: 'Enables cancelling status effects via a command', category: 'Combat & Targeting' },
  { name: 'debuffed', description: 'Shows debuffs applied to your current target mob', category: 'Combat & Targeting' },
  { name: 'distance', description: 'Displays the distance between you and your target', category: 'Combat & Targeting' },
  { name: 'recast', description: 'Displays ability and spell recast times', category: 'Combat & Targeting' },
  { name: 'tparty', description: 'Displays party member TP amounts and target health percent', category: 'Combat & Targeting' },
  { name: 'checker', description: 'Displays additional information when using /check on a monster', category: 'Combat & Targeting' },
  { name: 'nokb', description: 'Disables knockback effects applied to the local player', category: 'Combat & Targeting' },
  { name: 'paranormal', description: 'Enables using nearly any game command while dead/unconscious', category: 'Combat & Targeting' },
  { name: 'trimspells', description: 'Changes the CTRL+M shortcut spell list to be trimmed to known spells', category: 'Combat & Targeting' },
  { name: 'LuAshitacast', description: 'The gear-swapping engine for Ashita v4 — write Lua scripts that automatically change your equipment based on spells, abilities, and events. Essential for endgame players.', category: 'Combat & Targeting', repo: 'ThornyFFXI/LuAshitacast', useRelease: true, installAs: 'LuAshitacast' },
  { name: 'chains', description: 'Displays available skillchain paths and results based on your current weapons and party members. Helps plan and execute skillchains in real-time with an intuitive overlay.', category: 'Combat & Targeting', repo: 'loonsies/chains' },
  { name: 'ninjaTool', description: 'Monitors Ninja tool inventory and displays casting cooldowns in a wheel display. Helps you track tool consumption and recast timing.', category: 'Combat & Targeting', repo: 'm4thmatic/ninjaTool' },
  { name: 'HitPoints', description: 'Shows HP percentage on your current target and engaged enemies. Useful for knowing exactly when to weaponskill or use abilities.', category: 'Combat & Targeting', repo: 'ThornyFFXI/HitPoints', subdir: 'HitPoints', installAs: 'HitPoints', deps: ['gdifonts'], localDeps: { gdifonts: 'libs/gdifonts' } },
  { name: 'statustimers', description: 'Replaces the default tiny status icons with a fully customizable timer overlay. Shows buff/debuff durations for you and your party members with free placement.', category: 'Combat & Targeting', repo: 'HealsCodes/statustimers', useRelease: true, releaseFolder: 'statustimers', installAs: 'statustimers' },
  { name: 'tTimers', description: 'Displays time remaining on buffs and debuffs you\'ve cast, plus recast timers for your spells and abilities. Clean, movable overlay.', category: 'Combat & Targeting', repo: 'ThornyFFXI/tTimers', useRelease: true, installAs: 'tTimers' },
  // --- UI / HUD ---
  { name: 'ibar', description: 'Displays info about yourself and your current target', category: 'UI / HUD' },
  { name: 'equipmon', description: 'Displays currently equipped items on screen at all times', category: 'UI / HUD' },
  { name: 'invmon', description: 'Displays current inventory container space information', category: 'UI / HUD' },
  { name: 'crosshair', description: 'Draws position helper lines to move Ashita elements on screen', category: 'UI / HUD' },
  { name: 'hideparty', description: 'Slash commands to hide, show, or toggle the party frames', category: 'UI / HUD' },
  { name: 'hideui', description: 'Slash commands to hide, show, or toggle Ashita UI elements', category: 'UI / HUD' },
  { name: 'imguistyle', description: 'Allows per-character customizations to the ImGui style settings', category: 'UI / HUD' },
  { name: 'activemon', description: 'Displays an image on screen showing if the current client is focused', category: 'UI / HUD' },
  { name: 'clearcolor', description: 'Enables modding the background color of the scene', category: 'UI / HUD' },
  { name: 'HXUI', description: 'Complete HUD replacement — party list, player bars, target bar, exp tracker, and more in a clean modern layout. One of the most popular Ashita v4 addons.', category: 'UI / HUD', repo: 'tirem/XIUI', useRelease: true, releaseFolder: 'XIUI', installAs: 'XIUI' },
  { name: 'XIVBar', description: 'Clean HP/MP/TP bars inspired by FFXIV, displayed on screen at all times. Customizable colors, size, and position.', category: 'UI / HUD', repo: 'tirem/XIVBar', useRelease: true, releaseFolder: 'xivbar', installAs: 'xivbar' },
  { name: 'XivParty', description: 'Full party list overlay ported from Windower — shows HP, MP, TP, buffs, and debuffs for all party and alliance members.', category: 'UI / HUD', repo: 'tirem/XivParty', useRelease: true, releaseFolder: 'XivParty', installAs: 'XivParty' },
  { name: 'balloon', description: 'Displays NPC dialog text in speech bubbles above their heads instead of just the chat log. Makes conversations and cutscenes much easier to follow.', category: 'UI / HUD', repo: 'onimitch/ffxi-balloon-ashitav4', useRelease: true, installAs: 'Balloon', deps: ['gdifonts'], localDeps: { gdifonts: 'gdifonts' } },
  { name: 'TreasurePool', description: 'Shows the treasure pool in a movable, customizable window with lot/pass information and item details for everything your party has found.', category: 'UI / HUD', repo: 'ShiyoKozuki/TreasurePool' },
  { name: 'Emotes', description: 'Displays all available emotes in a browsable list so you don\'t need to remember the commands.', category: 'UI / HUD', repo: 'tirem/Emotes', subdir: 'Emotes', installAs: 'Emotes' },
  // --- Hotbars & Controls ---
  { name: 'tHotBar', description: 'Adds a visual hotbar to your screen for binding macros and abilities to keyboard shortcuts. Drag-and-drop setup with customizable size and layout.', category: 'Hotbars & Controls', repo: 'ThornyFFXI/tHotBar', useRelease: true, releaseFolder: 'thotbar', installAs: 'thotbar' },
  { name: 'tCrossBar', description: 'Controller-friendly crossbar UI inspired by FFXIV. Maps abilities to a gamepad with a clean on-screen display. Requires Ashita 4.15+.', category: 'Hotbars & Controls', repo: 'ThornyFFXI/tCrossBar', useRelease: true, installAs: 'tCrossBar' },
  // --- Chat & Social ---
  { name: 'chatmon', description: 'Plays sounds as a reaction to certain chat and other helpful events', category: 'Chat & Social' },
  { name: 'chatfix', description: 'Fixes private server chat issues related to a client update', category: 'Chat & Social' },
  { name: 'stfu', description: 'Blocks spam system messages and converts annoying macro sounds', category: 'Chat & Social' },
  { name: 'timestamp', description: 'Adds timestamps to the chat log', category: 'Chat & Social' },
  { name: 'logs', description: 'Creates per-character dated log files of all incoming text', category: 'Chat & Social' },
  { name: 'links', description: 'Captures URLs from chat and lets you open them in a browser', category: 'Chat & Social' },
  { name: 'onevent', description: 'Reacts to chat based events with customized commands', category: 'Chat & Social' },
  { name: 'filters', description: 'Allows saving and loading chat filter sets with ease', category: 'Chat & Social' },
  { name: 'filterless', description: 'Disables the bad language filter for private servers', category: 'Chat & Social' },
  { name: 'autorespond', description: 'Auto-replies to tells with a configured message when enabled', category: 'Chat & Social' },
  { name: 'autojoin', description: 'Auto-responds to party invites based on config rules', category: 'Chat & Social' },
  { name: 'bgamelog', description: 'Battle log customization with emphasis on combat messages', category: 'Chat & Social' },
  { name: 'tokens', description: 'Extends the parsable tokens in the chatlog', category: 'Chat & Social' },
  { name: 'cfhblock', description: 'Blocks call for help from working to prevent accidents', category: 'Chat & Social' },
  { name: 'Audible', description: 'Plays custom audio alerts triggered by in-game events like spell casts, ability readies, and battle actions.', category: 'Chat & Social', repo: 'ThornyFFXI/Audible' },
  // --- Maps & Navigation ---
  { name: 'allmaps', description: 'See every map via /map without needing the key items, including waypoints', category: 'Maps & Navigation' },
  { name: 'cartographer', description: 'See every map in the map menus when viewing non-current zone maps', category: 'Maps & Navigation' },
  { name: 'minimap', description: 'Adds a configurable minimap to your screen', category: 'Maps & Navigation' },
  { name: 'minimapmon', description: 'Hides the Minimap plugin under certain conditions like standing still', category: 'Maps & Navigation' },
  { name: 'mapdot', description: 'Enables seeing enemies on the compass on all jobs', category: 'Maps & Navigation' },
  { name: 'drawdistance', description: 'Slash commands to alter the game scene rendering distances', category: 'Maps & Navigation' },
  { name: 'mipmap', description: 'Removes the recent SE patch that altered mipmap configuration', category: 'Maps & Navigation' },
  { name: 'boussole', description: 'In-game map replacement with pan, zoom, real-time party/alliance position tracking, custom map points, and custom PNG map support. Integrates with XIPivot.', category: 'Maps & Navigation', repo: 'loonsies/boussole' },
  // --- Blue Mage ---
  { name: 'bluesets', description: 'UI for managing Blue Mage spell sets', category: 'Blue Mage' },
  { name: 'blucheck', description: 'Helper addon to track learned BLU spells with an in-game UI', category: 'Blue Mage' },
  { name: 'blumon', description: 'Monitors for learnt Blue Mage spells and announces them with color', category: 'Blue Mage' },
  // --- Crafting & Economy ---
  { name: 'craftmon', description: 'Tracks crafting skill-ups and synthesis attempts', category: 'Crafting & Economy' },
  { name: 'ahcolors', description: 'Changes the auction house listing colors to be easier to see', category: 'Crafting & Economy' },
  { name: 'ahgo', description: 'Enables opening the AH from anywhere and moving with it open', category: 'Crafting & Economy' },
  { name: 'itemwatch', description: 'Track and monitor items and key items on-screen', category: 'Crafting & Economy' },
  { name: 'lotomatic', description: 'Treasure pool manager — auto lot/pass items', category: 'Crafting & Economy' },
  // --- Search & Scan ---
  { name: 'find', description: 'Search for items across all of your storage containers', category: 'Search & Scan' },
  { name: 'filterscan', description: 'Allows filtering widescan results for specific entities', category: 'Search & Scan' },
  { name: 'watchdog', description: 'Enables widescan tracking of nearly anything with a command', category: 'Search & Scan' },
  { name: 'seekhelp', description: 'Alternative /sea interface with advanced filtering', category: 'Search & Scan' },
  // --- Trusts & Pets ---
  { name: 'petinfo', description: 'Displays information about the player pet', category: 'Trusts & Pets' },
  { name: 'FancyTrusts', description: 'Fancy trust management UI — browse, summon, and organize your trusts without memorizing names or writing macros.', category: 'Trusts & Pets', repo: 'ThornyFFXI/FancyTrusts', subdir: 'FancyTrusts', installAs: 'FancyTrusts' },
  // --- Cosmetic & Fun ---
  { name: 'Cosplay', description: 'Copy the appearance of your current target — great for screenshots or just fun. Changes are client-side only.', category: 'Cosmetic & Fun', repo: 'tirem/Cosplay', subdir: 'Cosplay', installAs: 'Cosplay' },
  { name: 'chamcham', description: 'Enables coloring models based on their entity type', category: 'Cosmetic & Fun' },
  { name: 'casper', description: 'Remove collision with other players — walk through them like a ghost', category: 'Cosmetic & Fun' },
  { name: 'gateway', description: 'Forces all doors to always be open', category: 'Cosmetic & Fun' },
  { name: 'namecolors', description: 'Enables editing the game name color table', category: 'Cosmetic & Fun' },
  { name: 'noname', description: 'Removes the local player name', category: 'Cosmetic & Fun' },
  { name: 'peekaboo', description: 'Forces all entities the client obtains data for to be visible', category: 'Cosmetic & Fun' },
  { name: 'renamer', description: 'Renames entities with overrides', category: 'Cosmetic & Fun' },
  { name: 'sexchange', description: 'Allows changing the player race and hair style with commands', category: 'Cosmetic & Fun' },
  { name: 'singlerace', description: 'Changes all player and NPC models to a single race/hair style', category: 'Cosmetic & Fun' },
  { name: 'skeletonkey', description: 'Enables the ability to force closed doors open', category: 'Cosmetic & Fun' },
  { name: 'truesight', description: 'Removes entity occlusion and makes invisible players half-transparent', category: 'Cosmetic & Fun' },
  { name: 'changecall', description: 'Replaces all call commands with the selected call ID instead', category: 'Cosmetic & Fun' },
  { name: 'chime', description: 'Play in-game chime based sound effects from a slash command', category: 'Cosmetic & Fun' },
  // --- Automation & Scripting ---
  { name: 'autologin', description: 'Automatically logs into a desired character slot', category: 'Automation & Scripting' },
  { name: 'logincmd', description: 'Executes a per-character script when logging in or switching characters', category: 'Automation & Scripting' },
  { name: 'repeater', description: 'Allows setting a command to be repeated automatically', category: 'Automation & Scripting' },
  { name: 'shorthand', description: 'Write shortcuts for casting spells, JAs, weapon skills', category: 'Automation & Scripting' },
  { name: 'config', description: 'Enables slash commands to force-set game settings directly', category: 'Automation & Scripting' },
  { name: 'actionparse', description: 'Parses and displays incoming action packet information', category: 'Automation & Scripting' },
  { name: 'affinity', description: 'Allows setting the current process affinity mask in-game', category: 'Automation & Scripting' },
  { name: 'hideobs', description: 'Hides the game window from OBS display stream capturing', category: 'Automation & Scripting' },
  { name: 'ime', description: 'Allows non-Japanese clients to use the Japanese IME and character sets', category: 'Automation & Scripting' },
  // --- Libraries (auto-installed as dependencies, hidden from grid) ---
  { name: 'gdifonts', description: 'Font rendering library required by balloon and other addons.', category: 'Library', repo: 'onimitch/gdifonts', installAs: 'libs/gdifonts', isLibrary: true },
];

const ADDON_BUNDLES = [
  {
    name: 'Solo Essentials',
    desc: 'Gear swaps, hotbar, camera, and all the QoL you need for solo play',
    addons: ['LuAshitacast', 'tHotBar', 'HXUI', 'tTimers', 'balloon', 'FancyTrusts', 'equipmon', 'fps', 'enternity', 'ibar', 'distance', 'instantchat', 'macrofix', 'quicksets', 'recast', 'invmon']
  },
  {
    name: 'Party & Endgame',
    desc: 'Party list, skillchains, treasure pool, buffs, and target info for group content',
    addons: ['LuAshitacast', 'tHotBar', 'XivParty', 'chains', 'TreasurePool', 'HitPoints', 'tTimers', 'balloon', 'debuffed', 'enternity', 'statustimers', 'recast', 'quicksets', 'distance', 'instantchat', 'macrofix', 'chatmon', 'tparty']
  },
  {
    name: 'Crafting & Utility',
    desc: 'Crafting tracker, item search, loot management, AH tools, and logging',
    addons: ['craftmon', 'itemwatch', 'lotomatic', 'equipmon', 'fps', 'logs', 'timestamp', 'balloon', 'enternity', 'instantah', 'instantchat', 'invmon', 'ahcolors', 'ahgo', 'macrofix', 'clock']
  },
  {
    name: 'Controller Player',
    desc: 'Gamepad-friendly crossbar with FFXIV-style HUD overlays and QoL',
    addons: ['tCrossBar', 'LuAshitacast', 'HXUI', 'tTimers', 'balloon', 'FancyTrusts', 'equipmon', 'fps', 'enternity', 'recast', 'distance', 'instantchat', 'macrofix', 'quicksets']
  }
];

const ADDON_HELP = {
  aspect:        { commands: ['/aspect'], usage: 'Set custom aspect ratio. /aspect to toggle or /aspect <width> <height> to set a specific ratio.' },
  autojoin:      { commands: ['/autojoin'], usage: 'Auto-accept party invites. /autojoin on|off to toggle, /autojoin whitelist <name> to add trusted players.' },
  autorespond:   { commands: ['/autorespond'], usage: 'Auto-reply to /tells. /autorespond on|off to toggle, /autorespond msg <text> to set the reply message.' },
  bgamelog:      { commands: ['/bgamelog'], usage: 'Customize battle log display. /bgamelog to open the settings menu.' },
  bluesets:      { commands: ['/bluesets'], usage: 'Blue Mage spell set manager. /bluesets to open the UI, /bluesets save <name> / load <name> to manage sets.' },
  craftmon:      { commands: ['/craftmon'], usage: 'Track crafting skill-ups. /craftmon to open the monitor. Automatically tracks synthesis results.' },
  debuffed:      { commands: ['/debuffed'], usage: 'Show debuffs on your target. Displays automatically when you target a mob — no commands needed.' },
  enternity:     { commands: [], usage: 'Removes the Enter key requirement during cutscenes and NPC dialog. Works automatically — no commands needed.' },
  equipmon:      { commands: ['/equipmon'], usage: 'Show equipped gear on screen. /equipmon to toggle the overlay on/off.' },
  find:          { commands: ['/find'], usage: 'Search inventory. /find <item name> searches all storage across your character.' },
  fps:           { commands: ['/fps'], usage: 'Show/control FPS. /fps to toggle the display, /fps set <number> to change the cap (30 or 60).' },
  hideconsole:   { commands: [], usage: 'Hides the Ashita boot console window. Works automatically on load — no commands needed.' },
  ibar:          { commands: ['/ibar'], usage: 'Shows player and target info bars. /ibar to open settings. Displays automatically.' },
  itemwatch:     { commands: ['/itemwatch'], usage: 'Track items on screen. /itemwatch add <item> to track, /itemwatch clear to remove all, /itemwatch to open settings.' },
  links:         { commands: ['/links'], usage: 'Captures URLs from chat. /links to list captured URLs, click to open in browser.' },
  logs:          { commands: ['/logs'], usage: 'Saves chat logs to file. Works automatically — creates dated log files per character.' },
  lotomatic:     { commands: ['/lotomatic'], usage: 'Auto lot/pass treasure. /lotomatic to open settings, /lotomatic lot <item> or pass <item> to set rules.' },
  minimap:       { commands: ['/minimap'], usage: 'Toggle the minimap overlay. /minimap to show/hide, drag to reposition.' },
  seekhelp:      { commands: ['/seekhelp', '/sh'], usage: 'Advanced player search. /seekhelp or /sh to open the search UI with filtering by job, level, zone.' },
  shorthand:     { commands: ['/shorthand'], usage: 'Cast shortcuts. Use abbreviated spell names in macros, e.g. /ma cure4 <me> instead of /ma "Cure IV" <me>.' },
  stfu:          { commands: ['/stfu'], usage: 'Block spam messages. /stfu to toggle. Blocks common system spam and converts macro sound effects.' },
  timestamp:     { commands: ['/timestamp'], usage: 'Adds timestamps to chat. Works automatically — no commands needed after loading.' },
  toybox:        { commands: ['/toybox'], usage: 'Collection of small UI tools. /toybox to open the settings menu and toggle individual features.' },
  LuAshitacast:  { commands: ['/lac'], usage: 'Gear-swap engine. /lac to show status, /lac disable/enable to toggle, /lac addset <name> to manage gear sets. Requires Lua scripts per job.' },
  chains:        { commands: ['/chains'], usage: 'Skillchain helper. /chains to toggle the overlay. Shows available skillchains based on your weapons and recent weaponskills.' },
  ninjaTool:     { commands: ['/ninjatool'], usage: 'Ninja tool tracker. /ninjatool to toggle the display. Shows tool counts and casting cooldown wheel.' },
  HXUI:          { commands: ['/hxui', '/xiui'], usage: 'Full HUD replacement. /hxui or /xiui to open settings. Drag elements to reposition. Replaces party list, HP/MP bars, target bar, and more.' },
  XIVBar:        { commands: ['/xivbar'], usage: 'FFXIV-style HP/MP/TP bars. /xivbar to open settings, drag to reposition.' },
  XivParty:      { commands: ['/xivparty', '/xp'], usage: 'Party list overlay. /xivparty or /xp to open settings. Shows HP, MP, TP, buffs for all party members.' },
  statustimers:  { commands: ['/statustimers', '/st'], usage: 'Buff/debuff timer overlay. /statustimers or /st to open settings. Drag timer groups to reposition.' },
  tTimers:       { commands: ['/ttimers'], usage: 'Recast and buff timers. /ttimers to open settings. Shows remaining time on buffs you cast and ability recasts.' },
  tHotBar:       { commands: ['/thotbar', '/thb'], usage: 'Visual hotbar. /thotbar or /thb to open settings. Drag abilities from the action menu to the bar. Bind keys in settings.' },
  tCrossBar:     { commands: ['/tcrossbar', '/txb'], usage: 'Controller crossbar (FFXIV-style). /tcrossbar or /txb to open settings. Hold LT/RT + face buttons to activate slots.' },
  Cosplay:       { commands: ['/cosplay'], usage: 'Copy target appearance. Target a player/NPC and type /cosplay to copy their look. /cosplay reset to revert. Client-side only.' },
  balloon:       { commands: ['/balloon'], usage: 'NPC speech bubbles. /balloon to toggle. Shows NPC dialog text as floating bubbles above their heads.' },
  TreasurePool:  { commands: ['/tp', '/treasurepool'], usage: 'Treasure pool window. /tp or /treasurepool to toggle. Shows loot with lot/pass info in a movable window.' },
  HitPoints:     { commands: ['/hitpoints', '/hp'], usage: 'Target HP percentage. /hitpoints or /hp to toggle. Shows exact HP% on your target and engaged enemies.' },
  boussole:      { commands: ['/boussole', '/bous'], usage: 'In-game map. /boussole or /bous to open. Pan and zoom with mouse, shows party positions. Supports custom PNG maps.' },
  FancyTrusts:   { commands: ['/fancytrusts', '/ft'], usage: 'Trust management UI. /fancytrusts or /ft to open. Browse, summon, and organize trusts without macros.' },
  Audible:       { commands: ['/audible'], usage: 'Audio alerts for events. /audible to open settings. Configure sounds for spell casts, mob abilities, and battle actions.' },
  castdelay:     { commands: ['/castdelay'], usage: 'Blocks casts while moving. Works automatically — prevents wasted spells from input lag. /castdelay to toggle.' },
  Emotes:        { commands: ['/emotes'], usage: 'Emote browser. /emotes to open the list. Browse and click to use any emote without remembering commands.' },
};


function AddonsTab({ config, updateConfig }) {
  const [installedAddons, setInstalledAddons] = useState([]);
  const [enabledAddons, setEnabledAddons] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [installing, setInstalling] = useState({});   // { addonName: { percent, detail } }
  const [installMsg, setInstallMsg] = useState(null);  // { addonName, success, text }
  const [batchInstalling, setBatchInstalling] = useState(false);
  const [showBundleEditor, setShowBundleEditor] = useState(false);
  const [editingBundle, setEditingBundle] = useState(null); // null = new, index = editing existing
  const [bundleName, setBundleName] = useState('');
  const [bundleAddons, setBundleAddons] = useState([]);
  const [showHelp, setShowHelp] = useState(false);
  const [pendingBundle, setPendingBundle] = useState(null);
  const savePendingRef = useRef(null);
  const saveInProgressRef = useRef(false);
  const customBundles = config.customBundles || [];

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
    const profileLines = result.content.split('\n');

    // Find which script file the profile uses
    let scriptName = 'default.txt';
    for (const line of profileLines) {
      const m = line.match(/^\s*script\s*=\s*(.+)/i);
      if (m && m[1].trim()) { scriptName = m[1].trim(); break; }
    }

    // Read the script file and extract /addon load lines
    const scriptPath = config.ashitaPath + '\\scripts\\' + scriptName;
    const scriptResult = await api.readFile(scriptPath);
    if (scriptResult && scriptResult.content) {
      const enabled = [];
      for (const line of scriptResult.content.split('\n')) {
        const m = line.trim().match(/^\/addon\s+load\s+(\S+)/i);
        if (m) enabled.push(m[1].toLowerCase());
      }
      setEnabledAddons(enabled);
      return;
    }

    // Fallback: read from [ashita.addons] section in profile
    const addonsIdx = profileLines.findIndex(l => l.trim() === '[ashita.addons]');
    if (addonsIdx === -1) return;
    const enabled = [];
    for (let i = addonsIdx + 1; i < profileLines.length; i++) {
      const line = profileLines[i].trim();
      if (line.startsWith('[')) break;
      if (!line || line.startsWith(';') || line.startsWith('#')) continue;
      // Handle key=value format (e.g. "addonName = 1")
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        enabled.push(line.slice(0, eqIdx).trim().toLowerCase());
      } else {
        enabled.push(line.toLowerCase());
      }
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

  const handleInstall = async (addon, _installing = new Set()) => {
    if (!api || !addon.repo) return;
    // Prevent circular dependency loops
    if (_installing.has(addon.name)) return;
    _installing.add(addon.name);

    // Install dependencies first
    if (addon.deps) {
      for (const depName of addon.deps) {
        const depEntry = ADDON_CATALOGUE.find(a => a.name.toLowerCase() === depName.toLowerCase());
        if (depEntry && depEntry.repo) {
          const depInstallName = (depEntry.installAs || depEntry.name).toLowerCase();
          // Check if dep is already installed (handle libs/ path)
          const depInstalled = depInstallName.includes('/')
            ? await api.pathExists(config.ashitaPath + '\\addons\\' + depInstallName.replace(/\//g, '\\'))
            : installedAddons.includes(depInstallName);
          if (!depInstalled) {
            setInstalling(prev => ({ ...prev, [addon.name]: { percent: 0, detail: `Installing dependency: ${depEntry.name}...` } }));
            await api.installAddon(config.ashitaPath, depEntry.installAs || depEntry.name, depEntry.repo, depEntry.subdir, depEntry.useRelease, depEntry.releaseFolder, depEntry.isPlugin);
          }
          // Copy dep into addon's local directory if localDeps specifies it
          if (addon.localDeps && addon.localDeps[depName]) {
            const addonDir = config.ashitaPath + '\\addons\\' + (addon.installAs || addon.name);
            const localDepDir = addonDir + '\\' + addon.localDeps[depName].replace(/\//g, '\\');
            const globalDepDir = config.ashitaPath + '\\addons\\' + depInstallName.replace(/\//g, '\\');
            try {
              await api.copyDir(globalDepDir, localDepDir);
            } catch (e) {
              console.error('Failed to copy dep locally:', e);
            }
          }
        }
      }
    }

    setInstalling(prev => ({ ...prev, [addon.name]: { percent: 0, detail: 'Starting...' } }));
    setInstallMsg(null);
    const result = await api.installAddon(config.ashitaPath, addon.installAs || addon.name, addon.repo, addon.subdir, addon.useRelease, addon.releaseFolder, addon.isPlugin);
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

  const handleUninstall = async (addon) => {
    if (!api) return;
    if (!window.confirm(`Uninstall ${addon.name}? This will delete all addon files.`)) return;
    const scriptName = (addon.installAs || addon.name);
    const result = await api.uninstallAddon(config.ashitaPath, scriptName, addon.isPlugin);
    if (result.success) {
      // Remove from enabled list
      const lower = scriptName.toLowerCase();
      const newEnabled = enabledAddons.filter(a => a !== lower);
      setEnabledAddons(newEnabled);
      await saveAddonsToProfile(newEnabled);
      loadAddons();
      setInstallMsg({ addonName: addon.name, success: true, text: result.message });
      setTimeout(() => setInstallMsg(prev => prev?.addonName === addon.name ? null : prev), 3000);
    }
  };

  const batchInstall = async (addonNames) => {
    if (!api || batchInstalling) return;
    setBatchInstalling(true);
    const communityAddons = ADDON_CATALOGUE.filter(a => a.category === 'Community' && a.repo && addonNames.map(n => n.toLowerCase()).includes(a.name.toLowerCase()));
    const toInstall = communityAddons.filter(a => !installedAddons.includes((a.installAs || a.name).toLowerCase()));
    for (const addon of toInstall) {
      await handleInstall(addon);
    }
    setBatchInstalling(false);
  };

  const applyBundle = async (bundle) => {
    // Install missing community addons
    const communityInBundle = bundle.addons.filter(name =>
      ADDON_CATALOGUE.find(a => a.name.toLowerCase() === name.toLowerCase() && a.repo)
    );
    const toInstall = communityInBundle.filter(name => !installedAddons.includes(name.toLowerCase()));
    if (toInstall.length > 0) {
      await batchInstall(toInstall);
    }
    // Enable all addons in the bundle — use installAs names for the script
    const bundleScriptNames = bundle.addons.map(name => {
      const cat = ADDON_CATALOGUE.find(a => a.name.toLowerCase() === name.toLowerCase());
      return (cat?.installAs || name).toLowerCase();
    });
    const newEnabled = [...new Set([...enabledAddons, ...bundleScriptNames])];
    setEnabledAddons(newEnabled);
    await saveAddonsToProfile(newEnabled);
  };

  const installAllCommunity = async () => {
    const allCommunity = ADDON_CATALOGUE.filter(a => a.repo).map(a => a.name);
    await batchInstall(allCommunity);
  };

  const toggleAddon = async (addonName) => {
    if (!config.activeProfile) return;
    // Use the installAs name (actual folder name) for the script command
    const catalogEntry = ADDON_CATALOGUE.find(a => a.name === addonName);
    const scriptName = (catalogEntry?.installAs || addonName).toLowerCase();
    // Block enabling uninstalled community addons (those with a repo that haven't been downloaded)
    if (catalogEntry?.repo && !installedAddons.includes(scriptName)) return;
    const isEnabled = enabledAddons.includes(scriptName);
    const newEnabled = isEnabled
      ? enabledAddons.filter(a => a !== scriptName)
      : [...enabledAddons, scriptName];
    setEnabledAddons(newEnabled);
    try {
      await saveAddonsToProfile(newEnabled);
    } catch (e) {
      console.error('Failed to save addon toggle:', e);
    }
  };

  const setAll = async (enable) => {
    if (!config.activeProfile) return;
    const newEnabled = enable ? ADDON_CATALOGUE.filter(a => !a.isLibrary && (!a.repo || installedAddons.includes((a.installAs || a.name).toLowerCase()))).map(a => (a.installAs || a.name).toLowerCase()) : [];
    setEnabledAddons(newEnabled);
    await saveAddonsToProfile(newEnabled);
  };

  // Save enabled addons to the Ashita script file (not the INI — Ashita loads addons via script commands)
  const saveAddonsToProfile = async (enabled) => {
    // Serialize writes to prevent concurrent read-modify-write corruption
    if (saveInProgressRef.current) {
      // Queue the latest save; only the most recent pending state matters
      savePendingRef.current = enabled;
      return;
    }
    saveInProgressRef.current = true;
    try {
      await _doSaveAddonsToProfile(enabled);
    } finally {
      saveInProgressRef.current = false;
      if (savePendingRef.current !== null) {
        const next = savePendingRef.current;
        savePendingRef.current = null;
        await saveAddonsToProfile(next);
      }
    }
  };

  const _doSaveAddonsToProfile = async (enabled) => {
    try {
      if (!config.activeProfile || !config.ashitaPath) return;

      // Read the profile to find which script file it uses
      const profile = await api.readProfile(config.ashitaPath, config.activeProfile);
      if (!profile.exists) return;
      const profileLines = profile.content.split('\n');
      let scriptName = 'default.txt';
      for (const line of profileLines) {
        const m = line.match(/^\s*script\s*=\s*(.+)/i);
        if (m && m[1].trim()) { scriptName = m[1].trim(); break; }
      }

      // Read the script file
      const scriptPath = config.ashitaPath + '\\scripts\\' + scriptName;
      const scriptResult = await api.readFile(scriptPath);
      let scriptLines;

      if (scriptResult && scriptResult.content) {
        scriptLines = scriptResult.content.split('\n');
      } else {
        // Script doesn't exist — create a basic one
        scriptLines = [
          '# Ashita v4 Script - Managed by Xi Launcher',
          '',
          '/load addons',
          '',
          '/wait 3',
        ];
      }

      // Ensure required plugins are present
      for (const required of ['thirdparty', 'addons']) {
        const hasIt = scriptLines.some(l => l.trim().toLowerCase() === '/load ' + required);
        if (!hasIt) {
          const lastLoadIdx = scriptLines.reduce((acc, l, i) => l.trim().startsWith('/load ') ? i : acc, -1);
          scriptLines.splice(lastLoadIdx + 1, 0, '/load ' + required);
        }
      }

      // Remove all existing /addon load lines
      const filtered = scriptLines.filter(l => !l.trim().toLowerCase().startsWith('/addon load '));

      // Find where to insert addon load lines — after the last /load line (before /wait or /bind sections)
      let insertIdx = filtered.length;
      for (let i = 0; i < filtered.length; i++) {
        const trimmed = filtered[i].trim().toLowerCase();
        if (trimmed.startsWith('/wait') || trimmed.startsWith('/bind') || trimmed.startsWith('/alias')) {
          insertIdx = i;
          break;
        }
      }

      // Add a blank line before addon loads if needed
      const addonLines = enabled.map(a => '/addon load ' + a);
      if (addonLines.length > 0) {
        // Insert with a blank line separator
        filtered.splice(insertIdx, 0, '', ...addonLines, '');
      }

      // Clean up multiple consecutive blank lines
      const cleaned = filtered.filter((line, i, arr) => !(line.trim() === '' && i > 0 && arr[i - 1].trim() === ''));

      await api.writeFile(scriptPath, cleaned.join('\n'));

      // Re-read profile to avoid stale data, then update [ashita.addons] section
      const freshProfile = await api.readProfile(config.ashitaPath, config.activeProfile);
      if (freshProfile?.exists) {
        const freshLines = freshProfile.content.split('\n');
        const addonsIdx = freshLines.findIndex(l => l.trim() === '[ashita.addons]');
        if (addonsIdx !== -1) {
          let nextSectionIdx = freshLines.length;
          for (let i = addonsIdx + 1; i < freshLines.length; i++) {
            if (freshLines[i].trim().startsWith('[')) { nextSectionIdx = i; break; }
          }
          const before = freshLines.slice(0, addonsIdx + 1);
          const after = freshLines.slice(nextSectionIdx);
          const newContent = [...before, ...enabled, '', ...after].join('\n');
          await api.saveProfile(config.ashitaPath, config.activeProfile, newContent);
        }
      }
    } catch (e) {
      console.error('Failed to save addons to script:', e);
    }
  };

  const openBundleEditor = (index = null) => {
    if (index !== null) {
      const bundle = customBundles[index];
      setBundleName(bundle.name);
      setBundleAddons([...bundle.addons]);
      setEditingBundle(index);
    } else {
      setBundleName('');
      setBundleAddons([]);
      setEditingBundle(null);
    }
    setShowBundleEditor(true);
  };

  const toggleBundleAddon = (addonName) => {
    setBundleAddons(prev =>
      prev.includes(addonName) ? prev.filter(a => a !== addonName) : [...prev, addonName]
    );
  };

  const saveCustomBundle = () => {
    const name = bundleName.trim();
    if (!name || bundleAddons.length === 0) return;
    const bundle = { name, desc: `${bundleAddons.length} addons`, addons: bundleAddons };
    const updated = [...customBundles];
    if (editingBundle !== null) {
      updated[editingBundle] = bundle;
    } else {
      updated.push(bundle);
    }
    updateConfig('customBundles', updated);
    setShowBundleEditor(false);
  };

  const deleteCustomBundle = (index) => {
    const updated = customBundles.filter((_, i) => i !== index);
    updateConfig('customBundles', updated);
  };

  const filtered = ADDON_CATALOGUE.filter(a => {
    if (a.isLibrary) return false; // Hide library deps from grid
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter !== 'All' && a.category !== categoryFilter) return false;
    return true;
  });

  const visibleCatalogue = ADDON_CATALOGUE.filter(a => !a.isLibrary);
  const categories = [...new Set(visibleCatalogue.map(a => a.category))].sort();



  return (
    <div className="addons-tab">
      <div className="panel addons-toolbar">
        <div className="addons-toolbar-left">
          <span className="addons-enabled-count cinzel">{enabledAddons.length}</span>
          <div className="addons-toolbar-labels">
            <span className="addon-active-label">Active</span>
          </div>
          <button className="btn btn-primary addon-help-btn" onClick={() => setShowHelp(true)}>Active Addon Help</button>
          {!config.activeProfile && (
            <span className="pill pill-red addon-no-profile-pill">No profile selected</span>
          )}
        </div>
        <div className="addons-toolbar-right">
          <input
            type="text"
            placeholder="Search addons..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="addons-search"
          />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="addons-category-filter"
          >
            <option value="All">All ({visibleCatalogue.length})</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat} ({visibleCatalogue.filter(a => a.category === cat).length})</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={loadAddons}>↻</button>
          <button className="btn btn-ghost btn-sm" onClick={installAllCommunity} disabled={batchInstalling}>
            {batchInstalling ? '◌ Installing...' : '↓ Install All'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setAll(false)}>Disable All</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setAll(true)}>Enable All</button>
        </div>
      </div>

      {/* Conflict warnings */}
      {(() => {
        const warnings = [];
        for (const [groupId, group] of Object.entries(ADDON_CONFLICTS)) {
          const enabledInGroup = group.addons.filter(name => {
            const cat = ADDON_CATALOGUE.find(a => a.name === name);
            const scriptName = (cat?.installAs || name).toLowerCase();
            return enabledAddons.includes(scriptName);
          });
          if (enabledInGroup.length > 1) {
            warnings.push({ id: groupId, label: group.label, addons: enabledInGroup });
          }
        }
        if (warnings.length === 0) return null;
        return (
          <div className="addon-conflicts-banner panel addon-conflicts-panel">
            <div className="addon-conflicts-title">Potential Addon Conflicts</div>
            {warnings.map(w => (
              <div key={w.id} className="addon-conflicts-item">
                <strong>{w.label}:</strong> {w.addons.join(' + ')} — these may overlap. Consider disabling one.
              </div>
            ))}
          </div>
        );
      })()}

      {enabledAddons.length === 0 && config.activeProfile && (
        <div className="addons-welcome panel">
          <div className="addons-welcome-icon">◈</div>
          <div className="addons-welcome-text">
            <h3 className="cinzel addon-welcome-title">No addons enabled yet</h3>
            <p className="addon-welcome-desc">
              Pick a Quick Setup Bundle below to get started — it will install and enable a curated set of addons for your playstyle. You can always customize later.
            </p>
          </div>
        </div>
      )}

      <div className="addons-bundles">
        <div className="section-header">Quick Setup Bundles</div>
        <div className="addons-bundles-grid">
          {ADDON_BUNDLES.map(bundle => (
            <div key={bundle.name} className="addon-bundle-card panel">
              <h4 className="cinzel addon-bundle-title">{bundle.name}</h4>
              <p className="addon-bundle-desc">{bundle.desc}</p>
              <div className="addon-bundle-addons-list">
                {bundle.addons.join(', ')}
              </div>
              <button
                className="btn btn-primary btn-sm addon-bundle-btn"
                onClick={() => setPendingBundle(bundle)}
                disabled={batchInstalling || !config.activeProfile}
              >
                {batchInstalling ? '◌ Installing...' : 'Apply Bundle'}
              </button>
            </div>
          ))}
          {customBundles.map((bundle, idx) => (
            <div key={`custom-${idx}`} className="addon-bundle-card addon-bundle-custom panel">
              <div className="addon-custom-bundle-header">
                <h4 className="cinzel addon-custom-bundle-title">{bundle.name}</h4>
                <div className="addon-custom-bundle-actions">
                  <button className="btn btn-ghost btn-sm addon-custom-bundle-action-btn" onClick={() => openBundleEditor(idx)}>✎</button>
                  <button className="btn btn-ghost btn-sm addon-custom-bundle-action-btn addon-custom-bundle-delete-btn" onClick={() => deleteCustomBundle(idx)}>✕</button>
                </div>
              </div>
              <p className="addon-bundle-desc">{bundle.addons.length} addons</p>
              <div className="addon-bundle-addons-list">
                {bundle.addons.join(', ')}
              </div>
              <button
                className="btn btn-primary btn-sm addon-bundle-btn"
                onClick={() => setPendingBundle(bundle)}
                disabled={batchInstalling || !config.activeProfile}
              >
                {batchInstalling ? '◌ Installing...' : 'Apply Bundle'}
              </button>
            </div>
          ))}
          <div className="addon-bundle-card addon-bundle-create panel" onClick={() => openBundleEditor()}>
            <div className="addon-bundle-create-inner">
              <span className="addon-bundle-create-icon">+</span>
              <span className="cinzel addon-bundle-create-label">Create Custom Bundle</span>
            </div>
          </div>
        </div>
      </div>

      {pendingBundle && (
        <Modal onClose={() => setPendingBundle(null)} ariaLabel="Bundle Confirmation">
          <div className="bundle-confirm panel">
            <h3 className="cinzel addon-modal-title">Apply "{pendingBundle.name}"?</h3>
            <p className="bundle-confirm-desc">
              This will install and activate the following <strong>{pendingBundle.addons.length} addons</strong> on your profile:
            </p>
            <div className="bundle-confirm-list">
              {pendingBundle.addons.map(name => {
                const cat = ADDON_CATALOGUE.find(a => a.name.toLowerCase() === name.toLowerCase());
                const help = ADDON_HELP[name];
                return (
                  <div key={name} className="bundle-confirm-item">
                    <div className="bundle-confirm-item-header">
                      <span className="bundle-confirm-item-name">{name}</span>
                      {cat?.category && <span className="bundle-confirm-item-cat">{cat.category}</span>}
                    </div>
                    <p className="bundle-confirm-item-desc">
                      {cat?.description || 'No description available'}
                    </p>
                    {help?.commands?.length > 0 && (
                      <span className="bundle-confirm-item-cmds">Commands: {help.commands.join(', ')}</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="bundle-confirm-actions">
              <button className="btn btn-ghost" onClick={() => setPendingBundle(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { applyBundle(pendingBundle); setPendingBundle(null); }}>
                Apply Bundle
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showBundleEditor && (
        <Modal onClose={() => setShowBundleEditor(false)} ariaLabel="Bundle Editor">
          <div className="bundle-editor panel">
            <h3 className="cinzel addon-modal-title">
              {editingBundle !== null ? 'Edit Bundle' : 'Create Custom Bundle'}
            </h3>
            <input
              type="text"
              value={bundleName}
              onChange={e => setBundleName(e.target.value)}
              placeholder="Bundle name..."
              className="bundle-editor-name"
            />
            <div className="bundle-editor-list">
              {ADDON_CATALOGUE.map(addon => (
                <label key={addon.name} className={`bundle-editor-item ${bundleAddons.includes(addon.name) ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={bundleAddons.includes(addon.name)}
                    onChange={() => toggleBundleAddon(addon.name)}
                  />
                  <span className="bundle-editor-addon-name">{addon.name}</span>
                  <span className={`addon-category-tag addon-category-tag-sm`}>{addon.category}</span>
                </label>
              ))}
            </div>
            <div className="bundle-editor-footer">
              <span className="addon-editor-count">{bundleAddons.length} addons selected</span>
              <div className="addon-editor-buttons">
                <button className="btn btn-ghost btn-sm" onClick={() => setShowBundleEditor(false)}>Cancel</button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={saveCustomBundle}
                  disabled={!bundleName.trim() || bundleAddons.length === 0}
                >
                  {editingBundle !== null ? 'Save Changes' : 'Save Bundle'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {showHelp && (
        <Modal onClose={() => setShowHelp(false)} ariaLabel="Active Addon Reference">
          <div className="addon-help-modal panel">
            <div className="addon-help-header">
              <h3 className="cinzel addon-modal-title addon-modal-title-flush">Active Addon Reference</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowHelp(false)}>✕</button>
            </div>
            <p className="addon-help-subtitle">
              Commands and usage for your {enabledAddons.length} enabled addon{enabledAddons.length !== 1 ? 's' : ''}. Use these in the FFXI chat window.
            </p>
            <div className="addon-help-list">
              {enabledAddons.length === 0 && (
                <div className="addon-help-empty">No addons enabled. Enable some addons to see their commands here.</div>
              )}
              {enabledAddons.map(scriptName => {
                const cat = ADDON_CATALOGUE.find(a => (a.installAs || a.name).toLowerCase() === scriptName);
                const name = cat?.name || scriptName;
                const help = ADDON_HELP[name] || ADDON_HELP[scriptName];
                return (
                  <div key={scriptName} className="addon-help-item">
                    <div className="addon-help-item-header">
                      <span className="addon-help-name mono">{name}</span>
                      {help?.commands?.length > 0 && (
                        <div className="addon-help-commands">
                          {help.commands.map(cmd => (
                            <code key={cmd} className="addon-help-cmd">{cmd}</code>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="addon-help-usage">{help?.usage || cat?.description || 'No usage information available.'}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      )}

      <div className="addons-grouped">
        {[...new Set(filtered.map(a => a.category))].map(cat => (
          <div key={cat} className="addons-category-group">
            <div className="addons-category-header cinzel">{cat}</div>
            <div className="addons-grid">
              {filtered.filter(a => a.category === cat).map(addon => {
                const scriptName = (addon.installAs || addon.name).toLowerCase();
                const isEnabled = enabledAddons.includes(scriptName);
                const isInstalled = installedAddons.includes(scriptName);
                return (
                  <div key={addon.name} className={`addon-card ${isEnabled ? 'enabled' : ''}`}>
                    <div className="addon-card-header">
                      <span className="addon-name mono">{addon.name}</span>
                      <div className="addon-tags">
                        {isInstalled && addon.repo && <span className="addon-installed-tag">Installed</span>}
                      </div>
                    </div>
                    <p className="addon-desc">{addon.description}</p>
                    {addon.deps && <div className="addon-deps-note">Requires: {addon.deps.join(', ')}</div>}
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
                        {addon.repo && !isInstalled ? (
                          <span className="addon-install-hint">Install to enable</span>
                        ) : (
                          <>
                            <div className="toggle" onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleAddon(addon.name); }}>
                              <input type="checkbox" checked={isEnabled} readOnly />
                              <span className="toggle-slider" />
                            </div>
                            <span className="addon-status-label">{isEnabled ? 'Enabled' : 'Disabled'}</span>
                          </>
                        )}
                      </div>
                      {addon.repo && !installing[addon.name] && (
                        <div className="addon-card-actions">
                          <button
                            className={`btn btn-sm ${isInstalled ? 'btn-ghost' : 'btn-primary'}`}
                            onClick={() => handleInstall(addon)}
                          >
                            {isInstalled ? '↻ Update' : '↓ Install'}
                          </button>
                          {isInstalled && (
                            <button className="btn btn-ghost btn-sm btn-danger-outline" onClick={() => handleUninstall(addon)}>
                              ✕
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AddonsTab;
