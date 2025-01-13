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

  const sendMessage = useMutation({
    mutationFn: async ({ content, files, parentId }: { content: string, files?: File[], parentId?: number }) => {
      const formData = new FormData();
      formData.append('content', content);
      if (parentId) formData.append('parentId', parentId.toString());
      if (files) {
        files.forEach(file => formData.append('files', file));
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
        if (!oldMessages.some(m => m.id === newMessage.id)) {
          return [...oldMessages, newMessage];
        }
        return oldMessages;
      });
    },
  });

  const addReaction = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: number, emoji: string }) => {
      const res = await fetch(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ emoji }),
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      return res.json() as Promise<Message>;
    },
    onSuccess: (updatedMessage) => {
      queryClient.setQueryData<Message[]>(queryKey, (oldMessages = []) => {
        return oldMessages.map(msg => 
          msg.id === updatedMessage.id ? updatedMessage : msg
        );
      });
    },
  });

  const handleWebSocketMessage = (newMessage: Message) => {
    if (newMessage.userId === user?.id) return;

    queryClient.setQueryData<Message[]>(queryKey, (oldMessages = []) => {
      if (!oldMessages.some(m => m.id === newMessage.id)) {
        return [...oldMessages, newMessage];
      }
      return oldMessages;
    });
  };

  return {
    messages: messages || [],
    isLoading,
    sendMessage: sendMessage.mutateAsync,
    addReaction: addReaction.mutateAsync,
    handleWebSocketMessage,
  };
}