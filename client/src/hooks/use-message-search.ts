import { useQuery } from "@tanstack/react-query";
import type { Message } from "@db/schema";

export function useMessageSearch(query: string, channelId?: number) {
  return useQuery<Message[]>({
    queryKey: ['/api/messages/search', query, channelId],
    queryFn: async () => {
      const params = new URLSearchParams({ q: query });
      if (channelId) {
        params.append('channelId', channelId.toString());
      }

      const res = await fetch(`/api/messages/search?${params}`, {
        credentials: 'include'
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      return res.json();
    },
    enabled: query.length >= 2,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60, // Cache results for 1 minute
  });
}