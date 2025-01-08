import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Message } from '@db/schema';
import { useUser } from '@/hooks/use-user';

export function useMessages(channelId: number, parentId?: number) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  // Different query key for thread replies vs main chat
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
      // Only update local cache if it's our own message
      if (newMessage.userId === user?.id) {
        // Update the appropriate query based on whether it's a reply or main message
        const mainQueryKey = [`/api/channels/${channelId}/messages`];
        const threadQueryKey = [`/api/channels/${channelId}/messages`, newMessage.parentId];

        // If it's a reply, update the thread messages
        if (newMessage.parentId) {
          queryClient.setQueryData<Message[]>(threadQueryKey, (oldMessages = []) => {
            return [...oldMessages, newMessage];
          });

          // Also update the reply count in the main chat
          queryClient.setQueryData<Message[]>(mainQueryKey, (oldMessages = []) => {
            return oldMessages.map(msg => 
              msg.id === newMessage.parentId
                ? { ...msg, replyCount: (msg.replyCount || 0) + 1 }
                : msg
            );
          });
        } else {
          // If it's a main message, update the main chat
          queryClient.setQueryData<Message[]>(mainQueryKey, (oldMessages = []) => {
            return [...oldMessages, newMessage];
          });
        }
      }
    },
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

  // Function to handle incoming WebSocket messages
  const handleWebSocketMessage = (newMessage: Message) => {
    // Only update cache if it's not our own message
    if (newMessage.userId !== user?.id) {
      const mainQueryKey = [`/api/channels/${channelId}/messages`];
      const threadQueryKey = [`/api/channels/${channelId}/messages`, newMessage.parentId];

      if (newMessage.parentId) {
        // Update thread if we're viewing it
        if (parentId === newMessage.parentId) {
          queryClient.setQueryData<Message[]>(threadQueryKey, (oldMessages = []) => {
            return [...oldMessages, newMessage];
          });
        }

        // Update reply count in main chat
        queryClient.setQueryData<Message[]>(mainQueryKey, (oldMessages = []) => {
          return oldMessages.map(msg => 
            msg.id === newMessage.parentId
              ? { ...msg, replyCount: (msg.replyCount || 0) + 1 }
              : msg
          );
        });
      } else {
        queryClient.setQueryData<Message[]>(mainQueryKey, (oldMessages = []) => {
          return [...oldMessages, newMessage];
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