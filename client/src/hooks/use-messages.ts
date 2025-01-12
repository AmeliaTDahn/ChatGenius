import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Message } from '@db/schema';
import { useUser } from '@/hooks/use-user';

export function useMessages(channelId: number, parentId?: number) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const queryKey = parentId
    ? [`/api/channels/${channelId}/messages`, parentId]
    : [`/api/channels/${channelId}/messages`];

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey,
    queryFn: async () => {
      const url = new URL(`/api/channels/${channelId}/messages`, window.location.origin);
      if (parentId) {
        url.searchParams.append('parentId', parentId.toString());
      }
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const handleWebSocketMessage = (newMessage: Message) => {
    if (newMessage.channelId !== channelId) return;

    queryClient.setQueryData<Message[]>(queryKey, (oldMessages = []) => {
      if (!oldMessages.some((m) => m.id === newMessage.id)) {
        return [...oldMessages, newMessage];
      }
      return oldMessages.map((m) =>
        m.id === newMessage.parentId
          ? { ...m, replyCount: (m.replyCount || 0) + 1 }
          : m
      );
    });
  };

  return { messages, isLoading, handleWebSocketMessage };
}
