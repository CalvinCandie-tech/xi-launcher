import React, { useState, useEffect } from 'react';
import './ServerBrowserTab.css';

const api = window.xiAPI;

function ServerBrowserTab({ config, updateConfig }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedCat, setExpandedCat] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!api?.fetchServerList) return;
    setLoading(true);
    api.fetchServerList().then(result => {
      if (result.success) {
        setCategories(result.categories);
        if (result.categories.length > 0) setExpandedCat(0);
      } else {
        setError(typeof result.error === 'string' ? result.error : 'Failed to fetch server list');
      }
      setLoading(false);
    }).catch(() => {
      setError('Failed to fetch server list');
      setLoading(false);
    });
  }, []);

  const filteredCategories = categories.map(cat => ({
    ...cat,
    servers: cat.servers.filter(s =>
      !filter || s.name.toLowerCase().includes(filter.toLowerCase()) ||
      s.expansion.toLowerCase().includes(filter.toLowerCase())
    )
  })).filter(cat => cat.servers.length > 0);

  return (
    <div className="server-browser">
      <div className="server-browser-header">
        <h2>FFXI Private Servers</h2>
        <p className="server-browser-subtitle">
          Community server list from <button className="link-btn" onClick={() => api?.openExternal('https://github.com/XiPrivateServers/Servers')}>XiPrivateServers</button>
        </p>
      </div>

      {loading && <div className="server-browser-loading">Loading server list...</div>}
      {error && <div className="server-browser-error">{error}</div>}

      {!loading && !error && (
        <>
          <div className="server-browser-filter">
            <input
              type="text"
              placeholder="Search servers..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            <span className="server-count">{categories.reduce((sum, c) => sum + c.servers.length, 0)} servers</span>
          </div>

          {filteredCategories.map((cat, ci) => (
            <div key={cat.name} className="server-category">
              <button
                className={`server-category-header ${expandedCat === ci ? 'expanded' : ''}`}
                onClick={() => setExpandedCat(expandedCat === ci ? null : ci)}
              >
                <span className="server-category-arrow">{expandedCat === ci ? '▾' : '▸'}</span>
                <span className="server-category-name">{cat.name}</span>
                <span className="server-category-count">{cat.servers.length}</span>
              </button>

              {expandedCat === ci && (
                <div className="server-list">
                  <div className="server-list-header">
                    <span className="sh-name">Name</span>
                    <span className="sh-exp">Expansion</span>
                    <span className="sh-rates">Rates</span>
                    <span className="sh-speed">Speed</span>
                    <span className="sh-features">Features</span>
                    <span className="sh-actions">Links</span>
                  </div>
                  {cat.servers.map(server => (
                    <div key={server.name} className="server-row">
                      <span className="sr-name">
                        {server.website ? (
                          <button className="link-btn server-name-link" onClick={() => api?.openExternal(server.website)}>
                            {server.name}
                          </button>
                        ) : server.name}
                        {server.address && <span className="sr-address">{server.address}{server.port ? ':' + server.port : ''}</span>}
                        {server.note && <span className="sr-note">{server.note}</span>}
                      </span>
                      <span className="sr-exp">{server.expansion}</span>
                      <span className="sr-rates">{server.rates}</span>
                      <span className="sr-speed">{server.moveSpeed}</span>
                      <span className="sr-features">
                        {server.levelSync && <span className="feature-tag" title="Level Sync">Sync</span>}
                        {server.trusts && <span className="feature-tag" title="Trusts">Trusts</span>}
                        {server.dualBox && server.dualBox !== 'No' && server.dualBox !== '?' && (
                          <span className="feature-tag" title={`Dual-Box: ${server.dualBox}`}>Multi</span>
                        )}
                      </span>
                      <span className="sr-actions">
                        {server.discord && (
                          <button className="btn btn-ghost btn-xs" onClick={() => api?.openExternal(server.discord)} title="Join Discord">
                            Discord
                          </button>
                        )}
                        {server.website && (
                          <button className="btn btn-ghost btn-xs" onClick={() => api?.openExternal(server.website)} title="Visit website">
                            Website
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default ServerBrowserTab;
