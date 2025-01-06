import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Channel } from '@db/schema';

export function useChannels() {
  const queryClient = useQueryClient();

  const { data: channels, isLoading } = useQuery<Channel[]>({
    queryKey: ['/api/channels'],
  });

  const createChannel = useMutation({
    mutationFn: async (channelData: { name: string; description?: string }) => {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channelData),
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/channels'] });
    },
  });

  return {
    channels: channels || [],
    isLoading,
    createChannel: createChannel.mutateAsync,
  };
}
