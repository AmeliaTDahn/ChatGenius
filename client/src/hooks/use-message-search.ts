import { useQuery } from "@tanstack/react-query";
import type { Message } from "@db/schema";

export function useMessageSearch(query: string, channelId?: number) {
  return useQuery<Message[]>({
    queryKey: ['/api/messages/search', query, channelId],
    enabled: query.length >= 2,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60, // Cache results for 1 minute
  });
}
