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
      } else {
        // Only fetch root messages (no parentId) for the main chat
        url.searchParams.append('rootOnly', 'true');
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    enabled: !!channelId
  });

  const sendMessage = useMutation({
    mutationFn: async ({ content, files, parentId }: { content: string, files?: File[], parentId?: number }) => {
      const formData = new FormData();
      formData.append('content', content);
      if (files) files.forEach(file => formData.append('files', file));
      if (parentId) formData.append('parentId', parentId.toString());

      const res = await fetch(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Failed to send message');
      return res.json();
    },
    onSuccess: (newMessage) => {
      // Update the appropriate message list based on whether it's a reply or not
      if (newMessage.parentId) {
        queryClient.setQueryData<Message[]>(['messages', channelId, newMessage.parentId], 
          (old = []) => [...old, newMessage]);
      } else {
        queryClient.setQueryData<Message[]>(['messages', channelId], 
          (old = []) => [...old, newMessage]);
      }
    }
  });

  const handleWebSocketMessage = (newMessage: Message) => {
    if (newMessage.userId === user?.id) return;

    // Update the appropriate message list based on whether it's a reply or not
    if (newMessage.parentId) {
      queryClient.setQueryData<Message[]>(['messages', channelId, newMessage.parentId], 
        (old = []) => old ? [...old, newMessage] : [newMessage]);
    } else {
      queryClient.setQueryData<Message[]>(['messages', channelId], 
        (old = []) => old ? [...old, newMessage] : [newMessage]);
    }
  };

  return {
    messages: messages || [],
    isLoading,
    sendMessage: sendMessage.mutateAsync,
    handleWebSocketMessage
  };
}