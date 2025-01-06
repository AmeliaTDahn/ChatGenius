import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '@db/schema';

type WSMessage = {
  type: 'message' | 'typing' | 'presence';
  channelId?: number;
  content?: string;
  userId?: number;
  isOnline?: boolean;
};

export function useWebSocket(user: User | null) {
  const ws = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    ws.current = new WebSocket(`ws://${window.location.host}/ws?userId=${user.id}`);

    ws.current.onmessage = (event) => {
      const message: WSMessage = JSON.parse(event.data);

      switch (message.type) {
        case 'message':
          if (message.channelId) {
            queryClient.invalidateQueries({
              queryKey: [`/api/channels/${message.channelId}/messages`],
            });
          }
          break;
        case 'presence':
          // Update user presence in cache
          queryClient.setQueryData(['users', message.userId], (oldData: any) => ({
            ...oldData,
            isOnline: message.isOnline,
          }));
          break;
      }
    };

    const pingInterval = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);

    return () => {
      clearInterval(pingInterval);
      ws.current?.close();
    };
  }, [user, queryClient]);

  const sendMessage = useCallback((message: WSMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  }, []);

  return { sendMessage };
}
