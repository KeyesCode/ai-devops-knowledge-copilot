import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../hooks/useChatStream';
import './MessageList.css';

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="message-list">
      {messages.length === 0 ? (
        <div className="message-list-empty">
          <p>Start a conversation by asking a question below.</p>
        </div>
      ) : (
        messages.map((message) => (
          <div
            key={message.id}
            className={`message message-${message.role}`}
          >
            <div className="message-role">
              {message.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div className="message-content">
              {message.content || (message.isStreaming ? '...' : '')}
              {message.isStreaming && (
                <span className="message-streaming-indicator">▋</span>
              )}
            </div>
          </div>
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}

