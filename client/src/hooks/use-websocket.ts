import { useEffect, useRef, useCallback } from 'react';
import type { User, Message } from '@db/schema';
import { useToast } from '@/hooks/use-toast';

type WSMessage = {
  type: 'message' | 'typing' | 'presence' | 'ping' | 'friend_request';
  channelId?: number;
  content?: string;
  userId?: number;
  isOnline?: boolean;
  message?: Message;
  friendRequest?: {
    id: number;
    sender: {
      id: number;
      username: string;
      avatarUrl?: string;
    };
  };
};

export function useWebSocket(user: User | null, onMessage?: (message: Message) => void) {
  const ws = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    // Use secure WebSocket if the page is loaded over HTTPS
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?userId=${user.id}`;
    ws.current = new WebSocket(wsUrl);

    // Attempt to reconnect on connection close
    ws.current.onclose = () => {
      setTimeout(() => {
        if (user) {
          ws.current = new WebSocket(wsUrl);
        }
      }, 1000);
    };

    ws.current.onmessage = (event) => {
      const data: WSMessage = JSON.parse(event.data);

      switch (data.type) {
        case 'message':
          if (data.message && onMessage) {
            onMessage(data.message);
          }
          break;
        case 'presence':
          // Handle presence updates...
          break;
        case 'friend_request':
          if (data.friendRequest) {
            toast({
              title: "New Friend Request",
              description: `${data.friendRequest.sender.username} sent you a friend request!`,
              duration: 5000,
            });
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
  }, [user, onMessage, toast]);

  const sendMessage = useCallback((message: WSMessage & { userId: number }) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  }, []);

  return { sendMessage };
}