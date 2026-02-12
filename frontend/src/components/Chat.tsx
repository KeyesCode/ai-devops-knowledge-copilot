import { useState, useCallback, useRef } from 'react';
import { useChatStream } from '../hooks/useChatStream';
import type { ChatMessage, Citation } from '../hooks/useChatStream';
import { useAuth } from '../contexts/AuthContext';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { CitationPanel } from './CitationPanel';
import { GitHubSync } from './GitHubSync';
import './Chat.css';

interface ChatProps {
  orgId: string;
  topK?: number;
}

export function Chat({ orgId, topK = 20 }: ChatProps) {
  const { user, logout } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [showCitations, setShowCitations] = useState(false);
  const currentMessageIdRef = useRef<string | null>(null);
  const { streamChat, abort } = useChatStream();

  const handleSend = useCallback(
    async (query: string) => {
      if (!query.trim() || isStreaming) return;

      // Add user message
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: query,
      };

      setMessages((prev) => [...prev, userMessage]);

      // Create assistant message placeholder
      const assistantMessageId = `assistant-${Date.now()}`;
      currentMessageIdRef.current = assistantMessageId;
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsStreaming(true);
      setError(null);
      setCitations([]);

      // Build conversation history
      const conversationHistory = messages
        .filter((m) => !m.isStreaming)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      try {
        await streamChat({
          query,
          topK,
          conversationHistory,
          onToken: (content: string) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: msg.content + content }
                  : msg,
              ),
            );
          },
          onCitations: (newCitations: Citation[]) => {
            setCitations(newCitations);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, isStreaming: false }
                  : msg,
              ),
            );
          },
          onError: (errorMessage: string) => {
            setError(errorMessage);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, isStreaming: false }
                  : msg,
              ),
            );
          },
          onComplete: () => {
            setIsStreaming(false);
            currentMessageIdRef.current = null;
          },
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error occurred';
        setError(errorMessage);
        setIsStreaming(false);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, isStreaming: false }
              : msg,
          ),
        );
        currentMessageIdRef.current = null;
      }
    },
    [topK, messages, isStreaming, streamChat],
  );

  const handleAbort = useCallback(() => {
    abort();
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === currentMessageIdRef.current
          ? { ...msg, isStreaming: false }
          : msg,
      ),
    );
    currentMessageIdRef.current = null;
  }, [abort]);

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="chat-header-left">
          <h1>AI DevOps Knowledge Copilot</h1>
          {user && (
            <div className="chat-user-info">
              <span className="chat-user-email">{user.email}</span>
              <span className="chat-user-org">Org: {user.orgId}</span>
              <span className="chat-user-role">({user.role})</span>
            </div>
          )}
        </div>
        <div className="chat-header-right">
          <GitHubSync />
          {citations.length > 0 && (
            <button
              className="citation-button"
              onClick={() => setShowCitations(true)}
            >
              View Sources ({citations.length})
            </button>
          )}
          <button
            className="logout-button"
            onClick={logout}
            title="Logout"
          >
            Logout
          </button>
        </div>
      </div>

      {error && (
        <div className="chat-error">
          <span>⚠️ Error: {error}</span>
          <button
            className="chat-error-close"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <div className="chat-messages-wrapper">
        <MessageList messages={messages} />
      </div>

      <div className="chat-input-wrapper">
        {isStreaming && (
          <button className="chat-abort-button" onClick={handleAbort}>
            Stop generating
          </button>
        )}
        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </div>

      <CitationPanel
        citations={citations}
        isOpen={showCitations}
        onClose={() => setShowCitations(false)}
      />
    </div>
  );
}

