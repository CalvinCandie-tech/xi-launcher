import React, { useState } from 'react';
import './UpdateModal.css';

const api = window.xiAPI;

function UpdateModal({ updates, ashitaPath, onClose }) {
  const [checked, setChecked] = useState(() =>
    updates.reduce((acc, u) => ({ ...acc, [u.name]: true }), {})
  );
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(null); // { current, total, name }

  const selectedCount = Object.values(checked).filter(Boolean).length;

  const toggleItem = (name) => {
    if (updating) return;
    setChecked(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleUpdate = async () => {
    const selected = updates.filter(u => checked[u.name]);
    if (selected.length === 0) return;
    setUpdating(true);

    for (let i = 0; i < selected.length; i++) {
      const addon = selected[i];
      setProgress({ current: i + 1, total: selected.length, name: addon.name });
      await api.installAddon(ashitaPath, addon.name, addon.repo, addon.subdir);
    }

    setUpdating(false);
    onClose();
  };

  return (
    <div className="update-overlay">
      <div className="update-dialog">
        <div className="update-header">
          <h3>Addon Updates Available</h3>
          <p>{updates.length} addon{updates.length !== 1 ? 's' : ''} can be updated</p>
        </div>
        <div className="update-list">
          {updates.map(u => (
            <label key={u.name} className="update-item" style={{ cursor: updating ? 'default' : 'pointer' }}>
              <input
                type="checkbox"
                checked={checked[u.name]}
                onChange={() => toggleItem(u.name)}
                disabled={updating}
              />
              <span className="update-item-name">{u.name}</span>
            </label>
          ))}
        </div>
        {updating && progress ? (
          <div className="update-progress">
            <div className="update-progress-text">
              Updating {progress.name} ({progress.current}/{progress.total})
            </div>
            <div className="update-progress-bar">
              <div
                className="update-progress-fill"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="update-footer">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              Skip
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleUpdate}
              disabled={selectedCount === 0}
            >
              Update {selectedCount > 0 ? `(${selectedCount})` : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default UpdateModal;
