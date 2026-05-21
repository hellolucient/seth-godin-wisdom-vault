import React, { useState, useEffect, useRef } from 'react';
import { Search, Star, BookOpen, Inbox, RefreshCw, Bookmark, Check, Plus } from 'lucide-react';

export default function Vault({ onRefreshStats, preselectedId, onClearPreselectedId }) {
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [selectedPostId, setSelectedPostId] = useState(preselectedId || null);
  const [selectedPost, setSelectedPost] = useState(null);

  // Sync preselectedId if navigated from Ask Seth
  useEffect(() => {
    if (preselectedId) {
      setSelectedPostId(preselectedId);
      if (onClearPreselectedId) {
        onClearPreselectedId();
      }
    }
  }, [preselectedId]);
  
  // Search & Filter state
  const [search, setSearch] = useState('');
  const [filterFavorite, setFilterFavorite] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [sort, setSort] = useState('desc');
  const [offset, setOffset] = useState(0);
  const LIMIT = 25;

  const AVAILABLE_CATEGORIES = ['marketing', 'leadership', 'creativity', 'strategy', 'personal growth', 'general'];

  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  // Handle typing search with a small debounce
  const typingTimeoutRef = useRef(null);

  const fetchPostsList = async (reset = true) => {
    if (reset) {
      setLoadingList(true);
      setOffset(0);
    } else {
      setLoadingMore(true);
    }
    setError('');

    try {
      const currentOffset = reset ? 0 : offset;
      let url = `/api/posts?limit=${LIMIT}&offset=${currentOffset}&sort=${sort}&search=${encodeURIComponent(search)}`;
      
      if (filterFavorite) {
        url += '&favorite=true';
      }
      if (filterUnread) {
        url += '&readStatus=false';
      }
      if (selectedCategories.length > 0) {
        url += `&categories=${encodeURIComponent(selectedCategories.join(','))}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to load posts from the vault.');
      }
      
      const data = await response.json();
      
      if (reset) {
        setPosts(data.posts);
        // Set the first item as active automatically if we have posts
        if (data.posts.length > 0) {
          const hasSelectedInList = data.posts.some(p => p.id === selectedPostId);
          if (!hasSelectedInList) {
            setSelectedPostId(data.posts[0].id);
          }
        } else {
          setSelectedPostId(null);
        }
      } else {
        setPosts(prev => [...prev, ...data.posts]);
      }
      setTotal(data.total);
    } catch (err) {
      setError(err.message || 'An error occurred loading the vault.');
    } finally {
      setLoadingList(false);
      setLoadingMore(false);
    }
  };

  const fetchPostDetail = async (id) => {
    setLoadingDetail(true);
    try {
      const response = await fetch(`/api/posts/${id}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedPost(data);
        // Update read status in local list
        setPosts(prev => prev.map(p => p.id === id ? { ...p, read_status: true } : p));
        onRefreshStats();
      }
    } catch (err) {
      console.error('Failed to load post details:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const toggleFavoriteStatus = async (id) => {
    try {
      const response = await fetch(`/api/posts/${id}/favorite`, {
        method: 'POST',
      });
      if (response.ok) {
        const result = await response.json();
        if (selectedPost && selectedPost.id === id) {
          setSelectedPost(prev => ({ ...prev, is_favorite: result.is_favorite }));
        }
        setPosts(prev => prev.map(p => p.id === id ? { ...p, is_favorite: result.is_favorite } : p));
        onRefreshStats();
      }
    } catch (err) {
      console.error('Favorite toggle failed:', err);
    }
  };

  const toggleReadStatus = async (id) => {
    try {
      const response = await fetch(`/api/posts/${id}/read`, {
        method: 'POST',
      });
      if (response.ok) {
        const result = await response.json();
        if (selectedPost && selectedPost.id === id) {
          setSelectedPost(prev => ({ ...prev, read_status: result.read_status }));
        }
        setPosts(prev => prev.map(p => p.id === id ? { ...p, read_status: result.read_status } : p));
        onRefreshStats();
      }
    } catch (err) {
      console.error('Read toggle failed:', err);
    }
  };

  // Re-fetch when filter, sort, or search changes
  useEffect(() => {
    fetchPostsList(true);
  }, [filterFavorite, filterUnread, selectedCategories, sort]);

  // Debounced search trigger
  useEffect(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      fetchPostsList(true);
    }, 400);

    return () => clearTimeout(typingTimeoutRef.current);
  }, [search]);

  // Fetch detail when selected ID changes
  useEffect(() => {
    if (selectedPostId) {
      fetchPostDetail(selectedPostId);
    } else {
      setSelectedPost(null);
    }
  }, [selectedPostId]);

  const loadMore = () => {
    const nextOffset = offset + LIMIT;
    setOffset(nextOffset);
    fetchPostsList(false);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div>
      <div className="dashboard-header" style={{ marginBottom: '1rem' }}>
        <h1 className="dashboard-title">The Vault</h1>
        <p className="dashboard-subtitle">Search, filter, and review all extracted daily pearls.</p>
      </div>

      <div className="vault-layout">
        {/* Left Column: Post List */}
        <div className="vault-list-container">
          <div className="search-wrapper">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="Search posts..."
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filters Control Box */}
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '0.75rem',
            marginBottom: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            flexShrink: 0
          }}>
            {/* Quick Filters */}
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                className={`filter-pill ${filterFavorite ? 'active' : ''}`}
                onClick={() => setFilterFavorite(!filterFavorite)}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.25rem',
                  textTransform: 'none',
                  padding: '0.35rem 0.5rem',
                  fontSize: '0.75rem',
                  borderRadius: '6px'
                }}
              >
                <Star fill={filterFavorite ? 'var(--accent)' : 'none'} style={{ width: '11px', height: '11px', stroke: filterFavorite ? 'var(--accent)' : 'currentColor' }} />
                Favorites
              </button>
              <button
                className={`filter-pill ${filterUnread ? 'active' : ''}`}
                onClick={() => setFilterUnread(!filterUnread)}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.25rem',
                  textTransform: 'none',
                  padding: '0.35rem 0.5rem',
                  fontSize: '0.75rem',
                  borderRadius: '6px'
                }}
              >
                <BookOpen style={{ width: '11px', height: '11px' }} />
                Unread
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: 'var(--border-color)' }} />

            {/* Category Filters */}
            <div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '0.5rem',
                padding: '0 0.1rem'
              }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Categories
                </span>
                {selectedCategories.length > 0 && (
                  <button 
                    onClick={() => setSelectedCategories([])}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent)',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.4rem'
              }}>
                {AVAILABLE_CATEGORIES.map(cat => {
                  const isSelected = selectedCategories.includes(cat);
                  const displayName = cat === 'personal growth' ? 'Growth' : cat.charAt(0).toUpperCase() + cat.slice(1);
                  
                  return (
                    <button
                      key={cat}
                      className={`filter-pill ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedCategories(prev => prev.filter(c => c !== cat));
                        } else {
                          setSelectedCategories(prev => [...prev, cat]);
                        }
                      }}
                      style={{
                        padding: '0.35rem 0.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textTransform: 'none',
                        fontSize: '0.7rem',
                        borderRadius: '15px',
                        width: '100%',
                        textAlign: 'center'
                      }}
                    >
                      {displayName}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="vault-scroll-list">
            {loadingList ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <RefreshCw style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent)' }} />
              </div>
            ) : posts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                <Inbox style={{ width: '40px', height: '40px', margin: '0 auto 1rem', display: 'block', opacity: 0.5 }} />
                <p>No posts match filters.</p>
              </div>
            ) : (
              <>
                {posts.map((post) => (
                  <button
                    key={post.id}
                    className={`vault-item-card ${selectedPostId === post.id ? 'active' : ''} ${post.read_status ? 'read' : ''}`}
                    onClick={() => setSelectedPostId(post.id)}
                  >
                    <div className="vault-item-meta">
                      <span className="vault-item-date">{formatDate(post.date)}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {post.is_favorite && <Star fill="var(--accent)" stroke="var(--accent)" style={{ width: '12px', height: '12px' }} />}
                        {!post.read_status && <div className="vault-item-unread-dot" />}
                        <span className="vault-item-tag">{post.category || 'General'}</span>
                      </div>
                    </div>
                    <div className="vault-item-title">{post.title}</div>
                  </button>
                ))}
                
                {posts.length < total && (
                  <button 
                    onClick={loadMore} 
                    className="theme-toggle-btn"
                    style={{ marginTop: '1rem', borderStyle: 'dashed' }}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <RefreshCw style={{ width: '16px', height: '16px', animation: 'spin 1.5s linear infinite' }} />
                    ) : 'Load More Posts'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Column: Post Detail Reader */}
        <div className="vault-reader-pane">
          {loadingDetail ? (
            <div className="reader-empty-state">
              <RefreshCw style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent)', width: '32px', height: '32px' }} />
              <p>Opening vault contents...</p>
            </div>
          ) : selectedPost ? (
            <>
              <div className="reader-header">
                <div className="reader-meta">
                  <span className="pearl-tag">{selectedPost.category || 'General'}</span>
                  <span className="pearl-date">{formatDate(selectedPost.date)}</span>
                  
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                    <button 
                      className={`action-btn ${selectedPost.is_favorite ? 'active' : ''}`}
                      onClick={() => toggleFavoriteStatus(selectedPost.id)}
                      title={selectedPost.is_favorite ? "Remove from Favorites" : "Add to Favorites"}
                    >
                      <Star fill={selectedPost.is_favorite ? "var(--accent)" : "none"} style={{ width: '18px', height: '18px', stroke: selectedPost.is_favorite ? "var(--accent)" : "currentColor" }} />
                    </button>
                    
                    <button 
                      className="action-btn"
                      onClick={() => toggleReadStatus(selectedPost.id)}
                      title={selectedPost.read_status ? "Mark as Unread" : "Mark as Read"}
                    >
                      {selectedPost.read_status ? (
                        <Check style={{ width: '18px', height: '18px', color: 'var(--success)' }} />
                      ) : (
                        <BookOpen style={{ width: '18px', height: '18px' }} />
                      )}
                    </button>
                  </div>
                </div>

                <h2 className="reader-title">{selectedPost.title}</h2>
              </div>

              <div 
                className="reader-body"
                dangerouslySetInnerHTML={{ __html: selectedPost.content_html }}
              />
            </>
          ) : (
            <div className="reader-empty-state">
              <BookOpen className="reader-empty-icon" />
              <h3>No post selected</h3>
              <p>Select a daily message from the vault list on the left to read its full text.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
