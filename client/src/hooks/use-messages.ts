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
      const ws = new WebSocket(window.location.protocol === 'https:' ? 'wss://' : 'ws://' + window.location.host);

      return new Promise<Message>((resolve, reject) => {
        ws.onopen = () => {
          // First authenticate
          ws.send(JSON.stringify({
            type: 'auth',
            userId: user?.id
          }));

          // Then send the message
          ws.send(JSON.stringify({
            type: 'message',
            content,
            channelId
          }));
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'new_message' && data.message.content === content) {
            resolve(data.message);
            ws.close();
          }
        };

        ws.onerror = (error) => {
          reject(error);
          ws.close();
        };
      });
    },
    onMutate: async (content) => {
      await queryClient.cancelQueries({ queryKey });
      const previousMessages = queryClient.getQueryData<Message[]>(queryKey) || [];

      // Create optimistic message
      const optimisticMessage: Message = {
        id: Date.now(),
        content,
        channelId,
        userId: user?.id || 0,
        createdAt: new Date().toISOString(),
        user: {
          id: user?.id || 0,
          username: user?.username || '',
          avatarUrl: user?.avatarUrl,
        },
        reactions: [],
        reads: []
      };

      queryClient.setQueryData<Message[]>(queryKey, (old = []) => [...old, optimisticMessage]);
      return { previousMessages };
    },
    onError: (err, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(queryKey, context?.previousMessages);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const addMessage = (newMessage: Message) => {
    queryClient.setQueryData<Message[]>(queryKey, (oldMessages = []) => {
      if (oldMessages.some(msg => msg.id === newMessage.id)) {
        return oldMessages;
      }
      return [...oldMessages, newMessage];
    });
  };

  return {
    messages: messages || [],
    isLoading,
    sendMessage: sendMessage.mutateAsync,
    addMessage,
  };
}