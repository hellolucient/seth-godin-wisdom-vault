import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, AlertCircle, RefreshCw, MessageSquare } from 'lucide-react';

export default function AskSeth({ apiKey, onSelectPost, onNavigateToVault }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'seth',
      text: "I've written thousands of daily posts over the years. What are you working on today? Drop in a question about marketing, leadership, creativity, or team building, and let's see what we can find.",
      sources: []
    }
  ]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim() || loading) return;

    const userMsg = question.trim();
    setQuestion('');
    setMessages(prev => [...prev, { id: `user-${Date.now()}`, sender: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: userMsg,
          userApiKey: apiKey // send if user pasted it in Settings
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text() || 'Failed to connect to Seth\'s database.');
      }

      const data = await response.json();
      setMessages(prev => [...prev, {
        id: `seth-${Date.now()}`,
        sender: 'seth',
        text: data.answer,
        sources: data.sources || []
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        sender: 'seth',
        text: `Oops, I ran into an error connecting to the wisdom engine: ${error.message}`,
        isError: true
      }]);
    } finally {
      setLoading(false);
    }
  };

  // Safe client-side markdown formatter
  const formatMarkdown = (text) => {
    if (!text) return '';
    
    // Escape HTML to prevent injection
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Bold text (**text**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Bullet points starting with * or -
    html = html.replace(/^\s*[\*\-]\s+(.*)$/gm, '<li>$1</li>');
    
    // Wrap lists in <ul> tags
    // This is a simple regex that finds contiguous <li> tags and wraps them
    html = html.replace(/(<li>.*<\/li>)/gs, (match) => `<ul>${match}</ul>`);

    // Clean up adjacent double lists if they occur
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    // Paragraphs (split double newlines)
    html = html.split(/\n\n+/).map(p => {
      // If it already starts with a block tag, don't wrap in p
      if (p.trim().startsWith('<ul>') || p.trim().startsWith('<li>')) return p;
      return `<p>${p.trim().replace(/\n/g, '<br>')}</p>`;
    }).join('');

    return html;
  };

  const handleSourceClick = (sourceId) => {
    if (onSelectPost) {
      onSelectPost(sourceId);
      if (onNavigateToVault) {
        onNavigateToVault();
      }
    }
  };

  return (
    <div>
      <div className="dashboard-header" style={{ marginBottom: '1.5rem' }}>
        <h1 className="dashboard-title">Ask Seth</h1>
        <p className="dashboard-subtitle">Consult the vaulted wisdom to get direct answers to your marketing and business questions.</p>
      </div>

      <div className="ask-container">
        <div className="ask-header">
          <div className="pearl-avatar">SG</div>
          <div>
            <span className="ask-header-title">Consulting the Vault</span>
            <span className="pearl-author-title">Gemini Synthesis Enabled</span>
          </div>
          <Sparkles style={{ marginLeft: 'auto', color: 'var(--accent)' }} />
        </div>

        <div className="ask-body">
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-bubble ${msg.sender} ${msg.isError ? 'error' : ''}`}>
              {msg.sender === 'seth' ? (
                <>
                  <div dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.text) }} />
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="chat-sources">
                      <span className="chat-sources-title">References in your Vault:</span>
                      <div className="chat-sources-list">
                        {msg.sources.map((src) => (
                          <button
                            key={src.id}
                            className="chat-source-tag"
                            onClick={() => handleSourceClick(src.id)}
                            title={`Read "${src.title}"`}
                          >
                            "{src.title}" ({new Date(src.date).toLocaleDateString('en-US', { year: '2-digit', month: 'short' })})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p>{msg.text}</p>
              )}
            </div>
          ))}

          {loading && (
            <div className="chat-bubble seth" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.5rem' }}>
              <RefreshCw style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent)', width: '16px', height: '16px' }} />
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Thinking in paragraphs...</span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        <form className="ask-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Ask a question about marketing, team building, or creativity..."
            className="ask-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={loading}
          />
          <button 
            type="submit" 
            className="ask-submit-btn" 
            disabled={loading || !question.trim()}
          >
            <Send style={{ width: '18px', height: '18px' }} />
          </button>
        </form>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .chat-bubble.error {
          border-left: 4px solid #ff3b30;
          background: rgba(255, 59, 48, 0.05);
        }
        .chat-bubble.seth ul {
          margin: 0.75rem 0 0.75rem 1.5rem;
          padding-left: 0.5rem;
        }
        .chat-bubble.seth li {
          margin-bottom: 0.4rem;
        }
      `}} />
    </div>
  );
}
