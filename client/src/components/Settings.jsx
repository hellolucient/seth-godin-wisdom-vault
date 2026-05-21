import React, { useState } from 'react';
import { Key, Eye, EyeOff, Save, Trash2, ShieldAlert, Check, Database } from 'lucide-react';
import ImportOptions from './ImportOptions';

export default function Settings({ apiKey, onSaveApiKey, onRefreshStats }) {
  const [keyInput, setKeyInput] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    onSaveApiKey(keyInput);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleResetDatabase = async () => {
    setResetting(true);
    try {
      // We can issue a simple POST request to clean up the posts table.
      // Let's create an endpoint in Express.
      const response = await fetch('/api/reset', {
        method: 'POST'
      });
      if (response.ok) {
        setResetSuccess(true);
        onRefreshStats();
        setTimeout(() => {
          setResetSuccess(false);
          setShowResetConfirm(false);
        }, 2000);
      }
    } catch (e) {
      console.error('Reset database failed:', e);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div>
      <div className="dashboard-header">
        <h1 className="dashboard-title">Settings</h1>
        <p className="dashboard-subtitle">Configure keys, integrations, and local data storage options.</p>
      </div>

      <div className="settings-card">
        {/* Gemini API Section */}
        <div className="settings-section">
          <h2 className="settings-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Key style={{ color: 'var(--accent)', width: '20px', height: '20px' }} />
            Gemini API Configuration
          </h2>
          <p className="settings-description">
            To unlock the <strong>Ask Seth</strong> Q&A chat, paste your Google Gemini API key. 
            Your key is saved in your local web browser storage and is never sent to any external server (except directly to Google's official Gemini API).
          </p>

          <form onSubmit={handleSave} className="form-group">
            <label className="form-label">Gemini API Key</label>
            <div style={{ position: 'relative', display: 'flex', gap: '0.5rem' }}>
              <input
                type={showKey ? "text" : "password"}
                placeholder="AIzaSy..."
                className="form-input"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                style={{ paddingRight: '3rem' }}
              />
              <button
                type="button"
                className="action-btn"
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'transparent',
                  height: 'auto',
                  width: 'auto'
                }}
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff style={{ width: '18px', height: '18px' }} /> : <Eye style={{ width: '18px', height: '18px' }} />}
              </button>
            </div>
            
            <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button type="submit" className="save-settings-btn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Save style={{ width: '16px', height: '16px' }} />
                Save Key
              </button>
              
              {saved && (
                <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.9rem', fontWeight: 500 }}>
                  <Check style={{ width: '16px', height: '16px' }} />
                  Saved locally!
                </span>
              )}
            </div>
          </form>
        </div>
        
        {/* Import & Data Tools Section */}
        <div className="settings-section">
          <h2 className="settings-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Database style={{ color: 'var(--accent)', width: '20px', height: '20px' }} />
            Import & Data Tools
          </h2>
          <ImportOptions onRefreshStats={onRefreshStats} />
        </div>

        {/* Database Management Section */}
        <div className="settings-section">
          <h2 className="settings-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ff3b30' }}>
            <Trash2 style={{ width: '20px', height: '20px' }} />
            Danger Zone
          </h2>
          <p className="settings-description">
            Resetting the database will delete all imported blog posts. This action is permanent. Use this if you want to perform a clean re-import of your MBOX files.
          </p>

          {!showResetConfirm ? (
            <button 
              onClick={() => setShowResetConfirm(true)} 
              className="theme-toggle-btn"
              style={{ color: '#ff3b30', borderColor: 'rgba(255, 59, 48, 0.2)', width: 'auto' }}
            >
              Reset Vault Database
            </button>
          ) : (
            <div 
              style={{
                background: 'rgba(255, 59, 48, 0.05)',
                border: '1px solid rgba(255, 59, 48, 0.15)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                marginTop: '1rem'
              }}
            >
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <ShieldAlert style={{ color: '#ff3b30', flexShrink: 0, width: '20px', height: '20px' }} />
                <div>
                  <h4 style={{ fontWeight: 600, color: '#ff3b30', fontSize: '0.95rem' }}>Are you absolutely sure?</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    This will empty all posts from the SQLite database.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={handleResetDatabase}
                  className="save-settings-btn"
                  style={{ background: '#ff3b30', boxShadow: 'none' }}
                  disabled={resetting || resetSuccess}
                >
                  {resetting ? 'Resetting...' : resetSuccess ? 'Reset Complete!' : 'Yes, Delete Everything'}
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="theme-toggle-btn"
                  style={{ width: 'auto' }}
                  disabled={resetting || resetSuccess}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
