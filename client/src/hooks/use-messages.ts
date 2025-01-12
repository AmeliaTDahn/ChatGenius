import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Message } from '@db/schema';
import { useUser } from '@/hooks/use-user';
import { useWebSocket } from '@/hooks/use-websocket';

export function useMessages(channelId: number, parentId?: number) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { sendMessage: sendWsMessage } = useWebSocket(user);
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
    refetchOnWindowFocus: true,
  });

  const sendMessage = async (content: string, files?: File[]) => {
    if (!user) throw new Error('Not authenticated');

    if (files && files.length > 0) {
      const formData = new FormData();
      formData.append('content', content);
      files.forEach(file => formData.append('files', file));
      formData.append('channelId', channelId.toString());
      if (parentId) formData.append('parentId', parentId.toString());

      const res = await fetch('/api/messages', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const newMessage = await res.json();
      queryClient.setQueryData<Message[]>(queryKey, (oldMessages = []) => {
        return [...oldMessages, newMessage];
      });
    } else {
      // Send through WebSocket for text-only messages
      sendWsMessage({
        type: 'message',
        channelId,
        content,
        userId: user.id,
        parentId
      });
    }
  };

  const handleWebSocketMessage = (newMessage: Message) => {
    if (newMessage.channelId !== channelId) return;
    if (parentId && newMessage.parentId !== parentId) return;
    if (!parentId && newMessage.parentId) return;

    queryClient.setQueryData<Message[]>(queryKey, (oldMessages = []) => {
      if (!oldMessages.some((m) => m.id === newMessage.id)) {
        return [...oldMessages, newMessage];
      }
      return oldMessages;
    });
  };

  return {
    messages: messages || [],
    isLoading,
    sendMessage,
    handleWebSocketMessage,
  };
}