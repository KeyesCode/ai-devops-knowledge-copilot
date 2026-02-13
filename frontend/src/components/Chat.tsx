import { useState, useCallback, useRef, useEffect } from 'react';
import { useChatStream } from '../hooks/useChatStream';
import type { ChatMessage, Citation } from '../hooks/useChatStream';
import { useConversations } from '../hooks/useConversations';
import { useAuth } from '../contexts/AuthContext';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { CitationPanel } from './CitationPanel';
import { ConversationSidebar } from './ConversationSidebar';
import { GitHubSync } from './GitHubSync';
import './Chat.css';

interface ChatProps {
  orgId: string;
  topK?: number;
}

export function Chat({ orgId, topK = 20 }: ChatProps) {
  const { user, logout } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [showCitations, setShowCitations] = useState(false);
  const currentMessageIdRef = useRef<string | null>(null);
  const { streamChat, abort } = useChatStream();
  const { createConversation, fetchConversation, fetchConversations, updateConversationInList } = useConversations();
  
  // Create a ref to store the refresh function for the sidebar
  const sidebarRefreshRef = useRef<(() => void) | null>(null);

  // Load conversation when selected
  useEffect(() => {
    const loadConversation = async () => {
      if (!currentConversationId) {
        setMessages([]);
        return;
      }

      const conversation = await fetchConversation(currentConversationId);
      if (conversation) {
        const chatMessages: ChatMessage[] = conversation.messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            isStreaming: false,
          }));
        setMessages(chatMessages);
      }
    };

    loadConversation();
  }, [currentConversationId, fetchConversation]);

  const handleNewConversation = useCallback(async () => {
    const newConv = await createConversation();
    if (newConv) {
      setCurrentConversationId(newConv.id);
      setMessages([]);
      setCitations([]);
      setError(null);
      // Refresh sidebar to show the new conversation
      if (sidebarRefreshRef.current) {
        sidebarRefreshRef.current();
      }
    }
  }, [createConversation]);

  const handleSelectConversation = useCallback((id: string | null) => {
    setCurrentConversationId(id);
    setCitations([]);
    setError(null);
  }, []);

  const handleSend = useCallback(
    async (query: string) => {
      if (!query.trim() || isStreaming) return;

      // Create conversation if none exists
      let conversationId = currentConversationId;
      if (!conversationId) {
        const newConv = await createConversation();
        if (newConv) {
          conversationId = newConv.id;
          setCurrentConversationId(conversationId);
        }
      }

      // Calculate current message count (excluding streaming messages)
      const currentMessageCount = messages.filter(m => !m.isStreaming).length;

      // Add user message
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: query,
      };

      setMessages((prev) => [...prev, userMessage]);

      // Optimistically update message count when user sends a message
      if (conversationId) {
        updateConversationInList(conversationId, {
          messageCount: currentMessageCount + 1, // +1 for user message
          updatedAt: new Date().toISOString(),
        });
      }

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
      
      // Optimistically update message count for assistant message (will be saved after streaming)
      if (conversationId) {
        updateConversationInList(conversationId, {
          messageCount: currentMessageCount + 2, // +1 for user, +1 for assistant
          updatedAt: new Date().toISOString(),
        });
      }
      setIsStreaming(true);
      setError(null);
      setCitations([]);

      try {
        await streamChat({
          query,
          conversationId: conversationId || undefined,
          topK,
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
          onConversationId: (id: string) => {
            // Update conversation ID if it was created server-side
            if (!currentConversationId) {
              setCurrentConversationId(id);
            }
            // Refresh conversation list to show the new conversation
            if (sidebarRefreshRef.current) {
              sidebarRefreshRef.current();
            }
          },
          onConversationUpdate: (update) => {
            // Update conversation in the list immediately with server data
            updateConversationInList(update.conversationId, {
              messageCount: update.messageCount,
              title: update.title,
              totalTokens: update.totalTokens,
              updatedAt: update.updatedAt,
            });
            // Also refresh sidebar to ensure it's in sync
            if (sidebarRefreshRef.current) {
              sidebarRefreshRef.current();
            }
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
          onComplete: async () => {
            setIsStreaming(false);
            currentMessageIdRef.current = null;
            // Reload conversation to get updated messages from server
            if (conversationId) {
              // Fetch updated conversation data immediately
              const conv = await fetchConversation(conversationId);
              if (conv) {
                const chatMessages: ChatMessage[] = conv.messages
                  .filter((m) => m.role !== 'system')
                  .map((m) => ({
                    id: m.id,
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                    isStreaming: false,
                  }));
                setMessages(chatMessages);
                
                // Update the conversation in the list with the latest data from server
                updateConversationInList(conversationId, {
                  messageCount: conv.messageCount,
                  totalTokens: conv.totalTokens,
                  title: conv.title,
                  updatedAt: conv.updatedAt,
                });
              } else {
                // If fetch fails, retry after a short delay
                setTimeout(async () => {
                  const retryConv = await fetchConversation(conversationId);
                  if (retryConv) {
                    updateConversationInList(conversationId, {
                      messageCount: retryConv.messageCount,
                      totalTokens: retryConv.totalTokens,
                      title: retryConv.title,
                      updatedAt: retryConv.updatedAt,
                    });
                  }
                }, 500);
              }
            }
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
    [topK, currentConversationId, isStreaming, streamChat, createConversation, fetchConversation, updateConversationInList],
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
      <ConversationSidebar
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onRefreshReady={(refreshFn) => {
          sidebarRefreshRef.current = refreshFn;
        }}
      />
      <div className="chat-main">
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
    </div>
  );
}

