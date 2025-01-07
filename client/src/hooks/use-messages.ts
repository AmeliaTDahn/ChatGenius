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
    refetchOnWindowFocus: true,
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
    onMutate: async (content) => {
      // Cancel outgoing fetches
      await queryClient.cancelQueries({ queryKey });

      // Get current messages
      const previousMessages = queryClient.getQueryData<Message[]>(queryKey) || [];

      // Create optimistic message
      const optimisticMessage: Message = {
        id: Date.now(), // Temporary ID
        content,
        channelId,
        userId: user?.id || 0,
        createdAt: new Date().toISOString(),
        user: {
          id: user?.id || 0,
          username: user?.username || '',
          avatarUrl: user?.avatarUrl,
        },
        reactions: []
      };

      // Add optimistic message to messages
      queryClient.setQueryData<Message[]>(queryKey, (old = []) => {
        return [optimisticMessage, ...old];
      });

      return { previousMessages };
    },
    onError: (err, variables, context) => {
      // Revert to previous messages on error
      if (context?.previousMessages) {
        queryClient.setQueryData(queryKey, context.previousMessages);
      }
    },
    onSettled: () => {
      // Refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    messages: messages || [],
    isLoading,
    sendMessage: sendMessage.mutateAsync,
  };
}