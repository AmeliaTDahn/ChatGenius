import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      return res.json() as Promise<Message>;
    },
    onSuccess: (newMessage) => {
      queryClient.setQueryData<Message[]>(queryKey, (oldMessages = []) => {
        return [...oldMessages, newMessage];
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