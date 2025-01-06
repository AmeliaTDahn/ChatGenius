import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User, Message } from '@db/schema';

type WSMessage = {
  type: 'message' | 'typing' | 'presence' | 'ping';
  channelId?: number;
  content?: string;
  userId?: number;
  isOnline?: boolean;
  message?: Message;
};

export function useWebSocket(user: User | null) {
  const ws = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    // Use secure WebSocket if the page is loaded over HTTPS
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?userId=${user.id}`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onmessage = (event) => {
      const message: WSMessage = JSON.parse(event.data);

      switch (message.type) {
        case 'message':
          if (message.channelId && message.message) {
            queryClient.setQueryData<Message[]>(
              [`/api/channels/${message.channelId}/messages`],
              (oldMessages = []) => [message.message, ...oldMessages]
            );
          }
          break;
        case 'presence':
          if (message.userId) {
            queryClient.setQueryData(['users', message.userId], (oldData: any) => ({
              ...oldData,
              isOnline: message.isOnline,
            }));
          }
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