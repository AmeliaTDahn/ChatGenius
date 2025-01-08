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

  const leaveChannel = useMutation({
    mutationFn: async (channelId: number) => {
      const res = await fetch(`/api/channels/${channelId}/leave`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      return res.json();
    },
    onSuccess: (data) => {
      // Update channels cache with the new list
      queryClient.setQueryData<Channel[]>(['/api/channels'], data.channels);
    },
  });

  return {
    channels: channels || [],
    isLoading,
    createChannel: createChannel.mutateAsync,
    leaveChannel: leaveChannel.mutateAsync,
  };
}