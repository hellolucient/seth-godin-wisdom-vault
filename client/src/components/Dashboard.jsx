import React, { useState, useEffect } from 'react';
import { BookOpen, Star, Sparkles, RefreshCw, Calendar, Eye, ArrowRight, Check, Plus, X } from 'lucide-react';

const AVAILABLE_CATEGORIES = ['marketing', 'leadership', 'creativity', 'strategy', 'personal growth', 'general'];

export default function Dashboard({ stats, onRefreshStats, onSelectPost }) {
  const [pearl, setPearl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState('');
  
  // Favorites Modal State
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [favoritesList, setFavoritesList] = useState([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);

  // Load selected categories from localStorage, defaulting to all categories if empty
  const [selectedCategories, setSelectedCategories] = useState(() => {
    try {
      const saved = localStorage.getItem('pearl_categories');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to parse saved categories:', e);
    }
    return AVAILABLE_CATEGORIES;
  });

  const fetchRandomPearl = async (isRotate = false, categoriesList = selectedCategories) => {
    if (isRotate) setRotating(true);
    else setLoading(true);
    
    setError('');
    try {
      const apiKey = localStorage.getItem('gemini_api_key') || '';
      
      // If categoriesList is empty, default to querying all categories
      const activeCats = categoriesList.length > 0 ? categoriesList : AVAILABLE_CATEGORIES;
      const categoriesParam = activeCats.join(',');
      
      const url = `/api/posts/random?categories=${encodeURIComponent(categoriesParam)}&userApiKey=${encodeURIComponent(apiKey)}`;
        
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(await response.text() || 'Failed to fetch a pearl of wisdom.');
      }
      const data = await response.json();
      setPearl(data);
      
      // Cache pearl in session storage so it persists during tab changes in the same session
      sessionStorage.setItem('daily_pearl', JSON.stringify(data));
    } catch (err) {
      setError(err.message || 'No wisdom vaulted yet. Go to the Import tab to load Seth Godin emails!');
      setPearl(null);
    } finally {
      setLoading(false);
      setTimeout(() => setRotating(false), 600);
    }
  };

  const handleToggleCategory = (cat) => {
    let updated;
    if (selectedCategories.includes(cat)) {
      // Don't let user deselect the last category (keep at least one active)
      if (selectedCategories.length === 1) return;
      updated = selectedCategories.filter(c => c !== cat);
    } else {
      updated = [...selectedCategories, cat];
    }
    
    setSelectedCategories(updated);
    localStorage.setItem('pearl_categories', JSON.stringify(updated));
    fetchRandomPearl(false, updated);
  };

  const togglePearlFavorite = async () => {
    if (!pearl) return;
    try {
      const response = await fetch(`/api/posts/${pearl.id}/favorite`, {
        method: 'POST',
      });
      if (response.ok) {
        const result = await response.json();
        const updatedPearl = { ...pearl, is_favorite: result.is_favorite };
        setPearl(updatedPearl);
        sessionStorage.setItem('daily_pearl', JSON.stringify(updatedPearl));
        onRefreshStats();
      }
    } catch (err) {
      console.error('Failed to favorite:', err);
    }
  };

  // Open favorites modal and load favorite pearls
  const openFavoritesModal = async () => {
    setShowFavoritesModal(true);
    setLoadingFavorites(true);
    try {
      const response = await fetch('/api/posts?favorite=true&limit=100');
      if (response.ok) {
        const data = await response.json();
        setFavoritesList(data.posts || []);
      }
    } catch (e) {
      console.error('Failed to load favorites:', e);
    } finally {
      setLoadingFavorites(false);
    }
  };

  // Unfavorite direct from favorites list
  const handleRemoveFavorite = async (postId) => {
    try {
      const response = await fetch(`/api/posts/${postId}/favorite`, {
        method: 'POST',
      });
      if (response.ok) {
        setFavoritesList(prev => prev.filter(p => p.id !== postId));
        onRefreshStats();
        
        // Synchronize state if the active daily pearl got unfavorited
        if (pearl && pearl.id === postId) {
          const updatedPearl = { ...pearl, is_favorite: false };
          setPearl(updatedPearl);
          sessionStorage.setItem('daily_pearl', JSON.stringify(updatedPearl));
        }
      }
    } catch (err) {
      console.error('Failed to remove favorite:', err);
    }
  };

  // Helper to extract a clean quote / snippet
  const getPearlText = (post) => {
    if (post.summary && post.summary.trim() !== '') {
      return post.summary;
    }
    if (!post.content_text) return '';
    const cleanText = post.content_text.replace(/\s+/g, ' ').trim();
    const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
    
    let summary = '';
    for (const sentence of sentences) {
      if ((summary + ' ' + sentence).length > 220) {
        if (summary === '') {
          summary = sentence.substring(0, 217) + '...';
        } else {
          summary += '...';
        }
        break;
      }
      summary = (summary + ' ' + sentence).trim();
    }
    
    if (!summary) {
      summary = cleanText.substring(0, 220) + (cleanText.length > 220 ? '...' : '');
    }
    return summary;
  };

  // Load pearl on mount (checks session cache first to prevent refreshing on tab switches)
  useEffect(() => {
    const cachedPearl = sessionStorage.getItem('daily_pearl');
    if (cachedPearl) {
      try {
        setPearl(JSON.parse(cachedPearl));
        setLoading(false);
        return;
      } catch (e) {
        console.warn('Failed to parse cached daily pearl:', e);
      }
    }
    fetchRandomPearl();
  }, []);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div>
      <div className="dashboard-header">
        <h1 className="dashboard-title">Wisdom Vault</h1>
        <p className="dashboard-subtitle">Years of daily marketing insights and provocations from Seth Godin.</p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper">
            <BookOpen />
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.total || 0}</span>
            <span className="stat-label">Vaulted Posts</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper">
            <Eye />
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.read || 0}</span>
            <span className="stat-label">Read Posts</span>
          </div>
        </div>

        {/* Favorites Stat Card (Now Clickable/Interactive) */}
        <div 
          className="stat-card interactive-favorites-card"
          onClick={openFavoritesModal}
          title="View all your Favorite Pearls"
          style={{
            cursor: 'pointer',
            transition: 'var(--transition)'
          }}
        >
          <div className="stat-icon-wrapper" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
            <Star fill="var(--accent)" style={{ stroke: 'var(--accent)' }} />
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.favorites || 0}</span>
            <span className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              Favorites <ArrowRight style={{ width: '12px', height: '12px', opacity: 0.7 }} />
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper">
            <Calendar />
          </div>
          <div className="stat-info">
            <span className="stat-number" style={{ fontSize: '1rem', fontWeight: 600 }}>
              {stats.minDate && stats.maxDate 
                ? `${new Date(stats.minDate).getFullYear()} - ${new Date(stats.maxDate).getFullYear()}`
                : 'No Data'
              }
            </span>
            <span className="stat-label">Span Covered</span>
          </div>
        </div>
      </div>

      {/* Daily Pearl Section Header with Category Multi-select Pills */}
      <div style={{ marginTop: '2.5rem', marginBottom: '1.5rem' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '1rem', 
          marginBottom: '1rem' 
        }}>
          <h2 className="pearl-section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles style={{ color: 'var(--accent)' }} /> 
            Daily Pearl of Wisdom
          </h2>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {AVAILABLE_CATEGORIES.map(cat => {
            const isSelected = selectedCategories.includes(cat);
            // Capitalize category name for presentation
            const displayName = cat.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            
            return (
              <button
                key={cat}
                onClick={() => handleToggleCategory(cat)}
                style={{
                  padding: '0.45rem 1.15rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  borderRadius: '30px',
                  border: '1px solid',
                  borderColor: isSelected ? 'var(--accent)' : 'var(--border-color)',
                  background: isSelected ? 'var(--accent-light)' : 'var(--bg-secondary)',
                  color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'var(--transition)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  boxShadow: isSelected ? 'none' : 'var(--shadow-sm)'
                }}
              >
                {isSelected ? (
                  <Check style={{ width: '13px', height: '13px', strokeWidth: 3 }} />
                ) : (
                  <Plus style={{ width: '13px', height: '13px', strokeWidth: 3 }} />
                )}
                {displayName}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="pearl-card" style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
          <RefreshCw className="animate-spin" style={{ width: '40px', height: '40px', color: 'var(--accent)', animation: 'spin 1.5s linear infinite' }} />
        </div>
      ) : error ? (
        <div className="pearl-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '1.1rem' }}>{error}</p>
        </div>
      ) : pearl ? (
        <div className="pearl-card">
          <div className="pearl-meta">
            <span className="pearl-tag">{pearl.category || 'General'}</span>
            <span className="pearl-date">{formatDate(pearl.date)}</span>
          </div>
          
          <h3 className="pearl-title">{pearl.title}</h3>
          
          {/* Displaying the punchy verbatim quote */}
          <div className="pearl-body" style={{ fontStyle: 'italic', borderLeft: '3px solid var(--accent)', paddingLeft: '1.25rem', color: 'var(--text-primary)', marginBottom: '1.5rem' }}>
            <p style={{ margin: 0, lineHeight: 1.7 }}>
              "{pearl.summary}"
            </p>
          </div>

          {onSelectPost && (
            <button 
              className="pearl-read-more-btn"
              onClick={() => onSelectPost(pearl.id)}
              style={{ marginTop: '0.5rem', marginBottom: '2rem' }}
            >
              Read Full Article in the Vault <ArrowRight style={{ width: '16px', height: '16px' }} />
            </button>
          )}

          <div className="pearl-footer">
            <div className="pearl-author-info">
              <div className="pearl-avatar">SG</div>
              <div>
                <span className="pearl-author-name">Seth Godin</span>
                <span className="pearl-author-title">Author & Blogger</span>
              </div>
            </div>

            <div className="pearl-actions">
              <button 
                className={`action-btn ${pearl.is_favorite ? 'active' : ''}`}
                onClick={togglePearlFavorite}
                title={pearl.is_favorite ? "Remove from Favorites" : "Add to Favorites"}
              >
                <Star fill={pearl.is_favorite ? "var(--accent)" : "none"} style={{ width: '18px', height: '18px', stroke: pearl.is_favorite ? "var(--accent)" : "currentColor" }} />
              </button>
              
              <button 
                className="refresh-pearl-btn"
                onClick={() => fetchRandomPearl(true)}
                disabled={rotating}
              >
                <RefreshCw style={{ 
                  width: '16px', 
                  height: '16px', 
                  animation: rotating ? 'spin 0.6s cubic-bezier(0.4, 0, 0.2, 1) infinite' : 'none'
                }} />
                Reveal Another Pearl
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* --- FAVORITES OVERLAY MODAL --- */}
      {showFavoritesModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '1.5rem'
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: '700px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
            animation: 'modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.5rem',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Star fill="var(--accent)" style={{ stroke: 'var(--accent)', width: '20px', height: '20px' }} />
                Your Favorite Pearls
              </h2>
              <button 
                onClick={() => setShowFavoritesModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  transition: 'var(--transition)'
                }}
                className="close-hover-btn"
              >
                <X style={{ width: '22px', height: '22px' }} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{
              padding: '1.5rem',
              overflowY: 'auto',
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}>
              {loadingFavorites ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                  <RefreshCw className="animate-spin" style={{ width: '32px', height: '32px', color: 'var(--accent)', animation: 'spin 1.5s linear infinite' }} />
                </div>
              ) : favoritesList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '0', fontSize: '1.05rem' }}>
                    No favorites saved yet.
                  </p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    Tap the star icon on any pearl or vault post to save your favorite takeaways here!
                  </p>
                </div>
              ) : (
                favoritesList.map(post => (
                  <div 
                    key={post.id}
                    style={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1.25rem',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="pearl-tag" style={{ margin: 0, padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}>
                          {post.category || 'General'}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {formatDate(post.date)}
                        </span>
                      </div>
                      
                      <button
                        onClick={() => handleRemoveFavorite(post.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent)',
                          cursor: 'pointer',
                          padding: '0.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '50%'
                        }}
                        title="Remove from Favorites"
                      >
                        <Star fill="var(--accent)" style={{ stroke: 'var(--accent)', width: '16px', height: '16px' }} />
                      </button>
                    </div>

                    <h4 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      {post.title}
                    </h4>

                    {/* Verbatim quote snippet */}
                    <p style={{ 
                      fontSize: '0.95rem', 
                      lineHeight: 1.6, 
                      color: 'var(--text-secondary)', 
                      fontStyle: 'italic', 
                      margin: 0,
                      borderLeft: '2px solid var(--accent)',
                      paddingLeft: '0.75rem'
                    }}>
                      "{getPearlText(post)}"
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                      <button 
                        onClick={() => {
                          setShowFavoritesModal(false);
                          onSelectPost(post.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent)',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: 0
                        }}
                      >
                        Read Full Article <ArrowRight style={{ width: '14px', height: '14px' }} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .stat-card.interactive-favorites-card:hover {
          transform: translateY(-3px);
          border-color: var(--accent);
          box-shadow: 0 8px 24px var(--accent-light);
        }
        .close-hover-btn:hover {
          background: var(--bg-primary);
          color: var(--text-primary) !important;
        }
      `}} />
    </div>
  );
}
