import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Message } from '@db/schema';
import { useUser } from '@/hooks/use-user';

export function useMessages(channelId: number) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const queryKey = [`/api/channels/${channelId}/messages`];

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey,
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
      queryClient.setQueryData<Message[]>(queryKey, (oldMessages = []) => {
        // Add the new message to the end of the list
        const updatedMessages = [...(oldMessages || [])];

        // If this is a reply, increment the parent message's reply count
        if (newMessage.parentId) {
          const parentIndex = updatedMessages.findIndex(m => m.id === newMessage.parentId);
          if (parentIndex !== -1) {
            updatedMessages[parentIndex] = {
              ...updatedMessages[parentIndex],
              replyCount: (updatedMessages[parentIndex].replyCount || 0) + 1
            };
          }
        }

        return [...updatedMessages, newMessage];
      });
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

  return {
    messages: messages || [],
    isLoading,
    sendMessage: sendMessage.mutateAsync,
    addReaction: addReaction.mutateAsync,
    markAsRead: markAsRead.mutateAsync,
  };
}