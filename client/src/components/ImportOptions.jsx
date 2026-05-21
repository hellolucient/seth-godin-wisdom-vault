import React, { useState, useRef } from 'react';
import { 
  Rss, 
  UploadCloud, 
  Link as LinkIcon, 
  Database, 
  Download, 
  Upload, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  FileText,
  Globe,
  Table
} from 'lucide-react';

export default function ImportOptions({ onRefreshStats }) {
  const [activeSubTab, setActiveSubTab] = useState('rss');

  // Common loading / status states
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(''); // success, error
  const [message, setMessage] = useState('');
  const [results, setResults] = useState(null);

  // RSS Sync State
  const [rssUrl, setRssUrl] = useState('https://seths.blog/feed/');

  // URL Scraper State
  const [articleUrl, setArticleUrl] = useState('');

  // MBOX State
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState({
    totalProcessed: 0,
    imported: 0,
    duplicates: 0,
    errors: 0
  });
  const fileInputRef = useRef(null);

  // Backup State
  const backupInputRef = useRef(null);

  // WordPress and CSV Refs
  const wpInputRef = useRef(null);
  const csvInputRef = useRef(null);

  const resetStatus = () => {
    setLoading(false);
    setStatus('');
    setMessage('');
    setResults(null);
  };

  // RSS Feed Sync Handler
  const handleRssSync = async (e) => {
    e.preventDefault();
    if (!rssUrl.trim()) return;

    setLoading(true);
    setStatus('');
    setMessage('');
    setResults(null);

    try {
      const response = await fetch('/api/import/rss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedUrl: rssUrl.trim() })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync RSS feed.');
      }

      setStatus('success');
      setResults(data.results);
      onRefreshStats();
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'An error occurred during RSS synchronization.');
    } finally {
      setLoading(false);
    }
  };

  // Single URL Scraper Handler
  const handleUrlScrape = async (e) => {
    e.preventDefault();
    if (!articleUrl.trim()) return;

    setLoading(true);
    setStatus('');
    setMessage('');
    setResults(null);

    try {
      const response = await fetch('/api/import/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: articleUrl.trim() })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to scrape the URL.');
      }

      setStatus('success');
      setResults(data.results);
      setArticleUrl(''); // clear on success
      onRefreshStats();
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'An error occurred while scraping the article.');
    } finally {
      setLoading(false);
    }
  };

  // JSON Export Handler
  const handleExportBackup = async () => {
    setLoading(true);
    setStatus('');
    setMessage('');

    try {
      const response = await fetch('/api/export');
      if (!response.ok) {
        throw new Error('Failed to export backup data.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seth-wisdom-vault-backup-${new Date().toISOString().substring(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setStatus('success');
      setMessage('Your vault backup has been downloaded successfully.');
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'An error occurred while exporting backup.');
    } finally {
      setLoading(false);
    }
  };

  // JSON Import Handler
  const handleImportBackup = async (e) => {
    if (!e.target.files || !e.target.files[0]) return;
    const backupFile = e.target.files[0];

    setLoading(true);
    setStatus('');
    setMessage('');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const payload = JSON.parse(event.target.result);
        const response = await fetch('/api/import/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to restore backup.');
        }

        setStatus('success');
        setResults(data.results);
        onRefreshStats();
      } catch (err) {
        setStatus('error');
        setMessage(err.message || 'Invalid backup file or transmission error.');
      } finally {
        setLoading(false);
        if (backupInputRef.current) backupInputRef.current.value = ''; // clear input
      }
    };
    reader.readAsText(backupFile);
  };

  // WordPress XML Import Handler
  const handleWordpressImport = async (e) => {
    if (!e.target.files || !e.target.files[0]) return;
    const xmlFile = e.target.files[0];

    setLoading(true);
    setStatus('');
    setMessage('');
    setResults(null);

    const formData = new FormData();
    formData.append('wordpress', xmlFile);

    try {
      const response = await fetch('/api/import/wordpress', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import WordPress XML.');
      }

      setStatus('success');
      setResults(data.results);
      onRefreshStats();
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'An error occurred importing WordPress XML.');
    } finally {
      setLoading(false);
      if (wpInputRef.current) wpInputRef.current.value = '';
    }
  };

  // CSV Import Handler
  const handleCsvImport = async (e) => {
    if (!e.target.files || !e.target.files[0]) return;
    const csvFile = e.target.files[0];

    setLoading(true);
    setStatus('');
    setMessage('');
    setResults(null);

    const formData = new FormData();
    formData.append('csv', csvFile);

    try {
      const response = await fetch('/api/import/csv', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import CSV.');
      }

      setStatus('success');
      setResults(data.results);
      onRefreshStats();
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'An error occurred importing CSV.');
    } finally {
      setLoading(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  // MBOX Uploader Handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.mbox') || droppedFile.name.includes('mbox')) {
        setFile(droppedFile);
        uploadAndParseMbox(droppedFile);
      } else {
        setStatus('error');
        setMessage('Please upload an MBOX file (.mbox format).');
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      uploadAndParseMbox(selectedFile);
    }
  };

  const uploadAndParseMbox = async (selectedFile) => {
    setLoading(true);
    setStatus('progress');
    setMessage('');
    setProgress({ totalProcessed: 0, imported: 0, duplicates: 0, errors: 0 });

    const formData = new FormData();
    formData.append('mbox', selectedFile);

    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(await response.text() || 'Failed to start file upload.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop(); // keep partial line

        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.trim().substring(6));
              
              if (eventData.status === 'progress') {
                setProgress({
                  totalProcessed: eventData.totalProcessed,
                  imported: eventData.imported,
                  duplicates: eventData.duplicates,
                  errors: eventData.errors
                });
              } else if (eventData.status === 'completed') {
                setStatus('success');
                setResults({
                  totalProcessed: eventData.results.totalProcessed,
                  imported: eventData.results.imported,
                  duplicates: eventData.results.duplicates,
                  errors: eventData.results.errors
                });
                onRefreshStats();
              } else if (eventData.status === 'error') {
                setStatus('error');
                setMessage(eventData.message);
              }
            } catch (e) {
              // Ignore partial chunk parsing errors
            }
          }
        }
      }
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Error occurred uploading the mailbox file.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div className="import-tabs">
        <button 
          type="button"
          className={`import-tab-btn ${activeSubTab === 'rss' ? 'active' : ''}`}
          onClick={() => { setActiveSubTab('rss'); resetStatus(); }}
        >
          <Rss style={{ width: '16px', height: '16px' }} />
          RSS Feed Sync
        </button>
        <button 
          type="button"
          className={`import-tab-btn ${activeSubTab === 'mbox' ? 'active' : ''}`}
          onClick={() => { setActiveSubTab('mbox'); resetStatus(); }}
        >
          <UploadCloud style={{ width: '16px', height: '16px' }} />
          MBOX Upload
        </button>
        <button 
          type="button"
          className={`import-tab-btn ${activeSubTab === 'url' ? 'active' : ''}`}
          onClick={() => { setActiveSubTab('url'); resetStatus(); }}
        >
          <LinkIcon style={{ width: '16px', height: '16px' }} />
          Single URL Scraper
        </button>
        <button 
          type="button"
          className={`import-tab-btn ${activeSubTab === 'wordpress' ? 'active' : ''}`}
          onClick={() => { setActiveSubTab('wordpress'); resetStatus(); }}
        >
          <Globe style={{ width: '16px', height: '16px' }} />
          WordPress XML
        </button>
        <button 
          type="button"
          className={`import-tab-btn ${activeSubTab === 'csv' ? 'active' : ''}`}
          onClick={() => { setActiveSubTab('csv'); resetStatus(); }}
        >
          <Table style={{ width: '16px', height: '16px' }} />
          CSV Upload
        </button>
        <button 
          type="button"
          className={`import-tab-btn ${activeSubTab === 'backup' ? 'active' : ''}`}
          onClick={() => { setActiveSubTab('backup'); resetStatus(); }}
        >
          <Database style={{ width: '16px', height: '16px' }} />
          Backup & Restore
        </button>
      </div>

      <div style={{ minHeight: '220px' }}>
        {/* Loading Spinner */}
        {loading && status !== 'progress' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 0', gap: '1rem' }}>
            <RefreshCw style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent)', width: '36px', height: '36px' }} />
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {activeSubTab === 'rss' 
                ? 'Contacting RSS feed and syncing posts...' 
                : activeSubTab === 'wordpress' 
                  ? 'Parsing WordPress export XML archive...' 
                  : activeSubTab === 'csv' 
                    ? 'Parsing CSV data sheet...' 
                    : 'Scraping and analyzing blog post...'}
            </span>
          </div>
        )}

        {/* Success State */}
        {!loading && status === 'success' && (
          <div style={{ background: 'rgba(52, 199, 89, 0.05)', border: '1px solid rgba(52, 199, 89, 0.15)', borderRadius: 'var(--radius-md)', padding: '1.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            <CheckCircle style={{ width: '48px', height: '48px', color: 'var(--success)', margin: '0 auto 1rem', display: 'block' }} />
            <h4 style={{ fontWeight: 600, color: 'var(--success)', marginBottom: '0.5rem' }}>Import Action Succeeded!</h4>
            
            {results ? (
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                {results.imported !== undefined && (
                  <p>Imported <strong>{results.imported}</strong> new wisdom pieces.</p>
                )}
                {results.duplicates !== undefined && (
                  <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>Skipped <strong>{results.duplicates}</strong> duplicates already in the vault.</p>
                )}
                {results.title && (
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                    <p style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{results.title}</p>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Category: {results.category} | Date: {results.date ? results.date.substring(0, 10) : ''}</span>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{message}</p>
            )}

            <button 
              onClick={resetStatus} 
              className="theme-toggle-btn"
              style={{ marginTop: '1rem', width: 'auto', display: 'inline-block' }}
            >
              Continue Importing
            </button>
          </div>
        )}

        {/* Error State */}
        {!loading && status === 'error' && (
          <div style={{ background: 'rgba(255, 59, 48, 0.05)', border: '1px solid rgba(255, 59, 48, 0.15)', borderRadius: 'var(--radius-md)', padding: '1.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            <AlertCircle style={{ width: '48px', height: '48px', color: '#ff3b30', margin: '0 auto 1rem', display: 'block' }} />
            <h4 style={{ fontWeight: 600, color: '#ff3b30', marginBottom: '0.5rem' }}>Import Failed</h4>
            <p style={{ fontSize: '0.9rem', color: '#ff3b30' }}>{message}</p>
            
            <button 
              onClick={resetStatus} 
              className="theme-toggle-btn"
              style={{ marginTop: '1rem', width: 'auto', display: 'inline-block' }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* MBOX Progress State */}
        {status === 'progress' && (
          <div className="progress-panel" style={{ padding: '1rem' }}>
            <div className="progress-header">
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <RefreshCw style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent)', width: '18px', height: '18px' }} />
                Streaming Mailbox: {file?.name}
              </span>
              <span>Scanning...</span>
            </div>
            
            <div className="progress-bar-bg">
              <div 
                className="progress-bar-fill"
                style={{ width: '100%', animation: 'pulse-shimmer 2s infinite linear' }}
              />
            </div>

            <div className="progress-stats-grid">
              <div className="progress-stat-box">
                <span className="progress-stat-label">Processed</span>
                <div className="progress-stat-num">{progress.totalProcessed}</div>
              </div>
              <div className="progress-stat-box" style={{ borderColor: 'var(--success)' }}>
                <span className="progress-stat-label" style={{ color: 'var(--success)' }}>Imported</span>
                <div className="progress-stat-num" style={{ color: 'var(--success)' }}>{progress.imported}</div>
              </div>
              <div className="progress-stat-box" style={{ borderColor: 'var(--accent)' }}>
                <span className="progress-stat-label" style={{ color: 'var(--accent)' }}>Duplicates</span>
                <div className="progress-stat-num" style={{ color: 'var(--accent)' }}>{progress.duplicates}</div>
              </div>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center' }}>
              Reading emails and cleaning footers. Please keep this tab open...
            </p>
          </div>
        )}

        {/* SUBTAB 1: RSS Feed Sync */}
        {!loading && status === '' && activeSubTab === 'rss' && (
          <form onSubmit={handleRssSync} className="form-group">
            <p className="settings-description" style={{ marginBottom: '1rem' }}>
              Automating ingestion by querying the active blog RSS feed. This will scan for new daily posts, clean up footer links, and auto-categorize them.
            </p>
            <label className="form-label">RSS Feed URL</label>
            <input 
              type="url" 
              className="form-input" 
              value={rssUrl} 
              onChange={(e) => setRssUrl(e.target.value)} 
              required 
            />
            <div style={{ marginTop: '1rem' }}>
              <button type="submit" className="save-settings-btn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Rss style={{ width: '16px', height: '16px' }} />
                Sync RSS Feed
              </button>
            </div>
          </form>
        )}

        {/* SUBTAB 2: MBOX Upload */}
        {!loading && status === '' && activeSubTab === 'mbox' && (
          <div 
            className={`dropzone ${dragActive ? 'active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current.click()}
            style={{ padding: '2rem 1.5rem', marginBottom: '0' }}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              accept=".mbox"
              onChange={handleFileChange}
            />
            <UploadCloud className="dropzone-icon" />
            <h3 className="dropzone-title">Drag & Drop MBOX file</h3>
            <p className="dropzone-subtitle">or click to browse your local filesystem</p>
          </div>
        )}

        {/* SUBTAB 3: URL Scraper */}
        {!loading && status === '' && activeSubTab === 'url' && (
          <form onSubmit={handleUrlScrape} className="form-group">
            <p className="settings-description" style={{ marginBottom: '1rem' }}>
              Import a specific blog post immediately by entering its URL below. The server will extract and format the post content.
            </p>
            <label className="form-label">Blog Post URL</label>
            <input 
              type="url" 
              className="form-input" 
              placeholder="https://seths.blog/YYYY/MM/post-title-slug/" 
              value={articleUrl} 
              onChange={(e) => setArticleUrl(e.target.value)} 
              required 
            />
            <div style={{ marginTop: '1rem' }}>
              <button type="submit" className="save-settings-btn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LinkIcon style={{ width: '16px', height: '16px' }} />
                Scrape & Import URL
              </button>
            </div>
          </form>
        )}

        {/* SUBTAB: WordPress XML */}
        {!loading && status === '' && activeSubTab === 'wordpress' && (
          <div>
            <p className="settings-description" style={{ marginBottom: '1rem' }}>
              Import posts directly from a WordPress XML export file (WXR format). Drafts and non-post assets will be automatically skipped.
            </p>
            <div 
              className="dropzone"
              onClick={() => wpInputRef.current.click()}
              style={{ padding: '2rem 1.5rem', marginBottom: '0', cursor: 'pointer' }}
            >
              <input
                ref={wpInputRef}
                type="file"
                className="file-input"
                accept=".xml"
                onChange={handleWordpressImport}
                style={{ display: 'none' }}
              />
              <Globe className="dropzone-icon" style={{ color: 'var(--accent)' }} />
              <h3 className="dropzone-title">Upload WordPress XML Archive</h3>
              <p className="dropzone-subtitle">Click to select a .xml file from your device</p>
            </div>
          </div>
        )}

        {/* SUBTAB: CSV Upload */}
        {!loading && status === '' && activeSubTab === 'csv' && (
          <div>
            <p className="settings-description" style={{ marginBottom: '1rem' }}>
              Upload a bulk list of posts using a CSV file. Use our official CSV template to format your columns properly.
            </p>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <a 
                href="/api/templates/csv" 
                download
                className="theme-toggle-btn"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', width: 'auto', fontSize: '0.85rem' }}
              >
                <Download style={{ width: '16px', height: '16px' }} />
                Download CSV Template
              </a>
            </div>

            <div 
              className="dropzone"
              onClick={() => csvInputRef.current.click()}
              style={{ padding: '2rem 1.5rem', marginBottom: '0', cursor: 'pointer' }}
            >
              <input
                ref={csvInputRef}
                type="file"
                className="file-input"
                accept=".csv"
                onChange={handleCsvImport}
                style={{ display: 'none' }}
              />
              <Table className="dropzone-icon" style={{ color: 'var(--accent)' }} />
              <h3 className="dropzone-title">Upload Completed CSV Template</h3>
              <p className="dropzone-subtitle">Click to select a .csv file from your device</p>
            </div>
          </div>
        )}

        {/* SUBTAB 4: Backup & Restore */}
        {!loading && status === '' && activeSubTab === 'backup' && (
          <div>
            <p className="settings-description">
              Maintain full ownership and portability of your curated Seth Godin Vault. Export your database to a portable JSON file, or restore a previously saved backup file.
            </p>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button 
                onClick={handleExportBackup} 
                className="save-settings-btn"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Download style={{ width: '16px', height: '16px' }} />
                Export Vault JSON
              </button>

              <button 
                onClick={() => backupInputRef.current.click()} 
                className="theme-toggle-btn"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: 'auto' }}
              >
                <Upload style={{ width: '16px', height: '16px' }} />
                Restore JSON Backup
              </button>
              
              <input
                ref={backupInputRef}
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse-shimmer {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
}
