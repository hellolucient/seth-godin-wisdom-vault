import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle, AlertCircle, RefreshCw, FileText } from 'lucide-react';

export default function Import({ onRefreshStats, onNavigateToDashboard }) {
  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(''); // started, progress, completed, error
  const [progress, setProgress] = useState({
    totalProcessed: 0,
    imported: 0,
    duplicates: 0,
    errors: 0
  });
  const [errorMsg, setErrorMsg] = useState('');
  
  const fileInputRef = useRef(null);

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
        uploadAndParseFile(droppedFile);
      } else {
        setErrorMsg('Please upload an MBOX file (.mbox format).');
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      uploadAndParseFile(selectedFile);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const uploadAndParseFile = async (selectedFile) => {
    setImporting(true);
    setStatus('started');
    setErrorMsg('');
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

      // Read SSE stream using modern stream reader
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
                setStatus('progress');
                setProgress({
                  totalProcessed: eventData.totalProcessed,
                  imported: eventData.imported,
                  duplicates: eventData.duplicates,
                  errors: eventData.errors
                });
              } else if (eventData.status === 'completed') {
                setStatus('completed');
                setProgress({
                  totalProcessed: eventData.results.totalProcessed,
                  imported: eventData.results.imported,
                  duplicates: eventData.results.duplicates,
                  errors: eventData.results.errors
                });
                onRefreshStats();
              } else if (eventData.status === 'error') {
                setStatus('error');
                setErrorMsg(eventData.message);
              }
            } catch (e) {
              // Ignore parse errors on incomplete lines or heartbeat lines
            }
          }
        }
      }

    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Error occurred uploading the mailbox file.');
    } finally {
      setImporting(false);
    }
  };

  // Helper to approximate progress (mbox files are read sequentially)
  // We don't know the total length in emails in advance, so we show total processed
  // but we can animate a continuous pulse to indicate activity.

  return (
    <div>
      <div className="dashboard-header">
        <h1 className="dashboard-title">Import Wisdom</h1>
        <p className="dashboard-subtitle">Upload your exported Gmail MBOX file to extract Seth Godin's posts.</p>
      </div>

      <div className="import-card">
        {!importing && status !== 'completed' && status !== 'error' && (
          <>
            <div 
              className={`dropzone ${dragActive ? 'active' : ''}`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={triggerFileInput}
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
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem', display: 'block' }}>
                Note: Supports large files. We stream imports to prevent memory issues.
              </span>
            </div>
            
            {errorMsg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ff3b30', justifyContent: 'center', marginBottom: '1rem' }}>
                <AlertCircle style={{ width: '18px', height: '18px' }} />
                <span>{errorMsg}</span>
              </div>
            )}
          </>
        )}

        {/* Importing Progress state */}
        {importing && (
          <div className="progress-panel">
            <div className="progress-header">
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <RefreshCw style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent)', width: '18px', height: '18px' }} />
                Processing Mailbox: {file?.name}
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

        {/* Complete State */}
        {status === 'completed' && (
          <div style={{ padding: '1rem 0' }}>
            <CheckCircle style={{ width: '64px', height: '64px', color: 'var(--success)', margin: '0 auto 1.5rem', display: 'block' }} />
            <h2 className="dropzone-title" style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Import Complete!</h2>
            <p className="dropzone-subtitle" style={{ fontSize: '1.05rem', marginBottom: '2rem' }}>
              Successfully processed <strong>{progress.totalProcessed}</strong> emails.
            </p>

            <div className="progress-stats-grid" style={{ maxWidth: '480px', margin: '0 auto 2rem' }}>
              <div className="progress-stat-box">
                <span className="progress-stat-label">Imported New</span>
                <div className="progress-stat-num" style={{ color: 'var(--success)' }}>{progress.imported}</div>
              </div>
              <div className="progress-stat-box">
                <span className="progress-stat-label">Duplicates Skipped</span>
                <div className="progress-stat-num" style={{ color: 'var(--text-secondary)' }}>{progress.duplicates}</div>
              </div>
              <div className="progress-stat-box">
                <span className="progress-stat-label">Errors</span>
                <div className="progress-stat-num" style={{ color: progress.errors > 0 ? '#ff3b30' : 'var(--text-muted)' }}>{progress.errors}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button 
                onClick={onNavigateToDashboard} 
                className="save-settings-btn"
              >
                Go to Dashboard
              </button>
              <button 
                onClick={() => setStatus('')} 
                className="theme-toggle-btn"
                style={{ width: 'auto' }}
              >
                Import Another File
              </button>
            </div>
          </div>
        )}

        {/* Error State */}
        {status === 'error' && (
          <div style={{ padding: '1rem 0' }}>
            <AlertCircle style={{ width: '64px', height: '64px', color: '#ff3b30', margin: '0 auto 1.5rem', display: 'block' }} />
            <h2 className="dropzone-title" style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Import Failed</h2>
            <p className="dropzone-subtitle" style={{ fontSize: '1.05rem', color: '#ff3b30', marginBottom: '2rem' }}>
              {errorMsg}
            </p>
            
            <button 
              onClick={() => setStatus('')} 
              className="save-settings-btn"
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse-shimmer {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
      `}} />
    </div>
  );
}
