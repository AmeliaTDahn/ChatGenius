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

  const updateChannelColor = useMutation({
    mutationFn: async ({ channelId, backgroundColor }: { channelId: number; backgroundColor: string }) => {
      const res = await fetch(`/api/channels/${channelId}/color`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backgroundColor }),
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      return res.json();
    },
    onSuccess: (updatedChannel) => {
      // Update the channels cache with the new color
      queryClient.setQueryData<Channel[]>(['/api/channels'], (oldChannels) => {
        if (!oldChannels) return oldChannels;
        return oldChannels.map(channel => 
          channel.id === updatedChannel.id ? { ...channel, backgroundColor: updatedChannel.backgroundColor } : channel
        );
      });
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
      queryClient.setQueryData<Channel[]>(['/api/channels'], data.channels);
    },
  });

  return {
    channels: channels || [],
    isLoading,
    createChannel: createChannel.mutateAsync,
    leaveChannel: leaveChannel.mutateAsync,
    updateChannelColor: updateChannelColor.mutateAsync,
  };
}