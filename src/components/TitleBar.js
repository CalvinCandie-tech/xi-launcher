import React, { useState, useEffect } from 'react';
import './TitleBar.css';

const api = window.xiAPI;

function TitleBar() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    api?.getAppVersion?.().then(v => setVersion(v || ''));
  }, []);

  return (
    <div className="titlebar">
      <div className="titlebar-accent" />
      <div className="titlebar-left">
        <img className="titlebar-crystal-img" src="./crystal.svg" alt="" />
        <span className="titlebar-title">XI LAUNCHER</span>
        <span className="titlebar-version">{version ? `V${version}` : ''}</span>
      </div>
      <div className="titlebar-center" />
      <div className="titlebar-controls">
        <button className="tb-btn tb-minimize" onClick={() => api?.minimize()} aria-label="Minimize window">─</button>
        <button className="tb-btn tb-maximize" onClick={() => api?.maximize()} aria-label="Maximize window">□</button>
        <button className="tb-btn tb-close" onClick={() => api?.close()} aria-label="Close window">✕</button>
      </div>
    </div>
  );
}

export default TitleBar;
