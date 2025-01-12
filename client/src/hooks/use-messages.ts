import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Message } from '@db/schema';
import { useUser } from '@/hooks/use-user';

export function useMessages(channelId: number, parentId?: number) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const queryKey = parentId 
    ? ['messages', channelId, parentId] 
    : ['messages', channelId];

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey,
    queryFn: async () => {
      const url = new URL(`/api/channels/${channelId}/messages`, window.location.origin);
      if (parentId) {
        url.searchParams.append('parentId', parentId.toString());
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    enabled: !!channelId
  });

  const reactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: number; emoji: string }) => {
      const response = await fetch(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      if (!response.ok) throw new Error('Failed to add reaction');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const sendMessage = useMutation({
    mutationFn: async ({ content, files }: { content: string, files?: File[] }) => {
      const formData = new FormData();
      formData.append('content', content);
      if (files) files.forEach(file => formData.append('files', file));

      const res = await fetch(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Failed to send message');
      return res.json();
    },
    onSuccess: (newMessage) => {
      queryClient.setQueryData<Message[]>(queryKey, (old = []) => [...old, newMessage]);
    }
  });

  const handleWebSocketMessage = (newMessage: Message) => {
    if (newMessage.userId === user?.id) return;
    queryClient.setQueryData<Message[]>(queryKey, (old = []) => [...old, newMessage]);
  };

  return {
    messages: messages || [],
    isLoading,
    sendMessage: sendMessage.mutateAsync,
    handleReaction: reactionMutation.mutate,
    handleWebSocketMessage
  };
}