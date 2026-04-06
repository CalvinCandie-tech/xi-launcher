import React, { useState, useEffect } from 'react';
import './SetupWizard.css';
import { DEFAULT_PROFILE_INI } from '../utils/profileTemplates';
import Modal from './Modal';

const api = window.xiAPI;

const STEPS_PRIVATE = ['welcome', 'paths', 'servers', 'profile', 'finish'];
const STEPS_RETAIL = ['welcome', 'paths', 'profile', 'finish'];

function SetupWizard({ config, updateConfig, onComplete }) {
  const [step, setStep] = useState(0);
  const [ashitaPath, setAshitaPath] = useState(config.ashitaPath || '');
  const [ffxiPath, setFfxiPath] = useState(config.ffxiPath || '');
  const [profileName, setProfileName] = useState('');
  const [profileType, setProfileType] = useState('private');
  const [serverHost, setServerHost] = useState(config.serverHost || '');
  const [serverPort, setServerPort] = useState(config.serverPort || '');
  const [ashitaFound, setAshitaFound] = useState(false);
  const [ffxiFound, setFfxiFound] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState({ percent: 0, detail: '' });
  const [xiloaderFound, setXiloaderFound] = useState(false);
  const [xiloaderDownloading, setXiloaderDownloading] = useState(false);
  const [xiloaderProgress, setXiloaderProgress] = useState({ percent: 0, detail: '' });
  const [xiloaderMsg, setXiloaderMsg] = useState('');
  const [serverList, setServerList] = useState([]);
  const [serverListLoading, setServerListLoading] = useState(false);
  const [serverListError, setServerListError] = useState('');
  const [expandedCat, setExpandedCat] = useState(null);

  const STEPS = profileType === 'private' ? STEPS_PRIVATE : STEPS_RETAIL;
  const currentStep = STEPS[step];

  useEffect(() => {
    if (!api?.onAshitaInstallProgress) return;
    const unsub = api.onAshitaInstallProgress((percent, detail) => {
      setInstallProgress({ percent, detail });
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!api?.onXiloaderDownloadProgress) return;
    const unsub = api.onXiloaderDownloadProgress((percent, detail) => {
      setXiloaderProgress({ percent, detail });
    });
    return unsub;
  }, []);

  // Fetch server list when entering the servers step
  useEffect(() => {
    if (currentStep !== 'servers' || serverList.length > 0) return;
    if (!api?.fetchServerList) return;
    setServerListLoading(true);
    api.fetchServerList().then(result => {
      if (result.success) {
        setServerList(result.categories);
        if (result.categories.length > 0) setExpandedCat(0);
      } else {
        setServerListError(typeof result.error === 'string' ? result.error : 'Failed to load server list');
      }
      setServerListLoading(false);
    }).catch(() => {
      setServerListError('Failed to load server list');
      setServerListLoading(false);
    });
  }, [currentStep, serverList.length]);

  // Check if xiloader exists when ashitaPath changes
  useEffect(() => {
    if (!api || !ashitaPath) return;
    const checkXiloader = async () => {
      const xiloaderDir = ashitaPath + '\\xiloader';
      const found = await api.pathExists(xiloaderDir + '\\xiloader.exe');
      setXiloaderFound(found);
    };
    checkXiloader();
  }, [ashitaPath]);

  const downloadXiloader = async () => {
    if (!api?.downloadXiloader) return;
    setXiloaderDownloading(true);
    setXiloaderMsg('');
    const destDir = ashitaPath ? ashitaPath + '\\xiloader' : '';
    const result = await api.downloadXiloader(destDir);
    setXiloaderDownloading(false);
    if (result.success) {
      setXiloaderFound(true);
      setXiloaderMsg('xiloader downloaded successfully');
    } else {
      setXiloaderMsg(result.error || 'Download failed');
    }
  };

  useEffect(() => {
    if (!api) return;
    api.pathExists(ashitaPath + '\\Ashita-cli.exe').then(setAshitaFound);
  }, [ashitaPath]);

  useEffect(() => {
    if (!api) return;
    api.pathExists(ffxiPath).then(setFfxiFound);
  }, [ffxiPath]);

  const browse = async (setter) => {
    const result = await api.browseFolder('');
    if (result) setter(result);
  };

  const installAshita = async () => {
    setInstalling(true);
    setInstallProgress({ percent: 0, detail: 'Starting...' });
    const result = await api.installAshitaV4(ashitaPath);
    setInstalling(false);
    if (result.success) {
      const found = await api.pathExists(ashitaPath + '\\Ashita-cli.exe');
      setAshitaFound(found);
    }
  };

  const savePaths = () => {
    updateConfig('ashitaPath', ashitaPath);
    updateConfig('ffxiPath', ffxiPath);
    if (serverHost) updateConfig('serverHost', serverHost);
    if (serverPort) updateConfig('serverPort', serverPort);
  };

  const createProfile = async () => {
    if (!profileName.trim()) return;
    const name = profileName.trim();
    if (/[\\/:*?"<>|]/.test(name)) return;
    if (name.length > 60) return;
    const xiloaderPath = config.xiloaderPath || (ashitaPath + '\\xiloader');
    await api.saveProfile(ashitaPath, name, DEFAULT_PROFILE_INI(name, profileType, serverHost, serverPort, xiloaderPath, config.hairpin, config.loginUser, config.loginPass, config.ffxiPath));
    updateConfig('activeProfile', name);
  };

  const finish = async () => {
    savePaths();
    if (profileName.trim()) await createProfile();
    updateConfig('setupComplete', true);
    onComplete();
  };

  const handleSkip = () => { updateConfig('setupComplete', true); onComplete(); };

  return (
    <Modal onClose={handleSkip} className="wizard-overlay" zIndex={200}>
      <div className="wizard-dialog" onClick={e => e.stopPropagation()}>
        <div className="wizard-header">
          <img src="./crystal.svg" alt="" />
          <h2>XI Launcher Setup</h2>
          <p>Let's get you ready to play</p>
        </div>

        <div className="wizard-steps">
          {STEPS.map((s, i) => (
            <div key={s} className={`wizard-step-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />
          ))}
        </div>

        <div className="wizard-body">
          {currentStep === 'welcome' && (
            <>
              <h3 className="wizard-step-title">Welcome to XI Launcher</h3>
              <p className="wizard-step-desc">
                This wizard will help you set up everything you need to play Final Fantasy XI.
                We'll configure your game paths, create a launch profile, and get you in-game in just a few steps.
              </p>
              <p className="wizard-step-desc">
                You'll need:
              </p>
              <ul className="wizard-requirements-list">
                <li><strong>FFXI installed</strong> — the base game client</li>
                <li><strong>Ashita v4</strong> — the addon framework (we can install this for you)</li>
                <li>A <strong>server address</strong> if connecting to a private server</li>
              </ul>
            </>
          )}

          {currentStep === 'paths' && (
            <>
              <h3 className="wizard-step-title">Game Paths</h3>
              <p className="wizard-step-desc">Tell us where your game files are located.</p>

              <div className="wizard-field">
                <label>Ashita v4 Path</label>
                <span className="field-hint">The folder containing Ashita-cli.exe</span>
                <div className="wizard-field-row">
                  <input type="text" value={ashitaPath} onChange={e => setAshitaPath(e.target.value)} placeholder="C:\Ashita-v4" />
                  <button className="btn btn-ghost btn-sm" onClick={() => browse(setAshitaPath)}>Browse</button>
                  <span className={`pill ${ashitaFound ? 'pill-green' : 'pill-red'} wizard-status-pill`}>
                    {ashitaFound ? 'Found' : 'Not Found'}
                  </span>
                </div>
                {!ashitaFound && !installing && (
                  <button className="btn btn-primary btn-sm wizard-action-btn" onClick={installAshita}>
                    ↓ Install Ashita v4 Automatically
                  </button>
                )}
                {installing && (
                  <div className="wizard-progress-wrapper">
                    <div className="wizard-progress-track">
                      <div className="wizard-progress-bar" style={{ width: `${installProgress.percent}%` }} />
                    </div>
                    <span className="wizard-progress-detail">{installProgress.detail}</span>
                  </div>
                )}
              </div>

              <div className="wizard-field">
                <label>FFXI Install Path</label>
                <span className="field-hint">Your Final Fantasy XI game folder</span>
                <div className="wizard-field-row">
                  <input type="text" value={ffxiPath} onChange={e => setFfxiPath(e.target.value)} placeholder="C:\Program Files (x86)\PlayOnline\SquareEnix\FINAL FANTASY XI" />
                  <button className="btn btn-ghost btn-sm" onClick={() => browse(setFfxiPath)}>Browse</button>
                  <span className={`pill ${ffxiFound ? 'pill-green' : 'pill-red'} wizard-status-pill`}>
                    {ffxiFound ? 'Found' : 'Not Found'}
                  </span>
                </div>
                {!ffxiFound && (
                  <p className="wizard-install-hint">
                    Don't have FFXI installed? You can download the official client from the{' '}
                    <span className="wizard-link" onClick={() => api.openExternal('https://www.playonline.com/ff11us/download/media/install_win.html')}>
                      PlayOnline website
                    </span>
                    . If you're joining a private server, check your server's website — many provide a custom installer.
                  </p>
                )}
              </div>
            </>
          )}

          {currentStep === 'servers' && (
            <>
              <h3 className="wizard-step-title">Browse Private Servers</h3>
              <p className="wizard-step-desc">
                Here are some community FFXI private servers. Click a server to select it, then enter the connection address on the next step. Check the server's website or Discord for the correct address.
              </p>
              {serverListLoading && <p className="wizard-step-desc">Loading server list...</p>}
              {serverListError && <p className="wizard-status-msg wizard-status-msg-error">{serverListError}</p>}
              {serverList.map((cat, ci) => (
                <div key={cat.name} className="wizard-server-category">
                  <button
                    className={`wizard-server-cat-header ${expandedCat === ci ? 'expanded' : ''}`}
                    onClick={() => setExpandedCat(expandedCat === ci ? null : ci)}
                  >
                    <span>{expandedCat === ci ? '▾' : '▸'}</span>
                    <span>{cat.name}</span>
                    <span className="wizard-server-cat-count">{cat.servers.length}</span>
                  </button>
                  {expandedCat === ci && cat.servers.map(server => (
                    <div
                      key={server.name}
                      className={`wizard-server-row ${profileName === server.name ? 'selected' : ''} ${server.note ? 'wizard-server-incompatible' : ''}`}
                      onClick={() => {
                        if (server.note) return; // Don't select incompatible servers
                        setProfileName(server.name);
                        if (server.address) setServerHost(server.address);
                        if (server.port) setServerPort(server.port);
                      }}
                    >
                      <div className="wizard-server-name">
                        {server.name}
                        {server.address && <span className="wizard-server-address">{server.address}{server.port ? ':' + server.port : ''}</span>}
                        {server.note && <span className="wizard-server-note">{server.note}</span>}
                      </div>
                      <div className="wizard-server-details">
                        <span>{server.expansion}</span>
                        <span>Rates: {server.rates}</span>
                        {server.dualBox && server.dualBox !== 'No' && server.dualBox !== '?' && <span>Multi-box</span>}
                      </div>
                      <div className="wizard-server-links">
                        {server.website && (
                          <button className="btn btn-ghost btn-xs" onClick={e => { e.stopPropagation(); api?.openExternal(server.website); }}>Website</button>
                        )}
                        {server.discord && (
                          <button className="btn btn-ghost btn-xs" onClick={e => { e.stopPropagation(); api?.openExternal(server.discord); }}>Discord</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {profileName && serverHost && (
                <div className="wizard-server-selected">
                  Selected: <strong>{profileName}</strong> — server address: <strong>{serverHost}{serverPort ? ':' + serverPort : ''}</strong>
                </div>
              )}
            </>
          )}

          {currentStep === 'profile' && (
            <>
              <h3 className="wizard-step-title">Create Your First Profile</h3>
              <p className="wizard-step-desc">A profile stores your launch settings — server, addons, and display configuration.</p>

              <div className="wizard-field">
                <label>Profile Name</label>
                <input type="text" value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="My Server" />
              </div>

              <div className="wizard-field">
                <label>Server Type</label>
                <div className="wizard-toggle-group">
                  <button className={`btn btn-sm ${profileType === 'private' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setProfileType('private')}>
                    Private Server
                  </button>
                  <button className={`btn btn-sm ${profileType === 'retail' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setProfileType('retail')}>
                    Retail (PlayOnline)
                  </button>
                </div>
              </div>

              {profileType === 'private' && (
                <>
                  <div className="wizard-field">
                    <label>Server Address</label>
                    <span className="field-hint">The connection address from your server's website or Discord (not the website URL)</span>
                    <input type="text" value={serverHost} onChange={e => setServerHost(e.target.value)} placeholder="play.myserver.com" />
                  </div>
                  <div className="wizard-field">
                    <label>Port (optional)</label>
                    <input type="text" value={serverPort} onChange={e => setServerPort(e.target.value)} placeholder="54231" />
                  </div>
                  <div className="wizard-field">
                    <label>xiloader</label>
                    <span className="field-hint">Required for private servers — connects you directly, bypassing PlayOnline</span>
                    {xiloaderFound ? (
                      <span className="pill pill-green wizard-status-pill wizard-status-pill-block">xiloader.exe found</span>
                    ) : !xiloaderDownloading ? (
                      <button className="btn btn-primary btn-sm wizard-action-btn" onClick={downloadXiloader}>
                        ↓ Download xiloader
                      </button>
                    ) : (
                      <div className="wizard-progress-wrapper">
                        <div className="wizard-progress-track">
                          <div className="wizard-progress-bar" style={{ width: `${xiloaderProgress.percent}%` }} />
                        </div>
                        <span className="wizard-progress-detail">{xiloaderProgress.detail}</span>
                      </div>
                    )}
                    {xiloaderMsg && (
                      <p className={`wizard-status-msg ${xiloaderFound ? 'wizard-status-msg-success' : 'wizard-status-msg-error'}`}>{xiloaderMsg}</p>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {currentStep === 'finish' && (
            <div className="wizard-success">
              <h3>You're All Set!</h3>
              <p>Your launcher is configured and ready to go. Click "Finish" to start using XI Launcher.</p>
              <div className="wizard-summary-panel">
                <div className="wizard-summary-label">Summary:</div>
                {ashitaFound && <div className="wizard-summary-ok">✓ Ashita v4 found</div>}
                {ffxiFound && <div className="wizard-summary-ok">✓ FFXI client found</div>}
                {profileName && <div className="wizard-summary-ok">✓ Profile: {profileName}</div>}
                {profileType === 'private' && serverHost && <div className="wizard-summary-info">→ Server: {serverHost}{serverPort ? `:${serverPort}` : ''}</div>}
                {profileType === 'private' && xiloaderFound && <div className="wizard-summary-ok">✓ xiloader ready</div>}
                {profileType === 'private' && !xiloaderFound && <div className="wizard-summary-warn">⚠ xiloader not downloaded — you can get it later from the Profiles tab</div>}
              </div>
            </div>
          )}
        </div>

        <div className="wizard-footer">
          <div>
            {step > 0 && (
              <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)}>← Back</button>
            )}
          </div>
          <div className="wizard-footer-right">
            <button className="btn btn-ghost" onClick={handleSkip}>
              Skip Setup
            </button>
            {step < STEPS.length - 1 ? (
              <button className="btn btn-primary" onClick={() => { if (step === 1) savePaths(); setStep(s => s + 1); }}>
                Next →
              </button>
            ) : (
              <button className="btn btn-primary" onClick={finish}>
                ✦ Finish
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default SetupWizard;
