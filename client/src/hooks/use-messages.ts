import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Message } from '@db/schema';
import { useUser } from '@/hooks/use-user';

export function useMessages(channelId: number, parentId?: number) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const queryKey = parentId 
    ? [`/api/channels/${channelId}/messages`, parentId] 
    : [`/api/channels/${channelId}/messages`];

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey,
    queryFn: async () => {
      const url = new URL(`/api/channels/${channelId}/messages`, window.location.origin);
      if (parentId) {
        url.searchParams.append('parentId', parentId.toString());
      }
      const res = await fetch(url, {
        credentials: 'include'
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      return res.json();
    },
    enabled: !!channelId,
    refetchInterval: false,
    refetchOnWindowFocus: true
  });

  const addReaction = useMutation({
    mutationFn: async (params: { messageId: number, emoji: string }) => {
      const res = await fetch(`/api/messages/${params.messageId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji: params.emoji }),
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      return res.json() as Promise<Message>;
    },
    onSuccess: (updatedMessage) => {
      queryClient.setQueryData<Message[]>(queryKey, (oldMessages = []) => {
        return oldMessages.map((msg) =>
          msg.id === updatedMessage.id ? updatedMessage : msg
        );
      });
    },
  });

  const sendMessage = useMutation({
    mutationFn: async ({ content, files, parentId }: { content: string, files?: File[], parentId?: number }) => {
      const formData = new FormData();
      formData.append('content', content);
      if (parentId) {
        formData.append('parentId', parentId.toString());
      }

      if (files && files.length > 0) {
        files.forEach(file => {
          formData.append('files', file);
        });
      }

      const res = await fetch(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      return res.json() as Promise<Message>;
    },
    onSuccess: (newMessage) => {
      // Immediately update UI with our own message
      if (newMessage.parentId) {
        // If it's a reply, add it to the thread
        queryClient.setQueryData<Message[]>(queryKey, (oldMessages = []) => {
          if (!oldMessages.some(m => m.id === newMessage.id)) {
            return [...oldMessages, newMessage];
          }
          return oldMessages;
        });

        // Update reply count in main chat
        const mainQueryKey = [`/api/channels/${channelId}/messages`];
        queryClient.setQueryData<Message[]>(mainQueryKey, (oldMessages = []) => {
          return oldMessages.map(msg => 
            msg.id === newMessage.parentId
              ? { ...msg, replyCount: (msg.replyCount || 0) + 1 }
              : msg
          );
        });
      } else {
        // If it's a main message, add it to the main chat
        queryClient.setQueryData<Message[]>(queryKey, (oldMessages = []) => {
          if (!oldMessages.some(m => m.id === newMessage.id)) {
            return [...oldMessages, newMessage];
          }
          return oldMessages;
        });
      }
    }
  });

  const markAsRead = useMutation({
    mutationFn: async (messageId: number) => {
      const res = await fetch(`/api/messages/${messageId}/read`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      return res.json() as Promise<Message>;
    },
    onSuccess: (updatedMessage) => {
      queryClient.setQueryData<Message[]>(queryKey, (oldMessages = []) => {
        return oldMessages.map((msg) =>
          msg.id === updatedMessage.id ? updatedMessage : msg
        );
      });
    },
  });

  const handleWebSocketMessage = (newMessage: Message) => {
    // Handle all incoming messages via WebSocket
      if (newMessage.parentId) {
        // If we're viewing the thread that received a reply
        if (parentId === newMessage.parentId) {
          queryClient.setQueryData<Message[]>(queryKey, (oldMessages = []) => {
            if (!oldMessages.some(m => m.id === newMessage.id)) {
              return [...oldMessages, newMessage];
            }
            return oldMessages;
          });
        }

        // Update reply count in main chat
        const mainQueryKey = [`/api/channels/${channelId}/messages`];
        queryClient.setQueryData<Message[]>(mainQueryKey, (oldMessages = []) => {
          return oldMessages.map(msg => 
            msg.id === newMessage.parentId
              ? { ...msg, replyCount: (msg.replyCount || 0) + 1 }
              : msg
          );
        });
      } else {
        // Handle main chat messages from other users
        queryClient.setQueryData<Message[]>(queryKey, (oldMessages = []) => {
          if (!oldMessages.some(m => m.id === newMessage.id)) {
            return [...oldMessages, newMessage];
          }
          return oldMessages;
        });
      }
    }
  };

  return {
    messages: messages || [],
    isLoading,
    sendMessage: sendMessage.mutateAsync,
    addReaction: addReaction.mutateAsync,
    markAsRead: markAsRead.mutateAsync,
    handleWebSocketMessage,
  };
}