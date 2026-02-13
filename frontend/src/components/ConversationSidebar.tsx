import { useState, useEffect } from 'react';
import { useConversations } from '../hooks/useConversations';
import './ConversationSidebar.css';

interface ConversationSidebarProps {
  currentConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
  onNewConversation: () => void;
  onRefreshReady?: (refreshFn: () => void) => void;
}

export function ConversationSidebar({
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onRefreshReady,
}: ConversationSidebarProps) {
  const {
    conversations,
    loading,
    error,
    deleteConversation,
    updateConversationTitle,
    fetchConversations,
  } = useConversations();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Expose refresh function to parent
  useEffect(() => {
    if (onRefreshReady) {
      onRefreshReady(() => {
        fetchConversations();
      });
    }
  }, [onRefreshReady, fetchConversations]);

  const handleEdit = (id: string, currentTitle: string | null) => {
    setEditingId(id);
    setEditTitle(currentTitle || '');
  };

  const handleSave = async (id: string) => {
    if (editTitle.trim()) {
      await updateConversationTitle(id, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle('');
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this conversation?')) {
      await deleteConversation(id);
      if (currentConversationId === id) {
        onSelectConversation(null);
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="conversation-sidebar">
      <div className="conversation-sidebar-header">
        <h2>Conversations</h2>
        <div className="conversation-sidebar-header-actions">
          <button
            className="new-conversation-button"
            onClick={onNewConversation}
            title="New Conversation"
          >
            +
          </button>
        </div>
      </div>

      {error && (
        <div className="conversation-sidebar-error">
          <span>⚠️ {error}</span>
        </div>
      )}

      {loading ? (
        <div className="conversation-sidebar-loading">Loading...</div>
      ) : conversations.length === 0 ? (
        <div className="conversation-sidebar-empty">
          <p>No conversations yet</p>
          <button onClick={onNewConversation}>Start a conversation</button>
        </div>
      ) : (
        <div className="conversation-list">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`conversation-item ${
                currentConversationId === conv.id ? 'active' : ''
              }`}
              onClick={() => onSelectConversation(conv.id)}
            >
              {editingId === conv.id ? (
                <div className="conversation-edit">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => handleSave(conv.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSave(conv.id);
                      } else if (e.key === 'Escape') {
                        setEditingId(null);
                        setEditTitle('');
                      }
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : (
                <>
                  <div className="conversation-item-content">
                    <div className="conversation-title">
                      {conv.title || 'New Conversation'}
                    </div>
                    <div className="conversation-meta">
                      <span>{conv.messageCount} messages</span>
                      <span>•</span>
                      <span>{formatDate(conv.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="conversation-actions">
                    <button
                      className="conversation-edit-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(conv.id, conv.title);
                      }}
                      title="Rename"
                    >
                      ✏️
                    </button>
                    <button
                      className="conversation-delete-button"
                      onClick={(e) => handleDelete(conv.id, e)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

