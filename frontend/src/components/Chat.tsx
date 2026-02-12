import { useState, useCallback, useRef } from 'react';
import { useChatStream } from '../hooks/useChatStream';
import type { ChatMessage, Citation } from '../hooks/useChatStream';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { CitationPanel } from './CitationPanel';
import './Chat.css';

interface ChatProps {
  orgId: string;
  topK?: number;
}

export function Chat({ orgId, topK = 10 }: ChatProps) {
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
          orgId,
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
    [orgId, topK, messages, isStreaming, streamChat],
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
        <h1>AI DevOps Knowledge Copilot</h1>
        {citations.length > 0 && (
          <button
            className="citation-button"
            onClick={() => setShowCitations(true)}
          >
            View Sources ({citations.length})
          </button>
        )}
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

