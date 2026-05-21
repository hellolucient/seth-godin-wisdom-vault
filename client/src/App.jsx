import React, { useState, useEffect } from 'react';
import { LayoutDashboard, BookOpen, MessageSquare, Settings as SettingsIcon, Sun, Moon } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Vault from './components/Vault';
import AskSeth from './components/AskSeth';
import Settings from './components/Settings';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState({ total: 0, favorites: 0, read: 0, minDate: null, maxDate: null });
  const [apiKey, setApiKey] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [vaultSelectedId, setVaultSelectedId] = useState(null);

  // Load API key and theme on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key') || '';
    setApiKey(savedKey);

    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      document.body.classList.add('dark-theme');
      setIsDarkMode(true);
    } else {
      document.body.classList.remove('dark-theme');
      setIsDarkMode(false);
    }

    refreshStats();
  }, []);

  const refreshStats = async () => {
    try {
      const response = await fetch('/api/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const toggleTheme = () => {
    if (isDarkMode) {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('theme', 'light');
      setIsDarkMode(false);
    } else {
      document.body.classList.add('dark-theme');
      localStorage.setItem('theme', 'dark');
      setIsDarkMode(true);
    }
  };

  const saveApiKey = (newKey) => {
    setApiKey(newKey);
    localStorage.setItem('gemini_api_key', newKey);
  };

  // Safe navigation helper that lets Ask Seth navigate to Vault with a preselected post ID
  const selectPostAndGoToVault = (postId) => {
    setVaultSelectedId(postId);
    setActiveTab('vault');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard stats={stats} onRefreshStats={refreshStats} onSelectPost={selectPostAndGoToVault} />;
      case 'vault':
        return (
          <Vault 
            onRefreshStats={refreshStats} 
            preselectedId={vaultSelectedId}
            onClearPreselectedId={() => setVaultSelectedId(null)}
          />
        );
      case 'ask':
        return (
          <AskSeth 
            apiKey={apiKey} 
            onSelectPost={selectPostAndGoToVault}
            onNavigateToVault={() => setActiveTab('vault')}
          />
        );

      case 'settings':
        return (
          <Settings 
            apiKey={apiKey} 
            onSaveApiKey={saveApiKey} 
            onRefreshStats={refreshStats} 
          />
        );
      default:
        return <Dashboard stats={stats} onRefreshStats={refreshStats} />;
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon">SG</div>
          <div className="logo-text">
            SethGodin
            <span>Wisdom Vault</span>
          </div>
        </div>

        <nav className="nav-links">
          <li className="nav-item">
            <button 
              className={`nav-button ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <LayoutDashboard />
              Dashboard
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-button ${activeTab === 'vault' ? 'active' : ''}`}
              onClick={() => setActiveTab('vault')}
            >
              <BookOpen />
              The Vault
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-button ${activeTab === 'ask' ? 'active' : ''}`}
              onClick={() => setActiveTab('ask')}
            >
              <MessageSquare />
              Ask Seth
            </button>
          </li>

          <li className="nav-item">
            <button 
              className={`nav-button ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <SettingsIcon />
              Settings
            </button>
          </li>
        </nav>

        <div className="sidebar-footer">
          <button className="theme-toggle-btn" onClick={toggleTheme}>
            {isDarkMode ? (
              <>
                <Sun style={{ width: '18px', height: '18px', color: '#ffb800' }} />
                Light Mode
              </>
            ) : (
              <>
                <Moon style={{ width: '18px', height: '18px', color: '#6366f1' }} />
                Dark Mode
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  );
}
