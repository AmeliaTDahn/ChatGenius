import { useEffect, useRef, useCallback, useState } from 'react';
import type { Message } from '@db/schema';
import { useToast } from '@/hooks/use-toast';

type WSMessage = {
  type: 'message' | 'typing' | 'presence' | 'ping' | 'friend_request' | 'ai_message';
  channelId?: number;
  content?: string;
  userId?: number;
  tabId?: string;
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
  aiResponse?: string;
};

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const { toast } = useToast();
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const tabId = useRef<string | null>(null);

  if (!tabId.current) {
    if (!localStorage.getItem('tabId')) {
      localStorage.setItem('tabId', `${Date.now()}-${Math.random()}`);
    }
    tabId.current = localStorage.getItem('tabId');
  }

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?tabId=${tabId.current}`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onmessage = (event) => {
      const data: WSMessage = JSON.parse(event.data);
      setLastMessage(data);

      switch (data.type) {
        case 'message':
          break;
        case 'presence':
          break;
        case 'friend_request':
          if (data.friendRequest) {
            toast({
              title: 'New Friend Request',
              description: `${data.friendRequest.sender.username} sent you a friend request!`,
              duration: 5000,
            });
          }
          break;
        case 'ai_message':
          break;
      }
    };

    ws.current.onclose = () => {
      setTimeout(() => {
        ws.current = new WebSocket(wsUrl);
      }, 1000);
    };

    const pingInterval = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'ping', tabId: tabId.current }));
      }
    }, 25000);

    return () => {
      clearInterval(pingInterval);
      ws.current?.close();
    };
  }, [toast]);

  const sendMessage = useCallback((message: Partial<WSMessage>) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ ...message, tabId: tabId.current }));
    }
  }, []);

  return { sendMessage, lastMessage };
}