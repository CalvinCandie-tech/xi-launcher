import React from 'react';
import './Sidebar.css';

const api = window.xiAPI;

const tabs = [
  { id: 'home', label: 'Home', icon: null },
  { id: 'profiles', label: 'Profiles', icon: '⚔' },
  { id: 'addons', label: 'Addons', icon: '◈' },
  { id: 'plugins', label: 'Plugins', icon: '⬡' },
  { id: 'xipivot', label: 'XIPivot', icon: '◎' },
  { id: 'dgvoodoo', label: 'dgVoodoo', icon: '◆' },
  { id: 'settings', label: 'Settings', icon: '⚙' }
];

function Sidebar({ activeTab, onTabChange, onToggleMusic, musicPlaying, musicVolume, onVolumeChange, currentTrackName, onSkipTrack, musicShuffle, onToggleShuffle, musicLoop, onToggleLoop }) {
  const showMusic = activeTab === 'home';
  const clickTimer = React.useRef(null);

  React.useEffect(() => {
    return () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    };
  }, []);

  const handleMusicClick = () => {
    if (clickTimer.current) return;
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      onToggleMusic();
    }, 250);
  };

  const handleMusicDoubleClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    if (api) api.openMusicFolder();
  };

  return (
    <nav className="topnav">
      {tabs.map(tab => (
        <React.Fragment key={tab.id}>
          {tab.id === 'home' ? (
            <div className="topnav-home-wrap">
              <button
                className={`topnav-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => onTabChange(tab.id)}
              >
                <img className="topnav-crystal-icon" src="./crystal.svg" alt="" />
                <span className="topnav-tab-label">{tab.label}</span>
              </button>
              {showMusic && (
                <>
                  <button
                    className={`topnav-music-btn ${musicPlaying ? 'playing' : ''}`}
                    onClick={handleMusicClick}
                    onDoubleClick={handleMusicDoubleClick}
                    title={musicPlaying ? 'Pause music (double-click to open folder)' : 'Play music (double-click to open folder)'}
                    aria-label={musicPlaying ? 'Pause music' : 'Play music'}
                  >
                    <img className="topnav-music-icon" src="./music-note.svg" alt="" />
                    {musicPlaying && (
                      <div className="topnav-floating-notes">
                        <span className="topnav-float-note n1">♪</span>
                        <span className="topnav-float-note n2">♫</span>
                        <span className="topnav-float-note n3">♪</span>
                        <span className="topnav-float-note n4">♫</span>
                      </div>
                    )}
                  </button>
                  {musicPlaying && (
                    <>
                      <div className="topnav-music-controls">
                        <button className="topnav-music-ctrl" onClick={() => onSkipTrack('prev')} title="Previous track" aria-label="Previous track">
                          <img src="./icon-prev.svg" alt="" className="topnav-ctrl-icon" />
                        </button>
                        <button className="topnav-music-ctrl" onClick={onToggleMusic} title="Pause" aria-label="Pause">
                          <img src="./icon-pause.svg" alt="" className="topnav-ctrl-icon" />
                        </button>
                        <button className="topnav-music-ctrl" onClick={() => onSkipTrack('next')} title="Next track" aria-label="Next track">
                          <img src="./icon-next.svg" alt="" className="topnav-ctrl-icon" />
                        </button>
                        <button className={`topnav-music-ctrl ${musicShuffle ? 'active' : ''}`} onClick={onToggleShuffle} title="Shuffle" aria-label="Toggle shuffle">
                          <img src="./icon-shuffle.svg" alt="" className="topnav-ctrl-icon" />
                        </button>
                        <button className={`topnav-music-ctrl ${musicLoop !== 'none' ? 'active' : ''}`} onClick={onToggleLoop} title={`Loop: ${musicLoop}`} aria-label={`Loop mode: ${musicLoop}`}>
                          <img src={musicLoop === 'one' ? './icon-loop-one.svg' : './icon-loop.svg'} alt="" className="topnav-ctrl-icon" />
                        </button>
                      </div>
                      {currentTrackName && (
                        <div className="topnav-track-name" title={currentTrackName}>♪ {currentTrackName}</div>
                      )}
                      <input
                        className="topnav-volume-slider"
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={musicVolume}
                        onChange={e => onVolumeChange(parseFloat(e.target.value))}
                        title={`Volume: ${Math.round(musicVolume * 100)}%`}
                      />
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            <button
              className={`topnav-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              <span className="topnav-tab-icon">{tab.icon}</span>
              <span className="topnav-tab-label">{tab.label}</span>
            </button>
          )}
        </React.Fragment>
      ))}
      <button
        className="topnav-tab topnav-tab-bgwiki topnav-tab-external"
        onClick={() => api && api.openExternal('https://www.bg-wiki.com/ffxi/Main_Page')}
        aria-label="Open BG-Wiki in browser"
      >
        <img className="topnav-bgwiki-icon" src="./bg-wiki.svg" alt="" />
        <span className="topnav-tab-label">BG-Wiki</span>
        <span className="topnav-external-icon" aria-hidden="true">↗</span>
      </button>
    </nav>
  );
}

export default Sidebar;
