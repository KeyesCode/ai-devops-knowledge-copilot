import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export interface Conversation {
  id: string;
  userId: string;
  orgId: string;
  title: string | null;
  totalTokens: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokenCount: number | null;
  citations: Array<{
    chunkId: string;
    documentId: string;
    documentTitle: string | null;
    sourceId: string;
    similarity: number;
    content: string;
  }> | null;
  createdAt: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function useConversations() {
  const { token } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/chat/conversations`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch conversations: ${response.status}`);
      }

      const data = await response.json();
      setConversations(data.conversations || []);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch conversations';
      setError(errorMessage);
      console.error('Error fetching conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const createConversation = useCallback(
    async (title?: string): Promise<Conversation | null> => {
      if (!token) return null;

      try {
        const response = await fetch(`${API_BASE_URL}/chat/conversations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ title }),
        });

        if (!response.ok) {
          throw new Error(`Failed to create conversation: ${response.status}`);
        }

        const data = await response.json();
        const newConversation = data.conversation;

        setConversations((prev) => [newConversation, ...prev]);
        return newConversation;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to create conversation';
        setError(errorMessage);
        console.error('Error creating conversation:', err);
        return null;
      }
    },
    [token],
  );

  const fetchConversation = useCallback(
    async (id: string): Promise<ConversationWithMessages | null> => {
      if (!token) return null;

      try {
        const response = await fetch(`${API_BASE_URL}/chat/conversations/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch conversation: ${response.status}`);
        }

        const data = await response.json();
        return data.conversation;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch conversation';
        setError(errorMessage);
        console.error('Error fetching conversation:', err);
        return null;
      }
    },
    [token],
  );

  const updateConversationTitle = useCallback(
    async (id: string, title: string): Promise<boolean> => {
      if (!token) return false;

      try {
        const response = await fetch(`${API_BASE_URL}/chat/conversations/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ title }),
        });

        if (!response.ok) {
          throw new Error(`Failed to update conversation: ${response.status}`);
        }

        const data = await response.json();
        const updated = data.conversation;

        setConversations((prev) =>
          prev.map((conv) => (conv.id === id ? updated : conv)),
        );
        return true;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to update conversation';
        setError(errorMessage);
        console.error('Error updating conversation:', err);
        return false;
      }
    },
    [token],
  );

  const deleteConversation = useCallback(
    async (id: string): Promise<boolean> => {
      if (!token) return false;

      try {
        const response = await fetch(`${API_BASE_URL}/chat/conversations/${id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to delete conversation: ${response.status}`);
        }

        setConversations((prev) => prev.filter((conv) => conv.id !== id));
        return true;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to delete conversation';
        setError(errorMessage);
        console.error('Error deleting conversation:', err);
        return false;
      }
    },
    [token],
  );

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const updateConversationInList = useCallback(
    (conversationId: string, updates: Partial<Conversation>) => {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId ? { ...conv, ...updates } : conv,
        ),
      );
    },
    [],
  );

  return {
    conversations,
    loading,
    error,
    fetchConversations,
    createConversation,
    fetchConversation,
    updateConversationTitle,
    deleteConversation,
    updateConversationInList,
  };
}

