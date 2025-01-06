import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Message } from '@db/schema';

export function useMessages(channelId: number) {
  const queryClient = useQueryClient();
  const queryKey = [`/api/channels/${channelId}/messages`];

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey,
    enabled: !!channelId,
    refetchInterval: false,
    refetchOnWindowFocus: true,
  });

  const sendMessage = useMutation({
    mutationFn: async (messageData: { content: string; parentId?: number }) => {
      const res = await fetch(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageData),
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    messages: messages || [],
    isLoading,
    sendMessage: sendMessage.mutateAsync,
  };
}