import { useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export interface Citation {
  chunkId: string;
  documentId: string;
  documentTitle: string | null;
  sourceId: string;
  similarity: number;
  content: string;
}

export interface ChatStreamOptions {
  query: string;
  topK?: number;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  onToken?: (content: string) => void;
  onCitations?: (citations: Citation[]) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function useChatStream() {
  const { token } = useAuth();
  const abortControllerRef = useRef<AbortController | null>(null);

  const streamChat = useCallback(
    async (options: ChatStreamOptions): Promise<void> => {
      if (!token) {
        options.onError?.('Not authenticated');
        return;
      }

      // Abort any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(`${API_BASE_URL}/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: options.query,
            topK: options.topK || 20,
            conversationHistory: options.conversationHistory || [],
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            options.onComplete?.();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() || '';

          for (const chunk of chunks) {
            if (!chunk.trim()) continue;

            const lines = chunk.split('\n');
            let eventType = '';
            let dataStr = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.substring(7).trim();
              } else if (line.startsWith('data: ')) {
                dataStr = line.substring(6).trim();
              }
            }

            if (!eventType || !dataStr) continue;

            try {
              const data = JSON.parse(dataStr);

              if (eventType === 'token' && data.content) {
                options.onToken?.(data.content);
              } else if (eventType === 'citations' && data.citations) {
                options.onCitations?.(data.citations);
              } else if (eventType === 'error' && data.error) {
                options.onError?.(data.error);
              } else if (eventType === 'done') {
                options.onComplete?.();
              }
            } catch (parseError) {
              // Skip invalid JSON
              console.warn('Failed to parse SSE data:', parseError);
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // Stream was aborted, ignore
          return;
        }
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        options.onError?.(errorMessage);
      }
    },
    [token],
  );

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return { streamChat, abort };
}

